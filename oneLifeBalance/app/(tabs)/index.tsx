import React, { useMemo, useRef, useState } from "react";
import { View,Text, StyleSheet, Dimensions, TouchableOpacity, PanResponder, Modal, ScrollView} from "react-native";
import { useRouter } from "expo-router";
import PieChart from "react-native-pie-chart";
import { Calendar } from "react-native-calendars";
//기기 가로폭을 가져와 SCREEN_WIDTH로 저장
const { width: SCREEN_WIDTH } = Dimensions.get("window");

//날짜 유틸, Date는 YYYY-MM-DD 문자열로,ISO 문자열에 delta일을 더하거나 빼서 다시 iso로 반환
const fmt = (d: Date) => d.toISOString().split("T")[0]; 
const addDays = (iso: string, delta: number) => {
  const d = new Date(iso);
  d.setDate(d.getDate() + delta);
  return fmt(d);
};
// 그 후 YYYY-MM-DD, (요일) 형태로 상단에 표시할 라벨 생성
const toKoreanLabel = (iso: string) => {
  const d = new Date(iso);
  const dow = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate()
  ).padStart(2, "0")} (${dow})`;
};

//  블록은 일정(분 단위 시작/끝, 색상, 라벨)
// 슬라이스는 파이차트 조각
type Block = { start: number; end: number; color: string; label?: string }; // 분 단위
type Slice = { value: number; color: string };

//임시 표시용 데이터들, 나중에 파이어베이스 연동할자리 
const mockByDate: Record<string, Block[]> = (() => {
  const today = fmt(new Date());
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, +1);
  return {
    [today]: [
      { start: 0, end: 420, color: "#E5E7EB", label: "수면" }, 
      { start: 480, end: 720, color: "#60A5FA", label: "업무" }, 
      { start: 780, end: 1020, color: "#34D399", label: "집중" },
    ],
    [yesterday]: [{ start: 540, end: 1020, color: "#F59E0B", label: "과제" }],
    [tomorrow]: [{ start: 600, end: 900, color: "#F472B6", label: "회의" }],
  };
})();

// 24시간 = 1440분 기준으로 빈 구간을 회색으로 채움
// 시간 순으로 정렬 -> 빈 구간 추가 -> 실제 일정잡힌 블록 추가 - 마지막 빈 구간 추가 - 최종적으로 파이차트에 넣을수있는 SLICE 반환
const blocksToSlices = (blocks: Block[]): Slice[] => {
  const DAY = 1440;
  if (!blocks || !blocks.length) return [{ value: DAY, color: "#EEEEEE" }];
  const sorted = [...blocks].sort((a, b) => a.start - b.start);
  const slices: Slice[] = [];
  let cursor = 0;
  for (const b of sorted) {
    const s = Math.max(0, Math.min(DAY, b.start));
    const e = Math.max(0, Math.min(DAY, b.end));
    if (e <= s) continue;
    if (s > cursor) slices.push({ value: s - cursor, color: "#EEEEEE" });
    slices.push({ value: e - s, color: b.color });
    cursor = e;
  }
  if (cursor < DAY) slices.push({ value: DAY - cursor, color: "#EEEEEE" });
  return slices;
};

//화면 이동 관련
export default function NewIndex() {
  const router = useRouter();
  const today = fmt(new Date()); //현재 시각 기준으로 Date 생성 및 YYYY-MM-DD로 반환해
  const [selectedDate, setSelectedDate] = useState<string>(today); //today에 저장, 초기값은 오늘 날짜
  const [calendarOpen, setCalendarOpen] = useState(false); // 달력 모달 보이기/숨기기

  // 선택된 날짜에 해당하는 일정 데이터를 가져와서 Slice형태로 반환한 뒤 캐싱함
  const pieSlices: Slice[] = useMemo(() => {
    const blocks = mockByDate[selectedDate] || [];
    return blocksToSlices(blocks);
  }, [selectedDate]);

  // 스와이프 관련 함수들
  const onSwipeLeft = () => setSelectedDate((d) => addDays(d, +1)); // 내일
  const onSwipeRight = () => setSelectedDate((d) => addDays(d, -1)); // 어제

  // 좌우로 밀면 날짜 변경
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 16 && Math.abs(g.dy) < 12,
      onPanResponderRelease: (_, g) => { //g.dx가 가로이동, g.dy가 세로이동, 각각 16이상이면 인식, 12이상이면 무시
        if (g.dx <= -30) onSwipeLeft();
        else if (g.dx >= 30) onSwipeRight();
      },
    })
  ).current;

  const openPurpose = () => {
    // 파이차트 누르면 purpose 화면으로 이동(날짜 따라감)
    router.push({ pathname: "/purpose" as any, params: { date: selectedDate } });
  };

  return (
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

      {/* 중앙 원형 파이차트 (누르면 해당날짜 purpose, 좌우 스와이프로 날짜변경) */}
      <View style={styles.chartWrap} {...panResponder.panHandlers}>
        <TouchableOpacity activeOpacity={0.9} onPress={openPurpose} style={styles.chartTouch}>
          <PieChart
            widthAndHeight={SCREEN_WIDTH * 0.64}
            series={pieSlices} // 값과 색상이 포함된 객체 배열을 직접 전달
          />
        </TouchableOpacity>
        <Text style={styles.chartHint}>차트를 탭하면 할일 목록으로 이동합니다</Text>
      </View>

      {/* 하단 미정영역 */}
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
              theme={{
                todayTextColor: "#111827",
                arrowColor: "#111827",
                monthTextColor: "#111827",
              }}
              style={{ alignSelf: "stretch" }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ---------- 스타일 ----------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "white" },

  // 상단
  header: { paddingTop: "15%", paddingHorizontal: 16, paddingBottom: 6, alignItems: "center"},
  dateText: { fontSize: 18, fontWeight: "700", color: "#111827", alignItems: "center" },
  headerButtons: { flexDirection: "row", gap: 8, marginTop: 8 },
  headerBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
  },
  headerBtnText: { fontSize: 13, fontWeight: "600", color: "#111827" },

  // 차트
  chartWrap: { alignItems: "center", paddingVertical: 16 },
  chartTouch: { paddingVertical: 8, paddingHorizontal: 8, borderRadius: 12 },
  chartHint: { marginTop: 8, fontSize: 12, color: "#6B7280" },

  // 카드 placeholder
  cardsArea: { paddingHorizontal: 16, paddingVertical: 12 },
  placeholderCard: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderStyle: "dashed",
    borderRadius: 12,
    paddingVertical: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: { color: "#9CA3AF", fontSize: 14 },

  // 모달
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