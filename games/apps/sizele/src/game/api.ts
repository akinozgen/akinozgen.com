import { fetchGame, recordConflict } from "@akinozgen/account/client";
import type { Verdict } from "@sizele/data/client";

/** The game server. It alone knows the day's pairs and how big things really are. */
const BASE = `${import.meta.env.VITE_SIZELE_API ?? "/api/sizele"}`;

/** Which game a call is about: a day, or an endless set. */
export type GameKey = { date: string } | { round: number };

/** Three significant figures say all a slider can. */
const short = (n: number): string => String(Number(n.toPrecision(3)));

const playUrl = (key: GameKey, guesses: readonly number[]): string => {
  const query = new URLSearchParams("date" in key ? { d: key.date } : { e: String(key.round) });
  if (guesses.length > 0) query.set("g", guesses.map(short).join(","));
  return `${BASE}/play?${query}`;
};

/**
 * The verdict on the guesses so far. `signedIn`: someone may be signed in,
 * so the answer can depend on their record (and a refusal, a
 * RecordConflict, carries the guesses on record).
 */
export async function play(key: GameKey, guesses: readonly number[], signedIn = false): Promise<Verdict> {
  const response = await fetchGame(playUrl(key, guesses), signedIn);
  if (!response.ok) throw (await recordConflict(response)) ?? new Error(`server answered ${response.status}`);
  return (await response.json()) as Verdict;
}

/**
 * The same question without the session, so no record is consulted: how the
 * page gets back the rounds before the last of a game taken up from the
 * record, each of which the server only deals while it is the next one.
 */
export async function replay(key: GameKey, guesses: readonly number[]): Promise<Verdict> {
  const response = await fetch(playUrl(key, guesses), { credentials: "omit" });
  if (!response.ok) throw new Error(`server answered ${response.status}`);
  return (await response.json()) as Verdict;
}

export { short };
