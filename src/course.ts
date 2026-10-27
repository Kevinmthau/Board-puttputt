export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }
export interface Segment { a: Point; b: Point }
export interface Circle extends Point { r: number }
export interface Bridge extends Rect {
  /** Shared deck boundary for rendering and ball clearance. Rectangles may omit it. */
  outline?: Point[];
  /** Plank and railing direction; curved decks use a sampled centerline. */
  centerline?: Point[];
}
export interface Slope extends Rect { ax: number; ay: number }
export interface Tunnel {
  id: string; entry: Circle; exit: Point; direction: Point; speedScale: number;
}
export interface Gate extends Segment {
  id: string; period: number; openFor: number; phase: number; kind: 'windmill' | 'castle';
}
export interface Hole {
  id: number; name: string; par: number; hint: string;
  tee: Point; cup: Circle; outline: Point[]; walls: Segment[];
  bumpers: Circle[]; water: Rect[]; bridges: Bridge[]; sand: Rect[];
  slopes: Slope[]; tunnels: Tunnel[]; gates: Gate[];
}

export const COURSE_BOUNDS: Rect = { x: 220, y: 220, w: 1480, h: 640 };
export const pointInRect = (p: Point, r: Rect, inset = 0) =>
  p.x >= r.x + inset && p.x <= r.x + r.w - inset && p.y >= r.y + inset && p.y <= r.y + r.h - inset;

export function pointInPolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function bridgeOutline(bridge: Bridge): Point[] {
  return bridge.outline ?? [
    { x: bridge.x, y: bridge.y }, { x: bridge.x + bridge.w, y: bridge.y },
    { x: bridge.x + bridge.w, y: bridge.y + bridge.h }, { x: bridge.x, y: bridge.y + bridge.h },
  ];
}

export function pointInBridge(point: Point, bridge: Bridge, inset = 0): boolean {
  if (!bridge.outline) return pointInRect(point, bridge, inset);
  if (!pointInPolygon(point, bridge.outline)) return false;
  if (inset <= 0) return true;
  for (let i = 0; i < bridge.outline.length; i++) {
    const a = bridge.outline[i], b = bridge.outline[(i + 1) % bridge.outline.length];
    const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
    const t = length2 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length2)) : 0;
    if (Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy) < inset) return false;
  }
  return true;
}

export function gateIsOpen(gate: Gate, time: number): boolean {
  const phase = ((time + gate.phase) % gate.period + gate.period) % gate.period;
  return phase < gate.openFor;
}

const P = (x: number, y: number): Point => ({ x, y });
const rounded = [P(300, 250), P(1550, 250), P(1640, 300), P(1700, 400), P(1700, 680), P(1640, 780), P(1550, 830), P(300, 830), P(220, 750), P(220, 330)];
const S = (x1: number, y1: number, x2: number, y2: number): Segment => ({ a: P(x1, y1), b: P(x2, y2) });

function ribbonBridge(centerline: Point[], width: number): Bridge {
  const sides = [1, -1].map(sign => centerline.map((p, i) => {
    const before = centerline[Math.max(0, i - 1)], after = centerline[Math.min(centerline.length - 1, i + 1)];
    const dx = after.x - before.x, dy = after.y - before.y, length = Math.hypot(dx, dy);
    return P(p.x - dy / length * width / 2 * sign, p.y + dx / length * width / 2 * sign);
  }));
  const outline = [...sides[0], ...sides[1].reverse()];
  const xs = outline.map(p => p.x), ys = outline.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, outline, centerline };
}

function tiltedBridge(x: number, y: number, length: number, width: number, degrees: number): Bridge {
  const a = degrees * Math.PI / 180, dx = Math.cos(a) * length / 2, dy = Math.sin(a) * length / 2;
  return ribbonBridge([P(x - dx, y - dy), P(x + dx, y + dy)], width);
}

function willowBridge(): Bridge {
  const centerline = Array.from({ length: 9 }, (_, i) => {
    const t = i / 8, u = 1 - t;
    return P(u * u * 805 + 2 * u * t * 950 + t * t * 1095, u * u * 755 + 2 * u * t * 685 + t * t * 755);
  });
  return ribbonBridge(centerline, 130);
}

function hole(id: number, name: string, par: number, tee: Point, cup: Point, hint: string, options: Partial<Hole> = {}): Hole {
  const outline = options.outline ?? rounded.map(p => ({ ...p }));
  const edges = outline.map((a, i) => ({ a, b: outline[(i + 1) % outline.length] }));
  return {
    id, name, par, hint, tee, cup: { ...cup, r: 28 }, outline,
    bumpers: [], water: [], bridges: [], sand: [], slopes: [], tunnels: [], gates: [],
    ...options, walls: [...edges, ...(options.walls ?? [])],
  };
}

export const HOLES: Hole[] = [
  hole(1, 'First Green', 2, P(500, 540), P(1350, 540), 'A gentle flick is all you need.'),
  hole(2, 'Banker’s Bend', 2, P(450, 400), P(1480, 690), 'Follow the bend, or try a bank shot.', {
    outline: [P(300, 250), P(850, 250), P(850, 550), P(1650, 550), P(1700, 600), P(1700, 750), P(1620, 830), P(300, 830), P(220, 750), P(220, 330)],
  }),
  hole(3, 'Windmill Meadow', 3, P(450, 510), P(1450, 510), 'Time the blades, or take the lower path.', {
    walls: [S(950, 250, 950, 430), S(950, 620, 950, 680)],
    gates: [{ id: 'windmill', a: P(950, 430), b: P(950, 620), period: 4.8, openFor: 1.65, phase: 2, kind: 'windmill' }],
  }),
  hole(4, 'Willow River', 3, P(450, 480), P(1450, 480), 'Choose the straight bridge or the wide crossing.', {
    water: [{ x: 850, y: 250, w: 200, h: 580 }],
    bridges: [{ x: 825, y: 425, w: 250, h: 110 }, willowBridge()],
  }),
  hole(5, 'Foxglove Tunnel', 3, P(450, 540), P(1450, 540), 'The tunnel cuts through the hill.', {
    bumpers: [{ x: 960, y: 510, r: 158 }],
    tunnels: [{ id: 'foxglove', entry: { x: 770, y: 540, r: 37 }, exit: P(1190, 540), direction: P(1, 0), speedScale: 0.72 }],
  }),
  hole(6, 'Summit Switchback', 3, P(450, 500), P(1450, 500), 'Climb the ramp, or follow the gentle switchback.', {
    slopes: [{ x: 650, y: 300, w: 300, h: 360, ax: -180, ay: 0 }, { x: 950, y: 300, w: 280, h: 360, ax: 210, ay: 0 }],
    sand: [{ x: 1280, y: 300, w: 180, h: 110 }],
  }),
  hole(7, 'Pebble Pinball', 3, P(450, 540), P(1450, 540), 'Thread the boulders. Sand slows your ball.', {
    bumpers: [{ x: 850, y: 400, r: 70 }, { x: 1050, y: 600, r: 80 }, { x: 1250, y: 400, r: 65 }],
    sand: [{ x: 1160, y: 670, w: 250, h: 120 }],
  }),
  hole(8, 'Twin Falls', 4, P(450, 420), P(1450, 710), 'Cross both bridges, or find the waterfall tunnel.', {
    water: [{ x: 700, y: 250, w: 130, h: 580 }, { x: 1100, y: 250, w: 130, h: 580 }],
    bridges: [tiltedBridge(765, 420, 220, 136, 15), tiltedBridge(1165, 710, 220, 136, -15)],
    tunnels: [{ id: 'waterfall', entry: { x: 970, y: 420, r: 34 }, exit: P(1300, 710), direction: P(1, 0), speedScale: 0.7 }],
    bumpers: [{ x: 975, y: 570, r: 54 }],
  }),
  hole(9, 'Castle Cup', 4, P(450, 540), P(1580, 540), 'The moat, gate, and tunnel guard the final cup.', {
    water: [{ x: 850, y: 250, w: 160, h: 580 }],
    bridges: [{ x: 830, y: 465, w: 200, h: 140 }, { x: 830, y: 710, w: 200, h: 100 }],
    walls: [S(1160, 250, 1160, 455), S(1160, 625, 1160, 680)],
    gates: [{ id: 'castle', a: P(1160, 455), b: P(1160, 625), period: 5.4, openFor: 1.9, phase: 2.4, kind: 'castle' }],
    tunnels: [{ id: 'castle-tunnel', entry: { x: 1240, y: 540, r: 35 }, exit: P(1450, 540), direction: P(1, 0), speedScale: 0.75 }],
  }),
];

export const TOTAL_PAR = () => HOLES.reduce((sum, h) => sum + h.par, 0);
