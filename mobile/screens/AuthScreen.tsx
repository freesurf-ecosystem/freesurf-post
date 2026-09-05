import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, ScrollView, Linking,
} from "react-native";
import { Eye, EyeOff } from "lucide-react-native";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";

WebBrowser.maybeCompleteAuthSession();

const TERMS_URL = "https://freesurf.tools/terms";
const PRIVACY_URL = "https://freesurf.tools/privacy";
const AI_URL = "https://freesurf.tools/ai-processing";
const DIGEST_URL = "https://feedfree.tech";

export default function AuthScreen() {
  const { colors } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [agree, setAgree] = useState(false);
  const [digest, setDigest] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const link = (url: string, label: string) => (
    <Text style={{ color: colors.brand, textDecorationLine: "underline" }} onPress={() => Linking.openURL(url)}>{label}</Text>
  );

  // FeedFree Digest opt-in → invokes the same edge function the web login uses.
  async function subscribeDigest(address: string) {
    try {
      const { error } = await supabase.functions.invoke("feedfree-create-signup", { body: { email: address, topics: [] } });
      return error ? " Note: we couldn't subscribe you to the FeedFree Digest — join at feedfree.tech." : "";
    } catch {
      return " Note: we couldn't subscribe you to the FeedFree Digest — join at feedfree.tech.";
    }
  }

  async function handleSubmit() {
    if (!email.trim() || !password) return;
    if (mode === "signup" && !agree) { Alert.alert("Consent required", "Please agree to the Terms and Privacy Policy."); return; }
    if (mode === "signup" && password !== confirm) { Alert.alert("Error", "Passwords don't match."); return; }
    if (mode === "signup" && password.length < 6) { Alert.alert("Error", "Password must be at least 6 characters."); return; }
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) Alert.alert("Error", error.message);
      } else {
        const { error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) Alert.alert("Error", error.message);
        else {
          const note = digest ? await subscribeDigest(email.trim()) : "";
          Alert.alert("Check your email", "Confirm your email to finish creating your account." + note);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function oauth(provider: "google" | "apple") {
    if (mode === "signup" && !agree) { Alert.alert("Consent required", "Please agree to the Terms and Privacy Policy."); return; }
    setLoading(true);
    try {
      const redirectTo = AuthSession.makeRedirectUri();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) { Alert.alert("Error", error.message); return; }
      if (!data?.url) { console.log("[Auth] no OAuth url returned"); return; }
      console.log("[Auth] opening auth session; redirectTo=", redirectTo);
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      console.log("[Auth] auth result type=", result.type);
      if (result.type === "success") {
        // Supabase may hand back a PKCE `code` (query) OR an implicit
        // `access_token` (URL fragment). Handle both so we always set the session.
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
            if (ex) { console.log("[Auth] exchange error", ex.message); Alert.alert("Error", ex.message); }
          } else {
            console.log("[Auth] neither code nor access_token found in callback URL");
            Alert.alert("Sign-in incomplete", "No session was returned. Please try again.");
          }
        } catch (ex: any) {
          console.log("[Auth] setSession/exchange threw", ex?.message || ex);
          Alert.alert("Error", ex?.message || "Sign-in failed.");
        }
        if (digest) {
          try {
            const { data: sessData } = await supabase.auth.getSession();
            const addr = sessData.session?.user?.email;
            if (addr) await subscribeDigest(addr);
          } catch { /* non-critical */ }
        }
      } else if (result.type === "dismiss") {
        Alert.alert("Canceled", "Sign-in was canceled.");
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Sign-in failed.");
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = [styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }];
  const placeholder = colors.textMuted;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: colors.text }]}>FreeSurf Post</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>Cross-post everywhere from your phone.</Text>

        <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
          <TouchableOpacity style={[styles.oauthBtn, { borderColor: colors.border }]} onPress={() => oauth("google")} disabled={loading}>
            <Text style={[styles.oauthText, { color: colors.text }]}>Continue with Google</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.oauthBtn, { borderColor: colors.border }]} onPress={() => oauth("apple")} disabled={loading}>
            <Text style={[styles.oauthText, { color: colors.text }]}>Continue with Apple</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.orRow}>
          <View style={[styles.orLine, { backgroundColor: colors.border }]} />
          <Text style={{ color: colors.textMuted }}>or</Text>
          <View style={[styles.orLine, { backgroundColor: colors.border }]} />
        </View>

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

        {mode === "signup" && (
          <>
            <TouchableOpacity onPress={() => setAgree(!agree)} style={styles.checkRow}>
              <Text style={{ color: colors.brand, fontWeight: "700", fontSize: 18 }}>{agree ? "☑" : "☐"}</Text>
              <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>
                I agree to the {link(TERMS_URL, "Terms")}, {link(PRIVACY_URL, "Privacy Policy")}, and {link(AI_URL, "AI Processing")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setDigest(!digest)} style={styles.checkRow}>
              <Text style={{ color: colors.textMuted, fontWeight: "700", fontSize: 18 }}>{digest ? "☑" : "☐"}</Text>
              <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>
                Subscribe to the {link(DIGEST_URL, "FeedFree Digest")} — Curated blog-length social posts covering AI, SEO, social media marketing and more - from X and LinkedIn
              </Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity style={[styles.btn, { backgroundColor: colors.brand }]} onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{mode === "signin" ? "Sign in" : "Create account"}</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setMode(mode === "signin" ? "signup" : "signin")}>
          <Text style={[styles.switch, { color: colors.brand }]}>
            {mode === "signin" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
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
  btn: { borderRadius: 10, padding: 15, alignItems: "center", marginBottom: 16 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  switch: { textAlign: "center", fontSize: 14 },
});
