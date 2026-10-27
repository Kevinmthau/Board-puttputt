# Acceptance ledger: <game name>

One dated entry per build you hand over. Report each evidence level on its own line, and say NOT TESTED where a level was not done. A browser run is never proof of physical feel; only a Board and a person are.

| Level | What it can show |
|---|---|
| Source | A code path, asset, or value exists |
| Unit | Rules hold for the inputs the tests chose (`npm test`) |
| Browser | The assembled game works with simulated input (`npm run dev`) |
| Board | What installed code did on a real Board in that session |
| Human | What a person did, understood, and said while playing |

## 2026-01-01: first playable (example, replace it)

- **Asked for:** "A 2 to 4 player brick breaker with pieces as paddles" (the person's words).
- **appId:** `00000000-0000-0000-0000-000000000000` (from `board.config.json`)
- **Piece set:** board-arcade, paddles are glyphs 1 to 4
- **Source:** seats from `src/seats.ts`; result card with Rematch and Change setup in `src/main.ts`
- **Unit:** `npm test` 81 pass, 0 fail
- **Browser:** boot check walk by hand; title, setup, first move, pause and resume all answered. Not proof of feel.
- **Board:** NOT TESTED
- **Human:** NOT TESTED
- **Open:** AI paddles not written yet; check the score text from the side seats on a Board.
