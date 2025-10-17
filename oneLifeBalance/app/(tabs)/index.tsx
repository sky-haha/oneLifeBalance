import React, { useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, PanResponder, Modal, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Svg, Path, Circle } from "react-native-svg";
import { Calendar } from "react-native-calendars";
import { Ionicons } from "@expo/vector-icons";

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
  // SVG의 각도 체계에 맞게 90도를 빼서 보정 (12시 방향이 -90도)
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
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
    // 조각이 360도 이상이면 미세하게 값을 조정하여 SVG 오류를 방지
    if (endAngle - startAngle >= 360) endAngle = 359.99;
    // 시작 각도와 종료 각도가 같으면 빈 경로를 반환
    if (startAngle === endAngle) return '';

    // 각 지점의 좌표를 계산
    const outerArcStart = polarToCartesian(cx, cy, outerRadius, endAngle);
    const outerArcEnd = polarToCartesian(cx, cy, outerRadius, startAngle);
    const innerArcStart = polarToCartesian(cx, cy, innerRadius, endAngle);
    const innerArcEnd = polarToCartesian(cx, cy, innerRadius, startAngle);

    // 호(arc)의 각도가 180도를 넘는지 여부를 결정
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

    // SVG 경로(d 속성) 문자열을 생성
    const d = [
        'M', outerArcStart.x, outerArcStart.y, // 1. 바깥쪽 호의 시작점으로 이동
        'A', outerRadius, outerRadius, 0, largeArcFlag, 0, outerArcEnd.x, outerArcEnd.y, // 2. 바깥쪽 호 그리기
        'L', innerArcEnd.x, innerArcEnd.y, // 3. 안쪽 호의 시작점으로 직선 연결
        'A', innerRadius, innerRadius, 0, largeArcFlag, 1, innerArcStart.x, innerArcStart.y, // 4. 안쪽 호 그리기 (반대 방향)
        'Z', // 5. 경로 닫기
    ].join(' ');

    return d;
}

// 일정 블록의 데이터 구조를 정의
type Block = {
  id: string; // 고유 식별자
  start: number; // 시작 시간 (분)
  end: number; // 종료 시간 (분)
  color: string; // 블록 색상
  label?: string; // 할 일 이름
};

// SVG 렌더링을 위해 가공된 블록의 데이터 구조
type ProcessedBlock = {
  block: Block;
  innerRadius: number; // 안쪽 반지름
  outerRadius: number; // 바깥쪽 반지름
  ringIndex: number;   // 소속된 링(레이어)의 인덱스
};

//임시데이터
// 고유 ID를 생성하는 함수
const makeId = () => Math.random().toString(36).slice(2, 9);
// 날짜별 초기 일정 데이터를 생성하는 함수
const mockByDate: Record<string, Block[]> = (() => {
  const today = fmt(new Date());
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, +1);
  return {
    [today]: [
      { id: makeId(), start: 0, end: 420, color: "#E5E7EB", label: "수면" },
      { id: makeId(), start: 480, end: 720, color: "#60A5FA", label: "업무" },
      { id: makeId(), start: 780, end: 1020, color: "#34D399", label: "집중" },
      { id: makeId(), start: 540, end: 660, color: "#f472b6", label: "회의" },
      { id: makeId(), start: 600, end: 820, color: "#f472b6", label: "기타" }

    ],
    [yesterday]: [{ id: makeId(), start: 540, end: 1020, color: "#F59E0B", label: "과제" }],
    [tomorrow]: [{ id: makeId(), start: 600, end: 900, color: "#F472B6", label: "회의" }],
  };
})();

const DonutSlice = ({ block, innerRadius, outerRadius }: { block: Block; innerRadius: number; outerRadius: number; }) => {
  const DAY_MINUTES = 1440; // 하루는 총 1440분
  // 시작 및 종료 시간을 0~360도 사이의 각도로 변환
  const startAngle = (block.start / DAY_MINUTES) * 360;
  const endAngle = (block.end / DAY_MINUTES) * 360;

  // SVG 경로 데이터를 생성
  const pathData = createDonutSlicePath(50, 50, innerRadius, outerRadius, startAngle, endAngle);
  // SVG Path 컴포넌트를 렌더링
  return <Path d={pathData} fill={block.color} />;
};


// --- 메인 컴포넌트 ---
export default function NewIndex() {
  const router = useRouter();
  const today = fmt(new Date());
  // 현재 선택된 날짜를 관리하는 상태
  const [selectedDate, setSelectedDate] = useState<string>(today);
  // 달력 모달의 표시 여부를 관리하는 상태
  const [calendarOpen, setCalendarOpen] = useState(false);

  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  const toggleCheck = (id: string) => {
    setCheckedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // 선택된 날짜에 해당하는 일정 목록을 가져옴
  const currentBlocks = useMemo(() => mockByDate[selectedDate] || [], [selectedDate]);

  const processedBlocks = useMemo((): ProcessedBlock[] => {
    // 도넛 차트의 링(레이어) 디자인을 정의
    const rings = [
      { innerRadius: 37, outerRadius: 48 },
      { innerRadius: 24, outerRadius: 35 },
      { innerRadius: 11, outerRadius: 22 },
    ];
    
    const DAY = 1440;
    const filledBlocks: Block[] = [];
    const sortedByTime = [...currentBlocks].sort((a, b) => a.start - b.start);
    let cursor = 0;

    // 등록된 일정 사이의 빈 시간을 회색 블록으로 채워줌
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

    // 겹치는 블록들을 서로 다른 링에 배치하는 로직
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

  // 날짜를 하루 뒤로 변경
  const onSwipeLeft = () => setSelectedDate((d) => addDays(d, +1));
  // 날짜를 하루 앞으로 변경
  const onSwipeRight = () => setSelectedDate((d) => addDays(d, -1));

  // 좌우 스와이프 제스처를 감지하는 PanResponder를 생성
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 16 && Math.abs(g.dy) < 12,
      onPanResponderRelease: (_, g) => {
        if (g.dx <= -30) onSwipeLeft();
        else if (g.dx >= 30) onSwipeRight();
      },
    })
  ).current;

  // `purpose` 화면으로 이동하는 함수
  const openPurpose = () => {
    router.push({ pathname: "/(tabs)/purpose" as any, params: { date: selectedDate } });
  };

  return (
    <View style={styles.container}>
      {/* 상단 헤더 영역 */}
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
      
      {/* SVG 도넛 차트 영역 */}
      <View style={styles.chartWrap} {...panResponder.panHandlers}>
        <TouchableOpacity activeOpacity={0.9} onPress={openPurpose} style={styles.chartTouch}>
          <Svg height={SCREEN_WIDTH * 0.64} width={SCREEN_WIDTH * 0.64} viewBox="0 0 100 100">
              {/* 차트 배경 및 중심 원 */}
              <Circle cx="50" cy="50" r="49" fill="#f9fafb" />
              {/* 계산된 블록들을 순회하며 DonutSlice 컴포넌트로 렌더링 */}
              {processedBlocks.map(({ block, innerRadius, outerRadius }) => (
              <DonutSlice
                  key={block.id}
                  block={block}
                  innerRadius={innerRadius}
                  outerRadius={outerRadius}
              />
              ))}
              {/* 차트 중심의 작은 원 */}
              <Circle cx="50" cy="50" r="10" fill="#f9fafb" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.chartHint}>차트를 탭하면 할일 목록으로 이동합니다</Text>
      </View>

      {/* 하단 할 일 목록 영역 */}
      <ScrollView contentContainerStyle={styles.cardsArea}>
        {currentBlocks.filter(b => b.label !== "빈 시간").length > 0 ? (
          currentBlocks.filter(b => b.label !== "빈 시간").map((block) => {
            const isChecked = !!checkedItems[block.id];
            return (
              <View key={block.id} style={styles.todoItem}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <View style={[styles.colorDot, { backgroundColor: block.color }]} />
                  <Text style={[styles.todoText, isChecked && styles.todoTextChecked]}>{block.label}</Text>
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
          })
        ) : (
          <View style={styles.placeholderCard}>
            <Text style={styles.placeholderText}>오늘의 할 일이 없습니다.</Text>
          </View>
        )}
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
  header: { paddingTop: "15%", paddingHorizontal: 16, paddingBottom: 6, alignItems: "center"},
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