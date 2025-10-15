import React, { useMemo, useRef, useState } from "react";
import { View,Text, StyleSheet, Dimensions, TouchableOpacity, PanResponder, Modal, ScrollView, SafeAreaView} from "react-native";
import { useRouter } from "expo-router";
import { Svg, Path, Circle } from "react-native-svg";
import { Calendar } from "react-native-calendars";

//기기 가로폭을 가져와 SCREEN_WIDTH로 저장
const { width: SCREEN_WIDTH } = Dimensions.get("window");

// 일정을 나타내는 기본 데이터 구조
type Block = { 
  id: string; // 고유 식별자
  start: number; // 시작 시간
  end: number; // 종료 시간
  color: string; // 일정 색상
  purpose?: string; // 일정 이름
};

// SVG 렌더링을 위해 가공된 일정 데이터 구조
type ProcessedBlock = {
  block: Block; // 원본 일정 데이터
  innerRadius: number; // 도넛 조각의 안쪽 반지름
  outerRadius: number; // 도넛 조각의 바깥쪽 반지름
  ringIndex: number; // 몇 번째 링(레이어)에 그려질지 나타내는 인덱스
};



// 각도를 SVG 좌표(x, y)로 변환해주는 함수
function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number): { x: number; y: number } {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0; // SVG는 12시 방향이 -90도이므로 보정
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

// 도넛 조각 모양 SVG 경로 데이터를 생성하는 함수
function createDonutSlicePath(
    cx: number, cy: number, 
    innerRadius: number, outerRadius: number, 
    startAngle: number, endAngle: number
): string {
    // 미세값 조정
    if (endAngle - startAngle >= 360) endAngle = 359.99;
    if (startAngle === endAngle) return ''; // 시작과 끝이 같으면 아무것도 그리지 않음

    // 호(의 시작점과 끝점 좌표 계산
    const outerArcStart = polarToCartesian(cx, cy, outerRadius, endAngle);
    const outerArcEnd = polarToCartesian(cx, cy, outerRadius, startAngle);
    const innerArcStart = polarToCartesian(cx, cy, innerRadius, endAngle);
    const innerArcEnd = polarToCartesian(cx, cy, innerRadius, startAngle);

    // 180도가 넘어가는 호를 그릴지 여부 결정
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

    // SVG 경로 문자열 생성
    const d = [
        'M', outerArcStart.x, outerArcStart.y, // 1. 바깥쪽 호의 시작점으로 펜 이동
        'A', outerRadius, outerRadius, 0, largeArcFlag, 0, outerArcEnd.x, outerArcEnd.y, // 2. 바깥쪽 호 그리기
        'L', innerArcEnd.x, innerArcEnd.y, // 3. 안쪽 호의 시작점으로 직선 연결
        'A', innerRadius, innerRadius, 0, largeArcFlag, 1, innerArcStart.x, innerArcStart.y, // 4. 안쪽 호를 반대 방향으로 그리기
        'Z', // 5. 경로를 닫아 도형 완성
    ].join(' ');

    return d;
}


// 데이터 하나를 받아 도넛 조각 하나를 그리는 컴포넌트
const DonutSlice = ({ block, innerRadius, outerRadius }: { block: Block; innerRadius: number; outerRadius: number; }) => {
  const DAY_MINUTES = 1440; // 하루는 총 1440분
  // 시간을 0~360도 사이의 각도로 변환
  const startAngle = (block.start / DAY_MINUTES) * 360;
  const endAngle = (block.end / DAY_MINUTES) * 360;

  // 위에서 만든 헬퍼 함수를 이용해 최종 경로 데이터 생성
  const pathData = createDonutSlicePath(
    50, 50, // SVG 뷰박스 중심
    innerRadius, outerRadius,
    startAngle, endAngle
  );

  // 계산된 경로와 색상으로 Path 컴포넌트를 렌더링
  return <Path d={pathData} fill={block.color} />;
};



//Date는 YYYY-MM-DD 문자열로 변환
const fmt = (d: Date) => d.toISOString().split("T")[0]; 
//ISO 문자열에 delta일을 더하거나 빼서 다시 iso로 반환
const addDays = (iso: string, delta: number) => {
  const d = new Date(iso);
  d.setDate(d.getDate() + delta);
  return fmt(d);
};
// YYYY-MM-DD, (요일) 형태로 상단에 표시할 라벨 생성
const toKoreanLabel = (iso: string) => {
  const d = new Date(iso);
  const dow = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate()
  ).padStart(2, "0")} (${dow})`;
};
// 분 단위를 HH:MM 형식으로 변환
const toHHMM = (m: number) => {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

// 임시 표시용 데이터들, 나중에 파이어베이스 연동할자리
const makeId = () => Math.random().toString(36).slice(2, 9);
const mockByDate: Record<string, Block[]> = (() => {
  const today = fmt(new Date());
  const yesterday = addDays(today, -1);
  const twoDaysAgo = addDays(today, -2);
  const tomorrow = addDays(today, +1);
  const twoDaysLater = addDays(today, +2);
  return {
    [twoDaysAgo]: [
        { id: makeId(), start: 1200, end: 1320, color: "#A78BFA", purpose: "스터디" },
    ],
    [yesterday]: [
        { id: makeId(), start: 540, end: 1020, color: "#F59E0B", purpose: "과제" },
        { id: makeId(), start: 960, end: 1080, color: "#34D399", purpose: "복습" }, 
        { id: makeId(), start: 1000, end: 1100, color: "#F87171", purpose: "자료조사"}
    ],
    [today]: [
      { id: makeId(), start: 480, end: 1080, color: "#60a5fa", purpose: "업무" },
      { id: makeId(), start: 600, end: 720, color: "#f472b6", purpose: "회의" },
      { id: makeId(), start: 1140, end: 1260, color: "#34d399", purpose: "운동" },
      { id: makeId(), start: 660, end: 840, color: "#a78bfa", purpose: "디자인 작업" },
      { id: makeId(), start: 780, end: 900, color: "#f59e0b", purpose: "코드 리뷰" },
    ],
    [tomorrow]: [
        { id: makeId(), start: 600, end: 900, color: "#F472B6", purpose: "회의" },
        { id: makeId(), start: 840, end: 960, color: "#F87171", purpose: "팀 미팅" },
        { id: makeId(), start: 1080, end: 1200, color: "#34D399", purpose: "프로젝트" },
    ],
    [twoDaysLater]: [
        { id: makeId(), start: 0, end: 1440, color: "#60A5FA", purpose: "휴식" },
    ]
  };
})();


// --- 메인 화면 컴포넌트 ---
export default function PlaygroundScreen() {
  const router = useRouter();
  const today = fmt(new Date()); 
  const [selectedDate, setSelectedDate] = useState<string>(today); // 현재 선택된 날짜 (YYYY-MM-DD)
  const [calendarOpen, setCalendarOpen] = useState(false); // 캘린더 모달 표시 여부
  
  // 선택된 날짜에 해당하는 일정 목록만 추출
  const currentBlocks = useMemo(() => mockByDate[selectedDate] || [], [selectedDate]);

  // SVG 다층 레이어 자동 계산 로직
  const processedBlocks = useMemo((): ProcessedBlock[] => {
    // 레이어들의 디자인을 미리 정의 (바깥쪽부터 안쪽 순서)
    const rings = [
      { innerRadius: 37, outerRadius: 48 }, // 1번 링
      { innerRadius: 24, outerRadius: 35 }, // 2번 링
      { innerRadius: 11, outerRadius: 22 }, // 3번 링
    ];
    
    // 모든 일정을 시작 시간 순서로 정렬
    const sortedByTime = [...currentBlocks].sort((a, b) => a.start - b.start);
    const layouts: ProcessedBlock[] = []; // 최종 결과물을 담을 배열
    const processed = new Set<string>(); // 이미 처리된 일정인지 확인하기 위한 Set

    // 정렬된 일정을 하나씩 순회
    for (const block of sortedByTime) {
      if (processed.has(block.id)) continue; // 이미 처리된 일정이면 건너뛰기

      // 현재 일정과 직/간접적으로 겹치는 모든 일정을 하나의 그룹으로 묶음
      const group: Block[] = [];
      const findOverlapsRecursive = (b: Block) => {
        group.push(b);
        processed.add(b.id);
        for (const other of sortedByTime) {
          if (processed.has(other.id)) continue;
          if (b.end > other.start && b.start < other.end) {
            findOverlapsRecursive(other);
          }
        }
      };
      findOverlapsRecursive(block);
      
      // 그룹 내의 일정을 다시 시작 시간 순으로 정렬
      const groupSorted = group.sort((a, b) => a.start - b.start);
      
      // 각 링이 몇 시에 끝나는지 기록하는 메모장 (-1은 비어있다는 의미)
      const ringEnds = rings.map(() => -1); 

      // 그룹 내 일정을 순회하며 가장 바깥쪽 링부터 빈 자리를 찾아 배치
      for (const b of groupSorted) {
        let placed = false;
        for (let i = 0; i < rings.length; i++) {
          if (b.start >= ringEnds[i]) { // 현재 링이 비어있거나, 이전 일정이 끝난 이후에 시작하는 경우
            layouts.push({ block: b, ...rings[i], ringIndex: i }); // 해당 링에 배치
            ringEnds[i] = b.end; // 업데이트
            placed = true;
            break; // 배치했으므로 다음 일정으로 넘어감
          }
        }
        // 모든 링이 꽉 찼다면, 어쩔 수 없이 가장 안쪽 링에 겹쳐서라도 배치
        if (!placed) {
          const innermostRingIndex = rings.length - 1;
          layouts.push({ block: b, ...rings[innermostRingIndex], ringIndex: innermostRingIndex });
        }
      }
    }
    return layouts; // 최종적으로 계산된 레이아웃 정보 배열을 반환
  }, [currentBlocks]);


  // 스와이프로 날짜 변경하는 함수들
  const onSwipeLeft = () => setSelectedDate((d) => addDays(d, +1));
  const onSwipeRight = () => setSelectedDate((d) => addDays(d, -1));

  // 좌우 스와이프 제스처를 감지하는 PanResponder
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 16 && Math.abs(g.dy) < 12,
      onPanResponderRelease: (_, g) => { 
        if (g.dx <= -30) onSwipeLeft();
        else if (g.dx >= 30) onSwipeRight();
      },
    })
  ).current;

  // Purpose 화면으로 이동하는 함수
  const openPurpose = () => {
    router.push({ pathname: "/purpose" as any, params: { date: selectedDate } });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
    <View style={styles.container}>
          {/* 최상단 날짜 표시 바 (누르면 캘린더 모달, 좌우 스와이프로 날짜변경) */}
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

          {/* 중앙 SVG 다층 레이어 도넛 차트 */}
          <View style={styles.chartWrap} {...panResponder.panHandlers}>
            <TouchableOpacity activeOpacity={0.9} onPress={openPurpose} style={styles.chartTouch}>
                <Svg height={SCREEN_WIDTH * 0.64} width={SCREEN_WIDTH * 0.64} viewBox="0 0 100 100">
                    {/* 차트 배경 및 중심 원 */}
                    <Circle cx="50" cy="50" r="49" stroke="#f3f4f6" strokeWidth={1.5} fill="none" />
                    <Circle cx="50" cy="50" r="10" fill="#f9fafb" />
                    
                    {/* 계산된 일정들을 순회하며 DonutSlice 컴포넌트로 하나씩 그리기 */}
                    {processedBlocks.map(({ block, innerRadius, outerRadius }) => (
                    <DonutSlice
                        key={block.id}
                        block={block}
                        innerRadius={innerRadius}
                        outerRadius={outerRadius}
                    />
                    ))}
                </Svg>
            </TouchableOpacity>
            <View style={styles.hintContainer}>
                <Text style={styles.chartHint}>차트를 탭하면 할일 목록으로 이동합니다</Text>
            </View>
          </View>

          {/* 하단 미정 영역 */}
          <ScrollView contentContainerStyle={styles.cardsArea}>
            <View style={styles.placeholderCard}>
                <Text style={styles.placeholderText}>미정 영역</Text>
            </View>
          </ScrollView>

          {/* 캘린더 모달 */}
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
                  theme={{ todayTextColor: "#111827", arrowColor: "#111827", monthTextColor: "#111827" }}
                  style={{ alignSelf: "stretch" }}
                />
              </View>
            </View>
          </Modal>
    </View>
    </SafeAreaView>
  );
}

// --- 스타일 시트 ---
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: 'white' },
  container: { flex: 1, backgroundColor: "white" },
  header: { paddingTop: "5%", paddingHorizontal: 16, paddingBottom: 6, alignItems: "center"},
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
  hintContainer: {
    minHeight: 40,
    marginTop: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartHint: {
    fontSize: 12,
    color: "#6B7280",
    textAlign: 'center',
    lineHeight: 18,
  },
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
});
