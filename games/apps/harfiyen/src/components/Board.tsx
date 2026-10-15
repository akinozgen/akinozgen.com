import { CENTER, Premium, SIZE, type Table } from "@harfiyen/engine";
import type { Draft } from "../game/useHand.ts";
import { Tile, tileName } from "./Tile.tsx";

export const LABEL: Record<number, string> = {
  [Premium.DoubleLetter]: "H²",
  [Premium.TripleLetter]: "H³",
  [Premium.DoubleWord]: "K²",
  [Premium.TripleWord]: "K³",
};

export const CLASS: Record<number, string> = {
  [Premium.DoubleLetter]: "h2",
  [Premium.TripleLetter]: "h3",
  [Premium.DoubleWord]: "k2",
  [Premium.TripleWord]: "k3",
};

const NAME: Record<number, string> = {
  [Premium.DoubleLetter]: "harf iki kat",
  [Premium.TripleLetter]: "harf üç kat",
  [Premium.DoubleWord]: "kelime iki kat",
  [Premium.TripleWord]: "kelime üç kat",
};

/** The running score of the tiles on the board, pinned to the end of the word they make. */
export interface Preview {
  square: number;
  score: number;
  ok: boolean;
  /** The word runs left to right, so the score sits after it; otherwise under it. */
  across: boolean;
}

/** Where the score sits: past the word's end, or round the corner when that's off the board. */
function bubbleSide(square: number, across: boolean): string {
  const lastCol = square % SIZE === SIZE - 1;
  const lastRow = square >= SIZE * (SIZE - 1);
  if (across) return lastCol ? (lastRow ? "bubble--edge-down" : "bubble--down") : "bubble--across";
  return lastRow ? (lastCol ? "bubble--edge-across" : "bubble--across") : "bubble--down";
}

/**
 * The 15 × 15 board. Squares are buttons: tap one with a rack tile picked to
 * put it there. Tiles laid this turn can be dragged on or tapped back; the
 * last move made stays lit until the next one.
 */
export function Board({
  game,
  draft,
  fresh,
  freshBy,
  dragging,
  hover,
  invalid,
  valid,
  preview,
  placing,
  cursor,
  onCursor,
  onSquare,
}: {
  game: Table;
  draft: readonly Draft[];
  /** Squares the last move filled, with the order they landed in. */
  fresh: ReadonlyMap<number, number>;
  /** Who made the last move. */
  freshBy: "you" | "bot" | null;
  /** The draft square being dragged off, drawn faded. */
  dragging: number | null;
  /** The square a dragged tile is over. */
  hover: number | null;
  /** Draft squares in a word the dictionary lacks. */
  invalid: ReadonlySet<number>;
  /** The draft makes a legal move. */
  valid: boolean;
  preview: Preview | null;
  /** A rack tile is picked up, so empty squares take it. */
  placing: boolean;
  /** The keyboard's square: the board's one stop in the tab order, where typed letters go. */
  cursor: number;
  onCursor: (square: number) => void;
  onSquare: (square: number) => void;
}): React.ReactElement {
  const { board, rules } = game;
  const drafted = new Map(draft.map((d) => [d.square, d]));

  // Arrow keys walk the board; the square focused is the cursor.
  const onKeyDown = (event: React.KeyboardEvent): void => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -SIZE, ArrowDown: SIZE }[event.key];
    if (step === undefined || event.altKey || event.ctrlKey || event.metaKey) return;
    const col = cursor % SIZE;
    const next = cursor + step;
    if ((step === -1 && col === 0) || (step === 1 && col === SIZE - 1) || next < 0 || next >= SIZE * SIZE) return;
    event.preventDefault();
    onCursor(next);
    (event.currentTarget.querySelector(`[data-square="${next}"]`) as HTMLElement | null)?.focus();
  };

  const cell = (square: number): React.ReactElement => {
        const letter = board.cells[square];
        const mine = drafted.get(square);
        const premium = rules.layout[square];
        const kind = CLASS[premium] ?? "";
        const row = Math.floor(square / 15) + 1;
        const col = (square % 15) + 1;
        let content: React.ReactNode = null;
        let label = `${row}. satır ${col}. sütun`;
        if (letter !== -1) {
          const joker = board.joker[square] === 1;
          const order = fresh.get(square);
          content = (
            <Tile
              letter={letter}
              joker={joker}
              value={rules.values[letter]}
              className={order !== undefined ? `tile--fresh tile--fresh-${freshBy ?? "you"}` : ""}
              style={order !== undefined ? { animationDelay: `${order * 70}ms` } : undefined}
            />
          );
          label += `: ${tileName(letter, joker, rules.values[letter])}`;
        } else if (mine) {
          const state = invalid.has(square) ? " tile--bad" : valid ? " tile--good" : "";
          content = (
            <span data-draft={square} className="cell__draft">
              <Tile
                letter={mine.letter}
                joker={mine.joker}
                value={mine.letter >= 0 ? rules.values[mine.letter] : 0}
                className={`tile--draft${state}${dragging === square ? " tile--lifted" : ""}`}
              />
            </span>
          );
          label += `: bu tur koyduğun ${tileName(mine.letter, mine.joker, mine.letter >= 0 ? rules.values[mine.letter] : 0)}; geri almak için dokun`;
        } else if (square === CENTER && game.log.length === 0) {
          content = (
            <svg viewBox="0 0 24 24" className="cell__start" aria-hidden="true">
              <circle cx="12" cy="12" r="8" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          );
          label += ", başlangıç karesi";
        } else if (square === rules.star) {
          content = (
            <span className="cell__label cell__label--star" aria-hidden="true">
              ★<small>+{rules.starBonus}</small>
            </span>
          );
          label += `, yıldız: hamleye ${rules.starBonus} puan ekler`;
        } else if (LABEL[premium]) {
          content = (
            <span className="cell__label" aria-hidden="true">
              {LABEL[premium]}
            </span>
          );
          label += `, ${NAME[premium]}`;
        }
        const bubble = preview && preview.square === square;
        return (
          <button
            key={square}
            type="button"
            role="gridcell"
            data-square={square}
            className={`cell${kind ? ` cell--${kind}` : ""}${square === rules.star ? " cell--star" : ""}${letter !== -1 ? " cell--filled" : ""}${mine ? " cell--draft" : ""}${hover === square ? " is-over" : ""}${bubble ? " has-bubble" : ""}`}
            aria-label={label}
            tabIndex={square === cursor ? 0 : -1}
            onFocus={() => onCursor(square)}
            onClick={() => onSquare(square)}
          >
            {content}
            {bubble && (
              <span className={`bubble${preview.ok ? " bubble--ok" : " bubble--bad"} ${bubbleSide(square, preview.across)}`} aria-hidden="true">
                {preview.score}
              </span>
            )}
          </button>
        );
  };

  return (
    <div
      className={`board${placing ? " is-placing" : ""}`}
      role="grid"
      aria-label="Tahta, 15 satır 15 sütun. Ok tuşlarıyla gez, harf yazarak koy."
      onKeyDown={onKeyDown}
    >
      {Array.from({ length: SIZE }, (_, row) => (
        <div key={row} role="row" className="board__row">
          {Array.from({ length: SIZE }, (_, col) => cell(row * SIZE + col))}
        </div>
      ))}
    </div>
  );
}
