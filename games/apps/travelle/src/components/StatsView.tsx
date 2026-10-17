import type { Stats } from "@travelle/core";
import { useLocale } from "../i18n/index.tsx";

/** The record. `imported`: signed in, how many of the rounds came from this device's record before the account. */
export function StatsView({ stats, imported = 0 }: { stats: Stats; imported?: number }): React.ReactElement {
  const { t } = useLocale();
  return (
    <>
      <dl className="stats">
        {(
          [
            ["statPlayed", stats.played],
            ["statSolved", stats.won],
            ["statPerfect", stats.perfect],
            ["statStreak", stats.streak],
            ["statBest", stats.bestStreak],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <dt>{t(label)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {stats.played === 0 && <p className="muted stats__note">{t("statsEmpty")}</p>}
      {imported > 0 && <p className="muted stats__note">{t("importedNote", { n: imported })}</p>}
    </>
  );
}
