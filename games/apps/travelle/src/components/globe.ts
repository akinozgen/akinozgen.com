import { geoCentroid, geoDistance, geoOrthographic, type GeoProjection } from "d3-geo";
import type { FeatureCollection, MultiPolygon, Point } from "geojson";

/** The near hemisphere — a globe seen from space, nothing past the horizon. */
export const CLIP_ANGLE = 90;

export interface Frame {
  /** [lambda, phi, gamma] in degrees. */
  rotate: [number, number, number];
  scale: number;
  translate: [number, number];
}

/** A rectangle in screen pixels: the part of the map no panel covers. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function makeProjection(): GeoProjection {
  return geoOrthographic().clipAngle(CLIP_ANGLE).precision(0.3);
}

const centreOf = (box: Box): [number, number] => [box.x + box.width / 2, box.y + box.height / 2];

/** Scale at which the whole globe sits inside `box`, with `padding` to spare. */
export function globeScale(box: Box, padding: number): number {
  return Math.max(40, Math.min(box.width, box.height) / 2 - padding);
}

/** The whole globe, centred in the box, turned to face `[lon, lat]`. */
export function globeFrame(box: Box, padding: number, facing: [number, number] = [20, 25]): Frame {
  return {
    rotate: [-facing[0], -facing[1], 0],
    scale: globeScale(box, padding),
    translate: centreOf(box),
  };
}

/**
 * The middle of the countries in play, each counted once. An area-weighted
 * centroid would sit inside Russia or the USA and push a small endpoint off
 * towards the horizon.
 */
function middleOf(collection: FeatureCollection<MultiPolygon>): [number, number] {
  const points: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: collection.features.map((feature) => ({
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates: geoCentroid(feature) },
    })),
  };
  const [lon, lat] = geoCentroid(points);
  return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : geoCentroid(collection);
}

/**
 * Frame that fills the box with `collection`. The globe is always turned so
 * the box's centre is the point under the camera: zooming and dragging then
 * pivot about the middle of the view rather than some off-screen spot.
 */
export function idealFrame(
  collection: FeatureCollection<MultiPolygon>,
  box: Box,
  padding: number,
): Frame {
  const [lon, lat] = middleOf(collection);
  const fitted = makeProjection().rotate([-lon, -lat, 0]);
  fitted.fitExtent(
    [
      [box.x + padding, box.y + padding],
      [box.x + box.width - padding, box.y + box.height - padding],
    ],
    collection,
  );
  const centre = centreOf(box);
  const [cLon, cLat] = fitted.invert?.(centre) ?? [lon, lat];
  return {
    rotate: [-cLon, -cLat, 0],
    // A route across half the planet would otherwise shrink the globe to a
    // marble; the full disc is as far out as framing ever goes.
    scale: Math.max(fitted.scale(), globeScale(box, padding)),
    translate: centre,
  };
}

export function applyFrame(projection: GeoProjection, frame: Frame): void {
  projection.rotate(frame.rotate).scale(frame.scale).translate(frame.translate);
}

/** Whether a point faces the camera, so a label on the far side can hide. */
export function facesCamera(frame: Frame, point: [number, number]): boolean {
  const centre: [number, number] = [-frame.rotate[0], -frame.rotate[1]];
  return geoDistance(centre, point) < Math.PI / 2 - 0.02;
}

/** Shortest way round the circle, so spinning past the date line doesn't unwind. */
function lerpAngle(from: number, to: number, t: number): number {
  const delta = ((to - from + 540) % 360) - 180;
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
 * Degrees of rotation per pixel dragged. At the centre of an orthographic
 * globe a scale of `s` is the radius, so one pixel is `1 / s` radians.
 */
export function degreesPerPixel(scale: number): number {
  return 180 / (scale * Math.PI);
}

export function clampPhi(phi: number): number {
  return Math.max(-90, Math.min(90, phi));
}
