// Player seats, kept the way the Board keeps them. Use these two functions instead of calling
// Board.session.presentAddPlayer / presentReplacePlayer directly, and seat players only after
// `await BoardPlatform.state.ready()`: restoring the autosave may reseat the session, and after it
// the session holds the signed-in profile alone (PLATFORM.md).
//
// What a real Board does (read from the Board's native session manager, 2026-09-21):
//  1. Board.session.getActiveProfile() ALWAYS has sessionId -1, seated or not. It is not a seat. Match it to a
//     seated player by playerId. presentReplacePlayer(-1) is refused: it answers false and no selector opens,
//     so a "change player" button built on the active profile does nothing.
//  2. The roster from getPlayers() is the only truth about who sits where. A replacement takes over the seat's
//     session id. Roster changes are not pushed; the SDK polls once a second, so always re-read after a pick.
//  3. Register computer players with registerAiTypes() (below), only in a game that has them. A humans-only game
//     never calls Board.session.setAIPlayerTypes: an empty list raises the Board's native "Invalid AI player
//     types" error, so registerAiTypes([]) does nothing. With AI types registered, an EMPTY aiTypeIndices list
//     offers EVERY AI type (only a non-empty list narrows it).
//  4. A dismissed or failed selector answers false. `pickPlayer` also gives up by itself if no answer has come
//     once the player is plainly back in the game, so a game can never be left waiting with its input off.
import {
  Board,
  BoardContactPhase,
  BoardContactType,
  type BoardAIPlayerType,
  type BoardContact,
  type BoardPlayer,
} from "@board.fun/web-sdk";

let waiting: { since: number; release: (answered: boolean) => void } | null = null;
let watching = false;

/** True while a selector is open. Block opening a SECOND selector on this; never block the rest of the game. */
export function selectorOpen(): boolean {
  return waiting !== null;
}

/** Everyone seated in this session, in the Board's order. Seat one is `seated()[0]`, not the active profile. */
export function seated(): BoardPlayer[] {
  return Board.isOnDevice && Board.session.areServicesReady() ? Board.session.getPlayers() : [];
}

/**
 * Open the Board's player selector. `replaceSessionId` must be the sessionId of somebody in `seated()` (never
 * the active profile's -1); omit it to add a player.
 * Resolves true when the roster may have changed, false when nothing was picked. Never rejects, never hangs.
 * Always re-read `seated()` afterwards.
 */
export async function pickPlayer(aiTypeIndices: number[] = [], replaceSessionId?: number): Promise<boolean> {
  if (waiting || !Board.isOnDevice || !Board.session.areServicesReady()) return false;
  if (replaceSessionId !== undefined && !seated().some((p) => p.sessionId === replaceSessionId)) return false;
  if (!watching) {
    watching = true;
    Board.session.onPlayersChanged(() => waiting?.release(true));
  }
  const before = JSON.stringify(seated().map((p) => [p.sessionId, p.playerId]));
  const gaveUp = new Promise<boolean>((resolve) => {
    waiting = { since: performance.now(), release: resolve };
  });
  const call = (replaceSessionId === undefined
    ? Board.session.presentAddPlayer(aiTypeIndices)
    : Board.session.presentReplacePlayer(replaceSessionId, aiTypeIndices)
  ).catch(() => false);
  try {
    const answered = await Promise.race([call, gaveUp]);
    return answered || JSON.stringify(seated().map((p) => [p.sessionId, p.playerId])) !== before;
  } finally {
    waiting = null;
  }
}

/**
 * Call this with every contact frame. The selector covers the whole glass and takes the touches, so a finger
 * that reaches the game more than 1.5 s after the selector opened means the selector is gone: stop waiting.
 */
export function noteContacts(contacts: ReadonlyArray<BoardContact>): void {
  if (!waiting || performance.now() - waiting.since < 1500) return;
  if (contacts.some((c) => c.type === BoardContactType.Finger && c.phase === BoardContactPhase.Began)) waiting.release(false);
}

/**
 * Register the game's computer-player types with the Board's player selector. An empty list is skipped: the Board
 * refuses one ("Invalid AI player types"), and a humans-only game registers nothing.
 */
export function registerAiTypes(types: ReadonlyArray<BoardAIPlayerType>): void {
  if (!types.length || !Board.isOnDevice) return;
  Board.session.setAIPlayerTypes([...types]);
}

/** The seated player who is the Board's active profile, if that profile is seated (matched by playerId). */
export function activeSeat(): BoardPlayer | undefined {
  const active = Board.isOnDevice ? Board.session.getActiveProfile() : null;
  return active ? seated().find((p) => p.playerId === active.playerId) : undefined;
}
