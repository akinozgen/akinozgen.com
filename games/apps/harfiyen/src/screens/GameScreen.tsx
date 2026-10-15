import { CENTER, decode, JOKER, type Level, letterIndex, nextIdleEnds, type Problem, type Refusal, SIZE, SWAP_BAG, upper } from "@harfiyen/engine";
import { useEffect, useMemo, useRef, useState } from "react";
import { BagView } from "../components/BagView.tsx";
import { Board, type Preview } from "../components/Board.tsx";
import { EndSummary, ResultBanner } from "../components/End.tsx";
import { LastMove } from "../components/LastMove.tsx";
import { type Players, PlayersProvider } from "../components/players.tsx";
import { Rack } from "../components/Rack.tsx";
import { ScoreChart } from "../components/ScoreChart.tsx";
import { describe, MoveLog, Scoreboard } from "../components/Scores.tsx";
import { BagSheet, JokerPicker, PassSheet, SwapSheet } from "../components/Sheets.tsx";
import { Tile } from "../components/Tile.tsx";
import { FINGER_LIFT, useDrag } from "../components/useDrag.ts";
import type { Lexicons } from "../game/lexicons.ts";
import type { PlayApi } from "../game/useHand.ts";

export function problemText(problem: Refusal): string {
  switch (problem.kind) {
    case "nothing":
      return "Önce tahtaya harf koy.";
    case "taken":
      return "O kare dolu.";
    case "line":
      return "Harfler tek bir satırda ya da sütunda olmalı.";
    case "gap":
      return "Harflerin arasında boşluk kalmamalı.";
    case "center":
      return "İlk kelime ortadaki başlangıç karesinden geçmeli.";
    case "short":
      return "İlk kelime en az iki harf olmalı.";
    case "detached":
      return "Kelime tahtadaki bir harfe değmeli.";
    case "words":
      return `Sözlükte yok: ${problem.words.map((word) => upper(decode(word.letters))).join(", ")}`;
    case "over":
      return "Oyun bitti.";
    case "rack":
      return "Bu harfler elinde yok.";
    case "bag":
      return "Torbada 7'den az taş var, değiştirilemez.";
    case "turn":
      return "Sıra sende değil.";
  }
}

export function Dots(): React.ReactElement {
  return (
    <span className="dots" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

type SheetName = "swap" | "bag" | "pass";

/**
 * A game on screen: the board, the rack and its buttons, and the panel
 * beside them. Which game it is — the computer in this browser, or a person
 * through the server — is the caller's business: this only needs the table,
 * the hand and a few words for the parts that differ.
 */
export function GameScreen({
  api,
  lexicons,
  failed = false,
  onRetry,
  players,
  level,
  meta,
  waitingStatus,
  notice,
  instead,
  end,
  actions,
  overExtra,
  blocked,
}: {
  api: PlayApi;
  lexicons: Lexicons | null;
  /** The word lists didn't load. */
  failed?: boolean;
  onRetry?: () => void;
  players: Players;
  /** The computer's level, beside its name; not online. */
  level?: Level;
  /** The line above the board on wide screens. */
  meta: React.ReactNode;
  /** What the status line says while the other side has the move. */
  waitingStatus: React.ReactNode;
  /** Takes the status line over: a lost connection, a warning. */
  notice?: React.ReactNode;
  /** Stands in for the rack and buttons: an invitation, a seat to take. */
  instead?: React.ReactNode;
  /** The end-of-game banner's two buttons. */
  end: { againLabel: string; againDisabled?: boolean; onAgain: () => void; newLabel: string; onNew: () => void };
  /** The panel's buttons during a game. */
  actions: React.ReactNode;
  /** Shown in the panel once the game is over. */
  overExtra?: React.ReactNode;
  /** A sheet of the caller's is open: keys belong to it. */
  blocked: boolean;
}): React.ReactElement {
  const { table: game } = api;
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const [naming, setNaming] = useState<number | null>(null);
  const [tab, setTab] = useState<"log" | "chart" | "bag">("log");
  const closeSheet = (): void => setSheet(null);

  const { lift, onPointerDown, wasDrag } = useDrag(api, setNaming);

  const lastTurn = game.log[game.log.length - 1];
  const fresh = useMemo(() => {
    const order = new Map<number, number>();
    if (lastTurn?.kind === "play") [...lastTurn.placements].sort((a, b) => a.square - b.square).forEach((p, i) => order.set(p.square, i));
    return order;
  }, [lastTurn]);
  const freshBy = lastTurn ? (lastTurn.player === players.me ? "you" : "bot") : null;

  const reading = api.reading;
  const invalid = useMemo(() => {
    const bad = new Set<number>();
    if (reading && !reading.ok && reading.play) {
      const drafted = new Set(api.draft.map((d) => d.square));
      for (const word of reading.play.unknown) for (const square of word.squares) if (drafted.has(square)) bad.add(square);
    }
    return bad;
  }, [reading, api.draft]);

  const preview: Preview | null = useMemo(() => {
    const play = reading?.play;
    if (!play || play.words.length === 0) return null;
    const main = play.words[0].squares;
    return { square: main[main.length - 1], score: play.score, ok: reading.ok, across: main.length < 2 || main[1] - main[0] === 1 };
  }, [reading]);

  // A double tap is one tap: the tile just put down doesn't come straight back up.
  const justPlaced = useRef({ square: -1, at: 0 });
  const onSquare = (square: number): void => {
    if (wasDrag()) return;
    if (api.draft.some((d) => d.square === square)) {
      if (justPlaced.current.square === square && performance.now() - justPlaced.current.at < 400) return;
      api.recall(square);
      return;
    }
    if (api.selected === null) return;
    const placed = api.place(api.selected, square);
    if (placed) justPlaced.current = { square, at: performance.now() };
    if (placed?.joker) setNaming(square);
  };

  const onRackTap = (slot: number): void => {
    if (wasDrag() || !api.yourTurn) return;
    api.setSelected(api.selected === slot ? null : slot);
  };

  const unnamed = api.draft.some((d) => d.letter === -1);
  const canPlay = api.yourTurn && !api.busy && reading?.ok === true;
  const score = reading?.play?.score;

  // The keyboard's square on the board, and which way typed letters run from it.
  const [cursor, setCursor] = useState(CENTER);
  const [typing, setTyping] = useState<"across" | "down">("across");
  // On a phone the board can be blown up and panned, to hit the squares; it opens on what matters.
  const [zoomed, setZoomed] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const centreOn = (squares: readonly number[], smooth: boolean): void => {
    const frame = frameRef.current;
    if (!frame || squares.length === 0) return;
    const cells = squares
      .map((square) => frame.querySelector<HTMLElement>(`[data-square="${square}"]`))
      .filter((el): el is HTMLElement => el !== null);
    if (cells.length === 0) return;
    const left = Math.min(...cells.map((el) => el.offsetLeft));
    const right = Math.max(...cells.map((el) => el.offsetLeft + el.offsetWidth));
    const top = Math.min(...cells.map((el) => el.offsetTop));
    const bottom = Math.max(...cells.map((el) => el.offsetTop + el.offsetHeight));
    frame.scrollTo({
      left: (left + right) / 2 - frame.clientWidth / 2,
      top: (top + bottom) / 2 - frame.clientHeight / 2,
      behavior: smooth ? "smooth" : "auto",
    });
  };
  // Switched on, the zoom opens on the tiles in play, the last move, or the centre.
  useEffect(() => {
    if (!zoomed) return;
    const lastSquares = lastTurn?.kind === "play" ? lastTurn.placements.map((p) => p.square) : [];
    const draftSquares = api.draft.map((d) => d.square);
    centreOn(draftSquares.length ? draftSquares : lastSquares.length ? lastSquares : [CENTER], false);
    // Only when the zoom is switched on; after that the player pans.
  }, [zoomed]);
  // The other side's word is brought into view when it lands.
  useEffect(() => {
    if (zoomed && lastTurn?.player === players.them && lastTurn.kind === "play") centreOn(lastTurn.placements.map((p) => p.square), true);
  }, [lastTurn]);
  const focusSquare = (square: number): void =>
    (document.querySelector(`[data-square="${square}"]`) as HTMLElement | null)?.focus();

  /**
   * Keys: a letter puts that tile from the rack (or a joker, if that's all
   * there is) on the cursor's square and moves on; Space turns the way
   * letters run; Backspace takes the last tile back; Enter plays; Escape
   * takes everything back. Enter only plays from the board or the rack —
   * on any other button it presses that button.
   */
  useEffect(() => {
    if (blocked || sheet !== null || naming !== null) return;
    const empty = (square: number): boolean =>
      game.board.cells[square] === -1 && !api.draft.some((d) => d.square === square);
    const onKey = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;
      const inGame = !target?.closest("button, a") || !!target.closest("[data-square], [data-slot]");
      if (event.key === "Enter") {
        if (canPlay && inGame) {
          event.preventDefault();
          api.submit();
        }
        return;
      }
      if (event.key === "Escape") {
        if (api.draft.length > 0) api.recallAll();
        return;
      }
      if (!api.yourTurn || !inGame) return;
      if (event.key === " " && target?.closest("[data-square]")) {
        event.preventDefault();
        setTyping((way) => (way === "across" ? "down" : "across"));
        return;
      }
      if (event.key === "Backspace") {
        const last = api.draft[api.draft.length - 1];
        if (!last) return;
        event.preventDefault();
        api.recall(last.square);
        setCursor(last.square);
        focusSquare(last.square);
        return;
      }
      if (event.key.length !== 1) return;
      const letter = letterIndex(event.key);
      if (letter < 0 || !empty(cursor)) return;
      const slot = api.free.find((s) => api.view[s] === letter) ?? api.free.find((s) => api.view[s] === JOKER);
      if (slot === undefined) return;
      event.preventDefault();
      const placed = api.place(slot, cursor);
      if (placed?.joker) api.nameJoker(cursor, letter);
      // On to the next empty square the way letters run, past tiles already there.
      const step = typing === "across" ? 1 : SIZE;
      let next = cursor;
      do {
        if ((step === 1 && next % SIZE === SIZE - 1) || next + step >= SIZE * SIZE) break;
        next += step;
      } while (!empty(next) || next === cursor);
      if (next !== cursor) {
        setCursor(next);
        focusSquare(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [blocked, sheet, naming, canPlay, api, game.board, cursor, typing]);

  let status: React.ReactNode;
  let tone = "turn";
  if (!lexicons) {
    tone = failed ? "bad" : "wait";
    status = failed ? (
      <span>
        Sözlük yüklenemedi.{" "}
        <button type="button" className="link-button" onClick={onRetry}>
          Tekrar dene
        </button>
      </span>
    ) : (
      <span className="status__loading">Sözlük açılıyor…</span>
    );
  } else if (notice) {
    tone = "wait";
    status = notice;
  } else if (api.draft.length > 0) {
    if (unnamed) {
      status = "Jokerin hangi harf olacağını seç.";
    } else if (reading?.ok) {
      tone = "ok";
      status = (
        <span className="status__words">
          {reading.play.words.map((word, i) => (
            <span key={i} className="status__word">
              {upper(decode(word.letters))}
              <small>{word.score}</small>
            </span>
          ))}
          {reading.play.bingo && <span className="badge badge--bingo">Hepsi +{game.rules.bingo}</span>}
          {reading.play.star && <span className="badge badge--star">★ +{game.rules.starBonus}</span>}
        </span>
      );
    } else if (reading) {
      tone = "bad";
      status = problemText(reading.problem as Problem);
    }
  } else if (api.refusal) {
    tone = "bad";
    status = problemText(api.refusal);
  } else if (!api.yourTurn) {
    tone = "wait";
    status = waitingStatus;
  } else if (api.selected !== null) {
    status = "Şimdi bir kareye dokun.";
  } else if (game.log.length === 0) {
    status = "Sıra sende. İlk kelime ortadaki başlangıç karesinden geçmeli.";
  } else if (lastTurn?.player === players.them) {
    // What the other side just did, said where a screen reader hears it too.
    status = (
      <span>
        {players.name(players.them)}{" "}
        {lastTurn.kind === "play" ? (
          <>
            <strong>{describe(lastTurn)}</strong> yazdı, +{lastTurn.score}.
          </>
        ) : (
          `${describe(lastTurn)}.`
        )}{" "}
        Sıra sende.
      </span>
    );
  } else {
    status = "Sıra sende. Bir harf seç ya da sürükle.";
  }

  return (
    <PlayersProvider value={players}>
      <main className="stage" onPointerDown={onPointerDown}>
        <section className="stage__board">
          <div className="stage__meta only-wide">
            <p className="stage__when">{meta}</p>
            <span className="stage__kind">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="4" y="4" width="16" height="16" rx="2.5" />
                <path d="M9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16" />
              </svg>
              {game.rules.board === "karisik" ? "Karışık tahta" : "Klasik tahta"}
            </span>
          </div>
          <div className="only-narrow strip-row">
            <Scoreboard game={game} level={level} thinking={api.busy && players.bot} compact onBag={() => setSheet("bag")} />
            <button
              type="button"
              className={`strip__zoom${zoomed ? " is-on" : ""}`}
              aria-pressed={zoomed}
              aria-label={zoomed ? "Tahtayı küçült" : "Tahtayı büyüt"}
              onClick={() => setZoomed((on) => !on)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d={zoomed ? "M15.5 15.5 20 20M7.5 10.5h6" : "M15.5 15.5 20 20M10.5 7.5v6M7.5 10.5h6"} />
              </svg>
            </button>
          </div>

          <div
            ref={frameRef}
            className={`frame${api.yourTurn ? " is-your-turn" : ""}${game.over ? " is-over" : ""}${zoomed ? " is-zoomed" : ""}`}
          >
            <Board
              game={game}
              draft={api.draft}
              fresh={fresh}
              freshBy={freshBy}
              dragging={lift && "square" in lift.from ? lift.from.square : null}
              hover={lift?.over ?? null}
              invalid={invalid}
              valid={reading?.ok === true}
              preview={preview}
              placing={api.selected !== null}
              cursor={cursor}
              onCursor={setCursor}
              onSquare={onSquare}
            />
          </div>

          {game.over ? (
            <ResultBanner
              game={game}
              onAgain={end.onAgain}
              onNew={end.onNew}
              againLabel={end.againLabel}
              againDisabled={end.againDisabled}
              newLabel={end.newLabel}
            />
          ) : instead ? (
            <div className="play play--instead">{instead}</div>
          ) : (
            <div className="play">
              <p className={`status status--${tone}`} aria-live="polite">
                {status}
                {tone === "ok" && score !== undefined && reading?.play && (reading.play.words.length > 1 || reading.play.bingo || reading.play.star) && (
                  <span className="status__total">{score}</span>
                )}
              </p>
              <Rack
                view={api.view}
                free={api.free}
                selected={api.selected}
                dragging={lift && "slot" in lift.from ? lift.from.slot : null}
                values={game.rules.values}
                disabled={!api.yourTurn}
                size={game.rules.rackSize}
                onTap={onRackTap}
              />
              <div className="controls">
                {api.draft.length > 0 ? (
                  <button type="button" className="button controls__mix" onClick={api.recallAll} aria-label="Harfleri geri al">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M9 14 4 9l5-5" />
                      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
                    </svg>
                    <span className="controls__text">Geri al</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button controls__mix"
                    onClick={api.mix}
                    disabled={api.free.length < 2}
                    aria-label="Harfleri karıştır"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
                    </svg>
                    <span className="controls__text">Karıştır</span>
                  </button>
                )}
                <button
                  type="button"
                  className="button"
                  disabled={!api.yourTurn || api.busy || api.draft.length > 0 || game.bagCount < SWAP_BAG}
                  title={game.bagCount < SWAP_BAG ? `Torbada ${SWAP_BAG}'den az taş kaldı` : undefined}
                  onClick={() => setSheet("swap")}
                >
                  Değiştir
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={!api.yourTurn || api.busy || api.draft.length > 0}
                  onClick={() => setSheet("pass")}
                >
                  Pas
                </button>
                <button type="button" className="button button--primary controls__play" disabled={!canPlay} onClick={api.submit}>
                  Oyna
                  {canPlay && score !== undefined && <span className="button__score">+{score}</span>}
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className={`panel${game.over ? " is-over" : ""}`}>
          {!game.over && (
            <div className="only-wide">
              <Scoreboard game={game} level={level} thinking={api.busy && players.bot} />
            </div>
          )}
          {game.over ? <EndSummary game={game} /> : <LastMove game={game} lexicons={lexicons} />}

          <section className="tabs" aria-label="Hamleler, gidişat ve torba">
            <div className="tabs__bar" role="tablist">
              {(
                [
                  ["log", "Hamleler", game.log.length || null],
                  ["chart", "Gidişat", null],
                  ["bag", "Torba", game.bagCount],
                ] as const
              ).map(([id, label, count]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  className={`tabs__tab${tab === id ? " is-on" : ""}`}
                  onClick={() => setTab(id)}
                >
                  {label}
                  {count !== null && <span className="tabs__count">{count}</span>}
                </button>
              ))}
            </div>
            <div className="tabs__body" role="tabpanel">
              {tab === "log" ? <MoveLog game={game} /> : tab === "chart" ? <ScoreChart game={game} /> : <BagView game={game} compact />}
            </div>
          </section>

          {game.over ? overExtra : <div className="panel__actions">{actions}</div>}
        </aside>
      </main>

      {lift?.moved && (
        <div
          className={`ghost${lift.touch ? " ghost--touch" : ""}`}
          style={{ left: lift.x, top: lift.touch ? lift.y - FINGER_LIFT : lift.y }}
          aria-hidden="true"
        >
          <Tile letter={lift.letter} joker={lift.joker} value={lift.letter >= 0 && !lift.joker ? game.rules.values[lift.letter] : 0} />
        </div>
      )}

      {naming !== null && (
        <JokerPicker
          onPick={(letter) => {
            api.nameJoker(naming, letter);
            setNaming(null);
          }}
          onCancel={() => {
            api.recall(naming);
            setNaming(null);
          }}
        />
      )}
      {sheet === "pass" && (
        <PassSheet
          game={game}
          onPass={() => {
            api.pass();
            setSheet(null);
          }}
          onClose={closeSheet}
        />
      )}
      {sheet === "swap" && (
        <SwapSheet
          view={api.view}
          free={api.free}
          values={game.rules.values}
          bag={game.bagCount}
          ends={nextIdleEnds(game.idle, game.bagCount)}
          onSwap={(slots) => {
            api.swap(slots);
            setSheet(null);
          }}
          onClose={closeSheet}
        />
      )}
      {sheet === "bag" && <BagSheet game={game} onClose={closeSheet} />}
    </PlayersProvider>
  );
}
