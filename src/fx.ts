// fx.ts: optional Canvas 2D effects that stay smooth on the Board's GPU. These 40 lines are the
// whole API (the rest is implementation). Import only what you use; nothing runs until you call it.
// Units: world pixels (1920x1080, runtime.ts) and seconds. Per-frame ctx.shadowBlur, ctx.filter and
// getImageData stutter on the Board, so each glow here is painted ONCE into a cached canvas and
// stamped with drawImage + 'lighter'. Use a few fixed colours; animate position, size and alpha.
// Every system has update(dt) and draw(ctx). One frame (hit-stop holds game time, not shake or pops):
//   loop(dt => {
//     const g = hitStop.step(dt);
//     game.update(g); particles.update(g); splashes.update(g); trail.update(g); tweens.update(g);
//     shake.update(dt); pops.update(dt);
//     ctx.save(); shake.apply(ctx); drawWorld(ctx); trail.draw(ctx); particles.draw(ctx);
//     splashes.draw(ctx); ctx.restore(); pops.draw(ctx); drawHud(ctx);
//   });
// LOOP      const stop = loop((dt, now) => { ... });      // requestAnimationFrame; dt capped at 0.05 s
// BAKE      const bg = bake(1920, 1080, c => drawBackdrop(c)); // static art painted once...
//           ctx.drawImage(bg, 0, 0);                       // ...then one cheap drawImage per frame
// GLOW      drawGlow(ctx, x, y, "#3cf", 60);               // soft additive glow, radius 60
//           drawGlow(ctx, x, y, "#f4a", 90, 0.5 + 0.5 * Math.sin(now * 4)); // last arg: alpha 0-1
// NEON      neonLine(ctx, 100, 540, 1820, 540, "#3cf", 6);  // glowing tube with a white-hot core
//           neonCircle(ctx, 960, 540, 200, "#f4a", 5); neonPath(ctx, [x0, y0, x1, y1, x2, y2], "#ff3", 4, true);
// PARTICLES const particles = new Particles(300);          // fixed pool; when full, live ones recycle
//           particles.burst(x, y, { count: 40, color: "#fd4", speed: 600, life: 0.6 });
//           particles.burst(x, y, { count: 14, color: "#fff", angle: -Math.PI / 2, spread: 0.6, streak: 0.04 }); // sparks
//           // more options: size, radius (start on a ring), gravity, drag, glow: false (flat squares)
// TRAIL     const trail = new Trail({ color: "#3cf", width: 22, life: 0.25 }); // digital objects only
//           trail.push(puck.x, puck.y);                    // every frame; trail.clear() when it jumps
// SHAKE     const shake = new Shake(); shake.add(0.5);      // trauma 0-1, decays by itself
// HITSTOP   const hitStop = new HitStop(); hitStop.hit(0.08); // hold game time 80 ms on a big impact
// TWEEN     const tweens = new Tweens(); tweens.to(card, { x: 960, scale: 1 }, 0.4, { ease: ease.outBack });
//           tweens.num(0, 250, 0.6, v => (shown = Math.round(v)), { delay: 0.2, onDone: next });
//           // ease: linear inQuad outQuad inOutQuad outCubic (default) inOutCubic inOutSine outBack outElastic outBounce
// POP       const pops = new PopTexts(); pops.pop(x, y, "+10", { color: "#fd4", size: 56, face: "left" });
//           // face: "bottom" | "top" | "left" | "right" | radians; default: the edge nearest (x, y)
// SPLASH    const splashes = new Splashes();               // piece-down beat, gone within 1.5 s
//           splashes.at(c.x, c.y, { color: "#3cf", inner: 70, sound: () => playThud(), sparks: particles });
// Piece rule: by default, draw nothing around or under a moving piece. Call splashes.at()
// once when a piece lands (it starts at `inner`, the piece's radius, and travels out); use Trail only
// for digital objects. Effects that bounce off pieces are welcome. Tests: `npm test` (see FX.md).
// A glow traces the outline, only while still: drawOutlineGlow(ctx, pieceFootprint(...)), never a circle.

type Ctx = CanvasRenderingContext2D;
export type Ease = (t: number) => number;
export type Edge = "bottom" | "top" | "left" | "right";
/** What setCanvasFactory must return: a canvas (or a stand-in in tests). */
export type FxCanvas = { width: number; height: number; getContext(id: "2d"): unknown };

const TAU = Math.PI * 2;
/** A splash never lasts longer than this, whatever duration is asked for. */
export const SPLASH_MAX_S = 1.5;

export const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---- easing: t in 0-1 maps to 0-1 (outBack and outElastic overshoot on the way) -------------
export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => t * (2 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (2 - 2 * t) ** 2 / 2),
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (2 - 2 * t) ** 3 / 2),
  inOutSine: (t: number) => (1 - Math.cos(Math.PI * t)) / 2,
  outBack: (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
  outElastic: (t: number) =>
    t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1,
  outBounce: (t: number) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t - 1.5 / d) ** 2 + 0.75;
    if (t < 2.5 / d) return n * (t - 2.25 / d) ** 2 + 0.9375;
    return n * (t - 2.625 / d) ** 2 + 0.984375;
  },
} satisfies Record<string, Ease>;

/** The value between from and to at progress t (0-1), eased. */
export const tween = (from: number, to: number, t: number, e: Ease = ease.outCubic) =>
  from + (to - from) * e(clamp(t));

// ---- loop -----------------------------------------------------------------------------------
/** Calls tick(dt, now) every animation frame (seconds). Returns stop(). */
export function loop(tick: (dt: number, now: number) => void, maxDt = 0.05): () => void {
  let last = -1, id = 0, running = true;
  const frame = (ms: number) => {
    if (!running) return;
    id = requestAnimationFrame(frame); // first, so one thrown frame does not end the game
    const dt = last < 0 ? 0 : Math.min(maxDt, Math.max(0, (ms - last) / 1000));
    last = ms;
    tick(dt, ms / 1000);
  };
  id = requestAnimationFrame(frame);
  return () => { running = false; cancelAnimationFrame(id); };
}

// ---- offscreen canvases and the glow cache --------------------------------------------------
let makeCanvas = (w: number, h: number): FxCanvas =>
  typeof document !== "undefined"
    ? Object.assign(document.createElement("canvas"), { width: w, height: h })
    : new OffscreenCanvas(w, h);
/** Replace how offscreen canvases are made (tests without a DOM pass a stand-in). */
export function setCanvasFactory(factory: (w: number, h: number) => FxCanvas) { makeCanvas = factory; }
function newCanvas(w: number, h: number) {
  const c = makeCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)));
  return { c, g: c.getContext("2d") as Ctx };
}
const img = (c: FxCanvas) => c as unknown as CanvasImageSource;

/** Paint static art once into an offscreen canvas; drawImage it every frame instead. */
export function bake(width: number, height: number, draw: (c: Ctx) => void): CanvasImageSource {
  const { c, g } = newCanvas(width, height);
  draw(g);
  return img(c);
}

const DOT = 0, RING = 1, STRIP = 2;
const GLOW_CACHE_MAX = 160; // sprites kept before the cache starts over...
const GLOW_PIXELS_MAX = 24e6; // ...or pixels (about 96 MB): big rings of many sizes and colours
const glowCache = new Map<string, Map<number, FxCanvas>>();
let glowCount = 0, glowMade = 0, glowPixels = 0;
// Brightness falls off the same way for dots, rings and line strips, so neon caps meet seamlessly.
const AT = [0, 0.18, 0.42, 0.7, 1]; // distance from the bright centre, as a share of the glow
const FALL = [1, 0.8, 0.32, 0.08, 0];
/** Sizes snap to steps of about 19% (2^0.25), so a pulsing radius reuses a few sprites. */
const snap = (r: number) =>
  Math.min(1024, Math.max(2, Math.round(2 ** (Math.round(Math.log2(Math.max(r, 1)) * 4) / 4))));

function sprite(kind: number, color: string, r: number, w: number): FxCanvas {
  const R = snap(r), W = kind === DOT ? 0 : snap(w), key = (kind * 2048 + R) * 2048 + W;
  let byColor = glowCache.get(color);
  const hit = byColor?.get(key);
  if (hit) return hit;
  if (glowCount >= GLOW_CACHE_MAX || glowPixels >= GLOW_PIXELS_MAX) { clearGlowCache(); byColor = undefined; }
  if (!byColor) glowCache.set(color, (byColor = new Map()));
  const made = paintGlow(kind, color, R, W);
  byColor.set(key, made);
  glowCount++; glowMade++; glowPixels += made.width * made.height;
  return made;
}

function paintGlow(kind: number, color: string, R: number, W: number): FxCanvas {
  const half = kind === STRIP ? W : kind === RING ? R + W : R;
  const { c, g } = newCanvas(kind === STRIP ? 4 : half * 2, half * 2);
  const grad = kind === STRIP
    ? g.createLinearGradient(0, 0, 0, half * 2)
    : g.createRadialGradient(half, half, 0, half, half, half);
  const stop = (at: number, a: number) => grad.addColorStop(clamp(at), `rgba(255,255,255,${a})`);
  if (kind === DOT) AT.forEach((at, i) => stop(at, FALL[i]));
  else {
    const peak = kind === STRIP ? 0.5 : R / (R + W), spread = kind === STRIP ? 0.5 : W / (R + W);
    for (let i = 4; i > 0; i--) stop(peak - AT[i] * spread, FALL[i]);
    AT.forEach((at, i) => stop(peak + at * spread, FALL[i]));
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = "source-in"; // tint the white falloff: any CSS colour works
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

/** The cached glow dot for color at radius: drawImage it at 2 x radius, ideally with 'lighter'. */
export function glowSprite(color: string, radius: number): CanvasImageSource {
  return img(sprite(DOT, color, radius, 0));
}
export function glowCacheStats() { return { sprites: glowCount, made: glowMade, pixels: glowPixels }; }
export function clearGlowCache() { glowCache.clear(); glowCount = 0; glowPixels = 0; }

/** Additive glow dot at (x, y). alpha 0-1 multiplies the context's own alpha. */
export function drawGlow(ctx: Ctx, x: number, y: number, color: string, radius: number, alpha = 1) {
  if (alpha <= 0 || radius <= 0) return;
  const op = ctx.globalCompositeOperation, a = ctx.globalAlpha;
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = a * Math.min(1, alpha);
  ctx.drawImage(img(sprite(DOT, color, radius, 0)), x - radius, y - radius, radius * 2, radius * 2);
  ctx.globalCompositeOperation = op;
  ctx.globalAlpha = a;
}

// ---- neon: cached glow plus two plain strokes (colour, then a thin white core) --------------
function glowSegment(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, color: string, glow: number) {
  const len = Math.hypot(x2 - x1, y2 - y1), ang = Math.atan2(y2 - y1, x2 - x1);
  const strip = sprite(STRIP, color, 0, glow), dot = sprite(DOT, color, glow, 0), s = dot.width;
  ctx.translate(x1, y1);
  ctx.rotate(ang);
  ctx.drawImage(img(strip), 0, -glow, len, glow * 2);
  ctx.drawImage(img(dot), 0, 0, s / 2, s, -glow, -glow, glow, glow * 2); // round end caps
  ctx.drawImage(img(dot), s / 2, 0, s / 2, s, len, -glow, glow, glow * 2);
  ctx.rotate(-ang);
  ctx.translate(-x1, -y1);
}
function neonCore(ctx: Ctx, color: string, width: number) {
  ctx.globalCompositeOperation = "source-over";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.lineWidth = width * 0.4;
  ctx.strokeStyle = "#fff";
  ctx.globalAlpha *= 0.85;
  ctx.stroke();
}
const segment = [0, 0, 0, 0]; // reused by neonLine: no allocation per call
export function neonLine(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, color: string, width = 6, glow = width * 3) {
  segment[0] = x1; segment[1] = y1; segment[2] = x2; segment[3] = y2;
  neonPath(ctx, segment, color, width, false, glow);
}
/** points is flat [x0, y0, x1, y1, ...]; closed joins the last point to the first. */
export function neonPath(ctx: Ctx, points: ArrayLike<number>, color: string, width = 6, closed = false, glow = width * 3) {
  const n = points.length >> 1;
  if (n < 2) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0, segs = closed ? n : n - 1; i < segs; i++) {
    const j = (i + 1) % n;
    glowSegment(ctx, points[2 * i], points[2 * i + 1], points[2 * j], points[2 * j + 1], color, glow);
  }
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 1; i < n; i++) ctx.lineTo(points[2 * i], points[2 * i + 1]);
  if (closed) ctx.closePath();
  neonCore(ctx, color, width);
  ctx.restore();
}
function drawRing(ctx: Ctx, ring: FxCanvas, x: number, y: number, r: number, ringR: number) {
  const k = r / snap(ringR), h = (ring.width / 2) * k; // the cached ring, scaled so its peak sits on r
  ctx.drawImage(img(ring), x - h, y - h, h * 2, h * 2);
}
/** Where a ring drawn by drawRing with its peak on r starts to glow, as a share of r. */
function ringInner(ring: FxCanvas, ringR: number) {
  const R = snap(ringR);
  return (2 * R - ring.width / 2) / R;
}
export function neonCircle(ctx: Ctx, x: number, y: number, r: number, color: string, width = 6, glow = width * 3) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  drawRing(ctx, sprite(RING, color, r, glow), x, y, r, r);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  neonCore(ctx, color, width);
  ctx.restore();
}

// ---- particles: one fixed pool, typed arrays, no allocation per frame -----------------------
export type BurstOptions = {
  count?: number;   // default 24
  color?: string;   // default "#fff"
  speed?: number;   // px/s; each particle gets 40-100% of it (default 500)
  life?: number;    // seconds; each gets 60-100% of it (default 0.6)
  size?: number;    // glow radius in px (default 10); shrinks to half over the life
  angle?: number;   // direction in radians (0 = +x); omit for all around
  spread?: number;  // cone width around angle in radians (default 2π)
  radius?: number;  // start on a circle of this radius, moving out (crowns around a piece)
  gravity?: number; // px/s² along +y (default 0: a table has no down)
  drag?: number;    // share of speed lost per second (default 1.5)
  streak?: number;  // seconds of motion drawn as a streak (sparks: 0.03-0.06; default 0)
  glow?: boolean;   // false draws flat squares, the cheapest (default true)
};
export class Particles {
  readonly max: number;
  count = 0;
  private cursor = 0;
  private x: Float32Array; private y: Float32Array; private vx: Float32Array; private vy: Float32Array;
  private age: Float32Array; private life: Float32Array; private size: Float32Array;
  private grav: Float32Array; private drag: Float32Array; private streak: Float32Array;
  private sprite: (FxCanvas | null)[]; private color: string[];
  constructor(max = 300) {
    this.max = Math.max(1, Math.floor(max));
    const f = () => new Float32Array(this.max);
    this.x = f(); this.y = f(); this.vx = f(); this.vy = f(); this.age = f(); this.life = f();
    this.size = f(); this.grav = f(); this.drag = f(); this.streak = f();
    this.sprite = new Array<FxCanvas | null>(this.max).fill(null);
    this.color = new Array<string>(this.max).fill("#fff");
  }
  burst(x: number, y: number, o: BurstOptions = {}) {
    const count = Math.max(0, Math.floor(o.count ?? 24)), speed = o.speed ?? 500, life = o.life ?? 0.6;
    const size = o.size ?? 10, color = o.color ?? "#fff", ring = o.radius ?? 0;
    const spread = o.spread ?? TAU, all = o.angle === undefined && spread >= TAU;
    const glow = o.glow === false ? null : sprite(DOT, color, size, 0);
    for (let k = 0; k < count; k++) {
      const i = this.count < this.max ? this.count++ : (this.cursor = (this.cursor + 1) % this.max);
      const a = all ? Math.random() * TAU : (o.angle ?? 0) + (Math.random() - 0.5) * spread;
      const v = speed * (0.4 + 0.6 * Math.random()), c = Math.cos(a), s = Math.sin(a);
      this.x[i] = x + c * ring; this.y[i] = y + s * ring; this.vx[i] = c * v; this.vy[i] = s * v;
      this.age[i] = 0; this.life[i] = Math.max(0.01, life * (0.6 + 0.4 * Math.random()));
      this.size[i] = size; this.grav[i] = o.gravity ?? 0; this.drag[i] = o.drag ?? 1.5;
      this.streak[i] = o.streak ?? 0; this.sprite[i] = glow; this.color[i] = color;
    }
  }
  update(dt: number) {
    for (let i = 0; i < this.count; ) {
      if ((this.age[i] += dt) >= this.life[i]) { this.kill(i); continue; }
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vx[i] *= k;
      this.vy[i] = this.vy[i] * k + this.grav[i] * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      i++;
    }
  }
  draw(ctx: Ctx) {
    if (!this.count) return;
    ctx.save();
    const alpha = ctx.globalAlpha, op = ctx.globalCompositeOperation;
    for (let i = 0; i < this.count; i++) {
      const t = this.age[i] / this.life[i], r = this.size[i] * (1 - 0.5 * t), s = this.sprite[i];
      const x = this.x[i], y = this.y[i];
      ctx.globalAlpha = alpha * (1 - t);
      if (!s) {
        ctx.globalCompositeOperation = op;
        ctx.fillStyle = this.color[i];
        ctx.fillRect(x - r / 2, y - r / 2, r, r);
        continue;
      }
      ctx.globalCompositeOperation = "lighter";
      if (this.streak[i] > 0) {
        const vx = this.vx[i], vy = this.vy[i], v = Math.hypot(vx, vy) || 1;
        const c = vx / v, sn = vy / v, len = r + v * this.streak[i];
        ctx.transform(c, sn, -sn, c, x, y);
        ctx.drawImage(img(s), -len, -r * 0.6, len * 2, r * 1.2);
        ctx.transform(c, -sn, sn, c, 0, 0);
        ctx.translate(-x, -y);
      } else ctx.drawImage(img(s), x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
  }
  clear() { this.count = 0; }
  private kill(i: number) {
    const j = --this.count;
    if (i === j) return;
    this.x[i] = this.x[j]; this.y[i] = this.y[j]; this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j];
    this.age[i] = this.age[j]; this.life[i] = this.life[j]; this.size[i] = this.size[j];
    this.grav[i] = this.grav[j]; this.drag[i] = this.drag[j]; this.streak[i] = this.streak[j];
    this.sprite[i] = this.sprite[j]; this.color[i] = this.color[j];
  }
}

// ---- trail: a ring buffer of recent positions drawn as one tapered, fading ribbon -------------
export type TrailOptions = { color?: string; width?: number; life?: number; max?: number; glow?: boolean };
export class Trail {
  readonly max: number;
  color: string; width: number; life: number; glow: boolean;
  count = 0;
  private head = 0;
  private xs: Float32Array; private ys: Float32Array; private ages: Float32Array;
  private nx: Float32Array; private ny: Float32Array;
  constructor(o: TrailOptions = {}) {
    this.color = o.color ?? "#fff"; this.width = o.width ?? 20; this.life = o.life ?? 0.25;
    this.glow = o.glow ?? true; this.max = Math.max(2, Math.floor(o.max ?? 32));
    const f = () => new Float32Array(this.max);
    this.xs = f(); this.ys = f(); this.ages = f(); this.nx = f(); this.ny = f();
  }
  push(x: number, y: number) {
    this.head = (this.head + 1) % this.max;
    this.xs[this.head] = x; this.ys[this.head] = y; this.ages[this.head] = 0;
    if (this.count < this.max) this.count++;
  }
  update(dt: number) {
    for (let k = 0; k < this.count; k++) this.ages[this.at(k)] += dt;
    while (this.count > 0 && this.ages[this.at(this.count - 1)] >= this.life) this.count--;
  }
  draw(ctx: Ctx) {
    const n = this.count, { xs, ys, nx, ny } = this;
    if (n < 2) return;
    for (let k = 0; k < n; k++) { // a normal per point, so neighbouring quads share an edge
      const p = this.at(Math.max(0, k - 1)), q = this.at(Math.min(n - 1, k + 1)), i = this.at(k);
      const dx = xs[p] - xs[q], dy = ys[p] - ys[q], d = Math.hypot(dx, dy);
      // A point that did not move takes its newer neighbour's normal: none for an object at rest.
      nx[i] = d > 0 ? -dy / d : k > 0 ? nx[p] : 0;
      ny[i] = d > 0 ? dx / d : k > 0 ? ny[p] : 0;
    }
    ctx.save();
    const alpha = ctx.globalAlpha, strip = this.glow ? sprite(STRIP, this.color, 0, this.width) : null;
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = this.color;
    for (let k = n - 1; k > 0; k--) { // oldest to newest
      const a = this.at(k), b = this.at(k - 1);
      const fa = Math.max(0, 1 - this.ages[a] / this.life), fb = Math.max(0, 1 - this.ages[b] / this.life);
      if (fb <= 0) continue;
      const wa = (this.width / 2) * fa, wb = (this.width / 2) * fb;
      ctx.globalAlpha = alpha * fb * 0.9;
      ctx.beginPath();
      ctx.moveTo(xs[a] + nx[a] * wa, ys[a] + ny[a] * wa);
      ctx.lineTo(xs[b] + nx[b] * wb, ys[b] + ny[b] * wb);
      ctx.lineTo(xs[b] - nx[b] * wb, ys[b] - ny[b] * wb);
      ctx.lineTo(xs[a] - nx[a] * wa, ys[a] - ny[a] * wa);
      ctx.fill();
      if (!strip) continue;
      const len = Math.hypot(xs[b] - xs[a], ys[b] - ys[a]), ang = Math.atan2(ys[b] - ys[a], xs[b] - xs[a]);
      const g = this.width * 1.5 * fb;
      ctx.globalAlpha = alpha * fb * 0.45;
      ctx.translate(xs[a], ys[a]);
      ctx.rotate(ang);
      ctx.drawImage(img(strip), 0, -g, len, g * 2);
      ctx.rotate(-ang);
      ctx.translate(-xs[a], -ys[a]);
    }
    ctx.restore();
  }
  clear() { this.count = 0; }
  private at(k: number) { return (this.head - k + this.max) % this.max; } // 0 = newest
}

// ---- screen shake and hit-stop --------------------------------------------------------------
export class Shake {
  trauma = 0; x = 0; y = 0;
  maxOffset: number; decay: number;
  private t = 0;
  /** maxOffset in px at full trauma; decay = trauma lost per second. */
  constructor(maxOffset = 26, decay = 1.6) { this.maxOffset = maxOffset; this.decay = decay; }
  add(amount = 0.4) { this.trauma = Math.min(1, this.trauma + amount); }
  update(dt: number) {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - this.decay * dt);
    const k = this.maxOffset * this.trauma * this.trauma, t = this.t;
    this.x = k * Math.sin(t * 61) * Math.sin(t * 23 + 1.3);
    this.y = k * Math.sin(t * 53 + 2.1) * Math.sin(t * 29);
  }
  /** Translate the world; call between ctx.save() and ctx.restore(), before the HUD. */
  apply(ctx: Ctx) { if (this.x || this.y) ctx.translate(this.x, this.y); }
}
export class HitStop {
  left = 0;
  private scale = 0;
  /** Hold game time for seconds (scale 0 freezes; 0.2 is slow motion). */
  hit(seconds = 0.07, scale = 0) { this.left = Math.max(this.left, seconds); this.scale = scale; }
  /** Real dt in, game dt out. */
  step(dt: number) {
    if (this.left <= 0) return dt;
    const held = Math.min(dt, this.left);
    this.left -= held;
    return dt - held + held * this.scale;
  }
  get active() { return this.left > 0; }
}

// ---- tweens ---------------------------------------------------------------------------------
type NumericKeys<T> = { [K in keyof T]: T[K] extends number ? K : never }[keyof T];
export type TweenOptions = { ease?: Ease; delay?: number; onDone?: () => void };
type TweenRec = {
  target: Record<string, number>; keys: string[]; from: number[]; to: number[];
  dur: number; delay: number; t: number; ease: Ease; started: boolean;
  done?: () => void; each?: (v: number) => void;
};
export class Tweens {
  private list: TweenRec[] = [];
  get active() { return this.list.length; }
  /** Tween numeric fields of target to the values in props. A newer tween of a field wins. */
  to<T extends object>(target: T, props: Partial<Record<NumericKeys<T>, number>>, seconds: number, o: TweenOptions = {}) {
    const t = target as unknown as Record<string, number>, values = props as Record<string, number>;
    const keys = Object.keys(values);
    for (const r of this.list) {
      if (r.target !== t) continue;
      for (const k of keys) {
        const i = r.keys.indexOf(k);
        if (i < 0) continue;
        r.keys.splice(i, 1); r.to.splice(i, 1);
        if (r.started) r.from.splice(i, 1);
      }
    }
    this.list = this.list.filter(r => r.keys.length > 0); // fully replaced: gone, no onDone
    this.add(t, keys, keys.map(k => values[k]), seconds, o);
  }
  /** Tween a plain number; onUpdate gets each value (the last one is exactly to). */
  num(from: number, to: number, seconds: number, onUpdate: (v: number) => void, o: TweenOptions = {}) {
    this.add({ v: from }, ["v"], [to], seconds, o, onUpdate);
  }
  /** Stop the tweens of target (no onDone), or every tween. */
  cancel(target?: object) { this.list = target ? this.list.filter(r => r.target !== target) : []; }
  update(dt: number) {
    for (let i = 0; i < this.list.length; ) {
      const r = this.list[i];
      r.t += dt;
      if (r.t < r.delay) { i++; continue; }
      if (!r.started) { r.started = true; r.from = r.keys.map(k => r.target[k]); }
      const p = r.dur > 0 ? Math.min(1, (r.t - r.delay) / r.dur) : 1, e = p >= 1 ? 1 : p > 0 ? r.ease(p) : 0;
      for (let k = 0; k < r.keys.length; k++) {
        r.target[r.keys[k]] = p >= 1 ? r.to[k] : r.from[k] + (r.to[k] - r.from[k]) * e;
      }
      r.each?.(r.target.v);
      if (p >= 1) { this.list.splice(i, 1); r.done?.(); } else i++;
    }
  }
  private add(target: Record<string, number>, keys: string[], to: number[], seconds: number, o: TweenOptions, each?: (v: number) => void) {
    this.list.push({
      target, keys, from: [], to, dur: Math.max(0, seconds), delay: Math.max(0, o.delay ?? 0), t: 0,
      ease: o.ease ?? ease.outCubic, started: false, done: o.onDone, each,
    });
  }
}

// ---- pop text: rises and fades, facing a seat ------------------------------------------------
/** Rotation that makes text upright for the player sitting at edge. */
export function edgeAngle(edge: Edge) {
  return edge === "top" ? Math.PI : edge === "left" ? Math.PI / 2 : edge === "right" ? -Math.PI / 2 : 0;
}
export function nearestEdge(x: number, y: number, width = 1920, height = 1080): Edge {
  const d = Math.min(x, y, width - x, height - y);
  return d === height - y ? "bottom" : d === y ? "top" : d === x ? "left" : "right";
}
export type PopOptions = {
  color?: string; outline?: string;
  size?: number;     // px (default 56)
  font?: string;     // full CSS font; default `800 ${size}px system-ui, sans-serif`
  face?: Edge | number;
  rise?: number;     // px travelled toward the reader's "up" (default 90)
  life?: number;     // seconds (default 0.9)
};
type Pop = { on: boolean; c: FxCanvas | null; x: number; y: number; ang: number; rise: number; age: number; life: number };
export class PopTexts {
  readonly max: number;
  private items: Pop[] = [];
  private cursor = 0;
  constructor(max = 24) {
    this.max = Math.max(1, Math.floor(max));
    for (let i = 0; i < this.max; i++) this.items.push({ on: false, c: null, x: 0, y: 0, ang: 0, rise: 0, age: 0, life: 1 });
  }
  get active() { return this.items.reduce((n, p) => n + (p.on ? 1 : 0), 0); }
  /** The text is rendered once, here, into a pooled canvas; draw() only stamps it. */
  pop(x: number, y: number, text: string, o: PopOptions = {}) {
    const p = this.items.find(q => !q.on) ?? this.items[(this.cursor = (this.cursor + 1) % this.max)];
    const size = o.size ?? 56, font = o.font ?? `800 ${size}px system-ui, sans-serif`, pad = Math.ceil(size * 0.25);
    const c = (p.c ??= makeCanvas(1, 1)), g = c.getContext("2d") as Ctx;
    g.font = font;
    c.width = Math.ceil(g.measureText(text).width) + pad * 2;
    c.height = Math.ceil(size * 1.3) + pad * 2;
    g.font = font; // resizing a canvas resets its context
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    g.lineWidth = Math.max(4, size * 0.14);
    g.strokeStyle = o.outline ?? "rgba(0,0,0,0.85)";
    g.strokeText(text, c.width / 2, c.height / 2);
    g.fillStyle = o.color ?? "#fff";
    g.fillText(text, c.width / 2, c.height / 2);
    const face = o.face ?? nearestEdge(x, y);
    Object.assign(p, {
      on: true, x, y, age: 0, ang: typeof face === "number" ? face : edgeAngle(face),
      rise: o.rise ?? 90, life: Math.max(0.05, o.life ?? 0.9),
    });
  }
  update(dt: number) {
    for (const p of this.items) if (p.on && (p.age += dt) >= p.life) p.on = false;
  }
  draw(ctx: Ctx) {
    ctx.save();
    const alpha = ctx.globalAlpha;
    for (const p of this.items) {
      if (!p.on || !p.c) continue;
      const t = p.age / p.life, s = t < 0.18 ? ease.outBack(t / 0.18) : 1, rise = p.rise * ease.outCubic(t);
      const x = p.x + Math.sin(p.ang) * rise, y = p.y - Math.cos(p.ang) * rise, w = p.c.width * s, h = p.c.height * s;
      ctx.globalAlpha = alpha * (t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4);
      ctx.translate(x, y);
      ctx.rotate(p.ang);
      ctx.drawImage(img(p.c), -w / 2, -h / 2, w, h);
      ctx.rotate(-p.ang);
      ctx.translate(-x, -y);
    }
    ctx.restore();
  }
  clear() { for (const p of this.items) p.on = false; }
}

// ---- piece-down splash: crown of light at the piece's edge, then shockwaves, then gone -------
export type SplashOptions = {
  color?: string;
  inner?: number;     // the piece's footprint radius: nothing is drawn inside it (default 60)
  radius?: number;    // how far the shockwave travels (default inner + 260)
  duration?: number;  // seconds, at most SPLASH_MAX_S (default 1)
  rings?: number;     // shockwaves, 1-4 (default 2)
  width?: number;     // core line width at the start (default 10)
  sound?: () => void; // called once, now
  sparks?: Particles; // also bursts sparks outward from the piece's edge
};
type Splash = {
  on: boolean; x: number; y: number; age: number; dur: number; inner: number; radius: number;
  rings: number; width: number; color: string; wave: FxCanvas | null; crown: FxCanvas | null;
  crownR: number; waveIn: number;
};
const CROWN = 28; // the crown's glow ends at the piece's edge, never inside it
export class Splashes {
  readonly max: number;
  private items: Splash[] = [];
  private cursor = 0;
  constructor(max = 12) {
    this.max = Math.max(1, Math.floor(max));
    for (let i = 0; i < this.max; i++) {
      this.items.push({
        on: false, x: 0, y: 0, age: 0, dur: 1, inner: 0, radius: 0, rings: 1, width: 0, color: "#fff",
        wave: null, crown: null, crownR: 0, waveIn: 0,
      });
    }
  }
  get active() { return this.items.reduce((n, s) => n + (s.on ? 1 : 0), 0); }
  at(x: number, y: number, o: SplashOptions = {}) {
    const s = this.items.find(q => !q.on) ?? this.items[(this.cursor = (this.cursor + 1) % this.max)];
    const color = o.color ?? "#fff", inner = Math.max(0, o.inner ?? 60), dur = clamp(o.duration ?? 1, 0.1, SPLASH_MAX_S);
    const radius = Math.max(inner + 20, o.radius ?? inner + 260);
    const wave = sprite(RING, color, radius, 28), crown = sprite(RING, color, inner + CROWN, CROWN);
    // Cached rings snap to a few sizes and their glow scales with them: place the crown so its
    // glow still ends at the piece's edge, and let draw() hold back a wave's glow until it clears.
    const crownIn = ringInner(crown, inner + CROWN);
    Object.assign(s, {
      on: true, x, y, age: 0, dur, inner, radius, color, width: o.width ?? 10,
      rings: clamp(Math.round(o.rings ?? 2), 1, 4), wave, crown,
      crownR: crownIn > 0 ? Math.max(inner + CROWN, inner / crownIn) : inner + CROWN,
      waveIn: ringInner(wave, radius),
    });
    o.sparks?.burst(x, y, {
      count: 18, color, radius: inner, speed: 900, life: Math.min(0.55, dur * 0.6), size: 8, streak: 0.035, drag: 3,
    });
    o.sound?.();
  }
  update(dt: number) {
    for (const s of this.items) if (s.on && (s.age += dt) >= s.dur) s.on = false;
  }
  draw(ctx: Ctx) {
    ctx.save();
    const alpha = ctx.globalAlpha;
    for (const s of this.items) {
      if (!s.on || !s.wave || !s.crown) continue;
      const t = s.age, D = s.dur, flash = 1 - t / (0.3 * D);
      if (flash > 0) { // the crown: a bright ring hugging the piece's edge that swells and fades
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = alpha * flash;
        drawRing(ctx, s.crown, s.x, s.y, s.crownR * (1 + 0.25 * (1 - flash)), s.inner + CROWN);
      }
      const stagger = 0.12 * D, span = D - (s.rings - 1) * stagger;
      for (let k = 0; k < s.rings; k++) {
        const p = (t - k * stagger) / span;
        if (p <= 0 || p >= 1) continue;
        const r = lerp(s.inner + s.width / 2, s.radius, ease.outCubic(p)), a = alpha * (1 - p) ** 1.5 * (k ? 0.6 : 1);
        const clear = r * s.waveIn - s.inner; // px between the wave glow's inner edge and the piece
        if (clear > 0) { // the glow fades in once it is clear of the piece; the stroke always is
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = a * Math.min(1, clear / 8);
          drawRing(ctx, s.wave, s.x, s.y, r, s.radius);
        }
        ctx.globalAlpha = a;
        ctx.globalCompositeOperation = "source-over";
        ctx.lineWidth = lerp(s.width, 1.5, p);
        ctx.strokeStyle = k ? s.color : "#fff";
        ctx.beginPath();
        ctx.arc(s.x, s.y, r, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  clear() { for (const s of this.items) s.on = false; }
}
