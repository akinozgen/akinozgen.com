import type { ChatLine } from "@harfiyen/engine";
import { act, cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";
import { PHRASES } from "../src/components/Chat.tsx";
import { type Lexicons, loadLexicons } from "../src/game/lexicons.ts";
import { setSoundOn, synth } from "../src/game/sound.ts";
import { useOnlineGame } from "../src/game/useOnlineGame.ts";
import { CHAT_TOAST_MS } from "../src/screens/OnlineRoom.tsx";
import { FakeSocket, GUEST, roomInfo, tableFor } from "./fakes.ts";

let lexicons: Lexicons;
beforeAll(async () => {
  lexicons = await loadLexicons();
});

let hidden = false;
let pop: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  localStorage.setItem("harfiyen:seen-rules:v1", "true");
  hidden = false;
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
  pop = vi.spyOn(synth, "pop").mockImplementation(() => {});
});
afterEach(() => {
  pop.mockRestore();
  delete (window as { matchMedia?: unknown }).matchMedia;
  vi.useRealTimers();
  window.location.hash = "";
  document.title = "harfiyen";
});

const SEEN_KEY = "harfiyen:chat-seen:v1";
const AT = Date.UTC(2026, 9, 15, 12, 0);

/** A chat line: `from` 0 is the player (seat 0 in `roomInfo`), 1 the other. */
const line = (id: number, from: number, text = `satır ${id}`): ChatLine => ({ id, from, text, at: AT + id * 60_000 });

/** The room at its game, seat 0 to move, with `lines` as the chat's history. */
function inRoom(lines: ChatLine[] = [], muted = false): FakeSocket {
  window.location.hash = "#/oda/K7Q2XM";
  render(<App />);
  const socket = FakeSocket.to("/ws/oda/K7Q2XM").at(-1)!;
  socket.accept();
  socket.receive({ t: "room", room: roomInfo(), table: tableFor(0) });
  socket.receive({ t: "chat", lines, muted });
  return socket;
}

const OPEN_KEY = "harfiyen:chat-open:v1";

/** The top bar's chat button: its name carries the unread count. */
const chatButton = (): HTMLElement => screen.getByRole("button", { name: /^Sohbet(,|$)/ });
const openChat = (): void => {
  fireEvent.click(chatButton());
};
/** The drawer, while it's open; hidden from everyone while it's closed. */
const drawer = (): HTMLElement | null => screen.queryByRole("dialog", { name: "Sohbet" });

/** A phone: narrower than the drawer's breakpoint. */
function onAPhone(): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }),
  });
}
const bubbles = (): string[] => [...document.querySelectorAll(".chat__line")].map((li) => li.firstChild!.nextSibling!.textContent!);

describe("the chat's state", () => {
  it("takes the history as it comes, replacing what was there, without a sound", () => {
    const { result } = renderHook(() => useOnlineGame("K7Q2XM", lexicons));
    const socket = FakeSocket.last();
    socket.accept();
    socket.receive({ t: "room", room: roomInfo(), table: tableFor(0) });
    expect(result.current.chat.open).toBe(true);
    socket.receive({ t: "chat", lines: [line(2, 1), line(1, 0)], muted: false });
    expect(result.current.chat.lines.map((l) => l.id)).toEqual([1, 2]);
    socket.receive({ t: "chat", lines: [line(1, 0)], muted: true });
    expect(result.current.chat.lines.map((l) => l.id)).toEqual([1]);
    expect(result.current.chat.muted).toBe(true);
    expect(result.current.chat.heard).toBeNull();
    expect(pop).not.toHaveBeenCalled();
  });

  it("adds each new line once, pops for the other's and not for one's own", () => {
    const { result } = renderHook(() => useOnlineGame("K7Q2XM", lexicons));
    const socket = FakeSocket.last();
    socket.accept();
    socket.receive({ t: "room", room: roomInfo(), table: tableFor(0) });
    socket.receive({ t: "chat", lines: [line(1, 1)], muted: false });
    socket.receive({ t: "said", line: line(2, 0, "selam") });
    expect(pop).not.toHaveBeenCalled();
    expect(result.current.chat.heard).toBeNull();
    socket.receive({ t: "said", line: line(3, 1, "merhaba") });
    socket.receive({ t: "said", line: line(3, 1, "merhaba") });
    socket.receive({ t: "said", line: line(2, 0, "selam") });
    expect(result.current.chat.lines.map((l) => l.text)).toEqual(["satır 1", "selam", "merhaba"]);
    expect(pop).toHaveBeenCalledTimes(1);
    expect(result.current.chat.heard?.id).toBe(3);
    // The history again on a reconnect: no sound for what's already there.
    socket.receive({ t: "chat", lines: [line(1, 1), line(2, 0), line(3, 1)], muted: false });
    expect(pop).toHaveBeenCalledTimes(1);
  });

  it("keeps quiet with the sound off", () => {
    setSoundOn(false);
    const socket = inRoom();
    socket.receive({ t: "said", line: line(1, 1) });
    expect(pop).not.toHaveBeenCalled();
  });
});

describe("the chat on screen", () => {
  it("has its button in an online game's top bar, not in a game against the computer, and leaves the panel's tabs alone", async () => {
    window.location.hash = "";
    render(<App />);
    await screen.findByRole("tab", { name: /^Hamleler/ });
    expect(screen.queryByRole("button", { name: /^Sohbet/ })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    cleanup();

    inRoom([line(1, 1, "Merhaba!"), line(2, 0, "Selam, iyi oyunlar")]);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Hamleler", "Gidişat", "Torba86"]);
    expect(chatButton().getAttribute("aria-expanded")).toBe("false");
    expect(drawer()).toBeNull();
    openChat();
    const log = within(drawer()!).getByRole("log", { name: "Mesajlar" });
    expect(log.getAttribute("aria-live")).toBe("polite");
    expect(bubbles()).toEqual(["Merhaba!", "Selam, iyi oyunlar"]);
    expect(log.querySelector(".chat__line--them")?.textContent).toContain("Neşeli Kirpi: Merhaba!");
    expect(log.querySelector(".chat__line--you")?.textContent).toContain("Sen: Selam, iyi oyunlar");
    expect(within(drawer()!).getByText("Neşeli Kirpi")).toBeTruthy();
  });

  it("opens beside the game and closes again from the button, its own close, or Escape; focus goes in and comes back", () => {
    inRoom();
    const button = chatButton();
    button.focus();
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const open = drawer()!;
    expect(open.getAttribute("aria-modal")).toBeNull();
    // Beside the game: the board stays in play.
    expect(document.querySelector(".app")!.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(within(open).getByRole("textbox", { name: "Mesaj" }));
    expect(localStorage.getItem(OPEN_KEY)).toBe("true");
    fireEvent.click(button);
    expect(drawer()).toBeNull();
    expect(localStorage.getItem(OPEN_KEY)).toBe("false");

    fireEvent.click(button);
    fireEvent.keyDown(within(drawer()!).getByRole("textbox", { name: "Mesaj" }), { key: "Escape" });
    expect(drawer()).toBeNull();
    expect(document.activeElement).toBe(button);

    fireEvent.click(button);
    fireEvent.click(within(drawer()!).getByRole("button", { name: "Sohbeti kapat" }));
    expect(drawer()).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("is open again on a computer if it was left open, without taking the keys", () => {
    localStorage.setItem(OPEN_KEY, "true");
    inRoom();
    expect(drawer()).toBeTruthy();
    expect(chatButton().getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(document.body);
  });

  it("on a phone takes the whole screen: the page behind holds still, the way back has the focus, nothing is remembered", () => {
    onAPhone();
    localStorage.setItem(OPEN_KEY, "true");
    inRoom();
    expect(drawer()).toBeNull();
    openChat();
    const open = drawer()!;
    expect(open.getAttribute("aria-modal")).toBe("true");
    expect(document.querySelector(".app")!.hasAttribute("inert")).toBe(true);
    expect(document.documentElement.classList.contains("is-chat-full")).toBe(true);
    expect(document.activeElement).toBe(within(open).getByRole("button", { name: "Sohbeti kapat" }));
    expect(localStorage.getItem(OPEN_KEY)).toBe("true");
    fireEvent.click(within(open).getByRole("button", { name: "Sohbeti kapat" }));
    expect(drawer()).toBeNull();
    expect(document.querySelector(".app")!.hasAttribute("inert")).toBe(false);
    expect(document.documentElement.classList.contains("is-chat-full")).toBe(false);
  });

  it("marks the days once the chat reaches back past today", () => {
    const day = 86_400_000;
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const at = (daysAgo: number, id: number, from: number): ChatLine => ({ id, from, text: `satır ${id}`, at: now.getTime() - daysAgo * day });
    inRoom([at(3, 1, 1), at(1, 2, 0), at(1, 3, 1), at(0, 4, 0)]);
    openChat();
    const days = [...document.querySelectorAll(".chat__day")].map((li) => li.textContent);
    expect(days).toHaveLength(3);
    expect(days.slice(1)).toEqual(["Dün", "Bugün"]);
    expect(document.querySelector(".chat__line time")?.textContent).toBe("12:00");
    cleanup();
    // All of it today: no line between days.
    inRoom([at(0, 1, 1), at(0, 2, 0)]);
    openChat();
    expect(document.querySelectorAll(".chat__day")).toHaveLength(0);
  });

  it("isn't there while the invitation waits, nor for a visitor", () => {
    window.location.hash = "#/oda/K7Q2XM";
    render(<App />);
    const socket = FakeSocket.to("/ws/oda/K7Q2XM")[0];
    socket.accept();
    socket.receive({ t: "room", room: roomInfo({ phase: "waiting", seats: [{ name: GUEST, online: true }, null], host: 0 }), table: null });
    expect(screen.getByText("Linki arkadaşına gönder")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Sohbet/ })).toBeNull();
    expect(document.querySelector(".chat-drawer")).toBeNull();
    socket.receive({
      t: "room",
      room: roomInfo({ phase: "waiting", you: null, seats: [{ name: GUEST, online: true }, null], host: 0 }),
      table: null,
    });
    expect(screen.getByRole("button", { name: "Oyuna katıl" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Sohbet/ })).toBeNull();
    expect(document.querySelector(".chat-drawer")).toBeNull();
  });

  it("stays after the game, for a word at the end", () => {
    window.location.hash = "#/oda/K7Q2XM";
    render(<App />);
    const socket = FakeSocket.to("/ws/oda/K7Q2XM")[0];
    socket.accept();
    socket.receive({ t: "room", room: roomInfo({ phase: "over", abandoned: true }), table: tableFor(0) });
    socket.receive({ t: "chat", lines: [], muted: false });
    openChat();
    fireEvent.click(screen.getByRole("button", { name: "İyi oyundu" }));
    expect(socket.of("say")).toEqual([{ t: "say", text: "İyi oyundu" }]);
  });

  it("sends a ready-made line with one tap, and shows it once the server sends it back", () => {
    const socket = inRoom();
    openChat();
    const phrases = screen.getByRole("group", { name: "Hazır mesajlar" });
    expect(within(phrases).getAllByRole("button").map((b) => b.textContent)).toEqual([...PHRASES]);
    fireEvent.click(within(phrases).getByRole("button", { name: "Güzel hamle!" }));
    expect(socket.of("say")).toEqual([{ t: "say", text: "Güzel hamle!" }]);
    expect(bubbles()).toEqual([]);
    socket.receive({ t: "said", line: line(1, 0, "Güzel hamle!") });
    expect(bubbles()).toEqual(["Güzel hamle!"]);
  });

  it("sends a typed line with Enter and empties the box; an empty box sends nothing", () => {
    const socket = inRoom();
    openChat();
    const box = screen.getByRole("textbox", { name: "Mesaj" }) as HTMLInputElement;
    expect(box.maxLength).toBe(160);
    const button = screen.getByRole("button", { name: "Gönder" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(box, { target: { value: "   " } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(socket.of("say")).toEqual([]);
    fireEvent.change(box, { target: { value: "  bu kelime var mı?  " } });
    expect(button.disabled).toBe(false);
    fireEvent.keyDown(box, { key: "Enter" });
    expect(socket.of("say")).toEqual([{ t: "say", text: "bu kelime var mı?" }]);
    expect(box.value).toBe("");
    // The button does the same.
    fireEvent.change(box, { target: { value: "tamam" } });
    fireEvent.click(button);
    expect(socket.of("say")).toHaveLength(2);
    expect(box.value).toBe("");
  });

  it("keeps a half-typed line while it's closed", () => {
    inRoom();
    openChat();
    fireEvent.change(screen.getByRole("textbox", { name: "Mesaj" }), { target: { value: "yarım kal" } });
    openChat();
    openChat();
    expect((screen.getByRole("textbox", { name: "Mesaj" }) as HTMLInputElement).value).toBe("yarım kal");
  });

  it("can't send while the line is down", () => {
    const socket = inRoom();
    openChat();
    vi.useFakeTimers();
    socket.drop();
    fireEvent.change(screen.getByRole("textbox", { name: "Mesaj" }), { target: { value: "selam" } });
    expect((screen.getByRole("button", { name: "Gönder" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Merhaba!" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("says how long to wait when a line went too soon, and gives the typed words back", () => {
    const socket = inRoom();
    openChat();
    vi.useFakeTimers();
    const box = screen.getByRole("textbox", { name: "Mesaj" }) as HTMLInputElement;
    fireEvent.change(box, { target: { value: "hadi ama" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(box.value).toBe("");
    socket.receive({ t: "sayRefused", wait: 2_500 });
    expect(screen.getByText("Biraz yavaş — 3 sn")).toBeTruthy();
    expect(box.value).toBe("hadi ama");
    expect((screen.getByRole("button", { name: "Merhaba!" }) as HTMLButtonElement).disabled).toBe(true);
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByText("Biraz yavaş — 2 sn")).toBeTruthy();
    act(() => vi.advanceTimersByTime(1_600));
    expect(screen.queryByText(/Biraz yavaş/)).toBeNull();
    expect((screen.getByRole("button", { name: "Merhaba!" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("says so when nothing was left of a line", () => {
    const socket = inRoom();
    openChat();
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Vay be!" }));
    socket.receive({ t: "sayRefused", wait: 0 });
    expect(screen.getByText("Mesaj boş kaldı")).toBeTruthy();
    act(() => vi.advanceTimersByTime(3_000));
    expect(screen.queryByText("Mesaj boş kaldı")).toBeNull();
  });

  it("hides the other's lines from the switch in its header: the switch asks, the server's answer shows", () => {
    const socket = inRoom([line(1, 1, "Merhaba!"), line(2, 0, "Selam")]);
    openChat();
    const toggle = within(drawer()!).getByRole("switch", { name: "Rakibin mesajlarını gizle" });
    expect(toggle.closest("header")).toBeTruthy();
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    expect(socket.of("mute")).toEqual([{ t: "mute", on: true }]);
    socket.receive({ t: "chat", lines: [line(2, 0, "Selam")], muted: true });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(bubbles()).toEqual(["Selam"]);
    expect(screen.getByText("Rakibinin mesajları gizli; bundan haberi olmaz.")).toBeTruthy();
    fireEvent.click(toggle);
    expect(socket.of("mute")).toEqual([
      { t: "mute", on: true },
      { t: "mute", on: false },
    ]);
  });

  it("keeps its keys to itself: Escape there doesn't take the board's tiles back", () => {
    inRoom();
    openChat();
    const keys = vi.fn();
    window.addEventListener("keydown", keys);
    fireEvent.keyDown(screen.getByRole("button", { name: "Merhaba!" }), { key: "a" });
    expect(keys).not.toHaveBeenCalled();
    window.removeEventListener("keydown", keys);
  });
});

describe("unread lines", () => {
  it("with the chat closed: a count on the button and a word at the top that opens it", () => {
    const socket = inRoom();
    vi.useFakeTimers();
    socket.receive({ t: "said", line: line(1, 1, "Sıra sende, hadi!") });
    expect(chatButton().getAttribute("aria-label")).toBe("Sohbet, 1 okunmamış mesaj");
    expect(document.querySelector(".room-chat__badge")?.textContent).toBe("1");
    const toast = document.querySelector(".toast--chat")!;
    expect(toast.textContent).toBe("Neşeli Kirpi: Sıra sende, hadi!");
    expect(pop).toHaveBeenCalledTimes(1);
    // One's own line counts for nothing.
    socket.receive({ t: "said", line: line(2, 0, "geliyorum") });
    expect(chatButton().getAttribute("aria-label")).toBe("Sohbet, 1 okunmamış mesaj");
    fireEvent.click(within(toast as HTMLElement).getByRole("button"));
    expect(drawer()).toBeTruthy();
    expect(document.querySelector(".toast")).toBeNull();
    expect(chatButton().getAttribute("aria-label")).toBe("Sohbet");
    expect(document.querySelector(".room-chat__badge")).toBeNull();
    expect(JSON.parse(localStorage.getItem(SEEN_KEY)!)).toEqual({ K7Q2XM: 2 });
  });

  it("the word at the top goes by itself, and the count stays", () => {
    const socket = inRoom();
    vi.useFakeTimers();
    socket.receive({ t: "said", line: line(1, 1) });
    expect(document.querySelector(".toast--chat")).toBeTruthy();
    act(() => vi.advanceTimersByTime(CHAT_TOAST_MS));
    expect(document.querySelector(".toast--chat")).toBeNull();
    expect(chatButton().getAttribute("aria-label")).toBe("Sohbet, 1 okunmamış mesaj");
  });

  it("with the chat open: no count and no word at the top, only the line (and its pop)", () => {
    const socket = inRoom();
    openChat();
    socket.receive({ t: "said", line: line(1, 1, "Merhaba!") });
    expect(bubbles()).toEqual(["Merhaba!"]);
    expect(document.querySelector(".toast")).toBeNull();
    expect(chatButton().getAttribute("aria-label")).toBe("Sohbet");
    expect(pop).toHaveBeenCalledTimes(1);
  });

  it("opening the chat clears the count, closing it lets the next line count again", () => {
    const socket = inRoom([line(1, 1), line(2, 1)]);
    expect(chatButton().getAttribute("aria-label")).toBe("Sohbet, 2 okunmamış mesaj");
    openChat();
    expect(chatButton().getAttribute("aria-label")).toBe("Sohbet");
    openChat();
    socket.receive({ t: "said", line: line(3, 1) });
    expect(chatButton().getAttribute("aria-label")).toBe("Sohbet, 1 okunmamış mesaj");
  });

  it("in a hidden tab: the title blinks, and the line waits unread even with the chat open", () => {
    document.title = "harfiyen — Türkçe kelime oyunu";
    const socket = inRoom();
    openChat();
    hidden = true;
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    vi.useFakeTimers();
    socket.receive({ t: "said", line: line(1, 1) });
    expect(document.title).toBe("(Yeni mesaj) harfiyen");
    expect(chatButton().getAttribute("aria-label")).toBe("Sohbet, 1 okunmamış mesaj");
    act(() => vi.advanceTimersByTime(1000));
    expect(document.title).toBe("(Sıra sende) harfiyen");
    hidden = false;
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    act(() => vi.advanceTimersByTime(3000));
    expect(document.title).toBe("harfiyen — Türkçe kelime oyunu");
    expect(chatButton().getAttribute("aria-label")).toBe("Sohbet");
  });

  it("are remembered across a reload, per room", () => {
    inRoom([line(1, 1), line(2, 0), line(3, 1)]);
    expect(chatButton().getAttribute("aria-label")).toBe("Sohbet, 2 okunmamış mesaj");
    cleanup();
    // Not read yet: still unread after a reload.
    inRoom([line(1, 1), line(2, 0), line(3, 1)]);
    expect(chatButton().getAttribute("aria-label")).toBe("Sohbet, 2 okunmamış mesaj");
    openChat();
    expect(JSON.parse(localStorage.getItem(SEEN_KEY)!)).toEqual({ K7Q2XM: 3 });
    openChat();
    cleanup();
    // Read, then one more while away: only that one.
    inRoom([line(1, 1), line(2, 0), line(3, 1), line(4, 1)]);
    expect(chatButton().getAttribute("aria-label")).toBe("Sohbet, 1 okunmamış mesaj");
    expect(document.querySelector(".toast")).toBeNull();
    expect(pop).not.toHaveBeenCalled();
  });

  it("survive storage that won't work", () => {
    localStorage.setItem(SEEN_KEY, "not json");
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    inRoom([line(1, 1)]);
    expect(chatButton().getAttribute("aria-label")).toBe("Sohbet, 1 okunmamış mesaj");
    openChat();
    expect(drawer()).toBeTruthy();
    expect(chatButton().getAttribute("aria-label")).toBe("Sohbet");
    setItem.mockRestore();
  });
});
