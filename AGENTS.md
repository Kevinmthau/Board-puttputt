# Board web game (Board Studio starter)

This project started from the starter Board Studio builds its games from. It is a TypeScript, Vite, and Canvas 2D game for Board, on the vendored web SDK `1.0.0-beta.8` (`vendor/`; npm only has older versions, so keep the tarball and the lockfile).

## Read first

- `docs/PLAN.md`: the game's spec, with seating, teaching, the first minute, the result, and the decisions (who made each, and any conflict with the spec). Follow it. Keep it current.
- `docs/BUILD-CHECKLIST.md`: tick each item in the step that finishes it. Browser, Board, and human items stay open until those checks are done.
- `docs/ACCEPTANCE-LEDGER.md` (one dated entry per handover, evidence by level), `docs/ASSET-MANIFEST.md` (every shipped file, its role, source, and licence), and `docs/EDIT-HISTORY.md` (each requested change): keep them as you go.
- `PLATFORM.md`: what the platform layer owns (pause menu, audio levels, saves, exit, the name) and what the game must never do.
- `node_modules/@board.fun/web-sdk/AGENTS.md`: the SDK's own guide to contacts, epochs, and the roster. `PLATFORM.md` replaces its pause, save, and quit sections.
- `FX.md` and the first 40 lines of `src/fx.ts`: cheap effects that stay smooth on Board.

## Commands

```sh
npm ci                                  # install (once)
npm run use-piece-set -- <set-id> --from <board-games plugin>/skills/piece-sets
npm run dev                             # desktop browser with a simulated Board: drag = finger, shift-drag = piece, P = menu
npm test                                # unit tests (node:test), a headless boot walk, and the text-size scan
npm run pack                            # build + platform layer + web-pack -> <name>.webapp.zip
board-connect install <name>.webapp.zip --launch
```

## Rules that keep a game working on Board

- Draw on the 1920x1080 canvas from `createSurface()`. Native contact positions are already in those units; never rescale them.
- No per-frame `shadowBlur`, `ctx.filter`, or `getImageData`. Bake glows and backdrops once and stamp them.
- Input comes from `startInput()` and `applyContacts()` in `src/runtime.ts`. Check `type === BoardContactType.Glyph` before `glyphId`. `glyphId` is the piece type; `contactId` is the instance.
- A native pause is an epoch boundary, not a lift. Keep a moving piece's momentum through a short tracking gap.
- Never call `Board.input.activateModel`. Never load, delete, or rename `public/model.*`.
- A moving piece gets nothing drawn under, around, or following it. A piece landing gets one splash, finished within 1.5 s.
- Use `pieceFootprint()` from `src/piece-footprints.ts` for outlines, facing, and hit tests.
- Seat players only through `src/seats.ts`, after `await BoardPlatform.state.ready()`. The roster decides who plays, AI included; a piece at a free edge binds to the next roster player without one, or opens the selector. Re-read the roster on players-changed. Never an anonymous seat. `src/main.ts` shows the flow.
- The result waits for one shared decision (Rematch, Change setup). Nothing restarts by itself; seats are confirmed or released explicitly.
- A piece re-detected after the system menu is the same piece: rebind it, with no new splash.
- Audio only through `gameAudio()`. Save only through `BoardPlatform.state`. Never use browser storage, `Board.save`, `Board.pause`, or `Board.application.quit()`.
- Draw the name only with `drawTitle()`; all other text with `gameFont(px)`. In-play text at least 48 px, other text at least 32 px, touch targets at least 120 px, everything 48 px in from the glass edge. A spec's smaller numbers do not lower these floors; record the conflict in `docs/PLAN.md`. `tests/text-size.test.ts` fails on a literal size under 32 px.
- Keep `board.config.json`'s `appId` and `packageId` once the game has been on a Board.

The full rules, with the reasons, are in the board-games plugin: `skills/studio-starter/references/build-rules.md`.
