import type { Reveal } from "@tessle/data/client";
import { act, fireEvent, renderHook, screen, waitFor, within } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";
import { useTessle } from "../src/game/useTessle.ts";
import { render } from "./helpers.tsx";

const DAY = "2026-10-05";

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${DAY}T12:00:00`));
});
afterAll(() => vi.useRealTimers());

beforeEach(() => {
  localStorage.clear();
  window.location.hash = "";
});

const seenRules = (): void => localStorage.setItem("tessle:seen-rules:v1", "true");

describe("the page", () => {
  it("opens with the rules, then today's map", async () => {
    render(<App />);
    const dialog = screen.getByRole("dialog", { name: "How to play" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Got it" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(await screen.findByText(/^[5-7] countries$/)).toBeTruthy();
    expect(screen.getByText("Map #1")).toBeTruthy();
    expect(await screen.findByRole("img", { name: /country outlines to fit together/ })).toBeTruthy();
    expect(screen.getByText("Moves").nextElementSibling?.textContent).toBe("0");
  });

  it("keeps endless locked until today's map is done", async () => {
    seenRules();
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /Endless/ }));
    expect(await screen.findByText("Endless opens after today's map")).toBeTruthy();
  });

  it("gives up: shows the countries, counts the round, and opens endless", async () => {
    seenRules();
    render(<App />);
    await screen.findByText(/countries$/);
    fireEvent.click(screen.getByRole("button", { name: "Give up" }));
    fireEvent.click(screen.getByRole("button", { name: "Show me" }));
    expect(await screen.findByText("Answer shown", { selector: ".end__kicker" })).toBeTruthy();
    const chips = screen.getByText("The countries").nextElementSibling!.querySelectorAll("a");
    expect(chips.length).toBeGreaterThanOrEqual(5);
    expect(screen.getByText("Next map in")).toBeTruthy();
    const record = JSON.parse(localStorage.getItem("tessle:stats:v1")!);
    expect(record).toMatchObject({ played: 1, won: 0, streak: 0 });

    fireEvent.click(screen.getByRole("button", { name: "Endless" }));
    expect(await screen.findByText("Endless · round 1")).toBeTruthy();
    expect(await screen.findByText(/^[5-7] countries$/)).toBeTruthy();
  });

  it("remembers hard mode and the language", async () => {
    seenRules();
    render(<App />);
    const toggle = screen.getByRole("switch", { name: "Hard mode" });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(localStorage.getItem("tessle:hard:v1")).toBe("true");
    fireEvent.change(screen.getByRole("combobox", { name: "Language" }), { target: { value: "tr" } });
    expect(await screen.findByText(/^[5-7] ülke$/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pes et" })).toBeTruthy();
  });
});

describe("a round", () => {
  it("is won when the server says the map is whole", async () => {
    const { result } = renderHook(() => useTessle("daily"));
    await waitFor(() => expect(result.current.table).not.toBeNull());
    const table = result.current.table!;
    table.layout(1.6, 1);
    const answer = (await (await fetch(`/api/tessle/reveal?d=${DAY}`)).json()) as Reveal;
    table.state = answer.home.map(([x, y], i) => ({ x: x + 2, y: y - 1, r: answer.turns[i] }));
    act(() => result.current.act([0]));
    await waitFor(() => expect(result.current.status).toBe("won"));
    expect(result.current.moves).toBe(1);
    expect(result.current.reveal?.ids).toHaveLength(answer.ids.length);
    expect(result.current.stats).toMatchObject({ played: 1, won: 1, streak: 1 });
    expect(result.current.labels).toEqual(answer.ids);
  });

  it("plays hard mode without the frame, and brings it back when switched off", async () => {
    localStorage.setItem("tessle:hard:v1", "true");
    const { result } = renderHook(() => useTessle("daily"));
    await waitFor(() => expect(result.current.table).not.toBeNull());
    expect(result.current.puzzle!.outline).toEqual([]);
    expect(result.current.table!.frame).toBeNull();
    expect(result.current.labels).not.toBeNull();
    expect(result.current.left).toBe(result.current.puzzle!.pieces.length);
    // Switching it off asks the server for the frame.
    act(() => result.current.setHard(false));
    await waitFor(() => expect(result.current.table!.frame).not.toBeNull());
    expect(result.current.puzzle!.outline.length).toBeGreaterThan(0);
    expect(result.current.hardAll).toBe(false);
    // And on again, it goes.
    act(() => result.current.setHard(true));
    await waitFor(() => expect(result.current.table!.frame).toBeNull());
  });

  it("is won in hard mode as one piece, wherever it lies", async () => {
    localStorage.setItem("tessle:hard:v1", "true");
    const { result } = renderHook(() => useTessle("daily"));
    await waitFor(() => expect(result.current.table).not.toBeNull());
    const table = result.current.table!;
    table.layout(1.6, 1);
    const answer = (await (await fetch(`/api/tessle/reveal?d=${DAY}`)).json()) as Reveal;
    table.state = answer.home.map(([x, y], i) => ({ x: x + 4000, y: y - 2000, r: answer.turns[i] }));
    act(() => result.current.act([0]));
    await waitFor(() => expect(result.current.status).toBe("won"));
    expect(result.current.hardAll).toBe(true);
    expect(result.current.stats).toMatchObject({ played: 1, won: 1, hardWins: 1 });
  });

  it("flips hard mode in both modes at once", async () => {
    const { result } = renderHook(() => ({ daily: useTessle("daily"), endless: useTessle("endless", false) }));
    expect(result.current.endless.hard).toBe(false);
    act(() => result.current.daily.setHard(true));
    expect(result.current.daily.hard).toBe(true);
    expect(result.current.endless.hard).toBe(true);
  });
});
