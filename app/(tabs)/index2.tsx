import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, Modal, PanResponder, ScrollView, StyleSheet, Text, TouchableOpacity, View, LogBox } from "react-native";
import { Calendar } from "react-native-calendars";
//  SvgText 및 G 임포트 추가 (G는 중앙 클릭 영역을 묶기 위함)
import { Circle, G, Path, Svg, Text as SvgText } from "react-native-svg";

// 🔐 Firebase (경로는 프로젝트에 맞게 변경)
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { auth, db } from "./firebaseConfig";

LogBox.ignoreLogs(['Text strings must be rendered within a <Text> component']);
LogBox.ignoreAllLogs(true);
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

const toHHMM = (m: number) => {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

// 극좌표(반지름, 각도)를 직교좌표(x, y)로 변환
function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number): { x: number; y: number } {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0; // 12시 기준 보정
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

// - 12는 0도(맨 위), 3은 90도(오른쪽), 6은 180도(아래), 9는 270도(왼쪽)
const hourToAngle = (h: number) => ((h % 12) / 12) * 360;

// viewBox(0~100) 기준, 원 중심(50,50). 라벨은 바깥 배경 원(r=49) 바로 안쪽 r≈46.5에 배치.
const HourLabels = ({ radius = 46.5 }: { radius?: number }) => {
  const hours = Array.from({ length: 12 }, (_, i) => (i + 1)); // 1..12
  return (
    <>
      {hours.map((h) => {
        const angle = hourToAngle(h);
        const { x, y } = polarToCartesian(50, 50, radius, angle);
        return (
          <SvgText
            key={`hr-${h}`}
            x={x}
            y={y}
            fontSize="4"             // 보기 좋은 크기 (viewBox 기준)
            fontWeight={h % 3 === 0 ? "700" : "600"} // 3,6,9,12 살짝 굵게
            fill="#111827"
            textAnchor="middle"
            alignmentBaseline="middle" // 숫자 중심 정렬
          >
            {h === 12 ? "12" : String(h)}
          </SvgText>
        );
      })}
    </>
  );
};

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
  const outerStart = polarToCartesian(50, 50, outerRadius, startAngle);
  const outerEnd   = polarToCartesian(50, 50, outerRadius, startAngle + angleDiff); // angleDiff 사용
  const innerStart = polarToCartesian(50, 50, innerRadius, startAngle);
  const innerEnd   = polarToCartesian(50, 50, innerRadius, startAngle + angleDiff); // angleDiff 사용

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
  start: number;     // 분 (0~1439)
  end: number;       // 분 (0~1440)
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

const makeId = () => Math.random().toString(36).slice(2, 9);

function pickColorForId(id: string): string {
  let hash = 0;
  if (id.length === 0) {
    return "#CCCCCC"; 
  }

  for (let i = 0; i < id.length; i++) {
    const char = id.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; 
  }

  const hue = Math.abs(hash % 360);

  const saturation = 70;
  const lightness = 60;

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

//  DonutSlice 컴포넌트: onPress prop 받도록 수정
const DonutSlice = ({ block, innerRadius, outerRadius, onPress }: { 
  block: Block; 
  innerRadius: number; 
  outerRadius: number; 
  onPress?: () => void;
}) => {
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
      stroke={block.isGoal ? "#111827" : "none"}   // 목표면 테두리 강조
      strokeWidth={block.isGoal ? 0.8 : 0}
      onPress={onPress} 
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
  //  클릭된 블록(레전드) 정보를 담을 state
  const [legendBlock, setLegendBlock] = useState<Block | null>(null);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [serverBlocksByDate, setServerBlocksByDate] = useState<Record<string, Block[]>>({});
  //  AM/PM 모드 상태 추가 (기본값 'AM')
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
            color: pickColorForId(ds.id),
          };
        });
        setServerBlocksByDate(prev => ({ ...prev, [selectedDate]: next }));
      },
      (err) => console.warn("[onSnapshot timeTable]", err)
    );
    return () => unsub();
  }, [uid, selectedDate]);


  //  currentBlocks 계산 시 AM/PM 필터링 추가
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
  }, [uid, serverBlocksByDate, selectedDate, ampmMode]); //  ampmMode 의존성 추가

  // 도넛 차트에 빈 시간 채우기 + 링 배치 (원본 로직 사용)
  const processedBlocks = useMemo((): ProcessedBlock[] => {
    //  uid가 없거나 필터링된 블록이 없으면 빈 배열 반환
    if (!uid || !currentBlocks || currentBlocks.length === 0) return [];

    const rings = [
      { innerRadius: 33, outerRadius: 44 },
      { innerRadius: 21, outerRadius: 32 },
      { innerRadius: 9, outerRadius: 20 },
    ];

    //  12시간 기준으로 빈 시간 채우기 (0~719 또는 720~1439 범위)
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
  }, [currentBlocks, uid, ampmMode]); //  ampmMode 의존성 추가


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
        {/*  AM/PM 토글 버튼 */}
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
        {/*  Svg를 감싸던 TouchableOpacity를 View로 변경 */}
        <View style={styles.chartTouch}>
          <Svg height={SCREEN_WIDTH * 0.64} width={SCREEN_WIDTH * 0.64} viewBox="0 0 100 100">
            {/* 배경 원 */}
            <Circle cx="50" cy="50" r="49" fill="#f9fafb" />

            {/*  시계 숫자(1~12) 라벨 */}
            <HourLabels /* radius를 미세 조정하고 싶다면 props로 넘기면 됨 */ />

            {/* 도넛 조각들 (로그인 시) */}
            {uid && processedBlocks.map(({ block, innerRadius, outerRadius }) => (
              <DonutSlice 
                key={block.id} 
                block={block} 
                innerRadius={innerRadius} 
                outerRadius={outerRadius} 
                //  "빈 시간"이 아닐 경우에만 레전드 표시
                onPress={() => {
                  if (block.label !== "빈 시간") {
                    setLegendBlock(block);
                  }
                }}
              />
            ))}

            {/*  중앙 영역(원 + 텍스트)을 <G>로 묶고 여기에 onPress 할당 */}
            <G onPress={openPurpose}>
              {/* 중앙 원 (로그인 시 투명) */}
              <Circle cx="50" cy="50" r="10" fill={uid ? "transparent" : "#f9fafb"} />

              {/* 중앙 텍스트 */}
              {!uid ? (
                //  로그아웃 시
                <SvgText x="50" y="50" textAnchor="middle" alignmentBaseline="central" fontSize="6" fill="#6B7280" fontWeight="600">
                  로그인이 필요합니다.
                </SvgText>
              ) : (
                //  로그인 시 AM/PM 표시
                <SvgText x="50" y="50" textAnchor="middle" alignmentBaseline="central" fontSize="10" fill="#374151" fontWeight="bold">
                  {ampmMode}
                </SvgText>
              )}
            </G>
          </Svg>
        </View>
        {/* 안내 문구 */}
        <Text style={styles.chartHint}>
          {/*  안내 문구 변경 */}
          차트 중앙을 탭하면 할일 목록으로, 각 항목을 탭하면 상세 정보가 표시됩니다.
        </Text>
      </View>

      {/* 하단 할 일 목록 */}
      <ScrollView contentContainerStyle={styles.cardsArea}>
        {(() => {
          //  필터링된 currentBlocks 사용
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
                {/*  AM/PM 모드에 따른 메시지 분기 */}
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

      {/*  할 일 상세 정보(레전드) 모달 */}
      <Modal
        visible={legendBlock !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setLegendBlock(null)}
      >
        <View style={styles.legendModalBackdrop}>
          <TouchableOpacity 
            style={styles.modalBackdropTap} 
            activeOpacity={1} 
            onPress={() => setLegendBlock(null)} 
          />
          {legendBlock && ( // legendBlock이 null이 아닐 때만 렌더링
            <View style={styles.legendModalCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                <View style={[styles.colorDot, { backgroundColor: legendBlock.color, marginRight: 10 }]} />
                {legendBlock.isGoal && <Ionicons name="star" size={18} color="#F59E0B" style={{ marginRight: 8 }} />}
                <Text style={styles.legendTitle}>{legendBlock.label}</Text>
              </View>
              <Text style={styles.legendTime}>
                {toHHMM(legendBlock.start)} ~ {toHHMM(legendBlock.end)}
              </Text>
              <TouchableOpacity style={styles.legendCloseButton} onPress={() => setLegendBlock(null)}>
                <Text style={styles.legendCloseButtonText}>닫기</Text>
              </TouchableOpacity>
            </View>
          )}
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
  //  AM/PM 토글 컨테이너 스타일
  ampmToggleContainer: {
    flexDirection: 'row',
    marginTop: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 999,
    padding: 4,
  },
  //  AM/PM 버튼 스타일
  ampmButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 999,
  },
  //  활성화된 AM/PM 버튼 스타일
  ampmButtonActive: {
    backgroundColor: 'white', // 활성 배경색
    shadowColor: "#000", // iOS 그림자
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2, // Android 그림자
  },
  //  AM/PM 버튼 텍스트 스타일
  ampmButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280', // 비활성 텍스트 색
  },
  //  활성화된 AM/PM 버튼 텍스트 스타일
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

  //  레전드 모달 관련 스타일
  legendModalBackdrop: {
    flex: 1,
    justifyContent: "center", // 중앙 정렬
    alignItems: "center",     // 중앙 정렬
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  legendModalCard: {
    width: '80%',
    backgroundColor: "white",
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  legendTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  legendTime: {
    fontSize: 16,
    color: '#374151',
    marginBottom: 24,
  },
  legendCloseButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 999,
  },
  legendCloseButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  
  // (기존 todoItem 스타일)
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