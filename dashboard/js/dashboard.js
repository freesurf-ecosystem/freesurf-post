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
  { key: "bluesky",   name: "Bluesky",   oauth: false, note: "App Password — no registration needed" },
  { key: "x",         name: "X",          oauth: true, note: "Connected via Bundle (no free API tier)" },
  { key: "linkedin",  name: "LinkedIn",   oauth: true },
  { key: "facebook",  name: "Facebook",   oauth: true },
  { key: "instagram", name: "Instagram",  oauth: true },
  { key: "threads",   name: "Threads",    oauth: true },
  { key: "tiktok",    name: "TikTok",     oauth: true, note: "Content Posting API approval required" },
  { key: "youtube",   name: "YouTube",    oauth: true, note: "Channel selection required after OAuth" },
];

// ── State ──
let session = null;
let connectedProfiles = []; // { platform, label, handle, id }[]
let postHistory = [];
let scheduledPosts = [];
let currentView = "compose";
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let calSelected = null;

const $ = (s) => document.querySelector(s);
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
  renderAuthUI();
}

async function fetchProfiles() {
  if (!session?.access_token) { connectedProfiles = []; return; }
  try {
    // Fetch our platform tokens
    const res = await fetch(`${API_BASE}/api/profiles`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json();
    connectedProfiles = data.profiles || [];

    // Also fetch Bundle-connected accounts
    const bundleRes = await fetch(`${API_BASE}/api/bundle-accounts`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const bundleData = await bundleRes.json();
    for (const acc of bundleData || []) {
      if (!connectedProfiles.some((p) => p.platform === acc.platform && p.handle === acc.handle)) {
        connectedProfiles.push({ platform: acc.platform, label: acc.handle || acc.platform, handle: acc.handle, id: `bundle-${acc.platform}` });
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

  // Show/hide nav items based on auth
  const topbarNav = $("#topbar-nav");
  if (topbarNav) {
    topbarNav.querySelectorAll(".nav-link").forEach((l) => {
      if (l.dataset.view === "compose" || l.dataset.view === "history" || l.dataset.view === "accounts") {
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
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;

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

      $("#auth-verify-text").textContent = "Check your email to verify your address and get started." + digestNote;
      showAuthVerify();
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
}

// ── Old topbar navigation (for reference) ──
$$(".nav-link").forEach((link) => {
  link.addEventListener("click", () => {
    if (!session && (link.dataset.view === "compose" || link.dataset.view === "history" || link.dataset.view === "accounts")) {
      showView("welcome");
      return;
    }
    showView(link.dataset.view);
  });
});

// ── Sidebar navigation ──
$$(".sidebar-nav-item").forEach((link) => {
  link.addEventListener("click", () => {
    if (!session && (link.dataset.view === "compose" || link.dataset.view === "history" || link.dataset.view === "accounts")) {
      showView("welcome");
      return;
    }
    showView(link.dataset.view);
  });
});

// ── Platform Chips ──

function renderPlatformChips() {
  const container = $("#platform-toggles");
  const connectedSet = new Set(connectedProfiles.map((p) => p.platform));
  container.innerHTML = PLATFORMS.map((p) => {
    const connected = connectedSet.has(p.key);
    return `<label class="platform-chip ${connected ? "selected" : ""}" data-platform="${p.key}">
      ${p.name}${connected ? ` (${connectedProfiles.filter((cp) => cp.platform === p.key).length})` : ""}
      <input type="checkbox" ${connected ? "checked" : ""} />
    </label>`;
  }).join("");

  container.querySelectorAll(".platform-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const cb = chip.querySelector("input");
      cb.checked = !cb.checked;
      chip.classList.toggle("selected", cb.checked);
      updatePlatformPreviews();
    });
  });
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
});

btnPost.addEventListener("click", async () => {
  const text = textarea.value.trim();
  if (!text) return;
  const platforms = Array.from($$(".platform-chip.selected")).map((c) => c.dataset.platform);
  if (!platforms.length) { showFeedback("Select at least one platform.", "error"); return; }
  if (!session?.access_token) { showFeedback("Please sign in.", "error"); return; }

  btnPost.disabled = true;
  btnPost.textContent = "Posting…";
  clearFeedback();

  try {
    const res = await fetch(`${API_BASE}/api/post`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ platforms, text }),
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
          <span><strong>${r.platform}</strong>: ${r.success ? `<a href="${r.postUrl}" target="_blank">View →</a>` : r.error}</span>
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
    } else {
      showFeedback(data.error || "Post failed.", "error");
    }
  } catch {
    showFeedback("Network error.", "error");
  }
  btnPost.disabled = false;
  btnPost.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg> Post`;
});

function showFeedback(msg, type) { feedback.className = `feedback ${type} visible`; feedback.textContent = msg; }
function clearFeedback() { feedback.className = "feedback"; feedback.innerHTML = ""; }

// ── History ──

function saveHistory() { try { localStorage.setItem("freesurf-post-history", JSON.stringify(postHistory.slice(0, 50))); } catch {} }
function loadHistory() { try { postHistory = JSON.parse(localStorage.getItem("freesurf-post-history") || "[]"); } catch { postHistory = []; } }

function renderHistory() {
  if (!postHistory.length) {
    $("#history-list").innerHTML = `<div class="empty-state"><div class="empty-state-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></div><p class="empty-state-text">Your posts will appear here.</p></div>`;
    return;
  }
  $("#history-list").innerHTML = postHistory.map((p) => `
    <div class="history-item">
      <div class="history-text">${esc(p.text)}</div>
      <div class="history-meta">
        <div class="history-platforms">${p.results.map((r) => `<span class="history-platform-badge${r.success ? "" : " failed"}">${r.platform}</span>`).join("")}</div>
        <span class="history-date">${fmtDate(p.postedAt)}</span>
        ${p.results.filter((r) => r.success && r.postUrl).map((r) => `<a href="${r.postUrl}" target="_blank" class="history-link">${r.platform} →</a>`).join("")}
      </div>
    </div>`).join("");
}

function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
function fmtDate(iso) {
  const d = new Date(iso), n = new Date(), m = Math.floor((n - d) / 60000);
  if (m < 1) return "Now"; if (m < 60) return `${m}m ago`; if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Accounts & OAuth ──

function renderAccounts() {
  const platformMap = new Map();
  for (const p of connectedProfiles) {
    if (!platformMap.has(p.platform)) platformMap.set(p.platform, []);
    platformMap.get(p.platform).push(p);
  }

  $("#account-list").innerHTML = PLATFORMS.map((p) => {
    const profiles = platformMap.get(p.key) || [];
    const count = profiles.length;
    return `<div class="account-item">
      <div class="account-item-info">
        <div class="account-item-name">${p.name}</div>
        <div class="account-item-status${count ? " connected" : ""}">
          ${count ? `${count} profile${count > 1 ? "s" : ""} connected${profiles[0]?.handle ? ` · ${profiles.map((pp) => pp.handle || pp.label).join(", ")}` : ""}` : p.note || "Not connected"}
        </div>
      </div>
      <button class="btn btn-sm ${count ? "btn-ghost" : "btn-secondary"}" data-connect="${p.key}">${count ? "+ Add" : "Connect"}</button>
    </div>`;
  }).join("");

  $$("[data-connect]").forEach((btn) => {
    btn.addEventListener("click", () => connectPlatform(btn.dataset.connect));
  });
}

function connectPlatform(key) {
  const platform = PLATFORMS.find((p) => p.key === key);
  if (!platform) return;

  if (key === "bluesky") {
    const label = prompt("Profile name (e.g. 'Personal' or 'Company'):", "Personal");
    if (!label) return;
    const handle = prompt("Bluesky handle (e.g. you.bsky.social):");
    const password = prompt("App Password (from bsky.app/settings/app-passwords):");
    if (handle && password) {
      connectedProfiles.push({ platform: key, label, handle, id: crypto.randomUUID() });
      renderAccounts();
      renderPlatformChips();
    }
  } else {
    // Redirect to Bundle.social portal for OAuth (X included — no free tier)
    fetchConnectUrl(key);
  }
}

async function fetchConnectUrl(platform) {
  if (!session?.access_token) return;
  try {
    const res = await fetch(`${API_BASE}/api/connect/${platform}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json();
    if (data.url) {
      window.open(data.url, "_blank");
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
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;

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
    const hasPosts = scheduledPosts.some((p) => p.scheduledAt?.startsWith(dateStr));
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

  const dayPosts = scheduledPosts.filter((p) => p.scheduledAt?.startsWith(calSelected));
  const dateLabel = new Date(calSelected + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  let html = `<h3 style="margin-bottom:12px;">${dateLabel}</h3>`;

  if (dayPosts.length) {
    html += dayPosts.map((p) => `
      <div class="scheduled-list-item">
        <div>
          <div class="sli-text">${esc(p.text.slice(0, 100))}${p.text.length > 100 ? "…" : ""}</div>
          <div class="sli-meta">${p.platforms?.join(", ")} · ${new Date(p.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
        </div>
        <button class="btn btn-xs btn-ghost" data-cancel="${p.id}" style="color:var(--error);">Cancel</button>
      </div>`).join("");
  } else {
    html += `<p style="color:var(--text-muted);font-size:0.875rem;">No posts scheduled for this day.</p>`;
  }

  // Schedule form
  html += `
    <div class="schedule-form">
      <textarea id="sched-text" placeholder="What do you want to post?" rows="3" style="width:100%;border:1.5px solid var(--border);border-radius:6px;padding:10px;font:inherit;font-size:0.875rem;resize:vertical;"></textarea>
      <div class="schedule-form-row">
        <input type="datetime-local" id="sched-time" value="${calSelected}T09:00" style="flex:1;" />
        <button class="btn btn-sm btn-primary" id="btn-schedule">Schedule</button>
      </div>
      <div style="font-size:0.75rem;color:var(--text-muted);">Select platforms in the Compose tab first, or they will default to your connected platforms.</div>
    </div>`;
  container.innerHTML = html;

  // Cancel buttons
  container.querySelectorAll("[data-cancel]").forEach((btn) => {
    btn.addEventListener("click", async () => cancelScheduled(btn.dataset.cancel));
  });

  // Schedule button
  const schedBtn = $("#btn-schedule");
  if (schedBtn) {
    schedBtn.addEventListener("click", schedulePost);
  }
}

async function fetchScheduled() {
  if (!session?.access_token) return;
  try {
    const res = await fetch(`${API_BASE}/api/scheduled`, {
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

  const platforms = Array.from($$(".platform-chip.selected")).map((c) => c.dataset.platform);
  if (!platforms.length) { alert("Select at least one platform in the Compose tab."); return; }

  try {
    const res = await fetch(`${API_BASE}/api/schedule`, {
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
  if (!confirm("Cancel this scheduled post?")) return;
  try {
    await fetch(`${API_BASE}/api/scheduled/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    await fetchScheduled();
  } catch { alert("Failed to cancel."); }
}

$("#cal-prev").addEventListener("click", () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } calSelected = null; renderCalendar(); });
$("#cal-next").addEventListener("click", () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } calSelected = null; renderCalendar(); });
$("#cal-today").addEventListener("click", () => { calYear = new Date().getFullYear(); calMonth = new Date().getMonth(); calSelected = new Date().toISOString().slice(0,10); renderCalendar(); });

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
    const reader = new FileReader();
    reader.onload = (e) => {
      uploadedMedia.push({
        file,
        url: e.target.result,
        type: file.type.startsWith("image/") ? "image" : "video"
      });
      renderMediaPreview();
    };
    reader.readAsDataURL(file);
  });
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
        : `<video src="${media.url}" muted></video>`}
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
      const res = await fetch(`${API_BASE}/api/drafts`, {
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
    const res = await fetch(`${API_BASE}/api/drafts`, {
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
    const res = await fetch(`${API_BASE}/api/drafts`, {
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
  if (!confirm("Are you sure you want to delete this draft?")) return;
  
  try {
    const res = await fetch(`${API_BASE}/api/drafts/${draftId}`, {
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
    const res = await fetch(`${API_BASE}/api/hashtags`, {
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
      const res = await fetch(`${API_BASE}/api/hashtags`, {
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
    const res = await fetch(`${API_BASE}/api/hashtags`, {
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
  if (!confirm("Are you sure you want to delete this hashtag group?")) return;
  
  try {
    const res = await fetch(`${API_BASE}/api/hashtags/${groupId}`, {
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
    const res = await fetch(`${API_BASE}/api/replies/templates`, {
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
      const res = await fetch(`${API_BASE}/api/replies/templates`, {
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
    const res = await fetch(`${API_BASE}/api/replies/templates`, {
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
  if (!confirm("Are you sure you want to delete this saved reply?")) return;
  
  try {
    const res = await fetch(`${API_BASE}/api/replies/templates/${replyId}`, {
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
    const res = await fetch(`${API_BASE}/api/queue`, {
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
  if (!confirm("Refill queue with drafts? This will add posts from your drafts to fill a 7-day schedule.")) return;
  
  try {
    const res = await fetch(`${API_BASE}/api/queue/refill`, {
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
  if (!confirm("Are you sure you want to remove this post from the queue?")) return;
  
  try {
    const res = await fetch(`${API_BASE}/api/queue/${queueId}`, {
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
  if (!session) return;
  
  try {
    const res = await fetch(`${API_BASE}/api/analytics`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    
    if (res.ok) {
      const data = await res.json();
      renderAnalytics(data);
    }
  } catch (error) {
    console.error("Failed to fetch analytics:", error);
  }
}

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
  loadHistory();
  renderHistory();
  renderAccounts();
  renderPlatformChips();
  await refreshAuth();
  await fetchScheduled();
  
  // Initialize new feature views
  if ($("#view-drafts")) fetchDrafts();
  if ($("#view-hashtags")) fetchHashtagGroups();
  if ($("#view-replies")) fetchSavedReplies();
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
  if (viewName === "drafts") fetchDrafts();
  if (viewName === "hashtags") fetchHashtagGroups();
  if (viewName === "replies") fetchSavedReplies();
  if (viewName === "queue") fetchQueue();
  if (viewName === "analytics") fetchAnalytics();
}

// ── Event Listeners ──

$("#btn-create-hashtag-group")?.addEventListener("click", showCreateHashtagGroupModal);
$("#btn-create-reply")?.addEventListener("click", showCreateReplyModal);
$("#btn-refill-queue")?.addEventListener("click", refillQueue);

init();
