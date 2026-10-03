import { emptyStats, readJson, recordResult, type Stats, writeJson } from "@travelle/core";
import type { HintName, Status, Verdict } from "@travelle/geo/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { judge } from "./api.ts";
import type { Puzzle } from "./puzzle.ts";
import { isRegion } from "./regions.ts";

/** The hints Travle offers, in the order they're shown. */
export type Hint = HintName;
export const HINTS: Hint[] = ["neighbours", "next-outline", "all-outlines", "initials"];

export type { Status };
export type Judged = Verdict["results"][number];

/**
 * What a round remembers between visits. The verdict is the server's last
 * word on exactly these guesses and hints, kept so a reload needs no call.
 */
interface SavedGame {
  guesses: string[];
  hints: Hint[];
  surrendered: boolean;
  verdict?: Verdict;
}

const blank: SavedGame = { guesses: [], hints: [], surrendered: false };

export interface Round {
  puzzle: Puzzle;
  /** Where to file the result, and what counts as the previous round for a streak. */
  statsKey: string;
  sequence: number;
  /** Countries that can be named this round; the endless mode narrows it. */
  allowed: readonly string[];
}

export interface Game {
  guesses: string[];
  results: Judged[];
  status: Status;
  hints: Hint[];
  stats: Stats;
  /** A shortest route, revealed once the game is over. */
  solution: string[];
  /** The next country on the best route that still fits the guesses made. */
  nextRegion: string | null;
  /** Every country bordering the start or the end — the possible first and last steps. */
  endpointNeighbours: string[];
  /** First letters of the rest of the best route, per language, once that hint is taken. */
  initials: Verdict["hints"]["initials"] | null;
  /** A call to the server is in flight; further moves wait for it. */
  pending: boolean;
  /** The last call failed; the move it carried was not made. */
  failed: boolean;
  guess: (regionId: string) => "accepted" | "duplicate" | "unknown" | "busy";
  useHint: (hint: Hint) => void;
  giveUp: () => void;
  retry: () => void;
}

/** Whether a saved verdict was given for exactly this state of the round. */
function fits(saved: SavedGame): boolean {
  const verdict = saved.verdict;
  if (!verdict) return false;
  if (verdict.results.length !== saved.guesses.length) return false;
  if (verdict.status === "playing" && saved.surrendered) return false;
  return saved.hints.every((hint) => {
    if (hint === "neighbours") return verdict.status !== "playing" || !!verdict.hints.neighbours;
    if (hint === "next-outline") return verdict.status !== "playing" || "next" in verdict.hints;
    if (hint === "initials") return verdict.status !== "playing" || !!verdict.hints.initials;
    return true;
  });
}

export function useGame({ puzzle, statsKey, sequence }: Round): Game {
  const key = `travle:game:v3:${puzzle.id}`;
  const [saved, setSaved] = useState<SavedGame>(() => readJson<SavedGame>(key) ?? blank);
  const [stats, setStats] = useState<Stats>(() => readJson<Stats>(statsKey) ?? emptyStats);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    setStats(readJson<Stats>(statsKey) ?? emptyStats);
  }, [statsKey]);

  /** Ask the server about `next`, and only keep it once it has answered. */
  const submit = useCallback(
    (next: SavedGame) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setPending(true);
      setFailed(false);
      judge({
        daily: puzzle.kind === "daily" ? puzzle.date : undefined,
        key: puzzle.key,
        guesses: next.guesses,
        hints: next.hints,
        surrendered: next.surrendered,
      })
        .then((verdict) => {
          const stored = { ...next, verdict };
          setSaved(stored);
          writeJson(key, stored);
        })
        .catch(() => setFailed(true))
        .finally(() => {
          inFlight.current = false;
          setPending(false);
        });
    },
    [key, puzzle.kind, puzzle.date, puzzle.key],
  );

  // A fresh round, or one saved before its verdict came back, asks once.
  useEffect(() => {
    if (!fits(saved)) submit(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const verdict = fits(saved) ? saved.verdict! : null;
  const status: Status = verdict?.status ?? "playing";
  const results = verdict?.results ?? [];

  // Record the round exactly once, when it stops being playable.
  useEffect(() => {
    if (status === "playing" || stats.lastDay === sequence) return;
    const perfect = status === "won" && results.length === puzzle.shortest;
    const next = recordResult(stats, sequence, { won: status === "won", perfect });
    setStats(next);
    writeJson(statsKey, next);
  }, [status, stats, sequence, statsKey, puzzle.shortest, results.length]);

  const guess = useCallback(
    (regionId: string) => {
      if (status !== "playing" || inFlight.current) return "busy" as const;
      if (!isRegion(regionId)) return "unknown" as const;
      if (
        saved.guesses.includes(regionId) ||
        regionId === puzzle.start ||
        regionId === puzzle.end
      ) {
        return "duplicate" as const;
      }
      submit({ ...saved, guesses: [...saved.guesses, regionId] });
      return "accepted" as const;
    },
    [saved, status, submit, puzzle.start, puzzle.end],
  );

  const useHint = useCallback(
    (hint: Hint) => {
      if (status !== "playing" || saved.hints.includes(hint)) return;
      submit({ ...saved, hints: [...saved.hints, hint] });
    },
    [saved, status, submit],
  );

  const giveUp = useCallback(() => {
    if (status !== "playing") return;
    submit({ ...saved, surrendered: true });
  }, [saved, status, submit]);

  const retry = useCallback(() => submit(saved), [saved, submit]);

  return {
    guesses: saved.guesses.slice(0, results.length),
    results,
    status,
    hints: verdict ? saved.hints : [],
    stats,
    solution: verdict?.solution ?? [],
    nextRegion: verdict?.hints.next ?? null,
    endpointNeighbours: verdict?.hints.neighbours ?? [],
    initials: verdict?.hints.initials ?? null,
    pending,
    failed,
    guess,
    useHint,
    giveUp,
    retry,
  };
}
