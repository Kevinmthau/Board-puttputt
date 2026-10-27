// Text floors (build-rules section 9): no on-screen text under 32 px; in-play numbers and prompts
// at least 48 px, which a scan cannot tell apart, so check those by eye. This reads every src/ file
// for literal sizes: gameFont(n), titleFont(n), `size: n` in a pop's options, and "npx" in a
// ctx.font string. A spec's smaller numbers do not lower the floor. A size computed at run time is
// not seen here: clamp it, as drawButton does (never under 32 px).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const FLOOR_PX = 32;
// Opt-outs, each with its reason: "<file>: <the matched text>" (for example
// "src/hud.ts: gameFont(24)": "drawn into a 2x sprite, so it shows at 48 px").
const ALLOWED: Record<string, string> = {};

const PATTERNS = [
  /\b(?:gameFont|titleFont)\(\s*(\d+(?:\.\d+)?)\s*\)/g, // ctx.font = gameFont(28)
  /\.pop\([^;]*?\bsize:\s*(\d+(?:\.\d+)?)/g, // pops.pop(x, y, "+1", { size: 24 })
  /\.font\s*=\s*["'`][^"'`]*?\b(\d+(?:\.\d+)?)px/g, // ctx.font = "20px sans-serif"
];
const sourceFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const path = join(dir, entry.name);
  if (entry.isDirectory()) return sourceFiles(path);
  return /\.(ts|tsx|js|mjs)$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [path] : [];
});
// Comments may show small sizes as examples; blank them out (keeping line numbers).
const withoutComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

test("no literal text size in src/ is under 32 px", () => {
  const small: string[] = [];
  for (const file of sourceFiles("src")) {
    const code = withoutComments(readFileSync(file, "utf8"));
    for (const pattern of PATTERNS) {
      for (const match of code.matchAll(pattern)) {
        const key = `${file.split("\\").join("/")}: ${match[0].trim()}`;
        const line = code.slice(0, match.index).split("\n").length;
        if (Number(match[1]) < FLOOR_PX && !(key in ALLOWED)) small.push(`${key} (line ${line})`);
      }
    }
  }
  assert.deepEqual(small, [], `text under ${FLOOR_PX} px; raise it, or list it in ALLOWED with a reason`);
});

test("the scan finds the sizes it is meant to find", () => {
  const sizes = (code: string) => PATTERNS.flatMap(p => [...withoutComments(code).matchAll(p)].map(m => Number(m[1])));
  assert.deepEqual(sizes('ctx.font = gameFont(24);'), [24]);
  assert.deepEqual(sizes('pops.pop(x, y, "+1", { color: "#fff", size: 20 });'), [20]);
  assert.deepEqual(sizes('ctx.font = "18px sans-serif";'), [18]);
  assert.deepEqual(sizes('ctx.font = gameFont(px); // gameFont(12) in a comment'), []);
});
