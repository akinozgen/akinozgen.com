import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "./helpers.tsx";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import { graph } from "../src/game/puzzle.ts";

beforeEach(() => {
  localStorage.clear();
  window.location.hash = "";
});
afterEach(cleanup);

const openEndless = async (): Promise<void> => {
  fireEvent.click(screen.getByRole("button", { name: "Endless" }));
  fireEvent.click(await screen.findByRole("button", { name: "Setup" }));
  await screen.findByRole("dialog", { name: "Map setup" });
};

/** The two country names in "Travel from X to Y". */
const endpoints = (): [string, string] => {
  const prompt = document.querySelector(".prompt")!;
  const names = Array.from(prompt.querySelectorAll("strong")).map((n) => n.textContent ?? "");
  return [names[0], names[1]];
};

const continentOf = (name: string): string =>
  graph.regions.find((r) => r.names.en === name)?.continent ?? "?";

describe("endless mode", () => {
  it("keeps its own puzzle, separate from the daily one", async () => {
    render(<App />);
    const [dailyStart] = endpoints();

    fireEvent.click(screen.getByRole("button", { name: "Endless" }));
    await waitFor(() => expect(screen.getByText(/Endless #1/)).toBeTruthy());
    expect(window.location.hash).toBe("#/endless");

    fireEvent.click(screen.getByRole("button", { name: "Daily" }));
    expect(endpoints()[0]).toBe(dailyStart);
  });

  it("plays inside one continent once the others are switched off", async () => {
    render(<App />);
    await openEndless();

    for (const continent of ["Europe", "Asia", "North America", "South America", "Oceania"]) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${continent}`) }));
    }

    await waitFor(() => {
      const [start, end] = endpoints();
      expect(continentOf(start)).toBe("Africa");
      expect(continentOf(end)).toBe("Africa");
    });
    expect(document.querySelector(".setup__count")?.textContent).toContain("50");
  });

  it("will not offer a country that has been taken off the map", async () => {
    render(<App />);
    await openEndless();

    const countNow = (): number =>
      Number(/(\d+) countries in play/.exec(document.querySelector(".setup__count")!.textContent!)![1]);
    const before = countNow();

    const exclude = screen.getByLabelText("Leave countries out");
    fireEvent.change(exclude, { target: { value: "Egypt" } });
    fireEvent.click(await screen.findByRole("button", { name: "Remove Egypt" }));

    // It is gone from the setup panel's own count and from the guess box.
    await waitFor(() => expect(countNow()).toBe(before - 1));

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    const guessBox = screen.getByLabelText("Guess a country");
    fireEvent.change(guessBox, { target: { value: "Egypt" } });
    expect(guessBox.parentElement?.querySelector(".search__list")).toBeNull();
  });

  it("says so rather than inventing a puzzle it cannot make", async () => {
    render(<App />);
    await openEndless();

    // Ask for a trek only the full map can supply, then shrink the map to Africa.
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "20" } });
    for (const continent of ["Europe", "Asia", "North America", "South America", "Oceania"]) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${continent}`) }));
    }

    await waitFor(() => expect(screen.getByText(/Nothing to play with that setup/)).toBeTruthy());
    // The panel is still there to climb back out with.
    expect(document.querySelector(".setup__count")?.textContent).toContain("longest possible route 9");
  });

  it("deals a fresh puzzle after each round", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Endless" }));
    await waitFor(() => expect(screen.getByText(/Endless #1/)).toBeTruthy());
    const first = endpoints();

    fireEvent.click(screen.getByRole("button", { name: "Give up" }));
    fireEvent.click(await screen.findByRole("button", { name: "Next puzzle" }));

    await waitFor(() => expect(screen.getByText(/Endless #2/)).toBeTruthy());
    expect(endpoints()).not.toEqual(first);
  });
});

describe("the outline hint", () => {
  it("outlines the next country on the route", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Endless" }));
    await waitFor(() => expect(screen.getByText(/Endless #1/)).toBeTruthy());

    const [startName, endName] = endpoints();
    const idOf = (name: string): string => graph.regions.find((r) => r.names.en === name)!.id;
    const expected = graph.solve(idOf(startName), idOf(endName)).path[0];

    fireEvent.click(screen.getByRole("button", { name: "Show the next country outline" }));

    const outlined = await waitFor(() => {
      const node = document.querySelector(".shape--hint");
      expect(node).toBeTruthy();
      return node!;
    });
    expect(outlined.getAttribute("data-region")).toBe(expected);
  });
});
