import { msUntilNextDay, type Stats } from "@travelle/core";
import { useEffect, useState } from "react";
import { Confetti } from "./Confetti.tsx";
import type { Puzzle } from "../game/puzzle.ts";
import { copyText, shareText } from "../game/share.ts";
import { plural, useLocale } from "../i18n/index.tsx";
import { puzzleTitle } from "../i18n/puzzleText.ts";
import type { Game } from "../game/useGame.ts";

/** Ticks down to local midnight, when the next daily puzzle turns over. */
function useCountdown(active: boolean): string | null {
  const [left, setLeft] = useState(() => (active ? msUntilNextDay() : 0));
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setLeft(msUntilNextDay()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  if (!active) return null;
  const total = Math.max(0, Math.floor(left / 1000));
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}

export function EndPanel({
  puzzle,
  game,
  stats,
}: {
  puzzle: Puzzle;
  game: Game;
  stats: Stats;
}): React.ReactElement {
  const { t, name } = useLocale();
  const [copied, setCopied] = useState(false);
  const countdown = useCountdown(puzzle.kind === "daily");
  const perfect = game.status === "won" && game.results.length === puzzle.shortest;

  const headline =
    game.status === "won"
      ? perfect
        ? t("wonPerfect")
        : t("wonIn", { n: game.results.length, total: puzzle.budget })
      : t("lost");

  const aside = [
    perfect ? t("perfectTag") : null,
    game.hints.length > 0 ? plural(t, game.hints.length, "hintTagOne", "hintTagMany") : null,
  ].filter((x): x is string => x !== null);
  const share = shareText(puzzle, puzzleTitle(puzzle, t), game.results, game.status, aside);

  return (
    <section className={`end${game.status === "won" ? " is-won" : ""}`}>
      {game.status === "won" && <Confetti />}
      <h2 className="end__headline">{headline}</h2>

      <p className="end__solution">
        <span className="end__label">{t("aShortestRoute")}</span>
        {[puzzle.start, ...game.solution, puzzle.end].map(name).join(" → ")}
      </p>

      <div className="end__actions">
        <button
          type="button"
          className="button button--primary"
          onClick={() => {
            void copyText(share).then((ok) => {
              setCopied(ok);
              window.setTimeout(() => setCopied(false), 2000);
            });
          }}
        >
          {copied ? t("copied") : t("share")}
        </button>
      </div>

      <pre className="end__preview">{share}</pre>

      {countdown && (
        <p className="end__countdown">
          {t("nextIn")} <strong>{countdown}</strong>
        </p>
      )}

      <dl className="stats">
        <div>
          <dt>{t("statPlayed")}</dt>
          <dd>{stats.played}</dd>
        </div>
        <div>
          <dt>{t("statSolved")}</dt>
          <dd>{stats.won}</dd>
        </div>
        <div>
          <dt>{t("statPerfect")}</dt>
          <dd>{stats.perfect}</dd>
        </div>
        <div>
          <dt>{t("statStreak")}</dt>
          <dd>{stats.streak}</dd>
        </div>
        <div>
          <dt>{t("statBest")}</dt>
          <dd>{stats.bestStreak}</dd>
        </div>
      </dl>
    </section>
  );
}
