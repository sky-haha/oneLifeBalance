import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, Modal, PanResponder, ScrollView, StyleSheet, Text, TouchableOpacity, View, LogBox } from "react-native";
import { Calendar } from "react-native-calendars";
import { Circle, G, Path, Rect, Svg, Text as SvgText } from "react-native-svg";

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

// 시계 숫자(1~12) 각도 계산 헬퍼
const hourToAngle = (h: number) => ((h % 12) / 12) * 360;

// 시계 숫자 라벨 렌더러
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
            fontSize="4"
            fontWeight={h % 3 === 0 ? "700" : "600"}
            fill="#111827"
            textAnchor="middle"
            alignmentBaseline="middle"
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
  let angleDiff = endAngle - startAngle;
  angleDiff = ((angleDiff % 360) + 360) % 360;

  if (angleDiff === 0 && startAngle !== endAngle) {
       angleDiff = 359.99;
   } else if (angleDiff === 0) {
       return "";
   }

  const outerStart = polarToCartesian(50, 50, outerRadius, startAngle);
  const outerEnd   = polarToCartesian(50, 50, outerRadius, startAngle + angleDiff);
  const innerStart = polarToCartesian(50, 50, innerRadius, startAngle);
  const innerEnd   = polarToCartesian(50, 50, innerRadius, startAngle + angleDiff);

  const largeArcFlag = angleDiff > 180 ? "1" : "0";
  const sweepFlagOuter = "1";
  const sweepFlagInner = "0";

  const d = [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} ${sweepFlagOuter} ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} ${sweepFlagInner} ${innerStart.x} ${innerStart.y}`,
    "Z"
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

// 클릭된 정보 타입
type ActiveLegend = {
    block: Block;
    x: number; // SVG 내부 좌표 X
    y: number; // SVG 내부 좌표 Y
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

// 클릭시 이름 전달 관련 함수
const DonutSlice = ({ block, innerRadius, outerRadius, onPress }: { 
  block: Block; 
  innerRadius: number; 
  outerRadius: number; 
  onPress?: (event: any) => void;
}) => {
  const HALF_DAY_MINUTES = 720;
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
      stroke={block.isGoal ? "#111827" : "none"}
      strokeWidth={block.isGoal ? 0.8 : 0}
      onPress={onPress} 
    />
  );
};


// --- 메인 컴포넌트 ---
export default function NewIndex() {
  const router = useRouter();
  const today = fmt(new Date());

  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [activeLegend, setActiveLegend] = useState<ActiveLegend | null>(null);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [serverBlocksByDate, setServerBlocksByDate] = useState<Record<string, Block[]>>({});
  const [ampmMode, setAmpmMode] = useState<'AM' | 'PM'>('AM');

  const toggleCheck = (id: string) => {
    setCheckedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

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

  // 12:00(정오)를 가로지르는 일정을 AM/PM에 맞게 분리
  const currentBlocks = useMemo(() => {
    // 원본 데이터 가져오기 (로그인 시 서버, 아니면 빈 배열)
    const baseBlocks = uid ? serverBlocksByDate[selectedDate] || [] : [];
    const HALF_DAY = 720; // 12:00 (720분)
    const isAM = ampmMode === 'AM';

    // 변환된 블록(잘린 블록 포함)을 담을 새 배열
    const transformedBlocks: Block[] = [];

    for (const block of baseBlocks) {
      const { start, end } = block;

      // 블록이 12:00(720분)를 가로지르는 경우 (예: 09:00 ~ 13:00)
      if (start < HALF_DAY && end > HALF_DAY) {
        if (isAM) {
          // AM 파트: start ~ 12:00
          transformedBlocks.push({
            ...block,
            id: block.id + '_am_part', // React key를 위한 고유 ID
            start: start,
            end: HALF_DAY, // AM 탭에서는 12:00에 끝나는 것으로 자름
          });
        } else {
          // PM 파트: 12:00 ~ end
          transformedBlocks.push({
            ...block,
            id: block.id + '_pm_part', // React key를 위한 고유 ID
            start: HALF_DAY, // PM 탭에서는 12:00에 시작하는 것으로 자름
            end: end,
          });
        }
      }
      // 2. 블록이 완전히 AM(12:00 이전)에 끝나는 경우
      else if (end <= HALF_DAY) {
        if (isAM) {
          transformedBlocks.push(block); // AM 탭에만 표시
        }
      }
      // 3. 블록이 완전히 PM(12:00 이후)에 시작하는 경우
      else if (start >= HALF_DAY) {
        if (!isAM) {
          transformedBlocks.push(block); // PM 탭에만 표시
        }
      }
    }
    
    // 이렇게 변환된 블록 리스트를 반환
    return transformedBlocks;

  }, [uid, serverBlocksByDate, selectedDate, ampmMode]); // ampmMode 의존성 유지


  const processedBlocks = useMemo((): ProcessedBlock[] => {
    if (!uid || !currentBlocks || currentBlocks.length === 0) return [];

    const rings = [
      { innerRadius: 33, outerRadius: 44 },
      { innerRadius: 21, outerRadius: 32 },
      { innerRadius: 9, outerRadius: 20 },
    ];

    const HALF_DAY = 720;
    const isAM = ampmMode === 'AM';
    const rangeStart = isAM ? 0 : HALF_DAY;
    const rangeEnd = isAM ? HALF_DAY : 1440;

    const filledBlocks: Block[] = [];
    const sortedByTime = [...currentBlocks].sort((a, b) => a.start - b.start);
    let cursor = rangeStart;

    for (const b of sortedByTime) {
      const s = Math.max(rangeStart, Math.min(rangeEnd, b.start));
      const e = Math.max(rangeStart, Math.min(rangeEnd, b.end));

      if (e <= s) continue;
      if (s > cursor) {
        filledBlocks.push({ id: makeId(), start: cursor, end: s, color: "#EEEEEE", label: "빈 시간" });
      }
      filledBlocks.push(b);
      cursor = Math.max(cursor, e);
    }
    if (cursor < rangeEnd) {
      filledBlocks.push({ id: makeId(), start: cursor, end: rangeEnd, color: "#EEEEEE", label: "빈 시간" });
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
  }, [currentBlocks, uid, ampmMode]);


  const onSwipeLeft = () => { setActiveLegend(null); setSelectedDate((d) => addDays(d, +1)); };
  const onSwipeRight = () => { setActiveLegend(null); setSelectedDate((d) => addDays(d, -1)); };
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
  
  // 클릭된 위치 근처에 표시하기 위한 핸들러
  const handleDonutSlicePress = (block: Block, event: any) => {
      if (block.label === "빈 시간") {
          setActiveLegend(null);
          return;
      }
      
      // event.nativeEvent.locationX, event.nativeEvent.locationY는 뷰포트 내의 클릭 좌표
      // SVG viewBox(0-100) 기준으로 변환해야 함
      const svgScale = 100 / (SCREEN_WIDTH * 0.64);
      const clickedX = event.nativeEvent.locationX * svgScale;
      const clickedY = event.nativeEvent.locationY * svgScale;

      setActiveLegend({ block, x: clickedX, y: clickedY });
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
        <View style={styles.ampmToggleContainer}>
            <TouchableOpacity
                style={[styles.ampmButton, ampmMode === 'AM' && styles.ampmButtonActive]}
                onPress={() => { setActiveLegend(null); setAmpmMode('AM'); }} 
            >
                <Text style={[styles.ampmButtonText, ampmMode === 'AM' && styles.ampmButtonTextActive]}>AM</Text>
            </TouchableOpacity>
            <TouchableOpacity
                style={[styles.ampmButton, ampmMode === 'PM' && styles.ampmButtonActive]}
                onPress={() => { setActiveLegend(null); setAmpmMode('PM'); }} 
            >
                <Text style={[styles.ampmButtonText, ampmMode === 'PM' && styles.ampmButtonTextActive]}>PM</Text>
            </TouchableOpacity>
        </View>
      </View>

      {/* SVG 도넛 차트 또는 로그인 안내 */}
      <View style={styles.chartWrap} {...panResponder.panHandlers}>
        <TouchableOpacity style={styles.chartTouch} activeOpacity={1} onPress={() => setActiveLegend(null)}> 
          <Svg height={SCREEN_WIDTH * 0.64} width={SCREEN_WIDTH * 0.64} viewBox="0 0 100 100">
            {/* 배경 원 */}
            <Circle cx="50" cy="50" r="49" fill="#f9fafb" />

            {/* 시계 숫자(1~12) 라벨 */}
            <HourLabels />

            {/* 도넛 조각들 (로그인 시) */}
            {uid && processedBlocks.map(({ block, innerRadius, outerRadius }) => (
              <DonutSlice 
                key={block.id} 
                block={block} 
                innerRadius={innerRadius} 
                outerRadius={outerRadius} 
                onPress={(event) => handleDonutSlicePress(block, event)}
              />
            ))}

            {/* 중앙 영역(원 + 텍스트)을 <G>로 묶고 여기에 onPress 할당 */}
            <G onPress={() => { setActiveLegend(null); openPurpose(); }}>
              {/* 중앙 원 (로그인 시 투명) */}
              <Circle cx="50" cy="50" r="10" fill={uid ? "transparent" : "#f9fafb"} />

              {/* 중앙 텍스트 */}
              {!uid ? (
                <SvgText x="50" y="50" textAnchor="middle" alignmentBaseline="central" fontSize="6" fill="#6B7280" fontWeight="600">
                  로그인이 필요합니다.
                </SvgText>
              ) : (
                <SvgText x="50" y="50" textAnchor="middle" alignmentBaseline="central" fontSize="10" fill="#374151" fontWeight="bold">
                  {ampmMode}
                </SvgText>
              )}
            </G>

            {/* 할일 이름 클릭시 렌더링*/}
            {activeLegend && activeLegend.block && (() => {
                // --- 텍스트와 원을 포함하는 동적 너비 계산 ---
                const label = activeLegend.block.label;
                const fontSize = 6;
                const circleRadius = 3; 
                const circleDiameter = circleRadius * 2;
                const spacing = 2; 

                // 좌우 여백 분리
                const paddingLeft = 5; // (왼쪽 여백 조절)
                const paddingRight = 8; // (오른쪽 여백 조절)
                
                // 상하 여백 조절
                const verticalPadding = 3;   
              
                const estimatedTextWidth = (label?.length || 0) * (fontSize * 0.65); 
                
                // 원, 간격, 텍스트 너비의 합
                const contentWidth = circleDiameter + spacing + estimatedTextWidth;
                
                const boxWidth = paddingLeft + contentWidth + paddingRight;

                const boxHeight = fontSize + verticalPadding * 2;
                const boxX = activeLegend.x - boxWidth / 2;
                const boxY = activeLegend.y - boxHeight / 2;
                
                const elementCenterY = activeLegend.y;
              
                const circleX = boxX + paddingLeft + circleRadius;
                
                const textX = circleX + circleRadius + spacing;
                // --- 계산 끝 ---

                return (
                    // G(그룹)로 묶어서 렌더링 (클릭 이벤트 전파 방지)
                    <G onPressIn={() => { /* 버블링 방지 */ }}> 
                        <Rect
                            x={boxX}
                            y={boxY}
                            width={boxWidth}
                            height={boxHeight}
                            fill="rgba(255,255,255,0.95)"
                            rx="4"
                            ry="4"
                            stroke="#6B7280"
                            strokeWidth="0.3"
                        />
                        <Circle
                            cx={circleX}
                            cy={elementCenterY}
                            r={circleRadius}
                            fill={activeLegend.block.color}
                        />
                        <SvgText
                            x={textX}
                            y={elementCenterY}
                            textAnchor="start"
                            alignmentBaseline="middle"
                            fontSize={fontSize}
                            fontWeight="600"
                            fill="#111827"
                        >
                            {label}
                        </SvgText>
                    </G>
                )
            })()}

          </Svg>
        </TouchableOpacity>
        {/* 안내 문구 */}
        <Text style={styles.chartHint}>
          차트 중앙을 탭하면 할일 목록으로, 각 항목을 탭하면 상세 정보가 표시됩니다.
        </Text>
      </View>

      {/* 하단 할 일 목록 */}
      <ScrollView contentContainerStyle={styles.cardsArea}>
        {(() => {
          const visibleList = (currentBlocks || []).filter(
            (b) => b.label !== "빈 시간" && b.isGoal
          );

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
                <Text style={styles.placeholderText}>
                    {ampmMode === 'AM' ? '오전' : '오후'} 목표 할 일이 없습니다.
                </Text>
              </View>
            );
          }

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

      {/* 달력 모달 */}
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
  ampmToggleContainer: {
    flexDirection: 'row',
    marginTop: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 999,
    padding: 4,
  },
  ampmButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 999,
  },
  ampmButtonActive: {
    backgroundColor: 'white',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  ampmButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  ampmButtonTextActive: {
    color: '#111827',
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