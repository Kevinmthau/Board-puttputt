# Twist Putt

## Summary
Nine outdoor mini golf holes, par 27, for 1–4 people using Board Sports pieces. Build from the exact Studio starter and install on KT’s Board. The user approved this design on October 27, 2026.

## How to play
1. Place your Sports piece beside your ball.
2. Point the forehead line toward your ball.
3. Twist the line through the ball to putt; it is ready immediately.
4. Finish nine holes in the fewest strokes.

## Rules
The club begins at the real front outline and reaches 240 px from the piece center. Ball radius: 14 px. The visible finite line defines its reach, with no additional stance-distance gate. Contact launches along the sweep, perpendicular to the club. Both rotation directions work. Angular speed 30–540 degrees/second maps to ball speed 180–1500 px/second, clamped. Distance does not change power.

The user tested the game on KT’s Board and reported that the line often crossed the ball without firing, then requested “make the line active at all times.” This overrides the initial settled-piece, clear-line, deliberate-backswing and 120–230 px stance gates. A rotating line is immediately live for the current player's stopped ball, including when it starts in contact. Natural position drift while twisting is allowed. Pure placement or translation, missing tracking history, pause, and inactive turns do not create strokes. A small angle tolerance filters sensor jitter. Swept contact catches fast swings, and a committed shot remains locked until the ball rests. Physical pieces are controllers and may stand on scenery. Only balls collide with course geometry.

Take one shot each in roster order, skipping finished players. Inactive balls are visible and noncolliding. Water adds one penalty and returns to the pre-shot position. Seven total strokes ends a hole with a pickup. All players finish before advancing. Lowest total wins; equal totals share the win.

| Hole | Par | Challenge |
|---|---|---|
| First Green | 2 | Straight green and curved catching rail |
| Banker’s Bend | 2 | L-shaped route and a bank shot |
| Windmill Meadow | 3 | Timed opening and safe outer path |
| Willow River | 3 | Narrow bridge and wider curved crossing |
| Foxglove Tunnel | 3 | Tunnel shortcut and open hill path |
| Summit Switchback | 3 | Direct ramp and gentle switchback |
| Pebble Pinball | 3 | Boulder rebounds and slowing sand |
| Twin Falls | 4 | Two crossings, island and tunnel shortcut |
| Castle Cup | 4 | Moat, moving gate, tunnel and perimeter bypass |

Keep ball locations about 220 px from glass edges. Validate stance clearance with Tennis, radius 87.84 px. Fixed tunnel exits retain most speed. Slopes use ground acceleration without jumps. Hazards are deterministic and freeze on pause.

## Players and seating
Use Board’s selector through seats.ts. Solo seats the signed-in profile. Pieces at free edges bind the next unbound roster player. Edges: bottom, top, left, right. Identity and scores follow sessionId. Ownership survives lifts and tracking recovery. Human players only, explicitly selected by the user for physical putting. No AI registrations.

## Communication and teaching
| State | Next action | Signal | Ends when |
|---|---|---|---|
| Title | Place a Sports piece | Real product art and miniature scenery | Piece lands |
| Setup | Choose players and place pieces | Canonical art, edge cues, roster | Ready players enter course |
| Address | Move beside active ball | Patterned ball pulse and seat cue | The visible line can reach the ball |
| Swing | Rotate the line through the ball | Always-bright forehead line and literal demonstration | Shot commits |
| Roll | Watch ball | Trail, sound and obstacle reactions | Ball rests, sinks or splashes |
| Missing | Return owned piece | Seat prompt | Piece returns |
| Result | Rematch or change setup | Shared scorecard and decision | Choice made |

## First minute
1. Animated windmill and miniature river frame the title.
2. A real Sports piece lands with one splash; roster setup opens.
3. First Green teaches placement and a sideways sweep on the actual ball.
4. A stroke gives a putt sound and trail; sinking gives a bell and celebration.
Help is optional, skippable and in the platform menu. It preserves the round.

## Result and replay
Show all nine scores and totals. One shared Rematch or Change setup decision waits indefinitely. Rematch resets balls, turns, scores, hazards and stroke intent while preserving players and pieces. Change setup allows roster changes. No automatic restart.

## Look
Sunny top-down miniature adventure: textured turf, wooden rails, turquoise water, pale stone, rounded trees, flowers, windmills and castle. Full-canvas world with shallow shadows and collision-aligned edges. Quiet hand space. Canonical product art remains upright in setup/help. Draw the requested beam from frontPoint, no rings or duplicate sprites on hardware. Text floors: 48 px in play, 32 px otherwise. Targets 120 px; edge inset 48 px. Seat-facing cues at all four edges. SFX and quiet outdoor ambience through gameAudio().

## Implementation
Preserve TypeScript, Vite, Canvas 2D, 1920×1080 and vendored SDK beta.8. Sports has model.tflite and facing offset zero. Separate swing/tracking, course/physics/rules and rendering. Fixed-step swept physics. Platform owns saves, menus, audio and exit. Browser-only proxies support drag placement, rotation handle and Q/E, feeding the same pose logic. Exclude proxies from native package.

## Decisions
User: nine holes, Sports pieces, twist-speed power, tangent shots, nearby stance, outdoor look, 1–4 humans, alternating shots, family-friendly rules, KT’s Board installation.
Approved builder defaults: Twist Putt title, par 27, initial tuning above, ghost inactive balls, deterministic hazards, no cloud hosting.
On October 27, 2026, the user requested committing and publishing the source to a public GitHub repository. The destination is `Kevinmthau/Board-puttputt`; publishing source does not change the game's hosting or runtime.
The requested forehead line is gameplay emitted from the front outline, not decoration around a controller.
References: https://en.wikipedia.org/wiki/Miniature_golf and https://monsterminigolf.com/blog/mini-golf/how-to-play-mini-golf/.
