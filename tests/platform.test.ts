// The platform layer's stand-in (src/platform-stub.ts) under node:test, gameAudio() handing
// its buses to the platform, and seats.ts registering AI types. In a packaged game the real
// board-platform.js runs instead.
import { test } from "node:test";
import assert from "node:assert/strict";
import "../src/platform-stub";

test("the stand-in answers like the platform with nothing to persist", async () => {
  const state = BoardPlatform.state;
  assert.deepEqual(await state.ready(), { restored: false, reason: "off-device" });
  assert.equal(state.progress.get("level", 1), 1);
  state.progress.set("level", 7);
  assert.equal(state.progress.get("level", 1), 7);
  state.save({ turn: 3 });
  assert.equal(state.load(), undefined);
  assert.equal(await state.flush(), false);
  assert.equal(state.status().phase, "memory-only");
  assert.equal(state.status().restoredLate, false);
  const stop = state.onRestore(() => assert.fail("nothing is restored late off a Board"));
  stop();
  state.clear();
  assert.equal(state.progress.get("level"), undefined);
  assert.deepEqual(BoardPlatform.audio.levels(), { music: 70, sfx: 90, muted: false });
});

test("gameAudio() binds its buses to the platform, which sets their gains", async () => {
  const listeners: string[] = [];
  const g = globalThis as Record<string, unknown>;
  g.window = { addEventListener: (type: string) => listeners.push(type) };
  g.document = { hidden: false, addEventListener() {} };
  g.AudioContext = class {
    state = "running";
    destination = {};
    createGain() { return { gain: { value: 1 }, connect() {} }; }
    addEventListener() {}
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
  };
  const info = console.info;
  console.info = () => {};
  try {
    const { gameAudio } = await import("../src/runtime");
    const a = gameAudio();
    assert.equal(a.music.gain.value, 0.7);
    assert.equal(a.sfx.gain.value, 0.9);
    assert.ok(listeners.includes("pointerdown"));
  } finally {
    console.info = info;
  }
});

// src/seats.ts's registerAiTypes() against a stand-in Board bridge: a humans-only game (an empty
// list) never reaches setAIPlayerTypes, which a Board refuses with "Invalid AI player types".
test("registerAiTypes() registers computer players and skips an empty list", async () => {
  const sent: string[] = [];
  const g = globalThis as Record<string, unknown>;
  g.window = {
    BoardSDK: {
      setAIPlayerTypes: (json: string) => {
        if (json === "[]") throw new Error("Invalid AI player types");
        sent.push(json);
      },
    },
  };
  const { registerAiTypes } = await import("../src/seats");
  registerAiTypes([]);
  assert.deepEqual(sent, []);
  registerAiTypes([{ name: "Rook", description: "Plays the safe square" }]);
  assert.deepEqual(sent.map((s) => JSON.parse(s)), [[{ name: "Rook", description: "Plays the safe square" }]]);
});
