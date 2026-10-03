import type { GuessMark } from "@travelle/geo/client";
import { useMemo, useRef, useState } from "react";
import { Trans, useLocale } from "../i18n/index.tsx";
import { puzzleTitle, puzzleSubtitle } from "../i18n/puzzleText.ts";
import type { Game, Round } from "../game/useGame.ts";
import { EndPanel } from "./EndPanel.tsx";
import { GuessList } from "./GuessList.tsx";
import { GuessMeter } from "./GuessMeter.tsx";
import { Hints } from "./Hints.tsx";
import { MapView, type Shown, type Tone } from "./MapView.tsx";
import { SearchBar } from "./SearchBar.tsx";

const TONE_FOR_MARK: Record<GuessMark, Tone> = {
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
  const { puzzle } = round;
  const { t, name } = useLocale();
  const [notice, setNotice] = useState<string | null>(null);
  const over = game.status !== "playing";
  const windowRef = useRef<HTMLDivElement>(null);

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
  }, [puzzle.start, puzzle.end, game.results, game.hints, game.nextRegion, game.endpointNeighbours, name]);

  const guessable = round.allowed;

  return (
    <>
      <MapView
        shown={shown}
        worldOutline={game.hints.includes("all-outlines")}
        celebrate={game.status === "won"}
        windowRef={windowRef}
      />
      <div className="hud">
        <div className="hud__top" />
        <div className="hud__window" ref={windowRef} />
        <div className={`hud__sheet${over ? " is-over" : ""}`}>
          <aside className="panel panel--play">
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

            {!over && (
              <>
                <GuessMeter results={game.results} budget={puzzle.budget} />
                <SearchBar
                  disabled={over || game.pending}
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
                {game.failed && (
                  <p className="notice">
                    {t("serverError")}{" "}
                    <button type="button" className="link-button" onClick={game.retry}>
                      {t("retry")}
                    </button>
                  </p>
                )}
              </>
            )}

            <div className="panel__scroll">
              <GuessList results={game.results} />
            </div>

            {!over && (
              <button type="button" className="button button--quiet" onClick={game.giveUp}>
                {t("giveUp")}
              </button>
            )}
          </aside>

          <aside className="panel panel--side">
            {over ? (
              <EndPanel puzzle={puzzle} game={game} stats={game.stats} />
            ) : (
              <Hints
                used={game.hints}
                disabled={over || game.pending}
                initials={game.initials}
                onUse={game.useHint}
              />
            )}
            {footer}
          </aside>
        </div>
      </div>
    </>
  );
}

/** The frame without a round in it: the globe, and why it is empty. */
export function EmptyBoard({ children }: { children: React.ReactNode }): React.ReactElement {
  const windowRef = useRef<HTMLDivElement>(null);
  return (
    <>
      <MapView shown={[]} windowRef={windowRef} />
      <div className="hud">
        <div className="hud__top" />
        <div className="hud__window" ref={windowRef} />
        <div className="hud__sheet">
          <aside className="panel panel--play">
            <p className="empty">{children}</p>
          </aside>
        </div>
      </div>
    </>
  );
}
