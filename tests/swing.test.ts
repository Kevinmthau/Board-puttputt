import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ballSpeedForTwist, clubDistance, shortAngleDelta, sweptClubContact, SwingController,
  type SwingPose, type SwingHit } from '../src/swing';
import { pieceFootprint, frontPoint, type PieceFootprints } from '../src/piece-footprints';

const ball = { x: 200, y: 0 };
const pose = (facingDeg: number, x = 0, y = 0): SwingPose => ({ x, y, facingDeg, frontReach: 70 });
function settle(s: SwingController, angle = 330, target = ball): number {
  for (let t = 0; t <= 160; t += 16) assert.equal(s.update(pose(angle), target, t), null);
  return 160;
}
function swing(speed: number, clockwise = true, range = 200): SwingHit {
  const s = new SwingController(), target = { x: range, y: 0 }, start = clockwise ? 330 : 30;
  let now = settle(s, start, target), angle = start;
  for (let i = 0; i < 200; i++) {
    now += 1000 / 60; angle += (clockwise ? 1 : -1) * speed / 60;
    const hit = s.update(pose(angle), target, now);
    if (hit) return hit;
  }
  throw new Error(`No hit at ${speed} degrees per second`);
}

test('power follows twist speed, clamps, and does not depend on stance radius', () => {
  assert.equal(ballSpeedForTwist(30), 180); assert.equal(ballSpeedForTwist(540), 1500);
  assert.equal(ballSpeedForTwist(1000), 1500); assert.equal(ballSpeedForTwist(-540), 1500);
  const gentle = swing(60), hard = swing(360);
  assert.ok(hard.speed > gentle.speed * 2);
  assert.ok(Math.abs(swing(120, true, 125).speed - swing(120, true, 225).speed) < 1e-6);
});

test('clockwise and counterclockwise strikes launch along opposite tangents', () => {
  const cw = swing(180), ccw = swing(180, false);
  assert.ok(cw.vy > 0 && ccw.vy < 0);
  assert.ok(Math.abs(cw.vx) < cw.speed * .15 && Math.abs(ccw.vx) < ccw.speed * .15);
  assert.ok(Math.abs(Math.hypot(cw.vx, cw.vy) - cw.speed) < 1e-9);
});

test('a quick sweep crossing the entire ball between frames still strikes once', () => {
  const s = new SwingController(); settle(s);
  const hit = s.update(pose(30), ball, 260);
  assert.ok(hit); assert.equal(hit.speed, 1500); assert.ok(hit.contactAngleDeg > 350);
  assert.equal(s.update(pose(330), ball, 280), null); assert.equal(s.status, 'spent');
});

test('zero/360 wraps use the short arc', () => {
  assert.equal(shortAngleDelta(2, 359), 3); assert.equal(shortAngleDelta(359, 2), -3);
  const angle = sweptClubContact(pose(345), pose(15), ball);
  assert.ok(angle !== null && angle > 350 && angle < 360);
});

// User override: the line is always active. The former 150 ms settle, 8-degree
// arming, clear-before-hit, 120–230 px range, and ±3-degree rejection promises
// were intentionally removed. Only a 1-degree noise tolerance remains.
test('a held piece with subdegree noise never strikes', () => {
  const s = new SwingController();
  for (let i = 0; i < 1000; i++) {
    const jitter = [0, .4, -.4, .25, -.25, .35, -.35][i % 7];
    assert.equal(s.update(pose(355 + jitter, (i % 3) - 1), ball, i * 16), null);
  }
});

test('turning an already touching line puts immediately without clearing or settling', () => {
  for (const direction of [-1, 1]) {
    const s = new SwingController();
    assert.equal(s.update(pose(0), ball, 0), null, 'placement alone does not putt');
    const hit = s.update(pose(direction * 2), ball, 16);
    assert.ok(hit); assert.equal(Math.sign(hit.vy), direction);
  }
});

test('the first sweep after placement is active without an arming wait', () => {
  const s = new SwingController(); s.update(pose(330), ball, 0);
  assert.ok(s.update(pose(30), ball, 16));
});

test('translation alone, tracking gaps, and disabled input cannot putt', () => {
  const slide = new SwingController(); settle(slide, 0);
  for (let i = 1; i < 20; i++) assert.equal(slide.update(pose(0, i * 5), ball, 160 + i * 16), null);
  const gap = new SwingController(); settle(gap);
  assert.equal(gap.update(pose(30), ball, 400), null); assert.equal(gap.status, 'ready');
  const disabled = new SwingController(); settle(disabled);
  assert.equal(disabled.update(pose(30), ball, 176, false), null);
  assert.equal(disabled.update(pose(330), ball, 192), null);
});

test('natural center drift during a rotation does not lock out the stroke', () => {
  const s = new SwingController(); s.update(pose(330), ball, 0);
  assert.ok(s.update(pose(30, 30, 6), ball, 16));
});

test('ball relocation resets sample history without a fabricated sweep', () => {
  const s = new SwingController(); settle(s);
  assert.equal(s.update(pose(30), { x: 201.1, y: 0 }, 176), null);
});

test('the entire finite forehead line is active, including outside the old stance band', () => {
  for (const range of [100, 119, 231, 240, 250]) {
    const s = new SwingController(), target = { x: range, y: 0 };
    s.update(pose(330), target, 0);
    assert.ok(s.update(pose(30), target, 16), `contact at ${range} px should putt`);
  }
});

test('slow rotation accumulates subdegree samples and puts at minimum power', () => {
  assert.ok(swing(35).speed >= 180);
  assert.equal(swing(20).speed, 180);
});

test('resetting after a shot makes an overlapping line active for the next ball', () => {
  const s = new SwingController(); s.update(pose(0), ball, 0);
  assert.ok(s.update(pose(2), ball, 16));
  assert.equal(s.update(pose(-2), ball, 32), null);
  s.reset(); assert.equal(s.update(pose(0), ball, 48), null);
  assert.ok(s.update(pose(-2), ball, 64));
});

test('the finite club does not hit behind its forehead or beyond its end', () => {
  assert.equal(sweptClubContact(pose(330), pose(30), { x: 400, y: 0 }), null);
  assert.equal(sweptClubContact(pose(330), pose(30), { x: 30, y: 0 }), null);
  assert.equal(clubDistance(pose(0), { x: -10, y: 0 }), 80);
});

test('all eight actual Sports footprints fit the agreed minimum stance distance', () => {
  const footprints = JSON.parse(readFileSync('public/piece-footprints.json', 'utf8')) as PieceFootprints;
  assert.equal(footprints.set, 'sports');
  for (const key of Object.keys(footprints.pieces)) {
    const fp = pieceFootprint(footprints, { glyphId: Number(key), x: 0, y: 0, orientation: 0 })!;
    const front = frontPoint(fp, 6), reach = Math.hypot(front.x, front.y);
    assert.ok(reach < 106, `${key} must not cover a ball 120 px away`);
    assert.ok(fp.radiusPx + 14 < 120, `${key} must leave physical clearance`);
    assert.equal(clubDistance({ ...pose(0), frontReach: reach }, { x: 120, y: 0 }), 0);
  }
});
