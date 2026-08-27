import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Linking } from "react-native";
import { supabase } from "../lib/supabase";

const API_BASE = "https://post.freesurf.tools";

const PLATFORMS = [
  { key: "bluesky", name: "Bluesky", note: "App Password — no registration needed" },
  { key: "x", name: "X (Twitter)", note: "Connected via Bundle (no free API tier)" },
  { key: "linkedin", name: "LinkedIn", note: "Personal + company pages" },
  { key: "facebook", name: "Facebook", note: "Personal + business pages" },
  { key: "instagram", name: "Instagram", note: "Professional account required" },
  { key: "threads", name: "Threads", note: "Text posts supported" },
  { key: "tiktok", name: "TikTok", note: "Content Posting API approval" },
  { key: "youtube", name: "YouTube", note: "Channel selection required" },
];

export default function AccountsScreen() {
  const [connected, setConnected] = useState<Set<string>>(new Set());

  useEffect(() => { fetchAccounts(); }, []);

  async function fetchAccounts() {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const res = await fetch(`${API_BASE}/api/bundle-accounts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const accounts = await res.json();
      setConnected(new Set((accounts || []).map((a: any) => a.platform)));
    } catch {}
  }

  async function handleConnect(platform: string) {
    if (platform === "bluesky") {
      Alert.alert("Bluesky", "Use an App Password from bsky.app/settings/app-passwords to connect directly.");
      return;
    }
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) { Alert.alert("Error", "Sign in first."); return; }
      const res = await fetch(`${API_BASE}/api/connect/${platform}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const bundleData = await res.json();
      if (bundleData.url) {
        Linking.openURL(bundleData.url);
        Alert.alert("Connect", "Portal opened. After connecting, pull down to refresh.");
      }
    } catch { Alert.alert("Error", "Unable to open connection portal."); }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#fafbfc" }} contentContainerStyle={s.container}>
      <Text style={s.heading}>Connect your social profiles to start cross-posting.</Text>
      {PLATFORMS.map((p) => {
        const isConnected = connected.has(p.key);
        return (
          <View key={p.key} style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{p.name}</Text>
              <Text style={[s.status, isConnected && { color: "#059669" }]}>
                {isConnected ? "Connected" : p.note || "Not connected"}
              </Text>
            </View>
            <TouchableOpacity style={[s.btn, isConnected && { borderColor: "#059669" }]}
              onPress={() => handleConnect(p.key)}>
              <Text style={[s.btnText, isConnected && { color: "#059669" }]}>
                {isConnected ? "Refresh" : "Connect"}
              </Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { padding: 16 },
  heading: { fontSize: 14, color: "#8f99a8", marginBottom: 20 },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff",
    borderRadius: 12, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: "#eef1f5" },
  icon: { fontSize: 22, marginRight: 14 },
  name: { fontSize: 16, fontWeight: "600", color: "#1a1d23" },
  status: { fontSize: 13, color: "#8f99a8", marginTop: 2 },
  btn: { borderWidth: 1, borderColor: "#e2e6ed", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  btnText: { fontSize: 14, fontWeight: "500", color: "#4f46e5" },
});