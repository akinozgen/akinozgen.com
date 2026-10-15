/**
 * Firebase, fetched the first time something asks for it: when the sign-in
 * opens, or when the page is back from a redirect sign-in. Never before.
 */

export type FirebaseKit = typeof import("./firebase.ts");

let loading: Promise<FirebaseKit> | null = null;
let loaded: FirebaseKit | null = null;

export function loadFirebase(): Promise<FirebaseKit> {
  loading ??= import("./firebase.ts").then(
    (kit) => (loaded = kit),
    (error: unknown) => {
      // Offline, most likely: the next try fetches it again.
      loading = null;
      throw error;
    },
  );
  return loading;
}

/**
 * Firebase if it's here already. A popup opens only close enough to the
 * click that asked for it, so the Google button calls straight through when
 * it can rather than wait on a download first.
 */
export const loadedFirebase = (): FirebaseKit | null => loaded;

/** Starts the download without waiting for it: the sign-in is open, a click may follow. */
export function preloadFirebase(): void {
  loadFirebase().catch(() => {});
}
