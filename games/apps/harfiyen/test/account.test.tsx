import { type History, PROTOCOL } from "@harfiyen/engine";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";
import { HISTORY_SHOWN } from "../src/components/History.tsx";
import { loadLexicons } from "../src/game/lexicons.ts";
import { rememberGame } from "../src/game/myGames.ts";
import { account, api, FakeSocket, HOST, ME, roomInfo, signedInAs, summary } from "./fakes.ts";

/**
 * Online play with the site's accounts: the sign-in a signed-out player is
 * offered (and what happens once they take it), the account's record, and
 * the one-time move of a browser's games from before accounts.
 */

// The sheet itself is the account package's, tested there; here, only that it's asked for.
const sheet = vi.hoisted(() => ({ opened: 0 }));
vi.mock("@akinozgen/account/client", async (importOriginal) => {
  const real = await importOriginal<typeof import("@akinozgen/account/client")>();
  return {
    ...real,
    openAccountSheet: () => {
      sheet.opened++;
    },
  };
});

beforeAll(async () => {
  await loadLexicons();
});

beforeEach(() => {
  sheet.opened = 0;
  localStorage.setItem("harfiyen:seen-rules:v1", "true");
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
});
afterEach(() => {
  window.location.hash = "";
});

function at(hash: string): void {
  window.location.hash = hash;
  render(<App />);
}

/** Every call one API path got, as the server read it. */
function record(path: string, answer: (body: Record<string, unknown>) => { status?: number; body: unknown }): Record<string, unknown>[] {
  const calls: Record<string, unknown>[] = [];
  api.set(`GET /api/harfiyen/${path}`, (body) => {
    calls.push(body);
    return answer(body);
  });
  return calls;
}

const signInCard = (title: string): Promise<HTMLElement> => screen.findByRole("region", { name: title });

describe("signed out", () => {
  it("the hub offers the sign-in instead, and asks the game's server nothing", async () => {
    localStorage.setItem("harfiyen:online:v1", JSON.stringify([{ code: "AAAAAA", added: 1, summary: summary("AAAAAA", { turn: 0 }) }]));
    const asked = record("ozet", () => ({ body: { rooms: [] } }));
    await signedInAs(null);
    at("#/cevrimici");
    const card = await signInCard("Çevrimiçi oynamak için giriş yap");
    expect(card.textContent).toContain("hangi cihazdan girersen gir seninle gelir");
    expect(within(card).getByRole("link", { name: "Bilgisayara karşı oyna" }).getAttribute("href")).toBe("#/");
    fireEvent.click(within(card).getByRole("button", { name: "Giriş yap" }));
    expect(sheet.opened).toBe(1);
    // Nothing of the list, nor its badge, while nobody is signed in.
    expect(screen.queryByRole("textbox", { name: "Adın" })).toBeNull();
    expect(screen.queryByLabelText(/oyunda sıra sende/)).toBeNull();
    expect(asked).toHaveLength(0);
  });

  it("a room's link shows the card with the room's code, and goes into the room once signed in", async () => {
    await signedInAs(null);
    at("#/oda/K7Q2XM");
    const card = await signInCard("Bu oyunu oynamak için giriş yap");
    expect(within(card).getByRole("img", { name: "Oda kodu: K 7 Q 2 X M" })).toBeTruthy();
    expect(FakeSocket.to("/ws/oda/K7Q2XM")).toHaveLength(0);
    fireEvent.click(within(card).getByRole("button", { name: "Giriş yap" }));
    expect(sheet.opened).toBe(1);

    // The sheet signs the player in; the room carries on by itself.
    await signedInAs(ME);
    expect(screen.queryByRole("region", { name: "Bu oyunu oynamak için giriş yap" })).toBeNull();
    const socket = FakeSocket.to("/ws/oda/K7Q2XM")[0];
    socket.accept();
    expect(socket.sent[0]).toEqual({ t: "hello", v: PROTOCOL });
    socket.receive({ t: "room", room: roomInfo({ phase: "waiting", you: null, host: 1, seats: [null, { name: HOST, online: true }] }), table: null });
    expect(screen.getByRole("button", { name: "Oyuna katıl" })).toBeTruthy();
  });

  it("a room whose socket finds no session shows the card, and opens again after signing in", async () => {
    at("#/oda/K7Q2XM");
    const socket = FakeSocket.to("/ws/oda/K7Q2XM")[0];
    socket.accept();
    socket.receive({ t: "room", room: roomInfo(), table: null });
    // The session ran out on the server's side.
    account.user = null;
    socket.receive({ t: "error", code: "oturum" });
    expect(await signInCard("Bu oyunu oynamak için giriş yap")).toBeTruthy();
    expect(socket.closed).toBe(true);
    // Said once: the line doesn't keep knocking.
    expect(FakeSocket.to("/ws/oda/K7Q2XM")).toHaveLength(1);

    await signedInAs(ME);
    await waitFor(() => expect(FakeSocket.to("/ws/oda/K7Q2XM")).toHaveLength(2));
  });

  it("an invitation the server turns away for want of a session shows the card", async () => {
    at("#/cevrimici");
    await screen.findByRole("textbox", { name: "Adın" });
    account.user = null;
    fireEvent.click(screen.getByRole("button", { name: /Arkadaşını çağır/ }));
    expect(await signInCard("Çevrimiçi oynamak için giriş yap")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("so does the lobby, looking for a random opponent", async () => {
    at("#/cevrimici");
    await screen.findByRole("textbox", { name: "Adın" });
    fireEvent.click(screen.getByRole("button", { name: /Rastgele rakip/ }));
    const lobby = FakeSocket.to("/ws/lobi")[0];
    lobby.accept();
    expect(lobby.sent[0]).toEqual({ t: "seek", v: PROTOCOL });
    account.user = null;
    lobby.receive({ t: "error", code: "oturum" });
    expect(await signInCard("Çevrimiçi oynamak için giriş yap")).toBeTruthy();
    expect(lobby.closed).toBe(true);
  });
});

const HOUR = 3_600_000;

function pastGames(n: number): History["games"] {
  const outcomes = ["won", "lost", "draw", "abandoned"] as const;
  return Array.from({ length: n }, (_, i) => ({
    code: `PAST${String.fromCharCode(65 + i)}${String.fromCharCode(65 + i)}`,
    gameNo: 1,
    opponent: i === 1 ? null : HOST,
    you: 200 - i,
    them: 150 + i,
    outcome: outcomes[i % outcomes.length],
    endedAt: Date.now() - (i + 1) * HOUR,
  }));
}

describe("the account's record", () => {
  it("shows the totals and the latest games: who against, the score, how it ended, when", async () => {
    record("gecmis", () => ({ body: { history: { played: 6, won: 2, lost: 2, drawn: 2, games: pastGames(7) } } }));
    at("#/cevrimici");
    const card = await screen.findByRole("region", { name: "Geçmişin" });
    await waitFor(() => expect(within(card).getByText("Oynanan")).toBeTruthy());
    const cell = (label: string) => within(card).getByText(label, { selector: "dt" }).nextElementSibling!.textContent;
    expect([cell("Oynanan"), cell("Kazanılan"), cell("Kaybedilen"), cell("Berabere")]).toEqual(["6", "2", "2", "2"]);

    const rows = within(card).getAllByRole("listitem");
    expect(rows).toHaveLength(HISTORY_SHOWN);
    expect(rows[0].textContent).toContain("Neşeli Kirpi");
    expect(rows[0].textContent).toContain("1 sa önce");
    expect(rows[0].textContent).toContain("Kazandın");
    expect(within(rows[0]).getByLabelText("Sen 200, rakip 150")).toBeTruthy();
    expect(rows[1].textContent).toContain("Rakip");
    expect(rows[1].textContent).toContain("Kaybettin");
    expect(rows[2].textContent).toContain("Berabere");
    // Closed for want of moves: marked, not a result.
    expect(rows[3].textContent).toContain("Kapandı");

    fireEvent.click(within(card).getByRole("button", { name: "Tümünü göster (7)" }));
    expect(within(card).getAllByRole("listitem")).toHaveLength(7);
  });

  it("says so when there's nothing yet", async () => {
    record("gecmis", () => ({ body: { history: { played: 0, won: 0, lost: 0, drawn: 0, games: [] } } }));
    at("#/cevrimici");
    const card = await screen.findByRole("region", { name: "Geçmişin" });
    expect(await within(card).findByText(/Henüz biten bir oyunun yok/)).toBeTruthy();
    expect(within(card).queryByText("Oynanan")).toBeNull();
  });

  it("is asked for again once a game in the list has ended", async () => {
    const asked = record("gecmis", () => ({ body: { history: { played: 0, won: 0, lost: 0, drawn: 0, games: [] } } }));
    at("#/cevrimici");
    await waitFor(() => expect(asked).toHaveLength(1));
    act(() => rememberGame("AAAAAA", summary("AAAAAA", { phase: "over", turn: null, winner: 0, updatedAt: Date.now() }) as never));
    await waitFor(() => expect(asked).toHaveLength(2));
  });
});

const SECRET = "0123456789abcdef0123456789abcdef";
const roomLinks = (): string[] =>
  screen
    .getAllByRole("link")
    .map((link) => link.getAttribute("href") ?? "")
    .filter((href) => href.startsWith("#/oda/"))
    .sort();
const listOf = (...codes: string[]) => JSON.stringify(codes.map((code) => ({ code, added: 1, summary: null })));

describe("a browser that played before accounts", () => {
  it("moves its games to the account once: its codes, the old secret in a header; then the secret goes", async () => {
    localStorage.setItem("harfiyen:device:v1", SECRET);
    localStorage.setItem("harfiyen:name:v1", JSON.stringify("Eski Ad"));
    localStorage.setItem("harfiyen:online:v1", listOf("AAAAAA", "BBBBBB", "CCCCCC"));
    const order: string[] = [];
    const moved = record("bagla", () => {
      order.push("bagla");
      return { body: { codes: ["AAAAAA", "BBBBBB"] } };
    });
    const asked = record("ozet", () => {
      order.push("ozet");
      // The room the device couldn't take along isn't the account's.
      return { body: { rooms: [summary("AAAAAA", { turn: 0 }), summary("BBBBBB", { you: 1, turn: 0 }), summary("CCCCCC", { you: null })] } };
    });
    at("#/cevrimici");

    expect(await screen.findByText("Bu cihazdaki 2 oyun hesabına taşındı")).toBeTruthy();
    expect(moved).toEqual([{ v: PROTOCOL, codes: ["AAAAAA", "BBBBBB", "CCCCCC"], secret: SECRET }]);
    expect(order.slice(0, 2)).toEqual(["bagla", "ozet"]);
    expect(asked[0]).toEqual({ v: PROTOCOL, codes: ["AAAAAA", "BBBBBB", "CCCCCC"] });
    expect(localStorage.getItem("harfiyen:device:v1")).toBeNull();
    expect(localStorage.getItem("harfiyen:name:v1")).toBeNull();
    expect(localStorage.getItem("harfiyen:device-moved:v1")).not.toBeNull();
    await waitFor(() => expect(roomLinks()).toEqual(["#/oda/AAAAAA", "#/oda/BBBBBB"]));

    // The next refresh only asks for news.
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(asked).toHaveLength(2));
    expect(moved).toHaveLength(1);
  });

  it("asks nothing when there's nothing to move, and lets the old secret go", async () => {
    localStorage.setItem("harfiyen:device:v1", SECRET);
    const moved = record("bagla", () => ({ body: { codes: [] } }));
    const asked = record("ozet", () => ({ body: { rooms: [] } }));
    at("#/cevrimici");
    await waitFor(() => expect(asked).toHaveLength(1));
    expect(moved).toHaveLength(0);
    expect(localStorage.getItem("harfiyen:device:v1")).toBeNull();
    expect(screen.queryByText(/oyun hesabına taşındı/)).toBeNull();
  });

  it("waits for someone to sign in, and keeps it all for the next try when the move fails", async () => {
    localStorage.setItem("harfiyen:device:v1", SECRET);
    localStorage.setItem("harfiyen:online:v1", listOf("AAAAAA"));
    let up = false;
    const moved = record("bagla", () => (up ? { body: { codes: ["AAAAAA"] } } : { status: 503, body: { error: "kapali" } }));
    const asked = record("ozet", () => ({ body: { rooms: [summary("AAAAAA", { turn: 0 })] } }));
    await signedInAs(null);
    at("#/cevrimici");
    await signInCard("Çevrimiçi oynamak için giriş yap");
    expect(moved).toHaveLength(0);

    await signedInAs(ME);
    await waitFor(() => expect(moved).toHaveLength(1));
    // Nothing dropped while the move is still to come: the list isn't refreshed past it.
    expect(asked).toHaveLength(0);
    expect(localStorage.getItem("harfiyen:device:v1")).toBe(SECRET);
    expect(await screen.findByText("Liste güncellenemedi")).toBeTruthy();

    up = true;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(await screen.findByText("Bu cihazdaki 1 oyun hesabına taşındı")).toBeTruthy();
    expect(moved).toHaveLength(2);
    expect(localStorage.getItem("harfiyen:device:v1")).toBeNull();
  });
});
