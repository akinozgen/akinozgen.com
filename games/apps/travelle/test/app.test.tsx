import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "./helpers.tsx";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import { dailyPuzzle, graph, todayIndex } from "../src/game/puzzle.ts";
import { HINTS } from "../src/game/useGame.ts";

const puzzle = dailyPuzzle(todayIndex());

/** The guess list, addressed by class so the map's labels can't be mistaken for it. */
const guessEntries = (): HTMLLIElement[] =>
  Array.from(document.querySelectorAll<HTMLLIElement>(".guesses .guess"));

const typeGuess = async (name: string): Promise<void> => {
  const input = screen.getByLabelText("Guess a country");
  fireEvent.change(input, { target: { value: name } });
  const option = await screen.findByRole("button", { name });
  fireEvent.click(option);
};

beforeEach(() => {
  localStorage.clear();
  window.location.hash = "";
});
afterEach(cleanup);

describe("the game page", () => {
  it("shows today's puzzle and draws it", async () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "travelle" })).toBeTruthy();
    expect(screen.getByText(graph.region(puzzle.start).names.en)).toBeTruthy();
    expect(screen.getByText(graph.region(puzzle.end).names.en)).toBeTruthy();
    expect(screen.getByText(`Guess 1 of ${puzzle.budget}`)).toBeTruthy();

    // The map loads its geometry lazily, then draws one shape per country shown.
    await waitFor(() => {
      const shapes = document.querySelectorAll("svg .shape");
      expect(shapes.length).toBe(2);
      for (const shape of shapes) expect(shape.getAttribute("d")?.length).toBeGreaterThan(20);
    });
  });

  it("puts the ocean and the graticule on a sized canvas", async () => {
    render(<App />);
    const canvas = document.querySelector<HTMLCanvasElement>(".map__canvas")!;
    expect(canvas).toBeTruthy();
    await waitFor(() => expect(canvas.width).toBeGreaterThan(0));
  });

  it("spins when dragged and offers a way back", async () => {
    render(<App />);
    const svg = document.querySelector("svg")!;
    await waitFor(() => expect(document.querySelectorAll(".shape").length).toBe(2));

    const before = document.querySelector(".shape")?.getAttribute("d");
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 260, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 260, clientY: 150, pointerId: 1 });

    expect(document.querySelector(".shape")?.getAttribute("d")).not.toBe(before);
    expect(screen.getByRole("button", { name: "Recentre" })).toBeTruthy();
  });

  it("shows the world's borders for the second hint, not the answer", async () => {
    render(<App />);
    await waitFor(() => expect(document.querySelectorAll(".shape").length).toBe(2));

    fireEvent.click(screen.getByRole("button", { name: "Show all country outlines" }));

    // Context goes on the canvas layer. Nothing on the route is drawn.
    const button = screen.getByRole("button", { name: "Show all country outlines" });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));
    expect(document.querySelectorAll(".shape").length).toBe(2);
    expect(document.querySelector(".shape--hint")).toBeNull();
  });

  it("outlines one country for the first hint without moving the camera", async () => {
    render(<App />);
    await waitFor(() => expect(document.querySelectorAll(".shape").length).toBe(2));
    const framed = [...document.querySelectorAll(".shape")].map((n) => n.getAttribute("d"));

    fireEvent.click(screen.getByRole("button", { name: "Show the next country outline" }));

    await waitFor(() => expect(document.querySelectorAll(".shape--hint").length).toBe(1));
    // The start and end have not shifted a pixel: the hint is outside the framing.
    const after = [...document.querySelectorAll(".shape:not(.shape--hint)")].map((n) =>
      n.getAttribute("d"),
    );
    expect(after).toEqual(framed);
  });

  it("plays the shortest route through to a perfect win", async () => {
    render(<App />);
    const route = graph.solve(puzzle.start, puzzle.end).path;

    for (const regionId of route) {
      await typeGuess(graph.region(regionId).names.en);
    }

    const headline = await screen.findByRole("heading", { name: /Perfect/ });
    expect(headline.className).toContain("end__headline");
    const marks = guessEntries().map((li) => li.className);
    expect(marks.length).toBe(route.length);
    for (const mark of marks) expect(mark).toContain("guess--chain");
    expect(screen.getByText(new RegExp(`travelle #${puzzle.number}`))).toBeTruthy();
  });

  it("marks a hopeless guess red and keeps the round going", async () => {
    render(<App />);
    // Somewhere far from any route: pick the region furthest from the start.
    const distances = graph.distancesFrom(puzzle.start);
    const [furthest] = [...distances].sort((a, b) => b[1] - a[1])[0];

    await typeGuess(graph.region(furthest).names.en);

    const entries = guessEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].className).toContain("guess--wrong");
    expect(entries[0].textContent).toContain(graph.region(furthest).names.en);
    expect(screen.getByText(`Guess 2 of ${puzzle.budget}`)).toBeTruthy();
  });

  it("reveals initials as a hint without naming the country", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Show country initials" }));

    const expected = graph
      .solve(puzzle.start, puzzle.end)
      .path.map((id) => graph.region(id).names.en.charAt(0))
      .join(" · ");
    expect(screen.getByText(expected)).toBeTruthy();
    expect(screen.getByText("Hints").parentElement?.textContent).toContain(`1/${HINTS.length}`);
  });

  it("remembers a game across a reload", async () => {
    const first = render(<App />);
    const route = graph.solve(puzzle.start, puzzle.end).path;
    await typeGuess(graph.region(route[0]).names.en);
    first.unmount();

    render(<App />);
    await waitFor(() => expect(guessEntries().length).toBe(1));
    expect(guessEntries()[0].textContent).toContain(graph.region(route[0]).names.en);
  });
});

describe("the trimmings", () => {
  it("counts the guesses left as pips that keep their colour", async () => {
    render(<App />);
    expect(screen.getByText(`Guess 1 of ${puzzle.budget}`)).toBeTruthy();
    expect(document.querySelectorAll(".meter__pips .pip").length).toBe(puzzle.budget);

    const route = graph.solve(puzzle.start, puzzle.end).path;
    await typeGuess(graph.region(route[0]).names.en);

    expect(document.querySelector(".pip")?.className).toContain("is-chain");
    expect(screen.getByText(`Guess 2 of ${puzzle.budget}`)).toBeTruthy();
  });

  it("counts down to tomorrow's puzzle, but only on the daily", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Give up" }));

    const countdown = await screen.findByText(/Next travelle in/);
    expect(countdown.textContent).toMatch(/\d\d:\d\d:\d\d/);
  });
});

describe("languages", () => {
  it("switches the whole page, country names included", async () => {
    render(<App />);
    const region = graph.region(puzzle.start);
    expect(document.querySelector(".prompt")?.textContent).toContain(region.names.en);

    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "tr" } });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Nasıl oynanır" })).toBeTruthy(),
    );
    expect(document.querySelector(".prompt")?.textContent).toContain(region.names.tr);
    expect(screen.getByRole("button", { name: "Pes et" })).toBeTruthy();
    expect(document.documentElement.lang).toBe("tr");
  });

  it("finds a country typed in any language", async () => {
    render(<App />);
    const input = screen.getByLabelText("Guess a country");

    fireEvent.change(input, { target: { value: "Almanya" } });
    expect(await screen.findByRole("button", { name: "Germany" })).toBeTruthy();

    fireEvent.change(input, { target: { value: "Allemagne" } });
    expect(await screen.findByRole("button", { name: "Germany" })).toBeTruthy();
  });
});

describe("the neighbours hint", () => {
  it("outlines every country bordering either end, and nothing else", async () => {
    render(<App />);
    await waitFor(() => expect(document.querySelectorAll(".shape").length).toBe(2));
    const framed = [...document.querySelectorAll(".shape")].map((n) => n.getAttribute("d"));

    fireEvent.click(screen.getByRole("button", { name: "Show both ends' neighbours" }));

    const expected = new Set([
      ...graph.neighbours(puzzle.start),
      ...graph.neighbours(puzzle.end),
    ]);
    expected.delete(puzzle.start);
    expected.delete(puzzle.end);

    await waitFor(() =>
      expect(document.querySelectorAll(".shape--hint").length).toBe(expected.size),
    );
    const shown = [...document.querySelectorAll(".shape--hint")].map((n) =>
      n.getAttribute("data-region"),
    );
    expect(new Set(shown)).toEqual(expected);

    // Outlines stay out of the framing, so the camera has not moved.
    const after = [...document.querySelectorAll(".shape:not(.shape--hint)")].map((n) =>
      n.getAttribute("d"),
    );
    expect(after).toEqual(framed);
  });
});
