// `npm run use-piece-set -- <set-id> [--from <folder>]`: put a Board piece set into the game in the
// current folder, the way Board Studio prepares a game's workspace before the build. It also runs
// straight from the plugin, from the game's folder: node <plugin>/skills/studio-starter/template/scripts/use-piece-set.mjs <set-id>
//   the set's touch model     -> public/model.dla or public/model.tflite (by its format; the other
//                                name is removed, so the game ships exactly one model)
//   PIECE_SET.json            -> PIECE_SET.json (project root): pieces, copies, sizes, behaviours
//   piece-dictionary.json     -> piece-dictionary.json (project root): glyph ids and names
//   piece-footprints.json     -> public/piece-footprints.json (real base outlines, for src/piece-footprints.ts)
//   art/                      -> public/piece-art/ (load as ./piece-art/<glyphId>.png)
// The sets live in the board-games plugin's piece-sets skill (skills/piece-sets/sets/<set-id>/).
// Where to find them, first match wins:
//   --from <folder>           the piece-sets skill folder, its sets/ folder, or one set's folder
//   BOARD_PIECE_SETS=<folder> the same, as an environment variable
//   skills/piece-sets/sets    when this script is the plugin's own copy (run from the game's folder)
// `npm run use-piece-set -- --list [--from <folder>]` lists the sets it can see.
// Never rename a model to the other format's name: Board picks the runtime by the extension.
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync, mkdirSync, copyFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// The game is the current folder (npm runs scripts from the project root).
const ROOT = process.cwd();
const BUNDLE_MODEL = { ".dla": "model.dla", ".tflite": "model.tflite" };

const fail = message => {
  console.error(`use-piece-set: ${message}`);
  process.exit(1);
};
const isDir = path => existsSync(path) && statSync(path).isDirectory();
const isFile = path => existsSync(path) && statSync(path).isFile();

function parseArgs(argv) {
  const args = { id: null, from: null, list: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--from") args.from = argv[++i] ?? fail("--from needs a folder");
    else if (arg.startsWith("--from=")) args.from = arg.slice("--from=".length);
    else if (arg === "--list") args.list = true;
    else if (arg === "-h" || arg === "--help") {
      console.log("usage: npm run use-piece-set -- <set-id> [--from <piece-sets folder>]\n       npm run use-piece-set -- --list [--from <piece-sets folder>]");
      process.exit(0);
    } else if (arg.startsWith("-")) fail(`unknown option ${arg}`);
    else if (!args.id) args.id = arg;
    else fail(`one set at a time (got ${args.id} and ${arg})`);
  }
  return args;
}

// A folder that holds set folders: the sets/ folder itself, or the skill folder above it.
function setsFolder(folder) {
  const path = resolve(folder);
  if (isDir(join(path, "sets"))) return join(path, "sets");
  return path;
}

function candidates(from) {
  const list = [];
  if (from) list.push({ path: resolve(from), why: "--from" });
  if (process.env.BOARD_PIECE_SETS) list.push({ path: resolve(process.env.BOARD_PIECE_SETS), why: "BOARD_PIECE_SETS" });
  // The plugin's own template: skills/studio-starter/template/scripts -> skills/piece-sets/sets
  list.push({ path: resolve(HERE, "../../../piece-sets/sets"), why: "where the plugin keeps them, if this is the plugin's own template" });
  return list;
}

function listSets(folder) {
  return readdirSync(folder, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && isFile(join(folder, entry.name, "PIECE_SET.json")))
    .map(entry => entry.name)
    .sort();
}

// The set's folder for `id`, searching the candidates in order.
function findSet(id, from) {
  const tried = [];
  for (const { path, why } of candidates(from)) {
    if (!isDir(path)) {
      tried.push(`${path} (${why}: not a folder)`);
      continue;
    }
    // --from may name one set's own folder.
    if (isFile(join(path, "PIECE_SET.json")) && (!id || basename(path) === id)) return path;
    const folder = setsFolder(path);
    if (id && isFile(join(folder, id, "PIECE_SET.json"))) return join(folder, id);
    const known = isDir(folder) ? listSets(folder) : [];
    tried.push(`${folder} (${why}: ${known.length ? `has ${known.join(", ")}` : "no sets"})`);
  }
  fail(`no piece set "${id}" found. Looked in:\n  ${tried.join("\n  ")}\nPass the board-games plugin's skills/piece-sets folder with --from <folder>.`);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`${path} is not JSON (${error.message})`);
  }
}

// The set's model: PIECE_SET.json's model_file when that file is in the folder, else the one
// .dla or .tflite file the folder holds.
function findModel(setDir, pieceSet) {
  const named = typeof pieceSet.model_file === "string" ? join(setDir, basename(pieceSet.model_file)) : null;
  if (named && isFile(named)) return named;
  const models = readdirSync(setDir).filter(name => /\.(dla|tflite)$/i.test(name));
  if (models.length === 1) return join(setDir, models[0]);
  if (models.length === 0) fail(`${setDir} has no .dla or .tflite model file`);
  fail(`${setDir} has ${models.length} model files (${models.join(", ")}) and PIECE_SET.json's model_file names none of them`);
}

const args = parseArgs(process.argv.slice(2));
if (args.list) {
  for (const { path, why } of candidates(args.from)) {
    const folder = setsFolder(path);
    if (!isDir(folder)) continue;
    console.log(`${folder} (${why}):`);
    for (const id of listSets(folder)) {
      const set = readJson(join(folder, id, "PIECE_SET.json"));
      console.log(`  ${id}${set.display_name ? `  ${set.display_name}` : ""}`);
    }
    process.exit(0);
  }
  fail(`no piece-sets folder found; pass --from <folder>`);
}
if (!args.id) fail("name a set, for example: npm run use-piece-set -- chop-chop (or --list to see them)");
if (!/^[a-z0-9][a-z0-9_-]*$/.test(args.id)) fail(`"${args.id}" is not a set id (lowercase letters, digits, - and _)`);
if (!isFile(join(ROOT, "package.json"))) fail(`run it from a game made from the studio-starter template (no package.json in ${ROOT})`);
if (basename(ROOT) === "template" && (resolve(HERE, "..") === resolve(ROOT) || isFile(join(ROOT, "..", "SKILL.md")))) {
  fail("this is the plugin's own template: copy it to a new game folder first, then run this from there");
}

const setDir = findSet(args.id, args.from);
const pieceSet = readJson(join(setDir, "PIECE_SET.json"));
const modelPath = findModel(setDir, pieceSet);
const ext = modelPath.slice(modelPath.lastIndexOf(".")).toLowerCase();
const bundleModel = BUNDLE_MODEL[ext];
if (pieceSet.bundle_model && pieceSet.bundle_model !== bundleModel) {
  fail(`PIECE_SET.json says bundle_model ${pieceSet.bundle_model}, but the model file is ${basename(modelPath)}: never rename across formats`);
}
const required = ["piece-dictionary.json"];
for (const name of required) if (!isFile(join(setDir, name))) fail(`${setDir} has no ${name}`);

const done = [];
const pub = join(ROOT, "public");
mkdirSync(pub, { recursive: true });
// One model, under its own format's name.
for (const name of Object.values(BUNDLE_MODEL)) {
  if (name !== bundleModel && existsSync(join(pub, name))) {
    rmSync(join(pub, name), { force: true });
    done.push(`removed public/${name}`);
  }
}
copyFileSync(modelPath, join(pub, bundleModel));
done.push(`public/${bundleModel} <- ${basename(modelPath)}`);
// A pack seed from an older Studio workspace would name the old model.
if (existsSync(join(pub, "harness-config.json"))) {
  rmSync(join(pub, "harness-config.json"), { force: true });
  done.push("removed public/harness-config.json");
}
copyFileSync(join(setDir, "PIECE_SET.json"), join(ROOT, "PIECE_SET.json"));
done.push("PIECE_SET.json");
copyFileSync(join(setDir, "piece-dictionary.json"), join(ROOT, "piece-dictionary.json"));
done.push("piece-dictionary.json");
const footprints = join(setDir, "piece-footprints.json");
if (isFile(footprints)) {
  copyFileSync(footprints, join(pub, "piece-footprints.json"));
  done.push("public/piece-footprints.json");
} else if (existsSync(join(pub, "piece-footprints.json"))) {
  rmSync(join(pub, "piece-footprints.json"), { force: true });
  done.push("removed public/piece-footprints.json (this set has no footprints)");
}
rmSync(join(pub, "piece-art"), { recursive: true, force: true });
if (isDir(join(setDir, "art"))) {
  cpSync(join(setDir, "art"), join(pub, "piece-art"), { recursive: true });
  done.push("public/piece-art/");
}
console.log(`use-piece-set: ${pieceSet.display_name ?? args.id} from ${setDir}`);
for (const line of done) console.log(`  ${line}`);
