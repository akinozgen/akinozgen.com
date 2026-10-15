import { currentTheme, onThemeChange, type Theme, toggleTheme } from "@travelle/core";
import { useEffect, useState } from "react";
import { useLocale } from "../i18n/index.tsx";

/**
 * The light/dark switch, the same in every game: a moon to go dark, a sun to
 * go light. The choice is kept for every game on the site (@travelle/core).
 */
export function ThemeToggle(): React.ReactElement {
  const { t } = useLocale();
  const [theme, setTheme] = useState<Theme>(currentTheme);
  useEffect(() => onThemeChange(setTheme), []);
  const dark = theme === "dark";
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={t(dark ? "themeLight" : "themeDark")}
      onClick={() => toggleTheme()}
    >
      {dark ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 14.2A8 8 0 1 1 9.8 4a6.4 6.4 0 0 0 10.2 10.2z" />
        </svg>
      )}
    </button>
  );
}

/**
 * Keeps the browser's bar in the theme on screen. index.html has one
 * theme-color per system scheme; once the player picks, both carry the pick.
 */
export function followThemeColor(): () => void {
  const metas = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'));
  const original = (scheme: Theme): string | undefined =>
    metas.find((meta) => meta.media.includes(`prefers-color-scheme: ${scheme}`))?.content;
  const colours: Record<Theme, string | undefined> = { light: original("light"), dark: original("dark") };
  const paint = (theme: Theme): void => {
    const colour = colours[theme];
    if (colour) for (const meta of metas) meta.content = colour;
  };
  paint(currentTheme());
  return onThemeChange(paint);
}
