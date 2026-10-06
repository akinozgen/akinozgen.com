import type { RoundInfo } from "@sizele/data/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { besides, type Box, boxOf, carry, loadOutline, MAX_LAT, pathOf, project, union, unwrap } from "../game/mercator.ts";

const TAU = Math.PI * 2;
const REVEAL_MS = 1900;
const REVEAL_DELAY_MS = 120;

let world: Promise<string> | null = null;

/** Every coast and border, drawn once as one path: the map the lie is told on. */
function loadWorld(): Promise<string> {
  world ??= loadOutline().then((lines) => {
    let d = "";
    for (const line of lines) {
      let previous: number | null = null;
      for (const [lon, lat] of line) {
        const [x, y] = project(lon, lat);
        // A jump across the date line starts a new stroke instead of crossing the map.
        const jump = previous === null || Math.abs(lon - previous) > 180;
        d += `${jump ? "M" : "L"}${x.toFixed(3)} ${y.toFixed(3)}`;
        previous = lon;
      }
    }
    return d;
  });
  return world;
}

function useWorld(): string | null {
  const [d, setD] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void loadWorld().then((path) => live && setD(path));
    return () => {
      live = false;
    };
  }, []);
  return d;
}

/** Room round a box, and never smaller than a sliver of the world. */
function padded([minX, minY, maxX, maxY]: Box): Box {
  const w = Math.max(maxX - minX, 0.12);
  const h = Math.max(maxY - minY, 0.12);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const size = Math.max(w, h) * 0.18;
  return [cx - w / 2 - size, cy - h / 2 - size, cx + w / 2 + size, cy + h / 2 + size];
}

const viewBox = ([minX, minY, maxX, maxY]: Box): string =>
  `${minX.toFixed(4)} ${minY.toFixed(4)} ${(maxX - minX).toFixed(4)} ${(maxY - minY).toFixed(4)}`;

const ease = (t: number): number => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const mix = (a: Box, b: Box, t: number): Box => a.map((v, i) => v + (b[i] - v) * t) as Box;

const LATITUDES = [-75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75];

/**
 * The round on a Mercator map: the unit in blue, the target in amber, both
 * where they really are. Once the guess is in, the target makes the
 * true-size move and lands beside the unit, under the same stretch of map.
 */
export function MapView({
  round,
  moving,
  named,
  name,
  label,
  ratioText,
  onLanded,
}: {
  round: RoundInfo;
  /** The guess is in: the move starts at once, without waiting for the server's numbers. */
  moving: boolean;
  /** Names on the map; hard mode keeps them back until the guess is in. */
  named: boolean;
  name: (id: string) => string;
  label: string;
  /** How the true ratio reads, for the stamp the country lands with. */
  ratioText: string | null;
  /** The true-size move has finished. */
  onLanded?: () => void;
}): React.ReactElement {
  const backdrop = useWorld();
  const svgRef = useRef<SVGSVGElement>(null);
  const movedRef = useRef<SVGPathElement>(null);
  const movedLabelRef = useRef<SVGTextElement>(null);
  const unitLabelRef = useRef<SVGTextElement>(null);
  const targetLabelRef = useRef<SVGTextElement>(null);
  const stampRef = useRef<SVGTextElement>(null);
  const unitHaloRef = useRef<SVGCircleElement>(null);
  const targetHaloRef = useRef<SVGCircleElement>(null);
  const [done, setDone] = useState(false);
  const landedRef = useRef(onLanded);
  landedRef.current = onLanded;
  const namedRef = useRef(named);
  namedRef.current = named;

  const { unit, target } = round;
  const unitAround = unit.centroid[0];
  // The target drawn on whichever side of the date line is nearer the unit.
  const targetAround = unwrap(target.centroid[0], unitAround);

  const geometry = useMemo(() => {
    const unitPath = pathOf(unit.rings, unitAround);
    const targetPath = pathOf(target.rings, targetAround);
    const unitBox = boxOf(unit.rings, unitAround);
    const targetBox = boxOf(target.rings, targetAround);
    const start = padded(union(unitBox, targetBox));
    const dest = besides(unit, target);
    // Carried from where it is drawn, to beside the unit: one unbroken journey.
    const from: [number, number] = [targetAround, target.centroid[1]];
    const landed = carry(target.rings, from, dest, 1);
    const landedAround = landed.centre[0];
    const landedBox = boxOf(landed.rings, landedAround);
    const end = padded(union(unitBox, landedBox));
    // Room under the landed country for its stamp.
    end[3] += (end[2] - end[0]) * 0.06;
    return { unitPath, targetPath, start, end, dest, from, unitBox, targetBox, landedBox };
  }, [unit, target, unitAround, targetAround]);

  /**
   * A name on the map, the same size on screen however far the view zooms.
   * A country too small to hold its name gets it just above instead, and a
   * ring round it so it can be found at all.
   */
  const placeLabel = (
    element: SVGTextElement | null,
    halo: SVGCircleElement | null,
    lon: number,
    lat: number,
    shape: Box,
    view: Box,
  ): void => {
    if (!element) return;
    const width = view[2] - view[0];
    // Never smaller than 12 screen pixels, however narrow the phone.
    const pixels = svgRef.current?.clientWidth || 600;
    const size = Math.max(width * 0.03, (12 * width) / pixels);
    const [x, y] = project(lon, lat);
    const span = Math.max(shape[2] - shape[0], shape[3] - shape[1]);
    // Too small to hold its own name: roughly, narrower than the name is long.
    const nameWidth = (element.textContent?.length ?? 6) * size * 0.6;
    const small = span < Math.max(nameWidth * 1.15, width * 0.07);
    element.setAttribute("x", x.toFixed(4));
    element.setAttribute("y", (small ? shape[1] - size * 1.6 : y).toFixed(4));
    element.style.fontSize = `${size.toFixed(4)}px`;
    element.style.strokeWidth = `${(size * 0.26).toFixed(4)}px`;
    element.style.visibility = namedRef.current ? "visible" : "hidden";
    if (halo) {
      halo.setAttribute("cx", ((shape[0] + shape[2]) / 2).toFixed(4));
      halo.setAttribute("cy", ((shape[1] + shape[3]) / 2).toFixed(4));
      halo.setAttribute("r", (Math.max(span * 0.75, width * 0.035)).toFixed(4));
      halo.style.visibility = small ? "visible" : "hidden";
    }
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const { start, end, dest, from, unitBox, targetBox } = geometry;
    const frame = (box: Box, t: number): void => {
      svg.setAttribute("viewBox", viewBox(box));
      placeLabel(unitLabelRef.current, unitHaloRef.current, unitAround, unit.centroid[1], unitBox, box);
      placeLabel(targetLabelRef.current, moving ? null : targetHaloRef.current, targetAround, target.centroid[1], targetBox, box);
      if (moving && targetHaloRef.current) targetHaloRef.current.style.visibility = "hidden";
      const moved = movedRef.current;
      const movedLabel = movedLabelRef.current;
      if (!moved) return;
      if (t <= 0) {
        // Nothing has moved yet: nothing to draw, not even the name.
        moved.setAttribute("d", "");
        if (movedLabel) movedLabel.style.visibility = "hidden";
        return;
      }
      const step = carry(target.rings, from, dest, t);
      const around = step.centre[0];
      moved.setAttribute("d", pathOf(step.rings, around));
      placeLabel(movedLabel, null, around, step.centre[1], boxOf(step.rings, around), box);
      const stamp = stampRef.current;
      if (stamp) {
        // Just under the landed country, clear of it.
        const width = box[2] - box[0];
        const shape = boxOf(step.rings, around);
        const size = width * 0.06;
        stamp.setAttribute("x", ((shape[0] + shape[2]) / 2).toFixed(4));
        stamp.setAttribute("y", Math.min(shape[3] + size * 0.9, box[3] - size * 0.4).toFixed(4));
        stamp.style.fontSize = `${size.toFixed(4)}px`;
        stamp.style.strokeWidth = `${(size * 0.25).toFixed(4)}px`;
      }
    };
    setDone(false);
    if (!moving) {
      frame(start, 0);
      return;
    }
    let raf = 0;
    const begin = performance.now() + REVEAL_DELAY_MS;
    const tick = (now: number): void => {
      const t = Math.max(0, Math.min(1, (now - begin) / REVEAL_MS));
      const e = ease(t);
      frame(mix(start, end, e), e);
      if (t < 1) raf = requestAnimationFrame(tick);
      else {
        setDone(true);
        landedRef.current?.();
      }
    };
    frame(start, 0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry, moving]);

  // Hard mode switched, or the guess just went in: names come and go at once.
  useEffect(() => {
    for (const label of [unitLabelRef.current, targetLabelRef.current]) {
      if (label && label.style.fontSize) label.style.visibility = named ? "visible" : "hidden";
    }
  }, [named]);

  // Once the target is on the move, its name travels with it, not left behind.
  useEffect(() => {
    if (moving && targetLabelRef.current) targetLabelRef.current.style.display = "none";
  }, [moving]);

  const top = project(0, MAX_LAT)[1];
  const bottom = project(0, -MAX_LAT)[1];

  return (
    <div className="map">
      <svg ref={svgRef} className="map__svg" viewBox={viewBox(geometry.start)} preserveAspectRatio="xMidYMid meet" role="img" aria-label={label}>
        <rect className="map__sea" x={-TAU * 2} y={top} width={TAU * 4} height={bottom - top} />
        <g className="map__grid">
          {LATITUDES.map((lat) => {
            const y = project(0, lat)[1];
            return <line key={lat} className={lat === 0 ? "is-equator" : undefined} x1={-TAU * 2} x2={TAU * 2} y1={y} y2={y} vectorEffect="non-scaling-stroke" />;
          })}
        </g>
        {backdrop && (
          <g className="map__land">
            <path id="sizele-world" d={backdrop} vectorEffect="non-scaling-stroke" />
            <use href="#sizele-world" x={-TAU} />
            <use href="#sizele-world" x={TAU} />
          </g>
        )}
        <path className="map__unit" d={geometry.unitPath} fillRule="evenodd" vectorEffect="non-scaling-stroke" />
        <path
          className={`map__target${moving ? " is-ghost" : ""}`}
          d={geometry.targetPath}
          fillRule="evenodd"
          vectorEffect="non-scaling-stroke"
        />
        <path ref={movedRef} className={`map__moved${done ? " is-landed" : ""}`} fillRule="evenodd" vectorEffect="non-scaling-stroke" />
        <circle ref={unitHaloRef} className="map__halo map__halo--unit" vectorEffect="non-scaling-stroke" style={{ visibility: "hidden" }} />
        <circle ref={targetHaloRef} className="map__halo map__halo--target" vectorEffect="non-scaling-stroke" style={{ visibility: "hidden" }} />
        <text ref={unitLabelRef} className="map__label map__label--unit" textAnchor="middle" dominantBaseline="middle" style={{ visibility: "hidden" }}>
          {name(unit.id)}
        </text>
        <text
          ref={targetLabelRef}
          className={`map__label map__label--target${moving ? " is-ghost" : ""}`}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ visibility: "hidden" }}
        >
          {name(target.id)}
        </text>
        {moving && (
          <text
            ref={movedLabelRef}
            className="map__label map__label--moved"
            textAnchor="middle"
            dominantBaseline="middle"
            style={{ visibility: "hidden" }}
          >
            {name(target.id)}
          </text>
        )}
        {moving && (
          <text ref={stampRef} className={`map__stamp${done && ratioText ? " is-on" : ""}`} textAnchor="middle" dominantBaseline="middle">
            {ratioText}
          </text>
        )}
      </svg>
    </div>
  );
}
