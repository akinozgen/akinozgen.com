import { readFileSync } from "node:fs";
import { join } from "node:path";
import { THEME_BOOT, THEME_KEY } from "@travelle/core";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { followThemeColor, ThemeToggle } from "../src/components/ThemeToggle.tsx";
import { render } from "./helpers.tsx";

const root = document.documentElement;
const saved = (): unknown => JSON.parse(localStorage.getItem(THEME_KEY) ?? "null");

beforeEach(() => {
  localStorage.clear();
  root.removeAttribute("data-theme");
});
afterEach(cleanup);

describe("the theme switch", () => {
  it("flips the page to the other theme and keeps the pick", () => {
    // jsdom has no dark system, so the page starts light and offers dark.
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Dark theme" }));
    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(saved()).toBe("dark");

    fireEvent.click(screen.getByRole("button", { name: "Light theme" }));
    expect(root.getAttribute("data-theme")).toBe("light");
    expect(saved()).toBe("light");
  });

  it("puts a kept pick on the page before it paints", () => {
    const html = readFileSync(join(process.cwd(), "index.html"), "utf8");
    const boot = /<script>(.*?)<\/script>/.exec(html)?.[1];
    expect(boot).toBe(THEME_BOOT);
    localStorage.setItem(THEME_KEY, JSON.stringify("dark"));
    new Function(boot!)();
    expect(root.getAttribute("data-theme")).toBe("dark");
  });

  it("paints the browser bar in the theme on screen", () => {
    const meta = (scheme: string, colour: string): HTMLMetaElement => {
      const element = document.createElement("meta");
      element.name = "theme-color";
      element.media = `(prefers-color-scheme: ${scheme})`;
      element.content = colour;
      return document.head.appendChild(element);
    };
    const metas = [meta("light", "#eeeeee"), meta("dark", "#111111")];
    const stop = followThemeColor();
    expect(metas.map((m) => m.content)).toEqual(["#eeeeee", "#eeeeee"]);

    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Dark theme" }));
    expect(metas.map((m) => m.content)).toEqual(["#111111", "#111111"]);

    stop();
    for (const m of metas) m.remove();
  });
});
