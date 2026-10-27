// Developer-only acceptance harness. It never imports main, alters a round/ball,
// accelerates a clock or calls game internals. The iframe runs the regular / page.
import { HOLES } from '/src/course.ts';
import { SWING } from '/src/swing.ts';

// Authored safe routes, matching tests/gesture-course.test.ts.
const ROUTES = [
  [{ x: 1350, y: 540 }],
  [{ x: 520, y: 690 }, { x: 1480, y: 690 }],
  [{ x: 700, y: 745 }, { x: 1250, y: 745 }, { x: 1450, y: 510 }],
  [{ x: 700, y: 745 }, { x: 1200, y: 745 }, { x: 1450, y: 480 }],
  [{ x: 650, y: 750 }, { x: 1250, y: 750 }, { x: 1450, y: 540 }],
  [{ x: 600, y: 750 }, { x: 1300, y: 750 }, { x: 1450, y: 500 }],
  [{ x: 600, y: 300 }, { x: 1450, y: 300 }, { x: 1450, y: 540 }],
  [{ x: 900, y: 420 }, { x: 900, y: 710 }, { x: 1450, y: 710 }],
  [{ x: 700, y: 755 }, { x: 1330, y: 755 }, { x: 1580, y: 540 }],
];
const EXPECTED = ROUTES.map(route => route.length);
const $ = id => document.getElementById(id);
const frame = $('game-frame'), status = $('status'), runButton = $('run'), nextButton = $('next'), stopButton = $('stop'), rematchButton = $('rematch');
let token = 0, active = false, continuing = null, report = null, piece = null, nextPieceId = 900010;
const game = () => frame.contentWindow;
const snapshot = () => game()?.__twistPuttSnapshot ?? null;
const player = state => state?.round?.players[state.round.turnIndex];
const normal = angle => ((angle % 360) + 360) % 360;
const fail = message => { throw new Error(message); };
const ensure = (condition, message) => { if (!condition) fail(message); };

function display(message, level = '') { status.textContent = message; status.dataset.level = level; }
function publish() {
  $('report').textContent = JSON.stringify(report, null, 2);
  $('download').disabled = !report;
}
function check(expectedToken) {
  if (expectedToken !== token) throw new Error('Replay stopped by the operator.');
  if (document.hidden || game()?.document.hidden) throw new Error('The replay tab became hidden. Keep it visible and run again; no background timing is accepted.');
}
function emit(pose, phase = 2, touched = true) {
  game().BoardSDK.__sim.emit([{ ...pose, phase, touched, orientation: normal(pose.orientation) }]);
}
// Wait on the actual game window's frame clock. We do not manufacture timestamps.
async function tick(expectedToken) {
  check(expectedToken);
  const now = await new Promise(resolve => game().requestAnimationFrame(resolve));
  check(expectedToken);
  return now;
}
async function until(predicate, timeoutMs, description, expectedToken) {
  const start = performance.now();
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) fail(`Timed out: ${description}.`);
    await tick(expectedToken);
  }
  return snapshot();
}
async function duration(ms, expectedToken) {
  const start = await tick(expectedToken);
  while (await tick(expectedToken) - start < ms) { /* real frame time only */ }
}
async function finger(x, y, expectedToken) {
  const contact = { id: 900001, glyph: 0, x, y, orientation: 0 };
  emit(contact, 1);
  await tick(expectedToken);
  emit(contact, 3, false);
  await tick(expectedToken);
}
function evidence() {
  const s = snapshot();
  return s ? { mode: s.mode, round: s.round, seats: s.seats, swing: s.swing, pieces: s.pieces } : null;
}
async function boot(expectedToken) {
  display('Loading a fresh browser session…');
  // A normal page reload recreates the browser host and its in-memory roster/save.
  frame.src = `/?acceptance=${Date.now()}`;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Game page did not load in 20 seconds.')), 20000);
    frame.addEventListener('load', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
  await until(() => snapshot()?.mode === 'title', 20000, 'real game title and snapshot', expectedToken);
  const host = game().BoardSDK;
  ensure(host?.__simulated && host.__sim?.emit, 'This page requires the browser host; native Board execution is forbidden.');
  // The title can render before the host's 100-ms session-services delay.
  // The game intentionally reads seats again after the piece enters setup.
  await until(() => host.areServicesReady(), 5000, 'browser session services', expectedToken);
  ensure(JSON.parse(host.getPlayers()).length === 1, 'Replay requires the fresh signed-in browser player only.');
  const panel = game().document.querySelector('[data-board-sim="putting"] details');
  if (panel) panel.open = false;
  piece = { id: 900000, glyph: 5, x: 520, y: 900, orientation: 270 };
  nextPieceId = 900010;
  emit(piece, 1, false);
  await until(() => snapshot()?.mode === 'setup' && snapshot().seats[0]?.present, 5000, 'Tennis piece binds at bottom edge', expectedToken);
  ensure(snapshot().seats.length === 1, 'Expected exactly one bound player in setup.');
  ensure(snapshot().seats[0].edge === 'bottom', 'Piece did not bind at the bottom edge.');
  await finger(960, 916, expectedToken); // actual setup Tee off hit target
  await until(() => snapshot()?.mode === 'play' && snapshot().round?.holeIndex === 0, 5000, 'normal Tee off transition', expectedToken);
  report.initial = evidence();
  publish();
}

function stanceFor(ball, target) {
  const direction = Math.atan2(target.y - ball.y, target.x - ball.x), radius = 170;
  const beta = Math.asin((SWING.ballRadius + SWING.clubWidth / 2) / radius);
  const stance = sign => {
    const hitAngle = direction - sign * Math.PI / 2, radialAngle = hitAngle + sign * beta;
    return { sign, x: ball.x - radius * Math.cos(radialAngle), y: ball.y - radius * Math.sin(radialAngle), orientation: radialAngle * 180 / Math.PI - sign * 45 };
  };
  const fits = p => p.x >= 112 && p.x <= 1808 && p.y >= 112 && p.y <= 968;
  let placement = stance(1);
  if (!fits(placement)) placement = stance(-1);
  ensure(fits(placement), 'The largest Sports piece has no safe stance for this authored route.');
  const speed = Math.max(SWING.minimumBallSpeed, Math.sqrt(640 * Math.hypot(target.x - ball.x, target.y - ball.y)));
  ensure(speed <= SWING.maximumBallSpeed, 'Authored shot exceeds supported twist power.');
  return { ...placement, direction, speed, angularSpeed: (speed - 180) / 1320 * 510 + 30 };
}

async function putt(target, hole, shot, expectedToken) {
  const before = snapshot(), ball = player(before).ball, score = player(before).scores[hole];
  ensure(before.mode === 'play' && before.round.holeIndex === hole && before.round.phase === 'aim', 'Unexpected state before a putt.');
  const stance = stanceFor(ball, target);
  const record = { shot, target, from: { x: ball.x, y: ball.y }, stance, beforeScore: score, samples: 0, maxSampleGapMs: 0 };
  report.holes[hole].shots.push(record);
  display(`Hole ${hole + 1}: ${HOLES[hole].name} · shot ${shot}. Place, rotate through the ball.`);
  // Repositioning includes a new facing, so model an actual lift and replacement.
  // Sending it as Moved would be a real translated rotation sweep, which the
  // always-active line correctly permits to strike. Ownership is re-bound by
  // the production tracker and seating flow; this harness never assigns it.
  const owner = before.seats[0].id;
  emit(piece, 3, false);
  await until(() => snapshot()?.seats.find(s => s.id === owner)?.present === false, 2000, 'the physical lift is observed', expectedToken);
  piece = { ...piece, id: nextPieceId++, x: stance.x, y: stance.y, orientation: stance.orientation };
  emit(piece, 1, false);
  await until(() => snapshot()?.seats.find(s => s.id === owner)?.present === true, 2000, 'replacement retains player ownership', expectedToken);
  await until(() => snapshot()?.swing === 'ready', 3000, 'the active line receives the piece pose', expectedToken);
  // Repeatable measurement baseline for this replay, not an arming requirement.
  await duration(120, expectedToken);
  ensure(player(snapshot()).scores[hole] === score, 'Lift and replacement created an unintended stroke.');
  const start = await tick(expectedToken);
  let lastSample = start;
  for (;;) {
    const now = await tick(expectedToken), s = snapshot();
    if (s.round.phase !== 'aim' || player(s).scores[hole] !== score) break;
    if (now - start > 6000) fail('The deliberate pose sweep failed to strike.');
    // One pose per browser frame. Do not gate a nominal 60-Hz frame at 16.67 ms:
    // rounded 16.5-ms timestamps would skip it, turning constant velocity into
    // a staircase when the game samples every frame. The acceptance browser is
    // expected to run at 60 Hz; record its actual cadence rather than fake time.
    const gap = now - lastSample;
    ensure(gap <= SWING.maximumGapMs, `Input frame gap ${gap.toFixed(1)} ms exceeded the detector limit.`);
    record.samples++;
    record.maxSampleGapMs = Math.max(record.maxSampleGapMs, gap);
    piece = { ...piece, orientation: stance.orientation + stance.sign * stance.angularSpeed * (now - start) / 1000 };
    emit(piece);
    lastSample = now;
  }
  const hit = snapshot();
  ensure(player(hit).scores[hole] === score + 1, 'A single sweep must produce exactly one stroke.');
  record.firstMovingBall = { ...player(hit).ball };
  display(`Hole ${hole + 1}: shot ${shot} rolling. Waiting for normal rest or cup capture…`);
  await until(() => snapshot()?.round?.phase !== 'roll', 25000, 'ball settles normally', expectedToken);
  const after = snapshot(), p = player(after);
  ensure(after.round.holeIndex === hole, 'Hole advanced before the resolved-shot checkpoint.');
  ensure(p.scores[hole] === score + 1, 'Unexpected water penalty or duplicate stroke.');
  ensure(!p.pickedUp[hole], 'The route ended in a pickup.');
  record.after = { score: p.scores[hole], state: p.ball.state, x: p.ball.x, y: p.ball.y, phase: after.round.phase };
  publish();
}

async function checkpoint(hole, expectedToken) {
  if (!$('checkpoints').checked) return;
  display(`Hole ${hole + 1}: ${HOLES[hole].name} ready. Inspect the course, then choose Next hole replay.`);
  nextButton.textContent = `Replay hole ${hole + 1}`;
  nextButton.disabled = false;
  await new Promise(resolve => { continuing = resolve; });
  continuing = null;
  nextButton.disabled = true;
  check(expectedToken);
}

async function replay() {
  if (active) return;
  const expectedToken = ++token;
  active = true; runButton.disabled = true; stopButton.disabled = false; rematchButton.disabled = true;
  $('results').replaceChildren();
  report = { schema: 1, kind: 'browser-contact-replay', startedAt: new Date().toISOString(), result: 'running', expectedTotal: 24, holes: HOLES.map((h, i) => ({ number: h.id, name: h.name, expectedStrokes: EXPECTED[i], shots: [] })) };
  publish();
  try {
    await boot(expectedToken);
    for (let hole = 0; hole < HOLES.length; hole++) {
      ensure(snapshot().round.holeIndex === hole && snapshot().round.phase === 'aim', `Hole ${hole + 1} did not start normally.`);
      if (hole > 0) await checkpoint(hole, expectedToken);
      for (let shot = 0; shot < ROUTES[hole].length; shot++) await putt(ROUTES[hole][shot], hole, shot + 1, expectedToken);
      const end = snapshot(), p = player(end), item = report.holes[hole];
      ensure(p.ball.state === 'sunk', `${HOLES[hole].name}: authored route did not reach the cup.`);
      ensure(p.scores[hole] === EXPECTED[hole], `${HOLES[hole].name}: unexpected score.`);
      item.result = 'pass'; item.score = p.scores[hole]; item.pickedUp = p.pickedUp[hole]; item.checkpoint = evidence();
      const row = document.createElement('li'); row.textContent = `${hole + 1}. ${HOLES[hole].name}: ${item.score} strokes, no pickup`; $('results').append(row);
      publish();
      if (hole < HOLES.length - 1) {
        display(`Hole ${hole + 1} passed. Waiting for the game's 2.6-second advance…`);
        await until(() => snapshot()?.round?.holeIndex === hole + 1, 6000, 'normal between-hole advance', expectedToken);
      }
    }
    const final = snapshot(), p = player(final), total = p.scores.reduce((a, b) => a + b, 0);
    ensure(final.mode === 'over' && final.round.phase === 'complete', 'The game did not show its shared results screen.');
    ensure(total === 24 && p.pickedUp.every(value => !value), 'Final total or pickup record did not match the 24-stroke route.');
    // Observe that results persist without issuing the shared rematch/setup choice.
    await duration(3000, expectedToken);
    ensure(snapshot()?.mode === 'over', 'Results restarted without a shared decision.');
    report.result = 'pass'; report.total = total; report.final = evidence();
    display('PASS · Nine holes · 24 strokes · No pickups. Results are waiting for a shared choice. Verify rematch tests that choice.', 'pass');
  } catch (error) {
    report.result = expectedToken === token ? 'fail' : 'stopped';
    report.error = String(error?.message ?? error);
    report.failureSnapshot = evidence();
    display(`${report.result.toUpperCase()} · ${report.error}`, 'fail');
  } finally {
    report.finishedAt = new Date().toISOString(); publish(); active = false;
    runButton.disabled = false; stopButton.disabled = true; nextButton.disabled = true;
    rematchButton.disabled = report.result !== 'pass' || snapshot()?.mode !== 'over';
    runButton.textContent = 'Run fresh course replay';
  }
}

async function verifyRematch() {
  if (active || report?.result !== 'pass') return;
  const expectedToken = ++token;
  active = true; runButton.disabled = true; rematchButton.disabled = true; stopButton.disabled = false;
  // This separate result never overwrites the completed course's score proof.
  const checkResult = { startedAt: new Date().toISOString(), result: 'running', input: { type: 'SDK finger', x: 690, y: 916 }, before: evidence() };
  report.rematch = checkResult;
  publish();
  try {
    const before = snapshot();
    ensure(before?.mode === 'over' && before.round.phase === 'complete', 'Rematch verification requires the completed results screen.');
    const retainedPlayers = before.round.players.map(p => p.id);
    const retainedSeats = before.seats.map(s => ({ id: s.id, edge: s.edge, glyphId: s.glyphId }));
    // Include the actual browser-space target for diagnosing pointer clicks in
    // this iframe. World contacts always use the original 1920×1080 coordinates.
    const outer = frame.getBoundingClientRect(), canvas = game().document.querySelector('#game').getBoundingClientRect();
    checkResult.browserPointerTarget = { x: outer.left + canvas.left + 690 / 1920 * canvas.width, y: outer.top + canvas.top + 916 / 1080 * canvas.height };
    display('Checking the shared Rematch choice with a normal SDK finger…');
    await finger(690, 916, expectedToken);
    await until(() => snapshot()?.mode === 'play' && snapshot()?.round?.holeIndex === 0, 5000, 'Rematch returns to hole one', expectedToken);
    const after = snapshot(), round = after.round, tee = HOLES[0].tee;
    ensure(round.phase === 'aim' && round.turnIndex === 0, 'Rematch did not reset the first turn.');
    ensure(JSON.stringify(round.players.map(p => p.id)) === JSON.stringify(retainedPlayers), 'Rematch changed the players or turn order.');
    ensure(JSON.stringify(after.seats.map(s => ({ id: s.id, edge: s.edge, glyphId: s.glyphId }))) === JSON.stringify(retainedSeats), 'Rematch changed piece ownership or seating.');
    ensure(after.seats.every(s => s.present), 'Rematch lost an existing physical-piece binding.');
    for (const p of round.players) {
      ensure(p.scores.every(score => score === 0) && p.pickedUp.every(value => !value) && !p.finished, 'Rematch did not clear scores, pickups and finished flags.');
      ensure(p.ball.state === 'ready' && p.ball.vx === 0 && p.ball.vy === 0 && p.ball.x === tee.x && p.ball.y === tee.y, 'Rematch did not reset the ball at the first tee.');
    }
    ensure(round.time < 1, 'Rematch did not reset the obstacle clock.');
    checkResult.result = 'pass'; checkResult.after = evidence();
    display('REMATCH PASS · Hole one, zero strokes, fresh balls and retained players. The completed 24-stroke course evidence is preserved.', 'pass');
  } catch (error) {
    checkResult.result = expectedToken === token ? 'fail' : 'stopped';
    checkResult.error = String(error?.message ?? error); checkResult.failureSnapshot = evidence();
    display(`REMATCH ${checkResult.result.toUpperCase()} · ${checkResult.error}`, 'fail');
  } finally {
    checkResult.finishedAt = new Date().toISOString(); publish(); active = false;
    runButton.disabled = false; stopButton.disabled = true;
    rematchButton.disabled = snapshot()?.mode !== 'over';
  }
}
runButton.addEventListener('click', replay);
rematchButton.addEventListener('click', verifyRematch);
nextButton.addEventListener('click', () => continuing?.());
stopButton.addEventListener('click', () => { token++; continuing?.(); continuing = null; display('Stopping contact replay. The game remains at its current state.'); });
$('download').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `course-replay-${report?.result ?? 'pending'}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
