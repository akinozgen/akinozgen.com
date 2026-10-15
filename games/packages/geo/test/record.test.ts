import { describe, expect, it } from "vitest";
import { judgeRecorded, type PlayStore, type StoredPlay } from "../../core/src/record.ts";
import { borderGraph } from "../src/index.ts";
import { type DailyPuzzle, type EndlessResponse, handleTravelle, type Verdict } from "../src/server/api.ts";
import { type TravelleMoves, type TravelleResult, travelleRules } from "../src/server/record.ts";

const graph = borderGraph();
const SEED = "test-seed-not-the-real-one";
const NOW = new Date("2026-10-10T12:00:00Z");
const DATE = "2026-10-10";

const rules = (params: Record<string, string>) => travelleRules("judge", new URLSearchParams(params))!;
const judge = (query: URLSearchParams) => handleTravelle("judge", query, SEED, NOW);
const puzzle = (await handleTravelle("daily", new URLSearchParams({ date: DATE }), SEED, NOW)).body as DailyPuzzle;
const route = graph.solve(puzzle.start, puzzle.end).path;

function memory(initial: StoredPlay<TravelleMoves> | null = null) {
  let play = initial;
  const writes: Array<{ moves: TravelleMoves; result: TravelleResult | null }> = [];
  const store: PlayStore<TravelleMoves, TravelleResult> = {
    load: async () => play,
    save: async (moves, result) => {
      writes.push({ moves, result });
      play = { moves, finishedAt: result ? 1 : null };
    },
  };
  return { store, writes };
}

const ask = (params: Record<string, string>, store: PlayStore<TravelleMoves, TravelleResult>) => {
  const query = new URLSearchParams(params);
  return judgeRecorded(travelleRules("judge", query)!, store, judge, query);
};

describe("which record a request belongs to", () => {
  it("is the day for a daily, and the draw and pair for an endless round", () => {
    expect(rules({ d: DATE }).puzzle).toBe(`d:${DATE}`);
    expect(rules({ k: "fr.de.63.", r: "42" }).puzzle).toBe("e:42.fr.de");
    // Nothing to file it under: not recorded, judged as for anyone.
    expect(travelleRules("judge", new URLSearchParams({ k: "fr.de.63." }))).toBeNull();
    expect(travelleRules("judge", new URLSearchParams({ d: "today" }))).toBeNull();
    expect(travelleRules("daily", new URLSearchParams({ date: DATE }))).toBeNull();
  });

  it("reads the moves as the judge does", () => {
    expect(rules({ d: DATE, g: "fr,,de", h: "neighbours", s: "1" }).moves).toEqual({
      g: ["fr", "de"],
      h: ["neighbours"],
      s: true,
    });
    expect(rules({ d: DATE }).moves).toEqual({ g: [], h: [], s: false });
  });
});

describe("how a round's moves grow", () => {
  const stored: TravelleMoves = { g: ["fr"], h: ["neighbours"], s: false };
  const r = rules({ d: DATE });

  it("takes guesses and hints added at the end, and giving up", () => {
    expect(r.extend(stored, { g: ["fr", "de"], h: ["neighbours", "initials"], s: true })).toEqual({
      g: ["fr", "de"],
      h: ["neighbours", "initials"],
      s: true,
    });
    expect(r.extend(null, { g: ["it"], h: [], s: false })).toEqual({ g: ["it"], h: [], s: false });
  });

  it("refuses anything that would take a move back", () => {
    expect(r.extend(stored, { g: [], h: ["neighbours"], s: false })).toBeNull();
    expect(r.extend(stored, { g: ["de"], h: ["neighbours"], s: false })).toBeNull();
    expect(r.extend(stored, { g: ["fr"], h: [], s: false })).toBeNull();
    expect(r.extend({ ...stored, s: true }, stored)).toBeNull();
  });

  it("replays the stored moves in place of the request's", () => {
    const replay = rules({ d: DATE, g: "it" }).replay({ g: ["fr", "de"], h: [], s: true });
    expect(Object.fromEntries(replay)).toEqual({ d: DATE, g: "fr,de", s: "1" });
  });
});

describe("the summary of a finished round", () => {
  it("counts a perfect win, and nothing while the round is on", async () => {
    const won = (await judge(new URLSearchParams({ d: DATE, g: route.join(",") }))).body as Verdict;
    const r = rules({ d: DATE });
    expect(r.result(won, { g: route, h: ["initials"], s: false })).toEqual({
      won: true,
      guesses: route.length,
      perfect: true,
      hints: 1,
    });
    const midway = (await judge(new URLSearchParams({ d: DATE, g: route[0] }))).body as Verdict;
    expect(r.result(midway, { g: [route[0]], h: [], s: false })).toBeNull();
  });

  it("counts giving up as a loss", async () => {
    const lost = (await judge(new URLSearchParams({ d: DATE, s: "1" }))).body as Verdict;
    expect(rules({ d: DATE }).result(lost, { g: [], h: [], s: true })).toEqual({ won: false, guesses: 0, perfect: false, hints: 0 });
  });
});

describe("a signed-in round, end to end", () => {
  it("is kept move by move, refuses a stale page, and stays finished", async () => {
    const { store, writes } = memory();
    expect((await ask({ d: DATE }, store)).status).toBe(200);
    expect((await ask({ d: DATE, g: route[0] }, store)).status).toBe(200);

    // A second device, still on the empty board, is told where the round is.
    const stale = await ask({ d: DATE }, store);
    expect(stale.status).toBe(409);
    expect(stale.body).toEqual({ error: "kayit", moves: { g: [route[0]], h: [], s: false } });

    const done = await ask({ d: DATE, g: route.join(",") }, store);
    expect((done.body as Verdict).status).toBe("won");
    expect(writes.at(-1)?.result).toEqual({ won: true, guesses: route.length, perfect: true, hints: 0 });

    // Finished: the same moves get the same verdict; giving up now changes nothing.
    const again = await ask({ d: DATE, g: route.join(",") }, store);
    expect((again.body as Verdict).status).toBe("won");
    expect((await ask({ d: DATE, g: route.join(","), s: "1" }, store)).status).toBe(409);
    expect(writes).toHaveLength(3);
  });

  it("keeps endless rounds apart by their draw", async () => {
    const drawn = (await handleTravelle("endless", new URLSearchParams({ seed: "9" }), SEED, NOW)).body as EndlessResponse;
    const key = drawn.puzzle!.key;
    const { store, writes } = memory();
    await ask({ k: key, r: "9", s: "1" }, store);
    expect(writes[0].result).toMatchObject({ won: false });
    expect(rules({ k: key, r: "10" }).puzzle).not.toBe(rules({ k: key, r: "9" }).puzzle);
  });
});
