import { ALL_LETTERS, ALPHABET_SIZE } from "./alphabet.ts";
import {
  type Board,
  CENTER,
  type Direction,
  EMPTY,
  isEmptyBoard,
  JOKER,
  LETTER_FACTOR,
  type Placement,
  SIZE,
  SQUARES,
  WORD_FACTOR,
} from "./board.ts";
import type { Lexicon } from "./lexicon.ts";
import type { Rules } from "./score.ts";

/** A legal move the generator found. */
export interface Move {
  direction: Direction;
  placements: Placement[];
  /** The squares of the word along the line, start to end. */
  start: number;
  length: number;
  score: number;
}

/**
 * Every legal move for a rack: Appel & Jacobson's algorithm ("The World's
 * Fastest Scrabble Program", 1988) over a DAWG.
 *
 * Moves start from anchors — empty squares next to a tile, or the centre on
 * an empty board. For each line, the squares across it carry a cross-check: a
 * bitmask of the letters that would make a real word with the tiles above
 * and below. A word grows leftwards from the anchor (on squares no tile
 * touches, so anything goes), then rightwards through the anchor, taking
 * board tiles as they come and rack tiles only where the cross-check allows.
 * Down moves are the same thing with rows and columns swapped.
 *
 * A joker is only tried as a letter the rack doesn't hold. That misses the
 * odd move where the joker and the real tile could swap places for a few
 * more points, and saves a large share of the search.
 */
export function generateMoves(board: Board, rack: readonly number[], lexicon: Lexicon, rules: Rules): Move[] {
  const moves: Move[] = [];
  const counts = new Int8Array(ALPHABET_SIZE + 1);
  for (const tile of rack) counts[tile]++;
  const opening = isEmptyBoard(board);
  const anchors = new Uint8Array(SQUARES);
  if (opening) anchors[CENTER] = 1;
  else {
    for (let square = 0; square < SQUARES; square++) {
      if (board.cells[square] !== EMPTY) continue;
      const row = Math.floor(square / SIZE);
      const col = square % SIZE;
      if (
        (col > 0 && board.cells[square - 1] !== EMPTY) ||
        (col < SIZE - 1 && board.cells[square + 1] !== EMPTY) ||
        (row > 0 && board.cells[square - SIZE] !== EMPTY) ||
        (row < SIZE - 1 && board.cells[square + SIZE] !== EMPTY)
      ) {
        anchors[square] = 1;
      }
    }
  }
  for (const direction of ["across", "down"] as const) {
    generateLines(board, counts, lexicon, rules, anchors, direction, moves);
  }
  return moves;
}

function generateLines(
  board: Board,
  counts: Int8Array,
  lexicon: Lexicon,
  rules: Rules,
  anchors: Uint8Array,
  direction: Direction,
  moves: Move[],
): void {
  const { cells, joker: jokers } = board;
  const { values, layout } = rules;
  const across = direction === "across";
  /** Square number of position `pos` on line `line`. */
  const at = (line: number, pos: number): number => (across ? line * SIZE + pos : pos * SIZE + line);
  const crossStep = across ? SIZE : 1;
  const tileValue = (square: number): number => (jokers[square] ? 0 : values[cells[square]]);

  // Cross-checks: which letters may go on each empty square, and what the
  // tiles across it already score (-1 when there are none).
  const checks = new Int32Array(SQUARES).fill(ALL_LETTERS);
  const crossScore = new Int32Array(SQUARES).fill(-1);
  const before: number[] = [];
  for (let line = 0; line < SIZE; line++) {
    for (let pos = 0; pos < SIZE; pos++) {
      const square = at(line, pos);
      if (cells[square] !== EMPTY) continue;
      // Along the cross direction, `line` is the position.
      let start = line;
      while (start > 0 && cells[square + (start - 1 - line) * crossStep] !== EMPTY) start--;
      let end = line;
      while (end < SIZE - 1 && cells[square + (end + 1 - line) * crossStep] !== EMPTY) end++;
      if (start === line && end === line) continue;
      before.length = 0;
      let sum = 0;
      for (let k = start; k < line; k++) {
        const s = square + (k - line) * crossStep;
        before.push(cells[s]);
        sum += tileValue(s);
      }
      for (let k = line + 1; k <= end; k++) sum += tileValue(square + (k - line) * crossStep);
      crossScore[square] = sum;
      const node = lexicon.walk(before);
      let allowed = 0;
      if (node !== -1) {
        let options = lexicon.mask(node);
        while (options !== 0) {
          const letter = 31 - Math.clz32(options);
          options &= ~(1 << letter);
          let next = lexicon.child(node, letter);
          for (let k = line + 1; k <= end && next !== -1; k++) next = lexicon.child(next, cells[square + (k - line) * crossStep]);
          if (next !== -1 && lexicon.isWord(next)) allowed |= 1 << letter;
        }
      }
      checks[square] = allowed;
    }
  }

  const rackSize = rules.rackSize;
  // The word being built, by position on the line.
  const letterAt = new Int8Array(SIZE);
  const jokerAt = new Uint8Array(SIZE);
  const placedAt = new Uint8Array(SIZE);
  let placedCount = 0;
  let line = 0;
  let anchor = 0;

  const record = (start: number, end: number): void => {
    if (end - start < 2) return;
    // A lone tile also reads across the other way; across already found it.
    if (!across && placedCount === 1) {
      for (let pos = start; pos < end; pos++) {
        if (!placedAt[pos]) continue;
        const square = at(line, pos);
        const col = square % SIZE;
        if ((col > 0 && cells[square - 1] !== EMPTY) || (col < SIZE - 1 && cells[square + 1] !== EMPTY)) return;
      }
    }
    let sum = 0;
    let factor = 1;
    let crossTotal = 0;
    let star = 0;
    const placements: Placement[] = [];
    for (let pos = start; pos < end; pos++) {
      const square = at(line, pos);
      if (!placedAt[pos]) {
        sum += tileValue(square);
        continue;
      }
      const premium = layout[square];
      const points = (jokerAt[pos] ? 0 : values[letterAt[pos]]) * LETTER_FACTOR[premium];
      sum += points;
      factor *= WORD_FACTOR[premium];
      if (crossScore[square] >= 0) crossTotal += (crossScore[square] + points) * WORD_FACTOR[premium];
      if (square === rules.star) star = rules.starBonus;
      placements.push({ square, letter: letterAt[pos], joker: jokerAt[pos] === 1 });
    }
    moves.push({
      direction: across ? "across" : "down",
      placements,
      start: at(line, start),
      length: end - start,
      score: sum * factor + crossTotal + (placedCount === rackSize ? rules.bingo : 0) + star,
    });
  };

  /** Puts `letter` on `pos` from the rack (as a joker if `asJoker`), runs `then`, takes it back. */
  const withTile = (pos: number, letter: number, asJoker: boolean, then: () => void): void => {
    const tile = asJoker ? JOKER : letter;
    counts[tile]--;
    letterAt[pos] = letter;
    jokerAt[pos] = asJoker ? 1 : 0;
    placedAt[pos] = 1;
    placedCount++;
    then();
    placedCount--;
    placedAt[pos] = 0;
    counts[tile]++;
  };

  /** The letters the rack can supply right now, as a mask. */
  const rackMask = (): number => {
    if (counts[JOKER] > 0) return ALL_LETTERS;
    let mask = 0;
    for (let letter = 0; letter < ALPHABET_SIZE; letter++) if (counts[letter] > 0) mask |= 1 << letter;
    return mask;
  };

  /** Tries each letter of `mask` from the rack, real tiles first. */
  const eachTile = (mask: number, pos: number, go: (letter: number) => void): void => {
    while (mask !== 0) {
      const letter = 31 - Math.clz32(mask);
      mask &= ~(1 << letter);
      if (counts[letter] > 0) withTile(pos, letter, false, () => go(letter));
      else if (counts[JOKER] > 0) withTile(pos, letter, true, () => go(letter));
    }
  };

  const extendRight = (node: number, pos: number, start: number): void => {
    if (pos >= SIZE) {
      if (pos > anchor && lexicon.isWord(node)) record(start, pos);
      return;
    }
    const square = at(line, pos);
    if (cells[square] !== EMPTY) {
      const next = lexicon.child(node, cells[square]);
      if (next !== -1) extendRight(next, pos + 1, start);
      return;
    }
    if (pos > anchor && lexicon.isWord(node)) record(start, pos);
    if (placedCount === rackSize) return;
    eachTile(lexicon.mask(node) & checks[square] & rackMask(), pos, (letter) =>
      extendRight(lexicon.child(node, letter), pos + 1, start),
    );
  };

  // Left parts are built forwards from the root, then laid down ending just
  // before the anchor, so their positions are only known when they stop.
  const leftLetters = new Int8Array(SIZE);
  const leftJokers = new Uint8Array(SIZE);
  const leftPart = (node: number, length: number, limit: number): void => {
    const start = anchor - length;
    for (let i = 0; i < length; i++) {
      letterAt[start + i] = leftLetters[i];
      jokerAt[start + i] = leftJokers[i];
      placedAt[start + i] = 1;
    }
    extendRight(node, anchor, start);
    for (let i = 0; i < length; i++) placedAt[start + i] = 0;
    if (limit === 0 || placedCount === rackSize) return;
    let mask = lexicon.mask(node) & rackMask();
    while (mask !== 0) {
      const letter = 31 - Math.clz32(mask);
      mask &= ~(1 << letter);
      const asJoker = counts[letter] === 0;
      const tile = asJoker ? JOKER : letter;
      counts[tile]--;
      placedCount++;
      leftLetters[length] = letter;
      leftJokers[length] = asJoker ? 1 : 0;
      leftPart(lexicon.child(node, letter), length + 1, limit - 1);
      placedCount--;
      counts[tile]++;
    }
  };

  for (line = 0; line < SIZE; line++) {
    for (anchor = 0; anchor < SIZE; anchor++) {
      if (!anchors[at(line, anchor)]) continue;
      if (anchor > 0 && cells[at(line, anchor - 1)] !== EMPTY) {
        // The tiles to the left are the start of the word, as they are.
        let start = anchor - 1;
        while (start > 0 && cells[at(line, start - 1)] !== EMPTY) start--;
        let node = lexicon.root;
        for (let pos = start; pos < anchor && node !== -1; pos++) node = lexicon.child(node, cells[at(line, pos)]);
        if (node !== -1) extendRight(node, anchor, start);
      } else {
        // Empty squares no tile touches, back to the previous anchor.
        let limit = 0;
        while (anchor - limit - 1 >= 0 && !anchors[at(line, anchor - limit - 1)] && cells[at(line, anchor - limit - 1)] === EMPTY) {
          limit++;
        }
        leftPart(lexicon.root, 0, Math.min(limit, rackSize - 1));
      }
    }
  }
}
