/**
 * Mercator, the map that lies about size — the game's opponent — and the
 * true-size move: carrying a country across the globe without changing it,
 * so the same map shows it as big as it would look somewhere else.
 *
 * Map units: x is longitude in radians, y grows downwards; a degree of
 * longitude is the same width everywhere, a degree of latitude stretches
 * towards the poles.
 */

const RAD = Math.PI / 180;
/** Mercator runs to infinity at the poles; the map stops here. */
export const MAX_LAT = 85;

export type Point = [number, number];
export type Box = [number, number, number, number];

export function project(lon: number, lat: number): Point {
  const φ = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * RAD;
  return [lon * RAD, -Math.log(Math.tan(Math.PI / 4 + φ / 2))];
}

/** Latitude of a map y, for the graticule's labels. */
export function latitudeAt(y: number): number {
  return (2 * Math.atan(Math.exp(-y)) - Math.PI / 2) / RAD;
}

type Vec = [number, number, number];

function toVec(lon: number, lat: number): Vec {
  const λ = lon * RAD;
  const φ = lat * RAD;
  return [Math.cos(φ) * Math.cos(λ), Math.cos(φ) * Math.sin(λ), Math.sin(φ)];
}

function toLonLat([x, y, z]: Vec): Point {
  return [Math.atan2(y, x) / RAD, Math.asin(Math.max(-1, Math.min(1, z))) / RAD];
}

const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Rodrigues: v turned by `angle` about the unit axis k. */
function rotate(v: Vec, k: Vec, angle: number): Vec {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const kxv = cross(k, v);
  const kdv = dot(k, v);
  return [
    v[0] * c + kxv[0] * s + k[0] * kdv * (1 - c),
    v[1] * c + kxv[1] * s + k[1] * kdv * (1 - c),
    v[2] * c + kxv[2] * s + k[2] * kdv * (1 - c),
  ];
}

/** Puts a longitude on the same side of the date line as `around`, so a country stays in one piece. */
export function unwrap(lon: number, around: number): number {
  let out = lon;
  while (out - around > 180) out -= 360;
  while (out - around < -180) out += 360;
  return out;
}

/** A country's rings on the map, as one SVG path, kept whole across the date line. */
export function pathOf(rings: number[][], around: number): string {
  let d = "";
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 2) {
      const [x, y] = project(unwrap(ring[i], around), ring[i + 1]);
      d += `${i === 0 ? "M" : "L"}${x.toFixed(4)} ${y.toFixed(4)}`;
    }
    d += "Z";
  }
  return d;
}

export function boxOf(rings: number[][], around: number): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 2) {
      const [x, y] = project(unwrap(ring[i], around), ring[i + 1]);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return [minX, minY, maxX, maxY];
}

export const union = (a: Box, b: Box): Box => [
  Math.min(a[0], b[0]),
  Math.min(a[1], b[1]),
  Math.max(a[2], b[2]),
  Math.max(a[3], b[3]),
];

/** How far, in degrees of arc, a country reaches from its centre. */
export function reach(rings: number[][], centroid: Point): number {
  const c = toVec(centroid[0], centroid[1]);
  let most = 0;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 2) {
      most = Math.max(most, Math.acos(Math.max(-1, Math.min(1, dot(c, toVec(ring[i], ring[i + 1]))))));
    }
  }
  return most / RAD;
}

/**
 * The true-size move: the globe turned under the country, first along its
 * parallel, then along its meridian, `t` of the way from where it is to
 * `to`. Shape and area on the globe never change, north stays up at its
 * centre, and only Mercator's idea of its size does.
 */
export function carry(rings: number[][], from: Point, to: Point, t: number): { rings: number[][]; centre: Point } {
  // The longitudes are taken as given — unwrapped, the way they are drawn —
  // so the country travels the way the map shows it, never jumping a seam.
  const east = to[0] - from[0];
  const north = to[1] - from[1];
  if (Math.abs(east) < 1e-9 && Math.abs(north) < 1e-9) return { rings, centre: from };
  const lon = from[0] + east * t;
  const spin: Vec = [0, 0, 1];
  const tilt: Vec = [Math.sin(lon * RAD), -Math.cos(lon * RAD), 0];
  const alongParallel = east * t * RAD;
  const alongMeridian = north * t * RAD;
  const moved = rings.map((ring) => {
    const out = new Array<number>(ring.length);
    for (let i = 0; i < ring.length; i += 2) {
      const v = rotate(rotate(toVec(ring[i], ring[i + 1]), spin, alongParallel), tilt, alongMeridian);
      const [x, y] = toLonLat(v);
      out[i] = x;
      out[i + 1] = y;
    }
    return out;
  });
  return { rings: moved, centre: [lon, from[1] + north * t] };
}

/**
 * Where to set the target down: level with the unit, just east of it, so
 * the two sit side by side under the same stretch of the map.
 */
export function besides(unit: { rings: number[][]; centroid: Point }, target: { rings: number[][]; centroid: Point }): Point {
  const lat = Math.max(-70, Math.min(70, unit.centroid[1]));
  const gap = (reach(unit.rings, unit.centroid) + reach(target.rings, target.centroid)) * 1.08 + 2;
  const lon = unit.centroid[0] + Math.min(170, gap / Math.cos(lat * RAD));
  return [lon, lat];
}

let outline: Promise<number[][][]> | null = null;

/** The world's coasts and borders as [lon, lat] lines, fetched once when first wanted. */
export function loadOutline(): Promise<number[][][]> {
  outline ??= import("@travelle/geo/data/outline.json").then(
    (m) => (m.default as unknown as { coordinates: number[][][] }).coordinates,
  );
  return outline;
}
