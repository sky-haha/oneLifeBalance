import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Platform, LogBox } from "react-native";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "./firebaseConfig.js"; 
import { router } from "expo-router";
LogBox.ignoreLogs(['Text strings must be rendered within a <Text> component']);
LogBox.ignoreAllLogs(true);
//기본 컴포넌트, 이메일/비밀번호를 입력값으로 받음
export default function SignupScreen() { 
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

//이메일 형식 검사 정규식, 아니면 회원가입 창 비활성화
  const isValidEmail = useMemo(() => {
    const v = email.trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }, [email]);

//회원가입 시 가입버튼 활성화 조건 - 비밀번호 6자 이상, 제대로 된 이메일 형식
  const isValidPw = pw.length >= 6;
  const canSubmit = isValidEmail && isValidPw && !loading;

//각종 오류들
  const mapAuthError = (code?: string) => {
    switch (code) {
      case "auth/email-already-in-use":
        return "이미 가입된 이메일입니다.";
      case "auth/invalid-email":
        return "유효한 이메일 형식이 아닙니다.";
      case "auth/weak-password":
        return "비밀번호는 6자 이상이어야 합니다.";
      case "auth/network-request-failed":
        return "네트워크 연결 문제입니다.";
      case "auth/too-many-requests":
        return "요청이 너무 많습니다..";
      default:
        return "가입 중 문제가 발생했습니다.";
    }
  };

//가입하기 버튼 클릭 시 실행되는 비동기 함수
  const onSignup = async () => {
    if (!canSubmit) return; //이메일, 비밀버호 길이, 로딩 등이 틀리면 아무것도 안함

    //사용자가 입력한 이메일 정규화
    const cleanEmail = email.trim().toLowerCase();

    try {
      setLoading(true); //먼저 로딩을 true로 변경
      //계정 생성
      await createUserWithEmailAndPassword(auth, cleanEmail, pw);
      //자동 로그인 방지
      await signOut(auth);
      // 안내 후 로그인 탭으로 이동
      Alert.alert("가입 완료", "가입이 완료되었습니다.", [
        { text: "확인", onPress: () => router.replace("/(tabs)/login") },
      ]);
    } catch (e: any) {
      Alert.alert("가입 실패", mapAuthError(e?.code)); //무언가 오류 발생 시
    } finally {
      setLoading(false); //일단 절차가 끝나면 로딩을 다시 false로 변경
    }
  };

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.scrollInner}
    >
      <Text style={styles.title}>회원가입</Text>

      {/* 스타일 박스 */}
      <View style={styles.card}>
        {/* 이메일 입력칸 */}
        <Text style={styles.label}>이메일</Text>
        <TextInput
          placeholder="name@example.com"
          placeholderTextColor="#6B7280"
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          returnKeyType="next"
        />
        {!isValidEmail && email.length > 0 && (
          <Text style={styles.errorText}>유효한 이메일 형식을 입력해 주세요.</Text>
        )}

        {/* 비밀번호 입력칸 */}
        <View style={styles.fieldRow}>
          <Text style={styles.label}>비밀번호</Text>
          <TouchableOpacity onPress={() => setShowPw((v) => !v)}> {/*숨기기/보이기*/}
            <Text style={styles.showBtn}>{showPw ? "숨기기" : "보기"}</Text>
          </TouchableOpacity>
        </View>
        {/*비밀번호는 6자 이상으로*/}
        <TextInput
          placeholder="6자 이상"
          placeholderTextColor="#6B7280"
          style={styles.input}
          secureTextEntry={!showPw}
          value={pw}
          onChangeText={setPw}
          returnKeyType="done"
          onSubmitEditing={onSignup}
        />
        {!isValidPw && pw.length > 0 && (
          <Text style={styles.errorText}>비밀번호는 6자 이상이어야 합니다.</Text>
        )}

        {/* 가입 버튼, 형식 미충족 시 회색으로 비활성화됨 */}
        <TouchableOpacity
          onPress={onSignup}
          disabled={!canSubmit || loading} 
          activeOpacity={0.9}
          style={[
            styles.primaryBtn,
            (!canSubmit || loading) && styles.primaryBtnDisabled,
          ]}
          accessibilityState={{ disabled: !canSubmit || loading }}
        >
          {/*로딩 중엔 스피너 or 가입하기 텍스트*/}
          {loading ? (
            <ActivityIndicator />
          ) : (
            <Text
              style={[
                styles.primaryBtnText,
                (!canSubmit || loading) && styles.primaryBtnTextDisabled,
              ]}
            >
              가입하기
            </Text>
          )}
        </TouchableOpacity>

        {/* 로그인으로 이동 */}
        <TouchableOpacity
          style={styles.secondaryBtn}
          activeOpacity={0.9}
          onPress={() => router.replace("/(tabs)/login")}
        >
          <Text style={styles.secondaryBtnText}>로그인하러 가기</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// 기타 스타일들
const styles = StyleSheet.create({
  scrollInner: { padding: 20, paddingTop: 40 },
  title: {
    color: "#E5E7EB",
    fontSize: 28,
    fontWeight: "800",
    marginTop: "10%",
    marginBottom: "10%",
  },
  card: {
    backgroundColor: "#0F172A",
    borderRadius: 18,
    padding: 18,
    borderColor: "#111827",
    borderWidth: 1,
  },
  label: { color: "#9CA3AF", marginBottom: 8, fontSize: 13 },
  input: {
    backgroundColor: "#0B1220",
    borderColor: "#1F2937",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.select({ ios: 12, android: 12 }),
    color: "#E5E7EB",
    marginBottom: 14,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  showBtn: { color: "#9CA3AF", fontSize: 13 },
  primaryBtn: {
    backgroundColor: "#3B82F6",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 6,
  },
  primaryBtnDisabled: {
    backgroundColor: "#374151", // 비활성화 된 것들은 회색 처리
  },
  primaryBtnText: { color: "white", fontWeight: "700", fontSize: 16 },
  primaryBtnTextDisabled: {
    color: "#D1D5DB",
  },
  secondaryBtn: {
    borderColor: "#374151",
    borderWidth: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 12,
  },
  secondaryBtnText: { color: "#E5E7EB", fontWeight: "700", fontSize: 16 },
  errorText: { color: "#FCA5A5", fontSize: 12, marginTop: -6, marginBottom: 6 },
});
