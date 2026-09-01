import React, { useState, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Alert, ActivityIndicator, Modal, Linking,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Plus, Pencil, Trash2, Star } from "lucide-react-native";
import { useTheme } from "../lib/theme";
import { FloatingMenuButton } from "../components/Menu";
import {
  listTeams, createTeam, activateTeam, renameTeam, deleteTeam,
  listAccounts, connectUrl, disconnectAccount, setChannel, type Team, type Account,
} from "../lib/api";

const CHANNEL_PLATFORMS = new Set(["linkedin", "facebook", "youtube"]);

const ACCOUNTS = [
  { key: "bluesky", name: "Bluesky", soon: false },
  { key: "x", name: "X (Twitter)", soon: false },
  { key: "linkedin", name: "LinkedIn", soon: false },
  { key: "facebook", name: "Facebook", soon: false },
  { key: "instagram", name: "Instagram", soon: false },
  { key: "threads", name: "Threads", soon: false },
  { key: "tiktok", name: "TikTok", soon: false },
  { key: "youtube", name: "YouTube", soon: false },
  { key: "pinterest", name: "Pinterest", soon: false },
  { key: "slack", name: "Slack", soon: false },
  { key: "discord", name: "Discord", soon: false },
  { key: "reddit", name: "Reddit", soon: true },
  { key: "google_business", name: "Google Business", soon: true },
];

export default function AccountsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [editor, setEditor] = useState<{ mode: "create" | "rename"; team?: Team } | null>(null);
  const [name, setName] = useState("");
  const [channelPicker, setChannelPicker] = useState<{ platform: string; channels: any[]; selectedId: string } | null>(null);

  const selectedTeam = teams.find((t) => t.id === selectedTeamId) || teams.find((t) => t.is_active);

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    setLoadingTeams(true);
    try {
      const t = await listTeams();
      setTeams(t);
      if (t.length && !t.some((x) => x.id === selectedTeamId)) {
        setSelectedTeamId((t.find((x) => x.is_active) || t[0]).id);
      }
      await loadAccounts(t.find((x) => x.id === selectedTeamId) ? selectedTeamId : (t.find((x) => x.is_active) || t[0])?.id || "");
    } catch {}
    finally { setLoadingTeams(false); }
  }

  async function loadAccounts(teamId: string) {
    setSelectedTeamId(teamId);
    setLoadingAccounts(true);
    try { setAccounts(await listAccounts(teamId || undefined)); }
    catch { setAccounts([]); }
    finally { setLoadingAccounts(false); }
  }

  async function submitTeam() {
    const label = name.trim();
    if (!label) return;
    try {
      if (editor?.mode === "rename" && editor.team) {
        await renameTeam(editor.team.id, label);
      } else {
        const res = await createTeam(label);
        if (res?.team?.id) setSelectedTeamId(res.team.id);
      }
      setEditor(null);
      setName("");
      await load();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to save team.");
    }
  }

  async function makeDefault(t: Team) {
    try { await activateTeam(t.id); await load(); }
    catch (e: any) { Alert.alert("Error", e?.message || "Failed."); }
  }

  function removeTeam(t: Team) {
    Alert.alert("Delete team?", `"${t.label}" and its connected accounts will be removed.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try {
          await deleteTeam(t.id);
          if (selectedTeamId === t.id) setSelectedTeamId("");
          await load();
        } catch (e: any) { Alert.alert("Error", e?.message || "Failed."); }
      } },
    ]);
  }

  function isConnected(key: string) {
    return accounts.some((a) => a.platform === key);
  }

  function accountFor(key: string): Account | undefined {
    return accounts.find((a) => a.platform === key);
  }

  async function pickChannel(platform: string, channelId: string | undefined) {
    try {
      await setChannel(platform, channelId, selectedTeamId || undefined);
      await loadAccounts(selectedTeamId);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not set page.");
    }
  }

  async function connect(key: string) {
    try {
      const url = await connectUrl(key, selectedTeamId || undefined);
      if (url) { await Linking.openURL(url); }
      else Alert.alert("Connect", "Couldn't open the connection portal. Try again.");
    } catch {
      Alert.alert("Connect", "Couldn't open the connection portal. Try again.");
    }
  }

  function disconnect(key: string) {
    Alert.alert("Disconnect?", `Remove ${key} from this team?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Disconnect", style: "destructive", onPress: async () => {
        try { await disconnectAccount(key, selectedTeamId || undefined); await loadAccounts(selectedTeamId); }
        catch (e: any) { Alert.alert("Error", e?.message || "Failed."); }
      } },
    ]);
  }

  const inputStyle = [styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }];

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]} keyboardShouldPersistTaps="handled">
      <View style={[styles.sectionHeader, { marginTop: 0 }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Teams</Text>
        <TouchableOpacity style={[styles.addBtn, { borderColor: colors.brand }]} onPress={() => { setName(""); setEditor({ mode: "create" }); }}>
          <Plus size={16} color={colors.brand} />
          <Text style={[styles.addBtnText, { color: colors.brand }]}>New</Text>
        </TouchableOpacity>
      </View>

      {loadingTeams ? <ActivityIndicator color={colors.brand} style={{ marginVertical: 20 }} /> : (
        teams.length === 0 ? (
          <Text style={[styles.emptyNote, { color: colors.textMuted }]}>No teams yet. Create one to organize your accounts.</Text>
        ) : teams.map((t) => {
          const isSel = t.id === selectedTeamId;
          return (
            <TouchableOpacity key={t.id} style={[styles.teamRow, { backgroundColor: colors.surface, borderColor: isSel ? colors.brand : colors.border }, isSel && { borderWidth: 1.5 }]}
              onPress={() => loadAccounts(t.id)}>
              <View style={styles.teamInfo}>
                <View style={styles.teamNameRow}>
                  <Text style={[styles.teamName, { color: colors.text }]}>{t.label}</Text>
                  {t.is_active && <Text style={[styles.defaultBadge, { color: colors.success }]}>default</Text>}
                </View>
                <Text style={[styles.teamSub, { color: colors.textMuted }]}>{isSel ? "Showing accounts" : "Tap to view accounts"}</Text>
              </View>
              <View style={styles.teamActions}>
                {!t.is_active && (
                  <TouchableOpacity onPress={() => makeDefault(t)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Star size={17} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => { setName(t.label); setEditor({ mode: "rename", team: t }); }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Pencil size={16} color={colors.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeTeam(t)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Trash2 size={16} color={colors.error} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })
      )}

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Accounts</Text>
        <Text style={[styles.sectionSub, { color: colors.textMuted }]}>
          {selectedTeam ? `for ${selectedTeam.label}` : ""}
        </Text>
      </View>
      <Text style={[styles.helper, { color: colors.textMuted }]}>Connect your social profiles to start cross-posting.</Text>

      {loadingAccounts ? <ActivityIndicator color={colors.brand} style={{ marginVertical: 20 }} /> : (
        ACCOUNTS.map((p) => {
          const on = isConnected(p.key);
          const disabled = p.soon;
          const acc = accountFor(p.key);
          const handle = on ? (acc?.handle || acc?.label || "") : "";
          const channels = acc?.channels || [];
          const selChannel = channels.find((c) => c.id === acc?.selectedChannelId);
          const needsChannel = on && CHANNEL_PLATFORMS.has(p.key);
          return (
            <View key={p.key} style={[styles.accountRow, { backgroundColor: colors.surface, borderColor: colors.border }, disabled && { opacity: 0.55 }]}>
              <View style={styles.accountInfo}>
                <Text style={[styles.accountName, { color: colors.text }]}>
                  {p.name}{handle ? `  @${handle}` : ""}
                </Text>
                <Text style={[styles.accountStatus, { color: on ? colors.success : colors.textMuted }]}>
                  {on ? "Connected" : p.soon ? "Coming soon" : "Not connected"}
                </Text>
                {needsChannel && (
                  channels.length === 0 ? (
                    <Text style={[styles.channelHint, { color: colors.textMuted }]}>No pages found — reconnect to refresh pages.</Text>
                  ) : (
                    <TouchableOpacity style={[styles.channelBtn, { borderColor: colors.border }]}
                      onPress={() => setChannelPicker({ platform: p.key, channels, selectedId: acc?.selectedChannelId || "" })}>
                      <Text style={[styles.channelBtnText, { color: colors.textSecondary }]}>
                        Page: {selChannel?.name || "None selected"}
                      </Text>
                      <Text style={[styles.channelBtnCaret, { color: colors.textMuted }]}>▾</Text>
                    </TouchableOpacity>
                  )
                )}
              </View>
              <TouchableOpacity style={[styles.connectBtn, { borderColor: on ? colors.success : colors.border }]}
                disabled={disabled} onPress={() => on ? disconnect(p.key) : connect(p.key)}>
                <Text style={[styles.connectBtnText, { color: on ? colors.success : colors.brand }]}>
                  {on ? "Disconnect" : "Connect"}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })
      )}

      <Modal visible={!!channelPicker} transparent animationType="fade" onRequestClose={() => setChannelPicker(null)}>
        <View style={styles.editorBackdrop}>
          <View style={[styles.editorCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.editorTitle, { color: colors.text }]}>Choose page</Text>
            <TouchableOpacity style={[styles.channelOpt, channelPicker?.selectedId === "" && { backgroundColor: colors.brandSoft }]}
              onPress={() => { if (channelPicker) { pickChannel(channelPicker.platform, undefined); setChannelPicker(null); } }}>
              <Text style={[styles.channelOptText, { color: colors.textSecondary }]}>No page selected</Text>
            </TouchableOpacity>
            {(channelPicker?.channels || []).map((c) => (
              <TouchableOpacity key={c.id} style={[styles.channelOpt, channelPicker?.selectedId === c.id && { backgroundColor: colors.brandSoft }]}
                onPress={() => { if (channelPicker) { pickChannel(channelPicker.platform, c.id); setChannelPicker(null); } }}>
                <Text style={[styles.channelOptText, { color: channelPicker?.selectedId === c.id ? colors.brand : colors.textSecondary }]}>{c.name || c.id}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      <Modal visible={!!editor} transparent animationType="fade" onRequestClose={() => setEditor(null)}>
        <View style={styles.editorBackdrop}>
          <View style={[styles.editorCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.editorTitle, { color: colors.text }]}>
              {editor?.mode === "rename" ? "Rename team" : "New team"}
            </Text>
            <TextInput style={inputStyle} value={name} onChangeText={setName} placeholder="Team name" placeholderTextColor={colors.textMuted}
              autoCapitalize="words" autoFocus onSubmitEditing={submitTeam} />
            <View style={styles.editorActions}>
              <TouchableOpacity style={[styles.editorBtn, { borderWidth: 1, borderColor: colors.border }]} onPress={() => setEditor(null)}>
                <Text style={[styles.editorBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.editorBtn, { backgroundColor: colors.brand }]} onPress={submitTeam} disabled={!name.trim()}>
                <Text style={[styles.editorBtnText, { color: "#fff" }]}>{editor?.mode === "rename" ? "Save" : "Create"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      </ScrollView>
      <FloatingMenuButton />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 48 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 22, marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: "700" },
  sectionSub: { fontSize: 13 },
  helper: { fontSize: 13, marginBottom: 12 },
  emptyNote: { fontSize: 14, marginVertical: 8 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  addBtnText: { fontSize: 14, fontWeight: "600" },
  teamRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1 },
  teamInfo: { flex: 1 },
  teamNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  teamName: { fontSize: 15, fontWeight: "600" },
  defaultBadge: { fontSize: 10, fontWeight: "600", textTransform: "uppercase" },
  teamSub: { fontSize: 12, marginTop: 2 },
  teamActions: { flexDirection: "row", alignItems: "center", gap: 16 },
  accountRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1 },
  accountInfo: { flex: 1 },
  accountName: { fontSize: 15, fontWeight: "600" },
  accountStatus: { fontSize: 12, marginTop: 2 },
  channelHint: { fontSize: 12, marginTop: 8 },
  channelBtn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginTop: 10 },
  channelBtnText: { fontSize: 13, fontWeight: "500" },
  channelBtnCaret: { fontSize: 13 },
  channelOpt: { paddingVertical: 12, borderRadius: 8, paddingHorizontal: 12, marginTop: 4 },
  channelOptText: { fontSize: 14, fontWeight: "500" },
  connectBtn: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  connectBtnText: { fontSize: 13, fontWeight: "600" },
  editorBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 28 },
  editorCard: { borderRadius: 16, padding: 20, borderWidth: 1 },
  editorTitle: { fontSize: 17, fontWeight: "700", marginBottom: 14 },
  editorActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 16 },
  editorBtn: { borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  editorBtnText: { fontSize: 14, fontWeight: "600" },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15 },
});
