import React, { useState } from "react";
import { View, StyleSheet, Dimensions, ScrollView } from "react-native";
import { Calendar } from "react-native-calendars";
import PieChart from "react-native-pie-chart";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function App() {
  const today = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(today);

  const handleDayPress = (day) => {
    setSelectedDate(day.dateString);
  };

  return (
    <ScrollView style={styles.container}>
      <Calendar
        initialDate={today}
        onDayPress={handleDayPress}
        markedDates={{
          [selectedDate]: { selected: true, selectedColor: "blue" },
        }}
        style={styles.calendar}
      />

      <View style={styles.divider} />

      <View style={styles.pieContainer}>
     <PieChart
      widthAndHeight={SCREEN_WIDTH * 0.7}
      series={[
      { value: 25, color: 'red' },
      { value: 15, color: 'blue' },
      { value: 10, color: 'green' },
      { value: 5,  color: 'grey' },
      { value: 45, color: 'yellow' },
      ]}
      coverRadius={0.45}
      coverFill={'white'}/>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "white",
  },
  calendar: {
    width: SCREEN_WIDTH,
    paddingTop: "12.5%",
  },
  divider: {
    height: 1,
    backgroundColor: "#ccc",
    marginVertical: 10,
  },
  pieContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 20,
  },
});
