import { readJson, writeJson } from "@travelle/core";
import { TILES } from "@vexle/data/client";
import { useEffect, useState } from "react";
import { Compass } from "./components/Compass.tsx";
import { Dice } from "./components/Dice.tsx";
import { EndCard } from "./components/EndCard.tsx";
import { FlagBoard } from "./components/FlagBoard.tsx";
import { GuessInput } from "./components/GuessInput.tsx";
import { GuessRows } from "./components/GuessRows.tsx";
import { HardToggle } from "./components/HardToggle.tsx";
import { HowToPlay } from "./components/HowToPlay.tsx";
import { LanguagePicker } from "./components/LanguagePicker.tsx";
import { Sheet } from "./components/Sheet.tsx";
import { StatsView } from "./components/StatsView.tsx";
import { type Mode, playDate, useVexle } from "./game/useVexle.ts";
import { useLocale } from "./i18n/index.tsx";

const SEEN_RULES_KEY = "vexle:seen-rules:v1";
const EMPTY_TILES: Array<string | null> = Array.from({ length: TILES }, () => null);

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
  const daily = useVexle("daily");
  // Endless waits until the day's flag is done, so it can never spoil it.
  const locked = mode === "endless" && daily.status === "playing";
  const practice = useVexle("endless", mode === "endless" && !locked);
  const game = mode === "endless" ? practice : daily;
  const [sheet, setSheet] = useState<"rules" | "stats" | null>(() =>
    readJson<boolean>(SEEN_RULES_KEY) ? null : "rules",
  );
  const closeSheet = (): void => {
    if (sheet === "rules") writeJson(SEEN_RULES_KEY, true);
    setSheet(null);
  };

  useNewDay(daily.date);

  const verdict = game.verdict;
  const results = verdict?.results ?? [];
  const over = game.status !== "playing";
  // Until the die is rolled its tile stays covered on screen.
  const opened = (verdict?.opened ?? []).slice(game.needsRoll ? 1 : 0);
  const tiles = (verdict?.tiles ?? EMPTY_TILES).map((tile, i) => (opened.includes(i) ? tile : null));
  const openCount = opened.length;

  const caption = over
    ? t("captionDone", { country: name(verdict!.answer!) })
    : game.needsRoll
      ? t("captionRoll")
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
        <nav className="modes" aria-label={t("modeDaily") + " / " + t("modeEndless")}>
          {(["daily", "endless"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={`modes__tab${mode === option ? " is-on" : ""}`}
              aria-current={mode === option ? "page" : undefined}
              onClick={() => setMode(option)}
            >
              {option === "daily" ? t("modeDaily") : t("modeEndless")}
              {option === "endless" && daily.status === "playing" && (
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
      // A new round (or the other mode) starts with a fresh board and compass.
      <main className="stage" key={mode === "endless" ? `endless-${game.round}` : "daily"}>
        <section className="stage__flag">
          <p className="stage__meta">
            {mode === "endless" ? (
              <span>{t("endlessRound", { n: game.stats.played + (over ? 0 : 1) })}</span>
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
          <FlagBoard
            tiles={tiles}
            opened={opened}
            whole={over}
            flag={verdict?.flag ?? null}
          >
            <Compass results={results} status={game.status} className="board__compass" />
            {game.needsRoll && verdict && <Dice face={verdict.opened[0] + 1} onRolled={game.roll} />}
          </FlagBoard>
          <p className={`stage__caption${over ? " is-done" : ""}`} aria-live="polite">
            {caption}
          </p>
          {/* Once it's over the guesses sit under the flag they were spent on. */}
          {over && (
            <div className="stage__rows">
              <GuessRows results={results} pending={false} limit={game.limit} compact />
            </div>
          )}
        </section>

        <aside className="panel">
          {!over && (
            <>
              <div className="panel__head">
                <h2 className="panel__title">{t("guessOf", { n: Math.min(results.length + 1, game.limit), total: game.limit })}</h2>
                <ol className="pips" aria-hidden="true">
                  {Array.from({ length: game.limit }, (_, i) => (
                    <li key={i} className={`pip${i < results.length ? ` is-used dot--${i + 1}` : ""}`} />
                  ))}
                </ol>
              </div>
              <GuessInput
                taken={game.guesses}
                disabled={game.pending || game.needsRoll || !verdict}
                placeholder={game.needsRoll ? t("rollFirst") : undefined}
                onGuess={game.guess}
              />
              {game.failed && (
                <p className="notice" role="alert">
                  {t("serverError")}{" "}
                  <button type="button" className="link-button" onClick={game.retry}>
                    {t("retry")}
                  </button>
                </p>
              )}
            </>
          )}

          {over && verdict && (
            <>
              <EndCard
              number={game.number}
              verdict={verdict}
              guesses={results.length}
              hardAll={game.hardAll}
              onNext={mode === "endless" ? game.next : undefined}
              />
              <div className="end-rows">
                <GuessRows results={results} pending={false} limit={game.limit} compact />
              </div>
            </>
          )}

          {!over && <GuessRows results={results} pending={game.pending} limit={game.limit} />}

          {over ? (
            <div className="panel__stats">
              <StatsView
                stats={game.stats}
                today={game.status === "won" ? results.length : undefined}
              />
            </div>
          ) : (
            <HardToggle on={game.hard} disabled={game.pending && game.guesses.length > 0} onChange={game.setHard} />
          )}
        </aside>
      </main>
      )}

      <footer className="credits">
        <a href="/games/">akinozgen.com/games</a>
        <span>{t("flagCredit")}</span>
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

/**
 * A tab left open overnight, or brought back from the background on a
 * phone, moves on to the new day's flag instead of showing yesterday's.
 */
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
