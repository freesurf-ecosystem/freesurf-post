import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, ScrollView,
} from "react-native";
import { Eye, EyeOff } from "lucide-react-native";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";
import { useAppLanguage } from "../lib/useAppLanguage";

WebBrowser.maybeCompleteAuthSession();

export default function AuthScreen() {
  const { colors } = useTheme();
  const { T } = useAppLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleSubmit() {
    if (!email.trim() || !password) return;
    if (mode === "signup" && password !== confirm) { Alert.alert(T.error_title, T.error_message); return; }
    if (mode === "signup" && password.length < 6) { Alert.alert(T.error_title, T.error_message); return; }
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) Alert.alert(T.error_title, error.message);
      } else {
        const { error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) Alert.alert(T.error_title, error.message);
        else Alert.alert(T.error_title, T.confirm_email);
      }
    } finally {
      setLoading(false);
    }
  }

  async function oauth(provider: "google" | "apple") {
    setLoading(true);
    try {
      const redirectTo = AuthSession.makeRedirectUri();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          ...(provider === "google" ? { scopes: "openid email" } : {}),
        },
      });
      if (error) { Alert.alert(T.error_title, error.message); return; }
      if (!data?.url) { console.log("[Auth] no OAuth url returned"); return; }
      console.log("[Auth] opening auth session; redirectTo=", redirectTo);
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      console.log("[Auth] auth result type=", result.type);
      if (result.type === "success") {
        const url = result.url;
        const hash = url.includes("#") ? url.split("#")[1] ?? "" : "";
        const hashParams = new URLSearchParams(hash);
        const code = hashParams.get("code") ?? new URL(url).searchParams.get("code");
        const accessToken = hashParams.get("access_token");
        console.log("[Auth] got code=", !!code, " accessToken=", !!accessToken, " url=", url.slice(0, 90));
        try {
          if (accessToken) {
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: hashParams.get("refresh_token") ?? "",
            });
          } else if (code) {
            const { error: ex } = await supabase.auth.exchangeCodeForSession(code);
            if (ex) { console.log("[Auth] exchange error", ex.message); Alert.alert(T.error_title, ex.message); }
          } else {
            console.log("[Auth] neither code nor access_token found in callback URL");
            Alert.alert(T.error_title, T.error_message);
          }
        } catch (ex: any) {
          console.log("[Auth] setSession/exchange threw", ex?.message || ex);
          Alert.alert(T.error_title, ex?.message || T.error_message);
        }
      } else if (result.type === "dismiss") {
        Alert.alert(T.error_title, T.error_message);
      }
    } catch (e: any) {
      Alert.alert(T.error_title, e?.message || T.error_message);
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = [styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }];
  const placeholder = colors.textMuted;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: colors.text }]}>{T.free_surf_post}</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>{T.cross_post_everywhere}</Text>

        <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
          <TouchableOpacity style={[styles.oauthBtn, { borderColor: colors.border }]} onPress={() => oauth("google")} disabled={loading}>
            <Text style={[styles.oauthText, { color: colors.text }]}>{T.sign_in_with_google}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.oauthBtn, { borderColor: colors.border }]} onPress={() => oauth("apple")} disabled={loading}>
            <Text style={[styles.oauthText, { color: colors.text }]}>{T.sign_in_with_apple}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.orRow}>
          <View style={[styles.orLine, { backgroundColor: colors.border }]} />
          <Text style={{ color: colors.textMuted }}>{T.or}</Text>
          <View style={[styles.orLine, { backgroundColor: colors.border }]} />
        </View>

        <TextInput style={inputStyle} placeholder={T.email} placeholderTextColor={placeholder} value={email} onChangeText={setEmail}
          autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <View style={styles.passwordWrap}>
          <TextInput style={inputStyle} placeholder={T.password} placeholderTextColor={placeholder} value={password} onChangeText={setPassword}
            secureTextEntry={!showPassword} autoComplete={mode === "signin" ? "current-password" : "new-password"} />
          <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword((v) => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            {showPassword ? <EyeOff size={20} color={colors.textMuted} /> : <Eye size={20} color={colors.textMuted} />}
          </TouchableOpacity>
        </View>
        {mode === "signup" && (
          <View style={styles.passwordWrap}>
            <TextInput style={inputStyle} placeholder={T.confirm_password} placeholderTextColor={placeholder} value={confirm} onChangeText={setConfirm}
              secureTextEntry={!showConfirm} autoComplete="new-password" />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowConfirm((v) => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              {showConfirm ? <EyeOff size={20} color={colors.textMuted} /> : <Eye size={20} color={colors.textMuted} />}
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={[styles.btn, { backgroundColor: colors.brand }]} onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{mode === "signin" ? T.sign_in : T.create_account}</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setMode(mode === "signin" ? "signup" : "signin")}>
          <Text style={[styles.switch, { color: colors.brand }]}>
            {mode === "signin" ? T.dont_have_account : T.already_have_account}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { paddingHorizontal: 28, paddingVertical: 48, flexGrow: 1, justifyContent: "center" },
  title: { fontSize: 28, fontWeight: "700", textAlign: "center", marginBottom: 6 },
  subtitle: { fontSize: 15, textAlign: "center", marginBottom: 28 },
  oauthBtn: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  oauthText: { fontSize: 14, fontWeight: "600" },
  orRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  orLine: { flex: 1, height: 1 },
  input: { borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 12 },
  passwordWrap: { position: "relative" },
  eyeBtn: { position: "absolute", right: 14, top: 13 },
  checkRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginBottom: 10 },
  btn: { borderRadius: 10, padding: 15, alignItems: "center", marginBottom: 12 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  switch: { textAlign: "center", fontSize: 14 },
});