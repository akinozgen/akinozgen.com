import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { handleVexle } from "@vexle/data/server";
import { vi } from "vitest";

/** The tests talk to the real API code, in process, with a seed of their own. */
export const TEST_SEED = "test-seed-not-the-real-one";
// jsdom gives modules http URLs, so the packs are found from the working directory.
const PACKS = join(process.cwd(), "../../../public/games/vexle-tiles");
export const loadPack = async (code: string): Promise<Uint8Array> =>
  new Uint8Array(await readFile(join(PACKS, `${code.toLowerCase()}.bin`)));

vi.stubGlobal("fetch", async (input: string | URL) => {
  const url = new URL(String(input), "http://localhost");
  const action = url.pathname.replace(/^\/api\/vexle\//, "");
  const reply = await handleVexle(action, url.searchParams, TEST_SEED, loadPack);
  return new Response(JSON.stringify(reply.body), {
    status: reply.status,
    headers: { "Content-Type": "application/json" },
  });
});
