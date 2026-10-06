import { readJson, writeJson } from "@travelle/core";
import { band, ROUNDS } from "@sizele/data/client";
import { useEffect, useState } from "react";
import { EndCard } from "./components/EndCard.tsx";
import { GuessPanel } from "./components/GuessPanel.tsx";
import { HardToggle } from "./components/HardToggle.tsx";
import { HowToPlay } from "./components/HowToPlay.tsx";
import { LanguagePicker } from "./components/LanguagePicker.tsx";
import { MapView } from "./components/MapView.tsx";
import { ratioText } from "./game/ratio.ts";
import { Sheet } from "./components/Sheet.tsx";
import { StatsView } from "./components/StatsView.tsx";
import { type Mode, playDate, useSizele } from "./game/useSizele.ts";
import { useLocale } from "./i18n/index.tsx";

const SEEN_RULES_KEY = "sizele:seen-rules:v1";

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
  const { t, name, language } = useLocale();
  const [mode, setMode] = useMode();
  const daily = useSizele("daily");
  // Endless waits until the day's game is done, so it can never spoil it.
  const locked = mode === "endless" && !daily.played;
  const practice = useSizele("endless", mode === "endless" && !locked);
  const game = mode === "endless" ? practice : daily;
  const [sheet, setSheet] = useState<"rules" | "stats" | null>(() =>
    readJson<boolean>(SEEN_RULES_KEY) ? null : "rules",
  );
  const closeSheet = (): void => {
    if (sheet === "rules") writeJson(SEEN_RULES_KEY, true);
    setSheet(null);
  };

  useNewDay(daily.date);

  // The map shows the round on screen; at the end, the last one, settled.
  const round = game.current;
  const result = game.result;
  // The numbers wait for the country to land: the move is the reveal.
  const roundKey = `${mode}-${game.round}-${game.showing}`;
  const [landed, setLanded] = useState<string | null>(null);

  // On a phone the panel sits under the map; a new round starts at the map.
  useEffect(() => {
    const frame = document.querySelector(".frame");
    if (frame && frame.getBoundingClientRect().top < 0) frame.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [game.showing]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg viewBox="0 0 32 32" className="brand__mark" aria-hidden="true">
            <rect x="3" y="9" width="13" height="19" rx="2.5" />
            <rect x="17" y="3" width="12" height="12" rx="2.5" />
            <rect x="19.5" y="19" width="7" height="7" rx="1.5" />
          </svg>
          <h1 className="brand__name">sizele</h1>
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
              {option === "endless" && !daily.played && (
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

      {locked ? (
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
        <main className="stage" key={mode === "endless" ? `endless-${game.round}` : "daily"}>
          <section className="stage__board">
            <div className="stage__meta">
              <p className="stage__when">
                {mode === "endless" ? (
                  <span>{t("endlessRound", { n: game.stats.played + (game.played ? 0 : 1) })}</span>
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
              <ol className="pips" aria-hidden="true">
                {Array.from({ length: ROUNDS }, (_, i) => {
                  const done = game.results[i];
                  return (
                    <li
                      key={i}
                      className={`pip${done ? ` pip--${band(done.score)}` : ""}${i === game.showing && !game.over ? " is-now" : ""}`}
                    />
                  );
                })}
              </ol>
            </div>
            <div className="frame">
              {round ? (
                <MapView
                  key={roundKey}
                  round={round}
                  moving={!!result || game.pending}
                  named={!game.hard || !!result}
                  name={name}
                  label={
                    !game.hard || result
                      ? t("mapLabel", { unit: name(round.unit.id), target: name(round.target.id) })
                      : t("mapLabelHidden")
                  }
                  ratioText={result ? `×${ratioText(result.ratio, language)}` : null}
                  onLanded={() => setLanded(roundKey)}
                />
              ) : (
                <div className="table table--empty">
                  {game.failed ? (
                    <p className="notice" role="alert">
                      {t("serverError")}{" "}
                      <button type="button" className="link-button" onClick={game.retry}>
                        {t("retry")}
                      </button>
                    </p>
                  ) : (
                    <p className="table__loading">{t("loading")}</p>
                  )}
                </div>
              )}
            </div>
          </section>

          <aside className="panel">
            {game.over ? (
              <>
                <EndCard
                  number={game.number}
                  date={game.date}
                  total={game.total}
                  results={game.results}
                  rounds={game.rounds}
                  hardAll={game.hardAll}
                  onNext={mode === "endless" ? game.next : undefined}
                />
                <div className="panel__stats">
                  <StatsView stats={game.stats} />
                </div>
              </>
            ) : round ? (
              <>
                <GuessPanel
                  round={round}
                  index={game.showing}
                  total={ROUNDS}
                  result={result}
                  landed={landed === roundKey}
                  draft={game.draft}
                  named={!game.hard || !!result}
                  onDraft={game.setDraft}
                  pending={game.pending}
                  last={game.showing === ROUNDS - 1}
                  onGuess={game.guess}
                  onNext={game.advance}
                />
                {game.failed && (
                  <p className="notice" role="alert">
                    {t("serverError")}{" "}
                    <button type="button" className="link-button" onClick={game.retry}>
                      {t("retry")}
                    </button>
                  </p>
                )}
                <HardToggle on={game.hard} onChange={game.setHard} />
              </>
            ) : (
              <p className="table__loading">{t("loading")}</p>
            )}
          </aside>
        </main>
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

/** A tab left open overnight moves on to the new day's game. */
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
