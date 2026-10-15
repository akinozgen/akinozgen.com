import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";
import { loadLexicons } from "../src/game/lexicons.ts";
import { api, FakeSocket, GUEST, HOST, roomInfo, summary, tableFor } from "./fakes.ts";

beforeAll(async () => {
  await loadLexicons();
});

let hidden = false;
beforeEach(() => {
  localStorage.setItem("harfiyen:seen-rules:v1", "true");
  hidden = false;
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
});
afterEach(() => {
  window.location.hash = "";
  document.title = "harfiyen";
});

function at(hash: string): void {
  window.location.hash = hash;
  render(<App />);
}

/** The room socket, opened and greeted. */
function roomSocket(): FakeSocket {
  const socket = FakeSocket.to("/ws/oda/K7Q2XM")[0];
  socket.accept();
  return socket;
}

describe("the online hub", () => {
  it("shows who you are and, with no games yet, how online play works", async () => {
    at("#/cevrimici");
    expect(await screen.findByRole("textbox", { name: "Adın" })).toBeTruthy();
    expect(screen.getByText(/^#\d{4}$/)).toBeTruthy();
    expect(screen.getByText("Bu cihazdaki adın")).toBeTruthy();
    expect(screen.getByText(/sırayla oynanır, süre yok: hamleni yap, kapat, sıra sana gelince devam et/)).toBeTruthy();
  });

  it("lists the games by group, asks the server for news, and badges the ones waiting on you", async () => {
    localStorage.setItem(
      "harfiyen:online:v1",
      JSON.stringify(["AAAAAA", "BBBBBB", "CCCCCC", "DDDDDD"].map((code) => ({ code, added: Date.now(), summary: null }))),
    );
    api.set("GET /api/harfiyen/ozet", () => ({
      body: {
        rooms: [
          summary("AAAAAA", { you: 0, turn: 0, scores: [120, 98] }),
          summary("BBBBBB", { you: 1, turn: 0 }),
          summary("CCCCCC", { phase: "waiting", turn: null, names: [GUEST, null] }),
          summary("DDDDDD", { phase: "over", turn: null, winner: 0 }),
        ],
      },
    }));
    at("#/cevrimici");
    const yours = (await screen.findByText("Sıra sende", { selector: ".group__title" })).closest("section")!;
    const row = within(yours).getByRole("link");
    expect(row.getAttribute("href")).toBe("#/oda/AAAAAA");
    expect(row.textContent).toContain("Neşeli Kirpi");
    expect(row.textContent).toContain("3 sa önce");
    expect(within(row).getByLabelText("Sen 120, rakip 98")).toBeTruthy();
    expect(screen.getByText("Sıra onda", { selector: ".group__title" })).toBeTruthy();
    expect(screen.getByText("Davet bekliyor", { selector: ".group__title" })).toBeTruthy();
    // The finished one waits behind its fold.
    expect(screen.queryByText("Kazandın")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Bitenler/ }));
    expect(screen.getByText("Kazandın")).toBeTruthy();
    expect(screen.getByLabelText("1 oyunda sıra sende")).toBeTruthy();
  });

  it("looks for a random opponent, offers other ways after 20 seconds, and goes to the room when paired", async () => {
    at("#/cevrimici");
    await screen.findByRole("textbox", { name: "Adın" });
    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole("button", { name: /Rastgele rakip/ }));
      const lobby = FakeSocket.to("/ws/lobi")[0];
      lobby.accept();
      expect(lobby.sent[0]).toMatchObject({ t: "seek", v: 1 });
      lobby.receive({ t: "waiting", seekers: 3 });
      expect(screen.getByText("Rakip aranıyor…")).toBeTruthy();
      expect(screen.getByText("Şu an 3 kişi arıyor")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Oda kur, linki paylaş" })).toBeNull();
      act(() => vi.advanceTimersByTime(20_000));
      expect(screen.getByRole("button", { name: "Oda kur, linki paylaş" })).toBeTruthy();
      expect(screen.getByRole("link", { name: "Bilgisayara karşı oyna" })).toBeTruthy();
      // Still looking: nothing gives up on its own.
      expect(lobby.closed).toBe(false);
      lobby.receive({ t: "matched", code: "K7Q2XM" });
    } finally {
      vi.useRealTimers();
    }
    expect(window.location.hash).toBe("#/oda/K7Q2XM");
    expect(JSON.parse(localStorage.getItem("harfiyen:online:v1")!)[0].code).toBe("K7Q2XM");
  });

  it("stops looking on Vazgeç", async () => {
    at("#/cevrimici");
    fireEvent.click(await screen.findByRole("button", { name: /Rastgele rakip/ }));
    const lobby = FakeSocket.to("/ws/lobi")[0];
    lobby.accept();
    fireEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(lobby.closed).toBe(true);
    expect(screen.getByRole("button", { name: /Rastgele rakip/ })).toBeTruthy();
  });

  it("makes an invitation and goes to it", async () => {
    let asked: unknown = null;
    api.set("GET /api/harfiyen/oda", (body) => {
      asked = body;
      return { status: 201, body: { code: "K7Q2XM" } };
    });
    at("#/cevrimici");
    fireEvent.click(await screen.findByRole("button", { name: /Arkadaşını çağır/ }));
    await waitFor(() => expect(window.location.hash).toBe("#/oda/K7Q2XM"));
    expect(asked).toMatchObject({ v: 1, secret: expect.stringMatching(/^[0-9a-f]{32}$/) });
  });

  it("says so when the invitation can't be made", async () => {
    api.set("GET /api/harfiyen/oda", () => ({ status: 503, body: { error: "kapali" } }));
    at("#/cevrimici");
    fireEvent.click(await screen.findByRole("button", { name: /Arkadaşını çağır/ }));
    expect(await screen.findByText("Çevrimiçi oyun şu an kapalı. Biraz sonra yeniden dene.")).toBeTruthy();
  });

  it("lets the name's words be changed, checked, rolled at random, or put back", async () => {
    at("#/cevrimici");
    const field = (await screen.findByRole("textbox", { name: "Adın" })) as HTMLInputElement;
    const original = field.value;
    fireEvent.change(field, { target: { value: "  Ayşe   Teyze " } });
    fireEvent.keyDown(field, { key: "Enter" });
    fireEvent.blur(field);
    expect(JSON.parse(localStorage.getItem("harfiyen:name:v1")!)).toBe("Ayşe Teyze");
    expect(field.value).toBe("Ayşe Teyze");

    fireEvent.change(field, { target: { value: "x" } });
    fireEvent.blur(field);
    expect(screen.getByRole("alert").textContent).toBe("Ad en az 2 harf olmalı.");
    expect(JSON.parse(localStorage.getItem("harfiyen:name:v1")!)).toBe("Ayşe Teyze");
    fireEvent.change(field, { target: { value: "x" } });
    fireEvent.keyDown(field, { key: "Escape" });
    fireEvent.blur(field);
    expect(field.value).toBe("Ayşe Teyze");

    fireEvent.click(screen.getByRole("button", { name: "Rastgele ad" }));
    expect(field.value).not.toBe("Ayşe Teyze");
    expect(field.value.split(" ").length).toBeGreaterThanOrEqual(2);

    // Emptied, the device's own words come back.
    fireEvent.change(field, { target: { value: "" } });
    fireEvent.blur(field);
    expect(localStorage.getItem("harfiyen:name:v1")).toBeNull();
    expect(field.value).toBe(original);
  });
});

describe("an online room", () => {
  it("opens on the room's shape, then the invitation for the host", async () => {
    at("#/oda/K7Q2XM");
    expect(screen.getByText("Oda açılıyor…")).toBeTruthy();
    const socket = roomSocket();
    socket.receive({ t: "room", room: roomInfo({ phase: "waiting", host: 0, seats: [{ name: GUEST, online: true }, null] }), table: null });
    const invite = screen.getByRole("region", { name: "Davet" });
    expect((within(invite).getByRole("textbox", { name: "Davet linki" }) as HTMLInputElement).value).toBe(
      `${window.location.origin}${window.location.pathname}#/oda/K7Q2XM`,
    );
    expect(within(invite).getByRole("img", { name: "Oda kodu: K 7 Q 2 X M" })).toBeTruthy();
    expect(within(invite).getByRole("link", { name: /WhatsApp/ }).getAttribute("href")).toMatch(/^https:\/\/wa\.me\/\?text=.*oda%2FK7Q2XM$/);
    expect(within(invite).getByText("Arkadaşın katılınca oyun başlar; bu sayfayı kapatabilirsin.")).toBeTruthy();
    // No rack to play from yet.
    expect(screen.queryByRole("group", { name: "Harflerin" })).toBeNull();

    fireEvent.click(within(invite).getByRole("button", { name: "Daveti geri al" }));
    fireEvent.click(within(invite).getByRole("button", { name: "Geri al" }));
    expect(socket.of("cancel")).toHaveLength(1);
    expect(window.location.hash).toBe("#/cevrimici");
  });

  it("asks a visitor to join, and joins", () => {
    at("#/oda/K7Q2XM");
    const socket = roomSocket();
    socket.receive({ t: "room", room: roomInfo({ phase: "waiting", you: null, host: 1, seats: [null, { name: HOST, online: true }] }), table: null });
    const card = screen.getByRole("region", { name: "Davet" });
    expect(card.textContent).toContain(`${HOST} seninle oynamak istiyor`);
    fireEvent.click(within(card).getByRole("button", { name: "Oyuna katıl" }));
    expect(socket.of("join")).toHaveLength(1);
    expect(within(card).getByRole("link", { name: "Vazgeç" }).getAttribute("href")).toBe("#/cevrimici");
  });

  it("plays: the rack, the other player's name, whose turn, and a dropped line", async () => {
    at("#/oda/K7Q2XM");
    const socket = roomSocket();
    socket.receive({ t: "room", room: roomInfo(), table: tableFor(0, "kalemat", 1) });
    await screen.findByRole("group", { name: "Harflerin" });
    expect(screen.getAllByText("Neşeli Kirpi").length).toBeGreaterThan(0);
    expect(screen.getByText("Sıra Neşeli Kirpi'de. Kapatabilirsin; oyun seni bekler.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pes et" })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Oyunlara dön" }).length).toBeGreaterThan(0);

    socket.drop();
    // Said only once the line has stayed down a moment: a quick reconnect doesn't flash it.
    expect(screen.queryByText(/Bağlantı koptu/)).toBeNull();
    expect(await screen.findByText(/Bağlantı koptu, yeniden bağlanıyor/, {}, { timeout: 3000 })).toBeTruthy();
  });

  it("titles a hidden tab when it's your turn, and puts the title back", () => {
    document.title = "harfiyen — Türkçe kelime oyunu";
    at("#/oda/K7Q2XM");
    const socket = roomSocket();
    socket.receive({ t: "room", room: roomInfo(), table: tableFor(0) });
    expect(document.title).toBe("harfiyen — Türkçe kelime oyunu");
    hidden = true;
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(document.title).toBe("(Sıra sende) harfiyen");
    hidden = false;
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(document.title).toBe("harfiyen — Türkçe kelime oyunu");
  });

  it("at the end, offers a rematch, and says when the other asked first", () => {
    at("#/oda/K7Q2XM");
    const socket = roomSocket();
    const over = { reason: "resign", winner: 0, leftovers: [0, 0] };
    const table = { ...(tableFor(0) as object), over, log: [{ player: 1, kind: "resign" }] };
    socket.receive({ t: "room", room: roomInfo({ phase: "over" }), table });
    fireEvent.click(screen.getByRole("button", { name: /Rövanş iste/ }));
    expect(socket.of("rematch")).toHaveLength(1);
    socket.receive({ t: "room", room: roomInfo({ phase: "over", rematch: [false, true] }), table });
    expect(screen.getByRole("button", { name: /Rövanşı kabul et/ })).toBeTruthy();
    expect(screen.getByText("Neşeli Kirpi rövanş istiyor.")).toBeTruthy();
    socket.receive({ t: "room", room: roomInfo({ phase: "over", rematch: [true, false] }), table });
    expect((screen.getByRole("button", { name: /Rövanş istendi/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("explains a room that's gone, and leads back", () => {
    at("#/oda/K7Q2XM");
    const socket = roomSocket();
    socket.receive({ t: "error", code: "yok" });
    expect(screen.getByRole("alert").textContent).toContain("Bu oda bulunamadı");
    expect(screen.getByRole("link", { name: "Oyunlarına dön" }).getAttribute("href")).toBe("#/cevrimici");
  });

  it("a game that began without this device: the room is full", () => {
    at("#/oda/K7Q2XM");
    const socket = roomSocket();
    socket.receive({ t: "room", room: roomInfo({ you: null }), table: null });
    expect(screen.getByRole("alert").textContent).toContain("Bu oda dolu");
  });
});
