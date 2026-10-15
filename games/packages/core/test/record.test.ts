import { describe, expect, it } from "vitest";
import {
  dailyPuzzle,
  isPrefix,
  judgeRecorded,
  listOf,
  type PlayRules,
  type PlayStore,
  RECORD_CONFLICT,
  type Reply,
  roundNumber,
  sameJson,
  type StoredPlay,
} from "../src/record.ts";

/** A toy game: guesses are letters, the round is over at "z" or after three. */
interface Moves {
  g: string[];
}
type Result = { won: boolean; guesses: number };

const rulesFor = (query: URLSearchParams): PlayRules<Moves, Result> => ({
  puzzle: "d:2026-10-16",
  moves: { g: listOf(query.get("g")) },
  extend: (stored, incoming) => (!stored || isPrefix(stored.g, incoming.g) ? incoming : null),
  same: (stored, incoming) => sameJson(stored.g, incoming.g),
  replay: (moves) => new URLSearchParams({ g: moves.g.join(",") }),
  result: (verdict) => {
    const { guesses, over, won } = verdict as { guesses: string[]; over: boolean; won: boolean };
    return over ? { won, guesses: guesses.length } : null;
  },
});

const judges: string[] = [];
const judge = async (query: URLSearchParams): Promise<Reply> => {
  const guesses = listOf(query.get("g"));
  judges.push(guesses.join(","));
  if (guesses.includes("!")) return { status: 400, body: { error: "bad guess" }, cache: "no-store" };
  const won = guesses.at(-1) === "z";
  return { status: 200, body: { guesses, won, over: won || guesses.length >= 3 }, cache: "private, max-age=86400" };
};

/** One play in memory, counting writes. */
function memory(initial: StoredPlay<Moves> | null = null) {
  let play = initial;
  const writes: Array<{ moves: Moves; result: Result | null }> = [];
  const store: PlayStore<Moves, Result> = {
    load: async () => play,
    save: async (moves, result) => {
      writes.push({ moves, result });
      if (play?.finishedAt != null) return;
      play = { moves, finishedAt: result ? 1 : null };
    },
  };
  return { store, writes, current: () => play };
}

const ask = (g: string, store: PlayStore<Moves, Result>) => {
  const query = new URLSearchParams(g ? { g } : {});
  return judgeRecorded(rulesFor(query), store, judge, query);
};

describe("a signed-in player's request", () => {
  it("starts a play the first time a puzzle is opened, and keeps each guess", async () => {
    const { store, writes, current } = memory();
    const opened = await ask("", store);
    expect(opened.status).toBe(200);
    expect(opened.cache).toBe("no-store");
    expect(writes).toEqual([{ moves: { g: [] }, result: null }]);

    await ask("a", store);
    expect(current()).toEqual({ moves: { g: ["a"] }, finishedAt: null });
  });

  it("writes nothing when the moves haven't changed", async () => {
    const { store, writes } = memory({ moves: { g: ["a"] }, finishedAt: null });
    expect((await ask("a", store)).status).toBe(200);
    expect(writes).toEqual([]);
  });

  it("is refused, with the moves on record, when it would take a guess back", async () => {
    const { store, writes } = memory({ moves: { g: ["a", "b"] }, finishedAt: null });
    for (const stale of ["", "a", "a,c"]) {
      const reply = await ask(stale, store);
      expect(reply.status).toBe(409);
      expect(reply.body).toEqual({ error: RECORD_CONFLICT, moves: { g: ["a", "b"] } });
    }
    expect(writes).toEqual([]);
  });

  it("writes the result with the move that ends the puzzle", async () => {
    const { store, writes } = memory({ moves: { g: ["a"] }, finishedAt: null });
    await ask("a,z", store);
    expect(writes).toEqual([{ moves: { g: ["a", "z"] }, result: { won: true, guesses: 2 } }]);
  });

  it("never opens a finished puzzle again", async () => {
    const { store, writes } = memory({ moves: { g: ["a", "z"] }, finishedAt: 1 });
    judges.length = 0;
    const same = await ask("a,z", store);
    expect(same.status).toBe(200);
    expect(same.body).toMatchObject({ guesses: ["a", "z"], won: true });
    // Longer, shorter or different: each is told what is on record, and nothing is judged.
    for (const other of ["a,z,b", "a", ""]) expect((await ask(other, store)).status).toBe(409);
    expect(judges).toEqual(["a,z"]);
    expect(writes).toEqual([]);
  });

  it("writes nothing for a request the game turns away", async () => {
    const { store, writes } = memory();
    expect((await ask("!", store)).status).toBe(400);
    expect(writes).toEqual([]);
  });

  it("is still answered when the store fails", async () => {
    const failing: PlayStore<Moves, Result> = {
      load: async () => {
        throw new Error("D1 down");
      },
      save: async () => {},
    };
    const errors: unknown[] = [];
    const query = new URLSearchParams({ g: "a" });
    const reply = await judgeRecorded(rulesFor(query), failing, judge, query, (error) => errors.push(error));
    // As for a player who isn't signed in: the game's own reply, its own cache.
    expect(reply).toMatchObject({ status: 200, cache: "private, max-age=86400" });
    expect(errors).toHaveLength(1);

    const unwritable: PlayStore<Moves, Result> = {
      load: async () => null,
      save: async () => {
        throw new Error("D1 full");
      },
    };
    expect((await judgeRecorded(rulesFor(query), unwritable, judge, query, (error) => errors.push(error))).status).toBe(200);
    expect(errors).toHaveLength(2);
  });
});

describe("the helpers", () => {
  it("read puzzles, rounds and lists as the APIs do", () => {
    expect(dailyPuzzle("2026-10-16")).toBe("d:2026-10-16");
    expect(dailyPuzzle("16.10.2026")).toBeNull();
    expect(dailyPuzzle(null)).toBeNull();
    expect(roundNumber("4294967295")).toBe(4294967295);
    expect(roundNumber("4294967296")).toBeNull();
    expect(roundNumber("-1")).toBeNull();
    expect(listOf("a,,b")).toEqual(["a", "b"]);
    expect(listOf(null)).toEqual([]);
  });

  it("compare moves", () => {
    expect(isPrefix(["a"], ["a", "b"])).toBe(true);
    expect(isPrefix(["b"], ["a", "b"])).toBe(false);
    expect(isPrefix([1.5], [1.5, 2])).toBe(true);
    expect(sameJson({ g: ["a"], s: false }, { g: ["a"], s: false })).toBe(true);
    expect(sameJson({ g: ["a"], s: false }, { g: ["a"], s: true })).toBe(false);
    expect(sameJson([1], { 0: 1 })).toBe(false);
  });
});
