export type Ring = number[][];

/** Signed-area magnitude in square degrees — a size proxy, not a real area. */
export function ringSize(ring: Ring): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(sum / 2);
}

export function ringCentroid(ring: Ring): [number, number] {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += cross;
    cx += (ring[j][0] + ring[i][0]) * cross;
    cy += (ring[j][1] + ring[i][1]) * cross;
  }
  if (a === 0) return [ring[0][0], ring[0][1]];
  return [cx / (3 * a), cy / (3 * a)];
}

/** Squared distance from p to the segment ab, in degree space. */
function segmentDistanceSq(p: number[], a: number[], b: number[]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = a[0] + t * dx - p[0];
  const ey = a[1] + t * dy - p[1];
  return ex * ex + ey * ey;
}

export function minDistanceToRing(point: number[], ring: Ring): number {
  let best = Infinity;
  for (let i = 1; i < ring.length; i++) {
    const d = segmentDistanceSq(point, ring[i - 1], ring[i]);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/** Douglas-Peucker, applied to a closed ring (first/last point preserved). */
export function simplifyRing(ring: Ring, tolerance: number): Ring {
  if (ring.length <= 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[ring.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, ring.length - 1]];
  const tolSq = tolerance * tolerance;
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let maxDist = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = segmentDistanceSq(ring[i], ring[first], ring[last]);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (maxDist > tolSq && index > 0) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  const out: Ring = [];
  for (let i = 0; i < ring.length; i++) if (keep[i]) out.push(ring[i]);
  // A ring needs at least 4 points (3 distinct + closure) to still be a polygon.
  return out.length >= 4 ? out : ring;
}

export function roundRing(ring: Ring, digits: number): Ring {
  const f = 10 ** digits;
  return ring.map((c) => [Math.round(c[0] * f) / f, Math.round(c[1] * f) / f]);
}

/**
 * Rough shortest gap between two rings, in degrees. Rings are thinned to at
 * most `SAMPLE` points first: this only ranks candidate island hops against
 * each other, so a coarse answer is enough and a Canada-sized ring is not.
 */
const SAMPLE = 160;

function thin(ring: Ring): Ring {
  if (ring.length <= SAMPLE) return ring;
  const step = ring.length / SAMPLE;
  const out: Ring = [];
  for (let i = 0; i < SAMPLE; i++) out.push(ring[Math.floor(i * step)]);
  return out;
}

export function ringGap(a: Ring, b: Ring): number {
  const pa = thin(a);
  const pb = thin(b);
  let best = Infinity;
  for (const p of pa) {
    for (const q of pb) {
      const dx = p[0] - q[0];
      const dy = p[1] - q[1];
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
  }
  return Math.sqrt(best);
}

/** Ray casting against a single ring. */
function inRing(point: number[], ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > point[1] !== yj > point[1]) {
      const x = ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
      if (point[0] < x) inside = !inside;
    }
  }
  return inside;
}

/** True when the point falls inside the outer ring and outside every hole. */
export function inPolygon(point: number[], polygon: Ring[]): boolean {
  if (!inRing(point, polygon[0])) return false;
  for (let i = 1; i < polygon.length; i++) if (inRing(point, polygon[i])) return false;
  return true;
}
