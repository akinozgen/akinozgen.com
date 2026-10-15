/** The board is 15 × 15; squares are numbered row by row, 0–224. */
export const SIZE = 15;
export const SQUARES = SIZE * SIZE;
export const CENTER = 7 * SIZE + 7;

/** A tile on the rack: a letter index, or the joker. */
export const JOKER = 29;

export const EMPTY = -1;

/** What a square does to what's put on it, the first time only. */
export const Premium = {
  None: 0,
  /** H²: the letter counts double. */
  DoubleLetter: 1,
  /** H³: the letter counts three times. */
  TripleLetter: 2,
  /** K²: the whole word counts double. */
  DoubleWord: 3,
  /** K³: the whole word counts three times. */
  TripleWord: 4,
} as const;
export type Premium = (typeof Premium)[keyof typeof Premium];

export const LETTER_FACTOR = [1, 2, 3, 1, 1] as const;
export const WORD_FACTOR = [1, 1, 1, 2, 3] as const;

export interface Board {
  /** A letter index on each square, or EMPTY. */
  cells: Int8Array;
  /** 1 where the tile is a joker standing in for that letter: it scores nothing. */
  joker: Uint8Array;
}

export const emptyBoard = (): Board => ({ cells: new Int8Array(SQUARES).fill(EMPTY), joker: new Uint8Array(SQUARES) });

export const copyBoard = (board: Board): Board => ({ cells: board.cells.slice(), joker: board.joker.slice() });

export const isEmptyBoard = (board: Board): boolean => board.cells.every((cell) => cell === EMPTY);

export const rowOf = (square: number): number => Math.floor(square / SIZE);
export const colOf = (square: number): number => square % SIZE;
export const squareAt = (row: number, col: number): number => row * SIZE + col;

/** One tile put down this turn. */
export interface Placement {
  square: number;
  letter: number;
  joker: boolean;
}

/** Across moves read left to right; down moves top to bottom. */
export type Direction = "across" | "down";

/** Steps along a line and across it, in square numbers. */
export const STEP = { across: 1, down: SIZE } as const;

/** Whether `square + step` stays on the board along that direction. */
export function inLine(square: number, step: number, offset: number): boolean {
  if (step === 1) {
    const col = colOf(square) + offset;
    return col >= 0 && col < SIZE;
  }
  const row = rowOf(square) + offset;
  return row >= 0 && row < SIZE;
}
