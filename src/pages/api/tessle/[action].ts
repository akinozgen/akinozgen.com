import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { tessleRules } from "../../../../games/packages/tessle/src/record.ts";
import { handleTessle } from "../../../../games/packages/tessle/src/server.ts";
import { recordedReply, send } from "../../../lib/plays.ts";

/**
 * tessle's game server: which countries today's pieces are, which way each
 * was turned, where it belongs, and whether the ones on a player's board fit.
 * The browser only ever gets loose, turned pieces.
 * A signed-in player's rounds are kept as they are judged (src/lib/plays.ts).
 */
export const prerender = false;

interface Env {
  TRAVELLE_SEED?: string;
  DB?: D1Database;
}

export const GET: APIRoute = async ({ params, url, request }) => {
  const { TRAVELLE_SEED, DB } = env as unknown as Env;
  // One secret serves every game; the labels inside keep their streams apart.
  const seed = TRAVELLE_SEED && `tessle:${TRAVELLE_SEED}`;
  try {
    const action = params.action ?? "";
    const reply = await recordedReply("tessle", request, { DB }, tessleRules(action, url.searchParams), url.searchParams, (query) =>
      handleTessle(action, query, seed),
    );
    return send(reply);
  } catch (error) {
    console.error("tessle api", error);
    return Response.json({ error: "internal error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
};
