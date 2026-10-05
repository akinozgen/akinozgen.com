import { handleTessle } from "@tessle/data/server";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

/** The tests talk to the real API code, in process, with a seed of their own. */
export const TEST_SEED = "test-seed-not-the-real-one";

vi.stubGlobal("fetch", async (input: string | URL) => {
  const url = new URL(String(input), "http://localhost");
  const action = url.pathname.replace(/^\/api\/tessle\//, "");
  const reply = await handleTessle(action, url.searchParams, TEST_SEED);
  return new Response(JSON.stringify(reply.body), {
    status: reply.status,
    headers: { "Content-Type": "application/json" },
  });
});

// jsdom has no canvas; the board copes with that, but jsdom complains when asked.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
// Nor does it lay anything out.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe(): void {}
    disconnect(): void {}
  },
);

afterEach(cleanup);
