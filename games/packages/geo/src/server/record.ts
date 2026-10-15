import { dailyPuzzle, isPrefix, listOf, type PlayRules, roundNumber, sameJson } from "../../../core/src/record.ts";
import type { Verdict } from "./api.ts";

/**
 * travelle's side of a signed-in player's record (see core/src/record.ts):
 * what a judge request's moves are, and how they may grow. Pure, so the
 * Worker's route and the tests share it.
 */

/** A round's moves on record: the guesses, the hints taken, and whether the player gave up. */
export interface TravelleMoves {
  g: string[];
  h: string[];
  s: boolean;
}

/** A finished round as the account keeps it: what the stats count, from the server's verdict. */
export interface TravelleResult {
  won: boolean;
  /** Guesses made. */
  guesses: number;
  /** Won in as many guesses as the shortest route has countries. */
  perfect: boolean;
  /** Hints taken. */
  hints: number;
}

/**
 * The record a judge request belongs to, or null for any other request. A
 * day's puzzle is "d:<date>"; an endless round is "e:<draw>.<start>.<end>",
 * where the draw is the number the browser drew it with (`r`), so the same
 * pair dealt twice is two rounds. A request without it isn't recorded.
 */
export function travelleRules(action: string, query: URLSearchParams): PlayRules<TravelleMoves, TravelleResult> | null {
  if (action !== "judge") return null;
  const key = query.get("k");
  let puzzle: string | null;
  if (key !== null) {
    const draw = roundNumber(query.get("r"));
    const [start = "", end = ""] = key.split(".");
    puzzle = draw !== null && start && end ? `e:${draw}.${start}.${end}` : null;
  } else {
    puzzle = dailyPuzzle(query.get("d"));
  }
  if (!puzzle) return null;

  return {
    puzzle,
    moves: { g: listOf(query.get("g")), h: listOf(query.get("h")), s: query.get("s") === "1" },
    // Guesses and hints are only ever added at the end; giving up can't be taken back.
    extend: (stored, incoming) =>
      !stored || (isPrefix(stored.g, incoming.g) && isPrefix(stored.h, incoming.h) && (incoming.s || !stored.s)) ? incoming : null,
    same: (stored, incoming) => sameJson(stored, incoming),
    replay: (moves) => {
      const replay = new URLSearchParams(query);
      for (const [name, value] of [
        ["g", moves.g.join(",")],
        ["h", moves.h.join(",")],
        ["s", moves.s ? "1" : ""],
      ] as const) {
        if (value) replay.set(name, value);
        else replay.delete(name);
      }
      return replay;
    },
    result: (body, moves) => {
      const verdict = body as Verdict;
      if (verdict.status === "playing") return null;
      const won = verdict.status === "won";
      const guesses = verdict.results.length;
      // The solution is a shortest route, start and end left out.
      return { won, guesses, perfect: won && guesses === (verdict.solution ?? []).length, hints: moves.h.length };
    },
  };
}
