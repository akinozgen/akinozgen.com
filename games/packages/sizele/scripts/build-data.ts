import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import countries from "i18n-iso-countries";
import geo from "../../geo/data/geo.json" with { type: "json" };
import geometry from "../../geo/data/geometry.json" with { type: "json" };
import balanced from "../../vexle/data/answers-v2.json" with { type: "json" };
import vexle from "../../vexle/data/countries.json" with { type: "json" };
import { LANGUAGES, type Language } from "../src/types.ts";

/**
 * Builds sizele's data from travelle's map:
 *
 *  - data/countries.json, every country a round can deal: its area on the
 *    globe, its area as Mercator draws it, where it sits and a thinned
 *    outline. Server only — it holds every answer.
 *  - data/names.json, every country's name in every language. The browser's.
 *
 * Areas are measured on the full-detail outline, then the outline is thinned
 * for drawing; the browser only ever sees the thinned one.
 */

interface GeoRegion {
  id: string;
  iso3: string;
  names: Record<"en" | "tr" | "de" | "es", string>;
  continent: string;
  areas: number[];
}

type Ring = number[][];

const GEO = geo as unknown as { regions: GeoRegion[] };
const SHAPES = geometry as unknown as Ring[][];
const VEXLE = vexle as Array<{ code: string; names: Record<Language, string> }>;
const DATA = new URL("../data/", import.meta.url);

/** Countries: UN members, the observers, Kosovo and Taiwan — vexle's list. */
const SOVEREIGN = new Set([...balanced.core, ...balanced.half]);
/** Greenland is not a country, but it is the reason this game exists. */
const ALSO = new Set(["greenland"]);
/**
 * Natural Earth's Morocco takes in part of Western Sahara, so its area
 * matches no textbook; a size game cannot deal it.
 */
const LEAVE_OUT = new Set(["morocco"]);
/**
 * Natural Earth draws Somaliland apart from Somalia; the area everyone looks
 * up for Somalia includes it.
 */
const MERGE: Record<string, string[]> = { somalia: ["somaliland"] };

/** Too small to see on a world map, or to make a fair round of. */
const MIN_KM2 = 20_000;
/** A landmass this big a share of its country is always drawn (Alaska, Tasmania…). */
const KEEP_SHARE = 0.02;
/** Smaller landmasses stay if they lie this close to something already kept, hop by hop. */
const HOP_KM = 300;
/** Specks below this are left out unless they are all there is. */
const SPECK_KM2 = 200;
/** Thinning, in degrees: finer for small countries, coarser for giants. */
const THIN_MIN = 0.04;

/** The ones people measure the world in. */
const UNITS = [
  // A wider bench of familiar countries, so the blue one isn't always the same few.
  "belgium",
  "netherlands",
  "switzerland",
  "portugal",
  "austria",
  "cuba",
  "new-zealand",
  "peru",
  "colombia",
  "chile",
  "thailand",
  "vietnam",
  "pakistan",
  "philippines",
  "south-korea",
  "finland",
  "romania",
  "kenya",
  "ethiopia",
  "mongolia",
  "iraq",
  "afghanistan",
  "denmark",
  "ireland",
  "iceland",
  "madagascar",
  "venezuela",
  "turkey",
  "germany",
  "france",
  "spain",
  "italy",
  "united-kingdom",
  "japan",
  "egypt",
  "brazil",
  "india",
  "australia",
  "mexico",
  "argentina",
  "south-africa",
  "nigeria",
  "iran",
  "saudi-arabia",
  "ukraine",
  "poland",
  "greece",
  "sweden",
  "norway",
  "china",
  "united-states-of-america",
  "canada",
  "russia",
  "indonesia",
  "kazakhstan",
  "algeria",
  "democratic-republic-of-the-congo",
];

const ISO3_FIXES: Record<string, string> = { cuba: "CUB", cyprus: "CYP", kosovo: "XKX" };
const ALPHA2_FIXES: Record<string, string> = { XKX: "XK" };

const R = 6371.0088;
const rad = Math.PI / 180;

/**
 * Signed area of a lon/lat ring on the sphere, in km² (Chamberlain &
 * Duquette, as d3 and turf use it). Exact enough at 3 km detail.
 */
function sphericalArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [λ1, φ1] = ring[i];
    const [λ2, φ2] = ring[(i + 1) % ring.length];
    sum += (λ2 - λ1) * rad * (2 + Math.sin(φ1 * rad) + Math.sin(φ2 * rad));
  }
  return (sum * R * R) / 2;
}

const MERC_LIMIT = 85 * rad;
const mercY = (φ: number): number => Math.log(Math.tan(Math.PI / 4 + Math.max(-MERC_LIMIT, Math.min(MERC_LIMIT, φ * rad)) / 2));

/** Planar area in Mercator units (x and y in radians-ish), latitudes clamped at ±85°. */
function mercatorArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xj = ring[j][0] * rad;
    const xi = ring[i][0] * rad;
    sum += xj * mercY(ring[i][1]) - xi * mercY(ring[j][1]);
  }
  return sum / 2;
}

/** Outer ring minus holes. */
function partArea(part: Ring[], measure: (ring: Ring) => number): number {
  if (part.length === 0) return 0;
  return Math.abs(measure(part[0])) - part.slice(1).reduce((sum, hole) => sum + Math.abs(measure(hole)), 0);
}

function centroid(ring: Ring): [number, number] {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += cross;
    cx += (ring[j][0] + ring[i][0]) * cross;
    cy += (ring[j][1] + ring[i][1]) * cross;
  }
  return a === 0 ? [ring[0][0], ring[0][1]] : [cx / (3 * a), cy / (3 * a)];
}

function haversine(a: number[], b: number[]): number {
  const dφ = (b[1] - a[1]) * rad;
  const dλ = (b[0] - a[0]) * rad;
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function thinPoints(ring: Ring, most: number): Ring {
  if (ring.length <= most) return ring;
  const step = ring.length / most;
  return Array.from({ length: most }, (_, i) => ring[Math.floor(i * step)]);
}

function gap(a: Ring, b: Ring): number {
  let best = Infinity;
  for (const p of thinPoints(a, 120)) for (const q of thinPoints(b, 240)) best = Math.min(best, haversine(p, q));
  return best;
}

function segmentDistanceSq(p: number[], a: number[], b: number[]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = dx * dx + dy * dy;
  let t = length === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length;
  t = Math.max(0, Math.min(1, t));
  return (a[0] + t * dx - p[0]) ** 2 + (a[1] + t * dy - p[1]) ** 2;
}

/** Douglas–Peucker on a closed ring. */
function simplify(ring: Ring, tolerance: number): Ring {
  if (ring.length <= 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[ring.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, ring.length - 1]];
  const tolSq = tolerance * tolerance;
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let max = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = segmentDistanceSq(ring[i], ring[first], ring[last]);
      if (d > max) {
        max = d;
        index = i;
      }
    }
    if (max > tolSq && index > 0) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return ring.filter((_, i) => keep[i]);
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

function codeOf(region: GeoRegion): string | undefined {
  const iso3 = ISO3_FIXES[region.id] ?? region.iso3;
  return ALPHA2_FIXES[iso3] ?? countries.alpha3ToAlpha2(iso3);
}

const byId = new Map(GEO.regions.map((region) => [region.id, region]));
const vexleByCode = new Map(VEXLE.map((country) => [country.code, country]));
const merged = new Set(Object.values(MERGE).flat());

interface Candidate {
  id: string;
  continent: string;
  area: number;
  merc: number;
  centroid: [number, number];
  rings: number[][];
  unit?: true;
}

const out: Candidate[] = [];
const names: Record<string, Record<Language, string>> = {};
const skipped: string[] = [];

for (const region of GEO.regions) {
  if (merged.has(region.id)) continue;
  const code = codeOf(region);
  if (LEAVE_OUT.has(region.id) || (!ALSO.has(region.id) && !(code && SOVEREIGN.has(code)))) continue;
  const areaIds = [region.id, ...(MERGE[region.id] ?? [])].flatMap((id) => byId.get(id)!.areas);
  const parts = areaIds.map((id) => SHAPES[id]).filter((part): part is Ring[] => !!part && part.length > 0);
  if (parts.length === 0) continue;

  const sizes = parts.map((part) => partArea(part, sphericalArea));
  const total = sizes.reduce((sum, size) => sum + size, 0);
  const main = sizes.indexOf(Math.max(...sizes));

  // Big landmasses always; then anything near what is kept, hop by hop.
  const kept = new Set(sizes.map((size, i) => (i === main || size >= total * KEEP_SHARE ? i : -1)).filter((i) => i >= 0));
  let grew = true;
  while (grew) {
    grew = false;
    for (let i = 0; i < parts.length; i++) {
      if (kept.has(i) || sizes[i] < SPECK_KM2) continue;
      for (const k of kept) {
        if (gap(parts[i][0], parts[k][0]) <= HOP_KM) {
          kept.add(i);
          grew = true;
          break;
        }
      }
    }
  }

  const keptParts = [...kept].map((i) => parts[i]);
  const area = [...kept].reduce((sum, i) => sum + sizes[i], 0);
  if (area < MIN_KM2) {
    skipped.push(`${region.id} (${Math.round(area)} km²)`);
    continue;
  }
  const merc = keptParts.reduce((sum, part) => sum + partArea(part, mercatorArea), 0);
  const middle = centroid(parts[main][0]);

  // Drawn around the main landmass: a part over the date line (Chukotka,
  // the far Aleutians) is carried round to the side the country is on.
  const tolerance = Math.max(THIN_MIN, Math.sqrt(area) / 111 / 160);
  const rings: number[][] = [];
  for (const part of keptParts) {
    const meanLon = part[0].reduce((sum, p) => sum + p[0], 0) / part[0].length;
    const shift = meanLon - middle[0] > 180 ? -360 : meanLon - middle[0] < -180 ? 360 : 0;
    for (const ring of part) {
      const thin = simplify(ring, tolerance);
      if (thin.length < 4) continue;
      const flat: number[] = [];
      for (const [lon, lat] of thin) flat.push(round2(lon + shift), round2(lat));
      // A ring closes itself; a repeated closing point is only weight.
      if (flat[0] === flat[flat.length - 2] && flat[1] === flat[flat.length - 1]) flat.splice(-2);
      if (flat.length >= 6) rings.push(flat);
    }
  }

  out.push({
    id: region.id,
    continent: region.continent,
    area: Math.round(area),
    merc: Number(merc.toPrecision(6)),
    centroid: [round2(middle[0]), round2(middle[1])],
    rings,
    ...(UNITS.includes(region.id) ? { unit: true as const } : {}),
  });

  const known = code ? vexleByCode.get(code) : undefined;
  names[region.id] = known
    ? { ...known.names }
    : { en: region.names.en, tr: region.names.tr, de: region.names.de, es: region.names.es, ru: region.names.en };
}

const ids = new Set(out.map((c) => c.id));
const missingUnits = UNITS.filter((id) => !ids.has(id));
if (missingUnits.length > 0) throw new Error(`units not among the countries: ${missingUnits.join(", ")}`);
for (const id of Object.keys(names)) {
  for (const language of LANGUAGES) if (!names[id][language]) throw new Error(`${id} has no ${language} name`);
}

/** Names as people say them, where the source has the formal one. */
const SHORT_EN: Record<string, string> = {
  "republic-of-serbia": "Serbia",
  "united-republic-of-tanzania": "Tanzania",
  "democratic-republic-of-the-congo": "DR Congo",
  "republic-of-the-congo": "Congo",
};
for (const [id, en] of Object.entries(SHORT_EN)) if (names[id]) names[id].en = en;

out.sort((a, b) => a.id.localeCompare(b.id));
const sortedNames = Object.fromEntries(Object.entries(names).sort(([a], [b]) => a.localeCompare(b)));

await mkdir(DATA, { recursive: true });
const body = JSON.stringify(out);
await writeFile(new URL("countries.json", DATA), body);
await writeFile(new URL("names.json", DATA), `${JSON.stringify(sortedNames, null, 2)}\n`);

// --- report ---
const points = out.map((c) => c.rings.reduce((sum, ring) => sum + ring.length / 2, 0));
const sortedPoints = [...points].sort((a, b) => a - b);
console.log(`countries: ${out.length} (${UNITS.length} units), skipped as too small: ${skipped.length}`);
console.log(`countries.json: ${(body.length / 1024).toFixed(0)} KB raw, ${(gzipSync(body).length / 1024).toFixed(0)} KB gzip`);
console.log(`points per country: median ${sortedPoints[Math.floor(points.length / 2)]}, max ${sortedPoints.at(-1)} (${out[points.indexOf(sortedPoints.at(-1)!)].id})`);
const find = (id: string): Candidate => out.find((c) => c.id === id)!;
for (const id of ["turkey", "greenland", "brazil", "russia", "united-states-of-america", "france", "somalia"]) {
  const c = find(id);
  console.log(`  ${id}: ${c.area.toLocaleString("en")} km², ${c.rings.length} rings`);
}
const ratio = find("greenland").area / find("turkey").area;
const apparent = find("greenland").merc / find("turkey").merc;
console.log(`greenland / turkey: ${ratio.toFixed(2)} on the globe, ${apparent.toFixed(2)} on Mercator`);
console.log(`brazil / turkey: ${(find("brazil").area / find("turkey").area).toFixed(2)}`);
