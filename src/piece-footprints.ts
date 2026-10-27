// Real piece outlines for SDK contacts. public/piece-footprints.json (written by the build) holds
// each glyph's outline in millimetres in the piece frame (origin = the piece's DXF origin, +Y up).
// The mm frame's front is +Y for an "up" set and −Y for a "down" set (Sports), so never read a
// piece's front from it: pieceFootprint() places the outline on screen from a contact's position
// and orientation and gives the real facing as facingDeg.
export type Vec = { x: number; y: number };
export interface PieceShape { label: string; name: string; sizeMm: [number, number]; radiusMm: number;
  areaMm2: number; outlineMm: [number, number][]; glyphOutlineMm: [number, number][] }
// modelFile: the one model the game ships and runs on (model.dla for a quantized set).
export interface PieceFootprints { schemaVersion: 1; frame: "piece-mm-v1"; set: string;
  orientation: "up" | "down"; facingOffsetDeg: number; modelFile: string;
  pieces: Record<string, PieceShape> }
export interface Footprint { // facingDeg: screen angle, 0 = right (+x), 90 = down (+y), clockwise; center and outline are already screen pixels (never infer the front from the mm frame: Sports' is −Y)
  glyphId: number; name: string; center: Vec; outline: Vec[];
  /** Where the piece looks, as a screen angle in degrees: 0 = right (+x), 90 = down (+y), clockwise on
   * the glass, so +90 is the piece's own right. Not "0 = up": snap it with facingStep() and rotate art
   * with facingRotation(), never Math.round(facingDeg / 90) into your own up-first table. */
  facingDeg: number;
  /** The same direction as facingDeg, as a unit vector in screen space (y down). */
  facing: Vec;
  radiusPx: number }

/** Screen pixels per millimetre of the glass. Confirmed on URR5X with real pieces, 2026-10-14 (all six sets). */
export const PX_PER_MM = 3.6;
/** Whether the piece's +X maps to screen-left. The piece frame is not mirrored: confirmed on URR5X
 * with real pieces, 2026-10-14 (all six sets), with no per-set facing corrections. */
export const MIRROR_X = false;

type Contact = { x: number; y: number; orientation: number };
type Options = { pxPerMm?: number; mirrorX?: boolean };

export async function loadPieceFootprints(url = "piece-footprints.json"): Promise<PieceFootprints | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    return data && data.schemaVersion === 1 ? (data as PieceFootprints) : null;
  } catch {
    return null;
  }
}

/** Piece-frame millimetre points to screen pixels. With θ = contact.orientation (the SDK front, in
 * degrees), piece +Y lands at screen angle θ + 180°: that is the physical front, facingDeg = θ +
 * facingOffsetDeg, for an "up" set (offset 180). A "down" set (offset 0) is drawn front at −Y, so its
 * front lands at θ. */
export function outlineToScreen(points: [number, number][], contact: Contact, opts: Options = {}): Vec[] {
  const scale = opts.pxPerMm ?? PX_PER_MM;
  const mirror = opts.mirrorX ?? MIRROR_X;
  const phi = ((contact.orientation - 90) * Math.PI) / 180;
  const cos = Math.cos(phi), sin = Math.sin(phi);
  return points.map(([px, py]) => {
    const u = mirror ? -px : px;
    return { x: contact.x + scale * (u * cos + py * sin), y: contact.y + scale * (u * sin - py * cos) };
  });
}

export function pieceFootprint(fp: PieceFootprints | null, contact: Contact & { glyphId: number },
  opts: Options = {}): Footprint | null {
  if (!fp || contact.glyphId < 1) return null;
  const shape = fp.pieces[String(contact.glyphId)];
  if (!shape) return null;
  const facingDeg = (((contact.orientation + fp.facingOffsetDeg) % 360) + 360) % 360;
  const rad = (facingDeg * Math.PI) / 180;
  return {
    glyphId: contact.glyphId, name: shape.name, center: { x: contact.x, y: contact.y },
    outline: outlineToScreen(shape.outlineMm, contact, opts),
    facingDeg, facing: { x: Math.cos(rad), y: Math.sin(rad) },
    radiusPx: shape.radiusMm * (opts.pxPerMm ?? PX_PER_MM),
  };
}

// ---- facing as a rotation, a grid step or a point ahead --------------------------------------
// Draw any directional art (a train, a car, a beam, an arrow) pointing UP in its own image, nose
// toward −y, and turn it only with facingRotation(), or with facingStep().rotation for a grid
// direction. Never hand-write ±π/2 or an index table. Nothing is drawn at, under or following the
// piece itself: directional art belongs to what it sends out or steers, or points away from it.

/** Which way art is drawn in its own image: "up" (the nose toward −y, the default), "right", "down"
 * or "left". Its nose angle as a screen angle (0 = right, 90 = down). */
const NOSE_DEG = { right: 0, down: 90, left: 180, up: 270 } as const;
export type ArtPoints = keyof typeof NOSE_DEG;

/** Radians for ctx.rotate() / sprite.rotation that turn art so its nose points along the piece's
 * facing. artPoints says which way the art is drawn in its image: "up" (the default; draw new art
 * this way), "right", "down" or "left". In [0, 2π). */
export function facingRotation(fp: Pick<Footprint, "facingDeg">, artPoints: ArtPoints = "up"): number {
  const deg = fp.facingDeg - NOSE_DEG[artPoints];
  return ((((deg % 360) + 360) % 360) * Math.PI) / 180;
}

/** The nearest of n evenly spaced directions to the piece's facing, counted clockwise from up: for
 * n = 4, index 0 up, 1 right, 2 down, 3 left; for n = 8, 0 up, 1 up-right, 2 right … 7 up-left.
 * x and y are that direction as a grid step in screen space (y down), each −1, 0 or 1 (a true
 * grid step for n = 4 or 8). rotation (radians, index · 2π/n) turns up-drawn art onto that step.
 * Pass the footprint, not its facing vector. */
export function facingStep(fp: Pick<Footprint, "facingDeg">, n = 4): { x: number; y: number; index: number; rotation: number } {
  const index = ((Math.round((fp.facingDeg + 90) / (360 / n)) % n) + n) % n;
  const rad = ((index * 360) / n - 90) * (Math.PI / 180);
  return { x: Math.round(Math.cos(rad)) + 0, y: Math.round(Math.sin(rad)) + 0, index, rotation: (index * 2 * Math.PI) / n };
}

/** The screen point where a ray from the piece's centre along facingDeg leaves its outline, moved
 * gapPx further out: start a beam or shot here, or place art just beyond it, so nothing is drawn on
 * the piece. */
export function frontPoint(fp: Pick<Footprint, "center" | "outline" | "facingDeg">, gapPx = 0): Vec {
  const rad = (fp.facingDeg * Math.PI) / 180, dx = Math.cos(rad), dy = Math.sin(rad);
  const { x: cx, y: cy } = fp.center, pts = fp.outline;
  let reach = -Infinity;
  for (let i = 0; i < pts.length; i++) { // the farthest crossing of the ray with an outline edge
    const a = pts[i], b = pts[(i + 1) % pts.length], ex = b.x - a.x, ey = b.y - a.y;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const qx = a.x - cx, qy = a.y - cy, t = (qx * ey - qy * ex) / den, u = (qx * dy - qy * dx) / den;
    if (t >= 0 && u >= 0 && u <= 1) reach = Math.max(reach, t);
  }
  if (!Number.isFinite(reach)) { // the centre is off the outline: its farthest extent that way
    for (const p of pts) reach = Math.max(reach, (p.x - cx) * dx + (p.y - cy) * dy);
  }
  const d = (Number.isFinite(reach) ? Math.max(0, reach) : 0) + gapPx;
  return { x: cx + d * dx, y: cy + d * dy };
}

// ---- glows that hug a piece's real base ------------------------------------------------------
// For any glow, ring, halo or highlight around a piece's base, call
//   drawOutlineGlow(ctx, pieceFootprint(footprints, contact), { color: "#3cf" });
// never a circle or radius ring standing in for the base. By default nothing is drawn around or
// under a moving piece: a glow appears only while the piece is still (not moving or turning: an
// outline glow does not follow a twist) or designed to stay put, and releases on any move.
// grownOutline() and outlinePath() are there for custom draws. createTurnWatch() tells a real twist
// from the few degrees of jitter a resting piece reads: reset it when the piece slides, and treat
// turned() === true as a move.

/** Outward joins sharper than this are rounded with arc points; gentler ones get a single point. */
const ARC_STEP = Math.PI / 6;
/** A concave corner's offset point stays within this many growPx of its vertex. */
const MITER_LIMIT = 4;

function ring(outline: readonly Vec[]): Vec[] {
  const pts: Vec[] = [];
  for (const p of outline) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1e-6) pts.push({ x: p.x, y: p.y });
  }
  while (pts.length > 1 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) <= 1e-6) pts.pop();
  return pts;
}

/** The outline offset outward by growPx: round joins at outward corners, clamped miters at inward
 * (concave) ones, so a grown point never lands inside the piece. Either winding works. */
export function grownOutline(outline: readonly Vec[], growPx: number): Vec[] {
  const pts = ring(outline), n = pts.length;
  if (n < 3 || !(growPx > 0)) return pts;
  let area = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a.x * b.y - b.x * a.y; }
  const s = area >= 0 ? 1 : -1; // (dy, -dx) points outward for a positive shoelace area
  const normal = (a: Vec, b: Vec): Vec => {
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy);
    return { x: (s * dy) / l, y: (-s * dx) / l };
  };
  const out: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], n1 = normal(pts[(i + n - 1) % n], p), n2 = normal(p, pts[(i + 1) % n]);
    const turn = Math.atan2(n1.x * n2.y - n1.y * n2.x, n1.x * n2.x + n1.y * n2.y);
    if (turn * s > 0 && Math.abs(turn) > ARC_STEP) { // an outward corner: round it
      const steps = Math.ceil(Math.abs(turn) / ARC_STEP), a0 = Math.atan2(n1.y, n1.x);
      for (let k = 0; k <= steps; k++) {
        const a = a0 + (turn * k) / steps;
        out.push({ x: p.x + growPx * Math.cos(a), y: p.y + growPx * Math.sin(a) });
      }
      continue;
    }
    const mx = n1.x + n2.x, my = n1.y + n2.y, m2 = mx * mx + my * my;
    if (m2 < 1e-9) { // the outline doubles back on itself: offset each side
      out.push({ x: p.x + growPx * n1.x, y: p.y + growPx * n1.y }, { x: p.x + growPx * n2.x, y: p.y + growPx * n2.y });
      continue;
    }
    // Where the two offset edges meet: growPx * (n1 + n2) / (1 + n1·n2), and 1 + n1·n2 = |n1 + n2|² / 2.
    let k = (2 * growPx) / m2;
    const len = k * Math.sqrt(m2);
    if (len > growPx * MITER_LIMIT) k *= (growPx * MITER_LIMIT) / len;
    out.push({ x: p.x + k * mx, y: p.y + k * my });
  }
  return untangle(out);
}

/** Where segment ab meets segment cd, or null. Touching counts at b and at c (two grown walls can
 * meet exactly on a vertex), never at a or d, which the neighbouring segments own. */
function crossing(a: Vec, b: Vec, c: Vec, d: Vec): Vec | null {
  const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y, den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const qx = c.x - a.x, qy = c.y - a.y, t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
  return t > 1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u < 1 - 1e-9 ? { x: a.x + t * rx, y: a.y + t * ry } : null;
}

/** Cuts the small loops a notch narrower than 2 x growPx leaves (its two grown walls cross),
 * bridging the notch the way a real offset does: of the two sides of a crossing, the shorter one
 * goes. Passes alternate between starting at the leftmost point (always on the true outer edge)
 * and halfway round, so a loop that wraps past one start is cut from the other. */
function untangle(pts: Vec[]): Vec[] {
  let p = pts, quiet = 0;
  for (let pass = 0; pass < 8 && quiet < 2 && p.length > 3; pass++) {
    let start = 0;
    if (pass % 2 === 0) { for (let i = 1; i < p.length; i++) if (p[i].x < p[start].x) start = i; }
    else start = p.length >> 1;
    const rotated = p.slice(start).concat(p.slice(0, start)), cut = cutLoops(rotated);
    quiet = cut.length === rotated.length ? quiet + 1 : 0;
    p = cut;
  }
  let left = 0; // a stable start whatever the passes did
  for (let i = 1; i < p.length; i++) if (p[i].x < p[left].x) left = i;
  return p.slice(left).concat(p.slice(0, left));
}

/** One pass: for each segment, the farthest later segment within half the ring that it meets
 * cuts out everything between them. */
function cutLoops(p: Vec[]): Vec[] {
  const n = p.length, out: Vec[] = [];
  for (let i = 0; i < n;) {
    out.push(p[i]);
    let cut = -1, at: Vec | null = null;
    for (let j = Math.min(n - 1, i + (n >> 1)); j >= i + 2 && cut < 0; j--) {
      if (i === 0 && j === n - 1) continue; // the closing segment touches the first one
      at = crossing(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n]);
      if (at) cut = j;
    }
    if (at && cut >= 0) { out.push(at); i = cut + 1; } else i++;
  }
  return out;
}

type PathSink = { moveTo(x: number, y: number): void; lineTo(x: number, y: number): void; closePath(): void };
function trace(path: PathSink, pts: readonly Vec[]) {
  if (pts.length < 2) return;
  path.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);
  path.closePath();
}

/** The piece's base outline (grown by growPx when given) as a closed Path2D, for your own fills and strokes. */
export function outlinePath(footprint: Pick<Footprint, "outline">, growPx = 0): Path2D {
  const path = new Path2D();
  trace(path, growPx > 0 ? grownOutline(footprint.outline, growPx) : ring(footprint.outline));
  return path;
}

export type OutlineGlowOptions = {
  growPx?: number;  // how far out from the base the bright line sits (default 12)
  color?: string;   // default "#fff"
  widthPx?: number; // the bright line's width (default 4)
  blurPx?: number;  // how far the soft light spreads either side of the line (default 14)
  alpha?: number;   // 0-1, multiplies the context's own alpha (default 1)
};

/** A soft glowing band around a piece's real base, growPx out from it; nothing is painted inside the
 * base. Plain layered strokes with 'lighter' (no shadowBlur or filter), cheap enough every frame.
 * Takes pieceFootprint()'s result directly: null (a finger, an unknown glyph) draws nothing. */
export function drawOutlineGlow(ctx: CanvasRenderingContext2D, footprint: Pick<Footprint, "outline"> | null | undefined,
  opts: OutlineGlowOptions = {}) {
  const base = footprint ? ring(footprint.outline) : [];
  const alpha = Math.min(1, opts.alpha ?? 1);
  if (base.length < 3 || !(alpha > 0)) return;
  const grow = Math.max(0, opts.growPx ?? 12), width = Math.max(0.5, opts.widthPx ?? 4);
  const blur = Math.max(0, opts.blurPx ?? 14), color = opts.color ?? "#fff";
  const band = grownOutline(base, grow);
  const reach = grow * MITER_LIMIT + width / 2 + blur + 2;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of base) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  ctx.save();
  // Clip to everything around the base but not the base itself: nothing under the piece.
  ctx.beginPath();
  ctx.rect(x0 - reach, y0 - reach, x1 - x0 + 2 * reach, y1 - y0 + 2 * reach);
  trace(ctx, base);
  ctx.clip("evenodd");
  ctx.beginPath();
  trace(ctx, band);
  ctx.globalCompositeOperation = "lighter";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  const a = ctx.globalAlpha * alpha, LAYERS = 4;
  for (let k = LAYERS; k >= 1 && blur > 0; k--) { // widest first: the overlaps make a soft falloff
    ctx.lineWidth = width + (2 * blur * k) / LAYERS;
    ctx.globalAlpha = a * 0.16;
    ctx.stroke();
  }
  ctx.lineWidth = width;
  ctx.globalAlpha = a;
  ctx.stroke();
  ctx.lineWidth = Math.max(1, width * 0.4); // a thin white-hot core, as fx.ts's neon lines have
  ctx.strokeStyle = "#fff";
  ctx.globalAlpha = a * 0.6;
  ctx.stroke();
  ctx.restore();
}

// ---- still means not turning either ------------------------------------------------------------
/** A twist this far from where the piece came to rest, for 2 frames in a row, is a move. */
export const TURN_DEADBAND_DEG = 10;
/** A twist this far is a move at once. */
export const TURN_JUMP_DEG = 15;
const TURN_CONFIRM_FRAMES = 2;
/** Readings averaged into the rest angle after a (re)start: about 0.2 s at 60 fps. */
const TURN_ANCHOR_SAMPLES = 12;

/** a − b in degrees, wrapped to [−180, 180): 359° to 2° is a 3° turn. */
export const angleDeltaDeg = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180;

export interface TurnWatch {
  /** Feed the piece's orientation once a frame; true when it really turned (then it re-anchors). */
  turned(deg: number): boolean;
  /** Forget the rest angle (the piece slid or lifted): the next readings anchor it again. */
  reset(): void;
  /** The rest angle: the circular mean of the first readings after a (re)start, or null. */
  readonly anchorDeg: number | null;
}

/** Tells a real twist from orientation jitter. The rest angle is the mean of the first 12 readings
 * after a (re)start, then holds, so a slow twist still trips it; a reading past TURN_JUMP_DEG, or
 * past TURN_DEADBAND_DEG two frames running, is a turn. Pure: no clock, no DOM. */
export function createTurnWatch(): TurnWatch {
  let sumX = 0, sumY = 0, count = 0, over = 0;
  let anchor: number | null = null;
  const add = (deg: number) => {
    const r = (deg * Math.PI) / 180;
    sumX += Math.cos(r); sumY += Math.sin(r); count++;
    anchor = (Math.atan2(sumY, sumX) * 180) / Math.PI;
  };
  const watch: TurnWatch = {
    get anchorDeg() { return anchor; },
    reset() { sumX = sumY = 0; count = 0; over = 0; anchor = null; },
    turned(deg: number) {
      if (!Number.isFinite(deg)) return false;
      if (anchor === null) { add(deg); return false; }
      const off = Math.abs(angleDeltaDeg(deg, anchor));
      over = off > TURN_DEADBAND_DEG ? over + 1 : 0;
      if (off > TURN_JUMP_DEG || over >= TURN_CONFIRM_FRAMES) {
        watch.reset();
        add(deg); // the new pose starts the next rest angle
        return true;
      }
      if (over === 0 && count < TURN_ANCHOR_SAMPLES) add(deg);
      return false;
    },
  };
  return watch;
}
