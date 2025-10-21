import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, Modal, PanResponder, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Calendar } from "react-native-calendars";
import { Circle, Path, Svg } from "react-native-svg";

// 🔐 Firebase (경로는 프로젝트에 맞게 변경)
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { auth, db } from "./firebaseConfig";

// 기기의 화면 너비를 가져옴
const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Date 객체를 'YYYY-MM-DD' 형식의 문자열로 변환
const fmt = (d: Date) => d.toISOString().split("T")[0];
// 주어진 ISO 형식의 날짜 문자열에 특정 일(delta)을 더하거나 뺌
const addDays = (iso: string, delta: number) => {
  const d = new Date(iso);
  d.setDate(d.getDate() + delta);
  return fmt(d);
};
// ISO 형식의 날짜 문자열을 'YYYY.MM.DD (요일)' 형식으로 변환
const toKoreanLabel = (iso: string) => {
  const d = new Date(iso);
  const dow = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate()
  ).padStart(2, "0")} (${dow})`;
};

// 극좌표(반지름, 각도)를 직교좌표(x, y)로 변환
function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number): { x: number; y: number } {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0; // 12시 기준 보정
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

// 도넛 차트 조각의 SVG 경로(path) 데이터를 생성
function createDonutSlicePath(
  cx: number, cy: number,
  innerRadius: number, outerRadius: number,
  startAngle: number, endAngle: number
): string {
  if (endAngle - startAngle >= 360) endAngle = 359.99;
  if (startAngle === endAngle) return "";

  const outerArcStart = polarToCartesian(cx, cy, outerRadius, endAngle);
  const outerArcEnd = polarToCartesian(cx, cy, outerRadius, startAngle);
  const innerArcStart = polarToCartesian(cx, cy, innerRadius, endAngle);
  const innerArcEnd = polarToCartesian(cx, cy, innerRadius, startAngle);

  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  const d = [
    "M", outerArcStart.x, outerArcStart.y,
    "A", outerRadius, outerRadius, 0, largeArcFlag, 0, outerArcEnd.x, outerArcEnd.y,
    "L", innerArcEnd.x, innerArcEnd.y,
    "A", innerRadius, innerRadius, 0, largeArcFlag, 1, innerArcStart.x, innerArcStart.y,
    "Z",
  ].join(" ");

  return d;
}

// 일정 블록의 데이터 구조
type Block = {
  id: string;
  start: number;     // 분
  end: number;       // 분
  color: string;
  label?: string;    // purpose 매핑
  isGoal?: boolean;  // 목표 여부
};

// SVG 렌더링을 위해 가공된 블록
type ProcessedBlock = {
  block: Block;
  innerRadius: number;
  outerRadius: number;
  ringIndex: number;
};

// 고유 ID 생성
const makeId = () => Math.random().toString(36).slice(2, 9);

// 색상 선택(서버에 color가 없으므로 id기반 안정적 색 배정)
function pickColorForId(id: string) {
  const palette = ["#60A5FA", "#34D399", "#F59E0B", "#F472B6", "#A78BFA", "#F87171", "#9CA3AF"];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

// 날짜별 초기 목업 데이터 (비로그인 시 표시용)
const mockByDate: Record<string, Block[]> = (() => {
  const today = fmt(new Date());
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, +1);
  return {
    [today]: [
      { id: makeId(), start: 0, end: 420, color: "#E5E7EB", label: "수면" },
      { id: makeId(), start: 480, end: 720, color: "#60A5FA", label: "업무", isGoal: true },
      { id: makeId(), start: 780, end: 1020, color: "#34D399", label: "집중" },
      { id: makeId(), start: 540, end: 660, color: "#f472b6", label: "회의" },
      { id: makeId(), start: 600, end: 820, color: "#f472b6", label: "기타" }
    ],
    [yesterday]: [{ id: makeId(), start: 540, end: 1020, color: "#F59E0B", label: "과제", isGoal: true }],
    [tomorrow]: [{ id: makeId(), start: 600, end: 900, color: "#F472B6", label: "회의" }],
  };
})();

const DonutSlice = ({ block, innerRadius, outerRadius }: { block: Block; innerRadius: number; outerRadius: number; }) => {
  const DAY_MINUTES = 1440;
  const startAngle = (block.start / DAY_MINUTES) * 360;
  const endAngle = (block.end / DAY_MINUTES) * 360;

  const pathData = createDonutSlicePath(50, 50, innerRadius, outerRadius, startAngle, endAngle);
  return (
    <Path
      d={pathData}
      fill={block.color}
      stroke={block.isGoal ? "#111827" : "none"}   // 목표면 테두리 강조
      strokeWidth={block.isGoal ? 0.8 : 0}
    />
  );
};

// --- 메인 컴포넌트 ---
export default function NewIndex() {
  const router = useRouter();
  const today = fmt(new Date());

  // 현재 선택된 날짜
  const [selectedDate, setSelectedDate] = useState<string>(today);
  // 달력 모달
  const [calendarOpen, setCalendarOpen] = useState(false);
  // 체크박스 상태
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  // 로그인 uid & 서버 데이터 상태
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [serverBlocksByDate, setServerBlocksByDate] = useState<Record<string, Block[]>>({});

  const toggleCheck = (id: string) => {
    setCheckedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // 로그인 상태 구독
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
    return () => unsub();
  }, []);

  // 선택 날짜의 timeTable 실시간 구독
  useEffect(() => {
    if (!uid) return;
    const colRef = collection(db, "User", uid, "dateTable", selectedDate, "timeTable");
    const q = query(colRef, orderBy("startTime", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: Block[] = snap.docs.map((ds) => {
          const d = ds.data() as any;
          return {
            id: ds.id,
            start: typeof d.startTime === "number" ? d.startTime : 0,
            end: typeof d.endTime === "number" ? d.endTime : 0,
            label: d.purpose || "",
            isGoal: !!d.isGoal,
            color: pickColorForId(ds.id),
          };
        });
        setServerBlocksByDate(prev => ({ ...prev, [selectedDate]: next }));
      },
      (err) => console.warn("[onSnapshot timeTable]", err)
    );
    return () => unsub();
  }, [uid, selectedDate]);

  // (로그인 시) 서버 데이터, (비로그인 시) 목업 데이터 사용
  const currentBlocks = useMemo(
    () => (uid ? serverBlocksByDate[selectedDate] || [] : mockByDate[selectedDate] || []),
    [uid, serverBlocksByDate, selectedDate]
  );

  // 도넛 차트에 빈 시간 채우기 + 링 배치
  const processedBlocks = useMemo((): ProcessedBlock[] => {
    const rings = [
      { innerRadius: 37, outerRadius: 48 },
      { innerRadius: 24, outerRadius: 35 },
      { innerRadius: 11, outerRadius: 22 },
    ];

    const DAY = 1440;
    const filledBlocks: Block[] = [];
    const sortedByTime = [...currentBlocks].sort((a, b) => a.start - b.start);
    let cursor = 0;

    for (const b of sortedByTime) {
      const s = Math.max(0, Math.min(DAY, b.start));
      const e = Math.max(0, Math.min(DAY, b.end));
      if (e <= s) continue;
      if (s > cursor) {
        filledBlocks.push({ id: makeId(), start: cursor, end: s, color: "#EEEEEE", label: "빈 시간" });
      }
      filledBlocks.push(b);
      cursor = e;
    }
    if (cursor < DAY) {
      filledBlocks.push({ id: makeId(), start: cursor, end: DAY, color: "#EEEEEE", label: "빈 시간" });
    }

    const layouts: ProcessedBlock[] = [];
    const processed = new Set<string>();

    for (const block of filledBlocks) {
      if (processed.has(block.id)) continue;

      const group: Block[] = [];
      const findOverlapsRecursive = (b: Block) => {
        group.push(b);
        processed.add(b.id);
        for (const other of filledBlocks) {
          if (processed.has(other.id)) continue;
          if (b.end > other.start && b.start < other.end) {
            findOverlapsRecursive(other);
          }
        }
      };
      findOverlapsRecursive(block);

      const groupSorted = group.sort((a, b) => a.start - b.start);
      const ringEnds = rings.map(() => -1);

      for (const b of groupSorted) {
        let placed = false;
        for (let i = 0; i < rings.length; i++) {
          if (b.start >= ringEnds[i]) {
            layouts.push({ block: b, ...rings[i], ringIndex: i });
            ringEnds[i] = b.end;
            placed = true;
            break;
          }
        }
        if (!placed) {
          const innermostRingIndex = rings.length - 1;
          layouts.push({ block: b, ...rings[innermostRingIndex], ringIndex: innermostRingIndex });
        }
      }
    }
    return layouts;
  }, [currentBlocks]);

  // 날짜 전환
  const onSwipeLeft = () => setSelectedDate((d) => addDays(d, +1));
  const onSwipeRight = () => setSelectedDate((d) => addDays(d, -1));

  // 좌우 스와이프 감지
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 16 && Math.abs(g.dy) < 12,
      onPanResponderRelease: (_, g) => {
        if (g.dx <= -30) onSwipeLeft();
        else if (g.dx >= 30) onSwipeRight();
      },
    })
  ).current;

  // purpose 화면으로 이동
  const openPurpose = () => {
    router.push({ pathname: "/(tabs)/purpose" as any, params: { date: selectedDate } });
  };

  return (
    <View style={styles.container}>
      {/* 상단 헤더 */}
      <View style={styles.header} {...panResponder.panHandlers}>
        <TouchableOpacity onPress={() => setCalendarOpen(true)} activeOpacity={0.8}>
          <Text style={styles.dateText}>{toKoreanLabel(selectedDate)}</Text>
        </TouchableOpacity>
        <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.headerBtn} onPress={onSwipeRight}>
            <Text style={styles.headerBtnText}>← 어제</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn} onPress={() => setSelectedDate(today)}>
            <Text style={styles.headerBtnText}>오늘</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn} onPress={onSwipeLeft}>
            <Text style={styles.headerBtnText}>내일 →</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* SVG 도넛 차트 */}
      <View style={styles.chartWrap} {...panResponder.panHandlers}>
        <TouchableOpacity activeOpacity={0.9} onPress={openPurpose} style={styles.chartTouch}>
          <Svg height={SCREEN_WIDTH * 0.64} width={SCREEN_WIDTH * 0.64} viewBox="0 0 100 100">
            <Circle cx="50" cy="50" r="49" fill="#f9fafb" />
            {processedBlocks.map(({ block, innerRadius, outerRadius }) => (
              <DonutSlice key={block.id} block={block} innerRadius={innerRadius} outerRadius={outerRadius} />
            ))}
            <Circle cx="50" cy="50" r="10" fill="#f9fafb" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.chartHint}>차트를 탭하면 할일 목록으로 이동합니다</Text>
      </View>

      {/* 하단 할 일 목록 */}
      <ScrollView contentContainerStyle={styles.cardsArea}>
        {(() => {
          // [MOD] 목록에 표시할 항목: '빈 시간' 제외 + isGoal=true 만
          const visibleList = currentBlocks.filter(
            (b) => b.label !== "빈 시간" && b.isGoal
          );

          if (visibleList.length === 0) {
            return (
              <View style={styles.placeholderCard}>
                <Text style={styles.placeholderText}>오늘의 목표 할 일이 없습니다.</Text>
              </View>
            );
          }

          return visibleList.map((block) => {
            const isChecked = !!checkedItems[block.id];
            return (
              <View key={block.id} style={styles.todoItem}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <View style={[styles.colorDot, { backgroundColor: block.color }]} />
                  {/* [MOD] 목표 표시용 별 아이콘(유지) */}
                  <Ionicons name="star" size={14} color="#F59E0B" style={{ marginRight: 6 }} />
                  <Text style={[styles.todoText, isChecked && styles.todoTextChecked]}>
                    {block.label}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => toggleCheck(block.id)} style={styles.checkbox}>
                  {isChecked ? (
                    <Ionicons name="checkmark-circle" size={24} color="#3B82F6" />
                  ) : (
                    <Ionicons name="ellipse-outline" size={24} color="#9CA3AF" />
                  )}
                </TouchableOpacity>
              </View>
            );
          });
        })()}
      </ScrollView>

      {/* 달력 모달 */}
      <Modal visible={calendarOpen} transparent animationType="fade" onRequestClose={() => setCalendarOpen(false)}>
        <View style={styles.modalBackdrop}>
          <TouchableOpacity style={styles.modalBackdropTap} activeOpacity={1} onPress={() => setCalendarOpen(false)} />
          <View style={styles.modalBody}>
            <Calendar
              initialDate={selectedDate}
              current={selectedDate}
              markedDates={{ [selectedDate]: { selected: true, selectedColor: "black" } }}
              onDayPress={(day) => {
                setSelectedDate(day.dateString);
                setCalendarOpen(false);
              }}
              theme={{
                todayTextColor: "#111827",
                arrowColor: "#111827",
                monthTextColor: "#111827",
              }}
              style={{ alignSelf: "stretch" }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

// 스타일
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "white" },
  header: { paddingTop: "15%", paddingHorizontal: 16, paddingBottom: 6, alignItems: "center" },
  dateText: { fontSize: 18, fontWeight: "700", color: "#111827", alignItems: "center" },
  headerButtons: { flexDirection: "row", gap: 8, marginTop: 8 },
  headerBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
  },
  headerBtnText: { fontSize: 13, fontWeight: "600", color: "#111827" },
  chartWrap: {
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6'
  },
  chartTouch: { paddingVertical: 8, paddingHorizontal: 8, borderRadius: 12 },
  chartHint: { marginTop: 8, fontSize: 12, color: "#6B7280" },
  cardsArea: { flexGrow: 1, paddingHorizontal: 16, paddingVertical: 12 },
  placeholderCard: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderStyle: "dashed",
    borderRadius: 12,
    paddingVertical: 28,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  placeholderText: { color: "#9CA3AF", fontSize: 14 },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  modalBackdropTap: { flex: 1 },
  modalBody: {
    backgroundColor: "white",
    padding: 12,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  todoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  todoText: {
    fontSize: 16,
    color: '#111827',
  },
  todoTextChecked: {
    textDecorationLine: 'line-through',
    color: '#9CA3AF',
  },
  checkbox: {
    marginLeft: 16,
  },
});
