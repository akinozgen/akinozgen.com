import { readJson, writeJson } from "@travelle/core";
import { MAX_GUESSES, type Status, TILES, type VexleVerdict } from "@vexle/data/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { judge, judgeEndless } from "./api.ts";

/** Day 1 of vexle. */
export const EPOCH = "2026-10-04";

const pad = (n: number): string => String(n).padStart(2, "0");

/** Today where the player is: the daily turns over at their midnight. */
export function localDate(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * The day to play. Before the first flag's local midnight, the first flag
 * itself: it has already begun somewhere east, so the server will serve it.
 */
export function playDate(now: Date = new Date()): string {
  const today = localDate(now);
  return today < EPOCH ? EPOCH : today;
}

/** Puzzle number for a local date; the epoch is #1. */
export function numberFor(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [ey, em, ed] = EPOCH.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ey, em - 1, ed)) / 86_400_000) + 1;
}

interface SavedGame {
  /** Endless only: the round being played, picked at random by this browser. */
  round?: number;
  guesses: string[];
  /** Every guess so far was made with hard mode on, and it was never switched off. */
  hardAll: boolean;
  /** The server's word on exactly these guesses. */
  verdict?: VexleVerdict;
}

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
  /** Endless only: the last round counted. */
  lastRound?: number | null;
}

export const emptyStats: Stats = {
  played: 0,
  won: 0,
  streak: 0,
  best: 0,
  hardWins: 0,
  distribution: Array.from({ length: MAX_GUESSES }, () => 0),
  lastNumber: null,
  lastWon: null,
};

const GAME_PREFIX = "vexle:game:v1:";
const STATS_KEY = "vexle:stats:v1";
const ENDLESS_KEY = "vexle:endless:v1";
const ENDLESS_STATS_KEY = "vexle:endless-stats:v1";

/** A fresh endless round: 32 random bits, meaningless without the server's secret. */
function freshRound(): number {
  const bits = new Uint32Array(1);
  crypto.getRandomValues(bits);
  return bits[0];
}

export type Mode = "daily" | "endless";

/** Whether today's daily is over, read straight from storage. */
export function dailyFinished(date: string = playDate()): boolean {
  const saved = readJson<SavedGame>(`${GAME_PREFIX}${date}`);
  return !!saved?.verdict && saved.verdict.status !== "playing";
}
const HARD_KEY = "vexle:hard:v1";
const KEEP_GAMES = 14;

/** Old rounds carry their tiles; a fortnight of them is plenty. */
function prune(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(GAME_PREFIX)) keys.push(key);
    }
    keys.sort();
    for (const key of keys.slice(0, Math.max(0, keys.length - KEEP_GAMES))) {
      localStorage.removeItem(key);
    }
  } catch {
    // Storage blocked: nothing was saved, so nothing needs pruning.
  }
}

export interface Vexle {
  mode: Mode;
  date: string;
  number: number;
  /** Endless only: the round being played. */
  round: number | null;
  guesses: string[];
  verdict: VexleVerdict | null;
  status: Status;
  /** A call is in flight; further guesses wait for it. */
  pending: boolean;
  /** The last call failed and its guess was not kept. */
  failed: boolean;
  hard: boolean;
  /** This round counts as played in hard mode. */
  hardAll: boolean;
  stats: Stats;
  guess: (code: string) => "accepted" | "duplicate" | "busy";
  setHard: (hard: boolean) => void;
  retry: () => void;
  /** Endless only: deal a new flag. */
  next: () => void;
}

/**
 * One mode's round. The daily is the day's flag, kept per date; endless is
 * whatever round this browser last dealt itself, kept in one slot, with a
 * record of its own so practice never touches the daily streak.
 */
export function useVexle(mode: Mode = "daily"): Vexle {
  const endless = mode === "endless";
  const [date] = useState(() => playDate());
  const number = numberFor(date);
  const key = endless ? ENDLESS_KEY : `${GAME_PREFIX}${date}`;
  const statsKey = endless ? ENDLESS_STATS_KEY : STATS_KEY;
  const [saved, setSaved] = useState<SavedGame>(() => {
    const stored = readJson<SavedGame>(key);
    if (stored) return stored;
    return endless ? { round: freshRound(), guesses: [], hardAll: true } : { guesses: [], hardAll: true };
  });
  const [hard, setHardState] = useState<boolean>(() => readJson<boolean>(HARD_KEY) ?? false);
  const [stats, setStats] = useState<Stats>(() => ({ ...emptyStats, ...readJson<Stats>(statsKey) }));
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const lastAttempt = useRef<{ next: SavedGame; hard: boolean } | null>(null);

  useEffect(prune, []);

  const submit = useCallback(
    (next: SavedGame, withHard: boolean) => {
      if (inFlight.current) return;
      inFlight.current = true;
      lastAttempt.current = { next, hard: withHard };
      setPending(true);
      setFailed(false);
      (endless ? judgeEndless(next.round ?? 0, next.guesses, withHard) : judge(date, next.guesses, withHard))
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
    [date, key, endless],
  );

  // A round saved before its verdict came back asks again once.
  useEffect(() => {
    if (saved.guesses.length > 0 && saved.verdict?.results.length !== saved.guesses.length) {
      submit(saved, hard);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verdict =
    saved.verdict && saved.verdict.results.length === saved.guesses.length ? saved.verdict : null;
  const status: Status = verdict?.status ?? "playing";

  // Count the round exactly once, when it ends. Another tab may have counted
  // a round since this one loaded, so the record is read afresh first.
  useEffect(() => {
    if (status === "playing") return;
    const stats = { ...emptyStats, ...readJson<Stats>(statsKey) };
    const counted = endless ? stats.lastRound === saved.round : stats.lastNumber === number;
    if (counted) {
      setStats(stats);
      return;
    }
    const won = status === "won";
    const tries = saved.guesses.length;
    // A daily streak is consecutive days; an endless run is consecutive rounds solved.
    const streak = won ? (endless || stats.lastWon === number - 1 ? stats.streak + 1 : 1) : 0;
    const distribution = [...stats.distribution];
    if (won) distribution[tries - 1] = (distribution[tries - 1] ?? 0) + 1;
    const next: Stats = {
      played: stats.played + 1,
      won: stats.won + (won ? 1 : 0),
      streak,
      best: Math.max(stats.best, streak),
      hardWins: stats.hardWins + (won && saved.hardAll ? 1 : 0),
      distribution,
      lastNumber: endless ? stats.lastNumber : number,
      lastWon: endless ? stats.lastWon : won ? number : stats.lastWon,
      lastRound: endless ? (saved.round ?? null) : (stats.lastRound ?? null),
    };
    setStats(next);
    writeJson(statsKey, next);
  }, [status, number, saved.guesses.length, saved.hardAll, saved.round, endless, statsKey]);

  const guess = useCallback(
    (code: string) => {
      if (status !== "playing" || inFlight.current) return "busy" as const;
      if (saved.guesses.includes(code)) return "duplicate" as const;
      const guesses = [...saved.guesses, code];
      submit(
        { ...saved, guesses, hardAll: saved.guesses.length === 0 ? hard : saved.hardAll && hard },
        hard,
      );
      return "accepted" as const;
    },
    [status, saved, hard, submit],
  );

  const setHard = useCallback(
    (next: boolean) => {
      // Mid-request the switch would race the verdict; it is locked instead.
      if (inFlight.current) return;
      setHardState(next);
      writeJson(HARD_KEY, next);
      if (status !== "playing" || saved.guesses.length === 0) return;
      // Switching mid-round repaints the open tiles; switching off forfeits the mark.
      submit({ ...saved, hardAll: saved.hardAll && next }, next);
    },
    [status, saved, submit],
  );

  const retry = useCallback(() => {
    const last = lastAttempt.current;
    if (last) submit(last.next, last.hard);
  }, [submit]);

  const next = useCallback(() => {
    if (!endless || inFlight.current) return;
    const fresh: SavedGame = { round: freshRound(), guesses: [], hardAll: hard };
    lastAttempt.current = null;
    setFailed(false);
    setSaved(fresh);
    writeJson(key, fresh);
  }, [endless, hard, key]);

  return {
    mode,
    date,
    number,
    round: endless ? (saved.round ?? null) : null,
    guesses: verdict ? saved.guesses : saved.guesses.slice(0, 0),
    verdict,
    status,
    pending,
    failed,
    hard,
    hardAll: saved.guesses.length > 0 ? saved.hardAll : hard,
    stats,
    guess,
    setHard,
    retry,
    next,
  };
}

/** The text a player pastes: score, then which tiles their misses cost them. */
export function shareText(
  number: number,
  verdict: VexleVerdict,
  guesses: number,
  hardTag: string | null,
): string {
  const won = verdict.status === "won";
  const misses = won ? guesses - 1 : TILES;
  const spent = new Set(verdict.opened.slice(0, misses));
  const cells = Array.from({ length: TILES }, (_, i) => (spent.has(i) ? "🟥" : "🟩"));
  const head = `vexle #${number} ${won ? guesses : "X"}/${MAX_GUESSES}${hardTag ? ` · ${hardTag}` : ""}`;
  return [head, cells.slice(0, 3).join(""), cells.slice(3).join(""), "akinozgen.com/games/vexle"].join(
    "\n",
  );
}
