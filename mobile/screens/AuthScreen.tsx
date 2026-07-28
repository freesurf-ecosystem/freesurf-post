import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from "react-native";
import { supabase } from "../lib/supabase";

export default function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!email.trim() || !password) return;
    setLoading(true);

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) Alert.alert("Error", error.message);
      } else {
        if (password !== confirm) { Alert.alert("Error", "Passwords don't match."); return; }
        if (password.length < 6) { Alert.alert("Error", "Password must be at least 6 characters."); return; }
        const { error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) Alert.alert("Error", error.message);
        else Alert.alert("Check your email", "Confirm your email to finish creating your account.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.title}>FreeSurf Post</Text>
        <Text style={styles.subtitle}>Cross-post everywhere from your phone.</Text>

        <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail}
          autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <TextInput style={styles.input} placeholder="Password" value={password} onChangeText={setPassword}
          secureTextEntry autoComplete={mode === "signin" ? "current-password" : "new-password"} />
        {mode === "signup" && (
          <TextInput style={styles.input} placeholder="Confirm password" value={confirm} onChangeText={setConfirm}
            secureTextEntry autoComplete="new-password" />
        )}

        <TouchableOpacity style={styles.btn} onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{mode === "signin" ? "Sign in" : "Create account"}</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setMode(mode === "signin" ? "signup" : "signin")}>
          <Text style={styles.switch}>
            {mode === "signin" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafbfc", justifyContent: "center" },
  inner: { paddingHorizontal: 28 },
  title: { fontSize: 28, fontWeight: "700", textAlign: "center", color: "#1a1d23", marginBottom: 6 },
  subtitle: { fontSize: 15, textAlign: "center", color: "#8f99a8", marginBottom: 32 },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e6ed", borderRadius: 10,
    padding: 14, fontSize: 16, marginBottom: 12, color: "#1a1d23" },
  btn: { backgroundColor: "#4f46e5", borderRadius: 10, padding: 15, alignItems: "center", marginBottom: 16 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  switch: { textAlign: "center", color: "#4f46e5", fontSize: 14 },
});
