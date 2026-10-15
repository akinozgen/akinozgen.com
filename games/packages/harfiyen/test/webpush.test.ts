import { describe, expect, it } from "vitest";
import {
  encryptPayload,
  fromBase64Url,
  newVapidKeys,
  type PushSub,
  pushRequest,
  toBase64Url,
  validSub,
  vapidKeys,
} from "../src/server/webpush.ts";

const encoder = new TextEncoder();

type Bytes = Uint8Array<ArrayBuffer>;

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, bytes: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

/** A browser: its key pair and auth secret, and the subscription it would hand out. */
async function browser(): Promise<{ sub: PushSub; privateKey: CryptoKey; publicRaw: Bytes; auth: Bytes }> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const publicRaw = new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return {
    sub: { endpoint: "https://push.example.com/send/abc", keys: { p256dh: toBase64Url(publicRaw), auth: toBase64Url(auth) } },
    privateKey: pair.privateKey,
    publicRaw,
    auth,
  };
}

/** What the browser does with a push body (RFC 8291), written out independently. */
async function decrypt(body: Bytes, ua: Awaited<ReturnType<typeof browser>>): Promise<string> {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset).getUint32(16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const sealed = body.slice(21 + idlen);
  expect(rs).toBe(4096);
  expect(idlen).toBe(65);
  const asKey = await crypto.subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: asKey }, ua.privateKey, 256));
  const info = new Uint8Array([...encoder.encode("WebPush: info\0"), ...ua.publicRaw, ...asPublic]);
  const ikm = await hkdf(ua.auth, shared, info, 32);
  const cek = await hkdf(salt, ikm, new Uint8Array(encoder.encode("Content-Encoding: aes128gcm\0")), 16);
  const nonce = await hkdf(salt, ikm, new Uint8Array(encoder.encode("Content-Encoding: nonce\0")), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, sealed));
  expect(plain[plain.length - 1]).toBe(2);
  return new TextDecoder().decode(plain.slice(0, -1));
}

describe("web push", () => {
  it("encrypts so that only the browser can read it", async () => {
    const ua = await browser();
    const message = JSON.stringify({ title: "Sıra sende", body: "Neşeli Kirpi KALEM yazdı, +24" });
    const body = await encryptPayload(ua.sub, new Uint8Array(encoder.encode(message)));
    expect(await decrypt(body, ua)).toBe(message);
    // Another browser can't.
    const other = await browser();
    await expect(decrypt(body, { ...other, publicRaw: ua.publicRaw, auth: ua.auth })).rejects.toThrow();
  });

  it("signs a VAPID token the push service can check", async () => {
    const vapid = await newVapidKeys();
    const keys = await vapidKeys(vapid.private);
    expect(keys.publicKey).toBe(vapid.public);
    expect(fromBase64Url(vapid.public)).toHaveLength(65);
    const ua = await browser();
    const now = Date.UTC(2026, 9, 15);
    const init = await pushRequest(ua.sub, { title: "t", body: "b", url: "#/oda/K7Q2XM", tag: "K7Q2XM" }, keys, "https://akinozgen.com", now);
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Encoding"]).toBe("aes128gcm");
    expect(headers.TTL).toBe("86400");
    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(headers.Authorization);
    expect(match).not.toBeNull();
    const [, head, claims, signature, k] = match!;
    expect(k).toBe(vapid.public);
    expect(JSON.parse(new TextDecoder().decode(fromBase64Url(claims)))).toEqual({
      aud: "https://push.example.com",
      exp: now / 1000 + 12 * 3600,
      sub: "https://akinozgen.com",
    });
    const verifyKey = await crypto.subtle.importKey("raw", fromBase64Url(vapid.public), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      verifyKey,
      fromBase64Url(signature),
      new Uint8Array(encoder.encode(`${head}.${claims}`)),
    );
    expect(ok).toBe(true);
    expect(await decrypt(init.body as Bytes, ua)).toContain('"tag":"K7Q2XM"');
    expect(headers.Topic).toBe("K7Q2XM");
    // The notice keeps its tag; the topic keeps to the characters push services take.
    const chat = await pushRequest(ua.sub, { title: "t", body: "b", url: "#/oda/K7Q2XM", tag: "K7Q2XM:sohbet" }, keys, "https://akinozgen.com", now);
    expect((chat.headers as Record<string, string>).Topic).toBe("K7Q2XM-sohbet");
    expect(await decrypt(chat.body as Bytes, ua)).toContain('"tag":"K7Q2XM:sohbet"');
  });

  it("only takes subscriptions that look like a browser's", async () => {
    const { sub } = await browser();
    expect(validSub(sub)).toBe(true);
    expect(validSub({ ...sub, endpoint: "http://push.example.com" })).toBe(false);
    expect(validSub({ ...sub, keys: { ...sub.keys, auth: "short" } })).toBe(false);
    expect(validSub({ endpoint: sub.endpoint })).toBe(false);
    expect(validSub(null)).toBe(false);
  });
});
