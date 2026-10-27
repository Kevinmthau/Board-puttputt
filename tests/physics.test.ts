import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOLES, type Hole } from '../src/course';
import { createBall, stepBall, strikeBall } from '../src/physics';

const simulate = (ball: ReturnType<typeof createBall>, hole: Hole, seconds = 10) => {
  const events = [];
  for (let t = 0; t < seconds && ball.state === 'moving'; t += 1 / 120) events.push(...stepBall(ball, hole, 1 / 120, t));
  return events;
};

test('First Green accepts a controlled putt and ends in its cup', () => {
  const ball = createBall({ x: 1250, y: 540 });
  assert.equal(strikeBall(ball, { x: 280, y: 0 }), true);
  const events = simulate(ball, HOLES[0]);
  assert.equal(ball.state, 'sunk');
  assert.equal(events.filter(e => e.type === 'sink').length, 1);
});

test('a full-power shot rebounds from a thin rail without escaping', () => {
  const ball = createBall({ x: 1640, y: 500 });
  strikeBall(ball, { x: 1500, y: 0 });
  const events = simulate(ball, HOLES[0]);
  assert.ok(events.some(e => e.type === 'bounce'));
  assert.ok(!events.some(e => e.type === 'water'));
  assert.equal(ball.state, 'ready');
});

test('a rolling ball cannot be struck again', () => {
  const ball = createBall(HOLES[0].tee);
  assert.equal(strikeBall(ball, { x: 500, y: 0 }), true);
  assert.equal(strikeBall(ball, { x: 0, y: 500 }), false);
  assert.equal(ball.vy, 0);
});

test('fast balls roll over a cup while slow balls are captured', () => {
  const ball = createBall({ x: 1310, y: 540 });
  strikeBall(ball, { x: 1200, y: 0 });
  stepBall(ball, HOLES[0], 0.08, 0);
  assert.equal(ball.state, 'moving');
  assert.ok(ball.x > HOLES[0].cup.x);
});

test('water restores the pre-shot position while bridges carry the ball', () => {
  const hole: Hole = { ...HOLES[0], water: [{ x: 700, y: 250, w: 180, h: 580 }], bridges: [{ x: 680, y: 650, w: 220, h: 120 }] };
  const lost = createBall({ x: 650, y: 540 });
  strikeBall(lost, { x: 500, y: 0 });
  const events = simulate(lost, hole);
  assert.equal(events.filter(e => e.type === 'water').length, 1);
  assert.equal(lost.x, 650);
  assert.equal(lost.state, 'ready');
  const bridged = createBall({ x: 650, y: 710 });
  strikeBall(bridged, { x: 500, y: 0 });
  assert.ok(!simulate(bridged, hole).some(e => e.type === 'water'));
  assert.ok(bridged.x > 880);
});

test('a tunnel has a deterministic exit and cannot repeat during cooldown', () => {
  const hole: Hole = { ...HOLES[0], tunnels: [{ id: 'test', entry: { x: 700, y: 540, r: 35 }, exit: { x: 1100, y: 600 }, direction: { x: 1, y: 0 }, speedScale: 0.75 }] };
  const ball = createBall({ x: 650, y: 540 });
  strikeBall(ball, { x: 500, y: 0 });
  const events = simulate(ball, hole);
  assert.equal(events.filter(e => e.type === 'tunnel').length, 1);
  assert.equal(ball.y, 600);
  assert.ok(ball.x > 1100);
});

test('every authored tunnel preserves its speed fraction without boosting a soft putt', () => {
  for (const hole of HOLES) for (const tunnel of hole.tunnels) {
    const ball = createBall({ x: tunnel.entry.x - tunnel.entry.r + 0.2, y: tunnel.entry.y });
    strikeBall(ball, { x: 180, y: 0 });
    const events = stepBall(ball, hole, 0.001, 0);
    assert.ok(events.some(e => e.type === 'tunnel'), `${hole.name}: enters the actual tunnel`);
    assert.ok(Math.hypot(ball.vx, ball.vy) <= 180 * tunnel.speedScale);
    assert.ok(Math.hypot(ball.vx, ball.vy) < 160, `${hole.name}: soft putt receives no artificial power`);
  }
});

test('sand reduces travel, and a slope changes the rolling direction', () => {
  const plain = createBall({ x: 500, y: 650 }), sand = createBall({ x: 500, y: 650 }), slope = createBall({ x: 500, y: 650 });
  for (const ball of [plain, sand, slope]) strikeBall(ball, { x: 500, y: 0 });
  simulate(plain, HOLES[0]);
  simulate(sand, { ...HOLES[0], sand: [{ x: 480, y: 600, w: 1000, h: 100 }] });
  simulate(slope, { ...HOLES[0], slopes: [{ x: 480, y: 600, w: 1000, h: 100, ax: 0, ay: -130 }] });
  assert.ok(sand.x < plain.x - 100);
  assert.ok(slope.y < plain.y - 20);
});

test('a closed gate blocks a shot and its opening admits the same shot', () => {
  const hole: Hole = { ...HOLES[0], gates: [{ id: 'gate', a: { x: 800, y: 350 }, b: { x: 800, y: 700 }, period: 10, openFor: 5, phase: 0, kind: 'windmill' }] };
  const closed = createBall({ x: 750, y: 540 }), open = createBall({ x: 750, y: 540 });
  strikeBall(closed, { x: 500, y: 0 }); strikeBall(open, { x: 500, y: 0 });
  let closedHit = false;
  for (let t = 0; t < 0.3; t += 1 / 120) {
    closedHit ||= stepBall(closed, hole, 1 / 120, 6 + t).some(e => e.type === 'bounce');
    stepBall(open, hole, 1 / 120, t);
  }
  assert.equal(closedHit, true);
  assert.ok(closed.x < 800);
  assert.ok(open.x > 800);
});
