import { describe, expect, it } from "vitest";
import { originAllowed } from "../src/server/origin.ts";
import { clearedCookie, newSessionId, newUserId, sessionCookie, sessionHash, sessionIdOf } from "../src/server/session.ts";
import { FIREBASE_KEYS_URL, googleKeys, verifyIdToken } from "../src/server/token.ts";
import { userOf } from "../src/server/user.ts";

const PROJECT = "akinozgencom-c94bd";
const NOW = Date.UTC(2026, 9, 15, 12);
const seconds = NOW / 1000;

const base64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const encode = (value: unknown): string => base64Url(new TextEncoder().encode(JSON.stringify(value)));

async function keyPair() {
  return crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
}

async function sign(privateKey: CryptoKey, header: object, claims: object): Promise<string> {
  const head = `${encode(header)}.${encode(claims)}`;
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(head)));
  return `${head}.${base64Url(signature)}`;
}

const goodClaims = (changes: object = {}) => ({
  iss: `https://securetoken.google.com/${PROJECT}`,
  aud: PROJECT,
  sub: "firebase-uid-1",
  iat: seconds - 30,
  exp: seconds + 3000,
  auth_time: seconds - 40,
  email: "oyuncu@example.com",
  email_verified: true,
  firebase: { sign_in_provider: "google.com" },
  ...changes,
});

describe("Firebase ID tokens", () => {
  it("are read when every check passes", async () => {
    const { privateKey, publicKey } = await keyPair();
    const token = await sign(privateKey, { alg: "RS256", kid: "k1", typ: "JWT" }, goodClaims());
    const claims = await verifyIdToken(token, PROJECT, async (kid) => (kid === "k1" ? publicKey : null), NOW);
    expect(claims).toEqual({
      uid: "firebase-uid-1",
      email: "oyuncu@example.com",
      emailVerified: true,
      provider: "google.com",
      authTime: (seconds - 40) * 1000,
    });
  });

  it("are turned away for any one thing wrong", async () => {
    const { privateKey, publicKey } = await keyPair();
    const other = await keyPair();
    const keys = async (kid: string) => (kid === "k1" ? publicKey : null);
    const header = { alg: "RS256", kid: "k1" };
    const cases: [string, Promise<string>][] = [
      ["expired", sign(privateKey, header, goodClaims({ exp: seconds - 1 }))],
      ["issued in the future", sign(privateKey, header, goodClaims({ iat: seconds + 600 }))],
      ["signed in in the future", sign(privateKey, header, goodClaims({ auth_time: seconds + 600 }))],
      ["another project", sign(privateKey, header, goodClaims({ aud: "someone-else" }))],
      ["another issuer", sign(privateKey, header, goodClaims({ iss: "https://securetoken.google.com/someone-else" }))],
      ["no uid", sign(privateKey, header, goodClaims({ sub: "" }))],
      ["no provider", sign(privateKey, header, goodClaims({ firebase: {} }))],
      ["HS256", sign(privateKey, { alg: "HS256", kid: "k1" }, goodClaims())],
      ["alg none", Promise.resolve(`${encode({ alg: "none", kid: "k1" })}.${encode(goodClaims())}.`)],
      ["unknown key", sign(privateKey, { alg: "RS256", kid: "k2" }, goodClaims())],
      ["another key's signature", sign(other.privateKey, header, goodClaims())],
      ["garbage", Promise.resolve("not.a.token")],
      ["four parts", Promise.resolve("a.b.c.d")],
    ];
    for (const [what, token] of cases) {
      expect(await verifyIdToken(await token, PROJECT, keys, NOW), what).toBeNull();
    }
    // A tampered body fails the signature.
    const token = await sign(privateKey, header, goodClaims());
    const [h, , s] = token.split(".");
    const forged = `${h}.${encode(goodClaims({ sub: "someone-else" }))}.${s}`;
    expect(await verifyIdToken(forged, PROJECT, keys, NOW)).toBeNull();
  });

  it("are checked against Google's keys, fetched once and kept as Google says", async () => {
    const { privateKey, publicKey } = await keyPair();
    const jwk = { ...(await crypto.subtle.exportKey("jwk", publicKey)), kid: "k1", alg: "RS256", use: "sig" };
    let fetches = 0;
    let now = NOW;
    const fetcher = (async (url: string) => {
      expect(url).toBe(FIREBASE_KEYS_URL);
      fetches++;
      return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "Cache-Control": "public, max-age=600" } });
    }) as unknown as typeof fetch;
    const keys = googleKeys(fetcher, () => now);
    const token = await sign(privateKey, { alg: "RS256", kid: "k1" }, goodClaims());
    expect(await verifyIdToken(token, PROJECT, keys, NOW)).not.toBeNull();
    expect(await verifyIdToken(token, PROJECT, keys, NOW)).not.toBeNull();
    expect(fetches).toBe(1);
    // An unknown key looks again, but not more than once a minute.
    expect(await keys("k9")).toBeNull();
    expect(fetches).toBe(1);
    now += 61_000;
    expect(await keys("k9")).toBeNull();
    expect(fetches).toBe(2);
    // Past max-age, the keys are fetched again.
    now += 600_000;
    await keys("k1");
    expect(fetches).toBe(3);
  });
});

describe("sessions", () => {
  it("are random ids in a host-only, HttpOnly, strict cookie", () => {
    const id = newSessionId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newSessionId()).not.toBe(id);
    const cookie = sessionCookie(id);
    expect(cookie).toContain(`__Host-oturum=${id}`);
    for (const part of ["Path=/", "Secure", "HttpOnly", "SameSite=Strict"]) expect(cookie).toContain(part);
    expect(cookie).not.toContain("Domain");
    expect(clearedCookie()).toContain("Max-Age=0");
  });

  it("are read back from a Cookie header, and nothing else is", () => {
    const id = newSessionId();
    expect(sessionIdOf(`theme=dark; __Host-oturum=${id}; x=1`)).toBe(id);
    expect(sessionIdOf("__Host-oturum=short")).toBeNull();
    expect(sessionIdOf(`oturum=${id}`)).toBeNull();
    expect(sessionIdOf(null)).toBeNull();
  });

  it("are kept in the database only as a hash", async () => {
    const id = newSessionId();
    const hash = await sessionHash(id);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(id);
    expect(await sessionHash(id)).toBe(hash);
  });
});

describe("accounts", () => {
  it("are named as harfiyen names devices: two words from the id and its number", () => {
    const id = newUserId();
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    const row = { id, firebase_uid: "u", email: "a@b.c", provider: "google.com", name: null, created_at: 1, seen_at: 1 };
    const user = userOf(row);
    expect(user.name).toBe(`${user.base} #${user.tag}`);
    expect(user.tag).toMatch(/^\d{4}$/);
    expect(user.chosen).toBeNull();
    expect(userOf({ ...row, name: "Akın" })).toMatchObject({ base: "Akın", chosen: "Akın", name: `Akın #${user.tag}` });
  });
});

describe("the origin check", () => {
  const request = (headers: Record<string, string>) => new Request("https://akinozgen.com/api/hesap/ben", { headers });
  const url = new URL("https://akinozgen.com/api/hesap/ben");
  it("lets the site's own pages in and nobody else", () => {
    expect(originAllowed(request({ Origin: "https://akinozgen.com" }), url)).toBe(true);
    expect(originAllowed(request({ "Sec-Fetch-Site": "same-origin" }), url)).toBe(true);
    expect(originAllowed(request({ Origin: "https://evil.example" }), url)).toBe(false);
    expect(originAllowed(request({ "Sec-Fetch-Site": "cross-site" }), url)).toBe(false);
    expect(originAllowed(request({}), url)).toBe(false);
  });
});
