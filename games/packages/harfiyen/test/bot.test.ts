import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { encode } from "../src/alphabet.ts";
import { JOKER } from "../src/board.ts";
import { chooseMove, leaveValue, type Level } from "../src/bot.ts";
import { apply, type Game, newGame } from "../src/game.ts";
import { Lexicon } from "../src/lexicon.ts";
import { makeRules, TILE_SET } from "../src/rules.ts";

const read = (name: string): Lexicon => Lexicon.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), "utf8"));
const full = read("kelimeler.txt");
const wide = read("zor.txt");
const common = read("yaygin.txt");
const easy = read("kolay.txt");
const words: Record<Level, Lexicon> = { kolay: easy, orta: common, zor: wide };

/** Two computers play a whole game; every move must stand up to the full dictionary. */
function selfPlay(seed: string, levels: [Level, Level], kind: "klasik" | "karisik" = "klasik"): Game {
  let game = newGame(seed, makeRules(seed, kind), TILE_SET);
  for (let turn = 0; !game.over; turn++) {
    if (turn > 200) throw new Error("game never ended");
    const level = levels[game.turn];
    const action = chooseMove(game, words[level], level);
    const outcome = apply(game, action, full);
    if (!outcome.ok) throw new Error(`illegal ${action.kind}: ${JSON.stringify(outcome.refusal)}`);
    if (outcome.turn.kind === "play") {
      for (const word of outcome.turn.words) expect(words[level].hasWord(word), word).toBe(true);
    }
    game = outcome.game;
  }
  return game;
}

describe("the computer", () => {
  it("plays whole games of legal, everyday words at every level", () => {
    for (const [i, levels] of ([["kolay", "orta"], ["orta", "zor"], ["zor", "kolay"]] as [Level, Level][]).entries()) {
      const game = selfPlay(`self-${i}`, levels, i === 2 ? "karisik" : "klasik");
      expect(game.over).not.toBeNull();
      expect(game.log.filter((t) => t.kind === "play").length).toBeGreaterThan(10);
    }
  }, 30_000);

  it("plays the same move for the same game", () => {
    const game = newGame("same", makeRules("same"), TILE_SET);
    expect(chooseMove(game, common, "orta")).toEqual(chooseMove(game, common, "orta"));
  });

  it("is stronger the harder it's set", () => {
    let zor = 0;
    let kolay = 0;
    for (let i = 0; i < 6; i++) {
      const game = selfPlay(`strength-${i}`, i % 2 ? ["zor", "kolay"] : ["kolay", "zor"]);
      zor += game.scores[i % 2 ? 0 : 1];
      kolay += game.scores[i % 2 ? 1 : 0];
    }
    expect(zor).toBeGreaterThan(kolay);
  }, 30_000);

  it("swaps when it has no word, and passes when the bag is too low", () => {
    const game = newGame("stuck", makeRules("stuck"), TILE_SET);
    game.racks[0] = encode("ğğjjvvf")!;
    expect(chooseMove(game, easy, "kolay").kind).toBe("swap");
    expect(chooseMove({ ...game, bag: game.bag.slice(0, 3) }, easy, "kolay").kind).toBe("pass");
  });

  it("values a balanced rack with a joker over a clumsy one", () => {
    expect(leaveValue([JOKER, ...encode("ake")!])).toBeGreaterThan(leaveValue(encode("ğjvv")!));
  });
});

describe("the computer's jokers", () => {
  it("plays a lone joker rather than pass when it's all it has", () => {
    const opening = newGame("joker-end", makeRules("joker-end"), TILE_SET);
    opening.racks[0] = encode("kalemat")!;
    const kalem = encode("kalem")!.map((letter, i) => ({ square: 7 * 15 + 5 + i, letter, joker: false }));
    const outcome = apply(opening, { kind: "play", placements: kalem }, full);
    if (!outcome.ok) throw new Error("opening refused");
    const game = { ...outcome.game, bag: [], racks: [outcome.game.racks[0], [JOKER]] };
    for (const level of ["kolay", "orta", "zor"] as Level[]) expect(chooseMove(game, words[level], level).kind).toBe("play");
  });
});
