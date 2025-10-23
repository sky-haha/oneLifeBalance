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

//
const TYPES = ['휴식', '가족', '개인', '자기개발', '이동', '식사'];
const ACTIONS = ['수면', '노동', '수업', '운동', '오락', '기타'];

// 색상 팔레트
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

//그래프 영역 크기 상수 값 증가
const GRAPH_SIZE = 250;

// 날짜 차이 계산
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
  return result.trim() || "0분"; // 빈 문자열일 경우 "0분" 반환
};

// 원형 그래프의 한 조각(Path)을 그리는 SVG 헬퍼 함수
const createPieSlicePath = (
  cx: number, cy: number, radius: number, startAngle: number, endAngle: number
): string => {
   // 각도를 라디안으로 변환 (SVG arc는 x축 양의 방향이 0도)
  const startRad = (startAngle - 90) * Math.PI / 180;
  const endRad = (endAngle - 90) * Math.PI / 180;

  // 시작점과 끝점 좌표 계산
  const start = {
    x: cx + radius * Math.cos(startRad),
    y: cy + radius * Math.sin(startRad)
  };
  const end = {
    x: cx + radius * Math.cos(endRad),
    y: cy + radius * Math.sin(endRad)
  };
  // 호가 180도를 초과하는지 여부 (SVG arc 파라미터)
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

// 설정 값 타입 정의 변경
interface PlaygroundSettings {
  showGraph: boolean;
  showAvgTime: boolean;
  graphCategory: 'type' | 'action' | null; // 그래프 기준: 'type', 'action', 또는 선택 안 함
  avgTimeItems: string[]; // 평균 시간 계산에 사용될 TYPES + ACTIONS
  dateRange: { start?: string; end?: string };
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isVisible,
  onClose,
  onSave,
  initialSettings,
}) => {
  // 모달 내부 상태 관리
  const [showGraph, setShowGraph] = useState(initialSettings.showGraph);
  const [showAvgTime, setShowAvgTime] = useState(initialSettings.showAvgTime);
  // graphTypes, graphActions 대신 graphCategory 상태 추가
  const [graphCategory, setGraphCategory] = useState<'type' | 'action' | null>(initialSettings.graphCategory);
  const [avgTimeItems, setAvgTimeItems] = useState<string[]>(initialSettings.avgTimeItems);
  const [dateRange, setDateRange] = useState(initialSettings.dateRange);

  const [isCalendarVisible, setIsCalendarVisible] = useState(false);
  const [selectingStartDate, setSelectingStartDate] = useState(true);

  // 토글 버튼 핸들러
  const toggleAvgTimeItem = useCallback(
    (item: string) => {
      setAvgTimeItems((prevList: string[]) => // 타입 명시
        prevList.includes(item)
          ? prevList.filter((i: string) => i !== item) // 타입 명시
          : [...prevList, item]
      );
    },
    []
  );

   // 그래프 카테고리 선택 핸들러
  const selectGraphCategory = (category: 'type' | 'action') => {
    // 이미 선택된 것을 다시 누르면 선택 해제
    setGraphCategory(prev => prev === category ? null : category);
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
        setIsCalendarVisible(false); // 날짜 범위 선택 완료 후 캘린더 닫기
        setSelectingStartDate(true);
      } else {
        alert('최소 7일 이상의 기간을 선택해주세요.');
      }
    }
  };

  // 저장 버튼 핸들러
  const handleSave = () => {
    // graphCategory 저장
    onSave({ showGraph, showAvgTime, graphCategory, avgTimeItems, dateRange });
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

            {/* 그래프평균 시간 토글 */}
            <View style={styles.modalSection}>
              <View style={styles.modalToggleRow}>
                <Text style={styles.modalLabel}>시간 소비 그래프 표시</Text>
                {/* onValueChange 핸들러 수정 */}
                <Switch
                  value={showGraph}
                  onValueChange={(newValue) => {
                    setShowGraph(newValue);
                    if (newValue) {
                      setShowAvgTime(false); // 그래프 켜면 평균 시간 끄기
                    } else {
                      setGraphCategory(null); // 그래프 끄면 카테고리 선택 해제
                    }
                  }}
                  trackColor={{ false: C.border, true: C.primary }}
                  thumbColor={C.background}
                />
              </View>
              <View style={styles.modalToggleRow}>
                <Text style={styles.modalLabel}>평균 소비 시간 표시</Text>
                 {/* onValueChange 핸들러 수정 */}
                <Switch
                  value={showAvgTime}
                   onValueChange={(newValue) => {
                       setShowAvgTime(newValue);
                       if (newValue) { //  평균 시간 켜면 그래프 끄기
                          setShowGraph(false);
                          setGraphCategory(null); //  그래프 카테고리 해제
                       } else {
                           setAvgTimeItems([]); //  평균 시간 끄면 선택 항목 초기화
                       }
                   }}
                  trackColor={{ false: C.border, true: C.primary }}
                  thumbColor={C.background}
                />
              </View>
            </View>

            {/* 그래프 설정 */}
            {showGraph && (
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>그래프 기준 선택</Text>
                {/*  단일 선택 토글 버튼으로 변경 */}
                <View style={styles.toggleContainer}>
                  <TouchableOpacity
                    style={[
                      styles.toggleButton,
                      graphCategory === 'type' ? styles.toggleButtonActive : styles.toggleButtonInactive
                    ]}
                    onPress={() => selectGraphCategory('type')}
                  >
                    <Text style={graphCategory === 'type' ? styles.toggleTextActive : styles.toggleTextInactive}>할 일 유형 기준</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.toggleButton,
                       graphCategory === 'action' ? styles.toggleButtonActive : styles.toggleButtonInactive
                    ]}
                    onPress={() => selectGraphCategory('action')}
                  >
                    <Text style={graphCategory === 'action' ? styles.toggleTextActive : styles.toggleTextInactive}>행동 유형 기준</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/*평균 시간 설정  */}
            {showAvgTime && (
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>평균 시간 계산 항목</Text>
                 <Text style={styles.modalSubtitle}>할 일 유형</Text>
                 <View style={styles.toggleContainer}>
                   {TYPES.map(type => (
                     <TouchableOpacity
                       key={`avg-${type}`} // 키 중복 방지
                       style={[styles.toggleButton, avgTimeItems.includes(type) ? styles.toggleButtonActive : styles.toggleButtonInactive]}
                       //  toggleAvgTimeItem 사용
                       onPress={() => toggleAvgTimeItem(type)}
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
                       //  toggleAvgTimeItem 사용
                       onPress={() => toggleAvgTimeItem(action)}
                     >
                       <Text style={avgTimeItems.includes(action) ? styles.toggleTextActive : styles.toggleTextInactive}>{action}</Text>
                     </TouchableOpacity>
                   ))}
                 </View>
              </View>
            )}

            {/*날짜 설정 */}
            <View style={styles.modalSection}>
              <Text style={styles.modalSectionTitle}>날짜 설정 (최소 7일)</Text>
              <TouchableOpacity style={styles.datePickerButton} onPress={() => setIsCalendarVisible(true)}>
                <Text style={styles.datePickerText}>{dateRangeText}</Text>
              </TouchableOpacity>
            </View>

            {/* 저장 / 취소 버튼*/}
            <View style={styles.modalFooter}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={onClose}>
                <Text style={styles.cancelButtonText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.saveButton]} onPress={handleSave}>
                <Text style={styles.saveButtonText}>저장</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/*캘린더 모달 */}
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


// 메인 화면
export default function PlaygroundScreen() {
  const [settings, setSettings] = useState<PlaygroundSettings>({
    showGraph: true,
    showAvgTime: false, 
    graphCategory: 'type', 
    avgTimeItems: ['수면', '노동'], 
    dateRange: {},           
  });
  const [isModalVisible, setIsModalVisible] = useState(false); // 설정 모달 표시 여부

  // 설정 저장 핸들러
  const handleSaveSettings = (newSettings: PlaygroundSettings) => {
    setSettings(newSettings);
  };

  // 날짜 유효성 검사
  const isDateRangeValid = settings.dateRange.start && settings.dateRange.end && dayDiff(settings.dateRange.start, settings.dateRange.end) >= 7;

  // 메인 화면 임시데이터
  //  그래프 데이터 계산
  const graphData = useMemo(() => {
    //  graphCategory 확인 조건 추가
    if (!settings.showGraph || !isDateRangeValid || !settings.graphCategory) {
      return null; // 그래프 숨김 또는 기준 미선택
    }

    // 임시 데이터
    let mockData: { label: string; value: number }[] = [];
    if (settings.graphCategory === 'type') {
      // Types 기준
      mockData = [
        { label: '자기개발', value: 60 },
        { label: '노동', value: 25 },
        { label: '식사', value: 15 },
      ];
    } else if (settings.graphCategory === 'action') {
      // ctions 기준
      mockData = [
        { label: '운동', value: 40 },
        { label: '수면', value: 30 },
        { label: '오락', value: 30 },
      ];
    }

    const pieColors = ['#F97316', '#8B5CF6', '#D97706', '#10B981', '#EF4444', '#FCD34D', '#9CA3AF']; // 사용할 색상들
    const dataForLegend: { label: string; color: string; value: number }[] = [];
    const slices: React.ReactElement[] = [];
    let cumulativeAngle = -90; // 12시 방향에서 시작

    mockData.forEach((sliceData, index) => {
      if (sliceData.value <= 0) return; // 값이 0 이하면 그래프 및 범례에 포함 안 함

      const angle = (sliceData.value / 100) * 360;
      const color = pieColors[index % pieColors.length]; // 색상 순환 할당
      const path = createPieSlicePath(50, 50, 40, cumulativeAngle, cumulativeAngle + angle); // SVG viewBox 기준 (0,0) ~ (100,100)
      cumulativeAngle += angle;

      slices.push(<Path key={index} d={path} fill={color} />);
      dataForLegend.push({ ...sliceData, color }); // 범례용 데이터 저장
    });

    if (slices.length === 0) return null; // 그릴 조각이 없으면 null 반환

    return { slices, dataForLegend }; //  슬라이스와 범례 데이터 함께 반환

    //  의존성 배열에 graphCategory 추가
  }, [settings.showGraph, settings.graphCategory, settings.dateRange, isDateRangeValid]);

  // 평균 시간 데이터
  const averageTimeCards = useMemo(() => {
    if (!settings.showAvgTime || !isDateRangeValid || settings.avgTimeItems.length === 0) {
      return []; // 평균 시간 카드 숨김 또는 선택 항목 없음
    }
    // 임시 데이터
    const mockAvgTimes: { [key: string]: number } = { // 분 단위 평균
      //  모든 TYPES와 ACTIONS에 대한 목업 데이터
      '휴식': 120, '가족': 45, '개인': 30, '자기개발': 150, '이동': 20, '식사': 60,
      '수면': 420, '노동': 480, '수업': 180, '운동': 90, '오락': 75, '기타': 10
    };
    return settings.avgTimeItems
      .filter(item => mockAvgTimes[item] !== undefined) 
      .map(item => ({
        label: `평균 ${item} 시간`, //  '시간' 텍스트 추가하여 통일성
        value: formatMinutes(mockAvgTimes[item]),
        key: item, //  map key용 고유값
      }));
  }, [settings.showAvgTime, settings.avgTimeItems, settings.dateRange, isDateRangeValid]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        {/*평균 소비 시간 */}
        {settings.showAvgTime && isDateRangeValid && averageTimeCards.map((card) => ( //  key prop 사용
          <View style={styles.card} key={card.key}>
            {/*  닫기 버튼 */}
            <TouchableOpacity
              style={styles.closeButton}
              //  버튼 누르면 해당 item을 avgTimeItems 배열에서 제거하고 저장
              onPress={() => {
                const updatedItems = settings.avgTimeItems.filter(item => item !== card.key);
                setSettings(prev => ({ ...prev, avgTimeItems: updatedItems }));
              }}
            >
              <Ionicons name="close" size={16} color={C.closeButtonIcon} />
            </TouchableOpacity>
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


        {/* 시간 소비 그래프*/}
        {/*  graphData에서 slices 가져와 사용 */}
        {settings.showGraph && isDateRangeValid && graphData?.slices && (
          <View style={[styles.card, styles.graphCard]}>
            {/*  닫기 버튼 */}
            <TouchableOpacity
              style={styles.closeButton}
              //  버튼 누르면 settings의 showGraph를 false로 업데이트
              onPress={() => setSettings(prev => ({ ...prev, showGraph: false }))}
            >
              <Ionicons name="close" size={16} color={C.closeButtonIcon} />
            </TouchableOpacity>
            <View style={styles.graphContainer}>
              <Svg height="100%" width="100%" viewBox="0 0 100 100">
                {graphData.slices}
              </Svg>
            </View>
            {/*  그래프 카드 제목에 기준 표시 */}
            <Text style={[styles.cardText, { marginTop: 10 }]}>시간 소비 그래프 ({settings.graphCategory === 'type' ? '할 일 유형' : '행동 유형'} 기준)</Text>

            {/*  범례 섹션 */}
            {graphData.dataForLegend && graphData.dataForLegend.length > 0 && (
               <View style={styles.legendContainer}>
                 {graphData.dataForLegend.map((item, index) => (
                   <View key={`legend-${index}`} style={styles.legendItem}>
                     <View style={[styles.legendColorBox, { backgroundColor: item.color }]} />
                     <Text style={styles.legendText}>{item.label}</Text>
                   </View>
                 ))}
               </View>
            )}
          </View>
        )}
         {/* 그래프 비활성화 또는 미선택 시 안내 */}
         {settings.showGraph && (!isDateRangeValid || !graphData?.slices || !settings.graphCategory) && (
             <View style={[styles.card, styles.disabledCard]}>
                 <Text style={styles.placeholderText}>
                    { !isDateRangeValid ? "날짜 범위를 7일 이상 설정해주세요." : !settings.graphCategory ? "그래프 기준(유형/행동)을 설정에서 선택해주세요." : "그래프에 표시할 항목이 없습니다."}
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

      {/*설정 모달*/}
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
    paddingTop: 40, //  상단 여백 추가
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
  disabledCard: { //  비활성화 상태 카드 스타일
      opacity: 0.6,
      backgroundColor: C.inactiveToggle,
  },
  graphCard: {
    paddingVertical: 30,
  },
  closeButton: { //  메인 화면 카드에도 적용되도록 스타일 유지
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: C.closeButton, // 이전 코드에서는 C.closeButton = '#9CA3AF'
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1, // 다른 요소 위에 오도록 zIndex 설정
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
    width: GRAPH_SIZE, //  상수 사용
    height: GRAPH_SIZE, //  상수 사용
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
  // 캘린더 모달
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
  //  범례 스타일
  legendContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      marginTop: 15, // 그래프와의 간격
      paddingHorizontal: 10, // 좌우 여백
  },
  legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      marginRight: 15, // 항목 간 간격
      marginBottom: 5, // 줄 간격
  },
  legendColorBox: {
      width: 12,
      height: 12,
      borderRadius: 3,
      marginRight: 6, // 색상 박스와 텍스트 간격
  },
  legendText: {
      fontSize: 12, // 범례 텍스트 크기
      color: C.textDim, // 범례 텍스트 색상
  },
});