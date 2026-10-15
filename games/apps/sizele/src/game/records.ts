import type { Imported, PlayRecord } from "@akinozgen/account";
import { readJson } from "@travelle/core";
import type { SizeleMoves, SizeleResult } from "@sizele/data/client";

/**
 * sizele's record while someone is signed in: the server keeps every game it
 * judges, and the stats are counted here from its verdicts, with the same
 * arithmetic the browser's own record uses (`countGame`). Signed out,
 * nothing here but that arithmetic is used.
 */

export interface Stats {
  played: number;
  /** Every day's total added up, for the average. */
  points: number;
  best: number;
  /** Days in a row with a game finished. */
  streak: number;
  longest: number;
  /** Rounds that scored 80 or more. */
  greats: number;
  lastNumber: number | null;
  lastRound?: number | string | null;
}

export const emptyStats: Stats = {
  played: 0,
  points: 0,
  best: 0,
  streak: 0,
  longest: 0,
  greats: 0,
  lastNumber: null,
};

export const STATS_KEY = "sizele:stats:v1";
export const ENDLESS_STATS_KEY = "sizele:endless-stats:v1";

export type Kind = "daily" | "endless";

/**
 * One more game on a record. A daily streak is days in a row with a game
 * finished; an endless one is games in a row. `number` is the day's
 * (dailies), `roundName` the set's own (endless), so neither counts twice.
 */
export function countGame(stats: Stats, game: SizeleResult, endless: boolean, number: number, roundName: number | string | null): Stats {
  const streak = endless || stats.lastNumber === number - 1 ? stats.streak + 1 : 1;
  return {
    played: stats.played + 1,
    points: stats.points + game.total,
    best: Math.max(stats.best, game.total),
    streak,
    longest: Math.max(stats.longest, streak),
    greats: stats.greats + game.greats,
    lastNumber: endless ? stats.lastNumber : number,
    lastRound: endless ? roundName : (stats.lastRound ?? null),
  };
}

/** What the device had recorded, for the one-time import; null when it has nothing. */
export function deviceStats(): { daily: Stats | null; endless: Stats | null } | null {
  const daily = readJson<Stats>(STATS_KEY);
  const endless = readJson<Stats>(ENDLESS_STATS_KEY);
  return (daily?.played ?? 0) > 0 || (endless?.played ?? 0) > 0 ? { daily, endless } : null;
}

const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);

/** The device's record for one mode, as it was imported: its word, read with care. */
export function importedStats(imported: Imported | null, kind: Kind): Stats | null {
  const stats = (imported?.stats as Partial<Record<Kind, Partial<Stats> | null>> | undefined)?.[kind];
  if (!stats || typeof stats !== "object" || count(stats.played) === 0) return null;
  return {
    played: count(stats.played),
    points: count(stats.points),
    best: count(stats.best),
    streak: count(stats.streak),
    longest: count(stats.longest),
    greats: count(stats.greats),
    lastNumber: typeof stats.lastNumber === "number" && Number.isInteger(stats.lastNumber) ? stats.lastNumber : null,
    lastRound: typeof stats.lastRound === "string" || typeof stats.lastRound === "number" ? stats.lastRound : null,
  };
}

/** A daily's number from its date: the epoch is #1. */
function numberOf(date: string, epoch: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${epoch}T00:00:00Z`)) / 86_400_000) + 1;
}

const isResult = (value: unknown): value is SizeleResult =>
  typeof value === "object" && value !== null && typeof (value as SizeleResult).total === "number" && typeof (value as SizeleResult).greats === "number";

/**
 * One mode's stats from the server's records, counted on from the imported
 * device record (if any): dailies by day, endless sets in the order they
 * were finished.
 */
export function statsFromRecords(plays: readonly PlayRecord<SizeleResult>[], imported: Imported | null, kind: Kind, epoch: string): Stats {
  let stats = importedStats(imported, kind) ?? emptyStats;
  if (kind === "daily") {
    const days = plays
      .filter((play) => play.puzzle.startsWith("d:") && isResult(play.result))
      .map((play) => ({ number: numberOf(play.puzzle.slice(2), epoch), result: play.result }))
      .filter(({ number }) => Number.isInteger(number))
      .sort((a, b) => a.number - b.number);
    for (const { number, result } of days) {
      if (stats.lastNumber !== number) stats = countGame(stats, result, false, number, null);
    }
  } else {
    const sets = plays.filter((play) => play.puzzle.startsWith("e:") && isResult(play.result)).sort((a, b) => a.finishedAt - b.finishedAt);
    for (const play of sets) stats = countGame(stats, play.result, true, 0, play.puzzle);
  }
  return stats;
}

/** A record's moves as the server sent them back, if they look like sizele's. */
export function movesOf(value: unknown): SizeleMoves | null {
  const moves = value as Partial<SizeleMoves> | null;
  if (!moves || typeof moves !== "object" || !Array.isArray(moves.g) || !moves.g.every((n) => typeof n === "number" && n > 0)) return null;
  return { g: moves.g };
}
