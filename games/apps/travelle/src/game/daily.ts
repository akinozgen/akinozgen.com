import { readJson, writeJson } from "@travelle/core";
import type { DailyPuzzle } from "@travelle/geo/client";
import { useEffect, useState } from "react";
import { fetchDaily } from "./api.ts";
import { fromDaily, type Puzzle, todayDate } from "./puzzle.ts";

const cacheKey = (date: string): string => `travle:daily:v1:${date}`;

export interface Daily {
  /** Null while it is being fetched, or after a failure. */
  puzzle: Puzzle | null;
  failed: boolean;
  retry: () => void;
}

/**
 * Today's puzzle, from the server. Once fetched it is kept, so a reload, or
 * coming back later in the day, costs no request.
 */
export function useDaily(): Daily {
  const [date] = useState(() => todayDate());
  const [puzzle, setPuzzle] = useState<Puzzle | null>(() => {
    const saved = readJson<DailyPuzzle>(cacheKey(date));
    return saved ? fromDaily(saved) : null;
  });
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (puzzle) return;
    let live = true;
    setFailed(false);
    fetchDaily(date)
      .then((daily) => {
        writeJson(cacheKey(date), daily);
        if (live) setPuzzle(fromDaily(daily));
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [date, puzzle, attempt]);

  return { puzzle, failed, retry: () => setAttempt((n) => n + 1) };
}
