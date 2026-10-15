/**
 * Web Push from a Worker with nothing but WebCrypto: the message encrypted
 * for one browser (RFC 8291, aes128gcm) and the request signed with the
 * server's VAPID key (RFC 8292), so the push service accepts it and only
 * that browser can read it.
 */

/** What a browser's `PushSubscription.toJSON()` gives, which is all a push needs. */
export interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** What the service worker shows. */
export interface Notice {
  title: string;
  body: string;
  /** Opened when the notice is clicked, relative to the game's page. */
  url: string;
  /** Notices with the same tag replace each other: one per room. */
  tag: string;
}

const encoder = new TextEncoder();

/** Bytes on a plain ArrayBuffer, which is what WebCrypto takes. */
type Bytes = Uint8Array<ArrayBuffer>;
const text = (value: string): Bytes => new Uint8Array(encoder.encode(value));

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Bytes {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const concat = (...parts: Uint8Array[]): Bytes => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, bytes: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

/** Whether a subscription looks like one a browser made: an https endpoint and keys of the right sizes. */
export function validSub(value: unknown): value is PushSub {
  const sub = value as PushSub;
  if (!sub || typeof sub !== "object" || typeof sub.endpoint !== "string" || sub.endpoint.length > 1024) return false;
  if (!sub.endpoint.startsWith("https://") || !sub.keys || typeof sub.keys !== "object") return false;
  try {
    return fromBase64Url(sub.keys.p256dh).length === 65 && fromBase64Url(sub.keys.auth).length === 16;
  } catch {
    return false;
  }
}

/**
 * The body of a push: `payload` encrypted for the browser behind `sub`
 * (one aes128gcm record, RFC 8291 §3–4).
 */
export async function encryptPayload(sub: PushSub, payload: Bytes): Promise<Bytes> {
  const uaPublic = fromBase64Url(sub.keys.p256dh);
  const authSecret = fromBase64Url(sub.keys.auth);
  const local = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const asPublic = new Uint8Array((await crypto.subtle.exportKey("raw", local.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  // The standard calls the peer's key `public`; the Workers runtime's types call it `$public`. Both are given.
  const ecdh = { name: "ECDH", public: uaKey, $public: uaKey } as unknown as Parameters<typeof crypto.subtle.deriveBits>[0];
  const shared = new Uint8Array(await crypto.subtle.deriveBits(ecdh, local.privateKey, 256));

  const keyInfo = concat(text("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, text("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, text("Content-Encoding: nonce\0"), 12);

  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // One record, so the padding delimiter is 2 and no padding follows.
  const plain = concat(payload, new Uint8Array([2]));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plain));

  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, sealed);
}

/** The server's VAPID key pair, from the private key as a JWK (the Worker secret). */
export async function vapidKeys(jwk: JsonWebKey): Promise<{ privateKey: CryptoKey; publicKey: string }> {
  const privateKey = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const raw = concat(new Uint8Array([4]), fromBase64Url(jwk.x!), fromBase64Url(jwk.y!));
  return { privateKey, publicKey: toBase64Url(raw) };
}

/** A fresh VAPID key pair, as JWKs; the public one also raw, for browsers. */
export async function newVapidKeys(): Promise<{ private: JsonWebKey; public: string }> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey;
  return { private: jwk, public: (await vapidKeys(jwk)).publicKey };
}

/** The Authorization header for a push to `endpoint`, signed for twelve hours. */
export async function vapidAuthorization(endpoint: string, keys: { privateKey: CryptoKey; publicKey: string }, subject: string, now: number): Promise<string> {
  const header = toBase64Url(text(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = toBase64Url(
    text(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })),
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, text(`${header}.${claims}`)),
  );
  return `vapid t=${header}.${claims}.${toBase64Url(signature)}, k=${keys.publicKey}`;
}

/** Everything a push is, ready for `fetch(endpoint, …)`. */
export async function pushRequest(
  sub: PushSub,
  notice: Notice,
  keys: { privateKey: CryptoKey; publicKey: string },
  subject: string,
  now: number,
): Promise<RequestInit> {
  const body = await encryptPayload(sub, text(JSON.stringify(notice)));
  return {
    method: "POST",
    headers: {
      Authorization: await vapidAuthorization(sub.endpoint, keys, subject, now),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      // Turn-based: a notice is still worth having a day later.
      TTL: "86400",
      Urgency: "normal",
      Topic: notice.tag.slice(0, 32),
    },
    body,
  };
}
