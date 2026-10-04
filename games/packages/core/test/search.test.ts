import { describe, expect, it } from "vitest";
import { bestMatches, matchRank } from "../src/search.ts";

const places = [
  { label: "Fransız Guyanası", own: "fransiz guyanasi", others: ["french guiana", "guayana francesa", "guyane francaise"] },
  { label: "Guatemala", own: "guatemala", others: ["guatemala"] },
  { label: "Gine", own: "gine", others: ["guinea", "guinee"] },
  { label: "Kuzey Kore", own: "kuzey kore", others: ["north korea"] },
];
const find = (needle: string) => bestMatches(places, needle, (p) => p, 6, "tr").map((p) => p.label);

describe("matching a typed name", () => {
  it("puts the player's own language ahead of another's", () => {
    // French Guiana's Spanish name starts "gua"; Guatemala's Turkish one does too.
    expect(find("gua")[0]).toBe("Guatemala");
    expect(find("gua")).toContain("Fransız Guyanası");
  });

  it("ranks exact, then prefix, then word, then elsewhere", () => {
    expect(matchRank("guatemala", "guatemala", [])).toBe(0);
    expect(matchRank("gua", "guatemala", [])).toBe(1);
    expect(matchRank("kor", "kuzey kore", [])).toBe(2);
    expect(matchRank("gua", "fransiz guyanasi", ["guayana francesa"])).toBe(3);
    expect(matchRank("xyz", "guatemala", [])).toBeNull();
  });

  it("finds a place by a word inside its name", () => {
    expect(find("kore")).toEqual(["Kuzey Kore"]);
  });
});
