import React, { useState } from "react";
import {
  Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";
import {
  TERMS_VERSION, recordConsent, subscribeDigest, subscribeProductUpdates, OnboardingState,
} from "../lib/onboarding";

const TERMS_URL = "https://freesurf.tools/terms";
const PRIVACY_URL = "https://freesurf.tools/privacy";
const AI_URL = "https://freesurf.tools/ai-processing";
const DIGEST_URL = "https://feedfree.tech";

export default function OnboardingScreen({
  initial,
  onDone,
}: {
  initial: OnboardingState;
  onDone: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [terms, setTerms] = useState(initial.terms);
  const [digest, setDigest] = useState(initial.digest);
  const [updates, setUpdates] = useState(initial.updates);
  const [agreeChecked, setAgreeChecked] = useState(false);
  const [loading, setLoading] = useState(false);

  const link = (url: string, label: string) => (
    <Text style={{ color: colors.brand, textDecorationLine: "underline" }} onPress={() => Linking.openURL(url)}>{label}</Text>
  );
  const box = (on: boolean) => (
    <Text style={{ color: on ? colors.brand : colors.textMuted, fontWeight: "700", fontSize: 18 }}>{on ? "☑" : "☐"}</Text>
  );

  async function acceptTerms() {
    if (!agreeChecked || loading) return;
    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id;
      if (!uid) throw new Error("No active session");
      await recordConsent(uid, "terms", TERMS_VERSION);
      setTerms(true);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not save your agreement. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function finish() {
    if (loading) return;
    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id;
      const email = data.session?.user?.email || "";
      if (!uid) throw new Error("No active session");

      if (!initial.digest) await recordConsent(uid, "onboarding_digest", digest ? "accepted" : "declined");
      if (!initial.updates) await recordConsent(uid, "onboarding_updates", updates ? "accepted" : "declined");

      if (updates && email && !initial.updates) {
        try { await subscribeProductUpdates(email); } catch (e) { console.warn("[onboarding] updates subscribe failed", e); }
      }
      if (digest && email && !initial.digest) {
        try { await subscribeDigest(email); } catch (e) { console.warn("[onboarding] digest subscribe failed", e); }
      }
      onDone();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not save your preferences. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function remindLater() {
    if (!loading) onDone();
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.inner, { backgroundColor: colors.bg, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]}
    >
      <Text style={[styles.title, { color: colors.text }]}>{terms ? "Almost there" : "Welcome to FreeSurf"}</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>{terms ? "Step 2 of 2" : "Step 1 of 2"}</Text>

      {!terms ? (
        <>
          <TouchableOpacity onPress={() => setAgreeChecked(!agreeChecked)} style={styles.checkRow}>
            {box(agreeChecked)}
            <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>
              I agree to the {link(TERMS_URL, "Terms")}, {link(PRIVACY_URL, "Privacy Policy")}, and {link(AI_URL, "AI Processing")} policy
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.brand, opacity: agreeChecked && !loading ? 1 : 0.5 }]}
            onPress={acceptTerms}
            disabled={!agreeChecked || loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Accept & continue</Text>}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <TouchableOpacity onPress={() => setDigest(!digest)} style={styles.checkRow}>
            {box(digest)}
            <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>
              Subscribe to the {link(DIGEST_URL, "FeedFree Digest")} — curated blog-length social posts covering AI, SEO, social media marketing and more — from X and LinkedIn
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setUpdates(!updates)} style={styles.checkRow}>
            {box(updates)}
            <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>
              FreeSurf product updates — occasional news about our other free tools. Unsubscribe any time.
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, { backgroundColor: colors.brand }]} onPress={finish} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Finish</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={remindLater} disabled={loading}>
            <Text style={[styles.switch, { color: colors.brand }]}>Remind me later</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  inner: { paddingHorizontal: 28, flexGrow: 1, justifyContent: "center" },
  title: { fontSize: 28, fontWeight: "700", textAlign: "center", marginBottom: 6 },
  subtitle: { fontSize: 15, textAlign: "center", marginBottom: 28 },
  checkRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginBottom: 16 },
  btn: { borderRadius: 10, padding: 15, alignItems: "center", marginBottom: 16 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  switch: { textAlign: "center", fontSize: 14 },
});
