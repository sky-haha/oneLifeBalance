import React, { useState } from "react";
import { View, Text, TextInput, Button } from "react-native";
import { auth } from "./firebaseConfig";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = () => {
    signInWithEmailAndPassword(auth, email, password)
      .catch((err) => setError(err.message));
  };

  const handleSignUp = () => {
    createUserWithEmailAndPassword(auth, email, password)
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
      {error ? <Text style={{ color: "red" }}>{error}</Text> : null}
    </View>
  );
}
