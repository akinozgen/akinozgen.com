import { ALPHABET_SIZE } from "./alphabet.ts";
import { type Board, EMPTY, JOKER, SQUARES } from "./board.ts";
import type { Ending, Game, TileSet, Turn } from "./game.ts";
import type { Rules } from "./score.ts";

/**
 * A game as one player may see it: the board, the scores, the log and their
 * own rack — never the seed, the bag's order or the other rack. The screen
 * draws only this, whether the game is against the computer in the same
 * browser or held by the server for two people.
 */
export interface Table {
  /** Which game this is, for telling games apart; never the seed in a game with others. */
  id: string;
  rules: Rules;
  board: Board;
  scores: number[];
  turn: number;
  first: number;
  log: Turn[];
  /** Passes and swaps in a row. */
  idle: number;
  over: Ending | null;
  /** Whose view this is. */
  seat: number;
  rack: number[];
  bagCount: number;
  /** Every rack, once the game is over. */
  finalRacks?: number[][];
}

/** The table `seat` sees. `id` names the game; it defaults to the seed, fine for a game kept in one browser. */
export function viewOf(game: Game, seat: number, id: string = game.seed): Table {
  return {
    id,
    rules: game.rules,
    board: game.board,
    scores: game.scores,
    turn: game.turn,
    first: game.first ?? 0,
    log: game.log,
    idle: game.idle,
    over: game.over,
    seat,
    rack: game.racks[seat],
    bagCount: game.bag.length,
    ...(game.over ? { finalRacks: game.racks } : {}),
  };
}

/**
 * Tiles this player hasn't seen: the full set less the board and their own
 * rack — the bag and the other rack together. One count per letter, then the
 * jokers.
 */
export function unseenTiles(table: Pick<Table, "board" | "rack">, tiles: TileSet): number[] {
  const unseen = [...tiles.counts, tiles.jokers];
  for (let square = 0; square < SQUARES; square++) {
    const letter = table.board.cells[square];
    if (letter === EMPTY) continue;
    unseen[table.board.joker[square] ? JOKER : letter]--;
  }
  for (const tile of table.rack) unseen[tile === JOKER ? ALPHABET_SIZE : tile]--;
  return unseen;
}

/** A table as JSON, for the wire: typed arrays become plain ones. */
export function tableToJson(table: Table): unknown {
  return {
    ...table,
    rules: { ...table.rules, layout: [...table.rules.layout] },
    board: { cells: [...table.board.cells], joker: [...table.board.joker] },
  };
}

/** Reads `tableToJson`'s output back; null if it isn't one. */
export function tableFromJson(raw: unknown): Table | null {
  const t = raw as Table & { rules: Rules & { layout: number[] }; board: { cells: number[]; joker: number[] } };
  if (!t || typeof t !== "object" || !Array.isArray(t.rack) || t.board?.cells?.length !== SQUARES) return null;
  return {
    ...t,
    rules: { ...t.rules, layout: Uint8Array.from(t.rules.layout) },
    board: { cells: Int8Array.from(t.board.cells), joker: Uint8Array.from(t.board.joker) },
  };
}
