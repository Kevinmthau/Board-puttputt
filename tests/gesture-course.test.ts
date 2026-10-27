import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOLES, type Point } from '../src/course';
import { createBall } from '../src/physics';
import { activePlayer, advanceHole, createRound, stepRound, strike, type Round, type RoundEvent } from '../src/round';
import { SwingController, SWING, type SwingHit } from '../src/swing';

// Same authored safe routes as course.test.ts. These tests exercise actual poses,
// including capsule-contact aim, rather than assigning a ball's velocity directly.
const SAFE_ROUTES: Point[][] = [
  [{ x: 1350, y: 540 }],
  [{ x: 520, y: 690 }, { x: 1480, y: 690 }],
  [{ x: 700, y: 745 }, { x: 1250, y: 745 }, { x: 1450, y: 510 }],
  [{ x: 700, y: 745 }, { x: 1200, y: 745 }, { x: 1450, y: 480 }],
  [{ x: 650, y: 750 }, { x: 1250, y: 750 }, { x: 1450, y: 540 }],
  [{ x: 600, y: 750 }, { x: 1300, y: 750 }, { x: 1450, y: 500 }],
  [{ x: 600, y: 300 }, { x: 1450, y: 300 }, { x: 1450, y: 540 }],
  [{ x: 900, y: 420 }, { x: 900, y: 710 }, { x: 1450, y: 710 }],
  [{ x: 700, y: 755 }, { x: 1330, y: 755 }, { x: 1580, y: 540 }],
];

function physicalPutt(round: Round, direction: number, speed: number): SwingHit {
  const ball = activePlayer(round).ball;
  const radius = 170, beta = Math.asin((SWING.ballRadius + SWING.clubWidth / 2) / radius);
  const stance = (sign: number) => {
    const hitAngle = direction - sign * Math.PI / 2;
    const radialAngle = hitAngle + sign * beta;
    return { sign, x: ball.x - radius * Math.cos(radialAngle), y: ball.y - radius * Math.sin(radialAngle), start: radialAngle * 180 / Math.PI - sign * 45 };
  };
  const fits = (p: Point) => p.x >= 112 && p.x <= 1808 && p.y >= 112 && p.y <= 968;
  let placement = stance(1);
  if (!fits(placement)) placement = stance(-1);
  assert.ok(fits(placement), 'Sports piece and hand margin fit on the glass');
  assert.ok(speed >= SWING.minimumBallSpeed && speed <= SWING.maximumBallSpeed, 'shot uses supported gesture power');
  const angularSpeed = (speed - 180) / 1320 * 510 + 30;
  const swing = new SwingController();
  const pose = { x: placement.x, y: placement.y, facingDeg: placement.start, frontReach: 70 };
  const sampleMs = 1000 / 120;
  for (let i = 0; i <= 24; i++) {
    if (i) stepRound(round, 1 / 120);
    assert.equal(swing.update(pose, ball, i * sampleMs, true), null, 'placing and settling never putt');
  }
  for (let i = 1; i <= 720; i++) {
    stepRound(round, 1 / 120);
    const now = 200 + i * sampleMs;
    const rotated = { ...pose, facingDeg: pose.facingDeg + placement.sign * angularSpeed * i / 120 };
    const hit = swing.update(rotated, ball, now, true);
    if (!hit) continue;
    assert.ok(Math.abs(hit.speed - speed) < 0.1, 'measured twist speed gives the intended power');
    const actualDirection = Math.atan2(hit.vy, hit.vx);
    assert.ok(Math.abs(Math.atan2(Math.sin(actualDirection - direction), Math.cos(actualDirection - direction))) < 0.0001, 'earliest capsule contact gives the intended tangent');
    assert.equal(swing.update({ ...rotated, facingDeg: rotated.facingDeg + placement.sign * 8 }, ball, now + sampleMs, true), null, 'one sweep produces only one strike');
    assert.equal(strike(round, { x: hit.vx, y: hit.vy }), true);
    return hit;
  }
  assert.fail('a settled, deliberate sweep must strike the ball');
}

function finishRoll(round: Round): RoundEvent[] {
  const events: RoundEvent[] = [];
  for (let i = 0; i < 2400 && round.phase === 'roll'; i++) events.push(...stepRound(round, 1 / 120));
  assert.notEqual(round.phase, 'roll', 'ball settles within twenty seconds');
  return events;
}

test('real piece poses can complete all nine holes within par', () => {
  const round = createRound(['physical-player']);
  for (let h = 0; h < HOLES.length; h++) {
    for (const target of SAFE_ROUTES[h]) {
      if (round.phase !== 'aim') break;
      const ball = activePlayer(round).ball;
      const dx = target.x - ball.x, dy = target.y - ball.y;
      physicalPutt(round, Math.atan2(dy, dx), Math.max(180, Math.sqrt(640 * Math.hypot(dx, dy))));
      assert.ok(!finishRoll(round).some(e => e.type === 'water'), `${HOLES[h].name}: gesture follows its safe route`);
    }
    assert.equal(activePlayer(round).ball.state, 'sunk', `${HOLES[h].name}: a real swing reaches the cup`);
    assert.ok(activePlayer(round).scores[h] <= HOLES[h].par, `${HOLES[h].name}: gesture route meets par`);
    assert.equal(activePlayer(round).pickedUp[h], false);
    if (h < HOLES.length - 1) assert.equal(advanceHole(round), true);
  }
  assert.equal(round.phase, 'complete');
  assert.equal(activePlayer(round).scores.reduce((sum, n) => sum + n, 0), 24);
});

test('real swings can use the timed gates, narrow bridge, ramp, and tunnel shortcuts', () => {
  const cases = [
    { id: 3, speed: 800, time: 2.15, tunnel: false },
    { id: 4, speed: 800, time: 0, tunnel: false },
    { id: 5, speed: 725, time: 0, tunnel: true },
    { id: 6, speed: 800, time: 0, tunnel: false },
    { id: 8, speed: 715, time: 0, tunnel: true },
    { id: 9, speed: 805, time: 2, tunnel: true },
  ];
  for (const example of cases) {
    const round = createRound(['physical-player']), hole = HOLES[example.id - 1];
    round.holeIndex = example.id - 1; round.time = example.time;
    activePlayer(round).ball = createBall(hole.tee);
    physicalPutt(round, 0, example.speed);
    const events = finishRoll(round);
    assert.equal(activePlayer(round).ball.state, 'sunk', `${hole.name}: shortcut is playable with a physical gesture`);
    assert.equal(activePlayer(round).scores[round.holeIndex], 1);
    assert.equal(events.some(e => e.type === 'tunnel'), example.tunnel, `${hole.name}: expected shortcut was actually used`);
    assert.ok(!events.some(e => e.type === 'water' || e.type === 'bounce'), `${hole.name}: the direct route clears its hazards`);
  }
});
