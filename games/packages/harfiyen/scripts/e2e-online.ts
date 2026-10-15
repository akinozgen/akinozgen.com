/**
 * Online play end to end, against a running Worker (the dev one by default):
 * an invitation taken by a second device, a whole game played by two
 * computer players through real sockets, a stale action, a reconnect, the
 * summary, and two seekers paired by the lobby.
 *
 *   pnpm --filter @harfiyen/engine dev:mp            # in one terminal
 *   node scripts/e2e-online.ts [http://localhost:8787 | https://akinozgen.com]
 */
import { readFileSync } from "node:fs";
import { chooseMove } from "../src/bot.ts";
import { type Game, newGame } from "../src/game.ts";
import { Lexicon } from "../src/lexicon.ts";
import { newSecret } from "../src/names.ts";
import { PROTOCOL, type RoomMessage, toWire } from "../src/server/protocol.ts";
import { type Table, tableFromJson } from "../src/view.ts";

const base = process.argv[2] ?? "http://localhost:8787";
// The server takes requests only from its own pages; locally any local origin will do.
const origin = new URL(base).hostname === "localhost" ? "http://localhost:5187" : new URL(base).origin;
const words = Lexicon.parse(readFileSync(new URL("../data/yaygin.txt", import.meta.url), "utf8"));
void newGame;

/** A POST, its body read in full (an unread body can spoil the next request on the same connection). */
async function post(path: string, body: unknown): Promise<{ status: number; json: () => Promise<unknown> }> {
  const response = await fetch(`${base}/api/harfiyen/${path}`, { method: "POST", headers: { Origin: origin }, body: JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, json: async () => JSON.parse(text) };
}

/** A browser stand-in: one socket, the last state it got, a queue of waiters. */
class Client {
  ws!: WebSocket;
  last: Extract<RoomMessage, { t: "room" }> | null = null;
  messages: RoomMessage[] = [];
  private waiters: Array<() => void> = [];
  readonly label: string;
  readonly secret: string;
  constructor(label: string, secret = newSecret()) {
    this.label = label;
    this.secret = secret;
  }

  async open(path: string): Promise<void> {
    const url = `${base.replace(/^http/, "ws")}/api/harfiyen/${path}`;
    this.ws = new WebSocket(url, { headers: { Origin: origin } } as never);
    this.ws.onmessage = (event) => {
      if (String(event.data) === "pong") return;
      const message = JSON.parse(String(event.data)) as RoomMessage;
      this.messages.push(message);
      if (message.t === "room") this.last = message;
      for (const wake of this.waiters.splice(0)) wake();
    };
    await new Promise<void>((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error(`${this.label}: socket error`));
    });
  }

  send(message: unknown): void {
    this.ws.send(typeof message === "string" ? message : JSON.stringify(message));
  }

  /** Waits for a message that passes `test`, seen from now on (or from message `from`). */
  async until(test: (message: RoomMessage) => boolean, what: string, ms = 5000, from = this.messages.length): Promise<RoomMessage> {
    const deadline = Date.now() + ms;
    for (;;) {
      const found = this.messages.slice(from).find(test);
      if (found) return found;
      if (Date.now() > deadline) throw new Error(`${this.label}: timed out waiting for ${what}`);
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 100);
      });
    }
  }

  table(): Table | null {
    return this.last ? tableFromJson(this.last.table) : null;
  }

  close(): void {
    this.ws.close();
  }
}

const check = (ok: unknown, what: string): void => {
  if (!ok) throw new Error(`FAILED: ${what}`);
  console.log(`  ok  ${what}`);
};

/** The game as the mover sees it, enough for the computer to choose a move. */
function asGame(table: Table): Game {
  const racks = [table.rack, table.rack];
  return {
    seed: table.id,
    rules: table.rules,
    board: table.board,
    bag: new Array(table.bagCount).fill(0),
    racks,
    scores: table.scores,
    turn: table.seat,
    first: table.first,
    log: table.log,
    idle: table.idle,
    over: table.over,
  };
}

async function invitationAndGame(): Promise<void> {
  console.log("invitation, join, a whole game");
  const a = new Client("A");
  const b = new Client("B");
  const created = await post("oda", { v: PROTOCOL, secret: a.secret, name: "Akın" });
  check(created.status === 201, `POST /oda → 201 (got ${created.status})`);
  const { code } = (await created.json()) as { code: string };

  await a.open(`ws/oda/${code}`);
  a.send({ t: "hello", v: PROTOCOL, secret: a.secret });
  await a.until((m) => m.t === "room", "A's room");
  check(a.last!.room.phase === "waiting" && a.last!.room.you !== null && a.last!.table === null, "host waits, no table yet");

  await b.open(`ws/oda/${code}`);
  b.send({ t: "hello", v: PROTOCOL, secret: b.secret });
  await b.until((m) => m.t === "room", "B's room");
  check(b.last!.room.you === null && b.last!.room.host === a.last!.room.you, "visitor sees the host, has no seat");
  check(b.last!.room.seats[b.last!.room.host!]!.name.startsWith("Akın #"), "the host's chosen name shows");
  b.send({ t: "hello", v: PROTOCOL, secret: b.secret, name: "Orospu" });
  await b.until((m) => m.t === "room", "B's hello again");
  b.send({ t: "join" });
  await b.until((m) => m.t === "room" && m.room.phase === "playing", "game start (B)");
  const bSeat = b.last!.room.you!;
  check(!b.last!.room.seats[bSeat]!.name.includes("Orospu"), "an unfit name falls back to the device's own");
  await a.until((m) => m.t === "room" && m.room.phase === "playing", "game start (A)");
  check(a.table()!.rack.length === 7 && b.table()!.rack.length === 7, "both racks dealt");
  check(!JSON.stringify(a.messages).includes('"bag"') && !JSON.stringify(b.messages).includes('"bag"'), "no bag on the wire");
  check(a.last!.room.seats.every((s) => s?.online), "both shown online");

  // An action for an older table is dropped and the state resent.
  const mover = a.table()!.turn === a.last!.room.you ? a : b;
  mover.send({ t: "pass", n: 99 });
  await mover.until((m) => m.t === "room", "resend after a stale action");
  check(mover.table()!.log.length === 0, "stale action ignored");

  // A reconnect mid-game gets the same table back.
  b.close();
  await a.until((m) => m.t === "room" && m.room.seats[1 - (a.last!.room.you ?? 0)]?.online === false, "presence: B away");
  const bAgain = new Client("B2", b.secret);
  const mark = a.messages.length;
  await bAgain.open(`ws/oda/${code}`);
  bAgain.send({ t: "hello", v: PROTOCOL, secret: b.secret, name: "Bilge Baykuş" });
  await bAgain.until((m) => m.t === "room", "B back");
  check(bAgain.table()!.rack.join() === b.table()!.rack.join(), "reconnect: same rack back");
  await a.until((m) => m.t === "room" && (m.room.seats[bSeat]?.name.startsWith("Bilge Baykuş #") ?? false), "B's new name", 5000, mark);
  check(true, "a rename reaches the other side with the next hello");

  const players = [a, bAgain];
  let turns = 0;
  for (;;) {
    const room = a.last!.room;
    if (room.phase === "over") break;
    const table = a.table()!;
    const seatMover = players.find((p) => p.last!.room.you === table.turn)!;
    // Each socket gets its own copy of the news; the mover may not have read it yet.
    if (seatMover.table()!.log.length < table.log.length) {
      await seatMover.until((m) => m.t === "room" && (tableFromJson(m.table)?.log.length ?? 0) >= table.log.length, "mover catching up");
    }
    const mine = seatMover.table()!;
    const action = chooseMove(asGame(mine), words, "orta");
    const n = mine.log.length;
    seatMover.send(
      action.kind === "play"
        ? { t: "play", n, p: action.placements.map(toWire) }
        : action.kind === "swap"
          ? { t: "swap", n, tiles: action.tiles }
          : { t: "pass", n },
    );
    await a.until((m) => m.t === "room" && (tableFromJson(m.table)?.log.length ?? 0) > n, `turn ${n + 1}`);
    if (++turns > 150) throw new Error("game never ended");
  }
  check(turns > 15, `a whole game: ${turns} turns, ${a.table()!.scores.join("–")}`);
  check(Array.isArray((a.last!.table as Table).finalRacks), "racks revealed at the end");

  const summary = await post("ozet", { v: PROTOCOL, secret: a.secret, codes: [code, "ZZZZZZ"] });
  const { rooms } = (await summary.json()) as { rooms: Array<{ code: string; phase?: string; gone?: boolean }> };
  check(rooms[0].phase === "over" && rooms[1].gone === true, "summary: this room over, a made-up one gone");

  a.send({ t: "rematch" });
  bAgain.send({ t: "rematch" });
  await a.until((m) => m.t === "room" && m.room.gameNo === 2 && m.room.phase === "playing", "rematch");
  check(a.table()!.log.length === 0, "rematch: a fresh game");
  a.close();
  bAgain.close();
}

async function lobby(): Promise<void> {
  console.log("lobby");
  const x = new Client("X");
  const y = new Client("Y");
  await x.open("ws/lobi");
  x.send({ t: "seek", v: PROTOCOL, secret: x.secret });
  const waiting = await x.until((m) => (m as { t: string }).t === "waiting", "waiting");
  check((waiting as unknown as { seekers: number }).seekers >= 1, "first seeker waits");
  await y.open("ws/lobi");
  y.send({ t: "seek", v: PROTOCOL, secret: y.secret });
  const mx = (await x.until((m) => (m as { t: string }).t === "matched", "X matched")) as unknown as { code: string };
  const my = (await y.until((m) => (m as { t: string }).t === "matched", "Y matched")) as unknown as { code: string };
  check(mx.code === my.code, `paired into room ${mx.code}`);
  const xr = new Client("XR", x.secret);
  await xr.open(`ws/oda/${mx.code}`);
  xr.send({ t: "hello", v: PROTOCOL, secret: x.secret });
  await xr.until((m) => m.t === "room" && m.room.phase === "playing", "matched room playing");
  check(xr.last!.room.you !== null, "seated in the matched room");
  xr.close();
}

async function junk(): Promise<void> {
  console.log("junk");
  const bad = await fetch(`${base}/api/harfiyen/oda`, { method: "POST", body: "{}" });
  await bad.text();
  check(bad.status === 403, "no Origin → 403");
  const malformed = await post("oda", { v: PROTOCOL, secret: "nope" });
  check(malformed.status === 400, `bad secret → 400 (got ${malformed.status} ${JSON.stringify(await malformed.json().catch(() => null))})`);
  const old = await post("oda", { v: 0, secret: newSecret() });
  check(old.status === 409, "old version → 409");
  const nobody = new Client("N");
  await nobody.open("ws/oda/ZZZZZZ");
  nobody.send({ t: "hello", v: PROTOCOL, secret: nobody.secret });
  await nobody.until((m) => m.t === "error" && m.code === "yok", "unknown room → yok");
  check(true, "unknown room answered 'yok'");
}

await invitationAndGame();
await lobby();
await junk();
console.log("all good");
process.exit(0);
