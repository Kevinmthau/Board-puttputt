import "./style.css";
import { Board, BoardContactPhase, BoardContactType, BoardPlayerType, type BoardAIPlayerType, type BoardContact,
  type BoardPlayer } from "@board.fun/web-sdk";
import { clientToWorld, createSurface, gameFont, loadTitleFont, startInput } from "./runtime";
import { drawTitle } from "./title";
import { BACK_BUTTON, HOW_TO_BUTTON, drawButton, drawHowTo, hit, type Box } from "./howto";
import { Splashes, edgeAngle, nearestEdge, type Edge } from "./fx";
import { loadPieceFootprints, pieceFootprint, type PieceFootprints } from "./piece-footprints";
import { noteContacts, pickPlayer, registerAiTypes, seated, selectorOpen } from "./seats";
// A mode skeleton, not a template: rename, add or drop modes (howto included) to fit the game. Keep
// the principle: one mode at a time, update() and draw() switch on it, piece-lift and pause logic
// run only in play, and every every() over players or pieces checks the length first.
const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const ctx = createSurface(canvas);

type Mode = "title" | "howto" | "setup" | "play" | "over";
let mode: Mode = "title";
let modeAt = 0; // when the current mode began (ms)
const setMode = (next: Mode) => { mode = next; modeAt = performance.now(); };

// ---- seats: the roster decides who plays, a piece at an edge says where ------------------------
// The Board's player selector (src/seats.ts) is the only source of players, AI included; never make
// an anonymous seat for a piece. A piece set down at a free edge binds to the next roster player
// without a piece, or opens the selector when there is none. AI players come from the roster, take
// a free edge and need no piece. Identity follows sessionId; seated() is re-read on every change.
const MIN_PLAYERS = 1; // the game's least player count (humans and AI together)
const EDGES: Edge[] = ["bottom", "top", "left", "right"]; // the edges players sit at, in seat order
const EDGE_BAND = 300; // how far in from its edge a piece still counts as at that edge (px)
// The game's computer players, each driven by the same rule functions as a human turn, e.g.
// { name: "Rook", description: "Plays it safe" }. Leave it empty only for a reason written in PLAN.md.
const AI_TYPES: BoardAIPlayerType[] = [];
type Seat = { player: BoardPlayer; edge: Edge | null; contactId: number | null; at: { x: number; y: number } | null;
  paused: boolean }; // add what a player needs: score, colour
let seats: Seat[] = [];
const isAi = (s: Seat) => s.player.type === BoardPlayerType.AI;
const humans = () => seats.filter(s => !isAi(s));
const edgeAt = (x: number, y: number): Edge | null => {
  const edge = nearestEdge(x, y);
  const gap = { bottom: 1080 - y, top: y, left: x, right: 1920 - x }[edge];
  return EDGES.includes(edge) && gap < EDGE_BAND ? edge : null;
};

let rosterAt = -Infinity; // when setup last re-read the roster (ms)
function syncRoster() { // after ready(), on every players-changed, after every pick, and each second in setup
  const before = seats;
  seats = seated().map(player => {
    const old = before.find(s => s.player.sessionId === player.sessionId);
    return old ? { ...old, player } : { player, edge: null, contactId: null, at: null, paused: false };
  });
  for (const s of seats) {
    if (!isAi(s)) continue;
    s.contactId = null; // a digital player has no piece
    s.edge ??= EDGES.find(e => !seats.some(o => o.edge === e)) ?? null;
  }
}

function bind(c: BoardContact) {
  const edge = edgeAt(c.x, c.y);
  if (!edge || seats.some(s => s.edge === edge && (isAi(s) || s.contactId !== null))) return; // the cues answer it
  // The player who sits at this edge, else (only while setting up) the next roster player without a piece.
  const seat = seats.find(s => s.edge === edge && !isAi(s))
    ?? (mode === "setup" ? seats.find(s => !isAi(s) && s.edge === null) : undefined);
  if (seat) Object.assign(seat, { edge, contactId: c.contactId, at: { x: c.x, y: c.y }, paused: false });
  else if (mode === "setup" && !selectorOpen()) void addPlayer().then(() => { const p = pieces.get(c.contactId); if (p) bind(p); });
}
const addPlayer = () => pickPlayer().then(syncRoster); // always re-read the roster after a pick

// ---- input ---------------------------------------------------------------------------------------
const pieces = new Map<number, BoardContact>(); // glyph contacts on the glass, by contactId
let arrivals: BoardContact[] = []; // pieces put down since the last frame
let taps: { x: number; y: number }[] = []; // finger taps since the last frame, in world points
let resumedAt = -Infinity; // when the system menu last closed (ms)
let footprints: PieceFootprints | null = null;
const splashes = new Splashes();

startInput((batch, active) => {
  noteContacts(batch); // lets seats.ts notice a selector that closed without answering
  pieces.clear();
  for (const c of active.values()) if (c.type === BoardContactType.Glyph) pieces.set(c.contactId, c);
  for (const c of batch) {
    if (c.type === BoardContactType.Glyph && c.phase === BoardContactPhase.Began) arrivals.push(c);
    if (c.type === BoardContactType.Finger && c.phase === BoardContactPhase.Began) taps.push({ x: c.x, y: c.y });
    const lifted = c.phase === BoardContactPhase.Ended || c.phase === BoardContactPhase.Canceled;
    const seat = lifted ? seats.find(s => s.contactId === c.contactId) : undefined;
    if (seat) seat.contactId = null; // a lift; the seat keeps its player and edge
  }
}, () => {
  // A native pause is an epoch boundary, not a lift: clear intent and velocity here, keep the mode.
  // Resting pieces come back under new contact ids after the menu closes; arrive() re-binds them.
  for (const s of seats) { s.paused = s.contactId !== null; s.contactId = null; }
  arrivals = [];
});
canvas.addEventListener("pointerdown", e => taps.push(clientToWorld(canvas, e.clientX, e.clientY))); // browser preview

function arrive(c: BoardContact, now: number) {
  // A piece re-detected near its spot just after the menu closed is the same piece: no new splash.
  const back = seats.find(s => s.paused && s.at && Math.hypot(s.at.x - c.x, s.at.y - c.y) < 120);
  if (back && now - resumedAt < 2000) { Object.assign(back, { contactId: c.contactId, paused: false }); return; }
  // One piece-down moment per real arrival, starting at the piece's real edge.
  splashes.at(c.x, c.y, { inner: pieceFootprint(footprints, c)?.radiusPx ?? 60, color: "#9CF" });
  bind(c);
}

// ---- the result: one shared decision for the table -------------------------------------------
const REMATCH: Box = { x: 960 - 20 - 460, y: 600, width: 460, height: 140 };
const CHANGE_SETUP: Box = { x: 960 + 20, y: 600, width: 460, height: 140 };
const ADD_PLAYER: Box = { x: 1920 - 48 - 440, y: 48, width: 440, height: 140 };

function update(now: number, dt: number) {
  const tapped = (box: Box) => taps.some(t => hit(box, t.x, t.y));
  for (const s of seats) { const p = s.contactId === null ? undefined : pieces.get(s.contactId); if (p) s.at = { x: p.x, y: p.y }; }
  switch (mode) {
    case "title": // key art and the name; the first real action (a placed piece) leads into setup
      if (arrivals.length) setMode("setup"); // the piece is handled there, so it can take a seat at once
      else if (tapped(HOW_TO_BUTTON)) setMode("howto");
      break;
    case "howto": // optional help; a placed piece starts setup from here too, Back returns
      if (arrivals.length) setMode("setup");
      else if (tapped(BACK_BUTTON)) setMode("title");
      break;
    case "setup": { // pieces take seats; play starts once everyone in the roster is ready
      // Player services can come up late, and the SDK reports only changes: keep re-reading here.
      if (now - rosterAt > 1000) { syncRoster(); rosterAt = now; }
      for (const c of arrivals.splice(0)) arrive(c, now);
      if (tapped(ADD_PLAYER) && !selectorOpen()) void addPlayer();
      // every() over no players is true: check length first, or an empty roster starts on frame 1.
      const people = humans();
      if (seats.length >= MIN_PLAYERS && people.length > 0 && people.every(s => s.contactId !== null)) setMode("play");
      break;
    }
    case "play": { // the rules. Piece lifts and pause handling belong here, never in title or setup.
      for (const c of arrivals.splice(0)) arrive(c, now);
      // Placeholder result: the round ends once every human's piece is lifted. Use the game's own.
      const people = humans();
      if (people.length > 0 && people.every(s => s.contactId === null) && now - resumedAt > 2000) setMode("over");
      break;
    }
    case "over": // the result waits for one shared decision; nothing restarts by itself
      for (const c of arrivals.splice(0)) arrive(c, now);
      if (tapped(REMATCH)) setMode("setup"); // the same seats: play starts once their pieces are down
      else if (tapped(CHANGE_SETUP)) { seats = []; syncRoster(); setMode("setup"); } // seats released
      break;
  }
  splashes.update(dt);
  taps = [];
}

function nameAtEdge(s: Seat) { // each player's label at their own edge, facing them
  if (!s.edge) return;
  const at = { bottom: [960, 1032], top: [960, 48], left: [48, 540], right: [1872, 540] }[s.edge];
  ctx.save(); ctx.translate(at[0], at[1]); ctx.rotate(edgeAngle(s.edge));
  ctx.font = gameFont(48); ctx.textAlign = "center"; ctx.textBaseline = "bottom";
  ctx.fillStyle = isAi(s) || s.contactId !== null ? "#FFFFFF" : "rgba(255,255,255,0.45)";
  ctx.fillText(s.player.name, 0, 0);
  ctx.restore();
}

function draw(now: number) {
  ctx.fillStyle = "#101827"; ctx.fillRect(0, 0, 1920, 1080);
  if (mode === "title") { drawTitle(ctx, { x: 0, y: 0, width: 1920, height: 1080 }); drawButton(ctx, HOW_TO_BUTTON, "HOW TO PLAY"); }
  if (mode === "howto") drawHowTo(ctx, now);
  if (mode === "setup") { // a signal, not words: every free edge breathes until a piece takes it
    ctx.save(); ctx.fillStyle = "#96C8FF"; ctx.globalAlpha = 0.3 + 0.2 * Math.sin(now / 300); // fixed colour, animated alpha
    for (const edge of EDGES) {
      if (seats.some(s => s.edge === edge && (isAi(s) || s.contactId !== null))) continue;
      if (edge === "bottom") ctx.fillRect(0, 1080 - 24, 1920, 24);
      if (edge === "top") ctx.fillRect(0, 0, 1920, 24);
      if (edge === "left") ctx.fillRect(0, 0, 24, 1080);
      if (edge === "right") ctx.fillRect(1920 - 24, 0, 24, 1080);
    }
    ctx.restore();
    drawButton(ctx, ADD_PLAYER, "ADD PLAYER");
  }
  // Placeholder playfield: play must look different the moment a piece starts it (Studio's boot
  // check puts a piece down and looks for that). Replace it with the game's own field and HUD.
  if (mode === "play" || mode === "over") { ctx.fillStyle = "#2A3A5C"; ctx.fillRect(48, 48, 1824, 984); }
  if (mode !== "title" && mode !== "howto") for (const s of seats) nameAtEdge(s);
  if (mode === "over") { // one card for the whole table: one result, one decision
    ctx.fillStyle = "rgba(10,14,24,0.88)"; ctx.fillRect(400, 300, 1120, 500);
    ctx.fillStyle = "#FFFFFF"; ctx.font = gameFont(72); ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("ROUND OVER", 960, 440); // placeholder: the game's result, matching its rules
    drawButton(ctx, REMATCH, "REMATCH"); drawButton(ctx, CHANGE_SETUP, "CHANGE SETUP");
  }
  splashes.draw(ctx); // nothing else is drawn at or following a piece
}

let running = true;
let last = 0;
const frame = (now: number) => {
  if (!running) return;
  const dt = Math.min(0.05, last ? (now - last) / 1000 : 0); last = now;
  update(now, dt); draw(now);
  requestAnimationFrame(frame);
};
Board.application.onPause(() => { running = false; });
Board.application.onResume(() => { resumedAt = performance.now(); if (!running) { running = true; last = 0; requestAnimationFrame(frame); } });

void (async () => {
  await BoardPlatform.state.ready(); // before reading progress or seating players (PLATFORM.md)
  registerAiTypes(AI_TYPES);
  syncRoster();
  if (Board.isOnDevice) Board.session.onPlayersChanged(syncRoster); // the SDK polls; late services arrive here
  [footprints] = await Promise.all([loadPieceFootprints(), loadTitleFont()]);
  requestAnimationFrame(frame);
})();
