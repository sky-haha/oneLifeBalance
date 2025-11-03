import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, LogBox, Modal, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import Svg, { Path } from 'react-native-svg';

// 파베
import { onAuthStateChanged } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from './firebaseConfig';

// gptClient에서 가져옴
import { getPersonalizedFeedback } from './gptClient';

LogBox.ignoreLogs(['Text strings must be rendered within a <Text> component']);
LogBox.ignoreAllLogs(true);
// 할일유형/행동유형 카테고리
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
  danger: '#EF4444',
};

//그래프 영역 크기 상수 값 증가
const GRAPH_SIZE = 250;

// 공통 색상 팔레트
const PIE_COLORS = ['#F97316', '#8B5CF6', '#D97706', '#10B981', '#EF4444', '#FCD34D', '#9CA3AF'];

// 날짜 차이 계산
const dayDiff = (start?: string, end?: string): number => {
  if (!start || !end) return 0;
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // 시작일 포함
};

// 이어먼스데이 날짜 리스트 생성
const dateList = (startISO: string, endISO: string): string[] => {
  const out: string[] = [];
  const d = new Date(startISO);
  const end = new Date(endISO);
  while (d <= end) {
    out.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() + 1);
  }
  return out;
};

// 분을 사람이 읽는 문자열로 변환
const formatMinutes = (totalMinutes: number): string => {
  if (totalMinutes <= 0) return '0분';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  let result = '';
  if (hours > 0) result += `${hours}시간 `;
  if (minutes > 0) result += `${minutes}분`;
  return result.trim() || '0분';
};

// 원형 그래프 생성
const createPieSlicePath = (cx: number, cy: number, radius: number, startAngle: number, endAngle: number): string => {
  const startRad = (startAngle - 90) * Math.PI / 180;
  const endRad = (endAngle - 90) * Math.PI / 180;
  const start = { x: cx + radius * Math.cos(startRad), y: cy + radius * Math.sin(startRad) };
  const end = { x: cx + radius * Math.cos(endRad), y: cy + radius * Math.sin(endRad) };
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  const d = [
    'M', start.x, start.y,
    'A', radius, radius, 0, largeArcFlag, 1, end.x, end.y,
    'L', cx, cy,
    'Z'
  ].join(' ');
  return d;
};

// 설정 모달
interface SettingsModalProps {
  isVisible: boolean;
  onClose: () => void;
  onSave: (settings: PlaygroundSettings) => void;
  initialSettings: PlaygroundSettings;
}

// 설정 값 타입
interface PlaygroundSettings {
  showGraph: boolean;
  showAvgTime: boolean;
  graphCategory: 'type' | 'action' | null;
  avgTimeItems: string[];
  dateRange: { start?: string; end?: string };
}

// timeTable 데이터 타입
type TimeBlock = {
  startTime: number;
  endTime: number;  
  type?: string;
  action?: string;
  isGoal?: boolean;
  fix?: boolean;
};

//  저장된 graphData 도큐먼트 타입
type GraphDoc = {
  id: string;
  graphType: 'circularGraph' | 'averageGraph' | 'aiFeedback';
  dateStart: string;
  dateEnd: string;
  graphCategory: 'type' | 'action' | 'feedback';
  graphSubCategory?: string | null;
  feedbackText?: string;
};

// 현재 로그인 UID 얻기 유틸
const useCurrentUid = () => {
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
    return () => unsub();
  }, []);
  return uid;
};

// 그래프 저장 모달
const SettingsModal: React.FC<SettingsModalProps> = ({
  isVisible,
  onClose,
  onSave,
  initialSettings,
}) => {
  const [showGraph, setShowGraph] = useState(initialSettings.showGraph);
  const [showAvgTime, setShowAvgTime] = useState(initialSettings.showAvgTime);
  const [graphCategory, setGraphCategory] = useState<'type' | 'action' | null>(initialSettings.graphCategory);
  const [avgTimeItems, setAvgTimeItems] = useState<string[]>(initialSettings.avgTimeItems);
  const [dateRange, setDateRange] = useState(initialSettings.dateRange);

  const [isCalendarVisible, setIsCalendarVisible] = useState(false);
  const [selectingStartDate, setSelectingStartDate] = useState(true);

  useEffect(() => {
    if (isVisible) {
      setShowGraph(initialSettings.showGraph);
      setShowAvgTime(initialSettings.showAvgTime);
      setGraphCategory(initialSettings.graphCategory);
      setAvgTimeItems(initialSettings.avgTimeItems);
      setDateRange(initialSettings.dateRange);
      setSelectingStartDate(true);
      setIsCalendarVisible(false);
    }
  }, [isVisible, initialSettings]);

  const toggleAvgTimeItem = useCallback(
    (item: string) => {
      setAvgTimeItems((prevList: string[]) =>
        prevList.includes(item) ? prevList.filter((i: string) => i !== item) : [...prevList, item]
      );
    },
    []
  );

  const selectGraphCategory = (category: 'type' | 'action') => {
    setGraphCategory(prev => prev === category ? null : category);
  };

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

  const handleSave = () => {
    onSave({ showGraph, showAvgTime, graphCategory, avgTimeItems, dateRange });
    onClose();
  };

  const dateRangeText = useMemo(() => {
    if (dateRange.start && dateRange.end) {
      return `${dateRange.start} ~ ${dateRange.end} (${dayDiff(dateRange.start, dateRange.end)}일)`;
    } else if (dateRange.start) {
      return `${dateRange.start} ~ (종료 날짜 선택)`;
    }
    return '날짜 범위를 선택하세요 (최소 7일)';
  }, [dateRange]);

  return (
    <Modal
      visible={isVisible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalContainer}>
          <ScrollView>
            <Text style={styles.modalTitle}>그래프 저장</Text>

            {/* 그래프/평균 토글 */}
            <View style={styles.modalSection}>
              <View style={styles.modalToggleRow}>
                <Text style={styles.modalLabel}>시간 소비 그래프 저장</Text>
                <Switch
                  value={showGraph}
                  onValueChange={(newValue) => {
                    setShowGraph(newValue);
                    if (newValue) {
                      setShowAvgTime(false);
                    } else {
                      setGraphCategory(null);
                    }
                  }}
                  trackColor={{ false: C.border, true: C.primary }}
                  thumbColor={C.background}
                />
              </View>
              <View style={styles.modalToggleRow}>
                <Text style={styles.modalLabel}>평균 소비 시간 저장</Text>
                <Switch
                  value={showAvgTime}
                  onValueChange={(newValue) => {
                    setShowAvgTime(newValue);
                    if (newValue) {
                      setShowGraph(false);
                      setGraphCategory(null);
                    } else {
                      setAvgTimeItems([]);
                    }
                  }}
                  trackColor={{ false: C.border, true: C.primary }}
                  thumbColor={C.background}
                />
              </View>
            </View>

            {/* 그래프 기준 */}
            {showGraph && (
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>그래프 기준 선택</Text>
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

            {/* 평균 항목 선택 */}
            {showAvgTime && (
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>평균 시간 계산 항목</Text>
                <Text style={styles.modalSubtitle}>할 일 유형</Text>
                <View style={styles.toggleContainer}>
                  {TYPES.map(type => (
                    <TouchableOpacity
                      key={`avg-${type}`}
                      style={[styles.toggleButton, avgTimeItems.includes(type) ? styles.toggleButtonActive : styles.toggleButtonInactive]}
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
                      key={`avg-${action}`}
                      style={[styles.toggleButton, avgTimeItems.includes(action) ? styles.toggleButtonActive : styles.toggleButtonInactive]}
                      onPress={() => toggleAvgTimeItem(action)}
                    >
                      <Text style={avgTimeItems.includes(action) ? styles.toggleTextActive : styles.toggleTextInactive}>{action}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* 날짜 설정 */}
            <View style={styles.modalSection}>
              <Text style={styles.modalSectionTitle}>날짜 설정 (최소 7일)</Text>
              <TouchableOpacity style={styles.datePickerButton} onPress={() => setIsCalendarVisible(true)}>
                <Text style={styles.datePickerText}>{dateRangeText}</Text>
              </TouchableOpacity>
            </View>

            {/* 저장/취소 */}
            <View style={styles.modalFooter}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={onClose}>
                <Text style={styles.cancelButtonText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.saveButton]} onPress={handleSave}>
                <Text style={styles.saveButtonText}>저장</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* 캘린더 모달 */}
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

// AI 피드백 모달
interface FeedbackModalProps {
  isVisible: boolean;
  onClose: () => void;
  uid: string; 
  fetchBlocksOfDate: (userId: string, dateISO: string) => Promise<TimeBlock[]>; 
}

const FeedbackModal: React.FC<FeedbackModalProps> = ({
  isVisible,
  onClose,
  uid,
  fetchBlocksOfDate,
}) => {
  const [modelType, setModelType] = useState<'korean' | 'nordic'>('korean');
  const [dateRange, setDateRange] = useState<{ start?: string; end?: string }>({});
  const [isCalendarVisible, setIsCalendarVisible] = useState(false);
  const [selectingStartDate, setSelectingStartDate] = useState(true);
  const [isLoading, setIsLoading] = useState(false); 

  // 모달이 닫힐 때 상태 초기화
  const handleClose = () => {
    onClose();
    setDateRange({});
    setModelType('korean');
    setIsLoading(false);
    setSelectingStartDate(true);
  };

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
        Alert.alert('기간 오류', '최소 7일 이상의 기간을 선택해주세요.');
      }
    }
  };

  // 피드백 생성
  const handleGenerateFeedback = async () => {
    if (!dateRange.start || !dateRange.end) {
      Alert.alert('날짜 선택 필요', '피드백을 받을 날짜 범위를 선택해주세요.');
      return;
    }
    if (dayDiff(dateRange.start, dateRange.end) < 7) {
      Alert.alert('기간 오류', '최소 7일 이상의 기간을 선택해야 합니다.');
      return;
    }

    setIsLoading(true);
    try {
      const dates = dateList(dateRange.start, dateRange.end);
      const blocksNested = await Promise.all(dates.map(d => fetchBlocksOfDate(uid, d)));
      const blocks = blocksNested.flat();

      let totalWorkMinutes = 0;
      let totalLeisureMinutes = 0;

      // 분류 기준에 따라 시간 집계
      for (const b of blocks) {
        const duration = Math.max(0, b.endTime - b.startTime);
        
        // 일 관련 시간 = 노동(A), 수업(A), 자기개발(T), 이동(T)
        if (b.action === '노동' || b.action === '수업' || b.type === '자기개발' || b.type === '이동') {
          totalWorkMinutes += duration;
        }
        
        // 여가 시간 = 오락(A), 운동(A), 휴식(T)
        if (b.action === '오락' || b.action === '운동' || b.type === '휴식') {
          totalLeisureMinutes += duration;
        }
      }

      const avgWorkMinutes = totalWorkMinutes / dates.length;
      const avgLeisureMinutes = totalLeisureMinutes / dates.length;

      // gptClient 함수 호출
      const feedbackText = await getPersonalizedFeedback({
        avgWorkMinutes,
        avgLeisureMinutes,
        totalDays: dates.length,
        modelType: modelType,
      });

      //  서버에 피드백 결과 저장
      const graphDataCol = collection(doc(collection(db, 'User'), uid), 'graphData');
      await addDoc(graphDataCol, {
        dateStart: dateRange.start!,
        dateEnd: dateRange.end!,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        graphType: 'aiFeedback',
        graphCategory: 'feedback',
        graphSubCategory: modelType, // 현실적 모델 / 이상적 모델
        feedbackText: feedbackText, // GPT가 생성한 텍스트
      });

      setIsLoading(false);
      handleClose(); // 성공 후 모달 닫기

    } catch (e: any) {
      console.warn(e);
      setIsLoading(false);
      Alert.alert('오류', e?.message ?? '피드백 생성 중 오류가 발생했습니다.');
    }
  };

  const dateRangeText = useMemo(() => {
    if (dateRange.start && dateRange.end) {
      return `${dateRange.start} ~ ${dateRange.end} (${dayDiff(dateRange.start, dateRange.end)}일)`;
    } else if (dateRange.start) {
      return `${dateRange.start} ~ (종료 날짜 선택)`;
    }
    return '날짜 범위를 선택하세요 (최소 7일)';
  }, [dateRange]);

  return (
    <Modal
      visible={isVisible}
      transparent={true}
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalContainer}>
          <ScrollView>
            <Text style={styles.modalTitle}>AI 피드백 받기</Text>

            {/* 모델 선택 */}
            <View style={styles.modalSection}>
              <Text style={styles.modalSectionTitle}>비교 모델 선택</Text>
              <View style={styles.toggleContainer}>
                <TouchableOpacity
                  style={[
                    styles.toggleButton,
                    modelType === 'korean' ? styles.toggleButtonActive : styles.toggleButtonInactive
                  ]}
                  onPress={() => setModelType('korean')}
                >
                  <Text style={modelType === 'korean' ? styles.toggleTextActive : styles.toggleTextInactive}>현실 모델</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.toggleButton,
                    modelType === 'nordic' ? styles.toggleButtonActive : styles.toggleButtonInactive
                  ]}
                  onPress={() => setModelType('nordic')}
                >
                  <Text style={modelType === 'nordic' ? styles.toggleTextActive : styles.toggleTextInactive}>이상 모델</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 날짜 설정 */}
            <View style={styles.modalSection}>
              <Text style={styles.modalSectionTitle}>분석 기간 (최소 7일)</Text>
              <TouchableOpacity style={styles.datePickerButton} onPress={() => setIsCalendarVisible(true)}>
                <Text style={styles.datePickerText}>{dateRangeText}</Text>
              </TouchableOpacity>
            </View>

            {/* 저장/취소 */}
            <View style={styles.modalFooter}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={handleClose} disabled={isLoading}>
                <Text style={styles.cancelButtonText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.saveButton]} onPress={handleGenerateFeedback} disabled={isLoading}>
                {isLoading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.saveButtonText}>분석 실행</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* 캘린더 모달 */}
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
  
  //  2개의 모달 상태 관리
  const [isSettingsModalVisible, setIsSettingsModalVisible] = useState(false);
  const [isFeedbackModalVisible, setIsFeedbackModalVisible] = useState(false);

  // 현재 사용자 UID
  const uid = useCurrentUid();

  // 저장된 그래프 문서 목록
  const [savedGraphs, setSavedGraphs] = useState<GraphDoc[]>([]);
  // 저장된 그래프의 렌더 결과
  const [savedViews, setSavedViews] = useState<React.ReactElement[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);

  // 그래프 삭제 핸들러
  const handleDeleteGraph = useCallback(async (graphId: string) => {
    if (!uid) return;
    Alert.alert(
      '삭제',
      '해당 분석을 삭제하시겠어요?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              const ref = doc(collection(doc(collection(db, 'User'), uid), 'graphData'), graphId);
              await deleteDoc(ref);
            } catch (e: any) {
              console.warn(e);
              Alert.alert('삭제 오류', e?.message ?? '그래프 삭제 중 오류가 발생했습니다.');
            }
          }
        }
      ]
    );
  }, [uid]);

  // 모달을 항상 빈 기본값으로 시작
  const EMPTY_MODAL_SETTINGS: PlaygroundSettings = {
    showGraph: false,
    showAvgTime: false,
    graphCategory: null,
    avgTimeItems: [],
    dateRange: {},
  };

  //특정 날짜의 timeTable 문서들 읽기
  const fetchBlocksOfDate = useCallback(async (userId: string, dateISO: string): Promise<TimeBlock[]> => {
    const ttCol = collection(doc(collection(doc(collection(db, 'User'), userId), 'dateTable'), dateISO), 'timeTable');
    const snap = await getDocs(ttCol);
    const blocks: TimeBlock[] = [];
    snap.forEach((d) => {
      const v = d.data() as any;
      if (v && typeof v.startTime === 'number' && typeof v.endTime === 'number') {
        blocks.push({
          startTime: v.startTime,
          endTime: v.endTime,
          type: v.type,
          action: v.action,
          isGoal: v.isGoal,
          fix: v.fix,
        });
      }
    });
    return blocks;
  }, []);

  // 카테고리별 분 합계
  const aggregateByCategory = (blocks: TimeBlock[], category: 'type' | 'action'): Record<string, number> => {
    const acc: Record<string, number> = {};
    for (const b of blocks) {
      const label = (category === 'type' ? b.type : b.action) ?? '';
      if (!label) continue; // 빈 라벨 제외
      const minutes = Math.max(0, (b.endTime ?? 0) - (b.startTime ?? 0));
      if (minutes <= 0) continue;
      acc[label] = (acc[label] ?? 0) + minutes;
    }
    return acc;
  };

  // 설정 저장 시 서버에 기록
  const handleSaveSettings = async (newSettings: PlaygroundSettings) => {
    setSettings(newSettings);
    try {
      if (!uid) return;
      const { dateRange, graphCategory, showGraph, showAvgTime, avgTimeItems } = newSettings;
      const hasValidRange = dateRange.start && dateRange.end && dayDiff(dateRange.start, dateRange.end) >= 7;
      if (!hasValidRange) {
        Alert.alert('안내', '날짜 범위를 7일 이상 선택해주세요.');
        return;
      }

      const base = {
        dateStart: dateRange.start!,
        dateEnd: dateRange.end!,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const graphDataCol = collection(doc(collection(db, 'User'), uid), 'graphData');

      if (showGraph && graphCategory) {
        await addDoc(graphDataCol, {
          ...base,
          graphType: 'circularGraph',
          graphCategory,
          graphSubCategory: null,
        });
      }
      if (showAvgTime && avgTimeItems.length > 0) {
        await addDoc(graphDataCol, {
          ...base,
          graphType: 'averageGraph',
          graphCategory: (graphCategory ?? 'type'),
          graphSubCategory: avgTimeItems[0],
        });
      }
    } catch (e: any) {
      console.warn(e);
      Alert.alert('그래프 저장 오류', e?.message ?? 'graphData 저장 중 오류가 발생했습니다.');
    }
  };

  useEffect(() => {
    if (!uid) {
      setSavedGraphs([]); 
      return;
    }
    setSavedGraphs([]); 
    const gCol = collection(doc(collection(db, 'User'), uid), 'graphData');
    const q = query(gCol, orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const arr: GraphDoc[] = [];
      snap.forEach((d) => {
        const v = d.data() as any;
        if (!v?.dateStart || !v?.dateEnd || !v?.graphType || !v?.graphCategory) return;
        arr.push({
          id: d.id,
          graphType: v.graphType,
          dateStart: v.dateStart,
          dateEnd: v.dateEnd,
          graphCategory: v.graphCategory,
          graphSubCategory: v.graphSubCategory ?? null,
          feedbackText: v.feedbackText ?? null,
        });
      });
      setSavedGraphs(arr);
    }, (err) => {
      console.warn(err);
      Alert.alert('graphData 구독 오류', err?.message ?? '저장된 그래프를 불러오는 중 오류가 발생했습니다.');
    });
    return () => unsub();
  }, [uid]);

  // 그래프는 실제 데이터를 읽고 요소를 구성
  useEffect(() => {
    const buildSavedViews = async () => {
      if (!uid) return;
      if (savedGraphs.length === 0) {
        setSavedViews([]);
        return;
      }
      setLoadingSaved(true);
      try {
        const views: React.ReactElement[] = [];

        for (const g of savedGraphs) {
          // 원형 그래프
          if (g.graphType === 'circularGraph') {
            const validRange = g.dateStart && g.dateEnd && dayDiff(g.dateStart, g.dateEnd) >= 1;
            if (!validRange) continue;

            const dates = dateList(g.dateStart, g.dateEnd);
            const blocksNested = await Promise.all(dates.map(d => fetchBlocksOfDate(uid, d)));
            const blocks = blocksNested.flat();

            const totals = aggregateByCategory(blocks, g.graphCategory as 'type' | 'action');
            const totalMinutes = Object.values(totals).reduce((a, b) => a + b, 0);

            if (totalMinutes > 0) {
              const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
              let cumAngle = -90;
              const slices: React.ReactElement[] = [];
              const legend: { label: string; color: string; value: number }[] = [];

              entries.forEach(([label, mins], idx) => {
                const pct = (mins / totalMinutes) * 100;
                const angle = (pct / 100) * 360;
                const color = PIE_COLORS[idx % PIE_COLORS.length];
                const path = createPieSlicePath(50, 50, 40, cumAngle, cumAngle + angle);
                cumAngle += angle;

                slices.push(<Path key={`${g.id}-${label}-${idx}`} d={path} fill={color} />);
                legend.push({ label, color, value: Math.round(pct * 10) / 10 });
              });

              views.push(
                <View key={`saved-circ-${g.id}`} style={[styles.card, styles.graphCard]}>
                  {/* 삭제 버튼 */}
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDeleteGraph(g.id)}
                  >
                    <Ionicons name="trash" size={16} color={C.closeButtonIcon} />
                  </TouchableOpacity>

                  <View style={styles.graphContainer}>
                    <Svg height="100%" width="100%" viewBox="0 0 100 100">
                      {slices}
                    </Svg>
                  </View>
                  <Text style={[styles.cardText, { marginTop: 10 }]}>
                    그래프 ({g.graphCategory === 'type' ? '유형' : '행동'} 기준) · {g.dateStart} ~ {g.dateEnd}
                  </Text>
                  <View style={styles.legendContainer}>
                    {legend.map((item, index) => (
                      <View key={`saved-circ-leg-${g.id}-${index}`} style={styles.legendItem}>
                        <View style={[styles.legendColorBox, { backgroundColor: item.color }]} />
                        <Text style={styles.legendText}>
                          {item.label} · {item.value}%
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            } else {
            }
          // 평균 시간
          } else if (g.graphType === 'averageGraph') {
            const validRange = g.dateStart && g.dateEnd && dayDiff(g.dateStart, g.dateEnd) >= 1;
            if (!validRange) continue;
            
            const sub = g.graphSubCategory ?? '';
            if (!sub) continue; // 항목 없으면 스킵

            const dates = dateList(g.dateStart, g.dateEnd);
            const blocksNested = await Promise.all(dates.map(d => fetchBlocksOfDate(uid, d)));
            const blocks = blocksNested.flat();

            const isType = TYPES.includes(sub);
            const category: 'type' | 'action' = isType ? 'type' : (ACTIONS.includes(sub) ? 'action' : 'type');
            const totals = aggregateByCategory(blocks, category);
            const minutesTotal = totals[sub] ?? 0;
            const perDay = Math.floor(minutesTotal / dates.length);

            views.push(
              <View key={`saved-avg-${g.id}`} style={styles.card}>
                {/* 삭제 버튼 */}
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDeleteGraph(g.id)}
                >
                  <Ionicons name="trash" size={16} color={C.closeButtonIcon} />
                </TouchableOpacity>

                <Text style={styles.cardText}>
                 평균 소비시간 · {sub}: <Text style={styles.boldText}>{formatMinutes(perDay)}</Text>
                </Text>
                <Text style={[styles.placeholderText, { marginTop: 6 }]}>
                  기준: {g.dateStart} ~ {g.dateEnd} · {g.graphCategory === 'type' ? '유형' : '행동'}
                </Text>
              </View>
            );

          // 피드백 카드
          } else if (g.graphType === 'aiFeedback' && g.feedbackText) {
            const modelName = g.graphSubCategory === 'korean' ? '현실 모델' : '이상 모델';
            views.push(
              <View key={`saved-feedback-${g.id}`} style={styles.card}>
                {/* 삭제 버튼 */}
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDeleteGraph(g.id)}
                >
                  <Ionicons name="trash" size={16} color={C.closeButtonIcon} />
                </TouchableOpacity>
                
                {/* 피드백 아이콘 */}
                <Ionicons name="sparkles" size={24} color={C.primary} style={{ marginBottom: 12 }} />
                
                <Text style={styles.feedbackTitle}>피드백</Text>
                
                {/* GPT가 생성한 피드백 텍스트 */}
                <Text style={styles.feedbackText}>
                  {g.feedbackText}
                </Text>
                
                {/* 분석 기준 */}
                <Text style={[styles.placeholderText, { marginTop: 16 }]}>
                  (기준: {modelName} · {g.dateStart} ~ {g.dateEnd})
                </Text>
              </View>
            );
          }
        }

        setSavedViews(views);
      } catch (e: any) {
        console.warn(e);
        Alert.alert('저장된 그래프 계산 오류', e?.message ?? 'graphData 기반 집계 중 오류가 발생했습니다.');
        setSavedViews([]);
      } finally {
        setLoadingSaved(false);
      }
    };

    buildSavedViews();
  }, [uid, savedGraphs, fetchBlocksOfDate, handleDeleteGraph]); // 핸들러 의존성

  // 로그인 확인 및 모달 열기
  const openFeedbackModal = () => {
    if (!uid) {
      Alert.alert("로그인 필요", "AI 피드백 기능은 로그인 후 이용할 수 있습니다.");
      return;
    }
    setIsFeedbackModalVisible(true);
  };
  
  const openSettingsModal = () => {
    if (!uid) {
      Alert.alert("로그인 필요", "그래프 저장 기능은 로그인 후 이용할 수 있습니다.");
      return;
    }
    setIsSettingsModalVisible(true);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Firestore에 저장된 그래프/피드백 표시 */}
        {loadingSaved ? (
          <ActivityIndicator size="large" color={C.primary} style={{ marginTop: 50 }} />
        ) : savedViews.length > 0 ? (
          savedViews
        ) : (
          <View style={[styles.card, styles.disabledCard]}>
            <Text style={styles.placeholderText}>
              {uid ? "표시할 분석 데이터가 없습니다.\n하단의 '+' 버튼으로 그래프를 저장하거나 'AI 피드백'을 받아보세요." : "로그인 후 분석 기능을 이용해보세요."}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* 하단 버튼 영역 */}
      <View style={styles.bottomBar}>
        {/*  '추천 고정시간 패턴' -> 'AI 피드백 받기' 버튼 */}
        <TouchableOpacity style={styles.recommendButton} onPress={openFeedbackModal}>
          <Text style={styles.recommendButtonText}>AI 피드백 받기</Text>
        </TouchableOpacity>
        
        {/*그래프 저장*/}
        <TouchableOpacity
          style={styles.addButton}
          onPress={openSettingsModal}
        >
          <Ionicons name="add" size={32} color="white" />
        </TouchableOpacity>
      </View>

      {/* 그래프 저장 모달 */}
      <SettingsModal
        isVisible={isSettingsModalVisible}
        onClose={() => setIsSettingsModalVisible(false)}
        onSave={(newSettings) => {
          handleSaveSettings(newSettings);
          setIsSettingsModalVisible(false); // 저장 후 닫기
        }}
        initialSettings={EMPTY_MODAL_SETTINGS}
      />
      
      {/*  AI 피드백 모달 */}
      {uid && ( // 로그인 상태일 때만 렌더링
        <FeedbackModal
          isVisible={isFeedbackModalVisible}
          onClose={() => setIsFeedbackModalVisible(false)}
          uid={uid}
          fetchBlocksOfDate={fetchBlocksOfDate}
        />
      )}
    </SafeAreaView>
  );
}

// 스타일
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.background,
  },
  container: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 40,
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
    position: 'relative',
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
  // 저장된 그래프 카드용 삭제 버튼
  deleteButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: C.danger,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  cardText: {
    fontSize: 18,
    color: C.text,
    textAlign: 'center',
  },
  boldText: {
    fontWeight: 'bold',
  },
  graphContainer: {
    width: GRAPH_SIZE,
    height: GRAPH_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    paddingBottom: 25,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.background,
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
  // 모달
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: C.modalBackground,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
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
  toggleContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  toggleButton: {
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
  datePickerButton: {
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
  // 범례
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 15,
    paddingHorizontal: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 15,
    marginBottom: 5,
  },
  legendColorBox: {
    width: 12,
    height: 12,
    borderRadius: 3,
    marginRight: 6,
  },
  legendText: {
    fontSize: 12,
    color: C.textDim,
  },
  placeholderText: {
    color: C.textDim,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  //  피드백 카드 전용 스타일
  feedbackTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: C.text,
    marginBottom: 10,
    textAlign: 'center',
  },
  feedbackText: {
    fontSize: 15,
    color: C.text,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 10, 
  },
});