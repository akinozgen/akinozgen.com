/**
 * A seeded random stream. The same seed always gives the same board and the
 * same bag, which a game between two browsers will rely on.
 */
export type Random = () => number;

/** 128 bits of state from any string (cyrb128). */
function hash128(text: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** sfc32: small, fast, and good enough for shuffling tiles. */
export function seeded(seed: string): Random {
  let [a, b, c, d] = hash128(seed);
  const next = (): number => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  // The first few outputs still echo the seed.
  for (let i = 0; i < 12; i++) next();
  return next;
}

/** A whole number in [0, n). */
export const below = (random: Random, n: number): number => Math.floor(random() * n);

/** Fisher–Yates, in place. */
export function shuffle<T>(items: T[], random: Random): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = below(random, i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** A fresh seed for a new game, when nobody else has to agree on it. */
export function freshSeed(): string {
  const bytes = new Uint32Array(2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => n.toString(36)).join("");
}
