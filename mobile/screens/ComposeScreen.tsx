import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Image, Pressable, Modal,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { useNavigation, useRoute, useFocusEffect } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { ImagePlus, X } from "lucide-react-native";
import type { RootStackParamList } from "../App";
import { useTheme } from "../lib/theme";
import { FloatingMenuButton } from "../components/Menu";
import { listTeams, listAccounts, publishPost, schedulePost, saveDraft, uploadMedia, type Team, type PlatformTargets, type Account } from "../lib/api";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type ComposeRoute = RouteProp<RootStackParamList, "Compose">;

const PLATFORMS = [
  { key: "bluesky", name: "Bluesky" },
  { key: "x", name: "X" },
  { key: "linkedin", name: "LinkedIn" },
  { key: "facebook", name: "Facebook" },
  { key: "instagram", name: "Instagram" },
  { key: "threads", name: "Threads" },
  { key: "tiktok", name: "TikTok" },
  { key: "youtube", name: "YouTube" },
  { key: "pinterest", name: "Pinterest" },
  { key: "slack", name: "Slack" },
  { key: "discord", name: "Discord" },
  { key: "reddit", name: "Reddit", soon: true },
  { key: "google_business", name: "Google Business", soon: true },
];

const TARGETS: Record<string, { label: string; placeholder: string }> = {
  discord: { label: "Discord channel ID", placeholder: "e.g. 123456789012345678" },
  slack: { label: "Slack channel ID", placeholder: "e.g. C0123ABCDEF" },
  pinterest: { label: "Pinterest board", placeholder: "e.g. My Board" },
  reddit: { label: "Subreddit", placeholder: "e.g. r/example" },
};

const CHAR_LIMIT = 5000;
const MAX_MEDIA = 4;

const TIMEZONES = [
  "UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Anchorage", "America/Phoenix", "Pacific/Honolulu", "Europe/London", "Europe/Paris",
  "Europe/Berlin", "Europe/Madrid", "Europe/Rome", "Europe/Amsterdam", "Europe/Stockholm",
  "Europe/Warsaw", "Europe/Istanbul", "Europe/Moscow", "Asia/Dubai", "Asia/Karachi",
  "Asia/Kolkata", "Asia/Bangkok", "Asia/Singapore", "Asia/Hong_Kong", "Asia/Shanghai",
  "Asia/Tokyo", "Asia/Seoul", "Australia/Sydney", "Australia/Melbourne", "Pacific/Auckland",
  "Africa/Cairo", "Africa/Johannesburg", "America/Sao_Paulo", "America/Mexico_City",
  "America/Toronto", "America/Vancouver",
];

function defaultTz(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
}

function tzOffsetMs(date: Date, tz: string): number {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(date).map((x) => [x.type, x.value])
    );
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second) - date.getTime();
  } catch { return 0; }
}

function wallClockToUTC(wallStr: string, tz: string): Date {
  const target = new Date(`${wallStr}:00Z`);
  let d = target;
  for (let i = 0; i < 3; i++) d = new Date(target.getTime() - tzOffsetMs(d, tz));
  return d;
}

function maskDate(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
}

function maskTime12(v: string): string {
  const t = v.replace(/\D/g, "").slice(0, 4);
  if (t.length <= 1) return t;
  const two = Number(t.slice(0, 2));
  if (t.length === 2) return two > 12 ? `${t.slice(0, 1)}:${t.slice(1)}` : t;
  if (t.length === 3) return two > 12 ? `${t.slice(0, 1)}:${t.slice(1)}` : `${t.slice(0, 2)}:${t.slice(2)}`;
  return two > 12 ? `${t.slice(0, 1)}:${t.slice(1, 3)}` : `${t.slice(0, 2)}:${t.slice(2)}`;
}

function to12h(t24: string): string {
  const [h, m] = t24.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")}`;
}

function to24h(t12: string, ampm: string): string {
  const [h, m] = t12.split(":").map(Number);
  let hh = (h || 0) % 12;
  if (ampm === "PM") hh += 12;
  return `${String(hh).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;
}

function nowInTz(tz: string): { date: string; time: string } {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value])
    );
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
  } catch {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
  }
}

function roundUp5Min(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const total = h * 60 + m;
  const next = Math.ceil((total + 1) / 5) * 5;
  const nh = Math.floor(next / 60) % 24, nm = next % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

function hasLink(text: string): boolean {
  if (!text) return false;
  return /(https?:\/\/\S+|www\.\S+|\w+\.\w+)/i.test(text);
}

type MediaItem = { uri: string; name: string; mime: string; uploadId?: string };

export default function ComposeScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const route = useRoute<ComposeRoute>();

  const [text, setText] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(["bluesky"]));
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState<string>("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [time12, setTime12] = useState("");
  const [ampm, setAmpm] = useState("AM");
  const [scheduleTouched, setScheduleTouched] = useState(false);
  const [targetPlatform, setTargetPlatform] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [selectedTz, setSelectedTz] = useState("UTC");
  const [tzOpen, setTzOpen] = useState(false);

  function prefillSchedule(tz: string) {
    const now = nowInTz(tz);
    const t24 = roundUp5Min(now.time);
    setScheduleDate(now.date);
    setTime12(to12h(t24));
    setAmpm(Number(t24.split(":")[0]) >= 12 ? "PM" : "AM");
    setScheduleTouched(false);
  }

  useEffect(() => {
    AsyncStorage.getItem("freesurf-post-tz")
      .then((saved) => {
        const tz = TIMEZONES.includes(saved as string) ? (saved as string) : defaultTz();
        setSelectedTz(tz);
        prefillSchedule(tz);
      })
      .catch(() => { prefillSchedule(defaultTz()); });
  }, []);

  useEffect(() => {
    AsyncStorage.setItem("freesurf-post-tz", selectedTz).catch(() => {});
  }, [selectedTz]);

  useFocusEffect(useCallback(() => { loadTeams(); }, []));

  useEffect(() => {
    const p = route.params;
    if (p?.draftText) {
      setText(p.draftText);
      if (p.draftPlatforms?.length) setSelected(new Set(p.draftPlatforms));
    }
  }, [route.params]);

  useEffect(() => {
    const needTarget = Array.from(selected).find((p) => TARGETS[p]);
    setTargetPlatform(needTarget || "");
    if (!needTarget) setTargetValue("");
  }, [selected]);

  useEffect(() => {
    if (teamId) loadAccounts();
  }, [teamId]);

  async function loadTeams() {
    try {
      const t = await listTeams();
      setTeams(t);
      if (t.length) {
        const active = t.find((x) => x.id === teamId) || t.find((x) => x.is_active) || t[0];
        setTeamId(active.id);
      }
    } catch {}
  }

  async function loadAccounts() {
    try { setAccounts(await listAccounts(teamId || undefined)); }
    catch { setAccounts([]); }
  }

  function connectedHandle(key: string): string {
    const acc = accounts.find((a) => a.platform === key);
    return acc?.handle || acc?.label || "";
  }

  function toggle(p: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });
  }

  function targets(): PlatformTargets {
    return targetPlatform && targetValue.trim() ? { [targetPlatform]: targetValue.trim() } : {};
  }

  async function pickMedia() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: MAX_MEDIA - media.length,
      quality: 0.9,
    });
    if (res.canceled) return;
    const items = res.assets.map((a) => ({
      uri: a.uri,
      name: a.fileName || `image-${Date.now()}.jpg`,
      mime: a.mimeType || "image/jpeg",
    }));
    setMedia((prev) => [...prev, ...items].slice(0, MAX_MEDIA));
  }

  function removeMedia(idx: number) {
    setMedia((prev) => prev.filter((_, i) => i !== idx));
  }

  function buildScheduledAt(): string | null {
    const date = scheduleDate.trim(), time = to24h(time12, ampm).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { Alert.alert("Error", "Enter the schedule date as YYYY-MM-DD."); return null; }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) { Alert.alert("Error", "Enter a valid time."); return null; }
    const dt = wallClockToUTC(`${date}T${time}`, selectedTz);
    if (Number.isNaN(dt.getTime())) { Alert.alert("Error", "That date/time isn't valid."); return null; }
    if (dt.getTime() <= Date.now()) { Alert.alert("Error", "That time is in the past — pick a future date/time."); return null; }
    return dt.toISOString();
  }

  async function post() {
    if (!text.trim()) return;
    if (selected.size === 0) { Alert.alert("Error", "Select at least one platform."); return; }
    setLoading(true);
    try {
      // Upload any attached media first (scoped to the selected team).
      const mediaUrls: string[] = [];
      for (const m of media) {
        if (m.uploadId) { mediaUrls.push(m.uploadId); continue; }
        mediaUrls.push(await uploadMedia(m.uri, m.name, m.mime, teamId || undefined));
      }

      const willSchedule = !!(scheduleDate.trim() && scheduleTime.trim());
      const body = { platforms: Array.from(selected), text: text.trim(), teamId: teamId || undefined, mediaUrls: mediaUrls.length ? mediaUrls : undefined, platformTargets: targets() };

      if (willSchedule) {
        const scheduledAt = buildScheduledAt();
        if (!scheduledAt) return;
        await schedulePost({ ...body, scheduledAt } as any);
        Alert.alert("Scheduled!", `Post scheduled for ${new Date(scheduledAt).toLocaleString()}.`);
      } else {
        const result = await publishPost(body as any);
        const results = result?.results || [];
        const ok = results.filter((r: any) => r.success).length;
        const failed = results.length - ok;
        Alert.alert("Posted!", failed ? `Posted to ${ok} platform(s); ${failed} failed.` : `Posted to ${ok} platform(s).`);
      }
      reset();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Request failed.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setText("");
    setSelected(new Set(["bluesky"]));
    setTargetValue("");
    setMedia([]);
    prefillSchedule(selectedTz);
  }

  async function saveCurrentDraft() {
    if (!text.trim()) { Alert.alert("Draft", "Add some content to save as a draft."); return; }
    try {
      await saveDraft(text.trim(), Array.from(selected));
      Alert.alert("Saved", "Draft saved.");
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not save draft.");
    }
  }

  const len = text.length;
  const needTarget = Array.from(selected).find((p) => TARGETS[p]);
  const scheduleTime = to24h(time12, ampm);
  const willSchedule = scheduleTouched && !!(scheduleDate.trim() && scheduleTime.trim());

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.screen}>
        <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
          keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { color: colors.textMuted }]}>Team</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.teamRow}>
          {teams.length === 0 && <Text style={{ color: colors.textMuted, fontSize: 13 }}>No teams yet — add one in Accounts.</Text>}
          {teams.map((t) => (
            <TouchableOpacity key={t.id} style={[styles.teamChip, { borderColor: colors.border, backgroundColor: colors.surface }, teamId === t.id && { borderColor: colors.brand, backgroundColor: colors.brandSoft }]}
              onPress={() => setTeamId(t.id)}>
              <Text style={[styles.teamChipText, { color: teamId === t.id ? colors.brand : colors.textSecondary }]}>{t.label}</Text>
              {t.is_active && <Text style={[styles.activeBadge, { color: colors.textMuted }]}>default</Text>}
            </TouchableOpacity>
          ))}
        </ScrollView>

        <TextInput style={[styles.textarea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          placeholder="What's on your mind?" placeholderTextColor={colors.textMuted} value={text} onChangeText={setText}
          multiline maxLength={CHAR_LIMIT} textAlignVertical="top" />

        {hasLink(text) && (
          <View style={[styles.linkWarning, { borderColor: colors.warning, backgroundColor: "rgba(217,119,6,0.12)" }]}>
            <Text style={[styles.linkWarningText, { color: colors.warning }]}>Contains a link — X charges $0.20 instead of $0.015</Text>
          </View>
        )}

        <Text style={[styles.label, { color: colors.textMuted }]}>Media</Text>
        <View style={styles.mediaRow}>
          {media.map((m, i) => (
            <View key={m.uri + i} style={[styles.mediaThumbWrap, { borderColor: colors.border }]}>
              <Image source={{ uri: m.uri }} style={styles.mediaThumb} />
              <Pressable style={styles.mediaRemove} onPress={() => removeMedia(i)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <X size={14} color="#fff" />
              </Pressable>
            </View>
          ))}
          {media.length < MAX_MEDIA && (
            <TouchableOpacity style={[styles.addMedia, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={pickMedia}>
              <ImagePlus size={20} color={colors.brand} />
              <Text style={[styles.addMediaText, { color: colors.brand }]}>Add</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.chips}>
          {PLATFORMS.map((p) => {
            const on = selected.has(p.key);
            const handle = connectedHandle(p.key);
            return (
              <TouchableOpacity key={p.key} style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surface }, on && { borderColor: colors.brand, backgroundColor: colors.brandSoft }, p.soon && styles.chipSoon]}
                onPress={() => { if (!p.soon) toggle(p.key); }} disabled={p.soon}>
                {handle ? <View style={[styles.connectedDot, { backgroundColor: colors.success }]} /> : null}
                <Text style={[styles.chipText, { color: colors.textSecondary }, on && { color: colors.brand }, p.soon && { color: colors.textMuted }]}>
                  {p.name}{p.soon ? " · soon" : ""}{handle ? ` @${handle}` : ""}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {needTarget && (
          <View style={styles.targetRow}>
            <Text style={[styles.label, { color: colors.textMuted }]}>{TARGETS[needTarget].label}</Text>
            <TextInput style={[styles.targetInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              placeholder={TARGETS[needTarget].placeholder} placeholderTextColor={colors.textMuted}
              value={targetValue} onChangeText={setTargetValue} autoCapitalize="none" />
          </View>
        )}

        <View style={[styles.scheduleCard, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
          <View style={styles.scheduleHeader}>
            <Text style={[styles.scheduleTitle, { color: colors.text }]}>Schedule (optional)</Text>
            <TouchableOpacity onPress={saveCurrentDraft}>
              <Text style={[styles.draftLink, { color: colors.brand }]}>Save draft</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.scheduleInputs}>
            <TextInput style={[styles.scheduleField, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} value={scheduleDate}
              onChangeText={(v) => { setScheduleTouched(true); setScheduleDate(maskDate(v)); }} onFocus={() => { if (!scheduleDate.trim()) prefillSchedule(selectedTz); }}
              autoCapitalize="none" keyboardType="number-pad" />
            <View style={styles.timeGroup}>
              <TextInput style={[styles.scheduleField, styles.timeField, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                placeholder="3:05" placeholderTextColor={colors.textMuted} value={time12}
                onChangeText={(v) => { setScheduleTouched(true); setTime12(maskTime12(v)); }} onFocus={() => { if (!time12.trim()) prefillSchedule(selectedTz); }}
                autoCapitalize="none" keyboardType="number-pad" />
              <View style={styles.ampmGroup}>
                {(["AM", "PM"] as const).map((m) => (
                  <TouchableOpacity key={m} style={[styles.ampmBtn, { borderColor: colors.border }, ampm === m && { backgroundColor: colors.brandSoft, borderColor: colors.brand }]}
                    onPress={() => { setScheduleTouched(true); setAmpm(m); }}>
                    <Text style={[styles.ampmText, { color: ampm === m ? colors.brand : colors.textSecondary }]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
          {willSchedule && (
            <Text style={[styles.schedulePreview, { color: colors.textSecondary }]}>
              Posts at {new Date(wallClockToUTC(`${scheduleDate}T${scheduleTime}`, selectedTz)).toLocaleString()} ({selectedTz.replace(/_/g, " ")})
            </Text>
          )}
          <TouchableOpacity style={[styles.tzButton, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => setTzOpen(true)}>
            <Text style={[styles.tzLabel, { color: colors.textMuted }]}>Time zone</Text>
            <Text style={[styles.tzValue, { color: colors.brand }]}>{selectedTz.replace(/_/g, " ")}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={[styles.btn, { backgroundColor: colors.brand }, (len === 0 || loading) && { opacity: 0.5 }]}
          onPress={post} disabled={len === 0 || loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{willSchedule ? "Schedule" : "Post"}</Text>}
        </TouchableOpacity>
        <Text style={[styles.charCount, { color: len > 300 ? colors.warning : colors.textMuted }]}>{len} / {CHAR_LIMIT}</Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={tzOpen} transparent animationType="fade" onRequestClose={() => setTzOpen(false)}>
        <View style={styles.tzBackdrop}>
          <View style={[styles.tzCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.tzCardTitle, { color: colors.text }]}>Time zone</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {TIMEZONES.map((tz) => (
                <TouchableOpacity key={tz} style={[styles.tzOption, selectedTz === tz && { backgroundColor: colors.brandSoft }]}
                  onPress={() => { setSelectedTz(tz); if (!scheduleTouched) prefillSchedule(tz); setTzOpen(false); }}>
                  <Text style={[styles.tzOptionText, { color: selectedTz === tz ? colors.brand : colors.textSecondary }]}>{tz.replace(/_/g, " ")}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <FloatingMenuButton />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 240 },
  label: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 },
  teamRow: { gap: 8, marginBottom: 16 },
  teamChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  teamChipText: { fontSize: 13, fontWeight: "500" },
  activeBadge: { fontSize: 10, fontWeight: "600", textTransform: "uppercase" },
  textarea: { borderWidth: 1, borderRadius: 12, padding: 16, fontSize: 16, minHeight: 150, marginBottom: 16 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  chipSoon: { opacity: 0.55 },
  chipText: { fontSize: 13, fontWeight: "500" },
  connectedDot: { width: 7, height: 7, borderRadius: 4 },
  linkWarning: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 16 },
  linkWarningText: { fontSize: 13, fontWeight: "500" },
  targetRow: { marginBottom: 16 },
  targetInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14 },
  scheduleCard: { borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 14, marginBottom: 20 },
  scheduleHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  scheduleTitle: { fontSize: 14, fontWeight: "600" },
  draftLink: { fontSize: 14, fontWeight: "600" },
  scheduleInputs: { flexDirection: "row", gap: 8, marginTop: 12 },
  scheduleField: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14 },
  timeGroup: { flex: 1, flexDirection: "row", gap: 6 },
  timeField: { flex: 1 },
  ampmGroup: { flexDirection: "row", borderRadius: 10, borderWidth: 1, borderColor: "transparent", overflow: "hidden" },
  ampmBtn: { paddingHorizontal: 10, paddingVertical: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  ampmText: { fontSize: 12, fontWeight: "600" },
  schedulePreview: { fontSize: 12, marginTop: 8 },
  tzButton: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 10 },
  tzLabel: { fontSize: 13 },
  tzValue: { fontSize: 14, fontWeight: "600" },
  tzBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 28 },
  tzCard: { borderRadius: 16, padding: 20, borderWidth: 1 },
  tzCardTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  tzOption: { paddingVertical: 10, borderRadius: 8, paddingHorizontal: 10 },
  tzOptionText: { fontSize: 14, fontWeight: "500" },
  mediaRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  mediaThumbWrap: { position: "relative", borderWidth: 1, borderRadius: 10, overflow: "hidden" },
  mediaThumb: { width: 68, height: 68 },
  mediaRemove: { position: "absolute", top: 4, right: 4, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 10, padding: 3 },
  addMedia: { width: 68, height: 68, borderRadius: 10, borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 2 },
  addMediaText: { fontSize: 11, fontWeight: "600" },
  btn: { borderRadius: 10, padding: 15, alignItems: "center", marginBottom: 12 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  charCount: { fontSize: 13, textAlign: "center" },
});
