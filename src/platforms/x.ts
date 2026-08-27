import type { PlatformPostResult, PlatformMetrics } from "../types";

/**
 * Post to X (Twitter) via API v2 using OAuth 1.0a User Context.
 *
 * OAuth 1.0a requires HMAC-SHA1 signing, which is implemented using
 * the Web Crypto API (available in Cloudflare Workers).
 *
 * Requires four OAuth 1.0a tokens:
 *   X_CONSUMER_KEY, X_CONSUMER_KEY_SECRET
 *   X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET
 */
export async function postToX(
  text: string,
  consumerKey: string,
  consumerSecret: string,
  accessToken: string,
  accessTokenSecret: string,
  replyTo?: string
): Promise<PlatformPostResult> {
  try {
    const body: Record<string, unknown> = { text };
    if (replyTo) {
      body.reply = { in_reply_to_tweet_id: replyTo };
    }

    const url = "https://api.x.com/2/tweets";
    const method = "POST";
    const oauthHeader = await generateOAuth1Header(
      method,
      url,
      consumerKey,
      consumerSecret,
      accessToken,
      accessTokenSecret
    );

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: oauthHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as {
      data?: { id: string; text: string };
      errors?: Array<{ message: string }>;
    };

    if (!res.ok) {
      return {
        platform: "x",
        success: false,
        error: `X error ${res.status}: ${data.errors?.[0]?.message ?? JSON.stringify(data)}`,
      };
    }

    const tweetId = data.data!.id;
    return {
      platform: "x",
      success: true,
      postId: tweetId,
      postUrl: `https://x.com/i/status/${tweetId}`,
    };
  } catch (e) {
    return {
      platform: "x",
      success: false,
      error: e instanceof Error ? e.message : "Unknown X error",
    };
  }
}

/**
 * Delete a tweet.
 */
export async function deleteFromX(
  tweetId: string,
  consumerKey: string,
  consumerSecret: string,
  accessToken: string,
  accessTokenSecret: string
): Promise<PlatformPostResult> {
  try {
    const url = `https://api.x.com/2/tweets/${tweetId}`;
    const method = "DELETE";
    const oauthHeader = await generateOAuth1Header(
      method,
      url,
      consumerKey,
      consumerSecret,
      accessToken,
      accessTokenSecret
    );

    const res = await fetch(url, {
      method,
      headers: { Authorization: oauthHeader },
    });

    if (!res.ok) {
      const data = (await res.json()) as { errors?: Array<{ message: string }> };
      return {
        platform: "x",
        success: false,
        error: `X delete error: ${data.errors?.[0]?.message ?? res.status}`,
      };
    }

    return { platform: "x", success: true, postId: tweetId };
  } catch (e) {
    return {
      platform: "x",
      success: false,
      error: e instanceof Error ? e.message : "Unknown X error",
    };
  }
}

/**
 * Read metrics for a tweet.
 * Note: Requires at least X API Basic tier ($100/mo) for reliable access.
 */
export async function getXMetrics(
  tweetId: string,
  bearerToken: string
): Promise<PlatformMetrics> {
  try {
    const res = await fetch(
      `https://api.x.com/2/tweets/${tweetId}?tweet.fields=public_metrics`,
      {
        headers: { Authorization: `Bearer ${bearerToken}` },
      }
    );

    if (!res.ok) {
      throw new Error(`X metrics failed: ${res.status}`);
    }

    const data = (await res.json()) as {
      data?: {
        public_metrics?: {
          like_count: number;
          retweet_count: number;
          reply_count: number;
          quote_count: number;
          impression_count?: number;
        };
      };
    };

    const m = data.data?.public_metrics;
    return {
      platform: "x",
      likes: m?.like_count ?? 0,
      shares: (m?.retweet_count ?? 0) + (m?.quote_count ?? 0),
      comments: m?.reply_count ?? 0,
      impressions: m?.impression_count ?? 0,
      clicks: 0,
    };
  } catch {
    return { platform: "x", likes: 0, shares: 0, comments: 0 };
  }
}

// ── OAuth 1.0a HMAC-SHA1 signing (Web Crypto API) ──────────────────────────

async function generateOAuth1Header(
  method: string,
  url: string,
  consumerKey: string,
  consumerSecret: string,
  accessToken: string,
  accessTokenSecret: string
): Promise<string> {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_token: accessToken,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_nonce: generateNonce(),
    oauth_version: "1.0",
  };

  // Build signature base string
  const paramStr = Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(oauthParams[k])}`)
    .join("&");

  const signatureBase = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(paramStr)}`;
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(accessTokenSecret)}`;

  // HMAC-SHA1 sign
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingKey),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signatureBase));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sig)));

  // Build Authorization header
  const headerParams: Record<string, string> = { ...oauthParams, oauth_signature: signature };
  const headerStr = Object.keys(headerParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(headerParams[k])}"`)
    .join(", ");

  return `OAuth ${headerStr}`;
}

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

function generateNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const random = crypto.getRandomValues(new Uint8Array(32));
  for (let i = 0; i < 32; i++) {
    result += chars[random[i] % chars.length];
  }
  return result;
}
