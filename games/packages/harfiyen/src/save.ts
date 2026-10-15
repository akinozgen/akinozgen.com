import type { Game } from "./game.ts";

/** A game as JSON: typed arrays become plain ones. */
export function saveGame(game: Game): string {
  return JSON.stringify({
    ...game,
    rules: { ...game.rules, layout: [...game.rules.layout] },
    board: { cells: [...game.board.cells], joker: [...game.board.joker] },
  });
}

/** Reads `saveGame`'s output back; null if it isn't one. */
export function loadGame(text: string): Game | null {
  try {
    const raw = JSON.parse(text) as Game & {
      rules: Game["rules"] & { layout: number[] };
      board: { cells: number[]; joker: number[] };
    };
    if (!raw || !Array.isArray(raw.racks) || raw.board?.cells?.length !== 225) return null;
    return {
      ...raw,
      rules: { ...raw.rules, layout: Uint8Array.from(raw.rules.layout) },
      board: { cells: Int8Array.from(raw.board.cells), joker: Uint8Array.from(raw.board.joker) },
    };
  } catch {
    return null;
  }
}
