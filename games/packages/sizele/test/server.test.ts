import { describe, expect, it } from "vitest";
import countries from "../data/countries.json" with { type: "json" };
import names from "../data/names.json" with { type: "json" };
import {
  dailyRounds,
  endlessRounds,
  handleSizele,
  latestDate,
  lie,
  type Pair,
  puzzleNumber,
  scoreOf,
} from "../src/server.ts";
import { LANGUAGES, RATIO_MAX, ROUNDS, type Verdict } from "../src/types.ts";

const SEED = "test-seed-not-the-real-one";
const NOW = new Date("2026-10-10T12:00:00Z");
const DAY = "2026-10-08";

const call = (action: string, params: Record<string, string>, seed: string | null = SEED) =>
  handleSizele(action, new URLSearchParams(params), seed ?? undefined, NOW);

const play = async (params: Record<string, string>): Promise<Verdict> => {
  const reply = await call("play", params);
  expect(reply.status).toBe(200);
  return reply.body as Verdict;
};

interface Country {
  id: string;
  continent: string;
  area: number;
  merc: number;
  unit?: boolean;
}
const COUNTRIES = countries as unknown as Country[];
const byId = new Map(COUNTRIES.map((c) => [c.id, c]));

describe("the calendar", () => {
  it("numbers days from the epoch", () => {
    expect(puzzleNumber("2026-10-06")).toBe(1);
    expect(puzzleNumber("2026-10-12")).toBe(7);
    expect(puzzleNumber("2026-02-30")).toBeNull();
    expect(latestDate(new Date("2026-10-10T12:00:00Z"))).toBe("2026-10-11");
  });

  it("is the same for everyone, and changes with the secret", async () => {
    expect(await dailyRounds(SEED, 9)).toEqual(await dailyRounds(SEED, 9));
    let same = 0;
    for (let day = 1; day <= 20; day++) {
      const a = (await dailyRounds(SEED, day)).map((p) => p.target).join();
      const b = (await dailyRounds("another", day)).map((p) => p.target).join();
      if (a === b) same++;
    }
    expect(same).toBe(0);
  });

  it("deals endless sets from the secret and the number", async () => {
    expect(await endlessRounds(SEED, 77)).toEqual(await endlessRounds(SEED, 77));
    expect(await endlessRounds(SEED, 77)).not.toEqual(await endlessRounds(SEED, 78));
  });
});

describe("a day's rounds", () => {
  it("are five fair pairs, no country twice, building to the map's biggest lie", async () => {
    for (let day = 1; day <= 60; day++) {
      const pairs: Pair[] = await dailyRounds(SEED, day);
      expect(pairs).toHaveLength(ROUNDS);
      const ids = pairs.flatMap((p) => [p.unit, p.target]);
      expect(new Set(ids).size).toBe(ids.length);
      const continents = new Map<string, number>();
      for (const pair of pairs) {
        expect(byId.get(pair.unit)!.unit).toBe(true);
        expect(pair.ratio).toBeGreaterThanOrEqual(1 / 25);
        expect(pair.ratio).toBeLessThanOrEqual(25);
        expect(pair.ratio <= 0.8 || pair.ratio >= 1.25).toBe(true);
        const continent = byId.get(pair.target)!.continent;
        continents.set(continent, (continents.get(continent) ?? 0) + 1);
      }
      expect(Math.max(...continents.values())).toBeLessThanOrEqual(2);
      expect(pairs.filter((p) => lie(p) > Math.log(3)).length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < pairs.length; i++) expect(lie(pairs[i])).toBeGreaterThanOrEqual(lie(pairs[i - 1]));
    }
  });
});

describe("the map's numbers", () => {
  it("measure countries on the globe", () => {
    const ratio = (a: string, b: string): number => byId.get(a)!.area / byId.get(b)!.area;
    expect(byId.get("turkey")!.area).toBeGreaterThan(760_000);
    expect(byId.get("turkey")!.area).toBeLessThan(800_000);
    expect(ratio("greenland", "turkey")).toBeGreaterThan(2.6);
    expect(ratio("greenland", "turkey")).toBeLessThan(3.0);
    expect(ratio("brazil", "turkey")).toBeGreaterThan(10.5);
    expect(ratio("brazil", "turkey")).toBeLessThan(11.3);
  });

  it("and as Mercator draws them, which flatters the north", () => {
    const apparent = byId.get("greenland")!.merc / byId.get("turkey")!.merc;
    expect(apparent).toBeGreaterThan(15);
  });

  it("name every country in every language", () => {
    const named = names as Record<string, Record<string, string>>;
    for (const country of COUNTRIES) {
      for (const language of LANGUAGES) expect(named[country.id]?.[language], `${country.id}.${language}`).toBeTruthy();
    }
  });
});

describe("scoring", () => {
  it("gives 100 for the truth and falls away on a log scale", () => {
    expect(scoreOf(2.8, 2.8)).toBe(100);
    expect(scoreOf(5.6, 2.8)).toBe(23);
    expect(scoreOf(1.4, 2.8)).toBe(23);
    expect(scoreOf(4.2, 2.8)).toBe(61);
    expect(scoreOf(8.4, 2.8)).toBeLessThan(5);
  });
});

describe("the API", () => {
  it("starts a day with the first round and nothing of the truth", async () => {
    const verdict = await play({ d: DAY });
    expect(verdict).toMatchObject({ number: 3, date: DAY, round: null, results: [], total: 0 });
    expect(verdict.next).not.toBeNull();
    expect(Object.keys(verdict.next!).sort()).toEqual(["target", "unit"]);
    expect(Object.keys(verdict.next!.target).sort()).toEqual(["centroid", "id", "rings"]);
    const text = JSON.stringify(verdict);
    expect(text).not.toContain("ratio");
    expect(text).not.toContain("area");
    expect(text).not.toContain("merc");
  });

  it("judges each guess and hands over the next round, then the end", async () => {
    const pairs = await dailyRounds(SEED, 3);
    const first = await play({ d: DAY });
    expect(first.next!.unit.id).toBe(pairs[0].unit);
    expect(first.next!.target.id).toBe(pairs[0].target);

    const two = await play({ d: DAY, g: `${pairs[0].ratio},1` });
    expect(two.results).toHaveLength(2);
    expect(two.results[0]).toMatchObject({ unit: pairs[0].unit, target: pairs[0].target, score: 100 });
    expect(two.next!.target.id).toBe(pairs[2].target);

    const guesses = pairs.map((p) => p.ratio * 2);
    const done = await play({ d: DAY, g: guesses.join(",") });
    expect(done.next).toBeNull();
    expect(done.results.every((r) => r.score === 23)).toBe(true);
    expect(done.total).toBe(23 * ROUNDS);
    expect(done.results.every((r) => r.areas[0] > 20_000 && r.areas[1] > 20_000)).toBe(true);
  });

  it("plays endless sets the same way", async () => {
    const verdict = await play({ e: "12345", g: "2" });
    expect(verdict).toMatchObject({ number: null, date: null, round: 12345 });
    expect(verdict.results).toHaveLength(1);
  });

  it("refuses what it cannot read", async () => {
    expect((await call("play", { d: DAY, g: "1,2,3,4,5,6" })).status).toBe(400);
    expect((await call("play", { d: DAY, g: "abc" })).status).toBe(400);
    expect((await call("play", { d: DAY, g: String(RATIO_MAX * 2) })).status).toBe(400);
    expect((await call("play", { d: DAY, g: "0" })).status).toBe(400);
    expect((await call("play", { d: "2026-02-30" })).status).toBe(400);
    expect((await call("play", { d: "2026-10-01" })).status).toBe(400);
    expect((await call("play", { e: "-1" })).status).toBe(400);
    expect((await call("play", { e: String(2 ** 32) })).status).toBe(400);
  });

  it("refuses days not yet begun, unknown endpoints, and runs only with a secret", async () => {
    expect((await call("play", { d: "2026-10-12" })).status).toBe(404);
    expect((await call("judge", { d: DAY })).status).toBe(404);
    expect((await call("play", { d: DAY }, null)).status).toBe(503);
    expect((await call("play", { d: DAY })).cache).toBe("private, max-age=86400");
    expect((await call("play", { d: "x" })).cache).toBe("no-store");
  });
});
