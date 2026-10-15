import { copyBoard, decode, EMPTY, readPlay, type Table, type Turn, upper } from "@harfiyen/engine";
import { useMemo } from "react";
import type { Lexicons } from "../game/lexicons.ts";
import { usePlayers } from "./players.tsx";
import { describe } from "./Scores.tsx";
import { Tile } from "./Tile.tsx";

interface Breakdown {
  words: { text: string; score: number }[];
  /** The main word, square by square, and which tiles were new. */
  tiles: { letter: number; joker: boolean; fresh: boolean }[];
}

/** What the last move's words scored one by one, read again on the board as it was before it. */
function breakdown(game: Table, turn: Extract<Turn, { kind: "play" }>, lexicons: Lexicons): Breakdown | null {
  const before = copyBoard(game.board);
  for (const p of turn.placements) {
    before.cells[p.square] = EMPTY;
    before.joker[p.square] = 0;
  }
  const reading = readPlay(before, turn.placements, game.rules, lexicons.full);
  const play = reading.ok ? reading.play : reading.play;
  if (!play) return null;
  const placed = new Set(turn.placements.map((p) => p.square));
  const main = play.words[0];
  return {
    words: play.words.map((word) => ({ text: upper(decode(word.letters)), score: word.score })),
    tiles: main.squares.map((square) => ({
      letter: game.board.cells[square],
      joker: game.board.joker[square] === 1,
      fresh: placed.has(square),
    })),
  };
}

/** The move just made, as a card: the word in tiles, each word's points, the bonuses, the total. */
export function LastMove({ game, lexicons }: { game: Table; lexicons: Lexicons | null }): React.ReactElement {
  const players = usePlayers();
  const turn = game.log[game.log.length - 1];
  const parts = useMemo(
    () => (turn?.kind === "play" && lexicons ? breakdown(game, turn, lexicons) : null),
    [game, turn, lexicons],
  );

  if (!turn) {
    return (
      <section className="last last--empty" aria-label="Son hamle">
        <h2 className="panel__title">Son hamle</h2>
        <p className="muted">Henüz hamle yok. İlk kelime ortadaki başlangıç karesinden geçmeli.</p>
      </section>
    );
  }

  const mine = turn.player === players.me;
  return (
    <section className={`last last--${mine ? "you" : "bot"}`} aria-label="Son hamle" key={game.log.length}>
      <header className="last__head">
        <h2 className="panel__title">
          Son hamle · <span className="last__who">{players.name(turn.player)}</span>
        </h2>
        {turn.kind === "play" && <span className="last__score">+{turn.score}</span>}
      </header>
      {turn.kind === "play" ? (
        <>
          {parts && parts.tiles.length <= 15 && (
            <div className="last__tiles" aria-label={upper(turn.words[0])}>
              {parts.tiles.map((t, i) => (
                <Tile
                  key={i}
                  letter={t.letter}
                  joker={t.joker}
                  value={game.rules.values[t.letter]}
                  className={t.fresh ? "tile--fresh" : "tile--old"}
                  style={{ animationDelay: `${i * 45}ms` }}
                />
              ))}
            </div>
          )}
          <ul className="last__parts">
            {parts
              ? parts.words.map((word, i) => (
                  <li key={i} className="part">
                    <span className="part__word">{word.text}</span>
                    <span className="part__score">{word.score}</span>
                  </li>
                ))
              : turn.words.map((word, i) => (
                  <li key={i} className="part">
                    <span className="part__word">{upper(word)}</span>
                  </li>
                ))}
            {turn.bingo && (
              <li className="part part--bingo">
                <span className="part__word">Yedi harf</span>
                <span className="part__score">+{game.rules.bingo}</span>
              </li>
            )}
            {turn.star && (
              <li className="part part--star">
                <span className="part__word">★ karesi</span>
                <span className="part__score">+{game.rules.starBonus}</span>
              </li>
            )}
          </ul>
        </>
      ) : (
        <p className="last__quiet">
          {players.name(turn.player)} {describe(turn)}.
        </p>
      )}
    </section>
  );
}
