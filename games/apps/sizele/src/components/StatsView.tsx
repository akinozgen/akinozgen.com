import type { Stats } from "../game/useSizele.ts";
import { useLocale } from "../i18n/index.tsx";

export function StatsView({ stats }: { stats: Stats }): React.ReactElement {
  const { t } = useLocale();
  const average = stats.played > 0 ? Math.round(stats.points / stats.played) : 0;
  return (
    <div className="stats">
      <dl className="stats__grid stats__grid--six">
        {(
          [
            ["statPlayed", stats.played],
            ["statAverage", average],
            ["statBest", stats.best],
            ["statStreak", stats.streak],
            ["statLongest", stats.longest],
            ["statGreats", stats.greats],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="stats__cell">
            <dt>{t(label)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {stats.played === 0 && <p className="muted">{t("statsEmpty")}</p>}
    </div>
  );
}
