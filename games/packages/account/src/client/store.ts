import type { User as FirebaseUser } from "firebase/auth";
import { useMemo, useSyncExternalStore } from "react";
import type { User } from "../protocol.ts";
import { type ApiError, deleteAccount, endSession, exchangeToken, fetchMe, renameAccount } from "./api.ts";
import { type FirebaseKit, loadedFirebase, loadFirebase } from "./load.ts";
import { accountMessage, errorCode, firebaseMessage, OFFLINE, problemOf } from "./messages.ts";
import { cachedUser, cacheUser, takeRedirect } from "./storage.ts";

/**
 * Who is signed in, for every game on the site: one session, kept by the
 * Worker in a cookie the page can't read, so the page asks. It asks once on
 * load, again when another tab says something changed, and again when the
 * page comes back into view after a while away.
 */

export type AccountStatus = "loading" | "in" | "out";

export interface AccountState {
  status: AccountStatus;
  user: User | null;
  /** Something to tell the player that happened without them in the sign-in: a redirect sign-in that failed. */
  notice: string | null;
  /** A first sign-in, held in Firebase while the player is asked to agree to an account being opened. */
  consent: FirebaseUser | null;
}

export interface Account extends AccountState {
  refresh: () => Promise<void>;
  signOut: () => Promise<ApiError | null>;
  rename: (words: string) => Promise<ApiError | null>;
  remove: () => Promise<ApiError | null>;
}

/** Back in view after this long, the page asks again. */
const STALE_AFTER = 60_000;
const CHANNEL = "hesap";

const initial = (): AccountState => {
  const user = cachedUser();
  return user ? { status: "in", user, notice: null, consent: null } : { status: "loading", user: null, notice: null, consent: null };
};

let state: AccountState = initial();
const listeners = new Set<() => void>();
let started = false;
let channel: BroadcastChannel | null = null;
let asking: Promise<void> | null = null;
let askedAt = 0;
/** Bumped by every change made here, so an answer to an older question doesn't undo it. */
let version = 0;

function set(next: Partial<AccountState>): void {
  state = { ...state, ...next };
  if (next.user !== undefined) cacheUser(next.user);
  for (const listener of listeners) listener();
}

const signedIn = (user: User): void => set({ status: "in", user, consent: null });
const signedOut = (): void => set({ status: "out", user: null });

/** Tells the other tabs of this site to ask again. */
function announce(): void {
  try {
    channel?.postMessage("changed");
  } catch {
    // A closed channel: the other tabs catch up when they're next looked at.
  }
}

/** A change made here: noted against older answers still on their way, and passed on to other tabs. */
function changed(apply: () => void): void {
  version++;
  apply();
  announce();
}

export function refresh(): Promise<void> {
  if (asking) return asking;
  const asked = version;
  askedAt = Date.now();
  asking = fetchMe().then((reply) => {
    asking = null;
    if (asked !== version) return;
    if (reply.ok) {
      if (reply.data.user) signedIn(reply.data.user);
      else signedOut();
    } else if (reply.error === "ag" && (reply.status === 0 || reply.status >= 500)) {
      // No answer: whoever was here stays, until the server can say otherwise.
      if (state.status === "loading") signedOut();
    } else {
      signedOut();
    }
  });
  return asking;
}

function onVisible(): void {
  if (document.visibilityState === "visible" && Date.now() - askedAt >= STALE_AFTER) void refresh();
}

function start(): void {
  if (started) return;
  started = true;
  if (typeof BroadcastChannel === "function") {
    try {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = () => void refresh();
    } catch {
      channel = null;
    }
  }
  document.addEventListener("visibilitychange", onVisible);
  if (takeRedirect()) void finishRedirect();
  else void refresh();
}

/** Back from Google after a redirect sign-in: Firebase has the result, waiting to be traded for a session. */
async function finishRedirect(): Promise<void> {
  set({ status: "loading" });
  let kit: FirebaseKit;
  try {
    kit = await loadFirebase();
  } catch {
    set({ notice: OFFLINE });
    return refresh();
  }
  let found: FirebaseUser | null;
  try {
    found = await kit.redirectResult();
  } catch (error) {
    const code = errorCode(error);
    if (!kit.isCancelled(code)) set({ notice: firebaseMessage(code) });
    return refresh();
  }
  if (!found) return refresh();
  const outcome = await finishSignIn(kit, found);
  if (outcome.kind === "in") return;
  if (outcome.kind === "error") set({ notice: outcome.message });
  return refresh();
}

export type SignInOutcome = { kind: "in"; user: User } | { kind: "verify" } | { kind: "consent" } | { kind: "error"; message: string };

/**
 * After Firebase has said who the player is: its token for the site's
 * session, then out of Firebase. An address not yet verified keeps the
 * Firebase sign-in, for asking again once it is; so does a first sign-in
 * the player hasn't yet agreed to open an account with (`agreed`), which
 * the sheet then asks about.
 */
export async function finishSignIn(kit: FirebaseKit, found: FirebaseUser, fresh = false, agreed = false): Promise<SignInOutcome> {
  let token: string;
  try {
    token = await found.getIdToken(fresh);
  } catch (error) {
    return { kind: "error", message: problemOf(error) };
  }
  const reply = await exchangeToken(token, agreed);
  if (!reply.ok && reply.error === "dogrulanmadi") return { kind: "verify" };
  if (!reply.ok && reply.error === "onay") {
    set({ consent: found });
    return { kind: "consent" };
  }
  await kit.leave().catch(() => {});
  if (!reply.ok) return { kind: "error", message: accountMessage(reply.error) };
  changed(() => signedIn(reply.data.user));
  return { kind: "in", user: reply.data.user };
}

/** The player won't open an account after all: out of Firebase, back to the start. */
export async function cancelConsent(): Promise<void> {
  set({ consent: null });
  await loadedFirebase()?.leave().catch(() => {});
}

export async function signOut(): Promise<ApiError | null> {
  const reply = await endSession();
  if (!reply.ok) return reply.error;
  changed(signedOut);
  return null;
}

/** New words for the name; "" puts the default back. */
export async function rename(words: string): Promise<ApiError | null> {
  const reply = await renameAccount(words);
  if (reply.ok) changed(() => signedIn(reply.data.user));
  else if (reply.error === "oturum") changed(signedOut);
  return reply.ok ? null : reply.error;
}

/** Deletes the account on the site's side; Firebase's half is the caller's (see AccountSheet). */
export async function remove(): Promise<ApiError | null> {
  const reply = await deleteAccount();
  if (!reply.ok) return reply.error;
  changed(signedOut);
  return null;
}

export const clearNotice = (): void => {
  if (state.notice !== null) set({ notice: null });
};

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  start();
  return () => listeners.delete(listener);
}

const snapshot = (): AccountState => state;

/** The account, for any component: who is signed in, and what can be done about it. */
export function useAccount(): Account {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);
  return useMemo(() => ({ ...current, refresh, signOut, rename, remove }), [current]);
}

/** Forgets everything, for tests that start each case afresh. */
export function resetAccountCache(): void {
  if (started) document.removeEventListener("visibilitychange", onVisible);
  channel?.close();
  channel = null;
  started = false;
  asking = null;
  askedAt = 0;
  version++;
  state = initial();
}
