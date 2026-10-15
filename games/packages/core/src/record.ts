/**
 * A signed-in player's daily puzzles, as the server keeps them: the part
 * every game shares. Each game says, in its own terms, what a request's moves
 * are and how they may grow (its `PlayRules`, in the game's package); this
 * decides, from the play on record, whether to judge the request, refuse it,
 * or answer for the play as it stands, and what, if anything, to write.
 *
 * Pure: the store and the judge are handed in, so the same code runs on the
 * Worker (D1 behind the store, see src/lib/plays.ts at the site's root) and
 * in tests (a Map). Nothing here is sent to a browser.
 */

/** A game API's answer, as each game's handler gives it. */
export interface Reply {
  status: number;
  body: unknown;
  cache: string;
}

/** What the server has of one puzzle (games/packages/account/src/server/worker/plays.ts). */
export interface StoredPlay<Moves> {
  moves: Moves;
  finishedAt: number | null;
}

/**
 * One request, read by its game: which puzzle, which moves, and how those may
 * grow. `Request` is what one request carries, when that isn't the whole of
 * what is kept (tessle's boards).
 */
export interface PlayRules<Moves, Result, Request = Moves> {
  /** "d:<date>" for a day's puzzle, "e:<round>" for an endless one. */
  puzzle: string;
  /** The moves the request carries, in the game's own terms. */
  moves: Request;
  /**
   * The moves on record once the request's are taken in, or null when they
   * don't grow from what is stored: a list only grows at its end, a flag
   * like giving up only turns on, a "hard throughout" flag only turns off.
   * `stored` is null while nothing is on record; anything grows from that.
   */
  extend(stored: Moves | null, incoming: Request): Moves | null;
  /** Whether a request's moves are exactly the play's: what a finished puzzle still answers. */
  same(stored: Moves, incoming: Request): boolean;
  /** The request again, carrying `moves` in place of its own. */
  replay(moves: Moves): URLSearchParams;
  /** The record's summary of a verdict that ends the puzzle; null while it's still being played. */
  result(verdict: unknown, moves: Moves): Result | null;
}

export interface PlayStore<Moves, Result> {
  load(): Promise<StoredPlay<Moves> | null>;
  /** Writes the moves, and the result when there is one. */
  save(moves: Moves, result: Result | null): Promise<void>;
}

/** The error a refused request carries; its body also has the moves on record. */
export const RECORD_CONFLICT = "kayit";

/** Whether two JSON values are the same. */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  return (
    keysA.length === keysB.length &&
    keysA.every((key) => sameJson((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
  );
}

/** An answer that depends on whose play it is: never kept by a cache. */
const own = (reply: Reply): Reply => ({ ...reply, cache: "no-store" });

const conflict = (moves: unknown): Reply => ({
  status: 409,
  body: { error: RECORD_CONFLICT, moves },
  cache: "no-store",
});

/**
 * Judges a signed-in player's request against their play on record.
 *
 * - Moves that don't grow from the stored ones are refused (409, with the
 *   stored moves), so the page can take those up instead.
 * - A finished puzzle is never opened again: a request for exactly its moves
 *   gets the verdict on them, judged afresh (the judges are deterministic);
 *   anything else is refused as above.
 * - Otherwise the request is judged with the moves as they now stand, and
 *   they are written only if they changed, with the result when the verdict
 *   ends the puzzle.
 *
 * The store failing never stops play: a failed read answers as for a player
 * who isn't signed in (`query` as it came), a failed write still answers.
 */
export async function judgeRecorded<Moves, Result, Request>(
  rules: PlayRules<Moves, Result, Request>,
  store: PlayStore<Moves, Result>,
  judge: (query: URLSearchParams) => Promise<Reply>,
  query: URLSearchParams,
  onError: (error: unknown) => void = () => {},
): Promise<Reply> {
  let play: StoredPlay<Moves> | null;
  try {
    play = await store.load();
  } catch (error) {
    onError(error);
    return judge(query);
  }

  if (play && play.finishedAt !== null) {
    if (!rules.same(play.moves, rules.moves)) return conflict(play.moves);
    return own(await judge(rules.replay(play.moves)));
  }

  const moves = rules.extend(play?.moves ?? null, rules.moves);
  if (moves === null) return play ? conflict(play.moves) : judge(query);

  const reply = await judge(rules.replay(moves));
  if (reply.status !== 200) return own(reply);
  const result = rules.result(reply.body, moves);
  if (!play || result !== null || !sameJson(play.moves, moves)) {
    try {
      await store.save(moves, result);
    } catch (error) {
      onError(error);
    }
  }
  return own(reply);
}

/** "d:2026-10-16" for a day's puzzle, if `date` is one. */
export function dailyPuzzle(date: string | null): string | null {
  return date !== null && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `d:${date}` : null;
}

/** An endless round's number as the APIs take it: 32 bits, in decimal. */
export function roundNumber(text: string | null): number | null {
  if (text === null || !/^\d{1,10}$/.test(text)) return null;
  const number = Number(text);
  return number <= 0xffffffff ? number : null;
}

/** A comma-separated list as the APIs read it, empty items dropped. */
export const listOf = (text: string | null): string[] => (text ? text.split(",").filter(Boolean) : []);

/** Whether `before` is where `after` started: every item of `before`, in order, at the front of `after`. */
export const isPrefix = <T>(before: readonly T[], after: readonly T[]): boolean =>
  before.length <= after.length && before.every((item, i) => after[i] === item);
