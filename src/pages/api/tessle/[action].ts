import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { handleTessle } from "../../../../games/packages/tessle/src/server.ts";

/**
 * tessle's game server: which countries today's pieces are, which way each
 * was turned, where it belongs, and whether the ones on a player's board fit.
 * The browser only ever gets loose, turned pieces.
 */
export const prerender = false;

interface Env {
  TRAVELLE_SEED?: string;
}

export const GET: APIRoute = async ({ params, url }) => {
  const { TRAVELLE_SEED } = env as unknown as Env;
  // One secret serves every game; the labels inside keep their streams apart.
  const seed = TRAVELLE_SEED && `tessle:${TRAVELLE_SEED}`;
  try {
    const reply = await handleTessle(params.action ?? "", url.searchParams, seed);
    return Response.json(reply.body, {
      status: reply.status,
      headers: { "Cache-Control": reply.cache, "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    console.error("tessle api", error);
    return Response.json({ error: "internal error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
};
