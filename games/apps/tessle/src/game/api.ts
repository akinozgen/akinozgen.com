import type { FitReply, PieceState, Puzzle, Reveal } from "@tessle/data/client";

/** The game server. It alone knows where each piece belongs. */
const BASE = `${import.meta.env.VITE_TESSLE_API ?? "/api/tessle"}`;

/** Which round a call is about: a day, or an endless round's number. */
export type RoundKey = { date: string } | { round: number };

async function get<T>(action: string, params: Record<string, string | undefined>): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, value);
  }
  const response = await fetch(`${BASE}/${action}?${query}`);
  if (!response.ok) throw new Error(`server answered ${response.status}`);
  return (await response.json()) as T;
}

const roundParams = (key: RoundKey): Record<string, string> =>
  "date" in key ? { d: key.date } : { e: String(key.round) };

export function fetchPuzzle(key: RoundKey, hard: boolean): Promise<Puzzle> {
  const flag = hard ? "1" : undefined;
  return "date" in key
    ? get("daily", { date: key.date, hard: flag })
    : get("endless", { e: String(key.round), hard: flag });
}

/** Tenths of a unit are far finer than any snap, and keep the address short. */
const tenth = (n: number): string => String(Math.round(n * 10) / 10);

export function askFit(key: RoundKey, pieces: readonly PieceState[], moved: readonly number[], unitsPerPx: number): Promise<FitReply> {
  return get("fit", {
    ...roundParams(key),
    p: pieces.map((p) => `${tenth(p.x)},${tenth(p.y)},${p.r}`).join(";"),
    m: moved.join(","),
    u: unitsPerPx.toFixed(2),
  });
}

export function fetchReveal(key: RoundKey): Promise<Reveal> {
  return get("reveal", roundParams(key));
}
