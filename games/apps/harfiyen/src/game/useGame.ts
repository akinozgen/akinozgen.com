import {
  type Action,
  apply,
  type BoardKind,
  chooseMove,
  freshSeed,
  type Game,
  type Level,
  loadGame,
  makeRules,
  newGame,
  type Refusal,
  saveGame,
  TILE_SET,
  viewOf,
} from "@harfiyen/engine";
import { readJson, writeJson } from "@travelle/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { botWords, type Lexicons } from "./lexicons.ts";
import { type PlayApi, useHand } from "./useHand.ts";

export type { Draft } from "./useHand.ts";

export const HUMAN = 0;
export const BOT = 1;

const SAVE_KEY = "harfiyen:game:v1";
const LEVEL_KEY = "harfiyen:level:v1";
const BOARD_KEY = "harfiyen:board:v1";

interface Saved {
  game: string;
  level: Level;
  view: number[];
}

/** A new game; the very first one the player starts, after that whoever didn't start the last. */
function startGame(kind: BoardKind, first: number = HUMAN): Game {
  const seed = freshSeed();
  return newGame(seed, makeRules(seed, kind), TILE_SET, 2, first);
}

function restore(): Saved | null {
  const saved = readJson<Saved>(SAVE_KEY);
  if (!saved) return null;
  const game = loadGame(saved.game);
  return game ? saved : null;
}

/** A game against the computer, kept in this browser. */
export function useGame(lexicons: Lexicons | null) {
  const [saved] = useState(restore);
  const [level, setLevel] = useState<Level>(() => saved?.level ?? readJson<Level>(LEVEL_KEY) ?? "kolay");
  /** The board kind new games get: the fixed one, or a fresh one each game. */
  const [boardKind, setBoardKind] = useState<BoardKind>(() => readJson<BoardKind>(BOARD_KEY) ?? "klasik");
  const [game, setGame] = useState<Game>(() => (saved ? loadGame(saved.game)! : startGame(boardKind)));
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [thinking, setThinking] = useState(false);

  const table = useMemo(() => viewOf(game, HUMAN), [game]);
  const yourTurn = game.turn === HUMAN && !game.over;
  const hand = useHand(table.rack, table.board, table.rules, lexicons?.full ?? null, !game.over, saved?.view);

  useEffect(() => {
    writeJson(SAVE_KEY, { game: saveGame(game), level, view: hand.view } satisfies Saved);
  }, [game, level, hand.view]);

  // Moving tiles about clears the last complaint.
  useEffect(() => setRefusal(null), [hand.draft]);

  const timer = useRef<number | undefined>(undefined);

  const run = useCallback(
    (action: Action) => {
      if (!lexicons) return;
      const outcome = apply(game, action, lexicons.full, HUMAN);
      if (!outcome.ok) {
        setRefusal(outcome.refusal);
        return;
      }
      setRefusal(null);
      setGame(outcome.game);
    },
    [game, lexicons],
  );

  // The computer moves a beat after the player, so its word can be seen arriving.
  useEffect(() => {
    if (!lexicons || game.over || game.turn !== BOT) return;
    setThinking(true);
    timer.current = window.setTimeout(() => {
      const words = botWords(lexicons, level);
      const outcome = apply(game, chooseMove(game, words, level), words);
      // Its words come from the same list it's checked against, so this can't fail short of a bug; it passes then.
      const settled = outcome.ok ? outcome : apply(game, { kind: "pass" }, words);
      setThinking(false);
      if (settled.ok) setGame(settled.game);
    }, 650);
    return () => {
      window.clearTimeout(timer.current);
      setThinking(false);
    };
  }, [game, lexicons, level]);

  const submit = useCallback(() => {
    if (yourTurn) run({ kind: "play", placements: hand.placements });
  }, [yourTurn, run, hand.placements]);

  const swap = useCallback(
    (slots: number[]) => {
      if (yourTurn) run({ kind: "swap", tiles: slots.map((slot) => hand.view[slot]) });
    },
    [yourTurn, run, hand.view],
  );

  const pass = useCallback(() => {
    if (yourTurn) run({ kind: "pass" });
  }, [yourTurn, run]);

  /** Resigning works on either turn: the computer's move, if it's thinking, never lands. */
  const resign = useCallback(() => {
    if (game.over) return;
    window.clearTimeout(timer.current);
    run({ kind: "resign" });
  }, [game.over, run]);

  const restart = useCallback(
    (next: Level, kind: BoardKind = boardKind) => {
      window.clearTimeout(timer.current);
      const fresh = startGame(kind, (game.first ?? HUMAN) === HUMAN ? BOT : HUMAN);
      writeJson(LEVEL_KEY, next);
      writeJson(BOARD_KEY, kind);
      setBoardKind(kind);
      setLevel(next);
      setGame(fresh);
      setRefusal(null);
    },
    [boardKind, game.first],
  );

  const api: PlayApi = { ...hand, table, refusal, yourTurn, busy: thinking, submit, swap, pass, resign };
  return { ...api, game, level, boardKind, thinking, restart };
}

export type GameApi = ReturnType<typeof useGame>;
