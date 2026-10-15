import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { ACCOUNT_HEADER, DATA_HEADER, type Imported, type PlayRecord, type PuzzleGame } from "../protocol.ts";
import type { ApiReply } from "./api.ts";
import { refresh as refreshAccount, useAccount } from "./store.ts";

/**
 * The daily puzzles' records, from the page's side, for every game that has
 * them (travelle, vexle, tessle, sizele). While someone is signed in, the
 * server keeps each puzzle as it judges it; the page asks for the finished
 * ones to show the record, and only counts them. The device's own record
 * from before the account is sent once per game, the first time, and kept
 * apart as what it is: the device's word.
 *
 * Signed out, a game keeps its own record in the browser, as it always has,
 * and nothing here asks the server anything.
 */

/** What a game API answers (HTTP 409) when the account has a puzzle further along than the page said. */
export const RECORD_CONFLICT = "kayit";

/**
 * A game API's refusal: the page's moves don't follow on from the ones on
 * record (another device has played on, or the puzzle is finished there).
 * `moves` are the record's, in the game's own terms, for the page to take up.
 */
export class RecordConflict extends Error {
  constructor(readonly moves: unknown) {
    super("the account's record of this puzzle is further along");
  }
}

/** The refusal in a game API's response, if that is what it is. */
export async function recordConflict(response: Response): Promise<RecordConflict | null> {
  if (response.status !== 409) return null;
  const body = (await response.json().catch(() => null)) as { error?: unknown; moves?: unknown } | null;
  return body && body.error === RECORD_CONFLICT && body.moves !== undefined ? new RecordConflict(body.moves) : null;
}

/**
 * Fetches from a game API. While someone may be signed in, past the
 * browser's cache: the answer then depends on the account's record, and an
 * answer kept from before the sign-in would hide it.
 */
export function fetchGame(url: string, signedIn: boolean): Promise<Response> {
  return signedIn ? fetch(url, { cache: "no-store" }) : fetch(url);
}

export interface Records<Result = unknown> {
  plays: PlayRecord<Result>[];
  imported: Imported | null;
}

async function call<T>(path: string, read: (body: Record<string, unknown>) => T | null, headers: Record<string, string> = {}): Promise<ApiReply<T>> {
  let response: Response;
  try {
    response = await fetch(`/api/hesap/${path}`, {
      headers: { [ACCOUNT_HEADER]: "1", ...headers },
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "ag", status: 0 };
  }
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (response.ok && body && typeof body === "object") {
    const data = read(body);
    if (data !== null) return { ok: true, data };
  }
  return { ok: false, error: body?.error === "oturum" ? "oturum" : "ag", status: response.status };
}

const isPlay = (value: unknown): value is PlayRecord => {
  const play = value as Partial<PlayRecord> | null;
  return (
    typeof play === "object" &&
    play !== null &&
    typeof play.puzzle === "string" &&
    typeof play.startedAt === "number" &&
    typeof play.finishedAt === "number" &&
    typeof play.result === "object" &&
    play.result !== null
  );
};

/** The account's finished puzzles in one game, newest first, and the device record it was given. */
export const fetchRecords = <Result = unknown>(game: PuzzleGame): Promise<ApiReply<Records<Result>>> =>
  call(`kayitlar?oyun=${game}`, (body) => {
    if (!Array.isArray(body.plays)) return null;
    const imported = body.imported as Imported | null;
    return {
      plays: body.plays.filter(isPlay) as PlayRecord<Result>[],
      imported: imported && typeof imported === "object" && typeof imported.importedAt === "number" ? imported : null,
    };
  });

/** Sends the device's own record for one game; the server keeps only the first it is sent. */
export const importDeviceStats = (game: PuzzleGame, stats: object): Promise<ApiReply<{ imported: boolean }>> =>
  call("aktar?oyun=" + game, (body) => (typeof body.imported === "boolean" ? { imported: body.imported } : null), {
    [DATA_HEADER]: encodeURIComponent(JSON.stringify(stats)),
  });

const NONE: Records = { plays: [], imported: null };

// --- one store per game, shared by every hook on the page (a daily and an endless round ask once) ---

type Status = "loading" | "ready" | "failed";

interface Entry {
  /** Whose records these are. */
  who: string;
  status: Status;
  records: Records;
}

interface GameState {
  entry: Entry | null;
  listeners: Set<() => void>;
  /** A question is in flight; `wanted` is whose records were asked for meanwhile, to ask again once it is back. */
  asking: boolean;
  wanted: string | null;
  /** The device's own record, as the game reads it; null when it has nothing. */
  deviceStats: (() => object | null) | null;
  subscribe: (listener: () => void) => () => void;
  snapshot: () => Entry | null;
}

const games = new Map<PuzzleGame, GameState>();
/** Accounts and games whose import has been tried on this page: once is enough. */
const importsTried = new Set<string>();

function stateOf(game: PuzzleGame): GameState {
  let state = games.get(game);
  if (!state) {
    const listeners = new Set<() => void>();
    const made: GameState = {
      entry: null,
      listeners,
      asking: false,
      wanted: null,
      deviceStats: null,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      snapshot: () => made.entry,
    };
    games.set(game, made);
    state = made;
  }
  return state;
}

function set(game: PuzzleGame, entry: Entry): void {
  const state = stateOf(game);
  state.entry = entry;
  for (const listener of state.listeners) listener();
}

async function ask(game: PuzzleGame, who: string): Promise<void> {
  const state = stateOf(game);
  if (state.asking) {
    state.wanted = who;
    return;
  }
  state.asking = true;
  const before = state.entry?.who === who ? state.entry : null;
  if (!before) set(game, { who, status: "loading", records: NONE });
  try {
    let reply = await fetchRecords(game);
    const key = `${who}\u0000${game}`;
    if (reply.ok && reply.data.imported === null && !importsTried.has(key)) {
      importsTried.add(key);
      const stats = state.deviceStats?.() ?? null;
      if (stats && (await importDeviceStats(game, stats)).ok) reply = await fetchRecords(game);
    }
    if (reply.ok) {
      set(game, { who, status: "ready", records: reply.data });
    } else {
      // A session that has run out: the account hears of it, and the game goes back to its own record.
      if (reply.error === "oturum") void refreshAccount();
      // Records already shown stay; with none, the game falls back on its own.
      set(game, before?.status === "ready" ? before : { who, status: "failed", records: NONE });
    }
  } finally {
    state.asking = false;
    const next = state.wanted;
    state.wanted = null;
    if (next !== null) void ask(game, next);
  }
}

export interface PuzzleRecords<Result> {
  /**
   * "local": no one is signed in; the game keeps its own record, as before
   * accounts. "failed": the server couldn't be asked; the game falls back on
   * its own record until it can.
   */
  status: "local" | "loading" | "ready" | "failed";
  /** The account's finished puzzles in this game, newest first: the server's verdicts. */
  plays: readonly PlayRecord<Result>[];
  /** The device record sent at the first sign-in, if any. */
  imported: Imported | null;
  /** Asks again: when a puzzle has just ended, so it is counted. */
  refresh: () => void;
}

/**
 * The account's record of one game, while someone is signed in. The first
 * time an account opens a game that has no device record yet, `deviceStats`
 * is read, and sent if it has anything (it returns null when not).
 */
export function usePuzzleRecords<Result>(game: PuzzleGame, deviceStats: () => object | null): PuzzleRecords<Result> {
  const account = useAccount();
  const who = account.status === "in" && account.user ? `${account.user.tag}:${account.user.createdAt}` : null;
  const state = stateOf(game);
  const read = useRef(deviceStats);
  read.current = deviceStats;
  state.deviceStats = () => read.current();

  const entry = useSyncExternalStore(state.subscribe, state.snapshot, state.snapshot);

  useEffect(() => {
    const current = stateOf(game);
    // Signed out: what was shown goes, so the next sign-in asks afresh.
    if (who === null) current.entry = null;
    else if (current.entry?.who !== who) void ask(game, who);
  }, [game, who]);

  return useMemo(() => {
    const refresh = (): void => {
      if (who !== null) void ask(game, who);
    };
    if (who === null) return { status: "local", plays: [], imported: null, refresh };
    const mine = entry?.who === who ? entry : null;
    const records = (mine?.records ?? NONE) as Records<Result>;
    return { status: mine?.status ?? "loading", plays: records.plays, imported: records.imported, refresh };
  }, [entry, game, who]);
}

/** Forgets everything, for tests that start each case afresh. */
export function resetRecordsCache(): void {
  games.clear();
  importsTried.clear();
}
