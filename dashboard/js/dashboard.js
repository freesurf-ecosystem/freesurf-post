// ── FreeSurf Post — Dashboard ──
import { getSharedSession, clearSharedSession } from "./freesurf-auth.js";
import config from "./freesurf.config.js";

const API_BASE = config.URLS.post;
const CHAR_SOFT_LIMIT = 300;
const CHAR_HARD_LIMIT = 5000;
const SUPABASE_URL = config.AUTH.SUPABASE_URL;
const SUPABASE_ANON_KEY = config.AUTH.SUPABASE_ANON_KEY;

// ── Platform config ──
const PLATFORMS = [
  { key: "bluesky",   name: "Bluesky",   oauth: false },
  { key: "x",         name: "X",          oauth: true },
  { key: "linkedin",  name: "LinkedIn",   oauth: true },
  { key: "facebook",  name: "Facebook",   oauth: true },
  { key: "instagram", name: "Instagram",  oauth: true, requiresMedia: "media" },
  { key: "threads",   name: "Threads",    oauth: true },
  { key: "tiktok",    name: "TikTok",     oauth: true, requiresMedia: "video" },
  { key: "youtube",   name: "YouTube",    oauth: true, requiresMedia: "video" },
  { key: "reddit",    name: "Reddit",     oauth: true },
  { key: "pinterest", name: "Pinterest",  oauth: true },
  { key: "slack",     name: "Slack",      oauth: true },
  { key: "discord",   name: "Discord",    oauth: true },
  { key: "google_business", name: "Google Business", oauth: true },
];

// Platforms that need a selected Page/Channel/Organization after OAuth
const CHANNEL_PLATFORMS = new Set(["linkedin", "facebook", "youtube"]);

// Platforms that need a per-post target (channel/board/subreddit) entered in compose.
const PLATFORM_TARGETS = {
  discord: { label: "Discord channel ID", placeholder: "e.g. 123456789012345678" },
  slack: { label: "Slack channel ID", placeholder: "e.g. C0123ABCDEF" },
  pinterest: { label: "Pinterest board", placeholder: "e.g. My Board" },
  reddit: { label: "Subreddit", placeholder: "e.g. r/example" },
};

// ── State ──
let session = null;
let connectedProfiles = []; // { platform, label, handle, id }[]
let composeAccounts = [];   // accounts for the team selected in the compose dropdown
let postHistory = [];
let scheduledPosts = [];
let currentView = "compose";
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let calSelected = null;

const $ = (s) => document.querySelector(s);

// ── API helper: prepends API_BASE, attaches the session token, and retries
// once with a freshly-refreshed session if the server says the token is stale.
// If the session is truly dead, asks the user to sign in again. ──
async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (session?.access_token && !headers.Authorization) headers.Authorization = `Bearer ${session.access_token}`;
  let res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    const fresh = await getSharedSession();
    if (fresh?.accessToken) {
      session = { ...session, ...fresh };
      headers.Authorization = `Bearer ${fresh.accessToken}`;
      res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    }
    if (res.status === 401) handleExpiredSession();
  }
  return res;
}

function handleExpiredSession() {
  if (!session) return;
  session = null;
  connectedProfiles = [];
  renderAuthUI();
  renderPlatformChips();
  showView("welcome");
  showFeedback("Your session expired. Please sign in again.", "warning");
}

// ── Custom confirmation modal (replaces window.confirm so browsers can't
// auto-block prompts / show "don't prompt again"). ──
function confirmModal(message, title = "Are you sure?") {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-header"><div class="modal-title">${esc(title)}</div></div>
        <div class="modal-body"><p style="margin:0;color:var(--text);font-size:0.9375rem;">${esc(message)}</p></div>
        <div class="modal-footer">
          <button class="btn btn-ghost" data-m="no">Cancel</button>
          <button class="btn btn-primary" data-m="yes">Confirm</button>
        </div>
      </div>`;
    const done = (val) => { overlay.remove(); resolve(val); };
    overlay.querySelector('[data-m="no"]').addEventListener("click", () => done(false));
    overlay.querySelector('[data-m="yes"]').addEventListener("click", () => done(true));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) done(false); });
    overlay.querySelector(".modal-close")?.addEventListener("click", () => done(false));
    document.body.appendChild(overlay);
    overlay.querySelector('[data-m="yes"]')?.focus();
  });
}
const $$ = (s) => document.querySelectorAll(s);

// ── Auth ──

async function initSupabase() {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
}

async function refreshAuth() {
  try {
    await getSharedSession();
    const supabase = await initSupabase();
    const { data } = await supabase.auth.getSession();
    session = data.session;
  } catch { session = null; }
  await fetchProfiles();
  await fetchTeams();
  renderAuthUI();
}

async function fetchProfiles() {
  if (!session?.access_token) { connectedProfiles = []; return; }
  try {
    // Fetch our platform tokens
    const res = await apiFetch(`/api/profiles`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json();
    // Bluesky now connects via Bundle too; ignore any legacy local app-password token.
    connectedProfiles = (data.profiles || []).filter((p) => p.platform !== "bluesky");

    // Also fetch Bundle-connected accounts (for the selected team)
    const teamQ = accountsTeamId ? `?teamId=${encodeURIComponent(accountsTeamId)}` : "";
    const bundleRes = await apiFetch(`/api/bundle-accounts${teamQ}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const bundleData = await bundleRes.json();
    console.log("bundle-accounts", { teamId: accountsTeamId || "(active)", status: bundleRes.status, data: bundleData });
    for (const acc of bundleData || []) {
      if (!connectedProfiles.some((p) => p.platform === acc.platform && p.handle === acc.handle)) {
        connectedProfiles.push({
          platform: acc.platform,
          label: acc.handle || acc.platform,
          handle: acc.handle,
          id: `bundle-${acc.platform}`,
          channels: acc.channels || [],
          selectedChannelId: acc.selectedChannelId || "",
        });
      }
    }
  } catch {
    // keep existing profiles
  }
}

function renderAuthUI() {
  const signedIn = Boolean(session?.user);
  $("#user-email").textContent = signedIn ? session.user.email : "";
  $("#btn-sign-in").classList.toggle("hidden", signedIn);
  $("#btn-sign-out").classList.toggle("hidden", !signedIn);

  // Hide sidebar on landing page, show after sign-in
  const sidebar = $("#sidebar");
  if (sidebar) sidebar.classList.toggle("hidden", !signedIn);

  // Hide the hamburger menu on the landing page (it only makes sense when signed in)
  const menuBtn = $("#mobile-menu-btn");
  if (menuBtn) menuBtn.classList.toggle("hidden", !signedIn);

  // Show/hide nav items based on auth
  const topbarNav = $("#topbar-nav");
  if (topbarNav) {
    topbarNav.querySelectorAll(".nav-link").forEach((l) => {
      if (l.dataset.view === "compose" || l.dataset.view === "accounts") {
        l.style.display = signedIn ? "" : "none";
      }
    });
  }

  // Switch between welcome and compose
  if (!signedIn) {
    showView("welcome");
  } else if (currentView === "welcome" || currentView === "auth") {
    showView("compose");
  } else {
    showView(currentView);
  }
}

$("#btn-sign-out").addEventListener("click", async () => {
  const supabase = await initSupabase();
  await supabase.auth.signOut();
  await clearSharedSession();
  session = null;
  connectedProfiles = [];
  renderAuthUI();
  renderPlatformChips();
});

// ── Local Auth (sign in / sign up) ──

let authMode = "signin";

function showAuth() {
  setAuthMode("signin");
  $("#auth-email").value = "";
  $("#auth-password").value = "";
  $("#auth-confirm").value = "";
  $("#auth-terms").checked = false;
  $("#auth-newsletter").checked = false;
  const errEl = $("#auth-error");
  errEl.className = "feedback";
  errEl.textContent = "";
  $("#auth-form").classList.remove("hidden");
  $("#auth-verify").classList.add("hidden");
  showView("auth");
}

function showAuthVerify() {
  $("#auth-form").classList.add("hidden");
  $("#auth-verify").classList.remove("hidden");
}

function setAuthMode(mode) {
  authMode = mode;
  $("#auth-title").textContent = mode === "signin" ? "Sign in" : "Create account";
  $("#auth-subtitle").textContent =
    mode === "signin" ? "Sign in to start cross-posting." : "Create a free account to get started.";
  $("#auth-confirm-group").classList.toggle("hidden", mode === "signin");
  $("#auth-extra-group").classList.toggle("hidden", mode === "signin");
  $("#btn-auth-submit").textContent = mode === "signin" ? "Sign in" : "Create account";
  $("#btn-auth-toggle").textContent =
    mode === "signin" ? "Don't have an account? Sign up" : "Already have an account? Sign in";
  const errEl = $("#auth-error");
  errEl.className = "feedback";
  errEl.textContent = "";
}

$("#btn-sign-in").addEventListener("click", showAuth);
$("#btn-hero-signin").addEventListener("click", showAuth);
$("#btn-auth-toggle").addEventListener("click", () =>
  setAuthMode(authMode === "signin" ? "signup" : "signin")
);
$("#btn-auth-back").addEventListener("click", showAuth);

$("#btn-google").addEventListener("click", async () => {
  const errEl = $("#auth-error");
  errEl.className = "feedback";
  try {
    const supabase = await initSupabase();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
    // Supabase redirects to Google; the page reloads with a session on return.
  } catch (e) {
    errEl.className = "feedback error visible";
    errEl.textContent = e?.message || "Could not start Google sign-in. Is Google auth enabled in Supabase?";
  }
});

$("#btn-auth-submit").addEventListener("click", async () => {
  const email = $("#auth-email").value.trim();
  const password = $("#auth-password").value;
  const confirm = $("#auth-confirm").value;
  const errEl = $("#auth-error");
  errEl.className = "feedback";

  if (!email || !password) {
    errEl.className = "feedback error visible";
    errEl.textContent = "Please enter your email and password.";
    return;
  }
  if (authMode === "signup") {
    if (password.length < 6) {
      errEl.className = "feedback error visible";
      errEl.textContent = "Password must be at least 6 characters.";
      return;
    }
    if (password !== confirm) {
      errEl.className = "feedback error visible";
      errEl.textContent = "Passwords don't match.";
      return;
    }
    if (!$("#auth-terms").checked) {
      errEl.className = "feedback error visible";
      errEl.textContent = "Please agree to the Terms and Privacy Policy.";
      return;
    }
  }

  const btn = $("#btn-auth-submit");
  btn.disabled = true;
  btn.textContent = "Please wait…";

  try {
    const supabase = await initSupabase();
    if (authMode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await refreshAuth();
    } else {
      const { data: signUpData, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;

      // Record the shared ecosystem terms agreement.
      if ($("#auth-terms").checked) {
        supabase.from("consents").insert({ type: "terms", version: "1" }).then(() => {}).catch(() => {});
      }

      let digestNote = "";
      if ($("#auth-newsletter").checked) {
        try {
          const { data: digestData, error: digestError } = await supabase.functions.invoke("feedfree-create-signup", {
            body: { email, topics: [] },
          });
          if (digestError || digestData?.ok === false) {
            digestNote = " Note: we couldn't subscribe you to the FeedFree Digest — you can join at feedfree.tech.";
          }
        } catch {
          digestNote = " Note: we couldn't subscribe you to the FeedFree Digest — you can join at feedfree.tech.";
        }
      }

      if (signUpData?.session) {
        // Email confirmation is disabled — sign the user straight in.
        await refreshAuth();
      } else {
        // Email confirmation still enabled — show the verify state as a fallback.
        $("#auth-verify-text").textContent = "Check your email to verify your address and get started." + digestNote;
        showAuthVerify();
      }
      return;
    }
  } catch (e) {
    errEl.className = "feedback error visible";
    errEl.textContent = e?.message || "Authentication failed.";
  } finally {
    btn.disabled = false;
    btn.textContent = authMode === "signin" ? "Sign in" : "Create account";
  }
});

// ── Mobile Menu & Sidebar ──

const mobileMenuBtn = $("#mobile-menu-btn");
const sidebar = $("#sidebar");
const sidebarClose = $("#sidebar-close");
const sidebarOverlay = $("#sidebar-overlay");

function toggleSidebar() {
  sidebar.classList.toggle("sidebar-open");
  sidebarOverlay.classList.toggle("active");
  document.body.style.overflow = sidebar.classList.contains("sidebar-open") ? "hidden" : "";
}

if (mobileMenuBtn) {
  mobileMenuBtn.addEventListener("click", toggleSidebar);
}

if (sidebarClose) {
  sidebarClose.addEventListener("click", toggleSidebar);
}

if (sidebarOverlay) {
  sidebarOverlay.addEventListener("click", toggleSidebar);
}

// Close sidebar when clicking nav items on mobile
$$(".sidebar-nav-item").forEach((link) => {
  link.addEventListener("click", () => {
    if (window.innerWidth <= 768) {
      toggleSidebar();
    }
  });
});

// ── Navigation ──

function showView(name) {
  currentView = name;
  $$(".view").forEach((v) => v.classList.add("hidden"));
  const target = $(`#view-${name}`);
  if (target) target.classList.remove("hidden");

  // Update top nav
  $$(".nav-link").forEach((l) => l.classList.toggle("nav-link-active", l.dataset.view === name));
  
  // Update sidebar nav
  $$(".sidebar-nav-item").forEach((l) => l.classList.toggle("sidebar-nav-item-active", l.dataset.view === name));

  // Reflect the view in the URL hash for deep linking (#accounts, #analytics, …)
  try { history.replaceState(null, "", `#${name}`); } catch {}
}

const PROTECTED_VIEWS = new Set(["compose", "accounts"]);

// ── Old topbar navigation (for reference) ──
$$(".nav-link").forEach((link) => {
  link.addEventListener("click", () => {
    if (!session && (link.dataset.view === "compose" || link.dataset.view === "accounts")) {
      showView("welcome");
      return;
    }
    showView(link.dataset.view);
  });
});

// ── Sidebar navigation ──
$$(".sidebar-nav-item").forEach((link) => {
  link.addEventListener("click", () => {
    if (!session && (link.dataset.view === "compose" || link.dataset.view === "accounts")) {
      showView("welcome");
      return;
    }
    showView(link.dataset.view);
  });
});

// ── Platform Chips ──

// Platforms that are on the roadmap but not ready — shown as "In progress".
const IN_PROGRESS_PLATFORMS = new Set(["reddit", "google_business"]);

function renderPlatformChips() {
  const container = $("#platform-toggles");
  container.innerHTML = PLATFORMS.map((p) => {
    const acc = composeAccounts.find((a) => a.platform === p.key);
    const handle = acc?.handle;
    const inProgress = IN_PROGRESS_PLATFORMS.has(p.key);
    return `<label class="platform-chip${handle ? " connected" : ""}${inProgress ? " disabled" : ""}" data-platform="${p.key}" title="${inProgress ? "In progress" : ""}">
      ${handle ? '<span class="chip-connected-dot"></span>' : ""}${p.name}${inProgress ? " · soon" : ""}${handle ? ` @${handle}` : ""}
      <input type="checkbox" />
    </label>`;
  }).join("");

  container.querySelectorAll(".platform-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      if (chip.classList.contains("disabled")) return;
      const cb = chip.querySelector("input");
      cb.checked = !cb.checked;
      chip.classList.toggle("selected", cb.checked);
      updatePlatformPreviews();
    });
  });
}

function updatePlatformPreviews() {
  const selected = Array.from($$(".platform-chip.selected")).map((c) => c.dataset.platform);
  const count = $("#preview-count");
  if (count) count.textContent = `${selected.length} platform${selected.length === 1 ? "" : "s"}`;

  // "Posting to:" line beneath the platform chips for clarity.
  const postingTo = $("#posting-to-line");
  if (postingTo) {
    postingTo.textContent = selected.length
      ? `Posting to: ${selected.map((p) => PLATFORMS.find((x) => x.key === p)?.name || p).join(", ")}`
      : "No platforms selected";
  }

  // Per-post target input (Discord/Slack channel, Pinterest board, Reddit subreddit).
  const targetRow = $("#platform-target-row");
  const targetInput = $("#platform-target-input");
  const targetPlatform = selected.find((p) => PLATFORM_TARGETS[p]);
  if (targetRow && targetInput) {
    if (targetPlatform) {
      targetRow.classList.remove("hidden");
      $("#platform-target-label").textContent = PLATFORM_TARGETS[targetPlatform].label;
      targetInput.placeholder = PLATFORM_TARGETS[targetPlatform].placeholder;
      targetInput.dataset.platform = targetPlatform;
    } else {
      targetRow.classList.add("hidden");
      delete targetInput.dataset.platform;
    }
  }

  // Remind users to select a Page/Channel for Facebook, LinkedIn, YouTube.
  const reminder = $("#channel-reminder");
  if (reminder) {
    const needsChannel = selected.some((p) => {
      if (!CHANNEL_PLATFORMS.has(p)) return false;
      const acc = composeAccounts.find((a) => a.platform === p);
      return !acc || !acc.selectedChannelId;
    });
    reminder.classList.toggle("hidden", !needsChannel);
  }
}

function collectPlatformTargets() {
  const input = $("#platform-target-input");
  if (!input || !input.dataset.platform || !input.value.trim()) return {};
  return { [input.dataset.platform]: input.value.trim() };
}

function hasLink(text) {
  if (!text) return false;
  // Mirrors the backend detectHasLink exactly so the UI warning always matches
  // what the X post will actually be charged.
  return /(https?:\/\/\S+|www\.\S+|\w+\.\w+)/i.test(text);
}

function updateLinkWarning(text) {
  const el = $("#link-warning");
  if (el) el.classList.toggle("hidden", !hasLink(text));
}

// ── Compose ──

const textarea = $("#post-text");
const charCount = $("#char-count");
const btnPost = $("#btn-post");
const feedback = $("#post-feedback");

textarea.addEventListener("input", () => {
  const len = textarea.value.length;
  charCount.textContent = `${len} / ${CHAR_SOFT_LIMIT}`;
  charCount.className = "char-count";
  if (len > CHAR_HARD_LIMIT) charCount.classList.add("danger");
  else if (len > CHAR_SOFT_LIMIT) charCount.classList.add("warning");
  btnPost.disabled = len === 0 || len > CHAR_HARD_LIMIT;
  updatePlatformPreviews();
  updateLinkWarning(textarea.value);
});

btnPost.addEventListener("click", async () => {
  const text = textarea.value.trim();
  if (!text) return;
  const platforms = Array.from($$(".platform-chip.selected")).map((c) => c.dataset.platform);
  if (!platforms.length) { showFeedback("Select at least one platform.", "error"); return; }
  if (!session?.access_token) { showFeedback("Please sign in.", "error"); return; }

  for (const p of PLATFORMS) {
    if (!p.requiresMedia || !platforms.includes(p.key)) continue;
    const ok = p.requiresMedia === "video"
      ? uploadedMedia.some((m) => m.type === "video")
      : uploadedMedia.length > 0;
    if (!ok) {
      const req = p.requiresMedia === "video" ? "a video" : "an image or video";
      showFeedback(`${p.name} requires ${req}.`, "error");
      return;
    }
  }

  btnPost.disabled = true;
  btnPost.textContent = "Posting…";
  clearFeedback();

  try {
    const teamId = $("#post-team")?.value || undefined;

    // Upload any attached media to Bundle first (scoped to the selected team)
    const uploadIds = [];
    for (const m of uploadedMedia) {
      if (m.uploadId) { uploadIds.push(m.uploadId); continue; }
      const fd = new FormData();
      fd.append("file", m.file);
      if (teamId) fd.append("teamId", teamId);
      const upRes = await apiFetch(`/api/media/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: fd,
      });
      const upData = await upRes.json();
      if (!upRes.ok || !upData.uploadId) {
        showFeedback(upData.error || "Media upload failed.", "error");
        btnPost.disabled = false;
        btnPost.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg> Post`;
        return;
      }
      m.uploadId = upData.uploadId;
      uploadIds.push(upData.uploadId);
    }

    const res = await apiFetch(`/api/post`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ platforms, text, teamId, mediaUrls: uploadIds.length ? uploadIds : undefined, platformTargets: collectPlatformTargets() }),
    });
    const data = await res.json();

    if (res.ok) {
      let html = "";
      for (const r of data.results) {
        html += `<div class="feedback-result-item">
          <span class="feedback-icon ${r.success ? "feedback-icon-success" : "feedback-icon-error"}">
            ${r.success 
              ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>'
              : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
            }
          </span>
          <span><strong>${r.platform}</strong>: ${r.success ? (r.postUrl ? `<a href="${r.postUrl}" target="_blank">View →</a>` : "Posted") : r.error}</span>
        </div>`;
      }
      const ok = data.results.filter((r) => r.success).length;
      const fail = data.results.filter((r) => !r.success).length;
      showFeedback(fail === 0 ? `Posted to ${ok} platform(s)!` : `${ok} OK, ${fail} failed.`, fail === 0 ? "success" : "warning");
      feedback.insertAdjacentHTML("beforeend", `<div class="feedback-results">${html}</div>`);
      postHistory.unshift({ id: data.id, text, results: data.results, postedAt: data.postedAt });
      saveHistory();
      textarea.value = "";
      charCount.textContent = "0 / 300";
      charCount.className = "char-count";
      uploadedMedia = [];
      renderMediaPreview();
    } else {
      showFeedback(data.error || "Post failed.", "error");
    }
  } catch {
    showFeedback("Network error.", "error");
  }
  btnPost.disabled = false;
  btnPost.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg> Post`;
});

$("#btn-schedule-compose")?.addEventListener("click", async () => {
  const text = textarea.value.trim();
  if (!text) { showFeedback("Write something first.", "error"); return; }
  const platforms = Array.from($$(".platform-chip.selected")).map((c) => c.dataset.platform);
  if (!platforms.length) { showFeedback("Select at least one platform.", "error"); return; }
  if (!session?.access_token) { showFeedback("Please sign in.", "error"); return; }

  const timeEl = $("#compose-sched-time");
  let scheduledAt = timeEl?.value;
  if (!scheduledAt) {
    const d = new Date(Date.now() + 3600 * 1000);
    d.setMinutes(0, 0, 0);
    scheduledAt = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  const dt = wallClockToUTC(scheduledAt, selectedTz());
  const iso = dt.toISOString();
  if (isNaN(dt.getTime())) { showFeedback("Pick a valid schedule time.", "error"); return; }

  clearFeedback();
  try {
    const res = await apiFetch(`/api/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ platforms, text, scheduledAt: iso, teamId: $("#post-team")?.value || undefined, platformTargets: collectPlatformTargets() }),
    });
    if (res.ok) {
      showFeedback(`Scheduled for ${new Date(iso).toLocaleString()}`, "success");
      textarea.value = "";
      charCount.textContent = "0 / 300";
      charCount.className = "char-count";
      if (timeEl) timeEl.value = "";
      uploadedMedia = [];
      renderMediaPreview();
    } else {
      const err = await res.json();
      showFeedback(err.error || "Failed to schedule.", "error");
    }
  } catch {
    showFeedback("Network error.", "error");
  }
});

function showFeedback(msg, type) { feedback.className = `feedback ${type} visible`; feedback.textContent = msg; }
function clearFeedback() { feedback.className = "feedback"; feedback.innerHTML = ""; }

const TIMEZONES = [
  "UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Anchorage", "America/Phoenix", "Pacific/Honolulu", "Europe/London", "Europe/Paris",
  "Europe/Berlin", "Europe/Madrid", "Europe/Rome", "Europe/Amsterdam", "Europe/Stockholm",
  "Europe/Warsaw", "Europe/Istanbul", "Europe/Moscow", "Asia/Dubai", "Asia/Karachi",
  "Asia/Kolkata", "Asia/Bangkok", "Asia/Singapore", "Asia/Hong_Kong", "Asia/Shanghai",
  "Asia/Tokyo", "Asia/Seoul", "Australia/Sydney", "Australia/Melbourne", "Pacific/Auckland",
  "Africa/Cairo", "Africa/Johannesburg", "America/Sao_Paulo", "America/Mexico_City",
  "America/Toronto", "America/Vancouver",
];
function selectedTz() { return $("#compose-tz")?.value || "UTC"; }
function initTzSelect() {
  const sel = $("#compose-tz");
  if (!sel) return;
  let defaultTz = "UTC";
  try { defaultTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch {}
  const saved = localStorage.getItem("freesurf-post-tz");
  const tz = TIMEZONES.includes(saved) ? saved : (TIMEZONES.includes(defaultTz) ? defaultTz : "UTC");
  sel.innerHTML = TIMEZONES.map((t) => `<option value="${t}" ${t === tz ? "selected" : ""}>${t.replace(/_/g, " ")}</option>`).join("");
  sel.addEventListener("change", () => localStorage.setItem("freesurf-post-tz", sel.value));
}
function tzOffsetMs(date, tz) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(date).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - date.getTime();
  } catch { return 0; }
}
function wallClockToUTC(wallStr, tz) {
  const target = new Date(`${wallStr}:00Z`);
  let d = target;
  for (let i = 0; i < 3; i++) d = new Date(target.getTime() - tzOffsetMs(d, tz));
  return d;
}
function localDateStr(date, tz) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  } catch { return date.toISOString().slice(0, 10); }
}
initTzSelect();

// ── History (kept in localStorage, surfaced in Analytics) ──

function saveHistory() { try { localStorage.setItem("freesurf-post-history", JSON.stringify(postHistory.slice(0, 50))); } catch {} }
function loadHistory() { try { postHistory = JSON.parse(localStorage.getItem("freesurf-post-history") || "[]"); } catch { postHistory = []; } }

function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
function fmtDate(iso) {
  const d = new Date(iso), n = new Date(), m = Math.floor((n - d) / 60000);
  if (m < 1) return "Now"; if (m < 60) return `${m}m ago`; if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Accounts & OAuth ──

// ── Direct connections (our own adapters, no Bundle) ──

async function renderDirectAccounts() {
  const container = $("#direct-accounts-list");
  if (!container || !session?.access_token) return;
  try {
    const res = await apiFetch(`/api/profiles`);
    const data = await res.json();
    const profiles = (data.profiles || []).filter((p) => p.platform !== "bundle");
    container.innerHTML = profiles.length
      ? profiles.map((p) => `
          <div class="account-item">
            <div class="account-item-info">
              <div class="account-item-name">${escapeHtml(p.label)} ${p.handle ? `<span style="color:var(--text-muted);font-weight:400;">@${escapeHtml(p.handle)}</span>` : ""}</div>
              <div class="account-item-status">${escapeHtml(p.platform)}</div>
            </div>
            <button class="btn btn-sm btn-ghost" data-remove-token="${p.id}" style="color:var(--error);">Remove</button>
          </div>`).join("")
      : `<div class="account-item"><div class="account-item-status">No direct connections yet. Add a Bluesky app password to post without Bundle.</div></div>`;
    $$("[data-remove-token]").forEach((btn) => btn.addEventListener("click", () => removeDirectAccount(btn.dataset.removeToken)));
  } catch {
    container.innerHTML = `<div class="account-item"><div class="account-item-status">Could not load direct connections.</div></div>`;
  }
}

async function saveDirectBluesky() {
  const handle = $("#direct-bsky-handle")?.value.trim() || "";
  const pass = $("#direct-bsky-pass")?.value.trim() || "";
  if (!handle || !pass) { showFeedback("Enter both a Bluesky handle and app password.", "error"); return; }
  if (!session?.access_token) return;
  try {
    const res = await apiFetch(`/api/profiles/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: "bluesky", label: "Bluesky", handle, accessToken: pass }),
    });
    const data = await res.json();
    if (!res.ok) { showFeedback(data.error || "Failed to connect Bluesky.", "error"); return; }
    $("#direct-bsky-pass").value = "";
    showFeedback("Bluesky connected. Posts to Bluesky now use our adapter.", "success");
    renderDirectAccounts();
  } catch { showFeedback("Network error.", "error"); }
}

async function removeDirectAccount(id) {
  if (!(await confirmModal("Remove this direct connection?"))) return;
  try {
    const res = await apiFetch(`/api/profiles/token/${id}`, { method: "DELETE" });
    if (!res.ok) { showFeedback("Failed to remove.", "error"); return; }
    renderDirectAccounts();
  } catch { showFeedback("Network error.", "error"); }
}

function renderAccounts() {
  const platformMap = new Map();
  for (const p of connectedProfiles) {
    if (!platformMap.has(p.platform)) platformMap.set(p.platform, []);
    platformMap.get(p.platform).push(p);
  }

  $("#account-list").innerHTML = PLATFORMS.map((p) => {
    const profiles = platformMap.get(p.key) || [];
    const count = profiles.length;
    const prof = profiles[0] || {};
    const channels = prof.channels || [];
    const selectedChannel = channels.find((c) => c.id === prof.selectedChannelId);
    const handle = profiles.map((pp) => pp.handle || pp.label).filter(Boolean).join(", ");
    const status = count
      ? (selectedChannel?.name || handle || "Connected")
      : (p.note || "Not connected");

    // Platforms still on the roadmap — greyed out, no connect action yet.
    if (IN_PROGRESS_PLATFORMS.has(p.key)) {
      return `<div class="account-item" style="opacity:0.45;">
        <div class="account-item-info">
          <div class="account-item-name">${p.name}${count ? ` @${handle}` : ""}</div>
          <div class="account-item-status">In progress</div>
        </div>
      </div>`;
    }

    const channelUi = count && CHANNEL_PLATFORMS.has(p.key)
      ? (channels.length
          ? `<select class="form-select channel-select" data-channel-select="${p.key}" style="max-width:200px;">
              <option value="">No page selected</option>
              ${channels.map((c) => `<option value="${escapeHtml(c.id)}" ${c.id === prof.selectedChannelId ? "selected" : ""}>${escapeHtml(c.name || c.id)}</option>`).join("")}
            </select>
            <button class="btn btn-sm btn-ghost" data-refresh-channels="${p.key}" title="Refresh pages">↻</button>`
          : `<button class="btn btn-sm btn-ghost" data-refresh-channels="${p.key}" title="Refresh pages">Refresh pages</button>`)
      : "";

    return `<div class="account-item">
      <div class="account-item-info">
        <div class="account-item-name">${p.name}</div>
        <div class="account-item-status${count ? " connected" : ""}">${status}</div>
      </div>
      ${channelUi}
      ${count
        ? `<button class="btn btn-sm btn-ghost" data-disconnect="${p.key}">Disconnect</button>`
        : `<button class="btn btn-sm btn-secondary" data-connect="${p.key}">Connect</button>`}
    </div>`;
  }).join("");

  $$("[data-connect]").forEach((btn) => {
    btn.addEventListener("click", () => connectPlatform(btn.dataset.connect));
  });
  $$("[data-disconnect]").forEach((btn) => {
    btn.addEventListener("click", () => disconnectPlatform(btn.dataset.disconnect));
  });
  $$("[data-channel-select]").forEach((sel) => {
    sel.addEventListener("change", () => setChannel(sel.dataset.channelSelect, sel.value));
  });
  $$("[data-refresh-channels]").forEach((btn) => {
    btn.addEventListener("click", () => refreshChannels(btn.dataset.refreshChannels));
  });
}

async function setChannel(platform, channelId) {
  if (!session?.access_token) return;
  try {
    const res = await apiFetch(`/api/channel/${platform}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        action: channelId ? "set" : "unset",
        channelId: channelId || undefined,
        teamId: accountsTeamId || undefined,
      }),
    });
    if (res.ok) {
      await fetchProfiles();
      renderAccounts();
      renderPlatformChips();
    } else {
      const err = await res.json();
      alert(err.error || "Failed to set page");
    }
  } catch { alert("Network error."); }
}

async function refreshChannels(platform) {
  if (!session?.access_token) return;
  try {
    const res = await apiFetch(`/api/channel/${platform}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action: "refresh", teamId: accountsTeamId || undefined }),
    });
    if (res.ok) {
      await fetchProfiles();
      renderAccounts();
      renderPlatformChips();
    } else {
      const err = await res.json();
      alert(err.error || "Failed to refresh pages");
    }
  } catch { alert("Network error."); }
}

async function disconnectPlatform(key) {
  if (!session?.access_token) return;
  if (!(await confirmModal(`Disconnect ${key}? This removes the account from the selected team.`))) return;
  try {
    const teamQ = accountsTeamId ? `?teamId=${encodeURIComponent(accountsTeamId)}` : "";
    const res = await apiFetch(`/api/disconnect/${key}${teamQ}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      await fetchProfiles();
      renderAccounts();
      renderPlatformChips();
    } else {
      const err = await res.json();
      alert(err.error || "Failed to disconnect");
    }
  } catch {
    alert("Network error.");
  }
}

// ── Teams ──

let teams = [];
let accountsTeamId = "";
let analyticsTeamId = "";
let recentPostsAll = [];
let recentPostsShown = 5;

async function fetchTeams() {
  if (!session?.access_token) { teams = []; renderTeams(); return; }
  try {
    const res = await apiFetch(`/api/teams`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json();
    teams = data.teams || [];
  } catch { teams = []; }
  renderTeams();
}

function renderTeams() {
  const container = $("#team-list");
  if (!teams.length) {
    container.innerHTML = `<div class="account-item"><div class="account-item-info"><div class="account-item-name">No teams yet</div><div class="account-item-status">Create a team to start organizing your accounts.</div></div></div>`;
    if ($("#post-team")) $("#post-team").innerHTML = `<option value="">No teams yet</option>`;
    if ($("#analytics-team")) $("#analytics-team").innerHTML = `<option value="">No teams yet</option>`;
    updateAccountsTeamLabel();
    updatePostTeamAccounts();
    return;
  }
  container.innerHTML = teams.map((t) => {
    const selected = accountsTeamId ? accountsTeamId === t.id : t.is_active;
    return `
    <div class="account-item${selected ? " team-selected" : ""}">
      <div class="account-item-info account-item-selectable" data-team-select="${t.id}">
        <div class="account-item-name">${escapeHtml(t.label)}${t.is_active ? ' <span class="history-platform-badge">Default</span>' : ""}</div>
        <div class="account-item-status">${t.is_active ? "Default team for posts and connects" : "Click to view accounts"} · <span style="color:var(--text-muted);font-family:ui-monospace,monospace;font-size:0.75rem;">${t.id}</span>
          <button class="copy-id-btn" data-copy-team-id="${t.id}" title="Copy team ID" style="margin-left:6px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
        </div>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-sm btn-ghost" data-edit-team="${t.id}" title="Rename"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>
        ${t.is_active ? "" : `<button class="btn btn-sm btn-secondary" data-activate-team="${t.id}">Set default</button>`}
        <button class="btn btn-sm btn-ghost" data-delete-team="${t.id}">Delete</button>
      </div>
    </div>`;
  }).join("");

  $$("[data-team-select]").forEach((el) => el.addEventListener("click", () => selectTeamForView(el.dataset.teamSelect)));
  $$("[data-activate-team]").forEach((btn) => btn.addEventListener("click", () => activateTeam(btn.dataset.activateTeam)));
  $$("[data-edit-team]").forEach((btn) => btn.addEventListener("click", () => editTeam(btn.dataset.editTeam)));
  $$("[data-delete-team]").forEach((btn) => btn.addEventListener("click", () => deleteTeam(btn.dataset.deleteTeam)));
  $$("[data-copy-team-id]").forEach((btn) => btn.addEventListener("click", () => {
    navigator.clipboard?.writeText(btn.dataset.copyTeamId).then(() => alert("Team ID copied!"));
  }));

  // Populate the compose team selector (active team preselected)
  if ($("#post-team")) {
    $("#post-team").innerHTML = teams.map((t) =>
      `<option value="${t.id}" ${t.is_active ? "selected" : ""}>${escapeHtml(t.label)}</option>`
    ).join("");
  }

  // Populate the analytics team selector
  if ($("#analytics-team")) {
    $("#analytics-team").innerHTML =
      `<option value="" ${analyticsTeamId ? "" : "selected"}>All teams</option>` +
      teams.map((t) =>
        `<option value="${t.id}" ${analyticsTeamId === t.id ? "selected" : ""}>${escapeHtml(t.label)}</option>`
      ).join("");
  }
  updateAccountsTeamLabel();
  updatePostTeamAccounts();
}

function updateAccountsTeamLabel() {
  const el = $("#accounts-card-title");
  if (!el) return;
  const team = accountsTeamId
    ? teams.find((t) => t.id === accountsTeamId)
    : teams.find((t) => t.is_active);
  el.textContent = team ? `Connected accounts of ${team.label}` : "Connected accounts";
}

async function updatePostTeamAccounts() {
  if (!session?.access_token) { composeAccounts = []; renderPlatformChips(); return; }
  const teamId = $("#post-team")?.value || "";
  const teamQ = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  try {
    const res = await apiFetch(`/api/bundle-accounts${teamQ}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    composeAccounts = (await res.json()) || [];
  } catch {
    composeAccounts = [];
  }
  renderPlatformChips();
}

async function createTeam() {
  const label = prompt("Team name (e.g. Personal, Business):");
  if (!label?.trim()) return;
  try {
    const res = await apiFetch(`/api/teams`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ label: label.trim() }),
    });
    if (res.ok) {
      await fetchTeams();
      await fetchProfiles();
      renderAccounts();
      renderPlatformChips();
    } else {
      const err = await res.json();
      alert(err.error || "Failed to create team");
    }
  } catch { alert("Network error."); }
}

async function activateTeam(id) {
  try {
    await apiFetch(`/api/teams/${id}/activate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    await fetchTeams();
    await fetchProfiles();
    renderAccounts();
    renderPlatformChips();
  } catch { alert("Network error."); }
}

async function editTeam(id) {
  const team = teams.find((t) => t.id === id);
  if (!team) return;
  const label = prompt("Team name:", team.label);
  if (!label?.trim() || label.trim() === team.label) return;
  try {
    const res = await apiFetch(`/api/teams/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ label: label.trim() }),
    });
    if (res.ok) {
      await fetchTeams();
      renderAccounts();
    } else {
      const err = await res.json();
      alert(err.error || "Failed to rename team");
    }
  } catch { alert("Network error."); }
}

async function selectTeamForView(id) {
  accountsTeamId = id;
  renderTeams();
  await fetchProfiles();
  renderAccounts();
}

async function deleteTeam(id) {
  if (!(await confirmModal("Delete this team? Its connected accounts will be removed too."))) return;
  try {
    await apiFetch(`/api/teams/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    await fetchTeams();
    await fetchProfiles();
    renderAccounts();
    renderPlatformChips();
  } catch { alert("Network error."); }
}

$("#btn-create-team").addEventListener("click", createTeam);
$("#post-team")?.addEventListener("change", updatePostTeamAccounts);

// ── API Keys ──

async function fetchKeys() {
  const container = $("#api-keys-list");
  if (!container || !session?.access_token) return;
  try {
    const res = await apiFetch(`/api/keys`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json();
    const keys = data.keys || [];
    if (!keys.length) {
      container.innerHTML = `<div class="account-item"><div class="account-item-info"><div class="account-item-status">No API keys yet. Create one to post programmatically.</div></div></div>`;
      return;
    }
    container.innerHTML = keys.map((k) => `
      <div class="account-item">
        <div class="account-item-info">
          <div class="account-item-name">${escapeHtml(k.name)} <span style="color:var(--text-muted);font-weight:400;">· ${escapeHtml(k.hint || "")}</span></div>
          <div class="account-item-status">${k.revoked_at ? "Revoked" : "Active"} · created ${fmtDate(k.created_at)}${k.last_used_at ? ` · used ${fmtDate(k.last_used_at)}` : ""}</div>
        </div>
        ${k.revoked_at ? "" : `<button class="btn btn-sm btn-ghost" data-revoke-key="${k.id}">Revoke</button>`}
      </div>
    `).join("");
    $$("[data-revoke-key]").forEach((btn) => btn.addEventListener("click", () => revokeKey(btn.dataset.revokeKey)));
  } catch {
    container.innerHTML = `<div class="account-item"><div class="account-item-status">Could not load API keys.</div></div>`;
  }
}

// ── X fees / credits ──

function fmtMicros(micros) {
  return `$${(micros / 1_000_000).toFixed(2)}`;
}

let ledgerTx = [];       // latest fetched transactions (newest first)
let ledgerVisible = 5;   // how many to show before "Load more"

function renderLedger() {
  const listEl = $("#ledger-list");
  const moreBtn = $("#btn-load-more-ledger");
  if (!listEl) return;

  if (!ledgerTx.length) {
    listEl.innerHTML = `<div class="account-item"><div class="account-item-status">No transactions yet. Top up to start posting to X.</div></div>`;
    if (moreBtn) moreBtn.classList.add("hidden");
    return;
  }

  listEl.innerHTML = ledgerTx.slice(0, ledgerVisible).map((t) => {
    const kind = t.kind === "topup" ? "Top-up" : t.kind === "x_fee" ? "X fee" : t.kind === "stripe_fee" ? "Stripe fee" : t.kind === "tax" ? "Sales tax" : "Adjustment";
    const detail = t.kind === "x_fee"
      ? (t.has_link ? "with link" : "plain/media")
      : (t.note || "");
    return `
      <div class="account-item">
        <div class="account-item-info">
          <div class="account-item-name">${kind} ${detail ? `<span style="color:var(--text-muted);font-weight:400;">· ${escapeHtml(detail)}</span>` : ""}</div>
          <div class="account-item-status">${fmtDate(t.created_at)}</div>
        </div>
        <div class="account-item-status" style="font-weight:600;${t.amount_micros < 0 ? "color:var(--error);" : "color:var(--success);"}">${t.amount_micros < 0 ? "-" : "+"}${fmtMicros(Math.abs(t.amount_micros))}</div>
      </div>`;
  }).join("");

  if (moreBtn) moreBtn.classList.toggle("hidden", ledgerTx.length <= ledgerVisible);
}

async function fetchCredits() {
  const balEl = $("#fees-balance-amount");
  if (!session?.access_token) return;
  try {
    const res = await apiFetch(`/api/credits`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json();
    if (balEl) balEl.textContent = fmtMicros(data.balanceMicros || 0);
    ledgerTx = data.transactions || [];
    renderLedger();
  } catch {
    const listEl = $("#ledger-list");
    if (listEl) listEl.innerHTML = `<div class="account-item"><div class="account-item-status">Could not load credits.</div></div>`;
  }
}

$("#btn-load-more-ledger")?.addEventListener("click", () => {
  ledgerVisible += 5;
  renderLedger();
});

async function topUp() {
  const statusEl = $("#topup-status");
  const btn = $("#btn-topup");
  const amtInput = $("#topup-amount");
  const dollars = Number(amtInput?.value || 0);
  if (!Number.isFinite(dollars) || dollars <= 0) { if (statusEl) statusEl.textContent = "Enter a valid USD amount."; return; }
  if (!session?.access_token) return;
  if (statusEl) statusEl.textContent = "";
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Opening…';
  try {
    const res = await apiFetch(`/api/credits/topup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountCents: Math.round(dollars * 100) }),
    });
    const data = await res.json();
    if (!res.ok || !data.url) {
      if (statusEl) statusEl.textContent = data.error || "Top-up failed.";
      return;
    }
    window.location.href = data.url;
  } catch {
    if (statusEl) statusEl.textContent = "Network error.";
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

// Live Stripe-fee estimate as the user types a top-up amount.
$("#topup-amount")?.addEventListener("input", (e) => {
  const est = $("#topup-estimate");
  if (!est) return;
  const amt = Number(e.target.value);
  if (!Number.isFinite(amt) || amt <= 0) { est.textContent = ""; return; }
  const fee = amt * 0.065 + 0.35;
  const net = Math.max(0, amt - fee);
  est.textContent = `$${net.toFixed(2)} credit for X after the 6.5% + $0.35 fee (Stripe handles any sales tax at checkout; it isn't taken from your credits)`;
});

// Quick top-up amount chips.
$$("[data-amount]").forEach((btn) => btn.addEventListener("click", () => {
  const inp = $("#topup-amount");
  if (inp) { inp.value = btn.dataset.amount; inp.dispatchEvent(new Event("input")); }
}));

async function createKey() {
  if (!session?.access_token) return;
  try {
    const res = await apiFetch(`/api/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ name: "Default key" }),
    });
    const data = await res.json();
    if (res.ok && data.key) {
      const result = $("#api-key-result");
      result.innerHTML = `
        <div class="feedback success visible" style="word-break:break-all;margin:0;">
          Copy your key now — it won't be shown again:<br>
          <code>${escapeHtml(data.key)}</code>
        </div>
        <button class="btn btn-sm btn-secondary" id="btn-copy-key" style="margin-top:8px;">Copy</button>`;
      $("#btn-copy-key").addEventListener("click", () => {
        navigator.clipboard?.writeText(data.key).then(() => alert("Copied!"));
      });
      fetchKeys();
    } else {
      alert(data.error || "Failed to create key");
    }
  } catch { alert("Network error."); }
}

async function revokeKey(id) {
  if (!(await confirmModal("Revoke this API key? Apps using it will stop working."))) return;
  try {
    await apiFetch(`/api/keys/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    fetchKeys();
  } catch { alert("Network error."); }
}

$("#btn-create-key")?.addEventListener("click", createKey);
$("#btn-copy-llms")?.addEventListener("click", () => {
  navigator.clipboard?.writeText("https://post.freesurf.tools/llms.txt").then(() => alert("Copied llms.txt URL!"));
});

// API docs mini-tabs (cURL / JavaScript / Python)
$$(".api-tabs").forEach((tabs) => {
  tabs.querySelectorAll(".api-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.querySelectorAll(".api-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const panel = tab.dataset.tab;
      tabs.parentElement.querySelectorAll(".api-tab-panel").forEach((p) => {
        p.classList.toggle("hidden", p.dataset.panel !== panel);
      });
    });
  });
});

async function connectPlatform(key) {
  const platform = PLATFORMS.find((p) => p.key === key);
  if (!platform) return;

  // All platforms connect via Bundle.social (including Bluesky), so accounts stay team-scoped.
  fetchConnectUrl(key);
}

async function fetchConnectUrl(platform) {
  if (!session?.access_token) return;
  try {
    const teamQ = accountsTeamId ? `?teamId=${encodeURIComponent(accountsTeamId)}` : "";
    const res = await apiFetch(`/api/connect/${platform}${teamQ}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json();
    if (data.url) {
      // Same-tab redirect so the app reloads fresh (and accounts refresh) after OAuth.
      window.location.href = data.url;
    }
  } catch {
    alert("Unable to connect. Open https://bundle.social/dashboard to connect accounts.");
  }
}

// ── Calendar ──

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function renderCalendar() {
  $("#calendar-month").textContent = `${MONTHS[calMonth]} ${calYear}`;
  const grid = $("#calendar-grid");
  let html = DAYS.map((d) => `<div class="calendar-header">${d}</div>`).join("");

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const prevMonthDays = new Date(calYear, calMonth, 0).getDate();
  const today = new Date();
  const todayStr = localDateStr(today, selectedTz());

  // Days from previous month
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    html += `<div class="calendar-day other-month">${d}</div>`;
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const isToday = dateStr === todayStr;
    const isSelected = dateStr === calSelected;
    const hasPosts = scheduledPosts.some((p) => p.scheduledAt && localDateStr(new Date(p.scheduledAt), selectedTz()) === dateStr);
    html += `<div class="calendar-day${isToday ? " today" : ""}${isSelected ? " selected" : ""}${hasPosts ? " has-posts" : ""}" data-date="${dateStr}">${d}</div>`;
  }

  // Remaining cells
  const totalCells = firstDay + daysInMonth;
  const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let d = 1; d <= remaining; d++) {
    html += `<div class="calendar-day other-month">${d}</div>`;
  }

  grid.innerHTML = html;

  grid.querySelectorAll(".calendar-day:not(.other-month)").forEach((day) => {
    day.addEventListener("click", () => {
      calSelected = day.dataset.date;
      renderCalendar();
      renderDayPosts();
    });
  });

  renderDayPosts();
}

function renderDayPosts() {
  const container = $("#calendar-posts");
  if (!calSelected) { container.innerHTML = ""; return; }

  const dayPosts = scheduledPosts.filter((p) => p.scheduledAt && localDateStr(new Date(p.scheduledAt), selectedTz()) === calSelected);
  const dateLabel = new Date(calSelected + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  let html = `<h3 style="margin-bottom:12px;">${dateLabel}</h3>`;

  if (dayPosts.length) {
    html += dayPosts.map((p) => `
      <div class="scheduled-list-item">
        <div>
          <div class="sli-text">${esc(p.text.slice(0, 100))}${p.text.length > 100 ? "…" : ""} <button class="btn btn-xs btn-ghost" data-cancel="${p.id}" style="color:var(--error);padding:2px 8px;">Cancel</button></div>
          <div class="sli-meta">${p.platforms?.join(", ")} · ${new Date(p.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: selectedTz() })} ${selectedTz().replace(/_/g, " ")}</div>
        </div>
      </div>`).join("");
  } else {
    html += `<p style="color:var(--text-muted);font-size:0.875rem;">No posts scheduled for this day.</p>`;
  }

  container.innerHTML = html;

  // Cancel buttons
  container.querySelectorAll("[data-cancel]").forEach((btn) => {
    btn.addEventListener("click", async () => cancelScheduled(btn.dataset.cancel));
  });
}

async function fetchScheduled() {
  if (!session?.access_token) return;
  try {
    const res = await apiFetch(`/api/scheduled`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    scheduledPosts = (await res.json()) || [];
  } catch { scheduledPosts = []; }
  renderCalendar();
}

async function schedulePost() {
  const text = $("#sched-text")?.value?.trim();
  const timeInput = $("#sched-time")?.value;
  if (!text) return;
  if (!timeInput) return;

  const platforms = Array.from($$("#sched-platforms .platform-chip.selected")).map((c) => c.dataset.schedPlatform);
  if (!platforms.length) { alert("Select at least one platform."); return; }

  try {
    const res = await apiFetch(`/api/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ text, platforms, scheduledAt: new Date(timeInput).toISOString() }),
    });
    if (res.ok) {
      await fetchScheduled();
      $("#sched-text").value = "";
    } else {
      const err = await res.json();
      alert(err.error || "Failed to schedule");
    }
  } catch { alert("Network error."); }
}

async function cancelScheduled(id) {
  if (!(await confirmModal("Cancel this scheduled post?"))) return;
  try {
    const res = await apiFetch(`/api/scheduled/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to cancel.");
      return;
    }
    await fetchScheduled();
  } catch { alert("Failed to cancel."); }
}

$("#cal-prev").addEventListener("click", () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } calSelected = null; renderCalendar(); });
$("#cal-next").addEventListener("click", () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } calSelected = null; renderCalendar(); });

// ── Media Upload ──

const mediaDropzone = $("#media-dropzone");
const mediaInput = $("#media-input");
const mediaPreview = $("#media-preview");

let uploadedMedia = [];

if (mediaDropzone && mediaInput) {
  mediaInput.addEventListener("change", (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      handleMediaUpload(files);
    }
  });

  mediaDropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    mediaDropzone.style.borderColor = "var(--brand)";
    mediaDropzone.style.background = "var(--brand-soft)";
  });

  mediaDropzone.addEventListener("dragleave", () => {
    mediaDropzone.style.borderColor = "var(--border)";
    mediaDropzone.style.background = "var(--bg)";
  });

  mediaDropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    mediaDropzone.style.borderColor = "var(--border)";
    mediaDropzone.style.background = "var(--bg)";
    
    const files = Array.from(e.dataTransfer.files).filter((f) => 
      f.type.startsWith("image/") || f.type.startsWith("video/")
    );
    
    if (files.length > 0) {
      handleMediaUpload(files);
    }
  });
}

function handleMediaUpload(files) {
  files.forEach((file) => {
    uploadedMedia.push({
      file,
      url: URL.createObjectURL(file),
      type: file.type.startsWith("image/") ? "image" : "video"
    });
  });
  renderMediaPreview();
}

function renderMediaPreview() {
  if (uploadedMedia.length === 0) {
    mediaPreview.style.display = "none";
    mediaDropzone.style.display = "flex";
    return;
  }
  
  mediaPreview.style.display = "flex";
  mediaDropzone.style.display = "none";
  
  mediaPreview.innerHTML = uploadedMedia.map((media, index) => `
    <div class="media-preview-item">
      ${media.type === "image" 
        ? `<img src="${media.url}" alt="Uploaded media" />`
        : `<video src="${media.url}" muted preload="metadata"></video>`}
      <button class="media-preview-remove" data-index="${index}">×</button>
    </div>
  `).join("");
  
  mediaPreview.querySelectorAll(".media-preview-remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const index = parseInt(e.target.dataset.index);
      uploadedMedia.splice(index, 1);
      renderMediaPreview();
    });
  });
}

// ── Drafts ──

const btnSaveDraft = $("#btn-save-draft");

if (btnSaveDraft) {
  btnSaveDraft.addEventListener("click", async () => {
    const text = textarea.value.trim();
    if (!text && uploadedMedia.length === 0) {
      showFeedback("Add content to save as draft.", "error");
      return;
    }
    
    if (!session?.access_token) {
      showFeedback("Please sign in to save drafts.", "error");
      return;
    }
    
    const platforms = Array.from($$(".platform-chip.selected")).map((c) => c.dataset.platform);
    
    btnSaveDraft.disabled = true;
    btnSaveDraft.textContent = "Saving…";
    
    try {
      const res = await apiFetch(`/api/drafts`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          text,
          platforms,
          media: uploadedMedia.map((m) => ({
            type: m.type,
            name: m.file.name
          }))
        }),
      });
      
      if (res.ok) {
        showFeedback("Draft saved!", "success");
      } else {
        const data = await res.json();
        showFeedback(data.error || "Failed to save draft.", "error");
      }
    } catch {
      showFeedback("Network error.", "error");
    }
    
    btnSaveDraft.disabled = false;
    btnSaveDraft.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
      Save draft
    `;
  });
}

// ── Drafts Feature ──

async function fetchDrafts() {
  if (!session) return;
  
  try {
    const res = await apiFetch(`/api/drafts`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    
    if (res.ok) {
      const data = await res.json();
      renderDrafts(data.drafts || []);
    }
  } catch (error) {
    console.error("Failed to fetch drafts:", error);
  }
}

function renderDrafts(drafts) {
  const container = $("#drafts-list");
  
  if (!drafts || drafts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        </div>
        <p class="empty-state-text">No drafts yet. Save a post to get started.</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = drafts.map((draft) => `
    <div class="draft-card">
      <div class="draft-header">
        <div>
          <div class="draft-meta">Last updated ${new Date(draft.updated_at).toLocaleDateString()}</div>
          <div class="draft-platforms">
            ${draft.platforms.map((p) => `<span class="draft-platform-tag">${p}</span>`).join("")}
          </div>
        </div>
      </div>
      <div class="draft-text">${escapeHtml(draft.text.substring(0, 200))}${draft.text.length > 200 ? "..." : ""}</div>
      <div class="draft-actions">
        <button class="btn btn-sm btn-secondary" onclick="loadDraftIntoCompose('${draft.id}')">Load</button>
        <button class="btn btn-sm btn-ghost" onclick="deleteDraft('${draft.id}')">Delete</button>
      </div>
    </div>
  `).join("");
}

async function loadDraftIntoCompose(draftId) {
  if (!session) return;
  
  try {
    const res = await apiFetch(`/api/drafts`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    
    if (res.ok) {
      const data = await res.json();
      const draft = data.drafts.find((d) => d.id === draftId);
      if (draft) {
        $("#post-text").value = draft.text;
        updateCharCount();
        updatePlatformPreviews();
        switchView("compose");
      }
    }
  } catch (error) {
    console.error("Failed to load draft:", error);
  }
}

async function deleteDraft(draftId) {
  if (!(await confirmModal("Are you sure you want to delete this draft?"))) return;
  
  try {
    const res = await apiFetch(`/api/drafts/${draftId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    
    if (res.ok) {
      fetchDrafts();
    }
  } catch (error) {
    console.error("Failed to delete draft:", error);
  }
}

// ── Hashtag Groups Feature ──

async function fetchHashtagGroups() {
  if (!session) return;
  
  try {
    const res = await apiFetch(`/api/hashtags`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    
    if (res.ok) {
      const data = await res.json();
      renderHashtagGroups(data.groups || []);
    }
  } catch (error) {
    console.error("Failed to fetch hashtag groups:", error);
  }
}

function renderHashtagGroups(groups) {
  const container = $("#hashtag-groups");
  
  if (!groups || groups.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>
        </div>
        <p class="empty-state-text">No hashtag groups yet. Create one to get started.</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = groups.map((group) => `
    <div class="hashtag-group-card">
      <div class="hashtag-group-header">
        <span class="hashtag-group-name">${escapeHtml(group.name)}</span>
        <span class="hashtag-group-platform">${group.platform}</span>
      </div>
      <div class="hashtag-group-tags">
        ${group.hashtags.map((tag) => `<span class="hashtag-tag">${escapeHtml(tag)}</span>`).join(" ")}
      </div>
      <div class="draft-actions">
        <button class="btn btn-sm btn-secondary" onclick="addHashtagsToCompose('${group.id}')">Add to post</button>
        <button class="btn btn-sm btn-ghost" onclick="deleteHashtagGroup('${group.id}')">Delete</button>
      </div>
    </div>
  `).join("");
}

function showCreateHashtagGroupModal() {
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3 class="modal-title">Create Hashtag Group</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Group Name</label>
          <input type="text" class="form-input" id="hashtag-group-name" placeholder="e.g., Tech startup">
        </div>
        <div class="form-group">
          <label class="form-label">Platform</label>
          <select class="form-select" id="hashtag-group-platform">
            ${PLATFORMS.map((p) => `<option value="${p.key}">${p.name}</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Hashtags (one per line)</label>
          <textarea class="form-textarea" id="hashtag-group-tags" placeholder="#startup&#10;#tech&#10;#innovation"></textarea>
          <span class="form-helper">Make sure each hashtag starts with #</span>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="btn btn-primary" id="btn-save-hashtag-group">Create</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  modal.querySelector("#btn-save-hashtag-group").addEventListener("click", async () => {
    const name = modal.querySelector("#hashtag-group-name").value.trim();
    const platform = modal.querySelector("#hashtag-group-platform").value;
    const tagsText = modal.querySelector("#hashtag-group-tags").value.trim();
    const hashtags = tagsText.split("\n").map((t) => t.trim()).filter((t) => t);
    
    if (!name || hashtags.length === 0) {
      alert("Please fill in all fields");
      return;
    }
    
    try {
      const res = await apiFetch(`/api/hashtags`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, platform, hashtags }),
      });
      
      if (res.ok) {
        modal.remove();
        fetchHashtagGroups();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to create hashtag group");
      }
    } catch (error) {
      alert("Network error");
    }
  });
}

async function addHashtagsToCompose(groupId) {
  if (!session) return;
  
  try {
    const res = await apiFetch(`/api/hashtags`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    
    if (res.ok) {
      const data = await res.json();
      const group = data.groups.find((g) => g.id === groupId);
      if (group) {
        const textarea = $("#post-text");
        textarea.value += " " + group.hashtags.join(" ");
        updateCharCount();
        switchView("compose");
      }
    }
  } catch (error) {
    console.error("Failed to add hashtags:", error);
  }
}

async function deleteHashtagGroup(groupId) {
  if (!(await confirmModal("Are you sure you want to delete this hashtag group?"))) return;
  
  try {
    const res = await apiFetch(`/api/hashtags/${groupId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    
    if (res.ok) {
      fetchHashtagGroups();
    }
  } catch (error) {
    console.error("Failed to delete hashtag group:", error);
  }
}

// ── Saved Replies Feature ──

async function fetchSavedReplies() {
  if (!session) return;
  
  try {
    const res = await apiFetch(`/api/replies/templates`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    
    if (res.ok) {
      const data = await res.json();
      renderSavedReplies(data.replies || []);
    }
  } catch (error) {
    console.error("Failed to fetch saved replies:", error);
  }
}

function renderSavedReplies(replies) {
  const container = $("#saved-replies");
  
  if (!replies || replies.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </div>
        <p class="empty-state-text">No saved replies yet. Create one to get started.</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = replies.map((reply) => `
    <div class="reply-card">
      <div class="reply-header">
        <span class="reply-title">${escapeHtml(reply.title)}</span>
      </div>
      <div class="reply-content">${escapeHtml(reply.content.substring(0, 150))}${reply.content.length > 150 ? "..." : ""}</div>
      <div class="draft-platforms">
        ${reply.platforms.map((p) => `<span class="draft-platform-tag">${p}</span>`).join("")}
      </div>
      <div class="draft-actions">
        <button class="btn btn-sm btn-secondary" onclick="copyReply('${reply.id}')">Copy</button>
        <button class="btn btn-sm btn-ghost" onclick="deleteSavedReply('${reply.id}')">Delete</button>
      </div>
    </div>
  `).join("");
}

function showCreateReplyModal() {
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3 class="modal-title">Create Saved Reply</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Title</label>
          <input type="text" class="form-input" id="reply-title" placeholder="e.g., Thank you for following">
        </div>
        <div class="form-group">
          <label class="form-label">Content</label>
          <textarea class="form-textarea" id="reply-content" placeholder="Thanks for following! Looking forward to connecting with you."></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Platforms (optional)</label>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            ${PLATFORMS.map((p) => `
              <label style="display:flex;align-items:center;gap:4px;font-size:0.875rem;">
                <input type="checkbox" value="${p.key}" class="reply-platform-checkbox">
                ${p.name}
              </label>
            `).join("")}
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="btn btn-primary" id="btn-save-reply">Create</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  modal.querySelector("#btn-save-reply").addEventListener("click", async () => {
    const title = modal.querySelector("#reply-title").value.trim();
    const content = modal.querySelector("#reply-content").value.trim();
    const platforms = Array.from(modal.querySelectorAll(".reply-platform-checkbox:checked")).map((cb) => cb.value);
    
    if (!title || !content) {
      alert("Please fill in all required fields");
      return;
    }
    
    try {
      const res = await apiFetch(`/api/replies/templates`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title, content, platforms }),
      });
      
      if (res.ok) {
        modal.remove();
        fetchSavedReplies();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to create saved reply");
      }
    } catch (error) {
      alert("Network error");
    }
  });
}

async function copyReply(replyId) {
  if (!session) return;
  
  try {
    const res = await apiFetch(`/api/replies/templates`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    
    if (res.ok) {
      const data = await res.json();
      const reply = data.replies.find((r) => r.id === replyId);
      if (reply) {
        await navigator.clipboard.writeText(reply.content);
        alert("Reply copied to clipboard!");
      }
    }
  } catch (error) {
    console.error("Failed to copy reply:", error);
  }
}

async function deleteSavedReply(replyId) {
  if (!(await confirmModal("Are you sure you want to delete this saved reply?"))) return;
  
  try {
    const res = await apiFetch(`/api/replies/templates/${replyId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    
    if (res.ok) {
      fetchSavedReplies();
    }
  } catch (error) {
    console.error("Failed to delete saved reply:", error);
  }
}

// ── Queue Feature ──

async function fetchQueue() {
  if (!session) return;
  
  try {
    const res = await apiFetch(`/api/queue`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    
    if (res.ok) {
      const data = await res.json();
      renderQueue(data.queue || []);
    }
  } catch (error) {
    console.error("Failed to fetch queue:", error);
  }
}

function renderQueue(queue) {
  const container = $("#queue-list");
  
  if (!queue || queue.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </div>
        <p class="empty-state-text">Your queue is empty. Add posts to schedule them.</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = queue.map((item) => `
    <div class="queue-card">
      <div class="queue-header">
        <div class="queue-schedule">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          ${new Date(item.scheduled_at || item.created_at).toLocaleString()}
        </div>
        <div class="queue-actions">
          <button class="btn btn-sm btn-ghost" onclick="removeFromQueue('${item.id}')">Remove</button>
        </div>
      </div>
      <div class="queue-text">${escapeHtml(item.text.substring(0, 200))}${item.text.length > 200 ? "..." : ""}</div>
      <div class="queue-footer">
        <div class="queue-platforms">
          ${item.platforms.map((p) => `<span class="draft-platform-tag">${p}</span>`).join("")}
        </div>
      </div>
    </div>
  `).join("");
}

async function refillQueue() {
  if (!(await confirmModal("Refill queue with drafts? This will add posts from your drafts to fill a 7-day schedule."))) return;
  
  try {
    const res = await apiFetch(`/api/queue/refill`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    
    if (res.ok) {
      const data = await res.json();
      alert(data.message || "Queue refilled!");
      fetchQueue();
    } else {
      const data = await res.json();
      alert(data.error || "Failed to refill queue");
    }
  } catch (error) {
    alert("Network error");
  }
}

async function removeFromQueue(queueId) {
  if (!(await confirmModal("Are you sure you want to remove this post from the queue?"))) return;
  
  try {
    const res = await apiFetch(`/api/queue/${queueId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    
    if (res.ok) {
      fetchQueue();
    }
  } catch (error) {
    console.error("Failed to remove from queue:", error);
  }
}

// ── Analytics Feature ──

async function fetchAnalytics() {
  if (!session || !$("#analytics-summary")) return;  // analytics tab is a placeholder for now
  
  try {
    const res = await apiFetch(`/api/analytics`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    
    if (res.ok) {
      const data = await res.json();
      renderAnalytics(data);
    }
  } catch (error) {
    console.error("Failed to fetch analytics:", error);
  }

  fetchRecentPosts();
}

async function fetchRecentPosts() {
  if (!session?.access_token || !$("#recent-posts-list")) return;

  // Local history (this browser) folded in front of Bundle's recent posts
  const local = (postHistory || []).map((p) => ({
    id: p.id,
    status: "posted",
    createdAt: p.postedAt,
    platforms: (p.results || []).map((r) => r.platform),
    text: p.text,
    url: (p.results || []).find((r) => r.success && r.postUrl)?.postUrl,
  }));

  try {
    const teamQ = analyticsTeamId ? `?teamId=${encodeURIComponent(analyticsTeamId)}` : "";
    const res = await apiFetch(`/api/bundle-posts${teamQ}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json();
    recentPostsAll = [...local, ...(data.posts || [])];
  } catch {
    recentPostsAll = local;
  }

  recentPostsShown = 5;
  renderRecentPosts();
}

function renderRecentPosts() {
  const container = $("#recent-posts-list");
  const loadMore = $("#btn-load-more-posts");
  if (!container) return;

  const posts = recentPostsAll || [];
  if (!posts.length) {
    container.innerHTML = `<div class="empty-state"><p class="empty-state-text">No recent posts yet.</p></div>`;
    if (loadMore) loadMore.classList.add("hidden");
    return;
  }

  const visible = posts.slice(0, recentPostsShown);
  container.innerHTML = visible.map((p) => `
    <div class="account-item">
      <div class="account-item-info">
        <div class="account-item-name">${escapeHtml(p.text || "(no text)")}</div>
        <div class="account-item-status">${escapeHtml((p.platforms || []).join(", ") || p.status || "")}${p.createdAt ? ` · ${fmtDate(p.createdAt)}` : ""}</div>
      </div>
      ${p.url ? `<a class="btn btn-sm btn-ghost" href="${p.url}" target="_blank">View</a>` : ""}
    </div>
  `).join("");

  if (loadMore) {
    const remaining = Math.max(0, posts.length - recentPostsShown);
    loadMore.classList.toggle("hidden", remaining === 0);
    loadMore.textContent = `Load more (${remaining} left)`;
  }
}

$("#analytics-team")?.addEventListener("change", (e) => {
  analyticsTeamId = e.target.value || "";
  fetchRecentPosts();
});

$("#btn-load-more-posts")?.addEventListener("click", () => {
  recentPostsShown += 5;
  renderRecentPosts();
});

function renderAnalytics(data) {
  const summaryContainer = $("#analytics-summary");
  const platformsContainer = $("#analytics-platforms");
  
  // Render summary metrics
  const totals = data.totals || { posts: 0, likes: 0, comments: 0, shares: 0 };
  summaryContainer.innerHTML = `
    <div class="analytics-metric-card">
      <div class="analytics-metric-label">Posts</div>
      <div class="analytics-metric-value">${totals.posts}</div>
    </div>
    <div class="analytics-metric-card">
      <div class="analytics-metric-label">Likes</div>
      <div class="analytics-metric-value">${totals.likes}</div>
    </div>
    <div class="analytics-metric-card">
      <div class="analytics-metric-label">Comments</div>
      <div class="analytics-metric-value">${totals.comments}</div>
    </div>
    <div class="analytics-metric-card">
      <div class="analytics-metric-label">Shares</div>
      <div class="analytics-metric-value">${totals.shares}</div>
    </div>
  `;
  
  // Render platform breakdown
  const analytics = data.analytics || {};
  platformsContainer.innerHTML = PLATFORMS.map((p) => {
    const stats = analytics[p.key] || { posts: 0, likes: 0, comments: 0, shares: 0 };
    return `
      <div class="analytics-platform-card">
        <div class="analytics-platform-header">
          <span class="analytics-platform-name">${p.name}</span>
        </div>
        <div class="analytics-platform-stats">
          <div class="analytics-stat-row">
            <span class="analytics-stat-label">Posts</span>
            <span class="analytics-stat-value">${stats.posts}</span>
          </div>
          <div class="analytics-stat-row">
            <span class="analytics-stat-label">Likes</span>
            <span class="analytics-stat-value">${stats.likes}</span>
          </div>
          <div class="analytics-stat-row">
            <span class="analytics-stat-label">Comments</span>
            <span class="analytics-stat-value">${stats.comments}</span>
          </div>
          <div class="analytics-stat-row">
            <span class="analytics-stat-label">Shares</span>
            <span class="analytics-stat-value">${stats.shares}</span>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

// ── Helper Functions ──

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ── Init ──

async function init() {
  const initialHash = location.hash.replace("#", "");
  loadHistory();
  renderAccounts();
  renderPlatformChips();
  await refreshAuth();
  await fetchScheduled();

  // Re-render accounts now that profiles are loaded (connection state + handles)
  renderAccounts();
  renderPlatformChips();
  fetchTeams();

  // Handle Bundle OAuth connect callback (Bundle sends ?success=<platform>-callback or ?success=true)
  const params = new URLSearchParams(location.search);
  if (params.get("tab") === "fees") {
    // Returned from a Stripe checkout (success or cancelled) → show the X fees tab.
    history.replaceState(null, "", location.pathname);
    if (session) {
      showView("fees");
      fetchCredits();
      // The Stripe webhook lands a few seconds after the redirect; poll every ~1.5s
      // for the first ~10s so the credit balance appears as soon as it's written.
      let n = 0;
      const poll = setInterval(() => {
        n++;
        fetchCredits();
        if (n >= 6) clearInterval(poll);
      }, 1500);
    }
  } else if (params.get("success")) {
    history.replaceState(null, "", location.pathname);
    await fetchTeams();
    await fetchProfiles();
    renderAccounts();
    renderPlatformChips();
    showView("accounts");
  } else if (params.get("error")) {
    console.error("Connect callback error:", params.get("error"));
    history.replaceState(null, "", location.pathname);
    alert(`Account connection failed: ${params.get("error")}`);
  }

  // Deep-link routing via URL hash (e.g. #accounts)
  if (initialHash && $(`#view-${initialHash}`)) {
    if (!session && PROTECTED_VIEWS.has(initialHash)) showView("welcome");
    else showView(initialHash);
  }
  
  // Initialize new feature views
  if ($("#view-drafts")) fetchDrafts();
  if ($("#view-hashtags")) fetchHashtagGroups();
  if ($("#view-queue")) fetchQueue();
  if ($("#view-analytics")) fetchAnalytics();
}

// ── Navigation ──

$$(".sidebar-nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    const view = btn.dataset.view;
    switchView(view);
  });
});

function switchView(viewName) {
  currentView = viewName;
  
  $$(".view").forEach((v) => v.classList.add("hidden"));
  $(`#view-${viewName}`)?.classList.remove("hidden");
  
  $$(".sidebar-nav-item").forEach((i) => i.classList.remove("sidebar-nav-item-active"));
  $(`.sidebar-nav-item[data-view="${viewName}"]`)?.classList.add("sidebar-nav-item-active");
  
  // Close sidebar on mobile
  $(".sidebar")?.classList.remove("sidebar-open");
  $(".sidebar-overlay")?.classList.remove("active");
  
  // Refresh data for the view
  if (viewName === "compose") fetchTeams();
  if (viewName === "accounts") { fetchTeams(); fetchProfiles().then(renderAccounts); renderDirectAccounts(); }
  if (viewName === "docs") fetchKeys();
  if (viewName === "drafts") fetchDrafts();
  if (viewName === "hashtags") fetchHashtagGroups();
  if (viewName === "queue") fetchQueue();
  if (viewName === "analytics") fetchAnalytics();
  if (viewName === "fees") fetchCredits();
}

// ── Event Listeners ──

$("#btn-create-hashtag-group")?.addEventListener("click", showCreateHashtagGroupModal);
$("#btn-create-reply")?.addEventListener("click", showCreateReplyModal);
$("#btn-refill-queue")?.addEventListener("click", refillQueue);
$("#btn-topup")?.addEventListener("click", topUp);
$("#btn-save-direct-bsky")?.addEventListener("click", saveDirectBluesky);

init();
