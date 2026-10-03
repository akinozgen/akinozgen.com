import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Board, EmptyBoard } from "./components/Board.tsx";
import { EndlessSettings } from "./components/EndlessSettings.tsx";
import { HowToPlay } from "./components/HowToPlay.tsx";
import { ENDLESS_STATS_KEY, useEndless } from "./game/endless.ts";
import { LanguagePicker } from "./components/LanguagePicker.tsx";
import { useLocale } from "./i18n/index.tsx";
import { useDaily } from "./game/daily.ts";
import { PLAYABLE } from "./game/regions.ts";
import { useGame, type Round } from "./game/useGame.ts";

const MODES = ["daily", "endless"] as const;
type Mode = (typeof MODES)[number];

const DAILY_STATS_KEY = "travle:stats:v1";
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
  const [showRules, setShowRules] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
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
      <div className="topbar__brand">
        <h1 className="topbar__title">travelle</h1>
        <span className="topbar__tag">{t("tagline")}</span>
      </div>
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
      <div className="topbar__tools">
        {mode === "endless" && (
          <button type="button" className="chip" onClick={() => setShowSetup(true)}>
            <span aria-hidden="true">⚙</span>
            {t("setup")}
          </button>
        )}
        <LanguagePicker />
        <button type="button" className="chip" onClick={() => setShowRules(true)}>
          {t("rules")}
        </button>
      </div>
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

      {showSetup && <EndlessSettings endless={endless} onClose={() => setShowSetup(false)} />}
      {showRules && <HowToPlay onClose={() => setShowRules(false)} />}
    </div>
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
