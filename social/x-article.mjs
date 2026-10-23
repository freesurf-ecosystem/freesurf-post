/**
 * X Article — Create + publish a long-form Article via X API v2 Articles endpoints.
 *
 * Endpoints:
 *   POST https://api.x.com/2/articles/draft
 *   POST https://api.x.com/2/articles/{article_id}/publish
 *
 * Auth: OAuth 1.0a User Context (same tokens as x-post.mjs).
 *   consumer_key / consumer_key_secret / access_token / access_token_secret
 *
 * Usage:
 *   node social/x-article.mjs --title "My article" --file body.md
 *   node social/x-article.mjs --title "My article" "Paragraph one"
 *   node social/x-article.mjs --title "My article" --draft-only --file body.md
 *   node social/x-article.mjs --title "My article" --dry-run --file body.md
 */

import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  const envPath = resolve(__dirname, "..", ".env");
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
} catch { /* .env not found */ }

const DRAFT_URL = "https://api.x.com/2/articles/draft";

function getEnv(name, ...fallbacks) {
  for (const key of [name, ...fallbacks]) {
    const val = process.env[key]?.trim();
    if (val) return val;
  }
  return undefined;
}

function parseArgs(argv) {
  const options = { title: "", file: "", dryRun: false, draftOnly: false, textParts: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--title") options.title = argv[++i]?.trim() ?? "";
    else if (arg === "--file") options.file = argv[++i]?.trim() ?? "";
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--draft-only") options.draftOnly = true;
    else options.textParts.push(arg);
  }
  return options;
}

function oauthHeader(method, url, consumerKey, consumerSecret, accessToken, accessTokenSecret) {
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

  const encodedParams = Object.entries(oauthParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const signatureBase = [method.toUpperCase(), encodeURIComponent(url), encodeURIComponent(encodedParams)].join("&");
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(accessTokenSecret)}`;
  const signature = createHmac("sha1", signingKey).update(signatureBase).digest("base64");
  oauthParams.oauth_signature = signature;

  return "OAuth " +
    Object.entries(oauthParams)
      .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
      .join(", ");
}

function getXCredentials() {
  const consumerKey = getEnv("consumer_key", "X_CONSUMER_KEY");
  const consumerSecret = getEnv("consumer_key_secret", "X_CONSUMER_KEY_SECRET");
  const accessToken = getEnv("access_token", "X_ACCESS_TOKEN");
  const accessTokenSecret = getEnv("access_token_secret", "X_ACCESS_TOKEN_SECRET");

  const missing = [];
  if (!consumerKey) missing.push("consumer_key / X_CONSUMER_KEY");
  if (!consumerSecret) missing.push("consumer_key_secret / X_CONSUMER_KEY_SECRET");
  if (!accessToken) missing.push("access_token / X_ACCESS_TOKEN");
  if (!accessTokenSecret) missing.push("access_token_secret / X_ACCESS_TOKEN_SECRET");
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(", ")}`);

  return { consumerKey, consumerSecret, accessToken, accessTokenSecret };
}

// Minimal Markdown -> DraftJS content_state (blocks + entities).
// Supports: # / ## / ### headers, "- " / "* " lists, "1. " ordered lists,
// "> " blockquotes, and plain paragraphs split on blank lines.
function markdownToContentState(markdown) {
  const blocks = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");

  for (const raw of lines) {
    const line = raw;
    let block = null;

    if (/^###\s+/.test(line)) block = { type: "header-three", text: line.replace(/^###\s+/, "") };
    else if (/^##\s+/.test(line)) block = { type: "header-two", text: line.replace(/^##\s+/, "") };
    else if (/^#\s+/.test(line)) block = { type: "header-one", text: line.replace(/^#\s+/, "") };
    else if (/^>\s?/.test(line)) block = { type: "blockquote", text: line.replace(/^>\s?/, "") };
    else if (/^\s*[-*]\s+/.test(line)) block = { type: "unordered-list-item", text: line.replace(/^\s*[-*]\s+/, "") };
    else if (/^\s*\d+[.)]\s+/.test(line)) block = { type: "ordered-list-item", text: line.replace(/^\s*\d+[.)]\s+/, "") };
    else if (line.trim() === "") continue;
    else block = { type: "unstyled", text: line };

    if (block) blocks.push(block);
  }

  return { blocks, entities: [] };
}

async function createDraft(title, contentState, creds) {
  const authHeader = oauthHeader("POST", DRAFT_URL, creds.consumerKey, creds.consumerSecret, creds.accessToken, creds.accessTokenSecret);
  const res = await fetch(DRAFT_URL, {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/json" },
    body: JSON.stringify({ title, content_state: contentState }),
  });
  const body = await res.json();
  if (!res.ok) {
    const err = new Error(`X draft error ${res.status}: ${JSON.stringify(body, null, 2)}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

async function publishArticle(articleId, creds) {
  const url = `https://api.x.com/2/articles/${articleId}/publish`;
  const authHeader = oauthHeader("POST", url, creds.consumerKey, creds.consumerSecret, creds.accessToken, creds.accessTokenSecret);
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: authHeader },
  });
  const body = await res.json();
  if (!res.ok) {
    const err = new Error(`X publish error ${res.status}: ${JSON.stringify(body, null, 2)}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

// ── Main ────────────────────────────────────────────────────────────────────

const opts = parseArgs(process.argv.slice(2));

let body = opts.textParts.join(" ").trim();
if (opts.file) {
  body = await readFile(opts.file, "utf-8");
  body = body.trim();
}
if (!body && !process.stdin.isTTY) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  body = Buffer.concat(chunks).toString("utf-8").trim();
}

if (!opts.title) {
  console.log('Usage: node social/x-article.mjs --title "My article" --file body.md');
  process.exit(1);
}
if (!body) {
  console.log("Error: no article body provided (use --file or pass text).");
  process.exit(1);
}

const contentState = markdownToContentState(body);

if (opts.dryRun) {
  console.log("\n[DRY-RUN] Would create Article draft on X:\n");
  console.log(`  Title: ${opts.title}`);
  console.log(`  Blocks: ${contentState.blocks.length}`);
  console.log(`  Content state: ${JSON.stringify(contentState, null, 2)}`);
  process.exit(0);
}

try {
  const creds = getXCredentials();

  const draft = await createDraft(opts.title, contentState, creds);
  const articleId = draft.data?.id;
  console.log(`\nDraft created`);
  console.log(`  Article ID: ${articleId}`);

  if (opts.draftOnly) {
    console.log(`  [draft-only] Not published. Publish with: POST /2/articles/${articleId}/publish\n`);
    process.exit(0);
  }

  const published = await publishArticle(articleId, creds);
  const postId = published.data?.post_id;
  console.log(`Published`);
  console.log(`  Post ID: ${postId}`);
  console.log(`  Post URL: https://x.com/i/status/${postId}\n`);
} catch (err) {
  console.error(`\nX article failed: ${err.message}\n`);
  process.exit(1);
}
