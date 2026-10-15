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
import type { User } from "@akinozgen/account";
import { refresh } from "@akinozgen/account/client";
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

type Handler = (body: Record<string, unknown>) => { status?: number; body: unknown };

/**
 * The game's HTTP API as the tests want it: "GET /api/harfiyen/oda" → handler. Unset paths answer 404.
 * A handler gets the request as the server reads it: the query's version and codes, and the old
 * device secret when the header carries one. Without a session (`account.user` null) every call but
 * the push key answers `oturum`, as the Worker does.
 */
export const api = new Map<string, Handler>();

export function answerApi(method: string, path: string, init?: RequestInit): Response {
  const [route, search = ""] = path.split("?");
  if (account.user === null && route !== "/api/harfiyen/vapid") return json(401, { error: "oturum" });
  const handler = api.get(`${method} ${route}`);
  if (!handler) return json(404, { error: "yok" });
  const query = new URLSearchParams(search);
  const secret = new Headers(init?.headers).get("X-Harfiyen-Secret");
  const answer = handler({
    v: Number(query.get("v")),
    ...(query.has("k") ? { codes: query.get("k") ? query.get("k")!.split(",") : [] } : {}),
    ...(secret ? { secret } : {}),
  });
  return json(answer.status ?? 200, answer.body);
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** The signed-in player in the tests: seat 0 in `roomInfo`, as GUEST. */
export const ME: User = {
  name: "Sakin Köpek #0007",
  base: "Sakin Köpek",
  tag: "0007",
  chosen: null,
  email: "oyuncu@example.com",
  provider: "google.com",
  createdAt: 1,
};

/**
 * The site's account API (games/packages/account), as far as harfiyen uses it: who is signed in,
 * and a new name. `rename` decides how a name is taken; by default every one is.
 */
export const account: {
  user: User | null;
  rename: (words: string) => { status?: number; body: unknown } | null;
  renamed: string[];
} = { user: ME, rename: () => null, renamed: [] };

export function answerAccount(path: string, init?: RequestInit): Response {
  const route = path.split("?")[0].replace(/^\/api\/hesap\//, "");
  if (route === "ben") return json(200, { user: account.user });
  if (route === "ad") {
    if (!account.user) return json(401, { error: "oturum" });
    const words = decodeURIComponent(new Headers(init?.headers).get("X-Hesap-Ad") ?? "");
    account.renamed.push(words);
    const refused = account.rename(words);
    if (refused) return json(refused.status ?? 400, refused.body);
    const base = words || "Sakin Köpek";
    account.user = { ...account.user, base, chosen: words || null, name: `${base} #${account.user.tag}` };
    return json(200, { user: account.user });
  }
  return json(404, { error: "yok" });
}

/** Signs the fake player in (or out, with null) and lets the page's account hear of it. */
export async function signedInAs(user: User | null): Promise<void> {
  account.user = user;
  await act(async () => {
    await refresh();
  });
}

export function resetAccount(): void {
  account.user = ME;
  account.rename = () => null;
  account.renamed = [];
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
    nudges: [5, 5],
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
