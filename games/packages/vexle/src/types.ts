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

/**
 * The rules: five guesses, and one tile open from the start (the die).
 * Five misses and the die open all six tiles.
 */
export const MAX_GUESSES = 5;
export const FREE_TILES = 1;

/** Day 1 was played with six guesses and no free tile, and keeps those rules. */
export const LEGACY_RULES = { limit: 6, free: 0 } as const;
export const LEGACY_DAYS = 1;

/** Entries in a tile pack: colour tiles, grey tiles, then the whole flag. */
export const PACK_ENTRIES = TILES * 2 + 1;

/**
 * Endless deals from a shuffled deck: every core flag and half of Africa's,
 * so nothing comes round twice until the deck runs out.
 */
export const ENDLESS_DECK = 170;
