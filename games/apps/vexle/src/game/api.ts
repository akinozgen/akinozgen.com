import { fetchGame, recordConflict } from "@akinozgen/account/client";
import type { DailyInfo, VexleVerdict } from "@vexle/data/client";

/** The game server. It alone knows today's flag. */
const BASE = `${import.meta.env.VITE_VEXLE_API ?? "/api/vexle"}`;

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
  if (!response.ok) throw (await recordConflict(response)) ?? new Error(`server answered ${response.status}`);
  return (await response.json()) as T;
}

export function fetchDaily(date: string): Promise<DailyInfo> {
  return get("daily", { date });
}

export function judge(date: string, guesses: readonly string[], hard: boolean, signedIn = false): Promise<VexleVerdict> {
  return get("judge", { d: date, g: guesses.join(","), hard: hard ? "1" : undefined }, signedIn);
}

/**
 * An endless round: card `index` of the deck this browser picked at random,
 * judged against the server's secret. Rounds saved before the decks have no index.
 */
export function judgeEndless(
  round: number,
  guesses: readonly string[],
  hard: boolean,
  index?: number,
  signedIn = false,
): Promise<VexleVerdict> {
  return get(
    "endless",
    {
      e: String(round),
      i: index === undefined ? undefined : String(index),
      g: guesses.join(","),
      hard: hard ? "1" : undefined,
    },
    signedIn,
  );
}
