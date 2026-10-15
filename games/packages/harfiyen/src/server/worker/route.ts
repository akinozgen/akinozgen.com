import { publicId } from "../../names.ts";
import { newCode } from "../codes.ts";
import { MAX_MESSAGE, parseCreate, parseSummaryRequest, PROTOCOL } from "../protocol.ts";
import type { HarfiyenEnv } from "./env.ts";
import { vapidFrom } from "./room.ts";

export type { HarfiyenEnv } from "./env.ts";
export { HarfiyenLobby } from "./lobby.ts";
export { HarfiyenRoom } from "./room.ts";
export { provideWords } from "./words.ts";

const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

/**
 * Only pages of this site may talk to the game: the Origin must be this
 * host. In development the page (Vite) and the Worker run on different
 * local ports, so any local origin is fine there.
 */
function originAllowed(request: Request, url: URL): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  let from: URL;
  try {
    from = new URL(origin);
  } catch {
    return false;
  }
  if (from.host === url.host) return true;
  const local = (host: string): boolean => host === "localhost" || host === "127.0.0.1" || host.startsWith("192.168.");
  return local(url.hostname) && local(from.hostname);
}

async function body(request: Request): Promise<string | null> {
  const text = await request.text();
  return text.length > MAX_MESSAGE ? null : text;
}

/**
 * Everything under /api/harfiyen: new invitations and summaries over HTTP,
 * rooms and the lobby over WebSockets handed straight to their Durable
 * Objects. Cheap checks first, so junk never wakes an object.
 */
export async function routeHarfiyen(request: Request, env: HarfiyenEnv): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/harfiyen/, "");
  // A body is read before any answer, even a refusal: one left unread can spoil the connection it came on.
  const text = request.method === "POST" ? await body(request) : null;
  if (env.HARFIYEN_MP === "off") return json({ error: "kapali" }, 503);
  // The public half of the push key is public; and browsers send no Origin on a same-origin GET.
  if (path === "/vapid" && request.method === "GET") {
    const keys = vapidFrom(env);
    return keys ? json({ key: (await keys).publicKey }) : json({ error: "yok" }, 404);
  }
  if (!originAllowed(request, url)) return json({ error: "origin" }, 403);

  if (path === "/oda" && request.method === "POST") {
    const create = text === null ? null : parseCreate(text);
    if (!create) return json({ error: "bozuk" }, 400);
    if (create.v !== PROTOCOL) return json({ error: "surum" }, 409);
    const host = await publicId(create.secret);
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = newCode(Math.random);
      const room = env.HARFIYEN_ROOM.get(env.HARFIYEN_ROOM.idFromName(code));
      if (await room.createInvite(code, host, create.name)) return json({ code }, 201);
    }
    return json({ error: "limit" }, 503);
  }

  if (path === "/ozet" && request.method === "POST") {
    const ask = text === null ? null : parseSummaryRequest(text);
    if (!ask) return json({ error: "bozuk" }, 400);
    if (ask.v !== PROTOCOL) return json({ error: "surum" }, 409);
    const pub = await publicId(ask.secret);
    const rooms = await Promise.all(
      ask.codes.map((code) => env.HARFIYEN_ROOM.get(env.HARFIYEN_ROOM.idFromName(code)).summary(code, pub)),
    );
    return json({ rooms });
  }

  const room = /^\/ws\/oda\/([23456789ABCDEFGHJKMNPQRSTVWXYZ]{6})$/.exec(path);
  if (room || path === "/ws/lobi") {
    if (request.headers.get("Upgrade") !== "websocket") return json({ error: "upgrade" }, 426);
    const namespace = room ? env.HARFIYEN_ROOM : env.HARFIYEN_LOBBY;
    const stub = (namespace as DurableObjectNamespace).get(namespace.idFromName(room ? room[1] : "lobi"));
    return stub.fetch(request);
  }

  return json({ error: "yok" }, 404);
}
