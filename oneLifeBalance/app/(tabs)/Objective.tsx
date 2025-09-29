import React, { useMemo, useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Platform, KeyboardAvoidingView, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import Slider from "@react-native-community/slider"; //리액트 컴포넌트들

// 상태 나타내기 위한 임시 로컬 타입/데이터
type Goal = {
  id: string; //식별자
  title: string; //이름
  deadline: Date | null; //데드라인, 초기상태엔 없을수도 있으니 null도 있음
  minH: number; //최소시간
  maxH: number; //최대시간
  totalH: string; //원하는 총 시간
  daySet: string[]; //가능한 날짜
};

export default function ObjectiveScreen() { //오브젝티브 페이지의 메인 화면
  const [open, setOpen] = useState(false);

  // 상태 나타내기 위한 임시 로컬 타입/데이터
  const [goals, setGoals] = useState<Goal[]>([
    {
      id: "g1",
      title: "설정한 목표가",
      deadline: null,
      minH: 1.0,
      maxH: 2.0,
      totalH: "30",
      daySet: ["월", "수", "금"],
    },
    {
      id: "g2",
      title: "이렇게 보임",
      deadline: new Date(),
      minH: 0.5,
      maxH: 3.0,
      totalH: "50",
      daySet: ["화", "목"],
    },
  ]); 

  const [editOpen, setEditOpen] = useState(false); //편집 모달 열림/닫힘여부 상태
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null); //어떤 목표를 편집하는지를 확인하는 상태

  return (
    <View style={styles.container}>
      {/* 설정한 목표들 확인 */}
      <ScrollView contentContainerStyle={styles.listContainer}>
        {/* 할일을 목록으로 렌더링, 각 카드 탭하면 해당 */}
        {goals.map((g) => ( //상태 goals:Goal[]를 반복 렌더, id, title 등
          <TouchableOpacity
            key={g.id} //리액트가 항목 안정적으로 식별 가능하게끔, 각 항목의 id 불러오게끔 함
            style={styles.card}
            activeOpacity={0.9} //눌렀을때 투명도
            onPress={() => {
              setSelectedGoal(g);         //탭한 카드를 편집 대상으로 지정
              setEditOpen(true);          //편집 모달 오픈
            }}
          >
            <Text style={styles.cardTitle}>{g.title}</Text> 
            {/* 오브젝티브 메인에서, 각 카드들에 대한 간단 요약 */}
            <Text style={{ color: "#9ca3af", marginTop: 6 }}>
              {g.minH.toFixed(1)}h ~ {g.maxH.toFixed(1)}h • 총 {g.totalH}h • {g.daySet.join(" ")}
            </Text>
          </TouchableOpacity>
        ))}

        {/* 임시 여백 */}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* 우하단 추가버튼 */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setOpen(true)} //누르면 모달 열림
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#111" />
      </TouchableOpacity>

      {/* 추가 모달 창 */}
      <Modal
        visible={open}
        animationType="fade" //뒷배경 약간 흐리게
        transparent
        onRequestClose={() => setOpen(false)}
      >
        {/*키보드 문제 해결*/}
        <View style={styles.backdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ width: "100%", alignItems: "center" }}
          >
            <View style={styles.modalCard}> {/*모달*/}
              {/* 목표 추가 시, 해당 모달은 create 모드 */}
              <ModalBody
                onClose={() => setOpen(false)}
                mode="create"                
                initialValues={null}       
                onPressPrimary={() => {}}     
                onPressDelete={() => {}}       // 추가모드에선 삭제버튼 없음
              />
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* 편집 모달 창 */}
      <Modal
        visible={editOpen} //열림/닫힘 스위치, true면 모달 표시, false면 숨김. 상태 editopen이 표시 여부 결정
        animationType="fade"
        transparent
        onRequestClose={() => setEditOpen(false)} //닫힐 떄 editopen을 false로 만들어서 UI 관리
      >
        <View style={styles.backdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ width: "100%", alignItems: "center" }}
          >
            <View style={styles.modalCard}>
              <ModalBody
                onClose={() => setEditOpen(false)}
                mode="edit"                      // 편집 모드 설정
                initialValues={selectedGoal}     // 선택해 놓은 각종 요소의 값이 입력칸에 채워진 채 열림
                onPressPrimary={() => {}}        // 형식상 수정 버튼, 아직 미구현
                onPressDelete={() => {}}         // 형식상 삭제 버튼, 아직 미구현
              />
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

//모달 내부 내용
function ModalBody({
  onClose, //닫기, X/취소/완료버튼 누르면 닫힘
  mode = "create", // 기본값은 create, edit이면 편집모드로 열림
  initialValues, // create에선 빈 상태로, edit이면 해당 카드의 목표가 열림
  onPressPrimary, //주요버튼
  onPressDelete, //삭제버튼
}: {
  onClose: () => void;
  mode?: "create" | "edit"; //모드는 추가/편집 둘중 하나
  initialValues?: Goal | null; //값들은 설정된 값/없음 둘중 하나
  onPressPrimary?: () => void;
  onPressDelete?: () => void;
}) {
  // 입력 관련 로컬 상태
  const [title, setTitle] = useState<string>(""); // 목표 이름
  const [deadline, setDeadline] = useState<Date | null>(null); //데드라인 날짜

  // 시간 설정 
  const [minH, setMinH] = useState<number>(1.0); //최소값
  const [maxH, setMaxH] = useState<number>(2.0); //최대값

  const [daySet, setDaySet] = useState<string[]>([]); //선택한 요일 목록, 문자열 배열로

  const deadlineLabel = useMemo(() => { //데드라인 설정
    if (!deadline) return "날짜 선택"; //미선택 시 텍스트 안내문구
    const yy = String(deadline.getFullYear()).slice(2);          // 년도. YY
    const mm = String(deadline.getMonth() + 1).padStart(2, "0"); // 월, 01~12
    const dd = String(deadline.getDate()).padStart(2, "0");      // 일, 01~31
    return `${yy}-${mm}-${dd}`; //표시 문자열
  }, [deadline]);

  const toggleDay = (d: string) => { //요일 토글 핸들러, 토글하려는 요일
    setDaySet((prev) => //상태를 함수형(updater)로
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d] //이전 상태배열 prev에 d가 이미 있으면 제거하거나, 없으면 끝에 추가
    );
  };

  // DateTimePicker 표시 제어
  const [showDatePicker, setShowDatePicker] = useState(false);

  // 날짜 변경 이벤트 핸들러
  const onChangeDate = (e: DateTimePickerEvent, selected?: Date): void => {
    if (e.type === "dismissed") { //안드로이드에서 취소한 경우
      setShowDatePicker(false); //닫기
      return;
    }
    setShowDatePicker(Platform.OS === "ios"); // iOS는 계속 열린 상태 유지
    if (selected) setDeadline(selected); //선택 날짜 반영
  };

  // 총 목표 시간(시간단위, 숫자입력) 상태
  const [TotalH, setTotalH] = useState<string>(""); // 사용자가 총 몇 시간을 목표로 하는지 나타내는 상태, 문자열로 반환

  // initialValues가 바뀔 때
  useEffect(() => {
    if (!initialValues) { // 이니셜밸류가 null이나 undfined면 건너뜀, 크리에이트면 이게 정상 / 편집이면 뭔가 오류
      if (mode === "create") { //만약 모드가 크리에이트면 아무것도 안함

      }
      return;
    }
    setTitle(initialValues.title);
    setDeadline(initialValues.deadline);
    setMinH(initialValues.minH);
    setMaxH(initialValues.maxH);
    setTotalH(initialValues.totalH);
    setDaySet(initialValues.daySet); //각각을 선택한 목표의 이름, 데드라인, 시간 등으로 채움
  }, [initialValues, mode]); //모드가 바뀔 때마다 다시 실행함

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: 24 }} //내부 여백
      showsVerticalScrollIndicator={false} //스크롤바 감추기
    >
      {/* 헤더 */}
      <View style={styles.modalHeader}>
        {/* 모드에 따라 타이틀 삭제 버튼 토글 */}
        <Text style={styles.modalTitle}>{mode === "edit" ? "목표 관리" : "새 목표 추가"}</Text>
        {mode === "edit" && (
          <TouchableOpacity
            onPress={onPressDelete} // 삭제버튼, 지금은 기능없음
            style={styles.headerDeleteBtn}
            activeOpacity={0.9}
          >
            <Text style={styles.headerDeleteText}>삭제</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={onClose} style={styles.headerXbtn}>
          <Ionicons name="close" size={20} color="#e5e7eb" />
        </TouchableOpacity>
      </View>

      {/* 목표 입력창 */}
      <Text style={styles.label}>목표 이름</Text>
      <TextInput
        style={[styles.input, { color: "#fff" }]} value={title} onChangeText={setTitle} //입력 박스 스타일, 글자색 흰색
        placeholder="텍스트 입력"
        placeholderTextColor="#8f8f8fff"
        autoCapitalize="none" //자동 대문자 비활성
        autoCorrect={false} //자동 교정 비활성
        returnKeyType="done"
      />

      {/* 데드라인 설정 */}
      <Text style={styles.label}>데드라인 설정</Text>
      <TouchableOpacity
        style={styles.input}
        onPress={() => setShowDatePicker(true)} //클릭 시 Datepicker 호출
        activeOpacity={0.9}
      >
        <View style={styles.rowBetween}> {/*텍스트-아이콘 좌우 배치*/}
          <Text style={styles.inputText}>{deadlineLabel}</Text> {/*선택된 날짜 or 안내*/}
          <Ionicons name="calendar" size={18} color="#9ca3af" />
        </View>
      </TouchableOpacity>

      {showDatePicker && ( //날짜 피커
        <View style={{ marginTop: 8 }}>
          <DateTimePicker
            value={deadline ?? new Date()}
            mode="date" //날짜 모드
            display={Platform.OS === "ios" ? "spinner" : "default"} //iOS 스피너 스타일
            onChange={onChangeDate} //변경 핸들러
            minimumDate={new Date()} //오늘 이전은 선택 불가능핟도록
          />
          {Platform.OS === "ios" && ( //IOS에서만보이는 완료 버튼
            <View style={{ alignItems: "flex-end", marginTop: 8 }}>
              <TouchableOpacity
                onPress={() => setShowDatePicker(false)} //완료
                style={[styles.btnTiny, styles.btnPrimary]} //작은 파란 버튼
              >
                <Text style={styles.btnPrimaryText}>완료</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* 원하는 최소/최대 시간, 0~24h */}
      <Text style={styles.label}>원하는 최소/최대 시간 (하루 기준)</Text>
      <View style={styles.rangeBox}> {/*어두운 박스 안에 슬라이더 2개 */}
        <View style={styles.rangeRow}>
          <Text style={styles.rangeLabel}>최소</Text>
          <Text style={styles.rangeValue}>{minH.toFixed(1)} h</Text> {/*소수 1자리까지 나타냄*/}
        </View>
        <Slider
          value={minH}
          onValueChange={(v: number) => setMinH(Math.min(v, maxH))}
          minimumValue={0} //최소 0시간
          maximumValue={24}  // 최대 24시간
          step={0.5} // 0.5시간 간격 설정 가능
          minimumTrackTintColor="#3b82f6" //끌어당긴 시간 바 색
          maximumTrackTintColor="#374151" //남은 시간 바 색
          thumbTintColor="#93c5fd"
        />

        {/*위와 동일, 이건 최대시간 슬라이더*/}
        <View style={[styles.rangeRow, { marginTop: 12 }]}>
          <Text style={styles.rangeLabel}>최대</Text>
          <Text style={styles.rangeValue}>{maxH.toFixed(1)} h</Text>
        </View>
        <Slider
          value={maxH}
          onValueChange={(v: number) => setMaxH(Math.max(v, minH))}
          minimumValue={0}
          maximumValue={24}  // 12 → 24
          step={0.5}
          minimumTrackTintColor="#3b82f6"
          maximumTrackTintColor="#374151"
          thumbTintColor="#93c5fd"
        />
      </View>

      {/* 총 목표 시간 입력 */}
      <Text style={styles.label}>원하는 총 시간(시간 단위)</Text>
      <TextInput
        style={[styles.input, { color: "#fff" }]}
        value={TotalH} //현재값을 TotalH와 바인딩
        onChangeText={setTotalH} //새 문자열을 받아 setTotalH로 저장
        placeholder="예: 30"
        placeholderTextColor="#8a8a8aff"
        keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"} // 키보드는 숫자 키보드 형식으로 나옴
        returnKeyType="done"
      />

      {/* 가능한 요일 */}
      <Text style={styles.label}>가능한 요일</Text>
      <View style={styles.chips}> {/*칩들을 가로/줄바꿈으로 배치*/}
        {["월", "화", "수", "목", "금", "토", "일"].map((d) => { //요일 7개
          const active = daySet.includes(d); //선택 상태 여부
          return (
            <TouchableOpacity
              key={d}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => toggleDay(d)} //토글
              activeOpacity={0.85}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}> {/*선택 시 글자색*/}
                {d}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 취소 / 추가(수정) */}
      <View style={styles.footer}> {/*두 버튼 가로배치*/}
        <TouchableOpacity
          style={[styles.btn, styles.btnGhost]} //테두리만 존재하는 버튼
          onPress={onClose} //닫기
        >
          <Text style={styles.btnGhostText}>취소</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary]} //파란색 기본버튼
          onPress={() => {
            // 수정버튼, 지금은 역할없음
            onPressPrimary && onPressPrimary();
            onClose();
          }}
        >
          <Text style={styles.btnPrimaryText}>{mode === "edit" ? "수정" : "추가"}</Text> {/* 모드에 따라 수정/추가 텍스트 달라짐 */}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

//스타일들
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f0f" }, //배경
  listContainer: { padding: 16, paddingBottom: 120, paddingTop: "18%"}, //리스트 내부 여백/하단 공백

  card: {
    borderWidth: 2,
    borderColor: "#2a2a2a",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    backgroundColor: "#141414",
  },

  cardTitle: { color: "#eaeaea", fontSize: 16, fontWeight: "600" },

  fab: {
    position: "absolute", //우하단 고정
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center", //아이콘 중앙 정렬
  },

  backdrop: {
    flex: 1, //모달 전체 덮는 컨테이너
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },

  modalCard: {
    width: "100%", // 반응형 가로 폭
    maxWidth: 520,
    backgroundColor: "#141414", //카드 배경
    borderColor: "#232323",
    borderWidth: 2,
    borderRadius: 16,
    overflow: "hidden",
  },

  modalHeader: {
    marginBottom: 8, //아래 간격
    flexDirection: "row", //제목하고 버튼 가로배치
    alignItems: "center",
  },

  modalTitle: { color: "#e5e7eb", fontSize: 18, fontWeight: "700", flex: 1 }, //왼쪽정렬, 남은공간 차지

  headerXbtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },

  // 삭제버튼 스타일
  headerDeleteBtn: {
    backgroundColor: "#ef4444",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 6,
  },

  headerDeleteText: { color: "#0b1220", fontWeight: "800" },

  label: { color: "#cbd5e1", fontSize: 13, marginTop: 12, marginBottom: 6 }, //필드 라인

  input: {
    backgroundColor: "#0f0f0f", //입력 배경
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12, //상하좌우 여백
  },

  inputText: { color: "#e5e7eb" }, //입력 텍스트 색

  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  //이 아래로 최소/최대시간 스타일
  rangeBox: {
    backgroundColor: "#0f0f0f",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 12,
    padding: 12,
  },

  rangeRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },

  rangeLabel: { color: "#9ca3af" },

  rangeValue: { color: "#e5e7eb", fontWeight: "700" },
  //여기까지

  //이 아래로 요일 관련 스타일
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 3,
  },

  chip: {
    paddingHorizontal: 9,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    backgroundColor: "#0f0f0f",
  },

  chipActive: {
    borderColor: "#3b82f6",
    backgroundColor: "#1f2937",
  },

  chipText: { color: "#9ca3af", fontWeight: "600", paddingRight: 3},
  
  chipTextActive: { color: "#e5e7eb" },
  //여기까지

  //이 아래로 취소/추가 버튼 스타일
  footer: {
    flexDirection: "row",
    gap: 12,
    marginTop: 18,
  },

  btn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  
  btnGhost: {
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "#0f0f0f",
  },

  btnGhostText: { color: "#cbd5e1", fontWeight: "700" },
  //여기까지
  

  //이 아래 기타 버튼 스타일
  btnPrimary: { backgroundColor: "#3b82f6" },
  
  btnPrimaryText: { color: "#0b1220", fontWeight: "800" },

  btnTiny: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
});
