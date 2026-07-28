import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../App";
import { supabase } from "../lib/supabase";

const API_BASE = "https://post.freesurf.tools";
const PLATFORMS = [
  { key: "bluesky", name: "Bluesky" },
  { key: "x", name: "X" },
  { key: "linkedin", name: "LinkedIn" },
  { key: "facebook", name: "Facebook" },
  { key: "instagram", name: "Instagram" },
  { key: "threads", name: "Threads" },
  { key: "tiktok", name: "TikTok" },
];

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ComposeScreen() {
  const nav = useNavigation<Nav>();
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(["bluesky"]));
  const [loading, setLoading] = useState(false);

  function toggle(p: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });
  }

  async function post() {
    if (!text.trim()) return;
    if (selected.size === 0) { Alert.alert("Error", "Select at least one platform."); return; }
    setLoading(true);

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) { Alert.alert("Error", "Not signed in."); return; }

      const res = await fetch(`${API_BASE}/api/post`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ platforms: Array.from(selected), text: text.trim() }),
      });
      const result = await res.json();

      if (res.ok) {
        const ok = result.results.filter((r: any) => r.success).length;
        Alert.alert("Posted!", `Successfully posted to ${ok} platform(s).`);
        setText("");
      } else {
        Alert.alert("Error", result.error || "Post failed.");
      }
    } catch {
      Alert.alert("Error", "Network error.");
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const len = text.length;

  return (
    <View style={{ flex: 1, backgroundColor: "#fafbfc" }}>
      <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
        <TextInput style={s.textarea} placeholder="What's on your mind?" value={text}
          onChangeText={setText} multiline maxLength={5000} textAlignVertical="top" />

        <View style={s.chips}>
          {PLATFORMS.map((p) => (
            <TouchableOpacity key={p.key} style={[s.chip, selected.has(p.key) && s.chipSelected]}
              onPress={() => toggle(p.key)}>
              <Text style={[s.chipText, selected.has(p.key) && s.chipTextSelected]}>
                {p.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.footer}>
          <Text style={[s.charCount, len > 300 && { color: "#d97706" }, len > 5000 && { color: "#dc2626" }]}>
            {len} / 300
          </Text>
          <TouchableOpacity style={[s.btn, (len === 0 || loading) && { opacity: 0.5 }]}
            onPress={post} disabled={len === 0 || loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Post</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Bottom nav */}
      <View style={s.tabs}>
        <TouchableOpacity style={s.tab}><Text style={s.tabActive}>Compose</Text></TouchableOpacity>
        <TouchableOpacity style={s.tab} onPress={() => nav.navigate("Accounts")}><Text style={s.tabText}>Accounts</Text></TouchableOpacity>
        <TouchableOpacity style={s.tab} onPress={() => nav.navigate("History")}><Text style={s.tabText}>History</Text></TouchableOpacity>
        <TouchableOpacity style={s.tab} onPress={signOut}><Text style={s.tabText}>Sign out</Text></TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  textarea: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e6ed", borderRadius: 12,
    padding: 16, fontSize: 16, minHeight: 140, fontFamily: undefined, color: "#1a1d23", marginBottom: 16 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: "#e2e6ed", backgroundColor: "#fff" },
  chipSelected: { borderColor: "#4f46e5", backgroundColor: "#eef2ff" },
  chipText: { fontSize: 13, fontWeight: "500", color: "#5f6b7a" },
  chipTextSelected: { color: "#4f46e5" },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  charCount: { fontSize: 13, color: "#8f99a8" },
  btn: { backgroundColor: "#4f46e5", borderRadius: 10, paddingHorizontal: 28, paddingVertical: 12 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  tabs: { flexDirection: "row", borderTopWidth: 1, borderColor: "#e2e6ed", backgroundColor: "#fff", paddingBottom: 20 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 12 },
  tabActive: { fontSize: 12, fontWeight: "600", color: "#4f46e5" },
  tabText: { fontSize: 12, color: "#8f99a8" },
});
