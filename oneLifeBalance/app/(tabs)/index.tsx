import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Dimensions, Easing, ScrollView, StyleSheet, Text,
  TouchableOpacity, View, Modal, Platform, TextInput, KeyboardAvoidingView, Keyboard} from "react-native";
import { Calendar } from "react-native-calendars";
import PieChart from "react-native-pie-chart";
import DateTimePicker from "@react-native-community/datetimepicker"; //리액트 컴포넌트들 불러오기

//@ts-ignore (실행 자체는 문제가 없는데 이게 빨간줄떠서 찾아보니 이거 붙히면 없어지더라고요)
import { auth, db } from "./firebaseConfig";

const { width: SCREEN_WIDTH } = Dimensions.get("window"); //기기별 화면 너비를 SCREN_WIDTH로 저장

export default function App() {
  const today = new Date().toISOString().split("T")[0]; //날짜를 문자열로 구하기
  const [selectedDate, setSelectedDate] = useState(today); //앱 실행시 초기화면은 오늘날짜

  //캘린더에서 날짜 클릭시 실행되는 함수
  const handleDayPress = (day: { dateString: string }) => {
    setSelectedDate(day.dateString); //누른 날짜 상태에 저장
  };

  // 캘린더/시간표 스왑 보기 모드 (원래 두줄이였는데 한줄로 하는법이 있더라고요)
  const [viewMode, setViewMode] = useState<"calendarTop" | "scheduleTop">("calendarTop");

  // 여기부터 로그인시 태스크 변화 함수 //

  function minutesToHHMM(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  }

  function convertTimeRange(range: string): [string, string] {
    const [startStr, endStr] = range.split("-");
    const start = minutesToHHMM(Number(startStr));
    const end = minutesToHHMM(Number(endStr));
    return [start, end];
  }

  type Task = { title: string; start: string; end: string; color: string };

  async function fetchAllUserData(userId: string) {
    const result: Record<string, Task[]> = {};

    const dateTableRef = collection(db, "User", userId, "dateTable");
    const dateSnap = await getDocs(dateTableRef);

    for (const dateDoc of dateSnap.docs) {
      const dateId = dateDoc.id; // 예: "2025-09-21"
      result[dateId] = [];

      // timeTable 하위 컬렉션 접근
      const timeTableRef = collection(db, "User", userId, "dateTable", dateId, "timeTable");
      const timeSnap = await getDocs(timeTableRef);

      for (const timeDoc of timeSnap.docs) {
        const data = timeDoc.data();
        const [S, E] = convertTimeRange(timeDoc.id);
        result[dateId].push({
          title: data.purpose,
          start: S,
          end: E,
          color: data.color,
        });
      }
    }

    return result;
  }
  const [tasksByDate, setTasksByDate] = useState<Record<string, Task[]>>({});

  // 로그인 변경(제 아이폰 expo go 기준 로그인 시도 후 앱 잠깐 내렸다 다시 켜야 로그인이 되가지고 이거 아주살짝 수정했어요) //
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const data = await fetchAllUserData(user.uid); // ← 여기서 바로 user.uid 사용
        setTasksByDate(data);
        console.log("a");
      } else {
        setTasksByDate({});
        console.log("b");
      }
    });
    return unsubscribe;
  }, []);

  // 여기까지 //

  // 스왑 애니메이션: 0이면 캘린더가 상단, 1이면 시간표가 상단으로 판단
  const swapAnim = useRef(new Animated.Value(0)).current;

  //viewMode 변경 시 애니메이션 구동
  useEffect(() => {
    const toValue = viewMode === "calendarTop" ? 0 : 1;
    Animated.timing(swapAnim, {
      toValue,
      duration: 280, // 애니메이션 지속시간
      easing: Easing.out(Easing.cubic), // 시작은 빠르고 끝은 부드럽게 감속
      useNativeDriver: true, // 자바스크립트 대신 리액트 네이티브에서 자체 처리(최적화)
    }).start();
  }, [viewMode, swapAnim]);

  //상/하단 페이드 + 슬라이드 보간값
  const topOpacity = swapAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] });
  const bottomOpacity = swapAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] });
  const topTranslateY = swapAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -12] });
  const bottomTranslateY = swapAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 12] });

  // 12:00, 04:00같은 문자열 시간을 240, 720과 같은 정수 분으로 변환(파이차트 조각 크기 계산을 위해선 분 단위 시간길이가 필요)
  const toMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };

  // 선택 날짜에 따라 파이차트(원형시간표)배열 생성, 하루는 1440분으로 설정, 현재 선택된 날짜의 배열을 가져옴
  const pieSlices = useMemo(() => {
    const DAY_MIN = 1440; //하루 전체 분 수는 1440
    const dayTasks = tasksByDate[selectedDate] || [];

    if (!dayTasks.length) {
      return [{ value: DAY_MIN, color: "#eeeeee" }];
    }

    const sorted = [...dayTasks].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

    const slices: { value: number; color: string }[] = [];
    let cursor = 0;

    for (const t of sorted) {
      const start = Math.max(0, Math.min(DAY_MIN, toMinutes(t.start)));
      const end = Math.max(0, Math.min(DAY_MIN, toMinutes(t.end)));
      if (end <= start) {
        continue;
      }
      if (start > cursor) {
        slices.push({ value: start - cursor, color: "#eeeeee" });
      }
      slices.push({ value: end - start, color: t.color });
      cursor = end;
    }
    if (cursor < DAY_MIN) {
      slices.push({ value: DAY_MIN - cursor, color: "#eeeeee" });
    }
    return slices;
  }, [selectedDate]); // 파이/목록 실시간 반영은 추후에

  //해야 할 일을 텍ㄷ스트 문자열로 바꿔서 보여줌
  const todosForSelected = useMemo(() => {
    const list = tasksByDate[selectedDate] || [];
    return list.map((t) => `${t.start} ~ ${t.end} ${t.title}`);
  }, [selectedDate]);

  //여기까지 일정관련 끝 //

  // 할일 입력 관련
  const [isAddOpen, setIsAddOpen] = useState(false); // 버튼 클릭시 입력 인터페이스 상태
  const [title, setTitle] = useState(""); // 할 일 제목 상태

  // 시작/종료시간 확정 값 및 시작/종료시간 조정중일때의 값 상태
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(new Date(new Date().getTime() + 60 * 60 * 1000));
  const [tempStart, setTempStart] = useState<Date>(startDate); 
  const [tempEnd, setTempEnd] = useState<Date>(endDate);    

  // 할일 입력 시 시작시간/종료시간 둘다 누르면 먼저 눌렀던 건 사라짐
  const [activePicker, setActivePicker] = useState<"start" | "end" | null>(null);

  // 할일 입력 인터페이스 사라질 때 애니메이션
  const pickerAnim = useRef(new Animated.Value(0)).current;
  const animatePickerTo = (toOpen: boolean) => {
    Animated.timing(pickerAnim, {
      toValue: toOpen ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  };
  const pickerHeight = pickerAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 216] });
  const pickerOpacity = pickerAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  // 시간 문자열 변환 관련
  const formatHHMM = (d: Date) => {
    const hour = d.getHours();
    const h = String(hour).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  };

  // 닫힐 때 시간을 그 시간으로 확정
  const commitIfNeeded = () => {
    if (activePicker === "start") setStartDate(tempStart);
    if (activePicker === "end") setEndDate(tempEnd);
  };

  const openPicker = (target: "start" | "end") => {
    // 시간 버튼을 누를 때 키보드가 가리는 문제 고치는 부분
    Keyboard.dismiss(); 
    commitIfNeeded();
    setActivePicker(target);
    animatePickerTo(true);
  };

  const closePicker = () => { // 조정 중 다른 피커를 눌러서 기존 피커가 닫혔을 때, 시간 상태를 닫혔던 상태 그대로
    commitIfNeeded(); 
    setActivePicker(null);
    animatePickerTo(false);
  };

  //파이차트 공통(아래/위 위치만 바뀜)
  const PieBlock = (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => setViewMode((m) => (m === "calendarTop" ? "scheduleTop" : "calendarTop"))}
      style={styles.pieCentered}
    >
      <PieChart widthAndHeight={SCREEN_WIDTH * 0.7} series={pieSlices} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* 상단 영역: 달력 또는 파이차트 */}
      {/* 상단 영역을 Animated.View로 래핑하여 페이드+슬라이드 적용 */}
      <Animated.View
        style={[styles.topPane, { opacity: topOpacity, transform: [{ translateY: topTranslateY }] }]}
      >
        {viewMode === "calendarTop" ? (
          <ScrollView>
            <Calendar
              initialDate={today} //첫 날짜는 오늘
              onDayPress={handleDayPress} //날짜 누르면 위 함수 실행
              markedDates={{
                [selectedDate]: { selected: true, selectedColor: "blue" }, //선택된 날짜 표시
              }}
              style={styles.calendar}
            />
          </ScrollView>
        ) : (
          // 시간표 클릭시 달력은 보이지 않고 파이차트가 위로 이동
          PieBlock
        )}

        {/* 2ck 메인 상태에서,  */}
        {viewMode === "scheduleTop" && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setIsAddOpen(true)} // 시간 입력 인터페이스
            style={styles.addBtn} // 우상단 고정
          >
            <Text style={styles.addBtnText}>＋</Text>
          </TouchableOpacity>
        )}
      </Animated.View>

      {/* 가운데 구분선 */}
      {/*구분선을 화면 정중앙에 절대 위치로 고정*/}
      <View pointerEvents="none" style={[styles.divider, styles.dividerAbsolute]} />

      {/* 하단 영역: 파이차트(기본상태) 또는 할 일 목록(파이차트 클릭시) */}
      <Animated.View
        style={[styles.bottomPane, { opacity: bottomOpacity, transform: [{ translateY: bottomTranslateY }] }]}
      >
        {viewMode === "calendarTop" ? (
          // 기본: 파이차트는 아래쪽
          PieBlock
        ) : (
          // 파이차트 모드
          <ScrollView contentContainerStyle={styles.todoContainer}>
            {todosForSelected.length === 0 ? (
              <Text style={styles.todoItem}>할 일을 설정하세요</Text>
            ) : (
              todosForSelected.map((line, idx) => (
                <Text key={idx} style={styles.todoItem}>
                  {line}
                </Text>
              ))
            )}
          </ScrollView>
        )}
      </Animated.View>

      {/* 버튼 클릭 시 하단에서 올라오는 입력 인터페이스 */}
      <Modal visible={isAddOpen} transparent animationType="fade" onRequestClose={() => setIsAddOpen(false)}>
        {/* 키보드 가림 방지 */}
        <KeyboardAvoidingView style={styles.sheetBackdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          {/* 바깥을 눌러 닫기 */}
          <TouchableOpacity style={styles.sheetBackdropTap} activeOpacity={1} onPress={() => setIsAddOpen(false)} />
          {/* 실제 시트 */}
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>할 일 추가</Text>

            {/* 제목 입력 */}
            <Text style={styles.sheetLabel}>제목</Text>
            <TextInput
              placeholder="예) 운동, 업무, 식사"
              value={title}
              onChangeText={setTitle}
              style={styles.input}
              placeholderTextColor="#999"
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()} // 입력 종료 시 키보드 닫기
            />

            {/* 시작/종료 시간 버튼 */}
            <View style={styles.timeRow}>
              <TouchableOpacity style={styles.timeBtn} onPress={() => openPicker("start")}>
                <Text style={styles.timeLabel}>시작 {formatHHMM(startDate)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.timeBtn} onPress={() => openPicker("end")}>
                <Text style={styles.timeLabel}>종료 {formatHHMM(endDate)}</Text>
              </TouchableOpacity>
            </View>

            {/* 단일 인터페이스 영역*/}
            <Animated.View style={{ height: pickerHeight, opacity: pickerOpacity, overflow: "hidden" }}>
              {activePicker && (
                <DateTimePicker
                  value={activePicker === "start" ? tempStart : tempEnd}
                  mode="time"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  is24Hour={false} 
                  minuteInterval={5 as any}
                  onChange={(event, date) => {
                    if (!date) {
                      if (Platform.OS !== "ios") closePicker();
                      return;
                    }
                    if (activePicker === "start") {
                      setTempStart(date);
                    } else {
                      setTempEnd(date);
                    }
                    if (Platform.OS !== "ios" && event.type === "set") {
                      commitIfNeeded();
                      setActivePicker(null);
                    }
                  }}
                />
              )}
            </Animated.View>

            {/* 액션 버튼(동작안함) */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#e5e7eb" }]}
                onPress={() => {
                  closePicker();
                  setIsAddOpen(false);
                }}
              >
                <Text style={[styles.actionBtnText, { color: "#111827" }]}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "black" }]}
                onPress={() => {
                  closePicker(); 
                  setIsAddOpen(false);
                }}
              >
                <Text style={[styles.actionBtnText, { color: "white" }]}>저장</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {/* 시간 입력 인터페이스 끝 */}
    </View>
  );
}

const styles = StyleSheet.create({
  //기타 스타일
  container: {
    flex: 1,
    backgroundColor: "white", //화면 전체 차지, 배경 흰색
  },

  topPane: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomPane: {
    flex: 1,
  },
  calendar: {
    width: SCREEN_WIDTH,
    paddingTop: "12.5%", //너비는 기기별로 계산, 상단 여백은 소폭만 유지
  },
  divider: {
    height: 1,
    backgroundColor: "black",
  },

  dividerAbsolute: {
    position: "absolute", // flex에 영향받지 않도록
    left: 0,
    right: 0,
    top: "50%",
    transform: [{ translateY: -0.5 }],
    zIndex: 1, // 다른 요소들보다 가장 위로
  },

  // 시간표 가로/세로 중앙 정렬 및 여백
  pieCentered: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: "12.5%", //시간표 가로/세로 중앙 정렬 및 여백 12.5%
  },

  todoContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  todoItem: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 8,
  },

  addBtn: {
    position: "absolute",
    top: "15%",
    right: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "black",
  },

  addBtnText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },

  // 시간 입력 인터페이스 스타일
  sheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheetBackdropTap: {
    flex: 1,
  },
  bottomSheet: {
    backgroundColor: "#1f2937",
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 24,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#374151",
    marginBottom: 12,
  },
  sheetTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  sheetLabel: {
    color: "#d1d5db",
    fontSize: 12,
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#111827",
    color: "white",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  timeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  timeBtn: {
    flex: 1,
    backgroundColor: "#111827",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  timeLabel: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: "700",
  },
});
