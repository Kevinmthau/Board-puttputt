# Edit history

## 2026-10-27 — publish opponent-ball collisions

The user requested committing and pushing the completed collision revision to the existing `Kevinmthau/Board-puttputt` GitHub repository. Included the implementation, regression tests, updated rules and validation records, and native screenshot in the source handover. The game code and completed checks are unchanged from the implementation handover.

## 2026-10-27 — opponent-ball collisions

The user requested that their ball be able to hit opponents' balls. Replaced the original ghost-opponent rule with equal-mass rebounds, glancing hits and chain reactions. Balls enter collision play after their first putt because unplayed balls share the tee. Turns wait for every rolling ball, and a bumped ball can sink or enter water with the outcome assigned to its owner. Water resets use the start of the current shot, with a returned ball excluded for the remainder of that shot; save/restore retains this state. Played opponents render at full opacity, the aiming pulse waits until the turn is ready, and help mentions bumping other balls. Verification is recorded in ACCEPTANCE-LEDGER.

## 2026-10-27 — initial implementation
User approved the complete Twist Putt plan. Created a fresh Studio game with a new app identity, Sports recognition and all nine planned holes. See PLAN and ACCEPTANCE-LEDGER for decisions and verification.

## 2026-10-27 — complete course and release checks

Completed the nine-hole round, tangent swing detector, physical identity tracking, browser controls, authored outdoor artwork, help, sound, scoring, saves and results. The first playable core was committed before the complete presentation and multiplayer flow. Added curved and angled bridge collision outlines to match the approved course, profile-safe save restoration, and original-edge recovery when identical pieces return ambiguously. Patched Vite within major version 6; the vendored Board SDK is unchanged.

Added a browser-only acceptance replay and reproducible Tennis footprint clearance check. Installed and launched the native package on KT’s Board. Visible native play and real-piece feel remain separately tracked in the acceptance ledger; the Board reported its WebView hidden during remote inspection.

## 2026-10-27 — physical feedback revision

After the user unlocked the Board, native rendering and physical Football-piece strokes worked in both directions. The user reported that the line sometimes crossed the ball without firing and requested “make the line active at all times.” Removed the original hold-still, clear-backswing, deliberate-turn and stance-range gates. The bright line now responds directly to rotation/contact, while turn ownership, paused state, moving-ball lock and a small noise tolerance remain. Updated teaching to match. Also corrected tunnel exit arrows, distinguished pickups from sinks in live cues, and separated the title letters slightly for readability.

## 2026-10-27 — public GitHub publication preparation

The user requested committing and pushing the project to a public GitHub repository. The game already had three local commits and a clean working tree. Created `https://github.com/Kevinmthau/Board-puttputt` as a public repository and configured `origin`. Rechecked tests and native packaging, linked the repository from the README, and recorded the SDK's existing license in the asset manifest. The user then confirmed authorization to publish the complete SDK archive and instructed the push to their account. Pushed the existing history to `main` and configured tracking of `origin/main`; the SDK archive and lockfile remain intact.
