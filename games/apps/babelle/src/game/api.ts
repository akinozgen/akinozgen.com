import type { BabelleVerdict } from "@babelle/data/client";

/** The game server. It alone knows today's language. */
const BASE = `${import.meta.env.VITE_BABELLE_API ?? "/api/babelle"}`;

export async function judge(
  date: string,
  answers: readonly number[],
  guesses: readonly string[],
): Promise<BabelleVerdict> {
  const query = new URLSearchParams({ d: date });
  if (answers.length) query.set("a", answers.join(","));
  if (guesses.length) query.set("g", guesses.join(","));
  const response = await fetch(`${BASE}/judge?${query}`);
  if (!response.ok) throw new Error(`server answered ${response.status}`);
  return (await response.json()) as BabelleVerdict;
}
