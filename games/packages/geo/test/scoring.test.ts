import { describe, expect, it } from "vitest";
import { borderGraph, evaluateGuess, guessBudget } from "../src/index.ts";

const graph = borderGraph();
const mark = (previous: string[], guess: string): string =>
  evaluateGuess(graph, "spain", "austria", previous, guess).mark;

describe("guess budget", () => {
  it("matches the published table", () => {
    expect(guessBudget(3)).toBe(7);
    expect(guessBudget(4)).toBe(9);
    expect(guessBudget(6)).toBe(11);
    expect(guessBudget(9)).toBe(15);
    expect(guessBudget(12)).toBe(19);
    expect(guessBudget(13)).toBe(21);
  });
});

// Travle documents this exact walkthrough on its rules page, so it doubles as
// the specification for the scoring rules.
describe("Spain to Austria, the worked example from the rules", () => {
  it("needs two guesses at the start", () => {
    expect(graph.solve("spain", "austria").cost).toBe(2);
  });

  it("marks France ✅ — it shortens the route and touches Spain", () => {
    expect(mark([], "france")).toBe("chain");
  });

  it("marks Germany 🟩 — it shortens the route but is detached", () => {
    expect(mark([], "germany")).toBe("closer");
  });

  it("marks Italy 🟧 after Germany, even though it was on a shortest route", () => {
    expect(mark(["germany"], "italy")).toBe("detour");
  });

  it("marks Slovakia 🟧 — one guess worse than the best remaining route", () => {
    expect(mark(["germany"], "slovakia")).toBe("detour");
  });

  it("marks a far-away country 🟥", () => {
    expect(mark(["germany"], "chile")).toBe("wrong");
    expect(mark([], "mongolia")).toBe("wrong");
  });

  it("completes once the chain is unbroken", () => {
    expect(graph.isComplete("spain", "austria", ["france", "switzerland"])).toBe(true);
    expect(graph.isComplete("spain", "austria", ["france"])).toBe(false);
  });
});
