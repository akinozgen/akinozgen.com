import { describe, expect, it } from "vitest";
import calendar from "../data/puzzles.json" with { type: "json" };
import { borderGraph, evaluateGuess, guessBudget } from "../src/index.ts";

const graph = borderGraph();
const puzzles = calendar.puzzles as Array<{ start: string; end: string; shortest: number }>;

/** Every 37th day — enough spread to catch a systematic fault, fast enough to run always. */
const sample = puzzles.filter((_, index) => index % 37 === 0);

describe("puzzle calendar", () => {
  it("schedules a full run of days", () => {
    expect(puzzles.length).toBeGreaterThan(2900);
  });

  it("never repeats a country inside a week's endpoints", () => {
    for (let week = 0; week * 7 < puzzles.length; week++) {
      const days = puzzles.slice(week * 7, week * 7 + 7);
      const endpoints = days.flatMap((p) => [p.start, p.end]);
      expect(new Set(endpoints).size).toBe(endpoints.length);
    }
  });

  it("stores a shortest length the solver agrees with", () => {
    for (const puzzle of sample) {
      expect(graph.solve(puzzle.start, puzzle.end).cost).toBe(puzzle.shortest);
      expect(puzzle.shortest).toBeGreaterThanOrEqual(3);
    }
  });

  it("is winnable by playing the shortest route in order", () => {
    for (const puzzle of sample) {
      const route = graph.solve(puzzle.start, puzzle.end).path;
      const played: string[] = [];
      for (const region of route) {
        const result = evaluateGuess(graph, puzzle.start, puzzle.end, played, region);
        // Walking out from the start, every step should join the chain.
        expect(result.mark).toBe("chain");
        played.push(region);
      }
      expect(graph.isComplete(puzzle.start, puzzle.end, played)).toBe(true);
      expect(played.length).toBeLessThan(guessBudget(puzzle.shortest));
    }
  });

  it("leaves the puzzle unsolved until the chain is whole", () => {
    for (const puzzle of sample) {
      const route = graph.solve(puzzle.start, puzzle.end).path;
      expect(graph.isComplete(puzzle.start, puzzle.end, route.slice(0, -1))).toBe(false);
    }
  });
});
