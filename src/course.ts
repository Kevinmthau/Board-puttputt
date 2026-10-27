export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }
export interface Segment { a: Point; b: Point }
export interface Circle extends Point { r: number }
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
  bumpers: Circle[]; water: Rect[]; bridges: Rect[]; sand: Rect[];
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

export function gateIsOpen(gate: Gate, time: number): boolean {
  const phase = ((time + gate.phase) % gate.period + gate.period) % gate.period;
  return phase < gate.openFor;
}

const P = (x: number, y: number): Point => ({ x, y });
const rectangle = (x: number, y: number, w: number, h: number) => [P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h)];
const rounded = [P(300, 250), P(1550, 250), P(1640, 300), P(1700, 400), P(1700, 680), P(1640, 780), P(1550, 830), P(300, 830), P(220, 750), P(220, 330)];

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
];

export const TOTAL_PAR = () => HOLES.reduce((sum, h) => sum + h.par, 0);
