import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, Alert, TouchableOpacity, ActivityIndicator } from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FileText } from "lucide-react-native";
import { useTheme } from "../lib/theme";
import { FloatingMenuButton } from "../components/Menu";
import { listDrafts, deleteDraft, type Draft } from "../lib/api";
import type { RootStackParamList } from "../App";

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function DraftsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => { fetchDrafts(); }, []));

  async function fetchDrafts() {
    try { setDrafts(await listDrafts()); }
    catch { setDrafts([]); }
    finally { setLoading(false); }
  }

  function load(d: Draft) {
    nav.navigate("Compose", { draftText: d.text, draftPlatforms: d.platforms || [] });
  }

  function remove(d: Draft) {
    Alert.alert("Delete draft?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await deleteDraft(d.id); setDrafts((prev) => prev.filter((x) => x.id !== d.id)); }
        catch (e: any) { Alert.alert("Error", e?.message || "Could not delete."); }
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
        contentContainerStyle={[drafts.length ? styles.content : styles.emptyContent, { paddingTop: insets.top + 16 }]}
        data={drafts}
        keyExtractor={(d) => d.id}
        onRefresh={fetchDrafts}
        refreshing={loading}
        ListEmptyComponent={
          <View style={styles.empty}>
            <FileText size={28} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No drafts yet. Save a post from Compose to get started.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.rowTop}>
              <Text style={[styles.meta, { color: colors.textMuted }]}>
                {item.platforms?.length ? item.platforms.join(", ") : "No platforms"} · {new Date(item.updated_at).toLocaleDateString()}
              </Text>
            </View>
            <Text style={[styles.text, { color: colors.text }]} numberOfLines={3}>{item.text}</Text>
            <View style={styles.actions}>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.brand }]} onPress={() => load(item)}>
                <Text style={styles.actionText}>Load</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, { borderWidth: 1, borderColor: colors.border }]} onPress={() => remove(item)}>
                <Text style={[styles.actionGhostText, { color: colors.error }]}>Delete</Text>
              </TouchableOpacity>
            </View>
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
  rowTop: { marginBottom: 6 },
  meta: { fontSize: 12 },
  text: { fontSize: 14, marginBottom: 12 },
  actions: { flexDirection: "row", gap: 8 },
  actionBtn: { borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  actionText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  actionGhostText: { fontSize: 14, fontWeight: "600" },
});
