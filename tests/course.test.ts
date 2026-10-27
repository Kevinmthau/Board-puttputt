import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOLES, bridgeOutline, pointInBridge, pointInPolygon, TOTAL_PAR, type Point } from '../src/course';
import { createBall, isWater, stepBall, strikeBall } from '../src/physics';

// Human-playable, nonzero shots through the actual simulation. Intermediate targets
// use the long safe route; the last target is always the cup, never a forced result.
export const SAFE_ROUTES: Record<number, Point[]> = {
  1: [{ x: 1350, y: 540 }],
  2: [{ x: 520, y: 690 }, { x: 1480, y: 690 }],
  3: [{ x: 700, y: 745 }, { x: 1250, y: 745 }, { x: 1450, y: 510 }],
  4: [{ x: 700, y: 745 }, { x: 1200, y: 745 }, { x: 1450, y: 480 }],
  5: [{ x: 650, y: 750 }, { x: 1250, y: 750 }, { x: 1450, y: 540 }],
  6: [{ x: 600, y: 750 }, { x: 1300, y: 750 }, { x: 1450, y: 500 }],
  7: [{ x: 600, y: 300 }, { x: 1450, y: 300 }, { x: 1450, y: 540 }],
  8: [{ x: 900, y: 420 }, { x: 900, y: 710 }, { x: 1450, y: 710 }],
  9: [{ x: 700, y: 755 }, { x: 1330, y: 755 }, { x: 1580, y: 540 }],
};

test('the adventure has nine distinct holes and par 27', () => {
  assert.equal(HOLES.length, 9);
  assert.equal(TOTAL_PAR(), 27);
  assert.equal(new Set(HOLES.map(h => h.name)).size, 9);
});

test('Twin Falls bridges tilt in opposite directions and keep their safe shot corridors', () => {
  const bridges = HOLES[7].bridges;
  assert.equal(bridges.length, 2);
  for (const [index, bridge] of bridges.entries()) {
    const [a, b] = bridge.centerline!;
    const tilt = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    assert.ok(Math.abs(tilt - (index ? -15 : 15)) < 0.00001);
    assert.equal(bridgeOutline(bridge).length, 4);
    const water = HOLES[7].water[index], y = index ? 710 : 420;
    for (let x = water.x; x <= water.x + water.w; x += 2) {
      assert.ok(pointInBridge({ x, y }, bridge, 14), 'the full ball fits on the tilted deck');
      assert.equal(isWater({ x, y }, HOLES[7]), false);
    }
  }
});

test('Willow’s lower bridge curves and uses its visible deck for water clearance', () => {
  const hole = HOLES[3], bridge = hole.bridges[1], line = bridge.centerline!;
  assert.ok(line.length > 2);
  assert.ok(line[0].y - line[Math.floor(line.length / 2)].y > 30, 'visible shallow curve');
  for (let x = 850; x <= 1050; x += 2) assert.equal(isWater({ x, y: 745 }, hole), false, 'the broad route remains open');
  assert.equal(pointInBridge({ x: 950, y: 720 }, bridge, 14), true);
  assert.equal(pointInBridge({ x: 950, y: 780 }, bridge, 14), false, 'a ball crossing the visible deck edge is no longer supported');
  assert.equal(isWater({ x: 950, y: 780 }, hole), true);
});

test('every authored hole has a legal tee, cup, and physical putting stance', () => {
  for (const hole of HOLES) {
    for (const point of [hole.tee, hole.cup, ...hole.tunnels.map(t => t.exit)]) {
      assert.ok(pointInPolygon(point, hole.outline), `${hole.name}: point within fairway`);
      assert.ok(!isWater(point, hole), `${hole.name}: point on dry ground`);
      // Largest Sports base is 87.84 px; allow 24 px hand margin. At least
      // one controller position 170 px away must fit entirely on the glass.
      const usable = Array.from({ length: 24 }, (_, i) => i * Math.PI / 12).some(a => {
        const x = point.x + Math.cos(a) * 170, y = point.y + Math.sin(a) * 170;
        return x > 112 && x < 1808 && y > 112 && y < 968;
      });
      assert.ok(usable, `${hole.name}: a real piece fits beside the ball`);
    }
  }
});

test('all fairway areas allow a tangential stroke with the largest Sports piece', () => {
  for (const hole of HOLES) {
    for (let x = 240; x <= 1680; x += 60) for (let y = 270; y <= 810; y += 60) {
      if (!pointInPolygon({ x, y }, hole.outline) || isWater({ x, y }, hole)) continue;
      for (let d = 0; d < 24; d++) {
        const angle = d * Math.PI / 12;
        const dx = -Math.sin(angle) * 170, dy = Math.cos(angle) * 170;
        const fit = [1, -1].some(sign => x + sign * dx >= 112 && x + sign * dx <= 1808 && y + sign * dy >= 112 && y + sign * dy <= 968);
        assert.ok(fit, `${hole.name}: tangent stroke ${d} at ${x},${y}`);
      }
    }
  }
});

test('every hole has a genuine playable route within its par and stroke cap', () => {
  for (const hole of HOLES) {
    const ball = createBall(hole.tee);
    const route = SAFE_ROUTES[hole.id];
    assert.ok(route, `${hole.name}: solution fixture exists`);
    assert.ok(route.length <= hole.par, `${hole.name}: route meets par`);
    let time = 0;
    for (const target of route) {
      if (ball.state === 'sunk') break;
      const dx = target.x - ball.x, dy = target.y - ball.y, distance = Math.hypot(dx, dy);
      const speed = Math.max(180, Math.sqrt(2 * 320 * distance));
      assert.ok(speed <= 1500, `${hole.name}: shot in allowed range`);
      assert.equal(strikeBall(ball, { x: dx / distance * speed, y: dy / distance * speed }), true);
      for (let i = 0; i < 2400 && ball.state === 'moving'; i++) {
        const events = stepBall(ball, hole, 1 / 120, time);
        time += 1 / 120;
        assert.ok(!events.some(e => e.type === 'water'), `${hole.name}: safe route avoids penalty`);
      }
      assert.notEqual(ball.state, 'moving', `${hole.name}: ball settles`);
    }
    assert.equal(ball.state, 'sunk', `${hole.name}: route reaches cup`);
  }
});
