import { ALPHABET_SIZE, encode } from "./alphabet.ts";
import { type Board, EMPTY, JOKER, type Placement, SIZE } from "./board.ts";
import { SWAP_BAG, type Action, type Game } from "./game.ts";
import type { Lexicon } from "./lexicon.ts";
import { generateMoves, type Move } from "./movegen.ts";
import { type Random, seeded } from "./rng.ts";

export type Level = "kolay" | "orta" | "zor";

/**
 * How the computer plays at a level. What makes it feel like a person is
 * what it knows: it only plays everyday words (the lexicon it is handed).
 * Strength then comes from how often it "spots" a move (after Macondo's
 * findability filters): moves are tried best first, and each is taken with
 * probability `base`, less for every extra word it makes (`parallel`) and
 * for long plays (`long`). The first one spotted is played.
 */
interface Profile {
  base: number;
  parallel: number;
  long: number;
  /** How much the tiles kept back count, against the points scored now. */
  leave: number;
  /** A joker goes down only for this many points more than the best play without one. */
  jokerGain: number;
  /** Plays worth more than `above` are seldom spotted (`chance`): an easy opponent's big moves stay rare. */
  big?: { above: number; chance: number };
}

const PROFILES: Record<Level, Profile> = {
  kolay: { base: 0.7, parallel: 0.5, long: 0.4, leave: 0, jokerGain: 25, big: { above: 35, chance: 0.1 } },
  orta: { base: 0.85, parallel: 0.75, long: 0.6, leave: 0.5, jokerGain: 15, big: { above: 60, chance: 0.5 } },
  zor: { base: 1, parallel: 1, long: 1, leave: 1, jokerGain: 8 },
};

const VOWELS = new Set(encode("aeıioöuü")!);
/** Letters that are easy to use again, and ones that tend to get stuck. */
const KEEP = new Map<number, number>([
  ...encode("aeiklrnt")!.map((l): [number, number] => [l, 1]),
  ...encode("ğjfvöh")!.map((l): [number, number] => [l, -2.5]),
]);

/** A rough worth of the tiles left on the rack: jokers, easy letters and a vowel balance near 40%. */
export function leaveValue(rack: readonly number[]): number {
  let value = 0;
  let vowels = 0;
  const seen = new Int8Array(ALPHABET_SIZE + 1);
  for (const tile of rack) {
    if (tile === JOKER) {
      value += 8;
      continue;
    }
    value += KEEP.get(tile) ?? 0;
    if (seen[tile]++ > 0) value -= 3;
    if (VOWELS.has(tile)) vowels++;
  }
  const letters = rack.filter((tile) => tile !== JOKER).length;
  if (letters > 0) value -= Math.abs(vowels / letters - 0.4) * 10;
  return value;
}

function rackAfter(rack: readonly number[], placements: readonly Placement[]): number[] {
  const left = [...rack];
  for (const p of placements) left.splice(left.indexOf(p.joker ? JOKER : p.letter), 1);
  return left;
}

/** Words a move makes: the one along its line, and one for each tile with a neighbour across it. */
function wordsMade(board: Board, move: Move): number {
  const cross = move.direction === "across" ? SIZE : 1;
  let words = 1;
  for (const { square } of move.placements) {
    const before = cross === 1 ? square % SIZE > 0 : square >= SIZE;
    const after = cross === 1 ? square % SIZE < SIZE - 1 : square < SIZE * (SIZE - 1);
    if ((before && board.cells[square - cross] !== EMPTY) || (after && board.cells[square + cross] !== EMPTY)) words++;
  }
  return words;
}

/** The computer's move. `lexicon` is the words it knows; players should recognise every one. */
export function chooseMove(game: Game, lexicon: Lexicon, level: Level, random: Random = seeded(`${game.seed}:bot:${game.log.length}`)): Action {
  const profile = PROFILES[level];
  const rack = game.racks[game.turn];
  const moves = generateMoves(game.board, rack, lexicon, game.rules);
  if (moves.length === 0) return giveUpTiles(game);

  // A joker is kept for a bigger play — unless there's nothing else to play, or the bag is empty and it's
  // only worth holding as a penalty.
  const usesJoker = (m: Move): boolean => m.placements.some((p) => p.joker);
  const plain = moves.reduce((best, m) => (usesJoker(m) ? best : Math.max(best, m.score)), -1);
  const spareJokers = plain === -1 || game.bag.length === 0;
  const ranked = moves
    .filter((m) => spareJokers || !usesJoker(m) || m.score - plain >= profile.jokerGain)
    .map((move) => ({ move, worth: move.score + profile.leave * leaveValue(rackAfter(rack, move.placements)) }))
    .sort((a, b) => b.worth - a.worth);
  if (ranked.length === 0) return giveUpTiles(game);

  for (const { move } of ranked) {
    let chance = profile.base * profile.parallel ** (wordsMade(game.board, move) - 1);
    if (move.placements.length >= 6) chance *= profile.long;
    if (profile.big && move.score > profile.big.above) chance *= profile.big.chance;
    if (random() < chance) return { kind: "play", placements: move.placements };
  }
  // Nothing spotted: it still never passes up a move it has.
  return { kind: "play", placements: ranked[ranked.length - 1].move.placements };
}

/** No word to play: swap the clumsiest tiles while the bag allows, else pass. */
function giveUpTiles(game: Game): Action {
  const rack = game.racks[game.turn];
  if (game.bag.length < SWAP_BAG) return { kind: "pass" };
  const values = game.rules.values;
  const tiles = rack
    .filter((tile) => tile !== JOKER)
    .sort((a, b) => values[b] - values[a])
    .slice(0, Math.max(1, Math.ceil(rack.length / 2)));
  return tiles.length > 0 ? { kind: "swap", tiles } : { kind: "pass" };
}
