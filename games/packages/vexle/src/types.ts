/** Languages vexle is played in. English is the canonical one. */
export const LANGUAGES = ["en", "tr", "de", "ru", "es"] as const;
export type Language = (typeof LANGUAGES)[number];

/** A flag that can be the answer, or a guess. */
export interface Country {
  /** ISO 3166-1 alpha-2, upper case. */
  code: string;
  names: Record<Language, string>;
  /** Other names people type: short forms, old names, ICU's spellings. */
  aliases: string[];
  continent: string;
  /** Centroid, for distance and direction between guesses. */
  lat: number;
  lon: number;
}

/** The flag is cut into COLUMNS × ROWS tiles, one revealed per guess. */
export const COLUMNS = 3;
export const ROWS = 2;
export const TILES = COLUMNS * ROWS;
/** A tile's size in the packs: the flag is drawn at 1200×900 (4:3) and cut in six. */
export const TILE_W = 400;
export const TILE_H = 450;

/** Guesses allowed: one per tile. */
export const MAX_GUESSES = TILES;

/** Entries in a tile pack: colour tiles, grey tiles, then the whole flag. */
export const PACK_ENTRIES = TILES * 2 + 1;
