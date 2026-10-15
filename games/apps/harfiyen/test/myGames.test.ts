import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  forgetGame,
  groupGames,
  KEEP_OVER,
  mergeSummaries,
  type MyGame,
  rememberGame,
  summaryOf,
  useMyGames,
  waitingOn,
} from "../src/game/myGames.ts";
import { api, roomInfo, summary, tableFor } from "./fakes.ts";

const IDENTITY = { secret: "0123456789abcdef0123456789abcdef", pub: "ab", tag: "0001", base: "Ali", fallback: "Ali", chosen: null, name: "Ali #0001" };

const game = (code: string, changes: Parameters<typeof summary>[1] = {}, added = 0): MyGame => {
  const s = summary(code, changes);
  return { code, added, summary: s.gone ? null : s };
};

describe("the list of games", () => {
  it("takes the server's newer summaries, keeps a newer one of its own, and drops rooms that are gone", () => {
    const games = [game("AAAAAA", { updatedAt: 10 }), game("BBBBBB", { updatedAt: 50, scores: [1, 1] }), game("CCCCCC"), game("DDDDDD")];
    const merged = mergeSummaries(games, [
      summary("AAAAAA", { updatedAt: 20, scores: [40, 2] }),
      summary("BBBBBB", { updatedAt: 40, scores: [9, 9] }),
      { code: "CCCCCC", gone: true },
    ]);
    expect(merged.map((g) => g.code)).toEqual(["AAAAAA", "BBBBBB", "DDDDDD"]);
    expect(merged[0].summary?.scores).toEqual([40, 2]);
    expect(merged[1].summary?.scores).toEqual([1, 1]);
  });

  it("counts the games waiting on this player, for the badge", () => {
    const games = [
      game("AAAAAA", { you: 0, turn: 0 }),
      game("BBBBBB", { you: 1, turn: 1 }),
      game("CCCCCC", { you: 0, turn: 1 }),
      game("DDDDDD", { phase: "over", turn: null }),
      game("EEEEEE", { phase: "waiting", turn: null }),
    ];
    expect(waitingOn(games)).toBe(2);
  });

  it("groups them: your turn, theirs, invitations, the ten latest finished", () => {
    const over = Array.from({ length: 12 }, (_, i) => game(`OVER${String.fromCharCode(65 + i)}${String.fromCharCode(65 + i)}`, { phase: "over", turn: null, updatedAt: i }));
    const groups = groupGames([game("AAAAAA", { turn: 0 }), game("BBBBBB", { turn: 1 }), game("CCCCCC", { phase: "waiting" }), ...over]);
    expect(groups.yours.map((g) => g.code)).toEqual(["AAAAAA"]);
    expect(groups.theirs.map((g) => g.code)).toEqual(["BBBBBB"]);
    expect(groups.invites.map((g) => g.code)).toEqual(["CCCCCC"]);
    expect(groups.over).toHaveLength(KEEP_OVER);
    expect(groups.over[0].summary?.updatedAt).toBe(11);
  });

  it("remembers rooms in this browser, newest news winning, and lets finished ones go past ten", () => {
    rememberGame("AAAAAA");
    rememberGame("AAAAAA", summaryOf(roomInfo({ code: "AAAAAA", updatedAt: 5 }), null));
    rememberGame("AAAAAA", summaryOf(roomInfo({ code: "AAAAAA", updatedAt: 3, phase: "over" }), null));
    let stored = JSON.parse(localStorage.getItem("harfiyen:online:v1")!) as MyGame[];
    expect(stored).toHaveLength(1);
    expect(stored[0].summary?.updatedAt).toBe(5);
    for (let i = 0; i < 12; i++) {
      const code = `OVER${String.fromCharCode(65 + i)}${String.fromCharCode(65 + i)}`;
      rememberGame(code, summaryOf(roomInfo({ code, phase: "over", updatedAt: 100 + i }), null));
    }
    stored = JSON.parse(localStorage.getItem("harfiyen:online:v1")!) as MyGame[];
    expect(stored.filter((g) => g.summary?.phase === "over")).toHaveLength(KEEP_OVER);
    expect(stored.some((g) => g.code === "AAAAAA")).toBe(true);
    forgetGame("AAAAAA");
    expect((JSON.parse(localStorage.getItem("harfiyen:online:v1")!) as MyGame[]).some((g) => g.code === "AAAAAA")).toBe(false);
  });

  it("a room's own state becomes its summary", () => {
    const s = summaryOf(roomInfo({ you: 1 }), (() => {
      const t = tableFor(1);
      return { ...(t as object), turn: 1, scores: [3, 4], over: null } as never;
    })());
    expect(s).toMatchObject({ code: "K7Q2XM", phase: "playing", you: 1, turn: 1, scores: [3, 4], winner: null });
  });

  it("asks the server about every room on mount, and again when the tab comes back", async () => {
    rememberGame("AAAAAA");
    rememberGame("BBBBBB");
    const asked: unknown[] = [];
    api.set("GET /api/harfiyen/ozet", (body) => {
      asked.push(body);
      return { body: { rooms: [summary("AAAAAA", { turn: 0 }), { code: "BBBBBB", gone: true }] } };
    });
    const { result } = renderHook(() => useMyGames(IDENTITY));
    await waitFor(() => expect(result.current.games.map((g) => g.code)).toEqual(["AAAAAA"]));
    expect(asked[0]).toEqual({ v: 1, secret: IDENTITY.secret, codes: ["AAAAAA", "BBBBBB"] });
    expect(result.current.waiting).toBe(1);

    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(asked).toHaveLength(2));
  });

  it("keeps what it had when the server can't be reached", async () => {
    rememberGame("AAAAAA", summary("AAAAAA", { turn: 0 }) as never);
    api.set("GET /api/harfiyen/ozet", () => ({ status: 503, body: { error: "kapali" } }));
    const { result } = renderHook(() => useMyGames(IDENTITY));
    await waitFor(() => expect(result.current.stale).toBe(true));
    expect(result.current.games).toHaveLength(1);
    expect(result.current.waiting).toBe(1);
  });
});
