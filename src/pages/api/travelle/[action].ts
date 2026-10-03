import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { handleTravelle } from "../../../../games/packages/geo/src/server/api.ts";

/**
 * travelle's game server: today's puzzle and the verdict on every guess.
 * The borders and the daily seed stay here; the browser only sees answers
 * to the questions it is allowed to ask.
 */
export const prerender = false;

export const GET: APIRoute = async ({ params, url }) => {
  const seed = (env as { TRAVELLE_SEED?: string }).TRAVELLE_SEED;
  try {
    const reply = await handleTravelle(params.action ?? "", url.searchParams, seed);
    return Response.json(reply.body, {
      status: reply.status,
      headers: { "Cache-Control": reply.cache, "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    console.error("travelle api", error);
    return Response.json({ error: "internal error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
};
