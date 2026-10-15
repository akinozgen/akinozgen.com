/**
 * The account API end to end, against a running Worker (the dev one by
 * default), with a real Firebase token: a throwaway email-and-password user
 * is made through Firebase's REST API, signed in here, renamed, signed out,
 * deleted — and then deleted from Firebase too.
 *
 *   pnpm --filter @harfiyen/engine dev:mp      # the dev Worker, which serves /api/hesap
 *   node scripts/e2e-account.ts [http://localhost:8787 | https://akinozgen.com]
 *
 * The dev Worker lets an unverified address in (ACCOUNT_ALLOW_UNVERIFIED); the
 * site must not, and against the site that refusal is what's checked.
 */
import { FIREBASE_CONFIG } from "../src/config.ts";

const base = process.argv[2] ?? "http://localhost:8787";
const live = new URL(base).hostname !== "localhost";
const origin = live ? new URL(base).origin : "http://localhost:5187";
const identity = "https://identitytoolkit.googleapis.com/v1/accounts";

const check = (ok: unknown, what: string): void => {
  if (!ok) throw new Error(`FAILED: ${what}`);
  console.log(`  ok  ${what}`);
};

async function firebase(action: string, body: object): Promise<Record<string, unknown>> {
  const response = await fetch(`${identity}:${action}?key=${FIREBASE_CONFIG.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Referer: `${origin}/` },
    body: JSON.stringify(body),
  });
  const json = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error(`firebase ${action}: ${JSON.stringify(json.error)}`);
  return json;
}

/** A call as a page makes it, with this browser's cookie. */
async function call(path: string, cookie: string | null, extra: Record<string, string> = {}) {
  const response = await fetch(`${base}/api/hesap/${path}`, {
    headers: { Origin: origin, "X-Hesap": "1", ...(cookie ? { Cookie: cookie } : {}), ...extra },
  });
  const set = response.headers.get("Set-Cookie");
  return { status: response.status, body: (await response.json()) as Record<string, any>, set };
}

const cookieOf = (set: string | null): string | null => (set ? set.split(";")[0]! : null);

const email = `e2e-${crypto.randomUUID().slice(0, 8)}@example.com`;
const made = await firebase("signUp", { email, password: crypto.randomUUID(), returnSecureToken: true });
const token = made.idToken as string;
console.log(`made a throwaway Firebase user (${email})`);

try {
  check((await call("giris", null, { Authorization: "Bearer not.a.token" })).status === 401, "a junk token is turned away");
  check((await fetch(`${base}/api/hesap/ben`, { headers: { Origin: origin } })).status === 403, "no X-Hesap header → 403");

  const first = await call("giris", null, { Authorization: `Bearer ${token}` });
  if (live) {
    check(first.status === 403 && first.body.error === "dogrulanmadi", "the site keeps an unverified address out");
  } else {
    check(first.status === 200 && first.body.user?.email === email, `signed in: ${first.body.user?.name}`);
    const cookie = cookieOf(first.set);
    check(first.set?.includes("HttpOnly") && first.set.includes("SameSite=Strict") && cookie?.startsWith("__Host-oturum="), "an HttpOnly, strict session cookie");

    const me = await call("ben", cookie);
    check(me.body.user?.name === first.body.user.name, "the session finds the account");
    check((await call("ben", "__Host-oturum=" + "A".repeat(43))).body.user === null, "a made-up session finds nobody");

    const renamed = await call("ad", cookie, { "X-Hesap-Ad": encodeURIComponent("Deneme Oyuncu") });
    check(renamed.body.user?.name === `Deneme Oyuncu #${first.body.user.tag}`, `renamed: ${renamed.body.user?.name}`);
    check((await call("ad", cookie, { "X-Hesap-Ad": encodeURIComponent("Orospu") })).body.error === "ad", "a rude name is turned away");
    check((await call("ad", cookie, { "X-Hesap-Ad": "" })).body.user?.chosen === null, "an empty name puts the default back");

    // A device's stats are imported once per game, and come back with the (empty) record.
    const stats = { played: 12, won: 9, streak: 3 };
    const imported = await call("aktar?oyun=vexle", cookie, { "X-Hesap-Veri": encodeURIComponent(JSON.stringify(stats)) });
    check(imported.body.imported === true, "the device's vexle stats imported");
    check((await call("aktar?oyun=vexle", cookie, { "X-Hesap-Veri": encodeURIComponent("{}") })).body.imported === false, "a second import is ignored");
    const records = await call("kayitlar?oyun=vexle", cookie);
    check(records.body.imported?.stats?.won === 9 && Array.isArray(records.body.plays) && records.body.plays.length === 0, "records: the import, no plays yet");
    check((await call("kayitlar?oyun=nope", cookie)).status === 404, "an unknown game → 404");

    // A second sign-in (another device) is its own session; signing out ends only this one.
    const second = await call("giris", null, { Authorization: `Bearer ${token}` });
    const other = cookieOf(second.set);
    check(second.body.user?.tag === first.body.user.tag, "the same Firebase user is the same account");
    await call("cikis", cookie);
    check((await call("ben", cookie)).body.user === null, "signed out here");
    check((await call("ben", other)).body.user?.tag === first.body.user.tag, "still signed in on the other device");

    const gone = await call("sil", other);
    check(gone.body.ok === true, "account deleted");
    check((await call("ben", other)).body.user === null, "its sessions are gone with it");
  }
} finally {
  await firebase("delete", { idToken: token });
  console.log("deleted the throwaway Firebase user");
}
console.log("all good");
