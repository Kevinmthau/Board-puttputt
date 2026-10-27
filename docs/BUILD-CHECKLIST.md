# Build checklist
- [x] Approved design, exact starter, Sports model and assets.
- [x] First-hole core loop builds, packs and answers a placed piece. Browser: placed, moved, drew back and struck clockwise; ball moved along the sweep.
- [x] Players can place beside the ball and rotate the line to strike (browser, automated input and real Board shots).
- [x] Power follows twist speed in both directions; subdegree noise and translation without rotation do not fire (automated).
- [x] Nine holes, hazards and safe routes work (actual swing poses complete the course in 24 strokes; direct shortcuts also pass).
- [x] Alternating turns, water, stroke cap, ties and scores work (automated).
- [x] Board roster API, ownership, tracking recovery and pause work with modeled device input.
- [x] Teaching, art, seat HUDs, platform-routed sound and celebrations are present.
- [x] Saves, help, rematch and setup work (assembled application tests and browser help/menu checks).
- [x] Browser simulator has movable pieces and rotation controls; excluded from the Board package.
- [x] Tests and package pass; model hash matches.
- [x] Browser title, setup, four-player first green, shot, turn handoff, pause and four help steps checked visually.
- [x] Full nine-hole browser replay checked visually; all holes sunk in 24 strokes, no pickups, shared result waits.
- [x] Installed and launched on KT’s Board; logs and screenshot inspected.
- [x] Visible Board title, 1920 px canvas, first physical shots in both directions and normal hole advance confirmed after unlocking.
- [x] Human physical playtest with Football piece performed. User reported missed line contacts.
- [x] Revised immediate-response line confirmed by the user: “Yes, it fires reliably now.”
- [x] Public GitHub repository created; existing history checked for credential patterns and oversized files; tests and native package rechecked.
- [x] Push source history to public `Kevinmthau/Board-puttputt`; the user confirmed authorization to publish the bundled SDK archive.

Still useful for a later group playtest: four people around the physical Board, long-session performance, all Sports shapes, and sound-mix preference. These do not replace the completed solo physical gesture check.

Evidence scope and remaining physical checks are recorded in `ACCEPTANCE-LEDGER.md`. An installed package is not proof of visible or physical play.

## Opponent-ball collisions — October 27, 2026
- [x] Replace ghost opponents with ball collisions; protect unplayed shared-tee balls.
- [x] Wait for all balls, assign sinks and water to the affected owner, preserve shot state in saves, and update teaching/ball visibility.
- [x] Automated collision, multiplayer rules, existing regressions and native package checks pass (154 tests: 151 passed, three optional catalog skips).
- [x] Inspect the revised game in a browser (title, setup, First Green and revised help).
- [x] Install and inspect the revised package on KT's Board (visible first frame and setup/player selector; no collision play inferred).
- [ ] Human two-player collision feel confirmed on Board.

## Code review and fixes — October 27, 2026
- [x] Review game rules/physics, input/seating, rendering, platform integration and packaging; independently review the final code changes.
- [x] Fix startup/pause loop races, restart before setup, stale roster turns and duplicate piece ownership.
- [x] Fix free-edge selector entry/dismissal behavior and pause identity recovery after movement, delayed detection and repeated menus.
- [x] Restore the 48 px setup-indicator inset and platform ownership of the page title.
- [x] Regression suite: 157 tests, 154 passed, zero failures, three existing optional catalog skips; strict TypeScript, native package and browser build pass; dependency audit has zero findings.
- [x] Browser: packaged platform menu, restart-before-setup, piece binding, tee off, rotational shot, pause/help and return to the same score inspected.
- [ ] Physical Board verification of this review revision (not performed in this source-review handover).
