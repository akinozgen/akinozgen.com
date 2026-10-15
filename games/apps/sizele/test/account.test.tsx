import { resetAccountCache, resetRecordsCache } from "@akinozgen/account/client";
import { ROUNDS } from "@sizele/data/client";
import { dailyRounds, handleSizele } from "@sizele/data/server";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { type FakeAccount, fakeAccount, finished } from "../../../packages/core/test/fakeAccount.ts";
import { sizeleRules } from "../../../packages/sizele/src/record.ts";
import { short } from "../src/game/api.ts";
import { numberFor, useSizele } from "../src/game/useSizele.ts";
import { TEST_SEED } from "./setup.ts";

/** A signed-in player: the game and the record are the account's, kept by the (fake) server. */

const DAY = "2026-10-08";
const BEFORE = "2026-10-07";
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${DAY}T12:00:00`));
});
afterAll(() => vi.useRealTimers());

const pairs = await dailyRounds(TEST_SEED, numberFor(DAY));
/** Each round's truth, as the slider would send it. */
const truth = pairs.map((pair) => Number(short(pair.ratio)));

let server: FakeAccount;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetAccountCache();
  resetRecordsCache();
  server = fakeAccount({ game: "sizele", rules: sizeleRules, judge: (action, query) => handleSizele(action, query, TEST_SEED) });
  vi.stubGlobal("fetch", server.fetch);
});

describe("signed in", () => {
  it("takes up a game begun on another device, every round it has dealt included", async () => {
    server.plays.set(`d:${DAY}`, { moves: { g: truth.slice(0, 2) }, result: null, startedAt: 1, finishedAt: null });
    const { result } = renderHook(() => useSizele("daily"));
    await waitFor(() => expect(result.current.results).toHaveLength(2));
    expect(result.current.rounds.map((round) => round.unit.id)).toEqual(pairs.slice(0, 3).map((pair) => pair.unit));
    expect(result.current.showing).toBe(2);
    expect(result.current.over).toBe(false);
    // Taken up, it claims no hard mode: that is the other device's to say.
    expect(result.current.hardAll).toBe(false);
  });

  it("shows a game finished elsewhere as finished, and the record as the server's", async () => {
    localStorage.setItem("sizele:stats:v1", JSON.stringify({ played: 99, points: 99, best: 99, streak: 99, longest: 99, greats: 99, lastNumber: null }));
    server.imported = { stats: { daily: null, endless: null }, importedAt: 1 };
    server.plays.set(`d:${BEFORE}`, finished({ g: [1, 1, 1, 1, 1] }, { total: 300, greats: 2 }, 10, 20));
    server.plays.set(`d:${DAY}`, finished({ g: truth }, { total: 500, greats: 5 }, 30, 40));
    const { result } = renderHook(() => useSizele("daily"));
    await waitFor(() => expect(result.current.over).toBe(true));
    expect(result.current.rounds).toHaveLength(ROUNDS);
    await waitFor(() => expect(result.current.stats).toMatchObject({ played: 2, points: 800, best: 500, streak: 2, longest: 2, greats: 7 }));
    expect(result.current.imported).toBe(0);
  });

  it("keeps each guess, and the server's total once the game is over", async () => {
    const { result } = renderHook(() => useSizele("daily"));
    for (let round = 0; round < ROUNDS; round++) {
      await waitFor(() => expect(result.current.current).not.toBeNull());
      await waitFor(() => expect(result.current.pending).toBe(false));
      act(() => result.current.guess(truth[round]));
      await waitFor(() => expect(result.current.results).toHaveLength(round + 1));
      act(() => result.current.advance());
    }
    await waitFor(() => expect(server.plays.get(`d:${DAY}`)?.result).toEqual({ total: 500, greats: 5 }));
    await waitFor(() => expect(result.current.stats).toMatchObject({ played: 1, points: 500 }));
  });

  it("sends this device's record once, and counts on from it", async () => {
    const before = { played: 4, points: 1200, best: 410, streak: 1, longest: 3, greats: 6, lastNumber: numberFor(DAY) - 1 };
    localStorage.setItem("sizele:stats:v1", JSON.stringify(before));
    server.plays.set(`d:${DAY}`, finished({ g: truth }, { total: 500, greats: 5 }, 30, 40));
    const first = renderHook(() => useSizele("daily"));
    await waitFor(() => expect(server.imported).not.toBeNull());
    expect(server.imported?.stats).toEqual({ daily: before, endless: null });
    await waitFor(() => expect(first.result.current.stats).toMatchObject({ played: 5, points: 1700, best: 500, streak: 2, greats: 11 }));
    expect(first.result.current.imported).toBe(4);

    first.unmount();
    resetRecordsCache();
    const second = renderHook(() => useSizele("daily"));
    await waitFor(() => expect(second.result.current.imported).toBe(4));
    expect(server.imports).toHaveLength(1);
  });
});

describe("signed out", () => {
  it("plays and keeps its record in the browser, as before accounts", async () => {
    server.signedIn = false;
    localStorage.setItem("sizele:stats:v1", JSON.stringify({ played: 7, points: 7, best: 7, streak: 0, longest: 7, greats: 0, lastNumber: null }));
    const { result } = renderHook(() => useSizele("daily"));
    for (let round = 0; round < ROUNDS; round++) {
      await waitFor(() => expect(result.current.current).not.toBeNull());
      await waitFor(() => expect(result.current.pending).toBe(false));
      act(() => result.current.guess(truth[round]));
      await waitFor(() => expect(result.current.results).toHaveLength(round + 1));
      act(() => result.current.advance());
    }
    await waitFor(() => expect(result.current.stats).toMatchObject({ played: 8, points: 507 }));
    expect(server.plays.size).toBe(0);
    expect(server.calls.some((call) => call.startsWith("/api/hesap/kayitlar"))).toBe(false);
  });
});
