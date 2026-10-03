import { writeFile } from "node:fs/promises";
import geo from "../data/geo.json" with { type: "json" };
import { BorderGraph } from "../src/graph.ts";
import { CONTINENTS, continentsOf, type GeoData, type PublicData } from "../src/types.ts";

/**
 * Writes data/public.json, the only geography the browser downloads besides
 * outlines. Borders are deliberately absent: with them, any puzzle's answer
 * is one function call away in the console.
 */
const graph = new BorderGraph(geo as unknown as GeoData);

const maps: PublicData["maps"] = {};
for (let mask = 1; mask < 1 << CONTINENTS.length; mask++) {
  const keep = new Set(continentsOf(mask));
  const map = graph.withOnly(
    graph.playableRegions().filter((r) => keep.has(r.continent)).map((r) => r.id),
  );
  maps[mask] = { inPlay: map.playableRegions().length, longest: map.longestRoute() };
}

const data: PublicData = {
  regions: graph.regions.map(({ id, names, iso3, continent, centroid, areas, isolated }) => ({
    id,
    names,
    iso3,
    continent,
    centroid,
    areas,
    isolated,
  })),
  maps,
};

await writeFile(new URL("../data/public.json", import.meta.url), JSON.stringify(data));
console.log(`public.json: ${data.regions.length} regions, ${Object.keys(maps).length} continent masks`);
