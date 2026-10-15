import { describe, expect, it } from "vitest";
import { judgeRecorded, type PlayStore, type StoredPlay } from "../../core/src/record.ts";
import { type SizeleMoves, type SizeleResult, sizeleRules } from "../src/record.ts";
import { dailyRounds, handleSizele } from "../src/server.ts";
import type { Verdict } from "../src/types.ts";

const SEED = "test-seed-not-the-real-one";
const NOW = new Date("2026-10-10T12:00:00Z");
const DAY = "2026-10-08";

const rules = (params: Record<string, string>) => sizeleRules("play", new URLSearchParams(params));
/** The day's true ratios: five perfect guesses. */
const truth = (await dailyRounds(`sizele:${SEED}`, 3)).map((pair) => pair.ratio);

function memory(initial: StoredPlay<SizeleMoves> | null = null) {
  let play = initial;
  const writes: Array<{ moves: SizeleMoves; result: SizeleResult | null }> = [];
  const store: PlayStore<SizeleMoves, SizeleResult> = {
    load: async () => play,
    save: async (moves, result) => {
      writes.push({ moves, result });
      play = { moves, finishedAt: result ? 1 : null };
    },
  };
  return { store, writes };
}

const ask = (g: number[], store: PlayStore<SizeleMoves, SizeleResult>) => {
  const query = new URLSearchParams({ d: DAY, ...(g.length > 0 ? { g: g.join(",") } : {}) });
  return judgeRecorded(sizeleRules("play", query)!, store, (q) => handleSizele("play", q, `sizele:${SEED}`, NOW), query);
};

describe("which record a request belongs to", () => {
  it("is the day or the endless set", () => {
    expect(rules({ d: DAY })?.puzzle).toBe(`d:${DAY}`);
    expect(rules({ e: "5", d: DAY })?.puzzle).toBe("e:5");
    expect(rules({ e: "five" })).toBeNull();
    expect(sizeleRules("judge", new URLSearchParams({ d: DAY }))).toBeNull();
  });

  it("reads the guesses as numbers, as the server does", () => {
    expect(rules({ d: DAY, g: "1.50,0.2" })?.moves).toEqual({ g: [1.5, 0.2] });
    expect(rules({ d: DAY, g: "1e3" })).toBeNull();
  });
});

describe("how a game's moves grow", () => {
  const r = rules({ d: DAY })!;
  it("takes a guess at the end and nothing else", () => {
    expect(r.extend({ g: [1.5] }, { g: [1.5, 2] })).toEqual({ g: [1.5, 2] });
    expect(r.extend({ g: [1.5, 2] }, { g: [1.5] })).toBeNull();
    expect(r.extend({ g: [1.5] }, { g: [1.6, 2] })).toBeNull();
    expect(r.same({ g: [1.5] }, { g: [1.5] })).toBe(true);
    expect(r.same({ g: [1.5] }, { g: [1.5, 2] })).toBe(false);
  });
});

describe("a signed-in game, end to end", () => {
  it("is kept round by round, and its total is the server's", async () => {
    const { store, writes } = memory();
    await ask([], store);
    await ask(truth.slice(0, 2), store);
    const behind = await ask(truth.slice(0, 1), store);
    expect(behind.status).toBe(409);
    expect(behind.body).toEqual({ error: "kayit", moves: { g: truth.slice(0, 2) } });

    const done = await ask(truth, store);
    expect((done.body as Verdict).total).toBe(500);
    expect(writes.at(-1)?.result).toEqual({ total: 500, greats: 5 });
    expect((await ask(truth, store)).status).toBe(200);
    expect(writes).toHaveLength(3);
  });
});
