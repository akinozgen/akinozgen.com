import { MAX_SUMMARY, PROTOCOL, type RoomInfo, type Summary, type Table } from "@harfiyen/engine";
import { readJson, writeJson } from "@travelle/core";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Identity } from "./identity.ts";

/**
 * The online rooms this device plays in, kept in this browser: the server
 * has no accounts to list them by. Each one keeps the last summary heard —
 * from the server's summary endpoint, or from the room itself while it's
 * open — so the list shows at once and is brought up to date behind it.
 */

export type LiveSummary = Exclude<Summary, { gone: true }>;

export interface MyGame {
  code: string;
  /** When this device first had it. */
  added: number;
  summary: LiveSummary | null;
}

const KEY = "harfiyen:online:v1";
/** Finished games kept for the list; older ones are let go. */
export const KEEP_OVER = 10;
/** How often the list is refreshed while it's on screen. */
export const REFRESH_EVERY = 60_000;

const CODE = /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$/;

function read(): MyGame[] {
  const raw = readJson<unknown>(KEY);
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (g): g is MyGame => !!g && typeof g === "object" && CODE.test((g as MyGame).code) && typeof (g as MyGame).added === "number",
  );
}

let cache: MyGame[] | null = null;
const listeners = new Set<() => void>();

function snapshot(): MyGame[] {
  cache ??= read();
  return cache;
}

function write(next: MyGame[]): void {
  cache = prune(next);
  writeJson(KEY, cache);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab changed the list.
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== KEY && event.key !== null) return;
    cache = read();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Drops the store's copy, for tests that clear storage. */
export function resetMyGamesCache(): void {
  cache = null;
}

const when = (game: MyGame): number => game.summary?.updatedAt ?? game.added;

/** Keeps every unfinished game and the newest finished ones. */
export function prune(games: MyGame[]): MyGame[] {
  const over = games.filter((g) => g.summary?.phase === "over").sort((a, b) => when(b) - when(a));
  const dropped = new Set(over.slice(KEEP_OVER).map((g) => g.code));
  return dropped.size === 0 ? games : games.filter((g) => !dropped.has(g.code));
}

/** Adds a room to the list, or updates what's known of it. */
export function rememberGame(code: string, summary: LiveSummary | null = null, now: number = Date.now()): void {
  const games = snapshot();
  const at = games.findIndex((g) => g.code === code);
  if (at === -1) {
    write([...games, { code, added: now, summary }]);
    return;
  }
  const old = games[at];
  if (!summary || (old.summary && old.summary.updatedAt > summary.updatedAt) || same(old.summary, summary)) return;
  const next = [...games];
  next[at] = { ...old, summary };
  write(next);
}

export function forgetGame(code: string): void {
  const games = snapshot();
  if (games.some((g) => g.code === code)) write(games.filter((g) => g.code !== code));
}

const same = (a: LiveSummary | null, b: LiveSummary): boolean => a !== null && JSON.stringify(a) === JSON.stringify(b);

/** The summary a room's own state comes to, for the list. */
export function summaryOf(room: RoomInfo, table: Table | null): LiveSummary {
  return {
    code: room.code,
    phase: room.phase,
    you: room.you,
    turn: table && !table.over && room.phase === "playing" ? table.turn : null,
    names: room.seats.map((seat) => seat?.name ?? null),
    scores: table ? [...table.scores] : [0, 0],
    winner: table?.over?.winner ?? null,
    rematch: [...room.rematch],
    ...(room.abandoned ? { abandoned: true } : {}),
    updatedAt: room.updatedAt,
  };
}

/** The list with the server's news in it: summaries replace older ones, rooms that are gone go. */
export function mergeSummaries(games: MyGame[], summaries: readonly Summary[]): MyGame[] {
  const news = new Map(summaries.map((s) => [s.code, s]));
  return games.flatMap((game) => {
    const fresh = news.get(game.code);
    if (!fresh) return [game];
    if (fresh.gone) return [];
    if (game.summary && game.summary.updatedAt > fresh.updatedAt) return [game];
    return [{ ...game, summary: fresh }];
  });
}

export const isYourTurn = (s: LiveSummary | null): boolean =>
  !!s && s.phase === "playing" && s.you !== null && s.turn === s.you;

/** How many games are waiting on this player. */
export const waitingOn = (games: readonly MyGame[]): number => games.filter((g) => isYourTurn(g.summary)).length;

export interface GameGroups {
  yours: MyGame[];
  theirs: MyGame[];
  invites: MyGame[];
  over: MyGame[];
}

/** The list in its groups, newest first in each. */
export function groupGames(games: readonly MyGame[]): GameGroups {
  const sorted = [...games].sort((a, b) => when(b) - when(a));
  const groups: GameGroups = { yours: [], theirs: [], invites: [], over: [] };
  for (const game of sorted) {
    const s = game.summary;
    if (!s || s.phase === "waiting") groups.invites.push(game);
    else if (s.phase === "over") groups.over.push(game);
    else if (isYourTurn(s)) groups.yours.push(game);
    else groups.theirs.push(game);
  }
  groups.over = groups.over.slice(0, KEEP_OVER);
  return groups;
}

/** Asks the server about some rooms, twenty at a time. */
export async function fetchSummaries(secret: string, codes: readonly string[]): Promise<Summary[]> {
  const out: Summary[] = [];
  for (let i = 0; i < codes.length; i += MAX_SUMMARY) {
    // A GET, as the site's firewall wants; the secret in a header, the codes in the query.
    const query = new URLSearchParams({ v: String(PROTOCOL), k: codes.slice(i, i + MAX_SUMMARY).join(",") });
    const response = await fetch(`/api/harfiyen/ozet?${query}`, { headers: { "X-Harfiyen-Secret": secret } });
    if (!response.ok) throw new Error(`summary answered ${response.status}`);
    const body = (await response.json()) as { rooms?: Summary[] };
    if (Array.isArray(body.rooms)) out.push(...body.rooms);
  }
  return out;
}

export interface MyGamesApi {
  games: MyGame[];
  /** Games where it's this player's turn, for the badge. */
  waiting: number;
  /** The last refresh didn't reach the server. */
  stale: boolean;
  refresh: () => Promise<void>;
}

/**
 * The list of games, refreshed from the server on mount, when the tab comes
 * back, and — while `poll` (the list is on screen) — every minute.
 */
export function useMyGames(identity: Identity | null, poll = false): MyGamesApi {
  const games = useSyncExternalStore(subscribe, snapshot, snapshot);
  const [stale, setStale] = useState(false);
  const secret = identity?.secret ?? null;
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    const codes = snapshot().map((g) => g.code);
    if (!secret || codes.length === 0 || busy.current) return;
    busy.current = true;
    try {
      const summaries = await fetchSummaries(secret, codes);
      write(mergeSummaries(snapshot(), summaries));
      setStale(false);
    } catch {
      setStale(true);
    } finally {
      busy.current = false;
    }
  }, [secret]);

  useEffect(() => {
    void refresh();
  }, [refresh, poll]);

  useEffect(() => {
    const onVisible = (): void => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  useEffect(() => {
    if (!poll) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_EVERY);
    return () => clearInterval(timer);
  }, [poll, refresh]);

  return { games, waiting: waitingOn(games), stale, refresh };
}
