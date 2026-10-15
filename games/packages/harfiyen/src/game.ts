import { decode } from "./alphabet.ts";
import { type Board, copyBoard, emptyBoard, JOKER, type Placement } from "./board.ts";
import type { Lexicon } from "./lexicon.ts";
import { type Problem, readPlay } from "./play.ts";
import { type Random, seeded, shuffle } from "./rng.ts";
import type { Rules } from "./score.ts";

/**
 * A whole game as plain data, moved on only by `apply`. Nothing in here
 * reads a clock or Math.random: two browsers that start from the same seed
 * and apply the same actions hold the same game, which is all a game between
 * two of them needs.
 */
export interface Game {
  seed: string;
  rules: Rules;
  board: Board;
  /** Tiles still in the bag, in the order they'll be drawn. */
  bag: number[];
  racks: number[][];
  scores: number[];
  /** Whose turn it is. */
  turn: number;
  /** Who went first. Saves from before this was kept started with player 0. */
  first?: number;
  log: Turn[];
  /** Passes and swaps in a row, by either player. */
  idle: number;
  over: Ending | null;
}

export type Turn =
  | {
      player: number;
      kind: "play";
      placements: Placement[];
      /** Every word made, the one along the line first. */
      words: string[];
      /** Which letters of the first word are jokers, by position. Older saves lack it. */
      jokers?: number[];
      score: number;
      bingo: boolean;
      star: boolean;
    }
  | { player: number; kind: "swap"; count: number }
  | { player: number; kind: "pass" }
  | { player: number; kind: "resign" };

export interface Ending {
  reason: "out" | "stuck" | "resign";
  /** Null for a draw. */
  winner: number | null;
  /** What each player gained or lost for the tiles left on the racks. */
  leftovers: number[];
}

export type Action =
  | { kind: "play"; placements: Placement[] }
  | { kind: "swap"; tiles: number[] }
  | { kind: "pass" }
  | { kind: "resign" };

export type Refusal = Problem | { kind: "over" } | { kind: "rack" } | { kind: "bag" } | { kind: "turn" };

export type Outcome = { ok: true; game: Game; turn: Turn } | { ok: false; refusal: Refusal };

/** How many of each tile go in the bag: one count per letter index, then the jokers. */
export interface TileSet {
  counts: readonly number[];
  jokers: number;
}

/**
 * Passes and swaps in a row that end the game, once the bag is nearly empty
 * (four, with under twenty tiles left). However full the bag,
 * twice that many end it too, so a game can't idle forever.
 */
export const IDLE_LIMIT = 4;
export const IDLE_BAG = 20;
export const IDLE_HARD_LIMIT = 8;
/** Swapping needs at least this many tiles in the bag. */
export const SWAP_BAG = 7;

const idleOver = (idle: number, bag: number): boolean => (idle >= IDLE_LIMIT && bag < IDLE_BAG) || idle >= IDLE_HARD_LIMIT;

/** Whether one more pass or swap would end the game, so a player can be told before making it. */
export const nextIdleEnds = (idle: number, bagCount: number): boolean => idleOver(idle + 1, bagCount);

export function newGame(seed: string, rules: Rules, tiles: TileSet, players = 2, first = 0): Game {
  const random: Random = seeded(`${seed}:bag`);
  const bag: number[] = [];
  tiles.counts.forEach((count, letter) => {
    for (let i = 0; i < count; i++) bag.push(letter);
  });
  for (let i = 0; i < tiles.jokers; i++) bag.push(JOKER);
  shuffle(bag, random);
  const racks = Array.from({ length: players }, () => bag.splice(0, rules.rackSize));
  return {
    seed,
    rules,
    board: emptyBoard(),
    bag,
    racks,
    scores: racks.map(() => 0),
    turn: first,
    first,
    log: [],
    idle: 0,
    over: null,
  };
}

/** Takes `tiles` off `rack`, or null if it doesn't hold them. A placed joker comes off as a joker. */
function takeFrom(rack: readonly number[], tiles: readonly number[]): number[] | null {
  const left = [...rack];
  for (const tile of tiles) {
    const at = left.indexOf(tile);
    if (at === -1) return null;
    left.splice(at, 1);
  }
  return left;
}

const rackValue = (rack: readonly number[], rules: Rules): number =>
  rack.reduce((sum, tile) => sum + (tile === JOKER ? 0 : rules.values[tile]), 0);

/**
 * The game moved on by one action of `by`, the player whose turn it is
 * unless said otherwise: anyone may resign at any time, everything else
 * waits for its turn. The old game is left as it was.
 */
export function apply(game: Game, action: Action, lexicon: Lexicon, by: number = game.turn): Outcome {
  if (game.over) return { ok: false, refusal: { kind: "over" } };
  if (by !== game.turn && action.kind !== "resign") return { ok: false, refusal: { kind: "turn" } };
  const player = by;
  const next: Game = {
    ...game,
    racks: game.racks.map((rack) => [...rack]),
    scores: [...game.scores],
    bag: [...game.bag],
    log: [...game.log],
  };
  let turn: Turn;

  switch (action.kind) {
    case "play": {
      const left = takeFrom(
        game.racks[player],
        action.placements.map((p) => (p.joker ? JOKER : p.letter)),
      );
      if (!left) return { ok: false, refusal: { kind: "rack" } };
      const reading = readPlay(game.board, action.placements, game.rules, lexicon);
      if (!reading.ok) return { ok: false, refusal: reading.problem };
      const { play } = reading;
      next.board = copyBoard(game.board);
      for (const p of action.placements) {
        next.board.cells[p.square] = p.letter;
        next.board.joker[p.square] = p.joker ? 1 : 0;
      }
      next.racks[player] = [...left, ...next.bag.splice(0, game.rules.rackSize - left.length)];
      next.scores[player] += play.score;
      next.idle = 0;
      turn = {
        player,
        kind: "play",
        placements: action.placements.map((p) => ({ ...p })),
        words: play.words.map((word) => decode(word.letters)),
        jokers: play.words[0].squares.flatMap((square, i) => (next.board.joker[square] ? [i] : [])),
        score: play.score,
        bingo: play.bingo,
        star: play.star,
      };
      break;
    }
    case "swap": {
      if (action.tiles.length === 0) return { ok: false, refusal: { kind: "nothing" } };
      if (game.bag.length < SWAP_BAG) return { ok: false, refusal: { kind: "bag" } };
      const left = takeFrom(game.racks[player], action.tiles);
      if (!left) return { ok: false, refusal: { kind: "rack" } };
      const drawn = next.bag.splice(0, action.tiles.length);
      // What goes back is mixed in by the game's own seed, so both sides agree on the order.
      next.bag = shuffle([...next.bag, ...action.tiles], seeded(`${game.seed}:swap:${game.log.length}`));
      next.racks[player] = [...left, ...drawn];
      next.idle = game.idle + 1;
      turn = { player, kind: "swap", count: action.tiles.length };
      break;
    }
    case "pass":
      next.idle = game.idle + 1;
      turn = { player, kind: "pass" };
      break;
    case "resign":
      turn = { player, kind: "resign" };
      break;
  }

  next.log.push(turn);
  next.turn = (game.turn + 1) % game.racks.length;
  next.over = ending(next, turn);
  return { ok: true, game: next, turn };
}

/** Whether that turn ended the game, and how the leftover tiles settle. */
function ending(game: Game, turn: Turn): Ending | null {
  const { rules } = game;
  const leftovers = game.racks.map(() => 0);
  let reason: Ending["reason"];
  if (turn.kind === "resign") {
    reason = "resign";
  } else if (turn.kind === "play" && game.bag.length === 0 && game.racks[turn.player].length === 0) {
    // Going out: everyone else loses what they hold, and the player who went out gains it.
    reason = "out";
    game.racks.forEach((rack, i) => {
      if (i === turn.player) return;
      const value = rackValue(rack, rules);
      leftovers[i] -= value;
      leftovers[turn.player] += value;
    });
  } else if (idleOver(game.idle, game.bag.length)) {
    // Nobody can move: the scores stand as they are, leftover tiles and all.
    reason = "stuck";
  } else {
    return null;
  }
  leftovers.forEach((change, i) => (game.scores[i] += change));
  let winner: number | null;
  if (reason === "resign") {
    winner = game.racks.length === 2 ? 1 - turn.player : null;
  } else {
    const best = Math.max(...game.scores);
    const leaders = game.scores.flatMap((score, i) => (score === best ? [i] : []));
    winner = leaders.length === 1 ? leaders[0] : null;
  }
  return { reason, winner, leftovers };
}
