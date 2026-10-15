import { DurableObject } from "cloudflare:workers";
import { newCode } from "../codes.ts";
import { type LobbyMessage, parseLobbyRequest, PROTOCOL } from "../protocol.ts";
import type { HarfiyenEnv } from "./env.ts";
import { playerOf } from "./room.ts";

interface Seeker {
  /** The account, once it has asked for a game. */
  pub: string | null;
  /** The account, as the router named it when the socket opened. */
  who: { pub: string; name: string };
  since: number;
}

/** Nobody waits in a queue longer than this many others; past it, try later. */
const MAX_SEEKERS = 200;

/**
 * The one lobby: browsers looking for an opponent right now. It writes
 * nothing to storage — the queue is the open sockets themselves, and their
 * attachments survive the object sleeping. Two devices looking at once are
 * paired, a room is made for them, and both are told where to go.
 */
export class HarfiyenLobby extends DurableObject<HarfiyenEnv> {
  constructor(ctx: DurableObjectState, env: HarfiyenEnv) {
    super(ctx, env);
    // Searching can take a while; keep-alive pings are answered without waking the lobby.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("upgrade required", { status: 426 });
    const who = playerOf(request);
    if (!who) return new Response("no player", { status: 401 });
    if (this.ctx.getWebSockets().length >= MAX_SEEKERS) return new Response("lobby full", { status: 429 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ pub: null, who, since: Date.now() } satisfies Seeker);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const request = parseLobbyRequest(raw);
    const seeker = ws.deserializeAttachment() as Seeker;
    if (!request || seeker.pub) {
      send(ws, { t: "error", code: request ? "limit" : "bozuk" });
      ws.close(1008, "lobby");
      return;
    }
    if (request.v !== PROTOCOL) {
      send(ws, { t: "error", code: "surum" });
      ws.close(1000, "surum");
      return;
    }
    const pub = seeker.who.pub;
    ws.serializeAttachment({ ...seeker, pub, since: Date.now() } satisfies Seeker);

    // The longest-waiting other device, if any.
    const partner = this.ctx
      .getWebSockets()
      .filter((other) => other !== ws)
      .map((other) => ({ ws: other, seeker: other.deserializeAttachment() as Seeker }))
      .filter(({ seeker: other }) => other.pub !== null && other.pub !== pub)
      .sort((a, b) => a.seeker.since - b.seeker.since)[0];

    if (!partner) {
      this.counts();
      return;
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = newCode(Math.random);
      const room = this.env.HARFIYEN_ROOM.get(this.env.HARFIYEN_ROOM.idFromName(code));
      if (await room.createMatched(code, [partner.seeker.pub!, pub], [partner.seeker.who.name, seeker.who.name])) {
        for (const socket of [partner.ws, ws]) {
          send(socket, { t: "matched", code });
          socket.close(1000, "matched");
        }
        this.counts();
        return;
      }
    }
    send(ws, { t: "error", code: "limit" });
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      ws.close(1000, "bye");
    } catch {
      // already closed
    }
    this.counts(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  /** Tells everyone looking how many are looking. */
  private counts(leaving?: WebSocket): void {
    const seekers = this.ctx
      .getWebSockets()
      .filter((ws) => ws !== leaving && (ws.deserializeAttachment() as Seeker).pub !== null);
    for (const ws of seekers) send(ws, { t: "waiting", seekers: seekers.length });
  }
}

function send(ws: WebSocket, message: LobbyMessage): void {
  try {
    ws.send(JSON.stringify(message));
  } catch {
    // closed under us
  }
}
