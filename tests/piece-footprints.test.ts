import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import {
  angleDeltaDeg, createTurnWatch, drawOutlineGlow, facingRotation, facingStep, frontPoint, grownOutline,
  loadPieceFootprints, outlinePath, outlineToScreen, pieceFootprint, type ArtPoints, type PieceFootprints, type Vec,
} from "../src/piece-footprints";

const FP: PieceFootprints = { schemaVersion: 1, frame: "piece-mm-v1", set: "toy", orientation: "up",
  facingOffsetDeg: 180, modelFile: "model.dla",
  pieces: { "1": { label: "G0001", name: "Arrow", sizeMm: [10, 20], radiusMm: 10, areaMm2: 100,
    outlineMm: [[0, 10], [-5, -10], [5, -10]], glyphOutlineMm: [] } } };
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test("SDK front pointing screen-down (θ=90°) leaves the drawing unrotated, +Y maps to screen-up", () => {
  const [tip] = outlineToScreen([[0, 10]], { x: 100, y: 100, orientation: 90 }, { pxPerMm: 2 });
  close(tip.x, 100); close(tip.y, 80);
});

test("θ=0° (SDK front screen-right) puts piece +Y on screen-left", () => {
  const [tip] = outlineToScreen([[0, 10]], { x: 0, y: 0, orientation: 0 }, { pxPerMm: 1 });
  close(tip.x, -10); close(tip.y, 0);
});

test("+X maps to screen-right when unrotated, and mirrorX flips it", () => {
  const [p] = outlineToScreen([[5, 0]], { x: 0, y: 0, orientation: 90 }, { pxPerMm: 1 });
  close(p.x, 5); close(p.y, 0);
  const [m] = outlineToScreen([[5, 0]], { x: 0, y: 0, orientation: 90 }, { pxPerMm: 1, mirrorX: true });
  close(m.x, -5);
});

test("an up set faces opposite the SDK front; a down set faces along it", () => {
  const up = pieceFootprint(FP, { glyphId: 1, x: 0, y: 0, orientation: 30 })!;
  close(up.facingDeg, 210); close(up.facing.x, Math.cos((210 * Math.PI) / 180));
  const down = pieceFootprint({ ...FP, orientation: "down", facingOffsetDeg: 0 }, { glyphId: 1, x: 0, y: 0, orientation: 30 })!;
  close(down.facingDeg, 30);
});

test("facingDeg is a screen angle: 0 = right, 90 = down, and facing is the same direction", () => {
  const right = pieceFootprint(FP, { glyphId: 1, x: 0, y: 0, orientation: 180 })!;
  close(right.facingDeg, 0); close(right.facing.x, 1); close(right.facing.y, 0);
  const down = pieceFootprint(FP, { glyphId: 1, x: 0, y: 0, orientation: 270 })!;
  close(down.facingDeg, 90); close(down.facing.x, 0); close(down.facing.y, 1);
});

/** Where ctx.rotate(r) sends a vector (canvas: y down, positive r clockwise on screen). */
const turn = (v: Vec, r: number): Vec => ({ x: v.x * Math.cos(r) - v.y * Math.sin(r), y: v.x * Math.sin(r) + v.y * Math.cos(r) });
const NOSE: Record<ArtPoints, Vec> = { up: { x: 0, y: -1 }, right: { x: 1, y: 0 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 } };

test("facingRotation turns up-drawn art by facingDeg + 90° and right-drawn art by facingDeg", () => {
  close(facingRotation({ facingDeg: 0 }), Math.PI / 2);
  close(facingRotation({ facingDeg: 0 }, "right"), 0);
  close(facingRotation({ facingDeg: 270 }), 0); // facing up: up-drawn art stays as drawn
  close(facingRotation({ facingDeg: 90 }, "right"), Math.PI / 2);
  close(facingRotation({ facingDeg: 300 }), Math.PI / 6); // wrapped into [0, 2π)
});

test("facingRotation turns down- and left-drawn art too: down-drawn art facing up turns a half turn", () => {
  close(facingRotation({ facingDeg: 270 }, "down"), Math.PI);
  close(facingRotation({ facingDeg: 90 }, "down"), 0);
  close(facingRotation({ facingDeg: 180 }, "left"), 0);
  close(facingRotation({ facingDeg: 0 }, "left"), Math.PI);
  for (const art of Object.keys(NOSE) as ArtPoints[]) {
    for (let d = 0; d < 360; d += 15) {
      const nose = turn(NOSE[art], facingRotation({ facingDeg: d }, art)), rad = (d * Math.PI) / 180;
      close(nose.x, Math.cos(rad)); close(nose.y, Math.sin(rad));
    }
  }
});

test("facingStep snaps to the nearest of up, right, down, left as a screen grid step", () => {
  const step = (facingDeg: number, n?: number) => { const { x, y, index } = facingStep({ facingDeg }, n); return { x, y, index }; };
  assert.deepEqual(step(270), { x: 0, y: -1, index: 0 });
  assert.deepEqual(step(0), { x: 1, y: 0, index: 1 });
  assert.deepEqual(step(90), { x: 0, y: 1, index: 2 });
  assert.deepEqual(step(180), { x: -1, y: 0, index: 3 });
  assert.deepEqual(step(44), { x: 1, y: 0, index: 1 });
  assert.deepEqual(step(46), { x: 0, y: 1, index: 2 });
  assert.deepEqual(step(359), { x: 1, y: 0, index: 1 });
  assert.deepEqual(step(225, 8), { x: -1, y: -1, index: 7 });
  // A piece whose arrow points up on the glass (SDK front down for an "up" set) steps up.
  const up = pieceFootprint(FP, { glyphId: 1, x: 0, y: 0, orientation: 90 })!;
  assert.deepEqual(facingStep(up), { x: 0, y: -1, index: 0, rotation: 0 });
});

test("facingStep's rotation is index · 2π/n and turns up-drawn art onto the step", () => {
  for (const n of [4, 8]) {
    for (let d = 0; d < 360; d += 10) {
      const s = facingStep({ facingDeg: d }, n);
      close(s.rotation, (s.index * 2 * Math.PI) / n);
      const nose = turn(NOSE.up, s.rotation), len = Math.hypot(s.x, s.y);
      close(nose.x, s.x / len); close(nose.y, s.y / len);
    }
  }
});

test("frontPoint sits on the outline's edge along facingDeg, and gapPx further out", () => {
  const box = { center: { x: 100, y: 100 }, outline: [{ x: 60, y: 80 }, { x: 140, y: 80 }, { x: 140, y: 120 }, { x: 60, y: 120 }] };
  const right = frontPoint({ ...box, facingDeg: 0 });
  close(right.x, 140); close(right.y, 100);
  const up = frontPoint({ ...box, facingDeg: 270 }, 10);
  close(up.x, 100); close(up.y, 70);
  // The arrow toy: its tip is piece +Y, the front of an "up" set.
  const arrowUp = pieceFootprint(FP, { glyphId: 1, x: 0, y: 0, orientation: 90 })!; // facing up
  const tip = frontPoint(arrowUp);
  close(tip.x, 0); close(tip.y, -10 * 3.6);
  // A centre off the outline still gives the farthest extent that way.
  const off = frontPoint({ center: { x: 0, y: 0 }, outline: box.outline, facingDeg: 0 }, 5);
  close(off.x, 145); close(off.y, 0);
});

test("unknown glyphs, fingers and a missing file give null instead of throwing", () => {
  assert.equal(pieceFootprint(FP, { glyphId: 9, x: 0, y: 0, orientation: 0 }), null);
  assert.equal(pieceFootprint(FP, { glyphId: 0, x: 0, y: 0, orientation: 0 }), null);
  assert.equal(pieceFootprint(null, { glyphId: 1, x: 0, y: 0, orientation: 0 }), null);
});

test("radiusPx scales the mm radius", () => {
  assert.equal(pieceFootprint(FP, { glyphId: 1, x: 0, y: 0, orientation: 0 }, { pxPerMm: 3 })!.radiusPx, 30);
});

// loadPieceFootprints: every failure is null, so callers fall back instead of throwing.
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const stubFetch = (impl: (url: string) => Promise<unknown>) => { globalThis.fetch = impl as unknown as typeof fetch; };

test("loadPieceFootprints gives null when fetch throws", async () => {
  stubFetch(async () => { throw new Error("offline"); });
  assert.equal(await loadPieceFootprints(), null);
});

test("loadPieceFootprints gives null on a non-ok response", async () => {
  stubFetch(async () => ({ ok: false, json: async () => FP }));
  assert.equal(await loadPieceFootprints(), null);
});

test("loadPieceFootprints gives null for another schemaVersion or a body that is not JSON", async () => {
  stubFetch(async () => ({ ok: true, json: async () => ({ schemaVersion: 2 }) }));
  assert.equal(await loadPieceFootprints(), null);
  stubFetch(async () => ({ ok: true, json: async () => { throw new SyntaxError("bad json"); } }));
  assert.equal(await loadPieceFootprints(), null);
});

test("loadPieceFootprints returns a schema 1 file, fetching piece-footprints.json by default", async () => {
  const urls: string[] = [];
  stubFetch(async url => { urls.push(url); return { ok: true, json: async () => FP }; });
  assert.deepEqual(await loadPieceFootprints(), FP);
  assert.deepEqual(urls, ["piece-footprints.json"]);
});

// ---- outline glows ---------------------------------------------------------------------------
const SQUARE: Vec[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
// An L with a concave corner at (50, 50): the notch is the top-right quarter.
const L_SHAPE: Vec[] = [
  { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 50, y: 50 }, { x: 50, y: 100 }, { x: 0, y: 100 },
];
const bbox = (pts: Vec[]) => ({
  w: Math.max(...pts.map(p => p.x)) - Math.min(...pts.map(p => p.x)),
  h: Math.max(...pts.map(p => p.y)) - Math.min(...pts.map(p => p.y)),
});
/** Even-odd containment over several closed rings (strictly inside; boundary points count as outside). */
function insideEvenOdd(rings: Vec[][], q: Vec) {
  let inside = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[i], b = r[j];
      if ((a.y > q.y) !== (b.y > q.y) && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
  }
  return inside;
}
const side = (p: Vec, q: Vec, r: Vec) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
/** Segments ab and cd properly cross. */
const crosses = (a: Vec, b: Vec, c: Vec, d: Vec) => side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
function distToOutline(poly: Vec[], q: Vec) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(q.x - a.x - t * dx, q.y - a.y - t * dy));
  }
  return best;
}
const circle = (n: number, r: number): Vec[] =>
  Array.from({ length: n }, (_, i) => ({ x: r * Math.cos((2 * Math.PI * i) / n), y: r * Math.sin((2 * Math.PI * i) / n) }));

test("grownOutline grows a square's box by 2 x growPx on each axis, with a few points per corner", () => {
  for (const square of [SQUARE, [...SQUARE].reverse()]) { // either winding grows outward
    const grown = grownOutline(square, 10);
    const { w, h } = bbox(grown);
    close(w, 120); close(h, 120);
    assert.ok(grown.length <= 4 * 5, `${grown.length} points`);
    for (const p of grown) close(distToOutline(square, p), 10);
  }
});

test("grownOutline keeps a smooth outline's point count", () => {
  const grown = grownOutline(circle(64, 50), 12);
  assert.equal(grown.length, 64);
  for (const p of grown) assert.ok(Math.abs(Math.hypot(p.x, p.y) - 62) < 0.2);
});

test("on a concave L no grown point falls inside the piece, and each sits about growPx out", () => {
  for (const grow of [4, 14, 30]) {
    for (const shape of [L_SHAPE, [...L_SHAPE].reverse()]) {
      const grown = grownOutline(shape, grow);
      assert.ok(grown.length <= shape.length * 5);
      for (const p of grown) {
        assert.ok(!insideEvenOdd([shape], p), `(${p.x}, ${p.y}) is inside`);
        const d = distToOutline(shape, p);
        assert.ok(d >= grow - 1e-6 && d <= grow * 1.5, `distance ${d} for grow ${grow}`);
      }
    }
  }
});

test("a notch narrower than 2 x growPx is bridged, with no loops left in the grown outline", () => {
  const notched: Vec[] = [
    { x: 0, y: 0 }, { x: 45, y: 0 }, { x: 45, y: 60 }, { x: 55, y: 60 }, { x: 55, y: 0 },
    { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
  ];
  for (const shape of [notched, [...notched].reverse()]) {
    const grown = grownOutline(shape, 10);
    const { w, h } = bbox(grown);
    close(w, 120); close(h, 120);
    for (const p of grown) {
      assert.ok(!insideEvenOdd([shape], p));
      // The lips' round corners meet at (50, -10 sin 60°): nothing reaches further into the notch.
      if (p.x > 40 && p.x < 60) assert.ok(p.y <= -Math.sqrt(75) + 1e-6, `(${p.x}, ${p.y}) dips into the notch`);
    }
    const n = grown.length; // a simple polygon: no two non-adjacent edges cross
    for (let i = 0; i < n; i++) {
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        assert.ok(!crosses(grown[i], grown[(i + 1) % n], grown[j], grown[(j + 1) % n]), `edges ${i} and ${j} cross`);
      }
    }
  }
});

test("grownOutline drops repeated and closing points and leaves degenerate input alone", () => {
  const closed = [...SQUARE, { x: 0, y: 0 }, { x: 0, y: 0 }];
  assert.equal(grownOutline(closed, 5).length, grownOutline(SQUARE, 5).length);
  assert.deepEqual(grownOutline(SQUARE, 0), SQUARE);
  assert.deepEqual(grownOutline([{ x: 1, y: 1 }, { x: 2, y: 2 }], 5), [{ x: 1, y: 1 }, { x: 2, y: 2 }]);
});

/** A context stand-in that records each call with its state at the time. */
function recorder() {
  const calls: [string, unknown[], Record<string, unknown>][] = [];
  const state: Record<string, unknown> = { globalAlpha: 1, globalCompositeOperation: "source-over" };
  const ctx = new Proxy(state, {
    get(target, key) {
      if (typeof key !== "string") return undefined;
      if (key in target) return target[key];
      return (...args: unknown[]) => { calls.push([key, args, { ...target }]); };
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}
/** The closed rings a run of recorded path calls traced (rect counts as one). */
function rings(calls: [string, unknown[], unknown][]) {
  const out: Vec[][] = [];
  for (const [name, args] of calls) {
    const [x, y, w, h] = args as number[];
    if (name === "rect") out.push([{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]);
    if (name === "moveTo") out.push([{ x, y }]);
    if (name === "lineTo") out[out.length - 1].push({ x, y });
  }
  return out;
}

test("drawOutlineGlow traces the grown outline, never an arc, and clips the piece's base out", () => {
  const { ctx, calls } = recorder();
  drawOutlineGlow(ctx, { outline: L_SHAPE }, { growPx: 12, color: "#3cf" });
  const names = calls.map(c => c[0]);
  for (const round of ["arc", "ellipse", "fill", "fillRect", "drawImage"]) assert.ok(!names.includes(round), round);
  const clip = names.indexOf("clip"), firstStroke = names.indexOf("stroke");
  assert.ok(clip >= 0 && clip < firstStroke, "the clip comes before any stroke");
  assert.deepEqual(calls[clip][1], ["evenodd"]);
  // The clip region: the base is out, the band around it is in.
  const region = rings(calls.slice(0, clip));
  assert.ok(!insideEvenOdd(region, { x: 25, y: 25 }) && !insideEvenOdd(region, { x: 25, y: 75 }));
  assert.ok(insideEvenOdd(region, { x: 75, y: 75 }), "the L's notch is outside the base, so it may glow");
  assert.ok(insideEvenOdd(region, { x: -12, y: 50 }) && insideEvenOdd(region, { x: 50, y: 112 }));
  // The stroked path follows the outline, growPx out from it.
  const stroked = rings(calls.slice(clip + 1, firstStroke));
  assert.equal(stroked.length, 1);
  assert.ok(stroked[0].length >= L_SHAPE.length);
  for (const p of stroked[0]) {
    assert.ok(!insideEvenOdd([L_SHAPE], p));
    const d = distToOutline(L_SHAPE, p);
    assert.ok(d >= 12 - 1e-6 && d <= 18, `distance ${d}`);
  }
  const strokes = calls.filter(c => c[0] === "stroke");
  assert.ok(strokes.length >= 2 && strokes.every(c => c[2].globalCompositeOperation === "lighter"));
  assert.ok(strokes.some(c => c[2].strokeStyle === "#3cf"));
  assert.equal(names.filter(n => n === "save").length, names.filter(n => n === "restore").length);
});

test("drawOutlineGlow takes pieceFootprint's result and draws nothing for null or zero alpha", () => {
  const { ctx, calls } = recorder();
  drawOutlineGlow(ctx, pieceFootprint(FP, { glyphId: 0, x: 0, y: 0, orientation: 0 }));
  drawOutlineGlow(ctx, null);
  drawOutlineGlow(ctx, { outline: SQUARE }, { alpha: 0 });
  assert.equal(calls.length, 0);
  drawOutlineGlow(ctx, pieceFootprint(FP, { glyphId: 1, x: 500, y: 500, orientation: 0 }));
  assert.ok(calls.some(c => c[0] === "stroke"));
});

test("outlinePath traces the outline, grown when asked", () => {
  const traced: string[] = [];
  class FakePath2D {
    moveTo(x: number, y: number) { traced.push(`M${x},${y}`); }
    lineTo(x: number, y: number) { traced.push(`L${x},${y}`); }
    closePath() { traced.push("Z"); }
  }
  const real = (globalThis as { Path2D?: unknown }).Path2D;
  (globalThis as { Path2D?: unknown }).Path2D = FakePath2D;
  try {
    outlinePath({ outline: SQUARE });
    assert.deepEqual(traced, ["M0,0", "L100,0", "L100,100", "L0,100", "Z"]);
    traced.length = 0;
    outlinePath({ outline: SQUARE }, 10);
    assert.equal(traced.length, grownOutline(SQUARE, 10).length + 1);
  } finally {
    (globalThis as { Path2D?: unknown }).Path2D = real;
  }
});

// Every real piece set in the board-games plugin (skills/piece-sets/sets/<id>/piece-footprints.json, two
// levels up from this template while it sits in the plugin). A game's own copy of this file has no such
// folder and skips these tests; its own set is checked by the tests it writes.
const SETS = "../../piece-sets/sets";
const footprintFiles = (): string[] => existsSync(SETS)
  ? readdirSync(SETS).filter(id => existsSync(`${SETS}/${id}/piece-footprints.json`)).sort().map(id => `${id}/piece-footprints.json`)
  : [];
test("every real piece outline grows cleanly at 4, 12, 20 and 40 px", { skip: footprintFiles().length === 0 && "no piece sets here" }, () => {
  let shapes = 0;
  for (const file of footprintFiles()) {
    const fp = JSON.parse(readFileSync(`${SETS}/${file}`, "utf8")) as PieceFootprints;
    for (const glyph of Object.keys(fp.pieces)) {
      const base = pieceFootprint(fp, { glyphId: Number(glyph), x: 0, y: 0, orientation: 37 })!.outline;
      shapes++;
      for (const grow of [4, 12, 20, 40]) {
        const grown = grownOutline(base, grow), n = grown.length;
        assert.ok(n >= 3 && n <= base.length * 4, `${file} ${glyph} +${grow}: ${n} points`);
        for (const p of grown) assert.ok(!insideEvenOdd([base], p), `${file} ${glyph} +${grow}: (${p.x}, ${p.y}) is inside`);
        // Any loop still left (two edges crossing) must be a small one, under 20 px across.
        for (let i = 0; i < n; i++) {
          for (let j = i + 2; j < n; j++) {
            if (i === 0 && j === n - 1) continue;
            if (!crosses(grown[i], grown[(i + 1) % n], grown[j], grown[(j + 1) % n])) continue;
            const inner = grown.slice(i + 1, j + 1), outer = [...grown.slice(j + 1), ...grown.slice(0, i + 1)];
            const loop = inner.length <= outer.length ? inner : outer, { w, h } = bbox(loop);
            assert.ok(Math.hypot(w, h) < 20, `${file} ${glyph} +${grow}: a ${Math.hypot(w, h).toFixed(1)} px loop`);
          }
        }
      }
    }
  }
  assert.ok(shapes >= 20, `${shapes} pieces`);
});

// ---- facing on every real piece set ------------------------------------------------------------
// Each set in the plugin's piece-sets folder, through its real footprint file. For 8 physical fronts D
// the piece is placed at θ = D − facingOffsetDeg, and everything a game draws from the facing must
// point at D. The mm frame's front is +Y for an "up" set and −Y for a "down" set (Sports), so the
// outline point at that end must land at D too. A game's own copy of this file has no sets and skips it.
type CatalogSet = { id: string; footprints: string };
const catalogSets = (): CatalogSet[] => footprintFiles().map(file => ({ id: file.split("/")[0], footprints: file }));
const OFFSET_FOR = { up: 180, down: 0 } as const;
const unit = (deg: number): Vec => ({ x: Math.cos((deg * Math.PI) / 180), y: Math.sin((deg * Math.PI) / 180) });
const near = (a: Vec, b: Vec, what: string, eps = 1e-6) =>
  assert.ok(Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps, `${what}: (${a.x}, ${a.y}) != (${b.x}, ${b.y})`);
const dirOf = (from: Vec, to: Vec): Vec => { const l = Math.hypot(to.x - from.x, to.y - from.y); return { x: (to.x - from.x) / l, y: (to.y - from.y) / l }; };
const noCatalog = catalogSets().length === 0 && "no piece sets here";

test("every set's footprint file names its set and agrees on orientation and offset", { skip: noCatalog }, () => {
  for (const set of catalogSets()) {
    const fp = JSON.parse(readFileSync(`${SETS}/${set.footprints}`, "utf8")) as PieceFootprints;
    assert.equal(fp.set, set.id);
    assert.equal(fp.facingOffsetDeg, OFFSET_FOR[fp.orientation], `${set.id}: ${fp.orientation} means ${OFFSET_FOR[fp.orientation]}`);
  }
});

for (const { id } of catalogSets()) {
  test(`${id}: every glyph faces, steps, turns art and points ahead along each of 8 physical fronts`, () => {
    const set = catalogSets().find(s => s.id === id);
    assert.ok(set?.footprints, `${id} is not offered or names no footprints`);
    const fp = JSON.parse(readFileSync(`${SETS}/${set.footprints}`, "utf8")) as PieceFootprints;
    const frontSign = fp.orientation === "up" ? 1 : -1; // which end of the mm frame's Y is the front
    const glyphs = Object.keys(fp.pieces);
    assert.ok(glyphs.length >= 3, `${id}: ${glyphs.length} glyphs`);
    for (const glyph of glyphs) {
      for (let D = 0; D < 360; D += 45) {
        const at = { glyphId: Number(glyph), x: 960, y: 540, orientation: D - fp.facingOffsetDeg };
        const where = `${id} #${glyph} D=${D}`;
        const f = pieceFootprint(fp, at)!;
        close(f.facingDeg, D);
        near(f.facing, unit(D), `${where} facing`);
        // facingStep: the nearest step, and its rotation turns up-drawn art onto it.
        for (const n of [4, 8]) {
          const s = facingStep(f, n), step = { x: s.x / Math.hypot(s.x, s.y), y: s.y / Math.hypot(s.x, s.y) };
          const off = Math.acos(Math.max(-1, Math.min(1, step.x * f.facing.x + step.y * f.facing.y))) * (180 / Math.PI);
          assert.ok(off <= 180 / n + 1e-6, `${where} n=${n}: step (${s.x}, ${s.y}) is ${off.toFixed(1)}° off`);
          near(turn(NOSE.up, s.rotation), step, `${where} n=${n} step rotation`);
        }
        // facingRotation: art drawn pointing any way ends up nose-first along D.
        for (const art of Object.keys(NOSE) as ArtPoints[]) near(turn(NOSE[art], facingRotation(f, art)), unit(D), `${where} ${art}-drawn art`);
        // frontPoint: along D from the centre, on the outline's edge, and outside it with a gap.
        const edge = frontPoint(f), out = frontPoint(f, 12);
        near(dirOf(f.center, edge), unit(D), `${where} frontPoint direction`);
        assert.ok(distToOutline(f.outline, edge) < 1e-6, `${where}: frontPoint is off the outline`);
        assert.ok(!insideEvenOdd([f.outline], out), `${where}: frontPoint + 12 px is inside the base`);
        // The mm frame's front (+Y up sets, −Y Sports) lands at D, and its extreme outline point is
        // the piece's most forward point on screen.
        const [origin, ahead] = outlineToScreen([[0, 0], [0, frontSign]], at);
        near(dirOf(origin, ahead), unit(D), `${where} mm front`);
        const mm = fp.pieces[glyph].outlineMm;
        let tip = 0;
        mm.forEach(([, y], i) => { if (frontSign * y > frontSign * mm[tip][1]) tip = i; });
        const reach = (p: Vec) => (p.x - f.center.x) * f.facing.x + (p.y - f.center.y) * f.facing.y;
        const most = Math.max(...f.outline.map(reach));
        assert.ok(Math.abs(reach(f.outline[tip]) - most) < 1e-6, `${where}: the mm front extreme is not the most forward point`);
        assert.ok(reach(f.outline[tip]) > 0, `${where}: the mm front extreme lies behind the centre`);
      }
    }
  });
}

test("Sports faces along the SDK front: facingDeg is θ itself and the mm frame's −Y end leads", { skip: !catalogSets().some(s => s.id === "sports") && "no Sports set here" }, () => {
  const set = catalogSets().find(s => s.id === "sports")!;
  const fp = JSON.parse(readFileSync(`${SETS}/${set.footprints}`, "utf8")) as PieceFootprints;
  assert.equal(fp.orientation, "down");
  assert.equal(fp.facingOffsetDeg, 0);
  for (const theta of [0, 37, 90, 200, 333]) {
    const f = pieceFootprint(fp, { glyphId: 1, x: 500, y: 500, orientation: theta })!;
    close(f.facingDeg, theta);
    const [origin, minusY] = outlineToScreen([[0, 0], [0, -1]], { x: 500, y: 500, orientation: theta });
    near(dirOf(origin, minusY), unit(theta), `Sports θ=${theta}: −Y`);
  }
});

// ---- turning counts as moving, jitter does not -------------------------------------------------
/** Seeded, so every run sees the same noise (mulberry32). */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const uniform = (r: () => number, half: number) => () => (r() * 2 - 1) * half;
const gaussian = (r: () => number, sigma: number) => () =>
  sigma * Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
/** A rim glow the way the patterns run it: shown after 0.5 s without a turn, hidden by a turn. */
function glowRun(angles: number[]) {
  const watch = createTurnWatch(), shown: boolean[] = [];
  let calm = 0;
  for (const deg of angles) {
    calm = watch.turned(deg) ? 0 : calm + 1 / 60;
    shown.push(calm >= 0.5);
  }
  return shown;
}
const share = (xs: boolean[]) => xs.filter(Boolean).length / xs.length;

test("angleDeltaDeg wraps: 359 to 2 is 3 degrees, and 180 either way is a half turn", () => {
  close(angleDeltaDeg(2, 359), 3); close(angleDeltaDeg(359, 2), -3); close(Math.abs(angleDeltaDeg(10, 190)), 180);
});

test("a resting piece's orientation jitter keeps its glow on at least 95% of the time", () => {
  for (const [name, noise] of [["uniform ±3°", uniform(rng(7), 3)], ["gaussian σ=1.5°", gaussian(rng(11), 1.5)]] as const) {
    for (const rest of [90, 359.5, 0.5, 200]) { // across the 0/360 seam too
      const shown = glowRun(Array.from({ length: 5 * 60 }, () => (rest + noise() + 360) % 360));
      const after = share(shown.slice(30)); // once the 0.5 s rest has passed
      assert.ok(after >= 0.95, `${name} at ${rest}°: glow on ${(after * 100).toFixed(1)}% of the time`);
    }
  }
});

test("a real 20 degree twist hides the glow within a few frames, and a slow twist trips too", () => {
  const noise = gaussian(rng(3), 1.5);
  const angles = [...Array.from({ length: 120 }, () => 350 + noise()), ...Array.from({ length: 60 }, () => 10 + noise())];
  const shown = glowRun(angles);
  assert.ok(shown[119], "on before the twist");
  assert.ok(shown.slice(120, 123).some(on => !on), "hidden within 3 frames of the twist");
  assert.ok(!shown[150] && shown[179], "back on once it rests at the new angle");
  // 0.5° a frame (30°/s): never far from the last reading, but the rest angle holds, so it trips
  // about 10° past the mean of its first 12 readings.
  const watch = createTurnWatch();
  const trips = Array.from({ length: 60 }, (_, i) => watch.turned(90 + i * 0.5)).indexOf(true);
  assert.ok(trips > 0 && trips <= 30, `a slow twist tripped at frame ${trips}`);
});
