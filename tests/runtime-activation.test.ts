import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { Board, type BoardContact } from "@board.fun/web-sdk";
import { startInput } from "../src/runtime";

// The host launches a game on its one bundled model (model.dla for a quantized set) before the
// page runs, so the starter never asks for a model: not at start, not on input, and never with a
// blank name, whatever the host reports while its launch load is still in flight.
const realWarn = console.warn;
const input = Board.input as unknown as Record<string, unknown>;
const saved = { subscribe: input.subscribe, unsubscribe: input.unsubscribe,
  getActiveModel: input.getActiveModel, activateModel: input.activateModel };
afterEach(() => { console.warn = realWarn; Object.assign(input, saved); });
const settle = () => new Promise(resolve => setTimeout(resolve, 20));

function host(running: string | null) {
  let callback: ((batch: readonly BoardContact[]) => void) | undefined;
  const activations: { model: string }[] = [];
  const warnings: unknown[][] = [];
  console.warn = (...args: unknown[]) => { warnings.push(args); };
  input.subscribe = (cb: typeof callback) => { callback = cb; };
  input.unsubscribe = () => { callback = undefined; };
  input.getActiveModel = () => running;
  input.activateModel = async (args: { model: string }) => { activations.push(args); };
  return { fire: () => callback!([]), activations, warnings, subscribed: () => callback !== undefined };
}

for (const running of ["model.dla", "model.tflite", "", null]) {
  test(`startInput never activates a model on a host reporting ${JSON.stringify(running)}`, async () => {
    const run = host(running);
    let batches = 0;
    const stop = startInput(() => { batches++; }, () => {});
    await settle();
    assert.equal(run.subscribed(), true);
    run.fire(); run.fire();
    await settle();
    assert.equal(batches, 2);
    const again = startInput(() => {}, () => {});
    await settle();
    assert.deepEqual(run.activations, [], "the host's launch model is never swapped");
    assert.equal(run.warnings.length, 0);
    again();
    stop();
  });
}

// Nothing in the starter's source asks for a model, so no path (a refactor, a helper) can send
// the host a blank or missing model name. npm test runs from the project root.
test("no starter source file calls activateModel", () => {
  const files = readdirSync("src").filter(name => name.endsWith(".ts"));
  assert.ok(files.includes("runtime.ts") && files.includes("main.ts"));
  for (const name of files) {
    assert.doesNotMatch(readFileSync(`src/${name}`, "utf8"), /activateModel\s*\(/, `src/${name}`);
  }
});
