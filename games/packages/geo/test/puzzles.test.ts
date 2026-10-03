import { describe, expect, it } from "vitest";
import legacy from "../data/legacy.json" with { type: "json" };
import { borderGraph, evaluateGuess, guessBudget } from "../src/index.ts";
import { dailyPair, dateOf, dayNumber, FIRST_GENERATED_DAY, latestDate } from "../src/server/daily.ts";

const graph = borderGraph();
const SEED = "test-seed-not-the-real-one";

/** A spread of generated days — enough to catch a systematic fault, quick enough to run always. */
const DAYS = Array.from({ length: 60 }, (_, i) => FIRST_GENERATED_DAY + i * 7);

describe("the daily calendar", () => {
  it("keeps every day already played exactly as it was published", async () => {
    const published = legacy.puzzles as Array<{ start: string; end: string; shortest: number }>;
    expect(published.length).toBe(FIRST_GENERATED_DAY);
    for (const day of [0, 100, FIRST_GENERATED_DAY - 1]) {
      expect(await dailyPair(graph, SEED, day)).toEqual(published[day]);
    }
    // 4 October 2026 was the last published day.
    expect(dateOf(FIRST_GENERATED_DAY - 1)).toBe("2026-10-04");
  });

  it("gives every request the same pair for the same day and seed", async () => {
    for (const day of DAYS.slice(0, 10)) {
      expect(await dailyPair(graph, SEED, day)).toEqual(await dailyPair(graph, SEED, day));
    }
  });

  it("depends on the secret: another seed gives other puzzles", async () => {
    let same = 0;
    for (const day of DAYS.slice(0, 20)) {
      const a = await dailyPair(graph, SEED, day);
      const b = await dailyPair(graph, "a-different-seed", day);
      if (a.start === b.start && a.end === b.end) same++;
    }
    expect(same).toBeLessThan(2);
  });

  it("stores a shortest length the solver agrees with", async () => {
    for (const day of DAYS) {
      const pair = await dailyPair(graph, SEED, day);
      expect(graph.solve(pair.start, pair.end).cost).toBe(pair.shortest);
      expect(pair.shortest).toBeGreaterThanOrEqual(3);
      expect(pair.shortest).toBeLessThanOrEqual(12);
    }
  });

  it("does not reuse an endpoint from the days just before", async () => {
    let clashes = 0;
    for (const day of DAYS.slice(0, 30)) {
      const today = await dailyPair(graph, SEED, day);
      for (let back = 1; back <= 6; back++) {
        const earlier = await dailyPair(graph, SEED, day - back);
        if ([earlier.start, earlier.end].some((id) => id === today.start || id === today.end)) {
          clashes++;
        }
      }
    }
    // Days are checked against earlier first draws, not final picks, so a
    // rare clash can slip through; a systematic one cannot.
    expect(clashes).toBeLessThan(3);
  });

  it("is winnable by playing the shortest route in order", async () => {
    for (const day of DAYS.slice(0, 20)) {
      const { start, end, shortest } = await dailyPair(graph, SEED, day);
      const route = graph.solve(start, end).path;
      const played: string[] = [];
      for (const region of route) {
        expect(evaluateGuess(graph, start, end, played, region).mark).toBe("chain");
        played.push(region);
      }
      expect(graph.isComplete(start, end, played)).toBe(true);
      expect(graph.isComplete(start, end, route.slice(0, -1))).toBe(false);
      expect(played.length).toBeLessThan(guessBudget(shortest));
    }
  });
});

describe("dates", () => {
  it("counts days from the epoch and back", () => {
    expect(dayNumber("2026-01-01")).toBe(0);
    expect(dayNumber("2026-10-04")).toBe(276);
    expect(dateOf(276)).toBe("2026-10-04");
  });

  it("rejects malformed and impossible dates", () => {
    expect(dayNumber("2026-02-31")).toBeNull();
    expect(dayNumber("tomorrow")).toBeNull();
    expect(dayNumber("2026-1-5")).toBeNull();
  });

  it("knows the latest date anywhere on Earth", () => {
    // 11:00 UTC on 4 October is already 01:00 on the 5th in Kiribati.
    expect(latestDate(new Date("2026-10-04T11:00:00Z"))).toBe("2026-10-05");
    expect(latestDate(new Date("2026-10-04T09:00:00Z"))).toBe("2026-10-04");
  });
});
