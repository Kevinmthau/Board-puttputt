# The Board platform layer

Every game packed with `npm run pack` loads `board-platform.js` before your code (`scripts/pack.mjs` puts it
next to the built `index.html`, exactly as Board Studio does). It owns the system pause menu, the Music and
Effects sliders and Mute, saving, exit, the page title and the game's name. You do not write any of that.
Types are in `src/board-platform.d.ts`; the global `BoardPlatform` always exists (a stand-in,
`src/platform-stub.ts`, runs in `vite dev` and tests). Do not edit `platform/board-platform.js`.

The game's name comes from the platform: draw it on screen only with `drawTitle()` from `src/title.ts`, and
never type the name as a literal in code, `index.html` or `package.json` (use a neutral slug there). The
platform sets the pause-menu name and the page title for you. The name itself is `"name"` in `board.config.json`.

## Do this

1. At boot: `const { restored } = await BoardPlatform.state.ready();` before you read progress, offer
   Continue or seat players. After it, the session holds the signed-in profile alone; do player setup then,
   through `src/seats.ts`.
2. Record progress as you play. Keyed values that outlive a run and survive edits go in
   `BoardPlatform.state.progress.set("level", 7)`; read them with `progress.get("level", 1)`. The current run
   (board, turn, scores) goes in `BoardPlatform.state.save(run)` whenever it changes; call it freely, the
   platform writes on its own schedule. Saving is continuous and invisible; there is no save button, screen
   or prompt, and nothing is lost on Exit.
3. Restore: after `ready()`, `BoardPlatform.state.load()` returns the last run of this build, or `undefined`.
   If it returns one, offer Continue on the title screen. Progress is there already. On a slow Board the save
   can arrive later: `BoardPlatform.state.onRestore(() => …)` then fires; refresh what shows it.
4. Audio: play everything through `gameAudio()` from `src/runtime.ts` (music on `music`, effects on `sfx`).
   The platform applies the sliders and Mute and remembers them per profile; never set bus gains yourself.
5. Menu buttons (optional): `BoardPlatform.menu.setButtons([{ id: "restart", title: "Restart", icon:
   "circular_arrow" }])` and `BoardPlatform.menu.onButton(id => …)`. Icons: `circular_arrow`,
   `door_with_arrow`, `left_arrow`, `square`. Pressing a button closes the menu; treat it like a resume.
6. Pause: `Board.application.onPause/onResume` still tell you when the menu opens and closes; stop and restart
   your loop there, as the starter does.
7. Reset everything: `BoardPlatform.state.clear()`.

## Never do this

- `Board.pause.setContext`, `updateContext`, `clearContext`: use `BoardPlatform.menu` instead.
- `Board.save.*`: use `BoardPlatform.state` instead.
- `Board.application.quit()` or `window.close()`: the platform exits the game; handle nothing on quit.
- `localStorage`, `sessionStorage`, `indexedDB`, cookies for game state: they are wiped on every launch; use
  `BoardPlatform.state`.
- Volume or mute UI of your own, slider values in the pause context, `applyAudioTracks`.
- Keeping the game waiting on a save: `save()` and `progress.set` return at once.

Guests: when no profile is signed in, state lives in memory for the session. Values are plain JSON (no class
instances, functions or `undefined`). Keep the run under 1 MB.

The SDK guide's pause, save and quit sections are superseded by this file; read it for input and the roster.
