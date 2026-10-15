import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { THEME_BOOT, THEME_KEY } from "@travelle/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";

afterEach(() => document.documentElement.removeAttribute("data-theme"));

describe("the theme switch", () => {
  it("flips the page between light and dark, and keeps the choice for every game", () => {
    localStorage.setItem("harfiyen:seen-rules:v1", "true");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Koyu tema" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(JSON.parse(localStorage.getItem(THEME_KEY)!)).toBe("dark");
    fireEvent.click(screen.getByRole("button", { name: "Açık tema" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(JSON.parse(localStorage.getItem(THEME_KEY)!)).toBe("light");
    expect(screen.getByRole("button", { name: "Koyu tema" })).toBeTruthy();
  });

  it("is on the page before it paints: the boot script sits inline in the head", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    const head = html.slice(0, html.indexOf("</head>"));
    expect(head).toContain(`<script>${THEME_BOOT}</script>`);
    expect(head.indexOf(THEME_BOOT)).toBeLessThan(head.indexOf('rel="manifest"'));
  });
});
