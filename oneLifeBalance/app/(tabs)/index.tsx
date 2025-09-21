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



  // 여기부터 일정부분 //


  const tasksByDate: Record< //날짜 문자열을 일정 배열로 매핑하는 객체, 각 날의 일정 하나는 임시로 이름/시작/종료/색으로 설정
    string,
    { title: string; start: string; end: string; color: string }[]
  > = {
    
  // 데이터는 일단 임의로 입력, 날짜는 년월일로 관리, 시간은 오름차순으로 관리, 색깔은 시간표 구분용으로 설정

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

  // 12:00, 04:00같은 문자열 시간을 240, 720과 같은 정수 분으로 변환(파이차트 조각 크기 계산을 위해선 분 단위 시간길이가 필요)
  const toMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };

  // 선택 날짜에 따라 파이차트(원형시간표)배열 생성, 하루는 1440분으로 설정, 현재 선택된 날짜의 배열을 가져옴
    const pieSlices = useMemo(() => { //useDemo는 특정 값 변경시에만 계산을 다시 수행하는 기능, 이 경우 선택 날이 바뀔 때만 파이차트를 변경
    const DAY_MIN = 1440; //하루 전체 분 수는 1440

    //taskByDate는 날짜별로 일정을 모아둔 객체, selected는 현재 선택한 날짜, tasksByDate[selectedDate]는 선택된 날짜에 따른 일정을 가져옴
    //뒤의 || []; 는 selected에 해당 작업이 없어 반환되는게 없을 경우 오류 피하기 위해 빈 배열을 할당하는 역할
    const dayTasks = tasksByDate[selectedDate] || []; 

    // dayTasks에 일정이 없다면, 조각 크기를 하루 전체로 설정하고 색상을 옅은 회색으로 채움
    if (!dayTasks.length) {
      return [{ value: DAY_MIN, color: "#eeeeee" }];
    }

    // 선택뇐 날짜의 작업들을 시작 시간 순서대로 정렬함
    const sorted = [...dayTasks].sort(
      (a, b) => toMinutes(a.start) - toMinutes(b.start)
    );


    // slices는 파이차트 컴포넌트에 넘겨줄 배열, 크기와 색깔이 쌓여 차트를 그림
    const slices: { value: number; color: string }[] = [];
    let cursor = 0; //cursor는 지금까지 채운 시각을 분 단위로 기록,처음은 자정 00:00에서 시작. 일정이 추가될 때마다 cursor를 해당 종료시각으로 옮김


    
    for (const t of sorted) { //시작시간 순서대로 일정 배열
      const start = Math.max(0, Math.min(DAY_MIN, toMinutes(t.start)));
      const end = Math.max(0, Math.min(DAY_MIN, toMinutes(t.end))); // 각각 HH:MM을 분 단위로 변환, 0분 이상, 1440분 이하로 잘라내기
      if (end <= start) {
        // 만약 종료시각이 시작시각과 같거나 이르면 잘못된 일정으로 판단하고 건너뒴
        continue;
      }

      // 이전 종료부터 현재 시작까지의 일정 없는 구간은 무채색으로 칠함
      if (start > cursor) {
        slices.push({ value: start - cursor, color: "#eeeeee" });
      }
      // 실제 일정 구간은 해당 일정에 맞게 설정(현재는 임의로 설정한 값에 따름)
      slices.push({ value: end - start, color: t.color });
      cursor = end;
    }

    // 모든 일정이 끝난 후, 남은 구간 역시 무채색으로 칠함
    if (cursor < DAY_MIN) {
      slices.push({ value: DAY_MIN - cursor, color: "#eeeeee" });
    }

    // 이렇게 만들어진 배열의 합이 전체 1440을 정확히 채움
    return slices;
  }, [selectedDate]); 

    //해야 할 일을 텍ㄷ스트 문자열로 바꿔서 보여줌
    const todosForSelected = useMemo(() => {
    const list = tasksByDate[selectedDate] || []; //선택된 날짜의 일정 배열을 가져옴, 없으면 오류 방지 위해 빈배열

    return list.map((t) => `${t.start} ~ ${t.end} ${t.title}`); //각 일정을 시작시간, 종료시간, 일정제목으로 보여줌
  }, [selectedDate]); //날짜가 바뀔 때 다시 실행

  //여기까지 일정관련 끝 //



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
