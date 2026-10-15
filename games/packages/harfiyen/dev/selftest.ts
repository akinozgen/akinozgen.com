/**
 * Development only: web push's cryptography run inside workerd, where the
 * WebCrypto details can differ from Node's. A browser's keys are made
 * here, a notice encrypted for them and read back the way a browser would
 * (RFC 8291), and the VAPID signature checked. GET /__push-selftest.
 */
import { encryptPayload, fromBase64Url, newVapidKeys, pushRequest, toBase64Url, vapidKeys } from "../src/server/webpush.ts";

const encoder = new TextEncoder();
const bytes = (text: string): Uint8Array<ArrayBuffer> => new Uint8Array(encoder.encode(text));

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, n: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, n * 8));
}

export async function pushSelfTest(): Promise<Response> {
  const ua = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const uaRaw = new Uint8Array((await crypto.subtle.exportKey("raw", ua.publicKey)) as ArrayBuffer);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const sub = { endpoint: "https://push.example.com/x", keys: { p256dh: toBase64Url(uaRaw), auth: toBase64Url(auth) } };
  const message = "Sıra sende — KALEM, +24";
  const body = await encryptPayload(sub, bytes(message));

  const salt = body.slice(0, 16);
  const asRaw = body.slice(21, 21 + body[20]);
  const asKey = await crypto.subtle.importKey("raw", asRaw, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = { name: "ECDH", public: asKey, $public: asKey } as unknown as Parameters<typeof crypto.subtle.deriveBits>[0];
  const shared = new Uint8Array(await crypto.subtle.deriveBits(ecdh, ua.privateKey, 256));
  const ikm = await hkdf(auth, shared, new Uint8Array([...bytes("WebPush: info\0"), ...uaRaw, ...asRaw]), 32);
  const cek = await hkdf(salt, ikm, bytes("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, bytes("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, body.slice(21 + body[20])));
  const decrypted = new TextDecoder().decode(plain.slice(0, -1));

  const vapid = await newVapidKeys();
  const keys = await vapidKeys(vapid.private);
  const init = await pushRequest(sub, { title: "t", body: "b", url: "#", tag: "K7Q2XM" }, keys, "https://akinozgen.com", Date.now());
  const [, token] = /t=([^,]+),/.exec((init.headers as Record<string, string>).Authorization)!;
  const [head, claims, signature] = token.split(".");
  const verifier = await crypto.subtle.importKey("raw", fromBase64Url(vapid.public), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const signed = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, verifier, fromBase64Url(signature), bytes(`${head}.${claims}`));

  return Response.json({ decrypted: decrypted === message, signed });
}
