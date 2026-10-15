import { dailyPuzzle, isPrefix, listOf, type PlayRules, roundNumber, sameJson } from "../../core/src/record.ts";
import type { VexleVerdict } from "./server.ts";

/**
 * vexle's side of a signed-in player's record (see core/src/record.ts):
 * what a judge request's moves are, and how they may grow. Pure, so the
 * Worker's route and the tests share it.
 */

/** A round's moves on record. */
export interface VexleMoves {
  /** The guesses, as country codes. */
  g: string[];
  /**
   * Every guess so far was asked for with grey tiles, and none since in
   * colour. It is what this account's own requests asked for: until the
   * first guess it follows the switch, after that it only turns off.
   */
  hard: boolean;
}

/** A finished round as the account keeps it: what the stats count, from the server's verdict. */
export interface VexleResult {
  won: boolean;
  /** Guesses made, the winning one included. */
  guesses: number;
  /** Won, or lost, with every guess asked for in grey. */
  hard: boolean;
}

/**
 * The record a request belongs to, or null for any other request: a day's
 * round is "d:<date>", an endless card "e:<deck>.<card>" ("e:<round>" for a
 * round from before the decks).
 */
export function vexleRules(action: string, query: URLSearchParams): PlayRules<VexleMoves, VexleResult> | null {
  let puzzle: string | null = null;
  if (action === "judge") {
    puzzle = dailyPuzzle(query.get("date") ?? query.get("d"));
  } else if (action === "endless") {
    const deck = roundNumber(query.get("e"));
    const card = query.get("i");
    if (deck !== null && card === null) puzzle = `e:${deck}`;
    else if (deck !== null && card !== null && /^\d{1,4}$/.test(card)) puzzle = `e:${deck}.${Number(card)}`;
  }
  if (!puzzle) return null;

  return {
    puzzle,
    moves: { g: listOf(query.get("g")), hard: query.get("hard") === "1" },
    extend: (stored, incoming) => {
      if (!stored) return incoming;
      if (!isPrefix(stored.g, incoming.g)) return null;
      return { g: incoming.g, hard: stored.g.length === 0 ? incoming.hard : stored.hard && incoming.hard };
    },
    // The switch is how the tiles are shown, not a move: a finished round answers whatever it says.
    same: (stored, incoming) => sameJson(stored.g, incoming.g),
    replay: (moves) => {
      const replay = new URLSearchParams(query);
      if (moves.g.length > 0) replay.set("g", moves.g.join(","));
      else replay.delete("g");
      return replay;
    },
    result: (body, moves) => {
      const verdict = body as VexleVerdict;
      if (verdict.status === "playing") return null;
      return { won: verdict.status === "won", guesses: verdict.results.length, hard: moves.hard };
    },
  };
}
