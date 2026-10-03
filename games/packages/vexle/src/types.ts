/** Languages vexle is played in. English is the canonical one. */
export const LANGUAGES = ["en", "tr", "de", "ru", "es"] as const;
export type Language = (typeof LANGUAGES)[number];

/** A flag that can be the answer, or a guess. */
export interface Country {
  /** ISO 3166-1 alpha-2, upper case. */
  code: string;
  names: Record<Language, string>;
  continent: string;
  /** Centroid, for distance and direction between guesses. */
  lat: number;
  lon: number;
}

/** The flag is cut into COLUMNS × ROWS tiles, one revealed per guess. */
export const COLUMNS = 3;
export const ROWS = 2;
export const TILES = COLUMNS * ROWS;
export const TILE_PX = 400;

/** Guesses allowed: one per tile. */
export const MAX_GUESSES = TILES;
