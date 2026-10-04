import type { Status } from "@babelle/data/client";

/** One guess as the dial shows it: how far off, and which way to go. */
export interface Bearing {
  key: string;
  km: number;
  bearing: number | null;
  proximity: number;
}
import { useEffect, useId, useRef, useState } from "react";
import { useLocale } from "../i18n/index.tsx";

/** Distance at which a dot reaches the rim: half the planet. */
const FURTHEST_KM = 20_000;
const INNER = 14;
const SPAN = 64;

/** Further guesses sit further out; the square root spreads the near ones apart. */
export function dotRadius(km: number): number {
  return INNER + SPAN * Math.sqrt(Math.min(km, FURTHEST_KM) / FURTHEST_KM);
}

function polar(angle: number, radius: number): [number, number] {
  const rad = (angle * Math.PI) / 180;
  return [radius * Math.sin(rad), -radius * Math.cos(rad)];
}

const TICKS = Array.from({ length: 72 }, (_, i) => i * 5);

/**
 * The compass badge. The needle points from the latest guess towards the
 * answer; every guess is a dot in its own colour, placed in the direction
 * you would travel from it and nearer the centre the nearer it was.
 */
export function Compass({
  results,
  status,
  className = "",
}: {
  results: readonly Bearing[];
  status: Status;
  className?: string;
}): React.ReactElement {
  const { t, number } = useLocale();
  const cardinals = t("cardinals").split(",");
  const last = results[results.length - 1];
  const target = last?.bearing ?? null;
  const won = status === "won";

  // Turn the short way round: keep a running angle and add the smallest step.
  const angle = useRef(0);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (won) {
      // A victory lap that settles on north.
      const base = Math.ceil(angle.current / 360) * 360 + 720;
      angle.current = base;
      setShown(base);
      return;
    }
    if (target === null) return;
    const delta = ((target - angle.current + 540) % 360) - 180;
    angle.current += delta;
    setShown(angle.current);
  }, [target, won]);

  const idle = results.length === 0;
  const faceId = useId();
  const dots = results.filter((r) => r.bearing !== null);

  return (
    <figure
      className={`compass${idle ? " is-idle" : ""}${won ? " is-won" : ""}${status === "lost" ? " is-lost" : ""} ${className}`}
      aria-label={t("compassLabel")}
    >
      <svg viewBox="-100 -100 200 200" className="compass__dial" aria-hidden="true">
        <defs>
          <radialGradient id={faceId} cx="38%" cy="32%" r="80%">
            <stop offset="0%" stopColor="var(--compass-lit)" />
            <stop offset="100%" stopColor="var(--compass-face)" />
          </radialGradient>
        </defs>
        <circle r="96" className="compass__bezel" />
        <circle r="88" fill={`url(#${faceId})`} className="compass__face" />
        <circle r={dotRadius(2000)} className="compass__band" />
        <circle r={dotRadius(8000)} className="compass__band" />
        {TICKS.map((deg) => {
          const major = deg % 90 === 0;
          const mid = deg % 45 === 0;
          const [x1, y1] = polar(deg, major ? 72 : mid ? 76 : 80);
          const [x2, y2] = polar(deg, 86);
          return (
            <line
              key={deg}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              className={`compass__tick${major ? " is-major" : mid ? " is-mid" : ""}`}
            />
          );
        })}
        {cardinals.map((letter, i) => {
          const [x, y] = polar(i * 90, 60);
          return (
            <text key={letter + i} x={x} y={y} className={`compass__cardinal${i === 0 ? " is-north" : ""}`}>
              {letter}
            </text>
          );
        })}

        <g className="compass__needle-wrap">
          <g className="compass__needle" style={{ transform: `rotate(${shown}deg)` }}>
            <path d="M0 -70 L9 0 L0 6 L-9 0 Z" className="compass__needle-north" />
            <path d="M0 70 L9 0 L0 -6 L-9 0 Z" className="compass__needle-south" />
          </g>
        </g>
        <circle r="8" className="compass__hub" />
        <circle r="3" className="compass__pin" />

        {dots.map((result, index) => {
          const [x, y] = polar(result.bearing!, dotRadius(result.km));
          const latest = index === dots.length - 1 && status === "playing";
          const slot = results.indexOf(result) + 1;
          return (
            <g key={result.key} className={`compass__dot dot--${slot}${latest ? " is-latest" : ""}`}>
              {latest && <circle cx={x} cy={y} r="9" className="compass__pulse" />}
              <circle cx={x} cy={y} r={latest ? 6 : 4.5} />
            </g>
          );
        })}

      </svg>

      <figcaption className="compass__readout">
        {idle ? (
          <span className="compass__idle">{t("compassIdle")}</span>
        ) : won ? (
          <strong>{t("compassFound")}</strong>
        ) : last ? (
          <>
            <strong>{t("km", { n: number(last.km) })}</strong>
            <span>{last.proximity}%</span>
          </>
        ) : null}
      </figcaption>
    </figure>
  );
}

/** A small arrow for a guess row, turned to the bearing. */
export function Arrow({ bearing }: { bearing: number }): React.ReactElement {
  return (
    <svg viewBox="-12 -12 24 24" className="arrow" style={{ transform: `rotate(${bearing}deg)` }} aria-hidden="true">
      <path d="M0 -9 L6 3 L0 0 L-6 3 Z" />
    </svg>
  );
}
