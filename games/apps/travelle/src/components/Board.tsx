import type { GuessResult } from "@travelle/geo";
import { useMemo, useState } from "react";
import { Trans, useLocale } from "../i18n/index.tsx";
import { puzzleTitle, puzzleSubtitle } from "../i18n/puzzleText.ts";
import type { Game, Round } from "../game/useGame.ts";
import { EndPanel } from "./EndPanel.tsx";
import { GuessList } from "./GuessList.tsx";
import { GuessMeter } from "./GuessMeter.tsx";
import { Hints } from "./Hints.tsx";
import { MapView, type Shown, type Tone } from "./MapView.tsx";
import { SearchBar } from "./SearchBar.tsx";

const TONE_FOR_MARK: Record<GuessResult["mark"], Tone> = {
  chain: "chain",
  closer: "closer",
  detour: "detour",
  wrong: "wrong",
};

export function Board({
  round,
  game,
  footer,
}: {
  round: Round;
  game: Game;
  footer?: React.ReactNode;
}): React.ReactElement {
  const { puzzle, graph } = round;
  const { t, name } = useLocale();
  const [notice, setNotice] = useState<string | null>(null);
  const over = game.status !== "playing";

  const shown = useMemo<Shown[]>(() => {
    const entries: Shown[] = [
      { regionId: puzzle.start, tone: "start", label: name(puzzle.start) },
      { regionId: puzzle.end, tone: "end", label: name(puzzle.end) },
      ...game.results.map((result) => ({
        regionId: result.region,
        tone: TONE_FOR_MARK[result.mark],
        label: name(result.region),
      })),
    ];

    // The first hint outlines the next country, unlabelled. The second draws
    // the whole world's borders instead, which is context rather than answer.
    const outlined: string[] = [];
    if (game.hints.includes("neighbours")) outlined.push(...game.endpointNeighbours);
    if (game.hints.includes("next-outline") && game.nextRegion) outlined.push(game.nextRegion);
    for (const regionId of outlined) {
      if (entries.some((entry) => entry.regionId === regionId)) continue;
      entries.push({ regionId, tone: "hint" });
    }
    return entries;
  }, [puzzle.start, puzzle.end, game.results, game.hints, game.suggestion, game.nextRegion, game.endpointNeighbours, name]);

  const guessable = useMemo(
    () => graph.playableRegions().map((region) => region.id),
    [graph],
  );

  return (
    <>
      <p className="prompt">
        <Trans
          k="travelFrom"
          values={{
            start: <strong className="prompt__start">{name(puzzle.start)}</strong>,
            end: <strong className="prompt__end">{name(puzzle.end)}</strong>,
          }}
        />
      </p>
      <p className="prompt__meta">
        {puzzleTitle(puzzle, t)} · {puzzleSubtitle(puzzle, t)}
      </p>

      <MapView
        shown={shown}
        worldOutline={game.hints.includes("all-outlines")}
        celebrate={game.status === "won"}
      />

      {!over && (
        <>
          <GuessMeter results={game.results} budget={puzzle.budget} />
          <SearchBar
            disabled={over}
            allowed={guessable}
            taken={[puzzle.start, puzzle.end, ...game.guesses]}
            onGuess={(regionId) => {
              const outcome = game.guess(regionId);
              setNotice(
                outcome === "duplicate" ? t("alreadyIn", { country: name(regionId) }) : null,
              );
            }}
          />
          {notice && <p className="notice">{notice}</p>}
        </>
      )}

      <GuessList results={game.results} />

      {!over && (
        <>
          <Hints
            used={game.hints}
            disabled={over}
            suggestion={game.suggestion}
            onUse={game.useHint}
          />
          <button type="button" className="button button--quiet" onClick={game.giveUp}>
            {t("giveUp")}
          </button>
        </>
      )}

      {over && <EndPanel puzzle={puzzle} game={game} stats={game.stats} />}
      {footer}
    </>
  );
}
