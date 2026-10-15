import { encode, makeRules, newGame, saveGame, SIZE, TILE_SET } from "@harfiyen/engine";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";
import { type Lexicons, loadLexicons } from "../src/game/lexicons.ts";
import { playNudge, playTing, setSoundOn, synth, useTingOnTheirMove } from "../src/game/sound.ts";
import { BOT, HUMAN, useGame } from "../src/game/useGame.ts";
import { useOnlineGame } from "../src/game/useOnlineGame.ts";
import { SHAKE_MS } from "../src/screens/OnlineRoom.tsx";
import { FakeSocket, laterTable, roomInfo, tableFor } from "./fakes.ts";

let lexicons: Lexicons;
beforeAll(async () => {
  lexicons = await loadLexicons();
});

let hidden = false;
let ting: ReturnType<typeof vi.spyOn>;
let knock: ReturnType<typeof vi.spyOn>;
let vibrate: ReturnType<typeof vi.fn>;
beforeEach(() => {
  localStorage.setItem("harfiyen:seen-rules:v1", "true");
  hidden = false;
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
  ting = vi.spyOn(synth, "ting").mockImplementation(() => {});
  knock = vi.spyOn(synth, "nudge").mockImplementation(() => {});
  vibrate = vi.fn(() => true);
  Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
});
afterEach(() => {
  ting.mockRestore();
  knock.mockRestore();
  delete (navigator as { vibrate?: unknown }).vibrate;
  vi.useRealTimers();
  window.location.hash = "";
  document.title = "harfiyen";
});

/** A move by `player` in the log, as the server's table carries it. */
const turn = (player: number) => ({ player, kind: "pass" as const });

/** The room screen at its game, the other side (seat 1) to move, once the word lists are in. */
async function theirTurn(nudges = [5, 5]): Promise<FakeSocket> {
  window.location.hash = "#/oda/K7Q2XM";
  render(<App />);
  const socket = FakeSocket.to("/ws/oda/K7Q2XM")[0];
  socket.accept();
  socket.receive({ t: "room", room: roomInfo({ nudges }), table: tableFor(0, "kalemat", 1) });
  await screen.findByText(/Kapatabilirsin; oyun seni bekler/);
  return socket;
}

describe("the nudge button", () => {
  it("shows the nudges left while the other side has the move, and sends one", async () => {
    const socket = await theirTurn([4, 5]);
    vi.useFakeTimers();
    const button = screen.getByRole("button", { name: "Dürt, 4 hakkın kaldı" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe("Dürt4");
    fireEvent.click(button);
    expect(socket.of("nudge")).toEqual([{ t: "nudge" }]);
    socket.receive({ t: "room", room: roomInfo({ nudges: [3, 5] }), table: tableFor(0, "kalemat", 1) });
    // Half a minute before the next, counted down on the button.
    const waiting = screen.getByRole("button", { name: "Dürt, biraz bekle" }) as HTMLButtonElement;
    expect(waiting.disabled).toBe(true);
    expect(waiting.textContent).toBe("Dürt30 sn");
    act(() => vi.advanceTimersByTime(10_000));
    expect(waiting.textContent).toBe("Dürt20 sn");
    act(() => vi.advanceTimersByTime(20_000));
    expect((screen.getByRole("button", { name: "Dürt, 3 hakkın kaldı" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("waits as long as the server says when it turns one down", async () => {
    const socket = await theirTurn([3, 5]);
    socket.receive({ t: "nudgeRefused", left: 3, wait: 12_000 });
    const button = screen.getByRole("button", { name: "Dürt, biraz bekle" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe("Dürt12 sn");
  });

  it("is off with none left, and not there on your own turn", async () => {
    const socket = await theirTurn([0, 5]);
    expect((screen.getByRole("button", { name: "Dürt, bu oyunda hakkın kalmadı" }) as HTMLButtonElement).disabled).toBe(true);
    socket.receive({ t: "room", room: roomInfo(), table: tableFor(0, "kalemat", 0) });
    expect(screen.queryByRole("button", { name: /^Dürt/ })).toBeNull();
  });
});

describe("being nudged", () => {
  it("shakes the page, buzzes, knocks, and says who", () => {
    window.location.hash = "#/oda/K7Q2XM";
    const { container } = render(<App />);
    const socket = FakeSocket.to("/ws/oda/K7Q2XM")[0];
    socket.accept();
    socket.receive({ t: "room", room: roomInfo(), table: tableFor(0) });
    vi.useFakeTimers();
    socket.receive({ t: "nudge", from: 1 });
    const app = container.querySelector(".app")!;
    expect(app.classList.contains("is-nudged")).toBe(true);
    expect(vibrate).toHaveBeenCalledWith([120, 60, 120]);
    expect(knock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Neşeli Kirpi seni dürttü!")).toBeTruthy();
    act(() => vi.advanceTimersByTime(SHAKE_MS));
    expect(app.classList.contains("is-nudged")).toBe(false);
    act(() => vi.advanceTimersByTime(3_500));
    expect(screen.queryByText("Neşeli Kirpi seni dürttü!")).toBeNull();
  });

  it("with the sound off, still shakes and buzzes but makes no sound", () => {
    setSoundOn(false);
    window.location.hash = "#/oda/K7Q2XM";
    const { container } = render(<App />);
    const socket = FakeSocket.to("/ws/oda/K7Q2XM")[0];
    socket.accept();
    socket.receive({ t: "room", room: roomInfo(), table: tableFor(0) });
    socket.receive({ t: "nudge", from: 1 });
    expect(container.querySelector(".app")!.classList.contains("is-nudged")).toBe(true);
    expect(vibrate).toHaveBeenCalled();
    expect(knock).not.toHaveBeenCalled();
  });

  it("in a hidden tab, the title blinks until the tab is looked at", () => {
    document.title = "harfiyen — Türkçe kelime oyunu";
    window.location.hash = "#/oda/K7Q2XM";
    render(<App />);
    const socket = FakeSocket.to("/ws/oda/K7Q2XM")[0];
    socket.accept();
    socket.receive({ t: "room", room: roomInfo(), table: tableFor(0) });
    hidden = true;
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    vi.useFakeTimers();
    socket.receive({ t: "nudge", from: 1 });
    expect(document.title).toBe("(Dürtüldün!) harfiyen");
    act(() => vi.advanceTimersByTime(1000));
    expect(document.title).toBe("(Sıra sende) harfiyen");
    act(() => vi.advanceTimersByTime(1000));
    expect(document.title).toBe("(Dürtüldün!) harfiyen");
    hidden = false;
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    act(() => vi.advanceTimersByTime(3000));
    expect(document.title).toBe("harfiyen — Türkçe kelime oyunu");
  });
});

describe("the ting", () => {
  it("rings once for each move of the other side's: not your own, not a resend, not a reconnect", () => {
    const { result } = renderHook(() => useOnlineGame("K7Q2XM", lexicons));
    let socket = FakeSocket.last();
    socket.accept();
    const start = tableFor(0, "kalemat", 1);
    socket.receive({ t: "room", room: roomInfo(), table: start });
    expect(ting).not.toHaveBeenCalled();
    socket.receive({ t: "room", room: roomInfo(), table: laterTable(start, { log: [turn(1)], turn: 0 }) });
    expect(ting).toHaveBeenCalledTimes(1);
    // The same state again (a nudge, someone's dot): nothing.
    socket.receive({ t: "room", room: roomInfo(), table: laterTable(start, { log: [turn(1)], turn: 0 }) });
    // Your own move: nothing.
    socket.receive({ t: "room", room: roomInfo(), table: laterTable(start, { log: [turn(1), turn(0)], turn: 1 }) });
    expect(ting).toHaveBeenCalledTimes(1);
    // A move made while the line was down arrives with the reconnect: no ring for old news.
    vi.useFakeTimers();
    socket.drop();
    act(() => vi.advanceTimersByTime(2000));
    vi.useRealTimers();
    socket = FakeSocket.last();
    socket.accept();
    socket.receive({ t: "room", room: roomInfo(), table: laterTable(start, { log: [turn(1), turn(0), turn(1)], turn: 0 }) });
    expect(ting).toHaveBeenCalledTimes(1);
    // After that, the next one rings again.
    socket.receive({ t: "room", room: roomInfo(), table: laterTable(start, { log: [turn(1), turn(0), turn(1), turn(0), turn(1)], turn: 0 }) });
    expect(ting).toHaveBeenCalledTimes(2);
    expect(result.current.table.log).toHaveLength(5);
  });

  it("rings when the computer's move lands, not when yours does", () => {
    vi.useFakeTimers();
    const game = newGame("ting-test", makeRules("ting-test"), TILE_SET);
    game.racks[HUMAN] = [..."kalemat"].map((c) => encode(c)![0]);
    localStorage.setItem("harfiyen:game:v1", JSON.stringify({ game: saveGame(game), level: "kolay", view: game.racks[HUMAN] }));
    const { result } = renderHook(() => {
      const api = useGame(lexicons);
      useTingOnTheirMove(api.table, HUMAN);
      return api;
    });
    act(() => {
      for (let i = 0; i < 5; i++) result.current.place(i, 7 * SIZE + 5 + i);
    });
    act(() => result.current.submit());
    expect(ting).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.game.log[1]?.player).toBe(BOT);
    expect(ting).toHaveBeenCalledTimes(1);
  });

  it("the switch in the top bar silences both sounds, and is remembered", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Sesi kapat" }));
    expect(localStorage.getItem("harfiyen:sound:v1")).toBe("false");
    playTing();
    playNudge();
    expect(ting).not.toHaveBeenCalled();
    expect(knock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sesi aç" }));
    expect(localStorage.getItem("harfiyen:sound:v1")).toBe("true");
    playTing();
    expect(ting).toHaveBeenCalledTimes(1);
  });
});
