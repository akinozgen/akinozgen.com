/**
 * The site's own session: a random id in an HttpOnly cookie, its SHA-256 in
 * the database. Page code can't read or set the cookie, a copy of the
 * database holds no usable session, and an id can't be guessed (256 bits).
 * `__Host-` keeps the cookie to this host, over HTTPS, for the whole site;
 * SameSite=Strict keeps it off requests another site starts. The pages
 * themselves are static, so it's only ever wanted on the page's own calls.
 */

export const SESSION_COOKIE = "__Host-oturum";
/** A session lasts this long after it was last used. */
export const SESSION_DAYS = 180;
export const DAY = 86_400_000;

const SESSION_ID = /^[A-Za-z0-9_-]{43}$/;

const hex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A new session id: 256 random bits, URL-safe. */
export function newSessionId(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/** A new account id: 256 random bits as hex. It doubles as the account's public id in the games (a seat, the #number). */
export function newUserId(): string {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}

/** What the database keeps of a session id. */
export async function sessionHash(id: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`oturum:${id}`))));
}

/** The session id a request carries, if it looks like one. */
export function sessionIdOf(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const pair of cookieHeader.split(";")) {
    const at = pair.indexOf("=");
    if (at === -1 || pair.slice(0, at).trim() !== SESSION_COOKIE) continue;
    const value = pair.slice(at + 1).trim();
    return SESSION_ID.test(value) ? value : null;
  }
  return null;
}

export const sessionCookie = (id: string): string =>
  `${SESSION_COOKIE}=${id}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DAYS * 86_400}`;

export const clearedCookie = (): string => `${SESSION_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;
