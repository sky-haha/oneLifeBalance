// Purpose.tsx
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  LogBox
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// [MOD] Firestore & Auth import
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from "firebase/firestore";
import { auth, db } from "./firebaseConfig"; // 경로 확인

// [ADD] GPT 유틸
import { suggestAutoTasks } from "./gptClient";
// [MOD] ───────────────────────────────────────────────────────────────
LogBox.ignoreLogs([
  "Encountered two children with the same key",
]);
const { width: SCREEN_WIDTH } = Dimensions.get("window");

// 색상 팔레트들
const C = {
  bg: "#0B1220",
  card: "#0F172A",
  border: "#1F2937",
  text: "#E5E7EB",
  textDim: "#9CA3AF",
  primary: "#3B82F6",
  danger: "#EF4444",
  secondary: "#10B981", // 자동 생성 버튼 색상
};

// 시간표 UI 배치 관련
const HOUR_HEIGHT = 44;
const HOURS = Array.from({ length: 25 }, (_, i) => i);
const LABEL_GUTTER = 56;
const SNAP_MIN = 30;
const FLICK_PROJECT_PX = 160;
const DRAG_THRESHOLD_PX = 4;
const MIN_PROJECT_VY = 0.35;
const HANDLE_ZONE_PX = 28;
const RESIZE_SNAP_MIN = 15;

//  유형/행동 카테고리 옵션
const TYPES = ['휴식', '가족', '개인', '자기개발', '이동', '식사'];
const ACTIONS = ['수면', '노동', '수업', '운동', '오락', '기타'];

//  날짜/시간 편의 함수 모음
const fmt = (d: Date) => d.toISOString().split("T")[0];
const addDays = (iso: string, delta: number) => {
  const d = new Date(iso);
  d.setDate(d.getDate() + delta);
  return fmt(d);
};
const toHHMM = (m: number) => {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};
const fromDateToMinutes = (d: Date) => d.getHours() * 60 + d.getMinutes();
const toDateFromMinutes = (minutes: number) => {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  base.setMinutes(minutes);
  return base;
};

function pickColorForId(id: string): string {
  let hash = 0;
  if (id.length === 0) {
    return "#CCCCCC"; 
  }

  for (let i = 0; i < id.length; i++) {
    const char = id.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; 
  }

  const hue = Math.abs(hash % 360);
  const saturation = 70; 
  const lightness = 60; 

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

//  타임블록 구조
type Block = {
  id: string;
  start: number;
  end: number;
  color: string;     // 서버에는 저장하지 않음(로컬 전용)
  purpose?: string;
  type?: string;
  action?: string;
  isGoal?: boolean;
};

//  초기 표시용 데이터(초기 렌더용 목업)
const makeId = () => Math.random().toString(36).slice(2, 9);
const buildInitial = () => {
  const today = fmt(new Date());
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, +1);

  const id1 = makeId();
  const id2 = makeId();
  const id3 = makeId();
  const id4 = makeId();
  const id5 = makeId();
  const id6 = makeId();
  
  return {
    [today]: [
      { id: id1, start: 480, end: 720, color: pickColorForId(id1), purpose: "업무", type: '업무', action: '노동' },
      { id: id2, start: 570, end: 660, color: pickColorForId(id2), purpose: "미팅", type: '업무', action: '노동' },
      { id: id3, start: 540, end: 600, color: pickColorForId(id3), purpose: "회의", type: '업무', action: '노동' },
      { id: id4, start: 780, end: 1020, color: pickColorForId(id4), purpose: "운동", type: '자기개발', action: '운동', isGoal: true },
    ] as Block[],
    [yesterday]: [{ id: id5, start: 540, end: 1020, color: pickColorForId(id5), purpose: "과제", isGoal: true }],
    [tomorrow]: [{ id: id6, start: 600, end: 900, color: pickColorForId(id6), purpose: "회의" }],
  } as Record<string, Block[]>;
};

// [MOD] ───────────── Firestore 경로 유틸 & 저장/삭제 로직 ─────────────
const dateDocRef = (uid: string, dateISO: string) =>
  doc(db, "User", uid, "dateTable", dateISO);
const timeTableColRef = (uid: string, dateISO: string) =>
  collection(db, "User", uid, "dateTable", dateISO, "timeTable");
const timeTableDocRef = (uid: string, dateISO: string, timeTableId: string) =>
  doc(db, "User", uid, "dateTable", dateISO, "timeTable", timeTableId);

async function ensureDateDocUseTrue(uid: string, dateISO: string) {
  const dref = dateDocRef(uid, dateISO);
  const snap = await getDoc(dref);
  if (snap.exists()) {
    const data = snap.data() as any;
    if (!data?.Use) {
      await updateDoc(dref, { Use: true, updatedAt: serverTimestamp() });
    }
  } else {
    await setDoc(dref, { Use: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
}

async function saveTimeBlock(uid: string, dateISO: string, block: Block) {
  if (!(block.start >= 0 && block.end <= 1440 && block.end > block.start)) {
    throw new Error("시간 범위가 올바르지 않습니다.");
  }
  await ensureDateDocUseTrue(uid, dateISO);

  const tref = timeTableDocRef(uid, dateISO, block.id);
  const payload = {
    startTime: block.start,
    endTime: block.end,
    type: block.type ?? "",
    action: block.action ?? "",
    purpose: block.purpose ?? "",
    isGoal: !!block.isGoal,
    fix: false,
    updatedAt: serverTimestamp(),
  };
  await setDoc(tref, { ...payload, createdAt: serverTimestamp() }, { merge: true });
}

async function deleteTimeBlock(uid: string, dateISO: string, blockId: string) {
  const tref = timeTableDocRef(uid, dateISO, blockId);
  await deleteDoc(tref);

  // 남은 블록 없으면 Use=false
  const col = timeTableColRef(uid, dateISO);
  const rest = await getDocs(col);
  if (rest.empty) {
    await updateDoc(dateDocRef(uid, dateISO), { Use: false, updatedAt: serverTimestamp() }).catch(() => {});
  }
}
// [MOD] ───────────────────────────────────────────────────────────────

// 
export default function Purpose() {
  const router = useRouter();
  const { date } = useLocalSearchParams<{ date?: string }>();
  const selectedDate = (typeof date === "string" && date) || fmt(new Date());

  // [MOD] 로그인 사용자 uid 상태
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);

  //  날짜별 블록 상태와 현재 날짜의 블록
  const [byDate, setByDate] = useState<Record<string, Block[]>>(buildInitial());
  const blocks = useMemo(() => byDate[selectedDate] || [], [byDate, selectedDate]);

  // [MOD] 로그인 상태 구독
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
    return () => unsub();
  }, []);

  // [MOD] 선택 날짜의 timeTable 실시간 구독
  useEffect(() => {
    if (!uid) return;
    const colRef = timeTableColRef(uid, selectedDate);
    const q = query(colRef, orderBy("startTime", "asc"));

    const unsub = onSnapshot(q, (snap) => {
      setByDate((prev) => {
        const nextBlocks: Block[] = snap.docs.map((docSnap) => {
          const d = docSnap.data() as any;
          return {
            id: docSnap.id,
            start: typeof d.startTime === "number" ? d.startTime : 0,
            end: typeof d.endTime === "number" ? d.endTime : 0,
            type: d.type || "",
            action: d.action || "",
            purpose: d.purpose || "",
            isGoal: !!d.isGoal,
            color: pickColorForId(docSnap.id),
          };
        });
        return { ...prev, [selectedDate]: nextBlocks };
      });
    }, (err) => {
      console.warn("[onSnapshot timeTable] error:", err);
    });

    return () => unsub();
  }, [uid, selectedDate]);

  //  겹치는 블록 레이아웃 계산 (생략: 기존 동일)
  type Layout = { top: number; height: number; left: string; width: string };
  const blockLayouts = useMemo(() => {
    const sortedByTime = [...blocks].sort((a, b) => a.start - b.start);
    if (sortedByTime.length === 0) return new Map<string, Layout>();

    const layouts = new Map<string, Layout>();
    type Cluster = Block[];
    const clusters: Cluster[] = [];
    let cur: Cluster = [];
    let curEnd = -1;

    for (const b of sortedByTime) {
      if (cur.length === 0) {
        cur.push(b); curEnd = b.end;
      } else {
        if (b.start < curEnd) { cur.push(b); if (b.end > curEnd) curEnd = b.end; }
        else { clusters.push(cur); cur = [b]; curEnd = b.end; }
      }
    }
    if (cur.length) clusters.push(cur);

    clusters.forEach((cluster) => {
      const items = [...cluster].sort((a, b) => (a.start - b.start) || (a.end - b.end));

      const colEnds: number[] = [];
      const colIndexMap = new Map<string, number>();

      type Evt = { t: number; kind: "start" | "end" };
      const evts: Evt[] = [];
      items.forEach(b => { evts.push({ t: b.start, kind: "start" }); evts.push({ t: b.end, kind: "end" }); });
      evts.sort((a, b) => a.t - b.t || (a.kind === "end" ? -1 : 1));

      let active = 0;
      let maxConcurrent = 0;
      for (const e of evts) {
        if (e.kind === "end") active--;
        else { active++; if (active > maxConcurrent) maxConcurrent = active; }
      }
      const totalCols = Math.max(1, maxConcurrent);

      items.forEach(b => {
        let idx = -1;
        for (let i = 0; i < colEnds.length; i++) if (colEnds[i] <= b.start) { idx = i; break; }
        if (idx === -1) { idx = colEnds.length; colEnds.push(b.end); } else { colEnds[idx] = b.end; }
        colIndexMap.set(b.id, idx);
      });

      items.forEach(b => {
        const idx = colIndexMap.get(b.id) ?? 0;
        const leftPct = (100 / totalCols) * idx;
        const widthPct = 100 / totalCols;
        layouts.set(b.id, {
          top: (b.start / 60) * HOUR_HEIGHT,
          height: ((b.end - b.start) / 60) * HOUR_HEIGHT,
          left: `${leftPct}%`,
          width: `${widthPct}%`,
        });
      });
    });

    return layouts;
  }, [blocks]);

  //  네비
  const goBack = () => {
    if ((router as any).canGoBack?.()) router.back();
    else router.replace("/(tabs)");
  };

  //  모달 상태
  const [modalMode, setModalMode] = useState<'add' | 'edit' | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null);

  const openAddModal = () => { setSelectedBlock(null); setModalMode('add'); };
  const openEditModal = (block: Block) => { setSelectedBlock(block); setModalMode('edit'); };
  const closeModal = () => { setModalMode(null); setSelectedBlock(null); };

  // 저장/삭제
  const handleSave = async (newBlock: Block) => {
    setByDate(prev => {
      const currentDayBlocks = prev[selectedDate] || [];
      const existingIndex = currentDayBlocks.findIndex(b => b.id === newBlock.id);
      const updated = existingIndex > -1
        ? Object.assign([...currentDayBlocks], { [existingIndex]: newBlock })
        : [...currentDayBlocks, newBlock];
      return { ...prev, [selectedDate]: updated };
    });

    try {
      const u = auth.currentUser;
      if (!u) throw new Error("로그인이 필요합니다.");
      await saveTimeBlock(u.uid, selectedDate, newBlock);
    } catch (e) {
      console.warn("[handleSave] Firestore 저장 실패:", e);
    }
  };

  const handleDelete = async (idToDelete: string) => {
    setByDate(prev => ({
      ...prev,
      [selectedDate]: (prev[selectedDate] || []).filter(b => b.id !== idToDelete),
    }));
    try {
      const u = auth.currentUser;
      if (!u) throw new Error("로그인이 필요합니다.");
      await deleteTimeBlock(u.uid, selectedDate, idToDelete);
    } catch (e) {
      console.warn("[handleDelete] Firestore 삭제 실패:", e);
    }
  };

  // [ADD] 자동 추가: GPT → 서브태스크 생성 → Firestore 저장
  const handleAutoAdd = async (base: Block) => {
    try {
      const u = auth.currentUser;
      if (!u) throw new Error("로그인이 필요합니다.");
      if (!base?.type || !base?.action) throw new Error("type/action이 비어 있어 자동 생성이 불가합니다.");
      if (!(base.end > base.start)) throw new Error("시간 범위가 올바르지 않습니다.");

      // 1) GPT로 서브태스크 얻기
      const suggestion = await suggestAutoTasks({
        dateISO: selectedDate,
        startMin: base.start,
        endMin: base.end,
        type: base.type!,
        action: base.action!,
        purpose: base.purpose,
      });

      // 2) 시간을 연속적으로 배치
      const newBlocks: Block[] = [];
      let cursor = base.start;
      suggestion.tasks.forEach((t) => {
        const span = Math.max(5, Math.min(t.minutes, base.end - cursor));
        if (span <= 0) return;
        const newBlockId = makeId();
        newBlocks.push({
          id: newBlockId,
          start: cursor,
          end: cursor + span,
          type: base.type,
          action: base.action,
          purpose: t.purpose,
          isGoal: false,
          color: pickColorForId(newBlockId), 
        });
        cursor += span;
      });

      if (newBlocks.length === 0) throw new Error("생성된 서브태스크가 없습니다.");

      // 3) Firestore 저장 (병렬)
      await Promise.all(newBlocks.map(b => saveTimeBlock(u.uid!, selectedDate, b)));

      // 4) 로컬 상태 즉시 반영
      setByDate(prev => {
        const rest = (prev[selectedDate] || []).filter(x => x.id !== base.id);
        return { ...prev, [selectedDate]: [...rest, ...newBlocks] };
      });

      // (선택) 원래 블록은 분해하므로 삭제 처리 원한다면 아래 주석 해제
      // await deleteTimeBlock(u.uid!, selectedDate, base.id);

    } catch (e: any) {
      console.warn("[handleAutoAdd] 실패:", e?.message || e);
    }
  };

  // 드래그/리사이즈 관련 (기존 그대로) … ↓↓↓
  const [scrollLock, setScrollLock] = useState(false);
  const dragY = useState(new Animated.Value(0))[0];
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragStartTop, setDragStartTop] = useState(0);
  const [dragDurationMin, setDragDurationMin] = useState(0);

  const minutesFromTopPx = (topPx: number) => Math.round((topPx / HOUR_HEIGHT) * 60);
  const snapMinutes = (min: number) => Math.round(min / SNAP_MIN) * SNAP_MIN;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const contentHeight = HOUR_HEIGHT * 24;

  const [resizingId, setResizingId] = useState<null | { id: string; edge: "top" | "bottom"; origStart: number; origEnd: number; }>(null);

  const getHandleZone = (hPx: number) => {
    
    return Math.max(40, Math.min(HANDLE_ZONE_PX, Math.floor(hPx * 0.5)));
  };

  const inTopHandleZone = (y: number, hPx: number) => y <= getHandleZone(hPx);
  const inBottomHandleZone = (y: number, hPx: number) => y >= hPx - getHandleZone(hPx);
  const snapResize = (min: number) => Math.round(min / RESIZE_SNAP_MIN) * RESIZE_SNAP_MIN;

  return (
    <View style={styles.container}>
      {/* 상단 헤더 */}
      <SafeAreaView edges={["top"]} style={styles.safeTop}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} style={styles.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.headerBtnText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{selectedDate}</Text>
          <View style={styles.headerBtn} />
        </View>
      </SafeAreaView>

      {/* 메인 타임라인 */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ height: contentHeight }}
        scrollEnabled={!scrollLock}
        contentInsetAdjustmentBehavior="never"
        decelerationRate="fast"
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled={false}
        overScrollMode="never"
      >
        <View style={styles.timelineRow}>
          {/* 좌측 시간 레일 */}
          <View style={[styles.leftRail, { height: contentHeight }]}>
            {HOURS.map((h) => (
              <View key={h} style={[styles.hourRow, { height: HOUR_HEIGHT }]}>
                {h < 24 && <Text style={styles.hourLabel}>{formatHour(h)}</Text>}
                <View style={styles.hourLine} />
              </View>
            ))}
          </View>

          {/* 우측 블록 캔버스 */}
          <View style={[styles.canvas, { height: contentHeight }]}>
            {HOURS.map((h) => (
              <View key={`grid-${h}`} style={[styles.gridLine, { top: h * HOUR_HEIGHT }]} />
            ))}

            {blocks.map((b) => {
              const layout = blockLayouts.get(b.id);
              if (!layout) return null;
              const { top, height } = layout;

              const handleH = getHandleZone(height);

              const responder = PanResponder.create({
                onMoveShouldSetPanResponderCapture: (e, g) => {
                  if (resizingId) return false;
                  const y = (e.nativeEvent as any).locationY ?? 0;
                  if (inTopHandleZone(y, height) || inBottomHandleZone(y, height)) return false;
                  return Math.abs(g.dy) > DRAG_THRESHOLD_PX;
                },
                onStartShouldSetPanResponderCapture: (e) => {
                  if (resizingId) return false;
                  const y = (e.nativeEvent as any).locationY ?? 0;
                  if (inTopHandleZone(y, height) || inBottomHandleZone(y, height)) return false;
                  return true;
                },
                onStartShouldSetPanResponder: (e) => {
                  if (resizingId) return false;
                  const y = (e.nativeEvent as any).locationY ?? 0;
                  if (inTopHandleZone(y, height) || inBottomHandleZone(y, height)) return false;
                  return true;
                },
                onMoveShouldSetPanResponder: (e, g) => {
                  if (resizingId) return false;
                  const y = (e.nativeEvent as any).locationY ?? 0;
                  if (inTopHandleZone(y, height) || inBottomHandleZone(y, height)) return false;
                  return Math.abs(g.dy) > DRAG_THRESHOLD_PX;
                },
                onPanResponderGrant: () => {
                  setDraggingId(b.id);
                  setDragStartTop(top);
                  setDragDurationMin(b.end - b.start);
                  dragY.setValue(0);
                  setScrollLock(true);
                },
                onPanResponderMove: Animated.event([null, { dy: dragY }], { useNativeDriver: false }),
                onPanResponderRelease: (_e, g) => {
                  const isClick = Math.abs(g.dx) < 5 && Math.abs(g.dy) < 5;
                  if (isClick) {
                    openEditModal(b);
                    setDraggingId(null);
                    setScrollLock(false);
                    return;
                  }
                  const projectedDy = Math.abs(g.vy) >= MIN_PROJECT_VY ? g.dy + g.vy * FLICK_PROJECT_PX : g.dy;
                  const newTopPx = dragStartTop + projectedDy;
                  let newStartMin = minutesFromTopPx(newTopPx);
                  newStartMin = snapMinutes(newStartMin);
                  newStartMin = clamp(newStartMin, 0, 1440 - dragDurationMin);
                  const newEndMin = newStartMin + dragDurationMin;

                  setByDate((prev) => ({
                    ...prev,
                    [selectedDate]: (prev[selectedDate] || []).map((x) =>
                      x.id === b.id ? { ...x, start: newStartMin, end: newEndMin } : x
                    ),
                  }));

                  if (newStartMin !== b.start || newEndMin !== b.end) {
                    const u = auth.currentUser;
                    if (u) {
                      const updated: Block = { ...b, start: newStartMin, end: newEndMin };
                      void saveTimeBlock(u.uid, selectedDate, updated).catch((e) =>
                        console.warn("[drag drop] Firestore 저장 실패:", e)
                      );
                    }
                  }

                  Animated.spring(dragY, { toValue: 0, useNativeDriver: false }).start(() => {
                    setDraggingId(null);
                    setScrollLock(false);
                  });
                },
                onPanResponderTerminationRequest: () => false,
                onPanResponderTerminate: () => {
                  Animated.spring(dragY, { toValue: 0, useNativeDriver: false }).start(() => {
                    setDraggingId(null);
                    setScrollLock(false);
                  });
                },
              });

              const handleTopDrag = PanResponder.create({
                onStartShouldSetPanResponder: () => true,
                onPanResponderGrant: () => {
                  setResizingId({ id: b.id, edge: "top", origStart: b.start, origEnd: b.end });
                  setScrollLock(true);
                },
                onPanResponderRelease: (_e, g) => {
                  const deltaMinRaw = minutesFromTopPx(g.dy);
                  const deltaMin = snapResize(deltaMinRaw);
                  let newStart = clamp(b.start + deltaMin, 0, b.end - RESIZE_SNAP_MIN);

                  setByDate((prev) => ({
                    ...prev,
                    [selectedDate]: (prev[selectedDate] || []).map((x) =>
                      x.id === b.id ? { ...x, start: newStart } : x
                    ),
                  }));

                  if (newStart !== b.start) {
                    const u = auth.currentUser;
                    if (u) {
                      const updated: Block = { ...b, start: newStart };
                      void saveTimeBlock(u.uid, selectedDate, updated).catch((e) =>
                        console.warn("[resize top] Firestore 저장 실패:", e)
                      );
                    }
                  }

                  setResizingId(null);
                  setScrollLock(false);
                },
                onPanResponderTerminate: () => { setResizingId(null); setScrollLock(false); },
              });

              const handleBottomDrag = PanResponder.create({
                onStartShouldSetPanResponder: () => true,
                onPanResponderGrant: () => {
                  setResizingId({ id: b.id, edge: "bottom", origStart: b.start, origEnd: b.end });
                  setScrollLock(true);
                },
                onPanResponderRelease: (_e, g) => {
                  const deltaMinRaw = minutesFromTopPx(g.dy);
                  const deltaMin = snapResize(deltaMinRaw);
                  let newEnd = clamp(b.end + deltaMin, b.start + RESIZE_SNAP_MIN, 1440);

                  setByDate((prev) => ({
                    ...prev,
                    [selectedDate]: (prev[selectedDate] || []).map((x) =>
                      x.id === b.id ? { ...x, end: newEnd } : x
                    ),
                  }));

                  if (newEnd !== b.end) {
                    const u = auth.currentUser;
                    if (u) {
                      const updated: Block = { ...b, end: newEnd };
                      void saveTimeBlock(u.uid, selectedDate, updated).catch((e) =>
                        console.warn("[resize bottom] Firestore 저장 실패:", e)
                      );
                    }
                  }

                  setResizingId(null);
                  setScrollLock(false);
                },
                onPanResponderTerminate: () => { setResizingId(null); setScrollLock(false); },
              });

              const isDragging = draggingId === b.id;
              const translateY = isDragging ? dragY : 0;

              return (
                <Animated.View
                  key={b.id}
                  {...responder.panHandlers}
                  style={[
                    styles.block,
                    { ...(layout as any), backgroundColor: b.color, transform: [{ translateY }], zIndex: isDragging ? 2 : 1 },
                  ]}
                >
                  {/* 상단/하단 핸들 */}
                  <View
                    //pointerEvents="box-only"
                    {...handleTopDrag.panHandlers}
                    style={[styles.handleTop, { height: handleH, marginTop: -Math.min(10, Math.max(0, handleH - 10)) }]}
                  >
                    <View style={{ width: 36, height: 3, borderRadius: 5, backgroundColor: "#E5E7EB", opacity: 0.9 }} />
                  </View>
                  <View
                    //pointerEvents="box-only"
                    {...handleBottomDrag.panHandlers}

                    style={[styles.handleBottom, { height: handleH, marginBottom: -Math.min(10, Math.max(0, handleH - 10)) }]}
                  >
                    <View style={{ width: 36, height: 3, borderRadius: 5, backgroundColor: "#E5E7EB", opacity: 0.9 }} />
                  </View>

                  {isDragging ? (
                    <View style={styles.movingOverlay}><Text style={styles.movingText}>이동 중</Text></View>
                  ) : (
                    <TouchableOpacity
                      style={{ flex: 1, overflow: "hidden", padding: 10 }}
                      activeOpacity={0.8}
                      delayPressIn={120}
                      onPress={() => openEditModal(b)}
                    >
                      <View style={styles.blockTitleRow}>
                        {b.isGoal && <Ionicons name="star" size={12} color="#0B1220" style={styles.blockIcon} />}
                        <Text style={styles.blockTitle} numberOfLines={1}>{b.purpose ?? "할 일"}</Text>
                      </View>
                      {(b.type || b.action) && (
                        <Text style={styles.blockSubTitle} numberOfLines={1}>
                          [{b.type}{b.action && ` / ${b.action}`}]
                        </Text>
                      )}
                      <Text style={styles.blockTime}>{toHHMM(b.start)} ~ {toHHMM(b.end)}</Text>
                    </TouchableOpacity>
                  )}
                </Animated.View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* 플로팅 버튼 */}
      <View style={styles.fabContainer}>
        <TouchableOpacity style={styles.fab} activeOpacity={0.9} onPress={openAddModal}>
          <Text style={styles.fabText}>＋</Text>
        </TouchableOpacity>
      </View>

      {/* 추가/편집 모달 */}
      <Modal visible={modalMode !== null} transparent animationType="fade" onRequestClose={closeModal}>
        <NewModalBody
          key={selectedBlock?.id || 'add'}
          mode={modalMode!}
          initialData={selectedBlock}
          onClose={closeModal}
          onSave={handleSave}
          onDelete={handleDelete}
          onAutoAdd={async (draft) => {
            // draft는 모달 폼의 현재 값(블록 스냅샷)
            // 편집모드면 그 블록을 기반으로, 추가모드면 폼의 값으로 생성
            
            const base: Block = {
              id: draft.id || makeId(), 
              start: draft.start,
              end: draft.end,
              type: draft.type,
              action: draft.action,
              purpose: draft.purpose,
              isGoal: false, 
              color: draft.color || pickColorForId(draft.id || makeId()), 
            };
            await handleAutoAdd(base);
            // 자동 생성 후 모달 닫기
            closeModal();
          }}
        />
      </Modal>

    </View>
  );
}

//  모달
const NewModalBody = ({ mode, initialData, onClose, onSave, onDelete, onAutoAdd }: {
  mode: 'add' | 'edit';
  initialData: Block | null;
  onClose: () => void;
  onSave: (block: Block) => void;
  onDelete: (id: string) => void;
  onAutoAdd: (draft: Block) => Promise<void>; // [ADD]
}) => {
  const [purpose, setPurpose] = useState(initialData?.purpose || '');
  const [type, setType] = useState(initialData?.type || '개인');
  const [action, setAction] = useState(initialData?.action || '기타');
  const [isGoal, setIsGoal] = useState(initialData?.isGoal || false);
  const [startTime, setStartTime] = useState(() => toDateFromMinutes(initialData?.start || 540));
  const [endTime, setEndTime] = useState(() => toDateFromMinutes(initialData?.end || 600));
  const [busy, setBusy] = useState(false);                   // [ADD] 로딩 표시용

  const [pickerState, setPickerState] = useState<{ visible: boolean; title: string; items: string[]; onSelect: (item: string) => void; }>
  ({ visible: false, title: '', items: [], onSelect: () => {} });

  const [timePicker, setTimePicker] = useState<'start' | 'end' | null>(null);

  const handleSavePress = () => {
    const newId = initialData?.id || makeId(); 
    onSave({
      id: newId,
      purpose, type, action, isGoal,
      start: fromDateToMinutes(startTime),
      end: fromDateToMinutes(endTime),
      color: pickColorForId(newId), 
    });
    onClose();
  };

  const handleDeletePress = () => {
    if (initialData?.id) onDelete(initialData.id);
    onClose();
  };

  const openPicker = (title: string, items: string[], onSelect: (item: string) => void) =>
    setPickerState({ visible: true, title, items, onSelect });

  const onTimeChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    const currentDate = selectedDate || (timePicker === 'start' ? startTime : endTime);
    setTimePicker(Platform.OS === 'ios' ? timePicker : null);
    if (timePicker === 'start') setStartTime(currentDate);
    else setEndTime(currentDate);
  };

  // [MOD] 자동 추가 버튼
  const handleAutoAddPress = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const newId = initialData?.id || makeId();
      const draft: Block = {
        id: newId,
        purpose,
        type,
        action,
        isGoal: false, // 자동 추가는 목표가 아님
        start: fromDateToMinutes(startTime),
        end: fromDateToMinutes(endTime),
        color: pickColorForId(newId),
      };
      await onAutoAdd(draft);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.backdrop}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalContainer}>
        <View style={styles.modalCard}>
          <View style={styles.newModalHeader}>
            <Text style={styles.modalTitle}>{mode === 'add' ? '할 일 추가' : '할 일 편집'}</Text>
            {mode === 'edit' && (
              <View style={styles.headerActions}>
                <TouchableOpacity onPress={() => setIsGoal(prev => !prev)} style={[styles.goalToggleButton, isGoal && styles.goalToggleButtonActive]}>
                  <Text style={[styles.goalToggleButtonText, isGoal && styles.goalToggleButtonTextActive]}>목표</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleDeletePress} style={styles.deleteButton}>
                  <Text style={styles.deleteButtonText}>삭제</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <Text style={styles.label}>할 일 이름</Text>
          <TextInput
            style={styles.input}
            value={purpose}
            onChangeText={setPurpose}
            placeholder="예: 운동, 업무..."
            placeholderTextColor={C.textDim}
          />

          <Text style={styles.label}>할일 유형</Text>
          <TouchableOpacity style={styles.pickerButton} onPress={() => openPicker('할일 유형 선택', TYPES, setType)}>
            <Text style={styles.pickerButtonText}>{type}</Text>
          </TouchableOpacity>

          <Text style={styles.label}>행동 유형</Text>
          <TouchableOpacity style={styles.pickerButton} onPress={() => openPicker('행동 유형 선택', ACTIONS, setAction)}>
            <Text style={styles.pickerButtonText}>{action}</Text>
          </TouchableOpacity>

          <Text style={styles.label}>시간</Text>
          <View style={styles.timeRow}>
            <TouchableOpacity style={styles.timeBtn} onPress={() => setTimePicker('start')}>
              <Text style={styles.timeBtnText}>시작 {toHHMM(fromDateToMinutes(startTime))}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.timeBtn} onPress={() => setTimePicker('end')}>
              <Text style={styles.timeBtnText}>종료 {toHHMM(fromDateToMinutes(endTime))}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footerRow}>
            {/* 자동 추가 */}
            <TouchableOpacity style={[styles.btn, styles.btnAuto]} onPress={handleAutoAddPress} disabled={busy}>
              <Text style={styles.btnAutoText}>{busy ? "생성 중..." : "할 일 자동 추가"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={onClose}>
              <Text style={styles.btnGhostText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={handleSavePress}>
              <Text style={styles.btnPrimaryText}>{mode === 'add' ? '추가' : '저장'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* 커스텀 피커 모달 */}
      <Modal transparent={true} visible={pickerState.visible} animationType="fade" onRequestClose={() => setPickerState({ ...pickerState, visible: false })}>
        <TouchableOpacity style={styles.pickerBackdrop} onPress={() => setPickerState({ ...pickerState, visible: false })}>
          <View style={styles.pickerContainer}>
            <Text style={styles.pickerTitle}>{pickerState.title}</Text>
            {pickerState.items.map(item => (
              <TouchableOpacity key={item} style={styles.pickerItem} onPress={() => { pickerState.onSelect(item); setPickerState({ ...pickerState, visible: false }); }}>
                <Text style={styles.pickerItemText}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {timePicker && (
        <DateTimePicker value={timePicker === 'start' ? startTime : endTime} mode="time" display="spinner" onChange={onTimeChange} />
      )}
    </View>
  );
};

//  24h → 12h am/pm 라벨
function formatHour(h: number) {
  const ampm = h < 12 ? "am" : "pm";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}${ampm}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  safeTop: { backgroundColor: C.bg },
  header: {
    height: 56,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerBtnText: { fontSize: 24, color: C.text, fontWeight: 'bold' },
  headerTitle: { fontSize: 16, fontWeight: "700", color: C.text },
  timelineRow: { flexDirection: "row" },
  leftRail: {
    width: LABEL_GUTTER,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: C.border,
  },
  hourRow: { paddingLeft: 8, justifyContent: "flex-start" },
  hourLabel: { fontSize: 12, color: C.textDim, marginTop: -6 },
  hourLine: {
    position: "absolute",
    left: 0, right: 0, top: 0,
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
    borderRadius: 10,
  },
  blockTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  blockIcon: {
    marginRight: 4,
  },
  blockTitle: { fontSize: 13, fontWeight: "700", color: "#0B1220", flexShrink: 1 },
  blockSubTitle: { fontSize: 11, fontWeight: "500", color: "#0B1220", opacity: 0.8, marginTop: 2 },
  blockTime: { fontSize: 12, color: "#0B1220", opacity: 0.9, marginTop: 2 },
  movingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.18)",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  movingText: {
    color: "#0B1220",
    fontWeight: "800",
    fontSize: 14,
    backgroundColor: "#E5E7EB",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  fabContainer: {
    position: "absolute",
    right: 16,
    bottom: 22,
    alignItems: 'center',
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  fabText: { color: "#0B1220", fontSize: 26, fontWeight: "800", marginTop: -2 },

  handleTop: {
    position: "absolute", top: 0, left: 0, right: 0, height: 28, marginTop: -8, justifyContent: "center", alignItems: "center", zIndex: 3,
  },
  handleBottom: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: 28, marginBottom: -8, justifyContent: "center", alignItems: "center", zIndex: 3,
  },
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  goalToggleButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  goalToggleButtonActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  goalToggleButtonText: {
    color: C.textDim,
    fontWeight: 'bold',
    fontSize: 14,
  },
  goalToggleButtonTextActive: {
    color: 'white',
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
    borderRadius: 12, // flex: 1 제거
    paddingVertical: 14,
    alignItems: "center",
    paddingHorizontal: 16, // 좌우 패딩 추가
  },
  btnGhost: { backgroundColor: C.border, flex: 1 }, // 취소 버튼은 남은 공간 차지
  btnGhostText: { color: C.text, fontWeight: "700" },
  btnPrimary: { backgroundColor: C.primary, flex: 1 }, // 저장 버튼도 남은 공간 차지
  btnPrimaryText: { color: "#FFF", fontWeight: "bold" },
  //  자동 추가 버튼 스타일
  btnAuto: {
      backgroundColor: C.secondary, // 다른 색상 사용
  },
  btnAutoText: {
      color: "#FFF", // 흰색 텍스트
      fontWeight: 'bold',
      fontSize: 14, // 텍스트 크기 조정 (선택 사항)
  },

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
