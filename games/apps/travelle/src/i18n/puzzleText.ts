import type { Puzzle } from "../game/puzzle.ts";
import type { Translate } from "./index.tsx";
import type { StringKey } from "./strings.ts";

/** "#253" for the daily, "Endless #7" for a practice round. */
export function puzzleTitle(puzzle: Puzzle, t: Translate): string {
  return puzzle.kind === "daily" ? `#${puzzle.number}` : t("endlessRound", { n: puzzle.number });
}

/** The line under the prompt: where the puzzle comes from, and how long it is. */
export function puzzleSubtitle(puzzle: Puzzle, t: Translate): string {
  const length = t("shortestRoute", { n: puzzle.shortest });
  if (puzzle.kind === "daily") return `${puzzle.date} · ${length}`;
  const scope = puzzle.scope
    ? puzzle.scope.map((continent) => t(continent as StringKey)).join(", ")
    : t("wholeWorld");
  return `${scope} · ${length}`;
}
