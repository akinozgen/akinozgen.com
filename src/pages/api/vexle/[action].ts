import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { handleVexle } from "../../../../games/packages/vexle/src/server.ts";

/**
 * vexle's game server: which flag is today's, how each guess scores, and
 * which tiles have been earned. The tile packs are ordinary static files;
 * only this code knows which one is today's.
 */
export const prerender = false;

interface Env {
  TRAVELLE_SEED?: string;
  ASSETS: { fetch: (request: Request | string) => Promise<Response> };
}

export const GET: APIRoute = async ({ params, url }) => {
  const { TRAVELLE_SEED, ASSETS } = env as unknown as Env;
  // One secret serves both games; the labels inside keep their streams apart.
  const seed = TRAVELLE_SEED && `vexle:${TRAVELLE_SEED}`;
  const loadPack = async (code: string): Promise<Uint8Array> => {
    const response = await ASSETS.fetch(new URL(`/games/vexle-tiles/${code.toLowerCase()}.bin`, url).toString());
    if (!response.ok) throw new Error(`no tile pack for ${code}`);
    return new Uint8Array(await response.arrayBuffer());
  };
  try {
    const reply = await handleVexle(params.action ?? "", url.searchParams, seed, loadPack);
    return Response.json(reply.body, {
      status: reply.status,
      headers: { "Cache-Control": reply.cache, "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    console.error("vexle api", error);
    return Response.json({ error: "internal error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
};
