/**
 * X (Twitter) OAuth 1.0a 3-legged flow — reviewer/sandbox scaffold.
 * Reuses the existing OAuth 1.0a posting adapter (src/platforms/x.ts).
 */

import { FREESURF } from "../freesurf.config";
import { storeDirectAccount, type StoredDirectAccount } from "./standard";

export interface XOAuthEnv {
  RATE_LIMITS?: KVNamespace;
  SUPABASE_SECRET_KEY?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  X_CONSUMER_KEY?: string;
  X_CONSUMER_KEY_SECRET?: string;
}

export async function startXAuth(
  userId: string,
  env: XOAuthEnv
): Promise<string | null> {
  if (!env.X_CONSUMER_KEY || !env.X_CONSUMER_KEY_SECRET) return null;
  if (!env.RATE_LIMITS) throw new Error("OAuth state store is not configured");

  const callback = `${FREESURF.APP.URL}/api/oauth/x/callback`;
  const url = "https://api.twitter.com/oauth/request_token";
  const header = await oauth1Header(
    "POST",
    url,
    env.X_CONSUMER_KEY,
    env.X_CONSUMER_KEY_SECRET,
    undefined,
    undefined,
    { oauth_callback: callback }
  );

  const res = await fetch(url, { method: "POST", headers: { Authorization: header } });
  const text = await res.text();
  if (!res.ok) throw new Error(`X request token failed (${res.status}): ${text}`);

  const params = new URLSearchParams(text);
  const token = params.get("oauth_token");
  const secret = params.get("oauth_token_secret");
  if (!token || !secret) throw new Error("X request token response is missing a token");

  await env.RATE_LIMITS.put(
    `oauth:x:${token}`,
    JSON.stringify({ userId, requestSecret: secret }),
    { expirationTtl: 600 }
  );

  return `https://api.twitter.com/oauth/authorize?oauth_token=${encodeURIComponent(token)}`;
}

export async function completeXAuth(
  env: XOAuthEnv,
  oauthToken: string,
  oauthVerifier: string
): Promise<{ platform: string; connected: string[] }> {
  if (!env.RATE_LIMITS) throw new Error("OAuth state store is not configured");
  if (!env.SUPABASE_SECRET_KEY || !env.TOKEN_ENCRYPTION_KEY) {
    throw new Error("Token storage is not configured");
  }
  if (!env.X_CONSUMER_KEY || !env.X_CONSUMER_KEY_SECRET) {
    throw new Error("X OAuth is not configured");
  }

  const key = `oauth:x:${oauthToken}`;
  const raw = await env.RATE_LIMITS.get(key);
  await env.RATE_LIMITS.delete(key);
  if (!raw) throw new Error("X OAuth state expired");

  const pending = JSON.parse(raw) as { userId?: string; requestSecret?: string };
  if (!pending.userId || !pending.requestSecret) throw new Error("X OAuth state is invalid");

  const url = "https://api.twitter.com/oauth/access_token";
  const header = await oauth1Header(
    "POST",
    url,
    env.X_CONSUMER_KEY,
    env.X_CONSUMER_KEY_SECRET,
    oauthToken,
    pending.requestSecret,
    { oauth_verifier: oauthVerifier }
  );

  const res = await fetch(url, { method: "POST", headers: { Authorization: header } });
  const text = await res.text();
  if (!res.ok) throw new Error(`X access token failed (${res.status}): ${text}`);

  const params = new URLSearchParams(text);
  const accessToken = params.get("oauth_token");
  const accessSecret = params.get("oauth_token_secret");
  const userId = params.get("user_id");
  const screenName = params.get("screen_name");
  if (!accessToken || !accessSecret || !userId) {
    throw new Error("X access token response is incomplete");
  }

  const row: StoredDirectAccount = {
    platform: "x",
    handle: screenName || "X",
    platformUserId: userId,
    accessToken,
    metadata: {
      connection: "direct",
      access_secret: accessSecret,
      consumer_key: env.X_CONSUMER_KEY,
      consumer_secret: env.X_CONSUMER_KEY_SECRET,
    },
  };
  await storeDirectAccount(env, pending.userId, row);

  return { platform: "x", connected: ["x"] };
}

async function oauth1Header(
  method: string,
  url: string,
  consumerKey: string,
  consumerSecret: string,
  token?: string,
  tokenSecret?: string,
  extra: Record<string, string> = {}
): Promise<string> {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: "1.0",
    ...(token ? { oauth_token: token } : {}),
    ...extra,
  };

  const paramStr = Object.keys(oauthParams)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(oauthParams[key])}`)
    .join("&");
  const signatureBase = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(paramStr)}`;
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret || "")}`;

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
    new TextEncoder().encode(signatureBase)
  );
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)));

  const headerParams: Record<string, string> = {
    ...oauthParams,
    oauth_signature: signatureB64,
  };
  return `OAuth ${Object.keys(headerParams)
    .sort()
    .map((key) => `${percentEncode(key)}="${percentEncode(headerParams[key])}"`)
    .join(", ")}`;
}

function percentEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

function nonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
