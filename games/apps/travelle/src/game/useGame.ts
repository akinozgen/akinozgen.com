import { emptyStats, readJson, recordResult, type Stats, writeJson } from "@travelle/core";
import { type BorderGraph, evaluateGuess, type GuessResult } from "@travelle/geo";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Puzzle } from "./puzzle.ts";

/** The three hints Travle offers. */
export type Hint = "neighbours" | "next-outline" | "all-outlines" | "initials";
export const HINTS: Hint[] = ["neighbours", "next-outline", "all-outlines", "initials"];

export type Status = "playing" | "won" | "lost";

interface SavedGame {
  guesses: string[];
  hints: Hint[];
  surrendered: boolean;
}

const blank: SavedGame = { guesses: [], hints: [], surrendered: false };

export interface Round {
  puzzle: Puzzle;
  /** The map this round is played on — the endless mode narrows it. */
  graph: BorderGraph;
  /** Where to file the result, and what counts as the previous round for a streak. */
  statsKey: string;
  sequence: number;
}

export interface Game {
  guesses: string[];
  results: GuessResult[];
  status: Status;
  hints: Hint[];
  stats: Stats;
  /** Guesses still needed on the best route from here. */
  remaining: number;
  /** The route that finishes the puzzle from the current position. */
  suggestion: string[];
  /** The full shortest solution, revealed once the game is over. */
  solution: string[];
  /** The next country on the best route that still fits the guesses made. */
  nextRegion: string | null;
  /** Every country bordering the start or the end — the possible first and last steps. */
  endpointNeighbours: string[];
  guess: (regionId: string) => "accepted" | "duplicate" | "unknown";
  useHint: (hint: Hint) => void;
  giveUp: () => void;
}

export function useGame({ puzzle, graph, statsKey, sequence }: Round): Game {
  const key = `travle:game:v2:${puzzle.id}`;
  const [saved, setSaved] = useState<SavedGame>(() => readJson<SavedGame>(key) ?? blank);
  const [stats, setStats] = useState<Stats>(() => readJson<Stats>(statsKey) ?? emptyStats);

  useEffect(() => {
    setSaved(readJson<SavedGame>(key) ?? blank);
  }, [key]);

  useEffect(() => {
    setStats(readJson<Stats>(statsKey) ?? emptyStats);
  }, [statsKey]);

  const results = useMemo(() => {
    const out: GuessResult[] = [];
    for (let i = 0; i < saved.guesses.length; i++) {
      out.push(
        evaluateGuess(graph, puzzle.start, puzzle.end, saved.guesses.slice(0, i), saved.guesses[i]),
      );
    }
    return out;
  }, [saved.guesses, graph, puzzle.start, puzzle.end]);

  const complete = useMemo(
    () => graph.isComplete(puzzle.start, puzzle.end, saved.guesses),
    [saved.guesses, graph, puzzle.start, puzzle.end],
  );

  const status: Status = complete
    ? "won"
    : saved.surrendered || saved.guesses.length >= puzzle.budget
      ? "lost"
      : "playing";

  const suggestion = useMemo(
    () => graph.solve(puzzle.start, puzzle.end, saved.guesses).path,
    [saved.guesses, graph, puzzle.start, puzzle.end],
  );

  const solution = useMemo(
    () => graph.solve(puzzle.start, puzzle.end).path,
    [graph, puzzle.start, puzzle.end],
  );

  const endpointNeighbours = useMemo(
    () => [
      ...new Set([...graph.neighbours(puzzle.start), ...graph.neighbours(puzzle.end)]),
    ],
    [graph, puzzle.start, puzzle.end],
  );

  // Record the round exactly once, when it stops being playable.
  useEffect(() => {
    if (status === "playing" || stats.lastDay === sequence) return;
    const perfect = status === "won" && results.length === puzzle.shortest;
    const next = recordResult(stats, sequence, { won: status === "won", perfect });
    setStats(next);
    writeJson(statsKey, next);
  }, [status, stats, sequence, statsKey, puzzle.shortest, results.length]);

  const persist = useCallback(
    (next: SavedGame) => {
      setSaved(next);
      writeJson(key, next);
    },
    [key],
  );

  const guess = useCallback(
    (regionId: string) => {
      if (status !== "playing") return "unknown" as const;
      if (!graph.regionIndex.has(regionId)) return "unknown" as const;
      if (
        saved.guesses.includes(regionId) ||
        regionId === puzzle.start ||
        regionId === puzzle.end
      ) {
        return "duplicate" as const;
      }
      persist({ ...saved, guesses: [...saved.guesses, regionId] });
      return "accepted" as const;
    },
    [saved, status, persist, graph, puzzle.start, puzzle.end],
  );

  const useHint = useCallback(
    (hint: Hint) => {
      if (status !== "playing" || saved.hints.includes(hint)) return;
      persist({ ...saved, hints: [...saved.hints, hint] });
    },
    [saved, status, persist],
  );

  const giveUp = useCallback(() => {
    if (status !== "playing") return;
    persist({ ...saved, surrendered: true });
  }, [saved, status, persist]);

  return {
    guesses: saved.guesses,
    results,
    status,
    hints: saved.hints,
    stats,
    remaining: suggestion.length,
    suggestion,
    solution,
    nextRegion: suggestion[0] ?? null,
    endpointNeighbours,
    guess,
    useHint,
    giveUp,
  };
}
