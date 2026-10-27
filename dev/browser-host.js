// GENERATED from assets/game-template/astra-starter/src/browser-host.ts by scripts/board_app/build_browser_host.mjs. Do not edit.
// The web lane's simulated Board host, injected by assets/board-app/boot_capture.cjs so a
// packed Create Game candidate boots in a headless browser the way it does on a Board.
(() => {
"use strict";
// Browser host — a simulated Board host so the packaged game is playable with a
// mouse or a touch screen in a plain browser (Studio preview, `vite dev`, QA).
//
// It installs ONLY when `window.BoardSDK` is undefined. On a real Board the OS
// injects the bridge before any script runs, so this module is inert there and
// the game keeps ONE code path: `Board.isOnDevice` is true under this host and
// the pinned @board.fun/web-sdk parses the same wire frames it parses on the
// glass (dist/input.js parseContact/parsePollContact, pause.js HOST_ACTION_MAP,
// bridge.js window.__board resolve/reject/onPauseResult/onAppVisibility).
//
//   drag         one finger contact (glyphId 0): Began → Moved… → Ended
//   shift-drag   a resting Piece (glyphId `__sim.glyph`, default 1) that stays on
//                the table after release; shift-drag near it moves it
//   backspace    lift every resting Piece
//   P / Escape   open the simulated system menu (Board.application.onPause fires);
//                inside it: Enter/P resume · Q quit · S save & quit (only when the
//                pause context has offerSaveOption) · 1-9 custom buttons ·
//                M / N toggle the first / second audio track (delivered on resume)
//
// Board.save is simulated the way a Board keeps it: saves outlive a reload of the
// page (this origin's web storage, written through the untouched Storage methods,
// or memory where storage is refused), a save's players are the live roster when
// it is created, a blank description or a roster with no profile is rejected,
// loading a save reseats the session to its players, and save covers do not exist
// (no Board has them yet; `window.__boardSimProfile = { covers: true }` before this
// host installs adds them). The active profile always reports sessionId -1, and
// Board services come up a moment after the page starts. As on a Board, a profile's
// id is raw in a save's players and hashed with the app id in the session
// (getActiveProfile, getPlayers): libboard's hashProfileIdWithAppId, see sessionIdOf.
//
// The stream behaves like the sensor, not like a mouse: a resting Piece is not
// re-reported every frame but in single-frame untouched Moved blips 100-700 ms
// apart with empty frames between; NO frame at all arrives while the system
// menu is open; and after it closes a few empty frames pass before the resting
// Pieces are detected again under fresh ids. A game must never read "this piece
// was not in the last frame" as "this piece was lifted".
//
// The "BROWSER SIMULATOR" label and `window.BoardSDK.__sim` are browser-only;
// `isSimulatedHost()` is the sanctioned way to branch on them, and nothing here
// is evidence of native behaviour (knowledge/POLICY.md).
//
// The platform layer (board-platform.js) is packed with every game and loads
// first; under `vite dev` its in-memory stand-in comes from this import.

/** Set on window before the host installs: what kind of Board to simulate. */

// The Board bridge reads a pause-menu track value with JSONObject.optInt("value", 50): a
// number is truncated to an integer (0.6 becomes 0) and anything unreadable becomes 50.
// The host keeps (and later returns) that integer, so a game sending 0-1 gains hears 0 here
// exactly as it would on a Board.
function boardTrackValue(value         )         {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : 50;
}
const hostTrack = (t       )        => ({ ...t, value: boardTrackValue(t.value) });
// The system menu upper-cases a button's icon and looks it up; anything else shows no icon.
const ICONS                         = { CIRCULAR_ARROW: "↻", DOOR_WITH_ARROW: "⇥", LEFT_ARROW: "←", SQUARE: "■" };
function boardIcon(icon         )         {
  return typeof icon === "string" ? ICONS[icon.toUpperCase()] ?? "" : "";
}
// SHA-256 of a string's UTF-8, as lowercase hex. Synchronous (the session's getters are),
// so it cannot be crypto.subtle; checked against node:crypto in tests/astra/browser_host.test.mjs.
function sha256Hex(text        )         {
  const bytes = new TextEncoder().encode(text);
  const K           = [], H           = [];
  for (let n = 2; K.length < 64; n++) {
    let prime = true;
    for (let d = 2; d * d <= n; d++) if (n % d === 0) prime = false;
    if (!prime) continue;
    if (H.length < 8) H.push(((n ** (1 / 2) % 1) * 2 ** 32) >>> 0);
    K.push(((n ** (1 / 3) % 1) * 2 ** 32) >>> 0);
  }
  const words = new Uint32Array(((bytes.length + 9 + 63) >> 6) << 4);
  bytes.forEach((b, i) => (words[i >> 2] |= b << (24 - (i % 4) * 8)));
  words[bytes.length >> 2] |= 0x80 << (24 - (bytes.length % 4) * 8);
  words[words.length - 1] = bytes.length * 8;
  const rotr = (x        , r        ) => (x >>> r) | (x << (32 - r));
  const w = new Uint32Array(64);
  for (let off = 0; off < words.length; off += 16) {
    for (let i = 0; i < 64; i++) {
      if (i < 16) w[i] = words[off + i];
      else {
        const a = w[i - 15], b = w[i - 2];
        w[i] = w[i - 16] + (rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)) + w[i - 7] + (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10));
      }
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      [h, g, f, e, d, c, b, a] = [g, f, e, (d + t1) >>> 0, c, b, a, (t1 + t2) >>> 0];
    }
    [a, b, c, d, e, f, g, h].forEach((v, i) => (H[i] = (H[i] + v) >>> 0));
  }
  return H.map((v) => v.toString(16).padStart(8, "0")).join("");
}
const PROFILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The simulated Board's one profile: a raw id, as UDS keeps it. */
const SIM_PROFILE_ID = "5e1f0b0a-4d00-4c1e-8000-00000000517d";
const REDETECT_FRAMES = 6; // empty frames between the menu closing and a resting Piece being born again
const PNG_1PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const STYLE = `[data-board-sim]{position:fixed;inset:0;pointer-events:none;z-index:2147483647;font:12px ui-monospace,monospace;color:#fff}
[data-board-sim] .bs-label{position:absolute;left:8px;bottom:8px;padding:4px 8px;border-radius:4px;background:rgba(0,0,0,.65);pointer-events:auto;cursor:pointer;user-select:none}
[data-board-sim] .bs-menu{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6);pointer-events:auto}
[data-board-sim] .bs-menu[hidden]{display:none}
[data-board-sim] .bs-card{min-width:320px;padding:16px 20px;border-radius:8px;background:#1a1a2e;box-shadow:0 8px 32px #000}
[data-board-sim] .bs-card h2{margin:0 0 12px;font-size:14px}
[data-board-sim] .bs-card div{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
[data-board-sim] button{font:inherit;color:#fff;background:#33415c;border:0;border-radius:4px;padding:6px 10px;cursor:pointer}`;

/** True when the game runs under this simulated host (never on a real Board). */
function isSimulatedHost(win         = window)          {
  return (win.BoardSDK                                      )?.__simulated === true;
}

/** Install the simulated host. Returns false, touching nothing, when a real bridge exists. */
function installBrowserHost(win         = window)          {
  if (typeof win.BoardSDK !== "undefined") return false;
  const doc = win.document;
  const board = () => win.__board;
  const esc = (s        ) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] ?? ch);

  // --- contacts: delta frames at frame rate, exactly what the sensor host pushes
  const live = new Map              ();
  const byPointer = new Map                ();
  let pending         = [];
  let lastBatch         = [];
  let nextId = 1;
  const push = (c      , p        ) => {
    let prev                  ;
    for (let i = pending.length - 1; i >= 0 && !prev; i--) if (pending[i].id === c.id) prev = pending[i];
    if (prev && prev.p === 2 && p === 2) return void Object.assign(prev, { x: c.x, y: c.y, touched: c.touched });
    pending.push({ id: c.id, x: c.x, y: c.y, o: c.o, p, g: c.g, touched: c.touched });
  };
  const touch = { onmessage: null                                          , postMessage() {} };
  // Resting Pieces the sensor keeps re-reporting: the host's own (shift-drag) and
  // those a harness injects through __sim.emit. Deterministic jitter per contact.

  const rests = new Map              ();
  const now = () => (win.performance ? win.performance.now() : Date.now());
  const rest = (c      ) => {
    const r = rests.get(c.id) ?? { c, seed: (c.id * 2654435761) >>> 0, due: 0 };
    r.seed = (r.seed * 1664525 + 1013904223) >>> 0;
    (r.c = { ...c, p: 2, touched: 0 }), (r.due = now() + 100 + (r.seed % 601)), rests.set(c.id, r);
  };
  // Every event for a contact restarts its blip clock; a lift or a hand on it stops the blips.
  const track = (c      ) => (c.g === 0 || c.p === 3 || c.p === 4 || c.touched ? rests.delete(c.id) : rest(c));
  const blip = () => {
    const t = now();
    for (const r of rests.values()) if (t >= r.due && !pending.some((c) => c.id === r.c.id)) pending.push({ ...r.c }), rest(r.c);
  };
  let redetectIn = 0;
  const redetect = () => {
    // New observation epoch: resting Pieces are re-detected under fresh ids.
    for (const c of [...live.values()]) live.delete(c.id), (c.id = nextId++), live.set(c.id, c), push(c, 1);
  };
  const flush = () => {
    // The native overlay switches the detector off: nothing crosses the wire.
    if (menuOpen) return void (pending = []);
    if (redetectIn > 0 && --redetectIn === 0) redetect();
    blip();
    const batch = pending;
    batch.forEach(track);
    (pending = []), (lastBatch = batch);
    touch.onmessage?.(new MessageEvent("message", { data: JSON.stringify({ c: batch }) }));
  };
  const raf = (cb            ) => (win.requestAnimationFrame ? win.requestAnimationFrame(cb) : setTimeout(cb, 16));
  const loop = () => (flush(), raf(loop));
  raf(loop);
  const end = (c      ) => (live.delete(c.id), (c.touched = 0), push(c, 3));
  const endFingers = () => (live.forEach((c) => !c.resting && end(c)), byPointer.clear());
  const liftResting = () => live.forEach((c) => c.resting && end(c));
  const fromShim = (e       ) => Boolean((e.target                  )?.closest?.("[data-board-sim]"));
  const onDown = (e              ) => {
    if (menuOpen || fromShim(e)) return;
    let c                  ;
    if (e.shiftKey) for (const r of live.values()) if (r.resting && Math.hypot(r.x - e.clientX, r.y - e.clientY) < 80) c = r;
    if (c) (c.x = e.clientX), (c.y = e.clientY), (c.touched = 1), push(c, 2);
    else {
      c = { id: nextId++, x: e.clientX, y: e.clientY, o: 0, p: 1, g: e.shiftKey ? host.__sim.glyph : 0, touched: 1, resting: e.shiftKey };
      live.set(c.id, c), push(c, 1);
    }
    byPointer.set(e.pointerId, c.id);
  };
  const onMove = (e              ) => {
    const c = live.get(byPointer.get(e.pointerId) ?? -1);
    if (c) (c.x = e.clientX), (c.y = e.clientY), push(c, 2);
  };
  const onUp = (e              ) => {
    const c = live.get(byPointer.get(e.pointerId) ?? -1);
    byPointer.delete(e.pointerId);
    if (c && c.resting) (c.touched = 0), push(c, 2);
    else if (c) end(c);
  };

  // --- simulated system menu: pause/resume, quit, custom buttons, audio gains
  let ctx               = {};
  let tracks          = [];
  let menuOpen = false;
  let tracksChanged = false;
  const quits           = [];
  const restore = new Map                ();
  const root = doc.createElement("div");
  root.setAttribute("data-board-sim", "");
  root.innerHTML = `<style>${STYLE}</style><div class="bs-label">BROWSER SIMULATOR · drag: finger · shift-drag: Piece · P: menu</div><div class="bs-menu" hidden></div>`;
  (doc.body ?? doc.documentElement).appendChild(root);
  const label = root.querySelector(".bs-label")               ;
  const menu = root.querySelector(".bs-menu")               ;
  const renderMenu = () => {
    const save = ctx.offerSaveOption ? `<button data-act="save">Save &amp; quit · S</button>` : "";
    const custom = (ctx.customButtons ?? []).map((b, i) => `<button data-act="custom" data-id="${esc(b.id)}">${i + 1} · ${boardIcon(b.icon)}${boardIcon(b.icon) ? " " : ""}${esc(b.title)}</button>`);
    const audio = tracks.map((t, i) => `<button data-act="track" data-i="${i}">${["M", "N"][i] ?? "·"} · ${esc(t.name)} ${t.value}</button>`);
    menu.innerHTML = `<div class="bs-card"><h2>${esc(ctx.gameName ?? "Game")} · system menu (simulated)</h2><div><button data-act="resume">Resume · Enter</button><button data-act="quit">Quit · Q</button>${save}</div><div>${custom.join("")}</div><div>${audio.join("")}</div></div>`;
  };
  const openMenu = () => {
    if (menuOpen) return;
    (menuOpen = true), (tracksChanged = false);
    // A native overlay steals the touches and restarts the detector epoch: drop
    // fingers silently (no synthetic lift) and keep resting Pieces on the table.
    live.forEach((c) => !c.resting && live.delete(c.id));
    byPointer.clear(), rests.clear(), (pending = []), (redetectIn = 0);
    renderMenu(), (menu.hidden = false);
    board()?.onAppVisibility(false);
  };
  const closeMenu = (action        , customButtonId         ) => {
    if (!menuOpen) return;
    (menuOpen = false), (menu.hidden = true);
    const result                          = { action };
    if (customButtonId) result.customButtonId = customButtonId;
    if (tracksChanged) result.audioTracks = tracks.map((t) => ({ id: t.id, value: t.value }));
    board()?.onPauseResult(JSON.stringify(result));
    board()?.onAppVisibility(true);
    // The detector needs a few frames before a resting Piece is born again:
    // empty frames reach the game first (see redetect in flush).
    redetectIn = REDETECT_FRAMES;
  };
  const toggleTrack = (i        ) => {
    const t = tracks[i];
    if (!t) return;
    if (t.value > 0) restore.set(t.id, t.value), (t.value = 0);
    else t.value = restore.get(t.id) || 100;
    (tracksChanged = true), renderMenu();
  };
  const onKey = (e               ) => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target                  )?.tagName ?? "")) return;
    const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    if (!menuOpen) return void (k === "P" || k === "Escape" ? openMenu() : k === "Backspace" && liftResting());
    e.preventDefault();
    if (k === "Escape" || k === "Enter" || k === "P") closeMenu("RESUME");
    else if (k === "Q") closeMenu("EXIT_GAME_UNSAVED");
    else if (k === "S" && ctx.offerSaveOption) closeMenu("EXIT_GAME_SAVED");
    else if (k === "M" || k === "N") toggleTrack(k === "M" ? 0 : 1);
    else if (/^[1-9]$/.test(k) && ctx.customButtons?.[Number(k) - 1]) closeMenu("CUSTOM_ACTION", ctx.customButtons[Number(k) - 1].id);
  };
  menu.addEventListener("click", (e) => {
    const b = (e.target                  )?.closest?.("button[data-act]")                      ;
    const act = b?.dataset.act;
    if (act === "resume") closeMenu("RESUME");
    else if (act === "quit") closeMenu("EXIT_GAME_UNSAVED");
    else if (act === "save") closeMenu("EXIT_GAME_SAVED");
    else if (act === "custom") closeMenu("CUSTOM_ACTION", b?.dataset.id);
    else if (act === "track") toggleTrack(Number(b?.dataset.i));
  });
  label.addEventListener("click", () => (menuOpen ? closeMenu("RESUME") : openMenu()));
  const opts = { capture: true, passive: true };
  win.addEventListener("pointerdown", onDown, opts);
  win.addEventListener("pointermove", onMove, opts);
  win.addEventListener("pointerup", onUp, opts);
  win.addEventListener("pointercancel", onUp, opts);
  win.addEventListener("blur", endFingers);
  win.addEventListener("keydown", onKey, { capture: true });

  // --- session / avatar services, async via window.__board
  const profile             = ((win                                                 ).__boardSimProfile) ?? {};
  const startedAt = Date.now();
  const servicesDelayMs = profile.servicesDelayMs ?? 100;
  // Players and saves hold raw ids; what the session reports goes through sessionIdOf.
  const players           = [{ playerId: SIM_PROFILE_ID, sessionId: 1, name: "Player 1", type: "profile", avatarId: "0" }];
  const activeProfile = { playerId: SIM_PROFILE_ID, name: "Player 1", avatarId: "0" };
  // A Board reports a profile (a UUID) as the first 32 hex of sha256(rawId + "|" + appId) and
  // keeps guest and AI ids as they are (libboard BoardSaveGameData.hashProfileIdWithAppId).
  // The app id is the platform layer's, read when asked.
  const appIdNow = () => String((win                                                                 ).BoardPlatform?.game?.appId ?? "");
  const hashed = new Map                ();
  const sessionIdOf = (id        )         => {
    if (!PROFILE_ID.test(id)) return id;
    const key = `${id}|${appIdNow()}`;
    let out = hashed.get(key);
    if (out === undefined) hashed.set(key, (out = sha256Hex(key).slice(0, 32)));
    return out;
  };
  const seen = (p        )         => ({ ...p, playerId: sessionIdOf(p.playerId) });
  let nextRequest = 1, nextSession = 2;
  const later = (produce               )         => {
    const id = nextRequest++;
    setTimeout(() => {
      try { board()?.resolve(id, JSON.stringify(produce() ?? null)); } catch (err) { board()?.reject(id, String((err         )?.message ?? err)); }
    }, 0);
    return id;
  };
  const guest = (sessionId        )         => ({ playerId: `sim-guest-${sessionId}`, sessionId, name: `Guest ${sessionId}`, type: "guest", avatarId: "0" });
  const playersChanged = () => board()?.onPlayersChanged();
  const calls                            = {};
  const record = (name        , args           ) => void (calls[name] ??= []).push(args.length > 1 ? args : args[0]);

  // --- Board.save simulation ---
  // Saves outlive a reload of the page, as they outlive a relaunch on a Board: kept in this
  // origin's web storage through the untouched Storage methods (a game's own storage use or a
  // harness's storage faults never reach them), in memory where storage is refused (an opaque
  // preview origin). Players come from the live roster; covers only with profile.covers.
  const SAVES_KEY = "__board_sim_saves";
  let memorySaves                       = {};
  const storage = (() => {
    try { const s = win.localStorage; Storage.prototype.getItem.call(s, SAVES_KEY); return s; } catch { return null; }
  })();
  const readSaves = ()                       => {
    if (!storage) return memorySaves;
    try { return JSON.parse(Storage.prototype.getItem.call(storage, SAVES_KEY) || "{}")                        ; } catch { return {}; }
  };
  const writeSaves = (all                      ) => {
    memorySaves = all;
    if (storage) try { Storage.prototype.setItem.call(storage, SAVES_KEY, JSON.stringify(all)); } catch { /* full: memory keeps them */ }
  };
  const saveLog                                           = [];
  const saved = (id        )       => { const s = readSaves()[id]; if (!s) throw new Error(`Save ${id} not found`); return s; };
  const store = (id               , description        , data        , playedTime        , gameVersion        , cover               ) => {
    if (!String(description ?? "").trim()) throw new Error("Save description must not be blank");
    const all = readSaves();
    const old = id ? all[id] : undefined;
    if (id && !old) throw new Error(`Save ${id} not found`);
    const roster = players.map((p)             => ({ playerId: p.playerId, name: p.name, avatarId: Number(p.avatarId) || 0, type: p.type }));
    // A save's players are fixed when it is created; an update never changes them.
    const savePlayers = old ? old.meta.players : roster;
    if (!savePlayers.some((p) => p.type === "profile")) throw new Error("A save needs at least one profile");
    const now = Date.now();
    const saveId = id ?? `sim-save-${now.toString(36)}-${Object.keys(all).length + 1}`;
    const meta           = {
      id: saveId, description: String(description), createdAt: old?.meta.createdAt ?? now, updatedAt: now, playedTime, fileSize: data.length, gameVersion,
      playerCount: savePlayers.length, hasCoverImage: (cover ?? old?.cover ?? null) !== null, payloadChecksum: null, coverImageChecksum: null, players: savePlayers,
    };
    all[saveId] = { meta, data, cover: cover ?? old?.cover ?? null };
    writeSaves(all);
    saveLog.push({ op: old ? "update" : "create", id: saveId, at: now });
    return meta;
  };
  const dropPlayers = (id        , only               ) => {
    const all = readSaves();
    const s = all[id];
    if (!s) throw new Error(`Save ${id} not found`);
    s.meta.players = only ? s.meta.players.filter((p) => p.playerId !== only) : [];
    if (!s.meta.players.length) delete all[id];
    writeSaves(all);
  };
  // Loading a save reseats the session to the save's players.
  const reseat = (s      ) => {
    players.length = 0;
    for (const p of s.meta.players) players.push({ playerId: p.playerId, sessionId: nextSession++, name: p.name, type: p.type, avatarId: String(p.avatarId) });
    playersChanged();
  };
  const coverMethods = profile.covers
    ? {
        createSaveWithCover: (d        , data        , t        , v        , cover        ) => later(() => store(null, d, data, t, v, `data:image/png;base64,${cover}`)),
        updateSaveWithCover: (id        , d        , data        , t        , v        , cover        ) => later(() => void store(id, d, data, t, v, `data:image/png;base64,${cover}`)),
      }
    : {};
  const avatarPng = (avatarId        ) => {
    try {
      const c = doc.createElement("canvas"), g = c.getContext("2d") ;
      (c.width = c.height = 64), (g.fillStyle = `hsl(${(avatarId * 47) % 360} 60% 45%)`), g.beginPath(), g.arc(32, 32, 30, 0, Math.PI * 2), g.fill();
      (g.fillStyle = "#fff"), (g.font = "bold 28px sans-serif"), (g.textAlign = "center"), (g.textBaseline = "middle"), g.fillText(String(avatarId), 32, 34);
      return c.toDataURL("image/png");
    } catch { return PNG_1PX; }
  };

  const host                = {
    __simulated: true,
    __sim: {
      glyph: 1,
      emit: (contacts) => contacts.forEach((c) => pending.push({ id: c.id, x: c.x, y: c.y, o: c.orientation, p: c.phase, g: c.glyph, touched: c.touched ? 1 : 0 })),
      flush,
      get menuOpen() { return menuOpen; },
      // This host re-reports resting Pieces itself; a harness must not double the blips.
      blips: true,
      // What a harness reads: the last pause context, quits, saves and other calls.
      get context() { return ctx; },
      quits,
      saves: () => Object.values(readSaves()).map((s) => s.meta),
      saveLog,
      calls,
      sessionIdOf,
    },
    getPlayers: () => JSON.stringify(players.map(seen)),
    getPlayerCount: () => players.length,
    addGuest: (sessionId) => (players.push(guest(sessionId)), playersChanged()),
    removePlayer(sessionId) {
      const i = players.findIndex((p) => p.sessionId === sessionId);
      if (i > 0) players.splice(i, 1), playersChanged();
    },
    resetPlayers() {
      const keep = players.filter((p) => p.playerId === activeProfile.playerId);
      players.length = 0;
      players.push(...keep);
      playersChanged();
      return true;
    },
    // The active profile always reports sessionId -1, seated or not: it is not a seat.
    getActiveProfile: () => JSON.stringify({ ...activeProfile, playerId: sessionIdOf(activeProfile.playerId), sessionId: -1, type: "profile" }),
    isReady: () => true,
    areServicesReady: () => Date.now() - startedAt >= servicesDelayMs,
    getCurrentContacts: () => JSON.stringify(lastBatch.map((c) => ({ contactId: c.id, positionX: c.x, positionY: c.y, orientation: c.o, phaseId: c.p, glyphId: c.g, isTouched: c.touched }))),
    // The OS selector overlays are simulated as "a guest joined" / "dismissed".
    presentAddPlayerSelector: () => later(() => (host.addGuest(nextSession++), true)),
    presentReplacePlayerSelector: () => later(() => false),
    setAIPlayerTypes() {},
    createSave: (d, data, t, v) => later(() => store(null, d, data, t, v, null)),
    loadSave: (id) => later(() => { const s = saved(id); saveLog.push({ op: "load", id, at: Date.now() }); reseat(s); return { data: s.data }; }),
    listSaves: () => later(() => Object.values(readSaves()).map((s) => s.meta)),
    updateSave: (id, d, data, t, v) => later(() => void store(id, d, data, t, v, null)),
    ...coverMethods,
    removePlayersFromSave: (id) => later(() => dropPlayers(id, null)),
    removeActiveProfileFromSave: (id) => later(() => dropPlayers(id, activeProfile.playerId)),
    loadCoverImage: (id) => later(() => ({ dataUri: saved(id).cover })),
    getMaxSaveDataSize: () => 16 << 20,
    getMaxAppStorageSize: () => 64 << 20,
    getMaxSaveDescriptionLength: () => 100,
    getAppStorageInfo() {
      const used = Object.values(readSaves()).reduce((n, s) => n + s.data.length, 0);
      return JSON.stringify({ totalStorage: 64 << 20, usedStorage: used, remainingStorage: (64 << 20) - used, usagePercentage: used / (64 << 20) });
    },
    loadAvatarPNG: (avatarId) => later(() => ({ dataUri: avatarPng(avatarId) })),
    showProfileSwitcher() {},
    hideProfileSwitcher() {},
    // Newer Boards: hand detection, display orientation and the overlay anchor (recorded;
    // the glass never flips here).
    setHandDetectionEnabled: (enabled) => record("setHandDetectionEnabled", [enabled]),
    getDisplayOrientation: () => 0,
    setDisplayOrientation: (orientation) => record("setDisplayOrientation", [orientation]),
    setOverlayAnchor: (overlayId, anchor) => record("setOverlayAnchor", [overlayId, anchor]),
    resetOverlayAnchor: (overlayId) => record("resetOverlayAnchor", [overlayId]),
    setPauseContext(json) {
      ctx = JSON.parse(json);
      tracks = (ctx.audioTracks ?? []).map(hostTrack);
    },
    updatePauseContext(json) {
      const partial = JSON.parse(json)                ;
      ctx = { ...ctx, ...partial };
      if (partial.audioTracks) tracks = partial.audioTracks.map(hostTrack);
    },
    clearPauseContext: () => void ((ctx = {}), (tracks = [])),
    getPauseResult: () => "null",
    quit() {
      quits.push(Date.now());
      // Under a capture (the boot check) the quit is recorded and the page stays.
      if (profile.capture) return void (label.textContent = "BROWSER SIMULATOR · game quit");
      // The launcher analog in a browser: reload back to the title screen.
      label.textContent = "BROWSER SIMULATOR · game quit · reloading";
      setTimeout(() => win.location.reload(), 300);
    },
  };
  (win.BoardSDK = host), (win.boardTouch = touch);
  return true;
}

if (typeof window !== "undefined") installBrowserHost(window);
})();
