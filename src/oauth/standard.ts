/**
 * Standard OAuth 2.0 provider connections — reviewer/sandbox scaffold.
 * ====================================================================
 * Handles Meta (Facebook + linked Instagram), Threads, TikTok, Pinterest, and
 * YouTube. Every connection is stored in `post_accounts` with
 * `metadata.connection = "direct"`, so the existing posting/analytics routing
 * can prefer it without a second storage system.
 *
 * LinkedIn has its own module/route. X and Bluesky are intentionally not here.
 */

import { FREESURF } from "../freesurf.config";
import { encryptAccountRow } from "../crypto";

export type StandardProvider = "meta" | "threads" | "tiktok" | "pinterest" | "youtube";

export interface StandardOAuthEnv {
  RATE_LIMITS?: KVNamespace;
  SUPABASE_SECRET_KEY?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  FACEBOOK_CLIENT_ID?: string;
  FACEBOOK_CLIENT_SECRET?: string;
  FACEBOOK_REDIRECT_URI?: string;
  THREADS_CLIENT_ID?: string;
  THREADS_CLIENT_SECRET?: string;
  THREADS_REDIRECT_URI?: string;
  TIKTOK_CLIENT_ID?: string;
  TIKTOK_CLIENT_SECRET?: string;
  TIKTOK_REDIRECT_URI?: string;
  PINTEREST_CLIENT_ID?: string;
  PINTEREST_CLIENT_SECRET?: string;
  PINTEREST_REDIRECT_URI?: string;
  YOUTUBE_CLIENT_ID?: string;
  YOUTUBE_CLIENT_SECRET?: string;
  YOUTUBE_REDIRECT_URI?: string;
}

export interface StoredDirectAccount {
  platform: string;
  handle: string;
  platformUserId: string;
  accessToken: string;
  refreshToken?: string;
  metadata: Record<string, unknown>;
}

interface PendingState {
  userId: string;
  platform: string;
  provider: StandardProvider;
}

const META_SCOPE =
  "pages_show_list,pages_read_engagement,pages_manage_posts,read_insights,pages_read_user_content,pages_manage_engagement,business_management";
const THREADS_SCOPE =
  "threads_basic,threads_content_publish,threads_manage_insights,threads_read_replies,threads_manage_replies";
const TIKTOK_SCOPE = "user.info.basic,video.publish,video.upload";
const PINTEREST_SCOPE = "pins:read,pins:write,boards:read,boards:write,user_accounts:read";
const YOUTUBE_SCOPE =
  "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly";

export function standardProviderForPlatform(platform: string): StandardProvider | null {
  switch (platform) {
    case "facebook":
    case "instagram":
      return "meta";
    case "threads":
      return "threads";
    case "tiktok":
      return "tiktok";
    case "pinterest":
      return "pinterest";
    case "youtube":
      return "youtube";
    default:
      return null;
  }
}

export async function startStandardOAuth(
  platform: string,
  userId: string,
  env: StandardOAuthEnv
): Promise<string | null> {
  const provider = standardProviderForPlatform(platform);
  if (!provider || !env.RATE_LIMITS) return null;

  const config = providerConfig(provider, env);
  if (!config) return null;

  const state = crypto.randomUUID().replace(/-/g, "");
  const pending: PendingState = { userId, platform, provider };
  await env.RATE_LIMITS.put(`oauth:${provider}:${state}`, JSON.stringify(pending), {
    expirationTtl: 600,
  });

  return buildAuthorizeUrl(provider, config, state);
}

export async function completeStandardOAuth(
  provider: StandardProvider,
  env: StandardOAuthEnv,
  code: string,
  state: string
): Promise<{ platform: string; connected: string[] }> {
  if (!env.RATE_LIMITS) throw new Error("OAuth state store is not configured");
  if (!env.SUPABASE_SECRET_KEY || !env.TOKEN_ENCRYPTION_KEY) {
    throw new Error("Token storage is not configured");
  }

  const stateKey = `oauth:${provider}:${state}`;
  const raw = await env.RATE_LIMITS.get(stateKey);
  await env.RATE_LIMITS.delete(stateKey);
  if (!raw) throw new Error("OAuth state expired");

  const pending = JSON.parse(raw) as PendingState;
  if (!pending.userId) throw new Error("OAuth state is invalid");

  const config = providerConfig(provider, env);
  if (!config) throw new Error(`${provider} OAuth is not configured`);

  const rows = await exchangeAndFetch(provider, config, code);
  for (const row of rows) {
    await storeDirectAccount(env, pending.userId, row);
  }

  return {
    platform: pending.platform,
    connected: rows.map((row) => row.platform),
  };
}

interface ProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

function providerConfig(provider: StandardProvider, env: StandardOAuthEnv): ProviderConfig | null {
  const app = FREESURF.APP.URL;
  switch (provider) {
    case "meta":
      return env.FACEBOOK_CLIENT_ID && env.FACEBOOK_CLIENT_SECRET
        ? {
            clientId: env.FACEBOOK_CLIENT_ID,
            clientSecret: env.FACEBOOK_CLIENT_SECRET,
            redirectUri: env.FACEBOOK_REDIRECT_URI || `${app}/api/oauth/meta/callback`,
          }
        : null;
    case "threads":
      return env.THREADS_CLIENT_ID && env.THREADS_CLIENT_SECRET
        ? {
            clientId: env.THREADS_CLIENT_ID,
            clientSecret: env.THREADS_CLIENT_SECRET,
            redirectUri: env.THREADS_REDIRECT_URI || `${app}/api/oauth/threads/callback`,
          }
        : null;
    case "tiktok":
      return env.TIKTOK_CLIENT_ID && env.TIKTOK_CLIENT_SECRET
        ? {
            clientId: env.TIKTOK_CLIENT_ID,
            clientSecret: env.TIKTOK_CLIENT_SECRET,
            redirectUri: env.TIKTOK_REDIRECT_URI || `${app}/api/oauth/tiktok/callback`,
          }
        : null;
    case "pinterest":
      return env.PINTEREST_CLIENT_ID && env.PINTEREST_CLIENT_SECRET
        ? {
            clientId: env.PINTEREST_CLIENT_ID,
            clientSecret: env.PINTEREST_CLIENT_SECRET,
            redirectUri: env.PINTEREST_REDIRECT_URI || `${app}/api/oauth/pinterest/callback`,
          }
        : null;
    case "youtube":
      return env.YOUTUBE_CLIENT_ID && env.YOUTUBE_CLIENT_SECRET
        ? {
            clientId: env.YOUTUBE_CLIENT_ID,
            clientSecret: env.YOUTUBE_CLIENT_SECRET,
            redirectUri: env.YOUTUBE_REDIRECT_URI || `${app}/api/oauth/youtube/callback`,
          }
        : null;
  }
}

function buildAuthorizeUrl(
  provider: StandardProvider,
  config: ProviderConfig,
  state: string
): string {
  switch (provider) {
    case "meta": {
      const url = new URL("https://www.facebook.com/v25.0/dialog/oauth");
      url.searchParams.set("client_id", config.clientId);
      url.searchParams.set("redirect_uri", config.redirectUri);
      url.searchParams.set("state", state);
      url.searchParams.set("scope", META_SCOPE);
      url.searchParams.set("response_type", "code");
      return url.toString();
    }
    case "threads": {
      const url = new URL("https://threads.net/oauth/authorize");
      url.searchParams.set("client_id", config.clientId);
      url.searchParams.set("redirect_uri", config.redirectUri);
      url.searchParams.set("scope", THREADS_SCOPE);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("state", state);
      return url.toString();
    }
    case "tiktok": {
      const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
      url.searchParams.set("client_key", config.clientId);
      url.searchParams.set("scope", TIKTOK_SCOPE);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("redirect_uri", config.redirectUri);
      url.searchParams.set("state", state);
      return url.toString();
    }
    case "pinterest": {
      const url = new URL("https://www.pinterest.com/oauth/");
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", config.clientId);
      url.searchParams.set("redirect_uri", config.redirectUri);
      url.searchParams.set("scope", PINTEREST_SCOPE);
      url.searchParams.set("state", state);
      return url.toString();
    }
    case "youtube": {
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.searchParams.set("client_id", config.clientId);
      url.searchParams.set("redirect_uri", config.redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", YOUTUBE_SCOPE);
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("prompt", "consent");
      url.searchParams.set("state", state);
      return url.toString();
    }
  }
}

async function exchangeAndFetch(
  provider: StandardProvider,
  config: ProviderConfig,
  code: string
): Promise<StoredDirectAccount[]> {
  switch (provider) {
    case "meta":
      return exchangeMeta(config, code);
    case "threads":
      return exchangeThreads(config, code);
    case "tiktok":
      return exchangeTikTok(config, code);
    case "pinterest":
      return exchangePinterest(config, code);
    case "youtube":
      return exchangeYouTube(config, code);
  }
}

async function exchangeMeta(config: ProviderConfig, code: string): Promise<StoredDirectAccount[]> {
  const tokenUrl = new URL("https://graph.facebook.com/v25.0/oauth/access_token");
  tokenUrl.searchParams.set("client_id", config.clientId);
  tokenUrl.searchParams.set("client_secret", config.clientSecret);
  tokenUrl.searchParams.set("redirect_uri", config.redirectUri);
  tokenUrl.searchParams.set("code", code);
  const token = await getJson<{ access_token?: string }>(tokenUrl.toString());
  if (!token.access_token) throw new Error("Meta token exchange failed");

  let userToken = token.access_token;
  try {
    const longUrl = new URL("https://graph.facebook.com/v25.0/oauth/access_token");
    longUrl.searchParams.set("grant_type", "fb_exchange_token");
    longUrl.searchParams.set("client_id", config.clientId);
    longUrl.searchParams.set("client_secret", config.clientSecret);
    longUrl.searchParams.set("fb_exchange_token", userToken);
    const long = await getJson<{ access_token?: string }>(longUrl.toString());
    if (long.access_token) userToken = long.access_token;
  } catch {
    /* short-lived token still works for the demo */
  }

  const pagesUrl = new URL("https://graph.facebook.com/v25.0/me/accounts");
  pagesUrl.searchParams.set(
    "fields",
    "id,name,access_token,instagram_business_account{id,username}"
  );
  pagesUrl.searchParams.set("access_token", userToken);
  const pages = await getJson<{
    data?: Array<{
      id: string;
      name: string;
      access_token: string;
      instagram_business_account?: { id: string; username?: string };
    }>;
  }>(pagesUrl.toString());

  const page = pages.data?.[0];
  if (!page) throw new Error("No Facebook Page found for this account");

  const rows: StoredDirectAccount[] = [
    {
      platform: "facebook",
      handle: page.name,
      platformUserId: page.id,
      accessToken: page.access_token,
      metadata: {
        connection: "direct",
        page_id: page.id,
        page_name: page.name,
        user_token: userToken,
      },
    },
  ];

  const ig = page.instagram_business_account;
  if (ig?.id) {
    rows.push({
      platform: "instagram",
      handle: ig.username || page.name,
      platformUserId: ig.id,
      accessToken: page.access_token,
      metadata: {
        connection: "direct",
        ig_user_id: ig.id,
        ig_username: ig.username || "",
        page_id: page.id,
      },
    });
  }

  return rows;
}

async function exchangeThreads(
  config: ProviderConfig,
  code: string
): Promise<StoredDirectAccount[]> {
  const token = await postForm<{ access_token?: string }>(
    "https://graph.threads.net/oauth/access_token",
    {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
      code,
    }
  );
  if (!token.access_token) throw new Error("Threads token exchange failed");

  let accessToken = token.access_token;
  try {
    const longUrl = new URL("https://graph.threads.net/access_token");
    longUrl.searchParams.set("grant_type", "th_exchange_token");
    longUrl.searchParams.set("client_secret", config.clientSecret);
    longUrl.searchParams.set("access_token", accessToken);
    const long = await getJson<{ access_token?: string }>(longUrl.toString());
    if (long.access_token) accessToken = long.access_token;
  } catch {
    /* short-lived token still works for the demo */
  }

  const me = await getJson<{ id?: string; username?: string }>(
    `https://graph.threads.net/v1.0/me?fields=id,username&access_token=${encodeURIComponent(
      accessToken
    )}`
  );
  if (!me.id) throw new Error("Threads profile lookup failed");

  return [
    {
      platform: "threads",
      handle: me.username || "Threads",
      platformUserId: me.id,
      accessToken,
      metadata: {
        connection: "direct",
        threads_user_id: me.id,
        username: me.username || "",
      },
    },
  ];
}

async function exchangeTikTok(
  config: ProviderConfig,
  code: string
): Promise<StoredDirectAccount[]> {
  const token = await postForm<{
    access_token?: string;
    refresh_token?: string;
    open_id?: string;
  }>("https://open.tiktokapis.com/v2/oauth/token/", {
    client_key: config.clientId,
    client_secret: config.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
  });
  if (!token.access_token || !token.open_id) throw new Error("TikTok token exchange failed");

  let displayName = token.open_id;
  try {
    const info = await getJson<{ data?: { user?: { display_name?: string } } }>(
      "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name",
      { Authorization: `Bearer ${token.access_token}` }
    );
    displayName = info.data?.user?.display_name || displayName;
  } catch {
    /* open_id is enough for the connection */
  }

  return [
    {
      platform: "tiktok",
      handle: displayName,
      platformUserId: token.open_id,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      metadata: {
        connection: "direct",
        open_id: token.open_id,
      },
    },
  ];
}

async function exchangePinterest(
  config: ProviderConfig,
  code: string
): Promise<StoredDirectAccount[]> {
  const basic = btoa(`${config.clientId}:${config.clientSecret}`);
  const token = await postForm<{ access_token?: string; refresh_token?: string }>(
    "https://api.pinterest.com/v5/oauth/token",
    {
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
    },
    { Authorization: `Basic ${basic}` }
  );
  if (!token.access_token) throw new Error("Pinterest token exchange failed");

  let username = "Pinterest";
  try {
    const user = await getJson<{ username?: string }>(
      "https://api.pinterest.com/v5/user_account",
      { Authorization: `Bearer ${token.access_token}` }
    );
    username = user.username || username;
  } catch {
    /* keep fallback */
  }

  let boardId = "";
  let boardName = "";
  try {
    const boards = await getJson<{ items?: Array<{ id?: string; name?: string }> }>(
      "https://api.pinterest.com/v5/boards?page_size=1",
      { Authorization: `Bearer ${token.access_token}` }
    );
    boardId = boards.items?.[0]?.id || "";
    boardName = boards.items?.[0]?.name || "";
  } catch {
    /* pin posting needs a board; surfaced later */
  }

  return [
    {
      platform: "pinterest",
      handle: username,
      platformUserId: username,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      metadata: {
        connection: "direct",
        board_id: boardId,
        board_name: boardName,
      },
    },
  ];
}

async function exchangeYouTube(
  config: ProviderConfig,
  code: string
): Promise<StoredDirectAccount[]> {
  const token = await postForm<{ access_token?: string; refresh_token?: string }>(
    "https://oauth2.googleapis.com/token",
    {
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }
  );
  if (!token.access_token) throw new Error("YouTube token exchange failed");

  const channels = await getJson<{
    items?: Array<{ id?: string; snippet?: { title?: string } }>;
  }>("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
    Authorization: `Bearer ${token.access_token}`,
  });

  const channel = channels.items?.[0];
  if (!channel?.id) throw new Error("No YouTube channel found for this account");

  return [
    {
      platform: "youtube",
      handle: channel.snippet?.title || "YouTube",
      platformUserId: channel.id,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      metadata: {
        connection: "direct",
        channel_id: channel.id,
        channel_title: channel.snippet?.title || "",
      },
    },
  ];
}

export async function storeDirectAccount(
  env: StandardOAuthEnv,
  userId: string,
  row: StoredDirectAccount
): Promise<void> {
  if (!env.SUPABASE_SECRET_KEY || !env.TOKEN_ENCRYPTION_KEY) {
    throw new Error("Token storage is not configured");
  }
  const supabaseUrl = FREESURF.AUTH.SUPABASE_URL;
  const auth = {
    apikey: env.SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
  };

  await fetch(
    `${supabaseUrl}/rest/v1/post_accounts?user_id=eq.${encodeURIComponent(
      userId
    )}&platform=eq.${encodeURIComponent(row.platform)}`,
    { method: "DELETE", headers: auth }
  );

  const record = await encryptAccountRow(
    {
      user_id: userId,
      platform: row.platform,
      profile_label: "Default",
      platform_handle: row.handle,
      platform_user_id: row.platformUserId,
      access_token: row.accessToken,
      ...(row.refreshToken ? { refresh_token: row.refreshToken } : {}),
      metadata: row.metadata,
    },
    env.TOKEN_ENCRYPTION_KEY
  );

  const res = await fetch(`${supabaseUrl}/rest/v1/post_accounts`, {
    method: "POST",
    headers: {
      ...auth,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(record),
  });
  if (!res.ok) throw new Error(`Failed to store ${row.platform} token: ${await res.text()}`);
}

async function postForm<T>(
  url: string,
  body: Record<string, string>,
  headers: Record<string, string> = {}
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) throw new Error(`Token request failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as T;
}

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GET ${url} failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as T;
}
