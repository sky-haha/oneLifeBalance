import React, { useState } from "react";
import { View, StyleSheet, Dimensions, ScrollView, TouchableOpacity, Text} from "react-native";
import { Calendar } from "react-native-calendars";
import PieChart from "react-native-pie-chart"; //리액트 컴포넌트들 불러오기

const { width: SCREEN_WIDTH } = Dimensions.get("window"); //기기별 화면 너비를 SCREN_WIDTH로 저장

export default function App() {
  const today = new Date().toISOString().split("T")[0]; //날짜를 문자열로 구하기
  const [selectedDate, setSelectedDate] = useState(today); //앱 실행시 초기화면은 오늘날짜

  // 캘린더/시간표 스왑 상태를 나타냄
  const [viewMode, setViewMode] = useState<"calendarTop" | "scheduleTop">("calendarTop");

  //캘린더에서 날짜 클릭시 실행되는 함수
  const handleDayPress = (day) => {
    setSelectedDate(day.dateString); //누른 날짜 상태에 저장
  };

  // 아래 시간표 눌렀을 때 스왑
  const handlePiePress = () => setViewMode("scheduleTop");
  // 시간표를 다시 클릭 시 원상태로
  const handleBackToCalendar = () => setViewMode("calendarTop");

  return (
    <View style={styles.container}> {/*화면 전체 차지, 배경 흰색*/}
      {/* 구분선 기준 위쪽 영역 */}
      <View style={styles.topPane}> 
        {viewMode === "calendarTop" ? (
          <Calendar
            initialDate={today} //첫 날짜는 오늘
            onDayPress={handleDayPress} //날짜 누르면 위 함수 실행
            markedDates={{
              [selectedDate]: { selected: true, selectedColor: "blue" }, //선택 날짜 파란색으로 강조
            }}
            style={styles.calendar} //스타일
          />
        ) : (
          <TouchableOpacity onPress={handleBackToCalendar} activeOpacity={0.8}>
            <View style={styles.pieCentered}> 
              <PieChart
                widthAndHeight={SCREEN_WIDTH * 0.7} //시간표 크기는 화면너비*0.7%
                series={[
                  { value: 25, color: 'red' },
                  { value: 15, color: 'blue' },
                  { value: 10, color: 'green' },
                  { value: 5,  color: 'grey' },
                  { value: 45, color: 'yellow' }, //구색 맞추기 우해 일단 시간표 설정은 임의로 설정
                ]}
              />
            </View>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.divider} />{/*위아래를 구분하는 줄*/}

      {/* 구분선 기준 아래쪽 영역 */}
      <View style={styles.bottomPane}>
        {viewMode === "calendarTop" ? (
          // 기본은 위가 캘린더, 아래가 시간표
          <TouchableOpacity onPress={handlePiePress} activeOpacity={0.8}>
            <View style={styles.pieCentered}> 
              <PieChart
                widthAndHeight={SCREEN_WIDTH * 0.7} //시간표 크기는 화면너비*0.7%
                series={[
                  { value: 25, color: 'red' },
                  { value: 15, color: 'blue' },
                  { value: 10, color: 'green' },
                  { value: 5,  color: 'grey' },
                  { value: 45, color: 'yellow' }, //구색 맞추기 우해 일단 시간표 설정은 임의로 설정
                ]}
              />
            </View>
          </TouchableOpacity>
        ) : (
          // 스왑된 상태일 때, 아래 부분은 할일 목록이 됨
          <ScrollView contentContainerStyle={styles.todoContainer}>
            <Text style={styles.todoItem}>00:00 ~ 08:00 수면</Text>
            <Text style={styles.todoItem}>08:00 ~ 19:00 업무</Text>
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
