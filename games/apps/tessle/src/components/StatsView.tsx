import { clock, type Stats } from "../game/useTessle.ts";
import { useLocale } from "../i18n/index.tsx";

/** The record: totals, then how fast the solves have been. */
export function StatsView({ stats }: { stats: Stats }): React.ReactElement {
  const { t } = useLocale();
  const rate = stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;
  const average = stats.won > 0 ? clock(stats.totalTime / stats.won) : "–";
  const fastest = stats.fastest !== null ? clock(stats.fastest) : "–";

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
      {stats.played === 0 ? (
        <p className="muted">{t("statsEmpty")}</p>
      ) : (
        <dl className="stats__times">
          <div className="stats__time">
            <dt>{t("statFastest")}</dt>
            <dd>{fastest}</dd>
          </div>
          <div className="stats__time">
            <dt>{t("statAverage")}</dt>
            <dd>{average}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
