// board-platform.d.ts: what board-platform.js (the Board platform layer, loaded before every
// game script) defines for the game. Read-only values; every method is safe to call at any
// time (never throws, never rejects). The starters install an in-memory stand-in with the
// same shape when the script is absent (vite dev, unit tests), so game code never
// null-checks BoardPlatform.

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/**
 * A value JSON keeps. Accepts a game's own interfaces and type aliases (no index signature
 * needed), arrays such as (X | null)[], nested records and optional or `| undefined` fields
 * (JSON drops them); rejects functions, Maps and class instances with methods. The platform
 * also checks at run time: a value JSON cannot keep is refused, with status().lastError
 * "not-json". A generic helper passes its own `T & JsonSafe<T>` through:
 * `function put<T>(key: string, value: T & JsonSafe<T>) { BoardPlatform.state.progress.set(key, value); }`
 */
export type JsonSafe<T> = T extends string | number | boolean | null | undefined
  ? T
  : T extends symbol | bigint | ((...args: never[]) => unknown)
    ? never
    : T extends readonly (infer U)[]
      ? readonly JsonSafe<U>[]
      : T extends object
        ? { [K in keyof T]: JsonSafe<T[K]> }
        : never;

type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never;
type IsUnion<T> = [T] extends [UnionToIntersection<T>] ? false : true;

/**
 * A fallback's type as get() returns it: a single inferred literal widens (get("seen", false)
 * is boolean, get("level", 1) is number), an explicit union stays (get<Mode>("mode", "easy")
 * is Mode), and an empty array is unknown[] unless named (get<string[]>("ach", [])).
 */
export type Widened<T> = [T] extends [never[]]
  ? unknown[]
  : IsUnion<T> extends true
    ? T
    : T extends string
      ? string
      : T extends number
        ? number
        : T extends boolean
          ? boolean
          : T;

/** The game this package is: its display name (re-stamped by Rename) and its appId. */
export interface BoardPlatformGame {
  readonly name: string;
  readonly appId: string;
}

export interface BoardStateReady {
  /** true: a previous session's progress (and maybe a run) was restored. */
  restored: boolean;
  reason?: "no-save" | "no-profile" | "services-timeout" | "off-device" | "error";
}

export interface BoardStateStatus {
  /** memory-only: nothing persists this session (a guest, no Board services, off a Board). */
  phase: "booting" | "ready" | "memory-only";
  slotId: string | null;
  profileId: string | null;
  dirty: boolean;
  lastSavedAt: number | null;
  lastError: string | null;
  bytes: number;
  /** true once a save that arrived after ready() resolved (a slow Board) was restored; onRestore fired. */
  restoredLate?: boolean;
}

/** What onRestore reports about a save restored after ready() resolved. */
export interface BoardStateRestore {
  /**
   * false: nothing was recorded yet, so the save was taken whole (progress, and the run load() now returns).
   * true: the game had already recorded or seated players this session; its values were kept and the save
   * only filled what it lacked: missing progress keys, and its run unless the game saved or cleared one.
   */
  merged: boolean;
  /** true: loading the save reseated the session after ready(); re-read seat sessionIds from the roster. */
  reseated: boolean;
}

export interface BoardProgress {
  /**
   * Keyed values kept for this profile across every build and edit of the game: levels, unlocks, bests.
   * Name the type of an empty fallback: get<string[]>("ach", []).
   */
  get<T>(key: string, fallback: T & JsonSafe<T>): Widened<T>;
  get<T = unknown>(key: string): T | undefined;
  /** Persisted on the platform's schedule; undefined deletes the key. */
  set<T>(key: string, value: T & JsonSafe<T>): void;
  all(): Readonly<Record<string, Json>>;
}

export interface BoardState {
  /** Resolves when restore has finished (at most 3 s). Await it before reading progress, offering Continue or seating players. */
  ready(): Promise<BoardStateReady>;
  /**
   * A slow Board's save can arrive after ready() resolved: the callback then runs once, after progress (and,
   * when nothing was recorded yet, load()) holds it. Refresh what shows progress or Continue. Returns an
   * unsubscribe function.
   */
  onRestore(cb: (info: BoardStateRestore) => void): () => void;
  readonly progress: BoardProgress;
  /** Hand over the current run (a plain JSON object) whenever it changes meaningfully. Kept only for this build. */
  save<T>(run: T & JsonSafe<T>): void;
  /** The run saved by an earlier session of this build, or undefined. Valid after ready(). */
  load<T = unknown>(): T | undefined;
  /** Forget this profile's progress and run (a "reset everything" button). */
  clear(): void;
  /** Write now; true when the slot holds the current state. Games rarely need it. */
  flush(): Promise<boolean>;
  status(): BoardStateStatus;
}

/** Integers 0-100. */
export interface BoardAudioLevels {
  music: number;
  sfx: number;
  muted: boolean;
}

export interface BoardAudio {
  levels(): BoardAudioLevels;
  /** Starter use only (runtime.ts gameAudio()): the platform drives these gains; the game never sets them. */
  bindBuses(buses: { music?: GainNode; sfx?: GainNode }): void;
  onChange(cb: (levels: BoardAudioLevels) => void): () => void;
}

export interface BoardMenuButton {
  /** Must not start with "board.". */
  id: string;
  title: string;
  icon?: "circular_arrow" | "door_with_arrow" | "left_arrow" | "square";
}

export interface BoardMenu {
  /** Replace the game's buttons in the system pause menu (at most 4). Pressing one closes the menu. */
  setButtons(buttons: BoardMenuButton[]): void;
  onButton(cb: (id: string) => void): () => void;
}

export interface BoardPlatform {
  readonly version: string;
  /** "bundle": the copy packed with the game; "host": a copy the Board provides. */
  readonly source: "bundle" | "host";
  readonly game: BoardPlatformGame;
  readonly state: BoardState;
  readonly audio: BoardAudio;
  readonly menu: BoardMenu;
}

declare global {
  interface Window {
    BoardPlatform?: BoardPlatform;
  }
  const BoardPlatform: BoardPlatform;
}
