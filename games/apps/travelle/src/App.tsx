import { AccountButton } from "@akinozgen/account/client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Board, EmptyBoard } from "./components/Board.tsx";
import { EndlessSettings } from "./components/EndlessSettings.tsx";
import { HowToPlay } from "./components/HowToPlay.tsx";
import { ENDLESS_STATS_KEY, useEndless } from "./game/endless.ts";
import { LanguagePicker } from "./components/LanguagePicker.tsx";
import { Sheet } from "./components/Sheet.tsx";
import { StatsView } from "./components/StatsView.tsx";
import { ThemeToggle } from "./components/ThemeToggle.tsx";
import { useLocale } from "./i18n/index.tsx";
import { useDaily } from "./game/daily.ts";
import { DAILY_STATS_KEY } from "./game/records.ts";
import { PLAYABLE } from "./game/regions.ts";
import { useGame, useRecord, type Round } from "./game/useGame.ts";

const MODES = ["daily", "endless"] as const;
type Mode = (typeof MODES)[number];

const EVERYWHERE = PLAYABLE.map((region) => region.id);
function readMode(): Mode {
  const hash = window.location.hash.replace(/^#\/?/, "");
  return MODES.includes(hash as Mode) ? (hash as Mode) : "daily";
}

/** The mode lives in the hash so a reload — or a shared link — keeps it. */
function useMode(): [Mode, (mode: Mode) => void] {
  const [mode, setMode] = useState<Mode>(readMode);
  useEffect(() => {
    const onHash = (): void => setMode(readMode());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return [
    mode,
    (next: Mode) => {
      window.location.hash = `/${next}`;
      setMode(next);
    },
  ];
}

export function App(): React.ReactElement {
  const { t } = useLocale();
  const [mode, setMode] = useMode();
  const [sheet, setSheet] = useState<"rules" | "stats" | "setup" | null>(null);
  const closeSheet = (): void => setSheet(null);
  const endless = useEndless(mode === "endless");
  const topbarRef = useRef<HTMLElement>(null);
  useTopbarHeight(topbarRef);
  const daily = useDaily();

  const round: Round | null =
    mode === "daily"
      ? daily.puzzle && {
          puzzle: daily.puzzle,
          statsKey: DAILY_STATS_KEY,
          sequence: daily.puzzle.number,
          allowed: EVERYWHERE,
        }
      : endless.puzzle && {
          puzzle: endless.puzzle,
          statsKey: ENDLESS_STATS_KEY,
          sequence: endless.round,
          allowed: endless.allowed,
        };

  const failed = mode === "daily" ? daily.failed : endless.failed;
  const loading = mode === "daily" ? !daily.puzzle && !daily.failed : endless.loading;
  const waiting = failed ? (
    <>
      {t("serverError")}{" "}
      <button
        type="button"
        className="button"
        onClick={mode === "daily" ? daily.retry : endless.retry}
      >
        {t("retry")}
      </button>
    </>
  ) : loading ? (
    t("puzzleLoading")
  ) : (
    t("nothingToPlay", {
      min: endless.settings.minLength,
      max: endless.settings.maxLength,
    })
  );

  const topbar = (
    <header className="topbar" ref={topbarRef}>
      <div className="brand">
        <svg viewBox="0 0 32 32" className="brand__mark" aria-hidden="true">
          <path d="M7 24.5 14.5 13 25 7.5" />
          <circle cx="7" cy="24.5" r="4.5" />
          <circle cx="14.5" cy="13" r="3" />
          <circle cx="25" cy="7.5" r="4.5" />
        </svg>
        <h1 className="brand__name">travelle</h1>
        <span className="brand__tag">{t("tagline")}</span>
      </div>
      <div className="topbar__modes">
        <nav className="modes" aria-label={`${t("modeDaily")} / ${t("modeEndless")}`}>
          {MODES.map((option) => (
            <button
              key={option}
              type="button"
              className={`modes__tab${mode === option ? " is-on" : ""}`}
              aria-current={mode === option ? "page" : undefined}
              onClick={() => setMode(option)}
            >
              {option === "daily" ? t("modeDaily") : t("modeEndless")}
            </button>
          ))}
        </nav>
        {/* Endless's own settings, beside the switch that picks it. */}
        {mode === "endless" && (
          <button
            type="button"
            className="icon-button topbar__setup"
            aria-label={t("setup")}
            onClick={() => setSheet("setup")}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
              <circle cx="15" cy="7" r="2" />
              <circle cx="9" cy="17" r="2" />
            </svg>
          </button>
        )}
      </div>
      <div className="topbar__account">
        <AccountButton />
      </div>
      <nav className="topbar__tools">
        <LanguagePicker />
        <ThemeToggle />
        <button type="button" className="icon-button" aria-label={t("stats")} onClick={() => setSheet("stats")}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 20V11M12 20V5M19 20v-6" />
          </svg>
        </button>
        <button type="button" className="icon-button" aria-label={t("rules")} onClick={() => setSheet("rules")}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6" />
            <circle cx="12" cy="17" r=".6" />
          </svg>
        </button>
      </nav>
    </header>
  );

  return (
    <div className="app">
      {topbar}
      {round ? (
        <Game
          key={round.puzzle.id}
          round={round}
          onNext={mode === "endless" ? endless.next : null}
        />
      ) : (
        <EmptyBoard>{waiting}</EmptyBoard>
      )}

      {sheet === "setup" && <EndlessSettings endless={endless} onClose={closeSheet} />}
      {sheet === "rules" && <HowToPlay onClose={closeSheet} />}
      {sheet === "stats" && <StatsSheet onClose={closeSheet} />}
    </div>
  );
}

/** Both records side by side, as in the other games. */
function StatsSheet({ onClose }: { onClose: () => void }): React.ReactElement {
  const { t } = useLocale();
  const daily = useRecord("daily");
  const endless = useRecord("endless");
  return (
    <Sheet title={t("stats")} onClose={onClose}>
      <h3>{t("statsDaily")}</h3>
      <StatsView stats={daily.stats} imported={daily.imported} />
      <h3>{t("statsEndless")}</h3>
      <StatsView stats={endless.stats} imported={endless.imported} />
    </Sheet>
  );
}

/** Split out so a new round remounts with fresh state via the key above. */
function Game({
  round,
  onNext,
}: {
  round: Round;
  onNext: (() => void) | null;
}): React.ReactElement {
  const { t } = useLocale();
  const game = useGame(round);
  return (
    <Board
      round={round}
      game={game}
      footer={
        onNext && game.status !== "playing" ? (
          <button type="button" className="button button--primary next" onClick={onNext}>
            {t("nextPuzzle")}
          </button>
        ) : null
      }
    />
  );
}

/**
 * The bar sits outside the board so it survives the board being swapped
 * (loading, then playing); the board leaves a gap of its height for it.
 */
function useTopbarHeight(ref: React.RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = (): void =>
      document.documentElement.style.setProperty("--topbar-h", `${node.offsetHeight}px`);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
}
