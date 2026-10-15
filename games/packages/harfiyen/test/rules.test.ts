import { describe, expect, it } from "vitest";
import { encode } from "../src/alphabet.ts";
import { CENTER, Premium, SIZE, SQUARES } from "../src/board.ts";
import { generateLayout } from "../src/layout.ts";
import { seeded } from "../src/rng.ts";
import { classicLayout, makeRules, TILE_SET, VALUES } from "../src/rules.ts";

const count = (layout: Uint8Array, type: number): number => layout.filter((p) => p === type).length;
const rc = (square: number): [number, number] => [Math.floor(square / SIZE), square % SIZE];

/** The same layout turned and flipped every way the square allows. */
function symmetric(layout: Uint8Array): boolean {
  for (let square = 0; square < SQUARES; square++) {
    const [r, c] = rc(square);
    const images = [
      [c, r], [14 - r, c], [r, 14 - c], [14 - c, 14 - r],
    ];
    if (images.some(([rr, cc]) => layout[rr * SIZE + cc] !== layout[square])) return false;
  }
  return true;
}

describe("tiles", () => {
  it("are the Turkish hundred: 98 letters and 2 jokers", () => {
    expect(TILE_SET.counts.reduce((a, b) => a + b, 0)).toBe(98);
    expect(TILE_SET.jokers).toBe(2);
    expect(TILE_SET.counts[encode("a")![0]]).toBe(12);
    expect(VALUES[encode("j")![0]]).toBe(10);
    expect(VALUES[encode("ğ")![0]]).toBe(8);
    expect(VALUES.every((v) => v >= 1)).toBe(true);
  });
});

describe("the fixed board", () => {
  const layout = classicLayout();

  it("has the usual multipliers and a plain centre", () => {
    expect(count(layout, Premium.TripleWord)).toBe(8);
    expect(count(layout, Premium.DoubleWord)).toBe(8);
    expect(count(layout, Premium.TripleLetter)).toBe(8);
    expect(count(layout, Premium.DoubleLetter)).toBe(24);
    expect(layout[CENTER]).toBe(Premium.None);
    expect(symmetric(layout)).toBe(true);
    // Spot checks against the published board.
    expect(layout[2]).toBe(Premium.TripleWord);
    expect(layout[1 * SIZE + 1]).toBe(Premium.TripleLetter);
    expect(layout[2 * SIZE + 7]).toBe(Premium.DoubleWord);
    expect(layout[7 * SIZE + 2]).toBe(Premium.DoubleWord);
  });

  it("puts the ★ on a plain square off the centre lines, the same for the same seed", () => {
    const stars = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const { star, layout: board } = makeRules(`star-${i}`);
      const [r, c] = rc(star);
      expect(board[star]).toBe(Premium.None);
      expect(r === 7 || c === 7).toBe(false);
      expect(Math.max(Math.abs(r - 7), Math.abs(c - 7))).toBeGreaterThanOrEqual(2);
      stars.add(star);
    }
    expect(stars.size).toBeGreaterThan(30);
    expect(makeRules("same").star).toBe(makeRules("same").star);
  });
});

describe("shuffled boards", () => {
  const layouts = Array.from({ length: 300 }, (_, i) => generateLayout(seeded(`layout-${i}`)));

  it("always come out, with the fixed board's counts and all eight symmetries", () => {
    for (const layout of layouts) {
      expect(layout).not.toBeNull();
      expect(count(layout!, Premium.TripleWord)).toBe(8);
      expect(count(layout!, Premium.DoubleWord)).toBe(8);
      expect(count(layout!, Premium.TripleLetter)).toBe(8);
      expect(count(layout!, Premium.DoubleLetter)).toBe(24);
      expect(layout![CENTER]).toBe(Premium.None);
      expect(symmetric(layout!)).toBe(true);
    }
  });

  it("keep the rules", () => {
    for (const layout of layouts as Uint8Array[]) {
      for (let square = 0; square < SQUARES; square++) {
        const type = layout[square];
        if (type === Premium.None) continue;
        const [r, c] = rc(square);
        const ring = Math.min(r, c, 14 - r, 14 - c);
        if (type === Premium.TripleWord) expect(ring).toBeLessThanOrEqual(2);
        // Nothing side by side.
        if (c < 14) expect(layout[square + 1]).toBe(Premium.None);
        if (r < 14) expect(layout[square + SIZE]).toBe(Premium.None);
        const word = (p: number): boolean => p === Premium.DoubleWord || p === Premium.TripleWord;
        if (word(type)) {
          expect((r === 7 && Math.abs(c - 7) < 5) || (c === 7 && Math.abs(r - 7) < 5)).toBe(false);
          for (let k = c + 1; k < SIZE; k++) {
            const other = layout[r * SIZE + k];
            if (word(other)) expect(k - c).toBeGreaterThanOrEqual(type === Premium.TripleWord || other === Premium.TripleWord ? 7 : 6);
          }
        }
      }
    }
  });

  it("follow the seed, and differ between seeds", () => {
    expect(generateLayout(seeded("x"))).toEqual(generateLayout(seeded("x")));
    const distinct = new Set(layouts.map((layout) => layout!.join("")));
    expect(distinct.size).toBeGreaterThan(250);
  });

  it("are what a shuffled game gets", () => {
    const rules = makeRules("game-1", "karisik");
    expect(rules.layout).toEqual(generateLayout(seeded("game-1:layout")));
    expect(makeRules("game-1", "klasik").layout).toEqual(classicLayout());
  });
});
