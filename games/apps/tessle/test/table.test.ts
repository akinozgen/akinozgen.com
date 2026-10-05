import type { FitReply, PieceState, Puzzle, Reveal } from "@tessle/data/client";
import { handleTessle } from "@tessle/data/server";
import { describe, expect, it } from "vitest";
import { Table, turned } from "../src/game/table.ts";
import { TEST_SEED } from "./setup.ts";

const DAY = "2026-10-05";
const NOW = new Date(`${DAY}T12:00:00Z`);

const call = async <T>(action: string, params: Record<string, string>): Promise<T> => {
  const reply = await handleTessle(action, new URLSearchParams(params), TEST_SEED, NOW);
  expect(reply.status).toBe(200);
  return reply.body as T;
};

const puzzle = (): Promise<Puzzle> => call<Puzzle>("daily", { date: DAY });
const reveal = (): Promise<Reveal> => call<Reveal>("reveal", { d: DAY });
const fit = (pieces: PieceState[], moved: number[] = []): Promise<FitReply> =>
  call<FitReply>("fit", {
    d: DAY,
    p: pieces.map((p) => `${p.x},${p.y},${p.r}`).join(";"),
    m: moved.join(","),
    u: "1",
  });

/** Every piece where the answer has it, north up, around (ox, oy). */
function solve(table: Table, answer: Reveal, ox = 0, oy = 0): void {
  table.state = answer.home.map(([x, y], i) => ({ x: ox + x, y: oy + y, r: answer.turns[i] }));
  table.visual = table.state.map((p) => ({ x: p.x, y: p.y, a: p.r * 30 }));
}

describe("the table", () => {
  it("scatters the pieces the same way every time for a round", async () => {
    const { pieces } = await puzzle();
    const a = new Table(pieces);
    const b = new Table(pieces);
    expect(a.isPlaced).toBe(false);
    a.layout(1.6, 1);
    b.layout(1.6, 1);
    expect(a.isPlaced).toBe(true);
    expect(a.state).toEqual(b.state);
    expect(new Set(a.state.map((p) => `${p.x},${p.y}`)).size).toBe(pieces.length);
    expect(a.state.every((p) => p.r === 0)).toBe(true);
    expect([...a.order].sort()).toEqual(pieces.map((_, i) => i));
  });

  it("finds the piece under a point, and none in open table", async () => {
    const { pieces } = await puzzle();
    const table = new Table(pieces);
    table.layout(1.6, 1);
    table.turn(2, 1, 0);
    table.tick(1e6);
    const p = table.state[2];
    const [lx, ly] = turned(pieces[2].label[0], pieces[2].label[1], p.r * 30);
    expect(table.hit(p.x + lx, p.y + ly)).toBe(2);
    expect(table.hit(1e6, 1e6)).toBe(-1);
  });

  it("turns a loose piece in place, and lands the animation on the state", async () => {
    const { pieces } = await puzzle();
    const table = new Table(pieces);
    table.layout(1.6, 1);
    const before = { ...table.state[0] };
    table.turn(0, -1, 0);
    expect(table.state[0]).toMatchObject({ x: before.x, y: before.y, r: 11 });
    expect(table.tick(50)).toBe(true);
    expect(table.tick(10_000)).toBe(false);
    expect(table.visual[0].a).toBe(-30);
  });

  it("joins what the server says fits, and the solved map is one piece", async () => {
    const { pieces } = await puzzle();
    const answer = await reveal();
    const table = new Table(pieces);
    solve(table, answer, 120, -40);
    // One piece a little off: the snap pulls it in.
    table.state[1] = { ...table.state[1], x: table.state[1].x + 3, y: table.state[1].y - 2 };
    expect(table.touches([1], 14)).toBe(true);
    const sent = table.snapshot();
    const reply = await fit(sent, [1]);
    expect(reply.solved).toBe(true);
    const { joined, stale } = table.applyFit(reply, sent, 0);
    expect(stale).toEqual([]);
    expect(joined.sort()).toEqual(pieces.map((_, i) => i));
    expect(table.groups).toHaveLength(1);
    expect(table.clusters).toBe(1);
    expect(table.state[1].x).toBeCloseTo(120 + answer.home[1][0], 1);
  });

  it("turns a fitted group as one, and it still fits", async () => {
    const { pieces } = await puzzle();
    const answer = await reveal();
    const table = new Table(pieces);
    solve(table, answer);
    table.groups = [pieces.map((_, i) => i)];
    table.turn(0, 1, 0);
    table.turn(3, 1, 0);
    expect((await fit(table.snapshot())).solved).toBe(true);
  });

  it("leaves a group alone if one of its pieces moved while the server was asked", async () => {
    const { pieces } = await puzzle();
    const answer = await reveal();
    const table = new Table(pieces);
    solve(table, answer);
    const sent = table.snapshot();
    const reply = await fit(sent);
    table.moveBy(0, 50, 0);
    const { joined, stale } = table.applyFit(reply, sent, 0);
    expect(joined).toEqual([]);
    expect(stale).toContain(0);
    expect(table.groups).toEqual([]);
  });

  it("only asks the server about pieces that lie against something", async () => {
    const { pieces } = await puzzle();
    const table = new Table(pieces);
    table.layout(1.6, 1);
    table.state = table.state.map((p, i) => ({ ...p, x: i * 5000 }));
    expect(table.touches([0], 14)).toBe(false);
  });

  it("settles a solved map north up around where it lay", async () => {
    const { pieces } = await puzzle();
    const answer = await reveal();
    const table = new Table(pieces);
    solve(table, answer);
    table.groups = [pieces.map((_, i) => i)];
    table.turn(0, 1, 0);
    table.turn(0, 1, 0);
    table.tick(1e6);
    table.settle(answer, 0);
    table.tick(1e6);
    table.state.forEach((p, i) => {
      expect(p.r).toBe(answer.turns[i] % 12);
      expect(((table.visual[i].a % 360) + 360) % 360).toBeCloseTo((answer.turns[i] * 30) % 360, 6);
    });
    // Relative positions are the answer's.
    const dx = table.state[1].x - table.state[0].x;
    expect(dx).toBeCloseTo(answer.home[1][0] - answer.home[0][0], 6);
  });

  it("saves and restores", async () => {
    const { pieces } = await puzzle();
    const table = new Table(pieces);
    table.layout(1.6, 3);
    table.turn(1, 1, 0);
    const copy = new Table(pieces, table.save());
    expect(copy.isPlaced).toBe(true);
    expect(copy.state).toEqual(table.state);
    expect(copy.order).toEqual(table.order);
  });
});
