const CAT_TEMPLATE = `
  <div class="cat-walker__flip">
    <svg class="cat-walker__svg" viewBox="0 0 64 44" aria-hidden="true" focusable="false">
      <g class="cat-walker__bob">
        <g class="cat-walker__tail">
          <path d="M17 31 C7 32 4 22 9 15" fill="none" stroke="var(--cat-fur-dark)" stroke-width="4.5" stroke-linecap="round"/>
          <path d="M9 15 C10 12 13.5 12 13.5 15.5" fill="none" stroke="var(--cat-belly)" stroke-width="2.6" stroke-linecap="round"/>
        </g>
        <g stroke="var(--cat-fur-dark)" stroke-width="4.5" stroke-linecap="round">
          <line class="cat-leg cat-leg--a" x1="23" y1="33" x2="23" y2="41"/>
          <line class="cat-leg cat-leg--b" x1="41" y1="33" x2="41" y2="41"/>
        </g>
        <g>
          <ellipse cx="30" cy="27" rx="15" ry="9.5" fill="var(--cat-fur)"/>
          <path d="M21 25 q4 6 8 7" fill="none" stroke="var(--cat-fur-dark)" stroke-width="2.2" stroke-linecap="round" opacity="0.55"/>
          <path d="M27 21 q2 8 0 14" fill="none" stroke="var(--cat-fur-dark)" stroke-width="2.2" stroke-linecap="round" opacity="0.45"/>
          <path d="M20 30 q10 5 20 -1" fill="none" stroke="var(--cat-belly)" stroke-width="3.4" stroke-linecap="round"/>
        </g>
        <g class="cat-walker__head">
          <polygon points="39.5,13 41,4.5 46.5,11.5" fill="var(--cat-fur)"/>
          <polygon points="49,11 53,4 55.5,13" fill="var(--cat-fur)"/>
          <circle cx="47" cy="20" r="9.5" fill="var(--cat-fur)"/>
          <polygon points="41,11 42,6.5 45,11" fill="var(--cat-pink)"/>
          <polygon points="50.5,11 52.5,6.5 54,11.5" fill="var(--cat-pink)"/>
          <ellipse cx="52.5" cy="23" rx="3.7" ry="2.9" fill="var(--cat-belly)"/>
          <g class="cat-walker__eyes">
            <ellipse cx="50" cy="18.5" rx="1.5" ry="2" fill="var(--cat-ink)"/>
          </g>
          <path d="M54.6 21.2 l1.9 0.7 -1.5 1.1 z" fill="var(--cat-pink)"/>
          <path d="M56.4 22.9 q-1.2 1.3 -2.4 0.5" fill="none" stroke="var(--cat-ink)" stroke-width="0.7" stroke-linecap="round"/>
          <path d="M55.2 21.2 l6.2 -1.6 M55.3 23.2 l6.1 1.1" fill="none" stroke="var(--cat-ink)" stroke-width="0.6" stroke-linecap="round" opacity="0.55"/>
        </g>
      </g>
    </svg>
  </div>
`;

const SPEED = 46;
const EDGE = 16;

class CatWalker extends HTMLElement {
  connectedCallback() {
    if (this.dataset.ready === "true") return;
    this.dataset.ready = "true";
    this.innerHTML = CAT_TEMPLATE;
    this.setAttribute("aria-hidden", "true");

    this._welcome = document.getElementById("view-welcome");
    this._flip = this.querySelector(".cat-walker__flip");
    this._width = 56;
    this._x = 0;
    this._target = 0;
    this._pauseUntil = 0;
    this._direction = 1;
    this._active = false;
    this._last = 0;

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

    if (this._active && !this._started) {
      this._started = true;
      this._width = this.offsetWidth || 56;
      this._x = EDGE + Math.random() * Math.max(1, window.innerWidth - this._width - EDGE * 2);
      this._pickTarget(performance.now() + 900 + Math.random() * 1200);
      this._render();
    }
  }

  _clamp() {
    this._width = this.offsetWidth || this._width;
    const maxX = Math.max(EDGE, window.innerWidth - this._width - EDGE);
    this._x = Math.min(Math.max(this._x, EDGE), maxX);
    this._target = Math.min(Math.max(this._target, EDGE), maxX);
    this._render();
  }

  _pickTarget(nextPauseUntil) {
    const maxX = Math.max(EDGE, window.innerWidth - this._width - EDGE);
    this._target = EDGE + Math.random() * (maxX - EDGE);
    this._pauseUntil = nextPauseUntil;
  }

  _render() {
    this.style.transform = `translate3d(${this._x}px, 0, 0)`;
  }

  _setWalking(walking) {
    this.classList.toggle("is-walking", walking);
    if (walking) this.classList.toggle("is-left", this._direction < 0);
  }

  _frame(now) {
    const dt = Math.min((now - this._last) / 1000, 0.05);
    this._last = now;

    if (this._active) this._tick(now, dt);
    requestAnimationFrame(this._frame);
  }

  _tick(now, dt) {
    if (now < this._pauseUntil) {
      this._setWalking(false);
      return;
    }

    const dx = this._target - this._x;
    const distance = Math.abs(dx);

    if (distance < 0.5) {
      this._x = this._target;
      this._setWalking(false);
      this._pickTarget(now + 1100 + Math.random() * 3400);
      this._render();
      return;
    }

    this._direction = dx < 0 ? -1 : 1;
    this._x += Math.sign(dx) * Math.min(distance, SPEED * dt);
    this._setWalking(true);
    this._render();
  }
}

if (!customElements.get("cat-walker")) {
  customElements.define("cat-walker", CatWalker);
}
