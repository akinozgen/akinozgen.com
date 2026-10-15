import { fetchGame, recordConflict } from "@akinozgen/account/client";
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

/**
 * `signedIn`: someone may be signed in, so the answer can depend on their
 * record (and a refusal, a RecordConflict, carries the moves on record).
 */
async function get<T>(action: string, params: Record<string, string | undefined>, signedIn = false): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, value);
  }
  const response = await fetchGame(`${BASE}/${action}?${query}`, signedIn);
  if (!response.ok) throw (await recordConflict(response)) ?? new ServerError(response.status);
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
  /** `d` for a daily (its date), `k` for an endless round (its key)… */
  daily?: string;
  key?: string;
  /** …and `r`, the number it was drawn with, which the account's record files it under. */
  draw?: number;
  guesses: readonly string[];
  hints: readonly HintName[];
  surrendered: boolean;
}

export function judge(round: Round, signedIn = false): Promise<Verdict> {
  return get(
    "judge",
    {
      d: round.daily,
      k: round.key,
      r: round.draw === undefined ? undefined : String(round.draw),
      g: round.guesses.join(","),
      h: round.hints.join(","),
      s: round.surrendered ? "1" : undefined,
    },
    signedIn,
  );
}
