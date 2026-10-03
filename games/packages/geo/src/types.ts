/** Languages the game is played in. English is the canonical one. */
export const LANGUAGES = ["en", "tr", "de", "es", "fr"] as const;
export type Language = (typeof LANGUAGES)[number];

/** A playable entity in the game: a country, or a region Travle treats separately. */
export interface Region {
  id: string;
  /** The country's name in each language; `names.en` is what ids derive from. */
  names: Record<Language, string>;
  /** ISO 3166-1 alpha-3 where Natural Earth provides one, else a synthetic code. */
  iso3: string;
  continent: string;
  /** Longitude/latitude of the region's centroid, used to centre the map. */
  centroid: [number, number];
  /** Indices into `areas`. Guessing a region activates every one of them. */
  areas: number[];
  /** Excluded from puzzle generation (no land connection to anywhere). */
  isolated: boolean;
}

/** One contiguous landmass. The graph is built at this level, not at region level. */
export interface Area {
  id: number;
  regionId: string;
}

export type EdgeKind = "adjacent" | "bridge" | "island-hop";

export interface Edge {
  a: number;
  b: number;
  kind: EdgeKind;
  /** Human-readable reason, for the "why does X connect to Y" page. */
  note?: string;
}

export interface GeoData {
  regions: Region[];
  areas: Area[];
  edges: Edge[];
}

/** Outer ring first, holes after — lon/lat pairs, already simplified for display. */
export type AreaGeometry = number[][][];

/** Continent names as Natural Earth spells them, in the order they're shown. */
export const CONTINENTS = [
  "Europe",
  "Asia",
  "Africa",
  "North America",
  "South America",
  "Oceania",
] as const;

/** A set of continents as a bitmask over CONTINENTS — compact enough for a URL. */
export function continentMask(continents: Iterable<string>): number {
  let mask = 0;
  for (const name of continents) {
    const index = (CONTINENTS as readonly string[]).indexOf(name);
    if (index >= 0) mask |= 1 << index;
  }
  return mask;
}

export function continentsOf(mask: number): string[] {
  return CONTINENTS.filter((_, index) => mask & (1 << index));
}

/**
 * What the browser is told about a region: enough to name it, draw it and
 * file it under a continent, and nothing about which regions it borders.
 * The borders stay on the server, so the answer cannot be read off the page.
 */
export type PublicRegion = Region;

export interface PublicData {
  regions: PublicRegion[];
  /** Per continent mask: countries left in play, and the longest route possible. */
  maps: Record<string, { inPlay: number; longest: number }>;
}
