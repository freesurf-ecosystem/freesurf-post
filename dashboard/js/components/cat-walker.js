const SLEEP_POSE = `
  <svg class="cat-walker__svg" viewBox="0 0 48 44" aria-hidden="true" focusable="false">
    <g class="cat-sleep__body">
      <path d="M4 40.5 C3 30 9.5 18 21.5 17 C30 16.3 36 20 38 27 C39.5 32 39 37 37 40.5 Z" fill="var(--cat-ink)"/>
      <path d="M12 37 C10.5 30 15 25.5 22 26" fill="none" stroke="var(--cat-paper)" stroke-width="0.9" stroke-linecap="round" opacity="0.35"/>
    </g>
    <g class="cat-sleep__tail">
      <path d="M6.5 37 C5 42.5 15 42.6 23 41.6 C28 41 31.5 40.2 32.5 37.8" fill="none" stroke="var(--cat-paper)" stroke-width="5.6" stroke-linecap="round"/>
      <path d="M6.5 37 C5 42.5 15 42.6 23 41.6 C28 41 31.5 40.2 32.5 37.8" fill="none" stroke="var(--cat-ink)" stroke-width="3.4" stroke-linecap="round"/>
    </g>
    <path d="M36 37 C38 36 44 36.2 46 38.4 C47 39.8 46 41 44 41 L37 41 Z" fill="var(--cat-ink)" stroke="var(--cat-paper)" stroke-width="0.8" stroke-linejoin="round"/>
    <ellipse cx="37.5" cy="30" rx="8.3" ry="6.8" fill="var(--cat-ink)" stroke="var(--cat-paper)" stroke-width="0.7"/>
    <g fill="var(--cat-ink)" stroke="var(--cat-ink)" stroke-width="1" stroke-linejoin="round">
      <path d="M31.2 26 L32.3 17.3 L37.6 23 Z"/>
      <path class="cat-sleep__ear" d="M39.3 23 L44.6 18.4 L45 26.5 Z"/>
    </g>
    <path d="M39.4 29.4 q1.8 1.5 3.6 0" fill="none" stroke="var(--cat-paper)" stroke-width="0.9" stroke-linecap="round"/>
    <path d="M45.2 31 l3 -0.6 M45.2 32.2 l3 0.5" stroke="var(--cat-ink)" stroke-width="0.5" stroke-linecap="round" opacity="0.6"/>
  </svg>
`;

const STRETCH_POSE = `
  <svg class="cat-walker__svg" viewBox="0 0 64 44" aria-hidden="true" focusable="false">
    <path class="cat-stretch__tail" d="M12.5 18 C6 14 4.5 6 9 2.5" fill="none" stroke="var(--cat-ink)" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M19.5 29 L21 40.5" stroke="var(--cat-ink)" stroke-width="3.8" stroke-linecap="round"/>
    <path d="M45 31 L59.5 36" stroke="var(--cat-ink)" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M11 41 C11.5 36 9.5 30 10.5 23 C11.5 16 16 13.5 21 14 C28 15 36 21 42 27 C44 29 48 33 52 35.5 C55 37 59 37.5 61 38.5 C62.5 39.3 62 41 60 41 L44 41 C40 41 37 39.5 34 38 C29 35.5 24 31 21 30.5 C18 33 16.5 37 16 41 Z" fill="var(--cat-ink)" stroke="var(--cat-paper)" stroke-width="0.9" stroke-linejoin="round"/>
    <ellipse cx="47" cy="27.5" rx="6.8" ry="5.8" fill="var(--cat-ink)" stroke="var(--cat-paper)" stroke-width="0.7"/>
    <ellipse cx="52.6" cy="29.3" rx="3.4" ry="2.5" fill="var(--cat-ink)"/>
    <g fill="var(--cat-ink)" stroke="var(--cat-ink)" stroke-width="1" stroke-linejoin="round">
      <path d="M41.6 24 L42.3 16.3 L46.8 21.6 Z"/>
      <path d="M48.6 21.6 L53.6 17 L53.6 24.6 Z"/>
    </g>
    <path d="M48.3 26.6 q1.5 -1.3 3 0" fill="none" stroke="var(--cat-paper)" stroke-width="0.9" stroke-linecap="round"/>
    <path d="M55.6 29.2 l3 -0.7 M55.6 30.4 l3 0.4" stroke="var(--cat-ink)" stroke-width="0.5" stroke-linecap="round" opacity="0.6"/>
  </svg>
`;

const TEMPLATE = `
  <div class="cat-walker__flip">
    <div class="cat-walker__pose cat-walker__pose--sleep">${SLEEP_POSE}</div>
    <div class="cat-walker__pose cat-walker__pose--stretch">${STRETCH_POSE}</div>
  </div>
`;

const FIRST_NAP_MIN = 55 * 1000;
const FIRST_NAP_MAX = 65 * 1000;
const NAP_MIN = 3 * 60 * 1000;
const NAP_MAX = 6 * 60 * 1000;
const STRETCH_MS = 5000;
const OVERDUE_STRETCH_DELAY = 1500;
const STATES = ["sleeping", "stretching"];
// Per-tab, so the nap schedule carries across page loads instead of restarting on each one.
const STORAGE_KEY = "cat-walker:next-stretch";

function randomNap() {
  return NAP_MIN + Math.random() * (NAP_MAX - NAP_MIN);
}

function readNextStretch() {
  try {
    const value = Number(sessionStorage.getItem(STORAGE_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeNextStretch(timestamp) {
  try {
    sessionStorage.setItem(STORAGE_KEY, String(timestamp));
  } catch {
    // Storage unavailable (e.g. privacy mode): the cat just keeps its schedule per page.
  }
}

class CatWalker extends HTMLElement {
  connectedCallback() {
    if (this.dataset.ready === "true") return;
    this.dataset.ready = "true";
    this.innerHTML = TEMPLATE;
    this.setAttribute("aria-hidden", "true");
    this.classList.add("is-visible");
    this._timer = null;

    const nextStretch = readNextStretch();
    if (nextStretch === null) {
      this._napFor(FIRST_NAP_MIN + Math.random() * (FIRST_NAP_MAX - FIRST_NAP_MIN));
    } else {
      this._napFor(Math.max(nextStretch - Date.now(), OVERDUE_STRETCH_DELAY), { persist: false });
    }
  }

  disconnectedCallback() {
    if (this._timer) clearTimeout(this._timer);
  }

  _setState(state) {
    for (const name of STATES) this.classList.toggle(`is-${name}`, name === state);
  }

  _napFor(ms, { persist = true } = {}) {
    if (this._timer) clearTimeout(this._timer);
    this._setState("sleeping");
    if (persist) writeNextStretch(Date.now() + ms);
    this._timer = setTimeout(() => this._stretch(), ms);
  }

  _stretch() {
    if (this._timer) clearTimeout(this._timer);
    this._setState("stretching");
    // Keep a page change mid-stretch from triggering another stretch straight away.
    writeNextStretch(Date.now() + NAP_MIN);
    this._timer = setTimeout(() => this._napFor(randomNap()), STRETCH_MS);
  }
}

if (!customElements.get("cat-walker")) {
  customElements.define("cat-walker", CatWalker);
}
