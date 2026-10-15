import { RecordConflict, useAccount, usePuzzleRecords } from "@akinozgen/account/client";
import { readJson, writeJson } from "@travelle/core";
import { type Puzzle, type Reveal, SNAP_PX, type TessleMoves, type TessleResult, UNITS_PER_PX } from "@tessle/data/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { askFit, boardOf, boardText, fetchPuzzle, fetchReveal, type Mark, type RoundKey } from "./api.ts";
import {
  countRound,
  deviceStats,
  emptyStats,
  ENDLESS_STATS_KEY,
  importedStats,
  movesOf,
  type Stats,
  STATS_KEY,
  statsFromRecords,
} from "./records.ts";
import { type SavedTable, Table } from "./table.ts";

export { emptyStats, type Stats };

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
  /** Signed in: boards the server has judged for this round, as far as this page has seen… */
  checks?: number;
  /** …and the last of them, as it was sent (api.ts `boardText`). */
  judged?: string;
}

const GAME_PREFIX = "tessle:game:v1:";
const ENDLESS_KEY = "tessle:endless:v1";
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
  /** Time on the round so far, live; once it is over and on the account's record, the server's. */
  elapsed: () => number;
  /** Pieces not yet in the frame. */
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
  /** The record: the account's while someone is signed in, the browser's own otherwise. */
  stats: Stats;
  /** Signed in: how many of the record's rounds came from this device's record before the account. */
  imported: number;
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
  const account = useAccount();
  const signedIn = account.status === "in";
  // While the account may be signed in, its record decides: answers skip the browser's cache.
  const maybeSignedIn = account.status !== "out";
  const records = usePuzzleRecords<TessleResult>("tessle", deviceStats);

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
  /** Bumped when the board is replaced by the one on the account's record: the table is built again. */
  const [layout, setLayout] = useState(0);
  /** Counts the tables built, so the record is asked about with each new one. */
  const [built, setBuilt] = useState(0);

  useEffect(() => {
    if (!puzzle) {
      setTable(null);
      tableRound.current = null;
      return;
    }
    const id = `${endless ? `e${saved.round}` : `d${date}`}:${layout}`;
    if (tableRound.current === id) return;
    tableRound.current = id;
    // A puzzle saved before the frame existed waits for it to be fetched.
    if (!puzzle.outline) return;
    const fresh = new Table(puzzle.pieces, savedRef.current.table, puzzle.outline);
    // A finished round always opens as the finished map.
    if (savedRef.current.status !== "playing" && savedRef.current.reveal) fresh.settle(savedRef.current.reveal, 0);
    setTable(fresh);
    setBuilt((n) => n + 1);
  }, [puzzle, endless, saved.round, date, layout]);

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
              // Asked again for the names or the frame: the shapes are the same ones.
              const pieces = current.puzzle.pieces.map((piece, i) => ({ ...piece, id: piece.id ?? fetched.pieces[i]?.id }));
              store({ ...current, puzzle: { ...current.puzzle, pieces, outline: fetched.outline } });
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
    if (active && (!saved.puzzle || !saved.puzzle.outline)) load(hard);
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
    const round = { won: saved.status === "won", ms: saved.elapsed, hard: saved.hardAll };
    const next = countRound(record, round, endless, number, saved.round ?? null);
    setStats(next);
    writeJson(statsKey, next);
  }, [saved.status, saved.elapsed, saved.hardAll, saved.round, number, endless, statsKey]);

  // Signed in, a round that ends here is on the account's record by now: count it.
  const wasPlaying = useRef(false);
  const { refresh } = records;
  useEffect(() => {
    if (saved.status === "playing") wasPlaying.current = true;
    else if (wasPlaying.current && signedIn) {
      wasPlaying.current = false;
      refresh();
    }
  }, [saved.status, signedIn, refresh]);

  // Signed in, the record is the account's, counted from the server's verdicts
  // and times; until it arrives, nothing is shown rather than this browser's own.
  const kind = endless ? "endless" : "daily";
  const shown = useMemo(() => {
    if (records.status === "ready") return statsFromRecords(records.plays, records.imported, kind, EPOCH);
    return records.status === "loading" ? emptyStats : stats;
  }, [records.status, records.plays, records.imported, kind, stats]);
  const imported = records.status === "ready" ? (importedStats(records.imported, kind)?.played ?? 0) : 0;
  // A finished round's time, signed in, is the server's too: the end card says what the record says.
  const recorded = records.status === "ready" ? records.plays.find((play) => play.puzzle === (endless ? `e:${saved.round}` : `d:${date}`)) : undefined;
  const recordedMs = recorded ? Math.max(0, recorded.finishedAt - recorded.startedAt) : null;
  const shownElapsed = useCallback(
    (): number => (savedRef.current.status !== "playing" && recordedMs !== null ? recordedMs : elapsed()),
    [recordedMs, elapsed],
  );

  // --- the account's record ---

  /** What the page tells the server with a board while someone may be signed in. */
  const mark = useCallback((): Mark | undefined => {
    if (!maybeSignedIn) return undefined;
    const current = savedRef.current;
    return { checks: current.checks ?? 0, hard: current.started ? current.hardAll : hard };
  }, [maybeSignedIn, hard]);

  /** The record after the server has judged `board`: a board unlike the last one is one more check. */
  const judgedAfter = (board: string): Pick<SavedGame, "checks" | "judged"> => {
    const current = savedRef.current;
    return board === current.judged ? {} : { checks: (current.checks ?? 0) + 1, judged: board };
  };

  /** Asks again once the page has taken up the record: bumped by `adopt`. */
  const [caughtUp, setCaughtUp] = useState(0);

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
    const board = boardText(sent);
    queue.dirty = false;
    queue.moved.clear();
    queue.busy = true;
    queue.lastAt = Date.now();
    askFit(roundKey, board, moved, table.unitsPerPx, mark(), maybeSignedIn)
      .then((reply) => {
        const { stale } = table.applyFit(reply, sent, performance.now());
        queue.failures = 0;
        if (stale.length > 0 && table.touches(stale, reach(table))) {
          for (const i of stale) queue.moved.add(i);
          queue.dirty = true;
        }
        setFailed(false);
        store({ ...savedRef.current, table: table.save(), elapsed: bank(), ...judgedAfter(board) });
        if (reply.solved && reply.reveal) finish("won", reply.reveal);
      })
      .catch((error: unknown) => {
        const moves = error instanceof RecordConflict ? movesOf(error.moves) : null;
        if (moves) {
          adoptRef.current(moves);
          return;
        }
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
  }, [table, roundKey, store, bank, finish, mark, maybeSignedIn]);

  useEffect(() => () => window.clearTimeout(fitQueue.current.timer), []);

  /**
   * The account has this round further along than the page (played on
   * another device, or finished there): the page takes up the board on
   * record, and asks about it again. A round given up there is given up here.
   */
  const adopt = useCallback(
    (moves: TessleMoves) => {
      const current = savedRef.current;
      const queue = fitQueue.current;
      queue.dirty = false;
      queue.moved.clear();
      window.clearTimeout(queue.timer);
      const pieces = moves.board && current.puzzle ? boardOf(moves.board, current.puzzle.pieces.length) : null;
      const caught: SavedGame = {
        ...current,
        status: "playing",
        reveal: undefined,
        checks: moves.checks,
        judged: moves.board,
        started: current.started || pieces !== null,
        hardAll: moves.board !== "" ? moves.hard : current.hardAll,
      };
      if (moves.gaveUp) {
        store(caught);
        fetchReveal(roundKey, { checks: moves.checks, hard: caught.hardAll }, true)
          .then((reveal) => finish("lost", reveal))
          .catch(() => setFailed(true));
        return;
      }
      store(caught);
      if (pieces) {
        // A new table from the board on record; it is asked about once it is up.
        store({ ...caught, table: { pieces, groups: [], order: current.table?.order ?? pieces.map((_, i) => i), placed: [] } });
        tableRound.current = null;
        setLayout((n) => n + 1);
      } else {
        setCaughtUp((n) => n + 1);
      }
    },
    [roundKey, store, finish],
  );
  const adoptRef = useRef(adopt);
  adoptRef.current = adopt;

  // Signed in, the round is asked about once the table is up, with what this
  // page has: a round played on to elsewhere (or finished there) is taken up
  // here, and one played here before signing in goes on the record.
  const asked = useRef<string | null>(null);
  const asking =
    signedIn && active && table ? `${endless ? saved.round : date}\u0000${account.user?.tag}\u0000${built}\u0000${caughtUp}` : null;
  useEffect(() => {
    if (asking === null || asked.current === asking || !table) return;
    const queue = fitQueue.current;
    if (queue.busy) {
      // A fit in flight answers for the round as well; ask once it is back.
      const timer = window.setTimeout(() => setCaughtUp((n) => n + 1), FIT_GAP_MS);
      return () => window.clearTimeout(timer);
    }
    asked.current = asking;
    const current = savedRef.current;
    if (current.status === "lost") {
      // Given up here: the record hears of it too (a finished round answers the same again).
      fetchReveal(roundKey, mark(), true).catch((error: unknown) => {
        const moves = error instanceof RecordConflict ? movesOf(error.moves) : null;
        if (moves) adopt(moves);
      });
      return;
    }
    const sent = table.snapshot();
    const board = current.status === "won" && current.judged ? current.judged : current.started ? boardText(sent) : null;
    queue.busy = true;
    askFit(roundKey, board, [], table.unitsPerPx, mark(), true)
      .then((reply) => {
        if (board === null) return;
        if (savedRef.current.status === "playing") {
          table.applyFit(reply, sent, performance.now());
          store({ ...savedRef.current, table: table.save(), ...judgedAfter(board) });
          if (reply.solved && reply.reveal) finish("won", reply.reveal);
        } else {
          store({ ...savedRef.current, ...judgedAfter(board) });
        }
      })
      .catch((error: unknown) => {
        const moves = error instanceof RecordConflict ? movesOf(error.moves) : null;
        if (moves) adopt(moves);
      })
      .finally(() => {
        queue.busy = false;
        pump();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asking, table]);

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
      fetchReveal(roundKey, mark(), maybeSignedIn)
        .then((reveal) => finish("lost", reveal))
        .catch((error: unknown) => {
          const moves = error instanceof RecordConflict ? movesOf(error.moves) : null;
          if (moves) {
            // Behind the record: the page catches up first, and the player decides again.
            adopt(moves);
            return;
          }
          lastFailure.current = attempt;
          setFailed(true);
        })
        .finally(() => setLoading(false));
    };
    attempt();
  }, [roundKey, finish, loading, mark, maybeSignedIn, adopt]);

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
    elapsed: shownElapsed,
    left: table?.unplaced ?? puzzle?.pieces.length ?? 0,
    labels,
    reveal: saved.reveal ?? null,
    hard,
    hardAll: saved.started ? saved.hardAll : hard,
    setHard,
    loading,
    failed,
    retry,
    stats: shown,
    imported,
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
