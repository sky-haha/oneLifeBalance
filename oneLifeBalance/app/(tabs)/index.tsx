import React, { useMemo, useState } from "react";
import { View, StyleSheet, Dimensions, ScrollView, TouchableOpacity, Text } from "react-native";
import { Calendar } from "react-native-calendars";
import PieChart from "react-native-pie-chart"; //리액트 컴포넌트들 불러오기

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

  // 일단 날짜는 임의로 입력, 날짜는 년월일로 관리, 시간은 오름차순으로 관리, 색깔은 임의로 설정
  const tasksByDate: Record<
    string,
    { title: string; start: string; end: string; color: string }[]
  > = {

    "2025-09-21": [
      { title: "업무", start: "08:00", end: "19:00", color: "#FFFF00" }, 
      { title: "식사", start: "19:00", end: "20:30", color: "#FF0000" }, 
      { title: "운동", start: "20:30", end: "22:00", color: "#0000FF" }, 
      { title: "정리", start: "22:00", end: "23:00", color: "#008000" }, 
      { title: "이동", start: "23:00", end: "23:30", color: "#808080" }, 
    ],

    "2025-09-22": [
      { title: "회의", start: "09:00", end: "12:00", color: "#0000FF" },
      { title: "점심", start: "12:00", end: "13:00", color: "#FF0000" },
      { title: "개발", start: "13:00", end: "18:00", color: "#008000" },
    ],

    "2025-09-23": [
      { title: "외근", start: "10:00", end: "16:00", color: "#808080" },
      { title: "정리", start: "16:30", end: "18:00", color: "#008000" },
    ],
  }; 

  // 시간을 분 단위로 나타냄, 예를들어 08:00은 480, 19:30은 1170
  const toMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };

  // 선택 날짜에 따라 파이차트(원형시간표)배열 생성
  const pieSlices = useMemo(() => {
    const DAY_MIN = 1440;
    const dayTasks = tasksByDate[selectedDate] || [];

    // 일단 일정없는부분은 단색으로 채우기
    if (!dayTasks.length) {
      return [{ value: DAY_MIN, color: "#eeeeee" }];
    }

    // 시작 시간 순 정렬(데이터가 이미 정렬되어 있어도 안전하게)
    const sorted = [...dayTasks].sort(
      (a, b) => toMinutes(a.start) - toMinutes(b.start)
    );

    const slices: { value: number; color: string }[] = [];
    let cursor = 0;

    for (const t of sorted) {
      const start = Math.max(0, Math.min(DAY_MIN, toMinutes(t.start)));
      const end = Math.max(0, Math.min(DAY_MIN, toMinutes(t.end)));
      if (end <= start) {
        // 0분/역전 구간은 스킵
        continue;
      }

      // 이전 종료부터 현재 시작까지의 빈 구간
      if (start > cursor) {
        slices.push({ value: start - cursor, color: "#eeeeee" });
      }
      // 실제 일정 구간
      slices.push({ value: end - start, color: t.color });
      cursor = end;
    }

    // 마지막 이후의 빈 구간
    if (cursor < DAY_MIN) {
      slices.push({ value: DAY_MIN - cursor, color: "#eeeeee" });
    }

    // 합이 0이면 안됨
    return slices;
  }, [selectedDate]); 

  const todosForSelected = useMemo(() => {
    const list = tasksByDate[selectedDate] || [];

    return list.map((t) => `${t.start} ~ ${t.end} ${t.title}`);
  }, [selectedDate]); // [add]

  //파이차트 공통(아래/위 위치만 바뀜)
  const PieBlock = (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() =>
        setViewMode((m) => (m === "calendarTop" ? "scheduleTop" : "calendarTop"))
      }
      style={styles.pieCentered}
    >
      <PieChart
        widthAndHeight={SCREEN_WIDTH * 0.7}
        series={pieSlices} 
      />
    </TouchableOpacity>
  ); 

  return (
    <View style={styles.container}>
      {/* 상단 영역: 달력 또는 파이차트 */}
      <View style={styles.topPane}>
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
      </View>

      {/* 가운데 구분선 */}
      <View style={styles.divider} />

      {/* 하단 영역: 파이차트(기본상태) 또는 할 일 목록(파이차트 클릭시) */}
      <View style={styles.bottomPane}>
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ //기타 스타일
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

  // 시간표 가로/세로 중앙 정렬 및 여백
  pieCentered: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: "12.5%" //시간표 가로/세로 중앙 정렬 및 여백 12.5%
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
});
