import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { judgeRecorded, type PlayStore, type StoredPlay } from "../../core/src/record.ts";
import { type VexleMoves, type VexleResult, vexleRules } from "../src/record.ts";
import { dailyRound, endlessCard, handleVexle, type VexleVerdict } from "../src/server.ts";

const SEED = "test-seed-not-the-real-one";
const NOW = new Date("2026-10-10T12:00:00Z");
const DATE = "2026-10-10";
const PACKS = new URL("../tiles/", import.meta.url);
const load = async (code: string) => new Uint8Array(await readFile(new URL(`${code.toLowerCase()}.bin`, PACKS)));

const rules = (action: string, params: Record<string, string>) => vexleRules(action, new URLSearchParams(params));
const { answer } = await dailyRound(SEED, 7);
const misses = ["FR", "DE", "IT", "ES", "PT", "BE"].filter((code) => code !== answer);

function memory(initial: StoredPlay<VexleMoves> | null = null) {
  let play = initial;
  const writes: Array<{ moves: VexleMoves; result: VexleResult | null }> = [];
  const store: PlayStore<VexleMoves, VexleResult> = {
    load: async () => play,
    save: async (moves, result) => {
      writes.push({ moves, result });
      play = { moves, finishedAt: result ? 1 : null };
    },
  };
  return { store, writes };
}

const ask = (action: string, params: Record<string, string>, store: PlayStore<VexleMoves, VexleResult>) => {
  const query = new URLSearchParams(params);
  return judgeRecorded(vexleRules(action, query)!, store, (q) => handleVexle(action, q, SEED, load, NOW), query);
};

describe("which record a request belongs to", () => {
  it("is the day, or the deck and card", () => {
    expect(rules("judge", { d: DATE })?.puzzle).toBe(`d:${DATE}`);
    expect(rules("judge", { date: DATE, d: "2026-10-09" })?.puzzle).toBe(`d:${DATE}`);
    expect(rules("endless", { e: "77", i: "3" })?.puzzle).toBe("e:77.3");
    expect(rules("endless", { e: "77" })?.puzzle).toBe("e:77");
    expect(rules("endless", { e: "77", i: "x" })).toBeNull();
    expect(rules("daily", { date: DATE })).toBeNull();
  });
});

describe("how a round's moves grow", () => {
  const r = rules("judge", { d: DATE })!;

  it("takes guesses at the end, and loses hard mode for good once a guess is made in colour", () => {
    const hard = { g: ["FR"], hard: true };
    expect(r.extend(hard, { g: ["FR", "DE"], hard: true })).toEqual({ g: ["FR", "DE"], hard: true });
    expect(r.extend(hard, { g: ["FR"], hard: false })).toEqual({ g: ["FR"], hard: false });
    expect(r.extend({ g: ["FR"], hard: false }, { g: ["FR", "DE"], hard: true })).toEqual({ g: ["FR", "DE"], hard: false });
    // Before the first guess the switch is free.
    expect(r.extend({ g: [], hard: false }, { g: [], hard: true })).toEqual({ g: [], hard: true });
  });

  it("refuses a guess taken back or changed", () => {
    expect(r.extend({ g: ["FR", "DE"], hard: false }, { g: ["FR"], hard: false })).toBeNull();
    expect(r.extend({ g: ["FR"], hard: false }, { g: ["IT"], hard: false })).toBeNull();
  });

  it("treats the switch as how tiles are shown, not as a move", () => {
    expect(r.same({ g: ["FR"], hard: true }, { g: ["FR"], hard: false })).toBe(true);
    expect(r.same({ g: ["FR"], hard: true }, { g: ["FR", "DE"], hard: true })).toBe(false);
  });
});

describe("a signed-in round, end to end", () => {
  it("records the win with its guesses and mode, and stays finished", async () => {
    const { store, writes } = memory();
    await ask("judge", { d: DATE, hard: "1" }, store);
    await ask("judge", { d: DATE, g: misses[0], hard: "1" }, store);
    const done = await ask("judge", { d: DATE, g: `${misses[0]},${answer}`, hard: "1" }, store);
    expect((done.body as VexleVerdict).status).toBe("won");
    expect(writes.at(-1)?.result).toEqual({ won: true, guesses: 2, hard: true });

    const fresh = await ask("judge", { d: DATE }, store);
    expect(fresh.status).toBe(409);
    expect(fresh.body).toEqual({ error: "kayit", moves: { g: [misses[0], answer], hard: true } });
    // The same guesses, whatever the switch now says, see the finished flag.
    const again = await ask("judge", { d: DATE, g: `${misses[0]},${answer}` }, store);
    expect((again.body as VexleVerdict).answer).toBe(answer);
    expect(writes).toHaveLength(3);
  });

  it("marks a round played partly in colour", async () => {
    const { store, writes } = memory();
    await ask("judge", { d: DATE, g: misses[0], hard: "1" }, store);
    await ask("judge", { d: DATE, g: misses[0] }, store);
    await ask("judge", { d: DATE, g: misses.slice(0, 5).join(","), hard: "1" }, store);
    expect(writes.at(-1)?.result).toEqual({ won: false, guesses: 5, hard: false });
  });

  it("records an endless card under its deck", async () => {
    const card = await endlessCard(SEED, 77, 3);
    const { store, writes } = memory();
    await ask("endless", { e: "77", i: "3", g: card.answer }, store);
    expect(writes).toEqual([{ moves: { g: [card.answer], hard: false }, result: { won: true, guesses: 1, hard: false } }]);
  });
});
