import type { Verdict } from "@sizele/data/client";

/** The game server. It alone knows the day's pairs and how big things really are. */
const BASE = `${import.meta.env.VITE_SIZELE_API ?? "/api/sizele"}`;

/** Which game a call is about: a day, or an endless set. */
export type GameKey = { date: string } | { round: number };

/** Three significant figures say all a slider can. */
const short = (n: number): string => String(Number(n.toPrecision(3)));

export async function play(key: GameKey, guesses: readonly number[]): Promise<Verdict> {
  const query = new URLSearchParams("date" in key ? { d: key.date } : { e: String(key.round) });
  if (guesses.length > 0) query.set("g", guesses.map(short).join(","));
  const response = await fetch(`${BASE}/play?${query}`);
  if (!response.ok) throw new Error(`server answered ${response.status}`);
  return (await response.json()) as Verdict;
}

export { short };
