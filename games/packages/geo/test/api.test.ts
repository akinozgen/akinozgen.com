import { describe, expect, it } from "vitest";
import publicData from "../data/public.json" with { type: "json" };
import { borderGraph } from "../src/index.ts";
import { type DailyPuzzle, type EndlessResponse, handleTravelle, type Verdict } from "../src/server/api.ts";

const graph = borderGraph();
const SEED = "test-seed-not-the-real-one";
const NOW = new Date("2026-10-10T12:00:00Z");

const call = (action: string, params: Record<string, string>, seed: string | null = SEED) =>
  handleTravelle(action, new URLSearchParams(params), seed ?? undefined, NOW);

async function today(): Promise<DailyPuzzle> {
  const reply = await call("daily", { date: "2026-10-10" });
  expect(reply.status).toBe(200);
  return reply.body as DailyPuzzle;
}

describe("the daily endpoint", () => {
  it("serves today's puzzle with its budget", async () => {
    const puzzle = await today();
    expect(puzzle.date).toBe("2026-10-10");
    expect(graph.solve(puzzle.start, puzzle.end).cost).toBe(puzzle.shortest);
    expect(puzzle.budget).toBeGreaterThan(puzzle.shortest);
  });

  it("will not hand out a day that has not begun anywhere", async () => {
    // Noon UTC on the 10th is 02:00 on the 11th in Kiribati, so the 11th is
    // fair game; the 12th is not.
    expect((await call("daily", { date: "2026-10-11" })).status).toBe(200);
    expect((await call("daily", { date: "2026-10-12" })).status).toBe(404);
    expect((await call("judge", { d: "2026-10-12", s: "1" })).status).toBe(404);
  });

  it("refuses to run without the secret rather than fall back to a guessable one", async () => {
    expect((await call("daily", { date: "2026-10-10" }, null)).status).toBe(503);
    expect((await call("judge", { d: "2026-10-10" }, null)).status).toBe(503);
  });

  it("rejects junk", async () => {
    expect((await call("daily", { date: "2026-13-01" })).status).toBe(400);
    expect((await call("daily", { date: "1999-01-01" })).status).toBe(400);
    expect((await call("judge", { d: "2026-10-10", g: "atlantis" })).status).toBe(400);
    expect((await call("judge", { d: "2026-10-10", h: "answer" })).status).toBe(400);
    expect((await call("nope", {})).status).toBe(404);
  });
});

describe("judging", () => {
  it("scores the shortest route as a perfect chain and only then shows the answer", async () => {
    const puzzle = await today();
    const route = graph.solve(puzzle.start, puzzle.end).path;

    const midway = (await call("judge", { d: puzzle.date, g: route.slice(0, -1).join(",") }))
      .body as Verdict;
    expect(midway.status).toBe("playing");
    expect(midway.solution).toBeNull();
    expect(midway.results.every((r) => r.mark === "chain")).toBe(true);

    const done = (await call("judge", { d: puzzle.date, g: route.join(",") })).body as Verdict;
    expect(done.status).toBe("won");
    expect(done.solution).toEqual(route);
  });

  it("hands out only the hints that were taken", async () => {
    const puzzle = await today();
    const bare = (await call("judge", { d: puzzle.date })).body as Verdict;
    expect(bare.hints).toEqual({});

    const hinted = (
      await call("judge", { d: puzzle.date, h: "neighbours,next-outline,initials" })
    ).body as Verdict;
    const route = graph.solve(puzzle.start, puzzle.end).path;
    expect(hinted.hints.next).toBe(route[0]);
    expect(hinted.hints.neighbours).toContain(route[0]);
    expect(hinted.hints.initials?.en).toBe(
      route.map((id) => graph.region(id).names.en.charAt(0)).join(" · "),
    );
  });

  it("ends the round on surrender or when the guesses run out", async () => {
    const puzzle = await today();
    const given = (await call("judge", { d: puzzle.date, s: "1" })).body as Verdict;
    expect(given.status).toBe("lost");
    expect(given.solution?.length).toBe(puzzle.shortest);
    expect(given.hints).toEqual({});
  });

  it("refuses a country named twice", async () => {
    const puzzle = await today();
    expect((await call("judge", { d: puzzle.date, g: `${puzzle.start}` })).status).toBe(400);
  });
});

describe("endless", () => {
  it("draws a round on the requested map and judges it there", async () => {
    const africa = 1 << 2;
    const reply = (await call("endless", { seed: "42", c: String(africa), min: "4", max: "6" }))
      .body as EndlessResponse;
    const puzzle = reply.puzzle!;
    expect(graph.region(puzzle.start).continent).toBe("Africa");
    expect(graph.region(puzzle.end).continent).toBe("Africa");
    expect(puzzle.shortest).toBeGreaterThanOrEqual(4);
    expect(puzzle.shortest).toBeLessThanOrEqual(6);

    const verdict = (await call("judge", { k: puzzle.key, s: "1" })).body as Verdict;
    expect(verdict.solution?.length).toBe(puzzle.shortest);
    for (const id of verdict.solution!) expect(graph.region(id).continent).toBe("Africa");
  });

  it("is the same round for the same seed", async () => {
    const a = await call("endless", { seed: "7" });
    const b = await call("endless", { seed: "7" });
    expect(a.body).toEqual(b.body);
  });

  it("says when nothing on the map fits", async () => {
    const oceania = 1 << 5;
    const reply = (await call("endless", { seed: "1", c: String(oceania), min: "20", max: "30" }))
      .body as EndlessResponse;
    expect(reply.puzzle).toBeNull();
  });
});

describe("what the browser gets", () => {
  it("names and outlines every region but says nothing about borders", () => {
    expect(publicData.regions.length).toBe(graph.regions.length);
    const text = JSON.stringify(publicData);
    expect(text).not.toContain("edges");
    expect(text).not.toContain("adjacent");
    expect(text).not.toContain("island-hop");
  });
});
