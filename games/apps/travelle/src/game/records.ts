import type { Imported, PlayRecord } from "@akinozgen/account";
import type { PuzzleRecords } from "@akinozgen/account/client";
import { emptyStats, readJson, recordResult, type Stats } from "@travelle/core";
import type { TravelleMoves, TravelleResult } from "@travelle/geo/client";
import { ENDLESS_STATS_KEY } from "./endless.ts";
import { EPOCH } from "./puzzle.ts";

/**
 * travelle's record while someone is signed in: the server keeps every round
 * it judges, and the stats are counted here from its verdicts, with the same
 * arithmetic the browser's own record uses. Signed out, nothing here is used.
 */

export const DAILY_STATS_KEY = "travle:stats:v1";

export type Kind = "daily" | "endless";

/** Where this browser keeps one mode's own record. */
export const localStatsKey = (kind: Kind): string => (kind === "daily" ? DAILY_STATS_KEY : ENDLESS_STATS_KEY);

/** What the device had recorded, for the one-time import; null when it has nothing. */
export function deviceStats(): { daily: Stats | null; endless: Stats | null } | null {
  const daily = readJson<Stats>(DAILY_STATS_KEY);
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
    won: count(stats.won),
    perfect: count(stats.perfect),
    streak: count(stats.streak),
    bestStreak: count(stats.bestStreak),
    lastDay: typeof stats.lastDay === "number" && Number.isInteger(stats.lastDay) ? stats.lastDay : null,
  };
}

const DAY_MS = 86_400_000;
/** A daily's number from its date, as the server numbers it: days since the epoch. */
export const dayOf = (date: string): number => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${EPOCH}T00:00:00Z`)) / DAY_MS);

const isResult = (value: unknown): value is TravelleResult =>
  typeof value === "object" && value !== null && typeof (value as TravelleResult).won === "boolean";

/**
 * One mode's stats from the server's records, counted on from the imported
 * device record (if any): dailies by day, so a streak is days in a row;
 * endless rounds in the order they were finished, each the next in the run.
 */
export function statsFromRecords(plays: readonly PlayRecord<TravelleResult>[], imported: Imported | null, kind: Kind): Stats {
  let stats = importedStats(imported, kind) ?? emptyStats;
  if (kind === "daily") {
    const days = plays
      .filter((play) => play.puzzle.startsWith("d:") && isResult(play.result))
      .map((play) => ({ day: dayOf(play.puzzle.slice(2)), result: play.result }))
      .filter((play) => Number.isInteger(play.day))
      .sort((a, b) => a.day - b.day);
    for (const { day, result } of days) stats = recordResult(stats, day, result);
  } else {
    const rounds = plays
      .filter((play) => play.puzzle.startsWith("e:") && isResult(play.result))
      .sort((a, b) => a.finishedAt - b.finishedAt);
    let round = (stats.lastDay ?? -1) + 1;
    for (const play of rounds) stats = recordResult(stats, round++, play.result);
  }
  return stats;
}

/**
 * The record to show. Signed in, the account's, counted from the server's
 * verdicts; until it arrives, nothing rather than this browser's own. Signed
 * out, or with the server out of reach, `local`.
 */
export function shownRecord(records: PuzzleRecords<TravelleResult>, kind: Kind, local: Stats): { stats: Stats; imported: number } {
  if (records.status === "ready") {
    return { stats: statsFromRecords(records.plays, records.imported, kind), imported: importedStats(records.imported, kind)?.played ?? 0 };
  }
  return { stats: records.status === "loading" ? emptyStats : local, imported: 0 };
}

/** A record's moves as the server sent them back, if they look like travelle's. */
export function movesOf(value: unknown): TravelleMoves | null {
  const moves = value as Partial<TravelleMoves> | null;
  const strings = (list: unknown): list is string[] => Array.isArray(list) && list.every((item) => typeof item === "string");
  if (!moves || typeof moves !== "object" || !strings(moves.g) || !strings(moves.h) || typeof moves.s !== "boolean") return null;
  return { g: moves.g, h: moves.h, s: moves.s };
}
