import { defaultName, displayName, NAME_WORDS, nameTag, newSecret, publicId } from "@harfiyen/engine";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

/**
 * Who this device is online: a random secret kept in this browser and never
 * shown, its public id, and the name that comes with it — two words the
 * player may change, and a number that stays: "Neşeli Kirpi #4821". No
 * account, no sign-in; clearing the site's data starts a new player.
 */
export interface Identity {
  secret: string;
  pub: string;
  /** The device's fixed number: "4821". */
  tag: string;
  /** The words in use: the player's own, or the device's default. */
  base: string;
  /** The device's default words, for putting back. */
  fallback: string;
  /** The player's own words; null while the default stands. */
  chosen: string | null;
  /** As others see it: "Neşeli Kirpi #4821". */
  name: string;
}

const DEVICE_KEY = "harfiyen:device:v1";
const NAME_KEY = "harfiyen:name:v1";
const SECRET = /^[0-9a-f]{32}$/;

/** Held here too, so a browser that won't store anything still has one name for the visit. */
let kept: string | null = null;

/** This device's secret, made the first time it's asked for. */
export function deviceSecret(): string {
  if (kept) return kept;
  try {
    const stored = localStorage.getItem(DEVICE_KEY);
    if (stored && SECRET.test(stored)) return (kept = stored);
  } catch {
    // Storage blocked: a secret for this visit only.
  }
  kept = newSecret();
  try {
    localStorage.setItem(DEVICE_KEY, kept);
  } catch {
    // as above
  }
  return kept;
}

/** Forgets what's cached, for tests that clear storage between runs. */
export function resetIdentityCache(): void {
  kept = null;
  pending = null;
  chosen = undefined;
}

let pending: { secret: string; pub: Promise<string> } | null = null;

/** The device's public id: a hash, so it arrives a moment later. */
export function loadPub(): Promise<string> {
  const secret = deviceSecret();
  if (pending?.secret !== secret) pending = { secret, pub: pubOf(secret) };
  return pending.pub;
}

// The name the player chose, if any, shared by every part of the page that greets the server.
let chosen: string | null | undefined;
const nameListeners = new Set<() => void>();

/** The player's own words, or null for the device's default. */
export function chosenName(): string | null {
  if (chosen === undefined) {
    try {
      const stored = localStorage.getItem(NAME_KEY);
      chosen = stored ? (JSON.parse(stored) as string) : null;
    } catch {
      chosen = null;
    }
    if (typeof chosen !== "string" || !chosen) chosen = null;
  }
  return chosen;
}

/** Keeps a new name (already cleaned), or null to go back to the default. */
export function setChosenName(name: string | null): void {
  if (name === chosenName()) return;
  chosen = name;
  try {
    if (name === null) localStorage.removeItem(NAME_KEY);
    else localStorage.setItem(NAME_KEY, JSON.stringify(name));
  } catch {
    // Kept for this visit only.
  }
  for (const listener of nameListeners) listener();
}

export function subscribeName(listener: () => void): () => void {
  nameListeners.add(listener);
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== NAME_KEY && event.key !== null) return;
    chosen = undefined;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    nameListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The `name` field for a greeting: present only when the player chose one. */
export const nameField = (): { name?: string } => {
  const name = chosenName();
  return name ? { name } : {};
};

export function useIdentity(): Identity | null {
  const [pub, setPub] = useState<string | null>(null);
  const own = useSyncExternalStore(subscribeName, chosenName, chosenName);
  useEffect(() => {
    let live = true;
    loadPub().then((found) => live && setPub(found));
    return () => {
      live = false;
    };
  }, []);
  return useMemo(() => {
    if (!pub) return null;
    const fallback = defaultName(pub);
    const base = own ?? fallback;
    return { secret: deviceSecret(), pub, tag: nameTag(pub), base, fallback, chosen: own, name: displayName(base, pub) };
  }, [pub, own]);
}

/** A name in its parts: "Neşeli Kirpi #4821" → "Neşeli Kirpi" and "4821". */
export function splitName(name: string): { base: string; number: string } {
  const at = name.lastIndexOf(" #");
  return at === -1 ? { base: name, number: "" } : { base: name.slice(0, at), number: name.slice(at + 2) };
}

const BY_LENGTH = [...NAME_WORDS.adjectives].sort((a, b) => b.length - a.length);

/** A name's badge letters: the adjective's and the animal's for a default name, else the first two words' (or one). */
export function initials(name: string): string {
  const { base } = splitName(name);
  const adjective = BY_LENGTH.find((word) => base.startsWith(`${word} `));
  const rest = adjective ? base.slice(adjective.length + 1) : base.split(/\s+/).slice(1).join(" ");
  return `${[...base][0] ?? "?"}${[...rest][0] ?? ""}`.toLocaleUpperCase("tr");
}

/** A colour for a name, the same on every screen: from the device's number, so it survives a new name. */
export function hueOf(name: string): number {
  const { number } = splitName(name);
  const key = number || name;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (h >>> 0) % 360;
}

/**
 * The public id. Browsers hash only on secure pages (https, localhost); a
 * phone trying the dev server over the local network gets the same hash
 * from the small fallback below.
 */
async function pubOf(secret: string): Promise<string> {
  if (globalThis.crypto?.subtle) return publicId(secret);
  return sha256Hex(new TextEncoder().encode(`harfiyen:${secret}`));
}

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** SHA-256 as hex, in plain JavaScript. */
export function sha256Hex(data: Uint8Array): string {
  const length = data.length;
  const blocks = Math.ceil((length + 9) / 64);
  const bytes = new Uint8Array(blocks * 64);
  bytes.set(data);
  bytes[length] = 0x80;
  const view = new DataView(bytes.buffer);
  view.setUint32(bytes.length - 8, Math.floor(length / 0x20000000));
  view.setUint32(bytes.length - 4, (length << 3) >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));
  for (let block = 0; block < blocks; block++) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(block * 64 + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] += a;
    h[1] += b;
    h[2] += c;
    h[3] += d;
    h[4] += e;
    h[5] += f;
    h[6] += g;
    h[7] += hh;
  }
  return Array.from(h, (x) => x.toString(16).padStart(8, "0")).join("");
}
