// The starter's TypeScript (5.6.3, pinned) types FontFaceSet without the Set methods every
// browser has, so `document.fonts.add(face)` failed tsc (TS2339) when a game loaded its title
// font. These declarations add them; src/runtime.ts loadTitleFont() relies on them.
interface FontFaceSet {
  add(font: FontFace): this;
  delete(font: FontFace): boolean;
  has(font: FontFace): boolean;
  clear(): void;
  readonly size: number;
}
