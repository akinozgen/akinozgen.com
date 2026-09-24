import { mkdir, readFile, writeFile } from "node:fs/promises";
import mapshaper from "mapshaper";
import { CACHE, ensureSources } from "./fetch-source.ts";
import {
  inPolygon,
  minDistanceToRing,
  ringCentroid,
  ringGap,
  ringSize,
  roundRing,
  type Ring,
} from "./geometry.ts";
import {
  BRIDGES,
  MERGE_REGIONS,
  NAME_OVERRIDES,
  NON_PUZZLE_REGIONS,
  SPLIT_REGIONS,
} from "../src/overrides.ts";
import { LANGUAGES, type Language } from "../src/types.ts";
import type { Area, AreaGeometry, Edge, GeoData, Region } from "../src/types.ts";

interface Feature {
  properties: Record<string, string | number | null>;
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };
}

/** Coordinates are compared at this precision to decide that two areas touch. */
const VERTEX_PRECISION = 7;
/**
 * Simplification runs through mapshaper so it is topology-aware: a border is
 * one shared arc, thinned once, and both countries keep the same line. Doing
 * it per polygon, as this build used to, left France and Germany with two
 * different versions of the same border — visibly overlapping when zoomed in.
 *
 * Intervals are in metres.
 */
// Precision must stay a round multiple of a power of ten: 0.003 rounds to
// values like 12.438000000000001 and the file grows even as points fall.
const DISPLAY_INTERVAL = 3000;
const DISPLAY_PRECISION = 0.002;
/** Areas below this are dropped from the map unless they are a region's only one. */
const DISPLAY_MIN_SIZE = 0.0006;

/**
 * The world's borders as bare lines, for the context layer behind the game.
 * The coarse set is drawn while the globe is in motion and the fine one once
 * it settles, which is the only way to spin the whole world at sixty frames a
 * second without dropping detail when it matters.
 */
const OUTLINE_COARSE_INTERVAL = 25_000;
const OUTLINE_COARSE_PRECISION = 0.01;
const OUTLINE_MIN_SIZE = 0.002;

interface Simplified {
  type: "Feature";
  properties: { id: number };
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] } | null;
}

/** Thin every area at once, so shared borders are thinned once too. */
async function simplifyAreas(
  polygons: Ring[][],
  interval: number,
  precision: number,
): Promise<Map<number, Ring[][]>> {
  const features = polygons.map((coordinates, id) => ({
    type: "Feature",
    properties: { id },
    geometry: { type: "Polygon", coordinates },
  }));
  // gj2008 keeps Natural Earth's clockwise exterior rings. mapshaper's default
  // output flips them to RFC 7946's counter-clockwise, and d3-geo reads a
  // reversed ring as everything on the globe *except* that country — which
  // renders each one as the whole visible disc.
  const result = await mapshaper.applyCommands(
    `-i in.json -simplify interval=${interval} keep-shapes -o gj2008 precision=${precision} out.json`,
    { "in.json": Buffer.from(JSON.stringify({ type: "FeatureCollection", features })) },
  );
  const parsed = JSON.parse(Buffer.from(result["out.json"]).toString()) as {
    features: Simplified[];
  };
  const out = new Map<number, Ring[][]>();
  for (const feature of parsed.features) {
    if (!feature.geometry) continue;
    out.set(
      feature.properties.id,
      feature.geometry.type === "Polygon"
        ? [feature.geometry.coordinates as Ring[]]
        : (feature.geometry.coordinates as Ring[][]),
    );
  }
  return out;
}

const DATA = new URL("../data/", import.meta.url);

const slug = (name: string): string =>
  name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" && v.length > 0 && v !== "-99" ? v : fallback;


/** Natural Earth carries a NAME_xx for every language the game speaks. */
const FIELD: Record<Language, string> = {
  en: "NAME",
  tr: "NAME_TR",
  de: "NAME_DE",
  es: "NAME_ES",
  fr: "NAME_FR",
};

function namesFor(id: string, english: string, props: Feature["properties"]): Record<Language, string> {
  const names = {} as Record<Language, string>;
  for (const lang of LANGUAGES) {
    names[lang] = NAME_OVERRIDES[id]?.[lang] ?? str(props[FIELD[lang]], english);
  }
  names.en = NAME_OVERRIDES[id]?.en ?? english;
  return names;
}

function polygonsOf(feature: Feature): Ring[][] {
  return feature.geometry.type === "Polygon"
    ? [feature.geometry.coordinates as Ring[]]
    : (feature.geometry.coordinates as Ring[][]);
}

async function main(): Promise<void> {
  await ensureSources();
  const countries = JSON.parse(
    await readFile(new URL("ne_10m_admin_0_countries.geojson", CACHE), "utf8"),
  ) as { features: Feature[] };
  const subunits = JSON.parse(
    await readFile(new URL("ne_10m_admin_0_map_subunits.geojson", CACHE), "utf8"),
  ) as { features: Feature[] };

  // --- 1. group source features into the regions the game plays with ---
  const grouped = new Map<string, Feature[]>();
  const add = (name: string, f: Feature): void => {
    const list = grouped.get(name);
    if (list) list.push(f);
    else grouped.set(name, [f]);
  };

  const splitAdmins = new Set(SPLIT_REGIONS.map((r) => r.admin));
  for (const f of countries.features) {
    const admin = str(f.properties.ADMIN);
    if (splitAdmins.has(admin)) continue;
    add(MERGE_REGIONS[admin] ?? admin, f);
  }
  for (const host of Object.values(MERGE_REGIONS)) {
    if (!grouped.has(host)) throw new Error(`merge target missing from the source: ${host}`);
  }

  const bySubunit = new Map<string, Feature>();
  for (const f of subunits.features) bySubunit.set(str(f.properties.SU_A3), f);
  for (const rule of SPLIT_REGIONS) {
    for (const [code, regionName] of Object.entries(rule.subunits)) {
      const f = bySubunit.get(code);
      if (!f) throw new Error(`${rule.admin}: subunit ${code} missing from map_subunits`);
      add(regionName, f);
    }
    // Natural Earth renames and adds subunits between releases. Anything it
    // lists for this country that the rule does not name would be dropped in
    // silence, so the build stops instead.
    const unmapped = subunits.features
      .filter((f) => str(f.properties.ADMIN) === rule.admin)
      .map((f) => str(f.properties.SU_A3))
      .filter((code) => !(code in rule.subunits));
    if (unmapped.length > 0) {
      throw new Error(`${rule.admin}: unmapped subunits ${unmapped.join(", ")}`);
    }
  }

  // --- 2. explode every region into contiguous areas ---
  const regions: Region[] = [];
  const areas: Area[] = [];
  const outerRings: Ring[] = [];
  /** Every ring, holes included — an enclave touches its host along a hole. */
  const allRings: Ring[][] = [];
  /** Kept out of the shipped data: both are only needed while building. */
  const sizes: number[] = [];
  const centroids: Array<[number, number]> = [];

  const centroidGap = (a: number, b: number): number =>
    Math.hypot(centroids[a][0] - centroids[b][0], centroids[a][1] - centroids[b][1]);

  for (const [name, features] of [...grouped].sort((a, b) => a[0].localeCompare(b[0]))) {
    const head = features[0].properties;
    const areaIds: number[] = [];
    let weight = 0;
    let cx = 0;
    let cy = 0;

    for (const feature of features) {
      for (const polygon of polygonsOf(feature)) {
        const outer = polygon[0];
        const size = ringSize(outer);
        const centroid = ringCentroid(outer);
        const id = areas.length;
        areas.push({ id, regionId: slug(name) });
        sizes.push(size);
        centroids.push(centroid);
        outerRings.push(outer);
        allRings.push(polygon);
        areaIds.push(id);
        weight += size;
        cx += centroid[0] * size;
        cy += centroid[1] * size;
      }
    }

    regions.push({
      id: slug(name),
      names: namesFor(slug(name), name, head),
      iso3: str(head.ISO_A3, str(head.ISO_A3_EH, str(head.ADM0_A3, slug(name).toUpperCase()))),
      continent: str(head.CONTINENT, "Unknown"),
      centroid: weight > 0 ? [cx / weight, cy / weight] : [0, 0],
      areas: areaIds,
      isolated: false,
    });
  }

  // --- 3. adjacency: Natural Earth neighbours share exact vertices ---
  const edges: Edge[] = [];
  const seen = new Set<string>();
  const link = (a: number, b: number, kind: Edge["kind"], note?: string): void => {
    if (a === b) return;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ a: Math.min(a, b), b: Math.max(a, b), kind, ...(note ? { note } : {}) });
  };

  // Index the unsimplified rings — simplification would drop shared vertices.
  const vertexOwners = new Map<string, Set<number>>();
  for (let id = 0; id < allRings.length; id++) {
    for (const ring of allRings[id]) {
      for (const c of ring) {
        const key = `${c[0].toFixed(VERTEX_PRECISION)},${c[1].toFixed(VERTEX_PRECISION)}`;
        const owners = vertexOwners.get(key);
        if (owners) owners.add(id);
        else vertexOwners.set(key, new Set([id]));
      }
    }
  }
  for (const owners of vertexOwners.values()) {
    if (owners.size < 2) continue;
    const list = [...owners];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) link(list[i], list[j], "adjacent");
    }
  }
  const adjacentCount = edges.length;

  // --- 4. bridges and tunnels ---
  const bridgeReport: string[] = [];
  const landfall = (end: { region: string; at: [number, number] }, note: string): Area => {
    let best: Area | null = areas.find((a) => inPolygon(end.at, allRings[a.id])) ?? null;
    if (!best) {
      let bestDistance = Infinity;
      for (const area of areas) {
        const d = minDistanceToRing(end.at, outerRings[area.id]);
        if (d < bestDistance) {
          bestDistance = d;
          best = area;
        }
      }
    }
    if (!best || best.regionId !== slug(end.region)) {
      throw new Error(
        `bridge ${JSON.stringify(note)}: landfall at ${end.at.join(",")} is in ` +
          `${best?.regionId ?? "nowhere"}, expected ${slug(end.region)}`,
      );
    }
    return best;
  };

  for (const bridge of BRIDGES) {
    const from = landfall(bridge.from, bridge.note);
    const to = landfall(bridge.to, bridge.note);
    if (from.id === to.id) {
      throw new Error(`bridge ${JSON.stringify(bridge.note)}: both ends land on the same area`);
    }
    link(from.id, to.id, "bridge", bridge.note);
    bridgeReport.push(
      `- ${bridge.note}: area ${from.id} (${from.regionId}) <-> area ${to.id} (${to.regionId})`,
    );
  }

  // --- 5. island hopping, only where nothing else already links the pieces ---
  const parent = new Int32Array(areas.length).map((_, i) => i);
  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) root = parent[root];
    while (parent[x] !== root) {
      const next = parent[x];
      parent[x] = root;
      x = next;
    }
    return root;
  };
  const union = (a: number, b: number): boolean => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return false;
    parent[ra] = rb;
    return true;
  };
  for (const e of edges) union(e.a, e.b);

  // Each area is offered a hop to its nearest few siblings — a hop to the
  // mainland alone would make Amager reach Jutland before it reaches Zealand.
  const NEAREST = 6;
  const candidates: Array<{ a: number; b: number; gap: number }> = [];
  const proposed = new Set<string>();
  for (const region of regions) {
    if (region.areas.length < 2) continue;
    const hub = region.areas.reduce((best, id) => (sizes[id] > sizes[best] ? id : best));
    for (const id of region.areas) {
      const near = region.areas
        .filter((other) => other !== id)
        .sort((x, y) => centroidGap(id, x) - centroidGap(id, y))
        .slice(0, NEAREST);
      if (id !== hub && !near.includes(hub)) near.push(hub);
      for (const other of near) {
        const a = Math.min(id, other);
        const b = Math.max(id, other);
        const key = `${a}:${b}`;
        if (proposed.has(key)) continue;
        proposed.add(key);
          candidates.push({ a, b, gap: ringGap(outerRings[a], outerRings[b]) });
      }
    }
  }
  candidates.sort((a, b) => a.gap - b.gap);
  let hops = 0;
  for (const c of candidates) {
    if (!union(c.a, c.b)) continue; // already reachable by land or bridge
    link(c.a, c.b, "island-hop");
    hops++;
  }

  // --- 6. flag regions that connect to nothing ---
  const neighbours = new Map<string, Set<string>>();
  for (const r of regions) neighbours.set(r.id, new Set());
  for (const e of edges) {
    const ra = areas[e.a].regionId;
    const rb = areas[e.b].regionId;
    if (ra !== rb) {
      neighbours.get(ra)!.add(rb);
      neighbours.get(rb)!.add(ra);
    }
  }
  const nonPuzzle = new Set(NON_PUZZLE_REGIONS.map(slug));
  for (const r of regions) {
    r.isolated = neighbours.get(r.id)!.size === 0 || nonPuzzle.has(r.id);
  }

  // --- 7. write it out ---
  // --- 7. display geometry, thinned across the whole world in one pass ---
  // Specks that would never be more than a pixel are not worth shipping, but a
  // region must keep at least its largest piece or it cannot be drawn at all.
  const keepForDisplay = new Set<number>();
  for (const region of regions) {
    const biggest = region.areas.reduce((best, id) => (sizes[id] > sizes[best] ? id : best));
    for (const id of region.areas) {
      if (id === biggest || sizes[id] >= DISPLAY_MIN_SIZE) keepForDisplay.add(id);
    }
  }
  const drawable = [...keepForDisplay].sort((a, b) => a - b);

  const thinned = await simplifyAreas(
    drawable.map((id) => allRings[id]),
    DISPLAY_INTERVAL,
    DISPLAY_PRECISION,
  );
  const geometry: AreaGeometry[] = areas.map(() => []);
  let rescued = 0;
  for (let i = 0; i < drawable.length; i++) {
    const shape = thinned.get(i)?.flat() ?? [];
    if (shape.length > 0) {
      geometry[drawable[i]] = shape;
      continue;
    }
    // A country smaller than the simplification interval — the Vatican is
    // 800 metres across — thins away to nothing. Keep the original outline
    // rather than lose the country from the map; it is a handful of points.
    geometry[drawable[i]] = allRings[drawable[i]].map((ring) => roundRing(ring, 4));
    rescued++;
  }

  // --- 8. the world's borders, as lines, at two levels of detail ---
  const outlineIds = drawable.filter((id) => sizes[id] >= OUTLINE_MIN_SIZE);
  const coarse = await simplifyAreas(
    outlineIds.map((id) => allRings[id]),
    OUTLINE_COARSE_INTERVAL,
    OUTLINE_COARSE_PRECISION,
  );
  // Only the coarse set is shipped. The fine one is the display geometry the
  // app has already loaded, so sending it twice would be a megabyte wasted.
  const outline = {
    type: "MultiLineString",
    coordinates: [...coarse.values()].flatMap((shape) =>
      shape.flat().filter((ring) => ring.length >= 4),
    ),
  };

  await mkdir(DATA, { recursive: true });
  const geo: GeoData = { regions, areas, edges };
  await writeFile(new URL("geo.json", DATA), JSON.stringify(geo));
  await writeFile(new URL("geometry.json", DATA), JSON.stringify(geometry));
  await writeFile(new URL("outline.json", DATA), JSON.stringify(outline));

  const connected = regions.filter((r) => !r.isolated);
  const report = [
    "# Generated border report",
    "",
    "Source: Natural Earth 50m (admin_0_countries + admin_0_map_subunits)",
    `Regions: ${regions.length} (${connected.length} with land connections)`,
    `Areas: ${areas.length}`,
    `Edges: ${edges.length} (${adjacentCount} adjacency, ${BRIDGES.length} bridges, ${hops} island hops)`,
    "",
    "## Bridges & tunnels",
    ...bridgeReport,
    "",
    "## Region neighbours",
    ...connected.map((r) => `- **${r.names.en}**: ${[...neighbours.get(r.id)!].sort().join(", ")}`),
  ].join("\n");
  await writeFile(new URL("report.md", DATA), report);

  console.log(`kept ${rescued} areas at full detail, too small to thin`);
  console.log(
    `regions=${regions.length} connected=${connected.length} ` +
      `areas=${areas.length} edges=${edges.length}`,
  );
  console.log(`isolated: ${regions.filter((r) => r.isolated).map((r) => r.names.en).join(", ")}`);
}

await main();
