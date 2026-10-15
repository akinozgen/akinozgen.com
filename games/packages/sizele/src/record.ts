import { dailyPuzzle, isPrefix, type PlayRules, roundNumber } from "../../core/src/record.ts";
import { band, ROUNDS, type Verdict } from "./types.ts";

/**
 * sizele's side of a signed-in player's record (see core/src/record.ts):
 * what a `play` request's moves are, and how they may grow. Pure, so the
 * Worker's route and the tests share it.
 *
 * Hard mode is not on record: it never reaches the server (the page has
 * every round's names, and hides them itself), so only the page could say
 * it was on, and the stats don't count it.
 */

/** A game's moves on record: one guess per round played, as the server read it. */
export interface SizeleMoves {
  g: number[];
}

/** A finished game as the account keeps it: what the stats count, from the server's verdict. */
export interface SizeleResult {
  /** The five scores added up. */
  total: number;
  /** Rounds that scored "great" (80 or more). */
  greats: number;
}

/** A guess list as the server reads it, or null if it isn't one (the judge then turns it away). */
function guesses(text: string | null): number[] | null {
  if (!text) return [];
  const fields = text.split(",");
  return fields.every((field) => /^\d+(\.\d+)?$/.test(field)) ? fields.map(Number) : null;
}

/** The record a `play` request belongs to, or null: "d:<date>" for a day's game, "e:<round>" for an endless set. */
export function sizeleRules(action: string, query: URLSearchParams): PlayRules<SizeleMoves, SizeleResult> | null {
  if (action !== "play") return null;
  let puzzle: string | null;
  if (query.has("e")) {
    const round = roundNumber(query.get("e"));
    puzzle = round === null ? null : `e:${round}`;
  } else {
    puzzle = dailyPuzzle(query.get("d") ?? query.get("date"));
  }
  const g = guesses(query.get("g"));
  if (!puzzle || !g) return null;

  return {
    puzzle,
    moves: { g },
    extend: (stored, incoming) => (!stored || isPrefix(stored.g, incoming.g) ? incoming : null),
    same: (stored, incoming) => stored.g.length === incoming.g.length && isPrefix(stored.g, incoming.g),
    replay: (moves) => {
      const replay = new URLSearchParams(query);
      if (moves.g.length > 0) replay.set("g", moves.g.join(","));
      else replay.delete("g");
      return replay;
    },
    result: (body) => {
      const verdict = body as Verdict;
      if (verdict.results.length < ROUNDS) return null;
      return { total: verdict.total, greats: verdict.results.filter((result) => band(result.score) === "great").length };
    },
  };
}
