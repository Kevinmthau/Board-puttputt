# Effects and tests in this starter

`src/fx.ts` holds optional effects for a Canvas 2D game: glow, neon lines, particles, trails,
screen shake, hit-stop, tweens, pop text and the piece-down splash. Its first 40 lines show
every helper with an example. Import only what you use; a helper you never import is not in
the build.

## Fast on the Board

The Board's GPU drops frames when a full 1920x1080 canvas does expensive work every frame.

| Slow every frame | Cheap instead |
|---|---|
| `ctx.shadowBlur`, `ctx.filter` (blur, drop-shadow) | a glow painted once and stamped: `drawGlow`, `neonLine`, `neonCircle` |
| `getImageData` / `putImageData` | keep state in your own arrays |
| redrawing a detailed static backdrop shape by shape | `bake()` it once, then one `drawImage` |
| `fillText` for many changing labels | `PopTexts` renders each label once |
| a new colour string each frame (`hsl(${t}...)`) | a few fixed colours; animate alpha and size |

`'lighter'` compositing, `globalAlpha`, transforms, `drawImage` of a cached canvas or loaded
image, and plain fills or strokes of simple shapes are all cheap.

## One frame

```ts
loop(dt => {
  const g = hitStop.step(dt);                         // game time stops during a hit-stop
  game.update(g); particles.update(g); splashes.update(g); trail.update(g); tweens.update(g);
  shake.update(dt); pops.update(dt);
  ctx.save(); shake.apply(ctx);                       // shake moves the world, not the HUD
  drawWorld(ctx); trail.draw(ctx); particles.draw(ctx); splashes.draw(ctx);
  ctx.restore(); pops.draw(ctx); drawHud(ctx);
});
```

## Pieces

By default, draw nothing around or under a moving piece: no halo, ring, outline or trail
follows it. When a piece lands, call `splashes.at(x, y, { inner: pieceRadius, sound, sparks })` once.
The splash starts at the piece's edge, travels outward and is gone within 1.5 s. Use `Trail`
only for digital objects such as a puck or ball. Effects that bounce off pieces are welcome.

A glow around a piece is traced from its footprint outline: call
`drawOutlineGlow(ctx, pieceFootprint(footprints, contact))` from `src/piece-footprints.ts` (or
`grownOutline` for a custom draw). It hugs the piece's real outline and never paints under it.
Never draw a circle or radius ring to stand in for a piece's base. Show the glow only while the
piece is still (not moving or turning) or for a piece the game designs to stay put, and release
it on any move. This holds unless the user's request explicitly asks for something different.

## Tests

`npm test` runs `scripts/run-tests.mjs`. It bundles every `tests/**/*.test.ts` (with the `src/`
code it imports) using the esbuild that Vite already installed, then runs the bundles with
Node's built-in `node:test`. It needs no network and no new packages.

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreFor } from "../src/rules";
test("a full row scores 100", () => assert.equal(scoreFor(fullRow), 100));
```

- Test the game's own logic: rules, scoring, turns, win checks. node:test has no DOM or
  canvas, so keep that logic in modules that do not touch `document` when imported.
- Read project files by paths relative to the project root.
- `tests/example.test.ts` and `tests/fx.test.ts` are examples. If you delete `src/fx.ts`,
  delete `tests/fx.test.ts` too.
