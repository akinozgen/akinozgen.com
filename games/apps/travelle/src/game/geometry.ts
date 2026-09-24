import type { Feature, MultiPolygon } from "geojson";
import { useEffect, useState } from "react";
import { graph } from "./puzzle.ts";

/** Outer ring first, holes after, per area — the shape shipped for display. */
export type Geometry = number[][][][];

let pending: Promise<Geometry> | null = null;

/** Loaded once, on demand: it is the biggest asset the game pulls. */
export function loadGeometry(): Promise<Geometry> {
  pending ??= import("@travelle/geo/data/geometry.json").then(
    (m) => m.default as unknown as Geometry,
  );
  return pending;
}

export function useGeometry(): Geometry | null {
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  useEffect(() => {
    let live = true;
    void loadGeometry().then((data) => {
      if (live) setGeometry(data);
    });
    return () => {
      live = false;
    };
  }, []);
  return geometry;
}

export function toFeature(regionId: string, geometry: Geometry): Feature<MultiPolygon> | null {
  const polygons = graph
    .region(regionId)
    .areas.map((id) => geometry[id])
    .filter((polygon) => polygon && polygon.length > 0);
  if (polygons.length === 0) return null;
  return {
    type: "Feature",
    properties: { regionId },
    geometry: { type: "MultiPolygon", coordinates: polygons },
  };
}
