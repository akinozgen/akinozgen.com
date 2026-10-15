import { encode } from "./alphabet.ts";
import { Premium, SQUARES } from "./board.ts";
import type { TileSet } from "./game.ts";
import { generateLayout } from "./layout.ts";
import { below, type Random, seeded } from "./rng.ts";
import type { Rules } from "./score.ts";

/** Tile counts and points, letter by letter in alphabet order: 98 letters and 2 jokers. */
const TILES: Record<string, [count: number, points: number]> = {
  a: [12, 1], b: [2, 3], c: [2, 4], ç: [2, 4], d: [2, 3], e: [8, 1], f: [1, 7], g: [1, 5], ğ: [1, 8],
  h: [1, 5], ı: [4, 2], i: [7, 1], j: [1, 10], k: [7, 1], l: [7, 1], m: [4, 2], n: [5, 1], o: [3, 2],
  ö: [1, 7], p: [1, 5], r: [6, 1], s: [3, 2], ş: [2, 4], t: [5, 1], u: [3, 2], ü: [2, 3], v: [1, 7],
  y: [2, 3], z: [2, 4],
};

const byLetter = (pick: (entry: [number, number]) => number): number[] => {
  const out: number[] = [];
  for (const [letter, entry] of Object.entries(TILES)) out[encode(letter)![0]] = pick(entry);
  return out;
};

export const VALUES: readonly number[] = byLetter(([, points]) => points);
export const TILE_SET: TileSet = { counts: byLetter(([count]) => count), jokers: 2 };

/**
 * The board Turkish players know, fixed from game to game and not Scrabble's: one quarter
 * drawn and mirrored both ways. T = K³, D = K², t = H³, d = H². The centre
 * has no multiplier; it is only where the first word must go.
 */
const QUARTER = [
  "..T..d..",
  ".t....d.",
  "T......D",
  "...D....",
  "....t...",
  "d....d..",
  ".d....d.",
  "..D.....",
];

const CODES: Record<string, Premium> = {
  ".": Premium.None,
  d: Premium.DoubleLetter,
  t: Premium.TripleLetter,
  D: Premium.DoubleWord,
  T: Premium.TripleWord,
};

export function classicLayout(): Uint8Array {
  const layout = new Uint8Array(SQUARES);
  for (let row = 0; row < 15; row++) {
    for (let col = 0; col < 15; col++) {
      const r = row <= 7 ? row : 14 - row;
      const c = col <= 7 ? col : 14 - col;
      layout[row * 15 + col] = CODES[QUARTER[r][c]];
    }
  }
  return layout;
}

/**
 * Where the game's ★ goes: a plain square, off the centre row and column so
 * the opening word can't take it, two or more steps from the centre and not
 * against a multiplier — somewhere a word has to be steered to.
 */
export function placeStar(layout: Uint8Array, random: Random): number {
  const candidates: number[] = [];
  for (let square = 0; square < SQUARES; square++) {
    const row = Math.floor(square / 15);
    const col = square % 15;
    if (row === 7 || col === 7 || layout[square] !== Premium.None) continue;
    if (Math.max(Math.abs(row - 7), Math.abs(col - 7)) < 2) continue;
    const neighbours = [square - 15, square + 15, col > 0 ? square - 1 : -1, col < 14 ? square + 1 : -1];
    if (neighbours.some((n) => n >= 0 && n < SQUARES && layout[n] !== Premium.None)) continue;
    candidates.push(square);
  }
  return candidates[below(random, candidates.length)];
}

/** All seven tiles in one move. */
export const BINGO = 30;
/** A word laid over the game's ★ square. */
export const STAR_BONUS = 25;
export const RACK_SIZE = 7;

/** The fixed board everyone knows, or a new one for every game. */
export type BoardKind = "klasik" | "karisik";

/** The rules for a new game: the board kind's layout, with this game's ★ placed by its seed. */
export function makeRules(seed: string, kind: BoardKind = "klasik"): Rules {
  const shuffled = kind === "karisik" ? generateLayout(seeded(`${seed}:layout`)) : null;
  const layout = shuffled ?? classicLayout();
  return {
    board: shuffled ? "karisik" : "klasik",
    values: VALUES,
    layout,
    bingo: BINGO,
    rackSize: RACK_SIZE,
    star: placeStar(layout, seeded(`${seed}:star`)),
    starBonus: STAR_BONUS,
  };
}

/** The usual rules on the fixed board. */
export const classicRules = (seed: string): Rules => makeRules(seed, "klasik");
