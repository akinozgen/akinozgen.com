import { getApp, getApps, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { FIREBASE_CONFIG, SITE_HOST } from "../config.ts";
import { errorCode } from "./messages.ts";
import { markRedirect } from "./storage.ts";

/**
 * Firebase, the way in. This module is only ever imported dynamically (see
 * load.ts), so a page whose player never opens the sign-in never downloads
 * it. Once Firebase has said who the player is, the page trades its token
 * for the site's own session and signs out of Firebase again.
 */

/**
 * On the site, Firebase's sign-in pages come from the site itself (the
 * Worker passes /__/auth/* through), so browsers that keep storage apart by
 * site still see one site throughout. Anywhere else, Firebase's own domain.
 */
const config = {
  ...FIREBASE_CONFIG,
  authDomain: location.hostname === SITE_HOST ? SITE_HOST : FIREBASE_CONFIG.authDomain,
};

const auth = getAuth(getApps().length > 0 ? getApp() : initializeApp(config));
auth.languageCode = "tr";

/** Where popups can't open (blocked, or a browser inside an app), the whole page goes to Google instead. */
const NO_POPUP = new Set([
  "auth/popup-blocked",
  "auth/operation-not-supported-in-this-environment",
  "auth/operation-not-allowed-in-this-environment",
]);
/** The player closed the window, or started another: nothing to say. */
const CANCELLED = new Set([
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/user-cancelled",
  "auth/redirect-cancelled-by-user",
]);

export const isCancelled = (code: string): boolean => CANCELLED.has(code);

export type GoogleOutcome = { kind: "user"; user: FirebaseUser } | { kind: "redirecting" } | { kind: "cancelled" };

/**
 * Google, in a popup. Where no popup can open the page goes to Google and
 * comes back, which `redirectResult` picks up on the next load — unless
 * `redirect` is off (confirming a deletion, which can't survive a reload).
 */
export async function signInWithGoogle({ hint, redirect = true }: { hint?: string | null; redirect?: boolean } = {}): Promise<GoogleOutcome> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters(hint ? { login_hint: hint } : { prompt: "select_account" });
  try {
    const credential = await signInWithPopup(auth, provider);
    return { kind: "user", user: credential.user };
  } catch (error) {
    const code = errorCode(error);
    if (isCancelled(code)) return { kind: "cancelled" };
    if (!redirect || !NO_POPUP.has(code)) throw error;
  }
  markRedirect();
  await signInWithRedirect(auth, provider);
  return { kind: "redirecting" };
}

/** The player back from Google after a redirect sign-in, or null. */
export async function redirectResult(): Promise<FirebaseUser | null> {
  return (await getRedirectResult(auth))?.user ?? null;
}

export async function signInWithPassword(email: string, password: string): Promise<FirebaseUser> {
  return (await signInWithEmailAndPassword(auth, email, password)).user;
}

/** A new email-and-password account; its verification email is the caller's next step. */
export async function signUpWithPassword(email: string, password: string): Promise<FirebaseUser> {
  return (await createUserWithEmailAndPassword(auth, email, password)).user;
}

/** The link in the email brings the player back to this page; if Firebase won't take this page's address, to its own. */
export async function sendVerification(user: FirebaseUser): Promise<void> {
  try {
    await sendEmailVerification(user, { url: location.href });
  } catch (error) {
    if (!errorCode(error).includes("continue-uri")) throw error;
    await sendEmailVerification(user);
  }
}

/** Sends the reset link. That there's no such account is kept to ourselves: whoever typed the address learns nothing from it. */
export async function resetPassword(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(auth, email, { url: location.href });
  } catch (error) {
    const code = errorCode(error);
    if (code === "auth/user-not-found") return;
    if (!code.includes("continue-uri")) throw error;
    await sendPasswordResetEmail(auth, email).catch((again: unknown) => {
      if (errorCode(again) !== "auth/user-not-found") throw again;
    });
  }
}

/** Asks Firebase again whether the address is verified now. */
export async function reload(user: FirebaseUser): Promise<boolean> {
  await user.reload();
  return user.emailVerified;
}

export const leave = (): Promise<void> => signOut(auth);

export const removeUser = (user: FirebaseUser): Promise<void> => deleteUser(user);
