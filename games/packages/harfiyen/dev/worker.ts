/**
 * A Worker for developing online play without the whole site: the same
 * router and Durable Objects the site's Worker exports, on port 8787.
 *
 *   pnpm --filter @harfiyen/engine dev:mp
 *
 * The game's Vite server proxies /api/harfiyen here.
 */
import words from "../data/kelimeler.txt";
import { type HarfiyenEnv, provideWords, routeHarfiyen } from "../src/server/worker/route.ts";
import { pushSelfTest } from "./selftest.ts";

export { HarfiyenLobby, HarfiyenRoom } from "../src/server/worker/route.ts";

provideWords(words);

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/api/harfiyen/")) return routeHarfiyen(request, env);
    if (pathname === "/__push-selftest") return pushSelfTest();
    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<HarfiyenEnv>;
