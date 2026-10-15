import type { Refusal } from "../game.ts";
import { type PushSub, validSub } from "./webpush.ts";

export type { PushSub } from "./webpush.ts";

/**
 * What browsers and the server say to each other, in JSON. A version
 * travels with the first message; a browser running older code is told to
 * reload rather than misunderstood.
 *
 *   GET  /api/harfiyen/oda?v&name                        → {code}          a new invitation
 *   GET  /api/harfiyen/ozet?v&k=CODE,CODE (≤20)          → {rooms: Summary[]}
 *        (the device secret in the X-Harfiyen-Secret header; POST with a JSON body works too,
 *        but the site's firewall lets only GET through)
 *   GET  /api/harfiyen/vapid                             → {key}           for PushManager.subscribe
 *   WS   /api/harfiyen/ws/oda/:code    RoomRequest ⇄ RoomMessage
 *   WS   /api/harfiyen/ws/lobi         LobbyRequest ⇄ LobbyMessage
 *
 * The device secret goes in a header, a body or a first message, never in
 * a URL (URLs end up in logs). Every message from a browser is checked here
 * before anything acts on it.
 */
export const PROTOCOL = 1;

/** Largest message the server will read. */
export const MAX_MESSAGE = 4096;

/** How many rooms one summary request may ask about. */
export const MAX_SUMMARY = 20;

export type Phase = "waiting" | "playing" | "over";

export interface SeatInfo {
  name: string;
  online: boolean;
}

/** A room as one browser sees it. */
export interface RoomInfo {
  code: string;
  phase: Phase;
  /** This browser's seat; null for a visitor without one. */
  you: number | null;
  /** Who sits where; null for an empty seat. */
  seats: (SeatInfo | null)[];
  /** Which seat sent the invitation, while it waits. */
  host: number | null;
  /** Games played in this room so far, this one included. */
  gameNo: number;
  /** Which seats have asked for a rematch. */
  rematch: boolean[];
  /** Nudges each seat has left this game. */
  nudges: number[];
  /** Nobody moved for a month and the game was closed without a result. */
  abandoned?: boolean;
  updatedAt: number;
}

export type ErrorCode =
  /** No such room, or it has been cleared away. */
  | "yok"
  /** Both seats are taken. */
  | "dolu"
  /** The browser's code is older than the server's: reload. */
  | "surum"
  /** Too many messages, or too big. */
  | "limit"
  /** Online play is switched off for now. */
  | "kapali"
  /** A message that needs a seat came from a browser without one. */
  | "kimlik"
  /** The invitation was withdrawn. */
  | "iptal"
  /** Something didn't parse. */
  | "bozuk";

/** A placement on the wire: square, letter index, 1 for a joker. */
export type WirePlacement = [square: number, letter: number, joker: 0 | 1];

export type RoomRequest =
  /** `name` is the name the player chose, cleaned by the server; without one the device's default stands. */
  | { t: "hello"; v: number; secret: string; name?: string }
  /** Take the free seat of an invitation. */
  | { t: "join" }
  /** `n` is the number of turns the browser has seen: an action meant for an older table is ignored. */
  | { t: "play"; n: number; p: WirePlacement[] }
  | { t: "swap"; n: number; tiles: number[] }
  | { t: "pass"; n: number }
  | { t: "resign" }
  | { t: "rematch" }
  /** The host withdraws an invitation nobody has taken. */
  | { t: "cancel" }
  /** Where to send this seat's notices while it's away; null to stop. Sent after each hello. */
  | { t: "push"; sub: PushSub | null }
  /** Nudge the other player, whose turn it is: a few a game, not too often. */
  | { t: "nudge" };

export type RoomMessage =
  /** The room, and — for a seated player once a game has begun — their table (see `tableToJson`). */
  | { t: "room"; room: RoomInfo; table: unknown | null }
  /** An action the rules turned down; the table is unchanged. */
  | { t: "refused"; n: number; refusal: Refusal }
  /** The other player nudged this one: shake, ring, look. */
  | { t: "nudge"; from: number }
  /** A nudge that couldn't go: none left, or too soon after the last; `wait` ms until the next may. */
  | { t: "nudgeRefused"; left: number; wait: number }
  | { t: "error"; code: ErrorCode };

export type LobbyRequest = { t: "seek"; v: number; secret: string; name?: string };

export type LobbyMessage =
  /** Still looking; `seekers` counts everyone looking right now, this browser included. */
  | { t: "waiting"; seekers: number }
  /** Paired: the game is in room `code`, both seats already taken. */
  | { t: "matched"; code: string }
  | { t: "error"; code: ErrorCode };

/** One room for the list of games, read without opening it. */
export type Summary =
  | { code: string; gone: true }
  | {
      code: string;
      gone?: false;
      phase: Phase;
      you: number | null;
      turn: number | null;
      names: (string | null)[];
      scores: number[];
      winner: number | null;
      /** Which seats have asked for a rematch, once a game is over. */
      rematch?: boolean[];
      /** Closed for want of moves, without a result. */
      abandoned?: boolean;
      updatedAt: number;
    };

const SECRET = /^[0-9a-f]{32}$/;
const isInt = (x: unknown, min: number, max: number): x is number =>
  typeof x === "number" && Number.isInteger(x) && x >= min && x <= max;
const isSecret = (x: unknown): x is string => typeof x === "string" && SECRET.test(x);
/** A name as sent: any short string, cleaned later; anything else is dropped. */
const nameOf = (x: unknown): { name?: string } => (typeof x === "string" && x.length <= 64 ? { name: x } : {});

function parse(raw: string | ArrayBuffer): Record<string, unknown> | null {
  if (typeof raw !== "string" || raw.length > MAX_MESSAGE) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A browser's message to a room, checked field by field; null if it isn't one. */
export function parseRoomRequest(raw: string | ArrayBuffer): RoomRequest | null {
  const m = parse(raw);
  if (!m) return null;
  switch (m.t) {
    case "hello":
      return isInt(m.v, 0, 1_000_000) && isSecret(m.secret) ? { t: "hello", v: m.v, secret: m.secret, ...nameOf(m.name) } : null;
    case "join":
    case "resign":
    case "rematch":
    case "cancel":
    case "nudge":
      return { t: m.t };
    case "play": {
      if (!isInt(m.n, 0, 10_000) || !Array.isArray(m.p) || m.p.length < 1 || m.p.length > 7) return null;
      const p: WirePlacement[] = [];
      for (const item of m.p) {
        if (!Array.isArray(item) || item.length !== 3) return null;
        const [square, letter, joker] = item as unknown[];
        if (!isInt(square, 0, 224) || !isInt(letter, 0, 28) || (joker !== 0 && joker !== 1)) return null;
        p.push([square, letter, joker]);
      }
      return { t: "play", n: m.n, p };
    }
    case "swap":
      return isInt(m.n, 0, 10_000) &&
        Array.isArray(m.tiles) &&
        m.tiles.length >= 1 &&
        m.tiles.length <= 7 &&
        m.tiles.every((tile) => isInt(tile, 0, 29))
        ? { t: "swap", n: m.n, tiles: m.tiles as number[] }
        : null;
    case "pass":
      return isInt(m.n, 0, 10_000) ? { t: "pass", n: m.n } : null;
    case "push":
      if (m.sub === null) return { t: "push", sub: null };
      return validSub(m.sub)
        ? { t: "push", sub: { endpoint: m.sub.endpoint, keys: { p256dh: m.sub.keys.p256dh, auth: m.sub.keys.auth } } }
        : null;
    default:
      return null;
  }
}

export function parseLobbyRequest(raw: string | ArrayBuffer): LobbyRequest | null {
  const m = parse(raw);
  return m && m.t === "seek" && isInt(m.v, 0, 1_000_000) && isSecret(m.secret)
    ? { t: "seek", v: m.v, secret: m.secret, ...nameOf(m.name) }
    : null;
}

/** The body of a new invitation: `{v, secret, name?}`. */
export function parseCreate(raw: string): { v: number; secret: string; name?: string } | null {
  const m = parse(raw);
  return m && isInt(m.v, 0, 1_000_000) && isSecret(m.secret) ? { v: m.v, secret: m.secret, ...nameOf(m.name) } : null;
}

const CODE = /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$/;

/** The body of a summary request: `{v, secret, codes}`, codes deduplicated. */
export function parseSummaryRequest(raw: string): { v: number; secret: string; codes: string[] } | null {
  const m = parse(raw);
  if (!m || !isInt(m.v, 0, 1_000_000) || !isSecret(m.secret) || !Array.isArray(m.codes)) return null;
  if (m.codes.length > MAX_SUMMARY || !m.codes.every((code) => typeof code === "string" && CODE.test(code))) return null;
  return { v: m.v, secret: m.secret, codes: [...new Set(m.codes as string[])] };
}

/** A placement from the wire, for the engine. */
export const fromWire = ([square, letter, joker]: WirePlacement) => ({ square, letter, joker: joker === 1 });
export const toWire = (p: { square: number; letter: number; joker: boolean }): WirePlacement => [p.square, p.letter, p.joker ? 1 : 0];
