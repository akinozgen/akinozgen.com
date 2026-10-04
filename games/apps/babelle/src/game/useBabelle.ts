import { readJson, writeJson } from "@travelle/core";
import { type BabelleVerdict, FINAL_TRIES, QUESTIONS, type Status } from "@babelle/data/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { judge, judgeEndless } from "./api.ts";

/** Day 1 of babelle. */
export const EPOCH = "2026-10-04";

const pad = (n: number): string => String(n).padStart(2, "0");

export function localDate(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Today where the player is; before day 1's local midnight, day 1 itself. */
export function playDate(now: Date = new Date()): string {
  const today = localDate(now);
  return today < EPOCH ? EPOCH : today;
}

export function numberFor(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [ey, em, ed] = EPOCH.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ey, em - 1, ed)) / 86_400_000) + 1;
}

interface SavedDay {
  /** Endless only: the round being played, picked at random by this browser. */
  round?: number;
  answers: number[];
  guesses: string[];
  /** The server's word on exactly these answers and guesses. */
  verdict?: BabelleVerdict;
}

export interface Stats {
  played: number;
  won: number;
  streak: number;
  best: number;
  /** Five cards right and the language named first time. */
  perfect: number;
  /** Wins by try, index 0 = first try. */
  distribution: number[];
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
  perfect: 0,
  distribution: Array.from({ length: FINAL_TRIES }, () => 0),
  lastNumber: null,
  lastWon: null,
};

const DAY_PREFIX = "babelle:day:v1:";
const STATS_KEY = "babelle:stats:v1";
const ENDLESS_KEY = "babelle:endless:v1";
const ENDLESS_STATS_KEY = "babelle:endless-stats:v1";

/** A fresh endless round: 32 random bits, meaningless without the server's secret. */
function freshRound(): number {
  const bits = new Uint32Array(1);
  crypto.getRandomValues(bits);
  return bits[0];
}

export type Mode = "daily" | "endless";

const fits = (saved: SavedDay): boolean =>
  !!saved.verdict &&
  saved.verdict.answers.length === saved.answers.length &&
  saved.verdict.guesses.length === saved.guesses.length;

export interface Babelle {
  mode: Mode;
  /** Endless only: the round being played. */
  round: number | null;
  date: string;
  number: number;
  verdict: BabelleVerdict | null;
  status: Status;
  pending: boolean;
  failed: boolean;
  stats: Stats;
  /** How many cards were answered right. */
  cardsRight: number;
  answer: (choice: number) => void;
  guess: (id: string) => "accepted" | "duplicate" | "busy";
  retry: () => void;
  /** Endless only: deal a new language. */
  next: () => void;
}

/**
 * One mode's round. The daily is the day's language, kept per date; endless
 * is whatever round this browser last dealt itself, in one slot, with a
 * record of its own. `active` holds endless back from the server until it
 * is open and on screen.
 */
export function useBabelle(mode: Mode = "daily", active = true): Babelle {
  const endless = mode === "endless";
  const [date] = useState(() => playDate());
  const number = numberFor(date);
  const key = endless ? ENDLESS_KEY : `${DAY_PREFIX}${date}`;
  const statsKey = endless ? ENDLESS_STATS_KEY : STATS_KEY;
  const [saved, setSaved] = useState<SavedDay>(() => {
    const stored = readJson<SavedDay>(key);
    if (stored) return stored;
    return endless ? { round: freshRound(), answers: [], guesses: [] } : { answers: [], guesses: [] };
  });
  const [stats, setStats] = useState<Stats>(() => ({ ...emptyStats, ...readJson<Stats>(statsKey) }));
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const lastAttempt = useRef<SavedDay | null>(null);

  const submit = useCallback(
    (next: SavedDay) => {
      if (inFlight.current) return;
      inFlight.current = true;
      lastAttempt.current = next;
      setPending(true);
      setFailed(false);
      (endless
        ? judgeEndless(next.round ?? 0, next.answers, next.guesses)
        : judge(date, next.answers, next.guesses))
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

  // The first question, or a verdict that never arrived, is asked for once
  // the round is on screen.
  useEffect(() => {
    if (active && !fits(saved) && !inFlight.current) submit(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, saved.round]);

  const verdict = fits(saved) ? saved.verdict! : null;
  const status: Status = verdict?.status ?? "playing";
  const cardsRight = verdict?.answers.filter((a) => a.chosen === a.correct).length ?? 0;

  // Count the day once, when it ends; another tab may have counted it already.
  useEffect(() => {
    if (status === "playing" || !verdict) return;
    const stats = { ...emptyStats, ...readJson<Stats>(statsKey) };
    const counted = endless ? stats.lastRound === saved.round : stats.lastNumber === number;
    if (counted) {
      setStats(stats);
      return;
    }
    const won = status === "won";
    const tries = verdict.guesses.length;
    // A daily streak is consecutive days; an endless run is consecutive rounds named.
    const streak = won ? (endless || stats.lastWon === number - 1 ? stats.streak + 1 : 1) : 0;
    const distribution = [...stats.distribution];
    if (won) distribution[tries - 1] = (distribution[tries - 1] ?? 0) + 1;
    const next: Stats = {
      played: stats.played + 1,
      won: stats.won + (won ? 1 : 0),
      streak,
      best: Math.max(stats.best, streak),
      perfect: stats.perfect + (won && tries === 1 && cardsRight === QUESTIONS ? 1 : 0),
      distribution,
      lastNumber: endless ? stats.lastNumber : number,
      lastWon: endless ? stats.lastWon : won ? number : stats.lastWon,
      lastRound: endless ? (saved.round ?? null) : (stats.lastRound ?? null),
    };
    setStats(next);
    writeJson(statsKey, next);
  }, [status, verdict, number, cardsRight, endless, statsKey, saved.round]);

  const answer = useCallback(
    (choice: number) => {
      if (!verdict || verdict.phase !== "questions" || inFlight.current) return;
      submit({ ...saved, answers: [...saved.answers, choice] });
    },
    [verdict, saved, submit],
  );

  const guess = useCallback(
    (id: string) => {
      if (!verdict || verdict.phase !== "final" || inFlight.current) return "busy" as const;
      if (saved.guesses.includes(id)) return "duplicate" as const;
      submit({ ...saved, guesses: [...saved.guesses, id] });
      return "accepted" as const;
    },
    [verdict, saved, submit],
  );

  const retry = useCallback(() => {
    if (lastAttempt.current) submit(lastAttempt.current);
  }, [submit]);

  const next = useCallback(() => {
    if (!endless || inFlight.current) return;
    const fresh: SavedDay = { round: freshRound(), answers: [], guesses: [] };
    lastAttempt.current = null;
    setFailed(false);
    setSaved(fresh);
    writeJson(key, fresh);
    submit(fresh);
  }, [endless, key, submit]);

  return {
    mode,
    round: endless ? (saved.round ?? null) : null,
    date,
    number,
    verdict,
    status,
    pending,
    failed,
    stats,
    cardsRight,
    answer,
    guess,
    retry,
    next,
  };
}

/** The text a player pastes: cards right or wrong, then the tries it took. */
export function shareText(number: number, verdict: BabelleVerdict): string {
  const cards = verdict.answers.map((a) => (a.chosen === a.correct ? "🟩" : "🟥")).join("");
  const right = verdict.answers.filter((a) => a.chosen === a.correct).length;
  const won = verdict.status === "won";
  const tries = verdict.guesses.map((g) => (g.km === 0 ? "🟩" : "🟥")).join("");
  return [
    `babelle #${number} · ${right}/${QUESTIONS} · ${won ? verdict.guesses.length : "X"}/${FINAL_TRIES}`,
    `${cards} → ${tries}`,
    "akinozgen.com/games/babelle",
  ].join("\n");
}
