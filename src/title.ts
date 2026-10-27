// The game's name on its title screen. The platform layer supplies it (BoardPlatform.game.name,
// from board.config.json's "name" at pack time), so a renamed game shows its new name with no code change.
// Never type the game's name anywhere: call drawTitle(ctx, box) each frame the title shows,
// after `await loadTitleFont()` once at boot. It sets the name in the game's font with its
// soft shadow (layout 2), or for a game without one in Kabel Ultra, stacked in caps (layout 1).
// The layout is Board Studio's cover layout (board-cloud-agent-core studio_core/board_app/cover.py);
// tests/title-layout-cases.json pins both.
import { loadedGameFont, titleFont } from "./runtime";

export const TITLE_SIZE = 170 / 1536; // starting size, as a share of the box width
export const TITLE_WORD_WIDTH = 0.46; // no line wider than this share of the box
export const TITLE_LEADING = 1.28; // line pitch in cap heights
export const TITLE_BLOCK_HEIGHT = 0.62; // the stacked name never taller than this share of the box
export const TITLE_WHITE = "#FFFFFF";
export const TITLE_DARK = "#17171C"; // pass as `ink` when the art behind the name is light
// Layout 2 (the game's font): sized by cap height, the cap of Kabel Ultra at TITLE_SIZE.
export const KABEL_CAP_RATIO = 0.718;
export const TITLE_CAP = TITLE_SIZE * KABEL_CAP_RATIO; // target cap height, share of the box width
export const TITLE_MIN_SIZE = 12;
export const TITLE_LINE_GAP = 0.2; // least clear space between stacked lines' ink, in cap heights
// The fixed soft shadow, in cap heights: black under light ink, white under dark ink. The
// canvas shadowBlur is twice the Gaussian sigma the cover blurs with.
export const TITLE_SHADOW_DROP = 0.06;
export const TITLE_SHADOW_SIGMA = 0.08;
export const TITLE_SHADOW_ALPHA = 0.55;

export interface TitleBox { x: number; y: number; width: number; height: number }
export interface TitleStyle { ink?: string } // a hex colour: the shadow is chosen from it
export interface PlacedLine { text: string; x: number; capTop: number }
export interface TitleLayout { size: number; lines: PlacedLine[] }
export type LineWidth = (text: string, px: number) => number;
export type CapHeight = (px: number) => number;
export type LineInk = (text: string, px: number) => [ascent: number, descent: number];
export interface TitleFace { uppercase: boolean; capRatio: number; pixelCellsPerEm: number | null }

const halfUp = (value: number) => Math.floor(value + 0.5);

export function gameName(): string {
  const platform = (globalThis as { BoardPlatform?: { game?: { name?: unknown } } }).BoardPlatform;
  const name = platform?.game?.name;
  if (typeof name === "string" && name.trim()) return name.trim();
  return (globalThis as { document?: Document }).document?.title?.trim() ?? "";
}

export function titleLines(name: string): string[] {
  const lines = name.toUpperCase().split(/\s+/).filter(Boolean);
  return lines.length ? lines : [""];
}

export function fitTitleSize(
  width: number, height: number, lines: string[], lineWidth: LineWidth, capHeight: CapHeight,
): number {
  let size = Math.max(12, halfUp(width * TITLE_SIZE));
  while (size > 12) {
    const cap = capHeight(size);
    const block = halfUp(cap * TITLE_LEADING) * (lines.length - 1) + cap;
    const widest = Math.max(...lines.map((line) => lineWidth(line, size)));
    if (widest <= width * TITLE_WORD_WIDTH && block <= height * TITLE_BLOCK_HEIGHT) break;
    size -= 2;
  }
  return size;
}

export function layoutTitle(
  box: TitleBox, name: string, lineWidth: LineWidth, capHeight: CapHeight,
): TitleLayout {
  const lines = titleLines(name);
  const size = fitTitleSize(box.width, box.height, lines, lineWidth, capHeight);
  const cap = capHeight(size);
  const pitch = halfUp(cap * TITLE_LEADING);
  const first = box.height / 2 - (pitch * (lines.length - 1) + cap) / 2;
  return {
    size,
    lines: lines.map((text, i) => ({
      text,
      x: box.x + (box.width - lineWidth(text, size)) / 2,
      capTop: box.y + first + i * pitch,
    })),
  };
}

// ---- layout 2: the game's font (cover.title_layout_metrics_v2) -----------------------------
export function titleTextV2(name: string, uppercase: boolean): string {
  const text = name.split(/\s+/).filter(Boolean).join(" ");
  return uppercase ? text.toUpperCase() : text;
}

const snap = (size: number, cells: number | null) =>
  cells ? Math.max(cells, Math.floor(size / cells) * cells) : size;

export function layoutTitleV2(
  box: TitleBox, name: string, face: TitleFace, lineWidth: LineWidth, lineInk: LineInk,
): TitleLayout {
  const { width, height } = box;
  const cells = face.pixelCellsPerEm;
  const text = titleTextV2(name, face.uppercase);
  const words = text ? text.split(" ") : [""];
  const floor = cells ? snap(TITLE_MIN_SIZE + cells - 1, cells) : TITLE_MIN_SIZE;
  const start = Math.max(floor, snap(halfUp(width * TITLE_CAP / face.capRatio), cells));
  const lines = lineWidth(text, start) <= width * TITLE_WORD_WIDTH ? [text] : words;
  const pitch = (size: number) => {
    const cap = size * face.capRatio;
    if (lines.length === 1) return halfUp(cap * TITLE_LEADING);
    const inks = lines.map((line) => lineInk(line, size));
    const descent = Math.max(...inks.slice(0, -1).map(([, d]) => d));
    const ascent = Math.max(...inks.slice(1).map(([a]) => a));
    return Math.max(halfUp(cap * TITLE_LEADING), halfUp(descent + ascent + TITLE_LINE_GAP * cap));
  };
  let size = start;
  while (size > floor) {
    const block = pitch(size) * (lines.length - 1) + size * face.capRatio;
    const widest = Math.max(...lines.map((line) => lineWidth(line, size)));
    if (widest <= width * TITLE_WORD_WIDTH && block <= height * TITLE_BLOCK_HEIGHT) break;
    size -= cells || 2;
  }
  const cap = size * face.capRatio;
  const step = pitch(size);
  const first = height / 2 - (step * (lines.length - 1) + cap) / 2;
  return {
    size,
    lines: lines.map((line, i) => {
      const x = (width - lineWidth(line, size)) / 2, top = first + i * step;
      // a pixel face on whole pixels, so every cell lands on the pixel grid
      return cells
        ? { text: line, x: halfUp(box.x + x), capTop: halfUp(box.y + top) }
        : { text: line, x: box.x + x, capTop: box.y + top };
    }),
  };
}

/** The fixed soft shadow under `ink` letters `cap` px tall (cover.title_shadow). */
export function titleShadow(ink: string, cap: number) {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(ink.trim())?.[1];
  const full = hex && hex.length === 3 ? [...hex].map((h) => h + h).join("") : hex;
  const rgb = full ? [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) : [255, 255, 255];
  const light = (rgb[0] + rgb[1] + rgb[2]) / 3 > 127;
  return {
    color: light ? `rgba(0,0,0,${TITLE_SHADOW_ALPHA})` : `rgba(255,255,255,${TITLE_SHADOW_ALPHA})`,
    drop: halfUp(cap * TITLE_SHADOW_DROP),
    blur: 2 * cap * TITLE_SHADOW_SIGMA, // canvas shadowBlur is twice the Gaussian sigma
  };
}

let cached: { key: string; layout: TitleLayout; cap: number } | null = null;

/** Draws the game's name centred in `box` and returns where it went: in the game's font with
 * its soft shadow, or (a game without one) in flat Kabel Ultra. */
export function drawTitle(
  ctx: CanvasRenderingContext2D, box: TitleBox, style: TitleStyle = {},
): TitleLayout {
  ctx.save(); // measuring sets ctx.font too: leave the caller's state as it was
  try {
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic"; // ink is measured about the baseline, whatever the caller set
    const name = gameName();
    const fontsReady = globalThis.document?.fonts?.size ?? 0;
    const face = loadedGameFont();
    if (face) { // shaped as the cover's Pillow sets it: no kerning, ligatures or extra spacing
      ctx.fontKerning = "none";
      ctx.textRendering = "optimizeSpeed";
      ctx.letterSpacing = "0px";
      ctx.wordSpacing = "0px";
      ctx.fontVariantCaps = "normal";
      ctx.fontStretch = "normal";
      ctx.direction = "ltr";
    }
    const key = `${name}|${box.x},${box.y},${box.width},${box.height}|${fontsReady}|${JSON.stringify(face)}`;
    if (cached?.key !== key && face) {
      const lineWidth: LineWidth = (text, px) => {
        ctx.font = titleFont(px);
        return ctx.measureText(text).width;
      };
      const lineInk: LineInk = (text, px) => {
        ctx.font = titleFont(px);
        const m = ctx.measureText(text);
        return [m.actualBoundingBoxAscent, m.actualBoundingBoxDescent];
      };
      const layout = layoutTitleV2(box, name, face, lineWidth, lineInk);
      cached = { key, layout, cap: layout.size * face.capRatio };
    } else if (cached?.key !== key) {
      const lineWidth: LineWidth = (text, px) => {
        ctx.font = titleFont(px);
        return ctx.measureText(text).width;
      };
      const capHeight: CapHeight = (px) => {
        ctx.font = titleFont(px);
        return ctx.measureText("H").actualBoundingBoxAscent;
      };
      const layout = layoutTitle(box, name, lineWidth, capHeight);
      cached = { key, layout, cap: capHeight(layout.size) };
    }
    const drawn = cached;
    ctx.font = titleFont(drawn.layout.size);
    ctx.fillStyle = style.ink ?? TITLE_WHITE;
    // The one allowed per-frame shadowBlur: a few title words, only while the title shows (never in
    // play), drawn as text so it matches Studio's cover and stays readable to text checks.
    if (face) { // canvas shadows ignore the transform: drop and blur are in canvas pixels
      const shadow = titleShadow(style.ink ?? TITLE_WHITE, drawn.cap);
      ctx.shadowColor = shadow.color;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = shadow.drop;
      ctx.shadowBlur = shadow.blur;
    }
    for (const line of drawn.layout.lines) ctx.fillText(line.text, line.x, line.capTop + drawn.cap);
    return drawn.layout;
  } finally {
    ctx.restore(); // also when measuring or drawing throws
  }
}
