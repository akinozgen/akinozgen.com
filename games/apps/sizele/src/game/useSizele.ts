import { RecordConflict, useAccount, usePuzzleRecords } from "@akinozgen/account/client";
import { readJson, writeJson } from "@travelle/core";
import { band, ROUNDS, type Result, type RoundInfo, type SizeleResult, type Verdict } from "@sizele/data/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type GameKey, play, replay, short } from "./api.ts";
import {
  countGame,
  deviceStats,
  emptyStats,
  ENDLESS_STATS_KEY,
  importedStats,
  movesOf,
  type Stats,
  STATS_KEY,
  statsFromRecords,
} from "./records.ts";

export { emptyStats, type Stats };

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

const GAME_PREFIX = "sizele:game:v1:";
const ENDLESS_KEY = "sizele:endless:v1";
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
  /** The record: the account's while someone is signed in, the browser's own otherwise. */
  stats: Stats;
  /** Signed in: how many of the record's games came from this device's record before the account. */
  imported: number;
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
  const account = useAccount();
  const signedIn = account.status === "in";
  // While the account may be signed in, its record decides: answers skip the browser's cache.
  const maybeSignedIn = account.status !== "out";
  const records = usePuzzleRecords<SizeleResult>("sizele", deviceStats);

  useEffect(prune, []);

  const gameKey = (game: SavedGame): GameKey => (endless ? { round: game.round ?? 0 } : { date });

  /**
   * The game as the account has it, played on another device: its guesses,
   * and each round's two countries, asked for again without the session.
   * Hard mode is the page's own and isn't on record, so a game taken up
   * claims none.
   */
  const takeUp = async (from: SavedGame, guesses: number[]): Promise<SavedGame> => {
    const dealt = await Promise.all(guesses.map((_, i) => replay(gameKey(from), guesses.slice(0, i))));
    const rounds = dealt.map((verdict, i) => verdict.next ?? from.rounds[i]).filter((round): round is RoundInfo => !!round);
    return {
      ...(from.round === undefined ? {} : { round: from.round }),
      guesses,
      rounds,
      showing: Math.min(guesses.length, ROUNDS),
      hardAll: false,
      peeked: true,
    };
  };

  /**
   * Asks the server about `next`, and keeps it once it has answered. If the
   * account has the game further along (played on another device), the page
   * takes up the guesses on record instead and asks about those.
   */
  const submit = useCallback(
    (next: SavedGame, adopting = false): boolean => {
      if (inFlight.current) return false;
      inFlight.current = true;
      lastAttempt.current = next;
      setPending(true);
      setFailed(false);
      let adopted: SavedGame | null = null;
      play(gameKey(next), next.guesses, maybeSignedIn)
        .then((verdict) => {
          const rounds = [...next.rounds];
          if (verdict.next) rounds[verdict.results.length] = verdict.next;
          const stored: SavedGame = { ...next, verdict, rounds };
          savedRef.current = stored;
          setSaved(stored);
          writeJson(key, stored);
        })
        .catch(async (error: unknown) => {
          const moves = error instanceof RecordConflict && !adopting ? movesOf(error.moves) : null;
          if (!moves) {
            setFailed(true);
            return;
          }
          try {
            adopted = await takeUp(next, moves.g);
          } catch {
            setFailed(true);
            return;
          }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, endless, date, maybeSignedIn],
  );
  const submitRef = useRef(submit);
  submitRef.current = submit;

  // Signed in, the game is asked about once with what this page has, so a
  // game played on to elsewhere (or finished there) is taken up here.
  const asked = useRef<string | null>(null);
  const asking = signedIn && active ? `${key}\u0000${saved.round}\u0000${account.user?.tag}` : null;
  useEffect(() => {
    if (asking === null || pending || asked.current === asking) return;
    if (submit(savedRef.current)) asked.current = asking;
  }, [asking, pending, submit]);

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
    const game = { total: verdict.total, greats: verdict.results.filter((r) => band(r.score) === "great").length };
    const next = countGame(record, game, endless, number, saved.round ?? null);
    setStats(next);
    writeJson(statsKey, next);
  }, [played, verdict, statsKey, endless, number, saved.round]);

  // Signed in, a game that ends here is on the account's record by now: count it.
  const wasPlaying = useRef(false);
  const { refresh } = records;
  useEffect(() => {
    if (!played) wasPlaying.current = true;
    else if (wasPlaying.current && signedIn) {
      wasPlaying.current = false;
      refresh();
    }
  }, [played, signedIn, refresh]);

  // Signed in, the record is the account's, counted from the server's verdicts;
  // until it arrives, nothing is shown rather than this browser's own.
  const kind = endless ? "endless" : "daily";
  const shown = useMemo(() => {
    if (records.status === "ready") return statsFromRecords(records.plays, records.imported, kind, EPOCH);
    return records.status === "loading" ? emptyStats : stats;
  }, [records.status, records.plays, records.imported, kind, stats]);
  const imported = records.status === "ready" ? (importedStats(records.imported, kind)?.played ?? 0) : 0;

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
    stats: shown,
    imported,
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
