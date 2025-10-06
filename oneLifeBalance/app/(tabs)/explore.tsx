import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Platform, Modal, KeyboardAvoidingView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";

type Category = "sleep" | "work" | "goal"; //수면/업무/목표 3가지 카테고리의 문자열 리터럴 타입
type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6; //각 날짜들의 인덱스 타입

type TimeBlock = { id: string; days: boolean[]; start: Date; end: Date; };// id는 고유 키, days는 날짜 배열, start/end는 시작,종료 시간

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"]; // 요일 표기용 라벨들

const fmtTime = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; //시간 문자열 포맷

const daysToLabel = (arr: boolean[]) => { //true인 요일만 골라 월-화 등으로 합침, 전부면 매일, 하나도 없으면 요일 미지정
  const list = DAY_LABELS.filter((_, i) => arr[i]);
  return list.length === 7 ? "매일" : list.length ? list.join("·") : "요일 미지정";
};

function setHM(h: number, m: number) { //오늘 날짜 기준으로 시/분 지정된 Date 생성
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

export default function ExploreScreen() { //모달 제어 함수
  const [active, setActive] = useState<null | Category>(null);

  // 여기에 목록 데이터들이 담김
  const [sleepBlocks] = useState<TimeBlock[]>([]); // 수면 시간 데이터 
  const [workBlocks] = useState<TimeBlock[]>([]);  // 업무 시간 데이터 
  const [goalBlocks] = useState<TimeBlock[]>([]);  // 목표 시간 데이터 

  //모달 하단 요일 필터 관련, -1이면 전체선택, 0~6이면 해당요일 표시
  const [filterDay, setFilterDay] = useState<number>(-1);

  // + 눌렀을 때 뜨는 추가 모달을 제어하는 상태들 정의, 예시 표기 위해 초기값 잡아놓음
  const [addOpen, setAddOpen] = useState(false); //열림/닫힘 스위치
  const [addForCategory, setAddForCategory] = useState<Category>("sleep"); //카테고리 확인
  const [addStart, setAddStart] = useState<Date>(() => setHM(9, 0)); 
  const [addEnd, setAddEnd] = useState<Date>(() => setHM(18, 0)); //시작/종료 시간
  const [addDays, setAddDays] = useState<boolean[]>([true, true, true, true, true, false, false]); //날짜
  const [showAddStartPicker, setShowAddStartPicker] = useState(false); 
  const [showAddEndPicker, setShowAddEndPicker] = useState(false); //시작/종료 시간 피커

  //카테고리 모달, 다른 모달 열려있으면 먼저 닫고 필터 리셋 후 해당 모달 활성화
  const openCategoryModal = (cat: Category) => {
    if (addOpen) closeAddModal(false);
    setFilterDay(-1);
    setActive(cat);
  };

  //+버튼 클릭 시 위에서 정의한 상태 제거 및 초기화 함수
  const openAdd = (cat: Category) => {
    setActive(null);
    setAddForCategory(cat);
    setAddStart(setHM(9, 0));
    setAddEnd(setHM(18, 0));
    setAddDays([true, true, true, true, true, false, false]); 
    setShowAddStartPicker(false);
    setShowAddEndPicker(false); //기존 모달 상태 초기회
    setAddOpen(true); //추가 모달 열기
  };

  //닫기 모달
  const closeAddModal = (reopenCategory = true) => {
    setShowAddStartPicker(false); //ui 상태 정리
    setShowAddEndPicker(false);
    setAddOpen(false);
    if (reopenCategory) setActive(addForCategory); //조건부로 이전 모달 다시 열기
  };

  //목록에 있는 것들 저장하지 않고 닫기만 함
  const confirmAddWithoutSaving = () => {
    closeAddModal(true);
  };

  //filterday 기준으로 선택된 요일 칩을 필터링해, 각 시간 블록 배열에서 해당일이 포함된 항목만 보여줌
  const filteredBlocks = (cat: Category) => {
    const src = cat === "sleep" ? sleepBlocks : cat === "work" ? workBlocks : goalBlocks;
    if (filterDay === -1) return src;
    return src.filter((b) => b.days[filterDay as DayIndex]);
  };

  //카테고리 -> 한글 타이틀 매핑
  const catTitle = (cat: Category) => (cat === "sleep" ? "수면 시간" : cat === "work" ? "업무 시간" : "목표 시간");

  //렌더    
  return ( //전체 화면 컨테이너
    <View style={{ flex: 1, backgroundColor: "#000" }}> 
      <ScrollView
        style={{ flex: 1, backgroundColor: "#000" }}                  //  스크롤 영역 배경
        contentContainerStyle={{ padding: 20, paddingTop: 40, flexGrow: 1 }} //  빈 공간까지 채움
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>시간 유형</Text>

        {/*카드 컨테이너*/}
        <View style={styles.card}>
          <Pressable style={styles.menuBtn} onPress={() => {}} android_ripple={{ color: "transparent" }}>
            <Text style={styles.menuBtnText}>시간 유형 설정</Text>
          </Pressable>
           {/*구분선*/}
          <View style={styles.divider} />

           {/*수면 시간 설정 버튼*/}
          <View style={styles.stack}>
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, styles.shadow, pressed && Platform.OS === "ios" ? { opacity: 0.9 } : null]} //버튼
              onPress={() => openCategoryModal("sleep")}
              android_ripple={{ color: "transparent" }}
            >
              <Text style={styles.primaryBtnText}>수면 시간</Text>
            </Pressable>

            {/*업무 시간 설정 버튼*/}
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, styles.shadow, pressed && Platform.OS === "ios" ? { opacity: 0.9 } : null]}
              onPress={() => openCategoryModal("work")}
              android_ripple={{ color: "transparent" }}
            >
              <Text style={styles.primaryBtnText}>업무 시간</Text>
            </Pressable>

            {/*목표 시간 설정 버튼*/}
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, styles.shadow, pressed && Platform.OS === "ios" ? { opacity: 0.9 } : null]}
              onPress={() => openCategoryModal("goal")}
              android_ripple={{ color: "transparent" }}
            >
              <Text style={styles.primaryBtnText}>목표 시간</Text>
            </Pressable>
          </View>
        </View>

        {/* 카테고리별 모달 */}
        {(["sleep", "work", "goal"] as Category[]).map((cat) =>
          active === cat ? ( // 모달 제목을 수면/업무/목표로 표시 및 닫기/확인 버튼
            <BaseModal key={cat} title={catTitle(cat)} onClose={() => setActive(null)} onPrimary={() => setActive(null)}>
              {/* 아직 데이터추가가 없어서 설정된 시간 없다고 뜸, 원래는 설정된 시간 없으면 뜨는 문구 */}
              <View style={{ gap: 10 }}>
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>아직 설정된 시간이 없습니다.</Text>
                </View>
              </View>

              {/* + 버튼 (모달 창 열리고 피커만 보이며, 버튼 눌러도 저장안됨 */}
              <View style={{ alignItems: "center", marginVertical: 14 }}>
                <Pressable onPress={() => openAdd(cat)} style={styles.plusBtn} android_ripple={{ color: "transparent" }}>
                  <Ionicons name="add" size={20} color="#0b1220" />
                </Pressable>
              </View>

              {/* 요일 필터 */}
              <View style={styles.filterRow}>
                <Chip label="전체" active={filterDay === -1} onPress={() => setFilterDay(-1)} />
                {DAY_LABELS.map((d, i) => (
                  <Chip key={d} label={d} active={filterDay === i} onPress={() => setFilterDay(i)} />
                ))}
              </View>
            </BaseModal>
          ) : null
        )}

        {/*  UI만 있음. 확인눌러도 저장안함 */}
        {addOpen ? (
          <AddModal title={`${catTitle(addForCategory)} 추가`} onClose={() => closeAddModal(true)}> {/*수면 시간 추가 등 제목, 닫기버튼 누르면 모달 닫힘*/}
            {/* 시작, 피커 표시 */}
            <Text style={styles.label}>시작</Text>
            <Pressable
              style={styles.input}
              onPress={() => {
                setShowAddStartPicker(true);
                setShowAddEndPicker(false);
              }}
              android_ripple={{ color: "transparent" }}
            >
              {/*내부 레이아웃, 좌측 시간 텍스트 및 우측 시계 아이콘*/}
              <View style={styles.rowBetween}>
                <Text style={styles.inputText}>{fmtTime(addStart)}</Text>
                <Ionicons name="time-outline" size={18} color="#9ca3af" />
              </View>
            </Pressable>
            {/*실제 시간 선택 피커*/}
            {showAddStartPicker && (
              <DateTimePicker
                value={addStart} //현재 선택된 시간 값
                mode="time" //시간선택 모드 변경
                is24Hour 
                display={Platform.select({ ios: "spinner", android: "default" })} //ios는 스피너, 안드는 기본형으로
                //시간 변경 시 호출되어 새 시간으로 상태 업데이트, 안드ㅡ이 경우 자동으로 피커 닫음
                onChange={(_, d) => {
                  if (d) setAddStart(d);
                  if (Platform.OS === "android") setShowAddStartPicker(false);
                }}
              />
            )}

            {/* 종료시간 선택 */}
            <Text style={[styles.label, { marginTop: 12 }]}>종료</Text>
            <Pressable
              style={styles.input} //input 스타일
              onPress={() => { //클릭 시 실행
                setShowAddEndPicker(true); //종료시간 피커 열고
                setShowAddStartPicker(false); //시작시간 피커 닫음
              }}
              android_ripple={{ color: "transparent" }}
            >
              <View style={styles.rowBetween}>
                <Text style={styles.inputText}>{fmtTime(addEnd)}</Text>
                <Ionicons name="time-outline" size={18} color="#9ca3af" />
              </View>
            </Pressable>
            {/*시간 선택 피커*/}
            {showAddEndPicker && (
              <DateTimePicker
                value={addEnd} 
                mode="time"
                is24Hour
                display={Platform.select({ ios: "spinner", android: "default" })}
                onChange={(_, d) => {
                  if (d) setAddEnd(d);
                  if (Platform.OS === "android") setShowAddEndPicker(false);
                }}
              />
            )}

            {/* 요일 선택 */}
            <Text style={[styles.label, { marginTop: 12 }]}>요일</Text>
            <View style={styles.chips}>
              {DAY_LABELS.map((d, i) => { //월화수목금토일 순회
                const on = addDays[i]; //각 요일 활성상태, true면 선택된거
                return (
                  <Chip
                    key={d} //각 요일 고유 식별자
                    label={d} //칩에 표시될 텍스트
                    active={on} //칩의 현재 선택 여부 전달
                    onPress={() => { //칩 선택 시 실행
                      const next = [...addDays]; //기존 addDAYS 복사
                      next[i] = !next[i]; //눌린 요일 선택상태 강조
                      setAddDays(next); //새 상태로 업데이트
                    }}
                  />
                );
              })}
            </View>

            {/* 취소/확인ㅂ ㅓ튼 */}
            <View style={styles.footer}>
              <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => closeAddModal(true)} android_ripple={{ color: "transparent" }}>
                <Text style={styles.btnGhostText}>취소</Text>
              </Pressable>
              <Pressable style={[styles.btn, styles.btnPrimary]} onPress={confirmAddWithoutSaving} android_ripple={{ color: "transparent" }}>
                <Text style={styles.btnPrimaryText}>확인</Text>
              </Pressable>
            </View>
          </AddModal>
        ) : null}
      </ScrollView>
    </View>
  );
}

// 모달 컴포넌트들
function BaseModal({ title, onClose, onPrimary, children,}: //제목, 닫기 함수, 확인버튼 함수, 동적 콘텐츠
  React.PropsWithChildren<{ title: string; onClose: () => void; onPrimary: () => void;
}>) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} //항상 true로, 배경 투명하게, 페이드 잇/아웃 애니메이션, 안드로이드 뒤로가기 버튼
      statusBarTranslucent presentationStyle="overFullScreen"> 
      {/*반투명 배경*/}
      <View style={styles.backdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%", alignItems: "center" }}>
          <View style={styles.modalCard}>
            {/*헤더*/}
            <View style={styles.modalHeader}>
              {/*모달 제목(예: 수면시간)*/}
              <Text style={styles.modalTitle}>{title}</Text>
              <Pressable onPress={onClose} style={styles.headerXbtn} android_ripple={{ color: "transparent" }}>
                <Ionicons name="close" size={20} color="#e5e7eb" />
              </Pressable>
            </View>
            {/*본문*/}
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
              {children}
            </ScrollView>
            {/*푸터 영역(하단 취소/확인버튼)*/}
            <View style={styles.footer}>
              <Pressable style={[styles.btn, styles.btnGhost]} onPress={onClose} android_ripple={{ color: "transparent" }}>
                <Text style={styles.btnGhostText}>닫기</Text>
              </Pressable>
              <Pressable style={[styles.btn, styles.btnPrimary]} onPress={onPrimary} android_ripple={{ color: "transparent" }}>
                <Text style={styles.btnPrimaryText}>확인</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

//위 모달 컴포넌트와 동일, 하단 푸터영역 없는 간결한 버전
function AddModal({
  title,
  onClose,
  children,
}: React.PropsWithChildren<{ title: string; onClose: () => void }>) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}
      statusBarTranslucent presentationStyle="overFullScreen">
      <View style={styles.backdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%", alignItems: "center" }}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{title}</Text>
              <Pressable onPress={onClose} style={styles.headerXbtn} android_ripple={{ color: "transparent" }}>
                <Ionicons name="close" size={20} color="#e5e7eb" />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

//그외 보조 컴포넌트
function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { //요일 선택 칩, 선택여부 및 클릭시 함수
  return (
    <Pressable
      onPress={onPress} //칩 클릭 시 상위 컴포넌트에서 전달된 함수들 실행
      focusable={false} // 안드로이드 포커스 테두리 방지
      android_ripple={{ color: "transparent" }} // 잔상 제거
      style={({ pressed }) => [ //스타일은 선택과 비선택 상태에 따라 다르게 처리
        styles.chip,
        active && styles.chipActive,
        pressed && Platform.OS === "ios" ? { opacity: 0.8 } : null,
      ]}
      accessibilityRole="button"
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

//기타 스타일들
const styles = StyleSheet.create({
  scrollInner: { /* 스크롤뷰 내부 내용이 화면 아래까지 가도록 조절용으로 사용중 */ },
  title: { color: "#E5E7EB", fontSize: 28, fontWeight: "800", marginTop: 24, marginBottom: 24 },

  card: { backgroundColor: "#0F172A", borderRadius: 18, padding: 18, borderColor: "#111827", borderWidth: 1 },

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

  // 모달 공통
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 16 },
  modalCard: { width: "100%", maxWidth: 520, backgroundColor: "#141414", borderColor: "#232323", borderWidth: 2, borderRadius: 16, overflow: "hidden" },
  modalHeader: { marginBottom: 8, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 14 },
  modalTitle: { color: "#e5e7eb", fontSize: 18, fontWeight: "700", flex: 1 },
  headerXbtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },

  // 입력/칩
  label: { color: "#cbd5e1", fontSize: 13, marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: "#0f0f0f", borderWidth: 1, borderColor: "#2a2a2a", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12 },
  inputText: { color: "#e5e7eb", fontSize: 16, fontWeight: "700" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  chip: { paddingHorizontal: 10, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: "#2a2a2a", backgroundColor: "#0f0f0f" }, // ✔ 오타 수정
  chipActive: { borderColor: "#3b82f6", backgroundColor: "#1f2937" },
  chipText: { color: "#9ca3af", fontWeight: "600" },
  chipTextActive: { color: "#e5e7eb" },

  // 리스트 카드
  blockCard: { borderWidth: 1, borderColor: "#2a2a2a", borderRadius: 12, padding: 12, backgroundColor: "#0f0f0f" },
  blockTime: { color: "#e5e7eb", fontWeight: "700", marginLeft: 6 },
  blockDays: { color: "#9ca3af", marginTop: 4 },

  emptyCard: { borderWidth: 1, borderColor: "#2a2a2a", borderRadius: 12, padding: 16, alignItems: "center", backgroundColor: "#0f0f0f" },
  emptyText: { color: "#9ca3af" },

  // + 버튼
  plusBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#3b82f6", alignItems: "center", justifyContent: "center" },

  // 하단 요일 필터
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },

  // 공통 footer
  footer: { flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingBottom: 16, marginTop: 2 },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  btnGhost: { borderWidth: 1, borderColor: "#374151", backgroundColor: "#0f0f0f" },
  btnGhostText: { color: "#cbd5e1", fontWeight: "700" },
  btnPrimary: { backgroundColor: "#3b82f6" },
  btnPrimaryText: { color: "#0b1220", fontWeight: "800" },
});
