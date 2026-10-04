import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { dailyRound, puzzleNumber } from "@vexle/data/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import { COUNTRIES, country } from "../src/game/countries.ts";
import { localDate } from "../src/game/useVexle.ts";
import { render } from "./helpers.tsx";
import { TEST_SEED } from "./setup.ts";

const { answer } = await dailyRound(TEST_SEED, puzzleNumber(localDate())!);
const wrong = COUNTRIES.filter((c) => c.code !== answer).map((c) => c.names.en);

/** The first list of guesses on the page (a finished round shows it twice, one per layout). */
const rows = (): HTMLElement[] =>
  Array.from(document.querySelector(".rows")?.querySelectorAll<HTMLElement>(".row--filled") ?? []);
const openTiles = (): number => document.querySelectorAll(".tile.is-open").length;

async function guess(name: string): Promise<void> {
  const before = rows().length;
  const input = screen.getByLabelText("Guess a country");
  fireEvent.change(input, { target: { value: name } });
  fireEvent.click(await screen.findByRole("button", { name }));
  await waitFor(() => expect(rows().length).toBe(before + 1));
}

/** What the share button puts on the clipboard. */
async function shared(): Promise<string> {
  let copied = "";
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (text: string) => void (copied = text) },
  });
  fireEvent.click(await screen.findByRole("button", { name: "Share result" }));
  await screen.findByRole("button", { name: "Copied" });
  return copied;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("vexle:seen-rules:v1", "true");
});
afterEach(cleanup);

describe("vexle", () => {
  it("starts with every tile covered and the compass asleep", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "vexle" })).toBeTruthy();
    expect(openTiles()).toBe(0);
    expect(document.querySelector(".compass.is-idle")).toBeTruthy();
    expect(screen.getByText("Make a guess to open the first tile")).toBeTruthy();
  });

  it("opens one tile per wrong guess and wakes the needle", async () => {
    render(<App />);
    await guess(wrong[0]);
    expect(openTiles()).toBe(1);
    expect(document.querySelector(".compass.is-idle")).toBeNull();
    expect(document.querySelectorAll(".compass__dot").length).toBe(1);

    await guess(wrong[1]);
    expect(openTiles()).toBe(2);
    expect(rows()[1].textContent).toContain(wrong[1]);
    expect(rows()[1].textContent).toMatch(/km/);
  });

  it("never puts the answer's name on the page before the end", async () => {
    render(<App />);
    await guess(wrong[0]);
    const page = document.body.innerHTML;
    expect(page).not.toContain(`>${country(answer).names.en}<`);
  });

  it("shows the whole flag, the answer and the record on a win", async () => {
    render(<App />);
    await guess(wrong[0]);
    await guess(country(answer).names.en);
    expect(await screen.findByText(/Got it in 2\/6/)).toBeTruthy();
    expect(openTiles()).toBe(6);
    expect(document.querySelector(".board.is-whole")).toBeTruthy();
    expect(document.querySelector(".compass.is-won")).toBeTruthy();
    expect(screen.getByRole("heading", { name: new RegExp(country(answer).names.en) })).toBeTruthy();
    const text = await shared();
    expect(text).toMatch(/^vexle #\d+ 2\/6\n/);
    expect(text).not.toContain("hard mode");
  });

  it("ends the round after six misses", async () => {
    render(<App />);
    for (const name of wrong.slice(0, 6)) await guess(name);
    expect(await screen.findByText("Out of guesses")).toBeTruthy();
    expect(await shared()).toMatch(/^vexle #\d+ X\/6\n/);
  });

  it("marks a round played in hard mode from the start", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("switch", { name: "Hard mode" }));
    await guess(wrong[0]);
    await guess(country(answer).names.en);
    expect(await shared()).toMatch(/2\/6 · hard mode/);
  });

  it("forfeits the mark when hard mode is switched off mid-round", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("switch", { name: "Hard mode" }));
    await guess(wrong[0]);
    fireEvent.click(screen.getByRole("switch", { name: "Hard mode" }));
    await waitFor(() => expect(document.querySelector(".row__dots")).toBeNull());
    await guess(country(answer).names.en);
    const share = await shared();
    expect(share).toMatch(/vexle #\d+ 2\/6/);
    expect(share).not.toContain("hard mode");
  });

  it("refuses a country already guessed", async () => {
    render(<App />);
    await guess(wrong[0]);
    const input = screen.getByLabelText("Guess a country");
    fireEvent.change(input, { target: { value: wrong[0] } });
    fireEvent.submit(input.closest("form")!);
    expect(await screen.findByText(`${wrong[0]} is already on your list.`)).toBeTruthy();
  });

  it("finds a country typed in another language", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Guess a country"), { target: { value: "Almanya" } });
    expect(await screen.findByRole("button", { name: "Germany" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Guess a country"), { target: { value: "Германия" } });
    expect(await screen.findByRole("button", { name: "Germany" })).toBeTruthy();
  });

  it("offers the name in the language being played first", async () => {
    render(<App />);
    // Algeria is "Argelia" in Spanish; an English player typing "arg" means Argentina.
    fireEvent.change(screen.getByLabelText("Guess a country"), { target: { value: "arg" } });
    const list = await screen.findByRole("listbox");
    const options = within(list).getAllByRole("option").map((option) => option.textContent);
    expect(options[0]).toBe("Argentina");
    expect(options).toContain("Algeria");
  });

  it("remembers the round across a reload", async () => {
    const first = render(<App />);
    await guess(wrong[0]);
    first.unmount();
    render(<App />);
    expect(rows().length).toBe(1);
    expect(openTiles()).toBe(1);
  });
});
