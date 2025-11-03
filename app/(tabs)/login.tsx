import { router } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import {
  collection,
  doc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  LogBox,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "./firebaseConfig.js";

LogBox.ignoreLogs(["Text strings must be rendered within a <Text> component"]);
LogBox.ignoreAllLogs(true);

/**
 * [수정] 2025-10-20부터 2025-11-19까지 '프로그래밍 집중' 및 '과도한 중복' 테스트 데이터를 생성합니다.
 * - 최대 3개의 일정이 겹치도록 설정
 * - 1시간 (60분)짜리 일정은 생성하지 않음
 * @param uid - 현재 로그인된 사용자의 UID
 */
const seedMy30DayData = async (uid: string) => {
  if (!uid) {
    Alert.alert("오류", "UID가 없습니다. 로그인 후 시도하세요.");
    return;
  }

  console.log("30일 '프로그래밍 중복' 데이터 생성을 시작합니다...");
  Alert.alert(
    "데이터 생성 시작",
    "프로그래밍 위주의 중복 30일치 데이터를 Firestore에 쓰는 중입니다. (약 10-15초 소요)"
  );

  const toMin = (h: number, m: number = 0) => h * 60 + m;

  // 1. [수정] 요일별 일정 템플릿 (프로그래밍, 중복 집중)
  const scheduleTemplates: Record<string, any[]> = {
    // 1~5: 평일 (과도한 중복)
    Weekday: [
      // --- 오전 중복 클러스터 (3개) ---
      { start: toMin(9, 45), end: toMin(11, 15), type: '자기개발', action: '노동', purpose: '메인 프로젝트 리팩토링 (React)' }, // 90m
      { start: toMin(10, 0), end: toMin(12, 0), type: '자기개발', action: '수업', purpose: 'GCP 자격증 강의 시청 (Coursera)' }, // 120m
      { start: toMin(10, 30), end: toMin(11, 45), type: '휴식', action: '오락', purpose: 'HackerNews 및 기술 블로그 탐방' }, // 75m
      
      // --- 오후 중복 클러스터 (3개) ---
      { start: toMin(14, 30), end: toMin(16, 0), type: '자기개발', action: '노동', purpose: '사이드 프로젝트: 백엔드 API 구현 (Node.js)' }, // 90m
      { start: toMin(15, 0), end: toMin(16, 30), type: '휴식', action: '오락', purpose: 'LeatCode 문제 풀이 (Medium)' }, // 90m
      { start: toMin(15, 45), end: toMin(17, 15), type: '자기개발', action: '운동', purpose: 'DevOps 스터디 (Docker & K8s)' }, // 90m (action '운동' 재활용)

      // --- 저녁 중복 클러스터 (3개) ---
      { start: toMin(21, 0), end: toMin(22, 30), type: '휴식', action: '오락', purpose: '오픈소스 프로젝트 PR 리뷰' }, // 90m
      { start: toMin(21, 15), end: toMin(23, 0), type: '자기개발', action: '노동', purpose: 'SwiftUI 튜토리얼 실습' }, // 105m
      { start: toMin(22, 0), end: toMin(23, 30), type: '휴식', action: '수면', purpose: '프로그래밍 팟캐스트 청취 (Stack Overflow)' }, // 90m (action '수면' 재활용)
    ],
    // 6, 0: 주말 (과도한 중복)
    Weekend: [
      // --- 오전 중복 클러스터 (3개) ---
      { start: toMin(9, 30), end: toMin(11, 0), type: '자기개발', action: '수업', purpose: '알고리즘 스터디 (백준)' }, // 90m
      { start: toMin(10, 0), end: toMin(11, 30), type: '휴식', action: '오락', purpose: 'Kaggle 데이터셋 탐색' }, // 90m
      { start: toMin(10, 15), end: toMin(11, 45), type: '자기개발', action: '노동', purpose: '개인 블로그 기술 아티클 작성' }, // 90m
      
      // --- 오후 중복 클러스터 (3개) ---
      { start: toMin(14, 0), end: toMin(16, 30), type: '휴식', action: '오락', purpose: '페어 프로그래밍 (토이 프로젝트)' }, // 150m
      { start: toMin(15, 0), end: toMin(17, 0), type: '자기개발', action: '운동', purpose: 'Rust 언어 입문서 읽기' }, // 120m
      { start: toMin(16, 0), end: toMin(17, 30), type: '휴식', action: '수면', purpose: '코딩 유튜브 채널 시청 (Fireship.io)' }, // 90m

      // --- 저녁 중복 클러스터 (3개) ---
      { start: toMin(20, 30), end: toMin(22, 30), type: '휴식', action: '오락', purpose: 'Unity 게임 개발 튜토리얼' }, // 120m
      { start: toMin(21, 0), end: toMin(22, 45), type: '자기개발', action: '노동', purpose: 'CS 컨퍼런스 영상 시청 (InfoQ)' }, // 105m
      { start: toMin(22, 15), end: toMin(23, 45), type: '휴식', action: '오락', purpose: '새로운 JS 프레임워크 (Svelte) 테스트' }, // 90m
    ],
  };

  // 2. 공통 일정 (매일) - '필수' 항목 (수정 없음, 60분짜리 없음)
  const commonSchedules = [
    { start: toMin(0), end: toMin(8, 0), type: "개인", action: "수면", purpose: "수면" }, // 8h
    { start: toMin(8, 0), end: toMin(8, 45), type: "개인", action: "기타", purpose: "기상 및 준비" }, // 45m
    { start: toMin(8, 45), end: toMin(9, 30), type: "식사", action: "기타", purpose: "아침 식사" }, // 45m
    { start: toMin(12, 30), end: toMin(14, 0), type: "식사", action: "기타", purpose: "점심 식사" }, // 90m
    { start: toMin(19, 0), end: toMin(20, 30), type: "식사", action: "기타", purpose: "저녁 식사" }, // 90m
  ];

  // 3. 날짜 반복 및 데이터 생성
  const startDate = new Date("2025-10-20T00:00:00+09:00");
  const realTotalDays =
    (new Date("2025-11-19").getTime() - new Date("2025-10-20").getTime()) /
      (1000 * 60 * 60 * 24) +
    1;

  let current = startDate;

  try {
    for (let i = 0; i < realTotalDays; i++) {
      const dateISO = `${current.getFullYear()}-${String(
        current.getMonth() + 1
      ).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`;
      const dayOfWeek = current.getDay(); // 0(일) ~ 6(토)

      const batch = writeBatch(db);

      const dateDoc = doc(db, "User", uid, "dateTable", dateISO);
      batch.set(dateDoc, { Use: true, createdAt: serverTimestamp() }, { merge: true });

      const timeTableCol = collection(dateDoc, "timeTable");

      // 공통 일정 추가
      for (const task of commonSchedules) {
        const newDocRef = doc(timeTableCol);
        batch.set(newDocRef, {
          startTime: task.start,
          endTime: task.end,
          type: task.type,
          action: task.action,
          purpose: task.purpose,
          isGoal: false,
          fix: false,
          createdAt: serverTimestamp(),
        });
      }

      // 요일별 템플릿 일정 추가 (주말/주중 분리)
      const template = (dayOfWeek === 0 || dayOfWeek === 6) ? scheduleTemplates.Weekend : scheduleTemplates.Weekday;
      for (const task of template) {
        const newDocRef = doc(timeTableCol);
        batch.set(newDocRef, {
          startTime: task.start,
          endTime: task.end,
          type: task.type,
          action: task.action,
          purpose: task.purpose,
          isGoal: task.action === '오락', // '오락'을 목표로 설정 (예시)
          fix: false,
          createdAt: serverTimestamp(),
        });
      }

      await batch.commit();
      current.setDate(current.getDate() + 1);
    }

    console.log(`${realTotalDays}일 데이터 생성 완료!`);
    Alert.alert(
      "생성 완료",
      `${realTotalDays}일치 테스트 데이터가 Firestore에 저장되었습니다.`
    );
  } catch (e: any) {
    console.error("데이터 생성 중 오류 발생:", e);
    Alert.alert(
      "생성 실패",
      e?.message || "데이터 생성 중 오류가 발생했습니다."
    );
  }
};

export default function LoginScreen() {
  //이메일, 비밀번호, 비밀번호 표시, 로딩 상태 컴포넌트
  const [email, setEmail] = useState(""); // 이메일 입력값
  const [pw, setPw] = useState(""); //비번 입력값
  const [showPw, setShowPw] = useState(false); //비밀번호 표시 상태
  const [loading, setLoading] = useState(false); //로딩 상태

  const onLogin = async () => {
    //로그인 관련
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
          <TouchableOpacity onPress={() => setShowPw((v) => !v)}>
            {" "}
            {/*비밀번호 숨기기/보이기*/}
            <Text style={styles.showBtn}>{showPw ? "보기" : "숨기기"}</Text>
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
          <Text style={styles.secondaryBtnText}>회원가입</Text>
        </TouchableOpacity>

        {/* [수정] 데이터 시딩(Seeding) 테스트 버튼 */}
        <TouchableOpacity
          style={styles.secondaryBtn} // 기존 스타일 재활용
          onPress={() => {
            const user = auth.currentUser;
            if (user && user.uid) {
              seedMy30DayData(user.uid);
            } else {
              Alert.alert(
                "로그인 필요",
                "데이터를 생성하려면 먼저 로그인해야 합니다."
              );
            }
          }}
        >
          <Text style={[styles.secondaryBtnText, { color: "#10B981" }]}>
            [임시] 30일 프로그래밍 (중복) 데이터 생성
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
  title: {
    color: "#020203ff",
    fontSize: 28,
    fontWeight: "800",
    marginTop: "10%",
    marginBottom: "10%",
  },
  card: {
    //입력폼 카드 컨테이너 - 어두운 파란색 배경, 둥근 모서리, 테두리
    backgroundColor: "#0F172A",
    borderRadius: 18,
    padding: 18,
    borderColor: "#111827",
    borderWidth: 1,
  },
  label: { color: "#9CA3AF", marginBottom: 8, fontSize: 13 }, //필드 라벨

  input: {
    //입력창
    backgroundColor: "#0B1220",
    borderColor: "#1F2937",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10, // Platform.OS 사용
    color: "#E5E7EB",
    marginBottom: 14,
  },

  fieldRow: {
    //라벨/토글버튼 양끝 정렬
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },

  showBtn: { color: "#9CA3AF", fontSize: 13 }, //보기, 숨기기 토글

  primaryBtn: {
    //기본 로그인 버튼
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