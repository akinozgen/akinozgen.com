import { type Board, EMPTY, LETTER_FACTOR, type Placement, WORD_FACTOR } from "./board.ts";

/** The things a game is played under: tile values, the board's squares, the bonus for a full rack. */
export interface Rules {
  /** Points per letter index; a joker scores 0 whatever it stands for. */
  values: readonly number[];
  /** A Premium code per square. */
  layout: Uint8Array;
  /** Added when all seven tiles go down in one move. */
  bingo: number;
  rackSize: number;
  /** The game's ★ square, -1 for none: a move that puts a tile on it gains `starBonus`, once. */
  star: number;
  starBonus: number;
  /** Which board: the fixed one or one scattered by the seed. Games saved before this was kept are fixed. */
  board?: "klasik" | "karisik";
}

/** A word a move makes, with what it scored. */
export interface Word {
  squares: number[];
  letters: number[];
  score: number;
}

/**
 * A word's points: each letter's value, multiplied by a letter square only if
 * the tile was put down this turn, then the word squares under new tiles.
 */
export function wordScore(board: Board, squares: readonly number[], placed: ReadonlyMap<number, Placement>, rules: Rules): number {
  let sum = 0;
  let factor = 1;
  for (const square of squares) {
    const tile = placed.get(square);
    if (tile) {
      const premium = rules.layout[square];
      sum += (tile.joker ? 0 : rules.values[tile.letter]) * LETTER_FACTOR[premium];
      factor *= WORD_FACTOR[premium];
    } else if (board.cells[square] !== EMPTY && !board.joker[square]) {
      sum += rules.values[board.cells[square]];
    }
  }
  return sum * factor;
}
