/**
 * The site's Worker. It runs only for /api/* (static assets are served
 * without it): /api/harfiyen goes straight to harfiyen's router and its
 * Durable Objects, which take WebSockets that Astro shouldn't see; every
 * other API is Astro's.
 *
 * Imports into games/ are relative paths: the build here installs only the
 * site's packages, not the games workspace.
 */
import { handle } from "@astrojs/cloudflare/handler";
import words from "../games/packages/harfiyen/data/kelimeler.txt?raw";
import { type HarfiyenEnv, provideWords, routeHarfiyen } from "../games/packages/harfiyen/src/server/worker/route.ts";

export { HarfiyenLobby, HarfiyenRoom } from "../games/packages/harfiyen/src/server/worker/route.ts";

provideWords(words);

export default {
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname.startsWith("/api/harfiyen/")) return routeHarfiyen(request, env as HarfiyenEnv);
    return handle(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
