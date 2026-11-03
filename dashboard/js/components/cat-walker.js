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
    <div class="cat-walker__pose cat-walker__pose--walk">${WALK_POSE}</div>
    <div class="cat-walker__pose cat-walker__pose--sleep">${SLEEP_POSE}</div>
    <div class="cat-walker__pose cat-walker__pose--stretch">${STRETCH_POSE}</div>
  </div>
`;

const SPEED = 44;
const EDGE = 10;
const HOP_MS = 700;
const SHOWCASE_MS = 35000;
const REST_MIN_MS = 5 * 60 * 1000;
const REST_MAX_MS = 10 * 60 * 1000;
const NEARBY_PX = 220;
const STATES = ["idle", "walking", "hopping", "sleeping", "stretching"];

class CatWalker extends HTMLElement {
  connectedCallback() {
    if (this.dataset.ready === "true") return;
    this.dataset.ready = "true";
    this.innerHTML = TEMPLATE;
    this.setAttribute("aria-hidden", "true");

    this._welcome = document.getElementById("view-welcome");
    this._width = 64;
    this._height = 56;
    this._x = 0;
    this._y = 0;
    this._targetX = 0;
    this._lane = 0;
    this._state = "idle";
    this._stateUntil = 0;
    this._showcaseUntil = 0;
    this._hop = null;
    this._active = false;
    this._last = 0;
    this._started = false;

    this._onResize = () => this._clamp();
    window.addEventListener("resize", this._onResize);

    this._syncVisibility();
    if (this._welcome) {
      this._observer = new MutationObserver(() => this._syncVisibility());
      this._observer.observe(this._welcome, { attributes: true, attributeFilter: ["class"] });
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    this._onMotionChange = () => this._syncVisibility();
    if (reduced.addEventListener) reduced.addEventListener("change", this._onMotionChange);

    this._frame = this._frame.bind(this);
    requestAnimationFrame((now) => {
      this._last = now;
      this._frame(now);
    });
  }

  disconnectedCallback() {
    window.removeEventListener("resize", this._onResize);
    if (this._observer) this._observer.disconnect();
    if (this._onMotionChange) {
      window.matchMedia("(prefers-reduced-motion: reduce)").removeEventListener("change", this._onMotionChange);
    }
    this._active = false;
  }

  _syncVisibility() {
    const welcomeVisible = Boolean(this._welcome) && !this._welcome.classList.contains("hidden");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.classList.toggle("is-visible", welcomeVisible);
    this._active = welcomeVisible && !reduced;

    if (this._active && !this._started) this._start(performance.now());
  }

  _start(now) {
    this._started = true;
    this._width = this.offsetWidth || this._width;
    this._height = this.offsetHeight || this._height;
    const { maxX, bottomY } = this._lanes();
    this._lane = 0;
    this._x = EDGE + Math.random() * Math.max(1, maxX - EDGE);
    this._y = bottomY;
    this._showcaseUntil = now + SHOWCASE_MS;
    this._setState("idle");
    this._stateUntil = now + 700 + Math.random() * 900;
    this._face(1);
    this._render();
  }

  _lanes() {
    return {
      maxX: Math.max(EDGE, window.innerWidth - this._width - EDGE),
      topY: 0,
      bottomY: Math.max(0, window.innerHeight - this._height - EDGE),
    };
  }

  _clamp() {
    this._width = this.offsetWidth || this._width;
    this._height = this.offsetHeight || this._height;
    const { maxX, topY, bottomY } = this._lanes();
    this._x = Math.min(Math.max(this._x, EDGE), maxX);
    this._targetX = Math.min(Math.max(this._targetX, EDGE), maxX);
    if (this._hop) {
      this._hop.x1 = Math.min(Math.max(this._hop.x1, EDGE), maxX);
      this._hop.y1 = this._lane === 0 ? bottomY : topY;
    } else {
      this._y = this._lane === 0 ? bottomY : topY;
    }
    this._render();
  }

  _setState(state) {
    this._state = state;
    for (const name of STATES) this.classList.toggle(`is-${name}`, name === state);
  }

  _face(direction) {
    this.classList.toggle("is-left", direction < 0);
  }

  _render() {
    this.style.left = `${this._x}px`;
    this.style.top = `${this._y}px`;
  }

  _randomX(maxX) {
    let x = EDGE;
    for (let i = 0; i < 6; i++) {
      x = EDGE + Math.random() * Math.max(1, maxX - EDGE);
      if (Math.abs(x - this._x) >= 60) break;
    }
    return x;
  }

  _startWalk(now, nearby = false) {
    const { maxX, topY, bottomY } = this._lanes();
    const spread = nearby ? NEARBY_PX : 180;
    const laneChance = nearby ? 0.12 : 0.28;

    if (Math.random() < laneChance) {
      const lane = this._lane === 0 ? 1 : 0;
      const targetX = Math.min(Math.max(this._x + (Math.random() * spread - spread / 2), EDGE), maxX);
      this._hop = {
        x0: this._x,
        y0: this._y,
        x1: targetX,
        y1: lane === 0 ? bottomY : topY,
        start: now,
        dur: HOP_MS,
      };
      this._lane = lane;
      this._face(targetX < this._x ? -1 : 1);
      this._setState("hopping");
      return;
    }

    let targetX;
    if (nearby) {
      const offset = (Math.random() < 0.5 ? -1 : 1) * (70 + Math.random() * (NEARBY_PX - 70));
      targetX = Math.min(Math.max(this._x + offset, EDGE), maxX);
      if (Math.abs(targetX - this._x) < 40) {
        const alt = this._x > (EDGE + maxX) / 2 ? this._x - (70 + Math.random() * NEARBY_PX) : this._x + (70 + Math.random() * NEARBY_PX);
        targetX = Math.min(Math.max(alt, EDGE), maxX);
      }
    } else {
      targetX = this._randomX(maxX);
    }

    this._targetX = targetX;
    this._face(this._targetX < this._x ? -1 : 1);
    this._setState("walking");
  }

  _rest(now, min, max, sleeping) {
    this._setState(sleeping ? "sleeping" : "idle");
    this._stateUntil = now + min + Math.random() * (max - min);
  }

  _arrive(now) {
    if (now >= this._showcaseUntil) {
      this._rest(now, REST_MIN_MS, REST_MAX_MS, true);
      return;
    }

    const roll = Math.random();
    if (roll < 0.12) this._rest(now, 2500, 5000, true);
    else if (roll < 0.5) this._rest(now, 600, 1600, false);
    else this._startWalk(now);
  }

  _frame(now) {
    const dt = Math.min((now - this._last) / 1000, 0.05);
    this._last = now;
    if (this._active) this._tick(now, dt);
    requestAnimationFrame(this._frame);
  }

  _tick(now, dt) {
    switch (this._state) {
      case "walking": {
        const dx = this._targetX - this._x;
        const distance = Math.abs(dx);
        if (distance < 0.5) {
          this._x = this._targetX;
          this._arrive(now);
          this._render();
          return;
        }
        this._face(dx < 0 ? -1 : 1);
        this._x += Math.sign(dx) * Math.min(distance, SPEED * dt);
        this._render();
        break;
      }
      case "hopping": {
        if (!this._hop) return;
        const p = Math.min(1, (now - this._hop.start) / this._hop.dur);
        const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        this._x = this._hop.x0 + (this._hop.x1 - this._hop.x0) * eased;
        this._y = this._hop.y0 + (this._hop.y1 - this._hop.y0) * eased - Math.sin(p * Math.PI) * 34;
        this._render();
        if (p >= 1) {
          this._x = this._hop.x1;
          this._y = this._hop.y1;
          this._hop = null;
          this._setState("idle");
          this._stateUntil = now + 250;
        }
        break;
      }
      case "idle":
        if (now >= this._stateUntil) this._startWalk(now, now >= this._showcaseUntil);
        break;
      case "sleeping":
        if (now >= this._stateUntil) {
          this._setState("stretching");
          this._stateUntil = now + 1800;
        }
        break;
      case "stretching":
        if (now >= this._stateUntil) this._startWalk(now, now >= this._showcaseUntil);
        break;
    }
  }
}

if (!customElements.get("cat-walker")) {
  customElements.define("cat-walker", CatWalker);
}
