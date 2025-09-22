import React, { useState } from "react";
import { View, Text, TextInput, Button } from "react-native";
import { auth } from "./firebaseConfig";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState(""); // 로그인 상태 메시지

  const handleLogin = () => {
    signInWithEmailAndPassword(auth, email, password)
      .then(() => {
        setError("");
        setStatus("로그인 성공 ✅");
      })
      .catch((err) => setError(err.message));
  };

  const handleSignUp = () => {
    createUserWithEmailAndPassword(auth, email, password)
      .then(() => {
        setError("");
        setStatus("회원가입 성공 ✅");
      })
      .catch((err) => setError(err.message));
  };

  const checkLoginStatus = () => {
    if (auth.currentUser) {
      setStatus(`로그인 상태 ✅ (UID: ${auth.currentUser.uid})`);
    } else {
      setStatus("로그아웃 상태 ❌");
    }
  };

  const handleLogout = () => {
    signOut(auth)
      .then(() => {
        setStatus("로그아웃 성공 ❌");
      })
      .catch((err) => setError(err.message));
  };

  return (
    <View style={{ padding: 20 }}>
      <Text>이메일 / 비밀번호 로그인</Text>

      <TextInput
        placeholder="이메일"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        style={{ borderWidth: 1, marginBottom: 10 }}
      />

      <TextInput
        placeholder="비밀번호"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={{ borderWidth: 1, marginBottom: 10 }}
      />

      <Button title="로그인" onPress={handleLogin} />
      <Button title="회원가입" onPress={handleSignUp} />
      <Button title="로그인 상태 확인" onPress={checkLoginStatus} />
      <Button title="로그아웃" onPress={handleLogout} />

      {error ? <Text style={{ color: "red" }}>{error}</Text> : null}
      {status ? <Text style={{ marginTop: 10 }}>{status}</Text> : null}
    </View>
  );
}
