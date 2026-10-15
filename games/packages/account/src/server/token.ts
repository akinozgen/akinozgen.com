/**
 * Firebase ID tokens, checked the way Firebase documents for a server
 * without its Admin SDK (firebase.google.com/docs/auth/admin/verify-id-tokens):
 * an RS256 JWT signed by one of Google's current keys, for this project,
 * issued in the past and not yet expired, about a non-empty uid. WebCrypto
 * only, so it runs in a Worker.
 */

/** Google's public keys for Firebase ID tokens, as JWKs (the same keys the docs list as X.509 certificates). */
export const FIREBASE_KEYS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

/** How far the issuer's clock may run ahead of ours. */
const SKEW = 60;

export interface IdClaims {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  /** How the player signed in to Firebase: "google.com", "password", … */
  provider: string;
  /** When the player signed in, in ms: a token proves a sign-in, this says how recent. */
  authTime: number;
}

/** Finds the public key a token names; null for a key Google doesn't (or no longer) publish. */
export type KeyFinder = (kid: string) => Promise<CryptoKey | null>;

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function part(text: string | undefined): Record<string, unknown> | null {
  if (!text || !/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const value = JSON.parse(new TextDecoder().decode(fromBase64Url(text))) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const isTime = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** The token's claims if it checks out in every respect; null otherwise. `now` in ms. */
export async function verifyIdToken(token: string, projectId: string, keyFor: KeyFinder, now: number): Promise<IdClaims | null> {
  if (token.length > 4096) return null;
  const [head, body, signature, extra] = token.split(".");
  if (extra !== undefined || !signature || !/^[A-Za-z0-9_-]+$/.test(signature)) return null;
  const header = part(head);
  const claims = part(body);
  if (!header || !claims) return null;
  if (header.alg !== "RS256" || typeof header.kid !== "string") return null;

  const seconds = now / 1000;
  const firebase = claims.firebase as { sign_in_provider?: unknown } | undefined;
  if (
    !isTime(claims.exp) ||
    claims.exp <= seconds ||
    !isTime(claims.iat) ||
    claims.iat > seconds + SKEW ||
    !isTime(claims.auth_time) ||
    claims.auth_time > seconds + SKEW ||
    claims.aud !== projectId ||
    claims.iss !== `https://securetoken.google.com/${projectId}` ||
    typeof claims.sub !== "string" ||
    claims.sub.length === 0 ||
    claims.sub.length > 128 ||
    typeof firebase?.sign_in_provider !== "string"
  ) {
    return null;
  }

  const key = await keyFor(header.kid);
  if (!key) return null;
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    fromBase64Url(signature),
    new TextEncoder().encode(`${head}.${body}`),
  );
  if (!ok) return null;
  return {
    uid: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    emailVerified: claims.email_verified === true,
    provider: firebase.sign_in_provider,
    authTime: claims.auth_time * 1000,
  };
}

interface KeySet {
  keys: Map<string, CryptoKey>;
  /** When Google says to look again (its Cache-Control max-age). */
  until: number;
  fetchedAt: number;
}

/**
 * Google's keys, fetched when first needed and kept for as long as Google's
 * Cache-Control allows. A token naming a key not in hand fetches them again,
 * at most once a minute, so keys Google has just rotated in are found.
 */
export function googleKeys(fetcher: typeof fetch = fetch, clock: () => number = Date.now): KeyFinder {
  let set: KeySet | null = null;
  let loading: Promise<KeySet> | null = null;

  async function load(): Promise<KeySet> {
    const response = await fetcher(FIREBASE_KEYS_URL);
    if (!response.ok) throw new Error(`keys: ${response.status}`);
    const { keys } = (await response.json()) as { keys: (JsonWebKey & { kid?: string })[] };
    const map = new Map<string, CryptoKey>();
    for (const jwk of keys) {
      if (!jwk.kid || jwk.kty !== "RSA") continue;
      const { kid, ...material } = jwk;
      map.set(kid, await crypto.subtle.importKey("jwk", material, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]));
    }
    const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get("Cache-Control") ?? "")?.[1] ?? 3600);
    const now = clock();
    return { keys: map, until: now + maxAge * 1000, fetchedAt: now };
  }

  async function fresh(): Promise<KeySet> {
    loading ??= load().finally(() => {
      loading = null;
    });
    set = await loading;
    return set;
  }

  return async (kid) => {
    const now = clock();
    try {
      if (!set || now >= set.until) await fresh();
      else if (!set.keys.has(kid) && now - set.fetchedAt > 60_000) await fresh();
    } catch {
      // Google unreachable: whatever keys are in hand still serve.
    }
    return set?.keys.get(kid) ?? null;
  };
}
