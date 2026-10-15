import { MAX_SUMMARY } from "@harfiyen/engine";
import { callApi } from "./api.ts";

/**
 * Before accounts, each browser played online as a device: a random secret
 * kept here, and a name of its own. The first time someone signs in on a
 * browser that still has that secret, its games move to the account — the
 * server hands each seat the device held over to the account — and the
 * secret is let go, so it happens once.
 */

const DEVICE_KEY = "harfiyen:device:v1";
const NAME_KEY = "harfiyen:name:v1";
/** Set once the device's games have moved (or there were none): the move is never tried again. */
const MOVED_KEY = "harfiyen:device-moved:v1";
const SECRET = /^[0-9a-f]{32}$/;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** The old device's secret, while its games are still to move; null once they have, or if there never was one. */
export function oldDeviceSecret(): string | null {
  if (read(MOVED_KEY) !== null) return null;
  const secret = read(DEVICE_KEY);
  return secret && SECRET.test(secret) ? secret : null;
}

/** The move is done: the device's secret and name go, and the note that it's done stays. */
function moved(now: number): void {
  try {
    localStorage.removeItem(DEVICE_KEY);
    localStorage.removeItem(NAME_KEY);
    localStorage.setItem(MOVED_KEY, String(now));
  } catch {
    // Storage blocked: the server turns away a second try at the same seats anyway.
  }
}

/**
 * Moves the old device's seats in these rooms (the browser's list of
 * games) to the signed-in account, twenty at a time. The rooms moved come
 * back; nothing is asked when there's no secret or no room to move. A
 * failed call throws and leaves everything as it was, for the next try.
 */
export async function moveDeviceGames(codes: readonly string[], now: number = Date.now()): Promise<string[]> {
  const secret = oldDeviceSecret();
  if (!secret) return [];
  const done: string[] = [];
  for (let i = 0; i < codes.length; i += MAX_SUMMARY) {
    // The secret in a header, as it always travelled; the codes in the query.
    const body = await callApi<{ codes?: unknown }>("bagla", { k: codes.slice(i, i + MAX_SUMMARY).join(",") }, { "X-Harfiyen-Secret": secret });
    if (Array.isArray(body.codes)) done.push(...body.codes.filter((code): code is string => typeof code === "string"));
  }
  moved(now);
  return done;
}
