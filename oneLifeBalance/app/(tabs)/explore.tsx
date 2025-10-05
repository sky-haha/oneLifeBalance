import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Modal, KeyboardAvoidingView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import Slider from "@react-native-community/slider";

type ActiveModal = null | "sleep" | "work" | "goal"; //널은 닫힘, 모달 타입 3개, 수면/업무/목표

export default function ExploreScreen() { 
  const [active, setActive] = useState<ActiveModal>(null); //널은 닫힘, 나머진 각 모달 열림

  // 수면 시간(매일 동일), 각각 수면 시작/수면 종료 시간 및 시간 피커
  const [sleepStart, setSleepStart] = useState(() => setHM(23, 0));
  const [sleepEnd, setSleepEnd] = useState(() => setHM(6, 0));
  const [showSleepStartPicker, setShowSleepStartPicker] = useState(false);
  const [showSleepEndPicker, setShowSleepEndPicker] = useState(false);

  // 업무 시간(요일 선택 가능), 각각 업무 시작/종료 및 시간 피커, 그리고 일 선택, 기본적으로 토/일은 비활성
  const [workStart, setWorkStart] = useState(() => setHM(8, 0));
  const [workEnd, setWorkEnd] = useState(() => setHM(17, 0));
  const [showWorkStartPicker, setShowWorkStartPicker] = useState(false);
  const [showWorkEndPicker, setShowWorkEndPicker] = useState(false);
  const [workDays, setWorkDays] = useState<boolean[]>([true, true, true, true, true, false, false]);

  // 목표 시간(원하는 시간 설정하는 방식)
  const [goalHours, setGoalHours] = useState(2);

  //날짜를 문자열로 표시
  const fmtTime = (d: Date) => {
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  };
  //선택 요일을 월,화 등 형태로 합치며 일 날짜가 바뀔 때만 재계산
  const workDaysLabel = useMemo(() => {
    const labels = ["월", "화", "수", "목", "금", "토", "일"];
    const picked = labels.filter((_, i) => workDays[i]);
    return picked.length ? picked.join(" · ") : "선택 없음";
  }, [workDays]);

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollInner}>
      {/* 타이틀 */}
      <Text style={styles.title}>시간 유형</Text>

      {/* 상단 카드 외형 */}
      <View style={styles.card}>
        {/* 시간 유형 설정 안내 */}
        <TouchableOpacity style={styles.menuBtn} activeOpacity={0.9} onPress={() => {}}>
          <Text style={styles.menuBtnText}>시간 유형 설정</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

        {/* 핵심 3버튼: 수면/업무/목표 */}
        <View style={styles.stack}>
          <TouchableOpacity style={[styles.primaryBtn, styles.shadow]} activeOpacity={0.9} onPress={() => setActive("sleep")}>
            <Text style={styles.primaryBtnText}>수면 시간</Text>
            <Text style={styles.subText}>
              {fmtTime(sleepStart)} ~ {fmtTime(sleepEnd)} · 매일
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.primaryBtn, styles.shadow]} activeOpacity={0.9} onPress={() => setActive("work")}>
            <Text style={styles.primaryBtnText}>업무 시간</Text>
            <Text style={styles.subText}>
              {fmtTime(workStart)} ~ {fmtTime(workEnd)} · {workDaysLabel}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.primaryBtn, styles.shadow]} activeOpacity={0.9} onPress={() => setActive("goal")}>
            <Text style={styles.primaryBtnText}>목표 시간</Text>
            <Text style={styles.subText}>하루 {goalHours}시간</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 수면 시간 클릭 시 나오는 모달 */}
      <BaseModal
        visible={active === "sleep"}
        title="수면 시간"
        onClose={() => setActive(null)}
        onPrimary={() => setActive(null)}
      >
        <Text style={styles.modalHint}>매일 동일하게 적용되는 수면 시간입니다</Text>

        {/*시작 시간 설정 피커 표시 및 스피너 표시*/}
        <Section title="시작">
          <TouchableOpacity
            style={styles.input}
            activeOpacity={0.9}
            onPress={() => {
              setShowSleepStartPicker(true);
              setShowSleepEndPicker(false);
            }}
          >
            <View style={styles.rowBetween}>
              <Text style={styles.inputText}>{fmtTime(sleepStart)}</Text>
              <Ionicons name="time-outline" size={18} color="#9ca3af" />
            </View>
          </TouchableOpacity>
          {showSleepStartPicker && (
            <DateTimePicker
              value={sleepStart}
              mode="time"
              is24Hour
              display={Platform.select({ ios: "spinner", android: "default" })}
              onChange={(_, d) => {
                if (d) setSleepStart(d);
                if (Platform.OS === "android") setShowSleepStartPicker(false);
              }}
            />
          )}
        </Section>
        {/*종료 시간 설정 피커 표시 및 스피너 표시*/}
        <Section title="종료">
          <TouchableOpacity
            style={styles.input}
            activeOpacity={0.9}
            onPress={() => {
              setShowSleepEndPicker(true);
              setShowSleepStartPicker(false);
            }}
          >
            <View style={styles.rowBetween}>
              <Text style={styles.inputText}>{fmtTime(sleepEnd)}</Text>
              <Ionicons name="time-outline" size={18} color="#9ca3af" />
            </View>
          </TouchableOpacity>
          {showSleepEndPicker && (
            <DateTimePicker
              value={sleepEnd}
              mode="time"
              is24Hour
              display={Platform.select({ ios: "spinner", android: "default" })}
              onChange={(_, d) => {
                if (d) setSleepEnd(d);
                if (Platform.OS === "android") setShowSleepEndPicker(false);
              }}
            />
          )}
        </Section>
      </BaseModal>

      {/* 업무 시간 모달*/}
      <BaseModal
        visible={active === "work"}
        title="업무 시간"
        onClose={() => setActive(null)}
        onPrimary={() => setActive(null)}
      >
        <Text style={styles.modalHint}>선택한 요일에만 적용됩니다</Text>

       {/*시작 시간 설정 피커 표시 및 스피너 표시*/}
        <Section title="시작">
          <TouchableOpacity
            style={styles.input}
            activeOpacity={0.9}
            onPress={() => {
              setShowWorkStartPicker(true);
              setShowWorkEndPicker(false);
            }}
          >
            <View style={styles.rowBetween}>
              <Text style={styles.inputText}>{fmtTime(workStart)}</Text>
              <Ionicons name="time-outline" size={18} color="#9ca3af" />
            </View>
          </TouchableOpacity>
          {showWorkStartPicker && (
            <DateTimePicker
              value={workStart}
              mode="time"
              is24Hour
              display={Platform.select({ ios: "spinner", android: "default" })}
              onChange={(_, d) => {
                if (d) setWorkStart(d);
                if (Platform.OS === "android") setShowWorkStartPicker(false);
              }}
            />
          )}
        </Section>

       {/*종료 시간 설정 피커 표시 및 스피너 표시*/}
        <Section title="종료">
          <TouchableOpacity
            style={styles.input}
            activeOpacity={0.9}
            onPress={() => {
              setShowWorkEndPicker(true);
              setShowWorkStartPicker(false);
            }}
          >
            <View style={styles.rowBetween}>
              <Text style={styles.inputText}>{fmtTime(workEnd)}</Text>
              <Ionicons name="time-outline" size={18} color="#9ca3af" />
            </View>
          </TouchableOpacity>
          {showWorkEndPicker && (
            <DateTimePicker
              value={workEnd}
              mode="time"
              is24Hour
              display={Platform.select({ ios: "spinner", android: "default" })}
              onChange={(_, d) => {
                if (d) setWorkEnd(d);
                if (Platform.OS === "android") setShowWorkEndPicker(false);
              }}
            />
          )}
        </Section>

        {/* 업무 모달에만 있는 요일 선택, 칩 클릭 시 해당 인덱스 값 토글 */}
        <Section title="요일">
          <View style={styles.chips}>
            {["월", "화", "수", "목", "금", "토", "일"].map((d, i) => {
              const on = workDays[i];
              return (
                <TouchableOpacity
                  key={d}
                  style={[styles.chip, on && styles.chipActive]}
                  onPress={() => {
                    const next = [...workDays];
                    next[i] = !next[i];
                    setWorkDays(next);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.chipText, on && styles.chipTextActive]}>{d}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Section>
      </BaseModal>

      {/* 목표 시간 모달 */}
      <BaseModal
        visible={active === "goal"}
        title="목표 시간"
        onClose={() => setActive(null)}
        onPrimary={() => setActive(null)}
      >
        <Text style={styles.modalHint}>목표에 할애하고 싶은 시간을 설정하세요.</Text>

        <View style={{ marginTop: 12 }}>
          <View style={styles.goalRow}>
            <Text style={styles.goalValue}>{goalHours}</Text>
            <Text style={styles.goalUnit}>시간 / 일</Text>
          </View>
          <Slider
            value={goalHours}
            onValueChange={setGoalHours}
            minimumValue={0}
            maximumValue={8}
            step={0.5}
            minimumTrackTintColor="#3b82f6"
            maximumTrackTintColor="#374151"
            thumbTintColor="#93c5fd"
          />
        </View>
      </BaseModal>
    </ScrollView>
  );
}

//모달 외형
function BaseModal({ visible, title, onClose, onPrimary,children }: 
  React.PropsWithChildren<{ visible: boolean; title: string; onClose: () => void; onPrimary: () => void;
}>) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ width: "100%", alignItems: "center" }}
        >
          <View style={styles.modalCard}>
            {/* 헤더 */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{title}</Text>
              <TouchableOpacity onPress={onClose} style={styles.headerXbtn} activeOpacity={0.85}>
                <Ionicons name="close" size={20} color="#e5e7eb" />
              </TouchableOpacity>
            </View>

            {/* 바디 */}
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
              {children}
            </ScrollView>

            {/* ㅍ터 */}
            <View style={styles.footer}>
              <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={onClose} activeOpacity={0.9}>
                <Text style={styles.btnGhostText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={onPrimary} activeOpacity={0.9}>
                <Text style={styles.btnPrimaryText}>저장</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

//모든 필드 그룹에 동일한 라벨 및 간격 적용 래퍼
function Section({ title, children }: React.PropsWithChildren<{ title: string }>) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.label}>{title}</Text>
      <View style={{ marginTop: 8 }}>{children}</View>
    </View>
  );
}

//피커 초기값 설정
function setHM(h: number, m: number) {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

// 기타 스타일들
const styles = StyleSheet.create({
  // 화면 기본
  scrollInner: { padding: 20, paddingTop: 40, backgroundColor: "#000" },
  title: { color: "#E5E7EB", fontSize: 28, fontWeight: "800", marginTop: 24, marginBottom: 24 },

  // 카드
  card: {
    backgroundColor: "#0F172A",
    borderRadius: 18,
    padding: 18,
    borderColor: "#111827",
    borderWidth: 1,
  },

  menuBtn: {
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "#0B1220",
  },
  menuBtnText: { color: "#E5E7EB", fontSize: 15, fontWeight: "700" },

  divider: { height: 1, backgroundColor: "#111827", marginVertical: 14, opacity: 0.7 },
  stack: { gap: 12 },

  primaryBtn: { backgroundColor: "#3B82F6", paddingVertical: 14, borderRadius: 14, alignItems: "center" },
  primaryBtnText: { color: "white", fontWeight: "700", fontSize: 16 },
  subText: { color: "#DBEAFE", marginTop: 4, fontSize: 12 },

  shadow: {
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    ...Platform.select({ android: { elevation: 4 } }),
  },

//모달 스타일
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#141414",       
    borderColor: "#232323",           
    borderWidth: 2,               
    borderRadius: 16,                   
    overflow: "hidden",
  },
  modalHeader: {
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  modalTitle: { color: "#e5e7eb", fontSize: 18, fontWeight: "700", flex: 1 },
  headerXbtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },

  // 푸터
  footer: { flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingBottom: 16, marginTop: 2 },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  btnGhost: { borderWidth: 1, borderColor: "#374151", backgroundColor: "#0f0f0f" },
  btnGhostText: { color: "#cbd5e1", fontWeight: "700" },
  btnPrimary: { backgroundColor: "#3b82f6" },
  btnPrimaryText: { color: "#0b1220", fontWeight: "800" },

  // 입력/칩
  label: { color: "#cbd5e1", fontSize: 13, marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: "#0f0f0f",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  inputText: { color: "#e5e7eb", fontSize: 16, fontWeight: "700" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalHint: { color: "#9ca3af", fontSize: 12 },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    backgroundColor: "#0f0f0f",
  },
  chipActive: { borderColor: "#3b82f6", backgroundColor: "#1f2937" },
  chipText: { color: "#9ca3af", fontWeight: "600" },
  chipTextActive: { color: "#e5e7eb" },

  // 목표 시간 슬라이더 표시
  goalRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginBottom: 6 },
  goalValue: { color: "#fff", fontSize: 28, fontWeight: "800" },
  goalUnit: { color: "#9ca3af", fontSize: 14 },
});
