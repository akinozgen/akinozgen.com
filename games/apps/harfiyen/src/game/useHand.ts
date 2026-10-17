import {
  type Board,
  JOKER,
  type Lexicon,
  type Placement,
  type Reading,
  readPlay,
  type Refusal,
  type Rules,
  shuffle,
  type Table,
} from "@harfiyen/engine";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** A rack tile put on the board this turn, not yet played. */
export interface Draft {
  /** Which rack slot it came from. */
  slot: number;
  square: number;
  /** For a joker, the letter chosen; -1 until then. */
  letter: number;
  joker: boolean;
}

/**
 * The rack in the order the player arranged it, kept across a new rack:
 * tiles still there stay where they were, new ones go at the end.
 */
export function arrange(before: readonly number[], rack: readonly number[]): number[] {
  const fresh = [...rack];
  const ordered: number[] = [];
  for (const tile of before) {
    const at = fresh.indexOf(tile);
    if (at === -1) continue;
    ordered.push(tile);
    fresh.splice(at, 1);
  }
  return [...ordered, ...fresh];
}

/**
 * The player's hand: the rack in their order, the tiles laid on the board
 * but not yet played, the one picked up, and what the board would read.
 * Tiles can be tried on either turn; only playing them waits for the move.
 * The same whether the other side is the computer or a person.
 */
export function useHand(
  rack: readonly number[],
  board: Board,
  rules: Rules,
  lexicon: Lexicon | null,
  /** A game is on: dealt and not over. */
  live: boolean,
  initialView?: number[],
) {
  const [view, setView] = useState<number[]>(() => initialView ?? [...rack]);
  const [draft, setDraft] = useState<Draft[]>([]);
  const [selected, setSelected] = useState<number | null>(null);

  // A new rack — after a move, a swap, a new game — keeps the player's order and drops the draft;
  // the tiles just played leave their slots first, so a new tile of the same letter doesn't take one.
  const rackKey = rack.join(",");
  const draftNow = useRef(draft);
  draftNow.current = draft;
  useEffect(() => {
    const played = new Set(draftNow.current.map((d) => d.slot));
    setView((before) =>
      before.join(",") === rackKey ? before : arrange(before.filter((_, slot) => !played.has(slot)), rack),
    );
    setDraft([]);
    setSelected(null);
    // Only the rack's contents matter, not the array it came in.
  }, [rackKey]);

  // The other side's word may land where a tile was being tried: that tile goes back. A game that ends takes them all back.
  useEffect(() => {
    setDraft((before) => {
      const kept = live ? before.filter((d) => board.cells[d.square] === -1) : [];
      return kept.length === before.length ? before : kept;
    });
    if (!live) setSelected(null);
  }, [board, live]);

  const placements: Placement[] = useMemo(
    () => draft.filter((d) => d.letter !== -1).map((d) => ({ square: d.square, letter: d.letter, joker: d.joker })),
    [draft],
  );

  /** What the tiles on the board would make, read against every word. */
  const reading: Reading | null = useMemo(() => {
    if (!lexicon || placements.length === 0 || placements.length !== draft.length) return null;
    return readPlay(board, placements, rules, lexicon);
  }, [lexicon, board, rules, placements, draft.length]);

  const free = useMemo(() => {
    const onBoard = new Set(draft.map((d) => d.slot));
    return view.map((_, slot) => slot).filter((slot) => !onBoard.has(slot));
  }, [view, draft]);

  const place = useCallback(
    (slot: number, square: number): Draft | null => {
      if (!live || board.cells[square] !== -1) return null;
      if (draft.some((d) => d.square === square)) return null;
      const tile = view[slot];
      const joker = tile === JOKER;
      const entry: Draft = { slot, square, letter: joker ? -1 : tile, joker };
      setDraft((before) => [...before.filter((d) => d.slot !== slot), entry]);
      setSelected(null);
      return entry;
    },
    [live, board, draft, view],
  );

  const move = useCallback(
    (from: number, to: number) => {
      if (from === to || board.cells[to] !== -1 || draft.some((d) => d.square === to)) return;
      setDraft((before) => before.map((d) => (d.square === from ? { ...d, square: to } : d)));
    },
    [board, draft],
  );

  const nameJoker = useCallback((square: number, letter: number) => {
    setDraft((before) => before.map((d) => (d.square === square ? { ...d, letter } : d)));
  }, []);

  const recall = useCallback((square: number) => {
    setDraft((before) => before.filter((d) => d.square !== square));
  }, []);

  const recallAll = useCallback(() => setDraft([]), []);

  /** Puts a rack tile in another slot's place, for arranging the rack by hand; tiles on the board keep track. */
  const reorder = useCallback(
    (from: number, to: number) => {
      if (from === to) return;
      const order = view.map((_, slot) => slot);
      const [moved] = order.splice(from, 1);
      order.splice(to, 0, moved);
      const where = new Map(order.map((slot, at) => [slot, at]));
      setView(order.map((slot) => view[slot]));
      setDraft((before) => before.map((d) => ({ ...d, slot: where.get(d.slot)! })));
      setSelected((before) => (before === null ? null : where.get(before)!));
    },
    [view],
  );

  const mix = useCallback(() => {
    setView((before) => {
      const onBoard = new Set(draft.map((d) => d.slot));
      const slots = before.map((_, slot) => slot).filter((slot) => !onBoard.has(slot));
      const tiles = shuffle(
        slots.map((slot) => before[slot]),
        Math.random,
      );
      const next = [...before];
      slots.forEach((slot, i) => (next[slot] = tiles[i]));
      return next;
    });
  }, [draft]);

  /** Lays given tiles down as this turn's draft, matched to rack slots. */
  const lay = useCallback(
    (tiles: readonly Placement[]) => {
      const taken = new Set<number>();
      const next: Draft[] = [];
      for (const p of tiles) {
        const tile = p.joker ? JOKER : p.letter;
        const slot = view.findIndex((t, i) => t === tile && !taken.has(i));
        if (slot === -1) return;
        taken.add(slot);
        next.push({ slot, square: p.square, letter: p.letter, joker: p.joker });
      }
      setDraft(next);
      setSelected(null);
    },
    [view],
  );

  return {
    view,
    setView,
    free,
    draft,
    selected,
    setSelected,
    placements,
    reading,
    place,
    move,
    nameJoker,
    recall,
    recallAll,
    reorder,
    mix,
    lay,
  };
}

export type Hand = ReturnType<typeof useHand>;

/** What the game screen needs from either kind of game. */
export interface PlayApi extends Hand {
  table: Table;
  refusal: Refusal | null;
  yourTurn: boolean;
  /** The other side has the move: the computer thinking, or an answer on its way from the server. */
  busy: boolean;
  submit: () => void;
  swap: (slots: number[]) => void;
  pass: () => void;
  resign: () => void;
}
