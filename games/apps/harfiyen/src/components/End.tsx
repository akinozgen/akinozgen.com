import { type Table, upper } from "@harfiyen/engine";
import { useEffect, useRef } from "react";
import { Confetti } from "./Confetti.tsx";
import { type Players, usePlayers } from "./players.tsx";

function reasonText(game: Table, players: Players): string {
  const over = game.over!;
  const them = players.name(players.them);
  if (over.reason === "out") {
    // Whoever made the last move went out, whatever the leftovers came to (a lone joker is worth nothing).
    const finisher = game.log[game.log.length - 1]?.player === players.me ? "Elini sen bitirdin" : `${them} elini bitirdi`;
    const moved = Math.max(...over.leftovers);
    return moved > 0 ? `${finisher}; kalan harflerin ${moved} puanı el değiştirdi.` : `${finisher}.`;
  }
  if (over.reason === "stuck") return "Art arda pas ve değiştirme: oyun olduğu gibi bitti.";
  return over.winner === players.me ? `${them} pes etti.` : "Pes ettin.";
}

/** Under the board when the game is over: who won, by how much, and a way back in. */
export function ResultBanner({
  game,
  onAgain,
  onNew,
  againLabel = "Yeniden oyna",
  againDisabled = false,
  newLabel = "Ayarla…",
}: {
  game: Table;
  onAgain: () => void;
  onNew: () => void;
  againLabel?: string;
  againDisabled?: boolean;
  newLabel?: string;
}): React.ReactElement {
  const players = usePlayers();
  const over = game.over!;
  const outcome = over.winner === players.me ? "won" : over.winner === players.them ? "lost" : "draw";
  const again = useRef<HTMLButtonElement>(null);
  useEffect(() => again.current?.focus({ preventScroll: true }), []);
  return (
    <section className={`result result--${outcome}`} role="status">
      {outcome === "won" && <Confetti />}
      <div className="result__text">
        <p className="result__kicker">
          {outcome === "won" ? "Kazandın" : outcome === "lost" ? `${players.name(players.them)} kazandı` : "Berabere"}
        </p>
        <p className="result__score">
          <span className="result__you">{game.scores[players.me]}</span>
          <span className="result__dash">–</span>
          <span className="result__bot">{game.scores[players.them]}</span>
        </p>
        <p className="result__why">{reasonText(game, players)}</p>
      </div>
      <div className="result__actions">
        <button ref={again} type="button" className="button button--primary" onClick={onAgain} disabled={againDisabled}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4" />
          </svg>
          {againLabel}
        </button>
        <button type="button" className="button" onClick={onNew}>
          {newLabel}
        </button>
      </div>
    </section>
  );
}

/** In the panel when the game is over: how the game went for you. */
export function EndSummary({ game }: { game: Table }): React.ReactElement {
  const players = usePlayers();
  const { me, them } = players;
  const plays = game.log.filter((t): t is Extract<typeof t, { kind: "play" }> => t.kind === "play" && t.player === me);
  const best = plays.reduce<(typeof plays)[number] | null>((top, t) => (!top || t.score > top.score ? t : top), null);
  const bingos = plays.filter((t) => t.bingo).length;
  const average = plays.length > 0 ? Math.round(plays.reduce((sum, t) => sum + t.score, 0) / plays.length) : 0;
  const leftovers = game.over!.leftovers;
  return (
    <section className="summary" aria-label="Oyunun özeti">
      <h2 className="panel__title">Oyunun özeti</h2>
      <dl className="tally">
        <div className="tally__cell">
          <dt>Kelime</dt>
          <dd>{plays.length}</dd>
        </div>
        <div className="tally__cell">
          <dt>Hamle başı</dt>
          <dd>{average}</dd>
        </div>
        <div className="tally__cell">
          <dt>Hepsi +30</dt>
          <dd>{bingos}</dd>
        </div>
      </dl>
      {best && (
        <p className="summary__best">
          En iyi hamlen <strong>{upper(best.words[0])}</strong> <span className="summary__pts">+{best.score}</span>
        </p>
      )}
      {(leftovers[me] !== 0 || leftovers[them] !== 0) && (
        <p className="summary__left muted">
          Kalan harfler: sen {leftovers[me] > 0 ? "+" : ""}
          {leftovers[me]}, {players.name(them)} {leftovers[them] > 0 ? "+" : ""}
          {leftovers[them]}
        </p>
      )}
    </section>
  );
}
