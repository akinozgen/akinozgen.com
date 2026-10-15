/**
 * The site's Worker. It runs only for /api/* and /__/* (static assets are
 * served without it): /api/hesap is the accounts every game shares,
 * /__/auth is Firebase's sign-in helper passed through to Firebase,
 * /api/harfiyen goes straight to harfiyen's router and its Durable Objects,
 * which take WebSockets that Astro shouldn't see; every other API is Astro's.
 *
 * Imports into games/ are relative paths: the build here installs only the
 * site's packages, not the games workspace.
 */
import { handle } from "@astrojs/cloudflare/handler";
import words from "../games/packages/harfiyen/data/kelimeler.txt?raw";
import { type HarfiyenEnv, provideWords, routeHarfiyen } from "../games/packages/harfiyen/src/server/worker/route.ts";
import { type AccountEnv, proxyFirebaseAuth, routeAccount } from "../games/packages/account/src/server/worker/route.ts";

export { HarfiyenLobby, HarfiyenRoom } from "../games/packages/harfiyen/src/server/worker/route.ts";

provideWords(words);

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/api/hesap/")) return routeAccount(request, env as unknown as AccountEnv);
    if (pathname.startsWith("/api/harfiyen/")) return routeHarfiyen(request, env as HarfiyenEnv);
    if (pathname.startsWith("/__/")) return proxyFirebaseAuth(request);
    return handle(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
