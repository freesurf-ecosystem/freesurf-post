const WALK_POSE = `
  <svg class="cat-walker__svg" viewBox="0 0 64 44" aria-hidden="true" focusable="false">
    <g class="cat-walker__bob">
      <g class="cat-walker__tail">
        <path d="M17 30 C6 31 4 20 10 13" fill="none" stroke="var(--cat-ink)" stroke-width="4.2" stroke-linecap="round"/>
      </g>
      <g stroke="var(--cat-ink)" stroke-width="4" stroke-linecap="round">
        <line class="cat-leg cat-leg--a" x1="24" y1="32" x2="24" y2="41"/>
        <line class="cat-leg cat-leg--b" x1="41" y1="32" x2="41" y2="41"/>
      </g>
      <ellipse cx="30" cy="27" rx="15" ry="9" fill="var(--cat-paper)" stroke="var(--cat-ink)" stroke-width="1.6"/>
      <g clip-path="url(#cat-walk-body)">
        <path d="M17 23 Q30 16 43 23" fill="none" stroke="var(--cat-ink)" stroke-width="3.4" stroke-linecap="round"/>
      </g>
      <g class="cat-walker__head">
        <polygon points="39,13 40.5,4.5 46,11" fill="var(--cat-ink)"/>
        <polygon points="50,11 53.5,4.5 55.5,13" fill="var(--cat-ink)"/>
        <circle cx="47" cy="20" r="9.5" fill="var(--cat-paper)" stroke="var(--cat-ink)" stroke-width="1.6"/>
        <g clip-path="url(#cat-walk-head)">
          <rect x="36" y="8" width="22" height="9" fill="var(--cat-ink)"/>
        </g>
        <ellipse cx="52.5" cy="23" rx="3.8" ry="3" fill="var(--cat-paper)"/>
        <g class="cat-walker__eyes">
          <ellipse cx="50" cy="19" rx="1.4" ry="1.9" fill="var(--cat-ink)"/>
        </g>
        <path d="M54.8 21.4 l1.7 0.6 -1.4 1 z" fill="var(--cat-ink)"/>
        <path d="M56.4 23 q-1.1 1.2 -2.3 0.5" fill="none" stroke="var(--cat-ink)" stroke-width="0.7" stroke-linecap="round"/>
        <path d="M55.2 21.4 l6 -1.5 M55.3 23.2 l6 1" fill="none" stroke="var(--cat-ink)" stroke-width="0.6" stroke-linecap="round" opacity="0.5"/>
      </g>
    </g>
    <defs>
      <clipPath id="cat-walk-body"><ellipse cx="30" cy="27" rx="15" ry="9"/></clipPath>
      <clipPath id="cat-walk-head"><circle cx="47" cy="20" r="9.5"/></clipPath>
    </defs>
  </svg>
`;

const SLEEP_POSE = `
  <svg class="cat-walker__svg" viewBox="0 0 48 44" aria-hidden="true" focusable="false">
    <g>
      <path d="M11 31 C5 35 9 41 19 41 C29 41 38 37 38 31" fill="none" stroke="var(--cat-ink)" stroke-width="4" stroke-linecap="round"/>
      <ellipse cx="24" cy="27" rx="16" ry="11" fill="var(--cat-paper)" stroke="var(--cat-ink)" stroke-width="1.6"/>
      <g clip-path="url(#cat-sleep-body)">
        <path d="M9 23 Q24 15 39 23" fill="none" stroke="var(--cat-ink)" stroke-width="3.4" stroke-linecap="round"/>
      </g>
      <circle cx="32" cy="23" r="8" fill="var(--cat-paper)" stroke="var(--cat-ink)" stroke-width="1.6"/>
      <g clip-path="url(#cat-sleep-head)">
        <rect x="23" y="14" width="18" height="5.5" fill="var(--cat-ink)"/>
      </g>
      <polygon points="26,18 27.5,11 32,16" fill="var(--cat-ink)"/>
      <polygon points="35,16 39,11.5 39.5,18.5" fill="var(--cat-ink)"/>
      <path d="M34 24 q2 1.5 4 0" fill="none" stroke="var(--cat-ink)" stroke-width="1.2" stroke-linecap="round"/>
      <circle cx="40.5" cy="26" r="0.9" fill="var(--cat-ink)"/>
    </g>
    <defs>
      <clipPath id="cat-sleep-body"><ellipse cx="24" cy="27" rx="16" ry="11"/></clipPath>
      <clipPath id="cat-sleep-head"><circle cx="32" cy="23" r="8"/></clipPath>
    </defs>
  </svg>
`;

const STRETCH_POSE = `
  <svg class="cat-walker__svg" viewBox="0 0 64 44" aria-hidden="true" focusable="false">
    <g>
      <path d="M17 24 C7 24 5 14 11 8" fill="none" stroke="var(--cat-ink)" stroke-width="4.2" stroke-linecap="round"/>
      <g stroke="var(--cat-ink)" stroke-width="4" stroke-linecap="round">
        <line x1="21" y1="30" x2="21" y2="41"/>
        <line x1="27" y1="31" x2="27" y2="41"/>
        <line x1="45" y1="32" x2="62" y2="40"/>
        <line x1="46" y1="35" x2="62" y2="42"/>
      </g>
      <ellipse cx="33" cy="26" rx="17" ry="8" fill="var(--cat-paper)" stroke="var(--cat-ink)" stroke-width="1.6"/>
      <g clip-path="url(#cat-stretch-body)">
        <path d="M16 22 Q33 15 50 22" fill="none" stroke="var(--cat-ink)" stroke-width="3.4" stroke-linecap="round"/>
      </g>
      <polygon points="45,14 46.5,6 51,12" fill="var(--cat-ink)"/>
      <polygon points="55,12 58.5,6 60,14" fill="var(--cat-ink)"/>
      <circle cx="52" cy="22" r="8" fill="var(--cat-paper)" stroke="var(--cat-ink)" stroke-width="1.6"/>
      <g clip-path="url(#cat-stretch-head)">
        <rect x="43" y="11" width="18" height="7" fill="var(--cat-ink)"/>
      </g>
      <ellipse cx="56.5" cy="25" rx="3.2" ry="2.6" fill="var(--cat-paper)"/>
      <ellipse cx="55" cy="21" rx="1.3" ry="1.7" fill="var(--cat-ink)"/>
      <path d="M59.4 23.4 l1.6 0.5 -1.3 0.9 z" fill="var(--cat-ink)"/>
      <path d="M60.8 24.8 q-1 1.1 -2.1 0.4" fill="none" stroke="var(--cat-ink)" stroke-width="0.7" stroke-linecap="round"/>
    </g>
    <defs>
      <clipPath id="cat-stretch-body"><ellipse cx="33" cy="26" rx="17" ry="8"/></clipPath>
      <clipPath id="cat-stretch-head"><circle cx="52" cy="22" r="8"/></clipPath>
    </defs>
  </svg>
`;

const TEMPLATE = `
  <div class="cat-walker__flip">
    <div class="cat-walker__pose cat-walker__pose--sleep">${SLEEP_POSE}</div>
    <div class="cat-walker__pose cat-walker__pose--stretch">${STRETCH_POSE}</div>
  </div>
`;

const FIRST_NAP_MIN = 20000;
const FIRST_NAP_MAX = 35000;
const NAP_MIN = 3 * 60 * 1000;
const NAP_MAX = 6 * 60 * 1000;
const STRETCH_MS = 2000;
const STATES = ["sleeping", "stretching"];

class CatWalker extends HTMLElement {
  connectedCallback() {
    if (this.dataset.ready === "true") return;
    this.dataset.ready = "true";
    this.innerHTML = TEMPLATE;
    this.setAttribute("aria-hidden", "true");

    this._welcome = document.getElementById("view-welcome");
    this._timer = null;
    this._firstNap = true;

    this._syncVisibility();
    if (this._welcome) {
      this._observer = new MutationObserver(() => this._syncVisibility());
      this._observer.observe(this._welcome, { attributes: true, attributeFilter: ["class"] });
    }

    this._scheduleNap();
  }

  disconnectedCallback() {
    if (this._timer) clearTimeout(this._timer);
    if (this._observer) this._observer.disconnect();
  }

  _syncVisibility() {
    const visible = Boolean(this._welcome) && !this._welcome.classList.contains("hidden");
    this.classList.toggle("is-visible", visible);
  }

  _setState(state) {
    for (const name of STATES) this.classList.toggle(`is-${name}`, name === state);
  }

  _scheduleNap() {
    if (this._timer) clearTimeout(this._timer);
    this._setState("sleeping");
    const min = this._firstNap ? FIRST_NAP_MIN : NAP_MIN;
    const max = this._firstNap ? FIRST_NAP_MAX : NAP_MAX;
    this._firstNap = false;
    this._timer = setTimeout(() => this._stretch(), min + Math.random() * (max - min));
  }

  _stretch() {
    if (this._timer) clearTimeout(this._timer);
    this._setState("stretching");
    this._timer = setTimeout(() => this._scheduleNap(), STRETCH_MS);
  }
}

if (!customElements.get("cat-walker")) {
  customElements.define("cat-walker", CatWalker);
}
