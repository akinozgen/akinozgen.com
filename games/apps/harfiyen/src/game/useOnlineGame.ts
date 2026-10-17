import {
  type ChatLine,
  emptyBoard,
  type ErrorCode,
  makeRules,
  PROTOCOL,
  type Refusal,
  type RoomInfo,
  type RoomMessage,
  type Table,
  tableFromJson,
  TILE_SET,
  toWire,
} from "@harfiyen/engine";
import { readJson, writeJson } from "@travelle/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Lexicons } from "./lexicons.ts";
import { forgetGame, rememberGame, summaryOf } from "./myGames.ts";
import { pushMessage, subscribePush } from "./push.ts";
import { sessionLost } from "./session.ts";
import { HIDDEN_GRACE, type Link, type LinkState, openLink, type SocketConstructor, socketUrl } from "./socket.ts";
import { playPop, playTing } from "./sound.ts";
import { arrange, type PlayApi, useHand } from "./useHand.ts";

/** How long an action may go unanswered before the buttons come back. */
export const ANSWER_WITHIN = 15_000;

const RACKS_KEY = "harfiyen:online-racks:v1";

const WAITING_RULES = { ...makeRules("bekleme", "klasik"), star: -1 };
const FULL_BAG = TILE_SET.counts.reduce((sum, n) => sum + n, 0) + TILE_SET.jokers;

/** The table before a game: an empty board, nobody's turn, nothing on the rack. */
export function emptyTable(seat: number): Table {
  return {
    id: "bekleme",
    rules: WAITING_RULES,
    board: emptyBoard(),
    scores: [0, 0],
    turn: -1,
    first: 0,
    log: [],
    idle: 0,
    over: null,
    seat,
    rack: [],
    bagCount: FULL_BAG,
  };
}

/** The rack order the player chose in each room, so a reload keeps it. */
function savedRack(code: string): number[] | null {
  return readJson<Record<string, number[]>>(RACKS_KEY)?.[code] ?? null;
}

/** Racks kept, the most recently arranged last; older rooms' orders are let go. */
const KEEP_RACKS = 30;

function saveRack(code: string, view: number[]): void {
  const all = readJson<Record<string, number[]>>(RACKS_KEY) ?? {};
  if (all[code]?.join(",") === view.join(",")) return;
  delete all[code];
  const kept = Object.entries(all).slice(-(KEEP_RACKS - 1));
  writeJson(RACKS_KEY, Object.fromEntries([...kept, [code, view]]));
}

export function forgetRack(code: string): void {
  const all = readJson<Record<string, number[]>>(RACKS_KEY);
  if (!all || !(code in all)) return;
  delete all[code];
  writeJson(RACKS_KEY, all);
}

const CHAT_SEEN_KEY = "harfiyen:chat-seen:v1";
/** Chat lines kept on screen; the server sends the last 50 on each connection. */
const CHAT_KEEP = 100;
/** Rooms whose last line seen is remembered, the most recently read last. */
const KEEP_SEEN = 50;

/** The newest chat line the player has seen in a room; 0 for none. */
function seenIn(code: string): number {
  const id = readJson<Record<string, number>>(CHAT_SEEN_KEY)?.[code];
  return typeof id === "number" && Number.isFinite(id) ? id : 0;
}

function saveSeen(code: string, id: number): void {
  const stored = readJson<Record<string, number>>(CHAT_SEEN_KEY);
  const all = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  delete all[code];
  const kept = Object.entries(all).slice(-(KEEP_SEEN - 1));
  writeJson(CHAT_SEEN_KEY, Object.fromEntries([...kept, [code, id]]));
}

function forgetSeen(code: string): void {
  const all = readJson<Record<string, number>>(CHAT_SEEN_KEY);
  if (!all || typeof all !== "object" || !(code in all)) return;
  delete all[code];
  writeJson(CHAT_SEEN_KEY, all);
}

/** Lines by id, oldest first, each once, the newest `CHAT_KEEP`. */
function tidyLines(lines: readonly ChatLine[]): ChatLine[] {
  const byId = new Map(lines.map((line) => [line.id, line]));
  return [...byId.values()].sort((a, b) => a.id - b.id).slice(-CHAT_KEEP);
}

/** A chat line the server turned down: too soon (`until`, ms since the epoch), or nothing left of it (`until` 0). */
export interface SayRefusal {
  /** Tells one refusal from the next. */
  id: number;
  until: number;
}

/** The room's chat, as this player has it. */
export interface Chat {
  /** Chat is possible here: this browser has a seat and both seats are taken. */
  open: boolean;
  /** The lines so far, oldest first; while muted, the other player's are left out. */
  lines: ChatLine[];
  /** This player has hidden the other's lines. */
  muted: boolean;
  /** The other player's lines this player hasn't seen yet. */
  unread: number;
  /** The other player's newest line, once it arrives with the room open (never one from the history). */
  heard: ChatLine | null;
  /** The last line that didn't go, until the next one does. */
  refused: SayRefusal | null;
  /** Sends a line, typed or ready-made; false if it couldn't go. */
  say: (text: string) => boolean;
  /** Hides the other player's lines, here and in notices, or shows them again. */
  mute: (on: boolean) => void;
  /** The player has seen the chat up to line `id`. */
  see: (id: number) => void;
}

export type Connection = LinkState;

/** How long a player waits between nudges, as the server counts it. */
export const NUDGE_GAP = 30_000;

/** A nudge that arrived: which seat sent it; `id` tells one from the next. */
export interface Nudge {
  id: number;
  from: number;
}

export interface OnlineGame extends PlayApi {
  room: RoomInfo | null;
  /** A game has been dealt to this player: `table` is theirs, not the empty one. */
  dealt: boolean;
  connection: Connection;
  error: ErrorCode | null;
  join: () => void;
  rematch: () => void;
  cancel: () => void;
  /** Nudges this player has left this game. */
  nudgesLeft: number;
  /** When the next nudge may go (ms since the epoch); 0 for now. */
  nudgeAfter: number;
  /** Nudges the other player, whose turn it is. */
  nudge: () => void;
  /** The last nudge this player got, if any. */
  nudged: Nudge | null;
  chat: Chat;
}

/**
 * A game with another person, held by the server: the room's socket, the
 * table it sends, and the same hand as against the computer. The browser
 * only ever has its own rack; every move goes to the server, which answers
 * with the new table for both players or says why not. The player is the
 * signed-in account; a socket that finds no session says `oturum`, and the
 * online screens offer the sign-in.
 */
export function useOnlineGame(
  code: string,
  lexicons: Lexicons | null,
  options: {
    /** The account's name: a new one reaches the room on a fresh line, since the room takes the name a line opens with. */
    name?: string;
    WebSocket?: SocketConstructor;
  } = {},
): OnlineGame {
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [table, setTable] = useState<Table | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [error, setError] = useState<ErrorCode | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  /** The turn count an action was sent at, until the server answers it. */
  const [pending, setPending] = useState<number | null>(null);
  const [nudgeAfter, setNudgeAfter] = useState(0);
  const [nudged, setNudged] = useState<Nudge | null>(null);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [muted, setMuted] = useState(false);
  const [heard, setHeard] = useState<ChatLine | null>(null);
  const [sayRefused, setSayRefused] = useState<SayRefusal | null>(null);
  const [seenId, setSeenId] = useState(() => seenIn(code));
  const seenRef = useRef(seenId);
  const link = useRef<Link | null>(null);
  const WebSocketImpl = options.WebSocket;
  const name = options.name;

  useEffect(() => {
    const greeting = () => ({ t: "hello", v: PROTOCOL });
    // Once seated, each connection says where this browser's notices go (the server ignores a repeat).
    let seated = false;
    let told = false;
    // The table as last seen on this line: a move by the other side since then rings. A line's
    // first state (a reconnect) and a resend of the same state don't.
    let seen: { id: string; length: number } | null = null;
    // This browser's seat, to tell its own chat lines from the other's; and the lines already here.
    let seat: number | null = null;
    const known = new Set<number>();
    let refusals = 0;
    const tellPush = (): void => {
      const message = pushMessage();
      if (message) opened.send(message);
    };
    setConnection("connecting");
    const opened = openLink<RoomMessage>({
      url: socketUrl(`/api/harfiyen/ws/oda/${code}`),
      greeting,
      WebSocket: WebSocketImpl,
      // With notices on, a page left in the background lets the server count it away, so they're sent;
      // without them it keeps the line, so the tab's title can still say it's your turn.
      hiddenGrace: () => (pushMessage()?.sub ? HIDDEN_GRACE : Number.POSITIVE_INFINITY),
      onState: (state) => {
        setConnection(state);
        if (state === "connecting") {
          told = false;
          seen = null;
        }
        // Whatever was on its way is lost with the line; the state sent on reconnecting says what landed.
        if (state !== "open") setPending(null);
      },
      onMessage: (message) => {
        switch (message.t) {
          case "room": {
            const next = message.table === null ? null : tableFromJson(message.table);
            if (next) {
              const last = next.log[next.log.length - 1];
              if (seen && seen.id === next.id && next.log.length > seen.length && last && last.player !== next.seat) playTing();
              seen = { id: next.id, length: next.log.length };
            }
            setRoom(message.room);
            setTable(next);
            setError(null);
            setPending((sent) =>
              sent === null || next === null || next.over || next.log.length !== sent || message.room.phase !== "playing"
                ? null
                : sent,
            );
            seat = message.room.you;
            seated = seat !== null;
            if (seated) {
              rememberGame(code, summaryOf(message.room, next));
              if (!told) {
                told = true;
                tellPush();
              }
            }
            break;
          }
          case "refused":
            setPending(null);
            setRefusal(message.refusal);
            break;
          case "nudge":
            setNudged({ id: Date.now(), from: message.from });
            break;
          case "nudgeRefused":
            setNudgeAfter(message.wait > 0 ? Date.now() + message.wait : 0);
            break;
          // The whole chat, on each connection and after muting: it replaces what's here, quietly.
          case "chat":
            known.clear();
            for (const line of message.lines) known.add(line.id);
            setLines(tidyLines(message.lines));
            setMuted(message.muted);
            break;
          // One new line: the player's own coming back (from this tab or another), or the other's, which pops.
          case "said": {
            const line = message.line;
            if (known.has(line.id)) break;
            known.add(line.id);
            setLines((all) => tidyLines([...all, line]));
            if (line.from === seat) {
              setSayRefused(null);
            } else {
              setHeard(line);
              playPop();
            }
            break;
          }
          case "sayRefused":
            refusals += 1;
            setSayRefused({ id: refusals, until: message.wait > 0 ? Date.now() + message.wait : 0 });
            break;
          case "error":
            setError(message.code);
            setPending(null);
            if (message.code === "yok" || message.code === "iptal") {
              forgetGame(code);
              forgetRack(code);
              forgetSeen(code);
            }
            if (message.code === "oturum") sessionLost();
            break;
        }
      },
    });
    link.current = opened;
    // Notices turned on or off while the room is open.
    const unsubscribePush = subscribePush(() => seated && tellPush());
    return () => {
      unsubscribePush();
      opened.close();
      link.current = null;
    };
  }, [code, WebSocketImpl, name]);

  const seat = room?.you ?? (room?.host === null || room?.host === undefined ? 0 : 1 - room.host);
  const shown = useMemo(() => table ?? emptyTable(seat), [table, seat]);
  const playing = room?.phase === "playing" && table !== null && !table.over;
  const yourTurn = playing && table.turn === table.seat;
  const hand = useHand(shown.rack, shown.board, shown.rules, lexicons?.full ?? null, playing);

  // The rack keeps the order the player gave it, across reloads too.
  const restored = useRef(false);
  const { setView } = hand;
  useEffect(() => {
    if (!table || restored.current) return;
    restored.current = true;
    const saved = savedRack(code);
    if (saved) setView(arrange(saved, table.rack));
  }, [table, code, setView]);
  useEffect(() => {
    if (table && hand.view.length > 0) saveRack(code, hand.view);
  }, [code, table, hand.view]);

  // Moving tiles about clears the last complaint.
  useEffect(() => setRefusal(null), [hand.draft]);

  // An answer that never comes doesn't keep the buttons off for good; the turn count guards a resend.
  useEffect(() => {
    if (pending === null) return;
    const timer = setTimeout(() => setPending(null), ANSWER_WITHIN);
    return () => clearTimeout(timer);
  }, [pending]);

  const busy = pending !== null || connection !== "open";

  const act = useCallback(
    (message: { t: string; n?: number; [key: string]: unknown }) => {
      if (!table || !link.current) return;
      if (link.current.send(message)) {
        setRefusal(null);
        setPending(table.log.length);
      }
    },
    [table],
  );

  const submit = useCallback(() => {
    if (!yourTurn || busy || !table) return;
    act({ t: "play", n: table.log.length, p: hand.placements.map(toWire) });
  }, [yourTurn, busy, table, act, hand.placements]);

  const swap = useCallback(
    (slots: number[]) => {
      if (!yourTurn || busy || !table) return;
      act({ t: "swap", n: table.log.length, tiles: slots.map((slot) => hand.view[slot]) });
    },
    [yourTurn, busy, table, act, hand.view],
  );

  const pass = useCallback(() => {
    if (!yourTurn || busy || !table) return;
    act({ t: "pass", n: table.log.length });
  }, [yourTurn, busy, table, act]);

  /** Resigning works on either turn. */
  const resign = useCallback(() => {
    if (!playing) return;
    act({ t: "resign" });
  }, [playing, act]);

  const join = useCallback(() => {
    link.current?.send({ t: "join" });
  }, []);

  const rematch = useCallback(() => {
    link.current?.send({ t: "rematch" });
  }, []);

  const cancel = useCallback(() => {
    if (link.current?.send({ t: "cancel" })) {
      forgetGame(code);
      forgetRack(code);
    }
  }, [code]);

  const nudgesLeft = room && room.you !== null ? (room.nudges?.[room.you] ?? 0) : 0;
  const theirTurn = playing && table.turn !== table.seat;
  /** The wait starts when it goes; should the server count otherwise, its refusal says how long. */
  const nudge = useCallback(() => {
    if (!theirTurn || nudgesLeft <= 0 || Date.now() < nudgeAfter) return;
    if (link.current?.send({ t: "nudge" })) setNudgeAfter(Date.now() + NUDGE_GAP);
  }, [theirTurn, nudgesLeft, nudgeAfter]);

  const me = room?.you ?? null;
  const chatOpen = me !== null && room !== null && room.phase !== "waiting";
  const unread = me === null ? 0 : lines.filter((line) => line.from !== me && line.id > seenId).length;

  /** A line goes as typed, trimmed; the server cleans it and sends it back to both sides. */
  const say = useCallback(
    (text: string): boolean => {
      const line = text.trim();
      if (!chatOpen || !line || (sayRefused && sayRefused.until > Date.now())) return false;
      if (!link.current?.send({ t: "say", text: line })) return false;
      setSayRefused(null);
      return true;
    },
    [chatOpen, sayRefused],
  );

  /** The server answers with the whole chat again, as the new setting has it. */
  const mute = useCallback(
    (on: boolean) => {
      if (chatOpen) link.current?.send({ t: "mute", on });
    },
    [chatOpen],
  );

  const see = useCallback(
    (id: number) => {
      if (id <= seenRef.current) return;
      seenRef.current = id;
      saveSeen(code, id);
      setSeenId(id);
    },
    [code],
  );

  const chat = useMemo<Chat>(
    () => ({ open: chatOpen, lines, muted, unread, heard, refused: sayRefused, say, mute, see }),
    [chatOpen, lines, muted, unread, heard, sayRefused, say, mute, see],
  );

  return {
    ...hand,
    table: shown,
    refusal,
    yourTurn,
    busy,
    submit,
    swap,
    pass,
    resign,
    room,
    dealt: table !== null,
    connection,
    error,
    join,
    rematch,
    cancel,
    nudgesLeft,
    nudgeAfter,
    nudge,
    nudged,
    chat,
  };
}
