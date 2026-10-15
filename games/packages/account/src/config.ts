/**
 * The Firebase project the site signs players in with. None of this is a
 * secret: a web page has to carry it, and anyone can read it there. What
 * keeps it to this site is Firebase's list of authorized domains and the
 * API key's website restriction, both set in the consoles.
 */
export const FIREBASE_PROJECT = "akinozgencom-c94bd";

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDKY7CvR3ZYiDuSydV2GWgL77dnCqW6tIw",
  /**
   * Where Firebase's sign-in pages are served from. On the site it is the
   * site itself — the Worker passes /__/auth/* through to Firebase — so a
   * browser that keeps storage apart by site (Safari, and Chrome since 115)
   * sees one site throughout the Google sign-in. Elsewhere (development)
   * Firebase's own domain, with a popup.
   */
  authDomain: `${FIREBASE_PROJECT}.firebaseapp.com`,
  projectId: FIREBASE_PROJECT,
  appId: "1:517708785520:web:016d2a456a5dfe7d0491b5",
  messagingSenderId: "517708785520",
} as const;

/** The site's own host, where /__/auth/ is passed through to Firebase. */
export const SITE_HOST = "akinozgen.com";
