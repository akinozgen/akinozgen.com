import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { handleBabelle } from "../../../../games/packages/babelle/src/server.ts";

/**
 * babelle's game server: the day's hidden language, one question at a time,
 * and the verdict on each answer and guess. The word lists stay here.
 */
export const prerender = false;

export const GET: APIRoute = async ({ params, url }) => {
  const { TRAVELLE_SEED } = env as unknown as { TRAVELLE_SEED?: string };
  // One secret serves every game; the prefix keeps their draws unrelated.
  const seed = TRAVELLE_SEED && `babelle:${TRAVELLE_SEED}`;
  try {
    const reply = await handleBabelle(params.action ?? "", url.searchParams, seed);
    return Response.json(reply.body, {
      status: reply.status,
      headers: { "Cache-Control": reply.cache, "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    console.error("babelle api", error);
    return Response.json({ error: "internal error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
};
