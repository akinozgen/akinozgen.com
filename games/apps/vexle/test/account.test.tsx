import { resetAccountCache, resetRecordsCache } from "@akinozgen/account/client";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { dailyRound, handleVexle, puzzleNumber } from "@vexle/data/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { type FakeAccount, fakeAccount, finished } from "../../../packages/core/test/fakeAccount.ts";
import { vexleRules } from "../../../packages/vexle/src/record.ts";
import { App } from "../src/App.tsx";
import { COUNTRIES, country } from "../src/game/countries.ts";
import { render } from "./helpers.tsx";
import { loadPack, TEST_SEED } from "./setup.ts";

/** A signed-in player: the round and the record are the account's, kept by the (fake) server. */

const DAY = "2026-10-10";
const BEFORE = "2026-10-09";
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${DAY}T12:00:00`));
});
afterAll(() => vi.useRealTimers());

const { answer } = await dailyRound(TEST_SEED, puzzleNumber(DAY)!);
const misses = COUNTRIES.filter((c) => c.code !== answer).slice(0, 4);

let server: FakeAccount;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("vexle:seen-rules:v1", "true");
  resetAccountCache();
  resetRecordsCache();
  server = fakeAccount({ game: "vexle", rules: vexleRules, judge: (action, query) => handleVexle(action, query, TEST_SEED, loadPack) });
  vi.stubGlobal("fetch", server.fetch);
});
afterEach(cleanup);

/** Rolls the die and waits for the box to take a guess. */
async function roll(): Promise<void> {
  fireEvent.click(await screen.findByRole("button", { name: "Roll the die" }));
  await waitFor(() => expect((screen.getByLabelText("Guess a country") as HTMLInputElement).readOnly).toBe(false), { timeout: 3000 });
}

const rows = (): string[] =>
  Array.from(document.querySelector(".rows")?.querySelectorAll<HTMLElement>(".row--filled") ?? [], (row) => row.textContent ?? "");

/** A number in a record on the page, by its label. */
const stat = (label: string, root: ParentNode = document): string | null | undefined =>
  Array.from(root.querySelectorAll(".stats dt")).find((dt) => dt.textContent === label)?.nextElementSibling?.textContent;

describe("signed in", () => {
  it("takes up a round begun on another device", async () => {
    server.plays.set(`d:${DAY}`, { moves: { g: [misses[0].code], hard: false }, result: null, startedAt: 1, finishedAt: null });
    render(<App />);
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toContain(misses[0].names.en);
    expect(screen.queryByRole("button", { name: "Roll the die" })).toBeNull();
    expect(screen.getByText("Guess 2 of 5")).toBeTruthy();
  });

  it("shows a round finished elsewhere as finished, and the record as the server's", async () => {
    localStorage.setItem("vexle:stats:v1", JSON.stringify({ played: 99, won: 99, streak: 99, best: 99, hardWins: 99, distribution: [99, 0, 0, 0, 0, 0], lastNumber: null, lastWon: null }));
    server.imported = { stats: { daily: null, endless: null }, importedAt: 1 };
    server.plays.set(`d:${BEFORE}`, finished({ g: ["FR", "DE", "IT"], hard: true }, { won: true, guesses: 3, hard: true }, 10, 20));
    server.plays.set(`d:${DAY}`, finished({ g: [misses[0].code, answer], hard: false }, { won: true, guesses: 2, hard: false }, 30, 40));
    render(<App />);
    await waitFor(() => expect(stat("Played")).toBe("2"));
    expect(stat("Win %")).toBe("100");
    expect(stat("Streak")).toBe("2");
    expect(stat("Hard wins")).toBe("1");
    expect(rows().length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/imported from this device/)).toBeNull();
  });

  it("keeps each guess and the mode it was made in, and the result once the round is over", async () => {
    localStorage.setItem("vexle:hard:v1", "true");
    render(<App />);
    await roll();
    fireEvent.change(screen.getByLabelText("Guess a country"), { target: { value: country(answer).names.en } });
    fireEvent.click(await screen.findByRole("button", { name: country(answer).names.en }));
    await waitFor(() => expect(server.plays.get(`d:${DAY}`)?.result).toEqual({ won: true, guesses: 1, hard: true }));
    await waitFor(() => expect(stat("Hard wins")).toBe("1"));
  });

  it("sends this device's record once, counts on from it, and says so", async () => {
    const before = { played: 5, won: 4, streak: 0, best: 3, hardWins: 1, distribution: [1, 1, 2, 0, 0, 0], lastNumber: 2, lastWon: 2 };
    localStorage.setItem("vexle:stats:v1", JSON.stringify(before));
    server.plays.set(`d:${DAY}`, finished({ g: [answer], hard: false }, { won: true, guesses: 1, hard: false }, 30, 40));
    const page = render(<App />);
    await waitFor(() => expect(server.imported).not.toBeNull());
    expect(server.imported?.stats).toEqual({ daily: before, endless: null });
    fireEvent.click(screen.getByRole("button", { name: "Statistics" }));
    const sheet = await screen.findByRole("dialog");
    await waitFor(() => expect(stat("Played", sheet)).toBe("6"));
    expect(stat("Best", sheet)).toBe("3");
    expect(within(sheet).getByText("Games imported from this device: 5")).toBeTruthy();

    page.unmount();
    resetRecordsCache();
    render(<App />);
    await waitFor(() => expect(server.calls.filter((call) => call.startsWith("/api/hesap/kayitlar")).length).toBeGreaterThanOrEqual(3));
    expect(server.imports).toHaveLength(1);
  });
});

describe("signed out", () => {
  it("plays and keeps its record in the browser, as before accounts", async () => {
    server.signedIn = false;
    localStorage.setItem("vexle:stats:v1", JSON.stringify({ played: 7, won: 7, streak: 0, best: 7, hardWins: 0, distribution: [7, 0, 0, 0, 0, 0], lastNumber: null, lastWon: null }));
    render(<App />);
    await roll();
    fireEvent.change(screen.getByLabelText("Guess a country"), { target: { value: country(answer).names.en } });
    fireEvent.click(await screen.findByRole("button", { name: country(answer).names.en }));
    await waitFor(() => expect(stat("Played")).toBe("8"));
    expect(server.plays.size).toBe(0);
    expect(server.calls.some((call) => call.startsWith("/api/hesap/kayitlar"))).toBe(false);
  });
});
