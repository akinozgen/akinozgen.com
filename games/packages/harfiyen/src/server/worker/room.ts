import { DurableObject } from "cloudflare:workers";
import { publicId } from "../../names.ts";
import { freshSeed } from "../../rng.ts";
import { canChat, type Chat, chatFor, emptyChat, mute, pushDue, pushed, say } from "../chat.ts";
import { parseRoomRequest, PROTOCOL, type RoomMessage, type RoomRequest, type Summary } from "../protocol.ts";
import {
  createInvite,
  createMatched,
  type Deps,
  handle,
  IDLE_TTL,
  INVITE_TTL,
  nameAt,
  noticesFor,
  onAlarm,
  rename,
  type Room,
  seatOf,
  stateFor,
  summaryOf,
} from "../room.ts";
import { type Notice, type PushSub, pushRequest, vapidKeys } from "../webpush.ts";
import type { HarfiyenEnv } from "./env.ts";
import { lexicon } from "./words.ts";

/** Who the push services hear from (RFC 8292's subject). */
const PUSH_SUBJECT = "https://akinozgen.com";

let vapid: Promise<{ privateKey: CryptoKey; publicKey: string }> | null = null;
/** The VAPID keys, read once per isolate from the secret; null without one. */
export function vapidFrom(env: HarfiyenEnv): Promise<{ privateKey: CryptoKey; publicKey: string }> | null {
  if (!env.HARFIYEN_VAPID) return null;
  vapid ??= vapidKeys(JSON.parse(env.HARFIYEN_VAPID) as JsonWebKey);
  return vapid;
}

/** Kept on each socket, so it survives the object sleeping between messages. */
interface Attachment {
  /** The device behind the socket, once it has said hello. */
  pub: string | null;
  /** The name its hello gave, for taking a seat. */
  name?: string;
  /** Messages in the current window, for the rate limit. */
  count: number;
  window: number;
}

const KEY = "room";
/** The chat lives in a row of its own. */
const CHAT_KEY = "chat";
/** A browser sends a few messages a minute; this many in ten seconds is something else. */
const RATE = { window: 10_000, max: 40 };
/** Sockets one room keeps: two players, each with a spare tab or a reconnect in flight. */
const MAX_SOCKETS = 6;

/**
 * One room, one Durable Object. Sockets are accepted for hibernation — the
 * object sleeps between moves and costs nothing while it does — and the ping
 * a browser sends to keep its connection is answered without waking it. No
 * timers: the only clock is the alarm, which clears the room in the end.
 */
export class HarfiyenRoom extends DurableObject<HarfiyenEnv> {
  private room: Room | null | undefined;
  private chat: Chat | undefined;

  constructor(ctx: DurableObjectState, env: HarfiyenEnv) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  private deps(): Deps {
    return { now: () => Date.now(), seed: freshSeed, random: Math.random, lexicon };
  }

  private async load(): Promise<Room | null> {
    if (this.room === undefined) this.room = (await this.ctx.storage.get<Room>(KEY)) ?? null;
    return this.room;
  }

  private async store(room: Room | null): Promise<void> {
    this.room = room;
    if (room) {
      await this.ctx.storage.put(KEY, room);
    } else {
      this.chat = undefined;
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
    }
  }

  private async loadChat(): Promise<Chat> {
    this.chat ??= (await this.ctx.storage.get<Chat>(CHAT_KEY)) ?? emptyChat();
    return this.chat;
  }

  private async storeChat(chat: Chat): Promise<void> {
    this.chat = chat;
    await this.ctx.storage.put(CHAT_KEY, chat);
  }

  /** A new invitation under `code`; false if the code is taken. */
  async createInvite(code: string, host: string, name?: string): Promise<boolean> {
    if (await this.load()) return false;
    const room = createInvite(code, host, this.deps(), name);
    await this.store(room);
    await this.ctx.storage.setAlarm(room.createdAt + INVITE_TTL);
    return true;
  }

  /** A game for two players the lobby paired; false if the code is taken. */
  async createMatched(code: string, players: [string, string], names: [string?, string?] = []): Promise<boolean> {
    if (await this.load()) return false;
    const room = createMatched(code, players, this.deps(), names);
    await this.store(room);
    await this.ctx.storage.setAlarm(room.updatedAt + IDLE_TTL);
    return true;
  }

  async summary(code: string, pub: string): Promise<Summary> {
    return summaryOf(await this.load(), code, pub);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("upgrade required", { status: 426 });
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) return new Response("too many connections", { status: 429 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ pub: null, count: 0, window: Date.now() } satisfies Attachment);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const attachment = ws.deserializeAttachment() as Attachment;
    const now = Date.now();
    if (now - attachment.window > RATE.window) {
      attachment.window = now;
      attachment.count = 0;
    }
    if (++attachment.count > RATE.max) {
      send(ws, { t: "error", code: "limit" });
      ws.close(1008, "limit");
      return;
    }
    ws.serializeAttachment(attachment);

    const request = parseRoomRequest(raw);
    if (!request) {
      send(ws, { t: "error", code: "bozuk" });
      return;
    }
    const room = await this.load();
    if (!room) {
      send(ws, { t: "error", code: "yok" });
      ws.close(1000, "yok");
      return;
    }

    if (request.t === "hello") {
      if (request.v !== PROTOCOL) {
        send(ws, { t: "error", code: "surum" });
        ws.close(1000, "surum");
        return;
      }
      attachment.pub = await publicId(request.secret);
      attachment.name = request.name;
      ws.serializeAttachment(attachment);
      // A player who changed their name since: the room takes the new one.
      const renamed = rename(room, attachment.pub, request.name);
      if (renamed) await this.store(renamed);
      // The newcomer gets the room; the others learn they're here.
      this.broadcast(renamed ?? room);
      // A player gets the chat so far.
      const seat = seatOf(room, attachment.pub);
      if (canChat(room, seat)) send(ws, chatFor(await this.loadChat(), seat));
      return;
    }
    if (!attachment.pub) {
      send(ws, { t: "error", code: "kimlik" });
      return;
    }
    if (request.t === "say" || request.t === "mute") {
      await this.talk(ws, room, attachment.pub, request);
      return;
    }

    const outcome = handle(room, attachment.pub, request, this.deps(), attachment.name);
    if (outcome.changed) {
      await this.store(outcome.room);
      if (outcome.room) this.notify(room, outcome.room);
      if (!outcome.room) {
        for (const socket of this.ctx.getWebSockets()) {
          send(socket, { t: "error", code: "iptal" });
          socket.close(1000, "iptal");
        }
        return;
      }
    }
    if (outcome.reply) send(ws, outcome.reply);
    const current = outcome.room ?? room;
    if (outcome.broadcast) this.broadcast(current);
    else if (outcome.resend) send(ws, stateFor(current, attachment.pub, this.online(current)));
    if (outcome.nudge !== undefined) this.nudge(current, outcome.nudge);
    // The game has begun: both players may talk now.
    if (outcome.room && room.phase === "waiting" && outcome.room.phase !== "waiting") {
      const chat = await this.loadChat();
      for (const socket of this.ctx.getWebSockets()) {
        const seat = seatOf(outcome.room, (socket.deserializeAttachment() as Attachment).pub);
        if (canChat(outcome.room, seat)) send(socket, chatFor(chat, seat));
      }
    }
  }

  /**
   * A chat line or a mute. A line goes to both players' screens — not to one
   * who muted its sender — and, if the other has none open, by push, now and
   * then. A mute sends the seat its chat as it now sees it.
   */
  private async talk(ws: WebSocket, room: Room, pub: string, request: Extract<RoomRequest, { t: "say" | "mute" }>): Promise<void> {
    const seat = seatOf(room, pub);
    if (!canChat(room, seat)) return;
    const chat = await this.loadChat();
    const sockets = this.ctx.getWebSockets().map((socket) => ({ socket, seat: seatOf(room, (socket.deserializeAttachment() as Attachment).pub) }));
    if (request.t === "mute") {
      const next = mute(chat, seat, request.on);
      if (next) await this.storeChat(next);
      for (const to of sockets) if (to.seat === seat) send(to.socket, chatFor(next ?? chat, seat));
      return;
    }
    const now = Date.now();
    const result = say(chat, seat, request.text, now);
    if ("refused" in result) {
      send(ws, { t: "sayRefused", wait: result.refused });
      return;
    }
    const other = 1 - seat;
    let next = result.chat;
    const sub = room.push?.[other];
    const away = !sockets.some((to) => to.seat === other);
    if (away && sub && this.env.HARFIYEN_VAPID && pushDue(next, other, now)) {
      next = pushed(next, other, now);
      const notice = { title: nameAt(room, seat) ?? "Rakibin", body: result.line.text, url: `#/oda/${room.code}`, tag: `${room.code}:sohbet` };
      this.ctx.waitUntil(this.push(other, sub, notice));
    }
    await this.storeChat(next);
    for (const to of sockets) {
      if (to.seat === seat || (to.seat === other && !next.muted[other])) send(to.socket, { t: "said", line: result.line });
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.gone(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.gone(ws);
  }

  /** A socket went away: finish closing it, and tell the others their opponent left. */
  private async gone(ws: WebSocket): Promise<void> {
    try {
      ws.close(1000, "bye");
    } catch {
      // already closed
    }
    const room = await this.load();
    if (room) this.broadcast(room, ws);
  }

  async alarm(): Promise<void> {
    const room = await this.load();
    if (!room) {
      await this.ctx.storage.deleteAll();
      return;
    }
    const result = onAlarm(room, Date.now());
    if (result.changed) await this.store(result.room);
    if (!result.room) {
      for (const socket of this.ctx.getWebSockets()) {
        send(socket, { t: "error", code: "yok" });
        socket.close(1000, "yok");
      }
      return;
    }
    if (result.next !== null) await this.ctx.storage.setAlarm(result.next);
    if (result.changed) this.broadcast(result.room);
  }

  /** A nudge: a shake on every screen the seat has open, or — if it has none — a push. */
  private nudge(room: Room, seat: number): void {
    const target = room.seats[seat];
    const sockets = this.ctx.getWebSockets().filter((ws) => (ws.deserializeAttachment() as Attachment).pub === target);
    for (const ws of sockets) send(ws, { t: "nudge", from: 1 - seat });
    const sub = room.push?.[seat];
    if (sockets.length === 0 && sub && this.env.HARFIYEN_VAPID) {
      const notice = { title: "Dürtüldün", body: `${nameAt(room, 1 - seat) ?? "Rakibin"} seni dürttü. Sıra sende.`, url: `#/oda/${room.code}`, tag: room.code };
      this.ctx.waitUntil(this.push(seat, sub, notice));
    }
  }

  /** Tells the players who aren't here what changed, by push, if they asked for notices. */
  private notify(before: Room, after: Room): void {
    if (!this.env.HARFIYEN_VAPID) return;
    const online = this.online(after);
    for (const { seat, notice } of noticesFor(before, after)) {
      const sub = after.push?.[seat];
      if (sub && !online[seat]) this.ctx.waitUntil(this.push(seat, sub, notice));
    }
  }

  private async push(seat: number, sub: PushSub, notice: Notice): Promise<void> {
    const keys = vapidFrom(this.env);
    if (!keys) return;
    try {
      const response = await fetch(sub.endpoint, await pushRequest(sub, notice, await keys, PUSH_SUBJECT, Date.now()));
      // Gone for good: the browser unsubscribed or the subscription expired.
      if (response.status === 404 || response.status === 410) {
        const room = await this.load();
        if (room?.push?.[seat]?.endpoint === sub.endpoint) {
          const push = [...room.push];
          push[seat] = null;
          await this.store({ ...room, push });
        }
      }
    } catch {
      // A push that doesn't go out is a notice missed, nothing more.
    }
  }

  /** Which seats have a socket open, leaving out one that is on its way out. */
  private online(room: Room, leaving?: WebSocket): boolean[] {
    const pubs = new Set(
      this.ctx
        .getWebSockets()
        .filter((ws) => ws !== leaving)
        .map((ws) => (ws.deserializeAttachment() as Attachment).pub),
    );
    return room.seats.map((seat) => seat !== null && pubs.has(seat));
  }

  /** Everyone gets the room as they see it. */
  private broadcast(room: Room, leaving?: WebSocket): void {
    const online = this.online(room, leaving);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === leaving) continue;
      const { pub } = ws.deserializeAttachment() as Attachment;
      if (pub) send(ws, stateFor(room, pub, online));
    }
  }
}

function send(ws: WebSocket, message: RoomMessage): void {
  try {
    ws.send(JSON.stringify(message));
  } catch {
    // The socket closed under us; the close handler will tidy up.
  }
}
