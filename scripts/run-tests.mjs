// `npm test`: bundles every tests/**/*.test.ts (plus whatever src/ code it imports) with the
// esbuild that Vite already installed, then runs the bundles with Node's own test runner
// (node:test). No network and no extra packages. Write a test as tests/<name>.test.ts:
//   import { test } from "node:test"; import assert from "node:assert/strict";
//   import { scoreFor } from "../src/rules";
//   test("a full row scores 100", () => assert.equal(scoreFor(fullRow), 100));
// Test plain game logic (rules, scoring, turns); there is no DOM or canvas in node:test.
// Read project files relative to the project root (the working directory of npm test).
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const ROOT = "tests";
const TEST_FILE = /\.test\.[cm]?[jt]s$/;
// A test may import a module that imports a stylesheet, image, sound or font.
const LOADERS = { ".css": "empty" };
for (const ext of [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".mp3", ".ogg", ".wav", ".otf", ".ttf", ".woff2"]) {
  LOADERS[ext] = "file";
}
const find = dir =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return find(path);
    return TEST_FILE.test(entry.name) ? [path] : [];
  });

const files = existsSync(ROOT) ? find(ROOT).sort() : [];
if (files.length === 0) {
  console.log("No test files: add tests/<name>.test.ts.");
  process.exit(0);
}
const out = mkdtempSync(join(tmpdir(), "game-tests-"));
let code = 1;
try {
  await build({
    entryPoints: files,
    outdir: out,
    outbase: ROOT,
    outExtension: { ".js": ".mjs" },
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    sourcemap: "inline",
    logLevel: "warning",
    loader: LOADERS,
  });
  const bundles = files.map(file => join(out, relative(ROOT, file).replace(TEST_FILE, ".test.mjs")));
  const options = [process.env.NODE_OPTIONS, "--enable-source-maps"].filter(Boolean).join(" ");
  const run = spawnSync(process.execPath, ["--test", ...bundles], {
    stdio: "inherit",
    env: { ...process.env, NODE_OPTIONS: options }, // stack traces point at the .ts lines
  });
  code = run.status ?? 1;
} catch (error) {
  console.error(`npm test could not bundle the tests: ${error instanceof Error ? error.message : error}`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(code);
