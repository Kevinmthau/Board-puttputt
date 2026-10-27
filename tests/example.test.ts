// An example game test. `npm test` bundles each tests/**/*.test.ts with the src/ code it imports
// and runs it with node:test. Test the game's own rules this way (scoring, turns, win checks).
import { test } from "node:test";
import assert from "node:assert/strict";
import { BoardContactPhase, type BoardContact } from "@board.fun/web-sdk";
import { applyContacts } from "../src/runtime";

const contact = (contactId: number, phase: BoardContactPhase) => ({ contactId, phase }) as BoardContact;

test("a resting piece stays active until it is lifted", () => {
  const active = new Map<number, BoardContact>();
  applyContacts(active, [contact(1, BoardContactPhase.Began), contact(2, BoardContactPhase.Began)]);
  applyContacts(active, [contact(2, BoardContactPhase.Moved)]); // piece 1 rests: not in this batch
  assert.deepEqual([...active.keys()], [1, 2]);
  applyContacts(active, [contact(1, BoardContactPhase.Ended)]);
  assert.deepEqual([...active.keys()], [2]);
});
