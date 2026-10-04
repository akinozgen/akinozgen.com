import vexleAnswers from "../../vexle/data/answers.json" with { type: "json" };
import vexleCountries from "../../vexle/data/countries.json" with { type: "json" };
import answersData from "../data/answers.json" with { type: "json" };
import publicData from "../data/public.json" with { type: "json" };
import scheduleData from "../data/schedule.json" with { type: "json" };
import serverData from "../data/server.json" with { type: "json" };
import { FINAL_TRIES, type Language, QUESTIONS, type ServerData, WITHDRAWN } from "./types.ts";

/**
 * babelle's game server. Each day has a hidden language; the player answers
 * five picture-card questions in it, then names it. The browser only ever
 * holds the question in front of it — the word lists, families and places
 * stay here, so the day's language can't be looked up from the page.
 *
 * Every request carries the whole round (answers so far, guesses so far),
 * so no state is kept and any edge can answer.
 */

export const EPOCH = "2026-10-04";

const DATA = serverData as unknown as ServerData;
const LANGUAGES = DATA.languages;
const BY_ID = new Map(LANGUAGES.map((l) => [l.id, l]));
const CONCEPTS = (publicData as { concepts: Array<{ id: string }> }).concepts.map((c) => c.id);

/** Every language a round can be in. */
const ANSWERS = answersData as string[];

/**
 * How often each language is the day's, by how likely a player is to have
 * met it: the big languages three times a cycle, the regional ones twice,
 * the rare ones (mostly small languages of Russia and the Caucasus, which
 * NorthEuraLex is rich in) once. Without this the Cyrillic minorities
 * crowded out everything else.
 */
const TIERS = scheduleData.tiers;
const WEIGHTED: string[] = [
  ...TIERS.common.flatMap((id) => [id, id, id]),
  ...TIERS.known.flatMap((id) => [id, id]),
  ...TIERS.rare,
];

for (const id of WEIGHTED) if (!ANSWERS.includes(id)) throw new Error(`${id} is scheduled but not an answer`);

/** Day 1 was played under the first rules and stays as it was. */
const LEGACY = scheduleData.legacy;

/** No language comes round again within this many days. */
const MIN_GAP = 12;
/** Options and decoys come only from languages a player may have met. */
const FAMILIAR = new Set([...TIERS.common, ...TIERS.known]);

interface Country {
  code: string;
  lat: number;
  lon: number;
}
const COUNTRY_POOL = new Set(vexleAnswers as string[]);
const COUNTRIES = (vexleCountries as Country[]).filter((c) => COUNTRY_POOL.has(c.code));

// --- the questions ---

export type Question =
  /** A pictured concept; which of four words in today's language means it? */
  | { kind: "word"; concept: string; options: string[] }
  /** A word in today's language; which of four pictures does it mean? */
  | { kind: "meaning"; word: string; options: string[] }
  /** A pictured concept in four languages; which word is today's language? */
  | { kind: "which"; concept: string; options: string[] }
  /** Which of four languages is related to today's? */
  | { kind: "relative"; options: string[] }
  /** Today's language has no relatives here: which of four is spoken nearest? */
  | { kind: "neighbour"; options: string[] }
  /** Where is today's language spoken? Four countries. */
  | { kind: "country"; options: string[] };

interface Round {
  language: Language;
  questions: Question[];
  /** Index of the right option in each question. */
  correct: number[];
}

export interface FinalGuess {
  id: string;
  km: number;
  /** Rhumb-line bearing, as on a flat map; null for the answer itself. */
  bearing: number | null;
  sameFamily: boolean;
}

export type Status = "playing" | "won" | "lost";

export interface BabelleVerdict {
  number: number;
  date: string;
  /** Every question answered so far, plus the next one while there is one. */
  questions: Question[];
  /** For each answered question: what was picked and what was right. */
  answers: Array<{ chosen: number; correct: number }>;
  phase: "questions" | "final" | "done";
  guesses: FinalGuess[];
  status: Status;
  /** Once the round is over: the language and the words it showed. */
  reveal: {
    language: string;
    family: string;
    words: Array<{ concept: string; word: string }>;
  } | null;
}

export interface Reply {
  status: number;
  body: unknown;
  cache: string;
}

class BadRequest extends Error {}

// --- dates ---

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function utcDay(date: string): number | null {
  const match = ISO_DATE.exec(date);
  if (!match) return null;
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const back = new Date(time);
  if (back.getUTCDate() !== Number(match[3]) || back.getUTCMonth() !== Number(match[2]) - 1) return null;
  return time / DAY_MS;
}

export function puzzleNumber(date: string): number | null {
  const day = utcDay(date);
  return day === null ? null : day - utcDay(EPOCH)! + 1;
}

/** The latest date anyone on Earth can be living in: UTC+14. */
export function latestDate(now: Date): string {
  return new Date(now.getTime() + 14 * 3_600_000).toISOString().slice(0, 10);
}

// --- randomness ---

const encoder = new TextEncoder();
const keys = new Map<string, Promise<CryptoKey>>();

/** A random stream for one label, unpredictable without the seed. */
async function stream(seed: string, label: string): Promise<() => number> {
  let key = keys.get(seed);
  if (!key) {
    key = crypto.subtle.importKey("raw", encoder.encode(seed), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    keys.set(seed, key);
  }
  const digest = new Uint32Array(await crypto.subtle.sign("HMAC", await key, encoder.encode(label)));
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

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const cycles = new Map<string, string[]>();

/** How many times each language comes up in one cycle. */
const WEIGHTS: Array<[string, number]> = [
  ...TIERS.common.map((id): [string, number] => [id, 3]),
  ...TIERS.known.map((id): [string, number] => [id, 2]),
  ...TIERS.rare.map((id): [string, number] => [id, 1]),
];

/**
 * One cycle of days. Each language's appearances are spread evenly through
 * it from a random offset — a three-a-cycle language comes round about every
 * 48 days — and the cycle's first days are kept clear of the last cycle's
 * final ones by swapping with days from the middle, where it is safe both ways.
 */
async function cycleOrder(seed: string, cycle: number): Promise<string[]> {
  const key = `${seed}\u0000${cycle}`;
  const cached = cycles.get(key);
  if (cached) return cached;

  const random = await stream(seed, `babelle:schedule:${cycle}`);
  const length = WEIGHTED.length;
  const slots: Array<{ id: string; at: number; tie: number }> = [];
  for (const [id, weight] of WEIGHTS) {
    const step = length / weight;
    const offset = random() * step;
    for (let i = 0; i < weight; i++) slots.push({ id, at: offset + i * step, tie: random() });
  }
  const order = slots.sort((a, b) => a.at - b.at || a.tie - b.tie).map((slot) => slot.id);

  // The first cycle follows the legacy days, so those count as its tail.
  const tail = (cycle > 0 ? await cycleOrder(seed, cycle - 1) : LEGACY).slice(-MIN_GAP);
  // Day i of this cycle clashes if its language came up within MIN_GAP days either side.
  const clashes = (i: number): boolean => {
    const id = order[i];
    for (let k = Math.max(0, i - MIN_GAP); k <= Math.min(length - 1, i + MIN_GAP); k++) {
      if (k !== i && order[k] === id) return true;
    }
    for (let t = 0; t < tail.length; t++) if (tail[t] === id && tail.length - t + i <= MIN_GAP) return true;
    return false;
  };
  for (let i = 0; i < MIN_GAP; i++) {
    if (!clashes(i)) continue;
    for (let j = MIN_GAP; j < length - MIN_GAP; j++) {
      [order[i], order[j]] = [order[j], order[i]];
      if (!clashes(i) && !clashes(j)) break;
      [order[i], order[j]] = [order[j], order[i]];
    }
  }

  if (cycles.size > 16) cycles.clear();
  cycles.set(key, order);
  return order;
}

// --- geometry ---

const toRad = (deg: number): number => (deg * Math.PI) / 180;

function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The direction as it looks on a flat map (rhumb line). */
function bearing(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  let Δλ = toRad(b.lon - a.lon);
  if (Math.abs(Δλ) > Math.PI) Δλ = Δλ > 0 ? Δλ - 2 * Math.PI : Δλ + 2 * Math.PI;
  const Δψ = Math.log(Math.tan(Math.PI / 4 + φ2 / 2) / Math.tan(Math.PI / 4 + φ1 / 2));
  return ((Math.atan2(Δλ, Δψ) * 180) / Math.PI + 360) % 360;
}

// --- building a day ---

/**
 * Four options with the right one placed at random. `pick` draws decoys
 * until there are three that differ from the answer and each other.
 */
function options(right: string, decoys: readonly string[], random: () => number): { options: string[]; correct: number } {
  const chosen: string[] = [];
  for (const decoy of shuffle(decoys, random)) {
    if (WITHDRAWN.has(decoy)) continue;
    if (decoy !== right && !chosen.includes(decoy)) chosen.push(decoy);
    if (chosen.length === 3) break;
  }
  if (chosen.length < 3) throw new Error("not enough decoys");
  const correct = Math.floor(random() * 4);
  const out = [...chosen];
  out.splice(correct, 0, right);
  return { options: out, correct };
}

const rounds = new Map<string, Round>();

export async function dailyRound(seed: string, number: number): Promise<Round> {
  const cacheKey = `${seed}\u0000${number}`;
  const cached = rounds.get(cacheKey);
  if (cached) return cached;

  const random = await stream(seed, `babelle:questions:${number}`);
  let round: Round;
  if (number <= LEGACY.length) {
    round = buildRound(BY_ID.get(LEGACY[number - 1])!, random, LANGUAGES);
  } else {
    const index = number - LEGACY.length - 1;
    const cycle = Math.floor(index / WEIGHTED.length);
    const language = BY_ID.get((await cycleOrder(seed, cycle))[index - cycle * WEIGHTED.length])!;
    round = buildRound(language, random, LANGUAGES.filter((l) => FAMILIAR.has(l.id)));
  }
  if (rounds.size > 64) rounds.clear();
  rounds.set(cacheKey, round);
  return round;
}

/**
 * An endless round, from a number the player's browser picks at random. The
 * language comes from HMAC(secret, number), so the number alone says
 * nothing. Endless deliberately avoids nothing — not even today's language:
 * any rule like "never deal today's" could be measured by asking for
 * thousands of rounds and seeing which language never turns up. The page
 * opens endless only once the day is finished instead.
 */
export async function endlessRound(seed: string, number: number): Promise<Round> {
  const random = await stream(seed, `babelle:endless:${number}`);
  const language = BY_ID.get(WEIGHTED[Math.floor(random() * WEIGHTED.length)])!;
  return buildRound(language, random, LANGUAGES.filter((l) => FAMILIAR.has(l.id)));
}

/**
 * Five questions in `language`, drawn from `random`. `field` holds the
 * languages decoys and options may come from: a player can tell Russian
 * from Hungarian, not Udmurt from Komi.
 */
function buildRound(language: Language, random: () => number, field: readonly Language[]): Round {
  const words = DATA.forms[language.id];

  // Concepts this language has distinct words for, in a random order.
  const seen = new Set<string>();
  const usable = shuffle(
    CONCEPTS.filter((c) => {
      const word = words[c];
      if (!word || seen.has(word)) return false;
      seen.add(word);
      return true;
    }),
    random,
  );
  const [c1, c2, c3] = usable;
  const others = (exclude: string): string[] => usable.filter((c) => c !== exclude);

  const questions: Question[] = [];
  const correct: number[] = [];
  const add = (question: Question, right: number): void => {
    questions.push(question);
    correct.push(right);
  };

  // 1. Hardest first: the picture is known, the language isn't.
  {
    const o = options(words[c1], others(c1).map((c) => words[c]), random);
    add({ kind: "word", concept: c1, options: o.options }, o.correct);
  }
  // 2. A word in the language; which picture?
  {
    const o = options(c2, others(c2), random);
    add({ kind: "meaning", word: words[c2], options: o.options }, o.correct);
  }
  // 3. One concept, four languages: spot today's. One decoy is a relative when there is one.
  {
    // A familiar relative where there is one; failing that, any relative.
    const kin = (pool: readonly Language[]) =>
      pool.filter((l) => l.family === language.family && l.id !== language.id && DATA.forms[l.id][c3]);
    const relatives = shuffle(kin(field).length > 0 ? kin(field) : kin(LANGUAGES), random);
    const strangers = shuffle(
      field.filter((l) => l.family !== language.family && DATA.forms[l.id][c3]),
      random,
    );
    // A relative first if there is one, then strangers; never a twin of the right word.
    const right = words[c3];
    const decoys: string[] = [];
    for (const l of [...relatives.filter((r) => !WITHDRAWN.has(r.id)).slice(0, 1), ...strangers]) {
      if (WITHDRAWN.has(l.id)) continue;
      const word = DATA.forms[l.id][c3];
      if (word !== right && !decoys.includes(word)) decoys.push(word);
      if (decoys.length === 3) break;
    }
    const shuffled = shuffle([right, ...decoys], random);
    add({ kind: "which", concept: c3, options: shuffled }, shuffled.indexOf(right));
  }
  // 4. Family: a relative among strangers, or for an isolate, the nearest neighbour.
  {
    const related = (pool: readonly Language[]) =>
      pool.filter((l) => l.family === language.family && l.id !== language.id && !WITHDRAWN.has(l.id));
    const relatives = related(field).length > 0 ? related(field) : related(LANGUAGES);
    // A close relative when there is one: Lithuanian for Latvian, not Icelandic.
    const close = relatives.filter((l) => l.subfamily && l.subfamily === language.subfamily);
    const shown = (list: Language[]): boolean => list.some((l) => !WITHDRAWN.has(l.id));
    const pool = shown(close) ? close : relatives;
    if (shown(pool)) {
      // A withdrawn pick passes to the next relative, so the draw is unchanged otherwise.
      let pick = Math.floor(random() * pool.length);
      while (WITHDRAWN.has(pool[pick].id)) pick = (pick + 1) % pool.length;
      const right = pool[pick].id;
      const strangers = field.filter((l) => l.family !== language.family).map((l) => l.id);
      const o = options(right, strangers, random);
      add({ kind: "relative", options: o.options }, o.correct);
    } else {
      const byDistance = field.filter((l) => l.id !== language.id)
        .map((l) => ({ id: l.id, km: distanceKm(l, language) }))
        .sort((a, b) => a.km - b.km);
      const nearest = byDistance.find((l) => !WITHDRAWN.has(l.id))!;
      const right = nearest.id;
      const far = byDistance.filter((l) => l.km > nearest.km + 2500).map((l) => l.id);
      const o = options(right, far, random);
      add({ kind: "neighbour", options: o.options }, o.correct);
    }
  }
  // 5. Easiest last: where it is spoken. Decoys are far from the right country.
  {
    const home = COUNTRIES.find((c) => c.code === language.country);
    if (!home) throw new Error(`no country ${language.country} for ${language.id}`);
    const far = COUNTRIES.filter((c) => distanceKm(c, home) > 2500).map((c) => c.code);
    const o = options(home.code, far, random);
    add({ kind: "country", options: o.options }, o.correct);
  }

  return { language, questions, correct };
}

/** The words the round showed in its language, for the recap. */
function shownWords(round: Round): Array<{ concept: string; word: string }> {
  const words = DATA.forms[round.language.id];
  const concepts = new Set<string>();
  for (const q of round.questions) {
    if (q.kind === "word" || q.kind === "which") concepts.add(q.concept);
    if (q.kind === "meaning") concepts.add(q.options[round.correct[round.questions.indexOf(q)]]);
  }
  return [...concepts].map((concept) => ({ concept, word: words[concept] }));
}

const fail = (status: number, error: string): Reply => ({ status, body: { error }, cache: "no-store" });

/**
 * Answers `/api/babelle/judge?d=<date>&a=<choices>&g=<languages>`. Without
 * `seed` it refuses to run rather than fall back to anything guessable.
 */
export async function handleBabelle(
  action: string,
  query: URLSearchParams,
  seed: string | undefined,
  now: Date = new Date(),
): Promise<Reply> {
  try {
    if (action !== "judge" && action !== "endless") return fail(404, "no such endpoint");
    if (!seed) return fail(503, "babelle is not configured");

    let date = "";
    let number: number;
    let round: Round;
    if (action === "endless") {
      number = Number(query.get("e"));
      if (!Number.isInteger(number) || number < 0 || number > 0xffffffff) throw new BadRequest("bad round");
      round = await endlessRound(seed, number);
    } else {
      date = query.get("d") ?? "";
      const day = puzzleNumber(date);
      if (day === null || day < 1) throw new BadRequest("bad date");
      if (date > latestDate(now)) return fail(404, "that day has not started anywhere yet");
      number = day;
      round = await dailyRound(seed, number);
    }

    const chosen = (query.get("a") ?? "").split(",").filter(Boolean).map(Number);
    if (chosen.length > QUESTIONS || chosen.some((n) => !Number.isInteger(n) || n < 0 || n > 3)) {
      throw new BadRequest("bad answers");
    }
    const guessIds = (query.get("g") ?? "").split(",").filter(Boolean);
    if (guessIds.length > FINAL_TRIES) throw new BadRequest("too many guesses");
    if (guessIds.length > 0 && chosen.length < QUESTIONS) throw new BadRequest("questions first");
    if (new Set(guessIds).size !== guessIds.length) throw new BadRequest("repeated guess");
    for (const id of guessIds) {
      if (!BY_ID.has(id) || WITHDRAWN.has(id)) throw new BadRequest(`unknown language: ${id}`);
    }

    const answers = chosen.map((choice, i) => ({ chosen: choice, correct: round.correct[i] }));

    const won = guessIds.indexOf(round.language.id);
    if (won !== -1 && won !== guessIds.length - 1) throw new BadRequest("guesses after the answer");
    const guesses: FinalGuess[] = guessIds.map((id) => {
      const language = BY_ID.get(id)!;
      if (id === round.language.id) return { id, km: 0, bearing: null, sameFamily: true };
      return {
        id,
        km: Math.round(distanceKm(language, round.language)),
        bearing: Math.round(bearing(language, round.language)),
        sameFamily: language.family === round.language.family,
      };
    });

    const status: Status = won !== -1 ? "won" : guessIds.length >= FINAL_TRIES ? "lost" : "playing";
    const phase = status !== "playing" ? "done" : chosen.length < QUESTIONS ? "questions" : "final";
    const shown = phase === "questions" ? chosen.length + 1 : QUESTIONS;

    const verdict: BabelleVerdict = {
      number,
      date,
      questions: round.questions.slice(0, shown),
      answers,
      phase,
      guesses,
      status,
      reveal:
        phase === "done"
          ? { language: round.language.id, family: round.language.family, words: shownWords(round) }
          : null,
    };
    return { status: 200, body: verdict, cache: "private, max-age=86400" };
  } catch (error) {
    if (error instanceof BadRequest) return fail(400, error.message);
    throw error;
  }
}
