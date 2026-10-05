import { readJson, writeJson } from "@travelle/core";
import { type Puzzle, type Reveal, SNAP_PX, UNITS_PER_PX } from "@tessle/data/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { askFit, fetchPuzzle, fetchReveal, type RoundKey } from "./api.ts";
import { type SavedTable, Table } from "./table.ts";

/** Day 1 of tessle. */
export const EPOCH = "2026-10-05";

const pad = (n: number): string => String(n).padStart(2, "0");

/** Today where the player is: the daily turns over at their midnight. */
export function localDate(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The day to play. Before the first map's local midnight, the first map itself. */
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

export type Status = "playing" | "won" | "lost";
export type Mode = "daily" | "endless";

interface SavedGame {
  /** Endless only: the round being played, picked at random by this browser. */
  round?: number;
  puzzle?: Puzzle;
  table?: SavedTable;
  moves: number;
  /** Milliseconds spent on the round so far, counted only while it is on screen. */
  elapsed: number;
  /** The first move has been made: the clock is running. */
  started: boolean;
  status: Status;
  reveal?: Reveal;
  /** Played with hard mode on from the first move, and never switched off. */
  hardAll: boolean;
}

export interface Stats {
  played: number;
  won: number;
  streak: number;
  best: number;
  hardWins: number;
  /** Fastest solve, in milliseconds. */
  fastest: number | null;
  /** Every solve's time added up, for the average. */
  totalTime: number;
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
  fastest: null,
  totalTime: 0,
  lastNumber: null,
  lastWon: null,
};

const GAME_PREFIX = "tessle:game:v1:";
const STATS_KEY = "tessle:stats:v1";
const ENDLESS_KEY = "tessle:endless:v1";
const ENDLESS_STATS_KEY = "tessle:endless-stats:v1";
const HARD_KEY = "tessle:hard:v1";
const KEEP_GAMES = 14;

/**
 * The rate limit allows twenty calls in ten seconds; a fit is never asked
 * for more often than this, so a burst of quick moves cannot trip it.
 */
const FIT_GAP_MS = 650;
const RETRY_MS = 2500;
/** After this many failed fits in a row, wait for the player instead of retrying. */
const RETRIES = 3;

/**
 * How near two pieces must lie before the server is asked about them: its
 * own snap distance, with room for rounding.
 */
function reach(table: Table): number {
  const units = Math.min(UNITS_PER_PX.max, Math.max(UNITS_PER_PX.min, table.unitsPerPx));
  return SNAP_PX * units * 1.25 + 1;
}

function freshRound(): number {
  const bits = new Uint32Array(1);
  crypto.getRandomValues(bits);
  return bits[0];
}

const freshGame = (round?: number, hard = false): SavedGame => ({
  ...(round === undefined ? {} : { round }),
  moves: 0,
  elapsed: 0,
  started: false,
  status: "playing",
  hardAll: hard,
});

/** Whether today's daily is over, read straight from storage. */
export function dailyFinished(date: string = playDate()): boolean {
  const saved = readJson<SavedGame>(`${GAME_PREFIX}${date}`);
  return !!saved && saved.status !== "playing";
}

/** Old rounds carry their pieces; a fortnight of them is plenty. */
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

export interface Tessle {
  mode: Mode;
  date: string;
  number: number;
  round: number | null;
  puzzle: Puzzle | null;
  table: Table | null;
  status: Status;
  moves: number;
  started: boolean;
  /** Time on the round so far, live. */
  elapsed: () => number;
  /** Separate things still to fit together. */
  left: number;
  /** Names to print on the pieces, or null while they are hidden. */
  labels: string[] | null;
  reveal: Reveal | null;
  hard: boolean;
  hardAll: boolean;
  setHard: (hard: boolean) => void;
  /** Fetching the puzzle, or the answer. */
  loading: boolean;
  failed: boolean;
  retry: () => void;
  stats: Stats;
  /** The board reports a move or a turn of these pieces: either costs one move. */
  act: (pieces: number[]) => void;
  giveUp: () => void;
  /** Endless only: deal a new map. */
  next: () => void;
}

/**
 * One mode's round. The daily is the day's map, kept per date; endless is
 * whatever round this browser last dealt itself, in one slot, with a record
 * of its own so practice never touches the daily streak.
 */
export function useTessle(mode: Mode = "daily", active = true): Tessle {
  const endless = mode === "endless";
  const [date] = useState(() => playDate());
  const number = numberFor(date);
  const key = endless ? ENDLESS_KEY : `${GAME_PREFIX}${date}`;
  const statsKey = endless ? ENDLESS_STATS_KEY : STATS_KEY;
  const [hard, setHardState] = useState<boolean>(() => readJson<boolean>(HARD_KEY) ?? false);
  const [saved, setSaved] = useState<SavedGame>(() => {
    const stored = readJson<SavedGame>(key);
    if (stored && typeof stored.moves === "number") return stored;
    return freshGame(endless ? freshRound() : undefined, hard);
  });
  const [stats, setStats] = useState<Stats>(() => ({ ...emptyStats, ...readJson<Stats>(statsKey) }));
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [, setVersion] = useState(0);
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const lastFailure = useRef<(() => void) | null>(null);

  const roundKey: RoundKey = useMemo(
    () => (endless ? { round: saved.round ?? 0 } : { date }),
    [endless, saved.round, date],
  );

  useEffect(prune, []);

  const store = useCallback(
    (next: SavedGame) => {
      savedRef.current = next;
      setSaved(next);
      writeJson(key, next);
    },
    [key],
  );

  // --- the clock: it runs from the first move, and only while the page is seen ---
  const runningSince = useRef<number | null>(null);
  const elapsed = useCallback((): number => {
    const base = savedRef.current.elapsed;
    return runningSince.current === null ? base : base + Date.now() - runningSince.current;
  }, []);
  /** Banks the running time into the saved game. */
  const bank = useCallback((): number => {
    const total = elapsed();
    if (runningSince.current !== null) runningSince.current = Date.now();
    return total;
  }, [elapsed]);

  const running = active && saved.started && saved.status === "playing";
  useEffect(() => {
    if (!running) return;
    const resume = (): void => {
      runningSince.current = document.visibilityState === "visible" ? Date.now() : null;
    };
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") {
        store({ ...savedRef.current, elapsed: elapsed() });
        runningSince.current = null;
      } else {
        resume();
      }
    };
    resume();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (runningSince.current !== null) {
        const total = elapsed();
        runningSince.current = null;
        store({ ...savedRef.current, elapsed: total });
      }
    };
  }, [running, elapsed, store]);

  // --- the puzzle ---
  const puzzle = saved.puzzle ?? null;
  const [table, setTable] = useState<Table | null>(null);
  const tableRound = useRef<string | null>(null);

  useEffect(() => {
    if (!puzzle) {
      setTable(null);
      tableRound.current = null;
      return;
    }
    const id = endless ? `e${saved.round}` : `d${date}`;
    if (tableRound.current === id) return;
    tableRound.current = id;
    const fresh = new Table(puzzle.pieces, savedRef.current.table);
    // A finished round always opens as the finished map.
    if (savedRef.current.status !== "playing" && savedRef.current.reveal) fresh.settle(savedRef.current.reveal, 0);
    setTable(fresh);
  }, [puzzle, endless, saved.round, date]);

  const loadingPuzzle = useRef(false);
  const load = useCallback(
    (withHard: boolean) => {
      if (loadingPuzzle.current) return;
      loadingPuzzle.current = true;
      setLoading(true);
      setFailed(false);
      const attempt = (): void => {
        loadingPuzzle.current = true;
        fetchPuzzle(roundKey, withHard)
          .then((fetched) => {
            const current = savedRef.current;
            if (current.puzzle) {
              // Asked again for the names: the shapes are the same ones.
              const pieces = current.puzzle.pieces.map((piece, i) => ({ ...piece, id: fetched.pieces[i]?.id }));
              store({ ...current, puzzle: { ...current.puzzle, pieces } });
            } else {
              store({ ...current, puzzle: fetched });
            }
          })
          .catch(() => {
            lastFailure.current = attempt;
            setFailed(true);
          })
          .finally(() => {
            loadingPuzzle.current = false;
            setLoading(false);
          });
      };
      attempt();
    },
    [roundKey, store],
  );

  useEffect(() => {
    if (active && !saved.puzzle) load(hard);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, saved.round, saved.puzzle]);

  // --- the end of a round ---
  const finish = useCallback(
    (status: "won" | "lost", reveal: Reveal) => {
      const current = savedRef.current;
      if (current.status !== "playing") return;
      const total = bank();
      runningSince.current = null;
      store({ ...current, status, reveal, elapsed: total });
      const settle = (): void => {
        if (!table) return;
        table.settle(reveal, performance.now());
        store({ ...savedRef.current, table: table.save() });
      };
      // A solve lets the last snap land before the map turns north up.
      if (status === "won") window.setTimeout(settle, 280);
      else settle();
    },
    [bank, store, table],
  );

  // Count the round exactly once, when it ends. Another tab may have counted
  // it since this one loaded, so the record is read afresh first.
  useEffect(() => {
    if (saved.status === "playing") return;
    const record = { ...emptyStats, ...readJson<Stats>(statsKey) };
    const counted = endless ? record.lastRound === saved.round : record.lastNumber === number;
    if (counted) {
      setStats(record);
      return;
    }
    const won = saved.status === "won";
    const streak = won ? (endless || record.lastWon === number - 1 ? record.streak + 1 : 1) : 0;
    const next: Stats = {
      played: record.played + 1,
      won: record.won + (won ? 1 : 0),
      streak,
      best: Math.max(record.best, streak),
      hardWins: record.hardWins + (won && saved.hardAll ? 1 : 0),
      fastest: won ? Math.min(record.fastest ?? Infinity, saved.elapsed) : record.fastest,
      totalTime: record.totalTime + (won ? saved.elapsed : 0),
      lastNumber: endless ? record.lastNumber : number,
      lastWon: endless ? record.lastWon : won ? number : record.lastWon,
      lastRound: endless ? (saved.round ?? null) : (record.lastRound ?? null),
    };
    setStats(next);
    writeJson(statsKey, next);
  }, [saved.status, saved.elapsed, saved.hardAll, saved.round, number, endless, statsKey]);

  // --- asking the server what fits ---
  const fitQueue = useRef({ busy: false, dirty: false, moved: new Set<number>(), lastAt: 0, timer: 0, failures: 0 });

  const pump = useCallback(() => {
    const queue = fitQueue.current;
    if (!table || queue.busy || !queue.dirty || queue.failures >= RETRIES || savedRef.current.status !== "playing") {
      return;
    }
    const wait = queue.lastAt + FIT_GAP_MS - Date.now();
    if (wait > 0) {
      window.clearTimeout(queue.timer);
      queue.timer = window.setTimeout(pump, wait);
      return;
    }
    const moved = [...queue.moved];
    const sent = table.snapshot();
    queue.dirty = false;
    queue.moved.clear();
    queue.busy = true;
    queue.lastAt = Date.now();
    askFit(roundKey, sent, moved, table.unitsPerPx)
      .then((reply) => {
        const { stale } = table.applyFit(reply, sent, performance.now());
        queue.failures = 0;
        if (stale.length > 0 && table.touches(stale, reach(table))) {
          for (const i of stale) queue.moved.add(i);
          queue.dirty = true;
        }
        setFailed(false);
        store({ ...savedRef.current, table: table.save(), elapsed: bank() });
        if (reply.solved && reply.reveal) finish("won", reply.reveal);
      })
      .catch(() => {
        for (const i of moved) queue.moved.add(i);
        queue.dirty = true;
        queue.lastAt = Date.now() + RETRY_MS;
        queue.failures++;
        setFailed(true);
        lastFailure.current = null;
      })
      .finally(() => {
        queue.busy = false;
        setVersion((v) => v + 1);
        pump();
      });
  }, [table, roundKey, store, bank, finish]);

  useEffect(() => () => window.clearTimeout(fitQueue.current.timer), []);

  const act = useCallback(
    (pieces: number[]) => {
      const current = savedRef.current;
      if (!table || current.status !== "playing") return;
      const first = !current.started;
      if (first) runningSince.current = Date.now();
      store({
        ...current,
        moves: current.moves + 1,
        started: true,
        hardAll: first ? hard : current.hardAll,
        table: table.save(),
        elapsed: first ? current.elapsed : bank(),
      });
      const queue = fitQueue.current;
      if (table.touches(pieces, reach(table))) {
        for (const i of pieces) queue.moved.add(i);
        queue.dirty = true;
      }
      // A move after a run of failures is the player trying again.
      if (queue.dirty) {
        queue.failures = 0;
        pump();
      }
    },
    [table, store, bank, hard, pump],
  );

  const giveUp = useCallback(() => {
    if (savedRef.current.status !== "playing" || loading) return;
    setLoading(true);
    setFailed(false);
    const attempt = (): void => {
      fetchReveal(roundKey)
        .then((reveal) => finish("lost", reveal))
        .catch(() => {
          lastFailure.current = attempt;
          setFailed(true);
        })
        .finally(() => setLoading(false));
    };
    attempt();
  }, [roundKey, finish, loading]);

  const retry = useCallback(() => {
    if (lastFailure.current) {
      setLoading(true);
      lastFailure.current();
      return;
    }
    fitQueue.current.dirty = true;
    fitQueue.current.lastAt = 0;
    fitQueue.current.failures = 0;
    pump();
  }, [pump]);

  const setHard = useCallback(
    (next: boolean) => {
      setHardState(next);
      writeJson(HARD_KEY, next);
      const current = savedRef.current;
      if (current.status !== "playing") return;
      // Before the first move the round simply starts in the new mode;
      // switching off once it is under way forfeits the mark.
      const hardAll = current.started ? current.hardAll && next : next;
      if (hardAll !== current.hardAll) store({ ...current, hardAll });
      if (!next && current.puzzle && current.puzzle.pieces.some((piece) => !piece.id)) load(false);
    },
    [store, load],
  );

  const next = useCallback(() => {
    if (!endless) return;
    tableRound.current = null;
    fitQueue.current.dirty = false;
    fitQueue.current.moved.clear();
    lastFailure.current = null;
    setFailed(false);
    store(freshGame(freshRound(), hard));
  }, [endless, hard, store]);

  const over = saved.status !== "playing";
  const ids = over ? saved.reveal?.ids : puzzle?.pieces.map((piece) => piece.id ?? "");
  const labels = ids && (over || !hard) && ids.every(Boolean) ? ids : null;

  return {
    mode,
    date,
    number,
    round: endless ? (saved.round ?? null) : null,
    puzzle,
    table,
    status: saved.status,
    moves: saved.moves,
    started: saved.started,
    elapsed,
    left: table?.clusters ?? puzzle?.pieces.length ?? 0,
    labels,
    reveal: saved.reveal ?? null,
    hard,
    hardAll: saved.started ? saved.hardAll : hard,
    setHard,
    loading,
    failed,
    retry,
    stats,
    act,
    giveUp,
    next,
  };
}

/** m:ss, or h:mm:ss for the patient. */
export function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor(total / 60) % 60;
  const s = pad(total % 60);
  return h > 0 ? `${h}:${pad(m)}:${s}` : `${m}:${s}`;
}

/** The text a player pastes: the map, the time, the moves. */
export function shareText(
  number: number,
  status: Status,
  pieces: number,
  ms: number,
  moves: number,
  words: { moves: string; gaveUp: string; hard: string | null },
): string {
  const head = `tessle #${number} · ${"🧩".repeat(Math.min(pieces, 8))}`;
  const line =
    status === "won"
      ? `⏱ ${clock(ms)} · ${moves} ${words.moves}${words.hard ? ` · ${words.hard}` : ""}`
      : `🏳️ ${words.gaveUp}`;
  return [head, line, "akinozgen.com/games/tessle"].join("\n");
}
