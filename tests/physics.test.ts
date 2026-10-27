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
