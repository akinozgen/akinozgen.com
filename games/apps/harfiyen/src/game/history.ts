import type { History, PastGame } from "@harfiyen/engine";
import { useCallback, useEffect, useState } from "react";
import { ApiError, callApi } from "./api.ts";

/**
 * The account's online record, kept by the server: the totals, and its
 * latest finished games. Held here for the visit, so coming back to the
 * hub shows it at once while it's asked for again.
 */

const OUTCOMES = new Set(["won", "lost", "draw", "abandoned"]);
const count = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);

function isPastGame(value: unknown): value is PastGame {
  const game = value as Partial<PastGame> | null;
  return (
    typeof game === "object" &&
    game !== null &&
    typeof game.code === "string" &&
    typeof game.you === "number" &&
    typeof game.them === "number" &&
    typeof game.endedAt === "number" &&
    OUTCOMES.has(game.outcome as string) &&
    (game.opponent === null || typeof game.opponent === "string")
  );
}

/** The record as the server sends it, checked enough to be shown. */
export function readHistory(value: unknown): History | null {
  const history = value as Partial<History> | null;
  if (typeof history !== "object" || history === null || !Array.isArray(history.games)) return null;
  return {
    played: count(history.played),
    won: count(history.won),
    lost: count(history.lost),
    drawn: count(history.drawn),
    games: history.games.filter(isPastGame),
  };
}

export async function fetchHistory(): Promise<History> {
  const body = await callApi<{ history?: unknown }>("gecmis");
  const history = readHistory(body.history);
  if (!history) throw new ApiError("bozuk", 200);
  return history;
}

/** The last record heard this visit, and whose. */
let kept: { owner: string; history: History } | null = null;

export function resetHistoryCache(): void {
  kept = null;
}

export interface HistoryState {
  /** Null until the first answer. */
  history: History | null;
  /** The last ask didn't get an answer. */
  failed: boolean;
}

/**
 * The record of `owner` (the signed-in account; null for nobody), asked
 * for on mount, when `fresh` changes (a game has ended since) and when the
 * tab comes back.
 */
export function useHistory(owner: string | null, fresh: string): HistoryState {
  const [heard, setHeard] = useState<{ owner: string; history: History | null; failed: boolean } | null>(() =>
    owner !== null && kept?.owner === owner ? { owner, history: kept.history, failed: false } : null,
  );

  const load = useCallback(async () => {
    if (owner === null) return;
    try {
      const history = await fetchHistory();
      kept = { owner, history };
      setHeard({ owner, history, failed: false });
    } catch {
      setHeard((now) => ({ owner, history: now?.owner === owner ? now.history : null, failed: true }));
    }
  }, [owner]);

  useEffect(() => {
    void load();
  }, [load, fresh]);

  useEffect(() => {
    const onVisible = (): void => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  // Another account's record, from earlier in the visit, isn't this one's.
  return heard && heard.owner === owner ? { history: heard.history, failed: heard.failed } : { history: null, failed: false };
}
