import type { Table } from "@harfiyen/engine";
import { usePlayers } from "./players.tsx";
import { useState } from "react";
import { runningTotals } from "./Scores.tsx";

const W = 320;
const H = 150;
const PAD = { top: 14, right: 34, bottom: 16, left: 2 };

/** Both running totals turn by turn: who pulled ahead, and when. */
export function ScoreChart({ game }: { game: Table }): React.ReactElement {
  const players = usePlayers();
  const [at, setAt] = useState<number | null>(null);
  const totals = runningTotals(game, players.me);
  if (totals.length < 3) return <p className="muted chart__empty">İki hamleden sonra puanların gidişatı burada çizilir.</p>;

  const top = Math.max(20, ...totals.map((t) => Math.max(t.you, t.bot)));
  const steps = totals.length - 1;
  const x = (i: number): number => PAD.left + (i / steps) * (W - PAD.left - PAD.right);
  const y = (v: number): number => PAD.top + (1 - Math.max(0, v) / top) * (H - PAD.top - PAD.bottom);
  const line = (key: "you" | "bot"): string => totals.map((t, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(t[key]).toFixed(1)}`).join("");
  const last = totals[steps];
  // End labels pushed apart so they never sit on each other.
  let youY = y(last.you);
  let botY = y(last.bot);
  if (Math.abs(youY - botY) < 12) {
    const mid = (youY + botY) / 2;
    const up = last.you >= last.bot ? -6 : 6;
    youY = mid + up;
    botY = mid - up;
  }
  const grid = [0.5, 1].map((f) => Math.round(top * f));

  const onMove = (event: React.PointerEvent<SVGSVGElement>): void => {
    const box = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * steps);
    setAt(Math.max(0, Math.min(steps, i)));
  };
  const shown = at !== null ? totals[at] : null;

  return (
    <figure className="chart">
      <figcaption className="chart__legend">
        <span className="chart__key chart__key--you">Sen</span>
        <span className="chart__key chart__key--bot">{players.name(players.them)}</span>
        {shown && at !== null && (
          <span className="chart__read" aria-live="polite">
            {at === 0 ? "Başlangıç" : at > game.log.length ? "Kalan harfler" : `${at}. hamle`}: <strong>{shown.you}</strong> –{" "}
            <strong>{shown.bot}</strong>
          </span>
        )}
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="chart__svg"
        role="img"
        aria-label={`Puan gidişatı: sen ${last.you}, ${players.name(players.them)} ${last.bot}`}
        onPointerMove={onMove}
        onPointerLeave={() => setAt(null)}
      >
        {grid.map((v) => (
          <g key={v}>
            <line className="chart__grid" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
            <text className="chart__tick" x={PAD.left} y={y(v) - 3}>
              {v}
            </text>
          </g>
        ))}
        <line className="chart__base" x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} />
        <path className="chart__line chart__line--bot" d={line("bot")} />
        <path className="chart__line chart__line--you" d={line("you")} />
        <circle className="chart__end chart__end--bot" cx={x(steps)} cy={y(last.bot)} r="3.5" />
        <circle className="chart__end chart__end--you" cx={x(steps)} cy={y(last.you)} r="3.5" />
        <text className="chart__value" x={x(steps) + 7} y={youY + 4}>
          {last.you}
        </text>
        <text className="chart__value" x={x(steps) + 7} y={botY + 4}>
          {last.bot}
        </text>
        {at !== null && shown && (
          <g className="chart__cross">
            <line x1={x(at)} x2={x(at)} y1={PAD.top - 4} y2={H - PAD.bottom} />
            <circle className="chart__end chart__end--bot" cx={x(at)} cy={y(shown.bot)} r="4" />
            <circle className="chart__end chart__end--you" cx={x(at)} cy={y(shown.you)} r="4" />
          </g>
        )}
        <text className="chart__tick" x={PAD.left} y={H - 3}>
          başlangıç
        </text>
        <text className="chart__tick" x={W - PAD.right} y={H - 3} textAnchor="end">
          {game.log.length}. hamle
        </text>
      </svg>
    </figure>
  );
}
