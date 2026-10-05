/** Languages tessle is played in. English is the canonical one. */
export const LANGUAGES = ["en", "tr", "de", "ru", "es"] as const;
export type Language = (typeof LANGUAGES)[number];

/** The finished map's longer side, in board units. Every piece is drawn to this scale. */
export const MAP_SIZE = 1000;

/** One turn of a piece. Twelve of them go all the way round. */
export const STEP_DEGREES = 30;
export const STEPS = 360 / STEP_DEGREES;

/**
 * How close two pieces must be to fit, in screen pixels. The browser says
 * how many board units one of its pixels covers, so a phone showing the
 * whole board small gets the same feel as a desktop; the server clamps it.
 */
export const SNAP_PX = 10;
export const UNITS_PER_PX = { min: 0.4, max: 4 } as const;

/**
 * One country, cut out. Its rings are flat [x0, y0, x1, y1, …] lists in
 * board units, around the piece's own centre, and already turned by a
 * number of steps only the server knows: nothing in the shape says which
 * way is north. Rings are filled even-odd, so holes need no flag.
 */
export interface Piece {
  rings: number[][];
  /** Where the name sits, in the same frame as the rings. */
  label: [number, number];
  /** The region it is. Left out in hard mode, until the round is over. */
  id?: string;
}

export interface Puzzle {
  /** Daily only: the puzzle number and its date. */
  number: number | null;
  date: string | null;
  /** Endless only: the round, as the browser asked for it. */
  round: number | null;
  pieces: Piece[];
  /**
   * The finished map's silhouette, north up, around the table's origin:
   * the frame the pieces go into. Flat rings, filled even-odd.
   */
  outline: number[][];
}

/** Where a piece is on the player's board, and how many steps they have turned it. */
export interface PieceState {
  x: number;
  y: number;
  r: number;
}

/** Everything about the answer, sent once the round is over. */
export interface Reveal {
  ids: string[];
  /** Each piece's centre in the finished map, around the map's own centre, north up. */
  home: Array<[number, number]>;
  /** The turn (0–11) that sets each piece north up: k + turn ≡ 0. */
  turns: number[];
}

export interface FitReply {
  /** Pieces that fit together, in groups of two or more. */
  groups: number[][];
  /** Pieces sitting in their place in the frame, which hold them there. */
  placed: number[];
  /** The exact centre for each piece in a group or the frame, null for a loose one. */
  at: Array<[number, number] | null>;
  /** Every piece is in one group. */
  solved: boolean;
  /** Sent with the last fit, and on giving up. */
  reveal: Reveal | null;
}
