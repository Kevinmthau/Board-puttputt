import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activePlayer, createRound, restoreRound, serializeRound, stepRound, strike, winners } from '../src/round';

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
