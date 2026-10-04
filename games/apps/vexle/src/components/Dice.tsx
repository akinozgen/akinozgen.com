import { useEffect, useRef, useState } from "react";
import { useLocale } from "../i18n/index.tsx";

/** Pip positions on a 3×3 grid, per face. */
const PIPS: Record<number, Array<[number, number]>> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

export function DieFace({ face, className = "" }: { face: number; className?: string }): React.ReactElement {
  return (
    <svg viewBox="0 0 100 100" className={`die ${className}`} aria-hidden="true">
      <rect x="4" y="4" width="92" height="92" rx="20" className="die__body" />
      {PIPS[face].map(([col, row]) => (
        <circle key={`${col}${row}`} cx={25 + col * 25} cy={25 + row * 25} r="8.5" className="die__pip" />
      ))}
    </svg>
  );
}

const ROLL_MS = 950;
const SETTLE_MS = 420;

/**
 * The die that opens the first tile. The tiles are numbered one to six, so
 * the die lands on the number of the tile that opens. Which tile that is was
 * settled by the server before the roll; the tumble is for the player.
 */
export function Dice({ face, onRolled }: { face: number; onRolled: () => void }): React.ReactElement {
  const { t } = useLocale();
  const [phase, setPhase] = useState<"idle" | "rolling" | "landed">("idle");
  const [shown, setShown] = useState(1 + Math.floor(Math.random() * 6));
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);

  const roll = (): void => {
    if (phase !== "idle") return;
    setPhase("rolling");
    const started = performance.now();
    // Faces flicker fast, then slow down, like a real die coming to rest.
    const tick = (): void => {
      const elapsed = performance.now() - started;
      if (elapsed >= ROLL_MS) {
        setShown(face);
        setPhase("landed");
        timers.current.push(window.setTimeout(onRolled, SETTLE_MS));
        return;
      }
      setShown((current) => {
        let next = current;
        while (next === current) next = 1 + Math.floor(Math.random() * 6);
        return next;
      });
      timers.current.push(window.setTimeout(tick, 60 + (elapsed / ROLL_MS) * 140));
    };
    tick();
  };

  return (
    <div className={`dice dice--${phase}`}>
      <button type="button" className="dice__button" onClick={roll} disabled={phase !== "idle"} autoFocus>
        <DieFace face={shown} className="dice__die" />
        <span className="dice__label">{t("rollDie")}</span>
      </button>
    </div>
  );
}
