import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOLES, type Hole } from '../src/course';
import { createBall, stepBall, stepBalls, strikeBall } from '../src/physics';

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

const energy = (balls: ReturnType<typeof createBall>[]) => balls.reduce((sum, ball) => sum + ball.vx ** 2 + ball.vy ** 2, 0);

test('a direct hit transfers momentum to a resting opponent without adding energy', () => {
  const a = createBall({ x: 500, y: 540 }), b = createBall({ x: 550, y: 540 });
  const safe = { ...b.lastSafe };
  strikeBall(a, { x: 500, y: 0 });
  const initialEnergy = energy([a, b]);
  const events = stepBalls([a, b], HOLES[0], 0.1, 0);
  assert.equal(b.state, 'moving');
  assert.ok(b.x > 565);
  assert.ok(b.vx > a.vx + 300);
  assert.equal(a.vy, 0); assert.equal(b.vy, 0);
  assert.ok(energy([a, b]) < initialEnergy);
  assert.deepEqual(b.lastSafe, safe, 'contact must preserve the shot-start recovery position');
  assert.ok(events.some(event => event.type === 'bounce' && event.ballIndex === 1));
});

test('a glancing hit deflects both balls to opposite sides of the shot', () => {
  const a = createBall({ x: 500, y: 540 }), b = createBall({ x: 550, y: 558 });
  strikeBall(a, { x: 500, y: 0 });
  stepBalls([a, b], HOLES[0], 0.1, 0);
  assert.ok(a.vx > 0 && a.vy < 0);
  assert.ok(b.vx > 0 && b.vy > 0);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r);
  assert.ok(energy([a, b]) < 500 ** 2);
});

test('opposing full-speed balls collide instead of tunneling through each other', () => {
  const a = createBall({ x: 500, y: 540 }), b = createBall({ x: 600, y: 540 });
  strikeBall(a, { x: 1500, y: 0 }); strikeBall(b, { x: -1500, y: 0 });
  stepBalls([a, b], HOLES[0], 0.08, 0);
  assert.ok(a.x < b.x);
  assert.ok(a.vx < -1000 && b.vx > 1000);
  assert.ok(energy([a, b]) < 2 * 1500 ** 2);
});

test('a chain collision can set all four balls in motion', () => {
  const balls = [500, 533, 566, 599].map(x => createBall({ x, y: 540 }));
  strikeBall(balls[0], { x: 800, y: 0 });
  stepBalls(balls, HOLES[0], 0.06, 0);
  assert.ok(balls.every(ball => ball.state === 'moving'));
  assert.ok(balls[3].vx > 500 && balls[3].x > 610);
  assert.ok(energy(balls) < 800 ** 2);
});

test('overlapping balls separate finitely and resting pairs remain undisturbed', () => {
  const a = createBall({ x: 500, y: 540 }), b = createBall({ x: 500, y: 540 });
  assert.deepEqual(stepBalls([a, b], HOLES[0], 0.1, 0), []);
  assert.equal(a.x, 500); assert.equal(b.x, 500);
  strikeBall(a, { x: 300, y: 0 });
  stepBalls([a, b], HOLES[0], 0.1, 0);
  assert.ok([a.x, a.y, a.vx, a.vy, b.x, b.y, b.vx, b.vy].every(Number.isFinite));
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r);
  assert.ok(energy([a, b]) <= 300 ** 2);
});

test('sunk balls cannot be knocked back out of the cup', () => {
  const a = createBall({ x: 1300, y: 540 }), b = createBall(HOLES[0].cup);
  b.state = 'sunk';
  strikeBall(a, { x: 1500, y: 0 });
  stepBalls([a, b], HOLES[0], 0.06, 0);
  assert.equal(b.state, 'sunk');
  assert.equal(b.x, HOLES[0].cup.x); assert.equal(b.y, HOLES[0].cup.y);
  assert.ok(a.x > b.x);
});

test('a bumped opponent can sink and its sink event identifies that ball', () => {
  const a = createBall({ x: 1290, y: 540 }), b = createBall({ x: 1325, y: 540 });
  strikeBall(a, { x: 200, y: 0 });
  const events = [];
  for (let i = 0; i < 60; i++) events.push(...stepBalls([a, b], HOLES[0], 1 / 120, i / 120));
  assert.equal(b.state, 'sunk');
  assert.equal(events.filter(event => event.type === 'sink' && event.ballIndex === 1).length, 1);
});

test('a bumped ball returns from water once and stays excluded for the rest of the step', () => {
  const hole: Hole = { ...HOLES[0], water: [{ x: 700, y: 250, w: 180, h: 580 }] };
  const a = createBall({ x: 660, y: 540 }), b = createBall({ x: 690, y: 540 });
  strikeBall(a, { x: 1000, y: 0 });
  const events = stepBalls([a, b], hole, 0.1, 0);
  assert.equal(events.filter(event => event.type === 'water' && event.ballIndex === 1).length, 1);
  assert.equal(b.state, 'ready'); assert.equal(b.x, 690); assert.equal(b.vx, 0);
});

test('a ball pinned against a rail rebounds without escaping or gaining energy', () => {
  const hole: Hole = { ...HOLES[0], walls: [...HOLES[0].walls, { a: { x: 800, y: 350 }, b: { x: 800, y: 700 } }] };
  const a = createBall({ x: 745, y: 540 }), b = createBall({ x: 786, y: 540 });
  strikeBall(a, { x: 700, y: 0 });
  for (let i = 0; i < 600 && [a, b].some(ball => ball.state === 'moving'); i++) {
    stepBalls([a, b], hole, 1 / 120, i / 120);
    assert.ok(a.x <= 786.01 && b.x <= 786.01);
    assert.ok(energy([a, b]) <= 700 ** 2);
  }
  assert.equal(a.state, 'ready'); assert.equal(b.state, 'ready');
});
