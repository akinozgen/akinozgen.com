import { describe, expect, it } from "vitest";
import { besides, carry, project, unwrap } from "../src/game/mercator.ts";

/** Great-circle distance between two [lon, lat] points, in radians. */
function arc(a: number[], b: number[]): number {
  const rad = Math.PI / 180;
  const [λ1, φ1, λ2, φ2] = [a[0] * rad, a[1] * rad, b[0] * rad, b[1] * rad];
  const h = Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2;
  return 2 * Math.asin(Math.sqrt(h));
}

const square = (lon: number, lat: number, size: number): number[] => [
  lon, lat, lon + size, lat, lon + size, lat + size, lon, lat + size,
];

describe("Mercator", () => {
  it("puts the equator at zero and stretches towards the poles", () => {
    const [x, y] = project(0, 0);
    expect(x).toBeCloseTo(0, 12);
    expect(y).toBeCloseTo(0, 12);
    const tenDegreesAtEquator = project(0, 0)[1] - project(0, 10)[1];
    const tenDegreesUpNorth = project(0, 60)[1] - project(0, 70)[1];
    expect(tenDegreesUpNorth).toBeGreaterThan(tenDegreesAtEquator * 2.2);
  });

  it("keeps a country in one piece across the date line", () => {
    expect(unwrap(-175, 170)).toBe(185);
    expect(unwrap(170, -175)).toBe(-190);
  });
});

describe("the true-size move", () => {
  it("carries a shape without changing it on the globe", () => {
    const greenlandish = square(-45, 65, 10);
    const { rings, centre } = carry([greenlandish], [-40, 70], [20, 5], 1);
    // Every distance between corners is the same after the move: a rigid turn of the globe.
    for (let i = 0; i < 8; i += 2) {
      for (let j = i + 2; j < 8; j += 2) {
        const before = arc(greenlandish.slice(i, i + 2), greenlandish.slice(j, j + 2));
        const after = arc(rings[0].slice(i, i + 2), rings[0].slice(j, j + 2));
        expect(after).toBeCloseTo(before, 10);
      }
    }
    expect(centre[0]).toBeCloseTo(20, 6);
    expect(centre[1]).toBeCloseTo(5, 6);
  });

  it("goes part of the way when asked", () => {
    const { centre } = carry([square(0, 0, 1)], [0, 0], [40, 0], 0.5);
    expect(centre[0]).toBeCloseTo(20, 6);
  });

  it("sets the target down level with the unit, to its east", () => {
    const unit = { rings: [square(30, 38, 8)], centroid: [34, 39] as [number, number] };
    const target = { rings: [square(-45, 65, 10)], centroid: [-40, 70] as [number, number] };
    const [lon, lat] = besides(unit, target);
    expect(lat).toBe(39);
    expect(lon).toBeGreaterThan(34);
  });
});
