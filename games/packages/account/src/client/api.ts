import { ACCOUNT_HEADER, type AccountError, NAME_HEADER, type User } from "../protocol.ts";

/**
 * The account API from the page (see protocol.ts): five GETs, each with the
 * header that marks it as the site's own, the cookie sent along and nothing
 * cached. Every call answers with a value, never a throw: what the server
 * said, or why there was no answer.
 */

/** "ag": no answer the page could read — offline, the server down, or a page that isn't the API (a 404 before it's deployed). */
export type ApiError = AccountError | "ag";

export type ApiReply<T> = { ok: true; data: T } | { ok: false; error: ApiError; status: number };

const BASE = "/api/hesap";
const ERRORS: readonly AccountError[] = ["oturum", "token", "eski", "dogrulanmadi", "ad", "koken", "yok"];

async function call<T>(
  path: string,
  read: (body: Record<string, unknown>) => T | null,
  headers: Record<string, string> = {},
): Promise<ApiReply<T>> {
  let response: Response;
  try {
    response = await fetch(`${BASE}/${path}`, {
      headers: { [ACCOUNT_HEADER]: "1", ...headers },
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "ag", status: 0 };
  }
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (response.ok && body && typeof body === "object") {
    const data = read(body);
    if (data !== null) return { ok: true, data };
  }
  const said = body && typeof body === "object" ? body.error : undefined;
  const error = ERRORS.includes(said as AccountError) ? (said as AccountError) : "ag";
  return { ok: false, error, status: response.status };
}

/** A user as the server sends it, checked enough to be shown. */
export function isUser(value: unknown): value is User {
  const user = value as Partial<User> | null;
  return (
    typeof user === "object" &&
    user !== null &&
    typeof user.name === "string" &&
    typeof user.base === "string" &&
    typeof user.tag === "string" &&
    typeof user.provider === "string"
  );
}

const withUser = (body: Record<string, unknown>): { user: User } | null => (isUser(body.user) ? { user: body.user } : null);
const done = (body: Record<string, unknown>): { ok: true } | null => (body.ok === true ? { ok: true } : null);

/** Who this browser's session belongs to; `{user: null}` when it has none. */
export const fetchMe = (): Promise<ApiReply<{ user: User | null }>> =>
  call("ben", (body) => (body.user === null ? { user: null } : withUser(body)));

/** Trades a Firebase ID token for the site's session (the cookie comes with the answer). */
export const exchangeToken = (idToken: string): Promise<ApiReply<{ user: User }>> =>
  call("giris", withUser, { Authorization: `Bearer ${idToken}` });

/** Ends the session. */
export const endSession = (): Promise<ApiReply<{ ok: true }>> => call("cikis", done);

/** New words for the account's name; an empty string puts the default back. In a header, so names stay out of request logs. */
export const renameAccount = (words: string): Promise<ApiReply<{ user: User }>> =>
  call("ad", withUser, { [NAME_HEADER]: encodeURIComponent(words) });

/** Deletes the account and everything it holds, and ends the session. */
export const deleteAccount = (): Promise<ApiReply<{ ok: true }>> => call("sil", done);
