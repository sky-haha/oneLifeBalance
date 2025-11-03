import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Dimensions, KeyboardAvoidingView, LogBox, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

//파이어베이스 임포트
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc
} from "firebase/firestore";
import { auth, db } from "./firebaseConfig";

LogBox.ignoreLogs(['Text strings must be rendered within a <Text> component']);
LogBox.ignoreAllLogs(true);
// 기기의 화면 너비를 가져옴
const { width: SCREEN_WIDTH } = Dimensions.get("window");

//색상 팔레트
const C = {
  bg: "#0B1220",       // 배경색
  card: "#0F172A",      // 카드 UI 배경
  border: "#1F2937",    // 테두리 선
  text: "#E5E7EB",      // 기본 텍스트 
  textDim: "#9CA3AF",   // 흐린 텍스트
  primary: "#3B82F6",   // 주요 버튼 및 강조
  danger: "#EF4444",    // 삭제버튼
};

// 타임라인 UI의 시간 단위 높이를 44px로 설정
const HOUR_HEIGHT = 44;
// 0부터 24까지의 숫자로 이루어진 배열을 생성하여 시간 눈금으로 사용
const HOURS = Array.from({ length: 25 }, (_, i) => i);
// 왼쪽 시간 레이블이 표시되는 영역의 너비를 56px로 설정
const LABEL_GUTTER = 56;

// 상단 요일 선택
const DAYS = [
  { key: 'mon', label: '월' }, { key: 'tue', label: '화' },
  { key: 'wed', label: '수' }, { key: 'thu', label: '목' },
  { key: 'fri', label: '금' }, { key: 'sat', label: '토' },
  { key: 'sun', label: '일' },
];

//파이어베이스 문서명
const DAY_DOC: Record<string, string> = {
  mon: "monday", tue: "tuesday", wed: "wednesday", thu: "thursday",
  fri: "friday", sat: "saturday", sun: "sunday",
};

// 할일 유형ㄴ
const TYPES = ['휴식', '가족', '개인', '자기개발', '이동', '식사'];
// 행동 유형
const ACTIONS = ['수면', '노동', '수업', '운동', '오락', '기타'];

// 분 단위를 HH:MM 형식 문자열로 변환
const toHHMM = (m: number) => {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};
// Date 객체를 자정 기준으로 총 몇 분이 지났는지 숫자로 변환함
const fromDateToMinutes = (d: Date) => d.getHours() * 60 + d.getMinutes();
// 분 단위를 오늘 날짜의 Date 객체로 변환
const toDateFromMinutes = (minutes: number) => {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  base.setMinutes(minutes);
  return base;
};
// 미리 정의된 색상 팔레트에서 무작위로 색상 하나를 반환
const randomColor = () => {
  const colors = ["#60A5FA", "#34D399", "#F59E0B", "#F472B6", "#A78BFA", "#F87171"];
  return colors[(Math.random() * colors.length) | 0];
};

// 일정 블록 하나의 데이터 구조
type Block = {
  id: string;         // 고유 식별자 (Firestore 문서 id)
  start: number;      // 시작 시간 (분 단위)
  end: number;        // 종료 시간 (분 단위)
  color: string;      // 블록 색상
  purpose?: string;   // 할 일 이름
  type?: string;      // 할일 유형
  action?: string;    // 행동 유형
  isGoal?: boolean;
};

// 고유 ID를 생성
const makeId = () => Math.random().toString(36).slice(2, 9);
const buildInitialFixedSchedules = () => {
  return {
  } as Record<string, Block[]>;
};

export default function FixedScheduleScreen() {
  // 화면 이동을 위한 라우터 훅
  const router = useRouter();
  // 현재 선택된 요일을 관리하는 상태
  const [selectedDay, setSelectedDay] = useState('mon');

  // 모든 요일의 일정 데이터를 관리하는 상태
  const [byDay, setByDay] = useState<Record<string, Block[]>>(buildInitialFixedSchedules());

  //로그인한 사용자 id
  const [uid, setUid] = useState<string | null>(null);

  //로그인 상태 확인
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
    });
    return unsub;
  }, []);

  // byDay 데이터에서 현재 선택된 요일의 일정 목록만 추출
  // useMemo를 사용하여 byDay나 selectedDay가 변경될 때만 재계산
  const blocks = useMemo(() => byDay[selectedDay] || [], [byDay, selectedDay]);

  // 겹치는 일정 블록들의 시각적 레이아웃(위치, 높이, 너비 등)을 계산
  const blockLayouts = useMemo(() => {
    // 일정을 시작 시간 순서로 정렬
    const sorted = [...blocks].sort((a, b) => a.start - b.start);
    // 일정이 없으면 빈 Map을 반환
    if (sorted.length === 0) return new Map();

    // 최종 레이아웃 정보를 저장할 Map 객체
    const layouts = new Map<string, { top: number; height: number; left: string; width: string }>();
    // 이미 처리된 블록의 ID를 저장하여 중복 계산을 방지
    const processed = new Set<string>();

    // 모든 블록을 순회하며 겹치는 그룹을 찾음
    for (const block of sorted) {
      if (processed.has(block.id)) continue; // 이미 처리된 블록은 스킵
      const group: Block[] = []; // 겹치는 블록 배열
      // 현재 블록과 겹치는 모든 블록을 찾아서 그룹에 추가
      const findOverlapsRecursive = (b: Block) => {
        group.push(b);
        processed.add(b.id);
        for (const other of sorted) {
          if (processed.has(other.id)) continue;
          if (b.end > other.start && b.start < other.end) {
            findOverlapsRecursive(other);
          }
        }
      };
      findOverlapsRecursive(block);

      // 그룹 내의 블록들을 일정 길이가 짧은 순으로 다시 정렬
      const groupSortedByDuration = group.sort((a, b) => (a.end - a.start) - (b.end - b.start));
      // 겹치는 블록의 총 개수 계산
      const totalColumns = groupSortedByDuration.length;

      // 각 블록의 너비와 왼쪽 위치를 계산하여 저장
      groupSortedByDuration.forEach((b, colIndex) => {
        layouts.set(b.id, {
          top: (b.start / 60) * HOUR_HEIGHT, // 시작 시간을 px 단위로 변환
          height: ((b.end - b.start) / 60) * HOUR_HEIGHT, // 일정 길이를 px 단위로 변환
          left: `${(100 / totalColumns) * colIndex}%`, // 왼쪽 위치(%)
          width: `${100 / totalColumns}%`, // 너비(%)
        });
      });
    }
    return layouts; // 계산된 레이아웃 정보를 반환
  }, [blocks]);

  // 모달의 상태 관리
  const [modalMode, setModalMode] = useState<'add' | 'edit' | null>(null);
  // 현재 편집 중인 블록 데이터를 저장하는 상태
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null);

  // 추가모달
  const openAddModal = () => {
    setSelectedBlock(null); // 선택된 블록을 초기화
    setModalMode('add');    // 모드 상태를 add로 설정
  };

  // 편집모달
  const openEditModal = (block: Block) => {
    setSelectedBlock(block); // 선택된 블록 데이터를 상태에 저장
    setModalMode('edit');   // 모드 상태를 edit으로 설정
  };

  // 모달닫기
  const closeModal = () => {
    setModalMode(null);
    setSelectedBlock(null);
  };

  // 타임라인의 전체 높이를 계산 (24시간 * 시간당 높이)
  const contentHeight = HOUR_HEIGHT * 24;

  //선택된 요일의 timetable 확인
  useEffect(() => {
    if (!uid) return;
    const dayDocName = DAY_DOC[selectedDay];
    const colRef = collection(db, "User", uid, "routinTable", dayDocName, "timeTable");
    const qRef = query(colRef, orderBy("startTime", "asc"));
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const list: Block[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            start: data.startTime ?? 0,
            end: data.endTime ?? 0,
            color: data.color || randomColor(),
            purpose: data.purpose,
            type: data.type,
            action: data.action,
            isGoal: data.isGoal ?? false,
          };
        });
        setByDay((prev) => ({ ...prev, [selectedDay]: list }));
      },
      (err) => {
        console.warn(err);
        Alert.alert("불러오기 실패", "시간표 데이터를 불러오는 중 오류가 발생했습니다.");
      }
    );
    return unsub;
  }, [uid, selectedDay]);

  // DB 저장/수정/삭제 헬퍼
  const saveBlock = async (mode: 'add' | 'edit', block: Block) => {
    if (!uid) {
      Alert.alert("로그인이 필요합니다", "시간표를 저장하려면 로그인하세요.");
      return;
    }
    if (block.end <= block.start) {
      Alert.alert("시간 확인", "종료 시간이 시작 시간보다 커야 합니다.");
      return;
    }
    const dayDocName = DAY_DOC[selectedDay];
    const colRef = collection(db, "User", uid, "routinTable", dayDocName, "timeTable");

    const payload = {
      startTime: block.start,
      endTime: block.end,
      color: block.color || randomColor(),
      purpose: block.purpose || "",
      type: block.type || "",
      action: block.action || "",
      isGoal: block.isGoal ?? false,
    };

    try {
      if (mode === "edit" && selectedBlock?.id) {
        await updateDoc(doc(colRef, selectedBlock.id), payload);
      } else {
        await addDoc(colRef, payload);
      }
    } catch (e: any) {
      console.warn(e);
      Alert.alert("저장 실패", e?.message ?? "저장 중 오류가 발생했습니다.");
    }
  };

  const deleteBlock = async (id: string) => {
    if (!uid) return;
    const dayDocName = DAY_DOC[selectedDay];
    const colRef = collection(db, "User", uid, "routinTable", dayDocName, "timeTable");
    try {
      await deleteDoc(doc(colRef, id));
    } catch (e: any) {
      console.warn(e);
      Alert.alert("삭제 실패", e?.message ?? "삭제 중 오류가 발생했습니다.");
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.safeTop}>
        {/* 헤더 */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>고정 시간 설정</Text>
        </View>
        {/* 요일 선택 버튼들 */}
        <View style={styles.daySelector}>
          {DAYS.map(day => (
            <TouchableOpacity
              key={day.key}
              style={[styles.dayButton, selectedDay === day.key && styles.dayButtonSelected]}
              onPress={() => setSelectedDay(day.key)}
            >
              <Text style={[styles.dayButtonText, selectedDay === day.key && styles.dayButtonTextSelected]}>
                {day.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>

      {/* 타임라인 스크롤 뷰 */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ height: contentHeight }}
        contentInsetAdjustmentBehavior="never"
      >
        <View style={styles.timelineRow}>
          {/* 왼쪽 시간 눈금 영역 */}
          <View style={[styles.leftRail, { height: contentHeight }]}>
            {HOURS.map((h) => (
              <View key={h} style={[styles.hourRow, { height: HOUR_HEIGHT }]}>
                {h < 24 && <Text style={styles.hourLabel}>{`${h}:00`}</Text>}
                <View style={styles.hourLine} />
              </View>
            ))}
          </View>

          {/* 오른쪽 일정 블록들이 표시되는 캔버스 영역 */}
          <View style={[styles.canvas, { height: contentHeight }]}>
            {/* 시간별 가로 구분선 */}
            {HOURS.map((h) => (
              <View key={`grid-${h}`} style={[styles.gridLine, { top: h * HOUR_HEIGHT }]} />
            ))}
            {/* 일정 블록들을 렌더링 */}
            {blocks.map((b) => {
              const layout = blockLayouts.get(b.id);
              if (!layout) return null;
              return (
                <View key={b.id} style={[styles.block, { ...layout, backgroundColor: b.color }]}>
                  {/* 블록을 터치하면 편집 모달이 열림 */}
                  <TouchableOpacity activeOpacity={0.7} onPress={() => openEditModal(b)} style={{ flex: 1, overflow: 'hidden', padding: 10 }}>
                    <Text style={styles.blockTitle} numberOfLines={1}>{b.purpose ?? "할 일"}</Text>
                    {/* 할일 유형과 행동 유형이 있으면 표시 */}
                    {(b.type || b.action) && (
                      <Text style={styles.blockSubTitle} numberOfLines={1}>
                        [{b.type}{b.action && ` / ${b.action}`}]
                      </Text>
                    )}
                    <Text style={styles.blockTime}>
                      {toHHMM(b.start)} ~ {toHHMM(b.end)}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* 우측하단 추가버튼 */}
      <TouchableOpacity style={styles.fab} activeOpacity={0.9} onPress={openAddModal}>
        <Text style={styles.fabText}>＋</Text>
      </TouchableOpacity>

      {/* 할 일 추가/편집 모달 */}
      <Modal visible={modalMode !== null} transparent animationType="fade" onRequestClose={closeModal}>
        <NewModalBody
          key={selectedBlock?.id || 'add'}
          mode={modalMode!}
          initialData={selectedBlock}
          onClose={closeModal}
          onSave={(newBlock) => { if (modalMode) saveBlock(modalMode, newBlock); }}
          onDelete={(id) => { deleteBlock(id); }}
        />
      </Modal>
    </View>
  );
}

const NewModalBody = ({ mode, initialData, onClose, onSave, onDelete }: {
  mode: 'add' | 'edit';
  initialData: Block | null;
  onClose: () => void;
  onSave: (block: Block) => void;
  onDelete: (id: string) => void;
}) => {
  // 모달 내부의 각 입력 필드에 대한 상태들
  const [purpose, setPurpose] = useState(initialData?.purpose || '');
  const [type, setType] = useState(initialData?.type || '개인');
  const [action, setAction] = useState(initialData?.action || '기타');
  const [startTime, setStartTime] = useState(() => toDateFromMinutes(initialData?.start || 540));
  const [endTime, setEndTime] = useState(() => toDateFromMinutes(initialData?.end || 600));

  // 커스텀 피커 모달의 상태
  const [pickerState, setPickerState] = useState<{
    visible: boolean;
    title: string;
    items: string[];
    onSelect: (item: string) => void;
  }>({ visible: false, title: '', items: [], onSelect: () => {} });

  const [timePicker, setTimePicker] = useState<'start' | 'end' | null>(null);

  const handleSave = () => {
    onSave({
      id: initialData?.id || makeId(), // id는 UI용. Firestore의 새 문서는 addDoc으로 생성됨
      purpose,
      type,
      action,
      start: fromDateToMinutes(startTime),
      end: fromDateToMinutes(endTime),
      color: initialData?.color || randomColor(),
      isGoal: initialData?.isGoal ?? false,
    });
    onClose();
  };

  // 삭제버튼
  const handleDelete = () => {
    if (initialData?.id) {
      onDelete(initialData.id);
    }
    onClose();
  };

  // 커스텀 피커 모달 열기 함수
  const openPicker = (title: string, items: string[], onSelect: (item: string) => void) => {
    setPickerState({ visible: true, title, items, onSelect });
  };

  // DateTimePicker에서 시간이 변경될 때 호출
  const onTimeChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    const currentDate = selectedDate || (timePicker === 'start' ? startTime : endTime);
    setTimePicker(Platform.OS === 'ios' ? timePicker : null);
    if (timePicker === 'start') {
      setStartTime(currentDate);
    } else {
      setEndTime(currentDate);
    }
  };

  return (
    // 모달 배경
    <View style={styles.backdrop}>
      {/* 키보드가 올라올 때 입력 필드가 가려지지 않도록 */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalContainer}>
        {/* 실제 모달 UI 내용 */}
        <View style={styles.modalCard}>
          {/* 모달 헤더 (제목, 삭제 버튼) */}
          <View style={styles.newModalHeader}>
            <Text style={styles.modalTitle}>{mode === 'add' ? '고정 할 일 추가' : '고정 할 일 편집'}</Text>
            {mode === 'edit' && (
              <TouchableOpacity onPress={handleDelete} style={styles.deleteButton}>
                <Text style={styles.deleteButtonText}>삭제</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* 할 일 이름 입력 필드 */}
          <Text style={styles.label}>할 일 이름</Text>
          <TextInput
            style={styles.input}
            value={purpose}
            onChangeText={setPurpose}
            placeholder="예: 운동, 업무..."
            placeholderTextColor={C.textDim}
          />

          {/* 할일 유형 선택 버튼 */}
          <Text style={styles.label}>할일 유형</Text>
          <TouchableOpacity style={styles.pickerButton} onPress={() => openPicker('할일 유형 선택', TYPES, setType)}>
            <Text style={styles.pickerButtonText}>{type}</Text>
          </TouchableOpacity>

          {/* 행동 유형 선택 버튼 */}
          <Text style={styles.label}>행동 유형</Text>
          <TouchableOpacity style={styles.pickerButton} onPress={() => openPicker('행동 유형 선택', ACTIONS, setAction)}>
            <Text style={styles.pickerButtonText}>{action}</Text>
          </TouchableOpacity>

          {/* 시간 선택 버튼 */}
          <Text style={styles.label}>시간</Text>
          <View style={styles.timeRow}>
            <TouchableOpacity style={styles.timeBtn} onPress={() => setTimePicker('start')}>
              <Text style={styles.timeBtnText}>시작 {toHHMM(fromDateToMinutes(startTime))}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.timeBtn} onPress={() => setTimePicker('end')}>
              <Text style={styles.timeBtnText}>종료 {toHHMM(fromDateToMinutes(endTime))}</Text>
            </TouchableOpacity>
          </View>

          {/* 하단 버튼 */}
          <View style={styles.footerRow}>
            <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={onClose}>
              <Text style={styles.btnGhostText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={handleSave}>
              <Text style={styles.btnPrimaryText}>{mode === 'add' ? '추가' : '저장'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* 커스텀 피커 선택창 모달 */}
      <Modal
        transparent={true}
        visible={pickerState.visible}
        animationType="fade"
        onRequestClose={() => setPickerState({ ...pickerState, visible: false })}
      >
        <TouchableOpacity style={styles.pickerBackdrop} onPress={() => setPickerState({ ...pickerState, visible: false })}>
          <View style={styles.pickerContainer}>
            <Text style={styles.pickerTitle}>{pickerState.title}</Text>
            {pickerState.items.map(item => (
              <TouchableOpacity
                key={item}
                style={styles.pickerItem}
                onPress={() => {
                  pickerState.onSelect(item);
                  setPickerState({ ...pickerState, visible: false });
                }}
              >
                <Text style={styles.pickerItemText}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* iOS용 시간 선택 피커 */}
      {timePicker && (
        <DateTimePicker
          value={timePicker === 'start' ? startTime : endTime}
          mode="time"
          display="spinner"
          onChange={onTimeChange}
        />
      )}
    </View>
  );
};


// 스타일
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  safeTop: { backgroundColor: C.bg },
  header: {
    height: 56,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 16, fontWeight: "700", color: C.text },
  daySelector: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  dayButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 99,
  },
  dayButtonSelected: {
    backgroundColor: C.primary,
  },
  dayButtonText: {
    color: C.textDim,
    fontWeight: '600'
  },
  dayButtonTextSelected: {
    color: C.bg,
  },
  timelineRow: { flexDirection: "row" },
  leftRail: {
    width: LABEL_GUTTER,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: C.border,
  },
  hourRow: { paddingLeft: 8, justifyContent: "flex-start", alignItems: 'flex-end', paddingRight: 8 },
  hourLabel: { fontSize: 12, color: C.textDim, marginTop: -8},
  hourLine: {
    position: "absolute",
    left: LABEL_GUTTER - 10, right: 0, top: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
  },
  canvas: { flex: 1, paddingRight: 16, paddingLeft: 8, position: "relative" },
  gridLine: {
    position: "absolute",
    left: 0, right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#1e293b",
  },
  block: {
    position: "absolute",
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    paddingRight: 4,
    borderRadius: 10,
  },
  blockTitle: { fontSize: 13, fontWeight: "700", color: "#0B1220" },
  blockSubTitle: { fontSize: 11, fontWeight: "500", color: "#0B1220", opacity: 0.8, marginTop: 2 },
  blockTime: { fontSize: 12, color: "#0B1220", opacity: 0.9, marginTop: 2 },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 22,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  fabText: { color: "#0B1220", fontSize: 26, fontWeight: "800", marginTop: -2 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContainer: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 20,
    borderColor: C.border,
    borderWidth: 1,
  },
  newModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    color: C.text,
    fontSize: 20,
    fontWeight: "bold",
  },
  deleteButton: {
    backgroundColor: C.danger,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  deleteButtonText: {
    color: C.text,
    fontWeight: 'bold',
    fontSize: 14,
  },
  label: {
    color: C.textDim,
    fontSize: 14,
    marginTop: 12,
    marginBottom: 8,
  },
  input: {
    backgroundColor: C.bg,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: C.text,
    fontSize: 16,
  },
  pickerButton: {
    backgroundColor: C.bg,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  pickerButtonText: {
    color: C.text,
    fontSize: 16,
  },
  timeRow: { flexDirection: "row", gap: 12 },
  timeBtn: {
    flex: 1,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  timeBtnText: { color: C.text, fontWeight: "600", fontSize: 16 },
  footerRow: { flexDirection: "row", gap: 12, marginTop: 24 },
  btn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnGhost: { backgroundColor: C.border },
  btnGhostText: { color: C.text, fontWeight: "700" },
  btnPrimary: { backgroundColor: C.primary },
  btnPrimaryText: { color: "#FFF", fontWeight: "bold" },
  
  pickerBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  pickerContainer: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    width: '80%',
    borderColor: C.border,
    borderWidth: 1,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: C.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  pickerItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  pickerItemText: {
    color: C.text,
    fontSize: 16,
    textAlign: 'center',
  },
});
