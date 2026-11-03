// The cat is one rig (body, head, tail, four jointed legs) drawn in a 64x44 box,
// facing right, ground at y≈41. Poses are sets of joint positions; the cat moves
// between them by interpolating every point, so it really gets up and lies down.

const INK = "var(--cat-ink)";
const PAPER = "var(--cat-paper)";

const leg = (name, upperWidth) => `
  <g data-leg="${name}" fill="none" stroke="${INK}" stroke-linecap="round" stroke-linejoin="round">
    <path data-bone="upper" stroke-width="${upperWidth}"/>
    <path data-bone="lower" stroke-width="3"/>
    <ellipse data-bone="paw" rx="2.1" ry="1.25" fill="${INK}" stroke="none"/>
  </g>`;

const TEMPLATE = `
  <div class="cat-walker__flip">
    <svg class="cat-walker__svg" viewBox="0 0 64 44" aria-hidden="true" focusable="false">
      <g data-part="bob">
        ${leg("fh", 4.6)}
        ${leg("ff", 3.8)}
        <g class="cat-rig__breath">
          <path data-part="body" fill="${INK}"/>
          <ellipse data-part="haunch" fill="${INK}"/>
        </g>
        ${leg("nh", 4.6)}
        <path data-part="tail-under" fill="none" stroke="${PAPER}" stroke-width="5.6" stroke-linecap="round"/>
        <path data-part="tail" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>
        ${leg("nf", 3.8)}
        <g data-part="head">
          <ellipse rx="6.5" ry="5.8" fill="${INK}" stroke="${PAPER}" stroke-width="0.7"/>
          <ellipse data-face="muzzle" fill="${INK}"/>
          <g fill="${INK}" stroke="${INK}" stroke-width="1" stroke-linejoin="round">
            <path data-face="ear-l"/>
            <path data-face="ear-r" class="cat-rig__ear"/>
          </g>
          <ellipse data-eye="open" class="cat-rig__eye" rx="1" ry="1.3" fill="${PAPER}"/>
          <ellipse data-face="eye-2" class="cat-rig__eye" rx="1" ry="1.3" fill="${PAPER}"/>
          <path data-face="nose" d="M-0.8 1.5 L0.8 1.5 L0 2.4 Z" fill="${PAPER}"/>
          <path data-eye="closed" d="M0.9 -0.7 q1.8 1.5 3.6 0" fill="none" stroke="${PAPER}" stroke-width="0.9" stroke-linecap="round"/>
          <path data-eye="happy" d="M1.1 -0.2 q1.5 -1.3 3 0" fill="none" stroke="${PAPER}" stroke-width="0.9" stroke-linecap="round"/>
          <path data-face="whiskers-side" d="M8.3 1.9 l3 -0.7 M8.3 3.1 l3 0.4" stroke="${INK}" stroke-width="0.5" stroke-linecap="round"/>
          <path data-face="whiskers-front" d="M-5.6 2.4 l-3.4 -0.8 M-5.6 3.4 l-3.4 0.4 M5.6 2.4 l3.4 -0.8 M5.6 3.4 l3.4 0.4" stroke="${INK}" stroke-width="0.5" stroke-linecap="round"/>
        </g>
      </g>
    </svg>
  </div>
`;

// body: start point + 6 cubic segments (rear, back, shoulders, chest, belly, rump).
// haunch: cx cy rx ry. head: x y rotation scale face (0 profile, 1 looking at you). eyes: open closed happy (opacity).
// tail: start + 2 cubic segments. legs: hip, knee, paw.
const POSES = {
  sleep: {
    body: [12.6, 31, 13.5, 24, 17, 19.5, 23, 17.8, 28, 16.5, 36, 16.8, 40.5, 20.5, 45, 24, 47.8, 30, 47.5, 35, 47.3, 39, 45, 40.8, 42, 40.8, 33, 41, 22, 41, 16, 40.6, 12.8, 40.3, 12, 35, 12.6, 31],
    haunch: [21, 33, 8, 7],
    head: [46.5, 31.6, 4, 1.12, 0],
    eyes: [0, 1, 0],
    tail: [15.5, 37, 14, 42.5, 24, 42.6, 32, 41.6, 37, 41, 40.5, 40.2, 41.5, 37.8],
    tailUnder: [1],
    fh: [23, 32, 26, 37, 31, 39.4],
    nh: [21, 33, 24, 38, 29, 39.6],
    ff: [44, 35, 48, 37.4, 54, 38],
    nf: [43, 36, 47, 38.2, 52.5, 38.8],
  },
  stretch: {
    body: [11, 22, 11, 17, 14.5, 14, 19, 14, 27, 14.5, 35, 20, 41, 26.5, 43.5, 29, 46.5, 30.5, 46, 32.5, 45.5, 35, 42, 35.5, 39, 35, 32, 33.5, 24, 29.5, 19, 27, 15, 25.5, 11.5, 25, 11, 22],
    haunch: [15.5, 20.5, 6, 6.5],
    head: [48, 27.5, 0, 1, 0],
    eyes: [0, 0, 1],
    tail: [12.5, 18, 9, 16, 6.5, 12, 7, 8, 7.3, 5.5, 8, 3.8, 9, 2.5],
    tailUnder: [0],
    fh: [18.5, 25, 16.5, 33, 17.5, 40],
    nh: [15, 24, 12.5, 32.5, 13.5, 40],
    ff: [44.5, 31.5, 52.5, 35.8, 60.5, 38.4],
    nf: [43, 33, 51, 37.6, 59.5, 39.6],
  },
  stand: {
    body: [14, 22.5, 13.5, 17.5, 17.5, 15.5, 23, 16, 30, 16.5, 36, 16, 41, 15, 45, 14.5, 48.5, 17, 48.5, 22, 48.5, 26, 45.5, 28, 41, 28, 34, 28.5, 26, 29, 20, 28.5, 16, 28, 14.5, 26, 14, 22.5],
    haunch: [19, 22.5, 6.5, 6.5],
    head: [50.5, 15.5, 0, 1, 0],
    eyes: [1, 0, 0],
    tail: [15.5, 20, 11, 19, 8, 16, 8, 12, 8, 9, 9, 6.5, 10.5, 5],
    tailUnder: [0],
    fh: [23, 26.5, 20.5, 33.8, 22, 40],
    nh: [19.5, 26, 16.5, 33.5, 18, 40],
    ff: [44, 24, 44.6, 32.1, 45.4, 40],
    nf: [41, 24, 41.3, 32.1, 42, 40],
  },
  // Facing the viewer, used halfway through a turn. Symmetric about x=32 (the flip axis),
  // so switching direction at this moment can't be seen.
  front: {
    body: [24, 24, 24, 20, 25.5, 17.5, 28, 17, 30.5, 16.6, 33.5, 16.6, 36, 17, 38.5, 17.5, 40, 20, 40, 24, 40, 27.5, 38.5, 30.3, 36, 30.5, 33.5, 30.8, 30.5, 30.8, 28, 30.5, 25.5, 30.3, 24, 27.5, 24, 24],
    haunch: [32, 25, 8, 6],
    head: [32, 15.5, 0, 1, 1],
    eyes: [1, 0, 0],
    tail: [32, 22, 32, 19, 32, 16, 32, 14.5, 32, 13, 32, 12, 32, 11],
    tailUnder: [0],
    fh: [27.5, 28, 27, 34, 27, 40],
    nh: [36.5, 28, 37, 34, 37, 40],
    ff: [35, 27, 35, 33.5, 35, 40],
    nf: [29, 27, 29, 33.5, 29, 40],
  },
};

// Ear, eye, and muzzle geometry in profile and from the front; the head blends between them.
const FACE = {
  earL: [[-5.2, -3, -4.3, -10.2, -0.2, -5.5], [-6.3, -2.2, -5.8, -10, -1.6, -5.4]],
  earR: [[1.5, -5.6, 6.2, -9.8, 6.6, -2.5], [1.6, -5.4, 5.8, -10, 6.3, -2.2]],
  eye: [[2.6, -0.9], [2.4, -0.7]],
  muzzle: [[5.3, 2.1, 3.2, 2.4], [0, 2.6, 3.4, 2.2]],
};
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

const LEGS = ["fh", "ff", "nh", "nf"];
// Walk gait (lateral sequence) and joint bend: hind hocks point back, front wrists forward.
const GAIT = { nh: { phase: 0, bend: 1 }, nf: { phase: 0.25, bend: -1 }, fh: { phase: 0.5, bend: 1 }, ff: { phase: 0.75, bend: -1 } };
const STRIDE = 3;
const STEP_LIFT = 2.2;
const GAIT_MS = 700;

// A fresh visit or a full refresh wakes the cat for a stretch shortly after the page appears.
const FIRST_NAP_MIN = 2500;
const FIRST_NAP_MAX = 4000;
const NAP_MIN = 3 * 60 * 1000;
const NAP_MAX = 6 * 60 * 1000;
const OVERDUE_STRETCH_DELAY = 1500;
// The wake-up routine: rise into a stretch, stand, step out, turn, step back, lie down.
const RISE_MS = 1400;
const STRETCH_HOLD_MS = 3600;
const STAND_UP_MS = 1100;
const STAND_MS = 600;
const CIRCLE_DISTANCE = 34; // px
const CIRCLE_STEP_MS = 1700; // keep in sync with the transform transition on cat-walker
const TURN_HALF_MS = 420;
const LIE_DOWN_MS = 1600;
const STATES = ["sleeping", "stretching", "standing", "walking"];
// Per-tab, so the nap schedule carries across page loads instead of restarting on each one.
const STORAGE_KEY = "cat-walker:next-stretch";

const ease = (t) => 0.5 - Math.cos(Math.PI * t) / 2;

function lerpPose(a, b, t) {
  const out = {};
  for (const key of Object.keys(a)) out[key] = a[key].map((v, i) => v + (b[key][i] - v) * t);
  return out;
}

function boneLengths([hx, hy, kx, ky, px, py]) {
  // A little slack so a striding leg can still reach the ground.
  return [Math.hypot(kx - hx, ky - hy) * 1.04, Math.hypot(px - kx, py - ky) * 1.04];
}

// Two-bone IK: place the knee so both bones keep their length, bending to one side.
function solveKnee(hx, hy, px, py, [l1, l2], bend) {
  let dx = px - hx;
  let dy = py - hy;
  let d = Math.hypot(dx, dy) || 0.001;
  if (d > l1 + l2 - 0.01) {
    const s = (l1 + l2 - 0.01) / d;
    dx *= s;
    dy *= s;
    px = hx + dx;
    py = hy + dy;
    d = l1 + l2 - 0.01;
  }
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / d;
  const uy = dy / d;
  return [hx + a * ux - bend * h * uy, hy + a * uy + bend * h * ux, px, py];
}

// Rotate every point of a path after the first around that first point (the tail root).
function rotateAround(points, angleDeg) {
  if (!angleDeg) return points;
  const [ox, oy] = points;
  const r = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const out = [ox, oy];
  for (let i = 2; i < points.length; i += 2) {
    const x = points[i] - ox;
    const y = points[i + 1] - oy;
    out.push(ox + x * cos - y * sin, oy + x * sin + y * cos);
  }
  return out;
}

const cubicPath = (p) => {
  const n = (v) => +v.toFixed(2);
  let d = `M${n(p[0])} ${n(p[1])}`;
  for (let i = 2; i < p.length; i += 6) d += ` C${p.slice(i, i + 6).map(n).join(" ")}`;
  return d;
};

function randomNap() {
  return NAP_MIN + Math.random() * (NAP_MAX - NAP_MIN);
}

function isReload() {
  const [entry] = performance.getEntriesByType?.("navigation") ?? [];
  return entry?.type === "reload";
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

class Cancelled extends Error {}

class CatWalker extends HTMLElement {
  connectedCallback() {
    if (this.dataset.ready === "true") return;
    this.dataset.ready = "true";
    this.innerHTML = TEMPLATE;
    this.setAttribute("aria-hidden", "true");
    this.classList.add("is-visible");
    this._timer = null;
    this._run = null;

    const part = (name) => this.querySelector(`[data-part="${name}"]`);
    this._el = {
      bob: part("bob"),
      body: part("body"),
      haunch: part("haunch"),
      head: part("head"),
      tail: part("tail"),
      tailUnder: part("tail-under"),
      eyes: ["open", "closed", "happy"].map((n) => this.querySelector(`[data-eye="${n}"]`)),
      face: Object.fromEntries(
        ["muzzle", "ear-l", "ear-r", "eye-2", "nose", "whiskers-side", "whiskers-front"].map((n) => [n, this.querySelector(`[data-face="${n}"]`)]),
      ),
      legs: Object.fromEntries(
        LEGS.map((name) => {
          const g = this.querySelector(`[data-leg="${name}"]`);
          const bone = (b) => g.querySelector(`[data-bone="${b}"]`);
          return [name, { upper: bone("upper"), lower: bone("lower"), paw: bone("paw") }];
        }),
      ),
    };
    this._bones = Object.fromEntries(LEGS.map((name) => [name, boneLengths(POSES.stand[name])]));
    this._pose = POSES.sleep;
    this._draw(this._pose);

    const nextStretch = readNextStretch();
    if (nextStretch === null || isReload()) {
      this._napFor(FIRST_NAP_MIN + Math.random() * (FIRST_NAP_MAX - FIRST_NAP_MIN));
    } else {
      this._napFor(Math.max(nextStretch - Date.now(), OVERDUE_STRETCH_DELAY), { persist: false });
    }
  }

  disconnectedCallback() {
    if (this._timer) clearTimeout(this._timer);
    this._run = null;
  }

  _setState(state) {
    for (const name of STATES) this.classList.toggle(`is-${name}`, name === state);
  }

  _napFor(ms, { persist = true } = {}) {
    if (this._timer) clearTimeout(this._timer);
    this._setState("sleeping");
    if (persist) writeNextStretch(Date.now() + ms);
    this._timer = setTimeout(() => this._wake(), ms);
  }

  async _wake() {
    // Keep a page change mid-routine from triggering another stretch straight away.
    writeNextStretch(Date.now() + NAP_MIN);
    const run = (this._run = {});
    try {
      this._setState("stretching");
      await this._tweenTo(POSES.stretch, RISE_MS, run);
      await this._animate(STRETCH_HOLD_MS, run, (ms) => {
        const fade = Math.min(1, ms / 400, (STRETCH_HOLD_MS - ms) / 400);
        this._draw(this._pose, { tailAngle: 12 * fade * Math.sin((ms / 1200) * 2 * Math.PI) });
      });
      this._setState("standing");
      await this._tweenTo(POSES.stand, STAND_UP_MS, run);
      await this._pause(STAND_MS, run);
      await this._turn(true, run);
      await this._walk(-CIRCLE_DISTANCE, run);
      await this._turn(false, run);
      await this._walk(0, run);
      this._setState("standing");
      await this._pause(STAND_MS, run);
      await this._tweenTo(POSES.sleep, LIE_DOWN_MS, run);
    } catch (error) {
      if (error instanceof Cancelled) return;
      throw error;
    }
    this._napFor(randomNap());
  }

  // Runs frame(elapsedMs) on every animation frame for `ms`, then resolves.
  _animate(ms, run, frame) {
    return new Promise((resolve, reject) => {
      const start = performance.now();
      const tick = (now) => {
        if (this._run !== run) return reject(new Cancelled());
        const elapsed = Math.min(Math.max(now - start, 0), ms);
        frame(elapsed);
        if (elapsed >= ms) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  _pause(ms, run) {
    return this._animate(ms, run, () => {});
  }

  async _tweenTo(target, ms, run) {
    const from = this._pose;
    await this._animate(ms, run, (elapsed) => this._draw(lerpPose(from, target, ease(elapsed / ms))));
    this._pose = target;
  }

  // Swing round to face the viewer, switch sides while symmetric, and swing on round.
  async _turn(facingLeft, run) {
    this._setState("standing");
    await this._tweenTo(POSES.front, TURN_HALF_MS, run);
    this.classList.toggle("is-left", facingLeft);
    await this._tweenTo(POSES.stand, TURN_HALF_MS, run);
  }

  async _walk(x, run) {
    this._setState("walking");
    this.style.transform = x ? `translateX(${x}px)` : "";
    const pose = this._pose;
    await this._animate(CIRCLE_STEP_MS, run, (ms) => {
      // Ease the stride in and out so the first and last steps aren't a jolt.
      const ramp = Math.min(1, ms / 300, (CIRCLE_STEP_MS - ms) / 300);
      const cycle = ms / GAIT_MS;
      const legs = {};
      for (const name of LEGS) {
        const [hx, hy, , , restX, restY] = pose[name];
        const p = (cycle + GAIT[name].phase) % 1;
        let px;
        let py = restY;
        if (p < 0.6) {
          px = restX + STRIDE * ramp * (1 - (2 * p) / 0.6);
        } else {
          const t = (p - 0.6) / 0.4;
          px = restX + STRIDE * ramp * (-1 + 2 * ease(t));
          py = restY - STEP_LIFT * ramp * Math.sin(Math.PI * t);
        }
        const [kx, ky, fx, fy] = solveKnee(hx, hy, px, py, this._bones[name], GAIT[name].bend);
        legs[name] = [hx, hy, kx, ky, fx, fy];
      }
      const bob = -0.5 * ramp * Math.abs(Math.sin(cycle * 2 * Math.PI));
      const sway = 6 * Math.sin((ms / 1400) * 2 * Math.PI);
      this._draw({ ...pose, ...legs }, { bob, tailAngle: sway });
    });
    this._draw(pose);
  }

  _draw(pose, { tailAngle = 0, bob = 0 } = {}) {
    const el = this._el;
    const n = (v) => +v.toFixed(2);
    el.bob.setAttribute("transform", bob ? `translate(0 ${n(bob)})` : "");
    el.body.setAttribute("d", cubicPath(pose.body));
    const [cx, cy, rx, ry] = pose.haunch;
    el.haunch.setAttribute("cx", n(cx));
    el.haunch.setAttribute("cy", n(cy));
    el.haunch.setAttribute("rx", n(rx));
    el.haunch.setAttribute("ry", n(ry));
    const [hx, hy, rot, scale, face] = pose.head;
    el.head.setAttribute("transform", `translate(${n(hx)} ${n(hy)}) rotate(${n(rot)}) scale(${n(scale)})`);
    pose.eyes.forEach((opacity, i) => el.eyes[i].setAttribute("opacity", n(opacity)));
    const f = el.face;
    const ear = (shape) => {
      const [x1, y1, x2, y2, x3, y3] = mix(shape[0], shape[1], face).map(n);
      return `M${x1} ${y1} L${x2} ${y2} L${x3} ${y3} Z`;
    };
    f["ear-l"].setAttribute("d", ear(FACE.earL));
    f["ear-r"].setAttribute("d", ear(FACE.earR));
    const [mx, my, mrx, mry] = mix(FACE.muzzle[0], FACE.muzzle[1], face).map(n);
    f.muzzle.setAttribute("cx", mx);
    f.muzzle.setAttribute("cy", my);
    f.muzzle.setAttribute("rx", mrx);
    f.muzzle.setAttribute("ry", mry);
    const [ex, ey] = mix(FACE.eye[0], FACE.eye[1], face).map(n);
    el.eyes[0].setAttribute("cx", ex);
    el.eyes[0].setAttribute("cy", ey);
    f["eye-2"].setAttribute("cx", -ex);
    f["eye-2"].setAttribute("cy", ey);
    f["eye-2"].setAttribute("opacity", n(pose.eyes[0] * face));
    f.nose.setAttribute("opacity", n(face));
    f["whiskers-side"].setAttribute("opacity", n(0.6 * (1 - face)));
    f["whiskers-front"].setAttribute("opacity", n(0.6 * face));
    const tail = cubicPath(rotateAround(pose.tail, tailAngle));
    el.tail.setAttribute("d", tail);
    el.tailUnder.setAttribute("d", tail);
    // The tail's paper edge only makes sense once it is wrapped round the curled-up body.
    el.tailUnder.setAttribute("opacity", n(Math.max(0, (pose.tailUnder[0] - 0.85) / 0.15)));
    for (const name of LEGS) {
      const [hipX, hipY, kneeX, kneeY, pawX, pawY] = pose[name].map(n);
      const bones = el.legs[name];
      bones.upper.setAttribute("d", `M${hipX} ${hipY} L${kneeX} ${kneeY}`);
      bones.lower.setAttribute("d", `M${kneeX} ${kneeY} L${pawX} ${pawY}`);
      // Paws point forward in profile and straight at the viewer from the front.
      bones.paw.setAttribute("cx", n(pawX + 0.9 * (1 - face)));
      bones.paw.setAttribute("cy", n(pawY + 0.1));
    }
  }
}

if (!customElements.get("cat-walker")) {
  customElements.define("cat-walker", CatWalker);
}
