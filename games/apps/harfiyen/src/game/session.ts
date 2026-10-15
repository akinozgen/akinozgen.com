import type { User } from "@akinozgen/account";
import { refresh, useAccount } from "@akinozgen/account/client";
import { useEffect, useSyncExternalStore } from "react";

/**
 * Who plays online: the site's account (games/packages/account), signed in
 * once for every game. Playing against the computer needs none.
 *
 * The account's own store says who is signed in. A call to the game's
 * server that finds no session (`oturum`) is believed at once — the online
 * screens offer the sign-in — and the account is asked again, so the top
 * bar and the rest of the page catch up.
 */

export type SessionStatus = "loading" | "in" | "out";

export interface Session {
  status: SessionStatus;
  /** The signed-in account, while `status` is "in". */
  user: User | null;
}

let lost = false;
const listeners = new Set<() => void>();

function setLost(next: boolean): void {
  if (lost === next) return;
  lost = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const isLost = (): boolean => lost;

/** The server said `oturum`: the online screens show the sign-in, and the account is asked again. */
export function sessionLost(): void {
  setLost(true);
  void refresh();
}

/** Forgets a lost session, for tests that start each case afresh. */
export function resetSessionCache(): void {
  lost = false;
}

/** The account as the online screens see it. */
export function useSession(): Session {
  const account = useAccount();
  const gone = useSyncExternalStore(subscribe, isLost, isLost);
  // Once the account itself says nobody is signed in, it speaks for the sign-in again: the next one starts afresh.
  useEffect(() => {
    if (gone && account.status === "out") setLost(false);
  }, [gone, account.status]);
  if (gone || account.status === "out") return { status: "out", user: null };
  if (account.status === "loading" || !account.user) return { status: "loading", user: null };
  return { status: "in", user: account.user };
}

/**
 * The account a browser's cached list of games belongs to: its number and
 * when it was made, which together tell one account from another without
 * anything private.
 */
export const ownerOf = (user: User): string => `${user.tag}:${user.createdAt}`;
