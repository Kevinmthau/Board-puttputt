import { test } from "node:test";
import assert from "node:assert/strict";
import { gameFont, gameFontFor, loadTitleFont, loadedGameFont, parseGameFontConfig, titleFont } from "../src/runtime";
import { drawTitle } from "../src/title";

// A bundled game font: public/fonts/game-font.json plus the face it names. Each test
// file is its own bundle, so this file's one load does not reach title.test.ts (no game font).
const CONFIG = {
  layout: 2, family: "Board Game Font", file: "game-font.woff2", uppercase: false, cap_ratio: 0.7,
  small_text_ok: true, min_readable_cap_px: 20, pixel_cells_per_em: null,
  fallback: { family: "Kabel Ultra", file: "itc-kabel-ultra.otf" },
};
const KABEL = '"Kabel Ultra", "Arial Black", sans-serif';
const added: string[] = [];
(globalThis as any).fetch = async (url: string) => ({
  ok: url === "fonts/game-font.json", json: async () => CONFIG,
});
(globalThis as any).FontFace = class {
  constructor(public family: string, public source: string) {}
  async load() { return this; }
};
(globalThis as any).document = { fonts: { size: 0, add(face: any) { added.push(`${face.family} ${face.source}`); this.size += 1; } } };

test("loadTitleFont loads the game font and Kabel Ultra beside it", async () => {
  assert.equal(await loadTitleFont(), true);
  assert.deepEqual(added.sort(), [
    "Board Game Font url(fonts/game-font.woff2)", "Kabel Ultra url(fonts/itc-kabel-ultra.otf)",
  ]);
  assert.deepEqual(loadedGameFont(), {
    layout: 2, family: "Board Game Font", uppercase: false, capRatio: 0.7,
    smallTextOk: true, minReadableCapPx: 20, pixelCellsPerEm: null,
  });
  assert.equal(titleFont(159.6), `160px "Board Game Font", ${KABEL}`);
});

test("gameFont uses the game font where its capitals read, Kabel Ultra below that", () => {
  assert.equal(gameFont(29), `29px "Board Game Font", ${KABEL}`); // caps 20.3 px
  assert.equal(gameFont(28), `28px ${KABEL}`); // caps 19.6 px: under the font's floor
  // From 32 px up its capitals are never shorter than Kabel Ultra's at 32 px (Studio's boot-check floor).
  assert.equal(gameFont(32), `32px ${KABEL}`); // caps 22.4 px
  assert.equal(gameFont(33), `33px "Board Game Font", ${KABEL}`); // caps 23.1 px
  const face = loadedGameFont()!;
  assert.equal(gameFontFor({ ...face, smallTextOk: false }, 200), `200px ${KABEL}`); // a script
  assert.equal(gameFontFor(null, 48), `48px ${KABEL}`); // a game without a game font
  const pixel = { ...face, family: "Pixel", capRatio: 0.625, minReadableCapPx: 15, pixelCellsPerEm: 8 };
  assert.equal(gameFontFor(pixel, 47), `40px "Pixel", ${KABEL}`); // whole pixels per cell
  assert.equal(gameFontFor(pixel, 23), `23px ${KABEL}`); // 16 px snapped: caps 10 px
});

test("drawTitle sets the game font as typed with the soft shadow", () => {
  const drawn: string[] = [];
  const ctx: any = {
    shadowBlur: 0, shadowOffsetY: 0, shadowColor: "rgba(0,0,0,0)",
    save() {}, restore() {},
    measureText: (text: string) => ({
      width: text.length * 20, actualBoundingBoxAscent: 30, actualBoundingBoxDescent: 8,
    }),
    fillText(text: string) { drawn.push(`${text}|${this.font}|${this.shadowColor}|${this.shadowOffsetY}|${this.shadowBlur}`); },
  };
  (globalThis as any).BoardPlatform = { game: { name: "bouncy  Jelly" } };
  try {
    const layout = drawTitle(ctx, { x: 0, y: 0, width: 1536, height: 864 });
    const cap = layout.size * 0.7;
    const shadow = `rgba(0,0,0,0.55)|${Math.floor(cap * 0.06 + 0.5)}|${2 * cap * 0.08}`;
    assert.deepEqual(drawn, [`bouncy Jelly|${titleFont(layout.size)}|${shadow}`]);
    drawn.length = 0;
    drawTitle(ctx, { x: 0, y: 0, width: 1536, height: 864 }, { ink: "#17171C" });
    assert.match(drawn[0], /\|rgba\(255,255,255,0\.55\)\|/); // white under dark ink
  } finally { delete (globalThis as any).BoardPlatform; }
});

test("game-font.json is read as data: anything malformed is ignored", () => {
  assert.equal(parseGameFontConfig(CONFIG)?.family, "Board Game Font");
  for (const bad of [
    null, "x", { ...CONFIG, layout: 1 }, { ...CONFIG, family: 'a"b' }, { ...CONFIG, file: "../x.woff2" },
    { ...CONFIG, file: "dir/x.woff2" }, { ...CONFIG, cap_ratio: "0.7" }, { ...CONFIG, cap_ratio: 9 },
    { ...CONFIG, uppercase: "no" }, { ...CONFIG, pixel_cells_per_em: 2.5 }, { ...CONFIG, min_readable_cap_px: -1 },
    { ...CONFIG, family: "A\nB" }, { ...CONFIG, family: "kabel ultra" }, { ...CONFIG, pixel_cells_per_em: 1e9 },
  ]) assert.equal(parseGameFontConfig(bad), null, JSON.stringify(bad));
});
