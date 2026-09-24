import { geoGraticule, geoPath } from "d3-geo";
import { describe, expect, it } from "vitest";
import { CLIP_ANGLE, type Frame, idealFrame, interpolateFrame, makeProjection } from "../src/components/globe.ts";
import type { FeatureCollection, MultiPolygon } from "geojson";

const box = (lon: number, lat: number): FeatureCollection<MultiPolygon> => ({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {},
      geometry: {
        type: "MultiPolygon",
        // Wound so the small box is the interior — reverse it and d3 frames
        // the rest of the planet instead, centring on the antipode.
        coordinates: [
          [
            [
              [lon - 2, lat - 2],
              [lon - 2, lat + 2],
              [lon + 2, lat + 2],
              [lon + 2, lat - 2],
              [lon - 2, lat - 2],
            ],
          ],
        ],
      },
    },
  ],
});

const frame = (lambda: number): Frame => ({
  rotate: [lambda, 0, 0],
  scale: 100,
  translate: [0, 0],
});

describe("the projection", () => {
  it("keeps the far side of the globe, minus a sliver", () => {
    expect(makeProjection().clipAngle()).toBe(CLIP_ANGLE);
    expect(CLIP_ANGLE).toBeLessThan(180);
    expect(CLIP_ANGLE).toBeGreaterThan(179.99);
  });

  it("wraps the world onto a disc, which is what makes it look round", () => {
    const projection = makeProjection().scale(200).translate([320, 210]);
    const path = geoPath(projection);
    expect((path({ type: "Sphere" }) ?? "").length).toBeGreaterThan(20);
    // Clipped just shy of the antipode, the whole globe lands in a circle of
    // radius scale · π. A flat projection would not be bounded like this.
    const [[left, top], [right, bottom]] = path.bounds({ type: "Sphere" });
    expect(right - left).toBeCloseTo(2 * Math.PI * 200, 0);
    expect(bottom - top).toBeCloseTo(2 * Math.PI * 200, 0);
  });

  it("bends the meridians", () => {
    const projection = makeProjection().scale(200).translate([320, 210]);
    const drawn = geoPath(projection)(geoGraticule().step([15, 15])()) ?? "";
    // A straight meridian would be two points; a curved one is many.
    expect(drawn.split("L").length).toBeGreaterThan(400);
  });

  it("centres on whatever it is asked to frame", () => {
    const { rotate } = idealFrame(box(120, -30), 640, 420, 32);
    expect(rotate[0]).toBeCloseTo(-120, 4);
    // A lat/lon box's spherical centroid sits a hair off its middle latitude.
    expect(rotate[1]).toBeCloseTo(30, 2);
  });

  it("fills the box it is given", () => {
    const near = idealFrame(box(0, 0), 640, 420, 32);
    const wide = idealFrame(box(0, 0), 320, 210, 16);
    // Half the canvas, half the scale — the framing is proportional.
    expect(wide.scale).toBeCloseTo(near.scale / 2, 2);
  });
});

describe("flying between framings", () => {
  it("takes the short way round the date line", () => {
    const midway = interpolateFrame(frame(170), frame(-170), 0.5);
    // Going the long way would pass through 0; the short way passes through 180.
    expect(Math.abs(midway.rotate[0])).toBeCloseTo(180, 4);
  });

  it("lands exactly on the target", () => {
    const target = frame(-170);
    const landed = interpolateFrame(frame(170), target, 1);
    expect(((landed.rotate[0] % 360) + 360) % 360).toBeCloseTo(190, 4);
    expect(landed.scale).toBeCloseTo(target.scale, 6);
  });

  it("zooms geometrically, so a big change does not lurch", () => {
    const from: Frame = { rotate: [0, 0, 0], scale: 100, translate: [0, 0] };
    const to: Frame = { rotate: [0, 0, 0], scale: 10_000, translate: [0, 0] };
    expect(interpolateFrame(from, to, 0.5).scale).toBeCloseTo(1000, 0);
  });
});
