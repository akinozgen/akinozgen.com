import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { handleTravelle } from "../../../../games/packages/geo/src/server/api.ts";
import { travelleRules } from "../../../../games/packages/geo/src/server/record.ts";
import { recordedReply, send } from "../../../lib/plays.ts";

/**
 * travelle's game server: today's puzzle and the verdict on every guess.
 * The borders and the daily seed stay here; the browser only sees answers
 * to the questions it is allowed to ask. A signed-in player's rounds are
 * kept as they are judged (src/lib/plays.ts).
 */
export const prerender = false;

interface Env {
  TRAVELLE_SEED?: string;
  DB?: D1Database;
}

export const GET: APIRoute = async ({ params, url, request }) => {
  const { TRAVELLE_SEED: seed, DB } = env as unknown as Env;
  const action = params.action ?? "";
  try {
    const reply = await recordedReply(
      "travelle",
      request,
      { DB },
      travelleRules(action, url.searchParams),
      url.searchParams,
      (query) => handleTravelle(action, query, seed),
    );
    return send(reply);
  } catch (error) {
    console.error("travelle api", error);
    return Response.json({ error: "internal error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
};
