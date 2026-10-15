import {
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
import { deviceSecret, nameField, subscribeName } from "./identity.ts";
import type { Lexicons } from "./lexicons.ts";
import { forgetGame, rememberGame, summaryOf } from "./myGames.ts";
import { pushMessage, subscribePush } from "./push.ts";
import { HIDDEN_GRACE, type Link, type LinkState, openLink, type SocketConstructor, socketUrl } from "./socket.ts";
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

export type Connection = LinkState;

export interface OnlineGame extends PlayApi {
  room: RoomInfo | null;
  /** A game has been dealt to this player: `table` is theirs, not the empty one. */
  dealt: boolean;
  connection: Connection;
  error: ErrorCode | null;
  join: () => void;
  rematch: () => void;
  cancel: () => void;
}

/**
 * A game with another person, held by the server: the room's socket, the
 * table it sends, and the same hand as against the computer. The browser
 * only ever has its own rack; every move goes to the server, which answers
 * with the new table for both players or says why not.
 */
export function useOnlineGame(
  code: string,
  lexicons: Lexicons | null,
  options: { WebSocket?: SocketConstructor } = {},
): OnlineGame {
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [table, setTable] = useState<Table | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [error, setError] = useState<ErrorCode | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  /** The turn count an action was sent at, until the server answers it. */
  const [pending, setPending] = useState<number | null>(null);
  const link = useRef<Link | null>(null);
  const WebSocketImpl = options.WebSocket;

  useEffect(() => {
    const secret = deviceSecret();
    const greeting = () => ({ t: "hello", v: PROTOCOL, secret, ...nameField() });
    // Once seated, each connection says where this device's notices go (the server ignores a repeat).
    let seated = false;
    let told = false;
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
        if (state === "connecting") told = false;
        // Whatever was on its way is lost with the line; the state sent on reconnecting says what landed.
        if (state !== "open") setPending(null);
      },
      onMessage: (message) => {
        switch (message.t) {
          case "room": {
            const next = message.table === null ? null : tableFromJson(message.table);
            setRoom(message.room);
            setTable(next);
            setError(null);
            setPending((sent) =>
              sent === null || next === null || next.over || next.log.length !== sent || message.room.phase !== "playing"
                ? null
                : sent,
            );
            seated = message.room.you !== null;
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
          case "error":
            setError(message.code);
            setPending(null);
            if (message.code === "yok" || message.code === "iptal") {
              forgetGame(code);
              forgetRack(code);
            }
            break;
        }
      },
    });
    link.current = opened;
    // A new name reaches the room with a fresh greeting.
    const unsubscribe = subscribeName(() => opened.send(greeting()));
    // Notices turned on or off while the room is open.
    const unsubscribePush = subscribePush(() => seated && tellPush());
    return () => {
      unsubscribe();
      unsubscribePush();
      opened.close();
      link.current = null;
    };
  }, [code, WebSocketImpl]);

  const seat = room?.you ?? (room?.host === null || room?.host === undefined ? 0 : 1 - room.host);
  const shown = useMemo(() => table ?? emptyTable(seat), [table, seat]);
  const playing = room?.phase === "playing" && table !== null && !table.over;
  const yourTurn = playing && table.turn === table.seat;
  const hand = useHand(shown.rack, shown.board, shown.rules, lexicons?.full ?? null, yourTurn);

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
  };
}
