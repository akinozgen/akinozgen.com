import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { handleVexle } from "../../../../games/packages/vexle/src/server.ts";

/**
 * vexle's game server: which flag is today's, how each guess scores, and
 * which tiles have been earned. The tile packs live in the akinozgen-games
 * R2 bucket, bound to this Worker; only this code knows which one is today's.
 */
export const prerender = false;

/** Versioned, so a rebuilt set never mixes with an old one. */
const TILES = "vexle/tiles-v2/";

interface Bucket {
  get: (key: string) => Promise<{ arrayBuffer: () => Promise<ArrayBuffer> } | null>;
}

/** Packs read lately, kept in the isolate: the day's flag is asked for all day. */
const packs = new Map<string, Uint8Array>();

interface Env {
  TRAVELLE_SEED?: string;
  GAME_ASSETS: Bucket;
}

export const GET: APIRoute = async ({ params, url }) => {
  const { TRAVELLE_SEED, GAME_ASSETS } = env as unknown as Env;
  // One secret serves both games; the labels inside keep their streams apart.
  const seed = TRAVELLE_SEED && `vexle:${TRAVELLE_SEED}`;
  const loadPack = async (code: string): Promise<Uint8Array> => {
    const cached = packs.get(code);
    if (cached) return cached;
    const object = await GAME_ASSETS.get(`${TILES}${code.toLowerCase()}.bin`);
    if (!object) throw new Error(`no tile pack for ${code}`);
    const pack = new Uint8Array(await object.arrayBuffer());
    if (packs.size >= 24) packs.delete(packs.keys().next().value!);
    packs.set(code, pack);
    return pack;
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
