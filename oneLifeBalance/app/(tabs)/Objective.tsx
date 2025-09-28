import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Platform, KeyboardAvoidingView, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import Slider from "@react-native-community/slider"; //리액트 컴포넌트들

export default function ObjectiveScreen() { //오브젝티브 페이지의 메인 화면
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.container}>
      {/* 설정한 목표들 확인 */}
      <ScrollView contentContainerStyle={styles.listContainer}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>설정한 목표가</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>이렇게 보임</Text>
        </View>
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
              <ModalBody onClose={() => setOpen(false)} />
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

//모달 내부 내용
function ModalBody({ onClose }: { onClose: () => void }) {
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

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: 24 }} //내부 여백
      showsVerticalScrollIndicator={false} //스크롤바 감추기
    >
      {/* 헤더 */}
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>새 목표 추가</Text>
        <TouchableOpacity onPress={onClose} style={styles.headerXbtn}>
          <Ionicons name="close" size={20} color="#e5e7eb" />
        </TouchableOpacity>
      </View>

      {/* 목표 입력창 */}
      <Text style={styles.label}>목표 이름</Text>
         <TextInput style={[styles.input, { color: "#fff" }]} value={title} onChangeText={setTitle} //입력 박스 스타일, 글자색 흰색
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

      {/* 취소 / 추가 */}
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
            onClose();
          }}
        >
          <Text style={styles.btnPrimaryText}>추가</Text>
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

  label: { color: "#cbd5e1", fontSize: 13, marginTop: 12, marginBottom: 6 }, //필드 라ベル

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
