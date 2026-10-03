import type { PublicData, PublicRegion } from "@travelle/geo/client";
import data from "@travelle/geo/data/public.json";

/**
 * Every region the game knows, by name, outline and continent. Which ones
 * border which is not here: that lives on the server, which judges guesses.
 */
const publicData = data as unknown as PublicData;

export const REGIONS: readonly PublicRegion[] = publicData.regions;

const byId = new Map(REGIONS.map((region) => [region.id, region]));

export function region(id: string): PublicRegion {
  const found = byId.get(id);
  if (!found) throw new Error(`unknown region: ${id}`);
  return found;
}

export function isRegion(id: string): boolean {
  return byId.has(id);
}

/** Regions that can appear in a puzzle at all. */
export const PLAYABLE: readonly PublicRegion[] = REGIONS.filter((r) => !r.isolated);

/** Countries in play and the longest route possible, for a set of continents. */
export function mapSummary(mask: number): { inPlay: number; longest: number } {
  return publicData.maps[mask] ?? { inPlay: 0, longest: 0 };
}
