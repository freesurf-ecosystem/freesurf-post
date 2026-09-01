import { supabase } from "./supabase";

export const API_BASE = "https://post.freesurf.tools";

export type Team = { id: string; label: string; bundle_team_id: string; is_active: boolean };
export type Account = { platform: string; handle?: string; label?: string; channels?: any[]; selectedChannelId?: string };
export type ScheduledPost = { id: string; text: string; platforms: string[]; scheduledAt: string; createdAt: string };
export type Draft = { id: string; text: string; platforms: string[]; updated_at: string; created_at: string };
export type PlatformTargets = Record<string, string>;

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function api(path: string, opts: RequestInit = {}): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> | undefined),
    ...(await authHeaders()),
  };
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    const err: any = new Error(data?.error || data?.message || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const listTeams = () => api("/api/teams").then((d) => (d?.teams || []) as Team[]);
export const createTeam = (label: string) => api("/api/teams", { method: "POST", body: JSON.stringify({ label }) });
export const activateTeam = (id: string) => api(`/api/teams/${id}/activate`, { method: "POST" });
export const renameTeam = (id: string, label: string) => api(`/api/teams/${id}`, { method: "PATCH", body: JSON.stringify({ label }) });
export const deleteTeam = (id: string) => api(`/api/teams/${id}`, { method: "DELETE" });

export const listAccounts = (teamId?: string) =>
  api(`/api/bundle-accounts${teamId ? `?teamId=${encodeURIComponent(teamId)}` : ""}`).then((d) =>
    (Array.isArray(d) ? d : d?.profiles || []) as Account[]
  );
export const connectUrl = (platform: string, teamId?: string) => {
  const q = new URLSearchParams();
  if (teamId) q.set("teamId", teamId);
  q.set("redirectUrl", "freesurf-post://connected");
  const qs = q.toString();
  return api(`/api/connect/${platform}${qs ? `?${qs}` : ""}`).then((d) => d?.url as string);
};
export const disconnectAccount = (platform: string, teamId?: string) =>
  api(`/api/disconnect/${platform}${teamId ? `?teamId=${encodeURIComponent(teamId)}` : ""}`, { method: "DELETE" });
export const setChannel = (platform: string, channelId: string | undefined, teamId?: string) =>
  api(`/api/channel/${platform}`, { method: "POST", body: JSON.stringify({ action: channelId ? "set" : "unset", channelId: channelId || undefined, teamId }) });

export const listScheduled = () => api("/api/scheduled").then((d) => (d || []) as ScheduledPost[]);
export const cancelScheduled = (id: string) => api(`/api/scheduled/${id}`, { method: "DELETE" });

export const listDrafts = () => api("/api/drafts").then((d) => (d?.drafts || []) as Draft[]);
export const saveDraft = (text: string, platforms: string[]) =>
  api("/api/drafts", { method: "POST", body: JSON.stringify({ text, platforms }) });
export const deleteDraft = (id: string) => api(`/api/drafts/${id}`, { method: "DELETE" });

export function publishPost(opts: { platforms: string[]; text: string; teamId?: string; mediaUrls?: string[]; platformTargets?: PlatformTargets }) {
  return api("/api/post", { method: "POST", body: JSON.stringify(opts) });
}
export function schedulePost(opts: { platforms: string[]; text: string; scheduledAt: string; teamId?: string; mediaUrls?: string[]; platformTargets?: PlatformTargets }) {
  return api("/api/schedule", { method: "POST", body: JSON.stringify(opts) });
}

export async function uploadMedia(uri: string, name: string, mime: string, teamId?: string): Promise<string> {
  const headers = await authHeaders();
  const fd = new FormData();
  fd.append("file", { uri, name, type: mime } as any);
  if (teamId) fd.append("teamId", teamId);
  const res = await fetch(`${API_BASE}/api/media/upload`, { method: "POST", headers, body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || data?.message || "Upload failed");
  return data.uploadId;
}
