import {
  encode,
  JOKER,
  makeRules,
  newGame,
  type RoomInfo,
  type Summary,
  type Table,
  TILE_SET,
  tableToJson,
  viewOf,
} from "@harfiyen/engine";
import { act } from "@testing-library/react";
import type { SocketLike } from "../src/game/socket.ts";

/**
 * A WebSocket the tests play the server for: they open it, send it
 * messages, drop it, and read what the page sent.
 */
export class FakeSocket implements SocketLike {
  static all: FakeSocket[] = [];
  static last(): FakeSocket {
    const socket = FakeSocket.all[FakeSocket.all.length - 1];
    if (!socket) throw new Error("no socket opened");
    return socket;
  }
  static to(path: string): FakeSocket[] {
    return FakeSocket.all.filter((s) => s.url.endsWith(path));
  }

  readyState = 0;
  /** What the page sent, JSON parsed; "ping" stays a string. */
  sent: unknown[] = [];
  closed = false;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }

  send(data: string): void {
    if (this.readyState !== 1) throw new Error("not open");
    this.sent.push(data === "ping" ? data : JSON.parse(data));
  }

  close(): void {
    this.closed = true;
    this.readyState = 3;
  }

  /** The server accepts the connection. */
  accept(): void {
    act(() => {
      this.readyState = 1;
      this.onopen?.(new Event("open"));
    });
  }

  /** The server says something. */
  receive(message: unknown): void {
    act(() => {
      this.onmessage?.({ data: typeof message === "string" ? message : JSON.stringify(message) } as MessageEvent);
    });
  }

  /** The line goes down. */
  drop(): void {
    act(() => {
      this.readyState = 3;
      this.onclose?.({ code: 1006 } as CloseEvent);
    });
  }

  /** Sent messages of one kind. */
  of(t: string): Array<Record<string, unknown>> {
    return this.sent.filter((m): m is Record<string, unknown> => typeof m === "object" && m !== null && (m as { t?: string }).t === t);
  }
}

type Handler = (body: unknown) => { status?: number; body: unknown };

/**
 * The game's HTTP API as the tests want it: "GET /api/harfiyen/oda" → handler. Unset paths answer 404.
 * A handler gets the request as the server reads it: a GET's query and secret header as one object.
 */
export const api = new Map<string, Handler>();

export function answerApi(method: string, path: string, init?: RequestInit): Response {
  const [route, search = ""] = path.split("?");
  const handler = api.get(`${method} ${route}`);
  if (!handler) return new Response(JSON.stringify({ error: "yok" }), { status: 404 });
  const query = new URLSearchParams(search);
  const secret = new Headers(init?.headers).get("X-Harfiyen-Secret");
  const body =
    typeof init?.body === "string"
      ? (JSON.parse(init.body) as unknown)
      : {
          v: Number(query.get("v")),
          secret,
          ...(query.has("name") ? { name: query.get("name") } : {}),
          ...(query.has("k") ? { codes: query.get("k") ? query.get("k")!.split(",") : [] } : {}),
        };
  const answer = handler(body);
  return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200 });
}

/** A rack as letters ("?" a joker). */
export const rackOf = (letters: string): number[] => [...letters].map((c) => (c === "?" ? JOKER : encode(c)![0]));

/** A table as the server would send it: seat `seat`'s view of a fresh game, with `rack` dealt to it. */
export function tableFor(seat: number, rack = "kalemat", turn = seat): unknown {
  const game = newGame("online-test", makeRules("online-test"), TILE_SET, 2, turn);
  game.racks[seat] = rackOf(rack);
  return tableToJson(viewOf(game, seat, "K7Q2XM:1"));
}

/** The same table after a move: `log` turns played, `turn` to move. */
export function laterTable(raw: unknown, changes: Partial<Table>): unknown {
  return { ...(raw as object), ...changes };
}

export const HOST = "Neşeli Kirpi #4821";
export const GUEST = "Sakin Köpek #0007";

export function roomInfo(changes: Partial<RoomInfo> = {}): RoomInfo {
  return {
    code: "K7Q2XM",
    phase: "playing",
    you: 0,
    seats: [
      { name: GUEST, online: true },
      { name: HOST, online: true },
    ],
    host: null,
    gameNo: 1,
    rematch: [false, false],
    updatedAt: 1_000,
    ...changes,
  };
}

export function summary(code: string, changes: Partial<Extract<Summary, { gone?: false }>> = {}): Summary {
  return {
    code,
    phase: "playing",
    you: 0,
    turn: 0,
    names: [GUEST, HOST],
    scores: [12, 30],
    winner: null,
    updatedAt: Date.now() - 3 * 3_600_000,
    ...changes,
  };
}
