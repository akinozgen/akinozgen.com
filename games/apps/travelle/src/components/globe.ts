import { geoAzimuthalEquidistant, geoCentroid, type GeoProjection } from "d3-geo";
import type { FeatureCollection, MultiPolygon } from "geojson";

/**
 * The whole far side of the globe is kept, minus a sliver at the antipode.
 * That is what curves the graticule and gives the map its roundness — a plain
 * unclipped projection draws the same countries as a flat sheet.
 */
export const CLIP_ANGLE = 180 - 1e-3;

export interface Frame {
  /** [lambda, phi, gamma] in degrees. */
  rotate: [number, number, number];
  scale: number;
  translate: [number, number];
}

export function makeProjection(): GeoProjection {
  return geoAzimuthalEquidistant().clipAngle(CLIP_ANGLE);
}

/** Frame that centres and fills the box with `collection`. */
export function idealFrame(
  collection: FeatureCollection<MultiPolygon>,
  width: number,
  height: number,
  padding: number,
): Frame {
  const [lon, lat] = geoCentroid(collection);
  const fitted = makeProjection().rotate([-lon, -lat, 0]);
  fitted.fitExtent(
    [
      [padding, padding],
      [width - padding, height - padding],
    ],
    collection,
  );
  const [x, y] = fitted.translate();
  const [lambda, phi, gamma = 0] = fitted.rotate();
  return { rotate: [lambda, phi, gamma], scale: fitted.scale(), translate: [x, y] };
}

export function applyFrame(projection: GeoProjection, frame: Frame): void {
  projection.rotate(frame.rotate).scale(frame.scale).translate(frame.translate);
}

/** Shortest way round the circle, so spinning past the date line doesn't unwind. */
function lerpAngle(from: number, to: number, t: number): number {
  let delta = ((to - from + 540) % 360) - 180;
  return from + delta * t;
}

const easeInOut = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

export function interpolateFrame(from: Frame, to: Frame, progress: number): Frame {
  const t = easeInOut(Math.min(1, Math.max(0, progress)));
  const lerp = (a: number, b: number): number => a + (b - a) * t;
  return {
    rotate: [
      lerpAngle(from.rotate[0], to.rotate[0], t),
      lerp(from.rotate[1], to.rotate[1]),
      lerpAngle(from.rotate[2], to.rotate[2], t),
    ],
    // Scale moves geometrically; a linear ramp lurches when zooming far out.
    scale: from.scale * (to.scale / from.scale) ** t,
    translate: [lerp(from.translate[0], to.translate[0]), lerp(from.translate[1], to.translate[1])],
  };
}

export function framesMatch(a: Frame, b: Frame): boolean {
  return (
    Math.abs(a.scale - b.scale) < 0.01 &&
    Math.abs(a.rotate[0] - b.rotate[0]) < 0.01 &&
    Math.abs(a.rotate[1] - b.rotate[1]) < 0.01 &&
    Math.abs(a.translate[0] - b.translate[0]) < 0.01 &&
    Math.abs(a.translate[1] - b.translate[1]) < 0.01
  );
}

/**
 * Degrees of rotation per pixel dragged. At the centre of an azimuthal
 * equidistant map a scale of `s` stretches 180° over `s · π` pixels.
 */
export function degreesPerPixel(scale: number): number {
  return 180 / (scale * Math.PI);
}

export function clampPhi(phi: number): number {
  return Math.max(-90, Math.min(90, phi));
}
