import { validateSupabaseJWT } from "./auth";
import type { PostRequest, PostResponse, PlatformPostResult, Platform, MediaRef } from "./types";
import { postToBluesky, getBlueskyMetrics } from "./platforms/bluesky";
import { postToLinkedIn, getLinkedInMetrics } from "./platforms/linkedin";
import { postToFacebook, getFacebookMetrics } from "./platforms/facebook";
import { postToInstagram, getInstagramMetrics } from "./platforms/instagram";
import { postToTikTok, getTikTokMetrics } from "./platforms/tiktok";
import { postToX, deleteFromX, getXMetrics, fetchXMetrics } from "./platforms/x";
import { postToThreads, getThreadsMetrics } from "./platforms/threads";
import { fetchUserTokens, findToken, listConnectedProfiles, type PlatformToken } from "./tokens";
import { encryptAccountRow } from "./crypto";
import { FREESURF } from "./freesurf.config";

export interface Env {
  SUPABASE_JWT_SECRET: string;
  SUPABASE_SECRET_KEY?: string;  // for querying the accounts table
  SUPABASE_URL?: string;

  // Encryption key for token storage
  ENCRYPTION_KEY?: string;

  // Third-party social API provider (Bundle.social)
  SOCIAL_API_PROVIDER_KEY?: string;
  BUNDLE_TEAM_ID?: string;           // Bundle.social team ID for post routing

  // Stripe for X-fee top-ups
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;

  // Environment name
  ENVIRONMENT?: string;

  // OAuth client credentials
  BLUESKY_CLIENT_ID?: string;  BLUESKY_CLIENT_SECRET?: string;
  BLUESKY_REDIRECT_URI?: string;
  LINKEDIN_CLIENT_ID?: string;  LINKEDIN_CLIENT_SECRET?: string;
  LINKEDIN_REDIRECT_URI?: string;
  FACEBOOK_CLIENT_ID?: string;  FACEBOOK_CLIENT_SECRET?: string;
  FACEBOOK_REDIRECT_URI?: string;
  INSTAGRAM_CLIENT_ID?: string;  INSTAGRAM_CLIENT_SECRET?: string;
  INSTAGRAM_REDIRECT_URI?: string;
  THREADS_CLIENT_ID?: string;  THREADS_CLIENT_SECRET?: string;
  THREADS_REDIRECT_URI?: string;
  TIKTOK_CLIENT_ID?: string;  TIKTOK_CLIENT_SECRET?: string;
  TIKTOK_REDIRECT_URI?: string;

  // Fallback env vars (used when SUPABASE_SECRET_KEY is not set — single-user mode)
  BLUESKY_HANDLE?: string;  BLUESKY_PASSWORD?: string;
  LINKEDIN_ACCESS_TOKEN?: string;  LINKEDIN_AUTHOR?: string;
  FACEBOOK_ACCESS_TOKEN?: string;  FACEBOOK_PAGE_ID?: string;
  INSTAGRAM_ACCESS_TOKEN?: string;  INSTAGRAM_USER_ID?: string;
  TIKTOK_ACCESS_TOKEN?: string;  TIKTOK_OPEN_ID?: string;
  THREADS_ACCESS_TOKEN?: string;  THREADS_USER_ID?: string;
  X_CONSUMER_KEY?: string;  X_CONSUMER_KEY_SECRET?: string;
  X_ACCESS_TOKEN?: string;  X_ACCESS_TOKEN_SECRET?: string;  X_BEARER_TOKEN?: string;
  TOKEN_ENCRYPTION_KEY?: string;

  RATE_LIMITS?: KVNamespace;
  ASSETS?: Fetcher;                 // Workers Assets binding (static dashboard)
}

const ALLOWED_ORIGINS: string[] = [...FREESURF.CORS_ORIGINS.post];
const SUPABASE_URL = "https://jstojewashwoswsskwjk.supabase.co";

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const u = new URL(origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "::1";
  } catch {
    return false;
  }
}

function corsHeaders(origin: string): Record<string, string> {
  const allowed = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, FSP-API-KEY",
  };
}

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

function errorResponse(message: string, status: number, origin: string) {
  return json({ error: message }, status, corsHeaders(origin));
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "");
  return `fsp_live_${b64}`;
}

/** Loose link detection for UX + a stored hint (billing uses Bundle's quote later). */
/**
 * Loose link detection. Deliberately LIBERAL: any URL or "word.word" counts as a
 * link so we never under-charge X's $0.20 metered link price. Trade-off: some
 * false positives (e.g. "v1.2", "Mr.Smith") will be charged as link posts.
 */
function detectHasLink(text: string): boolean {
  if (!text) return false;
  return /(https?:\/\/\S+|www\.\S+|\w+\.\w+)/i.test(text);
}

/**
 * Normalize the client's media payload. New clients send `media` (upload id +
 * kind/mime); older clients only send `mediaUrls` (upload ids).
 */
function normalizeMediaRefs(mediaUrls?: string[], media?: MediaRef[]): MediaRef[] {
  if (Array.isArray(media) && media.length) {
    return media
      .map((m) => {
        const ref: MediaRef = { uploadId: String(m?.uploadId || "").trim() };
        if (m?.kind === "image" || m?.kind === "video") ref.kind = m.kind;
        if (m?.mime) ref.mime = m.mime;
        if (m?.altText) ref.altText = m.altText;
        return ref;
      })
      .filter((m) => m.uploadId);
  }
  return (mediaUrls || []).map((uploadId) => ({ uploadId })).filter((m) => m.uploadId);
}

function mediaKind(m: MediaRef): "image" | "video" | "unknown" {
  if (m.kind === "image" || m.kind === "video") return m.kind;
  const mime = (m.mime || "").toLowerCase();
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  return "unknown";
}

const TIKTOK_PHOTO_MIME_RE = /^image\/(jpe?g|webp)$/i;

/** Platforms where the caption field is actually required content (not optional). */
const TEXT_REQUIRED_PLATFORMS: Partial<Record<Platform, string>> = {
  linkedin: "LinkedIn",
  youtube: "YouTube",
  reddit: "Reddit",
  google_business: "Google Business",
};

/**
 * Per-platform media validation. Returns a user-facing error, or null when the
 * media set is acceptable. Caps mirror Bundle's documented limits.
 */
function validateMediaForPlatform(platform: Platform, media: MediaRef[]): string | null {
  if (!media.length) return null;
  const kinds = media.map(mediaKind);
  const images = kinds.filter((k) => k === "image").length;
  const videos = kinds.filter((k) => k === "video").length;

  switch (platform) {
    case "instagram":
      // Instagram feed carousels accept 1-10 images/videos (mixed is allowed).
      if (media.length > 10) return "Instagram supports up to 10 carousel items.";
      return null;
    case "tiktok":
      if (media.length > 10) return "TikTok supports up to 10 photos.";
      if (videos > 1) return "TikTok supports one video or up to 10 photos.";
      if (images > 0 && videos > 0) return "TikTok photo posts can't mix images and video.";
      if (videos === 0) {
        const bad = media.find((m) => m.mime && !TIKTOK_PHOTO_MIME_RE.test(m.mime));
        if (bad) return "TikTok photo posts require JPG, JPEG, or WebP images.";
      }
      return null;
    case "facebook":
      if (media.length > 10) return "Facebook supports up to 10 images in a multi-photo post.";
      if (videos > 1) return "Facebook supports one video or up to 10 images.";
      if (images > 0 && videos > 0) return "Facebook can't mix images and video in one post.";
      return null;
    case "x":
    case "bluesky": {
      const name = platform === "x" ? "X" : "Bluesky";
      if (media.length > 4) return `${name} supports up to 4 images (or one video).`;
      if (videos > 1) return `${name} supports one video or up to 4 images.`;
      return null;
    }
    case "threads":
      if (media.length > 10) return "Threads supports up to 10 images (or one video).";
      if (videos > 1) return "Threads supports one video or up to 10 images.";
      if (images > 0 && videos > 0) return "Threads can't mix images and video in one post.";
      return null;
    case "pinterest":
      if (media.length > 1) return "Pinterest supports one image or video per pin.";
      return null;
    case "youtube":
      if (media.length > 1) return "YouTube supports one video per upload.";
      return null;
    default:
      return null;
  }
}

/**
 * Authenticate a request as either a JWT (dashboard) or an API key (fsp_...).
 * Returns { sub } or null.
 */
async function authenticateRequest(request: Request, env: Env): Promise<{ sub: string } | null> {
  const authHeader = request.headers.get("Authorization") || "";
  const apiKeyHeader = request.headers.get("FSP-API-KEY") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const token = apiKeyHeader || bearer;

  // API key path
  if (token.startsWith("fsp_") && env.SUPABASE_SECRET_KEY) {
    const hash = await sha256Hex(token);
    const supabaseUrl = env.SUPABASE_URL || SUPABASE_URL;
    const res = await fetch(
      `${supabaseUrl}/rest/v1/post_api_keys?key_hash=eq.${hash}&revoked_at=is.null&select=id,user_id`,
      {
        headers: {
          apikey: env.SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
        },
      }
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ id: string; user_id: string }>;
    const key = rows[0];
    if (!key?.user_id) return null;
    try {
      await fetch(`${supabaseUrl}/rest/v1/post_api_keys?id=eq.${key.id}`, {
        method: "PATCH",
        headers: {
          apikey: env.SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ last_used_at: new Date().toISOString() }),
      });
    } catch { /* best-effort */ }
    return { sub: key.user_id };
  }

  // JWT path (dashboard)
  const user = await validateSupabaseJWT(env.SUPABASE_JWT_SECRET, authHeader);
  return user ? { sub: user.sub } : null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") ?? "";
    const headers = corsHeaders(origin);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    // Enhanced health check
    if (url.pathname === "/health") {
      return handleHealthCheck(env, origin);
    }

    // --- API routes ---
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, url, origin);
      } catch (e: any) {
        console.error("[api] unhandled error", url.pathname, e?.stack || e);
        return errorResponse("Internal server error", 500, origin);
      }
    }

    // --- Static dashboard (Workers Assets) ---
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("FreeSurf Post — API", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleCron(env));
  },
};

async function handleApi(
  request: Request,
  env: Env,
  url: URL,
  origin: string
): Promise<Response> {
  const h = corsHeaders(origin);

  // --- GET /api/profiles — list connected platform profiles ---
  if (url.pathname === "/api/profiles" && request.method === "GET") {
    return handleProfiles(request, env, origin, h);
  }

  // --- POST /api/profiles/token — save a direct platform token ---
  if (url.pathname === "/api/profiles/token" && request.method === "POST") {
    return handleSaveToken(request, env, origin, h);
  }
  const tokenDeleteMatch = url.pathname.match(/^\/api\/profiles\/token\/([a-f0-9-]+)$/);
  if (tokenDeleteMatch && request.method === "DELETE") {
    return handleDeleteToken(request, env, tokenDeleteMatch[1], origin, h);
  }

  // --- GET /api/connect/callback — OAuth return bridge back to the mobile app ---
  // Must be matched before /api/connect/:platform (which also matches "callback").
  if (url.pathname === "/api/connect/callback" && request.method === "GET") {
    return handleConnectCallback(url);
  }

  // --- GET /api/connect/:platform — get Bundle connection URL ---
  const connectMatch = url.pathname.match(/^\/api\/connect\/([a-z]+)$/);
  if (connectMatch && request.method === "GET") {
    return handleConnect(request, env, connectMatch[1], origin, h, url);
  }

  // --- POST /api/disconnect/:platform — disconnect a Bundle social account ---
  const disconnectMatch = url.pathname.match(/^\/api\/disconnect\/([a-z]+)$/);
  if (disconnectMatch && request.method === "POST") {
    return handleDisconnect(request, env, disconnectMatch[1], origin, h, url);
  }

  // --- POST /api/channel/:platform — set/refresh/unset a platform channel/page ---
  const channelMatch = url.pathname.match(/^\/api\/channel\/([a-z]+)$/);
  if (channelMatch && request.method === "POST") {
    return handleChannel(request, env, channelMatch[1], origin, h, url);
  }

  // --- Teams API ---
  if (url.pathname === "/api/teams" && request.method === "GET") {
    return handleGetTeams(request, env, origin, h);
  }
  if (url.pathname === "/api/teams" && request.method === "POST") {
    return handleCreateTeam(request, env, origin, h);
  }
  const teamActivateMatch = url.pathname.match(/^\/api\/teams\/([a-f0-9-]+)\/activate$/);
  if (teamActivateMatch && request.method === "POST") {
    return handleActivateTeam(request, env, teamActivateMatch[1], origin, h);
  }
  const teamDeleteMatch = url.pathname.match(/^\/api\/teams\/([a-f0-9-]+)$/);
  if (teamDeleteMatch && request.method === "DELETE") {
    return handleDeleteTeam(request, env, teamDeleteMatch[1], origin, h);
  }
  if (teamDeleteMatch && request.method === "PATCH") {
    return handleRenameTeam(request, env, teamDeleteMatch[1], origin, h);
  }

  // --- API keys ---
  if (url.pathname === "/api/keys" && request.method === "GET") {
    return handleListKeys(request, env, origin, h);
  }
  if (url.pathname === "/api/keys" && request.method === "POST") {
    return handleCreateKey(request, env, origin, h);
  }
  const keyDeleteMatch = url.pathname.match(/^\/api\/keys\/([a-f0-9-]+)$/);
  if (keyDeleteMatch && request.method === "DELETE") {
    return handleRevokeKey(request, env, keyDeleteMatch[1], origin, h);
  }

  // --- Credits / X-fees ---
  if (url.pathname === "/api/credits" && request.method === "GET") {
    return handleGetCredits(request, env, origin, h);
  }
  if (url.pathname === "/api/credits/topup" && request.method === "POST") {
    return handleTopUp(request, env, origin, h);
  }
  if (url.pathname === "/api/credits/webhook" && request.method === "POST") {
    return handleStripeWebhook(request, env, origin, h);
  }

  // --- GET /api/bundle-accounts — list Bundle-connected accounts ---
  if (url.pathname === "/api/bundle-accounts" && request.method === "GET") {
    return handleBundleAccounts(request, env, origin, h, url);
  }

  // --- GET /api/bundle-posts — list recent Bundle posts ---
  if (url.pathname === "/api/bundle-posts" && request.method === "GET") {
    return handleBundlePosts(request, env, origin, h, url);
  }

  // --- GET /api/post/:id — get a single Bundle post (status/externalData) ---
  const postDetailMatch = url.pathname.match(/^\/api\/post\/([a-f0-9-]+)$/);
  if (postDetailMatch && request.method === "GET") {
    return handleGetPost(request, env, postDetailMatch[1], origin, h);
  }

  // --- GET /api/analytics/:platform — proxy Bundle analytics ---
  const analyticsMatch = url.pathname.match(/^\/api\/analytics\/([a-z]+)$/);
  if (analyticsMatch && request.method === "GET") {
    return handleBundleAnalytics(request, env, analyticsMatch[1], origin, h);
  }

  // --- POST /api/comments/import — start Bundle comment import ---
  if (url.pathname === "/api/comments/import" && request.method === "POST") {
    return handleCommentImport(request, env, origin, h);
  }

  // --- GET /api/comments — get imported comments ---
  if (url.pathname === "/api/comments" && request.method === "GET") {
    return handleComments(request, env, url, origin, h);
  }

  // --- POST /api/media — proxy Bundle media upload ---
  if (url.pathname === "/api/media" && request.method === "POST") {
    return handleMediaUpload(request, env, origin, h);
  }

  // --- POST /api/media/upload — multipart file upload to Bundle ---
  if (url.pathname === "/api/media/upload" && request.method === "POST") {
    return handleMediaUploadFile(request, env, origin, h);
  }

  // --- POST /api/import — start Bundle post history import ---
  if (url.pathname === "/api/import" && request.method === "POST") {
    return handlePostImport(request, env, origin, h);
  }

  // --- GET /api/imports — list post history import jobs ---
  if (url.pathname === "/api/imports" && request.method === "GET") {
    return handleListImports(request, env, origin, h);
  }

  // --- GET /api/imports/posts — list imported posts w/ analytics ---
  if (url.pathname === "/api/imports/posts" && request.method === "GET") {
    return handleImportedPosts(request, env, origin, h);
  }

  // --- POST /api/schedule — schedule a post for later ---
  if (url.pathname === "/api/schedule" && request.method === "POST") {
    return handleSchedule(request, env, origin, h);
  }

  // --- GET /api/scheduled — list scheduled posts ---
  if (url.pathname === "/api/scheduled" && request.method === "GET") {
    return handleScheduled(request, env, origin, h);
  }

  // --- GET /api/posts/recent — recent published posts with per-platform results ---
  if (url.pathname === "/api/posts/recent" && request.method === "GET") {
    return handleRecentPosts(request, env, origin, h);
  }

  // --- GET /api/uploads?ids=a,b,c — resolve upload ids to preview URLs ---
  if (url.pathname === "/api/uploads" && request.method === "GET") {
    return handleUploads(request, env, origin, h);
  }

  // --- POST /api/posts/delete — delete a published post from a platform ---
  // Body: { platform: "x", postId: "<bundle-post-id>" }. X deletes are metered ($0.01).
  if (url.pathname === "/api/posts/delete" && request.method === "POST") {
    return handleDeletePost(request, env, origin, h);
  }

  // --- DELETE /api/scheduled/:id — cancel scheduled post ---
  const scheduleMatch = url.pathname.match(/^\/api\/scheduled\/([a-f0-9-]+)$/);
  if (scheduleMatch && request.method === "DELETE") {
    return handleCancelSchedule(request, env, scheduleMatch[1], origin, h);
  }

  // --- GET /api/replies/:platform/:postId ---
  const repliesMatch = url.pathname.match(/^\/api\/replies\/([a-z]+)\/(.+)$/);
  if (repliesMatch && request.method === "GET") {
    return handleReplies(request, env, repliesMatch[1] as Platform, repliesMatch[2], origin, h);
  }

  // --- POST /api/reply ---
  if (url.pathname === "/api/reply" && request.method === "POST") {
    return handleReply(request, env, origin, h);
  }

  // --- POST /api/post ---
  if (url.pathname === "/api/post" && request.method === "POST") {
    return handlePost(request, env, origin, h);
  }

  // --- GET /api/metrics/:platform/:postId ---
  const metricsMatch = url.pathname.match(/^\/api\/metrics\/([a-z]+)\/(.+)$/);
  if (metricsMatch && request.method === "GET") {
    return handleMetrics(request, env, metricsMatch[1] as Platform, metricsMatch[2], origin, h);
  }

  // --- Drafts API ---
  if (url.pathname === "/api/drafts" && request.method === "GET") {
    return handleGetDrafts(request, env, origin, h);
  }
  if (url.pathname === "/api/drafts" && request.method === "POST") {
    return handleCreateDraft(request, env, origin, h);
  }
  const draftDeleteMatch = url.pathname.match(/^\/api\/drafts\/([a-f0-9-]+)$/);
  if (draftDeleteMatch && request.method === "DELETE") {
    return handleDeleteDraft(request, env, draftDeleteMatch[1], origin, h);
  }

  // --- Hashtag Groups API ---
  if (url.pathname === "/api/hashtags" && request.method === "GET") {
    return handleGetHashtags(request, env, origin, h);
  }
  if (url.pathname === "/api/hashtags" && request.method === "POST") {
    return handleCreateHashtagGroup(request, env, origin, h);
  }
  const hashtagDeleteMatch = url.pathname.match(/^\/api\/hashtags\/([a-f0-9-]+)$/);
  if (hashtagDeleteMatch && request.method === "DELETE") {
    return handleDeleteHashtagGroup(request, env, hashtagDeleteMatch[1], origin, h);
  }

  // --- Saved Replies API ---
  if (url.pathname === "/api/replies/templates" && request.method === "GET") {
    return handleGetSavedReplies(request, env, origin, h);
  }
  if (url.pathname === "/api/replies/templates" && request.method === "POST") {
    return handleCreateSavedReply(request, env, origin, h);
  }
  const savedReplyDeleteMatch = url.pathname.match(/^\/api\/replies\/templates\/([a-f0-9-]+)$/);
  if (savedReplyDeleteMatch && request.method === "DELETE") {
    return handleDeleteSavedReply(request, env, savedReplyDeleteMatch[1], origin, h);
  }

  // --- Queue API ---
  if (url.pathname === "/api/queue" && request.method === "GET") {
    return handleGetQueue(request, env, origin, h);
  }
  if (url.pathname === "/api/queue" && request.method === "POST") {
    return handleAddToQueue(request, env, origin, h);
  }
  if (url.pathname === "/api/queue/refill" && request.method === "POST") {
    return handleRefillQueue(request, env, origin, h);
  }
  const queueDeleteMatch = url.pathname.match(/^\/api\/queue\/([a-f0-9-]+)$/);
  if (queueDeleteMatch && request.method === "DELETE") {
    return handleRemoveFromQueue(request, env, queueDeleteMatch[1], origin, h);
  }

  // --- Analytics API ---
  if (url.pathname === "/api/analytics" && request.method === "GET") {
    return handleGetAnalytics(request, env, origin, h);
  }
  if (url.pathname === "/api/analytics/trends" && request.method === "GET") {
    return handleGetAnalyticsTrends(request, env, origin, h);
  }
  // POST /api/analytics/refresh — pull post analytics from Bundle and cache in post_posts.metrics
  if (url.pathname === "/api/analytics/refresh" && request.method === "POST") {
    return handleAnalyticsRefresh(request, env, origin, h);
  }

  // POST /api/analytics/force — force a fresh live analytics fetch for one post
  if (url.pathname === "/api/analytics/force" && request.method === "POST") {
    return handleForceAnalytics(request, env, origin, h);
  }

  // GET/POST /api/analytics/prefs — per-user analytics preferences (e.g. skip X)
  if (url.pathname === "/api/analytics/prefs") {
    if (request.method === "GET") return handleGetAnalyticsPrefs(request, env, origin, h);
    if (request.method === "POST") return handleSetAnalyticsPrefs(request, env, origin, h);
  }

  // --- Usage API (per-platform post counts for billing/tabulation) ---
  if (url.pathname === "/api/usage" && request.method === "GET") {
    return handleUsage(request, env, origin, h);
  }

  return errorResponse("Not found", 404, origin);
}

/**
 * GET /api/profiles — list the user's connected platform profiles.
 */
async function handleProfiles(
  request: Request,
  env: Env,
  origin: string,
  headers: Record<string, string>
): Promise<Response> {
  const user = await validateSupabaseJWT(env.SUPABASE_JWT_SECRET, request.headers.get("Authorization"));
  if (!user) return errorResponse("Unauthorized", 401, origin);

  if (!env.SUPABASE_SECRET_KEY) {
    return json({ profiles: [], mode: "single-user" }, 200, headers);
  }

  try {
    const tokens = await fetchUserTokens(user.sub, env.SUPABASE_SECRET_KEY, env.TOKEN_ENCRYPTION_KEY);
    return json({ profiles: listConnectedProfiles(tokens), mode: "multi-user" }, 200, headers);
  } catch {
    return json({ profiles: [], mode: "error" }, 200, headers);
  }
}

/**
 * POST /api/profiles/token — Save a direct platform token (e.g. Bluesky app password).
 * Body: { platform, label, handle, accessToken, metadata: { ... } }
 */
async function handleSaveToken(
  request: Request,
  env: Env,
  origin: string,
  headers: Record<string, string>
): Promise<Response> {
  const user = await validateSupabaseJWT(env.SUPABASE_JWT_SECRET, request.headers.get("Authorization"));
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SUPABASE_SECRET_KEY) return errorResponse("Service role key not configured", 500, origin);

  try {
    const body = await request.json() as {
      platform: string;
      label: string;
      handle: string;
      accessToken: string;
      metadata?: Record<string, unknown>;
    };

    if (!body.platform || !body.accessToken) {
      return errorResponse("platform and accessToken are required", 400, origin);
    }

    const record = await encryptAccountRow(
      {
        user_id: user.sub,
        platform: body.platform,
        profile_label: body.label || "Default",
        platform_handle: body.handle || "",
        access_token: body.accessToken,
        metadata: body.metadata || {},
      },
      env.TOKEN_ENCRYPTION_KEY
    );

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/post_accounts`,
      {
        method: "POST",
        headers: {
          apikey: env.SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(record),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      return errorResponse(`Failed to save token: ${err}`, 500, origin);
    }

    return json({ ok: true }, 200, headers);
  } catch (e: any) {
    return errorResponse(e.message || "Internal error", 500, origin);
  }
}

/**
 * DELETE /api/profiles/token/:id — Remove a direct platform token (post_accounts row).
 */
async function handleDeleteToken(
  request: Request,
  env: Env,
  id: string,
  origin: string,
  headers: Record<string, string>
): Promise<Response> {
  const user = await validateSupabaseJWT(env.SUPABASE_JWT_SECRET, request.headers.get("Authorization"));
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SUPABASE_SECRET_KEY) return errorResponse("Not configured", 501, origin);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/post_accounts?id=eq.${id}&user_id=eq.${user.sub}`, {
      method: "DELETE",
      headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` },
    });
    if (!res.ok) return errorResponse("Failed to remove", res.status || 500, origin);
    return json({ ok: true }, 200, headers);
  } catch { return errorResponse("Failed to remove", 500, origin); }
}

/**
 * Get (or lazily create) the Bundle.social team for a user.
 * Each user gets their own team so their connected accounts and posts stay
 * isolated. The team id is stored in post_bundle_teams.
 */
async function getOrCreateBundleTeam(userId: string, env: Env): Promise<string | null> {
  if (!env.SOCIAL_API_PROVIDER_KEY || !env.SUPABASE_SECRET_KEY) return null;
  const supabaseUrl = env.SUPABASE_URL || SUPABASE_URL;
  const authHeaders = {
    apikey: env.SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
  };

  try {
    const lookRes = await fetch(
      `${supabaseUrl}/rest/v1/post_bundle_teams?user_id=eq.${userId}&is_active=eq.true&limit=1&select=bundle_team_id`,
      { headers: authHeaders }
    );
    if (lookRes.ok) {
      const rows = (await lookRes.json()) as Array<{ bundle_team_id: string }>;
      if (rows[0]?.bundle_team_id) return rows[0].bundle_team_id;
    }
  } catch {
    // fall through to create
  }

  // Prefer an existing "Default"-named team so we never duplicate a team label.
  try {
    const defRes = await fetch(
      `${supabaseUrl}/rest/v1/post_bundle_teams?user_id=eq.${userId}&label=eq.Default&limit=1&select=bundle_team_id,id`,
      { headers: authHeaders }
    );
    if (defRes.ok) {
      const rows = (await defRes.json()) as Array<{ bundle_team_id: string; id: string }>;
      if (rows[0]?.bundle_team_id) {
        await fetch(`${supabaseUrl}/rest/v1/post_bundle_teams?user_id=eq.${userId}&is_active=eq.true`, {
          method: "PATCH",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: false }),
        });
        await fetch(`${supabaseUrl}/rest/v1/post_bundle_teams?id=eq.${rows[0].id}`, {
          method: "PATCH",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: true }),
        });
        return rows[0].bundle_team_id;
      }
    }
  } catch {
    // fall through to create
  }

  try {
    const createRes = await fetch("https://api.bundle.social/api/v1/team", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": env.SOCIAL_API_PROVIDER_KEY },
      body: JSON.stringify({ name: `freesurf-${userId.slice(0, 8)}` }),
    });
    const team = (await createRes.json()) as any;
    if (!createRes.ok || !team.id) {
      console.error("Bundle team create failed:", createRes.status, JSON.stringify(team));
      return null;
    }

    await fetch(`${supabaseUrl}/rest/v1/post_bundle_teams?user_id=eq.${userId}&is_active=eq.true`, {
      method: "PATCH",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: false }),
    });
    await fetch(`${supabaseUrl}/rest/v1/post_bundle_teams`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, bundle_team_id: team.id, label: "Default", is_active: true }),
    });

    return team.id;
  } catch (e) {
    console.error("Bundle team create exception:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/**
 * Resolve the Bundle team id for a post: use the explicitly-selected team
 * (post_bundle_teams.id) if provided, otherwise the user's active team.
 */
async function resolveBundleTeamId(userId: string, teamId: string | undefined, env: Env): Promise<string | null> {
  if (!env.SUPABASE_SECRET_KEY) return null;
  if (!teamId) return getOrCreateBundleTeam(userId, env);

  const supabaseUrl = env.SUPABASE_URL || SUPABASE_URL;
  const authHeaders = {
    apikey: env.SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
  };
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/post_bundle_teams?id=eq.${teamId}&user_id=eq.${userId}&select=bundle_team_id`,
      { headers: authHeaders }
    );
    const rows = (await res.json()) as Array<{ bundle_team_id: string }>;
    return rows[0]?.bundle_team_id || null;
  } catch {
    return null;
  }
}

/**
 * Resolve a Bundle team id from either a team id or a team label (scoped to the user).
 * teamId (internal uuid) wins if provided; team (label) is looked up by name.
 */
async function resolveTeamId(
  userId: string,
  teamId: string | undefined,
  teamLabel: string | undefined,
  env: Env
): Promise<string | null> {
  if (teamId) return resolveBundleTeamId(userId, teamId, env);
  if (teamLabel && env.SUPABASE_SECRET_KEY) {
    const supabaseUrl = env.SUPABASE_URL || SUPABASE_URL;
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/post_bundle_teams?user_id=eq.${userId}&label=ilike.${encodeURIComponent(teamLabel)}&select=bundle_team_id&limit=1`,
        {
          headers: {
            apikey: env.SUPABASE_SECRET_KEY,
            Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
          },
        }
      );
      const rows = (await res.json()) as Array<{ bundle_team_id: string }>;
      return rows[0]?.bundle_team_id || null;
    } catch {
      return null;
    }
  }
  return getOrCreateBundleTeam(userId, env);
}

/**
 * Find the Bundle team a post was published under, given a platform post id.
 * Comment import/list must target the *post's* team (not the user's currently
 * active team), otherwise Bundle rejects with "does not belong to this team"
 * when a user has switched teams since publishing.
 */
async function findPostTeamId(env: Env, userId: string, platformPostId: string): Promise<string | null> {
  if (!env.SUPABASE_SECRET_KEY) return null;
  const supabaseUrl = env.SUPABASE_URL || SUPABASE_URL;
  const authHeaders = { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` };
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/post_posts?user_id=eq.${userId}&status=eq.posted&select=bundle_team_id,results&order=posted_at.desc.nullslast&limit=100`,
      { headers: authHeaders }
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as any[];
    for (const row of rows) {
      const matches = (row.results || []).some((r: any) => r?.postId === platformPostId);
      if (matches && row.bundle_team_id) return row.bundle_team_id;
    }
  } catch { /* best-effort */ }
  return null;
}

/**
 * GET /api/connect/:platform — Generate a Bundle.social OAuth URL.
 * The user is redirected to this URL to connect their account (Plaid-style
 * handoff), then sent back to redirectUrl once the platform OAuth completes.
 */
async function handleConnect(
  request: Request,
  env: Env,
  platform: string,
  origin: string,
  headers: Record<string, string>,
  url?: URL
): Promise<Response> {
  const user = await validateSupabaseJWT(env.SUPABASE_JWT_SECRET, request.headers.get("Authorization"));
  if (!user) return errorResponse("Unauthorized", 401, origin);

  if (!env.SOCIAL_API_PROVIDER_KEY || !env.SUPABASE_SECRET_KEY) {
    return errorResponse("Not configured", 501, origin);
  }

  const bsPlatform = bundlePlatform(platform);
  if (!bsPlatform) return errorResponse("Unknown platform", 400, origin);

  const teamId = await resolveBundleTeamId(user.sub, url?.searchParams.get("teamId") || undefined, env);
  if (!teamId) return errorResponse("Could not provision a team", 502, origin);

  // Allow clients (e.g. the mobile app) to send us back after OAuth via their
  // own deep-link scheme. Bundle validates redirectUrl and rejects non-http(s)
  // schemes, so a custom scheme is wrapped in an https callback on this Worker
  // that 302s back to the deep link once Bundle finishes the OAuth handoff.
  const requestedRedirect = url?.searchParams.get("redirectUrl") || "";
  let redirectUrl: string;
  if (/^freesurf-post:\/\//.test(requestedRedirect)) {
    redirectUrl = `${FREESURF.URLS.post}/api/connect/callback?to=${encodeURIComponent(requestedRedirect)}`;
  } else if (/^https?:\/\//.test(requestedRedirect)) {
    redirectUrl = requestedRedirect;
  } else {
    redirectUrl = `${FREESURF.URLS.post}/`;
  }

  try {
    const res = await fetch("https://api.bundle.social/api/v1/social-account/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": env.SOCIAL_API_PROVIDER_KEY },
      body: JSON.stringify({
        type: bsPlatform,
        teamId,
        redirectUrl,
        ...(platform === "instagram" ? { instagramConnectionMethod: "INSTAGRAM" } : {}),
        ...(platform === "facebook" ? { withBusinessScope: true } : {}),
      }),
    });
    const data = (await res.json()) as any;
    if (!res.ok || !data.url) {
      console.error(`Bundle connect failed (${platform}, team=${teamId}):`, res.status, JSON.stringify(data));
      return errorResponse(data.message || "Failed to generate connect URL", res.status || 502, origin);
    }
    return json({ url: data.url }, 200, headers);
  } catch (e) {
    console.error(`Bundle connect exception (${platform}):`, e instanceof Error ? e.message : String(e));
    return errorResponse("Connect unavailable", 502, origin);
  }
}

/**
 * GET /api/connect/callback — bounce the OAuth browser back into the mobile
 * app's deep link. Stateless: the app's target rides in `to`. Restricted to the
 * app scheme (freesurf-post://connected) or our own web origin, so this can't
 * be used as an open redirect.
 */
function handleConnectCallback(url: URL): Response {
  const to = url.searchParams.get("to") || "";
  const allowed =
    /^freesurf-post:\/\/connected/.test(to) ||
    /^https?:\/\/post\.freesurf\.tools(\/|$)/.test(to);
  const target = allowed ? to : `${FREESURF.URLS.post}/`;
  return new Response(null, { status: 302, headers: { Location: target } });
}

/**
 * GET /api/bundle-accounts — List social accounts connected via Bundle.
 */
async function handleBundleAccounts(
  request: Request,
  env: Env,
  origin: string,
  headers: Record<string, string>,
  url?: URL
): Promise<Response> {
  const user = await authenticateRequest(request, env);
  if (!user) return errorResponse("Unauthorized", 401, origin);

  if (!env.SOCIAL_API_PROVIDER_KEY || !env.SUPABASE_SECRET_KEY) {
    return json([], 200, headers);
  }

  const teamId = await resolveBundleTeamId(user.sub, url?.searchParams.get("teamId") || undefined, env);
  if (!teamId) {
    console.error("Bundle accounts: no team id resolved for", user.sub);
    return json([], 200, headers);
  }

  try {
    const res = await fetch(
      `https://api.bundle.social/api/v1/team/${teamId}`,
      { headers: { "x-api-key": env.SOCIAL_API_PROVIDER_KEY } }
    );
    const rawText = await res.text();
    if (!res.ok) {
      console.error(`Bundle team (team=${teamId}) status=${res.status}:`, rawText.slice(0, 500));
      return json([], 200, headers);
    }
    console.log(`Bundle team (team=${teamId}) status=200:`, rawText.slice(0, 2000));
    const data = JSON.parse(rawText) as any;
    const socialAccounts = Array.isArray(data.socialAccounts) ? data.socialAccounts : [];
    const accounts = socialAccounts.map((a: any) => ({
      platform: bundlePlatformToKey(a.type),
      handle: a.username || a.displayName || a.userUsername || "",
      connected: true,
      channels: (Array.isArray(a.channels) ? a.channels : []).map((c: any) => ({
        id: c.id || "",
        externalId: c.externalId || c.id || "",
        name: c.name || c.username || c.id || "",
      })),
      selectedChannelId: a.externalId || "",
    }));
    return json(accounts, 200, headers);
  } catch (e) {
    console.error("Bundle accounts exception:", e instanceof Error ? e.message : String(e));
    return json([], 200, headers);
  }
}

/**
 * GET /api/bundle-posts — List recent posts from Bundle (probe the provider
 * rather than trying to reconstruct a post URL ourselves).
 * Query params: ?teamId=<our team id>&limit=20
 */
async function handleBundlePosts(
  request: Request,
  env: Env,
  origin: string,
  headers: Record<string, string>,
  url?: URL
): Promise<Response> {
  const user = await authenticateRequest(request, env);
  if (!user) return errorResponse("Unauthorized", 401, origin);

  if (!env.SOCIAL_API_PROVIDER_KEY || !env.SUPABASE_SECRET_KEY) {
    return json({ posts: [] }, 200, headers);
  }

  const teamId = await resolveBundleTeamId(user.sub, url?.searchParams.get("teamId") || undefined, env);
  if (!teamId) return json({ posts: [] }, 200, headers);

  const limit = url?.searchParams.get("limit") || "20";
  try {
    const res = await fetch(
      `https://api.bundle.social/api/v1/post?teamId=${teamId}&limit=${encodeURIComponent(limit)}`,
      { headers: { "x-api-key": env.SOCIAL_API_PROVIDER_KEY } }
    );
    const data = (await res.json()) as any;
    if (!res.ok) {
      console.error("Bundle list posts failed:", res.status, JSON.stringify(data));
      return json({ posts: [] }, 200, headers);
    }

    const list = data.items || data.posts || data.data || data;
    const posts = (Array.isArray(list) ? list : []).map((p: any) => {
      const platforms = Array.isArray(p.socialAccountTypes)
        ? p.socialAccountTypes.map((s: string) => bundlePlatformToKey(String(s)))
        : [];
      const bsPlatform = String(p.socialAccountTypes?.[0] || "").toUpperCase();
      return {
        id: p.id,
        status: p.status,
        createdAt: p.createdAt || p.postDate || p.created_at,
        platforms,
        text: p.title || p.data?.text || "",
        url: extractBundlePostUrl(p, bsPlatform),
        error: p.error || null,
        errors: p.errors || null,
        errorsVerbose: p.errorsVerbose || null,
      };
    });
    return json({ posts }, 200, headers);
  } catch (e) {
    console.error("Bundle list posts exception:", e instanceof Error ? e.message : String(e));
    return json({ posts: [] }, 200, headers);
  }
}

/**
 * GET /api/post/:id — Get a single Bundle post (status + externalData) for diagnostics.
 */
async function handleGetPost(
  request: Request, env: Env, id: string, origin: string, headers: Record<string, string>
): Promise<Response> {
  const user = await authenticateRequest(request, env);
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SOCIAL_API_PROVIDER_KEY) return errorResponse("Not configured", 501, origin);

  try {
    const res = await fetch(`https://api.bundle.social/api/v1/post/${id}`, {
      headers: { "x-api-key": env.SOCIAL_API_PROVIDER_KEY },
    });
    const data = (await res.json()) as any;
    console.log(`Bundle post detail (${id}) status=${res.status}:`, JSON.stringify(data).slice(0, 2000));
    return json(data, res.status, headers);
  } catch (e) {
    console.error("Bundle post lookup exception:", e instanceof Error ? e.message : String(e));
    return json({ error: "Post lookup failed" }, 502, headers);
  }
}

/**
 * POST /api/disconnect/:platform — Disconnect a Bundle social account.
 */
async function handleDisconnect(
  request: Request,
  env: Env,
  platform: string,
  origin: string,
  headers: Record<string, string>,
  url?: URL
): Promise<Response> {
  const user = await validateSupabaseJWT(env.SUPABASE_JWT_SECRET, request.headers.get("Authorization"));
  if (!user) return errorResponse("Unauthorized", 401, origin);

  if (!env.SOCIAL_API_PROVIDER_KEY || !env.SUPABASE_SECRET_KEY) {
    return errorResponse("Not configured", 501, origin);
  }

  const bsPlatform = bundlePlatform(platform);
  if (!bsPlatform) return errorResponse("Unknown platform", 400, origin);

  const teamId = await resolveBundleTeamId(user.sub, url?.searchParams.get("teamId") || undefined, env);
  if (!teamId) return errorResponse("Could not provision a team", 502, origin);

  try {
    const res = await fetch("https://api.bundle.social/api/v1/social-account/disconnect", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "x-api-key": env.SOCIAL_API_PROVIDER_KEY },
      body: JSON.stringify({ type: bsPlatform, teamId }),
    });
    const data = (await res.json()) as any;
    if (!res.ok) {
      console.error(`Bundle disconnect failed (${platform}, team=${teamId}):`, res.status, JSON.stringify(data));
      return errorResponse(data.message || "Disconnect failed", res.status || 502, origin);
    }
    return json({ disconnected: true }, 200, headers);
  } catch (e) {
    console.error(`Bundle disconnect exception (${platform}):`, e instanceof Error ? e.message : String(e));
    return errorResponse("Disconnect unavailable", 502, origin);
  }
}

/**
 * POST /api/channel/:platform — Set / refresh / unset a platform channel (page).
 * Body: { action: "set"|"refresh"|"unset", channelId?, teamId? }
 * Required for LinkedIn orgs, Facebook pages, Instagram-via-Facebook, YouTube channels.
 */
async function handleChannel(
  request: Request,
  env: Env,
  platform: string,
  origin: string,
  headers: Record<string, string>,
  url?: URL
): Promise<Response> {
  const user = await validateSupabaseJWT(env.SUPABASE_JWT_SECRET, request.headers.get("Authorization"));
  if (!user) return errorResponse("Unauthorized", 401, origin);

  if (!env.SOCIAL_API_PROVIDER_KEY || !env.SUPABASE_SECRET_KEY) {
    return errorResponse("Not configured", 501, origin);
  }

  const bsPlatform = bundlePlatform(platform);
  if (!bsPlatform) return errorResponse("Unknown platform", 400, origin);

  let body: { action?: string; channelId?: string; teamId?: string };
  try { body = (await request.json()) as any; } catch { return errorResponse("Invalid JSON", 400, origin); }

  const teamId = await resolveBundleTeamId(user.sub, body.teamId || url?.searchParams.get("teamId") || undefined, env);
  if (!teamId) return errorResponse("Could not provision a team", 502, origin);

  const action = body.action || "set";
  try {
    let endpoint: string;
    const payload: any = { type: bsPlatform, teamId };

    if (action === "refresh") {
      endpoint = "https://api.bundle.social/api/v1/social-account/refresh-channels";
    } else if (action === "unset") {
      endpoint = "https://api.bundle.social/api/v1/social-account/unset-channel";
    } else {
      endpoint = "https://api.bundle.social/api/v1/social-account/set-channel";
      if (!body.channelId) return errorResponse("channelId required", 400, origin);
      payload.channelId = body.channelId;
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": env.SOCIAL_API_PROVIDER_KEY },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as any;
    if (!res.ok) {
      console.error(`Bundle channel ${action} failed (${platform}, team=${teamId}):`, res.status, JSON.stringify(data));
      return errorResponse(data.message || "Channel update failed", res.status || 502, origin);
    }
    return json({ ok: true, account: data }, 200, headers);
  } catch (e) {
    console.error("Channel update exception:", e instanceof Error ? e.message : String(e));
    return errorResponse("Channel update failed", 502, origin);
  }
}

/**
 * GET /api/teams — List the user's Bundle teams.
 */
async function handleGetTeams(
  request: Request, env: Env, origin: string, headers: Record<string, string>
): Promise<Response> {
  const user = await authenticateRequest(request, env);
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SUPABASE_SECRET_KEY) return json({ teams: [] }, 200, headers);

  const supabaseUrl = env.SUPABASE_URL || SUPABASE_URL;
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/post_bundle_teams?user_id=eq.${user.sub}&order=created_at.asc&select=*`,
      { headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` } }
    );
    if (!res.ok) return json({ teams: [] }, 200, headers);
    const teams = (await res.json()) as any[];
    return json({
      teams: teams.map((t) => ({
        id: t.id,
        label: t.label,
        bundle_team_id: t.bundle_team_id,
        is_active: t.is_active,
      })),
    }, 200, headers);
  } catch {
    return json({ teams: [] }, 200, headers);
  }
}

/**
 * POST /api/teams — Create a new Bundle team. Body: { label }
 */
async function handleCreateTeam(
  request: Request, env: Env, origin: string, headers: Record<string, string>
): Promise<Response> {
  const user = await authenticateRequest(request, env);
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SOCIAL_API_PROVIDER_KEY || !env.SUPABASE_SECRET_KEY) return errorResponse("Not configured", 501, origin);

  let body: { label: string };
  try { body = (await request.json()) as any; } catch { return errorResponse("Invalid JSON", 400, origin); }
  const label = (body.label || "").trim() || "Default";

  const supabaseUrl = env.SUPABASE_URL || SUPABASE_URL;
  const authHeaders = { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` };

  try {
    const dupRes = await fetch(
      `${supabaseUrl}/rest/v1/post_bundle_teams?user_id=eq.${user.sub}&label=ilike.${encodeURIComponent(label)}&select=id&limit=1`,
      { headers: authHeaders }
    );
    const dupRows = (await dupRes.json()) as Array<{ id: string }>;
    if (dupRows[0]) return errorResponse("A team with that name already exists", 409, origin);

    const createRes = await fetch("https://api.bundle.social/api/v1/team", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": env.SOCIAL_API_PROVIDER_KEY },
      body: JSON.stringify({ name: label }),
    });
    const team = (await createRes.json()) as any;
    if (!createRes.ok || !team.id) {
      return errorResponse(team.message || "Team creation failed", createRes.status || 502, origin);
    }

    await fetch(`${supabaseUrl}/rest/v1/post_bundle_teams?user_id=eq.${user.sub}&is_active=eq.true`, {
      method: "PATCH",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: false }),
    });
    const insRes = await fetch(`${supabaseUrl}/rest/v1/post_bundle_teams`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ user_id: user.sub, bundle_team_id: team.id, label, is_active: true }),
    });
    const [row] = (await insRes.json()) as any[];
    return json({ team: { id: row?.id, label: row?.label, bundle_team_id: row?.bundle_team_id, is_active: true } }, 201, headers);
  } catch (e) {
    console.error("Team create exception:", e instanceof Error ? e.message : String(e));
    return errorResponse("Team creation failed", 502, origin);
  }
}

/**
 * POST /api/teams/:id/activate — Set a team as the active one.
 */
async function handleActivateTeam(
  request: Request, env: Env, id: string, origin: string, headers: Record<string, string>
): Promise<Response> {
  const user = await validateSupabaseJWT(env.SUPABASE_JWT_SECRET, request.headers.get("Authorization"));
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SUPABASE_SECRET_KEY) return errorResponse("Not configured", 501, origin);

  const supabaseUrl = env.SUPABASE_URL || SUPABASE_URL;
  const authHeaders = { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` };
  try {
    await fetch(`${supabaseUrl}/rest/v1/post_bundle_teams?user_id=eq.${user.sub}&is_active=eq.true`, {
      method: "PATCH",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: false }),
    });
    await fetch(`${supabaseUrl}/rest/v1/post_bundle_teams?id=eq.${id}&user_id=eq.${user.sub}`, {
      method: "PATCH",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: true }),
    });
    return json({ ok: true }, 200, headers);
  } catch {
    return errorResponse("Activate failed", 500, origin);
  }
}

/**
 * PATCH /api/teams/:id — Rename a team (updates our label only; keeps the Bundle id).
 */
async function handleRenameTeam(
  request: Request, env: Env, id: string, origin: string, headers: Record<string, string>
): Promise<Response> {
  const user = await validateSupabaseJWT(env.SUPABASE_JWT_SECRET, request.headers.get("Authorization"));
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SUPABASE_SECRET_KEY) return errorResponse("Not configured", 501, origin);

  let body: { label: string };
  try { body = (await request.json()) as any; } catch { return errorResponse("Invalid JSON", 400, origin); }
  const label = (body.label || "").trim();
  if (!label) return errorResponse("Label required", 400, origin);

  const supabaseUrl = env.SUPABASE_URL || SUPABASE_URL;
  const authHeaders = { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` };
  try {
    const dupRes = await fetch(
      `${supabaseUrl}/rest/v1/post_bundle_teams?user_id=eq.${user.sub}&label=ilike.${encodeURIComponent(label)}&select=id&limit=1`,
      { headers: authHeaders }
    );
    const dupRows = (await dupRes.json()) as Array<{ id: string }>;
    if (dupRows[0] && dupRows[0].id !== id) return errorResponse("A team with that name already exists", 409, origin);

    const res = await fetch(`${supabaseUrl}/rest/v1/post_bundle_teams?id=eq.${id}&user_id=eq.${user.sub}`, {
      method: "PATCH",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    if (!res.ok) return errorResponse("Rename failed", res.status || 500, origin);
    return json({ ok: true }, 200, headers);
  } catch (e) {
    console.error("Team rename exception:", e instanceof Error ? e.message : String(e));
    return errorResponse("Rename failed", 500, origin);
  }
}

/**
 * DELETE /api/teams/:id — Delete a team (Bundle + our mapping).
 */
async function handleDeleteTeam(
  request: Request, env: Env, id: string, origin: string, headers: Record<string, string>
): Promise<Response> {
  const user = await validateSupabaseJWT(env.SUPABASE_JWT_SECRET, request.headers.get("Authorization"));
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SOCIAL_API_PROVIDER_KEY || !env.SUPABASE_SECRET_KEY) return errorResponse("Not configured", 501, origin);

  const supabaseUrl = env.SUPABASE_URL || SUPABASE_URL;
  const authHeaders = { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` };
  try {
    const getRes = await fetch(
      `${supabaseUrl}/rest/v1/post_bundle_teams?id=eq.${id}&user_id=eq.${user.sub}&select=bundle_team_id`,
      { headers: authHeaders }
    );
    const rows = (await getRes.json()) as any[];
    const bundleTeamId = rows[0]?.bundle_team_id;
    if (bundleTeamId) {
      await fetch(`https://api.bundle.social/api/v1/team/${bundleTeamId}`, {
        method: "DELETE",
        headers: { "x-api-key": env.SOCIAL_API_PROVIDER_KEY },
      });
    }
    await fetch(`${supabaseUrl}/rest/v1/post_bundle_teams?id=eq.${id}&user_id=eq.${user.sub}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    return json({ deleted: true }, 200, headers);
  } catch (e) {
    console.error("Team delete exception:", e instanceof Error ? e.message : String(e));
    return errorResponse("Delete failed", 500, origin);
  }
}

/**
 * GET /api/keys — List the user's API keys (metadata only, never the secret).
 */
async function handleListKeys(
  request: Request, env: Env, origin: string, headers: Record<string, string>
): Promise<Response> {
  const user = await validateSupabaseJWT(env.SUPABASE_JWT_SECRET, request.headers.get("Authorization"));
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SUPABASE_SECRET_KEY) return json({ keys: [] }, 200, headers);

  const supabaseUrl = env.SUPABASE_URL || SUPABASE_URL;
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/post_api_keys?user_id=eq.${user.sub}&order=created_at.desc&select=id,name,created_at,last_used_at,revoked_at,key_hash`,
      {
        headers: {
          apikey: env.SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
        },
      }
    );
    if (!res.ok) return json({ keys: [] }, 200, headers);
    const rows = (await res.json()) as any[];
    return json({
      keys: rows.map((k: any) => ({
        id: k.id,
        name: k.name,
        created_at: k.created_at,
        last_used_at: k.last_used_at,
        revoked_at: k.revoked_at,
        hint: k.key_hash.slice(0, 8),
      })),
    }, 200, headers);
  } catch {
    return json({ keys: [] }, 200, headers);
  }
}

/**
 * POST /api/keys — Create an API key. Returns the raw key exactly once.
 */
async function handleCreateKey(
  request: Request, env: Env, origin: string, headers: Record<string, string>
): Promise<Response> {
  const user = await validateSupabaseJWT(env.SUPABASE_JWT_SECRET, request.headers.get("Authorization"));
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SUPABASE_SECRET_KEY) return errorResponse("Not configured", 501, origin);

  let body: { name?: string };
  try { body = (await request.json()) as any; } catch { body = {}; }
  const name = (body.name || "Default key").trim() || "Default key";

  const rawKey = generateApiKey();
  const hash = await sha256Hex(rawKey);
  const supabaseUrl = env.SUPABASE_URL || SUPABASE_URL;

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/post_api_keys`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ user_id: user.sub, name, key_hash: hash }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("Create key failed:", res.status, errText.slice(0, 500));
      return errorResponse("Failed to create key — did you run supabase/api_keys.sql?", res.status || 500, origin);
    }
    const [row] = (await res.json()) as any[];
    return json({ id: row?.id, name: row?.name, key: rawKey, created_at: row?.created_at }, 201, headers);
  } catch (e) {
    console.error("Create key exception:", e instanceof Error ? e.message : String(e));
    return errorResponse("Failed to create key", 500, origin);
  }
}

/**
 * DELETE /api/keys/:id — Revoke an API key (soft delete).
 */
async function handleRevokeKey(
  request: Request, env: Env, id: string, origin: string, headers: Record<string, string>
): Promise<Response> {
  const user = await validateSupabaseJWT(env.SUPABASE_JWT_SECRET, request.headers.get("Authorization"));
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SUPABASE_SECRET_KEY) return errorResponse("Not configured", 501, origin);

  const supabaseUrl = env.SUPABASE_URL || SUPABASE_URL;
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/post_api_keys?id=eq.${id}&user_id=eq.${user.sub}`, {
      method: "PATCH",
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ revoked_at: new Date().toISOString() }),
    });
    if (!res.ok) return errorResponse("Failed to revoke key", res.status || 500, origin);
    return json({ revoked: true }, 200, headers);
  } catch (e) {
    console.error("Revoke key exception:", e instanceof Error ? e.message : String(e));
    return errorResponse("Failed to revoke key", 500, origin);
  }
}

/**
 * GET /api/analytics/:platform — Proxy Bundle.social analytics.
 * Query params: ?type=profile or ?type=post&postId=xxx
 */
async function handleBundleAnalytics(
  request: Request,
  env: Env,
  platform: string,
  origin: string,
  headers: Record<string, string>
): Promise<Response> {
  const user = await authenticateRequest(request, env);
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SOCIAL_API_PROVIDER_KEY || !env.SUPABASE_SECRET_KEY) {
    return errorResponse("Not configured", 501, origin);
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "profile";
  const postId = url.searchParams.get("postId");
  const bsPlatform = bundlePlatform(platform);
  if (!bsPlatform) return errorResponse("Unknown platform", 400, origin);

  const teamId = await getOrCreateBundleTeam(user.sub, env);
  if (!teamId) return errorResponse("Could not provision a team", 502, origin);

  try {
    let endpoint: string;
    if (type === "post" && postId) {
      endpoint = `https://api.bundle.social/api/v1/analytics/post?postId=${postId}&platformType=${bsPlatform}`;
    } else {
      endpoint = `https://api.bundle.social/api/v1/analytics/social-account?teamId=${teamId}&platformType=${bsPlatform}`;
    }
    const res = await fetch(endpoint, {
      headers: { "x-api-key": env.SOCIAL_API_PROVIDER_KEY },
    });
    const data = await res.json();
    return json(data, res.status, headers);
  } catch {
    return json({ error: "Analytics unavailable" }, 502, headers);
  }
}

/** Normalize a Bundle direct/forced analytics payload into our metric shape.
 *  Field names match Bundle's normalized post-analytics schema:
 *  impressions, impressionsUnique, views, viewsUnique, likes, dislikes,
 *  comments, shares, saves (see info.bundle.social/api-reference). */
function normBundleMetrics(d: any): Record<string, number> {
  const num = (n: unknown): number => {
    const v = Number(n);
    return Number.isFinite(v) ? v : 0;
  };
  return {
    impressions: num(d?.impressions ?? d?.impression_count),
    views: num(d?.views ?? d?.view_count ?? d?.impressions),
    reach: num(d?.impressionsUnique ?? d?.impressions_unique),
    viewsUnique: num(d?.viewsUnique ?? d?.views_unique),
    likes: num(d?.likes ?? d?.likeCount ?? d?.like_count),
    dislikes: num(d?.dislikes ?? d?.dislike_count),
    comments: num(d?.comments ?? d?.commentCount ?? d?.comment_count),
    shares: num(d?.shares ?? d?.shareCount ?? d?.share_count ?? d?.reposts ?? d?.retweet_count ?? d?.retweets),
    saves: num(d?.saves ?? d?.save_count ?? d?.saved),
  };
}

/**
 * Fetch analytics for many Bundle posts at once via the bulk endpoint
 * (`GET /analytics/post/bulk`), keyed by Bundle post id. One call replaces N
 * per-post force calls (passive — doesn't consume per-post force rate limits).
 * Returns a map of `postId → normalized metrics`.
 */
async function fetchBulkPostAnalytics(
  env: Env,
  bsPlatform: string,
  postIds: string[]
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>();
  const ids = postIds.slice(0, 60);
  if (!ids.length || !env.SOCIAL_API_PROVIDER_KEY) return out;
  let page = 1;
  let totalPages = 1;
  do {
    const qs = new URLSearchParams();
    for (const id of ids) qs.append("postIds", id);
    qs.set("platformType", bsPlatform);
    qs.set("page", String(page));
    qs.set("limit", "20");
    try {
      const res = await fetch(`https://api.bundle.social/api/v1/analytics/post/bulk?${qs.toString()}`, {
        headers: { "x-api-key": env.SOCIAL_API_PROVIDER_KEY },
      });
      if (!res.ok) break;
      const data = (await res.json()) as any;
      const results = Array.isArray(data?.results) ? data.results : [];
      for (const r of results) {
        const item = Array.isArray(r.items) ? r.items[0] : r.items;
        if (r.postId && item) out.set(r.postId, normBundleMetrics(item));
      }
      totalPages = Number(data?.pagination?.totalPages) || 1;
    } catch {
      break;
    }
    page++;
  } while (page <= totalPages);
  return out;
}

/**
 * Read metrics straight from the platform for a post we published directly.
 * Returns null when no direct reader is configured or the read fails (callers
 * then fall back to surfacing an error). Only X is wired up today.
 */
async function normDirectMetrics(env: Env, platform: Platform, postId: string): Promise<Record<string, number> | null> {
  if (platform === "x") {
    if (!env.X_BEARER_TOKEN) return null;
    try {
      return await fetchXMetrics(postId, env.X_BEARER_TOKEN);
    } catch {
      return null;
    }
  }
  return null;
}

/** Merge fresh metrics for one platform into a post row (best-effort). */
async function persistMetricsToRow(
  env: Env,
  userId: string,
  postRowId: string,
  platform: Platform,
  metrics: Record<string, number>
): Promise<void> {
  if (!env.SUPABASE_SECRET_KEY) return;
  const supabaseUrl = env.SUPABASE_URL || SUPABASE_URL;
  const authHeaders = { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` };
  try {
    const cur = await fetch(
      `${supabaseUrl}/rest/v1/post_posts?id=eq.${postRowId}&user_id=eq.${userId}&select=metrics`,
      { headers: authHeaders }
    );
    const rows = cur.ok ? ((await cur.json()) as any[]) : [];
    const merged = { ...(rows[0]?.metrics || {}), [platform]: metrics };
    await fetch(`${supabaseUrl}/rest/v1/post_posts?id=eq.${postRowId}&user_id=eq.${userId}`, {
      method: "PATCH",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ metrics: merged }),
    });
  } catch { /* best-effort */ }
}

/**
 * GET /api/analytics/prefs — read per-user analytics preferences.
 */
async function handleGetAnalyticsPrefs(
  request: Request, env: Env, origin: string, headers: Record<string, string>
): Promise<Response> {
  const user = await authenticateRequest(request, env);
  if (!user) return errorResponse("Unauthorized", 401, origin);
  return json(await getAnalyticsPrefs(env, user.sub), 200, headers);
}

/**
 * POST /api/analytics/prefs — persist per-user analytics preferences.
 * Body: { skipXAnalytics?: boolean }
 */
async function handleSetAnalyticsPrefs(
  request: Request, env: Env, origin: string, headers: Record<string, string>
): Promise<Response> {
  const user = await authenticateRequest(request, env);
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SUPABASE_SECRET_KEY) return errorResponse("Not configured", 501, origin);

  let body: { skipXAnalytics?: boolean };
  try { body = (await request.json()) as any; } catch { return errorResponse("Invalid JSON", 400, origin); }
  const skipXAnalytics = Boolean(body.skipXAnalytics);

  const supabaseUrl = env.SUPABASE_URL || SUPABASE_URL;
  const authHeaders = { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` };
  try {
    const existingRes = await fetch(
      `${supabaseUrl}/rest/v1/post_content?user_id=eq.${user.sub}&type=eq.analytics_pref&select=id&limit=1`,
      { headers: authHeaders }
    );
    const rows = existingRes.ok ? ((await existingRes.json()) as any[]) : [];
    const payload = JSON.stringify({ data: { skip_x_analytics: skipXAnalytics } });
    if (rows?.[0]?.id) {
      await fetch(`${supabaseUrl}/rest/v1/post_content?id=eq.${rows[0].id}&user_id=eq.${user.sub}`, {
        method: "PATCH",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: payload,
      });
    } else {
      await fetch(`${supabaseUrl}/rest/v1/post_content`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.sub, type: "analytics_pref", data: { skip_x_analytics: skipXAnalytics } }),
      });
    }
    return json({ skipXAnalytics }, 200, headers);
  } catch (e) {
    console.error("Save analytics prefs failed:", e instanceof Error ? e.message : String(e));
    return errorResponse("Failed to save preferences", 500, origin);
  }
}

/** Read the user's analytics preferences (defaults to not skipping anything). */
async function getAnalyticsPrefs(env: Env, userId: string): Promise<{ skipXAnalytics: boolean }> {
  if (!env.SUPABASE_SECRET_KEY) return { skipXAnalytics: false };
  try {
    const supabaseUrl = env.SUPABASE_URL || SUPABASE_URL;
    const res = await fetch(
      `${supabaseUrl}/rest/v1/post_content?user_id=eq.${userId}&type=eq.analytics_pref&select=data&limit=1`,
      { headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` } }
    );
    if (!res.ok) return { skipXAnalytics: false };
    const rows = (await res.json()) as any[];
    return { skipXAnalytics: Boolean(rows?.[0]?.data?.skip_x_analytics) };
  } catch {
    return { skipXAnalytics: false };
  }
}

/**
 * POST /api/analytics/refresh — Pull post analytics from Bundle for the user's
 * posted posts and cache them into post_posts.metrics so the aggregate
 * /api/analytics has real numbers.
 */
async function handleAnalyticsRefresh(
  request: Request, env: Env, origin: string, headers: Record<string, string>
): Promise<Response> {
  const user = await authenticateRequest(request, env);
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SOCIAL_API_PROVIDER_KEY || !env.SUPABASE_SECRET_KEY) return errorResponse("Not configured", 501, origin);

  const supabaseUrl = env.SUPABASE_URL || SUPABASE_URL;
  const authHeaders = { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` };

  // Users can opt out of pulling X in the bulk refresh (X reads are metered at
  // $0.005/post). The deliberate per-post "Refresh" action still works.
  const prefs = await getAnalyticsPrefs(env, user.sub);
  const skipX = prefs.skipXAnalytics;

  // Bundle meters X reads: TWITTER_POST_READ $0.005 per per-post analytics fetch
  // (confirmed via /billing/billable-usage/quote → "X post read", 5000 micros).
  const X_POST_READ_FEE_MICROS = 5_000;

  // Optional limit scopes the refresh to the N most recent posted posts so a
  // click only pulls (and bills for) what the user is currently looking at.
  // Accepted via ?limit= (preferred) or { limit } body. Default 10 (bounded);
  // the free-plan 50-subrequest cap is enforced by budget.
  let limit = 10;
  const qLimit = Number(new URL(request.url).searchParams.get("limit"));
  if (Number.isFinite(qLimit) && qLimit > 0) limit = Math.min(Math.max(Math.floor(qLimit), 1), 50);
  try {
    const body = (await request.json().catch(() => null)) as { limit?: number } | null;
    if (typeof body?.limit === "number") limit = Math.min(Math.max(Math.floor(body.limit), 1), 50);
  } catch { /* ignore malformed body */ }

  try {
    const postsRes = await fetch(
      `${supabaseUrl}/rest/v1/post_posts?user_id=eq.${user.sub}&status=eq.posted&select=id,results,metrics&order=posted_at.desc.nullslast&limit=${limit}`,
      { headers: authHeaders }
    );
    if (!postsRes.ok) return errorResponse("Failed to load posts", 500, origin);
    const posts = (await postsRes.json()) as any[];

    // Cloudflare free-plan default is 50 subrequests per invocation; leave headroom.
    let budget = 40;
    const out = () => budget <= 0;

    // Group Bundle-published results by platform so we can bulk-pull analytics
    // (one passive call per platform instead of one force per post). X is left
    // on the metered per-post force path (and skipped entirely when opted out).
    const bundleByPlatform = new Map<string, { bs: string; ids: string[] }>();
    for (const post of posts) {
      for (const r of (post.results || []) as any[]) {
        if (!r?.success || !r?.postId || r.via === "direct") continue;
        if (r.platform === "x") continue;
        const bs = bundlePlatform(r.platform);
        if (!bs) continue;
        let g = bundleByPlatform.get(r.platform);
        if (!g) { g = { bs, ids: [] }; bundleByPlatform.set(r.platform, g); }
        if (!g.ids.includes(r.postId)) g.ids.push(r.postId);
      }
    }

    const bulk = new Map<string, Record<string, number>>(); // key: `${platform}::${postId}`
    for (const [platform, g] of bundleByPlatform) {
      if (out()) break;
      budget--;
      const m = await fetchBulkPostAnalytics(env, g.bs, g.ids);
      for (const [postId, metrics] of m) bulk.set(`${platform}::${postId}`, metrics);
    }

    const refreshed: string[] = [];
    for (const post of posts) {
      if (out()) break;
      const metrics: Record<string, any> = post.metrics || {};
      let changed = false;
      for (const r of (post.results || []) as any[]) {
        if (!r?.success || !r?.postId) continue;
        if (skipX && r.platform === "x") continue;
        if (out()) break;
        try {
          let normalized: Record<string, number> | null = null;
          let metered = false;
          if (r.via === "direct") {
            // We published this ourselves, so Bundle can't read it back.
            normalized = await normDirectMetrics(env, r.platform, r.postId);
          } else if (r.platform !== "x") {
            // Bulk (passive) read — no per-post force, no fee.
            normalized = bulk.get(`${r.platform}::${r.postId}`) || null;
          } else if (env.SOCIAL_API_PROVIDER_KEY) {
            // X is metered: force a live fetch and tabulate the read fee.
            const bs = bundlePlatform(r.platform);
            const res = await fetch("https://api.bundle.social/api/v1/analytics/post/force", {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-api-key": env.SOCIAL_API_PROVIDER_KEY },
              body: JSON.stringify({ postId: r.postId, platformType: bs }),
            });
            budget--;
            if (res.ok) {
              normalized = normBundleMetrics(await res.json());
              metered = true;
            } else if (res.status === 401 || res.status === 403 || res.status === 404) {
              // Directly-published posts aren't known to Bundle — read directly.
              normalized = await normDirectMetrics(env, r.platform, r.postId);
            } else {
              const t = await res.text();
              console.error(`[analytics-refresh] platform=${r.platform} post=${r.postId} status=${res.status} body=${t.slice(0, 300)}`);
            }
          }
          if (!normalized) continue;
          metrics[r.platform] = normalized;
          changed = true;
          // X per-post analytics reads are metered by Bundle ($0.005/read, POST_READ).
          // Tabulate them in the X-fee ledger so refreshes show up on the fees page.
          if (metered && r.platform === "x") {
            if (out()) break;
            try {
              await fetch(`${supabaseUrl}/rest/v1/post_credits`, {
                method: "POST",
                headers: { ...authHeaders, "Content-Type": "application/json" },
                body: JSON.stringify({
                  user_id: user.sub,
                  amount_micros: -X_POST_READ_FEE_MICROS,
                  kind: "x_fee",
                  reference_id: r.postId,
                  has_link: false,
                  note: "X analytics read (per post)",
                }),
              });
              budget--;
            } catch (e) {
              console.error("record X analytics read fee failed:", e instanceof Error ? e.message : String(e));
            }
          }
        } catch {}
      }
      if (changed && !out()) {
        await fetch(`${supabaseUrl}/rest/v1/post_posts?id=eq.${post.id}`, {
          method: "PATCH",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ metrics }),
        });
        budget--;
        refreshed.push(post.id);
      }
    }
    return json({ refreshed: refreshed.length, posts: refreshed, limit: limit, postsLoaded: posts.length }, 200, headers);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Analytics refresh exception:", msg);
    return json({ error: "Analytics refresh failed", detail: msg }, 502, headers);
  }
}

/**
 * POST /api/analytics/force — Force an immediate live analytics fetch for a
 * single post (Bundle POST /api/v1/analytics/post/force). Consumes platform
 * rate limits, so it's a deliberate per-post action.
 * Body: { platform, postId }  for posts published through the app, OR
 *       { platform, importedPostId } for imported (historical) posts — the
 *       profilePost id returned by the import endpoints.
 */
async function handleForceAnalytics(
  request: Request, env: Env, origin: string, headers: Record<string, string>
): Promise<Response> {
  const user = await authenticateRequest(request, env);
  if (!user) return errorResponse("Unauthorized", 401, origin);
  const apiKey = env.SOCIAL_API_PROVIDER_KEY;

  let body: { platform?: string; postId?: string; importedPostId?: string; postRowId?: string; via?: "direct" | "bundle" };
  try { body = (await request.json()) as any; } catch { return errorResponse("Invalid JSON", 400, origin); }
  if (!body?.platform) return errorResponse("platform required", 400, origin);
  const platform = body.platform as Platform;
  const bs = bundlePlatform(platform);
  if (body.postId && body.importedPostId) return errorResponse("Provide postId OR importedPostId, not both", 400, origin);
  if (!body.postId && !body.importedPostId) return errorResponse("postId or importedPostId required", 400, origin);

  const targetId = (body.postId || body.importedPostId) as string;
  const imported = Boolean(body.importedPostId);
  // Imported (pre-app) posts only exist in Bundle; directly-published posts only
  // exist on the platform. Everything else is read through Bundle.
  const preferDirect = !imported && body.via === "direct";

  try {
    let metrics: Record<string, number> | null = null;
    let metered = false;

    if (preferDirect) {
      metrics = await normDirectMetrics(env, platform, targetId);
      if (!metrics) {
        return errorResponse(
          platform === "x" && !env.X_BEARER_TOKEN
            ? "Direct X analytics need X_BEARER_TOKEN configured"
            : "Couldn't read metrics directly from the platform",
          502, origin
        );
      }
    } else {
      if (!apiKey) return errorResponse("Not configured", 501, origin);
      if (!bs) return errorResponse("Unknown platform", 400, origin);
      const res = await fetch("https://api.bundle.social/api/v1/analytics/post/force", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        // importedPostId goes alone (no platformType); platform posts take postId + platformType.
        body: JSON.stringify(imported ? { importedPostId: targetId } : { postId: targetId, platformType: bs }),
      });
      if (res.ok) {
        metrics = normBundleMetrics(await res.json());
        metered = true;
      } else {
        const data = (await res.json().catch(() => ({}))) as any;
        // Posts we published directly aren't known to Bundle and come back
        // 401/403/404. Don't leak that as an auth failure (the dashboard signs
        // the user out on 401) — retry against the platform directly.
        if (!imported && (res.status === 401 || res.status === 403 || res.status === 404)) {
          metrics = await normDirectMetrics(env, platform, targetId);
        }
        if (!metrics) {
          console.error(`Bundle force analytics failed (${bs}):`, res.status, JSON.stringify(data));
          // Never surface an upstream 401/403 as 401 — reserve that for real auth failures.
          const status = res.status === 401 || res.status === 403 ? 502 : res.status;
          return json(
            { ...data, upstreamStatus: res.status, error: data?.message || data?.error || `Analytics provider error ${res.status}` },
            status,
            headers
          );
        }
      }
    }

    // X per-post reads are metered only when Bundle served them (direct reads are free).
    if (metered && platform === "x" && env.SUPABASE_SECRET_KEY) {
      const supabaseUrl = env.SUPABASE_URL || SUPABASE_URL;
      const authHeaders = { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` };
      try {
        await fetch(`${supabaseUrl}/rest/v1/post_credits`, {
          method: "POST",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: user.sub, amount_micros: -5_000, kind: "x_fee",
            reference_id: String(targetId), has_link: false, note: "X analytics read (per post)",
          }),
        });
      } catch { /* best-effort */ }
    }

    // Persist the forced metrics onto the app post row (when the caller passes
    // its id) so History/Analytics reflect the refresh without a full re-pull.
    if (body.postRowId && metrics && !imported) {
      await persistMetricsToRow(env, user.sub, body.postRowId, platform, metrics);
    }
    return json({ platform, ...metrics }, 200, headers);
  } catch (e) {
    console.error("Force analytics exception:", e instanceof Error ? e.message : String(e));
    return errorResponse("Force analytics failed", 502, origin);
  }
}

/**
 * POST /api/comments/import — Start Bundle comment import for a post.
 * Body: { postId, platform }
 */
async function handleCommentImport(
  request: Request, env: Env, origin: string, headers: Record<string, string>
): Promise<Response> {
  const user = await authenticateRequest(request, env);
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SOCIAL_API_PROVIDER_KEY || !env.SUPABASE_SECRET_KEY) return errorResponse("Not configured", 501, origin);

  let body: { postId: string; platform: string };
  try { body = (await request.json()) as any; } catch { return errorResponse("Invalid JSON", 400, origin); }

  const bsPlatform = bundlePlatform(body.platform);
  if (!bsPlatform) return errorResponse("Unknown platform", 400, origin);

  // Prefer the team the post was actually published under (a switched active
  // team makes the post "belong" to a different team from Bundle's view).
  const teamId = (await findPostTeamId(env, user.sub, body.postId)) || (await getOrCreateBundleTeam(user.sub, env));
  if (!teamId) return errorResponse("Could not provision a team", 502, origin);

  try {
    const res = await fetch("https://api.bundle.social/api/v1/comment/import", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": env.SOCIAL_API_PROVIDER_KEY },
      body: JSON.stringify({ teamId, postId: body.postId, socialAccountType: bsPlatform }),
    });
    // Bundle can return non-JSON (e.g. an HTML error page) when it crashes, so
    // read text first — otherwise res.json() throws and we lose the real reason.
    const raw = await res.text();
    let data: any = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
    console.log(`Bundle comment import (${bsPlatform}, post ${body.postId}) -> ${res.status} ${raw.slice(0, 500)}`);
    if (!res.ok) {
      console.error(`Bundle comment import failed (${bsPlatform}, post ${body.postId}):`, res.status, raw.slice(0, 500));
      const issues = Array.isArray(data?.issues)
        ? data.issues.map((i: any) => `${(i.path || []).join(".")}: ${i.message}`).join("; ")
        : "";
      const message = issues || data?.message || data?.error || raw.slice(0, 300) || `Comment import failed (${res.status})`;
      return json({ error: message }, res.status, headers);
    }
    // A 200 can still carry a job that failed upstream (e.g. TikTok).
    if (data && typeof data === "object" && String(data.status || "").toUpperCase() === "FAILED") {
      console.error(`Bundle comment import job FAILED (${bsPlatform}, post ${body.postId}):`, raw.slice(0, 500));
      return json({ error: data.error || data.message || "Comment import job failed", job: data }, 200, headers);
    }
    return json(data, res.status, headers);
  } catch (e) {
    console.error("Bundle comment import exception:", e instanceof Error ? e.message : String(e));
    return json({ error: "Comment import failed" }, 502, headers);
  }
}

/**
 * GET /api/comments — Get imported comments. ?postId=xxx&platform=yyy
 */
async function handleComments(
  request: Request, env: Env, url: URL, origin: string, headers: Record<string, string>
): Promise<Response> {
  const user = await authenticateRequest(request, env);
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SOCIAL_API_PROVIDER_KEY || !env.SUPABASE_SECRET_KEY) return errorResponse("Not configured", 501, origin);

  const postId = url.searchParams.get("postId");
  if (!postId) return errorResponse("postId required", 400, origin);
  const platform = url.searchParams.get("platform") || "";

  const teamId = (await findPostTeamId(env, user.sub, postId)) || (await getOrCreateBundleTeam(user.sub, env));
  if (!teamId) return errorResponse("Could not provision a team", 502, origin);

  try {
    const res = await fetch(
      `https://api.bundle.social/api/v1/comment/import/comments?teamId=${teamId}&postId=${postId}`,
      { headers: { "x-api-key": env.SOCIAL_API_PROVIDER_KEY } }
    );
    const raw = await res.text();
    let data: any = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
    console.log(`Bundle comments list (${platform}, post ${postId}): ${res.status} ${raw.slice(0, 500)}`);
    if (!res.ok) {
      return json(
        { items: [], error: data?.message || data?.error || `Comments unavailable (${res.status})`, debug: raw.slice(0, 500) },
        res.status,
        headers
      );
    }
    const items = normalizeComments(data);
    const payload: Record<string, unknown> = { items };
    // When nothing comes back, hand the raw provider response to the client so
    // the cause is visible in the UI without digging through logs.
    if (!items.length) payload.debug = raw.slice(0, 500);
    return json(payload, 200, headers);
  } catch (e) {
    console.error("Comments list exception:", e instanceof Error ? e.message : String(e));
    return json({ items: [], error: "Comments unavailable" }, 502, headers);
  }
}

/**
 * Bundle's fetched-comments response shape varies by platform/version (bare
 * array, { items }, { comments }, …). Pull the list out of whichever envelope
 * it used and map to the camelCase fields the web/mobile UIs render.
 */
function normalizeComments(data: any): any[] {
  const list = Array.isArray(data) ? data
    : Array.isArray(data?.items) ? data.items
      : Array.isArray(data?.comments) ? data.comments
        : Array.isArray(data?.data) ? data.data
          : [];
  return list.map((c: any) => ({
    ...c,
    id: c.id || c.commentId || c.internalId || "",
    text: c.text ?? c.message ?? c.comment ?? c.content ?? "",
    authorName: c.authorName || c.author?.name || c.author?.displayName || c.author?.username
      || c.username || c.user?.display_name || c.user?.unique_id || c.from?.name || "",
    authorProfileUrl: c.authorProfileUrl || c.authorProfileLink || c.author?.url || c.authorUrl
      || c.user?.profile_url || c.from?.link || "",
    authorAvatarUrl: c.authorAvatarUrl || c.author?.avatar || c.avatarUrl || c.avatar
      || c.user?.avatar_url || c.from?.picture?.data?.url || "",
    publishedAt: c.publishedAt || c.createdAt || c.created_at || c.createdTime
      || c.timestamp || c.create_time || "",
  }));
}

/**
 * POST /api/media — Proxy Bundle media upload from URL.
 * Body: { url }
 */
async function handleMediaUpload(
  request: Request, env: Env, origin: string, headers: Record<string, string>
): Promise<Response> {
  const user = await authenticateRequest(request, env);
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SOCIAL_API_PROVIDER_KEY || !env.SUPABASE_SECRET_KEY) return errorResponse("Not configured", 501, origin);

  let body: { url: string };
  try { body = (await request.json()) as any; } catch { return errorResponse("Invalid JSON", 400, origin); }

  const teamId = await getOrCreateBundleTeam(user.sub, env);
  if (!teamId) return errorResponse("Could not provision a team", 502, origin);

  try {
    const res = await fetch("https://api.bundle.social/api/v1/upload/from-url", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": env.SOCIAL_API_PROVIDER_KEY },
      body: JSON.stringify({ teamId, url: body.url }),
    });
    return json(await res.json(), res.status, headers);
  } catch { return json({ error: "Upload failed" }, 502, headers); }
}

/**
 * POST /api/media/upload — Upload a file to Bundle (multipart/form-data).
 * Form fields: file (binary), teamId (optional).
 */
async function handleMediaUploadFile(
  request: Request, env: Env, origin: string, headers: Record<string, string>
): Promise<Response> {
  const user = await authenticateRequest(request, env);
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SOCIAL_API_PROVIDER_KEY || !env.SUPABASE_SECRET_KEY) return errorResponse("Not configured", 501, origin);

  let form: FormData;
  try { form = await request.formData(); } catch { return errorResponse("Invalid form data", 400, origin); }

  const file = form.get("file");
  if (!file || typeof file === "string") return errorResponse("No file", 400, origin);

  const teamId = await resolveBundleTeamId(user.sub, (form.get("teamId") as string) || undefined, env);
  if (!teamId) return errorResponse("Could not provision a team", 502, origin);

  // Infer the MIME type from the filename when the client didn't send one
  // (e.g. curl uploads arrive as application/octet-stream and Bundle rejects
  // them). Bundle accepts image/jpg, image/jpeg, image/png, image/gif,
  // video/mp4, video/quicktime, application/pdf.
  const fileName = file.name || "file";
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const MIME_BY_EXT: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
    mp4: "video/mp4", mov: "video/quicktime", m4v: "video/mp4", webm: "video/webm",
    pdf: "application/pdf",
  };
  const mime = MIME_BY_EXT[ext] || file.type || "application/octet-stream";
  const corrected = new File([file], fileName, { type: mime });

  const fd = new FormData();
  fd.append("teamId", teamId);
  fd.append("file", corrected, fileName);

  try {
    const res = await fetch("https://api.bundle.social/api/v1/upload/", {
      method: "POST",
      headers: { "x-api-key": env.SOCIAL_API_PROVIDER_KEY },
      body: fd,
    });
    const data = (await res.json()) as any;
    if (!res.ok) {
      console.error(`Bundle upload failed (team=${teamId}):`, res.status, JSON.stringify(data));
      return errorResponse(data.message || "Upload failed", res.status || 502, origin);
    }
    console.log(`Bundle upload success (team=${teamId}):`, JSON.stringify({ id: data.id, type: data.type, mime: data.mime, fileSize: data.fileSize }));
    return json({ uploadId: data.id, ...data }, 200, headers);
  } catch (e) {
    console.error("Bundle upload exception:", e instanceof Error ? e.message : String(e));
    return errorResponse("Upload failed", 502, origin);
  }
}

/**
 * POST /api/import — Start a Bundle post history import (backfill posts a social
 * account published before it was connected, together with analytics when the
 * platform supports it). Async job → poll GET /api/imports.
 * Body: { platform, count?, withAnalytics?, importCarousels?, surface?, mediaType? }
 *   platform: x | bluesky | threads | tiktok | linkedin | instagram | facebook |
 *             pinterest | youtube | reddit | mastodon
 *   count: posts to backfill (default 50). Monthly limits apply on Bundle's side.
 */
async function handlePostImport(
  request: Request, env: Env, origin: string, headers: Record<string, string>
): Promise<Response> {
  const user = await authenticateRequest(request, env);
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SOCIAL_API_PROVIDER_KEY || !env.SUPABASE_SECRET_KEY) return errorResponse("Not configured", 501, origin);

  let body: {
    platform?: string; count?: number; withAnalytics?: boolean; importCarousels?: boolean;
    surface?: string; mediaType?: string;
  };
  try { body = (await request.json()) as any; } catch { return errorResponse("Invalid JSON", 400, origin); }
  if (!body?.platform) return errorResponse("platform required", 400, origin);

  const bsPlatform = bundlePlatform(body.platform);
  if (!bsPlatform) return errorResponse("Unknown platform", 400, origin);
  const IMPORT_SUPPORTED = ["FACEBOOK", "INSTAGRAM", "THREADS", "TIKTOK", "YOUTUBE", "LINKEDIN", "PINTEREST", "REDDIT", "MASTODON", "BLUESKY", "TWITTER"];
  if (!IMPORT_SUPPORTED.includes(bsPlatform)) return errorResponse(`Post history import not supported for ${body.platform}`, 400, origin);

  const teamId = await getOrCreateBundleTeam(user.sub, env);
  if (!teamId) return errorResponse("Could not provision a team", 502, origin);

  const count = Math.min(Math.max(Math.floor(Number(body.count) || 50), 1), 500);
  const payload: Record<string, unknown> = {
    teamId,
    socialAccountType: bsPlatform,
    count,
    withAnalytics: body.withAnalytics !== false,
  };
  if (body.importCarousels != null) payload.importCarousels = body.importCarousels;
  if (body.surface) payload.surface = body.surface;
  if (body.mediaType) payload.mediaType = body.mediaType;

  try {
    const res = await fetch("https://api.bundle.social/api/v1/post-history-import/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": env.SOCIAL_API_PROVIDER_KEY },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as any;
    if (!res.ok) {
      console.error(`Bundle post history import failed (${bsPlatform}):`, res.status, JSON.stringify(data));
      return json(data, res.status, headers);
    }
    return json({ import: data, platform: body.platform }, res.status, headers);
  } catch (e) {
    console.error("Bundle post import exception:", e instanceof Error ? e.message : String(e));
    return json({ error: "Import failed" }, 502, headers);
  }
}

/**
 * GET /api/imports — List post history import jobs for the team
 * (queued / running / finished / failed). Query: ?platform= optional.
 */
async function handleListImports(
  request: Request, env: Env, origin: string, headers: Record<string, string>
): Promise<Response> {
  const user = await authenticateRequest(request, env);
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SOCIAL_API_PROVIDER_KEY) return json({ imports: [] }, 200, headers);

  const url = new URL(request.url);
  const platform = url.searchParams.get("platform");
  const bsPlatform = platform ? bundlePlatform(platform) : null;
  if (platform && !bsPlatform) return errorResponse("Unknown platform", 400, origin);

  const teamId = await getOrCreateBundleTeam(user.sub, env);
  if (!teamId) return json({ imports: [] }, 200, headers);

  const qs = new URLSearchParams({ teamId });
  if (bsPlatform) qs.set("socialAccountType", bsPlatform);
  try {
    const res = await fetch(`https://api.bundle.social/api/v1/post-history-import/?${qs.toString()}`, {
      headers: { "x-api-key": env.SOCIAL_API_PROVIDER_KEY },
    });
    return json(await res.json(), res.status, headers);
  } catch { return json({ error: "Imports unavailable" }, 502, headers); }
}

/**
 * GET /api/imports/posts — List posts pulled in by history imports for an account,
 * with analytics + remaining import capacity. Query: ?platform=&count= optional.
 */
async function handleImportedPosts(
  request: Request, env: Env, origin: string, headers: Record<string, string>
): Promise<Response> {
  const user = await authenticateRequest(request, env);
  if (!user) return errorResponse("Unauthorized", 401, origin);
  const apiKey = env.SOCIAL_API_PROVIDER_KEY;
  if (!apiKey) return json({ posts: [] }, 200, headers);

  const url = new URL(request.url);
  const platform = url.searchParams.get("platform");
  const count = Math.min(Math.max(Math.floor(Number(url.searchParams.get("count")) || 50), 1), 200);
  const teamId = await getOrCreateBundleTeam(user.sub, env);
  if (!teamId) return json({ posts: [] }, 200, headers);

  const fetchPostsFor = async (bsPlatform: string): Promise<any[]> => {
    const qs = new URLSearchParams({ teamId, socialAccountType: bsPlatform, count: String(count) });
    const res = await fetch(`https://api.bundle.social/api/v1/post-history-import/posts?${qs.toString()}`, {
      headers: { "x-api-key": apiKey },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as any;
    const list = Array.isArray(data) ? data : (data?.posts || []);
    const key = bundlePlatformToKey(bsPlatform);
    return list.map((p: any) => ({ ...p, platform: key }));
  };

  try {
    // Single platform: one tagged fetch (used right after starting an import).
    if (platform) {
      const bs = bundlePlatform(platform);
      if (!bs) return errorResponse("Unknown platform", 400, origin);
      const posts = await fetchPostsFor(bs);
      return json({ posts, platform, remainingCapacity: 0 }, 200, headers);
    }

    // No platform: resolve which accounts have been imported, then aggregate so the
    // Analytics timeline can weave them in by date.
    const importedAccountIds = new Set<string>();
    const jobRes = await fetch(`https://api.bundle.social/api/v1/post-history-import/?${new URLSearchParams({ teamId })}`, {
      headers: { "x-api-key": apiKey },
    });
    if (jobRes.ok) {
      const jobData = (await jobRes.json()) as any;
      const jobs = Array.isArray(jobData) ? jobData : (jobData?.items || jobData?.imports || []);
      for (const j of jobs) {
        if (j.socialAccountId) importedAccountIds.add(j.socialAccountId);
      }
    }
    // Jobs don't include the platform type, so map the imported account ids via the
    // team roster (only those — never un-imported accounts).
    const accountIdToType: Record<string, string> = {};
    const teamRes = await fetch(`https://api.bundle.social/api/v1/team/${teamId}`, {
      headers: { "x-api-key": apiKey },
    });
    if (teamRes.ok) {
      const team = (await teamRes.json()) as any;
      for (const sa of team?.socialAccounts || []) {
        if (importedAccountIds.has(sa.id)) accountIdToType[sa.id] = sa.type;
      }
    }

    const seenTypes = new Set<string>();
    const byType = new Map<string, any[]>();
    for (const type of Object.values(accountIdToType)) {
      if (!type || seenTypes.has(type)) continue;
      seenTypes.add(type);
      byType.set(type, await fetchPostsFor(type));
    }
    const posts = [...byType.values()].flat();
    return json({ posts, byPlatform: Object.fromEntries(byType), remainingCapacity: 0 }, 200, headers);
  } catch {
    return json({ error: "Imported posts unavailable" }, 502, headers);
  }
}

/**
 * True when the deployment has direct X credentials (env vars or per-user BYOK),
 * so we prefer our own adapter over Bundle and can migrate off Bundle gradually.
 */
function hasDirectXCreds(env: Env, userTokens: PlatformToken[]): boolean {
  if (env.X_CONSUMER_KEY && env.X_CONSUMER_KEY_SECRET && env.X_ACCESS_TOKEN && env.X_ACCESS_TOKEN_SECRET) {
    return true;
  }
  return userTokens.some((t) => t.platform === "x" && (t.metadata as any)?.consumer_key);
}

/**
 * True when a direct (non-Bundle) adapter is actually configured for a platform,
 * either via env vars or a per-user stored token. Used to decide whether to fall
 * back to a direct adapter when the Bundle post fails (vs surfacing Bundle's error).
 */
function hasDirectCreds(platform: Platform, env: Env, userTokens: PlatformToken[]): boolean {
  if (platform === "x") return hasDirectXCreds(env, userTokens);
  const token = findToken(userTokens, platform);
  switch (platform) {
    case "bluesky":
      // Only use the direct adapter when this specific user has set an app
      // password. The shared BLUESKY_HANDLE/BLUESKY_PASSWORD env secrets must
      // not make every user's posts go through one handle — Bundle-connected
      // accounts should post via Bundle.
      return Boolean(token?.platform_handle && token?.access_token);
    case "linkedin":
      return Boolean((token?.access_token && token?.platform_user_id) || (env.LINKEDIN_ACCESS_TOKEN && env.LINKEDIN_AUTHOR));
    case "facebook":
      return Boolean((token?.access_token && (token?.metadata as any)?.page_id) || (env.FACEBOOK_ACCESS_TOKEN && env.FACEBOOK_PAGE_ID));
    case "instagram":
      return Boolean((token?.access_token && (token?.metadata as any)?.ig_user_id) || (env.INSTAGRAM_ACCESS_TOKEN && env.INSTAGRAM_USER_ID));
    case "tiktok":
      return Boolean((token?.access_token && token?.platform_user_id) || (env.TIKTOK_ACCESS_TOKEN && env.TIKTOK_OPEN_ID));
    case "threads":
      return Boolean((token?.access_token && token?.platform_user_id) || (env.THREADS_ACCESS_TOKEN && env.THREADS_USER_ID));
    default:
      return false;
  }
}

/**
 * POST /api/post — Post to one or more platforms.
 */
async function handlePost(
  request: Request,
  env: Env,
  origin: string,
  headers: Record<string, string>
): Promise<Response> {
  // Auth (JWT or API key)
  const user = await authenticateRequest(request, env);
  if (!user) return errorResponse("Unauthorized", 401, origin);

  // Parse body
  let body: PostRequest;
  try {
    body = (await request.json()) as PostRequest;
  } catch {
    return errorResponse("Invalid JSON body", 400, origin);
  }

  if (!body.platforms?.length) {
    return errorResponse("At least one platform is required", 400, origin);
  }

  const text = body.text?.trim() || "";
  const media = normalizeMediaRefs(body.mediaUrls, body.media);
  const mediaIds = media.map((m) => m.uploadId);

  if (!text && !media.length) {
    return errorResponse("Text or media content is required", 400, origin);
  }
  if (!body.teamId && !body.team) {
    return errorResponse("teamId or team is required — add a team in the Accounts tab", 400, origin);
  }

  // ── Rate limits (KV-backed) ──

  // Fetch per-user platform tokens first (needed for direct adapter fallback)
  let userTokens: PlatformToken[] = [];
  if (env.SUPABASE_SECRET_KEY) {
    try {
      userTokens = await fetchUserTokens(user.sub, env.SUPABASE_SECRET_KEY, env.TOKEN_ENCRYPTION_KEY);
    } catch (e: any) {
      console.error("[post] fetchUserTokens failed", e?.message || e);
    }
  }

  if (env.RATE_LIMITS) {
    const now = new Date();
    const dateStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,"0")}-${String(now.getUTCDate()).padStart(2,"0")}`;
    const monthStr = dateStr.slice(0, 7); // "YYYY-MM"

    // 1. Per-minute: 30 posts/min
    const minKey = `rate:min:${user.sub}`;
    const minCount = parseInt((await env.RATE_LIMITS.get(minKey)) ?? "0");
    if (minCount >= 30) {
      return errorResponse("Rate limit exceeded. Max 30 posts per minute.", 429, origin);
    }
    await env.RATE_LIMITS.put(minKey, String(minCount + 1), { expirationTtl: 60 });

    // 2. Per-day: 50 posts/day (prevents one user draining Bundle quota in a day)
    const dayKey = `rate:day:${dateStr}:${user.sub}`;
    const dayCount = parseInt((await env.RATE_LIMITS.get(dayKey)) ?? "0");
    if (dayCount >= 50) {
      return errorResponse("Daily post limit reached (50/day). Try again tomorrow.", 429, origin);
    }

    // 3. Per-platform monthly: 300 posts/platform/month (prevents bot attacks on one platform)
    // Direct X credentials bypass the monthly cap (they don't consume Bundle quota).
    for (const platform of body.platforms) {
      if (platform === "x" && hasDirectXCreds(env, userTokens)) continue;
      const platMonthKey = `rate:plat:${monthStr}:${platform}:${user.sub}`;
      const platCount = parseInt((await env.RATE_LIMITS.get(platMonthKey)) ?? "0");
      if (platCount >= 300) {
        return errorResponse(`${platform} monthly limit reached (300 posts/mo).`, 429, origin);
      }
    }
  }

  // Post to each platform in parallel. Bundle-first (Bundle holds the platform
  // API keys), falling back to direct adapters when Bundle isn't configured or
  // a platform post fails. When direct credentials exist (e.g. own X keys), we
  // prefer them so we can migrate off Bundle gradually.
  const bundleConfigured = Boolean(env.SOCIAL_API_PROVIDER_KEY && env.SUPABASE_SECRET_KEY);
  let bundleTeamId: string | null = null;
  if (bundleConfigured) {
    try {
      bundleTeamId = await resolveTeamId(user.sub, body.teamId, body.team, env);
    } catch (e: any) {
      console.error("[post] resolveTeamId failed", e?.message || e);
    }
  }

  const results: PlatformPostResult[] = await Promise.all(
    body.platforms.map(async (platform) => {
      try {
      const mediaError = validateMediaForPlatform(platform, media);
      if (mediaError) return { platform, success: false, error: mediaError };
      if (!text && TEXT_REQUIRED_PLATFORMS[platform]) {
        return { platform, success: false, error: `${TEXT_REQUIRED_PLATFORMS[platform]} requires text content.` };
      }

      // Pre-flight: X posts cost real money. Check the user's own credit balance
      // against Bundle's quoted fee BEFORE sending, so we never push them negative
      // (other platforms are unaffected).
      if (platform === "x" && bundleConfigured && bundleTeamId) {
        const q = await quoteXFee(bundleTeamId, text, env);
        if (q && q.micros > 0) {
          const bal = await getUserBalanceMicros(user.sub, env);
          if (bal < q.micros) {
            return {
              platform,
              success: false,
              error: `Insufficient X credit - top up in the X fees tab (needs ~$${(q.micros / 1e6).toFixed(3)}). Other platforms still post.`,
            };
          }
        }
      }

      // Bluesky posts should use the Bundle-connected account when Bundle is
      // configured. A stale direct app-password token must not hijack posting
      // and fail with a confusing 401. The direct adapter only applies when
      // Bundle isn't set up at all.
      // Direct adapters currently publish one media item (except X, which will
      // get multi-image support with the X migration). Carousels/multi-photo go
      // through Bundle so every slide is included.
      const directSupportsMedia = media.length <= 1;
      const preferDirect =
        !bundleConfigured || (platform === "bluesky" ? false : hasDirectCreds(platform, env, userTokens) && directSupportsMedia);

      if (preferDirect) {
        return { ...(await postToPlatform(platform, text, env, mediaIds, body.replyTo, userTokens)), via: "direct" as const };
      }

      if (!bundleTeamId) {
        return {
          platform,
          success: false,
          error: "Couldn't set up your posting team (posting limit reached — try again or upgrade).",
        };
      }

      const providerResult = await postViaProvider(platform, text, env, media, bundleTeamId, body.instagramImageFit, body.platformTargets, body.titles, body.platformOptions, body.firstComment);
      if (providerResult.success) return { ...providerResult, via: "bundle" as const };

      // Only fall back to a direct adapter when one is actually configured;
      // otherwise surface the real Bundle error instead of a misleading
      // "X not connected". (Bluesky skips this fallback when Bundle is set up.)
      if (platform !== "bluesky" && directSupportsMedia && hasDirectCreds(platform, env, userTokens)) {
        return { ...(await postToPlatform(platform, text, env, mediaIds, body.replyTo, userTokens)), via: "direct" as const };
      }
      return { ...providerResult, via: "bundle" as const };
      } catch (e: any) {
        console.error("[post] platform failed", platform, e?.message || e);
        return { platform, success: false, error: e?.message || "Posting failed" };
      }
    })
  );

  // Increment daily + per-platform monthly counters
  if (env.RATE_LIMITS) {
    const now = new Date();
    const dateStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,"0")}-${String(now.getUTCDate()).padStart(2,"0")}`;
    const monthStr = dateStr.slice(0, 7);

    // Daily counter
    const dayKey = `rate:day:${dateStr}:${user.sub}`;
    const dayCur = parseInt((await env.RATE_LIMITS.get(dayKey)) ?? "0");
    await env.RATE_LIMITS.put(dayKey, String(dayCur + 1), { expirationTtl: 86400 });

    // Per-platform monthly counters
    for (const platform of body.platforms) {
      if (platform === "x" && hasDirectXCreds(env, userTokens)) continue;
      const platMonthKey = `rate:plat:${monthStr}:${platform}:${user.sub}`;
      const platCur = parseInt((await env.RATE_LIMITS.get(platMonthKey)) ?? "0");
      await env.RATE_LIMITS.put(platMonthKey, String(platCur + 1), { expirationTtl: 60 * 86400 });
    }
  }

  const postId = crypto.randomUUID();
  await persistPostHistory(env, user.sub, postId, text, mediaIds, results);

  // Record X metered fee (best-effort) for successful X posts. Bundle's quote is
  // authoritative; our has_link heuristic remains in the ledger for auditing.
  if (results.some((r) => r.platform === "x" && r.success)) {
    const q = bundleTeamId ? await quoteXFee(bundleTeamId, text, env) : null;
    await recordXFee(user.sub, postId, detectHasLink(text), env, q?.micros, q ? (q.withUrl ? "WITH_URL" : "CREATE") : undefined);
  }

  const response: PostResponse = {
    id: postId,
    results,
    postedAt: new Date().toISOString(),
  };

  return json(response, 200, headers);
}

/**
 * Persist a published post to the posts table (status "posted").
 * Best-effort: only runs with a service role key, and never fails the post.
 */
async function persistPostHistory(
  env: Env,
  userId: string,
  postId: string,
  text: string,
  mediaUrls: string[] | undefined,
  results: PlatformPostResult[]
): Promise<void> {
  if (!env.SUPABASE_SECRET_KEY) return;
  const supabaseUrl = env.SUPABASE_URL || SUPABASE_URL;
  try {
    await fetch(`${supabaseUrl}/rest/v1/post_posts`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SECRET_KEY!,
        Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: postId,
        user_id: userId,
        status: "posted",
        text,
        media_urls: mediaUrls || [],
        platforms: results.map((r) => r.platform),
        results,
        has_link: detectHasLink(text),
        posted_at: new Date().toISOString(),
      }),
    });
  } catch {
    // History persistence is best-effort; don't fail the post.
  }
}

/**
 * Route a post to the correct platform handler.
 */
async function postToPlatform(
  platform: Platform,
  text: string,
  env: Env,
  mediaUrls?: string[],
  replyTo?: string,
  userTokens?: PlatformToken[]
): Promise<PlatformPostResult> {
  // Try per-user token first, fall back to env vars
  const token = userTokens ? findToken(userTokens, platform) : null;

  switch (platform) {
    case "bluesky": {
      const handle = token?.platform_handle || env.BLUESKY_HANDLE;
      const password = token?.access_token || env.BLUESKY_PASSWORD;
      if (!handle || !password) return { platform, success: false, error: "Bluesky not connected" };
      return postToBluesky(text, handle, password, mediaUrls);
    }
    case "linkedin": {
      const accessToken = token?.access_token || env.LINKEDIN_ACCESS_TOKEN;
      const author = token?.platform_user_id || env.LINKEDIN_AUTHOR;
      if (!accessToken || !author) return { platform, success: false, error: "LinkedIn not connected" };
      return postToLinkedIn(text, accessToken, author);
    }
    case "facebook": {
      const accessToken = token?.access_token || env.FACEBOOK_ACCESS_TOKEN;
      const pageId = (token?.metadata as any)?.page_id || env.FACEBOOK_PAGE_ID;
      if (!accessToken || !pageId) return { platform, success: false, error: "Facebook not connected" };
      return postToFacebook(text, accessToken, pageId);
    }
    case "instagram": {
      const accessToken = token?.access_token || env.INSTAGRAM_ACCESS_TOKEN;
      const igUserId = (token?.metadata as any)?.ig_user_id || env.INSTAGRAM_USER_ID;
      if (!accessToken || !igUserId) return { platform, success: false, error: "Instagram not connected" };
      return postToInstagram(text, accessToken, igUserId, mediaUrls);
    }
    case "tiktok": {
      const accessToken = token?.access_token || env.TIKTOK_ACCESS_TOKEN;
      const openId = token?.platform_user_id || env.TIKTOK_OPEN_ID;
      if (!accessToken || !openId) return { platform, success: false, error: "TikTok not connected" };
      return postToTikTok(text, accessToken, openId, mediaUrls);
    }
    case "threads": {
      const accessToken = token?.access_token || env.THREADS_ACCESS_TOKEN;
      const userId = (token?.metadata as any)?.threads_user_id || env.THREADS_USER_ID;
      if (!accessToken || !userId) return { platform, success: false, error: "Threads not connected" };
      return postToThreads(text, accessToken, userId, mediaUrls);
    }
    case "x": {
      // Direct X via own OAuth 1.0a keys (env vars or per-user BYOK metadata).
      const consumerKey = (token?.metadata as any)?.consumer_key || env.X_CONSUMER_KEY;
      const consumerSecret = (token?.metadata as any)?.consumer_secret || env.X_CONSUMER_KEY_SECRET;
      const accessToken = token?.access_token || env.X_ACCESS_TOKEN;
      const accessSecret = (token?.metadata as any)?.access_secret || env.X_ACCESS_TOKEN_SECRET;
      if (!consumerKey || !consumerSecret || !accessToken || !accessSecret)
        return { platform, success: false, error: "X not configured — OAuth 1.0a keys required (env vars or BYOK)" };
      return postToX(text, consumerKey, consumerSecret, accessToken, accessSecret, replyTo);
    }

    default:
      return { platform, success: false, error: `Unknown platform: ${platform}` };
  }
}

/**
 * Extract a permalink from a Bundle post/externalData payload.
 */
function extractBundlePostUrl(data: any, bsPlatform: string): string | undefined {
  const ext = data?.externalData?.[bsPlatform] || data?.externalData || {};
  if (!ext || typeof ext !== "object") return undefined;
  const candidates = [ext.permalink, ext.postUrl, ext.url, ext.link, ext.statusUrl];
  for (const c of candidates) if (typeof c === "string" && c) return c;
  if (bsPlatform === "TWITTER") {
    const id = ext.id || ext.tweetId || ext.postId;
    if (typeof id === "string" && id) return `https://x.com/i/status/${id}`;
  }
  return undefined;
}

/**
 * Extract the platform's native post id from Bundle's externalData, so we can
 * correlate our stored post with the platform (and pull deeper analytics later).
 */
function extractBundleExternalId(data: any, bsPlatform: string): string | undefined {
  const ext = data?.externalData?.[bsPlatform] || data?.externalData || {};
  if (!ext || typeof ext !== "object") return undefined;
  const candidates = [ext.externalId, ext.external_id, ext.id, ext.postId, ext.tweetId, ext.nativeId];
  for (const c of candidates) if (typeof c === "string" && c) return c;
  return undefined;
}

/**
 * Post via Bundle.social as fallback when direct platform keys aren't available.
 * Maps our platform names to Bundle.social's platform format.
 */
async function postViaProvider(
  platform: Platform,
  text: string,
  env: Env,
  media: MediaRef[],
  teamId: string,
  instagramImageFit?: "fit" | "crop",
  platformTargets?: Record<string, string>,
  titles?: Record<string, string>,
  platformOptions?: Record<string, Record<string, unknown>>,
  firstComment?: string
): Promise<PlatformPostResult> {
  if (!env.SOCIAL_API_PROVIDER_KEY || !teamId) {
    return { platform, success: false, error: "Posting is not configured yet" };
  }

  // Map our platform names to Bundle.social's ALL CAPS format
  const platformMap: Record<string, string> = {
    bluesky: "BLUESKY", x: "TWITTER", linkedin: "LINKEDIN",
    facebook: "FACEBOOK", instagram: "INSTAGRAM", threads: "THREADS",
    tiktok: "TIKTOK", youtube: "YOUTUBE",
    reddit: "REDDIT", pinterest: "PINTEREST", slack: "SLACK",
    discord: "DISCORD", google_business: "GOOGLE_BUSINESS",
  };
  const bsPlatform = platformMap[platform] || platform.toUpperCase();

  const uploadIds = media.map((m) => m.uploadId);
  const kinds = media.map(mediaKind);

  let platformData: Record<string, any> = {
    text,
    ...(uploadIds.length ? { uploadIds } : {}),
  };

  if (platform === "instagram" && media.length) {
    // Instagram feed posts support a single item or 1-10 carousel items.
    // Keep the multi-item payload minimal (`uploadIds` only) — Bundle builds the
    // carousel from that list. `carouselItems` is optional per-slide metadata
    // (alt text/tags) and is only sent when we actually have some.
    platformData.type = "POST";
    if (media.length === 1) {
      if (media[0]?.altText) platformData.altText = media[0].altText;
      // Auto-fit/crop applies to single-image feed posts. Applying it to
      // carousel slides can make Bundle fail container creation.
      if (!kinds.includes("video")) {
        const fit = instagramImageFit ?? "fit";
        platformData.autoFitImage = fit === "fit";
        platformData.autoCropImage = fit === "crop";
      }
    } else if (media.some((m) => m.altText)) {
      platformData.carouselItems = media.map((m) => ({
        uploadId: m.uploadId,
        ...(m.altText ? { altText: m.altText } : {}),
      }));
    }
  }

  if (platform === "tiktok" && media.length) {
    // TikTok Photo Mode is a separate post type and requires an explicit
    // privacy value. One video stays VIDEO; 2+ images (or an explicitly typed
    // image) become an IMAGE carousel.
    const isPhoto = !kinds.includes("video") && (media.length > 1 || kinds[0] === "image");
    platformData.type = isPhoto ? "IMAGE" : "VIDEO";
    platformData.privacy = "PUBLIC_TO_EVERYONE";
    if (isPhoto) platformData.photoCoverIndex = 0;
  }

  if (platform === "facebook" && media.length) {
    // Multi-photo Page posts use the same uploadIds array; the type is POST.
    platformData.type = "POST";
  }

  // Platforms that require a target on every post (channel/board/subreddit).
  const target = platformTargets?.[platform];
  if (target) {
    if (platform === "discord" || platform === "slack") platformData.channelId = target;
    if (platform === "pinterest") platformData.boardName = target;
    if (platform === "reddit") platformData.sr = target;
  }

  // Optional per-platform title (YouTube requires one for videos).
  const title = titles?.[platform];
  if (title) platformData.title = title;

  // Optional per-platform flags (AI disclosure, branded content, etc.) passed
  // straight through to Bundle's data.<PLATFORM> object.
  const extra = platformOptions?.[platform];
  if (extra && typeof extra === "object") {
    platformData = { ...platformData, ...extra };
  }

  try {
    const now = new Date().toISOString();
    const postPayload: Record<string, any> = {
      teamId,
      title: text.slice(0, 80) || "Post",
      status: "SCHEDULED",
      postDate: now,
      socialAccountTypes: [bsPlatform],
      data: {
        [bsPlatform]: platformData,
      },
    };
    // Bundle supports a "first comment" as a top-level field on the post itself
    // (an object keyed by platform) — it posts right after the post publishes.
    if (firstComment && FIRST_COMMENT_PLATFORMS.has(platform)) {
      postPayload.firstComment = { [bsPlatform]: firstComment };
    }
    const res = await fetch("https://api.bundle.social/api/v1/post", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.SOCIAL_API_PROVIDER_KEY,
      },
      body: JSON.stringify(postPayload),
    });

    const data = (await res.json()) as any;
    if (!res.ok) {
      console.error(`Bundle post failed (${platform}):`, res.status, JSON.stringify(data));
      const issues = Array.isArray(data?.issues)
        ? data.issues.map((i: any) => i.message).filter(Boolean).join("; ")
        : "";
      const verbose = data?.errorsVerbose?.[bsPlatform] || data?.errorsVerbose;
      const verboseMessage = typeof verbose === "string"
        ? verbose
        : verbose && typeof verbose === "object"
          ? (verbose.errorMessage || verbose.userFacingMessage || "")
          : "";
      const errorList = Array.isArray(data?.errors)
        ? data.errors.map((e: any) => (typeof e === "string" ? e : e?.message || "")).filter(Boolean).join("; ")
        : "";
      const details = [issues, verboseMessage, errorList].filter(Boolean).join("; ");
      const reason = `${data.message || "Publishing error"}${details ? ` — ${details}` : ""}`;
      return { platform, success: false, error: reason.slice(0, 500) };
    }

    console.log(`Bundle post success (${platform}):`, JSON.stringify({ id: data.id, externalData: data.externalData }));

    // Extract a permalink from externalData (often empty right after create)
    let postUrl = extractBundlePostUrl(data, bsPlatform);
    // Capture the platform's native post id too (may be empty right after create).
    let externalId = extractBundleExternalId(data, bsPlatform);

    // Best-effort: fetch the full post to get the published permalink.
    if (!postUrl || !externalId) {
      try {
        const detailRes = await fetch(`https://api.bundle.social/api/v1/post/${data.id}`, {
          headers: { "x-api-key": env.SOCIAL_API_PROVIDER_KEY },
        });
        if (detailRes.ok) {
          const detail = (await detailRes.json()) as any;
          console.log(`Bundle post detail (${platform}):`, JSON.stringify({ id: data.id, externalData: detail.externalData }));
          postUrl = postUrl || extractBundlePostUrl(detail, bsPlatform);
          externalId = externalId || extractBundleExternalId(detail, bsPlatform);
        } else {
          console.error(`Bundle post detail failed (${platform}):`, detailRes.status);
        }
      } catch (e) {
        console.error(`Bundle post detail exception (${platform}):`, e instanceof Error ? e.message : String(e));
      }
    }

    return {
      platform,
      success: true,
      postId: data.id,
      externalId,
      postUrl,
    };
  } catch (e) {
    console.error(`Bundle post exception (${platform}):`, e instanceof Error ? e.message : String(e));
    return { platform, success: false, error: e instanceof Error ? e.message : "Publishing error" };
  }
}

/**
 * POST /api/schedule — Schedule a post for future publishing.
 */
async function handleSchedule(
  request: Request,
  env: Env,
  origin: string,
  headers: Record<string, string>
): Promise<Response> {
  const user = await authenticateRequest(request, env);
  if (!user) return errorResponse("Unauthorized", 401, origin);

  let body: { platforms: Platform[]; text: string; scheduledAt: string; mediaUrls?: string[]; media?: MediaRef[]; teamId?: string; team?: string; platformTargets?: Record<string, string>; firstComment?: string };
  try { body = (await request.json()) as any; } catch { return errorResponse("Invalid JSON", 400, origin); }

  if (!body.platforms?.length) return errorResponse("At least one platform required", 400, origin);
  if (!body.scheduledAt) return errorResponse("scheduledAt (ISO timestamp) required", 400, origin);
  if (!body.teamId && !body.team) return errorResponse("teamId or team is required — add a team in the Accounts tab", 400, origin);

  const text = body.text?.trim() || "";
  const media = normalizeMediaRefs(body.mediaUrls, body.media);
  const mediaIds = media.map((m) => m.uploadId);

  if (!text && !media.length) return errorResponse("Text or media content is required", 400, origin);
  for (const platform of body.platforms) {
    const mediaError = validateMediaForPlatform(platform, media);
    if (mediaError) return errorResponse(mediaError, 400, origin);
    if (!text && TEXT_REQUIRED_PLATFORMS[platform]) {
      return errorResponse(`${TEXT_REQUIRED_PLATFORMS[platform]} requires text content.`, 400, origin);
    }
  }

  const scheduledAt = new Date(body.scheduledAt);
  if (isNaN(scheduledAt.getTime())) return errorResponse("Invalid scheduledAt date", 400, origin);
  if (scheduledAt <= new Date()) return errorResponse("scheduledAt must be in the future", 400, origin);

  if (!env.SUPABASE_SECRET_KEY) {
    return errorResponse("Scheduling requires SUPABASE_SECRET_KEY", 501, origin);
  }

  const bundleTeamId = env.SOCIAL_API_PROVIDER_KEY
    ? await resolveTeamId(user.sub, body.teamId, body.team, env)
    : null;

  try {
    const res = await fetch(`${env.SUPABASE_URL || "https://jstojewashwoswsskwjk.supabase.co"}/rest/v1/post_posts`, {
      method: "POST",
      headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ user_id: user.sub, status: "scheduled", text, platforms: body.platforms, media_urls: mediaIds, has_link: detectHasLink(text), bundle_team_id: bundleTeamId, scheduled_at: body.scheduledAt, platform_targets: { ...(body.platformTargets || {}), ...((body as any).titles ? { __titles: (body as any).titles } : {}), ...((body as any).platformOptions ? { __platformOptions: (body as any).platformOptions } : {}), ...(body.firstComment ? { __firstComment: body.firstComment } : {}), ...(media.length ? { __media: media } : {}) } }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("Schedule insert failed:", res.status, errText.slice(0, 500));
      return errorResponse(`Failed to schedule post: ${errText.slice(0, 200)}`, 500, origin);
    }
    const [scheduled] = (await res.json()) as any[];
    return json({ id: scheduled.id, scheduledAt: scheduled.scheduled_at, platforms: scheduled.platforms }, 201, headers);
  } catch { return errorResponse("Scheduling failed", 500, origin); }
}

/**
 * GET /api/scheduled — List user's scheduled posts.
 */
async function handleScheduled(
  request: Request,
  env: Env,
  origin: string,
  headers: Record<string, string>
): Promise<Response> {
  const user = await authenticateRequest(request, env);
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SUPABASE_SECRET_KEY) return json([], 200, headers);

  try {
    const res = await fetch(
      `${env.SUPABASE_URL || "https://jstojewashwoswsskwjk.supabase.co"}/rest/v1/post_posts?user_id=eq.${user.sub}&status=eq.scheduled&order=scheduled_at.asc`,
      { headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` } }
    );
    const posts = (await res.json()) as any[];
    return json(posts.map((p: any) => ({ id: p.id, text: p.text, platforms: p.platforms, scheduledAt: p.scheduled_at, createdAt: p.created_at, mediaUrls: p.media_urls || [] })), 200, headers);
  } catch { return json([], 200, headers); }
}

/**
 * DELETE /api/scheduled/:id — Cancel a scheduled post.
 */
async function handleCancelSchedule(
  request: Request,
  env: Env,
  id: string,
  origin: string,
  headers: Record<string, string>
): Promise<Response> {
  const user = await authenticateRequest(request, env);
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SUPABASE_SECRET_KEY) return errorResponse("Not configured", 501, origin);

  try {
    await fetch(`${env.SUPABASE_URL || "https://jstojewashwoswsskwjk.supabase.co"}/rest/v1/post_posts?id=eq.${id}&user_id=eq.${user.sub}`, {
      method: "DELETE", headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` },
    });
    return json({ deleted: true }, 200, headers);
  } catch { return errorResponse("Cancel failed", 500, origin); }
}

// ── X-fee credits (Stripe top-ups) ────────────────────────────────────────────
// Amounts are integer microdollars (1/1,000,000 USD) so the $0.015 plain X fee
// is exact. X metered pricing: $0.015 plain/media, $0.20 for a post with a link.
const X_PLAIN_FEE_MICROS = 15_000;   // $0.015
const X_LINK_FEE_MICROS = 200_000;   // $0.20

async function recordXFee(
  userId: string,
  postId: string,
  hasLink: boolean,
  env: Env,
  quotedMicros?: number,
  bundleAction?: string
) {
  if (!env.SUPABASE_SECRET_KEY) return;
  const supabaseUrl = env.SUPABASE_URL || SUPABASE_URL;
  const authHeaders = { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` };
  try {
    // Bundle's ruling is authoritative when available; our constants are the fallback.
    const micros = quotedMicros && quotedMicros > 0 ? -quotedMicros : (hasLink ? -X_LINK_FEE_MICROS : -X_PLAIN_FEE_MICROS);
    const note = bundleAction ? `X post (Bundle: ${bundleAction})` : (hasLink ? "X post with link" : "X post");
    await fetch(`${supabaseUrl}/rest/v1/post_credits`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        amount_micros: micros,
        kind: "x_fee",
        reference_id: postId,
        has_link: hasLink,
        note,
      }),
    });
  } catch (e) {
    console.error("recordXFee failed:", e instanceof Error ? e.message : String(e));
  }
}

/**
 * Ask Bundle for the authoritative X posting cost. Bundle's quote endpoint prices
 * the action you request — it does NOT scan the text to detect links — so we pick
 * the action from our link detection and let Bundle set the exact amount.
 * Returns the fee in microdollars + whether it was priced as a URL post, or null on failure.
 */
async function quoteXFee(teamId: string, text: string, env: Env): Promise<{ micros: number; withUrl: boolean } | null> {
  if (!env.SOCIAL_API_PROVIDER_KEY) return null;
  const withUrl = detectHasLink(text);
  const action = withUrl ? "TWITTER_CONTENT_CREATE_WITH_URL" : "TWITTER_CONTENT_CREATE";
  try {
    const res = await fetch("https://api.bundle.social/api/v1/billing/billable-usage/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": env.SOCIAL_API_PROVIDER_KEY },
      body: JSON.stringify({ teamId, text, action }),
    });
    if (!res.ok) {
      console.error("Bundle X quote failed:", res.status);
      return null;
    }
    const data = (await res.json()) as any;
    const line = (data?.lines || []).find(
      (l: any) => l.action === "TWITTER_CONTENT_CREATE" || l.action === "TWITTER_CONTENT_CREATE_WITH_URL"
    );
    if (!line) return null;
    const micros = Number(line.amountMicros) || Number(line.unitAmountMicros) || 0;
    return { micros, withUrl };
  } catch (e) {
    console.error("quoteXFee exception:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** Sum the user's credit ledger (microdollars) — our internal balance source of truth. */
async function getUserBalanceMicros(userId: string, env: Env): Promise<number> {
  if (!env.SUPABASE_SECRET_KEY) return 0;
  const supabaseUrl = env.SUPABASE_URL || SUPABASE_URL;
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/post_credits?user_id=eq.${userId}&select=amount_micros`, {
      headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` },
    });
    if (!res.ok) return 0;
    const rows = (await res.json()) as any[];
    return rows.reduce((s, r) => s + (Number(r.amount_micros) || 0), 0);
  } catch { return 0; }
}

/**
 * GET /api/credits — balance + recent transactions.
 */
async function handleGetCredits(
  request: Request, env: Env, origin: string, headers: Record<string, string>
): Promise<Response> {
  const user = await authenticateRequest(request, env);
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SUPABASE_SECRET_KEY) return json({ balanceMicros: 0, transactions: [] }, 200, headers);

  const supabaseUrl = env.SUPABASE_URL || SUPABASE_URL;
  const authHeaders = { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` };
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/post_credits?user_id=eq.${user.sub}&select=amount_micros,kind,reference_id,has_link,note,created_at&order=created_at.desc`,
      { headers: authHeaders }
    );
    if (!res.ok) return json({ balanceMicros: 0, transactions: [] }, 200, headers);
    const rows = (await res.json()) as any[];
    const balanceMicros = rows.reduce((s, r) => s + (Number(r.amount_micros) || 0), 0);
    const breakdown = { topupsMicros: 0, feesMicros: 0, taxMicros: 0, xFeesMicros: 0 };
    for (const r of rows) {
      const m = Number(r.amount_micros) || 0;
      if (r.kind === "topup") breakdown.topupsMicros += m;
      else if (r.kind === "stripe_fee") breakdown.feesMicros += m;
      else if (r.kind === "tax") breakdown.taxMicros += m;
      else if (r.kind === "x_fee") breakdown.xFeesMicros += m;
    }
    return json({ balanceMicros, breakdown, transactions: rows.slice(0, 100) }, 200, headers);
  } catch { return json({ balanceMicros: 0, transactions: [] }, 200, headers); }
}

/**
 * POST /api/credits/topup — create a Stripe Checkout session. Body: { amountCents }.
 * Returns { url } to redirect the user to. On success the webhook credits the ledger.
 */
async function handleTopUp(
  request: Request, env: Env, origin: string, headers: Record<string, string>
): Promise<Response> {
  const user = await authenticateRequest(request, env);
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.STRIPE_SECRET_KEY) return errorResponse("Stripe is not configured yet", 501, origin);

  let body: { amountCents?: number };
  try { body = (await request.json()) as any; } catch { return errorResponse("Invalid JSON", 400, origin); }
  const cents = Math.round(Number(body.amountCents));
  if (!Number.isFinite(cents) || cents < 100 || cents > 1_000_000) {
    return errorResponse("amountCents must be between 100 and 1,000,000", 400, origin);
  }

  // Stripe needs absolute return URLs; fall back to the app origin for API-key calls
  // that don't send an Origin header.
  const appBase = /^https?:\/\//.test(origin) ? origin : "https://post.freesurf.tools";

  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        mode: "payment",
        success_url: `${appBase}/?tab=fees&success=1`,
        cancel_url: `${appBase}/?tab=fees&cancelled=1`,
        client_reference_id: user.sub,
        "metadata[user_id]": user.sub,
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][unit_amount]": String(cents),
        "line_items[0][price_data][product_data][name]": "FreeSurf Post credits",
        "line_items[0][price_data][product_data][tax_code]": "txcd_10000000",
        "line_items[0][price_data][tax_behavior]": "exclusive",
        "line_items[0][quantity]": "1",
        "expand[0]": "payment_intent.charges.data.balance_transaction",
      }).toString(),
    });
    const data = (await res.json()) as any;
    if (!res.ok) return errorResponse(data?.error?.message || "Stripe error", 502, origin);
    return json({ url: data.url, sessionId: data.id }, 200, headers);
  } catch (e) {
    console.error("Top-up exception:", e instanceof Error ? e.message : String(e));
    return errorResponse("Stripe error", 502, origin);
  }
}

/**
 * POST /api/credits/webhook — Stripe webhook. Credits the ledger on
 * checkout.session.completed.
 */
async function handleStripeWebhook(
  request: Request, env: Env, origin: string, headers: Record<string, string>
): Promise<Response> {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return errorResponse("Stripe not configured", 501, origin);
  if (!env.SUPABASE_SECRET_KEY) return errorResponse("Not configured", 501, origin);

  const raw = await request.text();
  const sig = request.headers.get("stripe-signature") || "";
  const parts: Record<string, string> = {};
  for (const p of sig.split(",")) {
    const i = p.indexOf("=");
    if (i > 0) parts[p.slice(0, i)] = p.slice(i + 1);
  }
  const ts = parts.t, expected = parts.v1;

  // HMAC-SHA256 verify: signature over `${timestamp}.${payload}`
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${ts}.${raw}`));
  const actual = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (!expected || actual !== expected) return errorResponse("Invalid signature", 401, origin);
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return errorResponse("Stale event", 401, origin);

  const evt = JSON.parse(raw) as any;
  if (evt?.type === "checkout.session.completed") {
    const s = evt.data?.object || {};
    const uid = s.metadata?.user_id || s.client_reference_id;
    const amountCents = Math.round(Number(s.amount_total) || 0);
    const taxCents = Math.round(Number(s?.total_details?.amount_tax) || 0);
    // Stripe adds required sales tax on top (tax_behavior: exclusive) and remits
    // it directly, so credit only the pre-tax amount we received for credits.
    const grossCents = Math.max(0, amountCents - taxCents);
    if (uid && grossCents > 0) {
      // Fetch the actual Stripe fee. Webhook payloads don't carry expanded
      // sub-objects, so read it from the PaymentIntent (id present on the event).
      // Falls back to the managed payments estimate (6.5% + $0.35) only if we can't.
      let feeCents: number | null = null;
      try {
        const piId = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;
        if (piId) {
          const piRes = await fetch(
            `https://api.stripe.com/v1/payment_intents/${piId}?expand[]=charges.data.balance_transaction`,
            { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } }
          );
          if (piRes.ok) {
            const pi = (await piRes.json()) as any;
            const bt = pi?.charges?.data?.[0]?.balance_transaction;
            if (bt && Number.isFinite(Number(bt.fee))) feeCents = Math.round(Number(bt.fee));
          } else {
            console.error("Stripe PI fetch failed:", piRes.status);
          }
        }
      } catch (e) {
        console.error("Stripe fee fetch exception:", e instanceof Error ? e.message : String(e));
      }
      if (feeCents === null) {
        feeCents = Math.round(grossCents * 0.065 + 35);
        console.error("Stripe fee unavailable, used estimate for session", s.id);
      }

      const supabaseUrl = env.SUPABASE_URL || SUPABASE_URL;
      const authHeaders = { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` };
      // Credit the gross top-up…
      await fetch(`${supabaseUrl}/rest/v1/post_credits`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: uid,
          amount_micros: grossCents * 10_000,
          kind: "topup",
          reference_id: s.id,
          note: "Stripe top-up",
        }),
      });
      // …then record the Stripe fee so the balance reflects the net amount.
      if (feeCents > 0) {
        await fetch(`${supabaseUrl}/rest/v1/post_credits`, {
          method: "POST",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: uid,
            amount_micros: -feeCents * 10_000,
            kind: "stripe_fee",
            reference_id: s.id,
            note: "Stripe processing fee",
          }),
        });
      }
    }
  }
  return json({ received: true }, 200, headers);
}

/**
 * GET /api/replies/:platform/:postId
 */
async function handleReplies(
  request: Request, env: Env, platform: Platform, postId: string, origin: string, headers: Record<string, string>
): Promise<Response> {
  const user = await authenticateRequest(request, env);
  if (!user) return errorResponse("Unauthorized", 401, origin);

  if (platform === "bluesky" && env.BLUESKY_HANDLE && env.BLUESKY_PASSWORD) {
    try {
      const session = await createBlueskySession(env.BLUESKY_HANDLE, env.BLUESKY_PASSWORD);
      const uri = `at://${session.did}/app.bsky.feed.post/${postId}`;
      const res = await fetch(`https://bsky.social/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=1`, {
        headers: { Authorization: `Bearer ${session.accessJwt}` },
      });
      const data = (await res.json()) as any;
      const replies = (data.thread?.replies ?? []).map((r: any) => ({
        id: r.post?.uri?.split("/").pop() || "", text: r.post?.record?.text || "",
        author: r.post?.author?.handle || "", createdAt: r.post?.record?.createdAt || "",
      }));
      return json(replies, 200, headers);
    } catch { return json([], 200, headers); }
  }

  // All other platforms: pull imported comments for the post from Bundle.
  const bsPlatform = bundlePlatform(platform);
  const teamId = await getOrCreateBundleTeam(user.sub, env);
  if (bsPlatform && teamId && env.SOCIAL_API_PROVIDER_KEY) {
    try {
      const res = await fetch(
        `https://api.bundle.social/api/v1/comment/import/comments?teamId=${teamId}&postId=${encodeURIComponent(postId)}`,
        { headers: { "x-api-key": env.SOCIAL_API_PROVIDER_KEY } }
      );
      if (res.ok) {
        const data = (await res.json()) as any;
        const list = Array.isArray(data) ? data : (data?.comments || []);
        const replies = list.map((c: any) => ({
          id: c.id || c.commentId || "",
          text: c.text || c.message || "",
          author: c.authorName || c.username || c.author?.username || c.author?.name || "",
          createdAt: c.createdAt || c.created_at || "",
        }));
        return json(replies, 200, headers);
      }
    } catch { /* fall through */ }
  }
  return json([], 200, headers);
}

/**
 * POST /api/reply — Reply to a post.
 */
async function handleReply(
  request: Request, env: Env, origin: string, headers: Record<string, string>
): Promise<Response> {
  const user = await authenticateRequest(request, env);
  if (!user) return errorResponse("Unauthorized", 401, origin);

  let body: { platform: Platform; postId: string; text: string; commentId?: string; internalCommentId?: string };
  try { body = (await request.json()) as any; } catch { return errorResponse("Invalid JSON", 400, origin); }
  if (!body.text?.trim()) return errorResponse("Text required", 400, origin);

  if (body.platform === "bluesky" && env.BLUESKY_HANDLE && env.BLUESKY_PASSWORD) {
    try {
      const session = await createBlueskySession(env.BLUESKY_HANDLE, env.BLUESKY_PASSWORD);
      const parentUri = `at://${session.did}/app.bsky.feed.post/${body.postId}`;
      const now = new Date().toISOString();
      const res = await fetch("https://bsky.social/xrpc/com.atproto.repo.createRecord", {
        method: "POST", headers: { Authorization: `Bearer ${session.accessJwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ repo: session.did, collection: "app.bsky.feed.post",
          record: { $type: "app.bsky.feed.post", text: body.text, createdAt: now,
            reply: { root: { uri: parentUri, cid: "" }, parent: { uri: parentUri, cid: "" } } } }),
      });
      const data = (await res.json()) as any;
      if (!res.ok) return errorResponse("Reply failed", 500, origin);
      return json({ id: data.uri?.split("/").pop(), platform: "bluesky" }, 201, headers);
    } catch { return errorResponse("Reply failed", 500, origin); }
  }

  // All other platforms: proxy to Bundle's comment create endpoint
  // (POST /api/v1/comment/). Contract per Bundle docs: internalPostId (or
  // importedPostId), socialAccountTypes[], data.{PLATFORM}.text, title, and
  // status SCHEDULED + postDate to publish immediately.
  const bsPlatform = bundlePlatform(body.platform);
  const teamId = await getOrCreateBundleTeam(user.sub, env);
  if (bsPlatform && teamId && env.SOCIAL_API_PROVIDER_KEY) {
    try {
      const now = new Date().toISOString();
      const payload: Record<string, unknown> = {
        teamId,
        title: body.text.slice(0, 80),
        text: body.text,
        status: "SCHEDULED",
        postDate: now,
        socialAccountTypes: [bsPlatform],
        data: { [bsPlatform]: { text: body.text } },
      };
      payload.internalPostId = body.postId;
      if (body.internalCommentId) payload.internalParentCommentId = body.internalCommentId;
      else if (body.commentId) payload.fetchedParentCommentId = body.commentId;

      const res = await fetch("https://api.bundle.social/api/v1/comment/", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": env.SOCIAL_API_PROVIDER_KEY },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as any;
      if (!res.ok) {
        const issues = Array.isArray(data?.issues)
          ? data.issues.map((i: any) => `${(i.path || []).join(".")}: ${i.message}`).join("; ")
          : "";
        console.error(`Bundle reply failed (${body.platform}):`, res.status, JSON.stringify(data));
        return errorResponse(issues || data?.message || "Reply failed", res.status || 502, origin);
      }
      return json({ id: data.id || "", platform: body.platform }, 200, headers);
    } catch (e) {
      console.error(`Bundle reply exception (${body.platform}):`, e instanceof Error ? e.message : String(e));
      return errorResponse("Reply failed", 502, origin);
    }
  }
  return errorResponse(`Replies not yet supported for ${body.platform}`, 501, origin);
}

async function createBlueskySession(handle: string, password: string) {
  const res = await fetch("https://bsky.social/xrpc/com.atproto.server.createSession", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: handle, password }),
  });
  if (!res.ok) throw new Error("Bluesky auth failed");
  return (await res.json()) as { accessJwt: string; did: string };
}

/** Map our platform names to Bundle.social ALL CAPS format */
/** Platforms Bundle supports a "first comment" for (a top-level field on the
 *  post payload). Pinterest and Google Business have no comment surface. */
const FIRST_COMMENT_PLATFORMS: Set<Platform> = new Set([
  "bluesky", "x", "linkedin", "facebook", "instagram", "threads",
  "tiktok", "youtube", "reddit", "discord", "slack",
]);

function bundlePlatform(key: string): string | null {
  const m: Record<string, string> = {
    bluesky: "BLUESKY", x: "TWITTER", linkedin: "LINKEDIN",
    facebook: "FACEBOOK", instagram: "INSTAGRAM", threads: "THREADS",
    tiktok: "TIKTOK", youtube: "YOUTUBE",
    reddit: "REDDIT", pinterest: "PINTEREST", slack: "SLACK",
    discord: "DISCORD", google_business: "GOOGLE_BUSINESS",
  };
  return m[key] || null;
}

/** Reverse of bundlePlatform: Bundle platform name → our key ("TWITTER" → "x"). */
function bundlePlatformToKey(platform: string): string {
  const m: Record<string, string> = {
    bluesky: "bluesky", twitter: "x", x: "x", linkedin: "linkedin",
    facebook: "facebook", instagram: "instagram", threads: "threads",
    tiktok: "tiktok", youtube: "youtube",
    reddit: "reddit", pinterest: "pinterest", slack: "slack",
    discord: "discord", google_business: "google_business",
  };
  const k = String(platform || "").toLowerCase();
  return m[k] || k;
}

/**
 * GET /api/metrics/:platform/:postId
 */
async function handleMetrics(
  request: Request,
  env: Env,
  platform: Platform,
  postId: string,
  origin: string,
  headers: Record<string, string>
): Promise<Response> {
  const user = await authenticateRequest(request, env);
  if (!user) return errorResponse("Unauthorized", 401, origin);

  const apiKey = env.SOCIAL_API_PROVIDER_KEY;
  if (!apiKey) return errorResponse("Not configured", 501, origin);

  const bsPlatform = bundlePlatform(platform);
  if (!bsPlatform) return errorResponse(`Unknown platform: ${platform}`, 400, origin);

  const num = (n: unknown): number => {
    const v = Number(n);
    return Number.isFinite(v) ? v : 0;
  };

  try {
    // Proxy Bundle's per-post analytics (the same live fetch the dashboard
    // refresh uses). Bundle holds the platform credentials, so no per-platform
    // tokens are needed here.
    const res = await fetch("https://api.bundle.social/api/v1/analytics/post/force", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ postId, platformType: bsPlatform }),
    });
    const data = (await res.json()) as any;

    if (!res.ok) {
      console.error(`Bundle metrics failed (${bsPlatform}):`, res.status, JSON.stringify(data));
      return errorResponse(`Metrics unavailable (${res.status})`, res.status || 502, origin);
    }

    // X per-post analytics reads are metered by Bundle ($0.005/read, POST_READ).
    if (platform === "x" && env.SUPABASE_SECRET_KEY) {
      const supabaseUrl = env.SUPABASE_URL || SUPABASE_URL;
      try {
        await fetch(`${supabaseUrl}/rest/v1/post_credits`, {
          method: "POST",
          headers: {
            apikey: env.SUPABASE_SECRET_KEY,
            Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: user.sub,
            amount_micros: -5_000,
            kind: "x_fee",
            reference_id: postId,
            has_link: false,
            note: "X analytics read (per post)",
          }),
        });
      } catch (e) {
        console.error("record X analytics read fee failed:", e instanceof Error ? e.message : String(e));
      }
    }

    return json(
      {
        platform,
        postId,
        impressions: num(data.impressions ?? data.impression_count),
        views: num(data.views ?? data.view_count ?? data.impressions),
        reach: num(data.impressionsUnique ?? data.impressions_unique),
        viewsUnique: num(data.viewsUnique ?? data.views_unique),
        likes: num(data.likes ?? data.likeCount ?? data.like_count),
        dislikes: num(data.dislikes ?? data.dislike_count),
        comments: num(data.comments ?? data.commentCount ?? data.comment_count),
        shares: num(
          data.shares ?? data.shareCount ?? data.share_count ?? data.reposts ?? data.retweet_count ?? data.retweets
        ),
        saves: num(data.saves ?? data.save_count ?? data.saved),
      },
      200,
      headers
    );
  } catch (e) {
    console.error("Bundle metrics exception:", e instanceof Error ? e.message : String(e));
    return errorResponse("Metrics unavailable", 502, origin);
  }
}

/**
 * Handle enhanced health check with system status
 */
async function handleHealthCheck(
  env: Env,
  origin: string
): Promise<Response> {
  const checks: Array<{ name: string; status: "healthy" | "degraded" | "unhealthy"; message?: string; response_time_ms: number }> = [];
  let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";

  // Check Cloudflare KV (rate limiting)
  const kvStart = Date.now();
  try {
    if (env.RATE_LIMITS) {
      const testKey = `health-check-${Date.now()}`;
      await env.RATE_LIMITS.put(testKey, "ok", { expirationTtl: 60 });
      await env.RATE_LIMITS.get(testKey);
      checks.push({
        name: "rate_limiter_kv",
        status: "healthy",
        response_time_ms: Date.now() - kvStart,
      });
    } else {
      checks.push({
        name: "rate_limiter_kv",
        status: "degraded",
        message: "KV not configured - rate limiting disabled",
        response_time_ms: 0,
      });
      overallStatus = "degraded";
    }
  } catch (error) {
    checks.push({
      name: "rate_limiter_kv",
      status: "unhealthy",
      message: error instanceof Error ? error.message : "Unknown error",
      response_time_ms: Date.now() - kvStart,
    });
    overallStatus = "unhealthy";
  }

  // Check Supabase connectivity
  const dbStart = Date.now();
  try {
    if (env.SUPABASE_SECRET_KEY) {
      const supabaseUrl = env.SUPABASE_URL || "https://jstojewashwoswsskwjk.supabase.co";
      const response = await fetch(`${supabaseUrl}/rest/v1/`, {
        method: "HEAD",
        headers: {
          apikey: env.SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
        },
      });

      if (response.ok) {
        checks.push({
          name: "supabase_database",
          status: "healthy",
          response_time_ms: Date.now() - dbStart,
        });
      } else {
        checks.push({
          name: "supabase_database",
          status: "unhealthy",
          message: `HTTP ${response.status}`,
          response_time_ms: Date.now() - dbStart,
        });
        overallStatus = "unhealthy";
      }
    } else {
      checks.push({
        name: "supabase_database",
        status: "degraded",
        message: "Service role key not configured - multi-user mode disabled",
        response_time_ms: 0,
      });
      overallStatus = "degraded";
    }
  } catch (error) {
    checks.push({
      name: "supabase_database",
      status: "unhealthy",
      message: error instanceof Error ? error.message : "Unknown error",
      response_time_ms: Date.now() - dbStart,
    });
    overallStatus = "unhealthy";
  }

  // Check platform configuration
  const platformCheck = {
    name: "platform_credentials" as const,
    status: "healthy" as "healthy" | "degraded" | "unhealthy",
    message: "" as string,
    response_time_ms: 0,
  };

  const configuredPlatforms: string[] = [];
  const missingPlatforms: string[] = [];

  if (env.BLUESKY_HANDLE && env.BLUESKY_PASSWORD) configuredPlatforms.push("bluesky");
  else missingPlatforms.push("bluesky");

  if (env.LINKEDIN_ACCESS_TOKEN && env.LINKEDIN_AUTHOR) configuredPlatforms.push("linkedin");
  else missingPlatforms.push("linkedin");

  if (env.FACEBOOK_ACCESS_TOKEN && env.FACEBOOK_PAGE_ID) configuredPlatforms.push("facebook");
  else missingPlatforms.push("facebook");

  if (env.INSTAGRAM_ACCESS_TOKEN && env.INSTAGRAM_USER_ID) configuredPlatforms.push("instagram");
  else missingPlatforms.push("instagram");

  if (env.TIKTOK_ACCESS_TOKEN && env.TIKTOK_OPEN_ID) configuredPlatforms.push("tiktok");
  else missingPlatforms.push("tiktok");

  if (env.THREADS_ACCESS_TOKEN && env.THREADS_USER_ID) configuredPlatforms.push("threads");
  else missingPlatforms.push("threads");

  if (env.X_CONSUMER_KEY && env.X_CONSUMER_KEY_SECRET && env.X_ACCESS_TOKEN && env.X_ACCESS_TOKEN_SECRET) {
    configuredPlatforms.push("x");
  } else {
    missingPlatforms.push("x");
  }

  platformCheck.message = `Configured: ${configuredPlatforms.join(", ") || "none"}${missingPlatforms.length ? ` | Missing: ${missingPlatforms.join(", ")}` : ""}`;
  platformCheck.response_time_ms = 0;

  if (configuredPlatforms.length === 0) {
    platformCheck.status = "degraded";
    overallStatus = "degraded";
  }

  checks.push(platformCheck);

  // Check encryption key
  const cryptoCheck = {
    name: "encryption" as const,
    status: "healthy" as "healthy" | "degraded" | "unhealthy",
    message: "" as string,
    response_time_ms: 0,
  };

  if (env.ENCRYPTION_KEY) {
    cryptoCheck.status = "healthy";
    cryptoCheck.message = "Encryption key configured";
  } else {
    cryptoCheck.status = "degraded";
    cryptoCheck.message = "Using default encryption key - not recommended for production";
    overallStatus = "degraded";
  }
  checks.push(cryptoCheck);

  // Get performance stats
  const { getPerformanceStats, trackPerformance } = await import("./logging");
  trackPerformance("/health", "GET", overallStatus === "healthy" ? 200 : 503, Date.now() - Date.now());
  const perfStats = getPerformanceStats();

  // Compile health check response
  const healthData = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: "0.1.0",
    checks,
    performance: perfStats,
    environment: env.ENVIRONMENT || "unknown",
  };

  const statusCode = overallStatus === "healthy" ? 200 : overallStatus === "degraded" ? 200 : 503;
  return json(healthData, statusCode, corsHeaders(origin));
}

// ── Drafts API Handlers ──

/**
 * GET /api/drafts — List all drafts for the authenticated user
 */
async function handleGetDrafts(
  request: Request,
  env: Env,
  origin: string,
  headers: Record<string, string>
): Promise<Response> {
  const user = await validateSupabaseJWT(env.SUPABASE_JWT_SECRET, request.headers.get("Authorization"));
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SUPABASE_SECRET_KEY) return errorResponse("Not configured", 501, origin);

  try {
    const supabaseUrl = env.SUPABASE_URL || "https://jstojewashwoswsskwjk.supabase.co";
    const res = await fetch(
      `${supabaseUrl}/rest/v1/post_posts?user_id=eq.${user.sub}&status=eq.draft&order=updated_at.desc`,
      {
        headers: {
          apikey: env.SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
        },
      }
    );

    if (!res.ok) {
      return errorResponse("Failed to fetch drafts", 500, origin);
    }

    const drafts = await res.json();
    return json({ drafts }, 200, headers);
  } catch (error) {
    console.error("Drafts fetch error:", error);
    return errorResponse("Failed to fetch drafts", 500, origin);
  }
}

/**
 * POST /api/drafts — Create a new draft
 */
async function handleCreateDraft(
  request: Request,
  env: Env,
  origin: string,
  headers: Record<string, string>
): Promise<Response> {
  const user = await validateSupabaseJWT(env.SUPABASE_JWT_SECRET, request.headers.get("Authorization"));
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SUPABASE_SECRET_KEY) return errorResponse("Not configured", 501, origin);

  let body: { text: string; platforms?: Platform[]; media?: Array<{ type: string; name: string }> };
  try {
    body = (await request.json()) as any;
  } catch {
    return errorResponse("Invalid JSON body", 400, origin);
  }

  if (!body.text?.trim()) {
    return errorResponse("Text content is required", 400, origin);
  }

  try {
    const supabaseUrl = env.SUPABASE_URL || "https://jstojewashwoswsskwjk.supabase.co";
    const res = await fetch(`${supabaseUrl}/rest/v1/post_posts`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        user_id: user.sub,
        status: "draft",
        text: body.text,
        platforms: body.platforms || [],
        media_urls: (body.media || []).map((m) => m.name),
      }),
    });

    if (!res.ok) {
      const errorData = await res.json() as { message?: string };
      return errorResponse(errorData.message || "Failed to create draft", 500, origin);
    }

    const [draft] = await res.json() as any[];
    return json({ draft }, 201, headers);
  } catch (error) {
    console.error("Draft creation error:", error);
    return errorResponse("Failed to create draft", 500, origin);
  }
}

/**
 * DELETE /api/drafts/:id — Delete a draft
 */
async function handleDeleteDraft(
  request: Request,
  env: Env,
  draftId: string,
  origin: string,
  headers: Record<string, string>
): Promise<Response> {
  const user = await validateSupabaseJWT(env.SUPABASE_JWT_SECRET, request.headers.get("Authorization"));
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SUPABASE_SECRET_KEY) return errorResponse("Not configured", 501, origin);

  try {
    const supabaseUrl = env.SUPABASE_URL || "https://jstojewashwoswsskwjk.supabase.co";
    const res = await fetch(
      `${supabaseUrl}/rest/v1/post_posts?id=eq.${draftId}&user_id=eq.${user.sub}`,
      {
        method: "DELETE",
        headers: {
          apikey: env.SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
        },
      }
    );

    if (!res.ok) {
      return errorResponse("Failed to delete draft", 500, origin);
    }

    return json({ deleted: true }, 200, headers);
  } catch (error) {
    console.error("Draft deletion error:", error);
    return errorResponse("Failed to delete draft", 500, origin);
  }
}

// ── Hashtag Groups API Handlers ──

/**
 * GET /api/hashtags — List all hashtag groups for the user
 */
async function handleGetHashtags(
  request: Request,
  env: Env,
  origin: string,
  headers: Record<string, string>
): Promise<Response> {
  const user = await validateSupabaseJWT(env.SUPABASE_JWT_SECRET, request.headers.get("Authorization"));
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SUPABASE_SECRET_KEY) return errorResponse("Not configured", 501, origin);

  try {
    const supabaseUrl = env.SUPABASE_URL || "https://jstojewashwoswsskwjk.supabase.co";
    const res = await fetch(
      `${supabaseUrl}/rest/v1/post_content?user_id=eq.${user.sub}&type=eq.hashtag_group&order=created_at.desc`,
      {
        headers: {
          apikey: env.SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
        },
      }
    );

    if (!res.ok) {
      return errorResponse("Failed to fetch hashtag groups", 500, origin);
    }

    const rows = (await res.json()) as any[];
    const groups = rows.map((r) => ({ id: r.id, ...r.data }));
    return json({ groups }, 200, headers);
  } catch (error) {
    console.error("Hashtag groups fetch error:", error);
    return errorResponse("Failed to fetch hashtag groups", 500, origin);
  }
}

/**
 * POST /api/hashtags — Create a new hashtag group
 */
async function handleCreateHashtagGroup(
  request: Request,
  env: Env,
  origin: string,
  headers: Record<string, string>
): Promise<Response> {
  const user = await validateSupabaseJWT(env.SUPABASE_JWT_SECRET, request.headers.get("Authorization"));
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SUPABASE_SECRET_KEY) return errorResponse("Not configured", 501, origin);

  let body: { name: string; platform: Platform; hashtags: string[] };
  try {
    body = (await request.json()) as any;
  } catch {
    return errorResponse("Invalid JSON body", 400, origin);
  }

  if (!body.name?.trim()) {
    return errorResponse("Name is required", 400, origin);
  }
  if (!body.platform) {
    return errorResponse("Platform is required", 400, origin);
  }
  if (!body.hashtags || !Array.isArray(body.hashtags) || body.hashtags.length === 0) {
    return errorResponse("Hashtags array is required", 400, origin);
  }

  try {
    const supabaseUrl = env.SUPABASE_URL || "https://jstojewashwoswsskwjk.supabase.co";
    const res = await fetch(`${supabaseUrl}/rest/v1/post_content`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        user_id: user.sub,
        type: "hashtag_group",
        data: {
          name: body.name,
          platform: body.platform,
          hashtags: body.hashtags.filter((h) => h.trim().startsWith("#")),
        },
      }),
    });

    if (!res.ok) {
      const errorData = await res.json() as { message?: string };
      return errorResponse(errorData.message || "Failed to create hashtag group", 500, origin);
    }

    const [row] = await res.json() as any[];
    return json({ group: { id: row.id, ...row.data } }, 201, headers);
  } catch (error) {
    console.error("Hashtag group creation error:", error);
    return errorResponse("Failed to create hashtag group", 500, origin);
  }
}

/**
 * DELETE /api/hashtags/:id — Delete a hashtag group
 */
async function handleDeleteHashtagGroup(
  request: Request,
  env: Env,
  groupId: string,
  origin: string,
  headers: Record<string, string>
): Promise<Response> {
  const user = await validateSupabaseJWT(env.SUPABASE_JWT_SECRET, request.headers.get("Authorization"));
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SUPABASE_SECRET_KEY) return errorResponse("Not configured", 501, origin);

  try {
    const supabaseUrl = env.SUPABASE_URL || "https://jstojewashwoswsskwjk.supabase.co";
    const res = await fetch(
      `${supabaseUrl}/rest/v1/post_content?id=eq.${groupId}&user_id=eq.${user.sub}`,
      {
        method: "DELETE",
        headers: {
          apikey: env.SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
        },
      }
    );

    if (!res.ok) {
      return errorResponse("Failed to delete hashtag group", 500, origin);
    }

    return json({ deleted: true }, 200, headers);
  } catch (error) {
    console.error("Hashtag group deletion error:", error);
    return errorResponse("Failed to delete hashtag group", 500, origin);
  }
}

// ── Saved Replies API Handlers ──

/**
 * GET /api/replies/templates — List all saved replies for the user
 */
async function handleGetSavedReplies(
  request: Request,
  env: Env,
  origin: string,
  headers: Record<string, string>
): Promise<Response> {
  const user = await validateSupabaseJWT(env.SUPABASE_JWT_SECRET, request.headers.get("Authorization"));
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SUPABASE_SECRET_KEY) return errorResponse("Not configured", 501, origin);

  try {
    const supabaseUrl = env.SUPABASE_URL || "https://jstojewashwoswsskwjk.supabase.co";
    const res = await fetch(
      `${supabaseUrl}/rest/v1/post_content?user_id=eq.${user.sub}&type=eq.saved_reply&order=created_at.desc`,
      {
        headers: {
          apikey: env.SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
        },
      }
    );

    if (!res.ok) {
      return errorResponse("Failed to fetch saved replies", 500, origin);
    }

    const rows = (await res.json()) as any[];
    const replies = rows.map((r) => ({ id: r.id, ...r.data }));
    return json({ replies }, 200, headers);
  } catch (error) {
    console.error("Saved replies fetch error:", error);
    return errorResponse("Failed to fetch saved replies", 500, origin);
  }
}

/**
 * POST /api/replies/templates — Create a new saved reply
 */
async function handleCreateSavedReply(
  request: Request,
  env: Env,
  origin: string,
  headers: Record<string, string>
): Promise<Response> {
  const user = await validateSupabaseJWT(env.SUPABASE_JWT_SECRET, request.headers.get("Authorization"));
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SUPABASE_SECRET_KEY) return errorResponse("Not configured", 501, origin);

  let body: { title: string; content: string; platforms?: Platform[] };
  try {
    body = (await request.json()) as any;
  } catch {
    return errorResponse("Invalid JSON body", 400, origin);
  }

  if (!body.title?.trim()) {
    return errorResponse("Title is required", 400, origin);
  }
  if (!body.content?.trim()) {
    return errorResponse("Content is required", 400, origin);
  }

  try {
    const supabaseUrl = env.SUPABASE_URL || "https://jstojewashwoswsskwjk.supabase.co";
    const res = await fetch(`${supabaseUrl}/rest/v1/post_content`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        user_id: user.sub,
        type: "saved_reply",
        data: {
          title: body.title,
          content: body.content,
          platforms: body.platforms || [],
        },
      }),
    });

    if (!res.ok) {
      const errorData = await res.json() as { message?: string };
      return errorResponse(errorData.message || "Failed to create saved reply", 500, origin);
    }

    const [row] = await res.json() as any[];
    return json({ reply: { id: row.id, ...row.data } }, 201, headers);
  } catch (error) {
    console.error("Saved reply creation error:", error);
    return errorResponse("Failed to create saved reply", 500, origin);
  }
}

/**
 * DELETE /api/replies/templates/:id — Delete a saved reply
 */
async function handleDeleteSavedReply(
  request: Request,
  env: Env,
  replyId: string,
  origin: string,
  headers: Record<string, string>
): Promise<Response> {
  const user = await validateSupabaseJWT(env.SUPABASE_JWT_SECRET, request.headers.get("Authorization"));
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SUPABASE_SECRET_KEY) return errorResponse("Not configured", 501, origin);

  try {
    const supabaseUrl = env.SUPABASE_URL || "https://jstojewashwoswsskwjk.supabase.co";
    const res = await fetch(
      `${supabaseUrl}/rest/v1/post_content?id=eq.${replyId}&user_id=eq.${user.sub}`,
      {
        method: "DELETE",
        headers: {
          apikey: env.SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
        },
      }
    );

    if (!res.ok) {
      return errorResponse("Failed to delete saved reply", 500, origin);
    }

    return json({ deleted: true }, 200, headers);
  } catch (error) {
    console.error("Saved reply deletion error:", error);
    return errorResponse("Failed to delete saved reply", 500, origin);
  }
}

// ── Queue API Handlers ──

/**
 * GET /api/queue — List all posts in the user's queue
 */
async function handleGetQueue(
  request: Request,
  env: Env,
  origin: string,
  headers: Record<string, string>
): Promise<Response> {
  const user = await validateSupabaseJWT(env.SUPABASE_JWT_SECRET, request.headers.get("Authorization"));
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SUPABASE_SECRET_KEY) return errorResponse("Not configured", 501, origin);

  try {
    const supabaseUrl = env.SUPABASE_URL || "https://jstojewashwoswsskwjk.supabase.co";
    const res = await fetch(
      `${supabaseUrl}/rest/v1/post_posts?user_id=eq.${user.sub}&status=eq.queued&order=created_at.asc`,
      {
        headers: {
          apikey: env.SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
        },
      }
    );

    if (!res.ok) {
      return errorResponse("Failed to fetch queue", 500, origin);
    }

    const queue = await res.json();
    return json({ queue }, 200, headers);
  } catch (error) {
    console.error("Queue fetch error:", error);
    return errorResponse("Failed to fetch queue", 500, origin);
  }
}

/**
 * POST /api/queue — Add a post to the queue
 */
async function handleAddToQueue(
  request: Request,
  env: Env,
  origin: string,
  headers: Record<string, string>
): Promise<Response> {
  const user = await validateSupabaseJWT(env.SUPABASE_JWT_SECRET, request.headers.get("Authorization"));
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SUPABASE_SECRET_KEY) return errorResponse("Not configured", 501, origin);

  let body: { text: string; platforms: Platform[]; scheduleTime?: string; mediaUrls?: string[]; media?: MediaRef[] };
  try {
    body = (await request.json()) as any;
  } catch {
    return errorResponse("Invalid JSON body", 400, origin);
  }

  if (!body.platforms || !Array.isArray(body.platforms) || body.platforms.length === 0) {
    return errorResponse("At least one platform is required", 400, origin);
  }

  const scheduleTime = body.scheduleTime ? new Date(body.scheduleTime) : null;
  if (scheduleTime && isNaN(scheduleTime.getTime())) {
    return errorResponse("Invalid schedule time", 400, origin);
  }

  const text = body.text?.trim() || "";
  const media = normalizeMediaRefs(body.mediaUrls, body.media);
  const mediaIds = media.map((m) => m.uploadId);
  if (!text && !media.length) return errorResponse("Text or media content is required", 400, origin);
  for (const platform of body.platforms) {
    const mediaError = validateMediaForPlatform(platform, media);
    if (mediaError) return errorResponse(mediaError, 400, origin);
    if (!text && TEXT_REQUIRED_PLATFORMS[platform]) {
      return errorResponse(`${TEXT_REQUIRED_PLATFORMS[platform]} requires text content.`, 400, origin);
    }
  }

  try {
    const supabaseUrl = env.SUPABASE_URL || "https://jstojewashwoswsskwjk.supabase.co";
    const res = await fetch(`${supabaseUrl}/rest/v1/post_posts`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        user_id: user.sub,
        status: "queued",
        text,
        platforms: body.platforms,
        media_urls: mediaIds,
        platform_targets: media.length ? { __media: media } : {},
        scheduled_at: scheduleTime ? scheduleTime.toISOString() : null,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json() as { message?: string };
      return errorResponse(errorData.message || "Failed to add to queue", 500, origin);
    }

    const [queued] = await res.json() as any[];
    return json({ queued }, 201, headers);
  } catch (error) {
    console.error("Queue addition error:", error);
    return errorResponse("Failed to add to queue", 500, origin);
  }
}

/**
 * POST /api/queue/refill — Refill the queue with content from drafts
 */
async function handleRefillQueue(
  request: Request,
  env: Env,
  origin: string,
  headers: Record<string, string>
): Promise<Response> {
  const user = await validateSupabaseJWT(env.SUPABASE_JWT_SECRET, request.headers.get("Authorization"));
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SUPABASE_SECRET_KEY) return errorResponse("Not configured", 501, origin);

  let body: { targetCount?: number };
  try {
    body = (await request.json()) as any;
  } catch {
    body = { targetCount: undefined };
  }

  const targetCount = body.targetCount || 7; // Default to 7 posts per week

  try {
    const supabaseUrl = env.SUPABASE_URL || "https://jstojewashwoswsskwjk.supabase.co";

    // Get current queue count
    const queueRes = await fetch(
      `${supabaseUrl}/rest/v1/post_posts?user_id=eq.${user.sub}&status=eq.queued&select=id`,
      {
        headers: {
          apikey: env.SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
        },
      }
    );
    const currentQueue = await queueRes.json() as any[];
    const queueCount = currentQueue.length;

    if (queueCount >= targetCount) {
      return json({ message: "Queue already full", queueCount, targetCount }, 200, headers);
    }

    const needed = targetCount - queueCount;

    // Get unused drafts
    const draftsRes = await fetch(
      `${supabaseUrl}/rest/v1/post_posts?user_id=eq.${user.sub}&status=eq.draft&limit=${needed}&order=updated_at.desc&select=*`,
      {
        headers: {
          apikey: env.SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
        },
      }
    );
    const drafts = await draftsRes.json() as any[];

    if (!drafts || drafts.length === 0) {
      return json({ message: "No drafts available to refill queue", queueCount, targetCount }, 200, headers);
    }

    // Add drafts to queue with spaced scheduling
    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    const added: any[] = [];

    for (let i = 0; i < drafts.length && i < needed; i++) {
      const scheduleTime = new Date(now.getTime() + (i + 1) * dayMs);
      const res = await fetch(`${supabaseUrl}/rest/v1/post_posts`, {
        method: "POST",
        headers: {
          apikey: env.SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          user_id: user.sub,
          status: "queued",
          text: drafts[i].text,
          platforms: drafts[i].platforms,
          media_urls: drafts[i].media_urls || [],
          scheduled_at: scheduleTime.toISOString(),
        }),
      });

      if (res.ok) {
        const [queued] = await res.json() as any[];
        added.push(queued);
      }
    }

    return json(
      {
        message: `Added ${added.length} posts to queue`,
        added,
        queueCount: queueCount + added.length,
        targetCount,
      },
      200,
      headers
    );
  } catch (error) {
    console.error("Queue refill error:", error);
    return errorResponse("Failed to refill queue", 500, origin);
  }
}

/**
 * DELETE /api/queue/:id — Remove a post from the queue
 */
async function handleRemoveFromQueue(
  request: Request,
  env: Env,
  queueId: string,
  origin: string,
  headers: Record<string, string>
): Promise<Response> {
  const user = await validateSupabaseJWT(env.SUPABASE_JWT_SECRET, request.headers.get("Authorization"));
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SUPABASE_SECRET_KEY) return errorResponse("Not configured", 501, origin);

  try {
    const supabaseUrl = env.SUPABASE_URL || "https://jstojewashwoswsskwjk.supabase.co";
    const res = await fetch(
      `${supabaseUrl}/rest/v1/post_posts?id=eq.${queueId}&user_id=eq.${user.sub}`,
      {
        method: "DELETE",
        headers: {
          apikey: env.SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
        },
      }
    );

    if (!res.ok) {
      return errorResponse("Failed to remove from queue", 500, origin);
    }

    return json({ removed: true }, 200, headers);
  } catch (error) {
    console.error("Queue removal error:", error);
    return errorResponse("Failed to remove from queue", 500, origin);
  }
}

// ── Analytics API Handlers ──

/**
 * GET /api/analytics — Get analytics for all platforms
 */
async function handleGetAnalytics(
  request: Request,
  env: Env,
  origin: string,
  headers: Record<string, string>
): Promise<Response> {
  const user = await authenticateRequest(request, env);
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SUPABASE_SECRET_KEY) return errorResponse("Not configured", 501, origin);

  const url = new URL(request.url);
  const startDate = url.searchParams.get("start") || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const endDate = url.searchParams.get("end") || new Date().toISOString();

  try {
    const supabaseUrl = env.SUPABASE_URL || "https://jstojewashwoswsskwjk.supabase.co";

    // Get posted posts for the date range
    const historyRes = await fetch(
      `${supabaseUrl}/rest/v1/post_posts?user_id=eq.${user.sub}&status=eq.posted&created_at=gte.${startDate}&created_at=lte.${endDate}&select=*`,
      {
        headers: {
          apikey: env.SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
        },
      }
    );

    if (!historyRes.ok) {
      return errorResponse("Failed to fetch analytics", 500, origin);
    }

    const posts = await historyRes.json() as any[];

    // Aggregate analytics by platform
    const analytics: Record<string, any> = {
      bluesky: { posts: 0, likes: 0, comments: 0, shares: 0 },
      x: { posts: 0, likes: 0, comments: 0, shares: 0 },
      linkedin: { posts: 0, likes: 0, comments: 0, shares: 0 },
      facebook: { posts: 0, likes: 0, comments: 0, shares: 0 },
      instagram: { posts: 0, likes: 0, comments: 0, shares: 0 },
      threads: { posts: 0, likes: 0, comments: 0, shares: 0 },
      tiktok: { posts: 0, likes: 0, comments: 0, shares: 0 },
    };

    posts.forEach((post: any) => {
      for (const platform of post.platforms || []) {
        if (analytics[platform]) analytics[platform].posts++;
      }
      const metrics = post.metrics || {};
      for (const [platform, m] of Object.entries(metrics) as [string, any][]) {
        if (analytics[platform]) {
          analytics[platform].likes += m?.likes || 0;
          analytics[platform].comments += m?.comments || 0;
          analytics[platform].shares += m?.shares || 0;
        }
      }
    });

    // Calculate totals
    const totals = {
      posts: posts.length,
      likes: Object.values(analytics).reduce((sum: number, a: any) => sum + a.likes, 0),
      comments: Object.values(analytics).reduce((sum: number, a: any) => sum + a.comments, 0),
      shares: Object.values(analytics).reduce((sum: number, a: any) => sum + a.shares, 0),
    };

    return json(
      {
        analytics,
        totals,
        period: { start: startDate, end: endDate },
      },
      200,
      headers
    );
  } catch (error) {
    console.error("Analytics fetch error:", error);
    return errorResponse("Failed to fetch analytics", 500, origin);
  }
}

/**
 * GET /api/analytics/trends — Get analytics trends over time
 */
async function handleGetAnalyticsTrends(
  request: Request,
  env: Env,
  origin: string,
  headers: Record<string, string>
): Promise<Response> {
  const user = await authenticateRequest(request, env);
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SUPABASE_SECRET_KEY) return errorResponse("Not configured", 501, origin);

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "30");

  try {
    const supabaseUrl = env.SUPABASE_URL || "https://jstojewashwoswsskwjk.supabase.co";
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).getTime();

    // Pull recent posted posts. Key on the publication date (posted_at) — not the
    // row's created_at — so scheduled/older drafts count on the day they actually
    // went out, matching the Analytics list.
    const historyRes = await fetch(
      `${supabaseUrl}/rest/v1/post_posts?user_id=eq.${user.sub}&status=eq.posted&order=posted_at.desc.nullslast&limit=500&select=posted_at,created_at,metrics`,
      {
        headers: {
          apikey: env.SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
        },
      }
    );

    if (!historyRes.ok) {
      return errorResponse("Failed to fetch trends", 500, origin);
    }

    const posts = await historyRes.json() as any[];

    // Group by day. Engagement is the *current* per-platform metric snapshot
    // bucketed by the post's publication day — a useful "which days did my
    // posts perform" view without a full per-day history table.
    const trends: Record<string, { posts: number; impressions: number; likes: number; comments: number; shares: number }> = {};

    const num = (n: unknown): number => {
      const v = Number(n);
      return Number.isFinite(v) ? v : 0;
    };

    posts.forEach((post: any) => {
      const published = new Date(post.posted_at || post.created_at);
      if (Number.isNaN(published.getTime()) || published.getTime() < startDate) return;
      const day = published.toISOString().split("T")[0];
      if (!trends[day]) {
        trends[day] = { posts: 0, impressions: 0, likes: 0, comments: 0, shares: 0 };
      }
      trends[day].posts++;
      for (const m of Object.values(post.metrics || {}) as any[]) {
        trends[day].impressions += num(m?.impressions ?? m?.views);
        trends[day].likes += num(m?.likes);
        trends[day].comments += num(m?.comments);
        trends[day].shares += num(m?.shares);
      }
    });

    return json(
      {
        trends,
        period: { start: new Date(startDate).toISOString(), end: new Date().toISOString(), days },
      },
      200,
      headers
    );
  } catch (error) {
    console.error("Trends fetch error:", error);
    return errorResponse("Failed to fetch trends", 500, origin);
  }
}

/**
 * GET /api/usage — per-platform post counts for billing/tabulation.
 */
async function handleUsage(
  request: Request,
  env: Env,
  origin: string,
  headers: Record<string, string>
): Promise<Response> {
  const user = await validateSupabaseJWT(env.SUPABASE_JWT_SECRET, request.headers.get("Authorization"));
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SUPABASE_SECRET_KEY) return errorResponse("Not configured", 501, origin);

  try {
    const supabaseUrl = env.SUPABASE_URL || SUPABASE_URL;
    const res = await fetch(
      `${supabaseUrl}/rest/v1/post_posts?user_id=eq.${user.sub}&status=eq.posted&select=platforms`,
      {
        headers: {
          apikey: env.SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
        },
      }
    );
    if (!res.ok) return errorResponse("Failed to fetch usage", 500, origin);

    const posts = (await res.json()) as Array<{ platforms?: string[] }>;
    const counts: Record<string, number> = {};
    for (const p of posts) {
      for (const platform of p.platforms || []) {
        counts[platform] = (counts[platform] || 0) + 1;
      }
    }
    return json({ usage: counts }, 200, headers);
  } catch {
    return errorResponse("Usage unavailable", 502, origin);
  }
}

/**
 * POST /api/posts/delete — delete a published post from a platform via Bundle.
 * Currently supports X (DELETE /api/v1/misc/twitter/tweet; metered $0.01).
 */
async function handleDeletePost(
  request: Request, env: Env, origin: string, headers: Record<string, string>
): Promise<Response> {
  const user = await authenticateRequest(request, env);
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SOCIAL_API_PROVIDER_KEY || !env.SUPABASE_SECRET_KEY) return errorResponse("Not configured", 501, origin);

  let body: { platform?: string; postId?: string };
  try { body = (await request.json()) as any; } catch { return errorResponse("Invalid JSON", 400, origin); }
  if (!body.platform || !body.postId) return errorResponse("platform and postId required", 400, origin);

  const teamId = await getOrCreateBundleTeam(user.sub, env);
  if (!teamId) return errorResponse("Could not provision a team", 502, origin);

  if (body.platform === "x") {
    try {
      const res = await fetch("https://api.bundle.social/api/v1/misc/twitter/tweet", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-api-key": env.SOCIAL_API_PROVIDER_KEY },
        body: JSON.stringify({ teamId, postId: body.postId }),
      });
      const data = (await res.json()) as any;
      if (!res.ok) {
        console.error(`Bundle X delete failed:`, res.status, JSON.stringify(data));
        return errorResponse(data?.message || "Delete failed", res.status || 502, origin);
      }
      return json({ success: data?.success !== false }, 200, headers);
    } catch (e) {
      console.error(`Bundle X delete exception:`, e instanceof Error ? e.message : String(e));
      return errorResponse("Delete failed", 502, origin);
    }
  }

  return errorResponse(`Delete not yet proxied for ${body.platform}`, 501, origin);
}

/**
 * GET /api/uploads?ids=a,b,c — resolve Bundle upload ids to preview info
 * ({ id, url, thumbnailUrl, type }) so scheduled posts can show their media.
 */
async function handleUploads(
  request: Request, env: Env, origin: string, headers: Record<string, string>
): Promise<Response> {
  const user = await authenticateRequest(request, env);
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SOCIAL_API_PROVIDER_KEY) return json([], 200, headers);
  const url = new URL(request.url);
  const ids = (url.searchParams.get("ids") || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 8);
  if (!ids.length) return json([], 200, headers);
  const out = [];
  for (const id of ids) {
    try {
      const res = await fetch(`https://api.bundle.social/api/v1/upload/${encodeURIComponent(id)}`, {
        headers: { "x-api-key": env.SOCIAL_API_PROVIDER_KEY },
      });
      if (!res.ok) continue;
      const d = (await res.json()) as any;
      out.push({ id, url: d.url || "", thumbnailUrl: d.thumbnailUrl || d.iconUrl || d.url || "", type: d.type || "", mime: d.mime || "" });
    } catch {}
  }
  return json(out, 200, headers);
}

/**
 * GET /api/posts/recent — recent published posts with per-platform results
 * (successes + errors surfaced from the cron), newest first.
 */
async function handleRecentPosts(
  request: Request, env: Env, origin: string, headers: Record<string, string>
): Promise<Response> {
  const user = await authenticateRequest(request, env);
  if (!user) return errorResponse("Unauthorized", 401, origin);
  if (!env.SUPABASE_SECRET_KEY) return json([], 200, headers);
  try {
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 10, 1), 30);
    const res = await fetch(
      `${env.SUPABASE_URL || SUPABASE_URL}/rest/v1/post_posts?user_id=eq.${user.sub}&status=eq.posted&order=posted_at.desc.nullslast&limit=${limit}&select=id,text,platforms,results,metrics,posted_at,created_at`,
      { headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` } }
    );
    if (!res.ok) return json([], 200, headers);
    const posts = (await res.json()) as any[];

    // Reconcile delivery status from Bundle. A post can be *accepted* (so we
    // recorded success) yet fail later — e.g. TikTok flags the upload as
    // "spam_risk". Attach each result's current status + a human reason so
    // History/Analytics show whether the post actually landed.
    const bundleById = new Map<string, any>();
    if (env.SOCIAL_API_PROVIDER_KEY) {
      try {
        const teamId = await resolveBundleTeamId(user.sub, undefined, env);
        if (teamId) {
          const br = await fetch(`https://api.bundle.social/api/v1/post?teamId=${teamId}&limit=50`, {
            headers: { "x-api-key": env.SOCIAL_API_PROVIDER_KEY },
          });
          if (br.ok) {
            const bd = (await br.json()) as any;
            const list = bd.items || bd.posts || bd.data || bd;
            for (const bp of Array.isArray(list) ? list : []) {
              if (bp?.id) bundleById.set(bp.id, bp);
            }
          }
        }
      } catch { /* best-effort — never block the list */ }

    // The list endpoint omits error detail, so fetch the full post for the
    // errored ones (bounded) to surface the platform's reason.
    const erroredIds = [...bundleById.values()]
      .filter((bp) => bp?.status === "ERROR")
      .map((bp) => bp.id)
      .filter(Boolean)
      .slice(0, 5);
    for (const id of erroredIds) {
      try {
        const dr = await fetch(`https://api.bundle.social/api/v1/post/${id}`, {
          headers: { "x-api-key": env.SOCIAL_API_PROVIDER_KEY },
        });
        if (dr.ok) {
          const detail = (await dr.json()) as any;
          bundleById.set(id, { ...(bundleById.get(id) || {}), ...detail });
        }
      } catch { /* best-effort */ }
    }
    }

    const deliveryReason = (bp: any): string => {
      if (!bp) return "";
      // Bundle's detail payload omits socialAccountTypes, so read the first
      // error entry rather than keying off the platform.
      const verbose = Object.values(bp.errorsVerbose || {})[0] as any;
      if (verbose?.userFacingMessage || verbose?.errorMessage) {
        return verbose.userFacingMessage || verbose.errorMessage;
      }
      const firstError = Object.values(bp.errors || {})[0];
      if (typeof firstError === "string" && firstError) return firstError;
      return bp.error || "";
    };

    return json(posts.map((p: any) => {
      const results = (Array.isArray(p.results) ? p.results : []).map((r: any) => {
        const bp = r?.postId ? bundleById.get(r.postId) : null;
        if (!bp) return r;
        // Enrich with the platform's native id (isolated from Bundle externalData)
        // when we don't already have it stored, plus delivery status.
        const bs = bundlePlatform(r.platform);
        const externalId = r.externalId || (bs ? extractBundleExternalId(bp, bs) : undefined) || undefined;
        return { ...r, externalId, status: bp.status, error: deliveryReason(bp) || r.error || "" };
      });
      return {
        id: p.id,
        text: p.text,
        platforms: p.platforms || [],
        postedAt: p.posted_at || p.created_at,
        results,
        metrics: p.metrics || {},
      };
    }), 200, headers);
  } catch {
    return json([], 200, headers);
  }
}

/**
 * Handle cron job to process scheduled posts from the queue
 */
async function handleCron(env: Env): Promise<Response> {
  if (!env.SUPABASE_SECRET_KEY) {
    return json({ error: "Not configured" }, 501);
  }

  try {
    const supabaseUrl = env.SUPABASE_URL || "https://jstojewashwoswsskwjk.supabase.co";
    const now = new Date().toISOString();

    // Get due scheduled/queued posts
    const res = await fetch(
      `${supabaseUrl}/rest/v1/post_posts?status=in.(scheduled,queued)&scheduled_at=lte.${now}&limit=10&order=scheduled_at.asc&select=*`,
      {
        headers: {
          apikey: env.SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
        },
      }
    );

    if (!res.ok) {
      return json({ error: "Failed to fetch queue" }, 500);
    }

    const postsToPost = await res.json() as any[];

    if (!postsToPost || postsToPost.length === 0) {
      return json({ processed: 0, message: "No posts to process" }, 200);
    }

    // Process each post
    let processed = 0;
    let failed = 0;

    for (const queuedPost of postsToPost) {
      try {
        // Use the team stored on the post — never fall back to an active team.
        const bundleTeamId = env.SOCIAL_API_PROVIDER_KEY ? (queuedPost.bundle_team_id || null) : null;

        const results: PlatformPostResult[] = await Promise.all(
          (queuedPost.platforms || []).map(async (platform: Platform) => {
            // Pre-flight X credit check (scheduled posts too — never go negative).
            if (platform === "x" && bundleTeamId) {
              const q = await quoteXFee(bundleTeamId, queuedPost.text, env);
              if (q && q.micros > 0) {
                const bal = await getUserBalanceMicros(queuedPost.user_id, env);
                if (bal < q.micros) {
                  return { platform, success: false, error: "Insufficient X credit - top up in the X fees tab" };
                }
              }
            }
            const storedTargets = (queuedPost.platform_targets || {}) as Record<string, any>;
            const media = normalizeMediaRefs(
              queuedPost.media_urls,
              storedTargets.__media as MediaRef[] | undefined
            );
            const mediaIds = media.map((m: MediaRef) => m.uploadId);
            const mediaError = validateMediaForPlatform(platform, media);
            if (mediaError) return { platform, success: false, error: mediaError };

            if (bundleTeamId) {
              const titles = (storedTargets.__titles as Record<string, string> | undefined) || undefined;
              const platformOptions = (storedTargets.__platformOptions as Record<string, Record<string, unknown>> | undefined) || undefined;
              const firstComment = (storedTargets.__firstComment as string | undefined) || undefined;
              const providerResult = await postViaProvider(
                platform, queuedPost.text, env, media, bundleTeamId, undefined, storedTargets, titles, platformOptions, firstComment
              );
              if (providerResult.success) return { ...providerResult, via: "bundle" as const };
              // Only fall back to a direct adapter when media is single (the
              // direct adapters don't publish carousels yet) and creds exist;
              // otherwise surface the real Bundle error.
              if (media.length <= 1 && hasDirectCreds(platform, env, [])) {
                return { ...(await postToPlatform(platform, queuedPost.text, env, mediaIds)), via: "direct" as const };
              }
              return { ...providerResult, via: "bundle" as const };
            }
            return { ...(await postToPlatform(platform, queuedPost.text, env, mediaIds)), via: "direct" as const };
          })
        );

        // Mark the post as published with its results
        const updateRes = await fetch(
          `${supabaseUrl}/rest/v1/post_posts?id=eq.${queuedPost.id}`,
          {
            method: "PATCH",
            headers: {
              apikey: env.SUPABASE_SECRET_KEY,
              Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ status: "posted", posted_at: now, results }),
          }
        );

        if (updateRes.ok) {
          processed++;
          // Record X metered fee (best-effort) for successful X posts.
          if (results.some((r) => r.platform === "x" && r.success)) {
            const q = bundleTeamId ? await quoteXFee(bundleTeamId, queuedPost.text, env) : null;
            await recordXFee(queuedPost.user_id, queuedPost.id, Boolean(queuedPost.has_link), env, q?.micros, q ? (q.withUrl ? "WITH_URL" : "CREATE") : undefined);
          }
        } else {
          failed++;
        }
      } catch (error) {
        console.error("Failed to process queued post:", queuedPost.id, error);
        failed++;
      }
    }

    return json({ processed, failed, total: postsToPost.length }, 200);
  } catch (error) {
    console.error("Cron error:", error);
    return json({ error: "Cron failed" }, 500);
  }
}


