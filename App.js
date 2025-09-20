import React, { useState } from "react";
import { View, StyleSheet, Dimensions, ScrollView } from "react-native";
import { Calendar } from "react-native-calendars";
import PieChart from "react-native-pie-chart"; //리액트 컴포넌트들 불러오기

const { width: SCREEN_WIDTH } = Dimensions.get("window"); //기기별 화면 너비를 SCREN_WIDTH로 저장

export default function App() {
  const today = new Date().toISOString().split("T")[0]; //날짜를 문자열로 구하기
  const [selectedDate, setSelectedDate] = useState(today); //앱 실행시 초기화면은 오늘날짜

  //캘린더에서 날짜 클릭시 실행되는 함수
  const handleDayPress = (day) => {
    setSelectedDate(day.dateString); //누른 날짜 상태에 저장
  };


  return (
    <ScrollView style={styles.container}>
      <Calendar
        initialDate={today} //첫 날짜는 오늘
        onDayPress={handleDayPress} //날짜 누르면 위 함수 실행
        markedDates={{
          [selectedDate]: { selected: true, selectedColor: "blue" }, //선택 날짜 파란색으로 강조
        }}
        style={styles.calendar} //스타일
      />

      <View style={styles.divider} />{/*캘린더와 아래 시간표 구분하는 줄*/}

      <View style={styles.pieContainer}> 
     <PieChart
      widthAndHeight={SCREEN_WIDTH * 0.7} //시간표 크기는 화면너비*0.7%
      series={[
      { value: 25, color: 'red' },
      { value: 15, color: 'blue' },
      { value: 10, color: 'green' },
      { value: 5,  color: 'grey' },
      { value: 45, color: 'yellow' }, //구색 맞추기 우해 일단 시간표 설정은 임의로 설정
      ]}/>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({ //기타 스타일
  container: {
    flex: 1,
    backgroundColor: "white", //화면 전체 차지, 배경 흰색
  },
  calendar: {
    width: SCREEN_WIDTH,
    paddingTop: "12.5%", //너비는 기기별로 계산, 상단에서 12.5% 여백
  },
  divider: {
    height: 1,
    backgroundColor: "black", 
    marginVertical: 10,// 캘린더-시간표 구분선 검은색 및 여백 10
  },
  pieContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 20, //시간표 가로/세로 중앙 정렬 및 여백 20
  },
});
