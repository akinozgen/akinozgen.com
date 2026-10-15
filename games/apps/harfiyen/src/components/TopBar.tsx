import { AccountButton } from "@akinozgen/account/client";
import { currentTheme, onThemeChange, type Theme, toggleTheme } from "@travelle/core";
import { useEffect, useState } from "react";
import { setSoundOn, useSoundOn } from "../game/sound.ts";

/** Which part of harfiyen is on screen: a game against the computer, or games with people. */
export type Section = "bot" | "online";

/**
 * The bar across the top, as in every game of the family: the name, the
 * switch between playing the computer and playing people, the account, and
 * the tools of whichever is on screen. On a phone the account steps down
 * beside the switch, so the name and the tools keep one line.
 */
export function TopBar({
  section,
  waiting = 0,
  children,
}: {
  section: Section;
  /** Online games where it's the player's turn, shown on the switch. */
  waiting?: number;
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <header className="topbar">
      <a className="brand" href="#/" aria-label="harfiyen, bilgisayara karşı oyuna dön">
        <svg viewBox="0 0 32 32" className="brand__mark" aria-hidden="true">
          <rect x="11" y="2.5" width="18.5" height="18.5" rx="4.5" transform="rotate(8 20 12)" />
          <rect x="2.5" y="10" width="19.5" height="19.5" rx="4.5" />
          <path d="M8 15v10M16.5 15v10M8 20h8.5" />
        </svg>
        <h1 className="brand__name">harfiyen</h1>
        <span className="brand__tag">Harf harf kazan</span>
      </a>
      <nav className="modes" aria-label="Oyun türü">
        <a className={`modes__tab${section === "bot" ? " is-on" : ""}`} href="#/" aria-current={section === "bot" ? "page" : undefined}>
          Bilgisayar
        </a>
        <a
          className={`modes__tab${section === "online" ? " is-on" : ""}`}
          href="#/cevrimici"
          aria-current={section === "online" ? "page" : undefined}
        >
          Çevrimiçi
          {waiting > 0 && (
            <span className="modes__badge" aria-label={`${waiting} oyunda sıra sende`}>
              {waiting}
            </span>
          )}
        </a>
      </nav>
      <div className="topbar__account">
        <AccountButton />
      </div>
      <nav className="topbar__tools" aria-label="Araçlar">
        {children}
        <SoundToggle />
        <ThemeToggle />
      </nav>
    </header>
  );
}

export function Footer(): React.ReactElement {
  return (
    <footer className="credits">
      <a href="/games/">akinozgen.com/games</a>
      <span>Sözlük: TDK Güncel Türkçe Sözlük</span>
    </footer>
  );
}

export function RulesIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6" />
      <circle cx="12" cy="17" r=".6" />
    </svg>
  );
}

export function PlusIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function ChartIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 20V11M12 20V5M19 20v-6" />
    </svg>
  );
}

/** Light or dark, the same switch as in every game of the family: the moon while light, the sun while dark. */
export function ThemeToggle(): React.ReactElement {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  useEffect(() => onThemeChange(setTheme), []);
  const dark = theme === "dark";
  const label = dark ? "Açık tema" : "Koyu tema";
  return (
    <button type="button" className="icon-button" aria-label={label} title={label} onClick={() => toggleTheme()}>
      {dark ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
        </svg>
      )}
    </button>
  );
}

/** The game's sounds on or off, remembered in this browser. */
export function SoundToggle(): React.ReactElement {
  const on = useSoundOn();
  const label = on ? "Sesi kapat" : "Sesi aç";
  return (
    <button type="button" className="icon-button" aria-label={label} title={label} aria-pressed={!on} onClick={() => setSoundOn(!on)}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
        {on ? <path d="M15.5 9.2a4 4 0 0 1 0 5.6M18.3 6.5a7.8 7.8 0 0 1 0 11" /> : <path d="m16 9.5 5 5M21 9.5l-5 5" />}
      </svg>
    </button>
  );
}
