import { fetchGame, recordConflict } from "@akinozgen/account/client";
import type { FitReply, PieceState, Puzzle, Reveal } from "@tessle/data/client";

/** The game server. It alone knows where each piece belongs. */
const BASE = `${import.meta.env.VITE_TESSLE_API ?? "/api/tessle"}`;

/** Which round a call is about: a day, or an endless round's number. */
export type RoundKey = { date: string } | { round: number };

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

/** A board as it is sent, and as the account's record keeps it. */
export const boardText = (pieces: readonly PieceState[]): string => pieces.map((p) => `${tenth(p.x)},${tenth(p.y)},${p.r}`).join(";");

/** A board as the record keeps it, back in pieces; null if it isn't one. */
export function boardOf(text: string, count: number): PieceState[] | null {
  const pieces = text.split(";").map((entry) => entry.split(",").map(Number));
  if (pieces.length !== count || pieces.some((fields) => fields.length !== 3 || fields.some((n) => !Number.isFinite(n)))) return null;
  return pieces.map(([x, y, r]) => ({ x, y, r }));
}

/**
 * What a signed-in page tells the server along with a board: how many boards
 * it has seen judged (`n`), and its word that the names have stayed hidden
 * (`hard`), which only the page can know.
 */
export interface Mark {
  checks: number;
  hard: boolean;
}

const markParams = (mark: Mark | undefined): Record<string, string | undefined> =>
  mark ? { n: String(mark.checks), hard: mark.hard ? "1" : undefined } : {};

/** Which pieces fit on `board` (a boardText); none, to ask where a round stands before anything is on it. */
export function askFit(
  key: RoundKey,
  board: string | null,
  moved: readonly number[],
  unitsPerPx: number,
  mark?: Mark,
  signedIn = false,
): Promise<FitReply> {
  return get(
    "fit",
    {
      ...roundParams(key),
      p: board ?? undefined,
      m: moved.join(","),
      u: unitsPerPx.toFixed(2),
      ...markParams(mark),
    },
    signedIn,
  );
}

export function fetchReveal(key: RoundKey, mark?: Mark, signedIn = false): Promise<Reveal> {
  return get("reveal", { ...roundParams(key), ...markParams(mark) }, signedIn);
}
