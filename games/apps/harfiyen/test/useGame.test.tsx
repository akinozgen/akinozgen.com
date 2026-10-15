import { classicLayout, encode, JOKER, makeRules, newGame, saveGame, SIZE, TILE_SET } from "@harfiyen/engine";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { type Lexicons, loadLexicons } from "../src/game/lexicons.ts";
import { BOT, HUMAN, useGame } from "../src/game/useGame.ts";

let lexicons: Lexicons;
beforeAll(async () => {
  lexicons = await loadLexicons();
});
afterEach(() => vi.useRealTimers());

const CENTRE_ROW = 7 * SIZE;

/** Starts the hook on a saved game whose rack holds `rack` ("?" for a joker). */
function start(rack: string) {
  const game = newGame("hook-test", makeRules("hook-test"), TILE_SET);
  game.racks[HUMAN] = [...rack].map((char) => (char === "?" ? JOKER : encode(char)![0]));
  localStorage.setItem(
    "harfiyen:game:v1",
    JSON.stringify({ game: saveGame(game), level: "kolay", view: game.racks[HUMAN] }),
  );
  return renderHook(() => useGame(lexicons));
}

describe("the game hook", () => {
  it("reads the tiles laid down, plays them, and the computer answers", () => {
    vi.useFakeTimers();
    const { result } = start("kalemat");
    // K-A-L-E-M across the centre, from the rack's first five slots.
    act(() => {
      for (let i = 0; i < 5; i++) result.current.place(i, CENTRE_ROW + 5 + i);
    });
    expect(result.current.reading?.ok).toBe(true);
    const score = result.current.reading?.play?.score;
    expect(score).toBeGreaterThan(0);
    expect(result.current.free).toEqual([5, 6]);

    act(() => result.current.submit());
    expect(result.current.game.scores[HUMAN]).toBe(score);
    expect(result.current.game.turn).toBe(BOT);
    expect(result.current.draft).toEqual([]);
    // The two tiles left keep their order at the front of the rack.
    expect(result.current.view.slice(0, 2)).toEqual(encode("at"));
    expect(result.current.view).toHaveLength(7);

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.game.log).toHaveLength(2);
    expect(result.current.game.turn).toBe(HUMAN);
  });

  it("names a word the dictionary lacks, and won't play it", () => {
    const { result } = start("klmkaaa");
    act(() => {
      result.current.place(0, CENTRE_ROW + 6);
      result.current.place(1, CENTRE_ROW + 7);
      result.current.place(2, CENTRE_ROW + 8);
    });
    const reading = result.current.reading!;
    expect(reading.ok).toBe(false);
    expect(reading.ok === false && reading.problem.kind).toBe("words");
    act(() => result.current.submit());
    expect(result.current.game.log).toHaveLength(0);
  });

  it("waits for a joker to be named, then scores it as nothing", () => {
    const { result } = start("ev?aaaa");
    act(() => {
      result.current.place(0, CENTRE_ROW + 7);
      result.current.place(2, CENTRE_ROW + 8);
    });
    expect(result.current.reading).toBeNull();
    act(() => result.current.nameJoker(CENTRE_ROW + 8, encode("v")![0]));
    expect(result.current.reading?.ok).toBe(true);
    expect(result.current.reading?.play?.score).toBe(1);
  });

  it("moves and takes back tiles", () => {
    const { result } = start("kalemat");
    act(() => {
      result.current.place(0, CENTRE_ROW + 7);
      result.current.move(CENTRE_ROW + 7, CENTRE_ROW + 8);
    });
    expect(result.current.draft.map((d) => d.square)).toEqual([CENTRE_ROW + 8]);
    act(() => result.current.recall(CENTRE_ROW + 8));
    expect(result.current.draft).toEqual([]);
    act(() => {
      result.current.place(0, CENTRE_ROW + 7);
      result.current.place(1, CENTRE_ROW + 8);
      result.current.recallAll();
    });
    expect(result.current.free).toHaveLength(7);
  });

  it("swaps tiles, and passes the turn", () => {
    const { result } = start("ğğjjvvf");
    act(() => result.current.swap([0, 1, 2]));
    expect(result.current.game.turn).toBe(BOT);
    expect(result.current.game.log[0]).toMatchObject({ kind: "swap", count: 3 });
    expect(result.current.view).toHaveLength(7);
  });

  it("lets the player resign while the computer thinks", () => {
    vi.useFakeTimers();
    const { result } = start("kalemat");
    act(() => {
      for (let i = 0; i < 5; i++) result.current.place(i, CENTRE_ROW + 5 + i);
    });
    act(() => result.current.submit());
    act(() => result.current.resign());
    expect(result.current.game.over).toMatchObject({ reason: "resign", winner: BOT });
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.game.log).toHaveLength(2);
  });

  it("starts a new game on a shuffled board when asked, and remembers it", () => {
    const { result } = start("kalemat");
    act(() => result.current.restart("zor", "karisik"));
    expect(result.current.level).toBe("zor");
    expect(result.current.boardKind).toBe("karisik");
    expect([...result.current.game.rules.layout]).not.toEqual([...classicLayout()]);
    expect(result.current.game.log).toHaveLength(0);
    act(() => result.current.restart("kolay"));
    expect(result.current.boardKind).toBe("karisik");
  });

  it("takes turns at going first, game by game", () => {
    vi.useFakeTimers();
    const { result } = start("kalemat");
    expect(result.current.game.turn).toBe(HUMAN);
    act(() => result.current.restart("kolay"));
    expect(result.current.game.first).toBe(BOT);
    // The computer opens on its own.
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.game.log).toHaveLength(1);
    expect(result.current.game.log[0].player).toBe(BOT);
    act(() => result.current.restart("kolay"));
    expect(result.current.game.first).toBe(HUMAN);
  });
});
