// Tests for src/fx.ts. node:test has no DOM, so fx draws into a stand-in context that records calls.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HitStop, Particles, PopTexts, SPLASH_MAX_S, Shake, Splashes, Trail, Tweens, clearGlowCache, ease,
  edgeAngle, glowCacheStats, glowSprite, nearestEdge, neonCircle, neonPath, setCanvasFactory,
} from "../src/fx";

/** A call, with the context's state (lineWidth, globalAlpha, ...) when it was made. */
type Call = [name: string, args: unknown[], state: Record<string, unknown>];
/** stops collects the offsets of every gradient colour stop painted with this context. */
function fakeContext(stops: number[] = []) {
  const calls: Call[] = [];
  const state: Record<string, unknown> = { globalAlpha: 1, globalCompositeOperation: "source-over" };
  const ctx = new Proxy(state, {
    get(target, key) {
      if (typeof key !== "string") return undefined;
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        calls.push([key, args, { ...target }]);
        if (key === "measureText") return { width: 20 * String(args[0]).length };
        return { addColorStop: (at: number) => stops.push(at) };
      };
    },
  });
  const count = (name: string) => calls.filter(c => c[0] === name).length;
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, count };
}
/** A stand-in canvas; stops[0] of a ring sprite is where its glow starts (a share of its half-size). */
type FakeCanvas = { width: number; height: number; stops: number[]; getContext: () => unknown };
let canvasesMade = 0;
setCanvasFactory((width, height) => {
  canvasesMade++;
  const stops: number[] = [];
  const { ctx } = fakeContext(stops);
  const canvas: FakeCanvas = { width, height, stops, getContext: () => ctx };
  return canvas;
});

test("the particle pool never grows past its cap and empties itself", () => {
  const particles = new Particles(50);
  particles.burst(100, 100, { count: 500, color: "#fd4" });
  particles.burst(100, 100, { count: 10, streak: 0.04 });
  assert.equal(particles.count, 50);
  const { ctx, count } = fakeContext();
  particles.draw(ctx);
  assert.equal(count("drawImage"), 50);
  particles.update(1); // longer than any life (default 0.6 s)
  assert.equal(particles.count, 0);
});

test("tweens start where the field was and land exactly on the target", () => {
  const tweens = new Tweens();
  const card = { x: 0, scale: 0.5, label: "A" };
  let done = 0;
  tweens.to(card, { x: 960, scale: 1 }, 0.4, { ease: ease.outBack, onDone: () => done++ });
  tweens.update(0);
  assert.equal(card.x, 0);
  for (let i = 0; i < 30; i++) tweens.update(1 / 60);
  assert.deepEqual([card.x, card.scale, done, tweens.active], [960, 1, 1, 0]);
  const seen: number[] = [];
  tweens.num(10, 250, 0.3, v => seen.push(v), { delay: 0.1 });
  tweens.update(0.05);
  assert.equal(seen.length, 0); // still in its delay
  tweens.update(0.05);
  tweens.update(1);
  assert.deepEqual([seen[0], seen.at(-1)], [10, 250]);
  for (const [name, e] of Object.entries(ease)) {
    assert.ok(Math.abs(e(0)) < 1e-9 && Math.abs(e(1) - 1) < 1e-9, name);
  }
});

test("a newer tween of the same field wins", () => {
  const tweens = new Tweens();
  const puck = { x: 0, y: 0 };
  const done: string[] = [];
  tweens.to(puck, { x: 100, y: 50 }, 1, { onDone: () => done.push("xy") });
  tweens.to(puck, { x: -100 }, 0.5, { onDone: () => done.push("x") });
  tweens.to(puck, { x: 30 }, 0.5); // replaces the whole "x" tween: it never finishes
  tweens.update(2);
  assert.deepEqual(puck, { x: 30, y: 50 });
  assert.deepEqual(done, ["xy"]);
});

test("glow sprites are painted once and reused every frame", () => {
  clearGlowCache();
  const painted = glowCacheStats().made, canvases = canvasesMade;
  const a = glowSprite("#3cf", 60);
  assert.equal(glowSprite("#3cf", 60), a);
  assert.equal(glowSprite("#3cf", 63), a); // a pulsing radius snaps to the same sprite
  assert.notEqual(glowSprite("#f4a", 60), a);
  assert.equal(glowCacheStats().made - painted, 2);
  assert.equal(canvasesMade - canvases, 2);
  const { ctx } = fakeContext();
  const square = [0, 0, 300, 0, 300, 300, 0, 300];
  neonPath(ctx, square, "#3cf", 6, true);
  const afterFirstFrame = glowCacheStats().made;
  for (let frame = 0; frame < 120; frame++) neonPath(ctx, square, "#3cf", 6, true);
  assert.equal(glowCacheStats().made, afterFirstFrame);
});

test("a piece-down splash plays its sound once and is gone by 1.5 s", () => {
  const splashes = new Splashes();
  const sparks = new Particles(100);
  let sounds = 0;
  splashes.at(960, 540, { color: "#3cf", inner: 70, duration: 10, sound: () => sounds++, sparks });
  assert.deepEqual([sounds, splashes.active], [1, 1]);
  assert.ok(sparks.count > 0);
  splashes.update(1);
  sparks.update(1);
  assert.equal(splashes.active, 1); // a 10 s request is cut to SPLASH_MAX_S
  splashes.update(SPLASH_MAX_S - 1);
  assert.deepEqual([splashes.active, sparks.count], [0, 0]);
  const { ctx, count } = fakeContext();
  splashes.draw(ctx);
  assert.equal(count("drawImage") + count("stroke"), 0);
});

test("a splash draws nothing inside the piece's footprint", () => {
  const cases: [inner: number, radius?: number][] = [[80], [70, 130], [200, 260], [30, 60], [120, 900]];
  for (const [inner, radius] of cases) {
    const splashes = new Splashes();
    splashes.at(500, 500, { inner, radius });
    const { ctx, calls } = fakeContext();
    for (let frame = 0; frame < 90; frame++) {
      splashes.update(1 / 60);
      splashes.draw(ctx);
    }
    const strokes = calls.filter(c => c[0] === "arc");
    assert.ok(strokes.length > 0);
    for (const [, args, state] of strokes) { // the stroke's inner edge
      assert.ok((args[2] as number) - (state.lineWidth as number) / 2 >= inner - 1e-9, `${inner}`);
    }
    const glows = calls.filter(c => c[0] === "drawImage");
    assert.ok(glows.length > 0);
    for (const [, args] of glows) { // a cached ring stamped around (500, 500): where its glow starts
      const [ring, x, , size] = args as [FakeCanvas, number, number, number];
      assert.ok(Math.abs(x + size / 2 - 500) < 1e-9);
      assert.ok((size / 2) * ring.stops[0] >= inner - 1e-9, `${inner}/${radius}: glow inside the piece`);
    }
  }
});

test("shake decays to rest and hit-stop holds game time", () => {
  const shake = new Shake();
  shake.add(1);
  shake.update(0.1);
  assert.ok(shake.trauma > 0 && shake.trauma < 1);
  shake.update(1);
  assert.ok(shake.trauma === 0 && shake.x === 0 && shake.y === 0);
  const hitStop = new HitStop();
  hitStop.hit(0.08);
  assert.equal(hitStop.step(0.05), 0);
  assert.ok(Math.abs(hitStop.step(0.05) - 0.02) < 1e-9);
  assert.equal(hitStop.step(0.05), 0.05);
});

test("pop text faces the nearest seat, recycles its pool and fades out", () => {
  assert.equal(nearestEdge(100, 540), "left");
  assert.equal(nearestEdge(960, 1000), "bottom");
  const pops = new PopTexts(4);
  pops.pop(100, 540, "+10");
  const { ctx, calls } = fakeContext();
  pops.draw(ctx);
  assert.deepEqual(calls.find(c => c[0] === "rotate")?.[1], [edgeAngle("left")]);
  for (let i = 0; i < 10; i++) pops.pop(960, 100, "+1", { face: "top" });
  assert.equal(pops.active, 4);
  pops.update(1);
  assert.equal(pops.active, 0);
});

test("a trail behind an object at rest draws nothing", () => {
  const trail = new Trail({ max: 16, life: 0.25 });
  const { ctx, calls } = fakeContext();
  const at = (frame: number) => Math.min(frame, 30) * 0.3; // sweeps an arc, then stops dead
  for (let frame = 0; frame < 60; frame++) {
    trail.push(500 + 200 * Math.cos(at(frame)), 500 + 200 * Math.sin(at(frame)));
    trail.update(1 / 60);
    calls.length = 0;
    trail.draw(ctx);
  }
  const corners = calls.filter(c => c[0] === "moveTo" || c[0] === "lineTo").map(c => c[1] as number[]);
  assert.ok(corners.length > 0);
  for (const [x, y] of corners) assert.ok(Math.hypot(x - 500 - 200 * Math.cos(9), y - 500 - 200 * Math.sin(9)) < 1e-3);
});

test("the glow cache stays within its pixel budget", () => {
  clearGlowCache();
  const { ctx } = fakeContext();
  for (const color of ["#3cf", "#f4a", "#fd4", "#7f7"]) {
    for (let r = 10; r < 1000; r += 5) neonCircle(ctx, 960, 540, r, color, 6); // a ring growing across the screen
  }
  const biggest = (2 * (1024 + 19)) ** 2; // the r = 1000 ring sprite
  assert.ok(glowCacheStats().pixels <= 24e6 + biggest, `${glowCacheStats().pixels}`);
});

test("a trail keeps at most max points and fades away when the object stops", () => {
  const trail = new Trail({ max: 8, life: 0.2 });
  for (let i = 0; i < 50; i++) {
    trail.push(i * 10, 0);
    trail.update(1 / 60);
  }
  assert.equal(trail.count, 8);
  trail.update(0.3);
  assert.equal(trail.count, 0);
});
