# Edit history: <game name>

One dated entry per change someone asked for, newest first: what they asked, in their words, what changed, and what did not. It tells the next builder why the game is the way it is.

## 2026-01-02: bigger paddles (example, replace it)

- **Asked for:** "The paddles feel too small at the corners."
- **Changed:** paddle reach from 140 px to 180 px each side (`src/rules.ts`); a rule test for the corner bounce.
- **Not changed:** ball speed and scoring.
- **Evidence:** `npm test` passes; browser checked; Board not tested yet (see docs/ACCEPTANCE-LEDGER.md).
