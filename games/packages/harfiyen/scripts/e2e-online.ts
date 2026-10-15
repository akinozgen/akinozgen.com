/**
 * Online play end to end, against a running Worker (the dev one by default):
 * an invitation taken by a second account, a whole game played by two
 * computer players through real sockets, a nudge, the chat, a stale action,
 * a reconnect, the summary and history, and two seekers paired by the lobby.
 * Players are throwaway accounts: Firebase users made through its REST API,
 * signed in to the Worker, and deleted again at the end.
 *
 *   pnpm --filter @harfiyen/engine dev:mp            # in one terminal
 *   node scripts/e2e-online.ts [http://localhost:8787]
 *
 * Throwaway addresses aren't verified, and only the dev Worker lets an
 * unverified address in (ACCOUNT_ALLOW_UNVERIFIED): this runs against the
 * dev Worker, not the site.
 */
import { readFileSync } from "node:fs";
import { chooseMove } from "../src/bot.ts";
import { type Game, newGame } from "../src/game.ts";
import { Lexicon } from "../src/lexicon.ts";
import { FIREBASE_CONFIG } from "../../account/src/config.ts";
import { PROTOCOL, type RoomMessage, toWire } from "../src/server/protocol.ts";
import { type Table, tableFromJson } from "../src/view.ts";

const base = process.argv[2] ?? "http://localhost:8787";
// The server takes requests only from its own pages; locally any local origin will do.
const origin = new URL(base).hostname === "localhost" ? "http://localhost:5187" : new URL(base).origin;
const words = Lexicon.parse(readFileSync(new URL("../data/yaygin.txt", import.meta.url), "utf8"));
void newGame;

/** A throwaway account: a Firebase user, signed in to the Worker; `cookie` is its session. */
interface Account {
  cookie: string;
  tag: string;
  remove: () => Promise<void>;
}

const made: Account[] = [];

async function account(name?: string): Promise<Account> {
  const identity = "https://identitytoolkit.googleapis.com/v1/accounts";
  const firebase = async (action: string, body: object) => {
    const response = await fetch(`${identity}:${action}?key=${FIREBASE_CONFIG.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Referer: `${origin}/` },
      body: JSON.stringify(body),
    });
    const json = (await response.json()) as Record<string, unknown>;
    if (!response.ok) throw new Error(`firebase ${action}: ${JSON.stringify(json.error)}`);
    return json;
  };
  const user = await firebase("signUp", { email: `e2e-${crypto.randomUUID().slice(0, 8)}@example.com`, password: crypto.randomUUID(), returnSecureToken: true });
  const signIn = await fetch(`${base}/api/hesap/giris`, { headers: { Origin: origin, "X-Hesap": "1", Authorization: `Bearer ${user.idToken}` } });
  const signedIn = (await signIn.json()) as { user?: { tag: string } };
  const cookie = signIn.headers.get("Set-Cookie")?.split(";")[0];
  if (!cookie || !signedIn.user) throw new Error(`sign-in failed: ${signIn.status}`);
  const call = (path: string) => fetch(`${base}/api/hesap/${path}`, { headers: { Origin: origin, "X-Hesap": "1", Cookie: cookie } });
  if (name) await (await fetch(`${base}/api/hesap/ad`, { headers: { Origin: origin, "X-Hesap": "1", Cookie: cookie, "X-Hesap-Ad": encodeURIComponent(name) } })).text();
  const result: Account = {
    cookie,
    tag: signedIn.user.tag,
    remove: async () => {
      await (await call("sil")).text();
      await firebase("delete", { idToken: user.idToken });
    },
  };
  made.push(result);
  return result;
}

/** Renames an account, as its page would. */
async function rename(who: Account, name: string): Promise<void> {
  await (await fetch(`${base}/api/hesap/ad`, { headers: { Origin: origin, "X-Hesap": "1", Cookie: who.cookie, "X-Hesap-Ad": encodeURIComponent(name) } })).text();
}

/**
 * A call as the browser makes it — a GET with the session cookie, the rest
 * in the query (the site's firewall lets nothing else through) — its body
 * read in full (an unread one can spoil the next request on the connection).
 */
async function get(path: string, who: Account | null, query: Record<string, string> = {}): Promise<{ status: number; json: () => Promise<unknown> }> {
  const response = await fetch(`${base}/api/harfiyen/${path}?${new URLSearchParams({ v: String(PROTOCOL), ...query })}`, {
    headers: { Origin: origin, ...(who ? { Cookie: who.cookie } : {}) },
  });
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
  readonly who: Account | null;
  constructor(label: string, who: Account | null) {
    this.label = label;
    this.who = who;
  }

  async open(path: string): Promise<void> {
    const url = `${base.replace(/^http/, "ws")}/api/harfiyen/${path}`;
    this.ws = new WebSocket(url, { headers: { Origin: origin, ...(this.who ? { Cookie: this.who.cookie } : {}) } } as never);
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
  const accountA = await account("Akın");
  const accountB = await account();
  const a = new Client("A", accountA);
  const b = new Client("B", accountB);
  const created = await get("oda", accountA);
  check(created.status === 201, `GET /oda → 201 (got ${created.status})`);
  const { code } = (await created.json()) as { code: string };

  await a.open(`ws/oda/${code}`);
  a.send({ t: "hello", v: PROTOCOL });
  await a.until((m) => m.t === "room", "A's room");
  check(a.last!.room.phase === "waiting" && a.last!.room.you !== null && a.last!.table === null, "host waits, no table yet");

  await b.open(`ws/oda/${code}`);
  b.send({ t: "hello", v: PROTOCOL });
  await b.until((m) => m.t === "room", "B's room");
  check(b.last!.room.you === null && b.last!.room.host === a.last!.room.you, "visitor sees the host, has no seat");
  check(b.last!.room.seats[b.last!.room.host!]!.name === `Akın #${accountA.tag}`, "the host's account name shows");
  const startFrom = a.messages.length;
  b.send({ t: "join" });
  await b.until((m) => m.t === "room" && m.room.phase === "playing", "game start (B)");
  const bSeat = b.last!.room.you!;
  check(b.last!.room.seats[bSeat]!.name.endsWith(`#${accountB.tag}`), "the guest sits under its account");
  await a.until((m) => m.t === "room" && m.room.phase === "playing", "game start (A)", 5000, startFrom);
  check(a.table()!.rack.length === 7 && b.table()!.rack.length === 7, "both racks dealt");
  check(!JSON.stringify(a.messages).includes('"bag"') && !JSON.stringify(b.messages).includes('"bag"'), "no bag on the wire");
  check(a.last!.room.seats.every((s) => s?.online), "both shown online");

  // A nudge reaches the player whose turn it is.
  const toMove = a.table()!.turn === a.last!.room.you ? a : b;
  const nudger = toMove === a ? b : a;
  const sent = nudger.messages.length;
  nudger.send({ t: "nudge" });
  await toMove.until((m) => (m as { t: string }).t === "nudge", "a nudge");
  await nudger.until((m) => m.t === "room" && m.room.nudges[m.room.you!] === 4, "a nudge counted", 5000, sent);
  check(true, "a nudge shakes the other player, four left");

  // The chat opens with the game; a line reaches both players, its rude word starred.
  check(a.messages.some((m) => m.t === "chat") && b.messages.some((m) => m.t === "chat"), "the chat opens with the game");
  const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  let heardFrom = b.messages.length;
  let saidFrom = a.messages.length;
  a.send({ t: "say", text: "İyi oyunlar amk" });
  const heard = await b.until((m) => m.t === "said", "a chat line", 5000, heardFrom);
  await a.until((m) => m.t === "said", "the sender's own line back", 5000, saidFrom);
  check(heard.t === "said" && heard.line.text === "İyi oyunlar ***", `a line reaches both, starred: ${heard.t === "said" ? heard.line.text : ""}`);
  saidFrom = a.messages.length;
  a.send({ t: "say", text: "bir daha" });
  await a.until((m) => m.t === "sayRefused" && m.wait > 0, "a line too soon", 5000, saidFrom);
  check(true, "a line too soon after the last is held back");
  // A mute keeps the other's lines away; lifting it brings them back.
  const muteFrom = b.messages.length;
  b.send({ t: "mute", on: true });
  await b.until((m) => m.t === "chat" && m.muted, "muted", 5000, muteFrom);
  await pause(1100);
  heardFrom = b.messages.length;
  saidFrom = a.messages.length;
  a.send({ t: "say", text: "duydun mu?" });
  await a.until((m) => m.t === "said" && m.line.text === "duydun mu?", "the second line back", 5000, saidFrom);
  await pause(500);
  check(!b.messages.slice(heardFrom).some((m) => m.t === "said"), "a muted player doesn't get the line");
  heardFrom = b.messages.length;
  b.send({ t: "mute", on: false });
  const unmuted = await b.until((m) => m.t === "chat" && !m.muted, "unmuted", 5000, heardFrom);
  check(unmuted.t === "chat" && unmuted.lines.length === 2, "unmuted: both lines there");

  // An action for an older table is dropped and the state resent.
  const mover = a.table()!.turn === a.last!.room.you ? a : b;
  mover.send({ t: "pass", n: 99 });
  await mover.until((m) => m.t === "room", "resend after a stale action");
  check(mover.table()!.log.length === 0, "stale action ignored");

  // A reconnect mid-game gets the same table back.
  b.close();
  await a.until((m) => m.t === "room" && m.room.seats[1 - (a.last!.room.you ?? 0)]?.online === false, "presence: B away");
  // Meanwhile B renamed the account; the room takes the new name when B is back.
  await rename(accountB, "Bilge Baykuş");
  const bAgain = new Client("B2", accountB);
  const mark = a.messages.length;
  await bAgain.open(`ws/oda/${code}`);
  bAgain.send({ t: "hello", v: PROTOCOL });
  await bAgain.until((m) => m.t === "room", "B back");
  check(bAgain.table()!.rack.join() === b.table()!.rack.join(), "reconnect: same rack back");
  const history = await bAgain.until((m) => m.t === "chat", "the chat after a reconnect", 5000, 0);
  check(history.t === "chat" && history.lines.length === 2, "reconnect: the chat comes back");
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

  const summary = await get("ozet", accountA, { k: "ZZZZZZ" });
  const { rooms } = (await summary.json()) as { rooms: Array<{ code: string; phase?: string; gone?: boolean }> };
  check(rooms.find((r) => r.code === "ZZZZZZ")?.gone === true, "summary: a made-up room is gone");
  check(rooms.find((r) => r.code === code)?.phase === "over", "summary: the account's own list has this room, over, unasked");

  // Both accounts keep the result.
  const histories = await Promise.all([accountA, accountB].map(async (who) => ((await (await get("gecmis", who)).json()) as { history: { played: number; won: number; lost: number; drawn: number; games: { code: string; you: number; them: number }[] } }).history));
  const [ha, hb] = histories;
  check(ha!.played === 1 && hb!.played === 1 && ha!.won + ha!.lost + ha!.drawn === 1, `history: one game each (A ${ha!.won}-${ha!.lost}-${ha!.drawn})`);
  check(ha!.games[0]?.code === code && ha!.games[0].you === hb!.games[0]?.them && ha!.games[0].them === hb!.games[0]?.you, "history: the same score from both sides");

  a.send({ t: "rematch" });
  bAgain.send({ t: "rematch" });
  await a.until((m) => m.t === "room" && m.room.gameNo === 2 && m.room.phase === "playing", "rematch");
  check(a.table()!.log.length === 0, "rematch: a fresh game");
  a.close();
  bAgain.close();
}

async function lobby(): Promise<void> {
  console.log("lobby");
  const accountX = await account();
  const accountY = await account();
  const x = new Client("X", accountX);
  const y = new Client("Y", accountY);
  await x.open("ws/lobi");
  x.send({ t: "seek", v: PROTOCOL });
  const waiting = await x.until((m) => (m as { t: string }).t === "waiting", "waiting");
  check((waiting as unknown as { seekers: number }).seekers >= 1, "first seeker waits");
  await y.open("ws/lobi");
  y.send({ t: "seek", v: PROTOCOL });
  const mx = (await x.until((m) => (m as { t: string }).t === "matched", "X matched")) as unknown as { code: string };
  const my = (await y.until((m) => (m as { t: string }).t === "matched", "Y matched")) as unknown as { code: string };
  check(mx.code === my.code, `paired into room ${mx.code}`);
  const xr = new Client("XR", accountX);
  await xr.open(`ws/oda/${mx.code}`);
  xr.send({ t: "hello", v: PROTOCOL });
  await xr.until((m) => m.t === "room" && m.room.phase === "playing", "matched room playing");
  check(xr.last!.room.you !== null, "seated in the matched room");
  xr.close();
}

async function junk(): Promise<void> {
  console.log("junk");
  const someone = made[0]!;
  const bad = await fetch(`${base}/api/harfiyen/oda?v=${PROTOCOL}`, { headers: { Cookie: someone.cookie } });
  await bad.text();
  check(bad.status === 403, "no Origin → 403");
  check((await get("oda", null)).status === 401, "no session → 401");
  check((await get("oda", { ...someone, cookie: `__Host-oturum=${"A".repeat(43)}` })).status === 401, "a made-up session → 401");
  const old = await fetch(`${base}/api/harfiyen/oda?v=1`, { headers: { Origin: origin, Cookie: someone.cookie } });
  await old.text();
  check(old.status === 409, "old version → 409");
  const stranger = new Client("S", null);
  await stranger.open("ws/oda/ZZZZZZ");
  await stranger.until((m) => m.t === "error" && m.code === "oturum", "a socket without a session → oturum", 5000, 0);
  check(true, "a socket without a session is told to sign in");
  const nobody = new Client("N", someone);
  await nobody.open("ws/oda/ZZZZZZ");
  nobody.send({ t: "hello", v: PROTOCOL });
  await nobody.until((m) => m.t === "error" && m.code === "yok", "unknown room → yok");
  check(true, "unknown room answered 'yok'");
}

try {
  await invitationAndGame();
  await lobby();
  await junk();
  console.log("all good");
} finally {
  await Promise.all(made.map((who) => who.remove()));
  console.log(`deleted ${made.length} throwaway accounts`);
}
process.exit(0);
