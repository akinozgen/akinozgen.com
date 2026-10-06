import { RATIO_MAX, RATIO_MIN } from "@sizele/data/client";

/**
 * Ratios as people say them: "2.5 times", "three quarters", "a seventh".
 * Below one a ratio is a plain fraction — no decimals under the line — and
 * what the slider shows is exactly what gets guessed.
 */

type Fraction = [number, number];

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Every fraction a person would say below one: p/q up to tenths, then an eleventh … a fiftieth. */
const FRACTIONS: Fraction[] = (() => {
  const out: Fraction[] = [];
  for (let q = 2; q <= 10; q++) for (let p = 1; p < q; p++) if (gcd(p, q) === 1) out.push([p, q]);
  for (const q of [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 25, 28, 30, 35, 40, 45, 50]) out.push([1, q]);
  return out.sort((a, b) => a[0] / a[1] - b[0] / b[1]);
})();

function nearestFraction(ratio: number): Fraction {
  let best = FRACTIONS[0];
  for (const fraction of FRACTIONS) {
    if (Math.abs(Math.log(ratio * (fraction[1] / fraction[0]))) < Math.abs(Math.log(ratio * (best[1] / best[0])))) {
      best = fraction;
    }
  }
  return best;
}

/** The value a ratio reads as: whole numbers from ten up, one decimal below, fractions under one. */
export function nice(ratio: number): number {
  const r = Math.min(RATIO_MAX, Math.max(RATIO_MIN, ratio));
  if (r >= 0.95) return r >= 10 ? Math.round(r) : Math.max(1, Math.round(r * 10) / 10);
  const [p, q] = nearestFraction(r);
  return p / q;
}

/** "2,5" or "3/4", in the player's own number style. */
export function ratioText(ratio: number, language: string): string {
  if (ratio >= 0.95) {
    const value = ratio >= 10 ? Math.round(ratio) : Math.max(1, Math.round(ratio * 10) / 10);
    return new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value);
  }
  // The map's own numbers can run past the slider's end: say them as they are.
  if (ratio < 1 / 55) return `1/${Math.round(1 / ratio)}`;
  const [p, q] = nearestFraction(ratio);
  return `${p}/${q}`;
}

/** The steps − and + walk along: round numbers a person would pick. */
const LADDER = [
  1 / 50, 1 / 40, 1 / 30, 1 / 25, 1 / 20, 1 / 15, 1 / 12, 1 / 10, 1 / 9, 1 / 8, 1 / 7, 1 / 6, 1 / 5, 1 / 4, 1 / 3,
  2 / 5, 1 / 2, 3 / 5, 2 / 3, 3 / 4, 4 / 5, 9 / 10, 1, 1.1, 1.2, 1.3, 1.5, 1.7, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8,
  9, 10, 12, 15, 20, 25, 30, 40, 50,
];

export function step(ratio: number, direction: 1 | -1): number {
  if (direction > 0) return LADDER.find((value) => value > ratio * 1.001) ?? RATIO_MAX;
  return [...LADDER].reverse().find((value) => value < ratio / 1.001) ?? RATIO_MIN;
}
