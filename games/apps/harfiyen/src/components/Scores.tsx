import { type Level, type Table, type Turn, upper } from "@harfiyen/engine";
import { usePlayers } from "./players.tsx";

export const LEVEL_NAME: Record<Level, string> = { kolay: "Kolay", orta: "Orta", zor: "Zor" };

export function describe(turn: Turn): string {
  switch (turn.kind) {
    case "play":
      return turn.words.map((word) => upper(word)).join(", ");
    case "swap":
      return `${turn.count} harf değiştirdi`;
    case "pass":
      return "pas geçti";
    case "resign":
      return "pes etti";
  }
}

/**
 * Each side's total after every turn, from the start — `you` for seat `me`,
 * `bot` for the other — with the leftover settling at the end last.
 */
export function runningTotals(game: Table, me: number): { you: number; bot: number }[] {
  const them = 1 - me;
  const totals = [{ you: 0, bot: 0 }];
  let you = 0;
  let bot = 0;
  for (const turn of game.log) {
    if (turn.kind === "play") {
      if (turn.player === me) you += turn.score;
      else bot += turn.score;
    }
    totals.push({ you, bot });
  }
  if (game.over && (game.over.leftovers[me] !== 0 || game.over.leftovers[them] !== 0)) {
    totals.push({ you: game.scores[me], bot: game.scores[them] });
  }
  return totals;
}

function Dots(): React.ReactElement {
  return (
    <span className="dots" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

/** Both scores, whose turn it is, the lead and the bag. Compact on a phone, a full card in the panel. */
export function Scoreboard({
  game,
  level,
  thinking,
  compact = false,
  onBag,
}: {
  game: Table;
  /** The computer's level, shown beside it; not online. */
  level?: Level;
  thinking: boolean;
  compact?: boolean;
  onBag?: () => void;
}): React.ReactElement {
  const players = usePlayers();
  const { me, them } = players;
  const you = game.scores[me];
  const bot = game.scores[them];
  const diff = you - bot;
  const total = Math.max(0, you) + Math.max(0, bot);
  const share = total === 0 ? 50 : (Math.max(0, you) / total) * 100;
  const lead =
    diff === 0
      ? game.log.length === 0
        ? "Henüz puan yok"
        : "Başa baş"
      : diff > 0
        ? game.over
          ? `${diff} puan farkla`
          : `${diff} puan öndesin`
        : game.over
          ? `${-diff} puan farkla`
          : `${-diff} puan geridesin`;

  const side = (player: number): React.ReactElement => {
    const turn = game.turn === player && !game.over;
    const won = game.over?.winner === player;
    return (
      <div
        className={`score score--${player === me ? "you" : "bot"}${turn ? " is-turn" : ""}${won ? " is-winner" : ""}`}
        aria-current={turn ? "true" : undefined}
      >
        <span className="score__name">
          <span
            className={`score__dot${players.online && player === them ? (players.online[player] ? " is-online" : " is-away") : ""}`}
            aria-hidden="true"
          />
          <span className="score__full">{players.name(player)}</span>
          {compact && <span className="score__short">{players.short(player)}</span>}
          {player === them && level && <span className="score__level">{LEVEL_NAME[level]}</span>}
        </span>
        <span className="score__points" key={game.scores[player]}>
          {game.scores[player]}
        </span>
        {!compact && (
          <span className="score__state">
            {won ? (
              <>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 18h16M5 18 3.5 8l5 4L12 5l3.5 7 5-4L19 18" />
                </svg>
                Kazandı
              </>
            ) : turn && player === me ? (
              "Sıra sende"
            ) : turn && thinking ? (
              <>
                Düşünüyor
                <Dots />
              </>
            ) : turn ? (
              "Sırası"
            ) : (
              " "
            )}
          </span>
        )}
        {compact && turn && player === them && thinking && <Dots />}
      </div>
    );
  };

  if (compact) {
    return (
      <div className="strip" aria-label={`Sen ${you}, bilgisayar ${bot}`}>
        {side(me)}
        <span className={`strip__diff${diff > 0 ? " is-ahead" : diff < 0 ? " is-behind" : ""}`} aria-hidden="true">
          {diff > 0 ? `▲${diff}` : diff < 0 ? `▼${-diff}` : "="}
        </span>
        {side(them)}
        <button type="button" className="strip__bag" onClick={onBag} aria-label={`Torbada ${game.bagCount} taş; kalan harfleri gör`}>
          <BagIcon />
          <span>{game.bagCount}</span>
        </button>
      </div>
    );
  }

  return (
    <section className="board-score" aria-label="Puan durumu">
      <div className="board-score__sides">
        {side(me)}
        {side(them)}
      </div>
      <div className="tug" aria-hidden="true">
        <span className="tug__you" style={{ width: `${share}%` }} />
        <span className="tug__bot" />
      </div>
      <p className="board-score__lead">
        <span className={diff > 0 ? "is-ahead" : diff < 0 ? "is-behind" : ""}>{lead}</span>
        <span className="board-score__bag">
          <BagIcon />
          Torbada {game.bagCount} taş
        </span>
      </p>
    </section>
  );
}

export function BagIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="bag-icon">
      <path d="M8 7V6a4 4 0 0 1 8 0v1" />
      <path d="M5 7h14l-1.2 12.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z" />
    </svg>
  );
}

/** Every turn so far, newest first, with each player's running total. */
export function MoveLog({ game }: { game: Table }): React.ReactElement {
  const players = usePlayers();
  if (game.log.length === 0) return <p className="muted log__empty">Henüz hamle yok.</p>;
  const totals = runningTotals(game, players.me);
  return (
    <ol className="log" aria-label="Hamleler, en yenisi üstte">
      {[...game.log].reverse().map((turn, r) => {
        const i = game.log.length - 1 - r;
        const mine = turn.player === players.me;
        const after = totals[i + 1];
        return (
          <li key={i} className={`log__turn log__turn--${mine ? "you" : "bot"}${r === 0 ? " is-last" : ""}`}>
            <span className="log__n">{i + 1}</span>
            <span className="log__what">
              <span className="log__who">{players.name(turn.player)}</span>
              <span className={`log__words${turn.kind === "play" ? "" : " is-quiet"}`}>{describe(turn)}</span>
              {turn.kind === "play" && (turn.bingo || turn.star) && (
                <span className="log__badges">
                  {turn.bingo && <span className="badge badge--bingo">Hepsi +30</span>}
                  {turn.star && <span className="badge badge--star">★ +25</span>}
                </span>
              )}
            </span>
            <span className="log__score">{turn.kind === "play" ? `+${turn.score}` : "–"}</span>
            <span className="log__total">{mine ? after.you : after.bot}</span>
          </li>
        );
      })}
    </ol>
  );
}
