import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { sizeleRules } from "../../../../games/packages/sizele/src/record.ts";
import { handleSizele } from "../../../../games/packages/sizele/src/server.ts";
import { recordedReply, send } from "../../../lib/plays.ts";

/**
 * sizele's game server: which pairs of countries a day deals, how big each
 * really is, and how close every guess came. The browser only ever gets the
 * round in front of it, as two outlines.
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
  const seed = TRAVELLE_SEED && `sizele:${TRAVELLE_SEED}`;
  try {
    const action = params.action ?? "";
    const reply = await recordedReply("sizele", request, { DB }, sizeleRules(action, url.searchParams), url.searchParams, (query) =>
      handleSizele(action, query, seed),
    );
    return send(reply);
  } catch (error) {
    console.error("sizele api", error);
    return Response.json({ error: "internal error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
};
