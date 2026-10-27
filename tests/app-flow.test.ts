/** Exercise the real app exclusively through its normal input and menu interfaces.
 * The browser-only snapshot is read, never written. Canvas mocks prove flow, not pixels. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Board, BoardContactPhase, BoardContactType, BoardPlayerType, type BoardContact } from '@board.fun/web-sdk';
import type { Round } from '../src/round';
import type { TrackedPiece } from '../src/tracking';

type Snapshot = { mode: string; round: Round | null; swing: string;
  seats: { id: string; glyphId: number | null; present: boolean }[]; pieces: TrackedPiece[] };
const g = globalThis as unknown as Record<string, any>;
const canvasListeners = new Map<string, ((event: any) => void)[]>();
let drawnText: string[] = [];
const context = () => new Proxy({} as Record<string, any>, {
  get(state, key) {
    if (key === 'canvas') return { width: 1920, height: 1080 };
    if (key in state) return state[key as string];
    return (...args: any[]) => {
      if (key === 'fillText') drawnText.push(String(args[0]));
      if (key === 'measureText') { const w = String(args[0]).length * 28; return { width: w,
        actualBoundingBoxAscent: 30, actualBoundingBoxDescent: 8, actualBoundingBoxLeft: 0, actualBoundingBoxRight: w }; }
      if (key === 'getTransform') return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
      return { addColorStop() {} };
    };
  }, set(state, key, value) { state[key as string] = value; return true; },
});
const canvas = () => ({ width: 1920, height: 1080, style: {}, getContext: context,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080 }),
  addEventListener(type: string, fn: (e: any) => void) { canvasListeners.set(type, [...(canvasListeners.get(type) ?? []), fn]); },
  removeEventListener() {},
});
let raf: ((now: number) => void) | null = null, now = 1000, menuAction: ((id: string) => void) | null = null;
let frameCount = 0, saves = 0, addRequests = 0;
const pauses: (() => void)[] = [], resumes: (() => void)[] = [], rosterChanges: (() => void)[] = [];
const restoreListeners: (() => void)[] = [];
let persisted: any;
const progress = new Map<string, unknown>();
g.document = { title: '', hidden: false, fonts: { add() {}, ready: Promise.resolve() },
  querySelector: canvas, createElement: canvas, addEventListener() {}, removeEventListener() {} };
g.window = { BoardSDK: { __sim: {} }, addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1 };
g.requestAnimationFrame = (fn: (now: number) => void) => { raf = fn; return 1; };
g.cancelAnimationFrame = () => { raf = null; };
Object.defineProperty(performance, 'now', { value: () => now, configurable: true });
g.FontFace = class { load() { return Promise.resolve(this); } };
g.Path2D = class { moveTo() {} lineTo() {} arc() {} closePath() {} rect() {} roundRect() {} bezierCurveTo() {} quadraticCurveTo() {} };
g.Image = class {
  onload: (() => void) | null = null; onerror: (() => void) | null = null;
  complete = true; width = 256; height = 256; naturalWidth = 256; naturalHeight = 256;
  set src(_value: string) { queueMicrotask(() => this.onload?.()); }
  decode() { return Promise.resolve(); }
};
const parameter = () => ({ value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
const audioNode = () => ({ connect() {}, disconnect() {}, start() {}, stop() {}, gain: parameter(), frequency: parameter(), detune: parameter(), Q: parameter() });
g.AudioContext = class {
  state = 'running'; currentTime = 0; sampleRate = 48000; destination = {};
  createGain = audioNode; createOscillator = audioNode; createBiquadFilter = audioNode; createBufferSource = audioNode;
  createBuffer(_channels: number, length: number, sampleRate: number) { return { length, sampleRate, getChannelData: () => new Float32Array(length) }; }
  addEventListener() {} resume() { return Promise.resolve(); } suspend() { return Promise.resolve(); }
};
g.fetch = async (url: string) => {
  try { const b = readFileSync(`public/${String(url).replace(/^\.?\//, '').split('?')[0]}`);
    return { ok: true, json: async () => JSON.parse(b.toString()), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
  } catch { return { ok: false, status: 404 }; }
};
g.BoardPlatform = {
  game: { name: 'Twist Putt', appId: 'test.twist-putt' },
  state: { ready: async () => ({ restored: false }), save: (value: unknown) => { saves++; persisted = JSON.parse(JSON.stringify(value)); }, load: () => persisted,
    onRestore: (fn: () => void) => { restoreListeners.push(fn); return () => {}; }, clear() {}, flush: async () => true,
    progress: { get: (key: string, fallback: unknown) => progress.get(key) ?? fallback, set: (key: string, value: unknown) => progress.set(key, value) } },
  menu: { setButtons() {}, onButton: (fn: (id: string) => void) => { menuAction = fn; return () => {}; } },
  audio: { bindBuses() {}, levels: () => ({ music: 70, sfx: 90, muted: false }), onChange: () => () => {} },
};
let onBatch: ((batch: readonly BoardContact[]) => void) | null = null;
const patch = (target: unknown, changes: Record<string, unknown>) => Object.assign(target as object, changes);
patch(Board.input, { subscribe: (fn: typeof onBatch) => { onBatch = fn; }, unsubscribe() {} });
patch(Board.application, { onPause: (fn: () => void) => { pauses.push(fn); return () => {}; }, onResume: (fn: () => void) => { resumes.push(fn); return () => {}; } });
const players = [{ playerId: 'profile-1', sessionId: 1, name: 'One', avatarId: '0', type: BoardPlayerType.Profile }];
let selectedPlayer: typeof players[number] | null = null;
patch(Board.session, {
  areServicesReady: () => true, isReady: () => true, getPlayers: () => players, getPlayerCount: () => players.length,
  getActiveProfile: () => ({ ...players[0], sessionId: -1 }),
  onPlayersChanged: (fn: () => void) => { rosterChanges.push(fn); return () => {}; }, onActiveProfileChanged: () => () => {},
  presentAddPlayer: async () => {
    addRequests++;
    const id = players.length + 1;
    players.push(selectedPlayer ?? { playerId: `profile-${id}`, sessionId: id, name: `Player ${id}`, avatarId: '0', type: BoardPlayerType.Profile });
    selectedPlayer = null;
    rosterChanges.forEach(fn => fn()); return true;
  }, presentReplacePlayer: async () => false, setAIPlayerTypes: () => { throw new Error('Human putting must not register AI'); },
});

function frames(count = 1): void {
  for (let i = 0; i < count; i++) {
    now += 1000 / 60; const fn = raf; raf = null;
    if (fn) { drawnText = []; fn(now); frameCount++; }
  }
}
const snapshot = (): Snapshot => g.window.__twistPuttSnapshot;
let nextContact = 100;
function emit(contactId: number, glyphId: number, x: number, y: number, orientation: number,
  phase = BoardContactPhase.Moved): void {
  onBatch!([{ contactId, glyphId, x, y, orientation, phase, type: BoardContactType.Glyph, isTouched: true } as BoardContact]);
}
function button(box: { x: number; y: number; width: number; height: number }): void {
  const id = nextContact++;
  onBatch!([{ contactId: id, glyphId: 0, x: box.x + box.width / 2, y: box.y + box.height / 2,
    orientation: 0, phase: BoardContactPhase.Began, type: BoardContactType.Finger, isTouched: true } as BoardContact]);
  frames();
  onBatch!([{ contactId: id, glyphId: 0, x: 0, y: 0, orientation: 0,
    phase: BoardContactPhase.Ended, type: BoardContactType.Finger, isTouched: false } as BoardContact]);
}
function until(predicate: (state: Snapshot) => boolean, limit = 1800): Snapshot {
  for (let i = 0; i < limit; i++) { const s = snapshot(); if (predicate(s)) return s; frames(); }
  assert.fail(`Flow did not advance: ${JSON.stringify(snapshot())}`);
}
function stroke(owner?: number): void {
  const s = snapshot(), round = s.round!;
  assert.equal(round.phase, 'aim');
  const player = round.players[round.turnIndex], who = owner ?? Number(player.id);
  const piece = s.pieces.find(p => p.owner === who && p.present)!;
  assert.ok(piece, `No tracked piece for player ${who}`);
  const x = player.ball.x, y = player.ball.y + 160;
  emit(piece.contactId, piece.glyphId, x, y, 240); frames(14);
  for (let angle = 246; angle <= 306; angle += 6) {
    emit(piece.contactId, piece.glyphId, x, y, angle); frames();
    if (snapshot().round!.phase !== 'aim') break;
  }
}

test('real application supports setup, rotational strokes, ownership, recovery, help, all nine holes and rematch', async () => {
  await import('../src/main');
  for (let i = 0; i < 40 && !raf; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(raf, 'The app never requested a frame');
  const { BUTTONS } = await import('../src/render');
  frames(5); assert.equal(snapshot().mode, 'title'); assert.ok(drawnText.length > 0);
  emit(1, 1, 480, 930, 270, BoardContactPhase.Began); frames();
  assert.equal(snapshot().mode, 'setup'); assert.equal(snapshot().seats[0].glyphId, 1);
  button(BUTTONS.addPlayer);
  for (let i = 0; i < 6; i++) await Promise.resolve();
  frames(2); assert.equal(addRequests, 1); assert.equal(snapshot().seats.length, 2);
  emit(2, 2, 1000, 150, 90, BoardContactPhase.Began); frames(2);
  assert.ok(snapshot().seats.every(s => s.present));
  button(BUTTONS.start); frames();
  assert.equal(snapshot().mode, 'play'); assert.equal(snapshot().round!.players.length, 2);
  const initial = snapshot().round!.players[0].ball;
  stroke();
  let s = snapshot(); assert.equal(s.round!.phase, 'roll'); assert.equal(s.round!.players[0].scores[0], 1);
  frames(8); s = snapshot(); assert.ok(Math.hypot(s.round!.players[0].ball.x - initial.x, s.round!.players[0].ball.y - initial.y) > 5);
  menuAction!('help'); frames();
  const rollingSave = JSON.stringify(snapshot().round);
  assert.equal(JSON.stringify(persisted.round), rollingSave);
  frames(90); assert.equal(JSON.stringify(snapshot().round), rollingSave, 'Help changed a rolling ball or obstacle clock');
  button(BUTTONS.back); assert.equal(snapshot().round!.phase, 'roll', 'Closing help lost the ball in motion');
  until(s => s.round!.phase === 'aim');
  assert.equal(snapshot().round!.turnIndex, 1);
  const beforeWrong = JSON.stringify(snapshot().round!.players.map(p => p.scores));
  stroke(1);
  assert.equal(JSON.stringify(snapshot().round!.players.map(p => p.scores)), beforeWrong, 'An inactive player made a stroke');

  // A real lift and a far return use a new identity, but the game's glyph binding keeps ownership.
  emit(2, 2, 1000, 150, 90, BoardContactPhase.Ended); frames(70);
  const activeBall = snapshot().round!.players[1].ball;
  emit(20, 2, activeBall.x, activeBall.y + 160, 240, BoardContactPhase.Began); frames(14);
  assert.equal(snapshot().pieces.find(p => p.contactId === 20)!.owner, 2);
  stroke(); until(s => s.round!.phase === 'aim');
  assert.equal(snapshot().round!.turnIndex, 0);

  const beforePause = JSON.stringify(snapshot().round), oldPieces = snapshot().pieces.filter(p => p.present);
  pauses.forEach(fn => fn()); const pausedFrames = frameCount; frames(120);
  assert.ok(frameCount <= pausedFrames + 1, 'Pause kept rendering');
  resumes.forEach(fn => fn());
  oldPieces.forEach((p, i) => emit(40 + i, p.glyphId, p.x, p.y, p.orientation + 80, BoardContactPhase.Began));
  frames(20);
  assert.equal(snapshot().round!.phase, 'aim');
  assert.deepEqual(snapshot().round!.players.map(p => p.scores), JSON.parse(beforePause).players.map((p: any) => p.scores));
  assert.ok(snapshot().seats.every(s => s.present));

  menuAction!('help'); frames(); assert.equal(snapshot().mode, 'help');
  const helpRound = JSON.stringify(snapshot().round); frames(120);
  assert.equal(JSON.stringify(snapshot().round), helpRound, 'Help advanced or reset the current round');
  assert.equal(JSON.stringify(persisted.round), helpRound, 'Opening help did not save the exact round');
  button(BUTTONS.back); assert.equal(snapshot().mode, 'play');

  // The platform restores a round before all of its people have joined the session.
  // Re-select the same profile with a new session ID and continue through the actual UI.
  menuAction!('setup'); frames(); button(BUTTONS.back);
  players.splice(1);
  // This profile receives the missing player's old session ID. A session-only fallback
  // would wrongly map both saved players to this one profile instead of requesting B.
  players[0].sessionId = 2;
  rosterChanges.forEach(fn => fn()); restoreListeners.forEach(fn => fn());
  button(BUTTONS.continue); assert.equal(snapshot().mode, 'setup', 'A missing saved player should lead to setup');
  selectedPlayer = { playerId: 'profile-2', sessionId: 20, name: 'Two restored', avatarId: '0', type: BoardPlayerType.Profile };
  button(BUTTONS.addPlayer); for (let i = 0; i < 6; i++) await Promise.resolve(); frames();
  button(BUTTONS.back); button(BUTTONS.continue); frames();
  assert.equal(snapshot().mode, 'play');
  assert.deepEqual(snapshot().round!.players.map(p => p.id), ['2', '20']);
  assert.deepEqual(snapshot().round!.players.map(p => p.scores), JSON.parse(helpRound).players.map((p: any) => p.scores));
  assert.equal(snapshot().pieces.find(p => p.present && p.glyphId === 2)!.owner, 20);

  // Finish using normal strokes. The seven-stroke pickup guarantees progress on every obstacle.
  const visited = new Set<number>();
  for (let attempts = 0; attempts < 130 && snapshot().mode !== 'over'; attempts++) {
    s = until(state => state.mode === 'over' || state.round!.phase === 'aim');
    if (s.mode === 'over') break;
    visited.add(s.round!.holeIndex);
    const scores = JSON.stringify(s.round!.players.map(p => p.scores));
    stroke();
    assert.notEqual(JSON.stringify(snapshot().round!.players.map(p => p.scores)), scores, 'A legal simulated twist failed to record a stroke');
    until(state => state.mode === 'over' || state.round!.phase !== 'roll');
  }
  s = snapshot(); assert.equal(s.mode, 'over'); assert.equal(s.round!.holeIndex, 8);
  assert.equal(visited.size, 9); assert.ok(s.round!.players.every(p => p.finished));
  assert.ok(s.round!.players.every(p => p.scores.every(score => score > 0 && score <= 7)));
  const results = JSON.stringify(s.round); frames(300);
  assert.equal(snapshot().mode, 'over'); assert.equal(JSON.stringify(snapshot().round), results, 'Results restarted without a shared choice');
  button(BUTTONS.rematch); frames();
  s = snapshot(); assert.equal(s.mode, 'play'); assert.equal(s.round!.holeIndex, 0);
  assert.equal(s.seats.length, 2); assert.ok(s.seats.every(p => p.present));
  assert.ok(s.round!.players.every(p => p.scores.every(score => score === 0)));
  assert.ok(saves > 20, 'The real flow did not save its progress');

  // Change setup releases the old seats. Lift before entering it, then place at the
  // intended edges so incidental final-hole positions do not choose the new seats.
  const existing = snapshot().pieces.filter(p => p.present);
  existing.forEach(p => emit(p.contactId, p.glyphId, p.x, p.y, p.orientation, BoardContactPhase.Ended));
  frames(14);
  menuAction!('setup'); frames();
  for (let i = 0; i < 2; i++) { button(BUTTONS.addPlayer); for (let j = 0; j < 6; j++) await Promise.resolve(); frames(); }
  emit(60, 1, 480, 930, 270, BoardContactPhase.Began); frames();
  emit(61, 2, 1000, 150, 90, BoardContactPhase.Began); frames();
  emit(70, 1, 140, 540, 0, BoardContactPhase.Began); frames();
  emit(71, 4, 1780, 540, 180, BoardContactPhase.Began); frames();
  assert.equal(snapshot().seats.length, 4); assert.ok(snapshot().seats.every(p => p.present), JSON.stringify(snapshot()));
  const requests = addRequests; button(BUTTONS.addPlayer); await Promise.resolve(); assert.equal(addRequests, requests);
  button(BUTTONS.start); frames();
  assert.equal(snapshot().mode, 'play'); assert.equal(snapshot().round!.players.length, 4);

  // Two identical glyphs lifted together cannot be assigned from a distant return.
  // Each person's original table edge resolves that ambiguity without a stroke.
  const duplicateOwners = snapshot().pieces.filter(p => p.present && p.glyphId === 1);
  assert.equal(duplicateOwners.length, 2);
  duplicateOwners.forEach(p => emit(p.contactId, p.glyphId, p.x, p.y, p.orientation, BoardContactPhase.Ended));
  frames(70);
  emit(80, 1, 900, 540, 240, BoardContactPhase.Began);
  emit(81, 1, 1100, 540, 240, BoardContactPhase.Began); frames(14);
  assert.ok(snapshot().pieces.filter(p => p.present && p.glyphId === 1).every(p => p.owner === null), 'Ambiguous pieces inherited arbitrary owners');
  emit(80, 1, 140, 540, 0); frames();
  emit(81, 1, 480, 930, 270); frames(14);
  const recoveredDuplicates = snapshot().pieces.filter(p => p.present && p.glyphId === 1);
  assert.equal(recoveredDuplicates.find(p => p.contactId === 80)!.owner, 3);
  assert.equal(recoveredDuplicates.find(p => p.contactId === 81)!.owner, 2);
  assert.ok(snapshot().seats.every(p => p.present));
  assert.ok(snapshot().round!.players.every(p => p.scores.every(score => score === 0)), 'Returning identical pieces caused a putt');

  menuAction!('setup'); frames(); button(BUTTONS.back);
  const validSave = JSON.parse(JSON.stringify(persisted));
  const malformedSeatLists = [
    [null],
    [{ ...validSave.seats[0], playerId: undefined }, ...validSave.seats.slice(1)],
    [{ ...validSave.seats[0], edge: 'diagonal' }, ...validSave.seats.slice(1)],
    [{ ...validSave.seats[0], glyphId: 99 }, ...validSave.seats.slice(1)],
    [validSave.seats[0], validSave.seats[0], ...validSave.seats.slice(2)],
  ];
  for (const badSeats of malformedSeatLists) {
    persisted = { ...validSave, seats: badSeats };
    assert.doesNotThrow(() => restoreListeners.forEach(fn => fn()), 'Malformed save crashed its restore notification');
    assert.doesNotThrow(() => button(BUTTONS.continue), 'Malformed save crashed Continue');
    const restored = snapshot();
    if (restored.mode === 'play') {
      assert.deepEqual(restored.round!.players.map(p => p.id), validSave.round.players.map((p: any) => p.id));
      assert.deepEqual(restored.seats.map(p => [p.id, p.glyphId]), validSave.seats.map((p: any) => [p.id, p.glyphId]),
        'A malformed save replaced the last accepted player bindings');
      menuAction!('setup'); frames(); button(BUTTONS.back);
    }
  }

  // The platform can deliver a mid-roll save while a returning profile receives
  // a new session ID. The water-reset opponent must stay excluded for this shot.
  const rollingRestore = JSON.parse(JSON.stringify(validSave));
  rollingRestore.round.phase = 'roll';
  rollingRestore.round.players[0].scores[0] = 1;
  rollingRestore.round.players[0].ball.state = 'moving';
  rollingRestore.round.players[0].ball.vx = 300;
  rollingRestore.round.players[1].scores[0] = 2;
  rollingRestore.round.settledForShot = ['20'];
  const returningProfile = players.find(p => p.playerId === 'profile-2')!;
  returningProfile.sessionId = 200;
  rosterChanges.forEach(fn => fn());
  persisted = rollingRestore;
  restoreListeners.forEach(fn => fn());
  button(BUTTONS.continue);
  const restoredRolling = snapshot().round!;
  assert.equal(snapshot().mode, 'play');
  assert.equal(restoredRolling.phase, 'roll', 'Continue ended a shot that was still moving');
  assert.equal(restoredRolling.players[1].id, '200');
  assert.deepEqual(restoredRolling.settledForShot, ['200'], 'Water-reset exclusion kept the obsolete session ID');
  assert.equal(restoredRolling.players[1].ball.state, 'ready');
  assert.equal(restoredRolling.players[1].scores[0], 2, 'Continue added a second water penalty');
});
