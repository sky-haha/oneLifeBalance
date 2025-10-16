import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Dimensions, ScrollView,
TouchableOpacity, Modal, KeyboardAvoidingView, Platform,
TextInput } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";

//유틸리티 함수들
const { width: SCREEN_WIDTH } = Dimensions.get("window");

// 색상 팔레트
const C = {
  bg: "#0B1220",    
  card: "#0F172A",   
  border: "#1F2937", 
  text: "#E5E7EB",  
  textDim: "#9CA3AF",
  primary: "#3B82F6",
};

// 시간 관련 함수들

// 분 단위 숫자를 HH:MM 형식 문자열로 변환 (예: 540 -> 09:00)
const toHHMM = (m: number) => {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};
// Date 객체를 00:00 기준 총 경과 분으로 변환
const fromDateToMinutes = (d: Date) => d.getHours() * 60 + d.getMinutes();
// 분 단위 숫자를 오늘 날짜의 Date 객체로 변환
const toDateFromMinutes = (minutes: number) => {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  base.setMinutes(minutes);
  return base;
};
// 미리 정의된 색상 팔레트에서 랜덤으로 색상 하나를 선택
const randomColor = () => {
  const colors = ["#60A5FA", "#34D399", "#F59E0B", "#F472B6", "#A78BFA", "#F87171"];
  return colors[(Math.random() * colors.length) | 0];
};

// --- 타입 정의 ---
// 일정 하나를 나타내는 데이터 구조
type Block = { id: string; start: number; end: number; color: string; purpose?: string };

// 요일별 나타내기 위한 임시 데이터 
const makeId = () => Math.random().toString(36).slice(2, 9);
const buildInitialFixedSchedules = () => {
  return {
    'mon': [
      { id: makeId(), start: 540, end: 1080, color: "#60A5FA", purpose: "업무" },
      { id: makeId(), start: 1140, end: 1260, color: "#F59E0B", purpose: "점심 시간" },
    ],
    'tue': [{ id: makeId(), start: 540, end: 1080, color: "#60A5FA", purpose: "업무" }],
    'wed': [
      { id: makeId(), start: 540, end: 1080, color: "#60A5FA", purpose: "업무" },
      { id: makeId(), start: 1200, end: 1320, color: "#34D399", purpose: "스터디" },
    ],
    'thu': [{ id: makeId(), start: 540, end: 1080, color: "#60A5FA", purpose: "업무" }],
    'fri': [{ id: makeId(), start: 540, end: 960, color: "#60A5FA", purpose: "업무 (단축)" }],
    'sat': [],
    'sun': [],
  } as Record<string, Block[]>;
};

// UI 관련
const HOUR_HEIGHT = 44; // 타임라인에서 1시간의 높이(px)
const HOURS = Array.from({ length: 25 }, (_, i) => i); // 0시부터 24시까지 시간 눈금 배열
const LABEL_GUTTER = 56; // 왼쪽 시간 레이블 영역의 너비(px)

// 상단 요일 선택 버튼
const DAYS = [
    { key: 'mon', label: '월' }, { key: 'tue', label: '화' },
    { key: 'wed', label: '수' }, { key: 'thu', label: '목' },
    { key: 'fri', label: '금' }, { key: 'sat', label: '토' },
    { key: 'sun', label: '일' },
];

// 메인 컴포넌트
export default function FixedScheduleScreen() {
  const router = useRouter();
  const [selectedDay, setSelectedDay] = useState('mon'); // 현재 선택된 요일, 기본값은 월요일

  // 요일별 전체 고정 일정 데이터를 관리하는 state
  const [byDay, setByDay] = useState<Record<string, Block[]>>(buildInitialFixedSchedules());
  
  // 전체 데이터에서 현재 선택된 요일에 해당하는 일정 목록만 추출
  const blocks = useMemo(() => byDay[selectedDay] || [], [byDay, selectedDay]);

  // 겹치는 일정들의 레이아웃을 동적으로 계산하는 로직
  const blockLayouts = useMemo(() => {
    // 모든 일정을 시작 시간 순서로 정렬
    const sorted = [...blocks].sort((a, b) => a.start - b.start);
    if (sorted.length === 0) return new Map(); // 일정이 없으면 빈 Map

    // 최종 레이아웃 정보를 담을 Map과 이미 처리된 일정을 기록할 Set 초기화
    const layouts = new Map<string, { top: number; height: number; left: string; width: string }>();
    const processed = new Set<string>();

    // 정렬된 일정을 순회하며 겹치는 그룹 찾기
    for (const block of sorted) {
      if (processed.has(block.id)) continue; // 이미 그룹화된 일정이면 건너뛰기

      // 현재 일정과 직/간접적으로 연결된 모든 겹치는 일정을 그룹으로 묶음
      const group: Block[] = [];
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

      // 그룹 내의 일정들을 길이가 짧은 순서대로 다시 정렬
      const groupSortedByDuration = group.sort((a, b) => (a.end - a.start) - (b.end - b.start));
      const totalColumns = groupSortedByDuration.length;

      // 정렬된 순서를 열로사용, 오른쪽에 가장 긴 일정
      groupSortedByDuration.forEach((b, colIndex) => {
        layouts.set(b.id, {
          top: (b.start / 60) * HOUR_HEIGHT,
          height: ((b.end - b.start) / 60) * HOUR_HEIGHT,
          left: `${(100 / totalColumns) * colIndex}%`,
          width: `${100 / totalColumns}%`,
        });
      });
    }
    return layouts; // 계산된 레이아웃 Map 반환
  }, [blocks]);


  // 편집/추가 모달 관련 상태 및 함수들
  const [editingBlock, setEditingBlock] = useState<Block | null>(null); // 현재 편집 중인 일정 객체
  const [isAddModal, setIsAddModal] = useState(false); // 추가 모달인지 편집 모달인지 구분
  const [editPurpose, setEditPurpose] = useState<string>(""); // 모달 내 이름 입력값
  const [startTime, setStartTime] = useState<Date>(toDateFromMinutes(540)); // 모달 내 시작 시간
  const [endTime, setEndTime] = useState<Date>(toDateFromMinutes(600)); // 모달 내 종료 시간
  const [showPicker, setShowPicker] = useState<null | "start" | "end">(null); // 피커 표시 여부

  // 편집 모달을 여는 함수
  const openEditModal = (b: Block) => {
    setEditingBlock(b); // 편집할 일정 객체 설정
    setIsAddModal(false); // 추가 모드가 아님을 명시
    setEditPurpose(b.purpose ?? ""); // 기존 이름 불러오기
    setStartTime(toDateFromMinutes(b.start)); // 기존 시간 불러오기
    setEndTime(toDateFromMinutes(b.end));
  };

  // 추가 모달을 여는 함수
  const openAddModal = () => {
    setEditingBlock(null); // 편집할 일정이 없음
    setIsAddModal(true); // '추가' 모드임을 명시
    setEditPurpose(""); // 입력 필드 초기화
    setStartTime(toDateFromMinutes(540)); // 기본 시간(09:00)으로 설정
    setEndTime(toDateFromMinutes(600)); // 기본 시간(10:00)으로 설정
  };

  // 모달을 닫는 함수
  const closeModal = () => {
    setEditingBlock(null);
    setIsAddModal(false);
    setShowPicker(null);
  };

  // 모달에서 저장 버튼을 눌렀을 때 실행되는 함수
  const saveChanges = () => {
    const s = fromDateToMinutes(startTime);
    const e = fromDateToMinutes(endTime);
    if (e <= s) return; // 종료 시간이 시작 시간보다 빠르면 저장하지 않음

    if (isAddModal) { // 추가 모드일 경우
        const newBlock: Block = { id: makeId(), start: s, end: e, purpose: editPurpose, color: randomColor() };
        // 현재 선택된 요일의 일정 배열에 새 블록 추가
        setByDay(prev => ({
            ...prev,
            [selectedDay]: [...(prev[selectedDay] || []), newBlock]
        }));
    } else if (editingBlock) { // 편집 모드일 경우
        // 현재 선택된 요일의 일정 배열에서 id가 일치하는 항목을 찾아 내용 업데이트
        setByDay(prev => ({
          ...prev,
          [selectedDay]: (prev[selectedDay] || []).map((b) =>
            b.id === editingBlock.id ? { ...b, start: s, end: e, purpose: editPurpose } : b
          ),
        }));
    }
    closeModal(); // 저장 후 모달 닫기
  };

  const contentHeight = HOUR_HEIGHT * 24; // 스크롤 뷰의 전체 높이 계산

  return (
    <View style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.safeTop}>
        {/* 상단 헤더 */}
        <View style={styles.header}>
            <Text style={styles.headerTitle}>고정 시간 설정</Text>
        </View>
        {/* 상단 요일 선택 바 */}
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

          {/* 오른쪽 일정 블록이 그려지는 캔버스 영역 */}
          <View style={[styles.canvas, { height: contentHeight }]}>
            {/* 시간별 가로선 그리기 */}
            {HOURS.map((h) => (
              <View key={`grid-${h}`} style={[styles.gridLine, { top: h * HOUR_HEIGHT }]} />
            ))}
            {/* 계산된 레이아웃에 따라 일정 블록들 그리기 */}
            {blocks.map((b) => {
              const layout = blockLayouts.get(b.id);
              if (!layout) return null;
              return (
                <View key={b.id} style={[ styles.block, { ...layout, backgroundColor: b.color }]}>
                  {/* 블록을 누르면 수정 모달이 열림 */}
                  <TouchableOpacity activeOpacity={0.7} onPress={() => openEditModal(b)} style={{ flex: 1, overflow: 'hidden' }}>
                      <Text style={styles.blockTitle} numberOfLines={1}>{b.purpose ?? "할 일"}</Text>
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

      {/* 우하단 추가 버튼 */}
      <TouchableOpacity style={styles.fab} activeOpacity={0.9} onPress={openAddModal}>
        <Text style={styles.fabText}>＋</Text>
      </TouchableOpacity>

      {/* 추가/편집 모달 */}
      <Modal visible={!!editingBlock || isAddModal} transparent animationType="fade" onRequestClose={closeModal}> 
        <View style={styles.backdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ width: "100%", alignItems: "center" }}
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{isAddModal ? '고정 할 일 추가' : '고정 할 일 편집'}</Text>
              
              <Text style={styles.label}>이름</Text>
              <TextInput
                value={editPurpose}
                onChangeText={setEditPurpose}
                placeholder="예: 수면, 업무…"
                placeholderTextColor={C.textDim}
                style={styles.input}
                returnKeyType="done"
              />

              <Text style={[styles.label, { marginTop: 12 }]}>시간</Text>
              <View style={styles.timeRow}>
                <TouchableOpacity style={styles.timeBtn} onPress={() => setShowPicker("start")}>
                  <Text style={styles.timeBtnText}>시작 {toHHMM(fromDateToMinutes(startTime))}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.timeBtn} onPress={() => setShowPicker("end")}>
                  <Text style={styles.timeBtnText}>종료 {toHHMM(fromDateToMinutes(endTime))}</Text>
                </TouchableOpacity>
              </View>

              {showPicker && (
                <View style={{ marginTop: 8 }}>
                  <DateTimePicker
                    value={showPicker === "start" ? startTime : endTime}
                    mode="time"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    is24Hour={false}
                    onChange={(e: DateTimePickerEvent, d?: Date) => {
                      if (e.type === "dismissed") {
                        setShowPicker(null);
                        return;
                      }
                      if (d) {
                        if (showPicker === "start") setStartTime(d);
                        else setEndTime(d);
                        if (Platform.OS !== "ios") setShowPicker(null);
                      }
                    }}
                  />
                </View>
              )}

              <View style={styles.footerRow}>
                <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={closeModal}>
                  <Text style={styles.btnGhostText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={saveChanges}>
                  <Text style={styles.btnPrimaryText}>저장</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

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
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  blockTitle: { fontSize: 13, fontWeight: "700", color: "#0B1220" },
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
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end"},
  modalCard: { width: "100%", backgroundColor: C.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderColor: C.border, borderWidth: 1, padding: 16 },
  modalTitle: { color: C.text, fontSize: 18, fontWeight: "800", marginBottom: 16 },
  label: { color: C.textDim, fontSize: 12, marginBottom: 6 },
  input: {
    backgroundColor: "#0B1220",
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: C.text,
  },
  timeRow: { flexDirection: "row", gap: 8 },
  timeBtn: {
    flex: 1,
    backgroundColor: "#0B1220",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  timeBtnText: { color: C.text, fontWeight: "700" },
  footerRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  btn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  btnGhost: { borderWidth: 1, borderColor: C.border, backgroundColor: "#0B1220" },
  btnGhostText: { color: C.text },
  btnPrimary: { backgroundColor: C.primary },
  btnPrimaryText: { color: "#0B1220", fontWeight: "800" },
});

