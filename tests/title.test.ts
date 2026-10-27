import { test } from "node:test";
import assert from "node:assert/strict";
import cases from "./title-layout-cases.json";
import { drawTitle, gameName, layoutTitle, layoutTitleV2, titleLines, titleShadow } from "../src/title";

const { advance_per_char_em: adv, cap_height_em: capEm } = cases.metrics;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

for (const c of cases.cases) {
  test(`lays out ${c.name} in ${c.box.join("x")} exactly like the cover`, () => {
    const [width, height] = c.box;
    const layout = layoutTitle(
      { x: 0, y: 0, width, height }, c.name,
      (text, px) => text.length * px * adv, (px) => px * capEm,
    );
    assert.equal(layout.size, c.size);
    assert.deepEqual(layout.lines.map((l) => ({ text: l.text, x: r3(l.x), capTop: r3(l.capTop) })), c.lines);
  });
}

// Layout 2 (a game font): per-character metrics measured from each font file, so both sides
// lay out the same lines; Board Studio's cover.py asserts the same cases.
type FontCase = (typeof cases.layout2.fonts)[keyof typeof cases.layout2.fonts];
const fonts = cases.layout2.fonts as Record<string, FontCase>;
for (const c of cases.layout2.cases) {
  test(`lays out ${c.name} in ${c.font} at ${c.box.join("x")} exactly like the cover`, () => {
    const font = fonts[c.font];
    const em = (table: Record<string, number>, ch: string) => table[ch] ?? 0;
    const [width, height] = c.box;
    const layout = layoutTitleV2(
      { x: 0, y: 0, width, height }, c.name,
      { uppercase: font.uppercase, capRatio: font.cap_ratio, pixelCellsPerEm: font.pixel_cells_per_em },
      (text, px) => [...text].reduce((sum, ch) => sum + em(font.advance_em, ch), 0) * px,
      (text, px) => [
        Math.max(0, ...[...text].map((ch) => em(font.ascent_em, ch))) * px,
        Math.max(0, ...[...text].map((ch) => em(font.descent_em, ch))) * px,
      ],
    );
    assert.equal(layout.size, c.size);
    assert.deepEqual(layout.lines.map((l) => ({ text: l.text, x: r3(l.x), capTop: r3(l.capTop) })), c.lines);
  });
}

test("the soft shadow is black under light ink and white under dark ink", () => {
  assert.deepEqual(titleShadow("#FFFFFF", 100), { color: "rgba(0,0,0,0.55)", drop: 6, blur: 16 });
  assert.deepEqual(titleShadow("#17171C", 100), { color: "rgba(255,255,255,0.55)", drop: 6, blur: 16 });
  assert.equal(titleShadow("#fff", 50).color, "rgba(0,0,0,0.55)");
});

test("the name comes from the platform", () => {
  (globalThis as any).BoardPlatform = { game: { name: "  Slurp  " } };
  try { assert.equal(gameName(), "Slurp"); } finally { delete (globalThis as any).BoardPlatform; }
});

test("without the platform the page title is the fallback, never a literal", () => {
  (globalThis as any).document = { title: " Page Name " };
  try { assert.equal(gameName(), "Page Name"); } finally { delete (globalThis as any).document; }
  assert.equal(gameName(), "");
});

test("a box offset moves every line", () => {
  const layout = layoutTitle({ x: 100, y: 50, width: 1536, height: 864 }, "Puck", (t, px) => t.length * px * adv, (px) => px * capEm);
  assert.deepEqual([r3(layout.lines[0].x), r3(layout.lines[0].capTop)], [657.2, 420.8]);
  assert.deepEqual(titleLines("  a   b "), ["A", "B"]);
});

test("the platform name wins over the page title", () => {
  (globalThis as any).BoardPlatform = { game: { name: "Slurp" } };
  (globalThis as any).document = { title: "Page Name" };
  try { assert.equal(gameName(), "Slurp"); } finally {
    delete (globalThis as any).BoardPlatform;
    delete (globalThis as any).document;
  }
});

test("drawTitle leaves the caller's canvas state as it found it", () => {
  const state = { font: "10px serif", fillStyle: "#123456", textAlign: "center", textBaseline: "top" };
  const stack: typeof state[] = [];
  const ctx: any = {
    ...state,
    save() { stack.push({ font: this.font, fillStyle: this.fillStyle, textAlign: this.textAlign, textBaseline: this.textBaseline }); },
    restore() { Object.assign(this, stack.pop()); },
    measureText: (text: string) => ({ width: text.length * 20, actualBoundingBoxAscent: 30 }),
    fillText() {},
  };
  (globalThis as any).BoardPlatform = { game: { name: "Leak Check" } };
  try {
    drawTitle(ctx, { x: 0, y: 0, width: 1536, height: 864 });
    assert.deepEqual(
      { font: ctx.font, fillStyle: ctx.fillStyle, textAlign: ctx.textAlign, textBaseline: ctx.textBaseline }, state,
    );
  } finally { delete (globalThis as any).BoardPlatform; }
});

test("without a game font drawTitle sets the name flat, in caps, with no shadow", () => {
  const drawn: string[] = [];
  const ctx: any = {
    shadowBlur: 0, shadowOffsetY: 0, shadowColor: "rgba(0,0,0,0)",
    save() {}, restore() {},
    measureText: (text: string) => ({ width: text.length * 20, actualBoundingBoxAscent: 30 }),
    fillText(text: string) { drawn.push(`${text}|${this.shadowBlur}|${this.shadowOffsetY}|${this.shadowColor}`); },
  };
  (globalThis as any).BoardPlatform = { game: { name: "flat check" } };
  try {
    drawTitle(ctx, { x: 0, y: 0, width: 1536, height: 864 });
    assert.deepEqual(drawn, ["FLAT|0|0|rgba(0,0,0,0)", "CHECK|0|0|rgba(0,0,0,0)"]);
  } finally { delete (globalThis as any).BoardPlatform; }
});

test("drawTitle restores the caller's canvas state when drawing throws", () => {
  const state = { font: "10px serif", fillStyle: "#123456", textAlign: "center", textBaseline: "top" };
  const stack: typeof state[] = [];
  const ctx: any = {
    ...state,
    save() { stack.push({ font: this.font, fillStyle: this.fillStyle, textAlign: this.textAlign, textBaseline: this.textBaseline }); },
    restore() { Object.assign(this, stack.pop()); },
    measureText: (text: string) => ({ width: text.length * 20, actualBoundingBoxAscent: 30 }),
    fillText() { throw new Error("canvas lost"); },
  };
  (globalThis as any).BoardPlatform = { game: { name: "Throw Check" } };
  try {
    assert.throws(() => drawTitle(ctx, { x: 0, y: 0, width: 1536, height: 864 }), /canvas lost/);
    assert.equal(stack.length, 0);
    assert.deepEqual(
      { font: ctx.font, fillStyle: ctx.fillStyle, textAlign: ctx.textAlign, textBaseline: ctx.textBaseline }, state,
    );
  } finally { delete (globalThis as any).BoardPlatform; }
});
