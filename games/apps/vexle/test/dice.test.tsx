import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { dailyRound, puzzleNumber } from "@vexle/data/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";
import { COUNTRIES } from "../src/game/countries.ts";
import { render } from "./helpers.tsx";
import { TEST_SEED } from "./setup.ts";

// Day 3, under the five-guess rules. Only Date is faked; timers run for real.
const DAY = "2026-10-06";
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${DAY}T12:00:00`));
});
afterAll(() => vi.useRealTimers());

const { answer, order } = await dailyRound(TEST_SEED, puzzleNumber(DAY)!);
const wrong = COUNTRIES.filter((c) => c.code !== answer).map((c) => c.names.en);
const openTiles = (): Element[] => Array.from(document.querySelectorAll(".tile.is-open"));
const rows = (): Element[] =>
  Array.from(document.querySelector(".rows")?.querySelectorAll(".row--filled") ?? []);

async function guess(name: string): Promise<void> {
  const before = rows().length;
  fireEvent.change(screen.getByLabelText("Guess a country"), { target: { value: name } });
  fireEvent.click(await screen.findByRole("button", { name }));
  await waitFor(() => expect(rows().length).toBe(before + 1));
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("vexle:seen-rules:v1", "true");
});
afterEach(cleanup);

describe("the die and five guesses", () => {
  it("holds the first tile back until the die is rolled, then opens the server's tile", async () => {
    render(<App />);
    const die = await screen.findByRole("button", { name: "Roll the die" });
    expect(openTiles().length).toBe(0);
    const box = screen.getByLabelText("Guess a country") as HTMLInputElement;
    expect(box.readOnly).toBe(true);
    expect(box.placeholder).toBe("Roll the die first…");

    fireEvent.click(die);
    await waitFor(() => expect(openTiles().length).toBe(1), { timeout: 3000 });
    // The tile that opened is the one the server put first, for everyone.
    expect(openTiles()[0].getAttribute("aria-label")).toBe(`Tile ${order[0] + 1}, open`);
    expect(screen.getByText("Guess 1 of 5")).toBeTruthy();
    expect(document.querySelectorAll(".rows .row").length).toBe(5);
  });

  it("remembers the roll across a reload", async () => {
    const first = render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Roll the die" }));
    await waitFor(() => expect(openTiles().length).toBe(1), { timeout: 3000 });
    first.unmount();
    render(<App />);
    await waitFor(() => expect(openTiles().length).toBe(1));
    expect(screen.queryByRole("button", { name: "Roll the die" })).toBeNull();
  });

  it("ends after five misses and shares the die's tile", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Roll the die" }));
    await waitFor(() => expect(openTiles().length).toBe(1), { timeout: 3000 });
    for (const name of wrong.slice(0, 5)) await guess(name);
    expect(await screen.findByText("Out of guesses")).toBeTruthy();
    let copied = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => void (copied = text) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Share result" }));
    await screen.findByRole("button", { name: "Copied" });
    expect(copied).toMatch(/^vexle #3 X\/5\n/);
    expect(copied).toContain("🎲");
  });
});
