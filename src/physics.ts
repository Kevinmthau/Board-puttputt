import { gateIsOpen, pointInBridge, pointInPolygon, pointInRect, type Hole, type Point, type Segment } from './course';

export const BALL_RADIUS = 14;
export const FIXED_STEP = 1 / 120;
export interface Ball extends Point {
  vx: number; vy: number; r: number; state: 'ready' | 'moving' | 'sunk';
  lastSafe: Point; restTime: number; tunnelCooldown: number;
}
export interface PhysicsEvent {
  type: 'bounce' | 'water' | 'tunnel' | 'sink' | 'rest';
  x: number; y: number; strength?: number;
}

export function createBall(point: Point): Ball {
  return { ...point, vx: 0, vy: 0, r: BALL_RADIUS, state: 'ready', lastSafe: { ...point }, restTime: 0, tunnelCooldown: 0 };
}

export function strikeBall(ball: Ball, velocity: Point): boolean {
  if (ball.state !== 'ready' || !Number.isFinite(velocity.x) || !Number.isFinite(velocity.y)) return false;
  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed < 1) return false;
  const scale = Math.min(1500 / speed, 1);
  ball.lastSafe = { x: ball.x, y: ball.y };
  ball.vx = velocity.x * scale; ball.vy = velocity.y * scale;
  ball.state = 'moving'; ball.restTime = 0;
  return true;
}

export function isWater(point: Point, hole: Hole, ballRadius = BALL_RADIUS): boolean {
  return hole.water.some(r => pointInRect(point, r)) && !hole.bridges.some(bridge => pointInBridge(point, bridge, ballRadius));
}

function rebound(ball: Ball, nx: number, ny: number, penetration: number): number {
  ball.x += nx * (penetration + 0.05); ball.y += ny * (penetration + 0.05);
  const toward = ball.vx * nx + ball.vy * ny;
  if (toward >= 0) return 0;
  ball.vx -= 1.78 * toward * nx; ball.vy -= 1.78 * toward * ny;
  return -toward;
}

function collideSegment(ball: Ball, wall: Segment): number {
  const dx = wall.b.x - wall.a.x, dy = wall.b.y - wall.a.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((ball.x - wall.a.x) * dx + (ball.y - wall.a.y) * dy) / length2)) : 0;
  const nx = ball.x - (wall.a.x + t * dx), ny = ball.y - (wall.a.y + t * dy);
  const distance = Math.hypot(nx, ny);
  if (distance >= ball.r) return 0;
  if (distance > 0.0001) return rebound(ball, nx / distance, ny / distance, ball.r - distance);
  const speed = Math.hypot(ball.vx, ball.vy) || 1;
  return rebound(ball, -ball.vx / speed, -ball.vy / speed, ball.r);
}

function returnSafe(ball: Ball): void {
  ball.x = ball.lastSafe.x; ball.y = ball.lastSafe.y;
  ball.vx = 0; ball.vy = 0; ball.state = 'ready'; ball.restTime = 0;
}

/** The caller normally supplies 1/120 s. Adaptive spatial steps prevent thin-wall tunneling. */
export function stepBall(ball: Ball, hole: Hole, dt: number, time: number): PhysicsEvent[] {
  if (ball.state !== 'moving' || dt <= 0 || !Number.isFinite(dt)) return [];
  const events: PhysicsEvent[] = [];
  const duration = Math.min(dt, 0.1);
  const count = Math.max(1, Math.ceil(duration / FIXED_STEP), Math.ceil(Math.hypot(ball.vx, ball.vy) * duration / 6));
  const step = duration / count;
  let hardestBounce = 0;
  for (let i = 0; i < count && ball.state === 'moving'; i++) {
    ball.tunnelCooldown = Math.max(0, ball.tunnelCooldown - step);
    for (const slope of hole.slopes) if (pointInRect(ball, slope)) {
      ball.vx += slope.ax * step; ball.vy += slope.ay * step;
    }
    ball.x += ball.vx * step; ball.y += ball.vy * step;
    for (let pass = 0; pass < 2; pass++) {
      for (const wall of hole.walls) hardestBounce = Math.max(hardestBounce, collideSegment(ball, wall));
      for (const gate of hole.gates) if (!gateIsOpen(gate, time + i * step)) hardestBounce = Math.max(hardestBounce, collideSegment(ball, gate));
      for (const bumper of hole.bumpers) {
        const dx = ball.x - bumper.x, dy = ball.y - bumper.y, distance = Math.hypot(dx, dy);
        if (distance < ball.r + bumper.r) {
          const speed = Math.hypot(ball.vx, ball.vy) || 1;
          hardestBounce = Math.max(hardestBounce, rebound(ball, distance ? dx / distance : -ball.vx / speed, distance ? dy / distance : -ball.vy / speed, ball.r + bumper.r - distance));
        }
      }
    }
    if (ball.tunnelCooldown === 0) {
      const tunnel = hole.tunnels.find(t => Math.hypot(ball.x - t.entry.x, ball.y - t.entry.y) < t.entry.r);
      if (tunnel) {
        const speed = Math.hypot(ball.vx, ball.vy) * tunnel.speedScale;
        const length = Math.hypot(tunnel.direction.x, tunnel.direction.y) || 1;
        ball.x = tunnel.exit.x; ball.y = tunnel.exit.y;
        ball.vx = tunnel.direction.x / length * speed; ball.vy = tunnel.direction.y / length * speed;
        ball.tunnelCooldown = 0.6;
        events.push({ type: 'tunnel', x: ball.x, y: ball.y });
      }
    }
    if (isWater(ball, hole) || !pointInPolygon(ball, hole.outline)) {
      events.push({ type: 'water', x: ball.x, y: ball.y });
      returnSafe(ball); break;
    }
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed <= 300 && Math.hypot(ball.x - hole.cup.x, ball.y - hole.cup.y) <= hole.cup.r - ball.r * 0.45) {
      ball.x = hole.cup.x; ball.y = hole.cup.y; ball.vx = 0; ball.vy = 0; ball.state = 'sunk';
      events.push({ type: 'sink', x: ball.x, y: ball.y }); break;
    }
    const drag = hole.sand.some(r => pointInRect(ball, r)) ? 980 : 320;
    const nextSpeed = Math.max(0, speed - drag * step);
    ball.vx = speed ? ball.vx * nextSpeed / speed : 0;
    ball.vy = speed ? ball.vy * nextSpeed / speed : 0;
    ball.restTime = nextSpeed < 14 ? ball.restTime + step : 0;
    if (ball.restTime >= 0.12) {
      ball.vx = 0; ball.vy = 0; ball.state = 'ready';
      events.push({ type: 'rest', x: ball.x, y: ball.y });
    }
  }
  if (hardestBounce > 25) events.push({ type: 'bounce', x: ball.x, y: ball.y, strength: hardestBounce });
  return events;
}
