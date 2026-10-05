import { mkdir, readFile, writeFile } from "node:fs/promises";
import countries from "i18n-iso-countries";
import geo from "../../geo/data/geo.json" with { type: "json" };
import geometry from "../../geo/data/geometry.json" with { type: "json" };
import vexle from "../../vexle/data/countries.json" with { type: "json" };
import { LANGUAGES, type Language } from "../src/types.ts";

/**
 * Builds tessle's data from travelle's map:
 *
 *  - data/world.json, the countries that can be pieces, their landmasses and
 *    which landmasses share a border. Server only: with it, anyone could put
 *    any group back together.
 *  - data/groups.json, the groups a round can deal. Server only, and
 *    append-only once published — the schedule indexes into it.
 *  - data/names.json, every piece's name in every language. The browser's.
 *
 * Coordinates are copied from travelle's display geometry untouched. It was
 * thinned topology-aware, so two neighbours carry the very same border line,
 * and any rounding here would open seams between pieces.
 */

interface GeoRegion {
  id: string;
  iso3: string;
  names: Record<"en" | "tr" | "de" | "es", string>;
  continent: string;
  areas: number[];
  isolated: boolean;
}

interface GeoData {
  regions: GeoRegion[];
  areas: Array<{ id: number; regionId: string }>;
  edges: Array<{ a: number; b: number; kind: string }>;
}

type Ring = number[][];

const GEO = geo as unknown as GeoData;
const SHAPES = geometry as unknown as Ring[][];
const VEXLE = vexle as Array<{ code: string; names: Record<Language, string> }>;
const DATA = new URL("../data/", import.meta.url);

/**
 * Never pieces. Specks no one could pick up (the Vatican, Monaco…), Siachen,
 * which is a disputed glacier rather than a country, and the giants: Russia,
 * Canada, the United States and China span too much of the globe for one
 * flat projection to keep their neighbours' shapes honest. Indonesia's land
 * borders are all on Borneo, New Guinea and Timor: as a piece it would be
 * Kalimantan alone, with Java and Sumatra missing — not Indonesia.
 */
const EXCLUDED = new Set([
  "gibraltar",
  "vatican",
  "monaco",
  "sint-maarten",
  "san-marino",
  "saint-martin",
  "liechtenstein",
  "andorra",
  "hong-kong-s-a-r",
  "macao-s-a-r",
  "siachen-glacier",
  "russia",
  "canada",
  "united-states-of-america",
  "china",
  "indonesia",
]);

/** A piece smaller than this is too fiddly to drag. Luxembourg is about 2,600 km². */
const MIN_PIECE_KM2 = 1500;
/** Islands closer than this to a country's own land stay part of its piece, hop by hop. */
const NEAR_KM = 80;
/** Islets below this are left out of a piece: they add points, not recognition. */
const NEAR_MIN_KM2 = 40;

/** Group rules: size, and how far apart the biggest and smallest piece may be. */
const SIZES = [5, 6, 6, 7];
const MAX_RATIO = 30;
/**
 * Lambert's equal-area projection stays within 3% of true shape 2,750 km
 * from its centre, so a group this wide still fits honestly, and Brazil,
 * Argentina and Chile can be dealt.
 */
const MAX_EXTENT_KM = 5500;
/** Two groups may share at most this much (shared / either), so days differ. */
const MAX_JACCARD = 0.67;
/**
 * The most a continent may hold of the list. Africa and Europe pack the most
 * small neighbours together and, left alone, Africa filled nearly half of
 * it; Asia and the Americas have fewer groups to give and keep them all.
 */
const SHARES: Record<string, number> = { Africa: 0.22, Europe: 0.36 };
const ATTEMPTS_PER_SEED = 30;

/** Natural Earth codes that are not the country's ISO code, as vexle reads them. */
const ISO3_FIXES: Record<string, string> = { cuba: "CUB", cyprus: "CYP", kosovo: "XKX" };
const ALPHA2_FIXES: Record<string, string> = { XKX: "XK" };
const CODE_FIXES: Record<string, string> = { "northern-cyprus": "XN" };
/** Russian names for regions vexle has no flag for. */
const RUSSIAN: Record<string, string> = { somaliland: "Сомалиленд", "french-guiana": "Французская Гвиана" };

const KM_PER_DEGREE = 111.32;

/** mulberry32: the build is reproducible, run after run. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ringKm2(ring: Ring): number {
  let sum = 0;
  let lat = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    lat += ring[i][1];
  }
  const cos = Math.cos(((lat / ring.length) * Math.PI) / 180);
  return (Math.abs(sum / 2) * cos * KM_PER_DEGREE ** 2);
}

/** An area's size: its biggest ring, which is its outline. */
function areaKm2(rings: Ring[]): number {
  return rings.length === 0 ? 0 : Math.max(...rings.map(ringKm2));
}

interface Box {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

function boxOf(rings: Ring[]): Box {
  const box = { minLon: Infinity, minLat: Infinity, maxLon: -Infinity, maxLat: -Infinity };
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      if (lon < box.minLon) box.minLon = lon;
      if (lon > box.maxLon) box.maxLon = lon;
      if (lat < box.minLat) box.minLat = lat;
      if (lat > box.maxLat) box.maxLat = lat;
    }
  }
  return box;
}

function union(a: Box, b: Box): Box {
  return {
    minLon: Math.min(a.minLon, b.minLon),
    minLat: Math.min(a.minLat, b.minLat),
    maxLon: Math.max(a.maxLon, b.maxLon),
    maxLat: Math.max(a.maxLat, b.maxLat),
  };
}

/** The longer side of a box, in km, measured across its middle latitude. */
function extentKm(box: Box): number {
  const cos = Math.cos((((box.minLat + box.maxLat) / 2) * Math.PI) / 180);
  return Math.max((box.maxLat - box.minLat) * KM_PER_DEGREE, (box.maxLon - box.minLon) * KM_PER_DEGREE * cos);
}

/** At most `limit` points of a ring, evenly spread — enough to measure a gap. */
function thin(ring: Ring, limit = 300): Ring {
  if (ring.length <= limit) return ring;
  const step = ring.length / limit;
  return Array.from({ length: limit }, (_, i) => ring[Math.floor(i * step)]);
}

/** Rough shortest gap between two areas, in km. */
function gapKm(a: Ring[], b: Ring[]): number {
  const pa = a.flatMap((ring) => thin(ring));
  const pb = b.flatMap((ring) => thin(ring));
  let best = Infinity;
  for (const p of pa) {
    const cos = Math.cos((p[1] * Math.PI) / 180);
    for (const q of pb) {
      const dx = (p[0] - q[0]) * cos;
      const dy = p[1] - q[1];
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
  }
  return Math.sqrt(best) * KM_PER_DEGREE;
}

function near(a: Box, b: Box, km: number): boolean {
  const pad = km / KM_PER_DEGREE;
  const cos = Math.cos((((a.minLat + a.maxLat) / 2) * Math.PI) / 180);
  const padLon = pad / Math.max(cos, 0.2);
  return !(
    a.maxLon + padLon < b.minLon ||
    b.maxLon + padLon < a.minLon ||
    a.maxLat + pad < b.minLat ||
    b.maxLat + pad < a.minLat
  );
}

// --- 1. who borders whom, by land ---

const regionOfArea = (id: number): string => GEO.areas[id].regionId;
const areaNeighbours = new Map<number, Set<number>>();
for (const edge of GEO.edges) {
  if (edge.kind !== "adjacent") continue;
  if (regionOfArea(edge.a) === regionOfArea(edge.b)) continue;
  if (!areaNeighbours.has(edge.a)) areaNeighbours.set(edge.a, new Set());
  if (!areaNeighbours.has(edge.b)) areaNeighbours.set(edge.b, new Set());
  areaNeighbours.get(edge.a)!.add(edge.b);
  areaNeighbours.get(edge.b)!.add(edge.a);
}

const shapeOf = (id: number): Ring[] => SHAPES[id] ?? [];
const km2 = new Map<number, number>();
const boxes = new Map<number, Box>();
for (const region of GEO.regions) {
  for (const id of region.areas) {
    km2.set(id, areaKm2(shapeOf(id)));
    if (shapeOf(id).length > 0) boxes.set(id, boxOf(shapeOf(id)));
  }
}

// --- 2. which regions can be pieces ---

const byId = new Map(GEO.regions.map((region) => [region.id, region]));
let eligible = new Set(
  GEO.regions
    .filter((region) => !EXCLUDED.has(region.id))
    .filter((region) => {
      const main = Math.max(...region.areas.map((id) => km2.get(id) ?? 0));
      return main >= MIN_PIECE_KM2;
    })
    .map((region) => region.id),
);
// A region whose only neighbours were excluded can never join a group.
for (;;) {
  const next = new Set(
    [...eligible].filter((id) =>
      byId.get(id)!.areas.some((area) =>
        [...(areaNeighbours.get(area) ?? [])].some((other) => {
          const owner = regionOfArea(other);
          return owner !== id && eligible.has(owner);
        }),
      ),
    ),
  );
  if (next.size === eligible.size) break;
  eligible = next;
}

// --- 3. each region's landmasses: its main one, islands near it, and exclaves ---

type Kind = "main" | "near" | "border";
interface Part {
  area: number;
  kind: Kind;
  /** Border parts: the regions they touch. Kept only when one of those is in the group. */
  touches: string[];
}

const parts = new Map<string, Part[]>();
for (const id of eligible) {
  const region = byId.get(id)!;
  const drawn = region.areas.filter((area) => shapeOf(area).length > 0);
  const main = drawn.reduce((best, area) => ((km2.get(area) ?? 0) > (km2.get(best) ?? 0) ? area : best));
  const list: Part[] = [{ area: main, kind: "main", touches: [] }];
  // Islands join hop by hop: each within NEAR_KM of land already in the piece.
  const kept = [main];
  const waiting = new Set(drawn.filter((area) => area !== main && (km2.get(area) ?? 0) >= NEAR_MIN_KM2));
  let grew = true;
  while (grew) {
    grew = false;
    for (const area of waiting) {
      const close = kept.some(
        (other) => near(boxes.get(area)!, boxes.get(other)!, NEAR_KM) && gapKm(shapeOf(area), shapeOf(other)) <= NEAR_KM,
      );
      if (!close) continue;
      kept.push(area);
      waiting.delete(area);
      list.push({ area, kind: "near", touches: [] });
      grew = true;
    }
  }
  // Exclaves and far coasts that border someone: Cabinda, Nakhchivan, Musandam.
  for (const area of drawn) {
    if (kept.includes(area)) continue;
    const touches = [
      ...new Set([...(areaNeighbours.get(area) ?? [])].map(regionOfArea).filter((owner) => owner !== id && eligible.has(owner))),
    ].sort();
    if (touches.length > 0) list.push({ area, kind: "border", touches });
  }
  parts.set(id, list);
}

/** The landmasses a region brings to a given group. */
function keptParts(id: string, group: ReadonlySet<string>): Part[] {
  return parts.get(id)!.filter((part) => part.kind !== "border" || part.touches.some((other) => group.has(other)));
}

function pieceKm2(id: string, group: ReadonlySet<string>): number {
  return keptParts(id, group).reduce((sum, part) => sum + (km2.get(part.area) ?? 0), 0);
}

function connected(group: ReadonlySet<string>): boolean {
  const areasOf = new Map([...group].map((id) => [id, new Set(keptParts(id, group).map((part) => part.area))]));
  const owner = new Map<number, string>();
  for (const [id, set] of areasOf) for (const area of set) owner.set(area, id);
  const start = [...group][0];
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length > 0) {
    const id = queue.pop()!;
    for (const area of areasOf.get(id)!) {
      for (const other of areaNeighbours.get(area) ?? []) {
        const next = owner.get(other);
        if (next && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
  }
  return seen.size === group.size;
}

function groupBox(group: ReadonlySet<string>): Box {
  return [...group]
    .flatMap((id) => keptParts(id, group).map((part) => boxes.get(part.area)!))
    .reduce(union);
}

function acceptable(group: ReadonlySet<string>): boolean {
  const sizes = [...group].map((id) => pieceKm2(id, group));
  if (Math.max(...sizes) / Math.min(...sizes) > MAX_RATIO) return false;
  if (extentKm(groupBox(group)) > MAX_EXTENT_KM) return false;
  return connected(group);
}

// --- 4. groups: grown compact from every seed, then thinned out for variety ---

/** Region-level neighbours, through any landmass a region could bring. */
const neighbours = new Map<string, Set<string>>();
for (const id of eligible) {
  const set = new Set<string>();
  for (const part of parts.get(id)!) {
    for (const other of areaNeighbours.get(part.area) ?? []) {
      const owner = regionOfArea(other);
      if (owner !== id && eligible.has(owner) && parts.get(owner)!.some((p) => p.area === other)) set.add(owner);
    }
  }
  neighbours.set(id, set);
}

const random = prng(20261005);
const seeds = [...eligible].sort();
const candidates = new Map<string, string[]>();
for (const seed of seeds) {
  for (let attempt = 0; attempt < ATTEMPTS_PER_SEED; attempt++) {
    const target = SIZES[Math.floor(random() * SIZES.length)];
    const group = new Set([seed]);
    while (group.size < target) {
      const options = new Map<string, number>();
      for (const member of group) {
        for (const other of neighbours.get(member)!) {
          if (!group.has(other)) options.set(other, (options.get(other) ?? 0) + 1);
        }
      }
      const ranked = [...options]
        .map(([id, touching]) => ({ id, score: touching + random() * 1.5 }))
        .sort((a, b) => b.score - a.score);
      const pick = ranked.find(({ id }) => acceptable(new Set([...group, id])));
      if (!pick) break;
      group.add(pick.id);
    }
    if (group.size < SIZES[0] || !acceptable(group)) continue;
    const ids = [...group].sort();
    candidates.set(ids.join(","), ids);
  }
}

const pool = [...candidates.values()];
for (let i = pool.length - 1; i > 0; i--) {
  const j = Math.floor(random() * (i + 1));
  [pool[i], pool[j]] = [pool[j], pool[i]];
}
const jaccard = (a: string[], b: string[]): number => {
  const shared = a.filter((id) => b.includes(id)).length;
  return shared / (a.length + b.length - shared);
};
/**
 * The published list is kept as it is and only added to: the schedule
 * indexes into it, so dropping or reordering a group would change every day
 * dealt since. A group that can no longer be built stops the build instead.
 */
const published = await readFile(new URL("groups.json", DATA), "utf8")
  .then((text) => JSON.parse(text) as string[][])
  .catch(() => [] as string[][]);
for (const group of published) {
  const set = new Set(group);
  if (!group.every((id) => eligible.has(id)) || !acceptable(set)) {
    throw new Error(`published group can no longer be dealt: ${group.join(", ")}`);
  }
}
/** The continent most of a group's countries are on. */
const continent = (group: string[]): string => {
  const counts = new Map<string, number>();
  for (const id of group) counts.set(byId.get(id)!.continent, (counts.get(byId.get(id)!.continent) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
};
const groups: string[][] = [...published];
const fits = (group: string[]): boolean => groups.every((other) => jaccard(group, other) <= MAX_JACCARD);
const capped = (group: string[]): boolean => continent(group) in SHARES;
// The continents without a ceiling first: their count sets everyone else's.
for (const group of pool) if (!capped(group) && fits(group)) groups.push(group);
const free = groups.filter((group) => !capped(group)).length;
const total = free / (1 - Object.values(SHARES).reduce((sum, share) => sum + share, 0));
for (const [name, share] of Object.entries(SHARES)) {
  const ceiling = Math.round(total * share);
  for (const group of pool) {
    if (groups.filter((other) => continent(other) === name).length >= ceiling) break;
    if (continent(group) === name && fits(group)) groups.push(group);
  }
}

// --- 5. names ---

function codeOf(region: GeoRegion): string | undefined {
  if (CODE_FIXES[region.id]) return CODE_FIXES[region.id];
  const iso3 = ISO3_FIXES[region.id] ?? region.iso3;
  return ALPHA2_FIXES[iso3] ?? countries.alpha3ToAlpha2(iso3);
}

const vexleByCode = new Map(VEXLE.map((country) => [country.code, country]));
const names: Record<string, Record<Language, string>> = {};
const unmatched: string[] = [];
// Only what can be dealt ships: names for the browser, shapes for the server.
const used = [...new Set(groups.flat())].sort();
for (const id of used) {
  const region = byId.get(id)!;
  const code = codeOf(region);
  const known = code ? vexleByCode.get(code) : undefined;
  if (known) {
    names[id] = { ...known.names };
    continue;
  }
  const ru = RUSSIAN[id];
  if (!ru) unmatched.push(id);
  names[id] = { en: region.names.en, tr: region.names.tr, de: region.names.de, es: region.names.es, ru: ru ?? region.names.en };
}
for (const id of Object.keys(names)) {
  for (const language of LANGUAGES) if (!names[id][language]) throw new Error(`${id} has no ${language} name`);
}

// --- 6. write ---

const regionIndex = new Map(used.map((id, i) => [id, i]));
const areaIndex = new Map<number, number>();
const areas: Array<{ region: number; kind: Kind; touches?: number[]; rings: number[][] }> = [];
for (const id of used) {
  // A border part touching only regions never dealt could never be kept.
  for (const part of parts.get(id)!.filter((p) => p.kind !== "border" || p.touches.some((other) => used.includes(other)))) {
    areaIndex.set(part.area, areas.length);
    areas.push({
      region: regionIndex.get(id)!,
      kind: part.kind,
      ...(part.kind === "border" ? { touches: part.touches.filter((other) => regionIndex.has(other)).map((other) => regionIndex.get(other)!) } : {}),
      // Flat [lon, lat, …], closing point dropped: a ring closes itself.
      rings: shapeOf(part.area).map((ring) => ring.slice(0, ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1] ? -1 : undefined).flat()),
    });
  }
}
const adjacent: Array<[number, number]> = [];
for (const [a, set] of areaNeighbours) {
  for (const b of set) {
    const ia = areaIndex.get(a);
    const ib = areaIndex.get(b);
    if (ia !== undefined && ib !== undefined && ia < ib) adjacent.push([ia, ib]);
  }
}
adjacent.sort((x, y) => x[0] - y[0] || x[1] - y[1]);

const world = {
  regions: used.map((id) => ({
    id,
    // The schedule keeps a continent from coming round two days running.
    continent: byId.get(id)!.continent,
    areas: parts.get(id)!.filter((part) => areaIndex.has(part.area)).map((part) => areaIndex.get(part.area)!),
  })),
  areas,
  adjacent,
};

await mkdir(DATA, { recursive: true });
await writeFile(new URL("world.json", DATA), JSON.stringify(world));
await writeFile(new URL("groups.json", DATA), `${JSON.stringify(groups, null, 0).replace(/\],\[/g, "],\n[")}\n`);
await writeFile(new URL("names.json", DATA), `${JSON.stringify(names, null, 2)}\n`);

// --- 7. report ---

const perContinent = new Map<string, number>();
for (const group of groups) perContinent.set(continent(group), (perContinent.get(continent(group)) ?? 0) + 1);
const sizes = new Map<number, number>();
for (const group of groups) sizes.set(group.length, (sizes.get(group.length) ?? 0) + 1);
console.log(`pieces: ${used.length} regions, ${areas.length} landmasses, ${adjacent.length} borders`);
console.log(`groups: ${groups.length} (${published.length} published, from ${pool.length} candidates)`);
console.log(`  by size: ${[...sizes].sort().map(([n, c]) => `${n}×${c}`).join(" ")}`);
console.log(`  by continent: ${[...perContinent].map(([c, n]) => `${c} ${n}`).join(", ")}`);
const inGroups = new Set(groups.flat());
console.log(`  regions never dealt: ${[...eligible].sort().filter((id) => !inGroups.has(id)).join(", ") || "none"}`);
for (const group of groups.slice(0, 6)) console.log(`  e.g. ${group.join(", ")}`);
if (unmatched.length > 0) console.log(`no Russian name, English used: ${unmatched.join(", ")}`);
const borderParts = areas.filter((area) => area.kind === "border").map((area) => used[area.region]);
console.log(`exclaves and far coasts: ${[...new Set(borderParts)].join(", ")}`);
