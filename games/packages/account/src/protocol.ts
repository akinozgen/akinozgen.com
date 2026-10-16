/**
 * The account API, as browsers and the Worker share it. Every call is a
 * GET (the site's firewall lets nothing else through) from a page of this
 * site, with the header `X-Hesap: 1`: a page elsewhere can't add that
 * header without the browser asking first, and the Worker doesn't answer
 * that question, so none of these can be called from another site.
 *
 *   GET /api/hesap/ben                     → {user: User | null}
 *   GET /api/hesap/giris   Authorization: Bearer <Firebase ID token>
 *                          [X-Hesap-Onay: <CONSENT_VERSION>]
 *                                          → {user} and the session cookie; for a Firebase user with
 *                                            no account yet, 403 `onay` unless the header says the
 *                                            player is 18 or older and has read this version of the notice
 *   GET /api/hesap/cikis                   → {ok: true}, the cookie cleared
 *   GET /api/hesap/ad      X-Hesap-Ad: <name, URI-encoded>
 *                                          → {user}; an empty name puts the default back
 *   GET /api/hesap/sil                     → {ok: true}: the account and all it holds are gone
 *   GET /api/hesap/kayitlar?oyun=<game>    → {plays: PlayRecord[], imported: Imported | null}
 *                                            the account's finished puzzles in one game, newest first
 *   GET /api/hesap/aktar?oyun=<game>   X-Hesap-Veri: <the device's stats, JSON, URI-encoded, ≤ 4 KB>
 *                                          → {imported: boolean}: kept once per game, the first time
 *
 * Names and stats travel in headers, not the query, so they stay out of
 * request logs.
 *
 * Errors are `{error: AccountError}` with a 4xx status.
 *
 * The session is an HttpOnly cookie: page code can neither read nor write
 * it. Firebase is only the way in: once the Worker has checked Firebase's
 * token and set the cookie, the page signs out of Firebase again.
 */

/** The header every account call carries. */
export const ACCOUNT_HEADER = "X-Hesap";
/** The header a new name travels in. */
export const NAME_HEADER = "X-Hesap-Ad";
/** The header a device's stats travel in, to be imported. */
export const DATA_HEADER = "X-Hesap-Veri";
/** The header that carries a new player's consent: the version of the privacy notice they read. */
export const CONSENT_HEADER = "X-Hesap-Onay";
/** The privacy notice (/gizlilik/) a new account agrees to, by the date it took effect. */
export const CONSENT_VERSION = "2026-10-16";
/** How old a player must say they are to open an account. */
export const MIN_AGE = 18;

/** The games whose puzzles an account keeps (see migrations/0003_plays.sql). */
export const PUZZLE_GAMES = ["travelle", "vexle", "tessle", "sizele"] as const;
export type PuzzleGame = (typeof PUZZLE_GAMES)[number];

/** A finished puzzle as the account keeps it: the game's own summary of the server's verdict. */
export interface PlayRecord<Result = unknown> {
  /** "d:2026-10-15" for a day's puzzle, "e:<round>" for an endless one. */
  puzzle: string;
  result: Result;
  startedAt: number;
  finishedAt: number;
}

/** What the device had recorded before the account, as it sent it: its word, not the server's. */
export interface Imported<Stats = unknown> {
  stats: Stats;
  importedAt: number;
}

export interface User {
  /** As others see it: "Neşeli Kirpi #4821". */
  name: string;
  /** The words in use: the player's own, or the account's default. */
  base: string;
  /** The account's number, the part of its name that never changes: "4821". */
  tag: string;
  /** The player's own words; null while the default stands. */
  chosen: string | null;
  email: string | null;
  /** How they signed in: "google.com" or "password". */
  provider: string;
  createdAt: number;
}

export type AccountError =
  /** No session, or it ran out: sign in. */
  | "oturum"
  /** Firebase's token didn't check out (forged, expired, another project's). */
  | "token"
  /** The sign-in was too long ago to start a session from: sign in again. */
  | "eski"
  /** An email-and-password account whose address isn't verified yet. */
  | "dogrulanmadi"
  /** No account for this Firebase user yet, and no consent to open one. */
  | "onay"
  /** A name that isn't fit to show. */
  | "ad"
  /** Not from a page of this site, or without the header. */
  | "koken"
  | "yok";
