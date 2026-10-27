// Read-only geometry proof. Run: node scripts/check-stance-clearance.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const compiled = await build({
  stdin: {
    contents: `export { HOLES, pointInPolygon } from './src/course';
      export { isWater } from './src/physics';
      export { pieceFootprint, frontPoint } from './src/piece-footprints';`,
    resolveDir: root,
  },
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const { HOLES, pointInPolygon, isWater, pieceFootprint, frontPoint } = await import(
  'data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64')
);
const catalog = JSON.parse(readFileSync(new URL('../public/piece-footprints.json', import.meta.url), 'utf8'));
const pieces = Object.entries(catalog.pieces).map(([id, shape]) => ({
  glyphId: Number(id), name: shape.name,
  radius: Math.max(...shape.outlineMm.map(([x, y]) => Math.hypot(x, y) * 3.6)),
}));
const largest = pieces.reduce((a, b) => a.radius > b.radius ? a : b);
const requiredHandMargin = 24;
assert.ok(112 - largest.radius >= requiredHandMargin, 'the test stance margin includes the complete physical outline');

const lineStarts = [];
for (const piece of pieces) {
  for (const orientation of [0, 90, 180, 270]) {
    const footprint = pieceFootprint(catalog, { glyphId: piece.glyphId, x: 960, y: 540, orientation });
    const edge = frontPoint(footprint, 0), start = frontPoint(footprint, 6);
    assert.ok(Math.abs(Math.hypot(start.x - edge.x, start.y - edge.y) - 6) < 1e-8, 'beam begins six pixels beyond the forward outline');
    const dx = start.x - footprint.center.x, dy = start.y - footprint.center.y;
    assert.ok(Math.abs(dx * footprint.facing.y - dy * footprint.facing.x) < 1e-8, 'beam lies on the forehead centerline');
    if (orientation === 0) lineStarts.push({ glyphId: piece.glyphId, centerToLineStartPx: Math.hypot(dx, dy) });
  }
}

// A circle enclosing every outline vertex also encloses every rotation of the piece.
// Both possible tangential swings include the earliest club/ball capsule contact offset.
const stanceRadius = 170, beta = Math.asin(17 / stanceRadius);
let checks = 0;
let worst = { marginPx: Infinity, hole: 0, x: 0, y: 0, shotDirectionDeg: 0 };
for (const hole of HOLES) {
  for (let x = 220; x <= 1700; x += 10) for (let y = 250; y <= 830; y += 10) {
    if (!pointInPolygon({ x, y }, hole.outline) || isWater({ x, y }, hole)) continue;
    for (let direction = 0; direction < 72; direction++) {
      const angle = direction * Math.PI / 36;
      let bestMargin = -Infinity;
      for (const sign of [1, -1]) {
        const radialAngle = angle - sign * Math.PI / 2 + sign * beta;
        const px = x - stanceRadius * Math.cos(radialAngle), py = y - stanceRadius * Math.sin(radialAngle);
        bestMargin = Math.max(bestMargin, Math.min(px, 1920 - px, py, 1080 - py) - largest.radius);
      }
      if (bestMargin < worst.marginPx) worst = { marginPx: bestMargin, hole: hole.id, x, y, shotDirectionDeg: direction * 5 };
      assert.ok(bestMargin >= requiredHandMargin, `${hole.name}: no safe stance at ${x},${y}, direction ${direction * 5}`);
      checks++;
    }
  }
}
console.log(JSON.stringify({ largest, requiredHandMargin, testCenterMarginPx: 112, checks, worst, lineStarts }, null, 2));
