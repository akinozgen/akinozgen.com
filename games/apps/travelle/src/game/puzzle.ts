import { dateForIndex, dayIndex } from "@travelle/core";
import type { DailyPuzzle, EndlessPuzzle } from "@travelle/geo/client";

/** Day 0 of the daily calendar. */
export const EPOCH = "2026-01-01";

export interface Puzzle {
  /** Stable across reloads — it keys the saved progress for this round. */
  id: string;
  kind: "daily" | "endless";
  /** Day number for the daily, round number for endless. */
  number: number;
  /** Daily only: the calendar date it belongs to. */
  date?: string;
  /** Endless only: the continents in play, or undefined for the whole world. */
  scope?: string[];
  start: string;
  end: string;
  shortest: number;
  /** Total guesses allowed: the shortest solution plus the published allowance. */
  budget: number;
  /** Endless only: what the server needs back to judge the round. */
  key?: string;
}

/** Today's puzzle number, counted in the player's own timezone. */
export function todayIndex(now: Date = new Date()): number {
  return Math.max(0, dayIndex(EPOCH, now));
}

/** Today's date where the player is, which is what the daily is asked for by. */
export function todayDate(now: Date = new Date()): string {
  return dateForIndex(EPOCH, todayIndex(now));
}

export function fromDaily(daily: DailyPuzzle): Puzzle {
  return {
    id: `daily:${daily.number}`,
    kind: "daily",
    number: daily.number,
    date: daily.date,
    start: daily.start,
    end: daily.end,
    shortest: daily.shortest,
    budget: daily.budget,
  };
}

export function fromEndless(
  endless: EndlessPuzzle,
  round: number,
  seed: number,
  scope: string[] | undefined,
): Puzzle {
  return {
    id: `endless:${seed}`,
    kind: "endless",
    number: round,
    scope,
    start: endless.start,
    end: endless.end,
    shortest: endless.shortest,
    budget: endless.budget,
    key: endless.key,
  };
}
