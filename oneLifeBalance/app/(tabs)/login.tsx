import React, { useState } from "react";
import {View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert,} from "react-native";
import { auth } from "./firebaseConfig.js";
import { signInWithEmailAndPassword } from "firebase/auth";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const onLogin = async () => {
    if (!email || !pw) {
      Alert.alert("경고", "이메일과 비밀번호를 입력해 주세요.");
      return;
    }
    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, email.trim(), pw);
      Alert.alert("로그인 성공", "정상적으로 로그인되었습니다.");
    } catch (e: any) {
      Alert.alert("로그인 실패", e?.message ?? "오류 발생!");
    } finally {
      setLoading(false);
    }
  };

  return (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollInner}
      >

        {/* 타이틀 */}
        <Text style={styles.title}>로그인</Text>

        {/* 카드 */}
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

          <View style={styles.fieldRow}>
            <Text style={styles.label}>비밀번호</Text>
            <TouchableOpacity onPress={() => setShowPw((v) => !v)}>
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

          {/* 로그인 버튼 */}
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

          {/* 회원가입 / 비번찾기 (비활성화 상태) */}
          <TouchableOpacity
            style={[styles.secondaryBtn, styles.disabled]}
            disabled
          >
            <Text style={[styles.secondaryBtnText, styles.disabledText]}>
              회원가입 (준비중)
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

const styles = StyleSheet.create({
  scrollInner: { padding: 20, paddingTop: 40 },
  title: { color: "#E5E7EB", fontSize: 28, fontWeight: "800", marginTop: "10%", marginBottom: "10%" },
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
    paddingVertical: 12,
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
  primaryBtnText: { color: "white", fontWeight: "700", fontSize: 16 },
  secondaryBtn: {
    borderColor: "#374151",
    borderWidth: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 12,
  },
  secondaryBtnText: { color: "#E5E7EB", fontWeight: "700", fontSize: 16 },
  linkBtn: { alignItems: "center", marginTop: 14 },
  linkText: { color: "#60A5FA", fontSize: 14 },

  disabled: { opacity: 0.4 },
  disabledText: { color: "#6B7280" },
});
