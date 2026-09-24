import geo from "../data/geo.json" with { type: "json" };
import { BorderGraph } from "./graph.ts";
import type { GeoData } from "./types.ts";

export * from "./types.ts";
export * from "./graph.ts";
export * from "./scoring.ts";

export const geoData = geo as unknown as GeoData;

let cached: BorderGraph | null = null;
/** The shared graph instance — building it is cheap but not free. */
export function borderGraph(): BorderGraph {
  cached ??= new BorderGraph(geoData);
  return cached;
}
