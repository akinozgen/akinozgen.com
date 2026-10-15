import { sessionUser } from "../../../../account/src/server/worker/route.ts";
import { publicId } from "../../names.ts";
import { newCode } from "../codes.ts";
import { codesOf, type ErrorCode, isSecret, MAX_SUMMARY, PROTOCOL, versionOf } from "../protocol.ts";
import type { HarfiyenEnv } from "./env.ts";
import { forgetRooms, historyOf, roomsOf } from "./records.ts";
import { NAME_HEADER, PLAYER_HEADER, vapidFrom } from "./room.ts";

export type { HarfiyenEnv } from "./env.ts";
export { HarfiyenLobby } from "./lobby.ts";
export { HarfiyenRoom } from "./room.ts";
export { provideWords } from "./words.ts";

const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

/**
 * Only pages of this site may talk to the game: the Origin must be this
 * host, or — for a same-origin GET, which carries no Origin — the browser
 * must say the request came from this site. In development the page (Vite)
 * and the Worker run on different local ports, so any local origin is fine
 * there.
 */
function originAllowed(request: Request, url: URL): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return request.headers.get("Sec-Fetch-Site") === "same-origin";
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

/** A socket turned away before it reaches an object: accepted only to say why, so the page can tell. */
function refuseSocket(code: ErrorCode): Response {
  const pair = new WebSocketPair();
  pair[1].accept();
  pair[1].send(JSON.stringify({ t: "error", code }));
  pair[1].close(1000, code);
  return new Response(null, { status: 101, webSocket: pair[0] });
}

/** Rooms an account's list may hold at once: the ones it's playing, and finished ones for a week. */
const MAX_ROOMS = 40;

/**
 * Everything under /api/harfiyen: invitations, summaries, history and the
 * move of an old device's games over HTTP (GETs: the site's firewall lets
 * nothing else through), rooms and the lobby over WebSockets handed straight
 * to their Durable Objects. The player is the signed-in account; the room
 * learns it from headers set here, never from the browser. Cheap checks
 * first, so junk never wakes an object.
 */
export async function routeHarfiyen(request: Request, env: HarfiyenEnv): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/harfiyen/, "");
  if (env.HARFIYEN_MP === "off") return json({ error: "kapali" }, 503);
  if (request.method !== "GET") return json({ error: "yok" }, 405);
  // The public half of the push key is public; and browsers send no Origin on a same-origin GET.
  if (path === "/vapid") {
    const keys = vapidFrom(env);
    return keys ? json({ key: (await keys).publicKey }) : json({ error: "yok" }, 404);
  }
  if (!originAllowed(request, url)) return json({ error: "origin" }, 403);

  const room = /^\/ws\/oda\/([23456789ABCDEFGHJKMNPQRSTVWXYZ]{6})$/.exec(path);
  if (room || path === "/ws/lobi") {
    if (request.headers.get("Upgrade") !== "websocket") return json({ error: "upgrade" }, 426);
    const user = await sessionUser(request, env);
    if (!user) return refuseSocket("oturum");
    const namespace = room ? env.HARFIYEN_ROOM : env.HARFIYEN_LOBBY;
    const stub = (namespace as DurableObjectNamespace).get(namespace.idFromName(room ? room[1] : "lobi"));
    const headers = new Headers(request.headers);
    headers.set(PLAYER_HEADER, user.id);
    headers.set(NAME_HEADER, encodeURIComponent(user.name ?? ""));
    return stub.fetch(new Request(request, { headers }));
  }

  const v = versionOf(url.searchParams);
  if (v === null) return json({ error: "bozuk" }, 400);
  if (v !== PROTOCOL) return json({ error: "surum" }, 409);
  const user = await sessionUser(request, env);
  if (!user) return json({ error: "oturum" }, 401);
  const roomOf = (code: string) => env.HARFIYEN_ROOM.get(env.HARFIYEN_ROOM.idFromName(code));

  if (path === "/oda") {
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = newCode(Math.random);
      if (await roomOf(code).createInvite(code, user.id, user.name ?? "")) return json({ code }, 201);
    }
    return json({ error: "limit" }, 503);
  }

  if (path === "/ozet") {
    const asked = codesOf(url.searchParams);
    if (!asked) return json({ error: "bozuk" }, 400);
    const codes = [...new Set([...asked, ...(await roomsOf(env.DB, user.id, MAX_ROOMS))])].slice(0, MAX_ROOMS + MAX_SUMMARY);
    const rooms = await Promise.all(codes.map((code) => roomOf(code).summary(code, user.id)));
    await forgetRooms(env.DB, user.id, rooms.filter((summary) => summary.gone).map((summary) => summary.code));
    return json({ rooms });
  }

  if (path === "/gecmis") return json({ history: await historyOf(env.DB, user.id, 50) });

  if (path === "/bagla") {
    // The secret of the device id this browser played under before accounts, in a header like it always was.
    const secret = request.headers.get("X-Harfiyen-Secret");
    const asked = codesOf(url.searchParams);
    if (!isSecret(secret) || !asked) return json({ error: "bozuk" }, 400);
    const device = await publicId(secret);
    const moved = await Promise.all(asked.map(async (code) => ((await roomOf(code).adopt(device, user.id, user.name ?? "")) ? code : null)));
    return json({ codes: moved.filter((code): code is string => code !== null) });
  }

  return json({ error: "yok" }, 404);
}
