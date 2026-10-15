import type { Level } from "@harfiyen/engine";
import { useState } from "react";
import { GiveUp } from "../components/GiveUp.tsx";
import { BOT_PLAYERS } from "../components/players.tsx";
import { LEVEL_NAME } from "../components/Scores.tsx";
import { Sheet } from "../components/Sheet.tsx";
import { NewGameSheet } from "../components/Sheets.tsx";
import { useStats } from "../components/stats.ts";
import { StatsView } from "../components/StatsView.tsx";
import { ChartIcon, PlusIcon, RulesIcon, TopBar } from "../components/TopBar.tsx";
import type { Lexicons } from "../game/lexicons.ts";
import { useTingOnTheirMove } from "../game/sound.ts";
import { HUMAN, useGame } from "../game/useGame.ts";
import { Dots, GameScreen } from "./GameScreen.tsx";

/** A game against the computer: the screen, its level and board, its record. */
export function BotGame({
  lexicons,
  failed,
  onRetry,
  onRules,
  blocked,
  waiting,
}: {
  lexicons: Lexicons | null;
  failed: boolean;
  onRetry: () => void;
  onRules: () => void;
  /** A sheet of the app's is open. */
  blocked: boolean;
  /** Online games waiting on the player, for the switch at the top. */
  waiting: number;
}): React.ReactElement {
  const api = useGame(lexicons);
  const { table } = api;
  const stats = useStats(table, api.level);
  useTingOnTheirMove(table, HUMAN);
  const [sheet, setSheet] = useState<"new" | "stats" | null>(null);
  const [preset, setPreset] = useState<Level | null>(null);
  const close = (): void => {
    setSheet(null);
    setPreset(null);
  };
  const playing = !table.over && table.log.length > 0;

  return (
    <>
      <TopBar section="bot" waiting={waiting}>
        <button type="button" className="icon-button" aria-label="İstatistik" title="İstatistik" onClick={() => setSheet("stats")}>
          <ChartIcon />
        </button>
        <button type="button" className="icon-button" aria-label="Yeni oyun" title="Yeni oyun" onClick={() => setSheet("new")}>
          <PlusIcon />
        </button>
        <button type="button" className="icon-button" aria-label="Nasıl oynanır" title="Nasıl oynanır" onClick={onRules}>
          <RulesIcon />
        </button>
      </TopBar>

      <GameScreen
        api={api}
        lexicons={lexicons}
        failed={failed}
        onRetry={onRetry}
        players={BOT_PLAYERS}
        level={api.level}
        blocked={blocked || sheet !== null}
        meta={
          <>
            <button type="button" className="stage__level" onClick={() => setSheet("new")} title="Rakibi değiştir">
              {LEVEL_NAME[api.level]} rakip
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m7 10 5 5 5-5" />
              </svg>
            </button>
            <span aria-hidden="true">·</span>
            <span>{table.log.length === 0 ? "İlk hamle" : `${table.log.length}. hamle`}</span>
          </>
        }
        waitingStatus={
          <span>
            Bilgisayar düşünüyor
            <Dots />
          </span>
        }
        end={{
          againLabel: "Yeniden oyna",
          onAgain: () => api.restart(api.level),
          newLabel: "Ayarla…",
          onNew: () => setSheet("new"),
        }}
        actions={
          <>
            <button type="button" className="button" onClick={() => setSheet("new")}>
              <PlusIcon />
              Yeni oyun
            </button>
            <GiveUp disabled={!lexicons} onConfirm={api.resign} />
          </>
        }
        overExtra={
          <div className="panel__stats">
            <h2 className="panel__title">İstatistik</h2>
            <StatsView stats={stats} fresh />
          </div>
        }
      />

      {sheet === "stats" && (
        <Sheet title="İstatistik" onClose={close}>
          <StatsView stats={stats} />
        </Sheet>
      )}
      {sheet === "new" && (
        <NewGameSheet
          level={preset ?? api.level}
          kind={api.boardKind}
          playing={playing}
          onStart={(level, kind) => {
            api.restart(level, kind);
            close();
          }}
          onClose={close}
        />
      )}
    </>
  );
}
