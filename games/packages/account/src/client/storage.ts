import type { User } from "../protocol.ts";
import { isUser } from "./api.ts";

/**
 * What the page keeps for the length of a visit, in sessionStorage: the
 * player last seen, so a game paints the right face before the server
 * answers, and a note that a sign-in went off to Google and will come back.
 * Storage may be blocked or full; then there's simply nothing kept.
 */

const ME_KEY = "hesap:ben:v1";
const REDIRECT_KEY = "hesap:redirect:v1";

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // Not kept: the next page asks the server, as it would anyway.
  }
}

export function cachedUser(): User | null {
  try {
    const user = JSON.parse(read(ME_KEY) ?? "null") as unknown;
    return isUser(user) ? user : null;
  } catch {
    return null;
  }
}

export const cacheUser = (user: User | null): void => write(ME_KEY, user ? JSON.stringify(user) : null);

/** Set just before the page goes to Google. */
export const markRedirect = (): void => write(REDIRECT_KEY, String(Date.now()));

/** Whether this load is the way back from Google; asking clears it. */
export function takeRedirect(): boolean {
  const marked = read(REDIRECT_KEY) !== null;
  if (marked) write(REDIRECT_KEY, null);
  return marked;
}
