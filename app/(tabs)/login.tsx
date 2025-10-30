import React, { useState } from "react";
import {View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, LogBox} from "react-native";
import { auth } from "./firebaseConfig.js";
import { signInWithEmailAndPassword } from "firebase/auth"; //리액트 및 파이어베이스 기본 연동
import { router } from "expo-router";
LogBox.ignoreLogs(['Text strings must be rendered within a <Text> component']);
LogBox.ignoreAllLogs(true);
export default function LoginScreen() { //이메일, 비밀번호, 비밀번호 표시, 로딩 상태 컴포넌트
  const [email, setEmail] = useState(""); // 이메일 입력값
  const [pw, setPw] = useState(""); //비번 입력값
  const [showPw, setShowPw] = useState(false); //비밀번호 표시 상태
  const [loading, setLoading] = useState(false); //로딩 상태

  const onLogin = async () => { //로그인 관련
    if (!email || !pw) {
      Alert.alert("경고", "이메일과 비밀번호를 입력해 주세요."); //이메일/비번 둘중 하나라도 비어있으면 경고
      return;
    }
    try {
      setLoading(true); //로딩 상태 true로 설정
      await signInWithEmailAndPassword(auth, email.trim(), pw); //공백 제거한 이메일 및 비밀번호를 파이어베이스로 전달
      Alert.alert("로그인 성공", "정상적으로 로그인되었습니다."); //이메일과 비번이 정상적일시
    } catch (e: any) {
      Alert.alert("로그인 실패", e?.message ?? "오류 발생!!"); //파이어베이스가 에러 발생시
    } finally {
      setLoading(false); //성공/실패 상관없이 로딩 상태 false로 복귀
    }
  };

  return (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollInner}
      > 

        {/* 타이틀 */}
        <Text style={styles.title}>로그인</Text>

        {/* 이메일 입력 */}
        <View style={styles.card}>
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
          />

          {/* 비번 입력 */}
          <View style={styles.fieldRow}>
            <Text style={styles.label}>비밀번호</Text>
            <TouchableOpacity onPress={() => setShowPw((v) => !v)}> {/*비밀번호 숨기기/보이기*/}
              <Text style={styles.showBtn}>{showPw ? "숨기기" : "보기"}</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            placeholder="••••••••"
            placeholderTextColor="#6B7280"
            style={styles.input}
            secureTextEntry={!showPw}
            value={pw}
            onChangeText={setPw}
          />

          {/* 로그인 버튼, 로딩중이면 빙글 돌아가는 표시, 아니면 로그인 텍스트 */}
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={onLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator />
            ) : (
              <Text style={styles.primaryBtnText}>로그인</Text>
            )}
          </TouchableOpacity>

          {/* 회원가입 / 비번찾기 */}
          <TouchableOpacity
            style={styles.secondaryBtn}
            activeOpacity={0.9}
            onPress={() => router.push("/(tabs)/signup")}
          >
            <Text style={styles.secondaryBtnText}>
              회원가입
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkBtn} disabled>
            <Text style={[styles.linkText, styles.disabledText]}>
              비밀번호를 잊으셨나요? (준비중)
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
  );
}

//스타일
const styles = StyleSheet.create({
  scrollInner: { padding: 20, paddingTop: 40 },
  title: { color: "#020203ff", fontSize: 28, fontWeight: "800", marginTop: "10%", marginBottom: "10%" },
  card: { //입력폼 카드 컨테이너 - 어두운 파란색 배경, 둥근 모서리, 테두리
    backgroundColor: "#0F172A",
    borderRadius: 18,
    padding: 18,
    borderColor: "#111827",
    borderWidth: 1,
  },
  label: { color: "#9CA3AF", marginBottom: 8, fontSize: 13 }, //필드 라벨

  input: { //입력창
    backgroundColor: "#0B1220",
    borderColor: "#1F2937",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#E5E7EB",
    marginBottom: 14,
  },

  fieldRow: { //라벨/토글버튼 양끝 정렬
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },

  showBtn: { color: "#9CA3AF", fontSize: 13 }, //보기, 숨기기 토글

  primaryBtn: { //기본 로그인 버튼
    backgroundColor: "#3B82F6",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 6,
  },

  primaryBtnText: { color: "white", fontWeight: "700", fontSize: 16 }, //기본 로그인 ㅓ튼 텍스트
  secondaryBtn: {
    borderColor: "#374151",
    borderWidth: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 12,
  },

  secondaryBtnText: { color: "#E5E7EB", fontWeight: "700", fontSize: 16 }, //회원가입 텍스트

  linkBtn: { alignItems: "center", marginTop: 14 }, //비번찾기 버튼/텍스트
  linkText: { color: "#60A5FA", fontSize: 14 },

  disabled: { opacity: 0.4 }, //회원가입, 비번찾기 미구현 상태이므로 비활성화 표시
  disabledText: { color: "#6B7280" },
});
