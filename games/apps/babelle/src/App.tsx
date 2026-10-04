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
import { playDate, useBabelle } from "./game/useBabelle.ts";
import { useLocale } from "./i18n/index.tsx";

const SEEN_RULES_KEY = "babelle:seen-rules:v1";

export function App(): React.ReactElement {
  const { t, language } = useLocale();
  const game = useBabelle();
  const [sheet, setSheet] = useState<"rules" | "stats" | null>(() =>
    readJson<boolean>(SEEN_RULES_KEY) ? null : "rules",
  );
  const closeSheet = (): void => {
    if (sheet === "rules") writeJson(SEEN_RULES_KEY, true);
    setSheet(null);
  };
  useNewDay(game.date);

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
        <EndCard number={game.number} verdict={verdict} />
        <div className="stage__rows">
          <GuessRows guesses={verdict.guesses} pending={false} compact />
        </div>
      </>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg viewBox="0 0 32 32" className="brand__mark" aria-hidden="true">
            <path d="M5 6h13a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-6l-5 4v-4H5a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3z" />
            <path className="brand__mark-b" d="M14 13h13a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-1v4l-5-4h-7a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3z" />
          </svg>
          <h1 className="brand__name">babelle</h1>
          <span className="brand__tag">{t("tagline")}</span>
        </div>
        <nav className="topbar__tools">
          <LanguagePicker />
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

      <main className="stage">
        <section className="stage__main">
          <p className="stage__meta">
            <span>{t("puzzle", { n: game.number })}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={game.date}>
              {new Date(`${game.date}T12:00:00`).toLocaleDateString(language, {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </time>
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

      <footer className="credits">
        <a href="/games/">akinozgen.com/games</a>
        <span>{t("credit")}</span>
      </footer>

      {sheet === "rules" && <HowToPlay onClose={closeSheet} />}
      {sheet === "stats" && (
        <Sheet title={t("stats")} onClose={closeSheet}>
          <StatsView stats={game.stats} />
        </Sheet>
      )}
    </div>
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
