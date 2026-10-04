import { readJson, writeJson } from "@travelle/core";
import { useEffect, useState } from "react";
import { EndCard } from "./components/EndCard.tsx";
import { FinalCard, GuessRows } from "./components/FinalCard.tsx";
import { HowToPlay } from "./components/HowToPlay.tsx";
import { LanguagePicker } from "./components/LanguagePicker.tsx";
import { Notebook } from "./components/Notebook.tsx";
import { QuestionCard } from "./components/QuestionCard.tsx";
import { Sheet } from "./components/Sheet.tsx";
import { StatsView } from "./components/StatsView.tsx";
import { type Babelle, type Mode, playDate, useBabelle } from "./game/useBabelle.ts";
import { useLocale } from "./i18n/index.tsx";

const SEEN_RULES_KEY = "babelle:seen-rules:v1";

/** The mode lives in the hash, so a reload or a shared link keeps it. */
function useMode(): [Mode, (mode: Mode) => void] {
  const read = (): Mode => (window.location.hash.replace(/^#\/?/, "") === "endless" ? "endless" : "daily");
  const [mode, setMode] = useState<Mode>(read);
  useEffect(() => {
    const onHash = (): void => setMode(read());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return [
    mode,
    (next) => {
      window.location.hash = next === "daily" ? "" : "/endless";
      setMode(next);
    },
  ];
}

export function App(): React.ReactElement {
  const { t } = useLocale();
  const [mode, setMode] = useMode();
  const daily = useBabelle("daily");
  // Endless waits until the day is done, so it can never give the day away.
  const unlocked = daily.status !== "playing";
  const practice = useBabelle("endless", mode === "endless" && unlocked);
  const [sheet, setSheet] = useState<"rules" | "stats" | null>(() =>
    readJson<boolean>(SEEN_RULES_KEY) ? null : "rules",
  );
  const closeSheet = (): void => {
    if (sheet === "rules") writeJson(SEEN_RULES_KEY, true);
    setSheet(null);
  };
  useNewDay(daily.date);

  const game = mode === "endless" ? practice : daily;

  return (
    <div className="app">
      <Topbar mode={mode} setMode={setMode} locked={!unlocked} onSheet={setSheet} />

      {mode === "endless" && !unlocked ? (
        <main className="stage stage--locked">
          <section className="locked">
            <svg viewBox="0 0 24 24" className="locked__icon" aria-hidden="true">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            <h2 className="locked__title">{t("endlessLocked")}</h2>
            <p className="locked__hint">{t("endlessLockedHint")}</p>
            <button type="button" className="button button--primary" onClick={() => setMode("daily")}>
              {t("playDaily")}
            </button>
          </section>
        </main>
      ) : (
        // A new round (or the other mode) starts with its own review state.
        <Play key={mode === "endless" ? `endless-${game.round}` : "daily"} game={game} />
      )}

      <footer className="credits">
        <a href="/games/">akinozgen.com/games</a>
        <span>{t("credit")}</span>
      </footer>

      {sheet === "rules" && <HowToPlay onClose={closeSheet} />}
      {sheet === "stats" && (
        <Sheet title={t("stats")} onClose={closeSheet}>
          <h3>{t("statsDaily")}</h3>
          <StatsView stats={daily.stats} />
          <h3>{t("statsEndless")}</h3>
          <StatsView stats={practice.stats} />
        </Sheet>
      )}
    </div>
  );
}

function Topbar({
  mode,
  setMode,
  locked,
  onSheet,
}: {
  mode: Mode;
  setMode: (mode: Mode) => void;
  locked: boolean;
  onSheet: (sheet: "rules" | "stats") => void;
}): React.ReactElement {
  const { t } = useLocale();
  return (
    <header className="topbar">
      <div className="brand">
        <svg viewBox="0 0 32 32" className="brand__mark" aria-hidden="true">
          <path d="M5 6h13a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-6l-5 4v-4H5a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3z" />
          <path className="brand__mark-b" d="M14 13h13a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-1v4l-5-4h-7a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3z" />
        </svg>
        <h1 className="brand__name">babelle</h1>
        <span className="brand__tag">{t("tagline")}</span>
      </div>
      <nav className="modes" aria-label={`${t("modeDaily")} / ${t("modeEndless")}`}>
        {(["daily", "endless"] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={`modes__tab${mode === option ? " is-on" : ""}`}
            aria-current={mode === option ? "page" : undefined}
            onClick={() => setMode(option)}
          >
            {option === "daily" ? t("modeDaily") : t("modeEndless")}
            {option === "endless" && locked && (
              <svg viewBox="0 0 24 24" className="modes__lock" aria-hidden="true">
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
            )}
          </button>
        ))}
      </nav>
      <nav className="topbar__tools">
        <LanguagePicker />
        <button type="button" className="icon-button" aria-label={t("stats")} onClick={() => onSheet("stats")}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 20V11M12 20V5M19 20v-6" />
          </svg>
        </button>
        <button type="button" className="icon-button" aria-label={t("rules")} onClick={() => onSheet("rules")}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6" />
            <circle cx="12" cy="17" r=".6" />
          </svg>
        </button>
      </nav>
    </header>
  );
}

/** One round on screen: the question, the final or the result, and the notebook. */
function Play({ game }: { game: Babelle }): React.ReactElement {
  const { t, language } = useLocale();
  const verdict = game.verdict;
  const answered = verdict?.answers.length ?? 0;
  // Answers the player has moved past. A fresh answer is shown with its
  // result until they press on; a reload skips straight to what's next.
  const [moved, setMoved] = useState<number | null>(null);
  const passed = moved ?? answered;
  useEffect(() => {
    if (verdict && moved === null) setMoved(verdict.answers.length);
  }, [verdict, moved]);

  let stage: React.ReactNode;
  if (!verdict) {
    stage = (
      <section className="question question--empty">
        {game.failed ? (
          <p>
            {t("serverError")}{" "}
            <button type="button" className="link-button" onClick={game.retry}>
              {t("retry")}
            </button>
          </p>
        ) : (
          <p className="muted">{t("loading")}</p>
        )}
      </section>
    );
  } else if (passed < answered) {
    const index = answered - 1;
    stage = (
      <QuestionCard
        question={verdict.questions[index]}
        index={index}
        result={verdict.answers[index]}
        results={verdict.answers}
        pending={game.pending}
        onPick={() => undefined}
        onNext={() => setMoved(answered)}
      />
    );
  } else if (verdict.phase === "questions") {
    stage = (
      <QuestionCard
        question={verdict.questions[answered]}
        index={answered}
        result={null}
        results={verdict.answers}
        pending={game.pending}
        onPick={game.answer}
        onNext={() => undefined}
      />
    );
  } else if (verdict.phase === "final") {
    stage = <FinalCard guesses={verdict.guesses} status={game.status} pending={game.pending} onGuess={game.guess} />;
  } else {
    stage = (
      <>
        <EndCard
          number={game.number}
          verdict={verdict}
          onNext={game.mode === "endless" ? game.next : undefined}
        />
        <div className="stage__rows">
          <GuessRows guesses={verdict.guesses} pending={false} compact />
        </div>
      </>
    );
  }

  return (
      <main className="stage">
        <section className="stage__main">
          <p className="stage__meta">
            {game.mode === "endless" ? (
              <span>{t("endlessRound", { n: game.stats.played + (game.status === "playing" ? 1 : 0) })}</span>
            ) : (
              <>
                <span>{t("puzzle", { n: game.number })}</span>
                <span aria-hidden="true">·</span>
                <time dateTime={game.date}>
                  {new Date(`${game.date}T12:00:00`).toLocaleDateString(language, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </time>
              </>
            )}
          </p>
          <div className="stage__card">{stage}</div>
        </section>

        <aside className="panel">
          <Notebook verdict={verdict} />
          {game.status !== "playing" && (
            <div className="panel__stats">
              <StatsView
                stats={game.stats}
                today={game.status === "won" ? verdict?.guesses.length : undefined}
              />
            </div>
          )}
        </aside>
      </main>

  );
}

/** A tab left open overnight moves on to the new day's language. */
function useNewDay(date: string): void {
  useEffect(() => {
    const check = (): void => {
      if (document.visibilityState === "visible" && playDate() !== date) window.location.reload();
    };
    const id = window.setInterval(check, 30_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [date]);
}
