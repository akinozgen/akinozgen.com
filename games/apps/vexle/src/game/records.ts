import type { Imported, PlayRecord } from "@akinozgen/account";
import { readJson } from "@travelle/core";
import type { VexleMoves, VexleResult } from "@vexle/data/client";

/**
 * vexle's record while someone is signed in: the server keeps every round it
 * judges, and the stats are counted here from its verdicts, with the same
 * arithmetic the browser's own record uses (`countRound`). Signed out,
 * nothing here but that arithmetic is used.
 */

export interface Stats {
  played: number;
  won: number;
  streak: number;
  best: number;
  hardWins: number;
  /** Wins by number of guesses, index 0 = first try. */
  distribution: number[];
  /** The last puzzle recorded, so a round is counted once. */
  lastNumber: number | null;
  lastWon: number | null;
  /** Endless only: the last round counted, as "deck:card" (a bare number before the decks). */
  lastRound?: number | string | null;
}

export const emptyStats: Stats = {
  played: 0,
  won: 0,
  streak: 0,
  best: 0,
  hardWins: 0,
  // Six slots: day 1 allowed six guesses, and its wins are kept.
  distribution: Array.from({ length: 6 }, () => 0),
  lastNumber: null,
  lastWon: null,
};

export const STATS_KEY = "vexle:stats:v1";
export const ENDLESS_STATS_KEY = "vexle:endless-stats:v1";

export type Kind = "daily" | "endless";

/** A finished round, as either record sees it. */
export interface Counted {
  won: boolean;
  guesses: number;
  /** Every guess made in hard mode. */
  hard: boolean;
}

/**
 * One more round on a record. A daily streak is days in a row won; an
 * endless run is rounds in a row won. `number` is the day's (dailies),
 * `round` the round's own name (endless), so neither is counted twice.
 */
export function countRound(stats: Stats, round: Counted, endless: boolean, number: number, roundName: number | string | null): Stats {
  const { won, guesses: tries } = round;
  const streak = won ? (endless || stats.lastWon === number - 1 ? stats.streak + 1 : 1) : 0;
  const distribution = [...stats.distribution];
  if (won) distribution[tries - 1] = (distribution[tries - 1] ?? 0) + 1;
  return {
    played: stats.played + 1,
    won: stats.won + (won ? 1 : 0),
    streak,
    best: Math.max(stats.best, streak),
    hardWins: stats.hardWins + (won && round.hard ? 1 : 0),
    distribution,
    lastNumber: endless ? stats.lastNumber : number,
    lastWon: endless ? stats.lastWon : won ? number : stats.lastWon,
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
const whole = (value: unknown): number | null => (typeof value === "number" && Number.isInteger(value) ? value : null);

/** The device's record for one mode, as it was imported: its word, read with care. */
export function importedStats(imported: Imported | null, kind: Kind): Stats | null {
  const stats = (imported?.stats as Partial<Record<Kind, Partial<Stats> | null>> | undefined)?.[kind];
  if (!stats || typeof stats !== "object" || count(stats.played) === 0) return null;
  const distribution = Array.isArray(stats.distribution) ? stats.distribution.slice(0, 6).map(count) : [];
  return {
    played: count(stats.played),
    won: count(stats.won),
    streak: count(stats.streak),
    best: count(stats.best),
    hardWins: count(stats.hardWins),
    distribution: [...distribution, ...Array.from({ length: Math.max(0, 6 - distribution.length) }, () => 0)],
    lastNumber: whole(stats.lastNumber),
    lastWon: whole(stats.lastWon),
    lastRound: typeof stats.lastRound === "string" || typeof stats.lastRound === "number" ? stats.lastRound : null,
  };
}

/** A daily's number from its date: the epoch is #1. */
function numberOf(date: string, epoch: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${epoch}T00:00:00Z`)) / 86_400_000) + 1;
}

const isResult = (value: unknown): value is VexleResult =>
  typeof value === "object" && value !== null && typeof (value as VexleResult).won === "boolean" && typeof (value as VexleResult).guesses === "number";

/**
 * One mode's stats from the server's records, counted on from the imported
 * device record (if any): dailies by day, endless rounds in the order they
 * were finished.
 */
export function statsFromRecords(plays: readonly PlayRecord<VexleResult>[], imported: Imported | null, kind: Kind, epoch: string): Stats {
  let stats = importedStats(imported, kind) ?? emptyStats;
  if (kind === "daily") {
    const days = plays
      .filter((play) => play.puzzle.startsWith("d:") && isResult(play.result))
      .map((play) => ({ number: numberOf(play.puzzle.slice(2), epoch), result: play.result }))
      .filter((play) => Number.isInteger(play.number))
      .sort((a, b) => a.number - b.number);
    for (const { number, result } of days) {
      if (stats.lastNumber !== number) stats = countRound(stats, result, false, number, null);
    }
  } else {
    const rounds = plays.filter((play) => play.puzzle.startsWith("e:") && isResult(play.result)).sort((a, b) => a.finishedAt - b.finishedAt);
    for (const play of rounds) stats = countRound(stats, play.result, true, 0, play.puzzle);
  }
  return stats;
}

/** A record's moves as the server sent them back, if they look like vexle's. */
export function movesOf(value: unknown): VexleMoves | null {
  const moves = value as Partial<VexleMoves> | null;
  if (!moves || typeof moves !== "object" || !Array.isArray(moves.g) || !moves.g.every((code) => typeof code === "string")) return null;
  return { g: moves.g, hard: moves.hard === true };
}
