import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { dailyRound, endlessRound, puzzleNumber } from "@vexle/data/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import { COUNTRIES, country } from "../src/game/countries.ts";
import { localDate } from "../src/game/useVexle.ts";
import { render } from "./helpers.tsx";
import { TEST_SEED } from "./setup.ts";

const { answer: dailyAnswer } = await dailyRound(TEST_SEED, puzzleNumber(localDate())!);
const ROUND = 4242;
const { answer: endlessAnswer } = await endlessRound(TEST_SEED, ROUND);

const rows = (): HTMLElement[] =>
  Array.from(document.querySelector(".rows")?.querySelectorAll<HTMLElement>(".row--filled") ?? []);

async function guess(name: string): Promise<void> {
  const before = rows().length;
  fireEvent.change(screen.getByLabelText("Guess a country"), { target: { value: name } });
  fireEvent.click(await screen.findByRole("button", { name }));
  await waitFor(() => expect(rows().length).toBe(before + 1));
}

const stats = (key: string) => JSON.parse(localStorage.getItem(key) ?? "null");

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("vexle:seen-rules:v1", "true");
  // A known round, so the test knows its answer.
  localStorage.setItem("vexle:endless:v1", JSON.stringify({ round: ROUND, guesses: [], hardAll: true }));
  window.location.hash = "";
});
afterEach(cleanup);

describe("endless", () => {
  it("stays shut until today's flag is done, so it can't spoil it", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Endless" }));
    expect(await screen.findByText("Endless opens after today's flag")).toBeTruthy();
    expect(screen.queryByLabelText("Guess a country")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Play today's flag" }));
    expect(await screen.findByLabelText("Guess a country")).toBeTruthy();
  });

  it("opens once the daily is over, and keeps its record apart", async () => {
    render(<App />);
    await guess(country(dailyAnswer).names.en);
    await screen.findByText(/Got it in 1\/6|First try/);
    const dailyStats = stats("vexle:stats:v1");
    expect(dailyStats.played).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Endless" }));
    expect(await screen.findByText("Endless · round 1")).toBeTruthy();
    const wrong = COUNTRIES.find((c) => c.code !== endlessAnswer && c.code !== dailyAnswer)!.names.en;
    await guess(wrong);
    await guess(country(endlessAnswer).names.en);
    expect(await screen.findByRole("button", { name: "Next flag" })).toBeTruthy();

    // The endless win went to its own record; the daily one is untouched.
    expect(stats("vexle:endless-stats:v1").won).toBe(1);
    expect(stats("vexle:stats:v1")).toEqual(dailyStats);
    // And endless has no share button: it is practice, not the day's score.
    expect(screen.queryByRole("button", { name: "Share result" })).toBeNull();
  });

  it("deals a fresh round after each one", async () => {
    render(<App />);
    await guess(country(dailyAnswer).names.en);
    fireEvent.click(screen.getByRole("button", { name: "Endless" }));
    await guess(country(endlessAnswer).names.en);
    fireEvent.click(await screen.findByRole("button", { name: "Next flag" }));
    await screen.findByText("Endless · round 2");
    expect(rows().length).toBe(0);
    expect(document.querySelectorAll(".tile.is-open").length).toBe(0);
    expect(stats("vexle:endless:v1").round).not.toBe(ROUND);
  });
});
