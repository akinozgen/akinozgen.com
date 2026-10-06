import { useEffect, useRef } from "react";

const COLOURS = ["#2f9e44", "#3b5bdb", "#e8890c", "#7048e8", "#1098ad"];
const COUNT = 90;
const LIFE_MS = 2600;

interface Fleck {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  angle: number;
  size: number;
  colour: string;
}

/**
 * A burst on winning. Small enough not to want a dependency, and it bows out
 * entirely for anyone who has asked for less motion.
 */
export function Confetti(): React.ReactElement | null {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const node = canvas.current;
    const ctx = node?.getContext?.("2d");
    if (!node || !ctx) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const dpr = window.devicePixelRatio || 1;
    const width = node.clientWidth || 640;
    const height = node.clientHeight || 200;
    node.width = width * dpr;
    node.height = height * dpr;
    ctx.scale(dpr, dpr);

    const flecks: Fleck[] = Array.from({ length: COUNT }, () => ({
      x: width * (0.25 + Math.random() * 0.5),
      y: height * 0.45,
      vx: (Math.random() - 0.5) * 7,
      vy: -6 - Math.random() * 7,
      spin: (Math.random() - 0.5) * 0.3,
      angle: Math.random() * Math.PI,
      size: 4 + Math.random() * 5,
      colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
    }));

    let raf = 0;
    const started = performance.now();
    const step = (now: number): void => {
      const elapsed = now - started;
      ctx.clearRect(0, 0, width, height);
      for (const fleck of flecks) {
        fleck.vy += 0.25;
        fleck.vx *= 0.995;
        fleck.x += fleck.vx;
        fleck.y += fleck.vy;
        fleck.angle += fleck.spin;
        ctx.save();
        ctx.translate(fleck.x, fleck.y);
        ctx.rotate(fleck.angle);
        ctx.globalAlpha = Math.max(0, 1 - elapsed / LIFE_MS);
        ctx.fillStyle = fleck.colour;
        ctx.fillRect(-fleck.size / 2, -fleck.size / 4, fleck.size, fleck.size / 2);
        ctx.restore();
      }
      if (elapsed < LIFE_MS) raf = requestAnimationFrame(step);
      else ctx.clearRect(0, 0, width, height);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvas} className="confetti" aria-hidden="true" />;
}
