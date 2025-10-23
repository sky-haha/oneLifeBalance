import { Ionicons } from '@expo/vector-icons';
import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Modal,
  Switch,
} from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import Svg, { Path, Circle } from 'react-native-svg'; 

const TYPES = ['휴식', '가족', '개인', '자기개발', '이동', '식사'];
const ACTIONS = ['수면', '노동', '수업', '운동', '오락', '기타'];

const C = {
  background: '#FFFFFF',     
  card: '#F9FAFB',          
  text: '#111827',           
  textDim: '#6B7280',     
  primary: '#3B82F6',     
  border: '#E5E7EB',     
  closeButton: '#9CA3AF',    
  closeButtonIcon: '#FFFFFF', 
  modalBackground: '#FFFFFF',  
  modalText: '#111827',       
  modalBorder: '#D1D5DB',      
  activeToggle: '#D1FAE5',  
  activeToggleText: '#065F46', 
  inactiveToggle: '#F3F4F6',   
  inactiveToggleText: '#4B5563',
};

// 그래프 영역 크기 
const GRAPH_SIZE = 250;
// 날짜 차이 계산 함수
const dayDiff = (start?: string, end?: string): number => {
  if (!start || !end) return 0;
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // 시작일 포함
};

// 분을 시간 문자열로 변환하는 함수 (예: 90 -> "1시간 30분")
const formatMinutes = (totalMinutes: number): string => {
  if (totalMinutes <= 0) return "0분";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  let result = "";
  if (hours > 0) {
    result += `${hours}시간 `;
  }
  if (minutes > 0) {
    result += `${minutes}분`;
  }
  return result.trim();
};

// 원형 그래프의 한 조각(Path)을 그리는 SVG
const createPieSlicePath = (
  cx: number, cy: number, radius: number, startAngle: number, endAngle: number
): string => {
   // 각도를 라디안으로 변환 (SVG arc는 x축 양의 방향이 0도)
  const startRad = (startAngle - 90) * Math.PI / 180;
  const endRad = (endAngle - 90) * Math.PI / 180;

  const start = {
    x: cx + radius * Math.cos(startRad),
    y: cy + radius * Math.sin(startRad)
  };
  const end = {
    x: cx + radius * Math.cos(endRad),
    y: cy + radius * Math.sin(endRad)
  };
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  // 호 그리기: M(시작점 이동) A(타원 호 그리기) L(중심으로 선) Z(닫기)
  const d = [
    "M", start.x, start.y,
    "A", radius, radius, 0, largeArcFlag, 1, end.x, end.y,
    "L", cx, cy,
    "Z"
  ].join(" ");
  return d;
};

// 설정 모달
interface SettingsModalProps {
  isVisible: boolean;
  onClose: () => void;
  onSave: (settings: PlaygroundSettings) => void;
  initialSettings: PlaygroundSettings;
}

//설정 값들의 타입을 정의
interface PlaygroundSettings {
  showGraph: boolean;
  showAvgTime: boolean;
  graphTypes: string[];
  graphActions: string[];
  avgTimeItems: string[];
  dateRange: { start?: string; end?: string };
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isVisible,
  onClose,
  onSave,
  initialSettings,
}) => {
  // 모달 내부 상태
  const [showGraph, setShowGraph] = useState(initialSettings.showGraph);
  const [showAvgTime, setShowAvgTime] = useState(initialSettings.showAvgTime);
  const [graphTypes, setGraphTypes] = useState<string[]>(initialSettings.graphTypes);
  const [graphActions, setGraphActions] = useState<string[]>(initialSettings.graphActions);
  const [avgTimeItems, setAvgTimeItems] = useState<string[]>(initialSettings.avgTimeItems);
  const [dateRange, setDateRange] = useState(initialSettings.dateRange);

  const [isCalendarVisible, setIsCalendarVisible] = useState(false);
  const [selectingStartDate, setSelectingStartDate] = useState(true);

// 토글 버튼 핸들러 (여러 상태를 업데이트하기 위해 useCallback 사용)
  const toggleSelection = useCallback(
    (item: string, listType: 'graphTypes' | 'graphActions' | 'avgTimeItems') => {
      const listMap = {
        graphTypes: graphTypes, // 상태 값
        graphActions: graphActions, // 상태 값
        avgTimeItems: avgTimeItems, // 상태 값
      };
      const setListMap = {
        graphTypes: setGraphTypes, // 설정 함수
        graphActions: setGraphActions, // 설정 함수
        avgTimeItems: setAvgTimeItems, // 설정 함수
      };

      const currentList = listMap[listType]; // 현재 상태 배열 가져오기
      const setList = setListMap[listType];   // 해당 상태 설정 함수 가져오기

      setList((prevList: string[]) =>
        prevList.includes(item)
          ? prevList.filter((i: string) => i !== item)
          : [...prevList, item]
      );
    },
    [graphTypes, graphActions, avgTimeItems] // 의존성 배열 유지
  );

  // 캘린더 날짜 선택 핸들러
  const handleDayPress = (day: DateData) => {
    const dateString = day.dateString;
    if (selectingStartDate || !dateRange.start || dateString < dateRange.start) {
      setDateRange({ start: dateString, end: undefined });
      setSelectingStartDate(false);
    } else {
      if (dayDiff(dateRange.start, dateString) >= 7) {
        setDateRange({ ...dateRange, end: dateString });
        setIsCalendarVisible(false); // 날짜 범위 선택 완료 후 캘린더 닫기
        setSelectingStartDate(true);
      } else {
        alert('최소 7일 이상의 기간을 선택해주세요.');
      }
    }
  };

  // 저장 버튼 핸들러
  const handleSave = () => {
    onSave({ showGraph, showAvgTime, graphTypes, graphActions, avgTimeItems, dateRange });
    onClose();
  };

  // 날짜 범위 표시 텍스트
  const dateRangeText = useMemo(() => {
    if (dateRange.start && dateRange.end) {
      return `${dateRange.start} ~ ${dateRange.end} (${dayDiff(dateRange.start, dateRange.end)}일)`;
    } else if (dateRange.start) {
      return `${dateRange.start} ~ (종료 날짜 선택)`;
    }
    return "날짜 범위를 선택하세요 (최소 7일)";
  }, [dateRange]);

  return (
    <Modal
      visible={isVisible}
      transparent={true}
      animationType="slide" // 슬라이드 효과
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalContainer}>
          <ScrollView>
            <Text style={styles.modalTitle}>표시 설정</Text>

            {/* 그래프 / 평균 시간 토글 */}
            <View style={styles.modalSection}>
              <View style={styles.modalToggleRow}>
                <Text style={styles.modalLabel}>시간 소비 그래프 표시</Text>
                <Switch value={showGraph} onValueChange={setShowGraph} trackColor={{ false: C.border, true: C.primary }} thumbColor={C.background} />
              </View>
              <View style={styles.modalToggleRow}>
                <Text style={styles.modalLabel}>평균 소비 시간 표시</Text>
                <Switch value={showAvgTime} onValueChange={setShowAvgTime} trackColor={{ false: C.border, true: C.primary }} thumbColor={C.background} />
              </View>
            </View>

            {/*  그래프 설정 */}
            {showGraph && (
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>그래프 포함 항목</Text>
                <Text style={styles.modalSubtitle}>할 일 유형</Text>
                <View style={styles.toggleContainer}>
                  {TYPES.map(type => (
                    <TouchableOpacity
                      key={type}
                      style={[styles.toggleButton, graphTypes.includes(type) ? styles.toggleButtonActive : styles.toggleButtonInactive]}
                      onPress={() => toggleSelection(type, 'graphTypes')}
                    >
                      <Text style={graphTypes.includes(type) ? styles.toggleTextActive : styles.toggleTextInactive}>{type}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={[styles.modalSubtitle, { marginTop: 10 }]}>행동 유형</Text>
                <View style={styles.toggleContainer}>
                  {ACTIONS.map(action => (
                    <TouchableOpacity
                      key={action}
                      style={[styles.toggleButton, graphActions.includes(action) ? styles.toggleButtonActive : styles.toggleButtonInactive]}
                      onPress={() => toggleSelection(action, 'graphActions')}
                    >
                      <Text style={graphActions.includes(action) ? styles.toggleTextActive : styles.toggleTextInactive}>{action}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/*평균 시간 설정 */}
            {showAvgTime && (
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>평균 시간 계산 항목</Text>
                 <Text style={styles.modalSubtitle}>할 일 유형</Text>
                 <View style={styles.toggleContainer}>
                   {TYPES.map(type => (
                     <TouchableOpacity
                       key={`avg-${type}`} // 키 중복 방지
                       style={[styles.toggleButton, avgTimeItems.includes(type) ? styles.toggleButtonActive : styles.toggleButtonInactive]}
                       onPress={() => toggleSelection(type, 'avgTimeItems')}
                     >
                       <Text style={avgTimeItems.includes(type) ? styles.toggleTextActive : styles.toggleTextInactive}>{type}</Text>
                     </TouchableOpacity>
                   ))}
                 </View>
                <Text style={[styles.modalSubtitle, { marginTop: 10 }]}>행동 유형</Text>
                 <View style={styles.toggleContainer}>
                   {ACTIONS.map(action => (
                     <TouchableOpacity
                       key={`avg-${action}`} // 키 중복 방지
                       style={[styles.toggleButton, avgTimeItems.includes(action) ? styles.toggleButtonActive : styles.toggleButtonInactive]}
                       onPress={() => toggleSelection(action, 'avgTimeItems')}
                     >
                       <Text style={avgTimeItems.includes(action) ? styles.toggleTextActive : styles.toggleTextInactive}>{action}</Text>
                     </TouchableOpacity>
                   ))}
                 </View>
              </View>
            )}

            {/*  날짜 설정 */}
            <View style={styles.modalSection}>
              <Text style={styles.modalSectionTitle}>날짜 설정 (최소 7일)</Text>
              <TouchableOpacity style={styles.datePickerButton} onPress={() => setIsCalendarVisible(true)}>
                <Text style={styles.datePickerText}>{dateRangeText}</Text>
              </TouchableOpacity>
            </View>

            {/*저장 / 취소 버튼*/}
            <View style={styles.modalFooter}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={onClose}>
                <Text style={styles.cancelButtonText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.saveButton]} onPress={handleSave}>
                <Text style={styles.saveButtonText}>저장</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* 캘린더 모달  */}
          <Modal
            visible={isCalendarVisible}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setIsCalendarVisible(false)}
          >
            <TouchableOpacity style={styles.calendarBackdrop} onPress={() => setIsCalendarVisible(false)}>
              <View style={styles.calendarContainer}>
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
        </View>
      </View>
    </Modal>
  );
};


// 메인 화면 컴포넌트
export default function PlaygroundScreen() {
  // 메인 화면 상태 관리 
  const [settings, setSettings] = useState<PlaygroundSettings>({
    showGraph: true, 
    showAvgTime: true, 
    graphTypes: ['자기개발', '노동'], 
    graphActions: ['운동'],       
    avgTimeItems: ['수면', '노동'], 
    dateRange: {},         
  });
  const [isModalVisible, setIsModalVisible] = useState(false); // 설정 모달 표시 여부

  // 설정 저장 핸들러
  const handleSaveSettings = (newSettings: PlaygroundSettings) => {
    setSettings(newSettings);
  };

  // 날짜 유효성
  const isDateRangeValid = settings.dateRange.start && settings.dateRange.end && dayDiff(settings.dateRange.start, settings.dateRange.end) >= 7;

  // 메인화면 임시데이터
  // 그래프 데이터
  const pieSlices = useMemo(() => {
    if (!settings.showGraph || !isDateRangeValid || (settings.graphTypes.length === 0 && settings.graphActions.length === 0)) {
      return null;
    }
    // 임시 데이터
    const mockPieData = [ { value: 60, color: '#F97316' }, { value: 40, color: '#8B5CF6' } ];
    let cumulativeAngle = -90;
    return mockPieData.map((slice, index) => {
      const angle = (slice.value / 100) * 360;
      const path = createPieSlicePath(50, 50, 40, cumulativeAngle, cumulativeAngle + angle);
      cumulativeAngle += angle;
      return <Path key={index} d={path} fill={slice.color} />;
    });
  }, [settings.showGraph, settings.graphTypes, settings.graphActions, settings.dateRange, isDateRangeValid]);

  // 평균 시간 데이터
  const averageTimeCards = useMemo(() => {
    if (!settings.showAvgTime || !isDateRangeValid || settings.avgTimeItems.length === 0) {
      return []; 
    }
    // 임시 데이터
    const mockAvgTimes: { [key: string]: number } = { 
      '수면': 420, '노동': 480, '운동': 90, '식사': 60
    };
    return settings.avgTimeItems
      .filter(item => mockAvgTimes[item] !== undefined) 
      .map(item => ({
        label: `평균 ${item}시간`,
        value: formatMinutes(mockAvgTimes[item]),
      }));
  }, [settings.showAvgTime, settings.avgTimeItems, settings.dateRange, isDateRangeValid]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* --- 평균 소비 시간 카드 --- */}
        {settings.showAvgTime && isDateRangeValid && averageTimeCards.map((card, index) => (
          <View style={styles.card} key={`avg-${index}`}>
             {/*설정은 모달에서 */}
            <Text style={styles.cardText}>
              {card.label}: <Text style={styles.boldText}>{card.value}</Text>
            </Text>
          </View>
        ))}
         {/* 평균 시간 비활성화 또는 미선택 시 안내 */}
         {settings.showAvgTime && (!isDateRangeValid || averageTimeCards.length === 0) && (
            <View style={[styles.card, styles.disabledCard]}>
                <Text style={styles.placeholderText}>
                    { !isDateRangeValid ? "날짜 범위를 7일 이상 설정해주세요." : "표시할 평균 시간 항목을 설정에서 선택해주세요."}
                </Text>
            </View>
         )}


        {/* 시간 소비 그래프 카드 */}
        {settings.showGraph && isDateRangeValid && pieSlices && (
          <View style={[styles.card, styles.graphCard]}>
            {/* 닫기 버튼 제거 */}
            <View style={styles.graphContainer}>
              <Svg height="100%" width="100%" viewBox="0 0 100 100">
                {pieSlices}
              </Svg>
            </View>
            <Text style={[styles.cardText, { marginTop: 10 }]}>시간 소비 그래프</Text>
          </View>
        )}
         {/* 그래프 비활성화 또는 미선택 시 안내 */}
         {settings.showGraph && (!isDateRangeValid || !pieSlices) && (
             <View style={[styles.card, styles.disabledCard]}>
                 <Text style={styles.placeholderText}>
                    { !isDateRangeValid ? "날짜 범위를 7일 이상 설정해주세요." : "그래프에 표시할 항목을 설정에서 선택해주세요."}
                 </Text>
             </View>
         )}

      </ScrollView>

      {/* 하단 버튼 영역 */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.recommendButton}>
          <Text style={styles.recommendButtonText}>추천 고정시간 패턴</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.addButton} onPress={() => setIsModalVisible(true)}>
          <Ionicons name="add" size={32} color="white" />
        </TouchableOpacity>
      </View>

      {/* 설정 모달 */}
      <SettingsModal
        isVisible={isModalVisible}
        onClose={() => setIsModalVisible(false)}
        onSave={handleSaveSettings}
        initialSettings={settings}
      />
    </SafeAreaView>
  );
}

// 스타일 정의 
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.background,
  },
  container: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 40, // 상단 여백
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 20,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative', // 닫기 버튼 위치 기준
  },
  disabledCard: { 
      opacity: 0.6,
      backgroundColor: C.inactiveToggle,
  },
  graphCard: {
    paddingVertical: 30,
  },
  closeButton: { 
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: C.closeButton,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  cardText: {
    fontSize: 18,
    color: C.text,
    textAlign: 'center', // 텍스트 중앙 정렬
  },
  boldText: {
    fontWeight: 'bold',
  },
  graphContainer: {
    width: GRAPH_SIZE,
    height: GRAPH_SIZE,
    marginBottom: 10,
    alignItems: 'center', // SVG 가운데 정렬
    justifyContent: 'center',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15, // 패딩 조정
    paddingBottom: 25, // 하단 여백 추가
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.background, // 배경색 추가
  },
  recommendButton: {
    flex: 1,
    backgroundColor: C.primary,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginRight: 15,
  },
  recommendButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  addButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: C.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // 모달 스타일 
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)', // 반투명 배경
    justifyContent: 'flex-end', // 화면 하단에 모달 배치
  },
  modalContainer: {
    backgroundColor: C.modalBackground,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%', // 모달 최대 높이
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: C.modalText,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalSection: {
    marginBottom: 25,
    borderBottomWidth: 1,
    borderBottomColor: C.modalBorder,
    paddingBottom: 20,
  },
   modalSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: C.modalText,
    marginBottom: 15,
  },
  modalSubtitle: {
    fontSize: 16,
    fontWeight: '500',
    color: C.textDim,
    marginBottom: 10,
  },
  modalToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  modalLabel: {
    fontSize: 16,
    color: C.modalText,
  },
  toggleContainer: { // 모달 내부 토글 버튼 컨테이너
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  toggleButton: { // 모달 내부 토글 버튼
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
  },
  toggleButtonInactive: {
    backgroundColor: C.inactiveToggle,
    borderColor: C.border,
  },
  toggleButtonActive: {
    backgroundColor: C.activeToggle,
    borderColor: C.activeToggleText,
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
  datePickerButton: { // 모달 내부 날짜 버튼
    backgroundColor: C.inactiveToggle,
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
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: C.inactiveToggle,
    marginRight: 10,
  },
  cancelButtonText: {
    color: C.inactiveToggleText,
    fontSize: 16,
    fontWeight: 'bold',
  },
  saveButton: {
    backgroundColor: C.primary,
    marginLeft: 10,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // 캘린더 모달 스타일
  calendarBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  calendarContainer: {
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
  placeholderText: { // 일반 Placeholder 텍스트
    color: C.textDim,
    fontSize: 14,
    textAlign: 'center',
  },
  graphOverlayTextContainer: { // 그래프 위 텍스트 컨테이너
      position: 'absolute',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 10,
      borderRadius: 5,
  },
});