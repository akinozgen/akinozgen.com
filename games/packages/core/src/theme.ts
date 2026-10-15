/**
 * Light or dark, for every game on the site. By default a game follows the
 * system; a player who flips the switch gets their choice in every game,
 * kept under one key on this origin.
 *
 * The page carries the choice as `<html data-theme="light|dark">` (absent:
 * follow the system), and the stylesheets read it:
 *
 *   :root { light tokens }
 *   @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { dark tokens } }
 *   :root[data-theme="dark"] { dark tokens }
 *
 * `THEME_BOOT` goes inline in each index.html's <head>, so the choice is on
 * the page before anything paints and there is no flash of the wrong theme.
 */
export type Theme = "light" | "dark";
/** A player's choice: one of the two, or none yet (follow the system). */
export type ThemeChoice = Theme | null;

export const THEME_KEY = "games:theme:v1";
/** Fired on window when the theme changes, for anything drawn by script (canvas, theme-color). */
export const THEME_EVENT = "games:theme";

export const THEME_BOOT = `(function(){try{var t=JSON.parse(localStorage.getItem("${THEME_KEY}"));if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})();`;

export function readThemeChoice(): ThemeChoice {
  try {
    const value = JSON.parse(localStorage.getItem(THEME_KEY) ?? "null") as unknown;
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

export function systemTheme(): Theme {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** The theme on screen now. */
export function currentTheme(): Theme {
  const attribute = document.documentElement.getAttribute("data-theme");
  return attribute === "light" || attribute === "dark" ? attribute : systemTheme();
}

/** Puts a choice on the page and keeps it; null goes back to following the system. */
export function setThemeChoice(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice) root.setAttribute("data-theme", choice);
  else root.removeAttribute("data-theme");
  try {
    if (choice) localStorage.setItem(THEME_KEY, JSON.stringify(choice));
    else localStorage.removeItem(THEME_KEY);
  } catch {
    // Not kept, but still applied for this visit.
  }
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: currentTheme() }));
}

/** The switch: whatever is on screen, the other one. */
export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  setThemeChoice(next);
  return next;
}

/**
 * Calls `listener` with the theme on screen whenever it changes — by the
 * switch, in another tab, or by the system while following it. Returns the
 * unsubscribe.
 */
export function onThemeChange(listener: (theme: Theme) => void): () => void {
  const fire = (): void => listener(currentTheme());
  const media = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== THEME_KEY) return;
    const choice = readThemeChoice();
    if (choice) document.documentElement.setAttribute("data-theme", choice);
    else document.documentElement.removeAttribute("data-theme");
    fire();
  };
  window.addEventListener(THEME_EVENT, fire);
  window.addEventListener("storage", onStorage);
  media?.addEventListener("change", fire);
  return () => {
    window.removeEventListener(THEME_EVENT, fire);
    window.removeEventListener("storage", onStorage);
    media?.removeEventListener("change", fire);
  };
}
