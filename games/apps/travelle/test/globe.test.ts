import { geoGraticule, geoPath } from "d3-geo";
import { describe, expect, it } from "vitest";
import {
  CLIP_ANGLE,
  facesCamera,
  type Frame,
  globeScale,
  idealFrame,
  interpolateFrame,
  makeProjection,
} from "../src/components/globe.ts";
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

const view = (width: number, height: number) => ({ x: 0, y: 0, width, height });

describe("the projection", () => {
  it("shows the near hemisphere, like a globe seen from space", () => {
    expect(makeProjection().clipAngle()).toBe(CLIP_ANGLE);
    expect(CLIP_ANGLE).toBe(90);
  });

  it("draws the world as a disc as wide as twice the scale", () => {
    const projection = makeProjection().scale(200).translate([320, 210]);
    const [[left, top], [right, bottom]] = geoPath(projection).bounds({ type: "Sphere" });
    expect(right - left).toBeCloseTo(400, 0);
    expect(bottom - top).toBeCloseTo(400, 0);
  });

  it("bends the meridians", () => {
    const projection = makeProjection().scale(200).translate([320, 210]);
    const drawn = geoPath(projection)(geoGraticule().step([15, 15])()) ?? "";
    // A straight meridian would be two points; a curved one is many.
    expect(drawn.split("L").length).toBeGreaterThan(200);
  });

  it("centres on whatever it is asked to frame", () => {
    const { rotate, translate } = idealFrame(box(120, -30), view(640, 420), 32);
    expect(rotate[0]).toBeCloseTo(-120, 0);
    expect(rotate[1]).toBeCloseTo(30, 0);
    expect(translate).toEqual([320, 210]);
  });

  it("frames inside the window it is given, not the whole screen", () => {
    const { translate } = idealFrame(box(0, 0), { x: 400, y: 60, width: 600, height: 500 }, 32);
    expect(translate).toEqual([700, 310]);
  });

  it("fills the box it is given", () => {
    const near = idealFrame(box(0, 0), view(640, 420), 32);
    const wide = idealFrame(box(0, 0), view(320, 210), 16);
    // Half the canvas, half the scale — the framing is proportional.
    expect(wide.scale).toBeCloseTo(near.scale / 2, 1);
  });

  it("never zooms out past the whole globe", () => {
    const far = idealFrame(
      { type: "FeatureCollection", features: [...box(-100, 40).features, ...box(80, 40).features] },
      view(640, 420),
      32,
    );
    expect(far.scale).toBeGreaterThanOrEqual(globeScale(view(640, 420), 32));
  });

  it("hides what is round the back", () => {
    const front: Frame = { rotate: [0, 0, 0], scale: 100, translate: [0, 0] };
    expect(facesCamera(front, [10, 10])).toBe(true);
    expect(facesCamera(front, [180, 0])).toBe(false);
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
