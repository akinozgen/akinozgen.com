import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { handleSizele } from "../../../../games/packages/sizele/src/server.ts";

/**
 * sizele's game server: which pairs of countries a day deals, how big each
 * really is, and how close every guess came. The browser only ever gets the
 * round in front of it, as two outlines.
 */
export const prerender = false;

interface Env {
  TRAVELLE_SEED?: string;
}

export const GET: APIRoute = async ({ params, url }) => {
  const { TRAVELLE_SEED } = env as unknown as Env;
  // One secret serves every game; the labels inside keep their streams apart.
  const seed = TRAVELLE_SEED && `sizele:${TRAVELLE_SEED}`;
  try {
    const reply = await handleSizele(params.action ?? "", url.searchParams, seed);
    return Response.json(reply.body, {
      status: reply.status,
      headers: { "Cache-Control": reply.cache, "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    console.error("sizele api", error);
    return Response.json({ error: "internal error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
};
