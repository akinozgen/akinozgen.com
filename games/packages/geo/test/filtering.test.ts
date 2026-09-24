import { describe, expect, it } from "vitest";
import { borderGraph } from "../src/index.ts";

const graph = borderGraph();
const idsOf = (continent: string): string[] =>
  graph.playableRegions().filter((r) => r.continent === continent).map((r) => r.id);
const allBut = (dropped: string[]): string[] =>
  graph.playableRegions().map((r) => r.id).filter((id) => !dropped.includes(id));

describe("taking countries off the map", () => {
  it("removes them as stepping stones, not just as endpoints", () => {
    const withoutTurkey = graph.withOnly(allBut(["turkey"]));
    expect(withoutTurkey.region("turkey").isolated).toBe(true);
    expect(withoutTurkey.solve("greece", "georgia").cost).toBeGreaterThan(
      graph.solve("greece", "georgia").cost,
    );
  });

  it("cuts Africa loose when Egypt goes, since Sinai is the only land bridge", () => {
    const withoutEgypt = graph.withOnly(allBut(["egypt"]));
    expect(withoutEgypt.componentOf("kenya")).not.toContain("israel");
    expect(withoutEgypt.componentOf("kenya").length).toBeGreaterThan(40);
    expect(graph.componentOf("kenya")).toContain("israel");
  });

  it("keeps a continent playable on its own", () => {
    const africa = graph.withOnly(idsOf("Africa"));
    // Every African country with a land border survives; the islands were
    // already off the board before the filter ran.
    expect(africa.playableRegions().length).toBe(50);
    expect(africa.solve("egypt", "south-africa").cost).toBeGreaterThan(2);
    for (const id of africa.playableRegions().map((r) => r.id)) {
      expect(graph.region(id).continent).toBe("Africa");
    }
  });

  it("leaves the rest of the world alone when a continent is dropped", () => {
    const noAfrica = graph.withOnly(allBut(idsOf("Africa")));
    expect(noAfrica.region("kenya").isolated).toBe(true);
    expect(noAfrica.solve("portugal", "china").cost).toBe(graph.solve("portugal", "china").cost);
  });
});

describe("picking a random pair", () => {
  const rng = (seed: number) => {
    let a = seed >>> 0;
    return (): number => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  it("respects the requested difficulty", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const pair = graph.randomPair(rng(seed), 4, 6);
      expect(pair).not.toBeNull();
      expect(pair!.shortest).toBeGreaterThanOrEqual(4);
      expect(pair!.shortest).toBeLessThanOrEqual(6);
      expect(graph.solve(pair!.start, pair!.end).cost).toBe(pair!.shortest);
    }
  });

  it("stays inside the filtered map", () => {
    const africa = graph.withOnly(idsOf("Africa"));
    for (let seed = 1; seed <= 20; seed++) {
      const pair = africa.randomPair(rng(seed), 3, 7);
      expect(pair).not.toBeNull();
      expect(graph.region(pair!.start).continent).toBe("Africa");
      expect(graph.region(pair!.end).continent).toBe("Africa");
      expect(africa.solve(pair!.start, pair!.end).path.length).toBe(pair!.shortest);
    }
  });

  it("gives up rather than inventing an impossible puzzle", () => {
    const africa = graph.withOnly(idsOf("Africa"));
    // Africa on its own is only nine guesses across at its widest.
    expect(africa.randomPair(rng(1), 20, 30)).toBeNull();
  });

  it("is repeatable for a given seed", () => {
    expect(graph.randomPair(rng(7), 3, 8)).toEqual(graph.randomPair(rng(7), 3, 8));
  });
});
