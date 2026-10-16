import { cleanName } from "../../../../harfiyen/src/names.ts";
import { FIREBASE_PROJECT } from "../../config.ts";
import {
  ACCOUNT_HEADER,
  type AccountError,
  CONSENT_HEADER,
  CONSENT_VERSION,
  DATA_HEADER,
  NAME_HEADER,
  PUZZLE_GAMES,
  type PuzzleGame,
} from "../../protocol.ts";
import { originAllowed } from "../origin.ts";
import { clearedCookie, newSessionId, newUserId, sessionCookie, sessionHash, sessionIdOf } from "../session.ts";
import { googleKeys, verifyIdToken } from "../token.ts";
import { type UserRow, userOf } from "../user.ts";
import { finishedPlays, importedStats, importStats } from "./plays.ts";
import { accountOf, endSession, openAccount, removeAccount, setName, startSession, userBySession } from "./store.ts";

export { purgeIdle } from "./store.ts";

export { proxyFirebaseAuth } from "./proxy.ts";
export type { UserRow } from "../user.ts";

/** What accounts need from the Worker's environment. */
export interface AccountEnv {
  DB: D1Database;
  /**
   * "on" lets an email-and-password account in before its address is
   * verified. For local development only, where no verification email can be
   * clicked by a test; never set on the site.
   */
  ACCOUNT_ALLOW_UNVERIFIED?: string;
}

/** Finished puzzles one answer carries: a few years of daily ones, and endless ones. */
const MAX_PLAYS = 2000;
/** The largest device record kept on import, in characters of JSON. */
const MAX_IMPORT = 4096;

/** A session is started only from a sign-in this recent: a token lifted from somewhere later can't open one. */
const FRESH_SIGN_IN = 10 * 60_000;

const keys = googleKeys();

const json = (body: unknown, status = 200, cookie?: string): Response => {
  const headers = new Headers({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  if (cookie) headers.set("Set-Cookie", cookie);
  return Response.json(body, { status, headers });
};
const fail = (error: AccountError, status: number, cookie?: string): Response => json({ error }, status, cookie);

/** The signed-in player behind a request, if any: for the other APIs (harfiyen's rooms, the daily games' records). */
export async function sessionUser(request: Request, env: AccountEnv): Promise<UserRow | null> {
  const id = sessionIdOf(request.headers.get("Cookie"));
  return id ? userBySession(env.DB, await sessionHash(id), Date.now()) : null;
}

/** Everything under /api/hesap (see protocol.ts). */
export async function routeAccount(request: Request, env: AccountEnv): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/hesap/, "");
  if (request.method !== "GET") return fail("yok", 405);
  if (!originAllowed(request, url) || request.headers.get(ACCOUNT_HEADER) !== "1") return fail("koken", 403);
  const now = Date.now();
  const sessionId = sessionIdOf(request.headers.get("Cookie"));
  const hash = sessionId ? await sessionHash(sessionId) : null;

  if (path === "/giris") {
    const token = /^Bearer (\S+)$/.exec(request.headers.get("Authorization") ?? "")?.[1];
    const claims = token ? await verifyIdToken(token, FIREBASE_PROJECT, keys, now) : null;
    if (!claims) return fail("token", 401);
    if (now - claims.authTime > FRESH_SIGN_IN) return fail("eski", 401);
    if (claims.provider !== "google.com" && claims.provider !== "password") return fail("token", 401);
    if (claims.provider === "password" && !claims.emailVerified && env.ACCOUNT_ALLOW_UNVERIFIED !== "on") {
      return fail("dogrulanmadi", 403);
    }
    let row = await accountOf(env.DB, claims, now);
    if (!row) {
      // A first sign-in opens an account only with the player's say-so (18 or older, the notice read).
      if (request.headers.get(CONSENT_HEADER) !== CONSENT_VERSION) return fail("onay", 403);
      row = await openAccount(env.DB, claims, newUserId(), CONSENT_VERSION, now);
    }
    // A sign-in replaces whatever session this browser had.
    if (hash) await endSession(env.DB, hash);
    const id = newSessionId();
    await startSession(env.DB, row.id, await sessionHash(id), now);
    return json({ user: userOf(row) }, 200, sessionCookie(id));
  }

  if (path === "/cikis") {
    if (hash) await endSession(env.DB, hash);
    return json({ ok: true }, 200, clearedCookie());
  }

  const row = hash ? await userBySession(env.DB, hash, now) : null;
  // Each page asks once: the cookie is sent again, so it runs out when the session does, 180 days after last use.
  if (path === "/ben") return row ? json({ user: userOf(row) }, 200, sessionCookie(sessionId!)) : json({ user: null }, 200, sessionId ? clearedCookie() : undefined);
  if (!row) return fail("oturum", 401, sessionId ? clearedCookie() : undefined);

  if (path === "/ad") {
    let asked: string;
    try {
      asked = decodeURIComponent(request.headers.get(NAME_HEADER) ?? "").trim();
    } catch {
      return fail("ad", 400);
    }
    const name = asked === "" ? null : cleanName(asked);
    if (asked !== "" && name === null) return fail("ad", 400);
    const updated = await setName(env.DB, row.id, name);
    return updated ? json({ user: userOf(updated) }) : fail("oturum", 401);
  }

  const game = url.searchParams.get("oyun");
  const puzzleGame = (PUZZLE_GAMES as readonly string[]).includes(game ?? "") ? (game as PuzzleGame) : null;

  if (path === "/kayitlar") {
    if (!puzzleGame) return fail("yok", 404);
    const [plays, imported] = await Promise.all([
      finishedPlays(env.DB, row.id, puzzleGame, MAX_PLAYS),
      importedStats(env.DB, row.id, puzzleGame),
    ]);
    return json({ plays, imported });
  }

  if (path === "/aktar") {
    if (!puzzleGame) return fail("yok", 404);
    const raw = request.headers.get(DATA_HEADER) ?? "";
    let stats: unknown;
    try {
      stats = raw.length <= 3 * MAX_IMPORT ? JSON.parse(decodeURIComponent(raw)) : null;
    } catch {
      stats = null;
    }
    if (!stats || typeof stats !== "object" || Array.isArray(stats) || JSON.stringify(stats).length > MAX_IMPORT) return fail("yok", 400);
    return json({ imported: await importStats(env.DB, row.id, puzzleGame, stats, now) });
  }

  if (path === "/sil") {
    await removeAccount(env.DB, row.id);
    return json({ ok: true }, 200, clearedCookie());
  }

  return fail("yok", 404);
}
