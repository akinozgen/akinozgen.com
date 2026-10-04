import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { dailyRound, endlessRound, puzzleNumber } from "@babelle/data/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";
import { language } from "../src/game/data.ts";
import { playDate } from "../src/game/useBabelle.ts";
import { render } from "./helpers.tsx";
import { TEST_SEED } from "./setup.ts";

const daily = await dailyRound(TEST_SEED, puzzleNumber(playDate())!);
const ROUND = 31337;
const practice = await endlessRound(TEST_SEED, ROUND);
const stats = (key: string) => JSON.parse(localStorage.getItem(key) ?? "null");

async function playThrough(correct: readonly number[], answer: string, nextLabel: RegExp): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await screen.findByText(`Question ${i + 1} of 5`);
    fireEvent.click(document.querySelectorAll<HTMLButtonElement>(".option")[correct[i]]);
    fireEvent.click(await screen.findByRole("button", { name: i < 4 ? "Next" : "Name the language" }));
  }
  const name = language(answer).names.en;
  fireEvent.change(await screen.findByLabelText("Guess a language"), { target: { value: name } });
  fireEvent.click(await screen.findByRole("button", { name }));
  await screen.findByRole("button", { name: nextLabel });
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("babelle:seen-rules:v1", "true");
  localStorage.setItem("babelle:endless:v1", JSON.stringify({ round: ROUND, answers: [], guesses: [] }));
  window.location.hash = "";
});
afterEach(cleanup);

describe("endless", () => {
  it("stays shut, and silent, until today is done", async () => {
    const calls = vi.spyOn(globalThis, "fetch");
    render(<App />);
    await screen.findByText("Question 1 of 5");
    fireEvent.click(screen.getByRole("button", { name: "Endless" }));
    expect(await screen.findByText("Endless opens after today's language")).toBeTruthy();
    // Nothing was asked of the endless endpoint while it was locked.
    expect(calls.mock.calls.some(([url]) => String(url).includes("/endless"))).toBe(false);
    calls.mockRestore();
  });

  it("opens once the day is over, keeps its own record, and deals the next round", async () => {
    render(<App />);
    await playThrough(daily.correct, daily.language.id, /Share result/);
    const dailyStats = stats("babelle:stats:v1");
    expect(dailyStats.played).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Endless" }));
    expect(await screen.findByText("Endless · round 1")).toBeTruthy();
    await playThrough(practice.correct, practice.language.id, /Next language/);
    expect(stats("babelle:endless-stats:v1").won).toBe(1);
    expect(stats("babelle:stats:v1")).toEqual(dailyStats);

    fireEvent.click(screen.getByRole("button", { name: /Next language/ }));
    expect(await screen.findByText("Endless · round 2")).toBeTruthy();
    expect(await screen.findByText("Question 1 of 5")).toBeTruthy();
    await waitFor(() => expect(stats("babelle:endless:v1").round).not.toBe(ROUND));
    expect(document.querySelectorAll(".notebook__entry").length).toBe(0);
  });
});
