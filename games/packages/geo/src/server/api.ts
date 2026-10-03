import { borderGraph } from "../index.ts";
import type { BorderGraph } from "../graph.ts";
import { evaluateGuess, guessBudget, type GuessMark } from "../scoring.ts";
import { continentsOf, LANGUAGES, type Language } from "../types.ts";
import { dailyPair, dateOf, dayNumber, latestDate } from "./daily.ts";

/**
 * The travelle API. The browser holds names and outlines but no borders, so
 * every judgement — how a guess scores, what a hint reveals, what the answer
 * was — is made here and only the verdict goes back.
 *
 * Everything is a GET with the whole round in the query, so the server keeps
 * no state and any edge can answer.
 */

export const HINT_NAMES = ["neighbours", "next-outline", "all-outlines", "initials"] as const;
export type HintName = (typeof HINT_NAMES)[number];

export type Status = "playing" | "won" | "lost";

export interface DailyPuzzle {
  kind: "daily";
  number: number;
  date: string;
  start: string;
  end: string;
  shortest: number;
  budget: number;
}

export interface EndlessPuzzle {
  kind: "endless";
  start: string;
  end: string;
  shortest: number;
  budget: number;
  /** Hand back to /judge as `k`: the pair plus the map it is played on. */
  key: string;
}

export interface EndlessResponse {
  puzzle: EndlessPuzzle | null;
  inPlay: number;
}

export interface HintData {
  /** Every country bordering the start or the end. */
  neighbours?: string[];
  /** The next country on a best route that fits the guesses so far. */
  next?: string | null;
  /** First letters of the rest of that route, in each language. */
  initials?: Record<Language, string>;
}

export interface Verdict {
  results: Array<{ region: string; mark: GuessMark }>;
  status: Status;
  hints: HintData;
  /** A shortest route, start and end excluded — only once the round is over. */
  solution: string[] | null;
}

export interface Reply {
  status: number;
  body: unknown;
  /** Cache-Control for the response. */
  cache: string;
}

class BadRequest extends Error {}

const ID = /^[a-z0-9-]{1,64}$/;
const MAX_GUESSES = 40;
const MAX_EXCLUDED = 120;

const fail = (status: number, error: string): Reply => ({
  status,
  body: { error },
  cache: "no-store",
});

function list(param: string | null, max: number): string[] {
  if (!param) return [];
  const items = param.split(",").filter(Boolean);
  if (items.length > max) throw new BadRequest("too many items");
  return items;
}

function regionIds(graph: BorderGraph, param: string | null, max: number): string[] {
  const ids = list(param, max);
  for (const id of ids) {
    if (!ID.test(id) || !graph.regionIndex.has(id)) throw new BadRequest(`unknown region: ${id}`);
  }
  return ids;
}

function integer(param: string | null, min: number, max: number): number {
  const value = Number(param);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new BadRequest("number out of range");
  }
  return value;
}

/** The map an endless round is played on: some continents, minus some countries. */
function endlessMap(graph: BorderGraph, mask: number, excluded: readonly string[]): BorderGraph {
  const keep = new Set(continentsOf(mask));
  const skip = new Set(excluded);
  return graph.withOnly(
    graph
      .playableRegions()
      .filter((r) => keep.has(r.continent) && !skip.has(r.id))
      .map((r) => r.id),
  );
}

/** mulberry32. Endless seeds come from the player, so nothing here is secret. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A daily puzzle, refusing any date that has not started somewhere on Earth. */
async function daily(graph: BorderGraph, seed: string, date: string | null, now: Date) {
  const number = date ? dayNumber(date) : null;
  if (number === null || number < 0) throw new BadRequest("bad date");
  if (date! > latestDate(now)) return null;
  const pair = await dailyPair(graph, seed, number);
  const puzzle: DailyPuzzle = {
    kind: "daily",
    number,
    date: dateOf(number),
    ...pair,
    budget: guessBudget(pair.shortest),
  };
  return puzzle;
}

function judge(
  map: BorderGraph,
  start: string,
  end: string,
  budget: number,
  guesses: readonly string[],
  hints: readonly HintName[],
  surrendered: boolean,
): Verdict {
  const taken = new Set([start, end]);
  const results: Verdict["results"] = [];
  for (let i = 0; i < guesses.length; i++) {
    const guess = guesses[i];
    if (taken.has(guess)) throw new BadRequest(`repeated region: ${guess}`);
    taken.add(guess);
    const { mark } = evaluateGuess(map, start, end, guesses.slice(0, i), guess);
    results.push({ region: guess, mark });
  }

  const complete = map.isComplete(start, end, guesses);
  const status: Status = complete
    ? "won"
    : surrendered || guesses.length >= budget
      ? "lost"
      : "playing";

  const data: HintData = {};
  const route = (): string[] => map.solve(start, end, guesses).path;
  if (status === "playing") {
    for (const hint of hints) {
      if (hint === "neighbours") {
        data.neighbours = [...new Set([...map.neighbours(start), ...map.neighbours(end)])].sort();
      } else if (hint === "next-outline") {
        data.next = route()[0] ?? null;
      } else if (hint === "initials") {
        const path = route();
        data.initials = Object.fromEntries(
          LANGUAGES.map((language) => [
            language,
            path.map((id) => map.region(id).names[language].charAt(0)).join(" · "),
          ]),
        ) as Record<Language, string>;
      }
    }
  }

  return {
    results,
    status,
    hints: data,
    solution: status === "playing" ? null : map.solve(start, end).path,
  };
}

/**
 * Answers `/api/travelle/<action>?…`. `seed` is the secret behind the daily
 * puzzle; without it the daily endpoints refuse to work rather than fall back
 * to something guessable.
 */
export async function handleTravelle(
  action: string,
  query: URLSearchParams,
  seed: string | undefined,
  now: Date = new Date(),
): Promise<Reply> {
  const graph = borderGraph();
  try {
    if (action === "daily") {
      if (!seed) return fail(503, "daily puzzle is not configured");
      const puzzle = await daily(graph, seed, query.get("date"), now);
      if (!puzzle) return fail(404, "that day has not started anywhere yet");
      return { status: 200, body: puzzle, cache: "public, max-age=3600" };
    }

    if (action === "endless") {
      const mask = integer(query.get("c") ?? "63", 1, 63);
      const excluded = regionIds(graph, query.get("x"), MAX_EXCLUDED);
      const min = integer(query.get("min") ?? "3", 1, 60);
      const max = integer(query.get("max") ?? "8", min, 60);
      const round = integer(query.get("seed"), 0, 2 ** 32 - 1);
      const map = endlessMap(graph, mask, excluded);
      const pair = map.randomPair(rng(round), min, max);
      const response: EndlessResponse = {
        inPlay: map.playableRegions().length,
        puzzle: pair && {
          kind: "endless",
          ...pair,
          budget: guessBudget(pair.shortest),
          key: [pair.start, pair.end, mask, excluded.join("+")].join("."),
        },
      };
      return { status: 200, body: response, cache: "public, max-age=86400" };
    }

    if (action === "judge") {
      const guesses = regionIds(graph, query.get("g"), MAX_GUESSES);
      const hints = list(query.get("h"), HINT_NAMES.length);
      for (const hint of hints) {
        if (!(HINT_NAMES as readonly string[]).includes(hint)) throw new BadRequest("unknown hint");
      }
      const surrendered = query.get("s") === "1";

      let map = graph;
      let start: string;
      let end: string;
      let budget: number;
      const key = query.get("k");
      if (key !== null) {
        const [a = "", b = "", maskText = "", excludedText = ""] = key.split(".");
        [start, end] = regionIds(graph, `${a},${b}`, 2);
        if (!start || !end) throw new BadRequest("bad key");
        const excluded = regionIds(graph, excludedText.split("+").join(","), MAX_EXCLUDED);
        map = endlessMap(graph, integer(maskText, 1, 63), excluded);
        const shortest = map.solve(start, end).cost;
        if (!Number.isFinite(shortest) || start === end) throw new BadRequest("no such round");
        budget = guessBudget(shortest);
      } else {
        if (!seed) return fail(503, "daily puzzle is not configured");
        const puzzle = await daily(graph, seed, query.get("d"), now);
        if (!puzzle) return fail(404, "that day has not started anywhere yet");
        ({ start, end, budget } = puzzle);
      }

      const verdict = judge(map, start, end, budget, guesses, hints as HintName[], surrendered);
      return { status: 200, body: verdict, cache: "private, max-age=86400" };
    }

    return fail(404, "no such endpoint");
  } catch (error) {
    if (error instanceof BadRequest) return fail(400, error.message);
    throw error;
  }
}
