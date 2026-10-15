import { onThemeChange, readThemeChoice, type Theme } from "@travelle/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { unlockAudioOnGesture } from "./game/sound.ts";
import "./styles.css";

/** The browser's bar takes the page's colour: the chosen theme's, or each scheme's own while following the system. */
const BAR: Record<Theme, string> = { light: "#dbe5ec", dark: "#0e1626" };
function syncThemeColor(): void {
  const choice = readThemeChoice();
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const own: Theme = meta.media.includes("dark") ? "dark" : "light";
    meta.content = BAR[choice ?? own];
  }
}
syncThemeColor();
onThemeChange(syncThemeColor);
unlockAudioOnGesture();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
