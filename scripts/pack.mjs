// `npm run pack` (after `npm run build`): turn dist/ into an installable <name>.webapp.zip the way
// Board Studio packs its games.
//  1. board.config.json holds the game's identity: name, packageId and appId. A copy of the
//     template has none, so the first pack mints one. Commit it, and never change appId or
//     packageId after the game is on a Board: they key its install and its saves.
//  2. dist/ must hold exactly one touch model, model.dla or model.tflite (`npm run use-piece-set`).
//  3. The Board platform layer (platform/board-platform.js) goes into dist/ next to the entry HTML,
//     loaded by a plain <script src> first in <head>, with this game's name, appId, audio sliders and
//     a build hash filled in. It owns the pause menu, Music and Effects levels, Mute, saves and exit
//     (PLATFORM.md). Studio's controller does the same after every build.
//  4. web-pack (@board.fun/web-pack) checks and zips dist/ with that one model.
// Optional in board.config.json: "audio": { "music": false } or { "sfx": false } hides that slider
// in the pause menu for a game without music or without sound effects.
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, posix, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const CONFIG = join(ROOT, "board.config.json");
const PLATFORM_SOURCE = join(ROOT, "platform", "board-platform.js");
const PLATFORM_FILE = "board-platform.js";
const HARNESS_CONFIG = "harness-config.json";
const MODELS = ["model.dla", "model.tflite"];
const MARKER = "/*BOARD_PLATFORM_CONFIG*/";

const fail = message => {
  console.error(`pack: ${message}`);
  process.exit(1);
};

// ---- 1. identity -------------------------------------------------------------------------------
const slugify = name => name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "game";
const segment = text => {
  const seg = text.replace(/-/g, "");
  return seg && /^[a-z]/.test(seg) ? seg : `g${seg}`;
};
// `npm run pack -- --name "Game Name"` names a game on its first pack, so its packageId carries the name.
const nameArg = () => {
  const at = process.argv.indexOf("--name");
  return at > 0 && process.argv[at + 1]?.trim() ? process.argv[at + 1].trim() : null;
};
function identity() {
  if (!existsSync(CONFIG)) {
    const name = nameArg() ?? "New Board Game";
    const appId = randomUUID();
    const packageId = `fun.board.dev.${segment(slugify(name))}.${segment(appId.replace(/-/g, "").slice(0, 8))}`;
    writeFileSync(CONFIG, JSON.stringify({ packageId, appId, name }, null, 2) + "\n");
    console.log(nameArg()
      ? `pack: minted board.config.json (${packageId}). Commit the file.`
      : `pack: minted board.config.json (${packageId}). Next time pass --name "Game Name" on the first pack; for now set "name" and commit the file.`);
  }
  let config;
  try {
    config = JSON.parse(readFileSync(CONFIG, "utf8"));
  } catch (error) {
    fail(`board.config.json is not JSON (${error.message})`);
  }
  const name = String(config.name ?? "").trim();
  if (!name || name.length > 64) fail('board.config.json needs a "name" of 1 to 64 characters');
  if (!config.appId || !config.packageId) fail('board.config.json needs "appId" and "packageId"');
  return { ...config, name };
}

// ---- 2. the one touch model ----------------------------------------------------------------------
function model() {
  const found = MODELS.filter(name => existsSync(join(DIST, name)));
  if (found.length === 0) {
    fail("dist/ has no touch model. Every Board game ships one: run `npm run use-piece-set -- <set-id>`, then pack again.");
  }
  if (found.length > 1) fail(`dist/ has ${found.join(" and ")}. Keep one model: remove the other from public/.`);
  return found[0];
}

// ---- 3. the platform layer ----------------------------------------------------------------------
// The same rules as Studio's studio_core/platform/bundle.py, so a game packed here carries the
// platform the way a Studio game does.
const scriptSafeJson = value =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\//g, "\\/")
    .replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) return [];
    return entry.isDirectory() ? files(path) : [path];
  });
}

// The build a saved run belongs to: the first 16 hex of a sha256 over dist's paths and bytes, in
// sorted path order, leaving out the platform file and web-pack's manifest. A rebuild that changes
// nothing that ships keeps the hash, so saved runs survive it; any code or media change starts fresh.
function buildHash() {
  const digest = createHash("sha256");
  const paths = files(DIST).map(path => relative(DIST, path).split(sep).join("/")).sort();
  for (const rel of paths) {
    if (rel === HARNESS_CONFIG || posix.basename(rel) === PLATFORM_FILE) continue;
    const data = readFileSync(join(DIST, rel));
    digest.update(Buffer.concat([Buffer.from(`${rel}\0${data.length}\0`, "utf8"), data]));
  }
  return digest.digest("hex").slice(0, 16);
}

function installPlatform(config) {
  const entry = "index.html";
  const entryPath = join(DIST, entry);
  if (!existsSync(entryPath)) fail("dist/index.html is missing: run `npm run build` first");
  const tag = `<script id="board-platform" src="./${PLATFORM_FILE}"></script>\n`;
  let html = readFileSync(entryPath, "utf8");
  html = html.replace(/<script\b[^>]*(?<![\w-])id=(["'])(?:board-exit-guard|board-platform)\1[^>]*>.*?<\/script>\s*/gis, "");
  const head = /<head\b[^>]*>/i.exec(html) ?? /<html\b[^>]*>/i.exec(html) ?? /<!doctype[^>]*>/i.exec(html);
  html = head ? html.slice(0, head.index + head[0].length) + tag + html.slice(head.index + head[0].length) : tag + html;
  writeFileSync(entryPath, html);

  const audio = config.audio && typeof config.audio === "object" ? config.audio : {};
  const cfg = {
    v: 2,
    game: { name: config.name, appId: config.appId },
    exit: { unsavedMs: 500, savedMs: 5000 },
    audio: { music: audio.music !== false, sfx: audio.sfx !== false, defaults: { music: 70, sfx: 90 } },
    state: { build: buildHash(), slot: "boardstate/1", maxBytes: 1 << 20 },
  };
  const source = readFileSync(PLATFORM_SOURCE, "utf8");
  const line = /^([ \t]*var cfg = )\/\*BOARD_PLATFORM_CONFIG\*\/ (\{.*\});[ \t]*$/m;
  if (source.split(MARKER).length !== 2 || !line.test(source)) fail("platform/board-platform.js has lost its configuration line");
  const script = source.replace(line, (_, lead) => `${lead}${MARKER} ${scriptSafeJson(cfg)};`);
  writeFileSync(join(DIST, PLATFORM_FILE), script);
  return cfg.state.build;
}

// ---- 4. web-pack ----------------------------------------------------------------------------------
const config = identity();
if (!existsSync(DIST) || !statSync(DIST).isDirectory()) fail("dist/ is missing: run `npm run build` first");
const modelFile = model();
// A dist/harness-config.json from an earlier pack or from public/ must not steer this one.
rmSync(join(DIST, HARNESS_CONFIG), { force: true });
const build = installPlatform(config);
const out = `${slugify(config.name)}.webapp.zip`;
const webPack = createRequire(import.meta.url).resolve("@board.fun/web-pack/pack.mjs");
const run = spawnSync(
  process.execPath,
  [webPack, "dist", "--name", config.name, "--app-id", config.appId, "--package-id", config.packageId, "--model", modelFile, "-o", out],
  { cwd: ROOT, stdio: "inherit" },
);
if (run.status !== 0) process.exit(run.status ?? 1);
console.log(`pack: ${out} (${config.name}, appId ${config.appId}, model ${modelFile}, platform build ${build})`);
console.log(`pack: install it with: board-connect install ${out} --launch`);
