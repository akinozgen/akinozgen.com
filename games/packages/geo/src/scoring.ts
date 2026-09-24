import type { BorderGraph } from "./graph.ts";

/**
 * How a guess is marked, following Travle's rule that quality is measured
 * against the guesses already made, not against the shortest route.
 */
export type GuessMark =
  /** ✅ closes the gap and is joined to the start by earlier guesses */
  | "chain"
  /** 🟩 closes the gap but is still detached from the start */
  | "closer"
  /** 🟧 a route through it is no worse than one extra guess */
  | "detour"
  /** 🟥 a route through it costs more than that, or there is none */
  | "wrong";

export const MARK_EMOJI: Record<GuessMark, string> = {
  chain: "✅",
  closer: "🟩",
  detour: "🟧",
  wrong: "🟥",
};

/** Extra guesses granted on top of the shortest solution. */
export function guessBudget(shortest: number): number {
  const extra = shortest <= 3 ? 4 : shortest <= 6 ? 5 : shortest <= 9 ? 6 : shortest <= 12 ? 7 : 8;
  return shortest + extra;
}

export interface GuessResult {
  region: string;
  mark: GuessMark;
  /** Guesses still needed after this one. */
  remaining: number;
}

export function evaluateGuess(
  graph: BorderGraph,
  start: string,
  end: string,
  previous: readonly string[],
  guess: string,
): GuessResult {
  const before = graph.solve(start, end, previous).cost;
  const after = [...previous, guess];
  const remaining = graph.solve(start, end, after).cost;

  if (remaining < before) {
    const joined = graph.reachableFromStart(start, after).has(guess);
    return { region: guess, mark: joined ? "chain" : "closer", remaining };
  }

  const through = graph.solveThrough(start, end, previous, guess).cost;
  return { region: guess, mark: through <= before + 1 ? "detour" : "wrong", remaining };
}

/** A run is perfect when every guess was a ✅ and none were spare. */
export function isPerfect(results: readonly GuessResult[], shortest: number): boolean {
  return results.length === shortest && results.every((r) => r.mark === "chain");
}
