/** Always-active putting line: rotation through or while touching the ball hits sideways.
 * Placement and translation alone do not strike. There is no stance or arming step. */
export interface Point { x: number; y: number }
export interface SwingPose extends Point { facingDeg: number; frontReach: number }
export interface SwingHit {
  vx: number; vy: number; speed: number; angularSpeed: number; contactAngleDeg: number;
}
export type SwingStatus = 'missing' | 'place' | 'settling' | 'clear' | 'ready' | 'swing' | 'spent';
export const SWING = {
  clubLength: 240, clubWidth: 6, ballRadius: 14, rotationNoiseDeg: 1,
  maximumGapMs: 100, speedWindowMs: 60,
  minimumAngularSpeed: 30, maximumAngularSpeed: 540, minimumBallSpeed: 180, maximumBallSpeed: 1500,
} as const;
const norm = (a: number) => ((a % 360) + 360) % 360;
export const shortAngleDelta = (a: number, b: number) => ((a - b + 540) % 360 + 360) % 360 - 180;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const finite = (p: SwingPose) => [p.x, p.y, p.facingDeg, p.frontReach].every(Number.isFinite)
  && p.frontReach >= 0 && p.frontReach < SWING.clubLength;
export function ballSpeedForTwist(degreesPerSecond: number): number {
  const t = Math.min(1, Math.max(0, (Math.abs(degreesPerSecond) - SWING.minimumAngularSpeed)
    / (SWING.maximumAngularSpeed - SWING.minimumAngularSpeed)));
  return SWING.minimumBallSpeed + t * (SWING.maximumBallSpeed - SWING.minimumBallSpeed);
}

/** Distance to the visible finite club, including its real forehead start. */
export function clubDistance(pose: SwingPose, ball: Point): number {
  const a = pose.facingDeg * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a);
  const bx = ball.x - pose.x, by = ball.y - pose.y;
  const along = Math.min(SWING.clubLength, Math.max(pose.frontReach, bx * dx + by * dy));
  return Math.hypot(bx - along * dx, by - along * dy);
}

/** Earliest capsule contact across the short rotation arc. Substeps are at most 2 degrees;
 * at the maximum club radius their spacing is <9 px, smaller than the ball diameter.
 * Bisection then resolves the first contact, including small valid center drift. */
export function sweptClubContact(previous: SwingPose, current: SwingPose, ball: Point): number | null {
  const delta = shortAngleDelta(current.facingDeg, previous.facingDeg);
  if (!finite(previous) || !finite(current) || Math.abs(delta) < 1e-8) return null;
  const radius = SWING.ballRadius + SWING.clubWidth / 2;
  const at = (t: number): SwingPose => ({
    x: previous.x + (current.x - previous.x) * t,
    y: previous.y + (current.y - previous.y) * t,
    facingDeg: previous.facingDeg + delta * t,
    frontReach: previous.frontReach + (current.frontReach - previous.frontReach) * t,
  });
  // The user explicitly wants the line active at all times: turning an already
  // touching club also puts, without first turning clear and re-arming it.
  if (clubDistance(previous, ball) <= radius) return norm(previous.facingDeg);
  const steps = Math.max(1, Math.ceil(Math.abs(delta) / 2), Math.ceil(distance(previous, current) / 4));
  for (let i = 1; i <= steps; i++) {
    if (clubDistance(at(i / steps), ball) > radius) continue;
    let lo = (i - 1) / steps, hi = i / steps;
    for (let j = 0; j < 14; j++) {
      const mid = (lo + hi) / 2;
      if (clubDistance(at(mid), ball) <= radius) hi = mid; else lo = mid;
    }
    return norm(previous.facingDeg + delta * hi);
  }
  return null;
}

type Sample = { t: number; angle: number };
export class SwingController {
  status: SwingStatus = 'missing';
  /** Signed measured speed; clockwise is positive in the screen's Y-down coordinates. */
  angularSpeed = 0;
  private previous: SwingPose | null = null;
  private previousTime = 0;
  private target: Point | null = null;
  private unwrapped = 0;
  private motionAngle = 0;
  private motionTime = 0;
  private spent = false;
  private samples: Sample[] = [];

  /** Reset on a new shot/turn, tracking epoch, pause, or rebind. Placement never fires. */
  reset(): void {
    this.previous = this.target = null;
    this.samples = []; this.spent = false;
    this.angularSpeed = 0; this.status = 'missing';
  }

  private seed(pose: SwingPose, ball: Point, now: number): void {
    this.previous = { ...pose }; this.previousTime = now;
    this.target = { ...ball };
    this.unwrapped = this.motionAngle = pose.facingDeg; this.motionTime = now;
    this.samples = [{ t: now, angle: this.unwrapped }];
    this.angularSpeed = 0; this.status = 'ready';
  }

  update(pose: SwingPose | null, ball: Point, now: number, enabled = true): SwingHit | null {
    if (!pose || !finite(pose) || !Number.isFinite(now) || !Number.isFinite(ball.x) || !Number.isFinite(ball.y)) {
      this.reset(); return null;
    }
    if (!enabled) { this.reset(); return null; }
    if (this.spent) { this.status = 'spent'; return null; }
    if (!this.previous || !this.target) { this.seed(pose, ball, now); return null; }
    const previous = this.previous, dt = now - this.previousTime;
    if (dt <= 0) return null;
    if (dt > SWING.maximumGapMs || distance(this.target, ball) > 1) {
      this.seed(pose, ball, now); return null;
    }
    const delta = shortAngleDelta(pose.facingDeg, previous.facingDeg);
    this.previous = { ...pose }; this.previousTime = now;
    this.unwrapped += delta;
    this.samples.push({ t: now, angle: this.unwrapped });
    // Keep one sample preceding the window so a sparse but valid stream still has a baseline.
    while (this.samples.length > 2 && this.samples[1].t < now - SWING.speedWindowMs) this.samples.shift();
    const meanT = this.samples.reduce((n, s) => n + s.t, 0) / this.samples.length;
    const meanA = this.samples.reduce((n, s) => n + s.angle, 0) / this.samples.length;
    let numerator = 0, denominator = 0;
    for (const s of this.samples) { numerator += (s.t - meanT) * (s.angle - meanA); denominator += (s.t - meanT) ** 2; }
    this.angularSpeed = denominator > 0 ? numerator / denominator * 1000 : 0;
    this.status = 'ready';
    const turn = this.unwrapped - this.motionAngle;
    // Accumulate subdegree samples so even a very slow twist works. This is only
    // a 1-degree noise tolerance, not the former 8-degree gesture/stance lock.
    // Larger sensor jitter is deliberately no longer guaranteed to be rejected.
    if (Math.abs(turn) < SWING.rotationNoiseDeg) return null;
    const direction = Math.sign(turn), from = { ...previous, facingDeg: norm(this.motionAngle) };
    const directSpeed = Math.abs(turn) / Math.max(1, now - this.motionTime) * 1000;
    this.motionAngle = this.unwrapped; this.motionTime = now;
    const contactAngle = sweptClubContact(from, pose, ball);
    if (contactAngle === null) return null;
    // A reversal is live immediately; the averaging window must not veto it while
    // it still contains the opposite part of the swing. Gentle turns use min power.
    const measured = this.angularSpeed * direction > 0 ? Math.abs(this.angularSpeed) : directSpeed;
    this.angularSpeed = direction * measured;
    const speed = ballSpeedForTwist(measured), rad = contactAngle * Math.PI / 180;
    this.spent = true; this.status = 'spent';
    return { vx: -Math.sin(rad) * direction * speed, vy: Math.cos(rad) * direction * speed,
      speed, angularSpeed: this.angularSpeed, contactAngleDeg: contactAngle };
  }
}
