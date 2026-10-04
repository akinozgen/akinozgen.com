import { handleBabelle } from "@babelle/data/server";
import { vi } from "vitest";

/** The tests talk to the real API code, in process, with a seed of their own. */
export const TEST_SEED = "test-seed-not-the-real-one";

vi.stubGlobal("fetch", async (input: string | URL) => {
  const url = new URL(String(input), "http://localhost");
  const action = url.pathname.replace(/^\/api\/babelle\//, "");
  const reply = await handleBabelle(action, url.searchParams, TEST_SEED);
  return new Response(JSON.stringify(reply.body), {
    status: reply.status,
    headers: { "Content-Type": "application/json" },
  });
});
