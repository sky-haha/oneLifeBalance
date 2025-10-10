import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Dimensions, ScrollView,
TouchableOpacity, Modal, KeyboardAvoidingView, Platform,
TextInput, Animated, PanResponder} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

//색상팔레트들(이렇게하는방법이있다더라고요)
const C = {
  bg: "#0B1220",
  card: "#0F172A",
  border: "#1F2937",
  text: "#E5E7EB",
  textDim: "#9CA3AF",
  primary: "#3B82F6",
};

// 시간 변환 유틸리티 함수들

//Date 객체를 YYYY-MM-DD 형식 문자열로 변환
const fmt = (d: Date) => d.toISOString().split("T")[0];
//YYYY-MM-DD에 일수를 더하거나 빼서 새 문자열 반환
const addDays = (iso: string, delta: number) => {
  const d = new Date(iso);
  d.setDate(d.getDate() + delta);
  return fmt(d);
};
//분 단위 숫자는 HH:MM형식 문자열로 반환
const toHHMM = (m: number) => {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};
//dATE객체를 00:00기준 총 경과 분으로 변환
const fromDateToMinutes = (d: Date) => d.getHours() * 60 + d.getMinutes();
//분 단위 숫자도 dATE객체로 변환(오늘날짜 기준 00:00부터 minute만큼 더함)
const toDateFromMinutes = (minutes: number) => {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  base.setMinutes(minutes);
  return base;
};
// 일정 블록 랜덤으로 색상 넣음
const randomColor = () => {
  const colors = ["#60A5FA", "#34D399", "#F59E0B", "#F472B6", "#A78BFA", "#F87171"];
  return colors[(Math.random() * colors.length) | 0];
};

// 구조
type Block = { id: string; //식별자
  start: number; //시작시간
  end: number;  //종료시간
  color: string; //블록색상
  purpose?: string }; //일정이름

// 표시용 일정목록, 나중에 파이어베이스 연동할부분
const makeId = () => Math.random().toString(36).slice(2, 9);
const buildInitial = () => {
  const today = fmt(new Date());
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, +1);
  return {
    [today]: [
      { id: makeId(), start: 0, end: 420, color: "#E5E7EB", purpose: "수면" },
      { id: makeId(), start: 480, end: 720, color: "#60A5FA", purpose: "업무" },
      { id: makeId(), start: 780, end: 1020, color: "#34D399", purpose: "집중" },
    ] as Block[],
    [yesterday]: [{ id: makeId(), start: 540, end: 1020, color: "#F59E0B", purpose: "과제" }],
    [tomorrow]: [{ id: makeId(), start: 600, end: 900, color: "#F472B6", purpose: "회의" }],
  } as Record<string, Block[]>;
};

// 사각형 블록들 레이아웃 (추후변경예정)
const HOUR_HEIGHT = 44; //테스트용 길게
const HOURS = Array.from({ length: 25 }, (_, i) => i); //시간별 레이블 눈금
const LABEL_GUTTER = 56; // 시간 레이블 및 블록시작점 여백
const SNAP_MIN = 30; //블록 옮길때 시간단위 30분으로

// 드래그, 클릭 관련(추후변경예정)
const FLICK_PROJECT_PX = 160;   // 드래그 중 휙휙 넘길때도 인식하기 위한 이동거리, 이 값 이상으로 이동하면 휙 넘기는걸로 간주
const DRAG_THRESHOLD_PX = 4;    // 드래그 시작으로 인정할 최소이동거리
const DRAG_DELAY_MS = 80;       // 손가락 올린뒤 조금 홀드해야 드래그로전환(탭 무시되는 문제)
const MIN_PROJECT_VY = 0.35;    // 이 속도 이상이면 블록들이 움직이도롱

// purpose 메인화면
export default function PurposeScreen() {
  //Index에서 전달받은 날짜 파라미터, 전달값없으면 일단 기본값은 오늘로
  const router = useRouter();
  const { date } = useLocalSearchParams<{ date?: string }>();
  const selectedDate = (typeof date === "string" && date) || fmt(new Date());

  //YYYY-MM-DD:Block[] 이런형식, 현재는 하드코딩 데이터 사용중
  const [byDate, setByDate] = useState<Record<string, Block[]>>(buildInitial());
  //현재 선택 날짜에 해당하는 일정배열만 추출, useMemo로 캐싱해 selectedDate나 byDate가 바뀔때만 재계산
  const blocks = useMemo(() => byDate[selectedDate] || [], [byDate, selectedDate]);

  //뒤로가기버튼, ios기준 뒤로가기 작동 안하는 경우가 있어서 강제복귀처리 하나
  const goBack = () => {
    if ((router as any).canGoBack?.()) router.back();
    else router.replace("/(tabs)");
  };

  //할일 클릭시 뜨는 편집모달
  //현재 수정중인 블록의 id, 없으면 null
  const [editingId, setEditingId] = useState<string | null>(null);
  //실제 수정중인 Block 객체를 찾아서 반환, editingID가 있을때만 블록 배열에서 해당ID를가진 일정 탐색
  const editing = editingId ? blocks.find((b) => b.id === editingId) || null : null;

  //수정용 임시 상태들
  //사용자가 편집중일때 입력창이나 피커에 표시될 값들: 할일 이름, 시작/종료시간, 시간피커(지금은 임시값)
  const [editPurpose, setEditPurpose] = useState<string>("");
  const [startTime, setStartTime] = useState<Date>(toDateFromMinutes(480));
  const [endTime, setEndTime] = useState<Date>(toDateFromMinutes(540));
  const [showPicker, setShowPicker] = useState<null | "start" | "end">(null);

  //편집모달 열기 관련
  const openEdit = (b: Block) => {
    //선택 블록 데이터를 불러옴
    setEditingId(b.id); 
    setEditPurpose(b.purpose ?? "");
    setStartTime(toDateFromMinutes(b.start));
    setEndTime(toDateFromMinutes(b.end));
  };
  //편집모달 닫기
  const closeEdit = () => {
    setEditingId(null);
    setShowPicker(null);
  };
  //편집모달 저장
  const saveEdit = () => {
    if (!editing) return; //수정할거 없으면 그냥 종료
    const s = fromDateToMinutes(startTime); //시각(Date)를 분단위 숫자로 변환
    const e = fromDateToMinutes(endTime);
    if (e <= s) return; //종료시각이 시작시각보다 앞서면 무시

    //bydate 상태 업뎃, selecteddate에 해당되는 블록 배열중 edting.id와일치하는거만 갱신, (이부분은 테스트용 로컬상태 업데이트)
    setByDate((prev) => ({
      ...prev,
      [selectedDate]: (prev[selectedDate] || []).map((b) =>
        b.id === editing.id ? { ...b, start: s, end: e, purpose: editPurpose } : b //수정된 내용 반영
      ),
    }));
    closeEdit(); //닫기
  };

  // 드래그,드롭 유틸들

  const [scrollLock, setScrollLock] = useState(false); // 드래그 중 스크롤 잠금
  const dragY = useState(new Animated.Value(0))[0]; //드래그중인 블록 Y좌표 오프셋
  const [draggingId, setDraggingId] = useState<string | null>(null); //드래그중인 블록의 ID
  const [dragStartTop, setDragStartTop] = useState(0); // 드래그 시작지점의 top 위치
  const [dragDurationMin, setDragDurationMin] = useState(0); // 드래그중인 블록의 길이(시간)

  const minutesFromTopPx = (topPx: number) => Math.round((topPx / HOUR_HEIGHT) * 60); //화면상 위치를분단위로 변환
  const snapMinutes = (min: number) => Math.round(min / SNAP_MIN) * SNAP_MIN; // 분 단위를 SNAP_MIN(지금은 30분단위) 등으로 스냅 맞추기
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v)); // 특정값을 범위내로 강제, 화면 벗어나거나 음수로 가는거 방지
  const hasOverlap = (start: number, end: number, selfId: string) => //다른 일정과 겹치는거 방지
    blocks.some((b) => b.id !== selfId && !(end <= b.start || start >= b.end));

  const contentHeight = HOUR_HEIGHT * 24;

  // 추가버튼 관련 모달
  //true면 모달 열림, false면 모달 닫힘
  const [addOpen, setAddOpen] = useState(false);

  //새 일정 제목
  const [addPurpose, setAddPurpose] = useState("");
  // 새일정 색상(랜덤)
  const [addColor, setAddColor] = useState(randomColor());
  //시작/종료시간(기본값 0900/1000)
  const [addStart, setAddStart] = useState<Date>(toDateFromMinutes(540)); 
  const [addEnd, setAddEnd] = useState<Date>(toDateFromMinutes(600));    
  //시간피커
  const [addPicker, setAddPicker] = useState<null | "start" | "end">(null);

  //새일정 추가 누르면 모달 열림
  const openAdd = () => {
    setAddPurpose("");
    setAddColor(randomColor());
    setAddStart(toDateFromMinutes(540));
    setAddEnd(toDateFromMinutes(600));
    setAddPicker(null);
    setAddOpen(true);
  };
  //닫힘
  const closeAdd = () => {
    setAddOpen(false);
    setAddPicker(null);
  };
  // 이 코드는 로컬저장도 안되는 UI테스트용

  return (
    <View style={styles.container}>
      {/* 상단 헤더 */}
      <SafeAreaView edges={["top"]} style={styles.safeTop}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={goBack} //뒤로가기 핸들러
            style={styles.headerBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} //터치판정영역
          >
            {/*현재 선택된 날짜 표시*/}
            <Text style={styles.headerBtnText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{selectedDate}</Text>
          <View style={styles.headerBtn} />
        </View>
      </SafeAreaView>

      {/* 타임블록 스크롤 구간*/}
      <ScrollView
        style={{ flex: 1 }} //남은공간 모두 차지
        contentContainerStyle={{ height: contentHeight }} //내부 전체 높이
        scrollEnabled={!scrollLock} //드래그중엔 스크롤 잠금
        contentInsetAdjustmentBehavior="never"
        decelerationRate="fast"
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.timelineRow}>

          {/* 왼쪽 시간표시 레일구간 */}
          <View style={[styles.leftRail, { height: contentHeight }]}>
            {HOURS.map((h) => (
              <View key={h} style={[styles.hourRow, { height: HOUR_HEIGHT }]}>
                {/*0시~23시까지 표시*/}
                {h < 24 && <Text style={styles.hourLabel}>{formatHour(h)}</Text>}
                <View style={styles.hourLine} /> {/*구분선*/}
              </View>
            ))}
          </View>

          {/* 오른쪽, 블럭들 놓이는 곳, 시간단위 배경선 부분(이부분은 아직 저도 잘 모르겠습니다) */}
          {/*top, height: 일정위치 계산, px단위 변환*/}
          {/*PanResponder.create: 터치인식기 등록, 터치와 드래그 구분*/}
          {/*onPanResponderGrant: 드래그 시작, 위치 시간 기록*/}
          {/*onPanResponderMonve: 드래그중, 실시간 이동*/}
          {/*onPanResponderRelase: 드래그종료, 새위치 계산및 겹칩 확인*/}
          {/*hasOverlap(): 겹침방지*/}
          <View style={[styles.canvas, { height: contentHeight }]}>
            {HOURS.map((h) => (
              <View key={`grid-${h}`} style={[styles.gridLine, { top: h * HOUR_HEIGHT }]} />
            ))}
            {/*드래그로 이동시키는 부분*/}
            {blocks.map((b) => {
              const top = (b.start / 60) * HOUR_HEIGHT;
              const height = ((b.end - b.start) / 60) * HOUR_HEIGHT;

              // PanResponder (탭 우선)
              let touchStartTS = 0;

              const responder = PanResponder.create({
                //초기 터치 인식 관련
                onStartShouldSetPanResponder: () => false,
                onStartShouldSetPanResponderCapture: () => {
                  touchStartTS = Date.now();
                  return false;
                },
                onMoveShouldSetPanResponder: (_e, g) => {
                  const movedEnough = Math.abs(g.dy) >= DRAG_THRESHOLD_PX;
                  const delayed = Date.now() - touchStartTS >= DRAG_DELAY_MS;
                  return movedEnough && delayed;
                },
                onMoveShouldSetPanResponderCapture: (_e, g) => {
                  const movedEnough = Math.abs(g.dy) >= DRAG_THRESHOLD_PX;
                  const delayed = Date.now() - touchStartTS >= DRAG_DELAY_MS;
                  return movedEnough && delayed;
                },
                //드래그 시작 시
                onPanResponderGrant: () => {
                  setDraggingId(b.id);
                  setDragStartTop(top);
                  setDragDurationMin(b.end - b.start);
                  dragY.setValue(0);
                  setScrollLock(true);
                },
                //드래그 중
                onPanResponderMove: Animated.event([null, { dy: dragY }], { useNativeDriver: false }),

                //드래그 종료 시
                onPanResponderRelease: (_e, g) => {
                  const projectedDy =
                    Math.abs(g.vy) >= MIN_PROJECT_VY ? g.dy + g.vy * FLICK_PROJECT_PX : g.dy;

                  const newTopPx = dragStartTop + projectedDy;

                  let newStartMin = minutesFromTopPx(newTopPx);
                  newStartMin = snapMinutes(newStartMin);
                  newStartMin = clamp(newStartMin, 0, 1440 - dragDurationMin);
                  const newEndMin = newStartMin + dragDurationMin;
                  //겹쳤을때
                  if (hasOverlap(newStartMin, newEndMin, b.id)) {
                    Animated.spring(dragY, { toValue: 0, useNativeDriver: false }).start(() => {
                      setDraggingId(null);
                      setScrollLock(false);
                    });
                    return;
                  }
                  {/*날짜별 일정 데이터를 담음 */}
                  setByDate((prev) => ({
                    ...prev,
                    [selectedDate]: (prev[selectedDate] || []).map((x) =>
                      x.id === b.id ? { ...x, start: newStartMin, end: newEndMin } : x
                    ),
                  }));

                  {/*드래그 종료 후 애니메이션 복귀(화면상 툭 하고 복귀하는 시각효과)*/}
                  Animated.spring(dragY, { toValue: 0, useNativeDriver: false }).start(() => {
                    setDraggingId(null);
                    setScrollLock(false);
                  });
                },
                //드래그중 다른 제스처 끼어들지 못하게 방지
                onPanResponderTerminationRequest: () => false,
                //드래그가 이상하게 종료됐을 때 복귀
                onPanResponderTerminate: () => {
                  Animated.spring(dragY, { toValue: 0, useNativeDriver: false }).start(() => {
                    setDraggingId(null);
                    setScrollLock(false);
                  });
                },
              });
              //드래그중인지 확인
              const isDragging = draggingId === b.id;
              const translateY = isDragging ? dragY : 0;

              return ( //일정 블록 감싸는 부분
                <Animated.View
                  key={b.id}
                  {...responder.panHandlers} //드래그 제스처 연결
                  style={[
                    styles.block,
                    {
                      top, //일정 시각 시각을 px로 변환한 위치
                      height, //일정 지속시간, 분을 px로
                      left: 0,
                      right: 8,
                      backgroundColor: b.color, //색상
                      transform: [{ translateY }], //드래그시 실시간 이동
                      zIndex: isDragging ? 2 : 1, //드래그중이면 위로 띄우는 효과
                    },
                  ]}
                >
                  {/*드래그중일때 표시되는 반투명 이동중 오버레이*/}
                  {isDragging && (
                    <View style={styles.movingOverlay}>
                      <Text style={styles.movingText}>이동 중</Text>
                    </View>
                  )}
                  {/*평소엔 일정 표시, 클릭하면 편집오픈*/}
                  {!isDragging && (
                    <TouchableOpacity activeOpacity={0.9} onPress={() => openEdit(b)} style={{ flex: 1 }}>
                      <Text style={styles.blockTitle}>{b.purpose ?? "할 일"}</Text>
                      <Text style={styles.blockTime}>
                        {toHHMM(b.start)} ~ {toHHMM(b.end)}
                      </Text>
                    </TouchableOpacity>
                  )}
                </Animated.View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* 우하단 추가버튼 */}
      <TouchableOpacity style={styles.fab} activeOpacity={0.9} onPress={openAdd}>
        <Text style={styles.fabText}>＋</Text>
      </TouchableOpacity>

      {/* 편집 모달 */}
      <Modal visible={!!editing} //edting이 null이 아닐때 표시
      transparent animationType="fade" 
      onRequestClose={closeEdit}//뒤로가기나 배경터치시 닫힘
      > 
        <View style={styles.backdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ width: "100%", alignItems: "center" }}
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>할 일 편집</Text>

              <Text style={styles.label}>이름</Text>
              <TextInput
                value={editPurpose} //현재 입력값
                onChangeText={setEditPurpose} //텍스트변경시 상태 업데이트
                placeholder="예: 운동, 업무…" //예시텍스트
                placeholderTextColor={C.textDim}
                style={styles.input}
                returnKeyType="done"
              />
              {/*시간 설정*/}
              <Text style={[styles.label, { marginTop: 12 }]}>시간</Text>
              <View style={styles.timeRow}>
                <TouchableOpacity style={styles.timeBtn} onPress={() => setShowPicker("start")}>
                  <Text style={styles.timeBtnText}>시작 {toHHMM(fromDateToMinutes(startTime))}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.timeBtn} onPress={() => setShowPicker("end")}>
                  <Text style={styles.timeBtnText}>종료 {toHHMM(fromDateToMinutes(endTime))}</Text>
                </TouchableOpacity>
              </View>

              {/*피커*/}
              {showPicker && (
                <View style={{ marginTop: 8 }}>
                  <DateTimePicker
                    value={showPicker === "start" ? startTime : endTime}
                    mode="time"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    is24Hour={false}
                    onChange={(e: DateTimePickerEvent, d?: Date) => {
                      if (e.type === "dismissed") {
                        setShowPicker(null);
                        return;
                      }
                      if (d) {
                        if (showPicker === "start") setStartTime(d);
                        else setEndTime(d);
                        if (Platform.OS !== "ios") setShowPicker(null);
                      }
                    }}
                  />
                </View>
              )}

              <View style={styles.footerRow}>
                <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={closeEdit}>
                  <Text style={styles.btnGhostText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={saveEdit}>
                  <Text style={styles.btnPrimaryText}>저장</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* 추가 모달 (UI만있고 확인해도 저장 안 함) */}
      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={closeAdd}>
        <View style={styles.backdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ width: "100%", alignItems: "center" }}
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>할 일 추가</Text>

              {/* 랜덤 색 미리보기 */}
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: addColor, marginRight: 6 }} />
                <Text style={{ color: C.textDim, fontSize: 12 }}>색상은 임시로 랜덤 적용</Text>
              </View>

              <Text style={styles.label}>이름</Text>
              <TextInput
                value={addPurpose}
                onChangeText={setAddPurpose}
                placeholder="예: 운동, 업무…"
                placeholderTextColor={C.textDim}
                style={styles.input}
                returnKeyType="done"
              />

              <Text style={[styles.label, { marginTop: 12 }]}>시간</Text>
              <View style={styles.timeRow}>
                <TouchableOpacity style={styles.timeBtn} onPress={() => setAddPicker("start")}>
                  <Text style={styles.timeBtnText}>시작 {toHHMM(fromDateToMinutes(addStart))}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.timeBtn} onPress={() => setAddPicker("end")}>
                  <Text style={styles.timeBtnText}>종료 {toHHMM(fromDateToMinutes(addEnd))}</Text>
                </TouchableOpacity>
              </View>

              {addPicker && (
                <View style={{ marginTop: 8 }}>
                  <DateTimePicker
                    value={addPicker === "start" ? addStart : addEnd}
                    mode="time"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    is24Hour={false}
                    onChange={(e: DateTimePickerEvent, d?: Date) => {
                      if (e.type === "dismissed") {
                        setAddPicker(null);
                        return;
                      }
                      if (d) {
                        if (addPicker === "start") setAddStart(d);
                        else setAddEnd(d);
                        if (Platform.OS !== "ios") setAddPicker(null);
                      }
                    }}
                  />
                </View>
              )}

              <View style={styles.footerRow}>
                <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={closeAdd}>
                  <Text style={styles.btnGhostText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.btnPrimary]}
                  onPress={() => {
                    closeAdd();
                  }}
                >
                  <Text style={styles.btnPrimaryText}>확인</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

// 왼쪽 시간 레일에 표시할 유틸함수, 시간을 받아 1am, 2pm같은 형식으로 변환
function formatHour(h: number) {
  const ampm = h < 12 ? "am" : "pm";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}${ampm}`;
}

// ---------- 스타일 ----------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg }, //전체 배경
  safeTop: { backgroundColor: C.bg }, //상단 영역

  //헤더
  header: {
    height: 56,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerBtnText: { fontSize: 18, fontWeight: "700", color: C.text },
  headerTitle: { fontSize: 16, fontWeight: "700", color: C.text },

  //타임라인
  timelineRow: { flexDirection: "row" },

  //왼쪽 시간표시 레일
  leftRail: {
    width: LABEL_GUTTER,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: C.border,
  },
  hourRow: { paddingLeft: 8, justifyContent: "flex-start" },
  hourLabel: { fontSize: 12, color: C.textDim, marginTop: 2 },
  hourLine: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
  },

  //오른쪽 일정 캔버스
  canvas: { flex: 1, paddingRight: 16, paddingLeft: 8, position: "relative" },
  gridLine: {
    position: "absolute",
    left: 0, right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#1e293b",
  },

  //일정블록
  block: {
    position: "absolute",
    marginHorizontal: 8,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  blockTitle: { fontSize: 13, fontWeight: "700", color: "#0B1220" },
  blockTime: { fontSize: 12, color: "#0B1220", opacity: 0.9, marginTop: 2 },

  //드래그 표시 오버레이, 이동중 텍스트
  movingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.18)",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  movingText: {
    color: "#0B1220",
    fontWeight: "800",
    fontSize: 14,
    backgroundColor: "#E5E7EB",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },

  // 편집/추가 모달 공통
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  modalCard: {
    width: "100%",
    backgroundColor: C.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderColor: C.border,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
  },
  modalTitle: { color: C.text, fontSize: 18, fontWeight: "800", marginBottom: 8 },

  //라벨
  label: { color: C.textDim, fontSize: 12, marginBottom: 6 },
  //입력창
  input: {
    backgroundColor: "#0B1220",
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: C.text,
  },

  //시간설정 버튼
  timeRow: { flexDirection: "row", gap: 8 },
  timeBtn: {
    flex: 1,
    backgroundColor: "#0B1220",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  timeBtnText: { color: C.text, fontWeight: "700" },
//하단버튼
  footerRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  btn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  btnGhost: { borderWidth: 1, borderColor: C.border, backgroundColor: "#0B1220" },
  btnGhostText: { color: C.text },

  btnPrimary: { backgroundColor: C.primary },
  btnPrimaryText: { color: "#0B1220", fontWeight: "800" },

  fab: {
    position: "absolute",
    right: 16,
    bottom: 22,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  fabText: { color: "#0B1220", fontSize: 26, fontWeight: "800", marginTop: -2 },
});
