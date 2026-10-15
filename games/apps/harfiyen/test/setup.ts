import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { resetIdentityCache } from "../src/game/identity.ts";
import { resetMyGamesCache } from "../src/game/myGames.ts";
import { resetPushCache } from "../src/game/push.ts";
import { resetSoundCache } from "../src/game/sound.ts";
import { answerApi, api, FakeSocket } from "./fakes.ts";

/** The word lists come from disk instead of the network; tests run from the app's folder. */
const DATA = resolve(process.cwd(), "../../packages/harfiyen/data");

vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
  // The game's server, as each test sets it up.
  const path = String(input).replace(/^https?:\/\/[^/]+/, "");
  if (path.startsWith("/api/harfiyen/")) return answerApi(init?.method ?? "GET", path, init);
  const name = basename(String(input).split("?")[0]);
  try {
    return new Response(readFileSync(resolve(DATA, name), "utf8"), { status: 200 });
  } catch {
    return new Response("not found", { status: 404 });
  }
});

// jsdom lays nothing out.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  },
);

// No test talks to a real server: sockets are the tests' fakes.
vi.stubGlobal("WebSocket", FakeSocket);

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  FakeSocket.all = [];
  api.clear();
  resetIdentityCache();
  resetMyGamesCache();
  resetPushCache();
  resetSoundCache();
});
