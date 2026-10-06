import countriesData from "../data/countries.json" with { type: "json" };
import { RATIO_MAX, RATIO_MIN, type Result, ROUNDS, type RoundInfo, type Shape, type Verdict } from "./types.ts";

/**
 * sizele's game server. Each round asks how many of one country (the unit)
 * make another (the target), by area on the globe. Which pairs a day deals,
 * and how big anything really is, are decided here: the browser gets the
 * round in front of it as two outlines, and the truth only once it has
 * guessed.
 *
 * Everything is a GET carrying every guess so far, so no state is kept and
 * any edge can answer.
 */

export const EPOCH = "2026-10-06";

interface Country {
  id: string;
  continent: string;
  /** km² on the globe, of the outline drawn. */
  area: number;
  /** The same outline's area as Mercator draws it. */
  merc: number;
  centroid: [number, number];
  rings: number[][];
  unit?: boolean;
}

const COUNTRIES = countriesData as unknown as Country[];
const BY_ID = new Map(COUNTRIES.map((country) => [country.id, country]));
/** The familiar ones a round measures in. */
const UNITS = COUNTRIES.filter((country) => country.unit);

/** Too lopsided to judge by eye, or too even to be a question. */
const RATIO_RANGE = { min: 1 / 25, max: 25 };
const TOO_EVEN = { min: 0.8, max: 1.25 };
/** How much the map lies about a pair before it counts as a surprise. */
const SURPRISE = Math.log(3);
const SURPRISES = 3;
/** Every round is one the map gets wrong by at least this much: an honest pair teaches nothing. */
const MIN_LIE = Math.log(1.35);
/** Targets from one continent in a day, at most. */
const PER_CONTINENT = 2;
const ATTEMPTS = 400;

/** How sharply the score falls away: 100 when exact, about 34 at twice or half. */
const SPREAD = Math.log(1.5);

export interface Reply {
  status: number;
  body: unknown;
  cache: string;
}

class BadRequest extends Error {}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function utcDay(date: string): number | null {
  const match = ISO_DATE.exec(date);
  if (!match) return null;
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const back = new Date(time);
  if (back.getUTCDate() !== Number(match[3]) || back.getUTCMonth() !== Number(match[2]) - 1) {
    return null;
  }
  return time / DAY_MS;
}

/** Puzzle number for a date: the epoch is #1. Null if malformed. */
export function puzzleNumber(date: string): number | null {
  const day = utcDay(date);
  return day === null ? null : day - utcDay(EPOCH)! + 1;
}

/** The latest date anyone on Earth can be living in: UTC+14. */
export function latestDate(now: Date): string {
  return new Date(now.getTime() + 14 * 3_600_000).toISOString().slice(0, 10);
}

const encoder = new TextEncoder();
const keys = new Map<string, Promise<CryptoKey>>();

/** A random stream for one label, unpredictable without the seed. */
async function stream(seed: string, label: string): Promise<() => number> {
  let key = keys.get(seed);
  if (!key) {
    key = crypto.subtle.importKey("raw", encoder.encode(seed), { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
    ]);
    keys.set(seed, key);
  }
  const digest = new Uint32Array(await crypto.subtle.sign("HMAC", await key, encoder.encode(label)));
  // xoshiro128** seeded with the first 128 bits of the digest.
  let [a, b, c, d] = digest;
  if ((a | b | c | d) === 0) a = 1;
  const rotl = (x: number, k: number): number => (x << k) | (x >>> (32 - k));
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

/** One round: the unit, the target, and the two numbers that judge it. */
export interface Pair {
  unit: string;
  target: string;
  /** target ÷ unit by area on the globe. */
  ratio: number;
  /** The same as Mercator draws them. */
  apparent: number;
}

const significant = (value: number): number => Number(value.toPrecision(4));

function pairOf(unit: Country, target: Country): Pair {
  return {
    unit: unit.id,
    target: target.id,
    ratio: significant(target.area / unit.area),
    apparent: significant(target.merc / unit.merc),
  };
}

/** How much the map lies about a pair: 0 when it tells the truth. */
export const lie = (pair: Pair): number => Math.abs(Math.log(pair.apparent / pair.ratio));

/**
 * Five pairs from one random stream. Each draw takes a unit people know and
 * any target, keeping the ratio judgeable and no country twice; a set needs
 * at least two pairs the map lies about badly. The rounds then run from the
 * most honest pair to the most misleading, so a day builds to its surprise.
 */
export function dealRounds(random: () => number): Pair[] {
  let best: Pair[] = [];
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const used = new Set<string>();
    const continents = new Map<string, number>();
    const pairs: Pair[] = [];
    for (let draw = 0; draw < 60 && pairs.length < ROUNDS; draw++) {
      const unit = UNITS[Math.floor(random() * UNITS.length)];
      const target = COUNTRIES[Math.floor(random() * COUNTRIES.length)];
      if (unit.id === target.id || used.has(unit.id) || used.has(target.id)) continue;
      if ((continents.get(target.continent) ?? 0) >= PER_CONTINENT) continue;
      const ratio = target.area / unit.area;
      if (ratio < RATIO_RANGE.min || ratio > RATIO_RANGE.max) continue;
      if (ratio > TOO_EVEN.min && ratio < TOO_EVEN.max) continue;
      if (lie(pairOf(unit, target)) < MIN_LIE) continue;
      used.add(unit.id);
      used.add(target.id);
      continents.set(target.continent, (continents.get(target.continent) ?? 0) + 1);
      pairs.push(pairOf(unit, target));
    }
    if (pairs.length < ROUNDS) continue;
    const surprises = pairs.filter((pair) => lie(pair) > SURPRISE).length;
    if (surprises >= SURPRISES) return pairs.sort((a, b) => lie(a) - lie(b));
    if (best.length === 0 || surprises > best.filter((pair) => lie(pair) > SURPRISE).length) best = pairs;
  }
  // Every stream so far has found a set within a few tries; this is only so
  // a freak one cannot leave a day empty.
  return best.sort((a, b) => lie(a) - lie(b));
}

const memo = new Map<string, Pair[]>();

async function memoised(key: string, make: () => Promise<Pair[]>): Promise<Pair[]> {
  const cached = memo.get(key);
  if (cached) return cached;
  const pairs = await make();
  if (memo.size >= 64) memo.delete(memo.keys().next().value!);
  memo.set(key, pairs);
  return pairs;
}

/** Day `number`'s rounds, the same for everyone. */
export function dailyRounds(seed: string, number: number): Promise<Pair[]> {
  return memoised(`${seed}\u0000d${number}`, async () => dealRounds(await stream(seed, `sizele:day:${number}`)));
}

/**
 * An endless set, from a number the player's browser picks at random. The
 * pairs come from HMAC(secret, number), so the number alone says nothing;
 * the page opens endless only once the day's game is finished.
 */
export function endlessRounds(seed: string, round: number): Promise<Pair[]> {
  return memoised(`${seed}\u0000e${round}`, async () => dealRounds(await stream(seed, `sizele:endless:${round}`)));
}

/** 100 for the truth, falling away on a log scale: half again off is about 61, twice or half about 23. */
export function scoreOf(guess: number, ratio: number): number {
  return Math.round(100 * Math.exp(-(Math.log(guess / ratio) ** 2) / (2 * SPREAD * SPREAD)));
}

function shapeOf(id: string): Shape {
  const country = BY_ID.get(id)!;
  return { id, rings: country.rings, centroid: country.centroid };
}

/** Judges the guesses made so far and hands over the next round. */
export function judge(pairs: Pair[], guesses: readonly number[]): Pick<Verdict, "results" | "next" | "total"> {
  const results: Result[] = guesses.map((guess, i) => ({
    unit: pairs[i].unit,
    target: pairs[i].target,
    guess,
    ratio: pairs[i].ratio,
    apparent: pairs[i].apparent,
    score: scoreOf(guess, pairs[i].ratio),
    areas: [BY_ID.get(pairs[i].target)!.area, BY_ID.get(pairs[i].unit)!.area].map((km2) => Math.round(km2)) as [number, number],
  }));
  const upcoming = pairs[guesses.length];
  const next: RoundInfo | null = upcoming ? { unit: shapeOf(upcoming.unit), target: shapeOf(upcoming.target) } : null;
  return { results, next, total: results.reduce((sum, result) => sum + result.score, 0) };
}

function parseGuesses(text: string | null): number[] {
  if (!text) return [];
  const fields = text.split(",");
  if (fields.length > ROUNDS) throw new BadRequest("too many guesses");
  return fields.map((field) => {
    // Plain decimals only: no hex, no exponents, no empty slots.
    if (!/^\d+(\.\d+)?$/.test(field)) throw new BadRequest("bad guess");
    const guess = Number(field);
    // A hair of slack at the ends, for a slider's rounding.
    if (!Number.isFinite(guess) || guess < RATIO_MIN * 0.999 || guess > RATIO_MAX * 1.001) throw new BadRequest("bad guess");
    return guess;
  });
}

const fail = (status: number, error: string): Reply => ({ status, body: { error }, cache: "no-store" });
const ok = (body: unknown): Reply => ({ status: 200, body, cache: "private, max-age=86400" });

/** The day a request is about, refusing any that has not begun anywhere on Earth. */
function dayOf(date: string | null, now: Date): { number: number; date: string } | null {
  const number = date ? puzzleNumber(date) : null;
  if (number === null || number < 1) throw new BadRequest("bad date");
  if (date! > latestDate(now)) return null;
  return { number, date: date! };
}

/**
 * Answers `/api/sizele/<action>?…`. Without `seed` it refuses to run rather
 * than fall back to anything guessable.
 */
export async function handleSizele(
  action: string,
  query: URLSearchParams,
  seed: string | undefined,
  now: Date = new Date(),
): Promise<Reply> {
  try {
    if (action !== "play") return fail(404, "no such endpoint");
    if (!seed) return fail(503, "sizele is not configured");

    let pairs: Pair[];
    let meta: Pick<Verdict, "number" | "date" | "round">;
    if (query.has("e")) {
      const number = Number(query.get("e"));
      if (!/^\d+$/.test(query.get("e") ?? "") || number > 0xffffffff) {
        throw new BadRequest("bad round");
      }
      pairs = await endlessRounds(seed, number);
      meta = { number: null, date: null, round: number };
    } else {
      const day = dayOf(query.get("d") ?? query.get("date"), now);
      if (!day) return fail(404, "that day has not started anywhere yet");
      pairs = await dailyRounds(seed, day.number);
      meta = { number: day.number, date: day.date, round: null };
    }

    const verdict: Verdict = { ...meta, ...judge(pairs, parseGuesses(query.get("g"))) };
    return ok(verdict);
  } catch (error) {
    if (error instanceof BadRequest) return fail(400, error.message);
    throw error;
  }
}
