import { geoCentroid, geoGraticule, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, MultiPolygon } from "geojson";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toFeature, useGeometry } from "../game/geometry.ts";
import { useLocale } from "../i18n/index.tsx";
import {
  applyFrame,
  type Box,
  clampPhi,
  degreesPerPixel,
  facesCamera,
  type Frame,
  framesMatch,
  globeFrame,
  globeScale,
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

/** What an unmeasured box (jsdom, or the first paint) is taken to be. */
const FALLBACK = { width: 640, height: 420 };
const FLIGHT_MS = 900;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 80;
const BUTTON_ZOOM = 1.8;
/** Below this many square pixels a country is a speck, so it gets a pin instead. */
const PIN_BELOW_AREA = 24;
const GRATICULE = geoGraticule().step([15, 15])();

/** A fixed sky, so the stars stay put while the globe turns under them. */
const STARS = Array.from({ length: 220 }, (_, index) => {
  const r = (n: number): number => {
    const x = Math.sin(index * 12.9898 + n * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  return { x: r(1), y: r(2), size: 0.4 + r(3) * 1.1, alpha: 0.25 + r(4) * 0.6 };
});

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
  oceanDeep: string;
  graticule: string;
  border: string;
  glow: string;
  glowFade: string;
  shade: string;
  stars: number;
}

function readPalette(element: HTMLElement): Palette {
  const style = getComputedStyle(element);
  const read = (name: string, fallback: string): string =>
    style.getPropertyValue(name).trim() || fallback;
  return {
    ocean: read("--ocean", "#cfe0ea"),
    oceanLit: read("--ocean-lit", "#eaf3f8"),
    oceanDeep: read("--ocean-deep", "#a9c4d4"),
    graticule: read("--graticule", "#9fb8c6"),
    border: read("--world-border", "#8aa3b1"),
    glow: read("--glow", "rgba(120, 170, 220, 0.35)"),
    glowFade: read("--glow-fade", "rgba(120, 170, 220, 0)"),
    shade: read("--shade", "rgba(10, 30, 50, 0.18)"),
    stars: Number(read("--stars", "0")) || 0,
  };
}

interface Drawn extends Shown {
  feature: Feature<MultiPolygon>;
  centre: [number, number];
}

const sameBox = (a: Box, b: Box): boolean =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

const paddingFor = (box: Box): number =>
  Math.round(Math.min(56, Math.max(16, Math.min(box.width, box.height) * 0.08)));

export function MapView({
  shown,
  worldOutline = false,
  celebrate = false,
  windowRef,
}: {
  shown: Shown[];
  /** Draw every country's borders as context — Travle's second hint. */
  worldOutline?: boolean;
  /** Light the finished chain up, start to end. */
  celebrate?: boolean;
  /**
   * The part of the screen the panels leave free. The map itself fills the
   * whole viewport, but it frames the route inside this element.
   */
  windowRef?: React.RefObject<HTMLElement | null>;
}): React.ReactElement {
  const { t } = useLocale();
  const geometry = useGeometry();
  const [outline, setOutline] = useState<Lines | null>(null);
  const [dragging, setDragging] = useState(false);
  const [adjusted, setAdjusted] = useState(false);
  const [palette, setPalette] = useState<Palette | null>(null);
  const [size, setSize] = useState(FALLBACK);
  const [box, setBox] = useState<Box>({ x: 0, y: 0, ...FALLBACK });

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
  const boxRef = useRef(box);
  boxRef.current = box;

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

  // Measure the map and the free window inside it. Both drive the framing.
  useLayoutEffect(() => {
    const element = holder.current;
    if (!element) return;
    const measure = (): void => {
      const width = element.clientWidth || FALLBACK.width;
      const height = element.clientHeight || FALLBACK.height;
      setSize((old) => (old.width === width && old.height === height ? old : { width, height }));

      const own = element.getBoundingClientRect();
      const free = windowRef?.current?.getBoundingClientRect();
      const next: Box =
        free && free.width > 0 && free.height > 0
          ? {
              x: Math.round(free.left - own.left),
              y: Math.round(free.top - own.top),
              width: Math.round(free.width),
              height: Math.round(free.height),
            }
          : { x: 0, y: 0, width, height };
      setBox((old) => (sameBox(old, next) ? old : next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (windowRef?.current) observer.observe(windowRef.current);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [windowRef]);

  // Keep the backing store matched to the box, at the screen's own density.
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    node.width = Math.round(size.width * dpr);
    node.height = Math.round(size.height * dpr);
    redraw.current();
  }, [size]);

  useEffect(() => {
    const path = geoPath(projection.current);
    const { width, height } = size;

    const paint = (): void => {
      if (!frame.current) return;
      applyFrame(projection.current, frame.current);
      const [cx, cy] = frame.current.translate;
      const radius = frame.current.scale;

      const node = canvas.current;
      const ctx = node?.getContext?.("2d") ?? null;
      if (node && ctx && palette && node.width > 0) {
        const ratio = node.width / width;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, width, height);
        const draw = geoPath(projection.current, ctx);

        if (palette.stars > 0) {
          ctx.fillStyle = "#fff";
          for (const star of STARS) {
            ctx.globalAlpha = star.alpha * palette.stars;
            ctx.fillRect(star.x * width, star.y * height, star.size, star.size);
          }
          ctx.globalAlpha = 1;
        }

        // Atmosphere: a soft halo just past the horizon.
        const halo = ctx.createRadialGradient(cx, cy, radius * 0.96, cx, cy, radius * 1.16);
        halo.addColorStop(0, palette.glow);
        halo.addColorStop(1, palette.glowFade);
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 1.16, 0, Math.PI * 2);
        ctx.fill();

        // The sea, lit from the upper left.
        const sea = ctx.createRadialGradient(
          cx - radius * 0.38,
          cy - radius * 0.42,
          radius * 0.05,
          cx,
          cy,
          radius * 1.05,
        );
        sea.addColorStop(0, palette.oceanLit);
        sea.addColorStop(0.55, palette.ocean);
        sea.addColorStop(1, palette.oceanDeep);
        ctx.beginPath();
        draw({ type: "Sphere" });
        ctx.fillStyle = sea;
        ctx.fill();

        ctx.beginPath();
        draw(GRATICULE);
        ctx.lineWidth = 0.6;
        ctx.strokeStyle = palette.graticule;
        ctx.globalAlpha = 0.6;
        ctx.stroke();
        ctx.globalAlpha = 1;

        if (outline) {
          ctx.beginPath();
          draw(moving.current ? outline : (detailedOutline ?? outline));
          ctx.lineWidth = 0.8;
          ctx.strokeStyle = palette.border;
          ctx.stroke();
        }

        // Darken towards the limb so the disc reads as a ball.
        const limb = ctx.createRadialGradient(cx, cy, radius * 0.62, cx, cy, radius);
        limb.addColorStop(0, "rgba(0,0,0,0)");
        limb.addColorStop(1, palette.shade);
        ctx.beginPath();
        draw({ type: "Sphere" });
        ctx.fillStyle = limb;
        ctx.fill();
      }

      // Labels claim space in order — the two ends first, then each guess as
      // it was made — and one that would land on an earlier label stays hidden.
      const placed: [number, number, number, number][] = [];
      const ordered = [
        ...drawn.filter((entry) => entry.tone === "start" || entry.tone === "end"),
        ...drawn.filter((entry) => entry.tone !== "start" && entry.tone !== "end"),
      ];
      for (const entry of ordered) {
        shapes.current.get(entry.regionId)?.setAttribute("d", path(entry.feature) ?? "");

        const marker = markers.current.get(entry.regionId);
        if (!marker) continue;
        const point = projection.current(entry.centre);
        const tiny = path.area(entry.feature) < PIN_BELOW_AREA;
        let visible =
          point !== null &&
          facesCamera(frame.current, entry.centre) &&
          point[0] > -40 &&
          point[0] < width + 40 &&
          point[1] > -20 &&
          point[1] < height + 20;
        if (visible && point && entry.label) {
          const half = entry.label.length * 3.6 + 4;
          const y = tiny ? point[1] - 11 : point[1];
          const rect: [number, number, number, number] = [
            point[0] - half,
            y - 9,
            point[0] + half,
            y + 9,
          ];
          visible = !placed.some(
            (o) => rect[0] < o[2] && rect[2] > o[0] && rect[1] < o[3] && rect[3] > o[1],
          );
          if (visible) placed.push(rect);
        }
        marker.setAttribute("transform", point ? `translate(${point[0]},${point[1]})` : "");
        marker.style.opacity = visible ? "1" : "0";
        // Monaco and the Vatican never cover a pixel; pin them instead.
        marker.classList.toggle("is-tiny", tiny);
      }
    };
    redraw.current = paint;
    paint();
  }, [drawn, palette, outline, detailedOutline, size]);

  const flight = useRef<() => void>(() => {});

  /** Run a flight, then repaint once more at full detail. */
  const flyTo = (target: Frame): void => {
    flight.current();
    const from = frame.current;
    if (!from || framesMatch(from, target)) {
      frame.current = target;
      redraw.current();
      return;
    }
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
      }
    };
    raf = requestAnimationFrame(step);
    flight.current = () => {
      moving.current = false;
      cancelAnimationFrame(raf);
    };
  };

  const home = (): Frame =>
    framedCount > 0
      ? idealFrame(collection, box, paddingFor(box))
      : globeFrame(box, paddingFor(box));

  // Fly to the framing that fits whatever is on the map now. A resized
  // window snaps instead: flying there would lag behind the drag handle.
  const lastBox = useRef<Box | null>(null);
  useEffect(() => {
    const target = home();
    const resized = lastBox.current !== null && !sameBox(lastBox.current, box);
    lastBox.current = box;
    setAdjusted(false);
    if (resized) {
      flight.current();
      frame.current = target;
      redraw.current();
      return;
    }
    flyTo(target);
    return () => flight.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection, framedCount, box]);

  const recentre = (): void => {
    flyTo(home());
    setAdjusted(false);
  };

  const zoomLimits = (): [number, number] => {
    const base = globeScale(boxRef.current, paddingFor(boxRef.current));
    return [base * MIN_ZOOM, base * MAX_ZOOM];
  };

  const zoomBy = (factor: number): void => {
    if (!frame.current) return;
    const [min, max] = zoomLimits();
    flyTo({
      ...frame.current,
      scale: Math.min(max, Math.max(min, frame.current.scale * factor)),
    });
    setAdjusted(true);
  };

  // --- spinning and zooming by hand ---

  const pointers = useRef(new Map<number, [number, number]>());
  const gesture = useRef<
    | { kind: "drag"; x: number; y: number; rotate: [number, number, number] }
    | { kind: "pinch"; distance: number; scale: number }
    | null
  >(null);

  /** Client coordinates in the SVG's own units, which are screen pixels. */
  const toLocal = (event: React.PointerEvent<SVGSVGElement>): [number, number] => {
    const own = event.currentTarget.getBoundingClientRect();
    return [event.clientX - own.left, event.clientY - own.top];
  };

  const spread = (): number => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 0;
  };

  /** Start the gesture over from wherever the fingers are now. */
  const restart = (): void => {
    if (!frame.current) return;
    const points = [...pointers.current.values()];
    if (points.length >= 2) {
      gesture.current = { kind: "pinch", distance: spread(), scale: frame.current.scale };
    } else if (points.length === 1) {
      const [x, y] = points[0]!;
      gesture.current = { kind: "drag", x, y, rotate: [...frame.current.rotate] };
    } else {
      gesture.current = null;
    }
  };

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (!frame.current) return;
    // Without this the browser starts a text selection on the country labels
    // and the drag turns into a highlight.
    event.preventDefault();
    flight.current();
    pointers.current.set(event.pointerId, toLocal(event));
    restart();
    moving.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, toLocal(event));
    const now = gesture.current;
    if (!now || !frame.current) return;

    if (now.kind === "pinch") {
      const [min, max] = zoomLimits();
      const distance = spread();
      if (now.distance <= 0 || distance <= 0) return;
      frame.current = {
        ...frame.current,
        scale: Math.min(max, Math.max(min, (now.scale * distance) / now.distance)),
      };
    } else {
      const [x, y] = pointers.current.get(event.pointerId)!;
      const rate = degreesPerPixel(frame.current.scale);
      frame.current = {
        ...frame.current,
        rotate: [
          now.rotate[0] + (x - now.x) * rate,
          clampPhi(now.rotate[1] - (y - now.y) * rate),
          now.rotate[2],
        ],
      };
    }
    redraw.current();
    setAdjusted(true);
  };

  const endPointer = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (!pointers.current.delete(event.pointerId)) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    restart();
    if (pointers.current.size > 0) return;
    moving.current = false;
    redraw.current();
    setDragging(false);
  };

  // React attaches its own wheel handler passively, so zooming has to bind a
  // native listener to be allowed to swallow the page scroll.
  useEffect(() => {
    const node = svgRef.current;
    if (!node) return;
    let settle = 0;
    const onWheel = (event: WheelEvent): void => {
      if (!frame.current) return;
      event.preventDefault();
      flight.current();
      const [min, max] = zoomLimits();
      const next = frame.current.scale * Math.exp(-event.deltaY * 0.0015);
      frame.current = { ...frame.current, scale: Math.min(max, Math.max(min, next)) };
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="map" ref={holder}>
      <canvas ref={canvas} className="map__canvas" aria-hidden="true" />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${size.width} ${size.height}`}
        width={size.width}
        height={size.height}
        role="img"
        aria-label={t("mapLabel")}
        className={dragging ? "is-dragging" : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
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

      <div
        className="map__controls"
        style={
          {
            "--win-right": `${box.x + box.width}px`,
            "--win-top": `${box.y}px`,
            "--win-bottom": `${box.y + box.height}px`,
          } as React.CSSProperties
        }
      >
        {adjusted && (
          <button type="button" className="map__button map__button--wide" onClick={recentre}>
            {t("recentre")}
          </button>
        )}
        <button
          type="button"
          className="map__button"
          aria-label={t("zoomIn")}
          onClick={() => zoomBy(BUTTON_ZOOM)}
        >
          +
        </button>
        <button
          type="button"
          className="map__button"
          aria-label={t("zoomOut")}
          onClick={() => zoomBy(1 / BUTTON_ZOOM)}
        >
          −
        </button>
      </div>
      {!geometry && <p className="map__loading">{t("mapLoading")}</p>}
    </div>
  );
}
