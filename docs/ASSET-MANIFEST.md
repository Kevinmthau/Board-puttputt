# Twist Putt asset manifest

| Asset | Role | Source | Rights / notes |
|---|---|---|---|
| vendor/board.fun-web-sdk-1.0.0-beta.8.tgz | Pinned SDK dependency used to build the game | Board Studio starter | Copyright Harris Hill Products Inc.; [Developer Terms of Use](https://docs.dev.board.fun/more/license). Section 3(b) restricts SDK redistribution except incorporated distributable elements or with written consent. |
| public/piece-art/1.png through 8.png | Identify Sports equipment in setup and help | board-games-ai Sports catalog at 87831b85 | Canonical Board assets, retained unchanged for Board game use |
| public/piece-footprints.json | Actual piece geometry and facing | Same Sports catalog | Board catalog data |
| public/model.tflite | Sports recognition | sports_v0.1.0.tflite, same catalog | Board model, original format, no runtime activation |
| public/fonts/itc-kabel-ultra.otf | Game typography and title | Studio starter | Board-supplied font |
| src/render.ts | Authored park scenery, course materials, title composition, props, balls, feedback and UI | Original Canvas 2D artwork created for this game | Original code artwork; canonical pieces are not replaced |
| src/audio.ts | Putt, rail, water, tunnel, cup, fanfare and bird ambience | Original Web Audio synthesis | Original procedural sound; all voices use platform audio buses |
| dev/putting-controls.js | Browser-only Sports footprint proxies | Original code using canonical outlines | Development aid, excluded from native package |

Sports model SHA-256: `4d75343e149b72f8410cad10f518c64791634ae6e6932880088a34c164026ad9`.
No third-party stock art or network-loaded fonts are required.

October 27, 2026 collision revision: no new media assets. Opponent-ball feedback reuses the original ball artwork and procedural bounce sound; the Sports model, canonical art, font and vendored SDK remain unchanged.
