import { dailyPuzzle, type PlayRules, roundNumber } from "../../core/src/record.ts";
import type { FitReply } from "./types.ts";

/**
 * tessle's side of a signed-in player's record (see core/src/record.ts).
 * A round isn't a list of guesses but a board that keeps changing, so what
 * is kept is the board as last judged and how many boards have been judged:
 * the page says how many it has seen, and a board from a page that is behind
 * (another device has moved on) is refused rather than taken. Pure, so the
 * Worker's route and the tests share it.
 *
 * Not on record, because the server never sees them: the page's move count
 * (it counts drags and turns; the server only sees the boards it is asked
 * about) and its clock (the time on record is the server's own, from the
 * first request for the round to the one that ended it).
 */

/** A round's moves on record. */
export interface TessleMoves {
  /** The board as last judged, "x,y,r;…" as the page sent it; "" before the first. */
  board: string;
  /** Boards judged so far: each one that differs from the board before it counts. */
  checks: number;
  /** The player gave up and was shown the answer. */
  gaveUp: boolean;
  /**
   * The page's word that the names were hidden throughout. The server can't
   * know: it sends the names to any request for the round without `hard`,
   * and whether the page shows them is the page's business. Until the first
   * board it follows the page; after that it only turns off.
   */
  hard: boolean;
}

/** What one request carries. */
export interface TessleRequest {
  /** The board to judge; null when the request has none (a page opening the round, or giving up). */
  board: string | null;
  /** How many boards the page has seen judged: `n`. */
  after: number;
  gaveUp: boolean;
  hard: boolean;
}

/** A finished round as the account keeps it, from the server's verdict. */
export interface TessleResult {
  won: boolean;
  /** What only the page can say, kept apart from the verdict: see TessleMoves.hard. */
  claimed: { hard: boolean };
}

/**
 * The record a `fit` or `reveal` request belongs to, or null for any other:
 * "d:<date>" for a day's map, "e:<round>" for an endless one. `n` is the
 * boards the page has seen judged; `hard` is the page's claim that the round
 * has been played with the names hidden.
 */
export function tessleRules(action: string, query: URLSearchParams): PlayRules<TessleMoves, TessleResult, TessleRequest> | null {
  if (action !== "fit" && action !== "reveal") return null;
  let puzzle: string | null;
  if (query.has("e")) {
    const round = roundNumber(query.get("e"));
    puzzle = round === null ? null : `e:${round}`;
  } else {
    puzzle = dailyPuzzle(query.get("date") ?? query.get("d"));
  }
  const after = Number(query.get("n") ?? "0");
  if (!puzzle || !Number.isInteger(after) || after < 0) return null;

  const giving = action === "reveal";
  return {
    puzzle,
    moves: { board: giving ? null : query.get("p") || null, after, gaveUp: giving, hard: query.get("hard") === "1" },
    extend: (stored, incoming) => {
      if (stored && incoming.after !== stored.checks) return null;
      // Nothing on record yet: the page's count stands, and its board, if it has one.
      const base = stored ?? { board: "", checks: incoming.after, gaveUp: false, hard: incoming.hard };
      const moved = incoming.board !== null && incoming.board !== base.board;
      return {
        board: moved ? incoming.board! : base.board,
        checks: base.checks + (moved ? 1 : 0),
        gaveUp: base.gaveUp || incoming.gaveUp,
        hard: base.board === "" ? incoming.hard : base.hard && incoming.hard,
      };
    },
    same: (stored, incoming) =>
      incoming.after === stored.checks &&
      (incoming.board === null || incoming.board === stored.board) &&
      incoming.gaveUp === stored.gaveUp,
    replay: (moves) => {
      const replay = new URLSearchParams(query);
      if (moves.board) replay.set("p", moves.board);
      else replay.delete("p");
      return replay;
    },
    result: (body, moves) => {
      if (giving) return { won: false, claimed: { hard: moves.hard } };
      return (body as FitReply).solved ? { won: true, claimed: { hard: moves.hard } } : null;
    },
  };
}
