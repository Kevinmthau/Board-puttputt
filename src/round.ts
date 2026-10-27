import { HOLES, type Point } from './course';
import { createBall, FIXED_STEP, stepBall, strikeBall, type Ball, type PhysicsEvent } from './physics';

export const STROKE_CAP = 7;
export interface RoundPlayer {
  id: string; ball: Ball; scores: number[]; pickedUp: boolean[]; finished: boolean;
}
export interface Round {
  version: 1; players: RoundPlayer[]; holeIndex: number; turnIndex: number;
  phase: 'aim' | 'roll' | 'hole-complete' | 'complete'; time: number; accumulator: number;
}
export interface RoundEvent {
  type: PhysicsEvent['type'] | 'turn' | 'hole-complete' | 'complete';
  x: number; y: number; playerId?: string; strength?: number;
}

export const activePlayer = (round: Round) => round.players[round.turnIndex];
export const currentHole = (round: Round) => HOLES[round.holeIndex];
export const totals = (round: Round) => round.players.map(p => ({ id: p.id, total: p.scores.reduce((a, b) => a + b, 0) }));
export const winners = (round: Round): string[] => {
  const scores = totals(round), low = Math.min(...scores.map(p => p.total));
  return scores.filter(p => p.total === low).map(p => p.id);
};

export function createRound(playerIds: string[]): Round {
  if (playerIds.length < 1 || playerIds.length > 4 || new Set(playerIds).size !== playerIds.length) throw new Error('Choose one to four different players.');
  return {
    version: 1, holeIndex: 0, turnIndex: 0, phase: 'aim', time: 0, accumulator: 0,
    players: playerIds.map(id => ({ id, ball: createBall(HOLES[0].tee), scores: Array(HOLES.length).fill(0), pickedUp: Array(HOLES.length).fill(false), finished: false })),
  };
}

export function strike(round: Round, velocity: Point): boolean {
  const player = activePlayer(round);
  if (round.phase !== 'aim' || player.finished || !strikeBall(player.ball, velocity)) return false;
  player.scores[round.holeIndex]++;
  round.phase = 'roll';
  return true;
}

function endTurn(round: Round, events: RoundEvent[]): void {
  const player = activePlayer(round);
  if (player.ball.state === 'sunk') player.finished = true;
  if (player.scores[round.holeIndex] >= STROKE_CAP) {
    player.finished = true;
    player.pickedUp[round.holeIndex] = player.ball.state !== 'sunk';
  }
  if (round.players.every(p => p.finished)) {
    round.phase = round.holeIndex === HOLES.length - 1 ? 'complete' : 'hole-complete';
    events.push({ type: round.phase, x: player.ball.x, y: player.ball.y });
    return;
  }
  do { round.turnIndex = (round.turnIndex + 1) % round.players.length; } while (activePlayer(round).finished);
  round.phase = 'aim';
  const next = activePlayer(round);
  events.push({ type: 'turn', x: next.ball.x, y: next.ball.y, playerId: next.id });
}

export function stepRound(round: Round, dt: number): RoundEvent[] {
  const events: RoundEvent[] = [];
  if (!Number.isFinite(dt) || dt <= 0 || round.phase === 'complete' || round.phase === 'hole-complete') return events;
  round.accumulator += Math.min(dt, 0.1);
  while (round.accumulator + 1e-10 >= FIXED_STEP) {
    round.accumulator -= FIXED_STEP; round.time += FIXED_STEP;
    if (round.phase !== 'roll') continue;
    const player = activePlayer(round);
    const result = stepBall(player.ball, currentHole(round), FIXED_STEP, round.time);
    for (const event of result) {
      events.push({ ...event, playerId: player.id });
      if (event.type === 'water') player.scores[round.holeIndex] = Math.min(STROKE_CAP, player.scores[round.holeIndex] + 1);
    }
    if (player.ball.state !== 'moving') endTurn(round, events);
  }
  return events;
}

export function advanceHole(round: Round): boolean {
  if (round.phase !== 'hole-complete' || round.holeIndex >= HOLES.length - 1) return false;
  round.holeIndex++; round.turnIndex = 0; round.phase = 'aim'; round.time = 0; round.accumulator = 0;
  for (const player of round.players) { player.ball = createBall(currentHole(round).tee); player.finished = false; }
  return true;
}

export function serializeRound(round: Round): string { return JSON.stringify(round); }
export function restoreRound(value: unknown): Round | null {
  try {
    const round = (typeof value === 'string' ? JSON.parse(value) : value) as Round;
    if (!round || round.version !== 1 || !Array.isArray(round.players) || round.players.length < 1 || round.players.length > 4) return null;
    if (!Number.isInteger(round.holeIndex) || round.holeIndex < 0 || round.holeIndex >= HOLES.length || !Number.isInteger(round.turnIndex) || round.turnIndex < 0 || round.turnIndex >= round.players.length) return null;
    if (!['aim', 'roll', 'hole-complete', 'complete'].includes(round.phase) || !Number.isFinite(round.time) || round.time < 0) return null;
    for (const p of round.players) {
      if (typeof p.id !== 'string' || !p.ball || !Number.isFinite(p.ball.x) || !Number.isFinite(p.ball.y) || !Number.isFinite(p.ball.vx) || !Number.isFinite(p.ball.vy)) return null;
      if (!['ready', 'moving', 'sunk'].includes(p.ball.state) || !p.ball.lastSafe || !Number.isFinite(p.ball.lastSafe.x) || !Number.isFinite(p.ball.lastSafe.y)) return null;
      if (p.ball.r !== 14 || !Number.isFinite(p.ball.restTime) || p.ball.restTime < 0 || !Number.isFinite(p.ball.tunnelCooldown) || p.ball.tunnelCooldown < 0 || typeof p.finished !== 'boolean') return null;
      if (!Array.isArray(p.scores) || p.scores.length !== HOLES.length || p.scores.some(n => !Number.isInteger(n) || n < 0 || n > STROKE_CAP)) return null;
      if (!Array.isArray(p.pickedUp) || p.pickedUp.length !== HOLES.length || p.pickedUp.some(value => typeof value !== 'boolean')) return null;
    }
    if (new Set(round.players.map(p => p.id)).size !== round.players.length) return null;
    const copy = JSON.parse(JSON.stringify(round)) as Round;
    copy.accumulator = 0;
    return copy;
  } catch { return null; }
}
