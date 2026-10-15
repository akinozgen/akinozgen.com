import type { PastGame, PastOutcome } from "@harfiyen/engine";
import { useState } from "react";
import type { HistoryState } from "../game/history.ts";
import { splitName } from "../game/names.ts";
import { ago } from "../game/turkish.ts";
import { Monogram } from "./Monogram.tsx";

/** Games shown before "Tümünü göster". */
export const HISTORY_SHOWN = 5;

const OUTCOME: Record<PastOutcome, { chip: string; tone: string; said: string }> = {
  won: { chip: "Kazandın", tone: "won", said: "Kazandın" },
  lost: { chip: "Kaybettin", tone: "lost", said: "Kaybettin" },
  draw: { chip: "Berabere", tone: "draw", said: "Berabere bitti" },
  abandoned: { chip: "Kapandı", tone: "draw", said: "Uzun süre hamle yapılmadığı için sonuçsuz kapandı" },
};

/**
 * The account's online record, from the server: the totals over every
 * game, then the latest ones — who against, the score, how it ended, when.
 * Games closed for want of moves are listed but not counted.
 */
export function HistoryCard({ state, now }: { state: HistoryState; now: number }): React.ReactElement {
  const { history, failed } = state;
  const [all, setAll] = useState(false);
  const empty = history !== null && history.played === 0 && history.games.length === 0;
  const shown = history ? (all ? history.games : history.games.slice(0, HISTORY_SHOWN)) : [];

  return (
    <section className="hub-card history" aria-labelledby="history-title" aria-busy={history === null && !failed}>
      <header className="games__head">
        <h2 id="history-title" className="games__title">
          Geçmişin
        </h2>
        {failed && history !== null && <span className="games__stale">Güncellenemedi</span>}
      </header>

      {history === null ? (
        failed ? (
          <p className="history__note">Geçmiş şu an yüklenemedi. Biraz sonra yeniden dene.</p>
        ) : (
          <div className="history__loading" aria-hidden="true">
            <span className="skeleton-block history__skeleton-grid" />
            <span className="skeleton-line" style={{ width: "72%" }} />
            <span className="skeleton-line" style={{ width: "56%" }} />
          </div>
        )
      ) : empty ? (
        <p className="history__note">Henüz biten bir oyunun yok. Bitirdiğin her oyun burada sonucuyla birikir.</p>
      ) : (
        <>
          <dl className="stats__grid history__totals">
            {(
              [
                ["Oynanan", history.played, ""],
                ["Kazanılan", history.won, " is-won"],
                ["Kaybedilen", history.lost, " is-lost"],
                ["Berabere", history.drawn, ""],
              ] as const
            ).map(([label, value, tone]) => (
              <div key={label} className={`stats__cell${tone}`}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {history.games.length > 0 && (
            <>
              <h3 className="group__title">Son oyunlar</h3>
              <ul className="rows">
                {shown.map((game) => (
                  <li key={`${game.code}:${game.gameNo}`}>
                    <PastRow game={game} now={now} />
                  </li>
                ))}
              </ul>
              {history.games.length > HISTORY_SHOWN && (
                <button type="button" className="link-button history__more" aria-expanded={all} onClick={() => setAll(!all)}>
                  {all ? "Daha az göster" : `Tümünü göster (${history.games.length})`}
                </button>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

function PastRow({ game, now }: { game: PastGame; now: number }): React.ReactElement {
  const name = game.opponent ? splitName(game.opponent) : null;
  const outcome = OUTCOME[game.outcome];
  return (
    <div className={`row row--past row--${outcome.tone}`}>
      <Monogram name={game.opponent} size="sm" />
      <span className="row__name">
        {name ? (
          <>
            {name.base} {name.number && <span className="row__number">#{name.number}</span>}
          </>
        ) : (
          "Rakip"
        )}
      </span>
      <span className="row__score" aria-label={`Sen ${game.you}, rakip ${game.them}`}>
        <b>{game.you}</b>
        <i aria-hidden="true">–</i>
        <span>{game.them}</span>
      </span>
      <span className="row__when">{ago(game.endedAt, now)}</span>
      <span className={`chip chip--${outcome.tone}`} title={outcome.said}>
        {outcome.chip}
      </span>
    </div>
  );
}
