/**
 * X DMs — read recent direct messages via X API v2 (OAuth 1.0a user context).
 *
 * DMs are user-context only: an app-only bearer token will NOT work. This uses
 * the CONSUMER_KEY / ACCESS_TOKEN pair from .env, same as x-post.mjs.
 *
 * Usage:
 *   node social/x-dms.mjs                      # latest DM events
 *   node social/x-dms.mjs --limit 50           # up to 100
 *   node social/x-dms.mjs --with <user-id>     # one conversation
 *   node social/x-dms.mjs --json               # raw JSON
 *
 * Env (either prefix works, matching x-post.mjs):
 *   X_CONSUMER_KEY / CONSUMER_KEY
 *   X_CONSUMER_KEY_SECRET / CONSUMER_KEY_SECRET
 *   X_ACCESS_TOKEN / ACCESS_TOKEN
 *   X_ACCESS_TOKEN_SECRET / ACCESS_TOKEN_SECRET
 */

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

for (const envPath of [
  resolve(__dirname, "..", ".env"),
  resolve(__dirname, "..", "..", ".env"),
]) {
  try {
    const envFile = readFileSync(envPath, "utf-8");
    for (const line of envFile.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        const idx = trimmed.indexOf("=");
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
    break;
  } catch { /* try next location */ }
}

function getEnv(name, ...fallbacks) {
  for (const key of [name, ...fallbacks]) {
    const val = process.env[key]?.trim();
    if (val) return val;
  }
  return undefined;
}

const consumerKey = getEnv("X_CONSUMER_KEY", "CONSUMER_KEY");
const consumerSecret = getEnv("X_CONSUMER_KEY_SECRET", "CONSUMER_KEY_SECRET");
const accessToken = getEnv("X_ACCESS_TOKEN", "ACCESS_TOKEN");
const accessTokenSecret = getEnv("X_ACCESS_TOKEN_SECRET", "ACCESS_TOKEN_SECRET");

if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
  console.error("Missing X OAuth 1.0a credentials (consumer key/secret + access token/secret).");
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { limit: 10, with: "", json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--limit") opts.limit = Math.min(Number(argv[++i]) || 10, 100);
    else if (arg === "--with") opts.with = argv[++i]?.trim() ?? "";
    else if (arg === "--json") opts.json = true;
  }
  return opts;
}

function rfc3986(value) {
  return encodeURIComponent(value)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

function oauthHeader(method, fullUrl) {
  const parsed = new URL(fullUrl);
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: Array.from({ length: 32 }, () =>
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[
        Math.floor(Math.random() * 62)
      ]
    ).join(""),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: "1.0",
  };

  const queryParams = {};
  for (const [k, v] of parsed.searchParams) queryParams[k] = v;

  const allParams = { ...oauthParams, ...queryParams };
  const encodedParams = Object.entries(allParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${rfc3986(k)}=${rfc3986(v)}`)
    .join("&");

  const baseUrl = `${parsed.origin}${parsed.pathname}`;
  const signatureBase = [method.toUpperCase(), rfc3986(baseUrl), rfc3986(encodedParams)].join("&");
  const signingKey = `${rfc3986(consumerSecret)}&${rfc3986(accessTokenSecret)}`;
  const signature = createHmac("sha1", signingKey).update(signatureBase).digest("base64");

  const headerParams = { ...oauthParams, oauth_signature: signature };
  return "OAuth " + Object.entries(headerParams)
    .map(([k, v]) => `${rfc3986(k)}="${rfc3986(v)}"`)
    .join(", ");
}

async function xGet(url) {
  const res = await fetch(url, {
    headers: { Authorization: oauthHeader("GET", url) },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  return { res, body };
}

const opts = parseArgs(process.argv.slice(2));
const params = new URLSearchParams();
params.set("max_results", String(opts.limit));
params.set("dm_event.fields", "created_at,sender_id,text,attachments,dm_conversation_id,event_type");
params.set("expansions", "sender_id");
params.set("user.fields", "username,name");

const base = opts.with
  ? `https://api.x.com/2/dm_conversations/with/${encodeURIComponent(opts.with)}/dm_events`
  : "https://api.x.com/2/dm_events";
const url = `${base}?${params.toString()}`;

const { res, body } = await xGet(url);

if (!res.ok) {
  console.error(`X API ${res.status}: ${JSON.stringify(body, null, 2)}`);
  const note = body?.title || body?.detail || body?.errors?.[0]?.message || "";
  if (res.status === 401 || res.status === 403) {
    console.error("\nHint: DM reads need user-context auth (OAuth 1.0a / OAuth 2.0 user tokens)");
    console.error("and an access level that includes Direct Messages (not the Free tier).");
  }
  if (note) console.error(`\n${note}`);
  process.exit(1);
}

if (opts.json) {
  console.log(JSON.stringify(body, null, 2));
  process.exit(0);
}

const users = new Map((body.includes?.users ?? []).map((u) => [u.id, u]));
const events = body.data ?? [];

if (events.length === 0) {
  console.log("\nNo DM events returned.");
  console.log("(DMs only appear if the account received them and your access level allows reads.)\n");
  process.exit(0);
}

console.log(`\n${"=".repeat(72)}`);
console.log(`  ${events.length} DM event(s)`);
console.log(`${"=".repeat(72)}`);

for (const ev of events) {
  const sender = users.get(ev.sender_id);
  const who = sender ? `@${sender.username} (${sender.name})` : ev.sender_id;
  const conv = ev.dm_conversation_id ? `  conv: ${ev.dm_conversation_id}` : "";
  console.log(`\n${ev.created_at ?? "?"}  ${who}${conv}`);
  if (ev.text) console.log(`  ${ev.text.replace(/\n/g, "\n  ")}`);
  if (ev.attachments?.media_keys?.length) {
    console.log(`  [${ev.attachments.media_keys.length} attachment(s)]`);
  }
}

console.log(`\n${"=".repeat(72)}\n`);
