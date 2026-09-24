import { geoCentroid, geoGraticule, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, MultiPolygon } from "geojson";
import { useEffect, useMemo, useRef, useState } from "react";
import { toFeature, useGeometry } from "../game/geometry.ts";
import { useLocale } from "../i18n/index.tsx";
import {
  applyFrame,
  clampPhi,
  degreesPerPixel,
  type Frame,
  framesMatch,
  idealFrame,
  interpolateFrame,
  makeProjection,
} from "./globe.ts";

/** How a region is painted on the interactive layer. */
export type Tone = "start" | "end" | "chain" | "closer" | "detour" | "wrong" | "hint";

export interface Shown {
  regionId: string;
  tone: Tone;
  label?: string;
}

const WIDTH = 640;
const HEIGHT = 420;
const PADDING = WIDTH * 0.05;
const FLIGHT_MS = 900;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 12;
/** Below this many square pixels a country is a speck, so it gets a pin instead. */
const PIN_BELOW_AREA = 24;
const GRATICULE = geoGraticule().step([15, 15])();

interface Lines {
  type: "MultiLineString";
  coordinates: number[][][];
}

/**
 * The world's borders, coarse. Spinning the full-detail set costs tens of
 * milliseconds a frame, which drops the globe below sixty, so this is what is
 * drawn while it moves; the detailed set goes on the moment it stops. That
 * detailed set is the display geometry already loaded for the countries in
 * play, so it costs nothing extra to ship.
 */
let outlinePending: Promise<Lines> | null = null;
function loadOutline(): Promise<Lines> {
  outlinePending ??= import("@travelle/geo/data/outline.json").then(
    (m) => m.default as unknown as Lines,
  );
  return outlinePending;
}

interface Palette {
  ocean: string;
  oceanLit: string;
  graticule: string;
  border: string;
}

function readPalette(element: HTMLElement): Palette {
  const style = getComputedStyle(element);
  const read = (name: string, fallback: string): string =>
    style.getPropertyValue(name).trim() || fallback;
  return {
    ocean: read("--ocean", "#cfe0ea"),
    oceanLit: read("--ocean-lit", "#eaf3f8"),
    graticule: read("--graticule", "#9fb8c6"),
    border: read("--world-border", "#8aa3b1"),
  };
}

interface Drawn extends Shown {
  feature: Feature<MultiPolygon>;
  centre: [number, number];
}

export function MapView({
  shown,
  worldOutline = false,
  celebrate = false,
}: {
  shown: Shown[];
  /** Draw every country's borders as context — Travle's second hint. */
  worldOutline?: boolean;
  /** Light the finished chain up, start to end. */
  celebrate?: boolean;
}): React.ReactElement {
  const { t } = useLocale();
  const geometry = useGeometry();
  const [outline, setOutline] = useState<Lines | null>(null);
  const [dragging, setDragging] = useState(false);
  const [adjusted, setAdjusted] = useState(false);
  const [palette, setPalette] = useState<Palette | null>(null);

  useEffect(() => {
    if (!worldOutline) return;
    let live = true;
    void loadOutline().then((data) => {
      if (live) setOutline(data);
    });
    return () => {
      live = false;
    };
  }, [worldOutline]);

  /** Every border on the map, at the detail the countries themselves are drawn. */
  const detailedOutline = useMemo<Lines | null>(() => {
    if (!geometry || !worldOutline) return null;
    return {
      type: "MultiLineString",
      coordinates: geometry.flat().filter((ring) => ring.length >= 4),
    };
  }, [geometry, worldOutline]);

  const drawn = useMemo<Drawn[]>(() => {
    if (!geometry) return [];
    return shown
      .map((entry) => {
        const feature = toFeature(entry.regionId, geometry);
        return feature ? { ...entry, feature, centre: geoCentroid(feature) } : null;
      })
      .filter((entry) => entry !== null);
  }, [geometry, shown]);

  // Framing follows the countries in play only. Including a hinted outline
  // would pan the globe straight at the answer.
  const collection = useMemo<FeatureCollection<MultiPolygon>>(
    () => ({
      type: "FeatureCollection",
      features: drawn.filter((entry) => entry.tone !== "hint").map((entry) => entry.feature),
    }),
    [drawn],
  );

  const framedCount = collection.features.length;

  // Everything below writes straight into the canvas and the DOM: the globe
  // redraws on every animation frame, and pushing that through React state
  // would re-render the whole page sixty times a second for no benefit.
  const projection = useRef(makeProjection());
  const frame = useRef<Frame | null>(null);
  const moving = useRef(false);
  const shapes = useRef(new Map<string, SVGPathElement>());
  const markers = useRef(new Map<string, SVGGElement>());
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const redraw = useRef<() => void>(() => {});

  // The canvas needs real colours rather than CSS variables, and they change
  // with the viewer's theme.
  useEffect(() => {
    const element = holder.current;
    if (!element) return;
    const refresh = (): void => setPalette(readPalette(element));
    refresh();
    const scheme = window.matchMedia?.("(prefers-color-scheme: dark)");
    scheme?.addEventListener?.("change", refresh);
    return () => scheme?.removeEventListener?.("change", refresh);
  }, []);

  // Keep the backing store matched to the box, then draw in viewBox units so
  // the canvas and the SVG on top of it stay in step.
  useEffect(() => {
    const element = holder.current;
    const node = canvas.current;
    if (!element || !node) return;
    const resize = (): void => {
      const dpr = window.devicePixelRatio || 1;
      const width = element.clientWidth || WIDTH;
      node.width = Math.round(width * dpr);
      node.height = Math.round(((width * HEIGHT) / WIDTH) * dpr);
      redraw.current();
    };
    resize();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const path = geoPath(projection.current);

    const paint = (): void => {
      if (!frame.current) return;
      applyFrame(projection.current, frame.current);

      const node = canvas.current;
      const ctx = node?.getContext?.("2d") ?? null;
      if (node && ctx && palette && node.width > 0) {
        const scale = node.width / WIDTH;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.clearRect(0, 0, WIDTH, HEIGHT);
        const draw = geoPath(projection.current, ctx);

        const sea = ctx.createRadialGradient(
          WIDTH * 0.38,
          HEIGHT * 0.3,
          0,
          WIDTH * 0.38,
          HEIGHT * 0.3,
          WIDTH * 0.8,
        );
        sea.addColorStop(0, palette.oceanLit);
        sea.addColorStop(1, palette.ocean);
        ctx.beginPath();
        draw({ type: "Sphere" });
        ctx.fillStyle = sea;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = palette.graticule;
        ctx.stroke();

        ctx.beginPath();
        draw(GRATICULE);
        ctx.lineWidth = 0.5;
        ctx.globalAlpha = 0.55;
        ctx.stroke();
        ctx.globalAlpha = 1;

        if (outline) {
          ctx.beginPath();
          draw(moving.current ? outline : (detailedOutline ?? outline));
          ctx.lineWidth = 0.7;
          ctx.strokeStyle = palette.border;
          ctx.stroke();
        }
      }

      for (const entry of drawn) {
        shapes.current.get(entry.regionId)?.setAttribute("d", path(entry.feature) ?? "");

        const marker = markers.current.get(entry.regionId);
        if (!marker) continue;
        const point = projection.current(entry.centre);
        const onScreen =
          point !== null &&
          point[0] > -40 &&
          point[0] < WIDTH + 40 &&
          point[1] > -20 &&
          point[1] < HEIGHT + 20;
        marker.setAttribute("transform", point ? `translate(${point[0]},${point[1]})` : "");
        marker.style.opacity = onScreen ? "1" : "0";
        // Monaco and the Vatican never cover a pixel; pin them instead.
        marker.classList.toggle("is-tiny", path.area(entry.feature) < PIN_BELOW_AREA);
      }
    };
    redraw.current = paint;
    paint();
  }, [drawn, palette, outline, detailedOutline]);

  /** Run a flight, then repaint once more at full detail. */
  const flyTo = (target: Frame, from: Frame): (() => void) => {
    let raf = 0;
    const started = performance.now();
    moving.current = true;
    const step = (now: number): void => {
      const progress = Math.min(1, (now - started) / FLIGHT_MS);
      frame.current = interpolateFrame(from, target, progress);
      redraw.current();
      if (progress < 1) {
        raf = requestAnimationFrame(step);
      } else {
        moving.current = false;
        redraw.current();
        setAdjusted(false);
      }
    };
    raf = requestAnimationFrame(step);
    return () => {
      moving.current = false;
      cancelAnimationFrame(raf);
    };
  };

  // Fly to the framing that fits whatever is on the map now.
  useEffect(() => {
    if (framedCount === 0) return;
    const target = idealFrame(collection, WIDTH, HEIGHT, PADDING);
    const from = frame.current;
    setAdjusted(false);
    if (!from || framesMatch(from, target)) {
      frame.current = target;
      redraw.current();
      return;
    }
    return flyTo(target, from);
  }, [collection, framedCount]);

  const recentre = (): void => {
    if (framedCount === 0 || !frame.current) return;
    flyTo(idealFrame(collection, WIDTH, HEIGHT, PADDING), frame.current);
  };

  // --- spinning and zooming by hand ---

  const drag = useRef<{ x: number; y: number; rotate: [number, number, number] } | null>(null);

  /** Client coordinates in the SVG's own units. An unmeasured box maps 1:1. */
  const toLocal = (event: React.PointerEvent<SVGSVGElement>): [number, number] => {
    const box = event.currentTarget.getBoundingClientRect();
    const scaleX = box.width > 0 ? WIDTH / box.width : 1;
    const scaleY = box.height > 0 ? HEIGHT / box.height : 1;
    return [(event.clientX - box.left) * scaleX, (event.clientY - box.top) * scaleY];
  };

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (!frame.current) return;
    // Without this the browser starts a text selection on the country labels
    // and the drag turns into a highlight.
    event.preventDefault();
    const [x, y] = toLocal(event);
    drag.current = { x, y, rotate: [...frame.current.rotate] };
    moving.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>): void => {
    const start = drag.current;
    if (!start || !frame.current) return;
    const [x, y] = toLocal(event);
    const rate = degreesPerPixel(frame.current.scale);
    frame.current = {
      ...frame.current,
      rotate: [
        start.rotate[0] + (x - start.x) * rate,
        clampPhi(start.rotate[1] - (y - start.y) * rate),
        start.rotate[2],
      ],
    };
    redraw.current();
    setAdjusted(true);
  };

  const endDrag = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (!drag.current) return;
    drag.current = null;
    moving.current = false;
    redraw.current();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragging(false);
  };

  // React attaches its own wheel handler passively, so zooming has to bind a
  // native listener to be allowed to swallow the page scroll.
  useEffect(() => {
    const node = svgRef.current;
    if (!node || framedCount === 0) return;
    const base = idealFrame(collection, WIDTH, HEIGHT, PADDING).scale;
    let settle = 0;
    const onWheel = (event: WheelEvent): void => {
      if (!frame.current) return;
      event.preventDefault();
      const next = frame.current.scale * Math.exp(-event.deltaY * 0.0015);
      frame.current = {
        ...frame.current,
        scale: Math.min(base * MAX_ZOOM, Math.max(base * MIN_ZOOM, next)),
      };
      moving.current = true;
      redraw.current();
      setAdjusted(true);
      window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        moving.current = false;
        redraw.current();
      }, 160);
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.clearTimeout(settle);
      node.removeEventListener("wheel", onWheel);
    };
  }, [collection, framedCount]);

  return (
    <div className="map" ref={holder}>
      <canvas ref={canvas} className="map__canvas" aria-hidden="true" />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={t("mapLabel")}
        className={dragging ? "is-dragging" : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={recentre}
      >
        {drawn.map((entry, index) => (
          <path
            key={entry.regionId}
            ref={(node) => {
              if (node) shapes.current.set(entry.regionId, node);
              else shapes.current.delete(entry.regionId);
            }}
            className={`shape shape--${entry.tone}${celebrate ? " is-lit" : ""}`}
            data-region={entry.regionId}
            style={celebrate ? { animationDelay: `${index * 110}ms` } : undefined}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {drawn.map((entry) => (
          <g
            key={`${entry.regionId}-marker`}
            ref={(node) => {
              if (node) markers.current.set(entry.regionId, node);
              else markers.current.delete(entry.regionId);
            }}
            className={`marker marker--${entry.tone}`}
          >
            <circle className="marker__pin" r={4.5} />
            {entry.label ? <text className="marker__text">{entry.label}</text> : null}
          </g>
        ))}
      </svg>

      {adjusted && (
        <button type="button" className="map__recentre" onClick={recentre}>
          {t("recentre")}
        </button>
      )}
      {!geometry && <p className="map__loading">{t("mapLoading")}</p>}
    </div>
  );
}
