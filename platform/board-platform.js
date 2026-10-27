// Board platform layer: what every Studio game gets from the platform, whatever its
// code does.
//
// Written by the Studio controller (web Studio lane and Create Game lane) into the
// build output as board-platform.js, next to the entry HTML, AFTER the build and
// outside the files the builder can edit. The entry loads it with a plain
// <script src> first in <head> (an inline script would be refused by Board
// Browser's script-src 'self' for Studio games), so it runs before any game module
// and no game code can skip it. It replaces the older board-exit-guard.js.
//
// What it does (the contract is plans/board-platform-layer/PLATFORM-API.md):
// - window.BoardPlatform, defined synchronously: { version, source, game, state,
//   audio, menu } (board-platform.d.ts). The game reads its name from here (Rename
//   re-stamps it without a rebuild), so the name is never a literal in game code.
// - document.title is the game's name.
// - The system pause menu: a context is registered at startup and re-sent after
//   every result, so the menu always opens. It carries the game's id and name,
//   never a Save & Exit choice (offerSaveOption is always false: saving is
//   continuous), the game's own buttons (BoardPlatform.menu, or a direct
//   Board.pause.setContext, merged), then the platform's Mute, and the platform's
//   Music and Effects sliders (integers 0-100).
// - Audio: every AudioContext's destination is a platform master gain (Mute);
//   music and effects levels apply to the starter's buses, to WebAudio buffer
//   sources (looping or 15 s and longer is music, the rest effects) and to
//   <audio>/<video> volumes. Levels are remembered per profile in the save slot.
// - Saves (BoardPlatform.state): one "<Game> · Autosave" Board.save slot per
//   signed-in profile, restored at boot and written on change (debounced), when the
//   menu opens or the app is backgrounded, on a timer and on exit. Guests and
//   sessions without Board services keep state in memory.
// - "Exit to Library" always leaves the game: the platform flushes the save, lets
//   the game's own handler run, then calls the host's quit within the grace period.
//
// The platform never throws into the game: every method is guarded, async methods
// never reject, and failures land in BoardPlatform.state.status().lastError.
//
// Stand-down rules:
// - window.__boardPlatform marks a running copy; the first copy to load owns the
//   page and any later copy does nothing.
// - window.__boardExitGuard, defined by Board Browser for Studio games, means the
//   host owns the exit (and its own grace timer). This copy then only flushes on
//   exit, and keeps everything else.
//
// The configuration line below is filled in (and re-stamped by Rename) by the
// controller: keep it on one line with its marker comment.
(function () {
  "use strict";
  var w = window;
  if (w.__boardPlatform) return;
  var VERSION = "0.2.0";
  var cfg = /*BOARD_PLATFORM_CONFIG*/ {"v":2,"game":{"name":"","appId":""},"exit":{"unsavedMs":500,"savedMs":5000},"audio":{"music":true,"sfx":true,"defaults":{"music":70,"sfx":90}},"state":{"build":"","slot":"boardstate/1","maxBytes":1048576}};

  // --- small helpers -------------------------------------------------------------
  const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  const obj = (v) => (isObj(v) ? v : {});
  const str = (v) => (typeof v === "string" ? v : "");
  const num = (v, fallback) => (typeof v === "number" && isFinite(v) ? v : fallback);
  const now = () => Date.now();
  const level = (v, fallback) => {
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
    return isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fallback;
  };
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const parse = (text) => {
    try {
      return typeof text === "string" ? JSON.parse(text) : null;
    } catch (e) {
      return null;
    }
  };
  const later = (fn, ms) => setTimeout(fn, ms);
  const say = (level, message, detail) => {
    try {
      const c = w.console;
      if (c && typeof c[level] === "function") c[level]("[board-platform] " + message, detail === undefined ? "" : detail);
    } catch (e) {
      /* no console */
    }
  };

  // --- configuration -------------------------------------------------------------
  cfg = obj(cfg);
  const game = obj(cfg.game);
  const gameName = str(game.name);
  const appId = str(game.appId);
  const configV = num(cfg.v, 1);
  const exitCfg = obj(cfg.exit);
  const unsavedMs = num(exitCfg.unsavedMs, 500);
  const savedMs = num(exitCfg.savedMs, 5000);
  const audioCfg = obj(cfg.audio);
  const musicOn = audioCfg.music !== false;
  const sfxOn = audioCfg.sfx !== false;
  const audioDefaults = obj(audioCfg.defaults);
  const stateCfg = obj(cfg.state);
  // A v1 configuration has no build: runs then never restore (progress still does).
  const BUILD = str(stateCfg.build);
  const SLOT = str(stateCfg.slot) || "boardstate/1";
  const MAX_BYTES = num(stateCfg.maxBytes, 1048576);
  const pauseName = gameName || "Board game";
  const hostOwnsExit = !!w.__boardExitGuard;

  // Timings (PLATFORM-API.md section 2).
  const SERVICES_POLL_MS = 100;
  const SERVICES_CAP_MS = 3000;
  // How long a restore may still land after ready() resolved at SERVICES_CAP_MS: a Board whose
  // main thread stalls delivers every bridge answer late (URR5X, first launch after install:
  // the touch model's hot load held it 5.8 s).
  const RESTORE_HARD_CAP_MS = 15000;
  const ROSTER_POLL_MS = 500;
  const LOAD_MIN_MS = 1000;
  // Held back from a duplicate load's cap: a WebView fires timers late, and the kept slot must
  // still have LOAD_MIN_MS when a hung duplicate's cap runs out.
  const LOAD_SLACK_MS = 150;
  const DEBOUNCE_MS = 1000;
  const MIN_WRITE_GAP_MS = 5000;
  const MAX_DEFER_MS = 10000;
  const TIMER_MS = 30000;
  const CALL_TIMEOUT_MS = 10000;
  const RETRY_CAP_MS = 30000;
  const MUSIC_SECONDS = 15;
  const MAX_BUTTONS = 4;
  const MUTE_ID = "board.mute";
  const MUSIC_ID = "board.music";
  const SFX_ID = "board.sfx";
  const ICONS = { circulararrow: "circular_arrow", doorwitharrow: "door_with_arrow", leftarrow: "left_arrow", square: "square" };

  // Diagnostics for the boot check and device QA; not an API for games.
  var exitState = {
    hostOwnsExit: hostOwnsExit,
    pushes: 0,
    lastAction: null,
    armed: false,
    quitAt: 0,
    contextSet: false,
    contextForced: false,
  };
  try {
    Object.defineProperty(w, "__boardPlatform", {
      value: Object.freeze({ version: VERSION, source: "bundle", exit: exitState, diag: () => diag() }),
      enumerable: false,
    });
  } catch (e) {
    return;
  }

  // Wrap a public method so it never throws into the game.
  const guard = (fn, fallback) =>
    function () {
      try {
        return fn.apply(this, arguments);
      } catch (e) {
        note(e);
        return typeof fallback === "function" ? fallback() : fallback;
      }
    };

  // --- the state record ----------------------------------------------------------
  const st = {
    phase: "booting",
    reason: null,
    persistent: false,
    slotId: null,
    profileId: null,
    switched: false,
    progress: {},
    run: undefined,
    hasRun: false,
    restoredRun: undefined,
    pending: {},
    pendingRun: undefined,
    hasPendingRun: false,
    pendingClear: false,
    extra: {},
    extraPlatform: {},
    storedAudio: {},
    lastKey: null,
    tooLargeKey: null,
    lastSavedAt: null,
    lastWriteAt: 0,
    lastError: null,
    bytes: 0,
    writes: 0,
    played: 0,
    foregroundSince: null,
    usage: { set: 0, save: 0, clear: 0, load: 0 },
    merged: 0,
    retired: 0,
    slotsAfterRetire: null,
    restoredLate: false,
    levelsChanged: false,
  };

  function note(err) {
    st.lastError = typeof err === "string" ? err : "error: " + String((err && err.message) || err).slice(0, 200);
  }

  // --- audio levels ----------------------------------------------------------------
  // An off class (builder sound settings) has no slider and is pinned at 100, so a long
  // effect misclassified as music is never silently quiet.
  const levels = {
    music: musicOn ? level(audioDefaults.music, 70) : 100,
    sfx: sfxOn ? level(audioDefaults.sfx, 90) : 100,
    muted: false,
  };
  const audioListeners = [];

  // --- the pause context -------------------------------------------------------------
  let gameExtra = {};
  let gameButtons = [];
  let gameTracks = [];
  let aliases = [];
  let lastContext = null;
  let lastContextJson = null;
  const buttonListeners = [];

  const selfApplying = () => aliases.length > 0;

  function cleanButtons(list) {
    const out = [];
    for (const b of Array.isArray(list) ? list : []) {
      if (!isObj(b)) continue;
      const id = str(b.id);
      if (!id || id.indexOf("board.") === 0) continue;
      const button = {};
      for (const k in b) if (Object.prototype.hasOwnProperty.call(b, k)) button[k] = b[k];
      button.id = id;
      button.title = str(b.title) || str(b.label) || id;
      if (typeof b.icon === "string") button.icon = ICONS[b.icon.toLowerCase().replace(/[^a-z]/g, "")] || b.icon;
      out.push(button);
      if (out.length >= MAX_BUTTONS) break;
    }
    return out;
  }

  // A game's own tracks: one that reads as music or effects becomes an alias of the
  // platform's slider (the game is then self-applying); others pass through.
  function absorbTracks(list) {
    const passed = [];
    const found = [];
    for (const t of Array.isArray(list) ? list : []) {
      if (!isObj(t)) continue;
      const id = str(t.id);
      if (id.indexOf("board.") === 0) continue;
      const words = id + " " + str(t.name);
      if (/music|bgm|soundtrack|theme/i.test(words)) found.push({ id: id, cls: "music" });
      else if (/sfx|effect|sound|fx/i.test(words)) found.push({ id: id, cls: "sfx" });
      else passed.push(t);
    }
    gameTracks = passed;
    const was = selfApplying();
    aliases = found;
    if (was !== selfApplying()) applyAudio();
  }

  function absorbContext(context, partial) {
    if (!partial) gameExtra = {};
    for (const k in context) {
      if (!Object.prototype.hasOwnProperty.call(context, k)) continue;
      if (k === "customButtons") gameButtons = cleanButtons(context.customButtons);
      else if (k === "audioTracks") absorbTracks(context.audioTracks);
      else if (k !== "gameId" && k !== "offerSaveOption") gameExtra[k] = context[k];
    }
    if (!partial && !Object.prototype.hasOwnProperty.call(context, "audioTracks")) absorbTracks([]);
  }

  function mergedContext() {
    const c = {};
    for (const k in gameExtra) c[k] = gameExtra[k];
    if (appId) c.gameId = appId;
    c.gameName = gameName || str(gameExtra.gameName) || pauseName;
    c.offerSaveOption = false;
    const buttons = gameButtons.slice(0, MAX_BUTTONS);
    if (musicOn || sfxOn) buttons.push({ id: MUTE_ID, title: levels.muted ? "Unmute" : "Mute", icon: "square" });
    if (buttons.length) c.customButtons = buttons;
    const tracks = [];
    if (musicOn) tracks.push({ id: MUSIC_ID, name: "Music", value: levels.music });
    if (sfxOn) tracks.push({ id: SFX_ID, name: "Effects", value: levels.sfx });
    for (const t of gameTracks) tracks.push(t);
    if (tracks.length) c.audioTracks = tracks;
    return c;
  }

  // The platform's own sends go to the method underneath its forcing (bound to the real
  // bridge object), so they are not taken for a game's.
  function sendContext() {
    try {
      const sdk = w.BoardSDK;
      const fn = sdk && sdk.setPauseContext;
      if (typeof fn !== "function") return;
      const context = mergedContext();
      lastContext = context;
      lastContextJson = JSON.stringify(context);
      const raw = rawOf.get(fn);
      if (raw) raw(lastContextJson);
      else fn.call(sdk, lastContextJson);
      exitState.contextSet = true;
    } catch (e) {
      note(e);
    }
  }

  // A game's direct call (forbidden, merged anyway): the game's part is kept and the
  // merged context goes to the host in its place.
  function interceptContext(method, value) {
    if (typeof value === "string" && value === lastContextJson) return value;
    let parsed = value;
    if (typeof value === "string") parsed = parse(value);
    if (!isObj(parsed)) return value;
    absorbContext(parsed, method === "updatePauseContext");
    const context = mergedContext();
    lastContext = context;
    lastContextJson = JSON.stringify(context);
    return typeof value === "string" ? lastContextJson : context;
  }

  // A forced method's unforced call (the platform's own sends), never reachable from it.
  const rawOf = new WeakMap();

  // The forced version of a pause method: the context is merged, then goes to fn on the
  // bridge object. Anything that is not a function passes through unchanged, and a
  // function already forced is not wrapped twice. clearPauseContext re-sends the
  // platform's base context instead (the menu must always open).
  function forcedVersion(sdk, method, fn) {
    if (typeof fn !== "function" || fn.__boardPlatformContext) return fn;
    let forced;
    if (method === "clearPauseContext") {
      forced = function () {
        try {
          gameExtra = {};
          gameButtons = [];
          absorbTracks([]);
          sendContext();
          return undefined;
        } catch (e) {
          return fn.apply(sdk, arguments);
        }
      };
    } else {
      forced = function () {
        const args = Array.prototype.slice.call(arguments);
        if (args.length) {
          try {
            args[0] = interceptContext(method, args[0]);
          } catch (e) {
            /* pass the game's context through unchanged */
          }
        }
        return fn.apply(sdk, args);
      };
    }
    forced.__boardPlatformContext = true;
    rawOf.set(forced, function () {
      return fn.apply(sdk, arguments);
    });
    return forced;
  }

  // window.BoardSDK as the game sees it: a Proxy over the host's bridge object. On a Board
  // the bridge is a Java object (addJavascriptInterface): its methods are own data
  // properties that ignore defineProperty and assignment, and they throw unless called
  // on the real object. So the platform never touches the object itself. The proxy's get
  // returns the forced pause methods, and every other method bound to the real object
  // (cached, so its identity is stable while the host's method is). An assignment
  // through the proxy (a test host or QA probe swapping a method) goes to the object, and
  // the next read forces the new method.
  //
  // A frozen host, or one whose methods are non-configurable and non-writable, would break
  // the Proxy's get invariant (it must then return the method itself); the device's bridge
  // reports its methods writable and configurable.
  const PAUSE_METHODS = { setPauseContext: 1, updatePauseContext: 1, clearPauseContext: 1 };

  // setAIPlayerTypes with an empty list (the web SDK sends JSON "[]") raises the Board's native
  // "Invalid AI player types" error. Games released before the seats guidance changed still
  // call it for a humans-only selector, which is what the Board does with no AI types
  // registered anyway: the call becomes a no-op that returns as a success does.
  // Once the game has registered a non-empty list, an empty one passes through: the game is
  // clearing its AI types, and the Board's answer is its own.
  let aiTypesSent = false;
  function aiTypesVersion(sdk, fn) {
    return function () {
      const arg = arguments[0];
      let list = arg;
      if (typeof arg === "string") list = parse(arg);
      if (arguments.length && Array.isArray(list)) {
        if (list.length === 0 && !aiTypesSent) return undefined;
        if (list.length > 0) aiTypesSent = true;
      }
      return fn.apply(sdk, arguments);
    };
  }

  // The game seating players itself (directly or through the SDK): a late restore then never
  // resets the roster on its own (lateGate). The platform's own calls (sync) do not count.
  const SEAT_METHODS = { addGuest: 1, removePlayer: 1, resetPlayers: 1, presentAddPlayerSelector: 1, presentReplacePlayerSelector: 1 };
  let ownCall = false;
  // Every seating call the game makes, counted: a forced restore puts guests back only if the
  // game has not changed the roster since its snapshot.
  let seatCalls = 0;
  function seatingVersion(sdk, fn) {
    return function () {
      if (!ownCall) {
        gameSeated = true;
        seatCalls++;
      }
      return fn.apply(sdk, arguments);
    };
  }
  const proxies = new WeakMap();
  const ourProxies = new WeakSet();

  function proxify(raw) {
    if (!raw || (typeof raw !== "object" && typeof raw !== "function")) return raw;
    if (ourProxies.has(raw)) return raw;
    const known = proxies.get(raw);
    if (known) return known;
    const cache = new Map();
    const proxy = new Proxy(raw, {
      get(target, prop) {
        let value;
        try {
          value = target[prop];
        } catch (e) {
          return undefined;
        }
        if (typeof value !== "function") return value;
        const hit = cache.get(prop);
        if (hit && hit.raw === value) return hit.out;
        const out = Object.prototype.hasOwnProperty.call(PAUSE_METHODS, prop)
          ? forcedVersion(target, prop, value)
          : prop === "setAIPlayerTypes"
            ? aiTypesVersion(target, value)
            : Object.prototype.hasOwnProperty.call(SEAT_METHODS, prop)
              ? seatingVersion(target, value)
              : function () {
                  return value.apply(target, arguments);
                };
        cache.set(prop, { raw: value, out: out });
        return out;
      },
      set(target, prop, value) {
        try {
          target[prop] = value;
        } catch (e) {
          /* a read-only host keeps its own */
        }
        return true;
      },
    });
    proxies.set(raw, proxy);
    ourProxies.add(proxy);
    return proxy;
  }

  // Honest: true only when the pause methods read through window.BoardSDK are the
  // platform's forced versions.
  function checkForced() {
    let forced = false;
    try {
      const sdk = w.BoardSDK;
      const set = sdk && sdk.setPauseContext;
      const update = sdk && sdk.updatePauseContext;
      forced =
        !!sdk &&
        ourProxies.has(sdk) &&
        typeof set === "function" &&
        set.__boardPlatformContext === true &&
        (typeof update !== "function" || update.__boardPlatformContext === true);
    } catch (e) {
      forced = false;
    }
    exitState.contextForced = forced;
    return forced;
  }

  // A newly seen bridge: register the context once and start the restore. The tick only
  // re-installs the proxy; a context registered late by the tick would replace the game's.
  let sdkAdopted = false;
  function adoptSdk(sdk, quiet) {
    if (!sdk || (typeof sdk !== "object" && typeof sdk !== "function")) return;
    checkForced();
    if (quiet || exitState.contextSet) return;
    sendContext();
    if (!sdkAdopted) {
      sdkAdopted = true;
      startRestore();
    }
  }

  // --- pause results -----------------------------------------------------------------
  // The menu pushes the player's choice as window.__board.onPauseResult(json) before the
  // web SDK's handler sees it. The platform applies its sliders and Mute, tells
  // BoardPlatform.menu listeners about game buttons, handles exit, and forwards a result
  // rewritten for the game: no board.* tracks (aliased game ids get the slider values),
  // and Mute reads as a plain RESUME.
  function onPush(json) {
    exitState.pushes++;
    const raw = parse(String(json));
    if (!isObj(raw)) {
      exitState.lastAction = null;
      cancelExit();
      return json;
    }
    const action = typeof raw.action === "string" ? raw.action : null;
    exitState.lastAction = action;
    cancelExit();
    let changed = false;
    const tracks = Array.isArray(raw.audioTracks) ? raw.audioTracks : null;
    for (const t of tracks || []) {
      if (!isObj(t)) continue;
      if (t.id === MUSIC_ID && musicOn) changed = setLevel("music", t.value) || changed;
      else if (t.id === SFX_ID && sfxOn) changed = setLevel("sfx", t.value) || changed;
    }
    const mute = action === "CUSTOM_ACTION" && raw.customButtonId === MUTE_ID && (musicOn || sfxOn);
    if (mute) {
      levels.muted = !levels.muted;
      changed = true;
    }
    let out = raw;
    let rewritten = false;
    if (mute) {
      out = { action: "RESUME" };
      rewritten = true;
    }
    if (tracks) {
      const kept = [];
      for (const t of tracks) if (!isObj(t) || str(t.id).indexOf("board.") !== 0) kept.push(t);
      for (const a of aliases) kept.push({ id: a.id, value: levels[a.cls] });
      if (kept.length !== tracks.length || aliases.length || rewritten) {
        if (!rewritten) {
          out = {};
          for (const k in raw) out[k] = raw[k];
          rewritten = true;
        }
        if (kept.length) out.audioTracks = kept;
        else delete out.audioTracks;
      }
    }
    if (changed) {
      st.levelsChanged = true;
      applyAudio();
      markDirty();
    }
    if (action === "CUSTOM_ACTION" && !mute && typeof raw.customButtonId === "string") {
      for (const cb of buttonListeners.slice()) {
        try {
          cb(raw.customButtonId);
        } catch (e) {
          note(e);
        }
      }
    }
    if (action === "EXIT_GAME_UNSAVED" || action === "EXIT_GAME_SAVED") beginExit(action);
    else if (action) sendContext();
    return rewritten ? JSON.stringify(out) : json;
  }

  function onVisibility(visible) {
    if (visible === false) {
      foreground(false);
      checkProfile();
      forceDeferred("menu");
      writeSoon("menu");
    } else if (visible === true) {
      foreground(true);
    }
  }

  const HOOKS = {
    onPauseResult: (args) => {
      args[0] = onPush(args[0]);
    },
    onAppVisibility: (args) => {
      onVisibility(args[0]);
    },
  };

  function hooked(prop, fn) {
    if (typeof fn !== "function") return null;
    if (fn.__boardPlatformHook) return fn;
    const run = HOOKS[prop];
    const h = function () {
      const args = Array.prototype.slice.call(arguments);
      try {
        run(args);
      } catch (e) {
        /* never let the platform break the game's own handler */
      }
      return fn.apply(this, args);
    };
    h.__boardPlatformHook = true;
    return h;
  }

  function platformOnly(prop) {
    return function () {
      try {
        HOOKS[prop](Array.prototype.slice.call(arguments));
      } catch (e) {
        /* ignore */
      }
    };
  }

  // Make obj[prop] always pass through the platform, even if the page later reassigns it.
  function hookProp(target, prop) {
    try {
      const d = Object.getOwnPropertyDescriptor(target, prop);
      if (d && d.get && d.get.__boardPlatformHook) return;
      if (d && d.configurable === false) return;
      let current = hooked(prop, target[prop]);
      const fallback = platformOnly(prop);
      const get = function () {
        return current || fallback;
      };
      get.__boardPlatformHook = true;
      Object.defineProperty(target, prop, {
        configurable: true,
        enumerable: true,
        get: get,
        set: function (v) {
          current = hooked(prop, v);
        },
      });
    } catch (e) {
      /* frozen hooks object: the host-side fallback still applies */
    }
  }

  function hookBoard(target) {
    if (!target || (typeof target !== "object" && typeof target !== "function")) return target;
    hookProp(target, "onPauseResult");
    hookProp(target, "onAppVisibility");
    return target;
  }

  // The web SDK installs window.__board when it loads (and returns early if one is
  // already there, so this layer creates one only when it must make a call before any
  // SDK did); catch that assignment.
  let board = hookBoard(w.__board);
  try {
    Object.defineProperty(w, "__board", {
      configurable: true,
      enumerable: true,
      get: function () {
        return board;
      },
      set: function (v) {
        board = hookBoard(v);
      },
    });
  } catch (e) {
    /* covered by the re-check below */
  }

  // --- exit to library -----------------------------------------------------------------
  let exitTimer = null;
  let exitToken = 0;

  function hostQuit() {
    try {
      const sdk = w.BoardSDK;
      if (sdk && typeof sdk.quit === "function") {
        exitState.quitAt = now();
        sdk.quit();
      }
    } catch (e) {
      /* the host is gone or refused; nothing else can exit from here */
    }
  }

  function cancelExit() {
    exitToken++;
    if (exitTimer !== null) clearTimeout(exitTimer);
    exitTimer = null;
    exitState.armed = false;
  }

  // Flush, let the game's own handler run (the result is forwarded right after this
  // returns), then quit when the flush settles or the grace runs out, whichever first.
  // Where the host owns the exit it runs its own timer: the platform only flushes.
  function beginExit(action) {
    const token = ++exitToken;
    // A deferred restore lands first (within the grace), so the exit's write holds it.
    const deferred = forceDeferred("exit");
    const flushing = deferred ? deferred.then(() => writeNow("exit")) : writeNow("exit");
    if (hostOwnsExit) return;
    exitState.armed = true;
    const go = () => {
      if (token !== exitToken) return;
      exitToken++;
      if (exitTimer !== null) clearTimeout(exitTimer);
      exitTimer = null;
      exitState.armed = false;
      hostQuit();
    };
    exitTimer = later(go, action === "EXIT_GAME_SAVED" ? savedMs : unsavedMs);
    flushing.then(() => later(go, 0));
  }

  // --- bridge calls --------------------------------------------------------------------
  // The SDK's async envelope: the host answers through window.__board.resolve/reject. The
  // platform never creates window.__board: the SDK's initAsyncBridge returns early when one
  // exists, so a platform-made one would cut the SDK's own pause and visibility handlers. It
  // waits for the SDK's (every packed game imports the SDK; one that loads it late simply
  // restores late, or not at all past the restore's hard cap).
  function sdkBoard() {
    const b = w.__board;
    return b && b._pending && typeof b._pending.set === "function" ? b : null;
  }

  function call(method) {
    return callWithin(CALL_TIMEOUT_MS, method, Array.prototype.slice.call(arguments, 1));
  }

  // A restore's own calls stay open until the restore's hard cap (and a little past it, so the
  // cap, not the call, decides): a stalled Board answers them late, not never.
  function restoreCall(method) {
    const ms = Math.max(CALL_TIMEOUT_MS, hardLeft() + 1000);
    return callWithin(ms, method, Array.prototype.slice.call(arguments, 1));
  }

  function callWithin(timeoutMs, method, args) {
    return new Promise((resolve, reject) => {
      const sdk = w.BoardSDK;
      const fn = sdk && sdk[method];
      if (typeof fn !== "function") return reject(new Error("BoardSDK." + method + " is not a function"));
      const b = sdkBoard();
      if (!b) return reject(new Error("the web SDK's bridge is not installed"));
      let timer = null;
      const id = fn.apply(sdk, args);
      b._pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      timer = later(() => {
        if (b._pending.get(id)) b._pending.delete(id);
        reject(new Error(method + " timed out"));
      }, timeoutMs);
    });
  }

  function sync(method) {
    const sdk = w.BoardSDK;
    const fn = sdk && sdk[method];
    if (typeof fn !== "function") return undefined;
    const outer = ownCall;
    ownCall = true;
    try {
      return fn.apply(sdk, Array.prototype.slice.call(arguments, 1));
    } finally {
      ownCall = outer;
    }
  }

  function activeProfile() {
    try {
      const p = parse(sync("getActiveProfile"));
      return isObj(p) && typeof p.playerId === "string" && p.playerId ? p : null;
    } catch (e) {
      return null;
    }
  }

  // --- payload encoding ----------------------------------------------------------------
  function utf8(text) {
    if (typeof w.TextEncoder === "function") return new w.TextEncoder().encode(text);
    const s = unescape(encodeURIComponent(text));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  function base64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return w.btoa(binary);
  }

  function decodePayload(data) {
    if (typeof data !== "string" || !data) return null;
    const binary = w.atob(data);
    let text;
    if (typeof w.TextDecoder === "function") {
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      text = new w.TextDecoder().decode(bytes);
    } else {
      text = decodeURIComponent(escape(binary));
    }
    return parse(text);
  }

  // --- the save content ------------------------------------------------------------------
  // The run as JSON; a run that is not JSON (a cycle) is left out, and reported when a
  // write leaves it out.
  function runText(report) {
    if (!st.hasRun || st.run === undefined) return undefined;
    try {
      return JSON.stringify(st.run);
    } catch (e) {
      if (report) st.lastError = "run-not-json";
      return undefined;
    }
  }

  function storedAudio() {
    const a = {};
    for (const k in st.storedAudio) a[k] = st.storedAudio[k];
    if (musicOn) a.music = levels.music;
    if (sfxOn) a.sfx = levels.sfx;
    if (musicOn || sfxOn) a.muted = levels.muted;
    return a;
  }

  // What the slot holds, apart from the time stamps: unchanged content is never rewritten.
  function contentKey() {
    return JSON.stringify([BUILD, storedAudio(), st.progress, runText() || null]);
  }

  function playedSeconds() {
    return st.played + (st.foregroundSince !== null ? (now() - st.foregroundSince) / 1000 : 0);
  }

  function foreground(on) {
    if (st.phase === "booting") return;
    if (!on && st.foregroundSince !== null) {
      st.played = playedSeconds();
      st.foregroundSince = null;
    } else if (on && st.foregroundSince === null) {
      st.foregroundSince = now();
    }
  }

  function maxBytes() {
    let cap = MAX_BYTES;
    try {
      const host = sync("getMaxSaveDataSize");
      if (typeof host === "number" && host > 0) cap = Math.min(cap, host);
    } catch (e) {
      /* the config cap stands */
    }
    return cap;
  }

  function payloadBytes() {
    const body = {};
    for (const k in st.extra) body[k] = st.extra[k];
    body.schema = "board.state";
    body.v = 1;
    body.build = BUILD;
    body.savedAt = now();
    body.playedSeconds = Math.floor(playedSeconds());
    const plat = {};
    for (const k in st.extraPlatform) plat[k] = st.extraPlatform[k];
    plat.audio = storedAudio();
    body.platform = plat;
    body.progress = st.progress;
    const run = runText(true);
    let text = JSON.stringify(body);
    if (run !== undefined) text = text.slice(0, -1) + ',"run":' + run + "}";
    const cap = maxBytes();
    let bytes = utf8(text);
    let dropped = false;
    if (bytes.length > cap && run !== undefined) {
      bytes = utf8(JSON.stringify(body));
      dropped = true;
    }
    return { bytes: bytes, dropped: dropped, tooLarge: bytes.length > cap };
  }

  function description() {
    const suffix = gameName ? " · Autosave" : "Autosave";
    let max = 100;
    try {
      const host = sync("getMaxSaveDescriptionLength");
      if (typeof host === "number" && host > 0) max = host;
    } catch (e) {
      /* 100, the Board's limit today */
    }
    if (!gameName) return suffix.slice(0, max);
    if (max <= suffix.length) return (gameName + suffix).slice(0, max);
    return gameName.slice(0, max - suffix.length) + suffix;
  }

  // --- the writer: one write in flight, one queued ------------------------------------------
  let inflight = null;
  let queued = false;
  let debounceTimer = null;
  let retryTimer = null;
  let retryMs = 0;
  let firstDirtyAt = 0;

  function isDirty() {
    return st.phase !== "booting" && contentKey() !== st.lastKey;
  }

  function checkProfile() {
    if (!st.persistent || st.switched || !st.profileId) return;
    const active = activeProfile();
    if (!active || active.playerId !== st.profileId) st.switched = true;
  }

  async function doWrite() {
    if (!st.persistent) return false;
    checkProfile();
    const key = contentKey();
    if (st.slotId && key === st.lastKey) {
      firstDirtyAt = 0;
      if (st.switched) goMemoryOnly("profile-switched");
      return true;
    }
    // Progress alone over the cap: the host would refuse every write, so none is sent
    // until the content changes.
    if (key === st.tooLargeKey) return false;
    const built = payloadBytes();
    if (built.tooLarge) {
      st.tooLargeKey = key;
      st.lastError = "too-large";
      firstDirtyAt = 0;
      return false;
    }
    const data = base64(built.bytes);
    const played = Math.floor(playedSeconds());
    try {
      if (st.slotId) {
        await call("updateSave", st.slotId, description(), data, played, SLOT);
      } else {
        const meta = await call("createSave", description(), data, played, SLOT);
        st.slotId = isObj(meta) && typeof meta.id === "string" ? meta.id : null;
        if (!st.slotId) throw new Error("createSave returned no id");
      }
    } catch (e) {
      st.lastError = "write-failed: " + String((e && e.message) || e).slice(0, 160);
      scheduleRetry();
      return false;
    }
    st.lastKey = key;
    st.lastSavedAt = now();
    st.lastWriteAt = st.lastSavedAt;
    st.bytes = built.bytes.length;
    st.writes++;
    retryMs = 0;
    firstDirtyAt = 0;
    if (built.dropped) st.lastError = "run-too-large";
    else if (st.lastError && st.lastError.indexOf("write-failed") === 0) st.lastError = null;
    if (st.switched) goMemoryOnly("profile-switched");
    return true;
  }

  function goMemoryOnly(why) {
    st.persistent = false;
    st.phase = "memory-only";
    st.lastError = why;
  }

  function writeNow(reason) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
    if (st.phase === "booting") return ready().then(() => writeNow(reason));
    if (!st.persistent) return Promise.resolve(false);
    if (inflight) {
      queued = true;
      return inflight.then(() => (inflight ? inflight : Promise.resolve())).then(() => holdsCurrent());
    }
    inflight = doWrite()
      .catch((e) => {
        note(e);
        return false;
      })
      .then((ok) => {
        inflight = null;
        if (queued) {
          queued = false;
          return writeNow(reason);
        }
        return ok;
      });
    return inflight;
  }

  function holdsCurrent() {
    try {
      return !!st.persistent && !!st.slotId && contentKey() === st.lastKey;
    } catch (e) {
      return false;
    }
  }

  // An immediate trigger (menu open, backgrounded): bypasses the debounce.
  function writeSoon(reason) {
    retryMs = 0;
    clearTimeout(retryTimer);
    retryTimer = null;
    writeNow(reason).catch(() => {});
  }

  function scheduleRetry() {
    retryMs = retryMs ? Math.min(RETRY_CAP_MS, retryMs * 2) : 1000;
    clearTimeout(retryTimer);
    retryTimer = later(() => {
      retryTimer = null;
      writeNow("retry").catch(() => {});
    }, retryMs);
  }

  // A change: trailing debounce of 1 s, at most one write per 5 s, never deferred more
  // than 10 s past the first unwritten change.
  function markDirty() {
    if (st.phase === "booting" || !st.persistent) return;
    retryMs = 0;
    clearTimeout(retryTimer);
    retryTimer = null;
    const t = now();
    if (!firstDirtyAt) firstDirtyAt = t;
    const due = Math.min(Math.max(t + DEBOUNCE_MS, st.lastWriteAt + MIN_WRITE_GAP_MS), firstDirtyAt + MAX_DEFER_MS);
    clearTimeout(debounceTimer);
    debounceTimer = later(() => {
      debounceTimer = null;
      writeNow("change").catch(() => {});
    }, Math.max(0, due - t));
  }

  // --- restore at boot -------------------------------------------------------------------------
  let readyResolve = null;
  let readyResult = null;
  const readyPromise = new Promise((resolve) => {
    readyResolve = resolve;
  });
  function ready() {
    return readyPromise;
  }

  let domReady = !(w.document && w.document.readyState === "loading");
  try {
    if (!domReady)
      w.document.addEventListener("DOMContentLoaded", () => {
        domReady = true;
      });
  } catch (e) {
    domReady = true;
  }

  // ready() has one deadline, 3 s after the platform loaded: past it, it resolves in memory
  // ("services-timeout"), so a game never waits on a slow Board. The restore itself goes on
  // until RESTORE_HARD_CAP_MS, and an answer that lands after ready() is still applied
  // (applyLate): adopted whole while the game has recorded nothing, merged under the game's own
  // values once it has. Only a Board still silent at the hard cap leaves the session in memory
  // for good, with lastError "services-timeout".
  let restoreStarted = false;
  // The restore is over: applied, or given up. Nothing lands after it.
  let restoreOver = false;
  // ready() resolved at the deadline while the restore was still running.
  let late = false;
  // A late restore waiting for the roster to be the signed-in profile alone (lateGate).
  let rosterWait = false;
  const bootAt = now();
  const restoreLeft = () => bootAt + SERVICES_CAP_MS - now();
  const hardLeft = () => bootAt + RESTORE_HARD_CAP_MS - now();
  let deadlinePassed = null;
  const atDeadline = new Promise((resolve) => {
    deadlinePassed = resolve;
  });
  const restoreListeners = [];

  function startRestore() {
    if (restoreStarted) return;
    restoreStarted = true;
    later(onDeadline, Math.max(0, restoreLeft()));
    later(() => {
      // A Board that answered and a restore waiting only on the game's roster are not timeouts.
      if (!restoreOver && !rosterWait) abandonRestore("services-timeout");
    }, Math.max(0, hardLeft()));
    waitForServices()
      .then((outcome) => (outcome === true ? restoreSlot() : outcome ? abandonRestore(outcome) : undefined))
      .catch((e) => {
        note(e);
        abandonRestore("error");
      });
  }

  // The deadline: ready() resolves in memory and the restore carries on in the background. As
  // on time, the session then holds the signed-in profile alone (PLATFORM-API.md section 2).
  function onDeadline() {
    deadlinePassed();
    if (readyResult || restoreOver) return;
    if (!w.BoardSDK) return abandonRestore("off-device");
    late = true;
    try {
      const sdk = w.BoardSDK;
      const active = sdk.areServicesReady() === true ? activeProfile() : null;
      if (active) seatActiveAlone(active);
    } catch (e) {
      /* the roster is left as it is */
    }
    st.persistent = false;
    st.slotId = null;
    say("info", "the Board has not answered the restore yet; it continues in the background");
    settle(null, "services-timeout");
  }

  // Never write over a slot that could not be read: this session stays in memory. After ready()
  // resolved, status() says why.
  function abandonRestore(reason) {
    if (restoreOver) return;
    restoreOver = true;
    rosterWait = false;
    st.persistent = false;
    st.slotId = null;
    finishForce();
    if (!readyResult) return settle(null, reason);
    st.phase = "memory-only";
    if (reason === "services-timeout" || reason === "profile-switched") st.lastError = reason;
    else if (reason === "error" && (!st.lastError || st.lastError === "restore-deferred")) st.lastError = "error";
    say("warn", "state memory-only, " + reason);
  }

  // Board services, the page's DOM and the web SDK's own bridge (window.__board) first:
  // polled every 100 ms until the hard cap.
  function waitForServices() {
    return new Promise((resolve) => {
      const tick = () => {
        if (restoreOver) return resolve(null);
        const sdk = w.BoardSDK;
        let up = false;
        try {
          up = !!sdk && domReady && !!sdkBoard() && sdk.areServicesReady() === true;
        } catch (e) {
          up = false;
        }
        if (up) return resolve(true);
        if (hardLeft() <= 0) return resolve(sdk ? "services-timeout" : "off-device");
        later(tick, SERVICES_POLL_MS);
      };
      tick();
    });
  }

  // --- whose save is whose --------------------------------------------------------------------
  // A save's players carry the Board's RAW profile id (UDS keeps it), while the session
  // (getActiveProfile, getPlayers) reports it hashed with the app id: the first 32 lowercase
  // hex characters of SHA-256 over the UTF-8 of rawProfileId + "|" + appId (libboard
  // BoardSaveGameData.hashProfileIdWithAppId; URR5X, WebView 147, 2026-10-13). A save
  // player is the signed-in profile when either form matches. Without crypto.subtle (or an
  // app id to hash with) the profile is matched by name, type "profile".
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let matchedBy = null;

  function subtleCrypto() {
    try {
      const c = w.crypto;
      return c && c.subtle && typeof c.subtle.digest === "function" ? c.subtle : null;
    } catch (e) {
      return null;
    }
  }

  async function sessionIdOf(subtle, rawId) {
    const bytes = new Uint8Array(await subtle.digest("SHA-256", utf8(rawId + "|" + appId)));
    let hex = "";
    for (let i = 0; i < 16; i++) hex += (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16);
    return hex;
  }

  // One matcher for every comparison of a save's players with the session, built once per
  // restore with the hashes of every profile id the listed saves carry. matcher.how(p) tells
  // diag() which form matched: "id" (the session's id itself), "hash" (the raw id hashed with
  // the app id, as on a Board) or "name".
  async function profileMatcher(active, saves) {
    const subtle = appId ? subtleCrypto() : null;
    if (subtle) {
      try {
        const raw = new Set();
        for (const m of saves) {
          for (const p of Array.isArray(m.players) ? m.players : []) {
            if (isObj(p) && typeof p.playerId === "string" && UUID.test(p.playerId)) raw.add(p.playerId);
          }
        }
        const hashed = new Map();
        await Promise.all(Array.from(raw, (id) => sessionIdOf(subtle, id).then((h) => hashed.set(id, h))));
        const byId = (p) => isObj(p) && (p.playerId === active.playerId || hashed.get(p.playerId) === active.playerId);
        byId.how = (p) => (isObj(p) && p.playerId === active.playerId ? "id" : "hash");
        return byId;
      } catch (e) {
        note(e);
      }
    }
    say("warn", "playerid-mismatch: " + (appId ? "no crypto.subtle" : "no app id") + "; the profile's save is matched by name");
    const name = str(active.name);
    const byName = (p) =>
      isObj(p) && (p.playerId === active.playerId || (!!name && p.type === "profile" && p.name === name));
    byName.how = () => "name";
    byName.byName = true;
    return byName;
  }

  // The payload as stored, or null when it is unreadable or not the platform's.
  function readPayload(loaded) {
    let payload = null;
    try {
      payload = decodePayload(isObj(loaded) ? loaded.data : null);
    } catch (e) {
      payload = null;
    }
    return isObj(payload) && payload.schema === "board.state" ? payload : null;
  }

  // Several slots for one profile, left by earlier restores that never matched: each was a
  // fresh session, so the slot played longest is the real one. Its whole payload wins
  // (progress, run, audio levels, played time); the others only add progress keys it lacks,
  // the longer-played first. Ranked: playedTime, then the newest updatedAt.
  const rankSlots = (a, b) => num(b.playedTime, 0) - num(a.playedTime, 0) || num(b.updatedAt, 0) - num(a.updatedAt, 0);

  function mergeInto(kept, losers) {
    const merged = {};
    for (const k in kept) merged[k] = kept[k];
    const progressOut = {};
    const own = obj(kept.progress);
    for (const k in own) progressOut[k] = own[k];
    for (const loser of losers) {
      const prog = obj(loser.progress);
      for (const k in prog) if (!Object.prototype.hasOwnProperty.call(progressOut, k)) progressOut[k] = prog[k];
    }
    merged.progress = progressOut;
    return merged;
  }

  // Retire merged duplicates once the merged payload is written to the kept slot. Removing
  // the profile from a save that has no other player deletes it (the only delete there is).
  // Slots left out (unreadable) keep "duplicate-slots" standing. The count of this profile's
  // slots afterwards is logged, so a native run can confirm the extras are gone.
  async function retireSlots(ids, leftOut, isActive) {
    // A write that landed holds the merged state or a later one built on it.
    const ok = await writeNow("merge");
    if (!ok) {
      say("warn", "the merged autosave was not written; the duplicate slots are kept");
      return;
    }
    let failed = 0;
    for (const id of ids) {
      checkProfile();
      if (st.switched) return;
      try {
        await call("removeActiveProfileFromSave", id);
        st.retired++;
      } catch (e) {
        failed++;
        say("warn", "a duplicate autosave could not be retired", String((e && e.message) || e).slice(0, 160));
      }
    }
    if (!failed && !leftOut && st.lastError === "duplicate-slots") st.lastError = null;
    try {
      const after = await call("listSaves");
      st.slotsAfterRetire = (Array.isArray(after) ? after : []).filter(
        (m) => isObj(m) && m.gameVersion === SLOT && Array.isArray(m.players) && m.players.some(isActive),
      ).length;
      say("info", "autosaves of this profile after retiring: " + st.slotsAfterRetire);
    } catch (e) {
      say("warn", "could not list the autosaves after retiring", String((e && e.message) || e).slice(0, 160));
    }
  }

  // A load that answers within ms, or { timedOut: true }; a refused load is { error }.
  function loadWithin(id, ms) {
    return new Promise((resolve) => {
      const timer = later(() => resolve({ timedOut: true }), Math.max(0, ms));
      call("loadSave", id).then(
        (loaded) => {
          clearTimeout(timer);
          resolve({ loaded: loaded });
        },
        (e) => {
          clearTimeout(timer);
          resolve({ error: e });
        },
      );
    });
  }

  // After ready() the roster is the active profile alone (PLATFORM-API.md section 2).
  function rosterAlone(active) {
    const players = parse(sync("getPlayers"));
    return Array.isArray(players) && players.length === 1 && isObj(players[0]) && players[0].playerId === active.playerId;
  }

  function seatActiveAlone(active) {
    try {
      if (!rosterAlone(active)) sync("resetPlayers");
    } catch (e) {
      note(e);
    }
  }

  // Before a late load or create. A load reseats the session to the slot's players and a create
  // records the roster, so either waits while the game has seated others (rechecked every
  // 500 ms); the hard cap does not apply to that wait, since the Board has answered. Seats the
  // game did not make (left from before it, when services came up after the deadline and
  // nothing reset them) go first, as on time. Only another signed-in profile ends the restore;
  // a profile that reads null once is asked again. Resolves { busy } (busy: the game's roster
  // is kept waiting no longer, because the menu opened or the game is exiting; forceDeferred),
  // or null when the restore is over.
  async function lateGate(active) {
    for (;;) {
      if (restoreOver) return null;
      const current = activeProfile();
      if (current && current.playerId !== active.playerId) {
        abandonRestore("profile-switched");
        return null;
      }
      if (current) {
        let alone = false;
        try {
          if (!rosterAlone(active) && !gameSeated) seatActiveAlone(active);
          alone = rosterAlone(active);
        } catch (e) {
          alone = false;
        }
        if (alone || force) {
          rosterWait = false;
          if (st.lastError === "restore-deferred") st.lastError = null;
          return { busy: !alone };
        }
      }
      if (!rosterWait) say("info", "the late restore waits until the roster is the signed-in profile alone");
      rosterWait = true;
      if (!st.lastError) st.lastError = "restore-deferred";
      await new Promise((resolve) => {
        gateWake = resolve;
        later(resolve, ROSTER_POLL_MS);
      });
      gateWake = null;
    }
  }

  // A deferred restore (the game has others seated) cannot wait past the session: when the menu
  // opens or the app goes to the background (onVisibility, which fires before Exit can be
  // picked) and on exit (beginExit), it loads the slot, merges and writes now. On exit the
  // load's reseat is harmless. On menu open the game may resume, and the bridge can put back
  // only guests (addGuest by session id): with any other player seated it waits for the exit.
  // Resolves when the forced restore has written (or given up); null when there is none.
  let gateWake = null;
  let force = null;
  let gameSeated = false;

  function forceDeferred(mode) {
    if (force) return force.done;
    if (!rosterWait || restoreOver) return null;
    let players = null;
    try {
      players = parse(sync("getPlayers"));
    } catch (e) {
      players = null;
    }
    if (!Array.isArray(players)) return null;
    if (mode === "menu" && players.some((p) => !isObj(p) || (p.playerId !== st.profileId && p.type !== "guest"))) return null;
    let finish = null;
    const done = new Promise((resolve) => {
      finish = resolve;
    });
    force = { mode: mode, snapshot: players, seatCalls: seatCalls, reseated: false, done: done, finish: finish };
    say("info", "the deferred restore runs now (" + mode + ")");
    if (gateWake) gateWake();
    return done;
  }

  function finishForce() {
    if (!force) return;
    const f = force;
    force = null;
    f.finish();
  }

  // After a forced load (at once, before the write: updateSave does not record seats) or a
  // forced create (after it, since a create records the roster) on menu open: the guests the
  // reseat unseated go back, by session id, unless the game has seated or unseated anyone since
  // the snapshot. A roster that still differs (a session id the reseat changed) is logged.
  function reseatGuests() {
    if (!force || force.mode !== "menu" || force.reseated) return;
    force.reseated = true;
    if (seatCalls !== force.seatCalls) {
      say("warn", "the game changed its roster during the deferred restore; its guests are not seated again");
      return;
    }
    const before = force.snapshot;
    try {
      for (const p of before) if (p.type === "guest" && typeof p.sessionId === "number") sync("addGuest", p.sessionId);
      const seats = (list) =>
        JSON.stringify((Array.isArray(list) ? list : []).map((p) => (isObj(p) ? p.type + ":" + p.sessionId : "?")).sort());
      if (seats(parse(sync("getPlayers"))) !== seats(before)) say("warn", "the roster after the deferred restore differs from the game's");
    } catch (e) {
      say("warn", "the guests could not be seated again after the deferred restore", String((e && e.message) || e).slice(0, 160));
    }
  }

  // A forced restore writes at once (the session may be ending), then puts back any guests not
  // already back (a forced create's).
  async function writeForced() {
    if (!force) return;
    try {
      await writeNow("deferred");
      reseatGuests();
    } finally {
      finishForce();
    }
  }

  async function restoreSlot() {
    const active = activeProfile();
    if (!active) return abandonRestore("no-profile");
    st.profileId = active.playerId;
    const list = await restoreCall("listSaves");
    if (restoreOver) return;
    const ours = (Array.isArray(list) ? list : []).filter(
      (m) => isObj(m) && m.gameVersion === SLOT && typeof m.id === "string" && Array.isArray(m.players),
    );
    const isActive = ours.length ? await profileMatcher(active, ours) : null;
    if (restoreOver) return;
    const mine = ours.filter((m) => m.players.some(isActive)).sort(rankSlots);
    matchedBy = mine.length ? isActive.how(mine[0].players.find(isActive)) : null;
    if (mine.length > 1) st.lastError = "duplicate-slots";
    if (mine.length && isActive.byName) return restoreByName(active, mine, isActive);
    if (!mine.length) {
      // No slot yet: a freshly launched game starts with the signed-in profile alone, and
      // the slot is created with it, so a later load() reseats to exactly that roster. On
      // time, the create is sent before ready() resolves (so it records that roster) but not
      // awaited.
      if (late) {
        const gate = await lateGate(active);
        if (!gate) return;
        if (gate.busy) sync("resetPlayers");
        applyLate(null, null, { create: true, busy: gate.busy });
        return gate.busy ? writeForced() : undefined;
      }
      st.persistent = true;
      seatActiveAlone(active);
      return settle(null, "no-save", false, true);
    }
    // Loading reseats the session natively to that slot's players: on time, never start a load
    // so close to the deadline that the reseat could land after ready(). The extras first, each
    // capped so the kept slot still has its second; the kept slot last, so the session ends
    // seated to it. An extra that does not answer in time skips the merge and the retire for
    // this session, and so does a late restore (the next launch merges).
    const winner = mine[0];
    const extras = [];
    let partial = false;
    for (let i = 1; i < mine.length && !partial; i++) {
      const budget = restoreLeft() - LOAD_MIN_MS - LOAD_SLACK_MS;
      if (late || budget < LOAD_MIN_MS / 2) {
        partial = true;
        break;
      }
      const got = await loadWithin(mine[i].id, budget);
      if (restoreOver) return;
      if (got.timedOut) {
        partial = true;
        say("warn", "a duplicate autosave did not load in time; the duplicates wait for the next launch");
      } else if (got.error) {
        say("warn", "a duplicate autosave could not be loaded; it is kept", String((got.error && got.error.message) || got.error).slice(0, 160));
      } else {
        extras.push({ id: mine[i].id, payload: readPayload(got.loaded) });
      }
    }
    // Too close to the deadline for the kept slot's load: it becomes a late restore.
    if (!late && restoreLeft() < LOAD_MIN_MS) await atDeadline;
    if (restoreOver) return;
    // A late load reseats the session after ready(): onRestore says so.
    const reseated = late;
    const gate = late ? await lateGate(active) : { busy: false };
    if (!gate) return;
    const loaded = await restoreCall("loadSave", winner.id);
    if (restoreOver) return;
    if (gate.busy) reseatGuests();
    if (!late) {
      st.persistent = true;
      seatActiveAlone(active);
    }
    const lateOpts = { busy: gate.busy, reseated: reseated };
    const read = [{ id: winner.id, payload: readPayload(loaded) }].concat(extras).filter((r) => r.payload);
    if (!read.length) {
      say("warn", "the autosave could not be read; it is kept until the next write");
      if (late) {
        applyLate(null, winner.id, { keepUnread: true, busy: gate.busy });
        return gate.busy ? writeForced() : undefined;
      }
      st.slotId = winner.id;
      return settle(null, "no-save", true);
    }
    // The best-ranked readable slot is kept; an unreadable one is left alone.
    const kept = read[0];
    const losers = read.slice(1);
    const merging = !partial && losers.length > 0;
    if (merging) {
      st.merged = read.length;
      say("info", "merging " + read.length + " autosaves of this profile into the one played longest");
    }
    const payload = merging ? mergeInto(kept.payload, losers.map((r) => r.payload)) : kept.payload;
    if (late) {
      applyLate(payload, kept.id, lateOpts);
    } else {
      st.slotId = kept.id;
      settle(payload, null);
    }
    if (merging && st.persistent) {
      st.lastKey = null;
      retireSlots(losers.map((r) => r.id), mine.length - read.length, isActive).catch((e) => note(e));
    }
    if (gate.busy) return writeForced();
  }

  // Matched by name only (no crypto.subtle or no app id), a slot may belong to another
  // profile of the same name: restore read-only from the best-ranked one and keep the
  // session in memory (no write, merge or retire). Two profiles sharing the name: nothing is
  // restored.
  async function restoreByName(active, mine, isActive) {
    const owners = new Set();
    for (const m of mine) for (const p of m.players) if (isActive(p) && p.playerId !== active.playerId) owners.add(p.playerId);
    if (owners.size > 1) {
      say("warn", "playerid-ambiguous: " + owners.size + " profiles share this name; this session stays in memory");
      st.lastError = "playerid-ambiguous";
      return abandonRestore("error");
    }
    if (!late && restoreLeft() < LOAD_MIN_MS) await atDeadline;
    if (restoreOver) return;
    const gate = late ? await lateGate(active) : { busy: false };
    if (!gate) return;
    if (gate.busy) {
      // Read-only by name: nothing would be written, so the game's roster is left alone.
      restoreOver = true;
      return finishForce();
    }
    const loaded = await restoreCall("loadSave", mine[0].id);
    if (restoreOver) return;
    if (!late) seatActiveAlone(active);
    st.persistent = false;
    st.slotId = null;
    st.lastError = "playerid-unverified";
    say("warn", "playerid-unverified: restored read-only by name; this session stays in memory");
    const payload = readPayload(loaded);
    if (late) return applyLate(payload, null, { readOnly: true, reseated: true });
    return payload ? settle(payload, null) : settle(null, "no-save");
  }

  // A restore that lands after ready() resolved in memory (a stalled Board). The game's session
  // wins and the slot fills what it lacks: the progress keys the game has not set (none after a
  // clear()), and the run while the game has neither saved a run of its own nor cleared (so a
  // Continue is never lost to a progress.set on the title screen). Audio levels the player
  // changed this session stay. Nothing recorded and the roster still the signed-in profile
  // alone: that is the slot adopted whole, as if restored on time (onRestore merged false).
  // Otherwise the result is written to that slot. Either way there is one slot: the one found,
  // or one created now. onRestore listeners hear of anything restored.
  function applyLate(payload, slotId, opts) {
    if (restoreOver) return;
    const current = activeProfile();
    if (current && current.playerId !== st.profileId) return abandonRestore("profile-switched");
    restoreOver = true;
    rosterWait = false;
    let adopted = false;
    try {
      const recorded = st.usage.set + st.usage.save + st.usage.clear > 0;
      let alone = false;
      try {
        alone = !opts.busy && rosterAlone({ playerId: st.profileId });
      } catch (e) {
        alone = false;
      }
      adopted = !!payload && !recorded && alone;
      if (payload) {
        for (const k in payload) {
          if (!/^(schema|v|build|savedAt|playedSeconds|platform|progress|run)$/.test(k) && !(k in st.extra)) st.extra[k] = payload[k];
        }
        const plat = obj(payload.platform);
        for (const k in plat) if (k !== "audio" && !(k in st.extraPlatform)) st.extraPlatform[k] = plat[k];
        const a = obj(plat.audio);
        st.storedAudio = {};
        for (const k in a) st.storedAudio[k] = a[k];
        if (!st.levelsChanged) {
          if (musicOn) levels.music = level(a.music, levels.music);
          if (sfxOn) levels.sfx = level(a.sfx, levels.sfx);
          if (musicOn || sfxOn) levels.muted = a.muted === true;
        }
        st.played = Math.max(0, num(payload.playedSeconds, 0)) + playedSeconds();
        if (st.foregroundSince !== null) st.foregroundSince = now();
        const restoredProgress = obj(payload.progress);
        if (!st.usage.clear) {
          for (const k in restoredProgress) {
            if (!Object.prototype.hasOwnProperty.call(st.progress, k)) st.progress[k] = restoredProgress[k];
          }
        }
        const ownRun = st.usage.save > 0 || st.usage.clear > 0;
        if (!ownRun && BUILD && payload.build === BUILD && payload.run !== undefined && payload.run !== null) {
          st.restoredRun = payload.run;
          st.run = clone(payload.run);
          st.hasRun = true;
        }
        st.restoredLate = true;
      }
      st.persistent = !opts.readOnly;
      st.slotId = st.persistent ? slotId : null;
      st.phase = st.persistent ? "ready" : "memory-only";
      // The slot as read is what it holds while nothing was recorded; anything else is written.
      // A slider the player moved during the late window counts as recorded: it is written.
      st.lastKey = !recorded && !st.levelsChanged && (payload || opts.keepUnread) && st.merged === 0 ? contentKey() : null;
      applyAudio();
      sendContext();
      say("info", "state " + st.phase + (payload ? ", restored late" + (adopted ? "" : " under this session's values") : ", late"));
      // A forced restore (opts.busy) is written by its caller at once (writeForced).
      if (opts.busy) {
        /* written by writeForced */
      } else if (opts.create && st.persistent) writeNow("create").catch(() => {});
      else if (st.persistent && st.lastKey === null) markDirty();
    } catch (e) {
      note(e);
    }
    if (!payload) return;
    const info = { merged: !adopted, reseated: !!opts.reseated };
    for (const cb of restoreListeners.slice()) {
      try {
        cb({ merged: info.merged, reseated: info.reseated });
      } catch (e) {
        // The game's own listener: logged, never in lastError (which reports the platform).
        say("warn", "an onRestore listener threw", String((e && e.message) || e).slice(0, 160));
      }
    }
  }

  // Apply what was restored (restored values win over anything recorded before ready()),
  // send the slot's create when there is none, then resolve ready().
  function settle(payload, reason, keepUnread, create) {
    if (readyResult) return;
    // On time, the restore ends here; at the deadline it carries on (onDeadline).
    if (!late) restoreOver = true;
    try {
      const restoredProgress = payload && isObj(payload.progress) ? payload.progress : {};
      if (payload) {
        for (const k in payload) {
          if (!/^(schema|v|build|savedAt|playedSeconds|platform|progress|run)$/.test(k)) st.extra[k] = payload[k];
        }
        const plat = obj(payload.platform);
        for (const k in plat) if (k !== "audio") st.extraPlatform[k] = plat[k];
        const a = obj(plat.audio);
        st.storedAudio = {};
        for (const k in a) st.storedAudio[k] = a[k];
        if (musicOn) levels.music = level(a.music, levels.music);
        if (sfxOn) levels.sfx = level(a.sfx, levels.sfx);
        if (musicOn || sfxOn) levels.muted = a.muted === true;
        st.played = Math.max(0, num(payload.playedSeconds, 0));
        if (BUILD && payload.build === BUILD && payload.run !== undefined && payload.run !== null) {
          st.restoredRun = payload.run;
        }
      }
      if (st.pendingClear) {
        // A clear() before ready() drops what was restored, not what was recorded after it.
        st.progress = {};
        for (const k in st.pending) st.progress[k] = st.pending[k];
      } else {
        st.progress = {};
        for (const k in st.pending) st.progress[k] = st.pending[k];
        for (const k in restoredProgress) st.progress[k] = restoredProgress[k];
      }
      if (st.restoredRun !== undefined && !st.pendingClear) {
        st.run = clone(st.restoredRun);
        st.hasRun = true;
      } else {
        st.restoredRun = undefined;
        if (st.hasPendingRun) {
          st.run = st.pendingRun;
          st.hasRun = true;
        }
      }
      const recorded = Object.keys(st.pending).length > 0 || st.hasPendingRun || st.pendingClear;
      st.pending = {};
      st.pendingRun = undefined;
      st.hasPendingRun = false;
      st.pendingClear = false;
      st.phase = st.persistent ? "ready" : "memory-only";
      st.reason = reason;
      st.foregroundSince = now();
      // The slot as read is what it holds; an unreadable one is kept until a real write.
      st.lastKey = payload || keepUnread ? contentKey() : null;
      if (payload && recorded) st.lastKey = null;
      applyAudio();
      sendContext();
      if (create && st.persistent) writeNow("create").catch(() => {});
      else if (st.persistent && recorded) markDirty();
    } catch (e) {
      note(e);
    }
    readyResult = payload ? { restored: true } : { restored: false, reason: reason || "error" };
    say("info", "state " + st.phase + (readyResult.restored ? ", restored" : ", " + readyResult.reason));
    readyResolve(readyResult);
  }

  // --- BoardPlatform.state ----------------------------------------------------------------------
  function jsonValue(value) {
    if (value === undefined) return undefined;
    const text = JSON.stringify(value);
    return text === undefined ? undefined : JSON.parse(text);
  }

  const progress = Object.freeze({
    get: guard(function (key, fallback) {
      if (st.phase === "booting" || typeof key !== "string") return fallback;
      if (!Object.prototype.hasOwnProperty.call(st.progress, key)) return fallback;
      const v = st.progress[key];
      return v !== null && typeof v === "object" ? clone(v) : v;
    }),
    set: guard(function (key, value) {
      st.usage.set++;
      if (typeof key !== "string" || !key) return;
      let v;
      try {
        v = jsonValue(value);
      } catch (e) {
        st.lastError = "not-json";
        return;
      }
      const target = st.phase === "booting" ? st.pending : st.progress;
      if (v === undefined) {
        if (value !== undefined) {
          st.lastError = "not-json";
          return;
        }
        delete target[key];
      } else {
        target[key] = v;
      }
      markDirty();
    }),
    all: guard(function () {
      return Object.freeze(st.phase === "booting" ? {} : clone(st.progress));
    }, () => Object.freeze({})),
  });

  const state = Object.freeze({
    ready: guard(function () {
      return readyPromise;
    }, () => Promise.resolve({ restored: false, reason: "error" })),
    progress: progress,
    save: guard(function (run) {
      st.usage.save++;
      if (st.phase === "booting") {
        st.pendingRun = run;
        st.hasPendingRun = true;
        return;
      }
      st.run = run;
      st.hasRun = run !== undefined;
      markDirty();
    }),
    load: guard(function () {
      st.usage.load++;
      return st.phase === "booting" || st.restoredRun === undefined ? undefined : clone(st.restoredRun);
    }),
    clear: guard(function () {
      st.usage.clear++;
      if (st.phase === "booting") {
        st.pendingClear = true;
        st.pending = {};
        st.pendingRun = undefined;
        st.hasPendingRun = false;
        return;
      }
      st.progress = {};
      st.run = undefined;
      st.hasRun = false;
      st.restoredRun = undefined;
      markDirty();
    }),
    flush: guard(function () {
      return writeNow("flush")
        .then(() => holdsCurrent())
        .catch(() => false);
    }, () => Promise.resolve(false)),
    status: guard(
      function () {
        return {
          phase: st.phase,
          slotId: st.slotId,
          profileId: st.profileId,
          dirty: isDirty(),
          lastSavedAt: st.lastSavedAt,
          lastError: st.lastError,
          bytes: st.bytes,
          restoredLate: st.restoredLate,
        };
      },
      () => ({
        phase: st.phase,
        slotId: null,
        profileId: null,
        dirty: false,
        lastSavedAt: null,
        lastError: st.lastError,
        bytes: 0,
        restoredLate: st.restoredLate,
      }),
    ),
    // A save that lands after ready() resolved (a slow Board): the game refreshes what shows
    // progress, or offers Continue when load() now has a run.
    onRestore: guard(
      function (cb) {
        if (typeof cb !== "function") return () => {};
        restoreListeners.push(cb);
        return () => {
          const i = restoreListeners.indexOf(cb);
          if (i >= 0) restoreListeners.splice(i, 1);
        };
      },
      () => () => {},
    ),
  });

  // --- audio routing -------------------------------------------------------------------------------
  const contexts = [];
  let buses = null;
  // Started, tapped sources that have not ended: the ones a level change re-applies to.
  const sources = new Set();
  const taps = new WeakMap();
  const linked = new WeakSet();
  const started = new WeakSet();
  const finished = new WeakSet();
  const listening = new WeakSet();
  // Node-to-node connections the page made, so an oscillator is known to be heard (it
  // reaches the destination) or to be a modulator (an LFO or FM source feeding a param).
  const edges = new WeakMap();
  const MAX_VISITS = 200;
  const intended = new WeakMap();
  const mediaRefs = [];

  const classGain = (cls) => levels[cls] / 100;

  function setGain(node, value) {
    try {
      if (node && node.gain && node.gain.value !== value) node.gain.value = value;
    } catch (e) {
      /* a node from a closed context */
    }
  }

  function setLevel(cls, value) {
    const v = level(value, levels[cls]);
    if (v === levels[cls]) return false;
    levels[cls] = v;
    return true;
  }

  function edge(from, to) {
    let out = edges.get(from);
    if (!out) edges.set(from, (out = new Set()));
    out.add(to);
    reclassifySoon();
  }

  // disconnect(), disconnect(output) and disconnect(node, ...) drop what they cut, so a
  // rewired node is reclassified and a node it no longer feeds is not kept alive.
  function unedge(from, args) {
    const out = edges.get(from);
    if (!out) return;
    if (args.length === 0 || typeof args[0] === "number") edges.delete(from);
    else if (!isParam(args[0])) out.delete(args[0]);
    reclassifySoon();
  }

  // A connection made after start() (the chain completed later) or cut later changes
  // whether an oscillator is heard: its tap is re-read once the current task settles.
  let reclassifyQueued = false;
  function reclassifySoon() {
    if (reclassifyQueued || !sources.size) return;
    reclassifyQueued = true;
    Promise.resolve().then(() => {
      reclassifyQueued = false;
      sources.forEach(applyTap);
    });
  }

  // Whether a node's signal reaches its context's destination through connections seen.
  function heard(node) {
    const ctx = node.context;
    const master = ctx && ctx.__boardPlatformMaster;
    const D = w.AudioDestinationNode;
    const seen = new Set();
    const stack = [node];
    while (stack.length && seen.size < MAX_VISITS) {
      const n = stack.pop();
      if (seen.has(n)) continue;
      seen.add(n);
      if (n !== node && (n === master || (D && n instanceof D))) return true;
      const out = edges.get(n);
      if (out) out.forEach((next) => stack.push(next));
    }
    return false;
  }

  // A source's class, or null for one that is not heard (a modulator): it is left at 1.
  function sourceClass(src) {
    try {
      if (w.OscillatorNode && src instanceof w.OscillatorNode) return heard(src) ? "sfx" : null;
      if (src.loop) return "music";
      const buffer = src.buffer;
      if (buffer && buffer.duration >= MUSIC_SECONDS) return "music";
    } catch (e) {
      /* fall through */
    }
    return "sfx";
  }

  function applyTap(src) {
    const tap = taps.get(src);
    if (!tap) return;
    const cls = buses || selfApplying() ? null : sourceClass(src);
    setGain(tap, cls ? classGain(cls) : 1);
  }

  function track(src) {
    if (taps.get(src) && started.has(src) && !finished.has(src)) sources.add(src);
  }

  function pruneContexts() {
    for (let i = contexts.length - 1; i >= 0; i--) {
      let closed = false;
      try {
        closed = contexts[i].ctx.state === "closed";
      } catch (e) {
        closed = true;
      }
      if (closed) contexts.splice(i, 1);
    }
  }

  function mediaClass(el) {
    try {
      if (mediaLoop && mediaLoop.get.call(el)) return "music";
      const d = el.duration;
      if (isFinite(d) && d >= MUSIC_SECONDS) return "music";
    } catch (e) {
      /* fall through */
    }
    return "sfx";
  }

  function applyMedia(el) {
    const i = intended.get(el);
    if (!i || !mediaVolume || !mediaMuted) return;
    try {
      const factor = selfApplying() ? 1 : classGain(mediaClass(el));
      const v = Math.max(0, Math.min(1, i.volume * factor));
      if (mediaVolume.get.call(el) !== v) mediaVolume.set.call(el, v);
      const m = i.muted || levels.muted;
      if (mediaMuted.get.call(el) !== m) mediaMuted.set.call(el, m);
    } catch (e) {
      /* a detached element */
    }
  }

  function eachMedia(fn) {
    for (let i = mediaRefs.length - 1; i >= 0; i--) {
      const el = mediaRefs[i].deref ? mediaRefs[i].deref() : mediaRefs[i];
      if (!el) mediaRefs.splice(i, 1);
      else fn(el);
    }
  }

  function applyAudio() {
    pruneContexts();
    for (const c of contexts) setGain(c.master, levels.muted ? 0 : 1);
    if (buses) {
      if (buses.music) setGain(buses.music, classGain("music"));
      if (buses.sfx) setGain(buses.sfx, classGain("sfx"));
    }
    sources.forEach(applyTap);
    eachMedia(applyMedia);
    const snapshot = { music: levels.music, sfx: levels.sfx, muted: levels.muted };
    const key = JSON.stringify(snapshot);
    if (key !== lastLevelsKey) {
      lastLevelsKey = key;
      for (const cb of audioListeners.slice()) {
        try {
          cb({ music: snapshot.music, sfx: snapshot.sfx, muted: snapshot.muted });
        } catch (e) {
          note(e);
        }
      }
    }
  }
  let lastLevelsKey = JSON.stringify({ music: levels.music, sfx: levels.sfx, muted: levels.muted });

  function findGetter(proto, prop) {
    for (let p = proto; p; p = Object.getPrototypeOf(p)) {
      const d = Object.getOwnPropertyDescriptor(p, prop);
      if (d) return d.get || null;
    }
    return null;
  }

  function findDescriptor(proto, prop) {
    for (let p = proto; p; p = Object.getPrototypeOf(p)) {
      const d = Object.getOwnPropertyDescriptor(p, prop);
      if (d) return d.get && d.set ? d : null;
    }
    return null;
  }

  const AN = w.AudioNode && w.AudioNode.prototype;
  const rawConnect = AN && AN.connect;
  const rawDisconnect = AN && AN.disconnect;

  // The platform's master gains, which stand in for each context's destination.
  const masters = new WeakSet();

  // A master gain is the destination as far as the page can tell: `ctx.destination instanceof
  // AudioDestinationNode` holds (Tone.js and others check it), while it stays a GainNode for
  // everything else. Real destination nodes still answer through the ordinary check.
  function patchDestinationCheck() {
    const D = w.AudioDestinationNode;
    if (typeof D !== "function" || Object.prototype.hasOwnProperty.call(D, "__boardPlatformCheck")) return;
    const ordinary = Function.prototype[Symbol.hasInstance];
    try {
      Object.defineProperty(D, Symbol.hasInstance, {
        configurable: true,
        value: function (value) {
          return (this === D && masters.has(value)) || ordinary.call(this, value);
        },
      });
      Object.defineProperty(D, "__boardPlatformCheck", { value: true });
    } catch (e) {
      /* a locked-down global: the check stays the browser's own */
    }
  }

  // Every game AudioContext's destination is a platform master gain (Mute), wired to the
  // real destination. OfflineAudioContext is left alone.
  function patchContext(name) {
    const Base = w[name];
    if (typeof Base !== "function" || !rawConnect || Base.__boardPlatform) return;
    const realDestination = findGetter(Base.prototype, "destination");
    if (!realDestination) return;
    class PlatformAudioContext extends Base {
      constructor() {
        super(...arguments);
        try {
          const real = realDestination.call(this);
          const master = this.createGain();
          master.gain.value = levels.muted ? 0 : 1;
          rawConnect.call(master, real);
          try {
            Object.defineProperty(master, "maxChannelCount", { configurable: true, get: () => real.maxChannelCount });
          } catch (e) {
            /* informational */
          }
          Object.defineProperty(this, "__boardPlatformMaster", { value: master });
          masters.add(master);
          contexts.push({ ctx: this, master: master });
        } catch (e) {
          note(e);
        }
      }
      get destination() {
        return this.__boardPlatformMaster || realDestination.call(this);
      }
    }
    Object.defineProperty(PlatformAudioContext, "__boardPlatform", { value: true });
    try {
      Object.defineProperty(PlatformAudioContext, "name", { value: Base.name || name });
    } catch (e) {
      /* cosmetic */
    }
    try {
      w[name] = PlatformAudioContext;
    } catch (e) {
      /* a read-only global: master mute is lost for this engine */
    }
  }

  function isParam(node) {
    return !!w.AudioParam && node instanceof w.AudioParam;
  }

  function offline(node) {
    try {
      return !!w.OfflineAudioContext && node.context instanceof w.OfflineAudioContext;
    } catch (e) {
      return false;
    }
  }

  // Per-class routing cannot happen at the shared destination, so it happens at the
  // source: a buffer source (or oscillator) connects to a private tap, the tap to where
  // the game asked. The tap's gain is the class level, set at start() and on loop changes.
  function patchSource(Ctor) {
    const P = Ctor && Ctor.prototype;
    if (!P || !rawConnect || P.__boardPlatformTapped) return;
    Object.defineProperty(P, "__boardPlatformTapped", { value: true });
    P.connect = function (dst) {
      if (!dst || isParam(dst) || offline(this) || !(dst instanceof w.AudioNode)) return rawConnect.apply(this, arguments);
      let tap = taps.get(this);
      try {
        if (!tap) {
          tap = this.context.createGain();
          taps.set(this, tap);
        }
        if (!linked.has(this)) {
          rawConnect.call(this, tap);
          linked.add(this);
        }
        edge(this, dst);
        track(this);
        applyTap(this);
      } catch (e) {
        return rawConnect.apply(this, arguments);
      }
      const rest = Array.prototype.slice.call(arguments, 1);
      rest[0] = 0;
      return rawConnect.apply(tap, [dst].concat(rest));
    };
    P.disconnect = function (dst) {
      try {
        unedge(this, arguments);
      } catch (e) {
        /* bookkeeping only */
      }
      const tap = taps.get(this);
      if (!tap) return rawDisconnect.apply(this, arguments);
      if (arguments.length === 0 || typeof dst === "number") {
        try {
          rawDisconnect.call(tap);
        } catch (e) {
          /* nothing connected */
        }
        linked.delete(this);
        sources.delete(this);
        return rawDisconnect.apply(this, arguments);
      }
      if (isParam(dst)) return rawDisconnect.apply(this, arguments);
      return rawDisconnect.apply(tap, arguments);
    };
    const rawStart = P.start;
    if (typeof rawStart === "function") {
      P.start = function () {
        try {
          started.add(this);
          if (!listening.has(this)) {
            listening.add(this);
            const src = this;
            this.addEventListener("ended", () => {
              finished.add(src);
              sources.delete(src);
            });
          }
          track(this);
          applyTap(this);
        } catch (e) {
          /* no events on this node: it is pruned on disconnect */
        }
        return rawStart.apply(this, arguments);
      };
    }
    const loop = Object.getOwnPropertyDescriptor(P, "loop");
    if (loop && loop.get && loop.set && loop.configurable) {
      Object.defineProperty(P, "loop", {
        configurable: true,
        enumerable: loop.enumerable,
        get: function () {
          return loop.get.call(this);
        },
        set: function (v) {
          loop.set.call(this, v);
          applyTap(this);
        },
      });
    }
  }

  // <audio>/<video>: the game's intended volume and muted sit in a WeakMap; the real
  // values are intended x class level, and muted or the platform's Mute.
  const MP = w.HTMLMediaElement && w.HTMLMediaElement.prototype;
  const mediaVolume = MP && findDescriptor(MP, "volume");
  const mediaMuted = MP && findDescriptor(MP, "muted");
  const mediaLoop = MP && findDescriptor(MP, "loop");

  function intent(el) {
    let i = intended.get(el);
    if (!i) {
      i = { volume: mediaVolume.get.call(el), muted: mediaMuted.get.call(el) };
      intended.set(el, i);
      mediaRefs.push(typeof w.WeakRef === "function" ? new w.WeakRef(el) : el);
      try {
        el.addEventListener("loadedmetadata", () => applyMedia(el));
      } catch (e) {
        /* no events */
      }
    }
    return i;
  }

  function patchMedia() {
    if (!MP || !mediaVolume || !mediaMuted || MP.__boardPlatformMedia) return;
    Object.defineProperty(MP, "__boardPlatformMedia", { value: true });
    Object.defineProperty(MP, "volume", {
      configurable: true,
      enumerable: true,
      get: function () {
        const i = intended.get(this);
        return i ? i.volume : mediaVolume.get.call(this);
      },
      set: function (v) {
        const n = Number(v);
        if (!(n >= 0 && n <= 1)) return mediaVolume.set.call(this, v);
        intent(this).volume = n;
        applyMedia(this);
      },
    });
    Object.defineProperty(MP, "muted", {
      configurable: true,
      enumerable: true,
      get: function () {
        const i = intended.get(this);
        return i ? i.muted : mediaMuted.get.call(this);
      },
      set: function (v) {
        intent(this).muted = !!v;
        applyMedia(this);
      },
    });
    if (mediaLoop) {
      Object.defineProperty(MP, "loop", {
        configurable: true,
        enumerable: true,
        get: function () {
          return mediaLoop.get.call(this);
        },
        set: function (v) {
          mediaLoop.set.call(this, v);
          if (intended.get(this)) applyMedia(this);
        },
      });
    }
    const rawPlay = MP.play;
    if (typeof rawPlay === "function") {
      MP.play = function () {
        try {
          intent(this);
          applyMedia(this);
        } catch (e) {
          /* play anyway */
        }
        return rawPlay.apply(this, arguments);
      };
    }
  }

  // Every node-to-node connection is noted (AudioParam targets are not), for heard(), and
  // every disconnect drops what it cut.
  function patchConnect() {
    if (!AN || !rawConnect || AN.__boardPlatformEdges) return;
    Object.defineProperty(AN, "__boardPlatformEdges", { value: true });
    AN.connect = function (dst) {
      const result = rawConnect.apply(this, arguments);
      try {
        if (dst && !isParam(dst)) edge(this, dst);
      } catch (e) {
        /* bookkeeping only */
      }
      return result;
    };
    if (typeof rawDisconnect === "function") {
      AN.disconnect = function () {
        const result = rawDisconnect.apply(this, arguments);
        try {
          unedge(this, arguments);
        } catch (e) {
          /* bookkeeping only */
        }
        return result;
      };
    }
  }

  try {
    patchConnect();
    patchContext("AudioContext");
    patchContext("webkitAudioContext");
    patchSource(w.AudioBufferSourceNode);
    patchSource(w.OscillatorNode);
    patchMedia();
    patchDestinationCheck();
  } catch (e) {
    note(e);
  }

  const audio = Object.freeze({
    levels: guard(
      function () {
        return { music: levels.music, sfx: levels.sfx, muted: levels.muted };
      },
      () => ({ music: 100, sfx: 100, muted: false }),
    ),
    bindBuses: guard(function (b) {
      const music = isObj(b) && b.music && b.music.gain ? b.music : null;
      const sfx = isObj(b) && b.sfx && b.sfx.gain ? b.sfx : null;
      buses = music || sfx ? { music: music, sfx: sfx } : null;
      applyAudio();
    }),
    onChange: guard(
      function (cb) {
        if (typeof cb !== "function") return () => {};
        audioListeners.push(cb);
        return () => {
          const i = audioListeners.indexOf(cb);
          if (i >= 0) audioListeners.splice(i, 1);
        };
      },
      () => () => {},
    ),
  });

  // --- BoardPlatform.menu ------------------------------------------------------------------------
  const menu = Object.freeze({
    setButtons: guard(function (buttons) {
      gameButtons = cleanButtons(buttons);
      sendContext();
    }),
    onButton: guard(
      function (cb) {
        if (typeof cb !== "function") return () => {};
        buttonListeners.push(cb);
        return () => {
          const i = buttonListeners.indexOf(cb);
          if (i >= 0) buttonListeners.splice(i, 1);
        };
      },
      () => () => {},
    ),
  });

  // --- window.BoardPlatform ----------------------------------------------------------------------
  var platform = {};
  Object.defineProperties(platform, {
    version: { value: VERSION, enumerable: true },
    source: { value: "bundle", enumerable: true },
    game: { value: Object.freeze({ name: gameName, appId: appId }), enumerable: true },
    state: { value: state, enumerable: true },
    audio: { value: audio, enumerable: true },
    menu: { value: menu, enumerable: true },
  });
  try {
    Object.defineProperty(w, "BoardPlatform", { value: platform, enumerable: true });
  } catch (e) {
    /* something already owns the name; the marker above still reports this copy */
  }

  if (gameName) {
    try {
      document.title = gameName;
    } catch (e) {
      /* no document head to hold a title */
    }
  }

  // --- diagnostics (the boot check's probes read this, never internals) ----------------------------
  function diag() {
    const gain = (node) => {
      try {
        return node ? node.gain.value : null;
      } catch (e) {
        return null;
      }
    };
    let mediaCount = 0;
    eachMedia(() => mediaCount++);
    pruneContexts();
    return {
      version: VERSION,
      source: "bundle",
      config: { v: configV, build: BUILD, music: musicOn, sfx: sfxOn },
      exit: JSON.parse(JSON.stringify(exitState)),
      context: lastContext ? JSON.parse(JSON.stringify(lastContext)) : null,
      state: state.status(),
      ready: readyResult,
      writes: st.writes,
      usage: { set: st.usage.set, save: st.usage.save, clear: st.usage.clear, load: st.usage.load },
      restore: {
        matchedBy: matchedBy,
        merged: st.merged,
        retired: st.retired,
        slotsAfterRetire: st.slotsAfterRetire,
        late: st.restoredLate,
        pending: !restoreOver,
      },
      audio: {
        levels: audio.levels(),
        contexts: contexts.map((c) => {
          let routed = false;
          try {
            routed = c.ctx.destination === c.master;
          } catch (e) {
            routed = false;
          }
          return { state: String(c.ctx.state), routed: routed, master: gain(c.master) };
        }),
        taps: sources.size,
        media: mediaCount,
        busesBound: !!buses,
        buses: buses ? { music: gain(buses.music), sfx: gain(buses.sfx) } : null,
        selfApplying: selfApplying(),
      },
      menu: { buttons: gameButtons.map((b) => b.id) },
    };
  }

  // --- the bridge ---------------------------------------------------------------------------------
  // window.BoardSDK becomes the platform's accessor: reading it gives the proxy over whatever
  // host object is there (a harness's own accessor is chained, not replaced); assigning it
  // swaps the host. On a Board the bridge is there before any page script; a browser preview
  // assigns its simulated host later, from a game module. The web SDK reads window.BoardSDK
  // on every call, so it always gets the proxy.
  // Each installation keeps its own inner getter, setter and held host: an accessor a page
  // chains over the platform's (and the platform's next one over that) only ever calls
  // inward, never back into itself.
  function sdkAccessorInstalled() {
    const d = Object.getOwnPropertyDescriptor(w, "BoardSDK");
    return !!(d && d.get && d.get.__boardPlatformSdk);
  }

  function installSdkAccessor() {
    if (sdkAccessorInstalled()) return true;
    const d = Object.getOwnPropertyDescriptor(w, "BoardSDK");
    const innerGet = d && d.get ? d.get : null;
    const innerSet = d && d.get ? d.set || null : null;
    let held = d && !d.get ? d.value : undefined;
    const read = function () {
      const raw = innerGet ? innerGet.call(w) : held;
      return raw ? proxify(raw) : raw;
    };
    const get = function () {
      return read();
    };
    get.__boardPlatformSdk = true;
    try {
      Object.defineProperty(w, "BoardSDK", {
        configurable: true,
        enumerable: true,
        get: get,
        set: function (v) {
          if (innerSet) innerSet.call(w, v);
          else if (!innerGet) held = v;
          adoptSdk(read());
        },
      });
      return true;
    } catch (e) {
      // A window property that cannot be redefined: hand the proxy over by assignment.
      try {
        if (held) w.BoardSDK = proxify(held);
      } catch (e2) {
        /* the host keeps its own object; contextForced reports it */
      }
      return false;
    }
  }

  installSdkAccessor();
  if (w.BoardSDK) adoptSdk(w.BoardSDK);
  // No host yet (or none at all): ready() still resolves by the restore deadline.
  startRestore();

  // A page that redefines window.__board or window.BoardSDK with defineProperty bypasses
  // the setters above; re-apply to whatever is there now and then. The same tick catches
  // a profile switch and writes content a game mutated in place (every 30 s).
  let ticks = 0;
  setInterval(function () {
    try {
      hookBoard(w.__board);
    } catch (e) {
      /* ignore */
    }
    try {
      // A page that put its own window.BoardSDK in place with defineProperty: wrap that one
      // too, without a late default context.
      if (!sdkAccessorInstalled()) {
        installSdkAccessor();
        adoptSdk(w.BoardSDK, true);
      } else {
        checkForced();
      }
    } catch (e) {
      /* ignore */
    }
    ticks++;
    if (ticks % Math.round(TIMER_MS / 1000) === 0) {
      try {
        checkProfile();
        if (st.persistent && (isDirty() || st.switched)) writeNow("timer").catch(() => {});
      } catch (e) {
        note(e);
      }
    }
  }, 1000);

  try {
    w.document.addEventListener("visibilitychange", () => {
      if (w.document.visibilityState === "hidden") onVisibility(false);
      else onVisibility(true);
    });
  } catch (e) {
    /* no document events */
  }
})();
