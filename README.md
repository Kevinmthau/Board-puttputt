# Twist Putt

Nine outdoor mini golf holes for 1–4 people on Board. Every Board Sports piece can be a putter.

Place your piece beside your ball and twist the forehead line through it. The line is ready immediately; no settling or backswing is required. The ball moves **along the sweep**, sideways to the line. Faster twists make stronger shots. Sliding without rotation does not strike.

Take one shot each. Water adds one stroke and resets to the pre-shot position. Seven total strokes ends a hole. Lowest nine-hole score wins; ties share the win.

## Run and build

```sh
npm ci
npm run dev
npm test
npm run pack
npm run build:web
```

`npm run pack` produces `twist-putt.webapp.zip`. `build:web` also creates a standalone browser simulator in `web-dist/`; serve that folder over HTTP. Development uses Vite at the URL printed in the terminal.

The exact Board Studio starter and vendored SDK beta.8 are retained. Vite is patched within major version 6. Sports ships its original `model.tflite`, facing offset zero, canonical art and measured footprints.

## Browser controls

Open **Browser controls**, choose a Sports piece, and place it at a table edge. Add players using the game's **Add player** button. Drag the virtual piece beside the active ball. Drag its rear handle to turn, or hold Q/E; hold Shift for a faster twist. Backspace lifts the selected piece. P opens the simulated system menu. Browser proxies and their controls are excluded from the native Board package.

## On Board

```sh
board-connect --board 10.0.0.179 install twist-putt.webapp.zip --launch
board-connect --board 10.0.0.179 logs 44de7d19-2011-46b9-b063-da8277a618f3
```

App identity: `44de7d19-2011-46b9-b063-da8277a618f3`. Preserve `board.config.json` so future installs update this game and retain its saves.

Setup uses Board's player selector. Place a piece at each player's edge, then tee off. You can lift and replace your piece near your ball; ownership stays with you. Your piece may stand on digital scenery or water. The hazards affect the ball.

The platform menu contains **How to putt**, **Restart course**, and **Change players**. Board owns pause, sound levels, saves and exit. Continue resumes the saved round. The result offers one shared Rematch or Change setup choice.

If two identical Sports pieces are lifted together and returned far from their old positions, return one to its original player edge first. This resolves ownership without guessing or taking a shot.

## Project notes

- `docs/PLAN.md` records the approved design.
- `docs/BUILD-CHECKLIST.md` records completed checks.
- `docs/ACCEPTANCE-LEDGER.md` separates code, automated, browser, Board and human evidence.
- `docs/ASSET-MANIFEST.md` records asset provenance.

Physics uses a fixed 120 Hz step with additional spatial collision subdivisions. Course data, round rules, swing detection and tracking are independent modules. Tests include actual playable routes, input noise, contact recovery, scores and save/restore.

With the Vite server running, `/dev/acceptance.html` provides a nine-hole browser replay through ordinary simulated piece contacts. It pauses at each tee for visual inspection and can export an evidence report. It is a development check, excluded from the Board package. `node scripts/check-stance-clearance.mjs` checks the largest Sports footprint against the authored course and available stances.
