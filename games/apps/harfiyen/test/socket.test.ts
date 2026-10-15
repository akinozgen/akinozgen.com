import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backoff, type LinkState, openLink, page, PING_EVERY, PONG_WITHIN, socketUrl } from "../src/game/socket.ts";
import { FakeSocket } from "./fakes.ts";

let states: LinkState[];
let messages: unknown[];

let visibility: DocumentVisibilityState = "visible";
Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
function show(state: DocumentVisibilityState): void {
  visibility = state;
  document.dispatchEvent(new Event("visibilitychange"));
}

function link(final?: Parameters<typeof openLink>[0]["final"], hiddenGrace?: () => number) {
  return openLink<{ t: string }>({
    hiddenGrace,
    url: "ws://test/api/harfiyen/ws/oda/K7Q2XM",
    greeting: () => ({ t: "hello", v: 1, secret: "s" }),
    onMessage: (m) => messages.push(m),
    onState: (s) => states.push(s),
    WebSocket: FakeSocket,
    random: () => 0,
    final,
  });
}

beforeEach(() => {
  visibility = "visible";
  vi.useFakeTimers();
  states = [];
  messages = [];
});
afterEach(() => vi.useRealTimers());

describe("the socket", () => {
  it("builds its URL on the page's host, wss on https", () => {
    expect(socketUrl("/api/x", { protocol: "https:", host: "akinozgen.com" })).toBe("wss://akinozgen.com/api/x");
    expect(socketUrl("/api/x", { protocol: "http:", host: "localhost:5187" })).toBe("ws://localhost:5187/api/x");
  });

  it("greets first, before anything else", () => {
    const l = link();
    const socket = FakeSocket.last();
    expect(l.send({ t: "join" })).toBe(false);
    socket.accept();
    expect(socket.sent[0]).toEqual({ t: "hello", v: 1, secret: "s" });
    expect(l.send({ t: "join" })).toBe(true);
    expect(socket.sent[1]).toEqual({ t: "join" });
    expect(states).toEqual(["connecting", "open"]);
    l.close();
  });

  it("waits 1, 2, 4 … 30 seconds between tries, plus jitter", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((n) => backoff(n, () => 0))).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
    expect(backoff(0, () => 0.999)).toBe(1999);

    const l = link();
    for (const wait of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
      const before = FakeSocket.all.length;
      FakeSocket.last().drop();
      vi.advanceTimersByTime(wait - 1);
      expect(FakeSocket.all.length).toBe(before);
      vi.advanceTimersByTime(1);
      expect(FakeSocket.all.length).toBe(before + 1);
    }
    l.close();
  });

  it("starts the waits over once the server has answered", () => {
    const l = link();
    FakeSocket.last().drop();
    vi.advanceTimersByTime(1000);
    FakeSocket.last().drop();
    vi.advanceTimersByTime(2000);
    const socket = FakeSocket.last();
    socket.accept();
    socket.receive({ t: "room" });
    socket.drop();
    const before = FakeSocket.all.length;
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.all.length).toBe(before + 1);
    l.close();
  });

  it("tries again at once when the network or the tab comes back", () => {
    const l = link();
    FakeSocket.last().drop();
    vi.advanceTimersByTime(1000);
    FakeSocket.last().drop();
    // Two seconds to wait, but the network is back.
    let before = FakeSocket.all.length;
    window.dispatchEvent(new Event("online"));
    expect(FakeSocket.all.length).toBe(before + 1);

    FakeSocket.last().drop();
    before = FakeSocket.all.length;
    show("visible");
    expect(FakeSocket.all.length).toBe(before + 1);
    l.close();
  });

  it("lets go of the line half a minute after the page hides, and is back the moment it shows", () => {
    const l = link();
    const socket = FakeSocket.last();
    socket.accept();
    show("hidden");
    vi.advanceTimersByTime(29_000);
    expect(socket.closed).toBe(false);
    vi.advanceTimersByTime(1_000);
    expect(socket.closed).toBe(true);
    expect(l.state).toBe("closed");
    // Hidden, it stays away: no retries, not even when the network comes back.
    const before = FakeSocket.all.length;
    vi.advanceTimersByTime(120_000);
    window.dispatchEvent(new Event("online"));
    expect(FakeSocket.all.length).toBe(before);
    show("visible");
    expect(FakeSocket.all.length).toBe(before + 1);
    l.close();
  });

  it("a short look away keeps the line; a page that keeps it always never lets go", () => {
    const l = link();
    const socket = FakeSocket.last();
    socket.accept();
    show("hidden");
    vi.advanceTimersByTime(10_000);
    show("visible");
    // Back on the tab, it checks the line is still alive.
    expect(socket.sent[socket.sent.length - 1]).toBe("ping");
    socket.receive("pong");
    vi.advanceTimersByTime(25_000);
    expect(socket.closed).toBe(false);
    l.close();

    const quick = link(undefined, () => 10_000);
    FakeSocket.last().accept();
    show("hidden");
    vi.advanceTimersByTime(10_000);
    expect(FakeSocket.last().closed).toBe(true);
    quick.close();

    show("visible");
    const kept = link(undefined, () => Number.POSITIVE_INFINITY);
    FakeSocket.last().accept();
    show("hidden");
    vi.advanceTimersByTime(25_000);
    expect(FakeSocket.last().closed).toBe(false);
    kept.close();
  });

  it("lets go at once when the page is put away", () => {
    const l = link();
    const socket = FakeSocket.last();
    socket.accept();
    window.dispatchEvent(new Event("pagehide"));
    expect(socket.closed).toBe(true);
    const before = FakeSocket.all.length;
    window.dispatchEvent(new Event("pageshow"));
    expect(FakeSocket.all.length).toBe(before + 1);
    l.close();
  });

  it("pings every 30 seconds, and drops a line whose pong never comes", () => {
    const l = link();
    const socket = FakeSocket.last();
    socket.accept();
    vi.advanceTimersByTime(PING_EVERY);
    expect(socket.sent).toContain("ping");
    socket.receive("pong");
    expect(messages).toEqual([]);
    vi.advanceTimersByTime(PING_EVERY);
    expect(socket.sent.filter((m) => m === "ping")).toHaveLength(2);
    // No answer this time: the line is dead.
    vi.advanceTimersByTime(PONG_WITHIN);
    expect(socket.closed).toBe(true);
    expect(states[states.length - 1]).toBe("closed");
    const before = FakeSocket.all.length;
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.all.length).toBe(before + 1);
    l.close();
  });

  it("stops for good when the room is gone", () => {
    const l = link();
    const socket = FakeSocket.last();
    socket.accept();
    socket.receive({ t: "error", code: "yok" });
    expect(messages).toEqual([{ t: "error", code: "yok" }]);
    expect(socket.closed).toBe(true);
    const before = FakeSocket.all.length;
    vi.advanceTimersByTime(120_000);
    window.dispatchEvent(new Event("online"));
    expect(FakeSocket.all.length).toBe(before);
    expect(l.state).toBe("closed");
  });

  it("keeps trying after a limit, which isn't final", () => {
    const l = link();
    const socket = FakeSocket.last();
    socket.accept();
    socket.receive({ t: "error", code: "limit" });
    socket.drop();
    const before = FakeSocket.all.length;
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.all.length).toBe(before + 1);
    l.close();
  });

  it("reloads the page once when the server runs newer code", () => {
    const reload = vi.spyOn(page, "reload").mockImplementation(() => {});
    link();
    FakeSocket.last().accept();
    FakeSocket.last().receive({ t: "error", code: "surum" });
    expect(reload).toHaveBeenCalledTimes(1);
    // The reloaded page is still too old (a cached copy): no reload loop.
    link();
    FakeSocket.last().accept();
    FakeSocket.last().receive({ t: "error", code: "surum" });
    expect(reload).toHaveBeenCalledTimes(1);
    reload.mockRestore();
  });

  it("closed by its owner, it never comes back", () => {
    const l = link();
    FakeSocket.last().drop();
    l.close();
    const before = FakeSocket.all.length;
    vi.advanceTimersByTime(60_000);
    window.dispatchEvent(new Event("online"));
    expect(FakeSocket.all.length).toBe(before);
  });
});
