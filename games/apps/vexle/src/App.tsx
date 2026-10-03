import { readJson, writeJson } from "@travelle/core";
import { TILES } from "@vexle/data/client";
import { useState } from "react";
import { Compass } from "./components/Compass.tsx";
import { EndCard } from "./components/EndCard.tsx";
import { FlagBoard } from "./components/FlagBoard.tsx";
import { GuessInput } from "./components/GuessInput.tsx";
import { GuessRows } from "./components/GuessRows.tsx";
import { HardToggle } from "./components/HardToggle.tsx";
import { HowToPlay } from "./components/HowToPlay.tsx";
import { LanguagePicker } from "./components/LanguagePicker.tsx";
import { Sheet } from "./components/Sheet.tsx";
import { StatsView } from "./components/StatsView.tsx";
import { useVexle } from "./game/useVexle.ts";
import { useLocale } from "./i18n/index.tsx";

const SEEN_RULES_KEY = "vexle:seen-rules:v1";
const EMPTY_TILES: Array<string | null> = Array.from({ length: TILES }, () => null);

export function App(): React.ReactElement {
  const { t, name, language } = useLocale();
  const game = useVexle();
  const [sheet, setSheet] = useState<"rules" | "stats" | null>(() =>
    readJson<boolean>(SEEN_RULES_KEY) ? null : "rules",
  );
  const closeSheet = (): void => {
    if (sheet === "rules") writeJson(SEEN_RULES_KEY, true);
    setSheet(null);
  };

  const verdict = game.verdict;
  const results = verdict?.results ?? [];
  const over = game.status !== "playing";
  const openCount = verdict?.opened.length ?? 0;

  const caption = over
    ? t("captionDone", { country: name(verdict!.answer!) })
    : openCount === 0
      ? t("captionStart")
      : t("captionOpen", { n: openCount, total: TILES });

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg viewBox="0 0 32 32" className="brand__mark" aria-hidden="true">
            <rect x="6" y="4" width="3" height="24" rx="1.5" />
            <path d="M9 5h17l-4.5 5.5L26 16H9z" />
          </svg>
          <h1 className="brand__name">vexle</h1>
          <span className="brand__tag">{t("tagline")}</span>
        </div>
        <nav className="topbar__tools">
          <LanguagePicker />
          <button type="button" className="icon-button" aria-label={t("stats")} onClick={() => setSheet("stats")}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V11M12 20V5M19 20v-6" /></svg>
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
        <section className="stage__flag">
          <p className="stage__meta">
            <span>{t("puzzle", { n: game.number })}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={game.date}>
              {new Date(`${game.date}T12:00:00`).toLocaleDateString(language, {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </time>
          </p>
          <FlagBoard tiles={verdict?.tiles ?? EMPTY_TILES} opened={verdict?.opened ?? []} whole={over}>
            <Compass results={results} status={game.status} className="board__compass" />
          </FlagBoard>
          <p className={`stage__caption${over ? " is-done" : ""}`} aria-live="polite">
            {caption}
          </p>
        </section>

        <aside className="panel">
          {!over && (
            <>
              <div className="panel__head">
                <h2 className="panel__title">{t("guessOf", { n: Math.min(results.length + 1, 6), total: 6 })}</h2>
                <ol className="pips" aria-hidden="true">
                  {Array.from({ length: 6 }, (_, i) => (
                    <li key={i} className={`pip${i < results.length ? ` is-used dot--${i + 1}` : ""}`} />
                  ))}
                </ol>
              </div>
              <GuessInput taken={game.guesses} disabled={game.pending} onGuess={game.guess} />
              {game.failed && (
                <p className="notice">
                  {t("serverError")}{" "}
                  <button type="button" className="link-button" onClick={game.retry}>
                    {t("retry")}
                  </button>
                </p>
              )}
            </>
          )}

          {over && verdict && (
            <EndCard
              number={game.number}
              verdict={verdict}
              guesses={results.length}
              hardAll={game.hardAll}
            />
          )}

          <GuessRows results={results} pending={game.pending} compact={over} />

          {over ? (
            <div className="panel__stats">
              <StatsView
                stats={game.stats}
                today={game.status === "won" ? results.length : undefined}
              />
            </div>
          ) : (
            <HardToggle on={game.hard} onChange={game.setHard} />
          )}
        </aside>
      </main>

      <footer className="credits">
        <a href="/games/">akinozgen.com/games</a>
        <span aria-hidden="true">·</span>
        <span>{t("flagCredit")}</span>
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
