import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { JOKER } from "../src/board.ts";
import { chooseMove } from "../src/bot.ts";
import { apply, newGame } from "../src/game.ts";
import { Lexicon } from "../src/lexicon.ts";
import { NAME_WORDS, newSecret, playerName, publicId } from "../src/names.ts";
import { makeRules, TILE_SET } from "../src/rules.ts";
import { tableFromJson, tableToJson, unseenTiles, viewOf } from "../src/view.ts";

describe("a player's view", () => {
  const game = newGame("view", makeRules("view"), TILE_SET);

  it("shows one rack and how full the bag is, nothing more", () => {
    const table = viewOf(game, 1, "room:1");
    expect(table.rack).toEqual(game.racks[1]);
    expect(table.bagCount).toBe(game.bag.length);
    const json = JSON.stringify(tableToJson(table));
    expect(json).not.toContain("view:bag");
    expect(json).not.toContain('"seed"');
    expect(json).not.toContain('"bag"');
    expect(json).not.toContain(JSON.stringify(game.racks[0]));
    expect(table.finalRacks).toBeUndefined();
  });

  it("counts unseen tiles as the bag and the other rack, before and after moves", () => {
    const words = Lexicon.parse(readFileSync(new URL("../data/yaygin.txt", import.meta.url), "utf8"));
    let g = game;
    for (let turn = 0; turn < 6; turn++) {
      const expected = new Array(30).fill(0);
      for (const tile of [...g.bag, ...g.racks[1 - g.turn]]) expected[tile === JOKER ? 29 : tile]++;
      expect(unseenTiles(viewOf(g, g.turn), TILE_SET)).toEqual(expected);
      const outcome = apply(g, chooseMove(g, words, "zor"), words);
      if (!outcome.ok) throw new Error("refused");
      g = outcome.game;
    }
  });

  it("travels as JSON and comes back the same", () => {
    const table = viewOf(game, 0);
    expect(tableFromJson(JSON.parse(JSON.stringify(tableToJson(table))))).toEqual(table);
    expect(tableFromJson({})).toBeNull();
  });
});

describe("names", () => {
  it("come from the device, the same every time, and differ between devices", async () => {
    const secret = newSecret();
    const pub = await publicId(secret);
    expect(pub).toMatch(/^[0-9a-f]{64}$/);
    expect(playerName(pub)).toBe(playerName(await publicId(secret)));
    expect(playerName(pub)).toMatch(/^[A-ZÇĞİÖŞÜ][^#]+ #\d{4}$/u);
    const names = new Set<string>();
    for (let i = 0; i < 200; i++) names.add(playerName(await publicId(newSecret())));
    expect(names.size).toBe(200);
  });

  it("have plenty of words to draw from", () => {
    expect(NAME_WORDS.adjectives.length).toBeGreaterThanOrEqual(60);
    expect(NAME_WORDS.nouns.length).toBeGreaterThanOrEqual(60);
    expect(new Set(NAME_WORDS.adjectives).size).toBe(NAME_WORDS.adjectives.length);
    expect(new Set(NAME_WORDS.nouns).size).toBe(NAME_WORDS.nouns.length);
  });
});
