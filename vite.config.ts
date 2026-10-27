import { existsSync, readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";

// `npm run dev` only: inline the simulated Board host (dev/browser-host.js) first in <head>, so the
// game finds a Board bridge in a desktop browser. Drag = a finger, shift-drag = a resting piece
// (glyph 1), Backspace lifts every piece, P or Escape opens the simulated system menu. It is the
// same host Board Studio's preview and boot check use. It also hands the platform stand-in
// board.config.json's name and appId, so the dev title matches the packed game (read on every page
// load; before the first pack there is no file and the title falls back to the page title). None
// of this is ever part of a build or a package.
const devGame = () => {
  const file = new URL("./board.config.json", import.meta.url);
  if (!existsSync(file)) return "";
  try {
    const { name, appId } = JSON.parse(readFileSync(file, "utf8"));
    const game = { name: typeof name === "string" ? name : "", appId: typeof appId === "string" ? appId : "" };
    return `window.__BOARD_DEV_GAME__ = ${JSON.stringify(game).replace(/</g, "\\u003c")};`;
  } catch {
    return "";
  }
};

const browserHost = (): Plugin => ({
  name: "board-browser-host",
  apply: "serve",
  transformIndexHtml: () => [
    { tag: "script", children: readFileSync(new URL("./dev/browser-host.js", import.meta.url), "utf8"), injectTo: "head-prepend" },
    { tag: "script", children: devGame(), injectTo: "head" },
  ],
});

export default defineConfig({ base: "./", plugins: [browserHost()] });
