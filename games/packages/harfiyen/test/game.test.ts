import { describe, expect, it } from "vitest";
import { encode } from "../src/alphabet.ts";
import { CENTER, JOKER, type Placement, SIZE } from "../src/board.ts";
import { type Action, apply, type Game, IDLE_HARD_LIMIT, newGame, nextIdleEnds } from "../src/game.ts";
import { Lexicon } from "../src/lexicon.ts";
import { classicRules, TILE_SET, VALUES } from "../src/rules.ts";
import { loadGame, saveGame } from "../src/save.ts";

const lexicon = Lexicon.fromWords(["kalem", "elma", "el", "masa", "at", "kat", "ata", "ama", "tam", "kale", "ek"]);
const L = (word: string): number[] => encode(word)!;
const v = (word: string): number => L(word).reduce((sum, l) => sum + VALUES[l], 0);

/** A game whose first rack is the given letters, with the ★ out of the way. */
function setUp(rack: string, other = "aaaaaaa"): Game {
  const game = newGame("test", { ...classicRules("test"), star: 0 }, TILE_SET);
  game.racks = [L(rack).concat([]), L(other)];
  return game;
}

const across = (word: string, row: number, col: number, jokers: number[] = []): Placement[] =>
  L(word).map((letter, i) => ({ square: row * SIZE + col + i, letter, joker: jokers.includes(i) }));

function must(game: Game, action: Action): Game {
  const outcome = apply(game, action, lexicon);
  if (!outcome.ok) throw new Error(`refused: ${JSON.stringify(outcome.refusal)}`);
  return outcome.game;
}

describe("a new game", () => {
  it("deals seven each from a shuffled bag of a hundred", () => {
    const game = newGame("deal", classicRules("deal"), TILE_SET);
    expect(game.racks.map((r) => r.length)).toEqual([7, 7]);
    expect(game.bag.length).toBe(86);
    const all = [...game.bag, ...game.racks.flat()];
    expect(all.filter((t) => t === JOKER).length).toBe(2);
    expect(newGame("deal", classicRules("deal"), TILE_SET)).toEqual(game);
    expect(newGame("other", classicRules("other"), TILE_SET).bag).not.toEqual(game.bag);
  });
});

describe("playing a word", () => {
  it("scores the opening word, draws back up and passes the turn", () => {
    const game = setUp("kalemaa");
    const next = must(game, { kind: "play", placements: across("kalem", 7, 5) });
    // Row 7 from column 5 to 9 holds no multiplier on the fixed board.
    expect(next.scores[0]).toBe(v("kalem"));
    expect(next.racks[0].length).toBe(7);
    expect(next.bag.length).toBe(game.bag.length - 5);
    expect(next.turn).toBe(1);
    expect(next.log[0]).toMatchObject({ kind: "play", words: ["kalem"], bingo: false, star: false });
    // The old game is untouched.
    expect(game.board.cells[CENTER]).toBe(-1);
    expect(game.scores[0]).toBe(0);
  });

  it("refuses what the rules don't allow", () => {
    const game = setUp("kalemat");
    const refuse = (placements: Placement[]) => {
      const outcome = apply(game, { kind: "play", placements }, lexicon);
      return outcome.ok ? null : outcome.refusal.kind;
    };
    expect(refuse(across("kalem", 3, 3))).toBe("center");
    expect(refuse(across("klm", 7, 6))).toBe("words");
    expect(refuse([...across("ka", 7, 6), ...across("em", 7, 9)])).toBe("gap");
    expect(refuse([{ square: CENTER, letter: L("k")[0], joker: false }, { square: CENTER + SIZE + 1, letter: L("a")[0], joker: false }])).toBe("line");
    expect(refuse(across("masa", 7, 5))).toBe("rack");
    expect(refuse([])).toBe("nothing");
  });

  it("must touch what's on the board after the first word", () => {
    let game = must(setUp("kalemaa", "elmaata"), { kind: "play", placements: across("kalem", 7, 5) });
    expect(apply(game, { kind: "play", placements: across("elma", 2, 2) }, lexicon)).toMatchObject({
      ok: false,
      refusal: { kind: "detached" },
    });
    // Down from the E of KALEM: E-L-M-A, three new tiles.
    const down = L("lma").map((letter, i) => ({ square: (8 + i) * SIZE + 8, letter, joker: false }));
    game = must(game, { kind: "play", placements: down });
    expect(game.log[1]).toMatchObject({ kind: "play", words: ["elma"] });
  });

  it("counts a joker as nothing", () => {
    const game = setUp("kaleaa");
    game.racks[0] = [...L("kale"), JOKER, ...L("aa")];
    const next = must(game, { kind: "play", placements: across("kalem", 7, 5, [4]) });
    expect(next.scores[0]).toBe(v("kale"));
    expect(next.board.joker[7 * SIZE + 9]).toBe(1);
    expect(next.log[0]).toMatchObject({ words: ["kalem"], jokers: [4] });
  });

  it("adds 30 for all seven tiles and 25 for the ★, once each", () => {
    const words = Lexicon.fromWords(["kalemat"]);
    const game = setUp("kalemat");
    game.rules = { ...game.rules, star: 7 * SIZE + 4 };
    const outcome = apply(game, { kind: "play", placements: across("kalemat", 7, 4) }, words);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.turn).toMatchObject({ bingo: true, star: true });
    // Row 7 has a K² at column 2 and 12, none under 4..10: plain letters.
    expect(outcome.game.scores[0]).toBe(v("kalemat") + 30 + 25);
  });
});

describe("swapping and passing", () => {
  it("swaps tiles for as many from the bag, keeping the bag's size", () => {
    const game = setUp("kalemat");
    const next = must(game, { kind: "swap", tiles: L("ka") });
    expect(next.bag.length).toBe(game.bag.length);
    expect(next.racks[0].length).toBe(7);
    expect(next.idle).toBe(1);
    expect(next.log[0]).toEqual({ player: 0, kind: "swap", count: 2 });
  });

  it("won't swap from a bag of fewer than seven, or tiles you lack", () => {
    const game = setUp("kalemat");
    expect(apply(game, { kind: "swap", tiles: L("zz") }, lexicon)).toMatchObject({ ok: false, refusal: { kind: "rack" } });
    expect(apply({ ...game, bag: game.bag.slice(0, 6) }, { kind: "swap", tiles: L("k") }, lexicon)).toMatchObject({
      ok: false,
      refusal: { kind: "bag" },
    });
  });

  it("ends after four idle turns once the bag is under twenty, scores as they stand", () => {
    let game = setUp("kalemat");
    game = { ...game, bag: game.bag.slice(0, 19), scores: [40, 30] };
    for (let i = 0; i < 3; i++) {
      expect(nextIdleEnds(game.idle, game.bag.length)).toBe(false);
      game = must(game, { kind: "pass" });
    }
    expect(game.over).toBeNull();
    expect(nextIdleEnds(game.idle, game.bag.length)).toBe(true);
    game = must(game, { kind: "pass" });
    expect(game.over).toEqual({ reason: "stuck", winner: 0, leftovers: [0, 0] });
    expect(game.scores).toEqual([40, 30]);
    expect(apply(game, { kind: "pass" }, lexicon)).toMatchObject({ ok: false, refusal: { kind: "over" } });
  });

  it("goes on through idle turns with a full bag, up to a limit", () => {
    let game = setUp("kalemat");
    for (let i = 0; i < IDLE_HARD_LIMIT - 1; i++) game = must(game, { kind: "pass" });
    expect(game.over).toBeNull();
    game = must(game, { kind: "pass" });
    expect(game.over?.reason).toBe("stuck");
  });

  it("starts the count again after a word", () => {
    let game = setUp("kalemat");
    game = { ...game, bag: game.bag.slice(0, 10) };
    game = must(game, { kind: "pass" });
    game = must(game, { kind: "pass" });
    game = must(game, { kind: "play", placements: across("kalem", 7, 5) });
    expect(game.idle).toBe(0);
  });
});

describe("the end", () => {
  it("going out takes the other rack's points from them and gives them to you", () => {
    let game = setUp("at", "kalemaa");
    game = { ...game, bag: [] };
    game.racks[0] = L("at");
    game = must(game, { kind: "play", placements: across("at", 7, 7) });
    const left = v("kalemaa");
    expect(game.over).toEqual({ reason: "out", winner: 0, leftovers: [left, -left] });
    expect(game.scores).toEqual([v("at") + left, -left]);
  });

  it("resigning hands the game over, even out of turn", () => {
    const game = must(setUp("kalemat"), { kind: "resign" });
    expect(game.over).toMatchObject({ reason: "resign", winner: 1 });
    const early = apply(setUp("kalemat"), { kind: "resign" }, lexicon, 1);
    expect(early.ok && early.game.over).toMatchObject({ reason: "resign", winner: 0 });
    expect(apply(setUp("kalemat"), { kind: "pass" }, lexicon, 1)).toMatchObject({ ok: false, refusal: { kind: "turn" } });
  });
});

describe("saving", () => {
  it("comes back exactly as it was", () => {
    const game = must(setUp("kalemat"), { kind: "play", placements: across("kalem", 7, 5) });
    const back = loadGame(saveGame(game));
    expect(back).toEqual(game);
    expect(back!.board.cells).toBeInstanceOf(Int8Array);
    expect(loadGame("{nope")).toBeNull();
    expect(loadGame("{}")).toBeNull();
  });
});

describe("two browsers", () => {
  it("agree on everything given the same seed and the same actions", () => {
    const play = (): Game => {
      let game = newGame("shared", classicRules("shared"), TILE_SET);
      game = must(game, { kind: "swap", tiles: game.racks[0].slice(0, 3) });
      game = must(game, { kind: "pass" });
      return game;
    };
    expect(play()).toEqual(play());
  });
});
