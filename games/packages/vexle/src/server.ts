import countriesData from "../data/countries.json" with { type: "json" };
import { type Country, MAX_GUESSES, TILES } from "./types.ts";

/**
 * vexle's game server. The browser knows every country's name and nothing
 * else: which flag is today's, how far a guess landed, and which tiles of the
 * flag a player has earned are all decided here.
 *
 * Everything is a GET carrying the whole round, so no state is kept and any
 * edge can answer.
 */

export const EPOCH = "2026-10-04";

const COUNTRIES = countriesData as Country[];
const BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]));

/**
 * Flags that may be guessed but are never the answer: specks with no
 * people, whose flags nobody could be expected to know.
 */
const NEVER_ANSWER = new Set(["AQ", "BV", "HM", "TF", "GS", "IO", "UM", "CC", "CX", "NF", "PN"]);
const ANSWERS = COUNTRIES.filter((country) => !NEVER_ANSWER.has(country.code));

/** An answer does not come round again within this many days. */
const LOOKBACK = 45;

export interface DailyInfo {
  number: number;
  date: string;
}

export interface Judged {
  code: string;
  /** Kilometres between the two centroids; 0 for the answer itself. */
  km: number;
  /** Compass bearing from the guess to the answer, degrees clockwise from north. */
  bearing: number | null;
  /** 100 at the answer, 0 at the far side of the planet. */
  proximity: number;
}

export type Status = "playing" | "won" | "lost";

export interface VexleVerdict {
  results: Judged[];
  status: Status;
  /** One entry per grid position, left to right, top to bottom: a WebP data URL, or null while covered. */
  tiles: Array<string | null>;
  /** The order tiles open in, as grid positions, for as many as are open. */
  opened: number[];
  /** The answer's code, once the round is over. */
  answer: string | null;
}

export interface Reply {
  status: number;
  body: unknown;
  cache: string;
}

/** Reads a flag's tile pack: twelve WebP tiles, colour then grey. */
export type PackLoader = (code: string) => Promise<Uint8Array>;

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

async function firstDraw(seed: string, number: number): Promise<string> {
  const random = await stream(seed, `vexle:answer:${number}`);
  return ANSWERS[Math.floor(random() * ANSWERS.length)].code;
}

const memo = new Map<string, { answer: string; order: number[] }>();

/**
 * Day `number`'s answer and the order its tiles open in. The answer redraws
 * while it matches one of the previous days' first draws — first draws, so a
 * day never depends on the whole chain before it.
 */
export async function dailyRound(
  seed: string,
  number: number,
): Promise<{ answer: string; order: number[] }> {
  const cacheKey = `${seed}\u0000${number}`;
  const cached = memo.get(cacheKey);
  if (cached) return cached;

  const recent = new Set<string>();
  for (let back = 1; back <= LOOKBACK; back++) recent.add(await firstDraw(seed, number - back));

  const random = await stream(seed, `vexle:answer:${number}`);
  let answer = ANSWERS[Math.floor(random() * ANSWERS.length)].code;
  for (let attempt = 0; attempt < 40 && recent.has(answer); attempt++) {
    answer = ANSWERS[Math.floor(random() * ANSWERS.length)].code;
  }

  const shuffle = await stream(seed, `vexle:tiles:${number}`);
  const order = Array.from({ length: TILES }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(shuffle() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  const round = { answer, order };
  if (memo.size > 64) memo.clear();
  memo.set(cacheKey, round);
  return round;
}

const RADIUS_KM = 6371;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance between two countries' centroids, in km. */
export function distanceKm(from: Country, to: Country): number {
  const dLat = toRad(to.lat - from.lat);
  const dLon = toRad(to.lon - from.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial great-circle bearing from one centroid to the other. */
export function bearing(from: Country, to: Country): number {
  const φ1 = toRad(from.lat);
  const φ2 = toRad(to.lat);
  const Δλ = toRad(to.lon - from.lon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Half the Earth's circumference: the furthest two places can be. */
const FURTHEST_KM = 20_000;

export function judgeGuess(guess: Country, answer: Country): Judged {
  if (guess.code === answer.code) return { code: guess.code, km: 0, bearing: null, proximity: 100 };
  const km = distanceKm(guess, answer);
  return {
    code: guess.code,
    km: Math.round(km),
    bearing: Math.round(bearing(guess, answer)),
    // Never a full 100 for a wrong guess, however close the neighbour.
    proximity: Math.min(99, Math.floor((Math.max(FURTHEST_KM - km, 0) / FURTHEST_KM) * 100)),
  };
}

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += BASE64[n >> 18] + BASE64[(n >> 12) & 63] + BASE64[(n >> 6) & 63] + BASE64[n & 63];
  }
  if (i < bytes.length) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8);
    out += BASE64[n >> 18] + BASE64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? BASE64[(n >> 6) & 63] + "=" : "==";
  }
  return out;
}

/** The pack's tiles as data URLs, colour tiles first then grey. */
function unpack(pack: Uint8Array): string[] {
  const view = new DataView(pack.buffer, pack.byteOffset, pack.byteLength);
  const count = TILES * 2;
  const tiles: string[] = [];
  let offset = count * 4;
  for (let i = 0; i < count; i++) {
    const length = view.getUint32(i * 4, true);
    tiles.push(`data:image/webp;base64,${base64(pack.subarray(offset, offset + length))}`);
    offset += length;
  }
  return tiles;
}

const fail = (status: number, error: string): Reply => ({ status, body: { error }, cache: "no-store" });

/** The day a request is about, refusing any that has not begun anywhere on Earth. */
function dayOf(date: string | null, now: Date): DailyInfo | null {
  const number = date ? puzzleNumber(date) : null;
  if (number === null || number < 1) throw new BadRequest("bad date");
  if (date! > latestDate(now)) return null;
  return { number, date: date! };
}

/**
 * Answers `/api/vexle/<action>?…`. Without `seed` it refuses to run rather
 * than fall back to anything guessable.
 */
export async function handleVexle(
  action: string,
  query: URLSearchParams,
  seed: string | undefined,
  loadPack: PackLoader,
  now: Date = new Date(),
): Promise<Reply> {
  try {
    if (action !== "daily" && action !== "judge") return fail(404, "no such endpoint");
    if (!seed) return fail(503, "vexle is not configured");

    const day = dayOf(query.get("date") ?? query.get("d"), now);
    if (!day) return fail(404, "that day has not started anywhere yet");

    if (action === "daily") return { status: 200, body: day, cache: "public, max-age=3600" };

    const codes = (query.get("g") ?? "").split(",").filter(Boolean);
    if (codes.length > MAX_GUESSES) throw new BadRequest("too many guesses");
    const guesses = codes.map((code) => {
      const country = BY_CODE.get(code);
      if (!country) throw new BadRequest(`unknown country: ${code}`);
      return country;
    });
    if (new Set(codes).size !== codes.length) throw new BadRequest("repeated country");

    const { answer: answerCode, order } = await dailyRound(seed, day.number);
    const answer = BY_CODE.get(answerCode)!;
    const won = codes.indexOf(answerCode);
    if (won !== -1 && won !== codes.length - 1) throw new BadRequest("guesses after the answer");

    const results = guesses.map((guess) => judgeGuess(guess, answer));
    const status: Status = won !== -1 ? "won" : codes.length >= MAX_GUESSES ? "lost" : "playing";
    const openCount = status === "playing" ? codes.length : TILES;
    const opened = order.slice(0, openCount);

    const tiles: Array<string | null> = Array.from({ length: TILES }, () => null);
    if (opened.length > 0) {
      const all = unpack(await loadPack(answerCode));
      // Grey only while it is still a puzzle; the finished flag is shown as it is.
      const grey = query.get("hard") === "1" && status === "playing";
      for (const position of opened) tiles[position] = all[position + (grey ? TILES : 0)];
    }

    const verdict: VexleVerdict = {
      results,
      status,
      tiles,
      opened,
      answer: status === "playing" ? null : answerCode,
    };
    return { status: 200, body: verdict, cache: "private, max-age=86400" };
  } catch (error) {
    if (error instanceof BadRequest) return fail(400, error.message);
    throw error;
  }
}
