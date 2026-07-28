/**
 * OAuth flow handlers for all platforms
 * Supports 3-legged OAuth 2.0 and OAuth 1.0a flows
 */

import { generateRandomState, generateCorrelationId } from "./crypto";
import { logPlatformError, logError, ErrorType, ErrorSeverity } from "./logging";
import type { Env } from "./index";
import { FREESURF } from "./freesurf.config";

export interface OAuthState {
  state: string;
  userId: string;
  platform: string;
  redirectUri: string;
  timestamp: string;
}

export interface OAuthCallbackResult {
  success: boolean;
  userId: string;
  platform: string;
  accessToken?: string;
  refreshToken?: string;
  platformUserId?: string;
  platformHandle?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface PlatformOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

// Store OAuth states temporarily (in production, use KV or Redis)
const oauthStateStore = new Map<string, OAuthState>();

/**
 * Generate and store OAuth state parameter
 */
export function createOAuthState(
  userId: string,
  platform: string,
  redirectUri: string
): string {
  const state = generateRandomState();
  const oauthState: OAuthState = {
    state,
    userId,
    platform,
    redirectUri,
    timestamp: new Date().toISOString(),
  };

  oauthStateStore.set(state, oauthState);

  // Clean up old states after 10 minutes
  setTimeout(() => {
    oauthStateStore.delete(state);
  }, 10 * 60 * 1000);

  return state;
}

/**
 * Validate OAuth state parameter
 */
export function validateOAuthState(
  state: string
): OAuthState | null {
  const oauthState = oauthStateStore.get(state);
  if (!oauthState) return null;

  // Check if state is too old (5 minutes)
  const createdAt = new Date(oauthState.timestamp).getTime();
  const age = Date.now() - createdAt;
  if (age > 5 * 60 * 1000) {
    oauthStateStore.delete(state);
    return null;
  }

  return oauthState;
}

/**
 * Consume and remove OAuth state
 */
export function consumeOAuthState(state: string): OAuthState | null {
  const oauthState = validateOAuthState(state);
  if (oauthState) {
    oauthStateStore.delete(state);
  }
  return oauthState;
}

// ============================================================================
// OAUTH 2.0 FLOW HANDLERS
// ============================================================================

/**
 * Generate OAuth 2.0 authorization URL
 */
export function generateOAuthUrl(
  config: PlatformOAuthConfig,
  state: string,
  additionalParams?: Record<string, string>
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scopes.join(" "),
    state,
    ...additionalParams,
  });

  return `${config.authUrl}?${params.toString()}`;
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(
  config: PlatformOAuthConfig,
  code: string,
  additionalParams?: Record<string, string>
): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  [key: string]: unknown;
}> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    ...additionalParams,
  });

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(
  config: PlatformOAuthConfig,
  refreshToken: string,
  additionalParams?: Record<string, string>
): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  [key: string]: unknown;
}> {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    ...additionalParams,
  });

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// ============================================================================
// PLATFORM-SPECIFIC OAUTH CONFIGURATIONS
// ============================================================================

/**
 * Bluesky OAuth configuration
 * Note: Bluesky primarily uses App Password auth, but also supports OAuth
 */
export function getBlueskyOAuthConfig(env: Env): PlatformOAuthConfig {
  return {
    clientId: env.BLUESKY_CLIENT_ID || "",
    clientSecret: env.BLUESKY_CLIENT_SECRET || "",
    redirectUri: `${env.BLUESKY_REDIRECT_URI || FREESURF.URLS.post}/auth/callback/bluesky`,
    authUrl: "https://bsky.social/oauth/authorize",
    tokenUrl: "https://bsky.site/oauth/token",
    scopes: ["atproto"],
  };
}

/**
 * LinkedIn OAuth configuration
 */
export function getLinkedInOAuthConfig(env: Env): PlatformOAuthConfig {
  return {
    clientId: env.LINKEDIN_CLIENT_ID || "",
    clientSecret: env.LINKEDIN_CLIENT_SECRET || "",
    redirectUri: `${env.LINKEDIN_REDIRECT_URI || FREESURF.URLS.post}/auth/callback/linkedin`,
    authUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scopes: ["w_member_social", "r_liteprofile", "r_emailaddress"],
  };
}

/**
 * Facebook OAuth configuration
 */
export function getFacebookOAuthConfig(env: Env): PlatformOAuthConfig {
  return {
    clientId: env.FACEBOOK_CLIENT_ID || "",
    clientSecret: env.FACEBOOK_CLIENT_SECRET || "",
    redirectUri: `${env.FACEBOOK_REDIRECT_URI || FREESURF.URLS.post}/auth/callback/facebook`,
    authUrl: "https://www.facebook.com/v25.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v25.0/oauth/access_token",
    scopes: ["pages_manage_posts", "pages_read_engagement", "pages_read_user_content"],
  };
}

/**
 * Instagram OAuth configuration
 */
export function getInstagramOAuthConfig(env: Env): PlatformOAuthConfig {
  return {
    clientId: env.INSTAGRAM_CLIENT_ID || "",
    clientSecret: env.INSTAGRAM_CLIENT_SECRET || "",
    redirectUri: `${env.INSTAGRAM_REDIRECT_URI || FREESURF.URLS.post}/auth/callback/instagram`,
    authUrl: "https://api.instagram.com/oauth/authorize",
    tokenUrl: "https://api.instagram.com/oauth/access_token",
    scopes: ["instagram_basic", "instagram_content_publish", "instagram_manage_comments"],
  };
}

/**
 * Threads OAuth configuration
 */
export function getThreadsOAuthConfig(env: Env): PlatformOAuthConfig {
  return {
    clientId: env.THREADS_CLIENT_ID || "",
    clientSecret: env.THREADS_CLIENT_SECRET || "",
    redirectUri: `${env.THREADS_REDIRECT_URI || FREESURF.URLS.post}/auth/callback/threads`,
    authUrl: "https://threads.net/oauth/authorize",
    tokenUrl: "https://graph.facebook.com/v25.0/oauth/access_token", // Threads uses Facebook's token endpoint
    scopes: ["threads_basic", "threads_content_publish"],
  };
}

/**
 * TikTok OAuth configuration
 */
export function getTikTokOAuthConfig(env: Env): PlatformOAuthConfig {
  return {
    clientId: env.TIKTOK_CLIENT_ID || "",
    clientSecret: env.TIKTOK_CLIENT_SECRET || "",
    redirectUri: `${env.TIKTOK_REDIRECT_URI || FREESURF.URLS.post}/auth/callback/tiktok`,
    authUrl: "https://www.tiktok.com/v2/auth/authorize",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    scopes: ["video.publish", "user.info.basic"],
  };
}

// ============================================================================
// X (TWITTER) OAUTH 1.0A FLOW
// ============================================================================

/**
 * Generate OAuth 1.0a request token
 */
export async function generateXRequestToken(
  env: Env,
  callbackUrl: string
): Promise<{ oauth_token: string; oauth_token_secret: string }> {
  const url = "https://api.x.com/oauth/request_token";
  const params = {
    oauth_callback: callbackUrl,
    oauth_consumer_key: env.X_CONSUMER_KEY!,
    oauth_nonce: generateRandomState(),
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: "1.0",
    oauth_signature_method: "HMAC-SHA1",
  };

  // Generate OAuth 1.0a signature
  const signature = await generateOAuth1Signature(
    "POST",
    url,
    params,
    env.X_CONSUMER_KEY!,
    env.X_CONSUMER_KEY_SECRET!
  );

  params["oauth_signature"] = signature;

  const authHeader = generateOAuth1Header(params);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`X request token failed: ${response.status} - ${errorText}`);
  }

  const body = await response.text();
  const result = parseOAuth1Response(body);

  return {
    oauth_token: result.oauth_token,
    oauth_token_secret: result.oauth_token_secret,
  };
}

/**
 * Exchange OAuth 1.0a verifier for access token
 */
export async function exchangeXAccessToken(
  env: Env,
  oauthToken: string,
  oauthVerifier: string,
  oauthTokenSecret: string
): Promise<{
  oauth_token: string;
  oauth_token_secret: string;
  user_id: string;
  screen_name: string;
}> {
  const url = "https://api.x.com/oauth/access_token";
  const params = {
    oauth_consumer_key: env.X_CONSUMER_KEY!,
    oauth_nonce: generateRandomState(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: oauthToken,
    oauth_verifier: oauthVerifier,
    oauth_version: "1.0",
  };

  const signature = await generateOAuth1Signature(
    "POST",
    url,
    params,
    env.X_CONSUMER_KEY!,
    env.X_CONSUMER_KEY_SECRET!,
    oauthTokenSecret
  );

  params["oauth_signature"] = signature;

  const authHeader = generateOAuth1Header(params);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`X access token failed: ${response.status} - ${errorText}`);
  }

  const body = await response.text();
  return parseOAuth1Response(body);
}

/**
 * Generate OAuth 1.0a signature
 */
async function generateOAuth1Signature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerKey: string,
  consumerSecret: string,
  tokenSecret?: string
): Promise<string> {
  // Sort parameters alphabetically
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join("&");

  // Create signature base string
  const encodedUrl = encodeURIComponent(url);
  const encodedParams = encodeURIComponent(sortedParams);
  const baseString = `${method.toUpperCase()}&${encodedUrl}&${encodedParams}`;

  // Create signing key
  const encodedConsumerSecret = encodeURIComponent(consumerSecret);
  const encodedTokenSecret = tokenSecret ? encodeURIComponent(tokenSecret) : "";
  const signingKey = `${encodedConsumerSecret}&${encodedTokenSecret}`;

  // Generate HMAC-SHA1 signature
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingKey),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(baseString)
  );

  // Base64 encode and URL encode
  const base64Signature = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return encodeURIComponent(base64Signature);
}

/**
 * Generate OAuth 1.0a Authorization header
 */
function generateOAuth1Header(params: Record<string, string>): string {
  const oauthParams = Object.keys(params)
    .filter(key => key.startsWith("oauth_"))
    .sort()
    .map(key => `${key}="${params[key]}"`)
    .join(", ");

  return `OAuth ${oauthParams}`;
}

/**
 * Parse OAuth 1.0a response body
 */
function parseOAuth1Response(body: string): Record<string, string> {
  const result: Record<string, string> = {};
  body.split("&").forEach(param => {
    const [key, value] = param.split("=");
    result[decodeURIComponent(key)] = decodeURIComponent(value);
  });
  return result;
}

// ============================================================================
// TOKEN STORAGE AND MANAGEMENT
// ============================================================================

/**
 * Store encrypted platform token in database
 */
export async function storePlatformToken(
  env: Env,
  userId: string,
  platform: string,
  accessToken: string,
  refreshToken: string | undefined,
  platformUserId?: string,
  platformHandle?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  // Import encryption utilities
  const { getEncryptionKey, encryptToken } = await import("./crypto");

  // Encrypt access token
  const encryptionKey = await getEncryptionKey(env.ENCRYPTION_KEY || "default-encryption-key");
  const { encrypted: encryptedAccessToken } = await encryptToken(accessToken, encryptionKey);

  // Encrypt refresh token if provided
  let encryptedRefreshToken: string | undefined;
  if (refreshToken) {
    const { encrypted } = await encryptToken(refreshToken, encryptionKey);
    encryptedRefreshToken = encrypted;
  }

  // Store in Supabase
  const supabaseUrl = env.SUPABASE_URL || "https://jstojewashwoswsskwjk.supabase.co";
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/post_platform_tokens`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      user_id: userId,
      platform,
      profile_label: `${platform.charAt(0).toUpperCase() + platform.slice(1)} Account`,
      access_token_encrypted: encryptedAccessToken,
      refresh_token_encrypted: encryptedRefreshToken,
      platform_user_id: platformUserId,
      platform_handle: platformHandle,
      metadata: metadata || {},
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to store platform token: ${response.status} - ${errorText}`);
  }
}

/**
 * Refresh platform token if expired
 */
export async function refreshPlatformTokenIfNeeded(
  env: Env,
  userId: string,
  platform: string
): Promise<void> {
  // Import logging
  const { logPlatformError, ErrorType, ErrorSeverity } = await import("./logging");

  try {
    // Fetch current token from database
    const supabaseUrl = env.SUPABASE_URL || "https://jstojewashwoswsskwjk.supabase.co";
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
    }

    const response = await fetch(
      `${supabaseUrl}/rest/v1/post_platform_tokens?user_id=eq.${userId}&platform=eq.${platform}&is_active=eq.true`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch platform token: ${response.status}`);
    }

    const tokens = await response.json();

    if (!tokens || tokens.length === 0) {
      return; // No token to refresh
    }

    const token = tokens[0];

    // Check if token needs refresh (expiring within 7 days)
    if (token.token_expires_at) {
      const expiresAt = new Date(token.token_expires_at);
      const daysUntilExpiry = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);

      if (daysUntilExpiry > 7) {
        return; // Token doesn't need refresh yet
      }
    } else if (!token.refresh_token_encrypted) {
      return; // No expiry info and no refresh token, can't refresh
    }

    // Token needs refresh - proceed with refresh logic
    let newAccessToken: string;
    let newRefreshToken: string | undefined;

    switch (platform) {
      case "linkedin":
        // Refresh LinkedIn token
        const linkedInConfig = getLinkedInOAuthConfig(env);
        const { decryptData, getEncryptionKey } = await import("./crypto");
        const encryptionKey = await getEncryptionKey(env.ENCRYPTION_KEY || "default-encryption-key");
        const currentRefreshToken = await decryptData(token.refresh_token_encrypted, encryptionKey);

        const linkedInTokens = await refreshAccessToken(linkedInConfig, currentRefreshToken);
        newAccessToken = linkedInTokens.access_token;
        newRefreshToken = linkedInTokens.refresh_token;
        break;

      // Add refresh logic for other platforms as needed
      case "facebook":
      case "instagram":
      case "threads":
        // Meta platforms use similar token refresh
        const metaConfig = platform === "facebook" ? getFacebookOAuthConfig(env) :
                         platform === "instagram" ? getInstagramOAuthConfig(env) :
                         getThreadsOAuthConfig(env);
        
        const metaRefreshToken = await (async () => {
          const { decryptData, getEncryptionKey } = await import("./crypto");
          const encryptionKey = await getEncryptionKey(env.ENCRYPTION_KEY || "default-encryption-key");
          return await decryptData(token.refresh_token_encrypted, encryptionKey);
        })();

        const metaTokens = await refreshAccessToken(metaConfig, metaRefreshToken);
        newAccessToken = metaTokens.access_token;
        newRefreshToken = metaTokens.refresh_token;
        break;

      default:
        // Platform doesn't support token refresh or not implemented yet
        return;
    }

    // Store updated token
    await storePlatformToken(
      env,
      userId,
      platform,
      newAccessToken,
      newRefreshToken,
      token.platform_user_id,
      token.platform_handle,
      token.metadata
    );

    // Log successful refresh
    await logSuccess(
      "token_refresh",
      { platform, user_id: userId },
      userId
    );

  } catch (error) {
    await logPlatformError(
      platform,
      ErrorType.TOKEN_EXPIRED,
      `Failed to refresh platform token: ${error instanceof Error ? error.message : "Unknown error"}`,
      { userId },
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Delete platform token
 */
export async function deletePlatformToken(
  env: Env,
  userId: string,
  platform: string,
  profileLabel?: string
): Promise<void> {
  const supabaseUrl = env.SUPABASE_URL || "https://jstojewashwoswsskwjk.supabase.co";
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
  }

  let url = `${supabaseUrl}/rest/v1/post_platform_tokens?user_id=eq.${userId}&platform=eq.${platform}`;
  if (profileLabel) {
    url += `&profile_label=eq.${encodeURIComponent(profileLabel)}`;
  }

  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to delete platform token: ${response.status} - ${errorText}`);
  }
}

// Helper function for success logging
async function logSuccess(
  operation: string,
  details: Record<string, unknown>,
  userId?: string
): Promise<void> {
  const { logSuccess: logSuccessFn } = await import("./logging");
  await logSuccessFn(operation, details, userId);
}