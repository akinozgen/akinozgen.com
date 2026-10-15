import { resetAccountCache, resetRecordsCache } from "@akinozgen/account/client";
import { type Puzzle, type Reveal, STEPS } from "@tessle/data/client";
import { handleTessle } from "@tessle/data/server";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { type FakeAccount, fakeAccount, finished } from "../../../packages/core/test/fakeAccount.ts";
import { tessleRules } from "../../../packages/tessle/src/record.ts";
import { boardText } from "../src/game/api.ts";
import { useTessle } from "../src/game/useTessle.ts";
import { TEST_SEED } from "./setup.ts";

/** A signed-in player: the round and the record are the account's, kept by the (fake) server. */

const DAY = "2026-10-07";
const BEFORE = "2026-10-06";
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${DAY}T12:00:00`));
});
afterAll(() => vi.useRealTimers());

const puzzle = (await handleTessle("daily", new URLSearchParams({ date: DAY }), TEST_SEED)).body as Puzzle;
const answer = (await handleTessle("reveal", new URLSearchParams({ d: DAY }), TEST_SEED)).body as Reveal;
const count = puzzle.pieces.length;
/** Every piece far from every other: nothing fits. */
const scattered = boardText(puzzle.pieces.map((_, i) => ({ x: 3000 + i * 900, y: 3000, r: 0 })));
/** The map put together, a little off its frame. */
const solved = answer.home.map(([x, y], i) => ({ x: x + 2, y: y - 1, r: answer.turns[i] % STEPS }));

let server: FakeAccount;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetAccountCache();
  resetRecordsCache();
  server = fakeAccount({ game: "tessle", rules: tessleRules, judge: (action, query) => handleTessle(action, query, TEST_SEED) });
  vi.stubGlobal("fetch", server.fetch);
});

describe("signed in", () => {
  it("takes up a board begun on another device", async () => {
    server.plays.set(`d:${DAY}`, { moves: { board: scattered, checks: 1, gaveUp: false, hard: false }, result: null, startedAt: 1, finishedAt: null });
    const { result } = renderHook(() => useTessle("daily"));
    await waitFor(() => expect(result.current.table && boardText(result.current.table.snapshot())).toBe(scattered));
    expect(result.current.started).toBe(true);
    expect(result.current.status).toBe("playing");
    const saved = JSON.parse(localStorage.getItem(`tessle:game:v1:${DAY}`)!);
    expect(saved).toMatchObject({ checks: 1, judged: scattered });
    expect(count).toBeGreaterThan(1);
  });

  it("shows a round finished elsewhere as finished, and the record, times included, as the server's", async () => {
    localStorage.setItem("tessle:stats:v1", JSON.stringify({ played: 99, won: 99, streak: 99, best: 99, hardWins: 99, fastest: 1, totalTime: 1, lastNumber: null, lastWon: null }));
    server.imported = { stats: { daily: null, endless: null }, importedAt: 1 };
    server.plays.set(`d:${BEFORE}`, finished({ board: "", checks: 0, gaveUp: true, hard: false }, { won: false, claimed: { hard: false } }, 10, 20));
    server.plays.set(
      `d:${DAY}`,
      finished({ board: boardText(solved), checks: 3, gaveUp: false, hard: true }, { won: true, claimed: { hard: true } }, 10_000, 70_000),
    );
    const { result } = renderHook(() => useTessle("daily"));
    await waitFor(() => expect(result.current.status).toBe("won"));
    await waitFor(() => expect(result.current.stats).toMatchObject({ played: 2, won: 1, streak: 1, hardWins: 1, fastest: 60_000, totalTime: 60_000 }));
    expect(result.current.imported).toBe(0);
    // The end card's time is the record's, not this device's clock.
    expect(result.current.elapsed()).toBe(60_000);
  });

  it("keeps each board, and the result once the map is whole", async () => {
    const { result } = renderHook(() => useTessle("daily"));
    await waitFor(() => expect(result.current.table).not.toBeNull());
    await waitFor(() => expect(server.plays.get(`d:${DAY}`)).toBeTruthy());
    const table = result.current.table!;
    table.layout(1.6, 1);
    table.state = solved.map((piece) => ({ ...piece }));
    act(() => result.current.act([0]));
    await waitFor(() => expect(result.current.status).toBe("won"));
    expect(server.plays.get(`d:${DAY}`)).toMatchObject({ moves: { checks: 1, gaveUp: false }, result: { won: true, claimed: { hard: false } } });
    await waitFor(() => expect(result.current.stats).toMatchObject({ played: 1, won: 1 }));
  });

  it("sends this device's record once, and counts on from it", async () => {
    const before = { played: 2, won: 1, streak: 0, best: 1, hardWins: 0, fastest: 90_000, totalTime: 90_000, lastNumber: 1, lastWon: 1 };
    localStorage.setItem("tessle:stats:v1", JSON.stringify(before));
    const first = renderHook(() => useTessle("daily"));
    await waitFor(() => expect(server.imported).not.toBeNull());
    expect(server.imported?.stats).toEqual({ daily: before, endless: null });
    await waitFor(() => expect(first.result.current.imported).toBe(2));
    act(() => first.result.current.giveUp());
    await waitFor(() => expect(first.result.current.stats).toMatchObject({ played: 3, won: 1, fastest: 90_000 }));

    first.unmount();
    resetRecordsCache();
    const second = renderHook(() => useTessle("daily"));
    await waitFor(() => expect(second.result.current.imported).toBe(2));
    expect(server.imports).toHaveLength(1);
  });
});

describe("signed out", () => {
  it("plays and keeps its record in the browser, as before accounts", async () => {
    server.signedIn = false;
    localStorage.setItem("tessle:stats:v1", JSON.stringify({ played: 7, won: 7, streak: 0, best: 7, hardWins: 0, fastest: 5, totalTime: 35, lastNumber: null, lastWon: null }));
    const { result } = renderHook(() => useTessle("daily"));
    await waitFor(() => expect(result.current.puzzle).not.toBeNull());
    act(() => result.current.giveUp());
    await waitFor(() => expect(result.current.stats).toMatchObject({ played: 8, won: 7 }));
    expect(server.plays.size).toBe(0);
    expect(server.calls.some((call) => call.startsWith("/api/hesap/kayitlar"))).toBe(false);
  });
});
