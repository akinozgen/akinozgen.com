/** Languages sizele is played in. English is the canonical one. */
export const LANGUAGES = ["en", "tr", "de", "ru", "es"] as const;
export type Language = (typeof LANGUAGES)[number];

/** Rounds in a day's game, and in an endless set. */
export const ROUNDS = 5;

/** The slider's ends: how many times bigger (or smaller) a guess can say the target is. */
export const RATIO_MIN = 1 / 50;
export const RATIO_MAX = 50;

/** A country to draw: flat [lon0, lat0, lon1, lat1, …] rings, filled even-odd. */
export interface Shape {
  id: string;
  rings: number[][];
  /** Where it sits, [lon, lat]: what the true-size move carries. */
  centroid: [number, number];
}

/** A round being played: how many `unit`s make one `target`? */
export interface RoundInfo {
  unit: Shape;
  target: Shape;
}

/** A round played. */
export interface Result {
  unit: string;
  target: string;
  /** What the player said: target = guess × unit. */
  guess: number;
  /** The truth, by area on the globe. */
  ratio: number;
  /** What the Mercator map makes it look like. */
  apparent: number;
  /** 0–100. */
  score: number;
  /** Both areas in km², target first, once the round is played. */
  areas: [number, number];
}

export interface Verdict {
  /** Daily only. */
  number: number | null;
  date: string | null;
  /** Endless only: the set, as the browser asked for it. */
  round: number | null;
  results: Result[];
  /** The round to play now; null once all are played. */
  next: RoundInfo | null;
  /** Sum of the scores so far, out of ROUNDS × 100. */
  total: number;
}

/** The colour a round's score earns in the share grid. */
export function band(score: number): "great" | "good" | "fair" | "poor" {
  return score >= 80 ? "great" : score >= 50 ? "good" : score >= 20 ? "fair" : "poor";
}
