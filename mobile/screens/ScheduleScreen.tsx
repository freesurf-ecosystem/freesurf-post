import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, Alert, TouchableOpacity, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CalendarClock } from "lucide-react-native";
import { useTheme } from "../lib/theme";
import { FloatingMenuButton } from "../components/Menu";
import { listScheduled, cancelScheduled, type ScheduledPost } from "../lib/api";

export default function ScheduleScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => { fetchPosts(); }, []));

  async function fetchPosts() {
    try {
      const data = await listScheduled();
      setPosts(data);
    } catch { setPosts([]); }
    finally { setLoading(false); }
  }

  async function cancel(p: ScheduledPost) {
    Alert.alert("Cancel post?", `Cancel the post scheduled for ${new Date(p.scheduledAt).toLocaleString()}?`, [
      { text: "No", style: "cancel" },
      { text: "Cancel post", style: "destructive", onPress: async () => {
        try { await cancelScheduled(p.id); setPosts((prev) => prev.filter((x) => x.id !== p.id)); }
        catch (e: any) { Alert.alert("Error", e?.message || "Could not cancel."); }
      } },
    ]);
  }

  if (loading) {
    return <View style={[styles.center, { backgroundColor: colors.bg }]}><ActivityIndicator color={colors.brand} /></View>;
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <FlatList
        style={styles.list}
        contentContainerStyle={[posts.length ? styles.content : styles.emptyContent, { paddingTop: insets.top + 16 }]}
        data={posts}
        keyExtractor={(p) => p.id}
        onRefresh={fetchPosts}
        refreshing={loading}
        ListEmptyComponent={
          <View style={styles.empty}>
            <CalendarClock size={28} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No scheduled posts yet. Compose a post and flip on "Schedule for later".</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.platforms, { color: colors.brand }]}>{item.platforms.join(", ")}</Text>
            <Text style={[styles.scheduled, { color: colors.textMuted }]}>{new Date(item.scheduledAt).toLocaleString()}</Text>
            <Text style={[styles.textPreview, { color: colors.text }]} numberOfLines={3}>"{item.text}"</Text>
            <TouchableOpacity onPress={() => cancel(item)}>
              <Text style={[styles.cancel, { color: colors.error }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      />
      <FloatingMenuButton />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { flex: 1 },
  content: { padding: 16, paddingBottom: 48 },
  emptyContent: { flexGrow: 1, justifyContent: "center" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  empty: { alignItems: "center", gap: 12, paddingHorizontal: 40 },
  emptyText: { fontSize: 15, textAlign: "center" },
  row: { borderRadius: 12, padding: 16, marginBottom: 8, borderWidth: 1 },
  platforms: { fontSize: 13, fontWeight: "600", marginBottom: 4 },
  scheduled: { fontSize: 12, marginBottom: 6 },
  textPreview: { fontSize: 14, marginBottom: 8 },
  cancel: { fontSize: 14, fontWeight: "600" },
});
