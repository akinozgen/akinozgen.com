import legacy from "../../data/legacy.json" with { type: "json" };
import type { BorderGraph } from "../graph.ts";

/**
 * The daily puzzle, worked out on the server from a secret seed.
 *
 * Each date's pair comes from HMAC(seed, date), so it is the same for every
 * player and every request, yet nobody without the seed can work out a day
 * that has not been served yet. The first days of the game were published as
 * a fixed list before this existed; those stay exactly as they were played.
 */

export const EPOCH = "2026-01-01";

interface Pair {
  start: string;
  end: string;
  shortest: number;
}

const LEGACY = legacy.puzzles as Pair[];

/** Days before this number keep their published pair. */
export const FIRST_GENERATED_DAY = LEGACY.length;

/**
 * Difficulty mix: a day draws its route length from here, so three- and
 * four-country hops are common and ten-country treks are rare.
 */
const LENGTHS = [3, 3, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 7, 7, 8, 8, 9, 10, 11, 12];

/** A week should not reuse an endpoint; this many earlier days are checked. */
const LOOKBACK = 6;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function utcDay(date: string): number | null {
  const match = ISO_DATE.exec(date);
  if (!match) return null;
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const back = new Date(time);
  // Reject 2026-02-31 and friends rather than letting Date roll them over.
  if (back.getUTCDate() !== Number(match[3]) || back.getUTCMonth() !== Number(match[2]) - 1) {
    return null;
  }
  return time / DAY_MS;
}

/** Days since the epoch, or null for a malformed date. */
export function dayNumber(date: string): number | null {
  const day = utcDay(date);
  const epoch = utcDay(EPOCH)!;
  return day === null ? null : day - epoch;
}

export function dateOf(number: number): string {
  return new Date((utcDay(EPOCH)! + number) * DAY_MS).toISOString().slice(0, 10);
}

/**
 * The latest date anyone on Earth can be living in: UTC+14 (Kiribati). Asking
 * for a later day is asking for tomorrow's puzzle early.
 */
export function latestDate(now: Date): string {
  return new Date(now.getTime() + 14 * 3_600_000).toISOString().slice(0, 10);
}

const encoder = new TextEncoder();
const keys = new Map<string, Promise<CryptoKey>>();

function keyFor(seed: string): Promise<CryptoKey> {
  let key = keys.get(seed);
  if (!key) {
    key = crypto.subtle.importKey(
      "raw",
      encoder.encode(seed),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    keys.set(seed, key);
  }
  return key;
}

/** A random stream for one label, unpredictable without the seed. */
async function stream(seed: string, label: string): Promise<() => number> {
  const digest = new Uint32Array(
    await crypto.subtle.sign("HMAC", await keyFor(seed), encoder.encode(label)),
  );
  // xoshiro128** over the 128 bits of the digest's first half.
  let [a, b, c, d] = digest;
  if ((a | b | c | d) === 0) a = 1;
  return () => {
    const result = Math.imul(rotl(Math.imul(b, 5), 7), 9) >>> 0;
    const t = b << 9;
    c ^= a;
    d ^= b;
    b ^= c;
    a ^= d;
    c ^= t;
    d = rotl(d, 11);
    return result / 4294967296;
  };
}

const rotl = (x: number, k: number): number => (x << k) | (x >>> (32 - k));

/** A day's first draw, before it is checked against the days around it. */
async function draws(graph: BorderGraph, seed: string, day: number): Promise<() => Pair | null> {
  const random = await stream(seed, `travelle:daily:${day}`);
  return () => {
    const length = LENGTHS[Math.floor(random() * LENGTHS.length)];
    return graph.randomPair(random, length, length) ?? graph.randomPair(random, 3, 8);
  };
}

async function firstDraw(graph: BorderGraph, seed: string, day: number): Promise<Pair | null> {
  if (day < FIRST_GENERATED_DAY) return LEGACY[day] ?? null;
  return (await draws(graph, seed, day))();
}

const memo = new Map<string, Pair>();

/**
 * The pair for day `number`. It redraws while an endpoint repeats one from
 * the previous days' first draws — first draws rather than final picks, so a
 * day never depends on the whole chain of days before it.
 */
export async function dailyPair(graph: BorderGraph, seed: string, number: number): Promise<Pair> {
  if (number < FIRST_GENERATED_DAY) return LEGACY[number];
  const cacheKey = `${seed}\u0000${number}`;
  const cached = memo.get(cacheKey);
  if (cached) return cached;

  const recent = new Set<string>();
  for (let back = 1; back <= LOOKBACK; back++) {
    const pair = await firstDraw(graph, seed, number - back);
    if (pair) recent.add(pair.start).add(pair.end);
  }

  const draw = await draws(graph, seed, number);
  let pick: Pair | null = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const pair = draw();
    if (!pair) continue;
    pick ??= pair;
    if (!recent.has(pair.start) && !recent.has(pair.end)) {
      pick = pair;
      break;
    }
  }
  if (!pick) throw new Error(`no puzzle could be drawn for day ${number}`);
  if (memo.size > 64) memo.clear();
  memo.set(cacheKey, pick);
  return pick;
}
