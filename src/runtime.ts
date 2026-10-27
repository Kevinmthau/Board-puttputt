import { Board, BoardContactPhase, type BoardContact } from "@board.fun/web-sdk";
// The platform layer (board-platform.js, PLATFORM.md) is loaded before this file in a packaged game
// (scripts/pack.mjs puts it there); vite dev and node tests get its in-memory stand-in.
import "./platform-stub";
export const WORLD = { width: 1920, height: 1080 };
export const BUFFER = { width: 1920, height: 1080 };
export function createSurface(canvas: HTMLCanvasElement) {
  canvas.width = BUFFER.width; canvas.height = BUFFER.height;
  const ctx = canvas.getContext("2d", { alpha: false })!;
  ctx.setTransform(BUFFER.width / WORLD.width, 0, 0, BUFFER.height / WORLD.height, 0, 0);
  return ctx;
}
export function clientToWorld(canvas: HTMLCanvasElement, x: number, y: number) {
  const r = canvas.getBoundingClientRect();
  return { x: (x-r.left)*WORLD.width/r.width, y: (y-r.top)*WORLD.height/r.height };
}
// Event batches are not proof that omitted stationary contacts have disappeared.
export function applyContacts(active: Map<number, BoardContact>, batch: readonly BoardContact[]) {
  for (const c of batch) {
    if (c.phase === BoardContactPhase.Ended || c.phase === BoardContactPhase.Canceled) active.delete(c.contactId);
    else active.set(c.contactId, c);
  }
}
// The host launches the game on its one bundled model (public/model.dla for a quantized set, else
// public/model.tflite) before this page runs, so startInput only subscribes. Never call
// Board.input.activateModel yourself.
export function startInput(onBatch: (batch: readonly BoardContact[], active: ReadonlyMap<number, BoardContact>) => void, onPause: () => void) {
  const active = new Map<number, BoardContact>();
  const callback = (batch: readonly BoardContact[]) => { applyContacts(active, batch); onBatch(batch, active); };
  Board.input.subscribe(callback);
  const stopPause = Board.application.onPause(() => { active.clear(); onPause(); });
  return () => { Board.input.unsubscribe(callback); stopPause(); active.clear(); };
}
// ---- audio ------------------------------------------------------------------------------
// One AudioContext with "music" and "sfx" buses: play all music on `music` and every effect on
// `sfx`. The platform layer owns the levels: the system menu's Music and Effects sliders and
// Mute, remembered per profile. gameAudio() hands it the buses (BoardPlatform.audio.bindBuses);
// never set their gains, send audio tracks to the pause menu or build volume controls yourself.
// Board's WebView needs no gesture; a desktop browser (npm run dev) starts audio only inside one, and
// Board SDK contact callbacks are not DOM gestures, so the context resumes on every DOM
// pointer/touch/key event (never gated by Board.isOnDevice) and on native resume, and it
// suspends on native pause. State changes are logged as "[audio] AudioContext <state>";
// window.__boardAudio is the context, for on-device checks.
export type AudioBus = "music" | "sfx";
export type GameAudio = { ctx: AudioContext; music: GainNode; sfx: GainNode };
const AUDIO_GESTURES = ["pointerdown", "pointerup", "touchstart", "touchend", "mousedown", "click", "keydown"];
let gameAudioState: (GameAudio & { paused: boolean }) | null = null;
export function unlockAudio() {
  const a = gameAudioState;
  if (a && !a.paused && a.ctx.state === "suspended") void a.ctx.resume().catch(() => {});
}
export function gameAudio(): GameAudio {
  if (gameAudioState) return gameAudioState;
  const ctx = new AudioContext();
  const bus = () => {
    const g = ctx.createGain(); g.connect(ctx.destination); return g;
  };
  const a: GameAudio & { paused: boolean } = { ctx, music: bus(), sfx: bus(), paused: false };
  gameAudioState = a;
  BoardPlatform.audio.bindBuses({ music: a.music, sfx: a.sfx });
  for (const type of AUDIO_GESTURES) window.addEventListener(type, unlockAudio, { capture: true, passive: true });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) unlockAudio(); });
  Board.application.onPause(() => { a.paused = true; void ctx.suspend().catch(() => {}); });
  Board.application.onResume(() => { a.paused = false; void ctx.resume().catch(() => {}); });
  ctx.addEventListener("statechange", () => console.info(`[audio] AudioContext ${ctx.state}`));
  console.info(`[audio] AudioContext ${ctx.state} at start`);
  (window as unknown as { __boardAudio?: AudioContext }).__boardAudio = ctx;
  unlockAudio();
  return a;
}
// ---- game font --------------------------------------------------------------------------
// A game may bundle its own font in public/fonts/ with game-font.json, which names its family,
// its case and how small it still reads (Board Studio picks one per game); Kabel Ultra
// (itc-kabel-ultra.otf, Board's title face) is bundled beside it for small text. Load both before the title screen draws:
//   await loadTitleFont(); then each title frame: drawTitle(ctx, box) from ./title
// and set every other on-screen text in ctx.font = gameFont(px). A game without
// game-font.json (one built before game fonts) gets Kabel Ultra alone, as it always did.
// It never throws: a missing or broken file resolves false and titleFont() falls back to a
// heavy system face. Every call shares one load.
export const TITLE_FONT_FAMILY = "Kabel Ultra";
export const GAME_FONT_CONFIG = "fonts/game-font.json";
export interface GameFontConfig {
  layout: 2; family: string; uppercase: boolean; capRatio: number;
  smallTextOk: boolean; minReadableCapPx: number; pixelCellsPerEm: number | null;
}
let gameFontConfig: GameFontConfig | null = null;
/** The loaded game font (layout 2), or null: no game-font.json, or it failed to load. */
export const loadedGameFont = (): GameFontConfig | null => gameFontConfig;
// game-font.json (the format Board Studio writes), checked (the page reads it as data): null when unusable.
export function parseGameFontConfig(raw: unknown): (GameFontConfig & { file: string }) | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  // A plain family name (a CSS font string the canvas accepts) that is not the fallback's own.
  const name = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9 _-]{1,64}$/.test(v.trim())
    && v.trim().toLowerCase() !== TITLE_FONT_FAMILY.toLowerCase();
  const file = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9._-]+$/.test(v) && !v.startsWith(".");
  const cells = c.pixel_cells_per_em ?? null;
  if (c.layout !== 2 || !name(c.family) || !file(c.file) || typeof c.uppercase !== "boolean"
    || typeof c.cap_ratio !== "number" || !(c.cap_ratio > 0.2 && c.cap_ratio < 1.5)
    || typeof c.small_text_ok !== "boolean" || typeof c.min_readable_cap_px !== "number"
    || !(c.min_readable_cap_px >= 0)
    || !(cells === null || (Number.isInteger(cells) && (cells as number) > 0 && (cells as number) <= 64))) return null;
  return {
    layout: 2, family: (c.family as string).trim(), file: c.file as string, uppercase: c.uppercase,
    capRatio: c.cap_ratio, smallTextOk: c.small_text_ok, minReadableCapPx: c.min_readable_cap_px,
    pixelCellsPerEm: cells as number | null,
  };
}
async function readGameFontConfig(url: string) {
  let response: Response;
  try { response = await fetch(url); } catch { return null; } // no file: a Kabel-only game
  if (!response.ok) return null;
  try {
    const config = parseGameFontConfig(await response.json());
    if (!config) console.warn("[font] game-font.json unusable");
    return config;
  } catch (error) {
    console.warn("[font] game-font.json unreadable", error);
    return null;
  }
}
let titleFontLoad: Promise<boolean> | null = null;
export function loadTitleFont(url = "fonts/itc-kabel-ultra.otf"): Promise<boolean> {
  titleFontLoad ??= (async () => {
    const kabel = (async () => {
      try {
        document.fonts.add(await new FontFace(TITLE_FONT_FAMILY, `url(${url})`).load());
        return true;
      } catch (error) {
        console.warn("[font] title font unavailable", error);
        return false;
      }
    })();
    const config = await readGameFontConfig(GAME_FONT_CONFIG);
    if (config) {
      try {
        const dir = GAME_FONT_CONFIG.slice(0, GAME_FONT_CONFIG.lastIndexOf("/") + 1);
        document.fonts.add(await new FontFace(config.family, `url(${dir}${config.file})`).load());
        const { layout, family, uppercase, capRatio, smallTextOk, minReadableCapPx, pixelCellsPerEm } = config;
        gameFontConfig = { layout, family, uppercase, capRatio, smallTextOk, minReadableCapPx, pixelCellsPerEm };
      } catch (error) {
        console.warn("[font] game font unavailable", error);
      }
    }
    return (await kabel) || gameFontConfig !== null;
  })();
  return titleFontLoad;
}
const KABEL_STACK = `"${TITLE_FONT_FAMILY}", "Arial Black", sans-serif`;
/** The title's CSS font at `px`: the game font (Kabel, then a heavy system face, behind it). */
export const titleFont = (px: number) => {
  const family = gameFontConfig ? `"${gameFontConfig.family}", ` : "";
  return `${Math.round(px)}px ${family}${KABEL_STACK}`;
};
// Board Studio's boot-check readable floor (MIN_TEXT_CAP_PX): the capitals of Kabel Ultra at
// 32 px. Text set at 32 px or more never gets shorter capitals than that from the game font.
const MIN_TEXT_PX = 32;
const MIN_TEXT_CAP_PX = MIN_TEXT_PX * 0.702;
/** The CSS font for any other on-screen text at `px`: the game font where it reads at that
 * size, else Kabel Ultra (small text in a script, hairline or tiny-capped face). A pixel face
 * snaps down to whole pixels per design cell so it stays crisp. */
export const gameFont = (px: number) => gameFontFor(gameFontConfig, px);
export function gameFontFor(c: GameFontConfig | null, px: number): string {
  if (c?.smallTextOk) {
    const cells = c.pixelCellsPerEm;
    const size = cells ? Math.max(cells, Math.floor(Math.round(px) / cells) * cells) : Math.round(px);
    const floor = Math.max(c.minReadableCapPx, Math.round(px) >= MIN_TEXT_PX ? MIN_TEXT_CAP_PX : 0);
    if (size * c.capRatio >= floor) return `${size}px "${c.family}", ${KABEL_STACK}`;
  }
  return `${Math.round(px)}px ${KABEL_STACK}`;
}
