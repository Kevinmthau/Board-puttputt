import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PieceTracker, type TrackingContact } from '../src/tracking';
const c = (contactId: number, x = 400, glyphId = 1, orientation = 90): TrackingContact =>
  ({ contactId, glyphId, x, y: 500, orientation });

test('held, moved and rotated contacts keep one identity and owner', () => {
  const t = new PieceTracker(), p = t.update([c(1)], 0).arrivals[0]; p.owner = 42;
  assert.equal(t.update([c(1)], 200).arrivals.length, 0);
  t.update([c(1, 450, 1, 135)], 400);
  assert.equal(t.identities.length, 1); assert.equal(p.owner, 42);
  assert.equal(p.x, 450); assert.equal(p.orientation, 135); assert.equal(p.epoch, 0);
});

test('missing input disarms immediately but confirms a lift after debounce', () => {
  const t = new PieceTracker(), p = t.update([c(1)], 0).arrivals[0];
  t.update([], 100); assert.equal(p.present, false); assert.equal(p.lifted, false); assert.equal(p.epoch, 1);
  t.update([], 249); assert.equal(p.lifted, false);
  t.update([], 250); assert.equal(p.lifted, true);
});

test('a nearby same-glyph blink restores owner without a new arrival', () => {
  const t = new PieceTracker(), p = t.update([c(1)], 0).arrivals[0]; p.owner = 7;
  t.update([], 20);
  const result = t.update([c(9, 450)], 300);
  assert.equal(result.arrivals.length, 0); assert.equal(result.recovered[0], p);
  assert.equal(p.contactId, 9); assert.equal(p.owner, 7); assert.ok(p.epoch >= 2); assert.equal(p.present, true);
});

test('far, late, or different-glyph returns are genuinely new placements', () => {
  for (const [next, time] of [[c(9, 541), 300], [c(9, 450), 901], [c(9, 450, 2), 300]] as const) {
    const t = new PieceTracker(); t.update([c(1)], 0); t.update([], 10);
    assert.equal(t.update([next], time).arrivals.length, 1);
  }
});

test('duplicate glyphs preserve independent owners despite contact order changes', () => {
  const t = new PieceTracker(), first = t.update([c(1, 400), c(2, 500)], 0).arrivals;
  first[0].owner = 1; first[1].owner = 2; t.update([], 10);
  const result = t.update([c(20, 490), c(10, 410)], 100);
  assert.equal(result.recovered.length, 2); assert.equal(result.arrivals.length, 0);
  assert.equal(first[0].contactId, 10); assert.equal(first[1].contactId, 20);
  assert.equal(first[0].owner, 1); assert.equal(first[1].owner, 2);
});

test('a nearby duplicate cannot take an identity still bound to a live contact', () => {
  const t = new PieceTracker(), p = t.update([c(1)], 0).arrivals[0];
  const next = t.update([c(2, 401), c(1, 400)], 100);
  assert.equal(next.arrivals.length, 1); assert.equal(p.contactId, 1);
});

test('pause recovery matches position and glyph, not stale contact IDs or pause duration', () => {
  const t = new PieceTracker(), first = t.update([c(1, 400), c(2, 700, 2)], 0).arrivals;
  first[0].owner = 1; first[1].owner = 2; t.paused(50);
  assert.equal(t.update([c(99)], 50000).arrivals.length, 0);
  t.resumed(100000);
  const result = t.update([c(2, 405), c(1, 705, 2)], 100100);
  assert.equal(result.arrivals.length, 0); assert.equal(result.recovered.length, 2);
  assert.equal(first[0].owner, 1); assert.equal(first[0].contactId, 2);
  assert.equal(first[1].owner, 2); assert.equal(first[1].contactId, 1);
});

test('short glyph classification flaps freeze pose and invalidate swing intent', () => {
  const t = new PieceTracker(), p = t.update([c(1)], 0).arrivals[0]; p.owner = 4;
  t.update([c(1, 900, 0, 240)], 100);
  assert.equal(p.present, true); assert.equal(p.x, 400); assert.equal(p.orientation, 90); assert.equal(p.epoch, 1);
  const result = t.update([c(1, 405, 1, 95)], 200);
  assert.equal(result.arrivals.length, 0); assert.equal(p.owner, 4); assert.equal(p.epoch, 2);
  t.update([c(1, 900, 0)], 500); assert.equal(p.present, false);
});

test('invalid and unclassified new contacts never become players', () => {
  const t = new PieceTracker();
  t.update([c(1, 0, 0), c(2, NaN), c(3, Infinity)], 0);
  assert.equal(t.identities.length, 0);
});
