import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activePlayer, advanceHole, createRound, restoreRound, serializeRound, stepRound, strike, totals, winners } from '../src/round';
import { HOLES } from '../src/course';
import { createBall } from '../src/physics';

function finishStroke(round: ReturnType<typeof createRound>) {
  for (let i = 0; i < 2400 && round.phase === 'roll'; i++) stepRound(round, 1 / 120);
}

test('players alternate one stroke, and a stroke counts only once', () => {
  const round = createRound(['a', 'b']);
  assert.equal(strike(round, { x: 180, y: 0 }), true);
  assert.equal(strike(round, { x: 180, y: 0 }), false);
  finishStroke(round);
  assert.equal(round.players[0].scores[0], 1);
  assert.equal(activePlayer(round).id, 'b');
  assert.equal(round.phase, 'aim');
});

test('the seventh unsuccessful stroke picks up the ball', () => {
  const round = createRound(['a', 'b']);
  round.players[0].scores[0] = 6;
  strike(round, { x: 180, y: 0 }); finishStroke(round);
  assert.equal(round.players[0].scores[0], 7);
  assert.equal(round.players[0].pickedUp[0], true);
  assert.equal(round.players[0].finished, true);
  assert.equal(activePlayer(round).id, 'b');
});

test('saved rounds preserve player identity and reject malformed values', () => {
  const round = createRound(['a', 'b']);
  strike(round, { x: 600, y: 0 }); stepRound(round, 0.05);
  const restored = restoreRound(serializeRound(round));
  assert.ok(restored);
  assert.equal(restored.players[0].ball.x, round.players[0].ball.x);
  assert.equal(restored.phase, 'roll');
  assert.equal(restoreRound('{'), null);
  assert.equal(restoreRound({ version: 1, players: [] }), null);
  assert.deepEqual(winners(createRound(['a', 'b'])), ['a', 'b']);
});

test('water costs exactly one extra stroke and advances the turn once', () => {
  const original = HOLES[0].water;
  try {
    HOLES[0].water = [{ x: 520, y: 400, w: 300, h: 300 }];
    const round = createRound(['a', 'b']);
    strike(round, { x: 600, y: 0 }); finishStroke(round);
    assert.equal(round.players[0].scores[0], 2);
    assert.equal(round.players[0].ball.x, HOLES[0].tee.x);
    assert.equal(activePlayer(round).id, 'b');
  } finally { HOLES[0].water = original; }
});

test('fixed-step results do not depend on browser frame rate', () => {
  const fast = createRound(['a']), slow = createRound(['a']);
  strike(fast, { x: 500, y: 100 }); strike(slow, { x: 500, y: 100 });
  for (let i = 0; i < 240; i++) stepRound(fast, 1 / 120);
  for (let i = 0; i < 60; i++) stepRound(slow, 1 / 30);
  assert.ok(Math.abs(fast.players[0].ball.x - slow.players[0].ball.x) < 0.001);
  assert.ok(Math.abs(fast.players[0].ball.y - slow.players[0].ball.y) < 0.001);
});

test('finished players are skipped until the whole group advances', () => {
  const round = createRound(['a', 'b', 'c']);
  round.players[1].finished = true;
  round.players[1].ball.state = 'sunk';
  strike(round, { x: 180, y: 0 }); finishStroke(round);
  assert.equal(activePlayer(round).id, 'c');
  assert.equal(advanceHole(round), false);
});

test('four players finish all nine holes with collisions, capped scores and a shared result', () => {
  const routes = [
    [[1350, 540]],
    [[520, 690], [1480, 690]],
    [[700, 745], [1250, 745], [1450, 510]],
    [[700, 745], [1200, 745], [1450, 480]],
    [[650, 750], [1250, 750], [1450, 540]],
    [[600, 750], [1300, 750], [1450, 500]],
    [[600, 300], [1450, 300], [1450, 540]],
    [[900, 420], [900, 710], [1450, 710]],
    [[700, 755], [1330, 755], [1580, 540]],
  ];
  let round = createRound(['a', 'b', 'c', 'd']);
  for (let holeIndex = 0; holeIndex < 9; holeIndex++) {
    const nextTarget = [0, 0, 0, 0];
    while (round.phase === 'aim') {
      const index = round.turnIndex, ball = activePlayer(round).ball;
      const target = routes[holeIndex][Math.min(nextTarget[index]++, routes[holeIndex].length - 1)];
      const dx = target[0] - ball.x, dy = target[1] - ball.y, distance = Math.hypot(dx, dy);
      const speed = Math.max(180, Math.sqrt(640 * distance));
      assert.equal(strike(round, { x: distance ? dx / distance * speed : 180, y: distance ? dy / distance * speed : 0 }), true);
      finishStroke(round);
      assert.notEqual(round.phase, 'roll');
    }
    assert.ok(round.players.every(p => p.finished));
    assert.ok(round.players.every(p => p.ball.state !== 'moving'));
    for (const player of round.players) {
      assert.ok(player.scores[holeIndex] > 0 && player.scores[holeIndex] <= 7);
      assert.equal(player.pickedUp[holeIndex], player.ball.state !== 'sunk');
      if (player.pickedUp[holeIndex]) assert.equal(player.scores[holeIndex], 7);
    }
    if (holeIndex < 8) {
      assert.equal(round.phase, 'hole-complete');
      round = restoreRound(serializeRound(round))!;
      assert.equal(advanceHole(round), true);
      assert.equal(round.time, 0);
      assert.ok(round.players.every(p => !p.finished && p.ball.state === 'ready'));
    }
  }
  assert.equal(round.phase, 'complete');
  const scores = totals(round);
  const lowest = Math.min(...scores.map(score => score.total));
  assert.deepEqual(winners(round), scores.filter(score => score.total === lowest).map(score => score.id));
  assert.equal(advanceHole(round), false);
});


function collisionRound(ids = ['a', 'b']) {
  const round = createRound(ids);
  round.players[0].ball = createBall({ x: 600, y: 540 });
  round.players[1].ball = createBall({ x: 660, y: 540 });
  round.players[1].scores[0] = 1;
  return round;
}

test('a putt moves a played opponent and waits for every rolling ball before handing off', () => {
  const round = collisionRound();
  strike(round, { x: 600, y: 0 });
  let opponentMoved = false, waitingForOpponent = false;
  const events = [];
  for (let i = 0; i < 2400 && round.phase === 'roll'; i++) {
    events.push(...stepRound(round, 1 / 120));
    const [striker, opponent] = round.players;
    opponentMoved ||= opponent.ball.x > 670;
    if (striker.ball.state === 'ready' && opponent.ball.state === 'moving') {
      waitingForOpponent = true;
      assert.equal(round.phase, 'roll');
      assert.equal(activePlayer(round).id, 'a');
      assert.equal(strike(round, { x: 300, y: 0 }), false);
    }
  }
  assert.ok(opponentMoved);
  assert.ok(waitingForOpponent);
  assert.equal(round.phase, 'aim');
  assert.equal(activePlayer(round).id, 'b');
  assert.deepEqual(round.players.map(p => p.scores[0]), [1, 1]);
  assert.equal(events.filter(event => event.type === 'turn').length, 1);
});

test('unplayed balls sharing the tee are unaffected until their first putt', () => {
  const round = createRound(['a', 'b', 'c', 'd']);
  strike(round, { x: 600, y: 0 });
  finishStroke(round);
  assert.ok(round.players[0].ball.x > HOLES[0].tee.x + 100);
  for (const player of round.players.slice(1)) {
    assert.deepEqual(player.ball, createBall(HOLES[0].tee));
    assert.equal(player.scores[0], 0);
  }
});

test('a bumped opponent can sink without another stroke and is skipped next turn', () => {
  const round = collisionRound(['a', 'b', 'c']);
  round.players[0].ball = createBall({ x: 1250, y: 540 });
  round.players[1].ball = createBall({ x: 1300, y: 540 });
  strike(round, { x: 260, y: 0 });
  const events = [];
  for (let i = 0; i < 2400 && round.phase === 'roll'; i++) events.push(...stepRound(round, 1 / 120));
  assert.equal(round.players[1].ball.state, 'sunk');
  assert.equal(round.players[1].finished, true);
  assert.equal(round.players[1].scores[0], 1);
  assert.equal(round.players[1].pickedUp[0], false);
  assert.equal(activePlayer(round).id, 'c');
  assert.equal(events.filter(event => event.type === 'sink' && event.playerId === 'b').length, 1);
});

test("water hit by an opponent charges its owner once and returns to this shot's starting position", () => {
  const original = HOLES[0].water;
  try {
    HOLES[0].water = [{ x: 700, y: 450, w: 150, h: 180 }];
    const round = collisionRound();
    round.players[1].ball.lastSafe = { x: 440, y: 540 };
    strike(round, { x: 900, y: 0 });
    const events = [];
    for (let i = 0; i < 2400 && round.phase === 'roll'; i++) events.push(...stepRound(round, 1 / 120));
    assert.equal(round.players[1].ball.x, 660);
    assert.equal(round.players[1].ball.y, 540);
    assert.deepEqual(round.players.map(p => p.scores[0]), [1, 2]);
    assert.equal(events.filter(event => event.type === 'water' && event.playerId === 'b').length, 1);
    assert.equal(activePlayer(round).id, 'b');
  } finally { HOLES[0].water = original; }
});

test('an opponent reaching the cap through a water penalty is picked up and skipped', () => {
  const original = HOLES[0].water;
  try {
    HOLES[0].water = [{ x: 700, y: 450, w: 150, h: 180 }];
    const round = collisionRound(['a', 'b', 'c']);
    round.players[1].scores[0] = 6;
    strike(round, { x: 600, y: 0 });
    finishStroke(round);
    assert.equal(round.players[1].scores[0], 7);
    assert.equal(round.players[1].finished, true);
    assert.equal(round.players[1].pickedUp[0], true);
    assert.equal(activePlayer(round).id, 'c');
  } finally { HOLES[0].water = original; }
});

test('finished balls cannot be hit even if left in the path', () => {
  const round = collisionRound();
  round.players[1].scores[0] = 7;
  round.players[1].pickedUp[0] = true;
  round.players[1].finished = true;
  strike(round, { x: 600, y: 0 });
  finishStroke(round);
  assert.equal(round.players[1].ball.x, 660);
  assert.equal(round.players[1].ball.state, 'ready');
  assert.ok(round.players[0].ball.x > 1000);
});

test('colliding balls are deterministic across frame rates and mid-roll saves', () => {
  const fast = collisionRound(['a', 'b', 'c']);
  fast.players[2].ball = createBall({ x: 750, y: 555 });
  fast.players[2].scores[0] = 2;
  const slow = restoreRound(serializeRound(fast))!;
  strike(fast, { x: 800, y: 0 }); strike(slow, { x: 800, y: 0 });
  for (let i = 0; i < 24; i++) stepRound(fast, 1 / 120);
  for (let i = 0; i < 6; i++) stepRound(slow, 1 / 30);
  assert.ok(fast.players.some((p, index) => index > 0 && p.ball.state === 'moving'));
  const restored = restoreRound(serializeRound(fast))!;
  for (let i = 0; i < 360; i++) { stepRound(fast, 1 / 120); stepRound(restored, 1 / 120); }
  for (let i = 0; i < 90; i++) stepRound(slow, 1 / 30);
  assert.deepEqual(restored.players, fast.players);
  assert.deepEqual(slow.players, fast.players);
  assert.equal(slow.turnIndex, fast.turnIndex);
  assert.equal(restored.phase, fast.phase);
});

test('water-reset balls stay out of the current shot across saves and return for the next shot', () => {
  const original = HOLES[0].water;
  try {
    HOLES[0].water = [{ x: 700, y: 450, w: 150, h: 180 }];
    const round = collisionRound(['a', 'b', 'c']);
    // A second moving ball approaches the reset position after the first splash.
    round.players[2].ball = createBall({ x: 660, y: 330 });
    round.players[2].scores[0] = 1;
    strike(round, { x: 900, y: 0 });
    round.players[2].ball.vy = 380;
    round.players[2].ball.state = 'moving';
    let splashed = false;
    for (let i = 0; i < 120 && !splashed; i++) {
      splashed = stepRound(round, 1 / 120).some(event => event.type === 'water' && event.playerId === 'b');
    }
    assert.ok(splashed);
    assert.equal(round.phase, 'roll');
    assert.ok(round.settledForShot?.includes('b'));
    const restored = restoreRound(serializeRound(round));
    assert.ok(restored);
    assert.ok(restored.settledForShot?.includes('b'));
    finishStroke(round); finishStroke(restored);
    assert.equal(restored.players[1].scores[0], 2);
    assert.equal(restored.players[1].ball.x, 660);
    assert.equal(restored.players[1].ball.y, 540);
    assert.deepEqual(restored.players, round.players);
    assert.equal(strike(restored, { x: -180, y: 0 }), true);
    assert.ok(!restored.settledForShot?.includes('b'));
  } finally { HOLES[0].water = original; }
});


test('restoration rejects malformed or unknown water-reset player IDs', () => {
  const saved = createRound(['a', 'b']);
  for (const settledForShot of ['a', [42], ['missing'], ['a', 'a']]) {
    assert.equal(restoreRound({ ...saved, settledForShot }), null);
  }
  assert.ok(restoreRound(saved), 'old saves without water-reset state remain valid');
  assert.ok(restoreRound({ ...saved, settledForShot: ['b'] }));
});
