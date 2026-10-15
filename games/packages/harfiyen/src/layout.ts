import { CENTER, Premium, SIZE, SQUARES } from "./board.ts";
import { type Random, shuffle } from "./rng.ts";

/**
 * A fresh board for every game: the same multipliers as the fixed board
 * (8 K³, 8 K², 8 H³, 24 H²), scattered by the seed but still a board that
 * plays fair.
 *
 * Squares come in orbits under the board's eight symmetries — turn it a
 * quarter, flip it — so a multiplier placed on one square goes on all of its
 * orbit, four or eight squares at once, and every side of the board gets the
 * same chances. Types go down rarest-hurting first (K³, K², H³, H²), each
 * into orbits in seeded order, skipping any that break a rule:
 *
 * 1. K³ only near the edge (within three of it); K² and H³ off the outermost
 *    ring and out of the middle.
 * 2. No two multipliers side by side.
 * 3. Word multipliers in one row or column sit far apart — at least seven
 *    squares if either is a K³, six for two K²s — so no ordinary word
 *    catches two of them.
 * 4. The opening word can't reach a word multiplier: none on the centre row
 *    or column within five of the centre.
 * 5. No H³ touching a K³, even corner to corner, so a heavy letter can't be
 *    tripled twice in one go.
 * 6. No two of a kind corner to corner either: multipliers spread out
 *    rather than clump.
 *
 * Under ten attempts on average; if every attempt failed (none has in
 * testing), the fixed board is the answer.
 */
const COUNTS: [Premium, number][] = [
  [Premium.TripleWord, 8],
  [Premium.DoubleWord, 8],
  [Premium.TripleLetter, 8],
  [Premium.DoubleLetter, 24],
];

const ATTEMPTS = 500;

const at = (row: number, col: number): number => row * SIZE + col;

/** Each square's orbit under the eight symmetries of the square board, the centre left out. */
const ORBITS: number[][] = (() => {
  const seen = new Set<number>();
  const orbits: number[][] = [];
  const last = SIZE - 1;
  for (let square = 0; square < SQUARES; square++) {
    if (square === CENTER || seen.has(square)) continue;
    const r = Math.floor(square / SIZE);
    const c = square % SIZE;
    const images = [
      [r, c], [c, r], [last - r, c], [r, last - c],
      [last - r, last - c], [last - c, r], [c, last - r], [last - c, last - r],
    ];
    const orbit = [...new Set(images.map(([row, col]) => at(row, col)))].sort((a, b) => a - b);
    orbit.forEach((s) => seen.add(s));
    orbits.push(orbit);
  }
  return orbits;
})();

const ring = (square: number): number => {
  const r = Math.floor(square / SIZE);
  const c = square % SIZE;
  return Math.min(r, c, SIZE - 1 - r, SIZE - 1 - c);
};

const isWord = (premium: number): boolean => premium === Premium.DoubleWord || premium === Premium.TripleWord;

function allowed(layout: Uint8Array, type: Premium, orbit: readonly number[]): boolean {
  const inOrbit = new Set(orbit);
  const premiumAt = (square: number): number => (inOrbit.has(square) ? type : layout[square]);
  for (const square of orbit) {
    if (layout[square] !== Premium.None) return false;
    const r = Math.floor(square / SIZE);
    const c = square % SIZE;
    const depth = ring(square);
    // 1. Where each kind may go.
    if (type === Premium.TripleWord && depth > 2) return false;
    if ((type === Premium.DoubleWord || type === Premium.TripleLetter) && (depth < 1 || depth > 6)) return false;
    // 2. Nothing side by side.
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && premiumAt(at(rr, cc)) !== Premium.None) return false;
    }
    if (isWord(type)) {
      // 3. Word multipliers far apart along a line.
      for (let k = 0; k < SIZE; k++) {
        for (const other of [at(r, k), at(k, c)]) {
          if (other === square || !isWord(premiumAt(other))) continue;
          const distance = Math.abs(k - (other === at(r, k) ? c : r));
          const need = type === Premium.TripleWord || premiumAt(other) === Premium.TripleWord ? 7 : 6;
          if (distance < need) return false;
        }
      }
      // 4. Out of the opening word's reach.
      if ((r === 7 && Math.abs(c - 7) < 5) || (c === 7 && Math.abs(r - 7) < 5)) return false;
    }
    // 5 and 6. Corner to corner: no H³ against a K³, nothing against its own kind.
    const against =
      type === Premium.TripleLetter ? Premium.TripleWord : type === Premium.TripleWord ? Premium.TripleLetter : -1;
    for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || rr >= SIZE || cc < 0 || cc >= SIZE) continue;
      const near = premiumAt(at(rr, cc));
      if (near === type || near === against) return false;
    }
  }
  return true;
}

/** A board for the seed's stream, or null if no attempt worked out. */
export function generateLayout(random: Random): Uint8Array | null {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const layout = new Uint8Array(SQUARES);
    let complete = true;
    for (const [type, count] of COUNTS) {
      let need = count;
      for (const orbit of shuffle([...ORBITS], random)) {
        if (need === 0) break;
        if (orbit.length > need || !allowed(layout, type, orbit)) continue;
        for (const square of orbit) layout[square] = type;
        need -= orbit.length;
      }
      if (need > 0) {
        complete = false;
        break;
      }
    }
    if (complete) return layout;
  }
  return null;
}
