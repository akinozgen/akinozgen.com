/**
 * The part of the package a browser may load. It must never import the
 * border graph or geo.json: those hold every answer, and anything imported
 * here ends up in the shipped bundle.
 */
export * from "./types.ts";
export { guessBudget, MARK_EMOJI, type GuessMark } from "./scoring.ts";
export type {
  DailyPuzzle,
  EndlessPuzzle,
  EndlessResponse,
  HintData,
  HintName,
  Status,
  Verdict,
} from "./server/api.ts";
