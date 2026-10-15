import { letterIndex, VALUES } from "@harfiyen/engine";
import { LEVEL_NAME } from "./Scores.tsx";
import type { Stats } from "./stats.ts";
import { Tile } from "./Tile.tsx";

/** The record: totals, the best move, how it goes at each level, and the last few games. */
export function StatsView({ stats, fresh = false }: { stats: Stats; fresh?: boolean }): React.ReactElement {
  const rate = stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;
  const average = stats.played > 0 ? Math.round(stats.points / stats.played) : 0;
  const widest = Math.max(20, ...stats.recent.map((g) => Math.abs(g.you - g.bot)));

  return (
    <div className="stats">
      <dl className="stats__grid">
        {(
          [
            ["Oyun", stats.played],
            ["Kazanma %", rate],
            ["En yüksek", stats.best],
            ["Ortalama", average],
            ["Hepsi +30", stats.bingos],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="stats__cell">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {stats.played === 0 ? (
        <p className="muted stats__empty">Bir oyunu bitirince istatistiğin burada birikir.</p>
      ) : (
        <>
          {stats.bestMove && stats.bestMove.word && (
            <>
              <h3 className="stats__title">En iyi hamlen</h3>
              <div className="stats__move">
                <span className="stats__tiles" aria-label={stats.bestMove.word}>
                  {[...stats.bestMove.word.toLocaleLowerCase("tr")].slice(0, 12).map((char, i) => {
                    const letter = letterIndex(char);
                    const joker = stats.bestMove!.jokers?.includes(i) ?? false;
                    return letter >= 0 ? <Tile key={i} letter={letter} joker={joker} value={joker ? 0 : VALUES[letter]} /> : null;
                  })}
                </span>
                <strong className="stats__move-score">+{stats.bestMove.score}</strong>
              </div>
            </>
          )}

          <h3 className="stats__title">Rakibe göre</h3>
          <ul className="levels">
            {(["kolay", "orta", "zor"] as const).map((level) => {
              const row = stats.levels[level];
              const share = row.played > 0 ? (row.won / row.played) * 100 : 0;
              return (
                <li key={level} className="levels__row">
                  <span className="levels__name">{LEVEL_NAME[level]}</span>
                  <span className="levels__track" aria-hidden="true">
                    <span className="levels__bar" style={{ width: `${share}%` }} />
                  </span>
                  <span className="levels__nums">
                    {row.played > 0 ? (
                      <>
                        <strong>{row.won}</strong>/{row.played}
                      </>
                    ) : (
                      "–"
                    )}
                  </span>
                </li>
              );
            })}
          </ul>

          {stats.recent.length > 0 && (
            <>
              <h3 className="stats__title">Son oyunlar</h3>
              <ol className="recent" aria-label="Son oyunlar, puan farkıyla">
                {stats.recent.map((g, i) => {
                  const diff = g.you - g.bot;
                  const result = g.result ?? (diff > 0 ? "won" : diff < 0 ? "lost" : "draw");
                  const last = fresh && i === stats.recent.length - 1;
                  return (
                    <li
                      key={i}
                      className={`recent__game is-${result}${last ? " is-latest" : ""}`}
                      title={`${g.you} – ${g.bot} · ${LEVEL_NAME[g.level]}${result === "won" ? " · kazandın" : result === "lost" ? " · kaybettin" : " · berabere"}`}
                      aria-label={`${g.you} – ${g.bot}, ${LEVEL_NAME[g.level]}, ${result === "won" ? "kazandın" : result === "lost" ? "kaybettin" : "berabere"}`}
                    >
                      <span className="recent__bar" style={{ height: `${Math.max(6, (Math.abs(diff) / widest) * 100)}%` }} />
                    </li>
                  );
                })}
              </ol>
              <p className="recent__key muted">
                <span className="recent__swatch is-won" /> kazandın <span className="recent__swatch is-lost" /> kaybettin · çubuk boyu puan farkı
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
