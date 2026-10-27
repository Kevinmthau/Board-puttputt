# Twist Putt acceptance ledger

## 2026-10-27 — collision source publication handover

- Request: commit and push the opponent-ball collision changes to the existing GitHub repository.
- Scope: collision physics, multiplayer turn/scoring rules, save restoration, rendering/help, regression tests, project records and the native setup screenshot.
- Validation: the implementation handover's 151 passing tests, three optional skips, successful native package and Board installation apply to this unchanged game code. No new physical playtest is claimed.
- Destination: `main` in `https://github.com/Kevinmthau/Board-puttputt`.

## 2026-10-27 — opponent-ball collisions

- Request: allow the player's ball to hit opponents' balls, superseding the original noncolliding-opponent rule.
- Source: shared ball simulation transfers momentum for direct hits, glancing hits and chains; played balls render solid. Unplayed shared-tee balls and finished balls remain out of collision play. Turns wait for all balls, sinks and water penalties belong to the affected owner, and water-returned balls wait out the shot. Saved collision state follows profile identity when session IDs change.
- Automated: `npm test` passed 154 tests: 151 passed, zero failures, three existing optional catalog-wide skips. Coverage includes 18 physics tests, 16 round tests, and the assembled application journey through setup, play, pause/help, recovery, all nine holes and rematch. New save-session-ID regression failed before the fix and passed afterward. The four-player route now checks valid completion with collisions; the solo actual-gesture route still finishes in 24 strokes.
- Browser: inspected title, setup, First Green and all four help pages in the actual Vite app. Updated bumping text is legible. Ball-to-ball interactions are covered by automated simulation; a manual browser collision playtest was not performed.
- Package: strict TypeScript and `npm run pack` pass; 16 native files, bundle `index-Dfq7cjx-.js`, platform `bd8af67134c7d8b0`. Package SHA-256: `e9ee38b09f413931db074bbe8231e7370bc50e864793cf6abd739ef6459ac762`. Original Sports model SHA-256 is unchanged.
- Board: installed and launched on KT's Board. Native logs show `hidden=false`, first frame at 1920 px, running audio, and recognized Sports pieces, with no JavaScript exception. Only the existing optional font-config/favicon warnings appeared. `screenshots/board-ball-collisions.png` shows the native player selector over game setup, not a collision or completed physical playtest.
- Human: two-player physical collision feel remains unverified. At this implementation handover, the changes remained uncommitted; publication was requested in the following handover.

## 2026-10-27 — first playable milestone

- Request: nine-hole Board Sports mini golf with twist-speed putting, built from Studio and installed on KT’s Board.
- App ID: `44de7d19-2011-46b9-b063-da8277a618f3`.
- Sports model: original sports_v0.1.0.tflite, facing offset zero.
- Source: exact starter scaffold, pure swing/tracking, course/physics/round modules.
- Unit: first-hole milestone passed 84 tests, zero failures; three catalog-wide tests skipped because their optional catalog directory is not inside the project. Local Sports geometry is separately tested.
- Browser: title, placement, setup, first green, body drag, draw-back rotation and clockwise fast stroke visibly worked.
- Package: first playable built and packed successfully.
- Board: not yet installed at this milestone.
- Human physical feel: NOT TESTED.

## 2026-10-27 — final geometry check

- Reproduce with `node scripts/check-stance-clearance.mjs`. This command reads the shipped Sports outlines and current course data without changing files.
- The Tennis piece has the largest traced radius: 87.876 px. The tests' 112 px center margin includes its complete footprint plus 24.124 px.
- The script checked 5,045,616 dry-fairway position and shot-direction combinations, using a 10 px grid and 5° direction intervals. This count includes the final curved and angled bridge masks.
- Both rotation directions were checked at a 170 px stance distance, including the club's earliest-contact angle.
- Every sampled shot has a valid stance. The worst available stance retains 60.375 px between the enclosing piece circle and the glass edge.
- That enclosing circle covers every physical-piece rotation. Course walls do not block controller placement; players may stand their pieces on scenery.
- The beam starts on the forehead centerline, 6 px beyond the real forward outline edge. Rendering and collision use the same point.
- The Tennis beam starts 73.86 px from its center. All eight glyphs passed centerline and 6 px gap checks at four orientations.
- This is source and numerical evidence. It does not establish sensor calibration, human reach, hand comfort, or physical flick feel.

## 2026-10-27 — complete implementation before physical feedback

Build: platform `1a2b0a37c5b8a6a8`, application bundle `index-BxciGSTu.js`. Package SHA-256: `dd0d79b60d3784edf2eb0e5ff66689fc045ac82f5e9c00e4c1d66ae1ec96f4c6`.

| Evidence level | Observed result | Limit |
|---|---|---|
| Source | Nine authored holes, par 27; Sports geometry and canonical art; tangent twist-speed putting; independent tracking, swing, physics, round and rendering modules; platform saves/audio/menu; simulator excluded from native output | Source alone does not establish feel |
| Automated rules and assembled app | 132 tests: 129 pass, zero fail, three optional catalog-wide skips. Includes both swing directions, power, wraparound, swept hits, jitter, translation, double-strike locks, duplicate glyphs, lifts, recovery, pauses, water, pickups, ties, four-player rounds, profile-safe saves and rematches | Test inputs are synthetic; optional wider catalog is not in this project |
| Course playability | Actual swing poses complete all nine in 24 strokes; six direct hazard routes also sink. Four-player solver route finishes 96 shots. Full Tennis stance check passes | Does not prove a new human can reproduce the route |
| Browser interaction | Real title/setup, body and rotation controls, first shot, four-player layout and turn handoff, platform pause menu, all four animated help steps, return to play | Native sensing and hardware comfort are separate |
| Package | Strict TypeScript, Vite production build, native pack and standalone web build pass; 16 native files; canonical model hash matches; zero npm audit findings | Build success is not visible device play |
| KT’s Board | Latest package installed and launched successfully on `10.0.0.179`, OS 3.0.13. App reaches ready; AudioContext reports running; no JavaScript exception in captured logs | Document reports `hidden=true`, no first animation frame logged, and screenshot is black. Visible device play remains unverified |
| Human play | Not performed | Twist sensitivity, sensor noise, face alignment, reach, table comfort and sound mix need an awake Board and physical Sports pieces |

The native log has only missing optional game-font config and favicon warnings; Kabel Ultra is bundled and is the intended font. `screenshots/board-hidden-black.png` is diagnostic evidence, not a successful game preview. The SDK states that the system menu overlays the WebView without hiding it, so the hidden state is consistent with a backgrounded or sleeping display; the supported device interface does not expose wake control. A physical wake/foreground check has been requested from the user.

### Review gates and next physical check

Browser startup, first action, reachable end state, genre identity, seat-facing text and piece rendering pass the reviewed journeys. A full native visual/performance gate remains open. No physical-feel approval is inferred from browser or numerical tests.

- Wake KT’s Board and confirm the title and a first putt are visible.
- Try gentle and fast twists in both directions with Tennis and one smaller Sports piece. Confirm the forehead beam aligns and stronger twists consistently go farther.
- Lift and replace pieces, pause/resume three times, and repeat a putt. Confirm no arrival or resume creates a shot.
- Try a rail rest and a bridge approach from each occupied edge; confirm hands and bodies have comfortable room.
- Listen to repeated shots, splashes and cup sounds with the platform sound sliders and Mute; judge the outdoor ambience level.

At this stage those checks were outstanding because the physical display was unavailable. The user subsequently unlocked it; the following revision supersedes that hardware status.

## 2026-10-27 — awake Board and immediate-contact revision

The user unlocked KT’s Board and asked for another install. Startup then reported `hidden=false`, the first 1920 px frame rendered, and a native screenshot showed the title. Football glyph 6 was recognized. Native logs recorded seven strokes on First Green, including clockwise and counterclockwise twists, followed by normal advancement to Banker’s Bend. See `screenshots/board-title.png` and `screenshots/board-physical-play.png`.

The user reported, “The line crosses the ball but often does not shoot,” then requested, “make the line active at all times.” This explicitly supersedes the original arming rules. Removed the hold-still delay, clear-backswing requirement, 8° intent gate, stance-distance gate, position-drift reset and minimum angular-speed firing veto. Any rotation meeting a 1° noise tolerance can strike where the finite line touches the current stopped ball, including from existing overlap. Sliding alone, placement, missing history, pause, inactive ownership and repeated hits during a roll remain suppressed. The former ±3° jitter rejection guarantee is intentionally withdrawn in favor of the requested direct response.

Final immediate-contact build: platform `bdd6fc9bf9245904`, bundle `index-CMlQ1l1u.js`, package SHA-256 `0aac95975dae30fac706b15daefb3b658dc680f6d9db8abd7027711f60ad17b4`. Installed and launched on KT’s Board at 14:45. It rendered at 1920 px with no JavaScript exception, recognized the Football piece, and recorded live 98°/s → 357 px/s and 226°/s → 687 px/s strokes. `screenshots/board-final.png` shows the live bright club and rolling ball.

Validation after revision: 136 tests, 133 passed, zero failures, three optional wider-catalog skips; strict TypeScript and both builds pass. The native package still has 16 files, no browser controls or acceptance runner, and the original Sports model hash. Updated tests cover immediate placement-followed-by-rotation, existing overlap, small and slow twists, natural position drift, full visible reach, noise tolerance, disabled input and one-hit locking. The actual-pose nine-hole routes remain within par.

The original and revised full browser replays both passed all nine holes in 24 strokes with no pickups and waited at the shared scorecard. The final replay also verified Rematch: hole one, zero scores, no pickups, fresh stationary balls, reset obstacle time and retained players/pieces. Final evidence is in `browser-replay.json`, with screenshots in `screenshots/browser-results.png` and `screenshots/browser-title.png`. The replay uses real-time simulated Sports contact events through the assembled game; no ball or round state is assigned by the runner. Repositioning is modeled as a real lift and fresh placement, because a simultaneous slide and twist is intentionally live under the revised controls.

The user tested the updated build and confirmed: **“Yes, it fires reliably now.”** This is human confirmation of the revised gesture with the physical Football piece. A full four-person hardware round, physical Tennis handling, long-session performance and subjective sound mix were not tested in this session.

Final review: the course, help and result retain the title's park materials and palette; bridge edges match their collision polygons; tunnel exit arrows point along the emitted ball direction; pickups have an explicit live cue; long names use readable short labels instead of shrinking or clipping. The playable browser build was refreshed to the final bundle. Native installation and observed solo play pass; the broader group-play and long-session checks above remain open.

## 2026-10-27 — public GitHub publication preparation

- Request: commit and push the project to a public GitHub repository.
- Source: the existing game is committed through `fea9416`. Created `https://github.com/Kevinmthau/Board-puttputt`, verified GitHub reports `PUBLIC`, and configured it as `origin`.
- Publication checks: no credential patterns found across 109 historical Git blobs or 51 files in the SDK archive; no tracked build/dependency directories or GitHub size-limit issues. This is a bounded pattern check, not a security guarantee.
- Automated: `npm test` completed with 136 tests, 133 passed, zero failures and three optional catalog-wide skips.
- Package: `npm run pack` passed strict TypeScript, Vite production build and native packaging; 16 files, application bundle `index-CMlQ1l1u.js`, platform `bdd6fc9bf9245904`.
- Browser, Board and human: no new playtest in this publication-only handover; prior evidence remains unchanged.
- Authorization: the user confirmed, “Yes, I’m authorized to publish the bundled SDK. Go ahead and push to kevinmthau.” The archive and lockfile remain intact as required by project instructions.
- GitHub: pushed source history through `573dbdc` to public `Kevinmthau/Board-puttputt` on `main`, with local `main` tracking `origin/main`. This documentation follow-up records completion.
