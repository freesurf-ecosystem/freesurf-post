import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator,
  TouchableOpacity, Alert, Linking,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Activity, RefreshCw } from "lucide-react-native";
import { useTheme } from "../lib/theme";
import { FloatingMenuButton } from "../components/Menu";
import {
  listRecentPosts, forceAnalytics, listComments, importComments, deletePost,
  type RecentPost, type PostResult, type PostMetrics, type CommentItem,
} from "../lib/api";

function fmtNum(n: number): string {
  n = Number(n) || 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

function platformName(key: string): string {
  const map: Record<string, string> = {
    bluesky: "Bluesky", x: "X", linkedin: "LinkedIn", facebook: "Facebook",
    instagram: "Instagram", threads: "Threads", tiktok: "TikTok", youtube: "YouTube",
    pinterest: "Pinterest", slack: "Slack", discord: "Discord", reddit: "Reddit",
    google_business: "Google Business", mastodon: "Mastodon",
  };
  return map[key] || key;
}

const STAT_KEYS: (keyof PostMetrics)[] = ["impressions", "likes", "comments", "shares"];

function statsFor(m: PostMetrics | undefined): { label: string; value: string }[] {
  if (!m) return [];
  return STAT_KEYS.filter((k) => m[k] != null).map((k) => ({ label: k, value: fmtNum(m[k] as number) }));
}

export default function AnalyticsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [posts, setPosts] = useState<RecentPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [commentItems, setCommentItems] = useState<Record<string, CommentItem[]>>({});
  const [commentLoading, setCommentLoading] = useState<Record<string, boolean>>({});
  const [commentLoaded, setCommentLoaded] = useState<Record<string, boolean>>({});

  const commentKey = (platform: string, postId: string) => `${platform}::${postId}`;

  async function fetchPosts() {
    try {
      const p = await listRecentPosts(30).catch(() => [] as RecentPost[]);
      setPosts(p);
    } catch {}
  }

  useFocusEffect(useCallback(() => {
    (async () => {
      try { await fetchPosts(); }
      finally { setLoading(false); }
    })();
  }, []));

  async function onRefresh() {
    setRefreshing(true);
    await fetchPosts();
    setRefreshing(false);
  }

  async function refreshPost(post: RecentPost, r: PostResult) {
    if (!r.postId) return;
    const key = `${post.id}::${r.platform}`;
    setBusyKey(key);
    try {
      await forceAnalytics({ platform: r.platform, postId: r.postId, postRowId: post.id, via: r.via });
      await fetchPosts();
    } catch (e: any) {
      Alert.alert("Refresh failed", e?.message || "Couldn't refresh metrics.");
    } finally {
      setBusyKey(null);
    }
  }

  async function doDelete(post: RecentPost, r: PostResult) {
    if (!r.postId) return;
    const key = `${post.id}::${r.platform}::delete`;
    setBusyKey(key);
    try {
      await deletePost(r.platform, r.postId);
      await fetchPosts();
    } catch (e: any) {
      Alert.alert("Delete failed", e?.message || "Couldn't delete post.");
    } finally {
      setBusyKey(null);
    }
  }

  function confirmDelete(post: RecentPost, r: PostResult) {
    Alert.alert(
      "Delete post?",
      `This deletes the actual post from ${platformName(r.platform)} permanently — there's no undo.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => doDelete(post, r) },
      ]
    );
  }

  async function toggleComments(platform: string, postId: string) {
    const key = commentKey(platform, postId);
    if (openComments[key]) {
      setOpenComments((prev) => ({ ...prev, [key]: false }));
      return;
    }
    setOpenComments((prev) => ({ ...prev, [key]: true }));
    if (!commentLoaded[key]) {
      setCommentLoading((prev) => ({ ...prev, [key]: true }));
      try {
        const items = await listComments(platform, postId).catch(() => [] as CommentItem[]);
        setCommentItems((prev) => ({ ...prev, [key]: items }));
      } finally {
        setCommentLoading((prev) => ({ ...prev, [key]: false }));
        setCommentLoaded((prev) => ({ ...prev, [key]: true }));
      }
    }
  }

  async function loadCommentsFromPlatform(platform: string, postId: string) {
    const key = commentKey(platform, postId);
    setCommentLoading((prev) => ({ ...prev, [key]: true }));
    try {
      await importComments(platform, postId);
      let items: CommentItem[] = [];
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        items = await listComments(platform, postId).catch(() => [] as CommentItem[]);
        if (items.length) break;
      }
      setCommentItems((prev) => ({ ...prev, [key]: items }));
    } catch {
      // keep whatever was there
    } finally {
      setCommentLoading((prev) => ({ ...prev, [key]: false }));
      setCommentLoaded((prev) => ({ ...prev, [key]: true }));
    }
  }

  function renderComments(platform: string, postId: string) {
    const key = commentKey(platform, postId);
    const loading = commentLoading[key];
    const items = commentItems[key] || [];
    const platformLabel = platformName(platform);

    if (loading) {
      return (
        <View style={styles.commentsPanel}>
          <ActivityIndicator color={colors.brand} size="small" style={{ marginVertical: 8 }} />
        </View>
      );
    }

    if (!items.length) {
      return (
        <View style={styles.commentsPanel}>
          <Text style={[styles.commentsEmpty, { color: colors.textMuted }]}>No comments loaded yet.</Text>
          <TouchableOpacity style={[styles.commentsLoadBtn, { borderColor: colors.border }]} onPress={() => loadCommentsFromPlatform(platform, postId)}>
            <Text style={[styles.commentsLoadText, { color: colors.brand }]}>Load from {platformLabel}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.commentsPanel}>
        {items.map((c, i) => (
          <View key={i} style={[styles.commentRow, { borderBottomColor: colors.borderLight }]}>
            <View style={styles.commentMeta}>
              <Text style={[styles.commentAuthor, { color: colors.text }]}>{c.authorName || "unknown"}</Text>
              {c.publishedAt ? <Text style={[styles.commentWhen, { color: colors.textMuted }]}>{new Date(c.publishedAt).toLocaleString()}</Text> : null}
            </View>
            {c.text ? <Text style={[styles.commentText, { color: colors.textSecondary }]}>{c.text}</Text> : null}
          </View>
        ))}
        <TouchableOpacity style={[styles.commentsLoadBtn, { borderColor: colors.border }]} onPress={() => loadCommentsFromPlatform(platform, postId)}>
          <Text style={[styles.commentsLoadText, { color: colors.brand }]}>Check for new replies</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function renderResultRow(post: RecentPost, r: PostResult, i: number) {
    const m = post.metrics?.[r.platform];
    const stats = statsFor(m);
    const key = `${post.id}::${r.platform}`;
    const deleteKey = `${post.id}::${r.platform}::delete`;
    const busy = busyKey === key;
    const busyDelete = busyKey === deleteKey;
    const failed = !r.success || r.status === "ERROR";
    const canComments = !!r.postId;
    const canDelete = r.platform === "x" && !!r.postId;
    const commentsOpen = openComments[commentKey(r.platform, r.postId || "")] && !!r.postId;

    return (
      <View key={`${r.platform}-${i}`} style={[styles.resultRow, { borderBottomColor: colors.borderLight }]}>
        <View style={styles.resultTop}>
          <Text style={[styles.resultPlatform, { color: colors.textSecondary }]}>{platformName(r.platform).toUpperCase()}</Text>
          {failed
            ? <Text style={[styles.resultFailed, { color: colors.error }]}>failed{r.error ? `: ${r.error}` : ""}</Text>
            : r.status === "POSTED"
              ? <Text style={[styles.resultPosted, { color: colors.success }]}>posted</Text>
              : null}
        </View>

        {stats.length > 0 ? (
          <Text style={[styles.resultStats, { color: colors.textMuted }]}>
            {stats.map((s) => `${s.label}: ${s.value}`).join(" · ")}
          </Text>
        ) : failed ? null : (
          <Text style={[styles.resultStats, { color: colors.textMuted }]}>no metrics yet</Text>
        )}

        <View style={styles.resultActions}>
          {r.postId ? (
            <TouchableOpacity style={[styles.actionBtn, { borderColor: colors.border }]} onPress={() => refreshPost(post, r)} disabled={busy}>
              {busy ? <ActivityIndicator size="small" color={colors.brand} /> : <RefreshCw size={13} color={colors.brand} />}
              <Text style={[styles.actionText, { color: colors.brand }]}>Refresh</Text>
            </TouchableOpacity>
          ) : null}
          {r.postUrl ? (
            <TouchableOpacity style={[styles.actionBtn, { borderColor: colors.border }]} onPress={() => Linking.openURL(r.postUrl!).catch(() => {})}>
              <Text style={[styles.actionText, { color: colors.brand }]}>View</Text>
            </TouchableOpacity>
          ) : null}
          {canComments ? (
            <TouchableOpacity style={[styles.actionBtn, { borderColor: colors.border }]} onPress={() => toggleComments(r.platform, r.postId!)}>
              <Text style={[styles.actionText, { color: colors.brand }]}>
                Comments{Number(m?.comments) ? ` (${Number(m?.comments)})` : ""}
              </Text>
            </TouchableOpacity>
          ) : null}
          {canDelete ? (
            <TouchableOpacity style={[styles.actionBtn, { borderColor: colors.border }]} onPress={() => confirmDelete(post, r)} disabled={busyDelete}>
              <Text style={[styles.actionText, { color: colors.error }]}>{busyDelete ? "Deleting…" : "Delete"}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {canComments && commentsOpen ? renderComments(r.platform, r.postId!) : null}
      </View>
    );
  }

  if (loading) {
    return <View style={[styles.center, { backgroundColor: colors.bg }]}><ActivityIndicator color={colors.brand} /></View>;
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <FlatList
        style={styles.list}
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 48 }}
        data={posts}
        keyExtractor={(p) => p.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Posts</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              Published posts and per-platform stats. Use <Text style={{ color: colors.textSecondary }}>Refresh</Text> on a single post to pull fresh metrics without extra X fees.
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Activity size={28} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No published posts yet. Your post history will appear here.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.date, { color: colors.textMuted }]}>{new Date(item.postedAt).toLocaleString()}</Text>
            <Text style={[styles.postText, { color: colors.text }]} numberOfLines={4}>{item.text}</Text>
            {item.results.map((r, i) => renderResultRow(item, r, i))}
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
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { paddingHorizontal: 16, marginBottom: 12 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 4 },
  subtitle: { fontSize: 13, lineHeight: 18 },
  empty: { alignItems: "center", gap: 12, paddingHorizontal: 40, paddingVertical: 24 },
  emptyText: { fontSize: 15, textAlign: "center" },
  row: { borderRadius: 12, padding: 16, marginBottom: 8, marginHorizontal: 16, borderWidth: 1 },
  date: { fontSize: 12, marginBottom: 6 },
  postText: { fontSize: 14, marginBottom: 10 },
  resultRow: { paddingVertical: 8, borderBottomWidth: 1 },
  resultTop: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  resultPlatform: { fontSize: 12, fontWeight: "700", letterSpacing: 0.4 },
  resultFailed: { fontSize: 12, fontWeight: "600" },
  resultPosted: { fontSize: 12, fontWeight: "600" },
  resultStats: { fontSize: 12, marginTop: 4 },
  resultActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  actionText: { fontSize: 12, fontWeight: "600" },
  commentsPanel: { marginTop: 8, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: "rgba(128,128,128,0.3)" },
  commentsEmpty: { fontSize: 12, marginBottom: 8 },
  commentsLoadBtn: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginTop: 6 },
  commentsLoadText: { fontSize: 12, fontWeight: "600" },
  commentRow: { paddingVertical: 8, borderBottomWidth: 1 },
  commentMeta: { flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "baseline" },
  commentAuthor: { fontSize: 13, fontWeight: "700" },
  commentWhen: { fontSize: 11 },
  commentText: { fontSize: 13, marginTop: 2 },
});
