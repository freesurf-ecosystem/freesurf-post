import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from "react-native";
import { Eye, EyeOff } from "lucide-react-native";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";

export default function AuthScreen() {
  const { colors } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

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

  const inputStyle = [styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }];
  const placeholder = colors.textMuted;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.inner}>
        <Text style={[styles.title, { color: colors.text }]}>FreeSurf Post</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>Cross-post everywhere from your phone.</Text>

        <TextInput style={inputStyle} placeholder="Email" placeholderTextColor={placeholder} value={email} onChangeText={setEmail}
          autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <View style={styles.passwordWrap}>
          <TextInput style={inputStyle} placeholder="Password" placeholderTextColor={placeholder} value={password} onChangeText={setPassword}
            secureTextEntry={!showPassword} autoComplete={mode === "signin" ? "current-password" : "new-password"} />
          <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword((v) => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            {showPassword ? <EyeOff size={20} color={colors.textMuted} /> : <Eye size={20} color={colors.textMuted} />}
          </TouchableOpacity>
        </View>
        {mode === "signup" && (
          <View style={styles.passwordWrap}>
            <TextInput style={inputStyle} placeholder="Confirm password" placeholderTextColor={placeholder} value={confirm} onChangeText={setConfirm}
              secureTextEntry={!showConfirm} autoComplete="new-password" />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowConfirm((v) => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              {showConfirm ? <EyeOff size={20} color={colors.textMuted} /> : <Eye size={20} color={colors.textMuted} />}
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={[styles.btn, { backgroundColor: colors.brand }]} onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{mode === "signin" ? "Sign in" : "Create account"}</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setMode(mode === "signin" ? "signup" : "signin")}>
          <Text style={[styles.switch, { color: colors.brand }]}>
            {mode === "signin" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center" },
  inner: { paddingHorizontal: 28 },
  title: { fontSize: 28, fontWeight: "700", textAlign: "center", marginBottom: 6 },
  subtitle: { fontSize: 15, textAlign: "center", marginBottom: 32 },
  input: { borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 12 },
  passwordWrap: { position: "relative" },
  eyeBtn: { position: "absolute", right: 14, top: 13 },
  btn: { borderRadius: 10, padding: 15, alignItems: "center", marginBottom: 16 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  switch: { textAlign: "center", fontSize: 14 },
});
