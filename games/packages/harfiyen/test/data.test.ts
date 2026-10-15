import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { encode } from "../src/alphabet.ts";
import { Lexicon } from "../src/lexicon.ts";

const lines = (name: string): string[] =>
  readFileSync(new URL(`../data/${name}`, import.meta.url), "utf8").split("\n").filter(Boolean);
const full = lines("kelimeler.txt");
const wide = lines("zor.txt");
const common = lines("yaygin.txt");
const easy = lines("kolay.txt");
const lexicon = Lexicon.fromWords(full);

describe("the word lists", () => {
  it("hold only 2–15 Turkish letters a word, no repeats", () => {
    for (const list of [full, wide, common, easy]) {
      expect(new Set(list).size).toBe(list.length);
      for (const word of list) {
        const letters = encode(word);
        expect(letters, word).not.toBeNull();
        expect(letters!.length, word).toBeGreaterThanOrEqual(2);
        expect(letters!.length, word).toBeLessThanOrEqual(15);
      }
    }
    expect(full.length).toBeGreaterThan(60_000);
  });

  it("nest: easy words are everyday words, everyday words are the hard level's, all are playable", () => {
    const everyday = new Set(common);
    const hard = new Set(wide);
    for (const word of easy) expect(everyday.has(word), word).toBe(true);
    for (const word of common) expect(hard.has(word), word).toBe(true);
    for (const word of wide) expect(lexicon.hasWord(word), word).toBe(true);
    expect(common.length).toBeGreaterThan(8000);
    expect(easy.length).toBeGreaterThan(4000);
  });

  it("take infinitives, not stems; countries; no inflections", () => {
    for (const word of ["gelmek", "kalem", "türkiye", "almanya", "kağıt", "kar", "go", "jak", "pi", "ev"]) {
      expect(lexicon.hasWord(word), word).toBe(true);
    }
    for (const word of ["gel", "evler", "kalemler", "geldi", "a", "o", "abd"]) expect(lexicon.hasWord(word), word).toBe(false);
  });

  it("keep odd words out of the computer's mouth", () => {
    const everyday = new Set(common);
    const hard = new Set(wide);
    for (const word of ["re", "se", "jul", "yakin", "ırz", "aksam", "kuşlar", "kapıda", "batman", "seks", "porno"]) {
      expect(hard.has(word), word).toBe(false);
    }
    expect(hard.has("dolar")).toBe(true);
    for (const word of ["ev", "su", "kalem", "gelmek", "masa"]) expect(everyday.has(word), word).toBe(true);
  });
});
