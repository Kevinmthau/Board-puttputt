// The Board platform layer's in-memory stand-in (PLATFORM.md). A packaged game always loads the
// real board-platform.js before any module, so this does nothing there; under vite dev and in
// node tests, where the script is absent, it defines window.BoardPlatform with the same shape
// (src/board-platform.d.ts), so game code never null-checks it. Nothing persists: state lives
// for the page, ready() resolves at once with reason "off-device" (so load() never has an
// earlier session's run) and onRestore never fires, there is no system menu, and the levels
// are the platform's defaults.
// Under `npm run dev`, vite.config.ts hands it board.config.json's name and appId (as
// __BOARD_DEV_GAME__), so the dev title matches the packed game; a build and a test have none.
// Do not edit it: the real platform is packed with the game.
import type { BoardAudioLevels, BoardPlatform, BoardStateStatus, Json, JsonSafe, Widened } from "./board-platform";

function installPlatformStub(): void {
  const host = globalThis as { BoardPlatform?: BoardPlatform; __BOARD_DEV_GAME__?: { name?: unknown; appId?: unknown } };
  if (host.BoardPlatform) return;
  const dev = host.__BOARD_DEV_GAME__;
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const copy = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)));
  let progress: Record<string, Json> = {};
  const levels: BoardAudioLevels = { music: 70, sfx: 90, muted: false };
  let buses: { music?: GainNode; sfx?: GainNode } = {};
  const applyBuses = () => {
    if (buses.music) buses.music.gain.value = levels.muted ? 0 : levels.music / 100;
    if (buses.sfx) buses.sfx.gain.value = levels.muted ? 0 : levels.sfx / 100;
  };
  const status = (): BoardStateStatus => ({
    phase: "memory-only", slotId: null, profileId: null, dirty: false, lastSavedAt: null, lastError: null, bytes: 0,
    restoredLate: false,
  });
  function get<T>(key: string, fallback: T & JsonSafe<T>): Widened<T>;
  function get<T = unknown>(key: string): T | undefined;
  function get(key: string, fallback?: unknown): unknown {
    return Object.prototype.hasOwnProperty.call(progress, key) ? copy(progress[key]) : fallback;
  }
  const platform: BoardPlatform = {
    version: "stub",
    source: "bundle",
    game: Object.freeze({ name: text(dev?.name), appId: text(dev?.appId) }),
    state: {
      ready: () => Promise.resolve({ restored: false, reason: "off-device" }),
      progress: {
        get,
        set(key, value) {
          try {
            if (value === undefined) delete progress[key];
            else progress[key] = JSON.parse(JSON.stringify(value));
          } catch {
            /* not JSON: the real platform ignores it too */
          }
        },
        all: () => Object.freeze(copy(progress)),
      },
      save() {},
      load: () => undefined,
      clear() {
        progress = {};
      },
      flush: () => Promise.resolve(false),
      status,
      onRestore: () => () => {},
    },
    audio: {
      levels: () => ({ ...levels }),
      bindBuses(next) {
        buses = { ...next };
        applyBuses();
      },
      onChange: () => () => {},
    },
    menu: {
      setButtons() {},
      onButton: () => () => {},
    },
  };
  // A plain property, so a test can swap or delete it.
  host.BoardPlatform = platform;
}

installPlatformStub();
