import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { dailyRound, puzzleNumber } from "@babelle/data/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import { language } from "../src/game/data.ts";
import { playDate } from "../src/game/useBabelle.ts";
import { render } from "./helpers.tsx";
import { TEST_SEED } from "./setup.ts";

const round = await dailyRound(TEST_SEED, puzzleNumber(playDate())!);
const answer = language(round.language.id).names.en;
const wrongLanguages = ["English", "Japanese", "Finnish", "Arabic"].filter((n) => n !== answer);

async function answerAll(right: boolean): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await screen.findByText(`Question ${i + 1} of 5`);
    const options = document.querySelectorAll<HTMLButtonElement>(".option");
    const pick = right ? round.correct[i] : (round.correct[i] + 1) % 4;
    fireEvent.click(options[pick]);
    const next = await screen.findByRole("button", { name: i < 4 ? "Next" : "Name the language" });
    fireEvent.click(next);
  }
  await screen.findByText("Which language is it?");
}

async function guess(name: string): Promise<void> {
  const before = document.querySelectorAll(".row--filled").length;
  fireEvent.change(screen.getByLabelText("Guess a language"), { target: { value: name } });
  fireEvent.click(await screen.findByRole("button", { name }));
  await waitFor(() => expect(document.querySelectorAll(".row--filled").length).toBe(before + 1));
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("babelle:seen-rules:v1", "true");
});
afterEach(cleanup);

describe("babelle", () => {
  it("opens on the first question with an empty notebook", async () => {
    render(<App />);
    expect(await screen.findByText("Question 1 of 5")).toBeTruthy();
    expect(document.querySelectorAll(".option").length).toBe(4);
    expect(screen.getByText("Words you meet in today's language collect here.")).toBeTruthy();
  });

  it("marks the answer, fills the notebook and waits for Next", async () => {
    render(<App />);
    await screen.findByText("Question 1 of 5");
    fireEvent.click(document.querySelectorAll<HTMLButtonElement>(".option")[round.correct[0]]);
    expect(await screen.findByText("Right")).toBeTruthy();
    expect(document.querySelector(".option.is-right")).toBeTruthy();
    expect(document.querySelectorAll(".notebook__entry").length).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Question 2 of 5")).toBeTruthy();
  });

  it("never names the language before the end", async () => {
    render(<App />);
    await answerAll(true);
    expect(document.body.textContent).not.toContain(`Today's language${answer}`);
    expect(document.querySelector(".end")).toBeNull();
  });

  it("names it, reveals it and counts the day", async () => {
    render(<App />);
    await answerAll(true);
    await guess(wrongLanguages[0]);
    expect(document.querySelector(".row__family")).toBeTruthy();
    await guess(answer);
    expect(await screen.findByText("Named it in 2/3")).toBeTruthy();
    expect(screen.getByRole("heading", { name: new RegExp(answer) })).toBeTruthy();
    expect(screen.getByText(/5\/5 cards right/)).toBeTruthy();
  });

  it("ends after three misses", async () => {
    render(<App />);
    await answerAll(false);
    for (const name of wrongLanguages.slice(0, 3)) await guess(name);
    expect(await screen.findByText("Out of tries")).toBeTruthy();
    expect(screen.getByText(/0\/5 cards right/)).toBeTruthy();
  });

  it("remembers the day across a reload", async () => {
    const first = render(<App />);
    await screen.findByText("Question 1 of 5");
    fireEvent.click(document.querySelectorAll<HTMLButtonElement>(".option")[0]);
    await screen.findByRole("button", { name: "Next" });
    first.unmount();
    render(<App />);
    expect(await screen.findByText("Question 2 of 5")).toBeTruthy();
    expect(document.querySelectorAll(".notebook__entry").length).toBe(1);
  });
});
