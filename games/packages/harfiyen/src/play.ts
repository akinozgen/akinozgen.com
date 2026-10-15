import {
  type Board,
  CENTER,
  colOf,
  type Direction,
  EMPTY,
  inLine,
  isEmptyBoard,
  type Placement,
  rowOf,
  SIZE,
  SQUARES,
  STEP,
} from "./board.ts";
import type { Lexicon } from "./lexicon.ts";
import { type Rules, type Word, wordScore } from "./score.ts";

/** Why tiles can't go down as they are. */
export type Problem =
  | { kind: "nothing" }
  | { kind: "taken" }
  | { kind: "line" }
  | { kind: "gap" }
  | { kind: "center" }
  | { kind: "short" }
  | { kind: "detached" }
  | { kind: "words"; words: Word[] };

export interface Play {
  direction: Direction;
  /** The word along the line the tiles were laid in, first; then every word they make across it. */
  words: Word[];
  /** Words not in the dictionary; empty when the move is legal. */
  unknown: Word[];
  bingo: boolean;
  /** A tile went down on the ★. */
  star: boolean;
  score: number;
}

export type Reading = { ok: true; play: Play } | { ok: false; problem: Problem; play?: Play };

const filled = (board: Board, placed: ReadonlyMap<number, Placement>, square: number): boolean =>
  board.cells[square] !== EMPTY || placed.has(square);

/** The run of tiles through `square` along `step`, ends included. */
function run(board: Board, placed: ReadonlyMap<number, Placement>, square: number, step: number): number[] {
  let start = square;
  while (inLine(start, step, -1) && filled(board, placed, start - step)) start -= step;
  const squares: number[] = [];
  for (let at = start; ; at += step) {
    squares.push(at);
    if (!inLine(at, step, 1) || !filled(board, placed, at + step)) break;
  }
  return squares;
}

const lettersOf = (board: Board, placed: ReadonlyMap<number, Placement>, squares: readonly number[]): number[] =>
  squares.map((square) => placed.get(square)?.letter ?? board.cells[square]);

/**
 * Reads a move: are the tiles in one line, with no gap, touching what's
 * there (or on the centre, first)? Which words does it make, and what do they
 * score? Words missing from `lexicon` come back in `unknown`, and with them
 * the problem — the score is still worked out, so the player can see it.
 */
export function readPlay(board: Board, tiles: readonly Placement[], rules: Rules, lexicon: Lexicon): Reading {
  if (tiles.length === 0) return { ok: false, problem: { kind: "nothing" } };
  const placed = new Map<number, Placement>();
  for (const tile of tiles) {
    if (tile.square < 0 || tile.square >= SQUARES || board.cells[tile.square] !== EMPTY || placed.has(tile.square)) {
      return { ok: false, problem: { kind: "taken" } };
    }
    placed.set(tile.square, tile);
  }

  const squares = [...placed.keys()].sort((a, b) => a - b);
  const sameRow = squares.every((square) => rowOf(square) === rowOf(squares[0]));
  const sameCol = squares.every((square) => colOf(square) === colOf(squares[0]));
  if (!sameRow && !sameCol) return { ok: false, problem: { kind: "line" } };

  // One tile reads across if it has a neighbour there, down otherwise.
  const first = squares[0];
  const direction: Direction =
    squares.length > 1
      ? sameRow
        ? "across"
        : "down"
      : (inLine(first, 1, -1) && board.cells[first - 1] !== EMPTY) || (inLine(first, 1, 1) && board.cells[first + 1] !== EMPTY)
        ? "across"
        : "down";
  const step = STEP[direction];
  const cross = step === 1 ? SIZE : 1;

  const last = squares[squares.length - 1];
  for (let at = first; at <= last; at += step) {
    if (!filled(board, placed, at)) return { ok: false, problem: { kind: "gap" } };
  }

  const opening = isEmptyBoard(board);
  if (opening && !placed.has(CENTER)) return { ok: false, problem: { kind: "center" } };
  const main = run(board, placed, first, step);
  if (opening && main.length < 2) return { ok: false, problem: { kind: "short" } };
  if (!opening) {
    const touches = squares.some((square) =>
      ([1, SIZE] as const).some(
        (s) =>
          (inLine(square, s, -1) && board.cells[square - s] !== EMPTY) ||
          (inLine(square, s, 1) && board.cells[square + s] !== EMPTY),
      ),
    );
    if (!touches) return { ok: false, problem: { kind: "detached" } };
  }

  const runs: number[][] = [];
  if (main.length > 1) runs.push(main);
  for (const square of squares) {
    const across = run(board, placed, square, cross);
    if (across.length > 1) runs.push(across);
  }
  const words: Word[] = runs.map((line) => ({
    squares: line,
    letters: lettersOf(board, placed, line),
    score: wordScore(board, line, placed, rules),
  }));
  const bingo = tiles.length === rules.rackSize;
  const star = placed.has(rules.star);
  const play: Play = {
    direction,
    words,
    unknown: words.filter((word) => !lexicon.has(word.letters)),
    bingo,
    star,
    score: words.reduce((sum, word) => sum + word.score, 0) + (bingo ? rules.bingo : 0) + (star ? rules.starBonus : 0),
  };
  if (play.unknown.length > 0) return { ok: false, problem: { kind: "words", words: play.unknown }, play };
  return { ok: true, play };
}
