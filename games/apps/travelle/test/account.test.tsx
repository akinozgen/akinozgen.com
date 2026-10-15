import { resetAccountCache, resetRecordsCache } from "@akinozgen/account/client";
import { borderGraph } from "@travelle/geo";
import type { DailyPuzzle } from "@travelle/geo/client";
import { handleTravelle } from "@travelle/geo/server";
import { travelleRules } from "../../../packages/geo/src/server/record.ts";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type FakeAccount, fakeAccount, finished } from "../../../packages/core/test/fakeAccount.ts";
import { App } from "../src/App.tsx";
import { todayDate } from "../src/game/puzzle.ts";
import { dayOf } from "../src/game/records.ts";
import { render } from "./helpers.tsx";
import { TEST_SEED } from "./setup.ts";

/** A signed-in player: the round and the record are the account's, kept by the (fake) server. */

const graph = borderGraph();
const date = todayDate();
const puzzle = (await handleTravelle("daily", new URLSearchParams({ date }), TEST_SEED)).body as DailyPuzzle;
const route = graph.solve(puzzle.start, puzzle.end).path;
const yesterday = new Date(Date.parse(`${date}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

let server: FakeAccount;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.location.hash = "";
  resetAccountCache();
  resetRecordsCache();
  server = fakeAccount({
    game: "travelle",
    rules: travelleRules,
    judge: (action, query) => handleTravelle(action, query, TEST_SEED),
  });
  vi.stubGlobal("fetch", server.fetch);
});
afterEach(cleanup);

const guessEntries = (): string[] =>
  Array.from(document.querySelectorAll<HTMLLIElement>(".guesses .guess"), (li) => li.textContent ?? "");

/** A number in the end panel's record, by its label. */
const stat = (label: string): string | null | undefined =>
  Array.from(document.querySelectorAll(".stats dt")).find((dt) => dt.textContent === label)?.nextElementSibling?.textContent;

describe("signed in", () => {
  it("takes up a round begun on another device", async () => {
    server.plays.set(`d:${date}`, { moves: { g: [route[0]], h: ["neighbours"], s: false }, result: null, startedAt: 1, finishedAt: null });
    render(<App />);
    await waitFor(() => expect(guessEntries()).toHaveLength(1));
    expect(guessEntries()[0]).toContain(graph.region(route[0]).names.en);
    expect(screen.getByText("Hints").parentElement?.textContent).toContain("1/4");
    // And this device remembers it as it is on the record.
    const saved = JSON.parse(localStorage.getItem(`travle:game:v3:daily:${puzzle.number}`)!);
    expect(saved.guesses).toEqual([route[0]]);
  });

  it("shows a round finished elsewhere as finished, and the record as the server's", async () => {
    // This device's own record says something else entirely; it was imported long ago.
    localStorage.setItem("travle:stats:v1", JSON.stringify({ played: 99, won: 99, perfect: 99, streak: 99, bestStreak: 99, lastDay: null }));
    server.imported = { stats: { daily: null, endless: null }, importedAt: 1 };
    server.plays.set(`d:${yesterday}`, finished({ g: [], h: [], s: true }, { won: false, guesses: 0, perfect: false, hints: 0 }, 10, 20));
    server.plays.set(
      `d:${date}`,
      finished({ g: route, h: [], s: false }, { won: true, guesses: route.length, perfect: true, hints: 0 }, 30, 40),
    );
    render(<App />);
    await screen.findByRole("heading", { name: /Perfect/ });
    await waitFor(() => expect(stat("Played")).toBe("2"));
    expect(stat("Solved")).toBe("1");
    expect(stat("Perfect")).toBe("1");
    expect(stat("Streak")).toBe("1");
    expect(screen.queryByText(/imported from this device/)).toBeNull();
  });

  it("keeps each guess on the record, and the result once the round is over", async () => {
    render(<App />);
    await screen.findByLabelText("Guess a country");
    await waitFor(() => expect(server.plays.get(`d:${date}`)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Give up" }));
    await screen.findByText(/Next travelle in/);
    expect(server.plays.get(`d:${date}`)).toMatchObject({ moves: { g: [], h: [], s: true }, result: { won: false } });
    await waitFor(() => expect(stat("Played")).toBe("1"));
  });

  it("sends this device's record once, counts on from it, and says so", async () => {
    const before = { played: 3, won: 2, perfect: 1, streak: 1, bestStreak: 2, lastDay: dayOf(date) - 4 };
    localStorage.setItem("travle:stats:v1", JSON.stringify(before));
    const page = render(<App />);
    await waitFor(() => expect(server.imported).not.toBeNull());
    expect(server.imported?.stats).toEqual({ daily: before, endless: null });

    fireEvent.click(await screen.findByRole("button", { name: "Give up" }));
    await screen.findByText(/Next travelle in/);
    await waitFor(() => expect(stat("Played")).toBe("4"));
    expect(stat("Solved")).toBe("2");
    expect(stat("Best")).toBe("2");
    expect(screen.getByText("Games imported from this device: 3")).toBeTruthy();

    // The next visit finds it on the record and sends nothing.
    page.unmount();
    resetRecordsCache();
    render(<App />);
    await screen.findByText("Games imported from this device: 3");
    expect(server.imports).toHaveLength(1);
  });
});

describe("signed out", () => {
  it("plays and keeps its record in the browser, as before accounts", async () => {
    server.signedIn = false;
    localStorage.setItem("travle:stats:v1", JSON.stringify({ played: 7, won: 7, perfect: 0, streak: 0, bestStreak: 7, lastDay: null }));
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Give up" }));
    await screen.findByText(/Next travelle in/);
    await waitFor(() => expect(stat("Played")).toBe("8"));
    expect(server.plays.size).toBe(0);
    expect(server.calls.some((call) => call.startsWith("/api/hesap/kayitlar"))).toBe(false);
  });
});
