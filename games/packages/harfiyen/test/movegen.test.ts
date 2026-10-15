import { describe, expect, it } from "vitest";
import { decode, encode, LETTERS } from "../src/alphabet.ts";
import { type Board, CENTER, copyBoard, emptyBoard, JOKER, type Placement, SIZE, SQUARES } from "../src/board.ts";
import { Lexicon } from "../src/lexicon.ts";
import { generateMoves, type Move } from "../src/movegen.ts";
import { readPlay } from "../src/play.ts";
import { seeded, below } from "../src/rng.ts";
import type { Rules } from "../src/score.ts";

const WORDS = [
  "at", "ata", "atak", "ak", "akı", "an", "ana", "anı", "kat", "kata", "kan", "kana", "ka", "ma", "mat",
  "masa", "mas", "ama", "tam", "tamam", "kama", "kamu", "bak", "baka", "kalem", "el", "elma", "al", "ala",
  "kal", "kale", "lale", "le", "nal", "nam", "sak", "saka", "sat", "satı", "tas", "tasa", "su", "ses", "bu",
  "kuş", "şu", "iş", "işçi", "çiş", "çay", "ay", "aya", "yay", "yaş", "kaş", "taş", "aşk", "ıl", "kıl", "kılık",
];

/** Varied values and a lopsided layout, so a wrong multiplier shows. */
function testRules(): Rules {
  const random = seeded("layout");
  const layout = new Uint8Array(SQUARES);
  for (let i = 0; i < SQUARES; i++) layout[i] = below(random, 5);
  // The ★ sits where the tests play, two left of the centre.
  return { values: LETTERS.map((_, i) => 1 + (i % 7)), layout, bingo: 30, rackSize: 7, star: CENTER - 2, starBonus: 25 };
}

const rack = (letters: string): number[] =>
  [...letters].map((char) => (char === "?" ? JOKER : encode(char)![0]));

function place(board: Board, word: string, row: number, col: number, down = false, jokers: number[] = []): void {
  encode(word)!.forEach((letter, i) => {
    const square = down ? (row + i) * SIZE + col : row * SIZE + col + i;
    board.cells[square] = letter;
    if (jokers.includes(i)) board.joker[square] = 1;
  });
}

const key = (move: { placements: readonly Placement[] }): string =>
  move.placements
    .map((p) => `${p.square}:${p.letter}${p.joker ? "?" : ""}`)
    .sort()
    .join(" ");

/** Every way to put up to `max` rack tiles in one line, checked by the rules — slow, but obviously right. */
function bruteForce(board: Board, tiles: number[], lexicon: Lexicon, rules: Rules, max: number): Map<string, number> {
  const found = new Map<string, number>();
  const empty = [...Array(SQUARES).keys()].filter((s) => board.cells[s] === -1);
  const tryLine = (squares: number[]): void => {
    // Choose a contiguous window of empty squares in this line, then letters for it.
    const free = squares.filter((s) => board.cells[s] === -1);
    for (let i = 0; i < free.length; i++) {
      for (let j = i; j < Math.min(free.length, i + max); j++) {
        const spots = free.slice(i, j + 1);
        const assign = (k: number, used: boolean[], chosen: Placement[]): void => {
          if (k === spots.length) {
            const reading = readPlay(board, chosen, rules, lexicon);
            if (reading.ok) found.set(key({ placements: chosen }), reading.play.score);
            return;
          }
          const tried = new Set<string>();
          tiles.forEach((tile, t) => {
            if (used[t]) return;
            const options = tile === JOKER ? LETTERS.map((_, l) => l) : [tile];
            for (const letter of options) {
              const id = `${tile}-${letter}`;
              if (tried.has(id)) continue;
              tried.add(id);
              // As the generator does: a joker only for a letter the rack lacks.
              if (tile === JOKER && tiles.some((other, o) => !used[o] && o !== t && other === letter)) continue;
              used[t] = true;
              assign(k + 1, used, [...chosen, { square: spots[k], letter, joker: tile === JOKER }]);
              used[t] = false;
            }
          });
        };
        assign(0, [], []);
      }
    }
  };
  for (let r = 0; r < SIZE; r++) tryLine([...Array(SIZE).keys()].map((c) => r * SIZE + c));
  for (let c = 0; c < SIZE; c++) tryLine([...Array(SIZE).keys()].map((r) => r * SIZE + c));
  void empty;
  return found;
}

describe("lexicon", () => {
  const lexicon = Lexicon.fromWords(WORDS);

  it("knows exactly its words", () => {
    for (const word of WORDS) expect(lexicon.hasWord(word)).toBe(true);
    for (const word of ["a", "atk", "kalemi", "", "xyz", "işç"]) expect(lexicon.hasWord(word)).toBe(false);
    const listed = [...lexicon.list()].map(decode).sort();
    expect(listed).toEqual([...new Set(WORDS)].sort());
  });

  it("shares tails", () => {
    const trie = new Set<string>();
    for (const word of WORDS) for (let i = 0; i <= word.length; i++) trie.add(word.slice(0, i));
    expect(lexicon.nodes).toBeLessThan(trie.size);
  });

  it("tells dotted from dotless i", () => {
    const small = Lexicon.fromWords(["ırmak", "irmik"]);
    expect(small.hasWord("IRMAK")).toBe(true);
    expect(small.hasWord("İRMİK")).toBe(true);
    expect(small.hasWord("irmak")).toBe(false);
    expect(small.hasWord("kâğıt")).toBe(false);
    expect(Lexicon.fromWords(["kâğıt"]).hasWord("kağıt")).toBe(true);
  });
});

describe("move generator", () => {
  const lexicon = Lexicon.fromWords(WORDS);
  const rules = testRules();

  const check = (board: Board, tiles: number[], max = 3): Move[] => {
    const moves = generateMoves(board, tiles, lexicon, rules);
    const keys = new Set<string>();
    for (const move of moves) {
      const reading = readPlay(board, move.placements, rules, lexicon);
      expect(reading.ok, `${key(move)} should be legal`).toBe(true);
      if (reading.ok) expect(move.score, key(move)).toBe(reading.play.score);
      expect(keys.has(key(move)), `${key(move)} found twice`).toBe(false);
      keys.add(key(move));
    }
    const brute = bruteForce(board, tiles, lexicon, rules, max);
    for (const [found, score] of brute) {
      expect(keys.has(found), `missed ${found}`).toBe(true);
      void score;
    }
    // Moves with more tiles than the brute force tried are fine; fewer must all match.
    const small = moves.filter((m) => m.placements.length <= max);
    expect(small.length).toBe(brute.size);
    return moves;
  };

  it("opens through the centre", () => {
    const moves = check(emptyBoard(), rack("katmas"), 4);
    expect(moves.length).toBeGreaterThan(0);
    for (const move of moves) expect(move.placements.some((p) => p.square === CENTER)).toBe(true);
  });

  it("builds on the board, across and down", () => {
    const board = emptyBoard();
    place(board, "kalem", 7, 5);
    place(board, "elma", 4, 8, true);
    check(board, rack("atsnaı"), 3);
  });

  it("plays jokers as any missing letter, for nothing", () => {
    const board = emptyBoard();
    place(board, "masa", 7, 6, false, [2]);
    const moves = check(board, rack("k?t"), 3);
    expect(moves.some((m) => m.placements.some((p) => p.joker))).toBe(true);
  });

  it("agrees with the rules on random boards", () => {
    const random = seeded("boards");
    for (let round = 0; round < 6; round++) {
      // Grow a board by playing random legal moves.
      const board = emptyBoard();
      for (let turn = 0; turn < 5; turn++) {
        const tiles = Array.from({ length: 7 }, () => encode("aakltmnsıeiuşçy"[below(random, 15)])![0]);
        const moves = generateMoves(board, tiles, lexicon, rules);
        if (moves.length === 0) continue;
        const move = moves[below(random, moves.length)];
        for (const p of move.placements) {
          board.cells[p.square] = p.letter;
          board.joker[p.square] = p.joker ? 1 : 0;
        }
      }
      check(copyBoard(board), rack("akat?l"), 2);
    }
  });
});
