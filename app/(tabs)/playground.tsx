import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View, LogBox
} from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import Svg, { Path } from 'react-native-svg';

// Firestore imports
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
import { auth, db } from './firebaseConfig'; // ← 경로 확인

LogBox.ignoreLogs(['Text strings must be rendered within a <Text> component']);
LogBox.ignoreAllLogs(true);
// 기존 상수/라벨
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

// 공통 색상 팔레트(그래프)
const PIE_COLORS = ['#F97316', '#8B5CF6', '#D97706', '#10B981', '#EF4444', '#FCD34D', '#9CA3AF'];

// 날짜 차이 계산
const dayDiff = (start?: string, end?: string): number => {
  if (!start || !end) return 0;
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // 시작일 포함
};

// 날짜 리스트(YYYY-MM-DD) 생성 (양끝 포함)
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

// 분→사람이 읽는 문자열
const formatMinutes = (totalMinutes: number): string => {
  if (totalMinutes <= 0) return '0분';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  let result = '';
  if (hours > 0) result += `${hours}시간 `;
  if (minutes > 0) result += `${minutes}분`;
  return result.trim() || '0분';
};

// 원형 그래프 Path 생성
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
  showGraph: boolean;       // UI에는 남겨두지만, 화면 렌더에는 사용하지 않음(Firestore만 사용)
  showAvgTime: boolean;     // 동일
  graphCategory: 'type' | 'action' | null;
  avgTimeItems: string[];
  dateRange: { start?: string; end?: string };
}

// timeTable 데이터 타입(필요 필드만)
type TimeBlock = {
  startTime: number; // 분
  endTime: number;   // 분
  type?: string;
  action?: string;
  isGoal?: boolean;
  fix?: boolean;
};

// 저장된 graphData 도큐먼트 타입
type GraphDoc = {
  id: string;
  graphType: 'circularGraph' | 'averageGraph';
  dateStart: string;
  dateEnd: string;
  graphCategory: 'type' | 'action';
  graphSubCategory?: string | null; // averageGraph에서 사용
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
            <Text style={styles.modalTitle}>표시 설정</Text>

            {/* 그래프/평균 토글 (Firestore 저장 종류 선택용) */}
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

// 메인 화면
export default function PlaygroundScreen() {
  const [settings, setSettings] = useState<PlaygroundSettings>({
    showGraph: true,
    showAvgTime: false,
    graphCategory: 'type',
    avgTimeItems: ['수면', '노동'],
    dateRange: {},
  });
  const [isModalVisible, setIsModalVisible] = useState(false);

  // 현재 사용자 UID
  const uid = useCurrentUid();

  // 저장된 그래프 문서 목록 (실시간)
  const [savedGraphs, setSavedGraphs] = useState<GraphDoc[]>([]);
  // 저장된 그래프의 렌더 결과(각 도큐먼트별)
  const [savedViews, setSavedViews] = useState<React.ReactElement[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);

  // 그래프 삭제 핸들러
  const handleDeleteGraph = useCallback(async (graphId: string) => {
    if (!uid) return;
    Alert.alert(
      '그래프 삭제',
      '해당 저장된 그래프를 삭제하시겠어요?',
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

  // Firestore: 특정 날짜의 timeTable 문서들 읽기
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

  // 설정 저장 시 Firestore에만 기록 (화면에는 별도 임시 미리보기 없음)
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
          graphSubCategory: avgTimeItems[0], // "휴식", "노동" 등
        });
      }
    } catch (e: any) {
      console.warn(e);
      Alert.alert('그래프 저장 오류', e?.message ?? 'graphData 저장 중 오류가 발생했습니다.');
    }
  };

  // 저장된 graphData 실시간 구독
  useEffect(() => {
    if (!uid) return;
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
        });
      });
      setSavedGraphs(arr);
    }, (err) => {
      console.warn(err);
      Alert.alert('graphData 구독 오류', err?.message ?? '저장된 그래프를 불러오는 중 오류가 발생했습니다.');
    });
    return () => unsub();
  }, [uid]);

  // 저장된 graphData → 실제 데이터 읽고 요소 구성 (Firestore 데이터만 렌더)
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
          const validRange = g.dateStart && g.dateEnd && dayDiff(g.dateStart, g.dateEnd) >= 1;
          if (!validRange) continue;

          const dates = dateList(g.dateStart, g.dateEnd);
          const blocksNested = await Promise.all(dates.map(d => fetchBlocksOfDate(uid, d)));
          const blocks = blocksNested.flat();

          if (g.graphType === 'circularGraph') {
            const totals = aggregateByCategory(blocks, g.graphCategory);
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
              views.push(
                <View key={`saved-circ-empty-${g.id}`} style={[styles.card, styles.disabledCard]}>
                  {/* 삭제 버튼 */}
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDeleteGraph(g.id)}
                  >
                    <Ionicons name="trash" size={16} color={C.closeButtonIcon} />
                  </TouchableOpacity>
                  <Text style={styles.placeholderText}>
                    저장된 원형 그래프({g.dateStart}~{g.dateEnd})에 표시할 데이터가 없습니다.
                  </Text>
                </View>
              );
            }
          } else if (g.graphType === 'averageGraph') {
            const sub = g.graphSubCategory ?? '';
            if (!sub) {
              views.push(
                <View key={`saved-avg-nonsub-${g.id}`} style={[styles.card, styles.disabledCard]}>
                  {/* 삭제 버튼 */}
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDeleteGraph(g.id)}
                  >
                    <Ionicons name="trash" size={16} color={C.closeButtonIcon} />
                  </TouchableOpacity>
                  <Text style={styles.placeholderText}>
                    저장된 평균 그래프에 graphSubCategory가 없습니다.
                  </Text>
                </View>
              );
              continue;
            }
            const isType = TYPES.includes(sub);
            const category: 'type' | 'action' = isType ? 'type' : 'action';
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
  }, [uid, savedGraphs]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Firestore에 저장된 그래프만 표시 */}
        {savedViews}

        {savedViews.length === 0 && (
          <View style={[styles.card, styles.disabledCard]}>
            <Text style={styles.placeholderText}>
              원하는 유형 및 범위를 선택하세요.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* 하단 버튼 영역 */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.recommendButton}>
          <Text style={styles.recommendButtonText}>추천 고정시간 패턴</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setIsModalVisible(true)}
        >
          <Ionicons name="add" size={32} color="white" />
        </TouchableOpacity>
      </View>

      {/* 설정 모달 (저장 시 Firestore에만 기록, 즉시 렌더 없음) */}
      <SettingsModal
        isVisible={isModalVisible}
        onClose={() => setIsModalVisible(false)}
        onSave={handleSaveSettings}
        initialSettings={EMPTY_MODAL_SETTINGS}
      />
    </SafeAreaView>
  );
}

// 스타일 정의(기존 + 삭제 버튼 스타일 유지)
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
  },
});
