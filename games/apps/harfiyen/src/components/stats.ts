import { type Table, type Level, upper } from "@harfiyen/engine";
import { readJson, writeJson } from "@travelle/core";
import { useEffect, useState } from "react";

const STATS_KEY = "harfiyen:stats:v1";
/** How many finished games' seeds are kept, so one game is never counted twice. */
const SEEN = 40;
const RECENT = 12;

export interface Stats {
  played: number;
  won: number;
  drawn: number;
  /** The highest final score. */
  best: number;
  /** Every final score added up, for the average. */
  points: number;
  /** `jokers`: which letters of the word were jokers, by position. */
  bestMove: { score: number; word: string; jokers?: number[] } | null;
  bingos: number;
  levels: Record<Level, { played: number; won: number }>;
  /** The last few games, oldest first. */
  recent: { you: number; bot: number; level: Level; result?: "won" | "lost" | "draw" }[];
  seeds: string[];
}

export const emptyStats = (): Stats => ({
  played: 0,
  won: 0,
  drawn: 0,
  best: 0,
  points: 0,
  bestMove: null,
  bingos: 0,
  levels: { kolay: { played: 0, won: 0 }, orta: { played: 0, won: 0 }, zor: { played: 0, won: 0 } },
  recent: [],
  seeds: [],
});

export function readStats(): Stats {
  const saved = readJson<Partial<Stats>>(STATS_KEY);
  return saved ? { ...emptyStats(), ...saved } : emptyStats();
}

/** A finished game folded into the record; a game already in it is left out. */
export function record(stats: Stats, game: Table, level: Level): Stats {
  if (!game.over || stats.seeds.includes(game.id)) return stats;
  const me = game.seat;
  const you = game.scores[me];
  const bot = game.scores[1 - me];
  const won = game.over.winner === me;
  let bestMove = stats.bestMove;
  let bingos = stats.bingos;
  for (const turn of game.log) {
    if (turn.player !== me || turn.kind !== "play") continue;
    if (turn.bingo) bingos++;
    if (!bestMove || turn.score > bestMove.score) {
      bestMove = { score: turn.score, word: upper(turn.words[0] ?? ""), jokers: turn.jokers ?? [] };
    }
  }
  const levels = { ...stats.levels };
  levels[level] = { played: levels[level].played + 1, won: levels[level].won + (won ? 1 : 0) };
  return {
    played: stats.played + 1,
    won: stats.won + (won ? 1 : 0),
    drawn: stats.drawn + (game.over.winner === null ? 1 : 0),
    best: Math.max(stats.best, you),
    points: stats.points + you,
    bestMove,
    bingos,
    levels,
    recent: [
      ...stats.recent,
      { you, bot, level, result: won ? ("won" as const) : game.over.winner === null ? ("draw" as const) : ("lost" as const) },
    ].slice(-RECENT),
    seeds: [...stats.seeds, game.id].slice(-SEEN),
  };
}

/** The record, kept up to date: a game is added the moment it ends, once. */
export function useStats(game: Table, level: Level): Stats {
  const [stats, setStats] = useState<Stats>(readStats);
  useEffect(() => {
    if (!game.over) return;
    // Read again rather than trust state: another tab may have counted this game already.
    const before = readStats();
    const after = record(before, game, level);
    if (after !== before) writeJson(STATS_KEY, after);
    setStats(after);
  }, [game, level]);
  return stats;
}
