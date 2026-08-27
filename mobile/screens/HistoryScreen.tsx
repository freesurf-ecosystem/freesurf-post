import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { supabase } from "../lib/supabase";

const API_BASE = "https://post.freesurf.tools";

export default function HistoryScreen() {
  const [posts, setPosts] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchPosts();
  }, []);

  async function fetchPosts() {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      setRefreshing(true);
      const res = await fetch(`${API_BASE}/api/scheduled`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const scheduleData = await res.json();
      setPosts(scheduleData || []);
    } catch {
      setPosts([]);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#fafbfc" }}
      contentContainerStyle={s.container}
      refreshing={refreshing}
      onRefresh={fetchPosts}
      {...RefreshControl.props}
    >
      {posts.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyText}>No scheduled posts yet. Compose a post and schedule it for later.</Text>
        </View>
      ) : (
        posts.map((p) => (
          <View key={p.id} style={s.row}>
            <Text style={s.platforms}>Platforms: {p.platforms.join(", ")}</Text>
            <Text style={s.scheduled}>Scheduled: {new Date(p.scheduledAt).toLocaleString()}</Text>
            <Text style={s.textPreview}>"{p.text.substring(0, 50)}{p.text.length > 50 ? "..." : ""}"</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { padding: 16, flex: 1 },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 80 },
  emptyText: { fontSize: 16, color: "#8f99a8", textAlign: "center", paddingHorizontal: 40 },
  row: { flexDirection: "column", backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: "#eef1f5" },
  platforms: { fontSize: 13, color: "#4f46e5", marginBottom: 4 },
  scheduled: { fontSize: 12, color: "#8f99a8", marginBottom: 4 },
  textPreview: { fontSize: 14, color: "#1a1d23", marginTop: 2 },
});