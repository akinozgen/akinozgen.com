import { dateForIndex, dayIndex } from "@travelle/core";
import { borderGraph, guessBudget } from "@travelle/geo";
import calendar from "@travelle/geo/data/puzzles.json";

export const EPOCH: string = calendar.epoch;

interface CalendarEntry {
  start: string;
  end: string;
  shortest: number;
}

const entries = calendar.puzzles as CalendarEntry[];

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
}

export const graph = borderGraph();

/** Today's puzzle number, wrapping if the calendar ever runs out. */
export function todayIndex(now: Date = new Date()): number {
  const raw = dayIndex(EPOCH, now);
  if (raw < 0) return 0;
  return raw % entries.length;
}

export function dailyPuzzle(index: number): Puzzle {
  const entry = entries[((index % entries.length) + entries.length) % entries.length];
  return {
    id: `daily:${index}`,
    kind: "daily",
    number: index,
    date: dateForIndex(EPOCH, index),
    start: entry.start,
    end: entry.end,
    shortest: entry.shortest,
    budget: guessBudget(entry.shortest),
  };
}
