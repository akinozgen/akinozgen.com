import type { PushSub } from "@harfiyen/engine";
import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Notices when it's the player's turn and the page is closed: the browser's
 * push service, a tiny service worker that shows them, and the server
 * holding where to send them per seat. Asked for only after a tap, never on
 * load; "not now" is remembered for a while.
 */

const KEY = "harfiyen:push:v1";
/** How long "Şimdi değil" keeps the offer away. */
export const SNOOZE = 14 * 86_400_000;

interface Stored {
  /** Where this device's notices go; null when it has none. */
  sub: PushSub | null;
  /** The player turned notices off: rooms are told to stop. */
  off?: boolean;
  /** "Not now" until this time. */
  snoozedUntil?: number;
}

/** What this browser can do: push as usual, push only once installed (iOS), or nothing. */
export type PushSupport = "ok" | "install" | "none";

/** The browser's side, injectable for tests. */
export const env = {
  navigator: (): Navigator | undefined => (typeof navigator === "undefined" ? undefined : navigator),
  window: (): (Window & typeof globalThis) | undefined => (typeof window === "undefined" ? undefined : window),
};

export function pushSupport(): PushSupport {
  const nav = env.navigator();
  const win = env.window();
  if (!nav || !win) return "none";
  const ios = /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  const standalone = (nav as Navigator & { standalone?: boolean }).standalone;
  // iOS shows notices only from a page added to the home screen.
  if (ios && standalone === false) return "install";
  return "serviceWorker" in nav && "PushManager" in win && "Notification" in win ? "ok" : "none";
}

function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    const value = raw ? (JSON.parse(raw) as Stored) : null;
    if (value && typeof value === "object") return { sub: value.sub ?? null, off: value.off, snoozedUntil: value.snoozedUntil };
  } catch {
    // nothing stored, or it can't be
  }
  return { sub: null };
}

let cache: Stored | null = null;
const listeners = new Set<() => void>();

function snapshot(): Stored {
  cache ??= read();
  return cache;
}

function write(next: Stored): void {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // kept for this visit
  }
  for (const listener of listeners) listener();
}

export function subscribePush(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetPushCache(): void {
  cache = null;
  keyLoad = null;
}

/** The message for a room right after its greeting: where notices go, or that they stopped. Null: say nothing. */
export function pushMessage(): { t: "push"; sub: PushSub | null } | null {
  const state = snapshot();
  if (state.sub) return { t: "push", sub: state.sub };
  if (state.off) return { t: "push", sub: null };
  return null;
}

let keyLoad: Promise<string | null> | null = null;

/** The server's public key for push, or null when push isn't set up there. */
export function vapidKey(): Promise<string | null> {
  keyLoad ??= fetch("/api/harfiyen/vapid")
    .then(async (response) => {
      if (!response.ok) return null;
      const body = (await response.json()) as { key?: unknown };
      return typeof body.key === "string" && body.key.length > 40 ? body.key : null;
    })
    .catch(() => {
      keyLoad = null;
      return null;
    });
  return keyLoad;
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** The service worker, registered beside the page (at /, or /games/harfiyen/ on the site). */
async function registration(): Promise<ServiceWorkerRegistration> {
  const container = env.navigator()!.serviceWorker;
  await container.register(new URL("sw.js", document.baseURI), { scope: "./" });
  return container.ready;
}

function asSub(json: PushSubscriptionJSON): PushSub | null {
  const { endpoint, keys } = json;
  return endpoint && keys?.p256dh && keys.auth ? { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } } : null;
}

const sameKey = (a: ArrayBuffer | null | undefined, b: Uint8Array): boolean =>
  !!a && a.byteLength === b.length && new Uint8Array(a).every((byte, i) => byte === b[i]);

/** "brave": Brave, which ships with the push service switched off; the player has to switch it on. */
export type EnableResult = "on" | "denied" | "failed" | "brave";

let lastError: string | null = null;
/** What went wrong the last time notices wouldn't turn on, as the browser put it. */
export const pushError = (): string | null => lastError;

const isBrave = (): boolean => typeof (env.navigator() as { brave?: unknown } | null)?.brave === "object";

/**
 * Turns notices on. Called straight from a tap: the permission prompt
 * comes first, before anything else is awaited, or some browsers won't
 * show it.
 */
export async function enablePush(): Promise<EnableResult> {
  const win = env.window();
  if (!win || pushSupport() !== "ok") return "failed";
  const asking = win.Notification.requestPermission();
  const key = await vapidKey();
  const permission = await asking;
  if (permission !== "granted") {
    // Nothing stored changes, but the screens should hear the answer.
    write({ ...snapshot() });
    return permission === "denied" ? "denied" : "failed";
  }
  if (!key) {
    lastError = "Sunucudan bildirim anahtarı alınamadı.";
    return "failed";
  }
  lastError = null;
  try {
    const reg = await registration();
    const server = fromBase64Url(key);
    let current = await reg.pushManager.getSubscription();
    // A subscription made for another key (the server's changed) can't be reused.
    if (current && !sameKey(current.options.applicationServerKey, server)) {
      await current.unsubscribe();
      current = null;
    }
    current ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: server });
    const sub = asSub(current.toJSON());
    if (!sub) {
      lastError = "Tarayıcı eksik bir abonelik verdi.";
      return "failed";
    }
    write({ sub });
    return "on";
  } catch (error) {
    lastError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    // Brave turns its push service off by default, and subscribing fails with a bare "push service error".
    return isBrave() ? "brave" : "failed";
  }
}

/** Turns notices off here, and tells the rooms to stop. */
export async function disablePush(): Promise<void> {
  write({ ...snapshot(), sub: null, off: true });
  try {
    const reg = await env.navigator()?.serviceWorker?.getRegistration(new URL("./", document.baseURI).href);
    const current = await reg?.pushManager.getSubscription();
    await current?.unsubscribe();
  } catch {
    // Gone already; the server drops a dead address on its own.
  }
}

export function snoozePush(now: number = Date.now()): void {
  write({ ...snapshot(), snoozedUntil: now + SNOOZE });
}

/**
 * On each visit: if the browser changed the subscription, or the player
 * took the permission back in its settings, the stored one follows.
 */
export async function syncPush(): Promise<void> {
  const state = snapshot();
  if (!state.sub || pushSupport() !== "ok") return;
  const win = env.window()!;
  if (win.Notification.permission !== "granted") {
    write({ ...state, sub: null, off: true });
    return;
  }
  try {
    const reg = await registration();
    const current = await reg.pushManager.getSubscription();
    const sub = current ? asSub(current.toJSON()) : null;
    if (!sub) write({ ...state, sub: null, off: true });
    else if (JSON.stringify(sub) !== JSON.stringify(state.sub)) write({ ...state, sub });
  } catch {
    // Try again next visit.
  }
}

export interface PushState {
  support: PushSupport;
  /** The server can send notices. */
  available: boolean;
  /** This device gets them. */
  on: boolean;
  permission: NotificationPermission | "unknown";
  /** "Not now" was said recently. */
  snoozed: boolean;
}

/** The notices' state for the screens; `available` waits on the server's key. */
export function usePush(): PushState {
  const state = useSyncExternalStore(subscribePush, snapshot, snapshot);
  const [available, setAvailable] = useState(false);
  const support = pushSupport();
  useEffect(() => {
    if (support === "none") return;
    let live = true;
    vapidKey().then((key) => live && setAvailable(key !== null));
    return () => {
      live = false;
    };
  }, [support]);
  const win = env.window();
  const permission = support === "ok" && win ? win.Notification.permission : "unknown";
  return {
    support,
    available,
    on: state.sub !== null && permission === "granted",
    permission,
    snoozed: (state.snoozedUntil ?? 0) > Date.now(),
  };
}

/** A tapped notice asks an open page to go to its room: only the hash changes. */
export function listenForOpen(): () => void {
  const container = env.navigator()?.serviceWorker;
  if (!container) return () => {};
  const onMessage = (event: MessageEvent): void => {
    const data = event.data as { t?: unknown; url?: unknown } | null;
    if (data?.t !== "open" || typeof data.url !== "string") return;
    const url = new URL(data.url, window.location.href);
    if (url.origin === window.location.origin && url.hash) window.location.hash = url.hash;
  };
  container.addEventListener("message", onMessage);
  container.startMessages?.();
  return () => container.removeEventListener("message", onMessage);
}
