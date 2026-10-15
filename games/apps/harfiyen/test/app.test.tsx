import { encode, JOKER, makeRules, newGame, saveGame, SIZE, TILE_SET } from "@harfiyen/engine";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import { loadLexicons } from "../src/game/lexicons.ts";
import { HUMAN } from "../src/game/useGame.ts";

beforeAll(async () => {
  await loadLexicons();
});

const CENTRE_ROW = 7 * SIZE;

/** A saved game whose rack holds `rack`, with the rules already read. */
function saved(rack: string, seenRules = true): void {
  const game = newGame("app-test", makeRules("app-test"), TILE_SET);
  game.racks[HUMAN] = [...rack].map((char) => (char === "?" ? JOKER : encode(char)![0]));
  localStorage.setItem("harfiyen:game:v1", JSON.stringify({ game: saveGame(game), level: "kolay", view: game.racks[HUMAN] }));
  if (seenRules) localStorage.setItem("harfiyen:seen-rules:v1", "true");
}

const square = (container: HTMLElement, n: number): HTMLElement => container.querySelector(`[data-square="${n}"]`)!;
const rackTile = (index: number): HTMLElement => within(screen.getByRole("group", { name: "Harflerin" })).getAllByRole("button")[index];

/** Taps rack tiles onto the centre row, one square after another from `col`. */
function lay(container: HTMLElement, tiles: number, col: number): void {
  for (let i = 0; i < tiles; i++) {
    fireEvent.click(rackTile(0));
    fireEvent.click(square(container, CENTRE_ROW + col + i));
  }
}

describe("harfiyen", () => {
  it("shows the rules on a first visit", async () => {
    saved("kalemat", false);
    render(<App />);
    expect(screen.getByRole("dialog", { name: "Nasıl oynanır" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Anladım" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("plays a word by tapping, scores it, and the computer answers", async () => {
    saved("kalemat");
    const { container } = render(<App />);
    await screen.findAllByText(/Sıra sende/);
    lay(container, 5, 5);
    const play = screen.getByRole("button", { name: /^Oyna/ });
    await waitFor(() => expect((play as HTMLButtonElement).disabled).toBe(false));
    expect(play.textContent).toMatch(/\+\d+/);
    fireEvent.click(play);
    expect(square(container, CENTRE_ROW + 5).getAttribute("aria-label")).toMatch(/K, 1 puan/);
    expect(screen.getAllByText("KALEM").length).toBeGreaterThan(0);
    // The computer moves after a moment, and the turn comes back.
    await screen.findByRole("tab", { name: /Hamleler\s*2/ }, { timeout: 4000 });
    await waitFor(() => expect(screen.queryAllByText(/Sıra sende/).length).toBeGreaterThan(0), { timeout: 4000 });
  });

  it("won't play a word the dictionary lacks, and says which", async () => {
    saved("klmaaaa");
    const { container } = render(<App />);
    await screen.findAllByText(/Sıra sende/);
    lay(container, 3, 6);
    await screen.findByText(/KLM/);
    expect((screen.getByRole("button", { name: /^Oyna/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("takes a tile back when it's tapped on the board", async () => {
    saved("kalemat");
    const { container } = render(<App />);
    await screen.findAllByText(/Sıra sende/);
    lay(container, 1, 7);
    expect(within(screen.getByRole("group", { name: "Harflerin" })).getAllByRole("button")).toHaveLength(6);
    // A second tap straight away is the same tap; a moment later it takes the tile back.
    fireEvent.click(square(container, CENTRE_ROW + 7));
    expect(within(screen.getByRole("group", { name: "Harflerin" })).getAllByRole("button")).toHaveLength(6);
    await new Promise((resolve) => setTimeout(resolve, 450));
    fireEvent.click(square(container, CENTRE_ROW + 7));
    expect(within(screen.getByRole("group", { name: "Harflerin" })).getAllByRole("button")).toHaveLength(7);
  });

  it("asks what a joker stands for", async () => {
    saved("?vaaaaa");
    const { container } = render(<App />);
    await screen.findAllByText(/Sıra sende/);
    lay(container, 1, 7);
    const picker = screen.getByRole("dialog", { name: "Joker hangi harf olsun?" });
    fireEvent.click(within(picker).getByRole("button", { name: "E" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    lay(container, 1, 8);
    await waitFor(() => expect((screen.getByRole("button", { name: /^Oyna/ }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("swaps tiles through the swap sheet", async () => {
    saved("ğğjjvvf");
    render(<App />);
    await screen.findAllByText(/Sıra sende/);
    fireEvent.click(screen.getByRole("button", { name: "Değiştir" }));
    const sheet = screen.getByRole("dialog", { name: "Harf değiştir" });
    const tiles = within(sheet).getAllByRole("button", { pressed: false });
    fireEvent.click(tiles[0]);
    fireEvent.click(tiles[1]);
    fireEvent.click(within(sheet).getByRole("button", { name: "2 harfi değiştir" }));
    expect(screen.queryByRole("dialog", { name: "Harf değiştir" })).toBeNull();
    expect(screen.getAllByText(/2 harf değiştirdi/).length).toBeGreaterThan(0);
  });

  it("starts a new game on a shuffled board", async () => {
    saved("kalemat");
    render(<App />);
    await screen.findAllByText(/Sıra sende/);
    // The toolbar's button; the panel has one too.
    fireEvent.click(screen.getAllByRole("button", { name: "Yeni oyun" })[0]);
    const sheet = screen.getByRole("dialog", { name: "Yeni oyun" });
    fireEvent.click(within(sheet).getByText("Karışık tahta"));
    fireEvent.click(within(sheet).getByRole("button", { name: "Başla" }));
    expect(screen.getAllByText("Karışık tahta").length).toBeGreaterThan(0);
  });
});

describe("the keyboard", () => {
  it("types tiles onto the board from the cursor, takes them back, and plays with Enter", async () => {
    saved("kalemat");
    const { container } = render(<App />);
    await screen.findAllByText(/Sıra sende/);
    const centre = square(container, CENTRE_ROW + 7);
    centre.focus();
    for (const key of ["k", "a", "l"]) fireEvent.keyDown(document.activeElement!, { key });
    expect(square(container, CENTRE_ROW + 9).getAttribute("aria-label")).toMatch(/bu tur koyduğun L/);
    // The cursor moved on with each letter.
    expect(document.activeElement).toBe(square(container, CENTRE_ROW + 10));
    fireEvent.keyDown(document.activeElement!, { key: "Backspace" });
    expect(square(container, CENTRE_ROW + 9).getAttribute("aria-label")).not.toMatch(/bu tur/);
    for (const key of ["l", "e", "m"]) fireEvent.keyDown(document.activeElement!, { key });
    await waitFor(() => expect((screen.getByRole("button", { name: /^Oyna/ }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    await screen.findByRole("tab", { name: /Hamleler\s*1/ });
  });

  it("walks the board with the arrow keys, one tab stop for the whole board", async () => {
    saved("kalemat");
    const { container } = render(<App />);
    await screen.findAllByText(/Sıra sende/);
    const stops = container.querySelectorAll('[data-square][tabindex="0"]');
    expect(stops).toHaveLength(1);
    square(container, CENTRE_ROW + 7).focus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(square(container, CENTRE_ROW + 7 + SIZE));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(square(container, CENTRE_ROW + 6 + SIZE));
  });
});
