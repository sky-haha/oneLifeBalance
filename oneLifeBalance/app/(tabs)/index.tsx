import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, Modal, PanResponder, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Calendar } from "react-native-calendars";
// [추가] SvgText 임포트 추가
import { Circle, Path, Svg, Text as SvgText } from "react-native-svg";

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

// 도넛 차트 조각의 SVG 경로(path) 데이터를 생성하는 함수 (sweepFlag 수정본)
function createDonutSlicePath(
  cx: number, cy: number,
  innerRadius: number, outerRadius: number,
  startAngle: number, endAngle: number
): string {
  // 각도 차이 계산 (0 < diff <= 360)
  let angleDiff = endAngle - startAngle;
  // 각도를 0~360 범위로 정규화하면서 차이 계산
  angleDiff = ((angleDiff % 360) + 360) % 360;

  // 360도 전체 원일 경우 아주 약간 작게 조정 (SVG arc 렌더링 이슈 방지)
  if (angleDiff === 0 && startAngle !== endAngle) { // start, end가 정확히 같지 않은 0도 차이(즉, 360도)
       angleDiff = 359.99;
   } else if (angleDiff === 0) {
       return ""; // 각도 차이가 없으면 빈 경로 반환
   }

  // 시작점과 끝점 좌표 계산
  const outerStart = polarToCartesian(cx, cy, outerRadius, startAngle);
  const outerEnd = polarToCartesian(cx, cy, outerRadius, startAngle + angleDiff); // angleDiff 사용
  const innerStart = polarToCartesian(cx, cy, innerRadius, startAngle);
  const innerEnd = polarToCartesian(cx, cy, innerRadius, startAngle + angleDiff); // angleDiff 사용

  // largeArcFlag: 각도 차이가 180도를 초과하면 1, 아니면 0
  const largeArcFlag = angleDiff > 180 ? "1" : "0";
  // sweepFlag: 바깥쪽 호는 시계방향(1), 안쪽 호는 반시계방향(0)
  const sweepFlagOuter = "1";
  const sweepFlagInner = "0"; // 안쪽 호는 반시계 방향으로 그려야 경로가 닫힘

  // 경로 데이터 구성: M -> A -> L -> A -> Z
  const d = [
    `M ${outerStart.x} ${outerStart.y}`, // 1. Move to outer start point
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} ${sweepFlagOuter} ${outerEnd.x} ${outerEnd.y}`, // 2. Draw outer arc clockwise
    `L ${innerEnd.x} ${innerEnd.y}`, // 3. Line to inner end point
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} ${sweepFlagInner} ${innerStart.x} ${innerStart.y}`, // 4. Draw inner arc counter-clockwise
    "Z" // 5. Close path
  ].join(" ");

  return d;
}

// 일정 블록의 데이터 구조
type Block = {
  id: string;
  start: number;     // 분 (0~1439)
  end: number;       // 분 (0~1440)
  color: string;
  label?: string;    // purpose 매핑
  isGoal?: boolean;  // 목표 여부
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

// [수정] ID 기반 해시(Hash)를 HSL 색상값으로 변환하는 함수 (Purpose.tsx와 동일하게)
function pickColorForId(id: string) {
  let hash = 0;
  if (id.length === 0) return "hsl(0, 70%, 65%)"; // ID가 없는 경우 기본색

  for (let i = 0; i < id.length; i++) {
    // 31은 소수(prime number)이며, 해시 충돌을 줄이는 데 자주 사용됩니다.
    hash = (hash * 31 + id.charCodeAt(i)) | 0; // | 0은 정수형으로 변환
  }
  
  const hue = Math.abs(hash) % 360; // 0~359 사이의 고유한 색상(hue) 값
  const saturation = 70; // 채도 (70%로 고정)
  const lightness = 65;  // 명도 (65%로 고정)

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}


// (임시데이터)
/*
// 날짜별 초기 목업 데이터 (비로그인 시 표시용)
const mockByDate: Record<string, Block[]> = (() => {
 // ... 목업 데이터 정의 ...
})();
*/

const DonutSlice = ({ block, innerRadius, outerRadius }: { block: Block; innerRadius: number; outerRadius: number; }) => {
  // 12시간 기준 각도 계산
  const HALF_DAY_MINUTES = 720; // 12 * 60
  const startAngle = ((block.start % HALF_DAY_MINUTES) / HALF_DAY_MINUTES) * 360;
  let endMinutesIn12Hour = block.end % HALF_DAY_MINUTES;
  if (endMinutesIn12Hour === 0 && block.end !== 0) {
      endMinutesIn12Hour = HALF_DAY_MINUTES;
  }
  const endAngle = (endMinutesIn12Hour / HALF_DAY_MINUTES) * 360;

  const pathData = createDonutSlicePath(50, 50, innerRadius, outerRadius, startAngle, endAngle);
  return (
    <Path
      d={pathData}
      fill={block.color}
      stroke={block.isGoal ? "#111827" : "none"}   // 목표면 테두리 강조
      strokeWidth={block.isGoal ? 0.8 : 0}
    />
  );
};


// --- 메인 컴포넌트 ---
export default function NewIndex() {
  const router = useRouter();
  const today = fmt(new Date());

  // 상태 관리 ...
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [serverBlocksByDate, setServerBlocksByDate] = useState<Record<string, Block[]>>({});
  // [추가] AM/PM 모드 상태 추가 (기본값 'AM')
  const [ampmMode, setAmpmMode] = useState<'AM' | 'PM'>('AM');

  const toggleCheck = (id: string) => {
    setCheckedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // useEffect (로그인 상태, 데이터 구독) ...
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid) {
        setServerBlocksByDate(prev => ({ ...prev, [selectedDate]: [] }));
        return;
    };
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
            // [수정] 팔레트 방식이 아닌 ID 기반 HSL 함수를 사용하도록 수정
            color: pickColorForId(ds.id),
          };
        });
        setServerBlocksByDate(prev => ({ ...prev, [selectedDate]: next }));
      },
      (err) => console.warn("[onSnapshot timeTable]", err)
    );
    return () => unsub();
  }, [uid, selectedDate]);


  // [수정] currentBlocks 계산 시 AM/PM 필터링 추가
  const currentBlocks = useMemo(() => {
    // 원본 데이터 가져오기 (로그인 시 서버, 아니면 빈 배열)
    const baseBlocks = uid ? serverBlocksByDate[selectedDate] || [] : [];
    const HALF_DAY = 720;
    // ampmMode에 따라 필터링
    if (ampmMode === 'AM') {
      return baseBlocks.filter(b => b.start < HALF_DAY);
    } else { // 'PM'
      return baseBlocks.filter(b => b.start >= HALF_DAY);
    }
  }, [uid, serverBlocksByDate, selectedDate, ampmMode]); // [추가] ampmMode 의존성 추가

  // 도넛 차트에 빈 시간 채우기 + 링 배치 (원본 로직 사용)
  const processedBlocks = useMemo((): ProcessedBlock[] => {
    // [추가] uid가 없거나 필터링된 블록이 없으면 빈 배열 반환
    if (!uid || !currentBlocks || currentBlocks.length === 0) return [];

    const rings = [
      { innerRadius: 37, outerRadius: 48 },
      { innerRadius: 24, outerRadius: 35 },
      { innerRadius: 11, outerRadius: 22 },
    ];

    // [수정] 12시간 기준으로 빈 시간 채우기 (0~719 또는 720~1439 범위)
    const HALF_DAY = 720;
    const isAM = ampmMode === 'AM';
    const rangeStart = isAM ? 0 : HALF_DAY;
    const rangeEnd = isAM ? HALF_DAY : 1440;

    const filledBlocks: Block[] = [];
    const sortedByTime = [...currentBlocks].sort((a, b) => a.start - b.start);
    let cursor = rangeStart; // 시작점을 오전/오후 시작 시간으로 설정

    for (const b of sortedByTime) {
      // 블록 시간도 해당 범위 내로 클램핑 (이론상 필요 없지만 안전장치)
      const s = Math.max(rangeStart, Math.min(rangeEnd, b.start));
      const e = Math.max(rangeStart, Math.min(rangeEnd, b.end));

      if (e <= s) continue;
      if (s > cursor) {
        filledBlocks.push({ id: makeId(), start: cursor, end: s, color: "#EEEEEE", label: "빈 시간" });
      }
      filledBlocks.push(b);
      cursor = Math.max(cursor, e);
    }
    // 해당 시간대 끝까지 빈 시간 채우기
    if (cursor < rangeEnd) {
      filledBlocks.push({ id: makeId(), start: cursor, end: rangeEnd, color: "#EEEEEE", label: "빈 시간" });
    }

    // --- 링 배치 로직 (기존과 동일) ---
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
  }, [currentBlocks, uid, ampmMode]); // [추가] ampmMode 의존성 추가


  // 날짜 전환, 스와이프, 목적 화면 이동 함수 ...
  const onSwipeLeft = () => setSelectedDate((d) => addDays(d, +1));
  const onSwipeRight = () => setSelectedDate((d) => addDays(d, -1));
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 16 && Math.abs(g.dy) < 12,
      onPanResponderRelease: (_, g) => {
        if (g.dx <= -30) onSwipeLeft();
        else if (g.dx >= 30) onSwipeRight();
      },
    })
  ).current;
  const openPurpose = () => {
     if (!uid) {
        router.push('/(tabs)/login');
        return;
     }
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
        {/* [추가] AM/PM 토글 버튼 */}
        <View style={styles.ampmToggleContainer}>
            <TouchableOpacity
                style={[styles.ampmButton, ampmMode === 'AM' && styles.ampmButtonActive]}
                onPress={() => setAmpmMode('AM')}
            >
                <Text style={[styles.ampmButtonText, ampmMode === 'AM' && styles.ampmButtonTextActive]}>AM</Text>
            </TouchableOpacity>
            <TouchableOpacity
                style={[styles.ampmButton, ampmMode === 'PM' && styles.ampmButtonActive]}
                onPress={() => setAmpmMode('PM')}
            >
                <Text style={[styles.ampmButtonText, ampmMode === 'PM' && styles.ampmButtonTextActive]}>PM</Text>
            </TouchableOpacity>
        </View>
      </View>

      {/* SVG 도넛 차트 또는 로그인 안내 */}
      <View style={styles.chartWrap} {...panResponder.panHandlers}>
        <TouchableOpacity activeOpacity={uid ? 0.9 : 1} onPress={openPurpose} style={styles.chartTouch}>
          <Svg height={SCREEN_WIDTH * 0.64} width={SCREEN_WIDTH * 0.64} viewBox="0 0 100 100">
            {/* 배경 원 */}
            <Circle cx="50" cy="50" r="49" fill="#f9fafb" />

            {/* 도넛 조각들 (로그인 시) */}
            {uid && processedBlocks.map(({ block, innerRadius, outerRadius }) => (
              <DonutSlice key={block.id} block={block} innerRadius={innerRadius} outerRadius={outerRadius} />
            ))}

            {/* 중앙 원 (로그인 시 투명) */}
            <Circle cx="50" cy="50" r="10" fill={uid ? "transparent" : "#f9fafb"} />

            {/* 중앙 텍스트 */}
            {!uid ? (
              // [추가] 로그아웃 시
              <SvgText x="50" y="50" textAnchor="middle" alignmentBaseline="central" fontSize="6" fill="#6B7280" fontWeight="600">
                로그인이 필요합니다.
              </SvgText>
            ) : (
  null
            )}
          </Svg>
        </TouchableOpacity>
        {/* 안내 문구 */}
        <Text style={styles.chartHint}>차트를 탭하면 할일 목록으로 이동합니다</Text>
      </View>

      {/* 하단 할 일 목록 */}
      <ScrollView contentContainerStyle={styles.cardsArea}>
        {(() => {
          // [수정] 필터링된 currentBlocks 사용
          const visibleList = (currentBlocks || []).filter(
            (b) => b.label !== "빈 시간" && b.isGoal
          );

           // 로그아웃 상태 메시지
           if (!uid) {
             return (
               <View style={styles.placeholderCard}>
                 <Text style={styles.placeholderText}>로그인 후 목표를 확인하세요.</Text>
               </View>
             );
           }

          if (visibleList.length === 0) {
            return (
              <View style={styles.placeholderCard}>
                {/* [추가] AM/PM 모드에 따른 메시지 분기 */}
                <Text style={styles.placeholderText}>
                    {ampmMode === 'AM' ? '오전' : '오후'} 목표 할 일이 없습니다.
                </Text>
              </View>
            );
          }

          // 목표 할 일 목록 렌더링 ... (이전과 동일)
          return visibleList.map((block) => {
            const isChecked = !!checkedItems[block.id];
            return (
              <View key={block.id} style={styles.todoItem}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <View style={[styles.colorDot, { backgroundColor: block.color }]} />
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

      {/* 달력 모달 ... (이전과 동일) */}
      <Modal visible={calendarOpen} transparent animationType="fade" onRequestClose={() => setCalendarOpen(false)}>
         <View style={styles.modalBackdrop}>
           <TouchableOpacity style={styles.modalBackdropTap} activeOpacity={1} onPress={() => setCalendarOpen(false)} />
           <View style={styles.modalBody}>
             <Calendar /* ... Calendar props ... */ />
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
  // [추가] AM/PM 토글 컨테이너 스타일
  ampmToggleContainer: {
    flexDirection: 'row',
    marginTop: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 999,
    padding: 4,
  },
  // [추가] AM/PM 버튼 스타일
  ampmButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 999,
  },
  // [추가] 활성화된 AM/PM 버튼 스타일
  ampmButtonActive: {
    backgroundColor: 'white', // 활성 배경색
    shadowColor: "#000", // iOS 그림자
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2, // Android 그림자
  },
  // [추가] AM/PM 버튼 텍스트 스타일
  ampmButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280', // 비활성 텍스트 색
  },
  // [추가] 활성화된 AM/PM 버튼 텍스트 스타일
  ampmButtonTextActive: {
    color: '#111827', // 활성 텍스트 색
  },
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