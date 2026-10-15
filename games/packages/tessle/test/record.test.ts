import { describe, expect, it } from "vitest";
import { judgeRecorded, type PlayStore, type StoredPlay } from "../../core/src/record.ts";
import { type TessleMoves, type TessleResult, tessleRules } from "../src/record.ts";
import { handleTessle } from "../src/server.ts";
import { type FitReply, type PieceState, type Reveal, STEPS } from "../src/types.ts";

const SEED = "test-seed-not-the-real-one";
const NOW = new Date("2026-10-10T12:00:00Z");
const DAY = "2026-10-07";

const rules = (action: string, params: Record<string, string>) => tessleRules(action, new URLSearchParams(params));
const reveal = (await handleTessle("reveal", new URLSearchParams({ d: DAY }), SEED, NOW)).body as Reveal;

const turn = (x: number, y: number, steps: number): [number, number] => {
  const a = (((steps % STEPS) + STEPS) % STEPS) * (Math.PI / 6);
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
};
const encode = (board: PieceState[]): string => board.map(({ x, y, r }) => `${x.toFixed(1)},${y.toFixed(1)},${r}`).join(";");
/** Every piece far apart: nothing fits. */
const scattered = encode(reveal.ids.map((_, i) => ({ x: 3000 + i * 900, y: 3000, r: 0 })));
/** The map put together, turned and moved off the frame. */
const solved = encode(
  reveal.home.map(([x, y], i) => {
    const [tx, ty] = turn(x, y, 3);
    return { x: 2000 + tx, y: 2000 + ty, r: (reveal.turns[i] + 3) % STEPS };
  }),
);

function memory(initial: StoredPlay<TessleMoves> | null = null) {
  let play = initial;
  const writes: Array<{ moves: TessleMoves; result: TessleResult | null }> = [];
  const store: PlayStore<TessleMoves, TessleResult> = {
    load: async () => play,
    save: async (moves, result) => {
      writes.push({ moves, result });
      play = { moves, finishedAt: result ? 1 : null };
    },
  };
  return { store, writes };
}

const ask = (action: string, params: Record<string, string>, store: PlayStore<TessleMoves, TessleResult>) => {
  const query = new URLSearchParams({ d: DAY, ...params });
  return judgeRecorded(tessleRules(action, query)!, store, (q) => handleTessle(action, q, SEED, NOW), query);
};

describe("which record a request belongs to", () => {
  it("is the day or the endless round, for fits and giving up", () => {
    expect(rules("fit", { d: DAY })?.puzzle).toBe(`d:${DAY}`);
    expect(rules("reveal", { e: "12" })?.puzzle).toBe("e:12");
    expect(rules("fit", { e: "x" })).toBeNull();
    expect(rules("fit", { d: DAY, n: "-1" })).toBeNull();
    expect(rules("daily", { date: DAY })).toBeNull();
  });

  it("reads the board, the count the page has seen and its word on hard mode", () => {
    expect(rules("fit", { d: DAY, p: "1,2,0", n: "4", hard: "1" })?.moves).toEqual({ board: "1,2,0", after: 4, gaveUp: false, hard: true });
    expect(rules("fit", { d: DAY })?.moves).toEqual({ board: null, after: 0, gaveUp: false, hard: false });
    expect(rules("reveal", { d: DAY, p: "1,2,0", n: "4" })?.moves).toEqual({ board: null, after: 4, gaveUp: true, hard: false });
  });
});

describe("how a round's boards follow on", () => {
  const r = rules("fit", { d: DAY })!;
  const stored: TessleMoves = { board: "a", checks: 3, gaveUp: false, hard: true };

  it("takes a new board from a page that has seen the last one, and counts it", () => {
    expect(r.extend(stored, { board: "b", after: 3, gaveUp: false, hard: true })).toEqual({ ...stored, board: "b", checks: 4 });
    // The same board again is no new check.
    expect(r.extend(stored, { board: "a", after: 3, gaveUp: false, hard: true })).toEqual(stored);
    expect(r.extend(stored, { board: null, after: 3, gaveUp: false, hard: true })).toEqual(stored);
  });

  it("refuses a board from a page that is behind, or ahead", () => {
    expect(r.extend(stored, { board: "b", after: 2, gaveUp: false, hard: true })).toBeNull();
    expect(r.extend(stored, { board: null, after: 0, gaveUp: false, hard: true })).toBeNull();
    expect(r.extend(stored, { board: "b", after: 4, gaveUp: false, hard: true })).toBeNull();
  });

  it("starts from the page's own board when nothing is on record", () => {
    expect(r.extend(null, { board: "b", after: 7, gaveUp: false, hard: false })).toEqual({ board: "b", checks: 8, gaveUp: false, hard: false });
    expect(r.extend(null, { board: null, after: 0, gaveUp: false, hard: true })).toEqual({ board: "", checks: 0, gaveUp: false, hard: true });
  });

  it("only ever loses hard mode once a board is in", () => {
    expect(r.extend({ ...stored, board: "" }, { board: "b", after: 3, gaveUp: false, hard: false })?.hard).toBe(false);
    expect(r.extend({ ...stored, hard: false }, { board: "b", after: 3, gaveUp: false, hard: true })?.hard).toBe(false);
    expect(r.extend({ board: "", checks: 0, gaveUp: false, hard: false }, { board: "b", after: 0, gaveUp: false, hard: true })?.hard).toBe(true);
  });
});

describe("a signed-in round, end to end", () => {
  it("is kept board by board, moves a fresh device to it, and stays solved", async () => {
    const { store, writes } = memory();
    const opened = await ask("fit", { n: "0", hard: "1" }, store);
    expect((opened.body as FitReply).groups).toEqual([]);
    await ask("fit", { p: scattered, n: "0", hard: "1" }, store);

    const fresh = await ask("fit", { n: "0" }, store);
    expect(fresh.status).toBe(409);
    expect(fresh.body).toEqual({ error: "kayit", moves: { board: scattered, checks: 1, gaveUp: false, hard: true } });

    const done = await ask("fit", { p: solved, n: "1", hard: "1" }, store);
    expect((done.body as FitReply).solved).toBe(true);
    expect(writes.at(-1)).toEqual({ moves: { board: solved, checks: 2, gaveUp: false, hard: true }, result: { won: true, claimed: { hard: true } } });

    // Another device catches up, and is answered for the board on record; giving up now is refused.
    expect((await ask("fit", { n: "0" }, store)).status).toBe(409);
    const caught = await ask("fit", { n: "2" }, store);
    expect((caught.body as FitReply).solved).toBe(true);
    expect((await ask("reveal", { n: "2" }, store)).status).toBe(409);
    expect(writes).toHaveLength(3);
  });

  it("records giving up as a loss, and keeps answering it with the answer", async () => {
    const { store, writes } = memory();
    await ask("fit", { p: scattered, n: "0" }, store);
    const given = await ask("reveal", { n: "1" }, store);
    expect((given.body as Reveal).ids).toEqual(reveal.ids);
    expect(writes.at(-1)?.result).toEqual({ won: false, claimed: { hard: false } });
    expect((await ask("reveal", { n: "1" }, store)).status).toBe(200);
    expect((await ask("fit", { n: "1" }, store)).status).toBe(409);
  });
});

describe("the fit check", () => {
  it("answers an empty board with nothing fitted", async () => {
    const reply = await handleTessle("fit", new URLSearchParams({ d: DAY }), SEED, NOW);
    expect(reply.status).toBe(200);
    expect(reply.body).toEqual({ groups: [], placed: [], at: reveal.ids.map(() => null), solved: false, reveal: null });
  });
});
