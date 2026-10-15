import { type Action, apply, type Game, newGame } from "../game.ts";
import type { Lexicon } from "../lexicon.ts";
import { cleanName, defaultName, displayName } from "../names.ts";
import { makeRules, TILE_SET } from "../rules.ts";
import { loadGame, saveGame } from "../save.ts";
import { tableToJson, viewOf } from "../view.ts";
import { upper } from "../alphabet.ts";
import type { Turn } from "../game.ts";
import { fromWire, type Phase, type PushSub, type RoomInfo, type RoomMessage, type RoomRequest, type Summary } from "./protocol.ts";
import type { Notice } from "./webpush.ts";

/**
 * One online room, as plain data and pure functions: who sits where, the
 * game, what a request does to them. The Durable Object around it only
 * stores this record, carries messages and keeps the sockets; everything
 * here can be tested without Cloudflare.
 *
 * The whole room is one record, so each move is one row written.
 */
export interface Room {
  v: 1;
  code: string;
  phase: Phase;
  createdAt: number;
  updatedAt: number;
  /** The seat that sent the invitation, while it waits for an answer. */
  host: number | null;
  /** Each seat's public id, or null while empty. */
  seats: (string | null)[];
  /** The names the players chose, cleaned; null keeps the device's default. */
  names?: (string | null)[];
  /** Games started in this room. */
  gameNo: number;
  rematch: boolean[];
  /** The game, as `saveGame` writes it; null before the first one starts. */
  game: string | null;
  /** Nobody moved for too long, and the game was closed without a result. */
  abandoned?: boolean;
  /** Where to send each seat's notices while it's away. */
  push?: (PushSub | null)[];
  /** Nudges each seat has used this game, and when each last nudged. */
  nudged?: number[];
  nudgedAt?: number[];
}

/** Nudges a player gets per game. */
export const NUDGES = 5;
/** How long a player waits between nudges. */
export const NUDGE_GAP = 30_000;

const DAY = 86_400_000;
/** An invitation nobody answers is cleared after a week. */
export const INVITE_TTL = 7 * DAY;
/** A game nobody moves in for a month is closed. */
export const IDLE_TTL = 30 * DAY;
/** A finished room stays a week, for the result and a rematch. */
export const OVER_TTL = 7 * DAY;

/** What the room needs from outside: the time, fresh randomness and the dictionary. */
export interface Deps {
  now: () => number;
  /** A fresh, unguessable seed. */
  seed: () => string;
  /** A number in [0, 1). */
  random: () => number;
  lexicon: () => Lexicon;
}

/** What handling a request comes to. */
export interface Outcome {
  room: Room | null;
  /** The record changed and must be stored (null: delete the room). */
  changed: boolean;
  /** Everyone connected should get the new state. */
  broadcast: boolean;
  /** A message for the sender alone. */
  reply?: RoomMessage;
  /** The sender's view is out of date: send them the current state. */
  resend?: boolean;
  /** The sender nudged this seat. */
  nudge?: number;
}

function start(room: Room, deps: Deps, first: number): Room {
  const seed = deps.seed();
  const game = newGame(seed, makeRules(seed, "klasik"), TILE_SET, 2, first);
  const now = deps.now();
  return {
    ...room,
    phase: "playing",
    game: saveGame(game),
    gameNo: room.gameNo + 1,
    rematch: [false, false],
    nudged: [0, 0],
    nudgedAt: [0, 0],
    updatedAt: now,
    host: null,
    abandoned: undefined,
  };
}

/** A new invitation: the host takes a seat chosen at random, the other waits for whoever opens the link. */
export function createInvite(code: string, host: string, deps: Deps, name?: string): Room {
  const seat = deps.random() < 0.5 ? 0 : 1;
  const seats: (string | null)[] = [null, null];
  const names: (string | null)[] = [null, null];
  seats[seat] = host;
  names[seat] = cleanName(name);
  const now = deps.now();
  return { v: 1, code, phase: "waiting", createdAt: now, updatedAt: now, host: seat, seats, names, gameNo: 0, rematch: [false, false], game: null };
}

/** Two players paired by the lobby: both seated, the game under way, either may start. */
export function createMatched(code: string, players: [string, string], deps: Deps, chosen: [string?, string?] = []): Room {
  const flip = deps.random() < 0.5;
  const names = chosen.map((name) => cleanName(name));
  const now = deps.now();
  const room: Room = {
    v: 1,
    code,
    phase: "waiting",
    createdAt: now,
    updatedAt: now,
    host: null,
    seats: flip ? [players[1], players[0]] : [...players],
    names: flip ? [names[1] ?? null, names[0] ?? null] : [names[0] ?? null, names[1] ?? null],
    gameNo: 0,
    rematch: [false, false],
    game: null,
  };
  return start(room, deps, deps.random() < 0.5 ? 0 : 1);
}

export const seatOf = (room: Room, pub: string | null): number | null => {
  if (!pub) return null;
  const seat = room.seats.indexOf(pub);
  return seat === -1 ? null : seat;
};

const gameOf = (room: Room): Game | null => (room.game ? loadGame(room.game) : null);

/** What others see a seat called: its chosen name or the device's default, and its number. */
export const nameAt = (room: Room, seat: number): string | null => {
  const pub = room.seats[seat];
  return pub ? displayName(room.names?.[seat] ?? defaultName(pub), pub) : null;
};

/** A seated player's chosen name, as their latest hello gave it; null if it changes nothing. */
export function rename(room: Room, pub: string, name: string | undefined): Room | null {
  const seat = seatOf(room, pub);
  if (seat === null || name === undefined) return null;
  const clean = cleanName(name);
  const names = [...(room.names ?? [null, null])];
  if ((names[seat] ?? null) === clean) return null;
  names[seat] = clean;
  return { ...room, names };
}

/** The room as `pub` sees it; `online` says which seats have a socket open. */
export function roomInfo(room: Room, pub: string | null, online: readonly boolean[]): RoomInfo {
  return {
    code: room.code,
    phase: room.phase,
    you: seatOf(room, pub),
    seats: room.seats.map((seat, i) => (seat ? { name: nameAt(room, i)!, online: online[i] ?? false } : null)),
    host: room.phase === "waiting" ? room.host : null,
    gameNo: room.gameNo,
    rematch: [...room.rematch],
    nudges: room.seats.map((_, i) => NUDGES - (room.nudged?.[i] ?? 0)),
    ...(room.abandoned ? { abandoned: true } : {}),
    updatedAt: room.updatedAt,
  };
}

/** The state message for one browser: the room, and its own table if it has a seat and a game is on. */
export function stateFor(room: Room, pub: string | null, online: readonly boolean[]): RoomMessage {
  const seat = seatOf(room, pub);
  const game = seat === null ? null : gameOf(room);
  return {
    t: "room",
    room: roomInfo(room, pub, online),
    table: game && seat !== null ? tableToJson(viewOf(game, seat, `${room.code}:${room.gameNo}`)) : null,
  };
}

/** The room for the list of games, as `pub` sees it. */
export function summaryOf(room: Room | null, code: string, pub: string): Summary {
  if (!room) return { code, gone: true };
  const game = gameOf(room);
  return {
    code,
    phase: room.phase,
    you: seatOf(room, pub),
    turn: game && !game.over && room.phase === "playing" ? game.turn : null,
    names: room.seats.map((_, i) => nameAt(room, i)),
    scores: game ? [...game.scores] : [0, 0],
    winner: game?.over?.winner ?? null,
    rematch: [...room.rematch],
    ...(room.abandoned ? { abandoned: true } : {}),
    updatedAt: room.updatedAt,
  };
}

const unchanged = (room: Room, reply?: RoomMessage): Outcome => ({ room, changed: false, broadcast: false, reply });

/**
 * A request from the browser whose device is `pub` (already identified by
 * its `hello`). Rules and turns are the engine's; the room adds seats, the
 * stale-action check, rematches and withdrawing an invitation.
 */
export function handle(
  room: Room,
  pub: string,
  /** Chat (`say`, `mute`) is the chat's business, not the room's. */
  request: Exclude<RoomRequest, { t: "hello" | "say" | "mute" }>,
  deps: Deps,
  /** The name the sender's hello gave, for taking a seat. */
  name?: string,
): Outcome {
  const seat = seatOf(room, pub);
  const now = deps.now();

  switch (request.t) {
    case "join": {
      if (seat !== null) return unchanged(room);
      if (room.phase !== "waiting") return unchanged(room, { t: "error", code: "dolu" });
      const free = room.seats.indexOf(null);
      if (free === -1) return unchanged(room, { t: "error", code: "dolu" });
      const seats = [...room.seats];
      seats[free] = pub;
      const names = [...(room.names ?? [null, null])];
      names[free] = cleanName(name);
      return { room: start({ ...room, seats, names }, deps, deps.random() < 0.5 ? 0 : 1), changed: true, broadcast: true };
    }
    case "cancel": {
      if (room.phase !== "waiting" || seat === null || seat !== room.host) return unchanged(room);
      return { room: null, changed: true, broadcast: true };
    }
    case "nudge": {
      const game = gameOf(room);
      if (seat === null || room.phase !== "playing" || !game || game.turn === seat) return unchanged(room);
      const used = room.nudged?.[seat] ?? 0;
      const wait = Math.max(0, (room.nudgedAt?.[seat] ?? 0) + NUDGE_GAP - now);
      if (used >= NUDGES || wait > 0) return unchanged(room, { t: "nudgeRefused", left: NUDGES - used, wait });
      const nudged = [...(room.nudged ?? [0, 0])];
      const nudgedAt = [...(room.nudgedAt ?? [0, 0])];
      nudged[seat] = used + 1;
      nudgedAt[seat] = now;
      return { room: { ...room, nudged, nudgedAt }, changed: true, broadcast: true, nudge: 1 - seat };
    }
    case "push": {
      if (seat === null) return unchanged(room);
      const push = [...(room.push ?? [null, null])];
      if (JSON.stringify(push[seat]) === JSON.stringify(request.sub)) return unchanged(room);
      push[seat] = request.sub;
      return { room: { ...room, push }, changed: true, broadcast: false };
    }
    case "rematch": {
      const game = gameOf(room);
      if (seat === null || room.phase !== "over" || !game || room.rematch[seat]) return unchanged(room);
      const rematch = [...room.rematch];
      rematch[seat] = true;
      if (rematch.every(Boolean)) {
        // Whoever didn't start the last game starts this one.
        return { room: start({ ...room, rematch }, deps, 1 - (game.first ?? 0)), changed: true, broadcast: true };
      }
      return { room: { ...room, rematch, updatedAt: now }, changed: true, broadcast: true };
    }
    default: {
      if (seat === null) return unchanged(room, { t: "error", code: "kimlik" });
      const game = gameOf(room);
      if (!game || room.phase !== "playing") return unchanged(room);
      let action: Action;
      switch (request.t) {
        case "play":
          action = { kind: "play", placements: request.p.map(fromWire) };
          break;
        case "swap":
          action = { kind: "swap", tiles: request.tiles };
          break;
        case "pass":
          action = { kind: "pass" };
          break;
        case "resign":
          action = { kind: "resign" };
          break;
      }
      // An action meant for a table the browser no longer has (a double tap, a crossed message) is
      // dropped; the sender gets the current state back.
      if (request.t !== "resign" && request.n !== game.log.length) return { room, changed: false, broadcast: false, resend: true };
      const outcome = apply(game, action, deps.lexicon(), seat);
      if (!outcome.ok) {
        return unchanged(room, { t: "refused", n: game.log.length, refusal: outcome.refusal });
      }
      const next: Room = {
        ...room,
        game: saveGame(outcome.game),
        phase: outcome.game.over ? "over" : "playing",
        updatedAt: now,
      };
      return { room: next, changed: true, broadcast: true };
    }
  }
}

/**
 * The room's alarm: an unanswered invitation is cleared, an idle game
 * closed, a finished room cleared. Returns the room (null: delete it) and
 * when to look again.
 */
export function onAlarm(room: Room, now: number): { room: Room | null; changed: boolean; next: number | null } {
  if (room.phase === "waiting") {
    const due = room.createdAt + INVITE_TTL;
    return now >= due ? { room: null, changed: true, next: null } : { room, changed: false, next: due };
  }
  if (room.phase === "playing") {
    const due = room.updatedAt + IDLE_TTL;
    if (now < due) return { room, changed: false, next: due };
    return { room: { ...room, phase: "over", abandoned: true, updatedAt: now }, changed: true, next: now + OVER_TTL };
  }
  const due = room.updatedAt + OVER_TTL;
  return now >= due ? { room: null, changed: true, next: null } : { room, changed: false, next: due };
}

const said = (turn: Turn): string => {
  switch (turn.kind) {
    case "play":
      return `${turn.words.map(upper).join(", ")} yazdı, +${turn.score}`;
    case "swap":
      return `${turn.count} harf değiştirdi`;
    case "pass":
      return "pas geçti";
    case "resign":
      return "pes etti";
  }
};

/**
 * What each seat should hear about a change, if it isn't there to see it:
 * its turn has come, its invitation was taken, the game ended, a rematch
 * was asked for or started. The room decides who is away; this only says
 * what to tell them.
 */
export function noticesFor(before: Room, after: Room): { seat: number; notice: Notice }[] {
  const url = `#/oda/${after.code}`;
  const tag = after.code;
  const name = (seat: number): string => nameAt(after, seat) ?? "Rakibin";
  const out: { seat: number; notice: Notice }[] = [];
  const game = gameOf(after);
  if (!game) return out;

  const started = after.gameNo > before.gameNo;
  if (started && before.phase === "waiting" && before.host !== null) {
    const host = before.host;
    out.push({
      seat: host,
      notice: { title: "Davetin kabul edildi", body: `${name(1 - host)} katıldı. ${game.turn === host ? "İlk hamle senin." : "İlk hamle onda."}`, url, tag },
    });
    return out;
  }
  if (started) {
    // A rematch: both asked; the first to ask may have gone.
    for (const seat of [0, 1]) {
      out.push({ seat, notice: { title: "Rövanş başladı", body: game.turn === seat ? "İlk hamle senin." : `İlk hamle ${name(1 - seat)}'de.`, url, tag } });
    }
    return out;
  }

  const was = before.game ? loadGame(before.game) : null;
  if (was && game.log.length > was.log.length) {
    const turn = game.log[game.log.length - 1];
    const other = 1 - turn.player;
    if (game.over) {
      const winner = game.over.winner;
      const score = `${game.scores[other]}–${game.scores[turn.player]}`;
      const body =
        turn.kind === "resign"
          ? `${name(turn.player)} pes etti. Kazandın.`
          : winner === other
            ? `Kazandın, ${score}.`
            : winner === null
              ? `Berabere, ${score}.`
              : `${name(turn.player)} kazandı, ${score}.`;
      out.push({ seat: other, notice: { title: "Oyun bitti", body, url, tag } });
    } else if (game.turn === other) {
      out.push({ seat: other, notice: { title: "Sıra sende", body: `${name(turn.player)} ${said(turn)}.`, url, tag } });
    }
    return out;
  }

  for (const seat of [0, 1]) {
    if (after.rematch[seat] && !before.rematch[seat]) {
      out.push({ seat: 1 - seat, notice: { title: "Rövanş", body: `${name(seat)} rövanş istiyor.`, url, tag } });
    }
  }
  return out;
}
