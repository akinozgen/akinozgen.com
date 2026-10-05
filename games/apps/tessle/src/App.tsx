import { readJson, writeJson } from "@travelle/core";
import { useEffect, useMemo, useState } from "react";
import { Board } from "./components/Board.tsx";
import { EndCard } from "./components/EndCard.tsx";
import { HardToggle } from "./components/HardToggle.tsx";
import { HowToPlay } from "./components/HowToPlay.tsx";
import { LanguagePicker } from "./components/LanguagePicker.tsx";
import { Sheet } from "./components/Sheet.tsx";
import { StatsView } from "./components/StatsView.tsx";
import { clock, type Mode, playDate, type Tessle, useTessle } from "./game/useTessle.ts";
import { useLocale } from "./i18n/index.tsx";

const SEEN_RULES_KEY = "tessle:seen-rules:v1";

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

/** Fingers or a mouse: the hint under the table says which controls apply. */
function useCoarsePointer(): boolean {
  const query = "(pointer: coarse)";
  const [coarse, setCoarse] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const list = window.matchMedia?.(query);
    const onChange = (): void => setCoarse(list.matches);
    list?.addEventListener?.("change", onChange);
    return () => list?.removeEventListener?.("change", onChange);
  }, []);
  return coarse;
}

function Clock({ game }: { game: Tessle }): React.ReactElement {
  const [, tick] = useState(0);
  const running = game.started && game.status === "playing";
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => tick((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, [running]);
  return <>{clock(game.elapsed())}</>;
}

function GiveUp({ disabled, onConfirm }: { disabled: boolean; onConfirm: () => void }): React.ReactElement {
  const { t } = useLocale();
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" className="button giveup" disabled={disabled} onClick={() => setAsking(true)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 21V4M6 4h11l-2 4 2 4H6" />
        </svg>
        {t("giveUp")}
      </button>
    );
  }
  return (
    <div className="giveup giveup--asking" role="group" aria-label={t("giveUpAsk")}>
      <p className="giveup__ask">{t("giveUpAsk")}</p>
      <div className="giveup__row">
        <button type="button" className="button" onClick={() => setAsking(false)} autoFocus>
          {t("giveUpNo")}
        </button>
        <button
          type="button"
          className="button button--danger"
          onClick={() => {
            setAsking(false);
            onConfirm();
          }}
        >
          {t("giveUpYes")}
        </button>
      </div>
    </div>
  );
}

export function App(): React.ReactElement {
  const { t, name, language } = useLocale();
  const [mode, setMode] = useMode();
  const daily = useTessle("daily");
  // Endless waits until the day's map is done, so it can never spoil it.
  const locked = mode === "endless" && daily.status === "playing";
  const practice = useTessle("endless", mode === "endless" && !locked);
  const game = mode === "endless" ? practice : daily;
  const [sheet, setSheet] = useState<"rules" | "stats" | null>(() =>
    readJson<boolean>(SEEN_RULES_KEY) ? null : "rules",
  );
  const [fitSignal, setFitSignal] = useState(0);
  const coarse = useCoarsePointer();
  const closeSheet = (): void => {
    if (sheet === "rules") writeJson(SEEN_RULES_KEY, true);
    setSheet(null);
  };

  useNewDay(daily.date);

  const over = game.status !== "playing";
  const count = game.puzzle?.pieces.length ?? 0;
  const labels = useMemo(() => game.labels?.map(name) ?? null, [game.labels, name]);
  const seed = mode === "endless" ? (game.round ?? 0) : game.number;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg viewBox="0 0 32 32" className="brand__mark" aria-hidden="true">
            <path d="M4.5 7.5 14.5 5l2.4 7.2-3.6 4.6 1.8 9.2-9.6-1.2L3.5 16z" />
            <path d="M18.5 4.5 27.5 8l.6 8.6-6 1.6-4.2-5.6z" />
            <path d="M16.6 19.4l5.8-.2 6-1.2-1.6 9.4-10.6.4z" />
          </svg>
          <h1 className="brand__name">tessle</h1>
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
        // A new round (or the other mode) starts with a fresh table.
        <main className="stage" key={mode === "endless" ? `endless-${game.round}` : "daily"}>
          <section className="stage__board">
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
            <div className={`frame${over ? " is-over" : ""}${game.status === "won" ? " is-won" : ""}`}>
              {game.table ? (
                <Board
                  table={game.table}
                  seed={seed}
                  labels={labels}
                  interactive={!over}
                  over={over}
                  label={t("boardLabel", { n: count })}
                  onAct={game.act}
                  fitSignal={fitSignal}
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
              {game.table && (
                <button
                  type="button"
                  className="icon-button frame__fit"
                  aria-label={t("fitView")}
                  title={t("fitView")}
                  onClick={() => setFitSignal((n) => n + 1)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                  </svg>
                </button>
              )}
            </div>
            <p className="stage__caption" aria-live="polite">
              {over ? (game.status === "won" ? t("solvedIn", { time: clock(game.elapsed()) }) : t("shown")) : coarse ? t("hintTouch") : t("hintMouse")}
            </p>
          </section>

          <aside className="panel">
            {!over ? (
              <>
                <div className="panel__head">
                  <h2 className="panel__title">{count > 0 ? t("countries", { n: count }) : "…"}</h2>
                </div>
                <dl className="tally">
                  <div className="tally__cell">
                    <dt>{t("time")}</dt>
                    <dd>
                      <Clock game={game} />
                    </dd>
                  </div>
                  <div className="tally__cell">
                    <dt>{t("moves")}</dt>
                    <dd>{game.moves}</dd>
                  </div>
                  <div className="tally__cell">
                    <dt>{t("left")}</dt>
                    <dd>{game.left}</dd>
                  </div>
                </dl>
                {game.failed && game.table && (
                  <p className="notice" role="alert">
                    {t("serverError")}{" "}
                    <button type="button" className="link-button" onClick={game.retry}>
                      {t("retry")}
                    </button>
                  </p>
                )}
                <HardToggle on={game.hard} onChange={game.setHard} />
                <GiveUp disabled={!game.table || game.loading} onConfirm={game.giveUp} />
              </>
            ) : (
              <>
                <EndCard
                  number={game.number}
                  status={game.status}
                  ids={game.reveal?.ids ?? []}
                  elapsed={game.elapsed()}
                  moves={game.moves}
                  hardAll={game.hardAll}
                  onNext={mode === "endless" ? game.next : undefined}
                />
                <div className="panel__stats">
                  <StatsView stats={game.stats} />
                </div>
              </>
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

/**
 * A tab left open overnight, or brought back from the background on a
 * phone, moves on to the new day's map instead of showing yesterday's.
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
