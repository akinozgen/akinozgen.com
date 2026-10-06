import { readJson, writeJson } from "@travelle/core";
import { band, ROUNDS, type Result, type RoundInfo, type Verdict } from "@sizele/data/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { type GameKey, play, short } from "./api.ts";

/** Day 1 of sizele. */
export const EPOCH = "2026-10-06";

const pad = (n: number): string => String(n).padStart(2, "0");

/** Today where the player is: the daily turns over at their midnight. */
export function localDate(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The day to play. Before the first game's local midnight, the first game itself. */
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

export type Mode = "daily" | "endless";

interface SavedGame {
  /** Endless only: the set being played, picked at random by this browser. */
  round?: number;
  guesses: number[];
  /** Each round's two countries, as the server dealt them. */
  rounds: RoundInfo[];
  verdict?: Verdict;
  /** The round on screen: still to guess, or just revealed. */
  showing: number;
  /** A guess set on the slider but not sent, for the round on screen. */
  draft?: { round: number; ratio: number };
  /** Every guess so far was made in hard mode, and it was never switched off. */
  hardAll?: boolean;
  /** Some round's names were on screen before its reveal: no hard-mode mark. */
  peeked?: boolean;
}

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
  lastRound?: number | null;
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

const GAME_PREFIX = "sizele:game:v1:";
const STATS_KEY = "sizele:stats:v1";
const ENDLESS_KEY = "sizele:endless:v1";
const ENDLESS_STATS_KEY = "sizele:endless-stats:v1";
const HARD_KEY = "sizele:hard:v1";
const KEEP_GAMES = 14;

function freshRound(): number {
  const bits = new Uint32Array(1);
  crypto.getRandomValues(bits);
  return bits[0];
}

const freshGame = (round?: number): SavedGame => ({
  ...(round === undefined ? {} : { round }),
  guesses: [],
  rounds: [],
  showing: 0,
});

/** Whether today's daily is over, read straight from storage. */
export function dailyFinished(date: string = playDate()): boolean {
  const saved = readJson<SavedGame>(`${GAME_PREFIX}${date}`);
  return (saved?.verdict?.results.length ?? 0) >= ROUNDS;
}

function prune(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(GAME_PREFIX)) keys.push(key);
    }
    keys.sort();
    for (const key of keys.slice(0, Math.max(0, keys.length - KEEP_GAMES))) localStorage.removeItem(key);
  } catch {
    // Storage blocked: nothing was saved, so nothing needs pruning.
  }
}

export interface Sizele {
  mode: Mode;
  date: string;
  number: number;
  round: number | null;
  /** The round on screen, 0-based. */
  showing: number;
  /** Its two countries, once dealt. */
  current: RoundInfo | null;
  /** Its result, once guessed. */
  result: Result | null;
  results: Result[];
  rounds: RoundInfo[];
  total: number;
  /** All five played and the last one seen. */
  over: boolean;
  /** Five guessed, whether or not the last reveal has been looked at. */
  played: boolean;
  pending: boolean;
  failed: boolean;
  retry: () => void;
  guess: (ratio: number) => void;
  /** On to the next round once a reveal has been seen. */
  advance: () => void;
  stats: Stats;
  next: () => void;
  draft: number | null;
  setDraft: (ratio: number) => void;
  /** Names hidden until each reveal. */
  hard: boolean;
  setHard: (hard: boolean) => void;
  /** The whole game was played that way. */
  hardAll: boolean;
}

/**
 * One mode's game. The daily is the day's five pairs, kept per date;
 * endless is whatever set this browser last dealt itself, in one slot, with
 * a record of its own.
 */
export function useSizele(mode: Mode = "daily", active = true): Sizele {
  const endless = mode === "endless";
  const [date] = useState(() => playDate());
  const number = numberFor(date);
  const key = endless ? ENDLESS_KEY : `${GAME_PREFIX}${date}`;
  const statsKey = endless ? ENDLESS_STATS_KEY : STATS_KEY;
  const [saved, setSaved] = useState<SavedGame>(() => {
    const stored = readJson<SavedGame>(key);
    if (stored && Array.isArray(stored.guesses)) return stored;
    return freshGame(endless ? freshRound() : undefined);
  });
  const [stats, setStats] = useState<Stats>(() => ({ ...emptyStats, ...readJson<Stats>(statsKey) }));
  const [hard, setHardState] = useState<boolean>(() => readJson<boolean>(HARD_KEY) ?? false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const lastAttempt = useRef<SavedGame | null>(null);
  const savedRef = useRef(saved);
  savedRef.current = saved;

  useEffect(prune, []);

  const gameKey = (game: SavedGame): GameKey => (endless ? { round: game.round ?? 0 } : { date });

  const submit = useCallback(
    (next: SavedGame) => {
      if (inFlight.current) return;
      inFlight.current = true;
      lastAttempt.current = next;
      setPending(true);
      setFailed(false);
      play(gameKey(next), next.guesses)
        .then((verdict) => {
          const rounds = [...next.rounds];
          if (verdict.next) rounds[verdict.results.length] = verdict.next;
          const stored: SavedGame = { ...next, verdict, rounds };
          savedRef.current = stored;
          setSaved(stored);
          writeJson(key, stored);
        })
        .catch(() => setFailed(true))
        .finally(() => {
          inFlight.current = false;
          setPending(false);
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, endless, date],
  );

  // The first pair, or a verdict that never arrived, is asked for once the game is on screen.
  useEffect(() => {
    if (active && saved.verdict?.results.length !== saved.guesses.length && !inFlight.current) submit(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, saved.round]);

  const verdict = saved.verdict && saved.verdict.results.length === saved.guesses.length ? saved.verdict : null;
  const results = verdict?.results ?? [];
  const played = results.length >= ROUNDS;

  // Count the game exactly once, when the fifth guess comes back.
  useEffect(() => {
    if (!played || !verdict) return;
    const record = { ...emptyStats, ...readJson<Stats>(statsKey) };
    const counted = endless ? record.lastRound === saved.round : record.lastNumber === number;
    if (counted) {
      setStats(record);
      return;
    }
    const streak = endless || record.lastNumber === number - 1 ? record.streak + 1 : 1;
    const next: Stats = {
      played: record.played + 1,
      points: record.points + verdict.total,
      best: Math.max(record.best, verdict.total),
      streak,
      longest: Math.max(record.longest, streak),
      greats: record.greats + verdict.results.filter((r) => band(r.score) === "great").length,
      lastNumber: endless ? record.lastNumber : number,
      lastRound: endless ? (saved.round ?? null) : (record.lastRound ?? null),
    };
    setStats(next);
    writeJson(statsKey, next);
  }, [played, verdict, statsKey, endless, number, saved.round]);

  const guess = useCallback(
    (ratio: number) => {
      const current = savedRef.current;
      if (inFlight.current || current.guesses.length >= ROUNDS) return;
      if (current.guesses.length !== current.showing) return;
      const hardAll = current.guesses.length === 0 ? hard : (current.hardAll ?? false) && hard;
      submit({ ...current, guesses: [...current.guesses, Number(short(ratio))], hardAll });
    },
    [submit, hard],
  );

  const setHard = useCallback(
    (next: boolean) => {
      setHardState(next);
      writeJson(HARD_KEY, next);
      // Switching off once guessing has begun gives up the mark.
      const current = savedRef.current;
      if (!next && current.guesses.length > 0 && current.guesses.length < ROUNDS && current.hardAll) {
        const stored = { ...current, hardAll: false };
        savedRef.current = stored;
        setSaved(stored);
        writeJson(key, stored);
      }
    },
    [key],
  );

  const advance = useCallback(() => {
    const current = savedRef.current;
    if (current.showing >= current.guesses.length) return;
    const stored = { ...current, showing: current.showing + 1 };
    savedRef.current = stored;
    setSaved(stored);
    writeJson(key, stored);
  }, [key]);

  const retry = useCallback(() => {
    if (lastAttempt.current) submit(lastAttempt.current);
    else submit(savedRef.current);
  }, [submit]);

  const next = useCallback(() => {
    if (!endless || inFlight.current) return;
    const fresh = freshGame(freshRound());
    lastAttempt.current = null;
    setFailed(false);
    savedRef.current = fresh;
    setSaved(fresh);
    writeJson(key, fresh);
    submit(fresh);
  }, [endless, key, submit]);

  // A round shown with its names before the guess, at any point, costs the
  // hard-mode mark — switching off for a peek and back on again included.
  useEffect(() => {
    const current = savedRef.current;
    if (!active || hard || current.peeked || !current.rounds[current.showing]) return;
    if (current.showing < current.guesses.length || current.guesses.length >= ROUNDS) return;
    const stored = { ...current, peeked: true };
    savedRef.current = stored;
    setSaved(stored);
    writeJson(key, stored);
  }, [active, hard, saved.showing, saved.rounds.length, saved.guesses.length, key]);

  // Kept quietly: a reload mid-round finds the slider where it was left.
  const setDraft = useCallback(
    (ratio: number) => {
      const current = savedRef.current;
      const stored = { ...current, draft: { round: current.showing, ratio } };
      savedRef.current = stored;
      writeJson(key, stored);
    },
    [key],
  );

  const showing = Math.min(saved.showing, ROUNDS - 1);
  return {
    mode,
    date,
    number,
    round: endless ? (saved.round ?? null) : null,
    showing,
    current: saved.rounds[showing] ?? null,
    result: results[showing] ?? null,
    results,
    rounds: saved.rounds,
    total: verdict?.total ?? 0,
    over: played && saved.showing >= ROUNDS,
    played,
    pending,
    failed,
    retry,
    guess,
    advance,
    stats,
    next,
    draft: saved.draft && saved.draft.round === saved.showing ? saved.draft.ratio : null,
    setDraft,
    hard,
    setHard,
    hardAll: !saved.peeked && (saved.guesses.length > 0 ? (saved.hardAll ?? false) : hard),
  };
}

/** The text a player pastes: the day, the score, a square per round. */
export function shareText(number: number, total: number, results: readonly Result[], hardTag: string | null = null): string {
  const squares = results.map((r) => ({ great: "🟩", good: "🟨", fair: "🟧", poor: "🟥" })[band(r.score)]).join("");
  const head = `sizele #${number} · ${total}/${ROUNDS * 100}${hardTag ? ` · ${hardTag}` : ""}`;
  return [head, squares, "akinozgen.com/games/sizele"].join("\n");
}
