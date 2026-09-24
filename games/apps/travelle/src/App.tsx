import { useEffect, useState } from "react";
import { Board } from "./components/Board.tsx";
import { EndlessSettings } from "./components/EndlessSettings.tsx";
import { HowToPlay } from "./components/HowToPlay.tsx";
import { ENDLESS_STATS_KEY, useEndless } from "./game/endless.ts";
import { LanguagePicker } from "./components/LanguagePicker.tsx";
import { useLocale } from "./i18n/index.tsx";
import { dailyPuzzle, graph, todayIndex } from "./game/puzzle.ts";
import { useGame, type Round } from "./game/useGame.ts";

const MODES = ["daily", "endless"] as const;
type Mode = (typeof MODES)[number];

const DAILY_STATS_KEY = "travle:stats:v1";
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
  const [showRules, setShowRules] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const endless = useEndless();

  const dayIndex = todayIndex();
  const round: Round | null =
    mode === "daily"
      ? {
          puzzle: dailyPuzzle(dayIndex),
          graph,
          statsKey: DAILY_STATS_KEY,
          sequence: dayIndex,
        }
      : endless.puzzle
        ? {
            puzzle: endless.puzzle,
            graph: endless.map,
            statsKey: ENDLESS_STATS_KEY,
            sequence: endless.round,
          }
        : null;

  return (
    <div className="page">
      <header className="header">
        <div className="header__brand">
          <h1 className="header__title">travelle</h1>
          <span className="header__tag">{t("tagline")}</span>
        </div>
        <div className="header__tools">
          <LanguagePicker />
          <button type="button" className="button button--ghost" onClick={() => setShowRules(true)}>
            {t("rules")}
          </button>
        </div>
      </header>

      <div className="modes-row">
        <nav className="modes" aria-label="Game mode">
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
        {mode === "endless" && (
          <button type="button" className="setup-button" onClick={() => setShowSetup(true)}>
            <span className="setup-button__gear" aria-hidden="true">
              ⚙
            </span>
            {t("setup")}
          </button>
        )}
      </div>

      {round ? (
        <Game key={round.puzzle.id} round={round} onNext={mode === "endless" ? endless.next : null} />
      ) : (
        <p className="empty">
          {t("nothingToPlay", {
            min: endless.settings.minLength,
            max: endless.settings.maxLength,
          })}
        </p>
      )}

      {showSetup && <EndlessSettings endless={endless} onClose={() => setShowSetup(false)} />}
      {showRules && <HowToPlay onClose={() => setShowRules(false)} />}
    </div>
  );
}

/** Split out so a new round remounts with fresh state via the key above. */
function Game({ round, onNext }: { round: Round; onNext: (() => void) | null }): React.ReactElement {
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
