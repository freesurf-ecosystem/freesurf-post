#!/usr/bin/env node
/**
 * Local LinkedIn OAuth demo — personal and company-page posting.
 *
 * Setup:
 *   1. Add http://localhost:8788/callback to your LinkedIn app's authorized
 *      redirect URLs (or set LINKEDIN_REDIRECT_URI to an HTTPS tunnel).
 *   2. Put LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in .dev.vars or env.
 *   3. node social/linkedin-demo.mjs
 *   4. Open http://localhost:8788/ in a browser.
 *
 * Optional env:
 *   PORT=8788
 *   LINKEDIN_SCOPE="openid profile email w_member_social w_organization_social r_organization_social rw_organization_admin"
 *   LINKEDIN_POST_TEXT="Hello from the CatVideo demo"
 *   LINKEDIN_ORGANIZATION_URN="urn:li:organization:123"  (default: first admin org)
 *
 * Notes:
 *   - Organization posting requires Community Management API access and a Page
 *     role of ADMINISTRATOR (or CONTENT_ADMIN).
 *   - If you only have personal posting approved, set LINKEDIN_SCOPE to
 *     "openid profile email w_member_social".
 */

import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

loadEnv(".dev.vars");
loadEnv(".env");

const PORT = Number(process.env.PORT || 8788);
const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const REDIRECT_URI = process.env.LINKEDIN_REDIRECT_URI || `http://localhost:${PORT}/callback`;
const SCOPE =
  process.env.LINKEDIN_SCOPE ||
  "openid profile email w_member_social w_organization_social r_organization_social rw_organization_admin";
const VERSION = "202610";
const STATE = crypto.randomBytes(16).toString("hex");

const AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const API = "https://api.linkedin.com";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing LINKEDIN_CLIENT_ID or LINKEDIN_CLIENT_SECRET (env or .dev.vars).");
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  if (url.pathname === "/") {
    const authorize = new URL(AUTHORIZE_URL);
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("client_id", CLIENT_ID);
    authorize.searchParams.set("redirect_uri", REDIRECT_URI);
    authorize.searchParams.set("state", STATE);
    authorize.searchParams.set("scope", SCOPE);
    return redirect(res, authorize.toString());
  }

  if (url.pathname !== "/callback") {
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end("Not found");
  }

  const error = url.searchParams.get("error");
  if (error) return html(res, 400, `<h1>LinkedIn error</h1><pre>${escapeHtml(error)}</pre>`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code) return html(res, 400, "<h1>Missing code</h1>");
  if (state !== STATE) return html(res, 400, "<h1>State mismatch</h1>");

  try {
    const tokens = await exchangeCode(code);
    const user = await userInfo(tokens.access_token);
    const personUrn = `urn:li:person:${user.sub}`;
    const orgs = await listAdminOrganizations(tokens.access_token);

    console.log("\nAuthorized:", user.name || personUrn);
    console.log("Granted scopes:", tokens.scope);
    console.log("Organizations:", orgs.length ? orgs.map((o) => `${o.urn} (${o.role})`).join(", ") : "(none)");

    let post = null;
    const text = process.env.LINKEDIN_POST_TEXT;
    if (text) {
      const orgUrn = process.env.LINKEDIN_ORGANIZATION_URN || orgs[0]?.urn;
      const author = orgUrn || personUrn;
      post = await createPost(tokens.access_token, author, text);
      console.log("Posted as", author, "->", post.url);
    }

    const body = `
      <h1>LinkedIn demo</h1>
      <p>Authorized as <strong>${escapeHtml(user.name || personUrn)}</strong></p>
      <p>Granted scopes: <code>${escapeHtml(tokens.scope)}</code></p>
      <h2>Organizations</h2>
      <ul>${orgs.map((o) => `<li><code>${escapeHtml(o.urn)}</code> — ${escapeHtml(o.role)} / ${escapeHtml(o.state)}</li>`).join("") || "<li>None</li>"}</ul>
      ${post ? `<h2>Post created</h2><p><a href="${escapeHtml(post.url)}">${escapeHtml(post.url)}</a></p>` : ""}
      <p>You can close this tab. Press Ctrl+C in the terminal to stop the demo.</p>`;
    return html(res, 200, body);
  } catch (err) {
    console.error(err);
    return html(res, 500, `<h1>Demo failed</h1><pre>${escapeHtml(String(err?.stack || err))}</pre>`);
  }
});

server.listen(PORT, () => {
  console.log(`LinkedIn demo running. Open http://localhost:${PORT}/`);
  console.log(`Redirect URI: ${REDIRECT_URI}`);
  console.log(`Scope: ${SCOPE}`);
});

async function exchangeCode(code) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`Token exchange failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return json;
}

async function userInfo(accessToken) {
  const res = await fetch(`${API}/v2/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`userinfo failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function listAdminOrganizations(accessToken) {
  const out = [];
  let start = 0;
  const count = 100;
  for (;;) {
    const url = new URL(`${API}/rest/organizationAcls`);
    url.searchParams.set("q", "roleAssignee");
    url.searchParams.set("role", "ADMINISTRATOR");
    url.searchParams.set("state", "APPROVED");
    url.searchParams.set("count", String(count));
    url.searchParams.set("start", String(start));
    const res = await restFetch(url.toString(), accessToken, { method: "GET" });
    if (!res.ok) throw new Error(`organizationAcls failed (${res.status}): ${await res.text()}`);
    const json = await res.json();
    const elements = json.elements || [];
    for (const el of elements) {
      const urn = String(el.organization || el.organizationTarget || "");
      if (urn.startsWith("urn:li:organization:")) {
        out.push({ urn, role: el.role, state: el.state });
      }
    }
    if (elements.length < count) break;
    start += count;
  }
  return out;
}

async function createPost(accessToken, authorUrn, commentary) {
  const res = await restFetch(`${API}/rest/posts`, accessToken, {
    method: "POST",
    body: JSON.stringify({
      author: authorUrn,
      commentary,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });
  if (!res.ok) throw new Error(`create post failed (${res.status}): ${await res.text()}`);
  const id = res.headers.get("x-restli-id") || "";
  return { id, url: id ? `https://www.linkedin.com/feed/update/${id}/` : "" };
}

function restFetch(url, accessToken, init) {
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "Linkedin-Version": VERSION,
      ...(init.headers || {}),
    },
  });
}

function loadEnv(file) {
  const full = path.join(process.cwd(), file);
  if (!fs.existsSync(full)) return;
  for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function html(res, status, body) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>LinkedIn demo</title></head><body style="font-family:system-ui;max-width:760px;margin:40px auto;padding:0 20px">${body}</body></html>`);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
