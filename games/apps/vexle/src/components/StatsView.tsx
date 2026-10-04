import { MAX_GUESSES } from "@vexle/data/client";
import type { Stats } from "../game/useVexle.ts";
import { useLocale } from "../i18n/index.tsx";

/** The record: totals, then a bar per number of guesses. */
export function StatsView({ stats, today }: { stats: Stats; today?: number }): React.ReactElement {
  const { t } = useLocale();
  const rate = stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;
  const top = Math.max(1, ...stats.distribution);

  return (
    <div className="stats">
      <dl className="stats__grid">
        {(
          [
            ["statPlayed", stats.played],
            ["statWin", rate],
            ["statStreak", stats.streak],
            ["statBest", stats.best],
            ["statHard", stats.hardWins],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="stats__cell">
            <dt>{t(label)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <h3 className="stats__title">{t("distribution")}</h3>
      {stats.played === 0 ? (
        <p className="muted">{t("statsEmpty")}</p>
      ) : (
        <ol className="dist">
          {/* Day 1 allowed six guesses; its sixth-guess wins keep their row. */}
          {Array.from({ length: (stats.distribution[MAX_GUESSES] ?? 0) > 0 ? MAX_GUESSES + 1 : MAX_GUESSES }, (_, i) => {
            const count = stats.distribution[i] ?? 0;
            return (
              <li key={i} className={`dist__row${today === i + 1 ? " is-today" : ""}`}>
                <span className="dist__label">{i + 1}</span>
                <span className="dist__track">
                  <span className="dist__bar" style={{ width: `${Math.max(7, (count / top) * 100)}%` }}>
                    {count}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
