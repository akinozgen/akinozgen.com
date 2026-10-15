import { RecordConflict, useAccount, usePuzzleRecords } from "@akinozgen/account/client";
import { emptyStats, readJson, recordResult, type Stats, writeJson } from "@travelle/core";
import type { HintName, Status, TravelleResult, Verdict } from "@travelle/geo/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { judge } from "./api.ts";
import type { Puzzle } from "./puzzle.ts";
import { deviceStats, importedStats, movesOf, statsFromRecords } from "./records.ts";
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
  /** The record: the account's while someone is signed in, the browser's own otherwise. */
  stats: Stats;
  /** Signed in: how many of the record's rounds came from this device's record before the account. */
  imported: number;
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
  const account = useAccount();
  const signedIn = account.status === "in";
  const records = usePuzzleRecords<TravelleResult>("travelle", deviceStats);
  const [saved, setSaved] = useState<SavedGame>(() => readJson<SavedGame>(key) ?? blank);
  const [stats, setStats] = useState<Stats>(() => readJson<Stats>(statsKey) ?? emptyStats);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const savedRef = useRef(saved);
  savedRef.current = saved;
  // While the account may be signed in, its record decides: answers skip the browser's cache.
  const maybeSignedIn = account.status !== "out";

  useEffect(() => {
    setStats(readJson<Stats>(statsKey) ?? emptyStats);
  }, [statsKey]);

  /**
   * Ask the server about `next`, and only keep it once it has answered. If
   * the account has the round further along (played on another device), the
   * page takes up the moves on record instead and asks about those.
   */
  const submit = useCallback(
    (next: SavedGame, adopting = false): boolean => {
      if (inFlight.current) return false;
      inFlight.current = true;
      setPending(true);
      setFailed(false);
      let adopted: SavedGame | null = null;
      judge(
        {
          daily: puzzle.kind === "daily" ? puzzle.date : undefined,
          key: puzzle.key,
          draw: puzzle.draw,
          guesses: next.guesses,
          hints: next.hints,
          surrendered: next.surrendered,
        },
        maybeSignedIn,
      )
        .then((verdict) => {
          const stored = { ...next, verdict };
          savedRef.current = stored;
          setSaved(stored);
          writeJson(key, stored);
        })
        .catch((error: unknown) => {
          const moves = error instanceof RecordConflict && !adopting ? movesOf(error.moves) : null;
          if (!moves) {
            setFailed(true);
            return;
          }
          adopted = { guesses: moves.g, hints: moves.h as Hint[], surrendered: moves.s };
          savedRef.current = adopted;
          setSaved(adopted);
          writeJson(key, adopted);
        })
        .finally(() => {
          inFlight.current = false;
          setPending(false);
          if (adopted) submitRef.current(adopted, true);
        });
      return true;
    },
    [key, puzzle.kind, puzzle.date, puzzle.key, puzzle.draw, maybeSignedIn],
  );
  const submitRef = useRef(submit);
  submitRef.current = submit;

  // A fresh round, or one saved before its verdict came back, asks once.
  useEffect(() => {
    if (!fits(saved)) submit(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Signed in, the round is asked about once with what this page has, so a
  // round played on to elsewhere (or finished there) is taken up here.
  const asked = useRef<string | null>(null);
  const asking = signedIn ? `${key}\u0000${account.user?.tag}` : null;
  useEffect(() => {
    if (asking === null || pending || asked.current === asking) return;
    if (submit(savedRef.current)) asked.current = asking;
  }, [asking, pending, submit]);

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

  // Signed in, a round that ends here is on the account's record by now: count it.
  const wasPlaying = useRef(false);
  const { refresh } = records;
  useEffect(() => {
    if (status === "playing") wasPlaying.current = true;
    else if (wasPlaying.current && signedIn) {
      wasPlaying.current = false;
      refresh();
    }
  }, [status, signedIn, refresh]);

  // Signed in, the record is the account's, counted from the server's verdicts;
  // until it arrives, nothing is shown rather than this browser's own.
  const kind = puzzle.kind;
  const shown = useMemo(() => {
    if (records.status === "ready") return statsFromRecords(records.plays, records.imported, kind);
    return records.status === "loading" ? emptyStats : stats;
  }, [records.status, records.plays, records.imported, kind, stats]);
  const imported = records.status === "ready" ? (importedStats(records.imported, kind)?.played ?? 0) : 0;

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
    stats: shown,
    imported,
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
