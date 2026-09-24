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
