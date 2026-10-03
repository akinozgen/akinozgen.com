import type { DailyPuzzle, EndlessResponse, HintName, Verdict } from "@travelle/geo/client";

/**
 * The game server. It holds the borders and the daily seed, so it is the
 * one that says what today's puzzle is and how each guess scores.
 */
const BASE = `${import.meta.env.VITE_TRAVELLE_API ?? "/api/travelle"}`;

export class ServerError extends Error {
  constructor(readonly status: number) {
    super(`server answered ${status}`);
  }
}

async function get<T>(action: string, params: Record<string, string | undefined>): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, value);
  }
  const response = await fetch(`${BASE}/${action}?${query}`);
  if (!response.ok) throw new ServerError(response.status);
  return (await response.json()) as T;
}

export function fetchDaily(date: string): Promise<DailyPuzzle> {
  return get("daily", { date });
}

export function fetchEndless(params: {
  seed: number;
  mask: number;
  excluded: readonly string[];
  min: number;
  max: number;
}): Promise<EndlessResponse> {
  return get("endless", {
    seed: String(params.seed),
    c: String(params.mask),
    x: params.excluded.join(","),
    min: String(params.min),
    max: String(params.max),
  });
}

export interface Round {
  /** `d` for a daily (its date), `k` for an endless round (its key). */
  daily?: string;
  key?: string;
  guesses: readonly string[];
  hints: readonly HintName[];
  surrendered: boolean;
}

export function judge(round: Round): Promise<Verdict> {
  return get("judge", {
    d: round.daily,
    k: round.key,
    g: round.guesses.join(","),
    h: round.hints.join(","),
    s: round.surrendered ? "1" : undefined,
  });
}
