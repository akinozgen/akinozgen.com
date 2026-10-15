import { MAX_SUMMARY, type RoomInfo, type Summary, type Table } from "@harfiyen/engine";
import { readJson, writeJson } from "@travelle/core";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ApiError, callApi } from "./api.ts";
import { moveDeviceGames } from "./device.ts";
import { ownerOf, type Session } from "./session.ts";

/**
 * The online rooms the signed-in account plays in. The server keeps the
 * list, the same on every device; this browser keeps a copy, each room with
 * the last summary heard — from the server's summary endpoint, or from the
 * room itself while it's open — so the list shows at once and is brought up
 * to date behind it. The copy says whose it is: another account signing in
 * here starts from an empty one.
 */

export type LiveSummary = Exclude<Summary, { gone: true }>;

export interface MyGame {
  code: string;
  /** When this browser first had it. */
  added: number;
  summary: LiveSummary | null;
}

const KEY = "harfiyen:online:v1";
/** Which account the copy belongs to (see `ownerOf`); none for a list from before accounts. */
const OWNER_KEY = "harfiyen:online-owner:v1";
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

function readOwner(): string | null {
  const owner = readJson<unknown>(OWNER_KEY);
  return typeof owner === "string" ? owner : null;
}

interface Stored {
  owner: string | null;
  games: MyGame[];
}

let cache: Stored | null = null;
const listeners = new Set<() => void>();
const NONE: MyGame[] = [];

function snapshot(): Stored {
  cache ??= { owner: readOwner(), games: read() };
  return cache;
}

function write(games: MyGame[], owner: string | null = snapshot().owner): void {
  cache = { owner, games: prune(games) };
  writeJson(KEY, cache.games);
  if (owner !== null) writeJson(OWNER_KEY, owner);
  for (const listener of listeners) listener();
}

/**
 * The copy becomes `owner`'s: one from before accounts is kept (its rooms
 * are about to move over), another account's is emptied.
 */
function claim(owner: string): void {
  const { owner: was, games } = snapshot();
  if (was !== owner) write(was === null ? games : [], owner);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab changed the list.
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== KEY && event.key !== OWNER_KEY && event.key !== null) return;
    cache = null;
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
  const games = snapshot().games;
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
  const games = snapshot().games;
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

/**
 * The list with the server's news in it: summaries replace older ones;
 * rooms that are gone, or where the account has no seat, go; the account's
 * rooms this browser didn't know of (played on another device) come in.
 */
export function mergeSummaries(games: MyGame[], summaries: readonly Summary[], now: number = Date.now()): MyGame[] {
  const news = new Map(summaries.map((s) => [s.code, s]));
  const kept = games.flatMap((game) => {
    const fresh = news.get(game.code);
    if (!fresh) return [game];
    if (fresh.gone || fresh.you === null) return [];
    if (game.summary && game.summary.updatedAt > fresh.updatedAt) return [game];
    return [{ ...game, summary: fresh }];
  });
  const known = new Set(games.map((game) => game.code));
  const added = [...news.values()].flatMap((fresh): MyGame[] =>
    fresh.gone || fresh.you === null || known.has(fresh.code) ? [] : [{ code: fresh.code, added: now, summary: fresh }],
  );
  return [...kept, ...added];
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

/**
 * The account's rooms and these, from the server: the codes twenty at a
 * time, in the query; the account comes from the session cookie.
 */
export async function fetchSummaries(codes: readonly string[]): Promise<Summary[]> {
  const out: Summary[] = [];
  let i = 0;
  do {
    const asked = codes.slice(i, i + MAX_SUMMARY);
    const body = await callApi<{ rooms?: unknown }>("ozet", asked.length > 0 ? { k: asked.join(",") } : {});
    if (Array.isArray(body.rooms)) out.push(...(body.rooms as Summary[]));
    i += MAX_SUMMARY;
  } while (i < codes.length);
  return out;
}

export interface MyGamesApi {
  /** The signed-in account's games; none while nobody is. */
  games: MyGame[];
  /** Games where it's this player's turn, for the badge. */
  waiting: number;
  /** The last refresh didn't reach the server. */
  stale: boolean;
  /** How many of the old device's games just moved to the account; 0 until some do. */
  moved: number;
  refresh: () => Promise<void>;
}

/**
 * The list of games, refreshed from the server on mount, when the tab comes
 * back, and — while `poll` (the list is on screen) — every minute. The
 * first refresh after signing in on a browser that played before accounts
 * moves that device's games over first (see device.ts).
 */
export function useMyGames(session: Session, poll = false): MyGamesApi {
  const stored = useSyncExternalStore(subscribe, snapshot, snapshot);
  const owner = session.status === "in" && session.user ? ownerOf(session.user) : null;
  const [stale, setStale] = useState(false);
  const [moved, setMoved] = useState(0);
  const busy = useRef(false);

  // Another account's copy is never shown; it goes when this one's arrives.
  const games = owner !== null && (stored.owner === owner || stored.owner === null) ? stored.games : NONE;

  const refresh = useCallback(async () => {
    if (owner === null || busy.current) return;
    busy.current = true;
    try {
      claim(owner);
      const done = await moveDeviceGames(snapshot().games.map((g) => g.code));
      if (done.length > 0) setMoved(done.length);
      const summaries = await fetchSummaries(snapshot().games.map((g) => g.code));
      // Someone else signed in while this was on its way: their list isn't this one.
      if (snapshot().owner === owner) write(mergeSummaries(snapshot().games, summaries));
      setStale(false);
    } catch (error) {
      // A session that's gone shows as the sign-in, not as a list that's behind.
      if (!(error instanceof ApiError && error.code === "oturum")) setStale(true);
    } finally {
      busy.current = false;
    }
  }, [owner]);

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

  return { games, waiting: waitingOn(games), stale: owner !== null && stale, moved, refresh };
}
