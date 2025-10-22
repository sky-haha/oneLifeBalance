import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Dimensions} from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg'; 

const TYPES = ['휴식', '가족', '개인', '자기개발', '이동', '식사'];
const ACTIONS = ['수면', '노동', '수업', '운동', '오락', '기타'];

const C = {
  bg: '#FFFFFF', 
  card: '#F9FAFB', 
  border: '#E5E7EB', 
  text: '#111827', 
  textDim: '#6B7280', 
  primary: '#3B82F6',
  activeToggle: '#D1FAE5', 
  activeToggleText: '#065F46',
  inactiveToggle: '#F3F4F6', 
  inactiveToggleText: '#4B5563', 
};

// 날짜 차이 계산 함수
const dayDiff = (start: string, end: string): number => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // 시작일 포함
};

// 분을 시간 문자열로 변환
const formatMinutes = (totalMinutes: number): string => {
  if (totalMinutes < 0) return "0분";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  let result = "";
  if (hours > 0) {
    result += `${hours}시간 `;
  }
  if (minutes > 0 || hours === 0) {
    result += `${minutes}분`;
  }
  return result.trim() || "0분"; // 빈 문자열일 경우 0분반환
};

const GRAPH_SIZE = 200; //그래프 영역 크기 상수

export default function PlaygroundScreen() {

  const [selectedTypes, setSelectedTypes] = useState<string[]>([]); // 선택된 할 일 유형
  const [selectedActions, setSelectedActions] = useState<string[]>([]); // 선택된 행동 유형

  // 날짜 범위 상태
  const [dateRange, setDateRange] = useState<{ start?: string; end?: string }>({});
  const [isCalendarVisible, setIsCalendarVisible] = useState(false); // 캘린더 모달 표시 여부
  const [selectingStartDate, setSelectingStartDate] = useState(true); // 시작 날짜 선택 중인지 여부

  // 활성화 조건 
  const isTypeOrActionSelected = selectedTypes.length > 0 || selectedActions.length > 0;
  // 평균 소비 시간 활성화 조건 - 행동/유형 선택시
  const isActionSelected = selectedActions.length > 0;
  const isDateRangeValid = dateRange.start && dateRange.end && dayDiff(dateRange.start, dateRange.end) >= 7;

  // 평균 소비 시간 임시 데이터
  const averageTime = useMemo(() => {
    // 활성화 조건을 isActionSelected로 변경
    if (!isActionSelected || !isDateRangeValid) {
      return "---"; // 비활성 상태 나타내기
    }
    
    // 선택된 action들의 총 시간을 날짜 수로 나눔
    const totalMinutes = selectedActions.reduce((sum, action) => {
      // 각 action별 가상 총 시간 
      if (action === '운동') return sum + 630; 
      if (action === '노동') return sum + 3150; 
      if (action === '수업') return sum + 1260;
      if (action === '수면') return sum + 3360;
      return sum;
    }, 0);
    const days = dayDiff(dateRange.start!, dateRange.end!);
    const avgMinutes = days > 0 ? Math.round(totalMinutes / days) : 0;
    return formatMinutes(avgMinutes); // X시간 Y분 형태
  }, [selectedActions, dateRange, isDateRangeValid]); 

  // 유형/행동 토글 핸들러
  const toggleSelection = (item: string, list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>) => {
    setList(prevList =>
        prevList.includes(item)
        ? prevList.filter(i => i !== item)
        : [...prevList, item]
    );
  };


  // 캘린더 날짜 선택 핸들러
  const handleDayPress = (day: DateData) => {
    const dateString = day.dateString;
    if (selectingStartDate || !dateRange.start || dateString < dateRange.start) {
      setDateRange({ start: dateString, end: undefined });
      setSelectingStartDate(false);
    } else {
      if (dayDiff(dateRange.start, dateString) >= 7) {
        setDateRange({ ...dateRange, end: dateString });
        setIsCalendarVisible(false);
        setSelectingStartDate(true);
      } else {
        alert('최소 7일 이상의 기간을 선택해주세요.');
      }
    }
  };

  // 캘린더 모달 열기 함수
  const openCalendar = () => {
    setIsCalendarVisible(true);
    setSelectingStartDate(true);
  };

  // 선택된 날짜 범위 표시 텍스트
  const dateRangeText = useMemo(() => {
    if (dateRange.start && dateRange.end) {
      return `${dateRange.start} ~ ${dateRange.end} (${dayDiff(dateRange.start, dateRange.end)}일)`;
    } else if (dateRange.start) {
      return `${dateRange.start} ~ (종료 날짜 선택)`;
    }
    return "날짜 범위를 선택하세요 (최소 7일)";
  }, [dateRange]);


  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
        {/* --- 시간 소비 그래프 --- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>시간 소비 그래프</Text>
          <View style={[styles.graphContainer]}>
             <Svg height={GRAPH_SIZE} width={GRAPH_SIZE} viewBox="0 0 100 100">
                <Circle
                    cx="50"
                    cy="50"
                    r="45" 
                    stroke={C.border} 
                    strokeWidth="5"
                    fill={isTypeOrActionSelected && isDateRangeValid ? C.primary : C.card} // 활성화 상태에 따라 채우기 색 변경
                />
             </Svg>
             {/* 안내 텍스트 */}
             {(!isTypeOrActionSelected || !isDateRangeValid) && (
                 <View style={styles.graphOverlayTextContainer}>
                     <Text style={styles.placeholderText}>
                        유형/행동 및 날짜 선택 필요
                     </Text>
                 </View>
             )}
          </View>
        </View>

        {/* --- 일 평균 소비 시간 --- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>일 평균 소비 시간</Text>
          {/* 활성화 조건을 isActionSelected*/}
          <View style={[styles.avgTimeContainer, !isActionSelected || !isDateRangeValid ? styles.disabledOverlay : {}]}>
            <Text style={styles.avgTimeText}>
              {averageTime}
            </Text>
            {/* 비활성화 텍스트 조건 */}
            {(!isActionSelected || !isDateRangeValid) && (
              <Text style={styles.placeholderTextSmall}>행동 유형 및 날짜 선택 필요</Text>
            )}
          </View>
        </View>

        {/* --- 할 일 유형 선택 --- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>할 일 유형</Text>
          <View style={styles.toggleContainer}>
            {TYPES.map(type => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.toggleButton,
                  selectedTypes.includes(type) ? styles.toggleButtonActive : styles.toggleButtonInactive,
                ]}
                onPress={() => toggleSelection(type, selectedTypes, setSelectedTypes)}
              >
                <Text style={selectedTypes.includes(type) ? styles.toggleTextActive : styles.toggleTextInactive}>
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* --- 행동 유형 선택 --- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>행동 유형</Text>
          <View style={styles.toggleContainer}>
            {ACTIONS.map(action => (
              <TouchableOpacity
                key={action}
                style={[
                  styles.toggleButton,
                  selectedActions.includes(action) ? styles.toggleButtonActive : styles.toggleButtonInactive,
                ]}
                onPress={() => toggleSelection(action, selectedActions, setSelectedActions)}
              >
                <Text style={selectedActions.includes(action) ? styles.toggleTextActive : styles.toggleTextInactive}>
                  {action}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* --- 날짜 설정 --- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>날짜 설정 (최소 7일)</Text>
          <TouchableOpacity style={styles.datePickerButton} onPress={openCalendar}>
            <Text style={styles.datePickerText}>{dateRangeText}</Text>
          </TouchableOpacity>
        </View>

        {/* --- 캘린더 모달 --- */}
        <Modal
          visible={isCalendarVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setIsCalendarVisible(false)}
        >
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setIsCalendarVisible(false)}>
            <View style={styles.modalContainer}>
              <Calendar
                onDayPress={handleDayPress}
                markingType={'period'}
                markedDates={{
                  [dateRange.start ?? '']: { startingDay: true, color: C.primary, textColor: 'white' },
                  [dateRange.end ?? '']: { endingDay: true, color: C.primary, textColor: 'white' },
                }}
                 enableSwipeMonths={true}
              />
               <Text style={styles.calendarInfoText}>
                {selectingStartDate ? '시작 날짜를 선택하세요.' : '종료 날짜를 선택하세요 (시작 날짜 포함 7일 이상).'}
               </Text>
            </View>
          </TouchableOpacity>
        </Modal>

      </ScrollView>
    </SafeAreaView>
  );
}

// 스 타일 정의
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.bg,
  },
  container: {
    flex: 1,
    padding: 15,
  },
  section: {
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: C.text,
    marginBottom: 10,
  },
  graphContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 220, // 그래프 영역 높이
    backgroundColor: C.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    position: 'relative', // 오버레이 텍스트 위함
  },
  graphOverlayTextContainer: { //그래프 위에 텍스트를 올리기 위한 컨테이너
      position: 'absolute',
      justifyContent: 'center',
      alignItems: 'center',
  },
  placeholderText: {
    color: C.textDim,
    fontSize: 14,
    textAlign: 'center',
    padding: 20, // 텍스트 영역 확보
  },
  placeholderTextSmall: {
      color: C.textDim,
      fontSize: 12,
      textAlign: 'center',
      marginTop: 4,
  },
  avgTimeContainer: {
    backgroundColor: C.card,
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
    position: 'relative',
  },
  avgTimeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: C.text,
  },
  toggleContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8, // 버튼 사이 간격
  },
  toggleButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20, // 타원형 모양
    borderWidth: 1,
  },
  toggleButtonInactive: {
    backgroundColor: C.inactiveToggle,
    borderColor: C.border,
  },
  toggleButtonActive: {
    backgroundColor: C.activeToggle,
    borderColor: C.activeToggleText, // 활성 시 테두리 색 변경
  },
  toggleTextInactive: {
    color: C.inactiveToggleText,
    fontSize: 14,
  },
  toggleTextActive: {
    color: C.activeToggleText,
    fontSize: 14,
    fontWeight: '500',
  },
  disabledOverlay: { // 비활성화 시 흐리게 보이도록
    opacity: 0.5,
  },
  datePickerButton: {
    backgroundColor: C.card,
    borderRadius: 8,
    padding: 15,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
  },
  datePickerText: {
    color: C.text,
    fontSize: 16,
  },
  modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
  },
  modalContainer: {
      backgroundColor: 'white',
      borderRadius: 10,
      padding: 15,
      width: '100%',
      alignItems: 'center',
  },
  calendarInfoText: {
      marginTop: 10,
      fontSize: 14,
      color: C.textDim,
  },
});