import { PROTOCOL } from "@harfiyen/engine";
import { sessionLost } from "./session.ts";

/** A call that didn't give what it asked for: the server's error code, or "ag" when no answer could be read. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(`harfiyen api: ${code} (${status})`);
  }
}

/**
 * A call to the game's server over HTTP: a GET (the site's firewall lets
 * nothing else through) carrying the protocol's version, with the session
 * cookie going along on its own. The body of a good answer comes back; an
 * error is thrown, and one that says the session is gone tells the online
 * screens so.
 */
export async function callApi<T>(path: string, query: Record<string, string> = {}, headers: Record<string, string> = {}): Promise<T> {
  let response: Response;
  try {
    const search = new URLSearchParams({ v: String(PROTOCOL), ...query });
    response = await fetch(`/api/harfiyen/${path}?${search}`, { headers, credentials: "same-origin" });
  } catch {
    throw new ApiError("ag", 0);
  }
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (response.ok && body && typeof body === "object") return body as T;
  const code = typeof body?.error === "string" ? body.error : "ag";
  if (code === "oturum") sessionLost();
  throw new ApiError(code, response.status);
}
