import { PROTOCOL, SIZE } from "@harfiyen/engine";
import { act, renderHook } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { type Lexicons, loadLexicons } from "../src/game/lexicons.ts";
import { page } from "../src/game/socket.ts";
import { useOnlineGame } from "../src/game/useOnlineGame.ts";
import { FakeSocket, laterTable, rackOf, roomInfo, tableFor } from "./fakes.ts";

let lexicons: Lexicons;
beforeAll(async () => {
  lexicons = await loadLexicons();
});

const CENTRE_ROW = 7 * SIZE;
const SUB = { endpoint: "https://push.example/abc", keys: { p256dh: "p", auth: "a" } };

function start() {
  const hook = renderHook(() => useOnlineGame("K7Q2XM", lexicons));
  const socket = FakeSocket.last();
  socket.accept();
  return { ...hook, socket };
}

describe("an online game", () => {
  it("greets the room first with the protocol's version alone: the player is the session's account", () => {
    const { socket } = start();
    expect(socket.url).toMatch(/\/api\/harfiyen\/ws\/oda\/K7Q2XM$/);
    expect(socket.sent[0]).toEqual({ t: "hello", v: PROTOCOL });
  });

  it("opens a fresh line when the account's name changes, since the room takes the name a line opens with", () => {
    const hook = renderHook(({ name }) => useOnlineGame("K7Q2XM", lexicons, { name }), { initialProps: { name: "Ayşe #0007" } });
    const first = FakeSocket.last();
    first.accept();
    hook.rerender({ name: "Ayşe #0007" });
    expect(FakeSocket.all).toHaveLength(1);
    hook.rerender({ name: "Ayşe Teyze #0007" });
    expect(first.closed).toBe(true);
    const second = FakeSocket.last();
    expect(second).not.toBe(first);
    second.accept();
    expect(second.sent[0]).toEqual({ t: "hello", v: PROTOCOL });
  });

  it("shows the server's table: its own rack, whose turn", () => {
    const { result, socket } = start();
    expect(result.current.room).toBeNull();
    expect(result.current.dealt).toBe(false);
    socket.receive({ t: "room", room: roomInfo(), table: tableFor(0) });
    expect(result.current.dealt).toBe(true);
    expect(result.current.table.rack).toEqual(rackOf("kalemat"));
    expect(result.current.yourTurn).toBe(true);
    expect(result.current.busy).toBe(false);
    expect(result.current.connection).toBe("open");
  });

  it("an empty board while the invitation waits", () => {
    const { result, socket } = start();
    socket.receive({ t: "room", room: roomInfo({ phase: "waiting", host: 0, seats: [{ name: "A #0001", online: true }, null] }), table: null });
    expect(result.current.dealt).toBe(false);
    expect(result.current.table.log).toEqual([]);
    expect(result.current.table.rack).toEqual([]);
    expect(result.current.yourTurn).toBe(false);
  });

  it("plays with the turn count it saw, waits for the answer, and takes a refusal", () => {
    const { result, socket } = start();
    const table = tableFor(0);
    socket.receive({ t: "room", room: roomInfo(), table });
    act(() => {
      for (let i = 0; i < 5; i++) result.current.place(i, CENTRE_ROW + 5 + i);
    });
    expect(result.current.reading?.ok).toBe(true);
    act(() => result.current.submit());
    const play = socket.of("play");
    expect(play).toHaveLength(1);
    expect(play[0].n).toBe(0);
    expect(play[0].p).toEqual([0, 1, 2, 3, 4].map((i) => [CENTRE_ROW + 5 + i, rackOf("kalemat")[i], 0]));
    expect(result.current.busy).toBe(true);

    // A second tap while the first is on its way sends nothing.
    act(() => result.current.submit());
    expect(socket.of("play")).toHaveLength(1);

    // Someone's dot changes: still waiting for the answer.
    socket.receive({ t: "room", room: roomInfo({ seats: [{ name: "A", online: true }, { name: "B", online: false }] }), table });
    expect(result.current.busy).toBe(true);

    socket.receive({ t: "refused", n: 0, refusal: { kind: "center" } });
    expect(result.current.busy).toBe(false);
    expect(result.current.refusal).toEqual({ kind: "center" });
    // The tiles stay where they were, to be fixed.
    expect(result.current.draft).toHaveLength(5);
  });

  it("a landed move clears the hand and the wait", () => {
    const { result, socket } = start();
    const table = tableFor(0);
    socket.receive({ t: "room", room: roomInfo(), table });
    act(() => {
      for (let i = 0; i < 5; i++) result.current.place(i, CENTRE_ROW + 5 + i);
    });
    act(() => result.current.submit());
    const after = laterTable(table, {
      log: [{ player: 0, kind: "play", placements: [], words: ["kalem"], score: 14, bingo: false, star: false }],
      turn: 1,
      rack: rackOf("atbcdef"),
    });
    socket.receive({ t: "room", room: roomInfo(), table: after });
    expect(result.current.busy).toBe(false);
    expect(result.current.draft).toEqual([]);
    expect(result.current.yourTurn).toBe(false);
    // The two tiles left keep their place at the front.
    expect(result.current.view.slice(0, 2)).toEqual(rackOf("at"));
  });

  it("swaps and passes with the turn count too", () => {
    const { result, socket } = start();
    socket.receive({ t: "room", room: roomInfo(), table: tableFor(0) });
    act(() => result.current.swap([0, 2]));
    expect(socket.of("swap")[0]).toEqual({ t: "swap", n: 0, tiles: rackOf("kl") });
    socket.receive({ t: "refused", n: 0, refusal: { kind: "bag" } });
    act(() => result.current.pass());
    expect(socket.of("pass")[0]).toEqual({ t: "pass", n: 0 });
  });

  it("nothing goes out while the line is down", () => {
    const { result, socket } = start();
    socket.receive({ t: "room", room: roomInfo(), table: tableFor(0) });
    socket.drop();
    expect(result.current.connection).toBe("closed");
    expect(result.current.busy).toBe(true);
    act(() => result.current.pass());
    expect(socket.of("pass")).toHaveLength(0);
  });

  it("join, rematch and cancel go to the room as they are", () => {
    const { result, socket } = start();
    socket.receive({ t: "room", room: roomInfo({ phase: "waiting", you: null, host: 1 }), table: null });
    act(() => result.current.join());
    act(() => result.current.rematch());
    act(() => result.current.cancel());
    expect(socket.sent.slice(1)).toEqual([{ t: "join" }, { t: "rematch" }, { t: "cancel" }]);
  });

  it("reloads once when the server is newer", () => {
    const reload = vi.spyOn(page, "reload").mockImplementation(() => {});
    const { result, socket } = start();
    socket.receive({ t: "error", code: "surum" });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe("surum");
    reload.mockRestore();
  });

  it("says where its notices go right after the greeting, once seated", () => {
    localStorage.setItem("harfiyen:push:v1", JSON.stringify({ sub: SUB }));
    const { socket } = start();
    expect(socket.sent).toHaveLength(1);
    socket.receive({ t: "room", room: roomInfo(), table: tableFor(0) });
    expect(socket.sent.slice(0, 2)).toEqual([expect.objectContaining({ t: "hello" }), { t: "push", sub: SUB }]);
    // Not again for every message on the same line…
    socket.receive({ t: "room", room: roomInfo(), table: tableFor(0) });
    expect(socket.of("push")).toHaveLength(1);
    // …but again after a reconnect.
    vi.useFakeTimers();
    socket.drop();
    // The first retry comes within two seconds: one, plus up to a second of jitter.
    act(() => vi.advanceTimersByTime(2000));
    vi.useRealTimers();
    const again = FakeSocket.last();
    again.accept();
    again.receive({ t: "room", room: roomInfo(), table: tableFor(0) });
    expect(again.sent).toEqual([expect.objectContaining({ t: "hello" }), { t: "push", sub: SUB }]);
  });

  it("a visitor without a seat says nothing about notices", () => {
    localStorage.setItem("harfiyen:push:v1", JSON.stringify({ sub: SUB }));
    const { socket } = start();
    socket.receive({ t: "room", room: roomInfo({ phase: "waiting", you: null, host: 1 }), table: null });
    expect(socket.of("push")).toHaveLength(0);
  });
});
