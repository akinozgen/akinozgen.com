import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";
import { render } from "./helpers.tsx";

const DAY = "2026-10-06";

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${DAY}T12:00:00`));
});
afterAll(() => vi.useRealTimers());

beforeEach(() => {
  localStorage.clear();
  window.location.hash = "";
});

const seenRules = (): void => localStorage.setItem("sizele:seen-rules:v1", "true");

describe("the page", () => {
  it("opens with the rules, then the first round", async () => {
    render(<App />);
    const dialog = screen.getByRole("dialog", { name: "How to play" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Got it" }));
    expect(await screen.findByText("Round 1 of 5")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /How many times does .+ fit into .+\?/ })).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Your guess" })).toBeTruthy();
    expect(screen.getByRole("img", { name: /A Mercator map with/ })).toBeTruthy();
  });

  it("keeps endless locked until today's game is played", async () => {
    seenRules();
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /Endless/ }));
    expect(await screen.findByText("Endless opens after today's game")).toBeTruthy();
  });

  it("plays five rounds to a score, then opens endless", { timeout: 30_000 }, async () => {
    seenRules();
    render(<App />);
    for (let round = 1; round <= 5; round++) {
      await screen.findByText(`Round ${round} of 5`);
      fireEvent.change(screen.getByRole("slider", { name: "Your guess" }), { target: { value: String(400 + round * 50) } });
      fireEvent.click(screen.getByRole("button", { name: "Measure it" }));
      // The numbers wait for the true-size move to land.
      await screen.findByText(/^points?$/, {}, { timeout: 5000 });
      expect(screen.getByText("Real")).toBeTruthy();
      expect(screen.getByText("On the map")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: round < 5 ? /Next round/ : /See the score/ }));
    }
    expect(await screen.findByText("Today's score")).toBeTruthy();
    expect(screen.getByText("out of 500")).toBeTruthy();
    expect(screen.getByText("Next game in")).toBeTruthy();
    const record = JSON.parse(localStorage.getItem("sizele:stats:v1")!);
    expect(record).toMatchObject({ played: 1, streak: 1 });

    fireEvent.click(screen.getByRole("button", { name: "Endless" }));
    expect(await screen.findByText("Endless · set 1")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Round 1 of 5")).toBeTruthy());
  });

  it("keeps the names back in hard mode until the guess is in", { timeout: 15_000 }, async () => {
    seenRules();
    render(<App />);
    await screen.findByText("Round 1 of 5");
    fireEvent.click(screen.getByRole("switch", { name: "Hard mode" }));
    expect(screen.getByRole("heading", { name: "How many times does the blue country fit into the amber country?" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "A Mercator map with two unnamed countries" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Measure it" }));
    await screen.findByText(/^points?$/, {}, { timeout: 5000 });
    expect(screen.getByRole("heading", { name: /How many times does .+ fit into .+\?/ }).textContent).not.toContain("blue country");
  });

  it("speaks Turkish", async () => {
    seenRules();
    render(<App />);
    fireEvent.change(screen.getByRole("combobox", { name: "Language" }), { target: { value: "tr" } });
    expect(await screen.findByText("Tur 1 / 5")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /kaç .+ eder\?/ })).toBeTruthy();
  });
});
