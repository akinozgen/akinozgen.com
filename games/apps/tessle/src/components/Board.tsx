import { useEffect, useRef } from "react";
import { FLASH_MS, type Table, turned } from "../game/table.ts";

interface Camera {
  /** The table point at the middle of the canvas. */
  x: number;
  y: number;
  /** Screen pixels per table unit. */
  scale: number;
}

interface Palette {
  fills: string[];
  edge: string;
  ink: string;
  halo: string;
  accent: string;
  dot: string;
  shadow: string;
}

const FILLS = 8;
/** A pointer that travels less than this is a click, not a drag. */
const DRAG_PX = 5;
/** A fingertip within this of a piece's edge has hit it. */
const TOUCH_SLOP_PX = 14;
const PADDING_PX = 28;
const CAMERA_MS = 600;

function readPalette(element: HTMLElement): Palette {
  const style = getComputedStyle(element);
  const read = (name: string, fallback: string): string => style.getPropertyValue(name).trim() || fallback;
  return {
    fills: Array.from({ length: FILLS }, (_, i) => read(`--piece-${i + 1}`, "#c9d3dd")),
    edge: read("--piece-edge", "rgb(0 0 0 / 50%)"),
    ink: read("--ink", "#1b1917"),
    halo: read("--label-halo", "#ffffff"),
    accent: read("--accent", "#3d55c8"),
    dot: read("--grid-dot", "rgb(40 70 100 / 10%)"),
    shadow: read("--piece-shadow", "rgb(20 30 40 / 30%)"),
  };
}

function pathOf(rings: number[][]): Path2D {
  const path = new Path2D();
  for (const ring of rings) {
    path.moveTo(ring[0], ring[1]);
    for (let i = 2; i < ring.length; i += 2) path.lineTo(ring[i], ring[i + 1]);
    path.closePath();
  }
  return path;
}

/**
 * The table, drawn on a canvas. Pieces are dragged with the main button or
 * a finger, turned clockwise with the other button or a tap and back with
 * the middle one; empty table drags the view, and the wheel or a pinch
 * zooms it.
 */
export function Board({
  table,
  seed,
  labels,
  interactive,
  over,
  label,
  onAct,
  fitSignal,
}: {
  table: Table;
  /** Seeds the opening layout. */
  seed: number;
  labels: string[] | null;
  interactive: boolean;
  /** The round has ended: the view follows the map home. */
  over: boolean;
  label: string;
  onAct: (pieces: number[]) => void;
  /** Bumped to ask for the whole table in view. */
  fitSignal: number;
}): React.ReactElement {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;
  const onActRef = useRef(onAct);
  onActRef.current = onAct;
  const api = useRef<{ fit: (animate: boolean, resting?: boolean) => void; draw: () => void } | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    // jsdom, or a browser without canvas: the round still runs, unseen.
    const context = typeof Path2D === "undefined" ? null : canvas.getContext("2d");
    if (!context) return;
    const ctx = context;

    const paths = table.shapes.map((shape) => pathOf(shape.rings));
    let palette = readPalette(wrap);
    let width = 0;
    let height = 0;
    let dpr = 1;
    const camera: Camera = { x: 0, y: 0, scale: 1 };
    let cameraMove: { from: Camera; to: Camera; start: number } | null = null;
    let fitScale = 1;
    let frame = 0;
    let framed = false;
    let hovered = -1;
    let dragging: number[] | null = null;

    const toTable = (sx: number, sy: number): [number, number] => [
      camera.x + (sx - width / 2) / camera.scale,
      camera.y + (sy - height / 2) / camera.scale,
    ];

    const framing = (box: [number, number, number, number]): Camera => {
      const [minX, minY, maxX, maxY] = box;
      const scale = Math.min(
        (width - PADDING_PX * 2) / Math.max(1, maxX - minX),
        (height - PADDING_PX * 2) / Math.max(1, maxY - minY),
      );
      return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, scale: Math.max(0.02, scale) };
    };

    const fit = (animate: boolean, resting = false): void => {
      if (width === 0 || height === 0) return;
      const target = framing(resting ? table.restingBounds() : table.bounds());
      fitScale = target.scale;
      if (animate) {
        cameraMove = { from: { ...camera }, to: target, start: performance.now() };
      } else {
        Object.assign(camera, target);
        cameraMove = null;
      }
      request();
    };

    const zoomAt = (sx: number, sy: number, factor: number): void => {
      const [wx, wy] = toTable(sx, sy);
      const scale = Math.min(fitScale * 8, Math.max(fitScale * 0.35, camera.scale * factor));
      camera.scale = scale;
      // Keep the point under the cursor where it was.
      camera.x = wx - (sx - width / 2) / scale;
      camera.y = wy - (sy - height / 2) / scale;
      cameraMove = null;
      request();
    };

    function request(): void {
      if (!frame) frame = requestAnimationFrame(draw);
    }

    function draw(): void {
      frame = 0;
      const now = performance.now();
      let moving = table.tick(now);
      if (cameraMove) {
        const t = Math.min(1, (now - cameraMove.start) / CAMERA_MS);
        const e = 1 - (1 - t) ** 3;
        const { from, to } = cameraMove;
        camera.x = from.x + (to.x - from.x) * e;
        camera.y = from.y + (to.y - from.y) * e;
        camera.scale = from.scale * (to.scale / from.scale) ** e;
        if (t >= 1) cameraMove = null;
        moving = true;
      }
      table.unitsPerPx = 1 / camera.scale;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // A survey grid that moves with the table, thinned out when zoomed away.
      let step = 40;
      while (step * camera.scale < 18) step *= 2;
      const [left, top] = toTable(0, 0);
      const [right, bottom] = toTable(width, height);
      ctx.fillStyle = palette.dot;
      const dot = 1.1;
      for (let x = Math.floor(left / step) * step; x <= right; x += step) {
        for (let y = Math.floor(top / step) * step; y <= bottom; y += step) {
          const sx = (x - camera.x) * camera.scale + width / 2;
          const sy = (y - camera.y) * camera.scale + height / 2;
          ctx.fillRect(sx - dot / 2, sy - dot / 2, dot, dot);
        }
      }

      ctx.setTransform(
        dpr * camera.scale,
        0,
        0,
        dpr * camera.scale,
        dpr * (width / 2 - camera.x * camera.scale),
        dpr * (height / 2 - camera.y * camera.scale),
      );
      const lifted = new Set(dragging ?? []);
      const hoverSet = new Set(hovered >= 0 && !dragging ? table.members(hovered) : []);
      for (const i of table.order) {
        const v = table.visual[i];
        ctx.save();
        ctx.translate(v.x, v.y);
        ctx.rotate((v.a * Math.PI) / 180);
        if (lifted.has(i)) {
          ctx.shadowColor = palette.shadow;
          ctx.shadowBlur = 18 * dpr;
          ctx.shadowOffsetY = 6 * dpr;
        }
        ctx.fillStyle = palette.fills[i % FILLS];
        ctx.fill(paths[i], "evenodd");
        ctx.shadowColor = "transparent";
        if (hoverSet.has(i)) {
          ctx.fillStyle = "rgb(255 255 255 / 14%)";
          ctx.fill(paths[i], "evenodd");
        }
        ctx.lineJoin = "round";
        ctx.lineWidth = 1.1 / camera.scale;
        ctx.strokeStyle = palette.edge;
        ctx.stroke(paths[i]);
        const flash = table.flashes.get(i);
        if (flash !== undefined) {
          const fade = 1 - Math.min(1, (now - flash) / FLASH_MS);
          ctx.globalAlpha = fade;
          ctx.lineWidth = 3 / camera.scale;
          ctx.strokeStyle = palette.accent;
          ctx.stroke(paths[i]);
          ctx.globalAlpha = 1;
        }
        ctx.restore();
      }

      const names = labelsRef.current;
      if (names) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        for (const i of table.order) {
          const name = names[i];
          if (!name) continue;
          const v = table.visual[i];
          const shape = table.shapes[i];
          const [lx, ly] = turned(shape.label[0], shape.label[1], v.a);
          const sx = (v.x + lx - camera.x) * camera.scale + width / 2;
          const sy = (v.y + ly - camera.y) * camera.scale + height / 2;
          const size = shape.size * camera.scale < 26 ? 10.5 : 12.5;
          ctx.font = `650 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
          ctx.lineWidth = 3.2;
          ctx.strokeStyle = palette.halo;
          ctx.strokeText(name, sx, sy);
          ctx.fillStyle = palette.ink;
          ctx.fillText(name, sx, sy);
        }
      }

      if (moving) request();
    }

    const resize = (): void => {
      const box = wrap.getBoundingClientRect();
      width = box.width;
      height = box.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      if (width === 0 || height === 0) return;
      if (!table.isPlaced) table.layout(width / height, seed);
      // Framed once; after that a resize (a phone's address bar sliding
      // away, say) keeps the view where the player left it.
      if (!framed) {
        framed = true;
        fit(false, true);
      }
      request();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);

    const scheme = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onScheme = (): void => {
      palette = readPalette(wrap);
      request();
    };
    scheme?.addEventListener?.("change", onScheme);

    // --- pointers ---
    const pointers = new Map<number, { x: number; y: number }>();
    let drag: {
      id: number;
      piece: number;
      startX: number;
      startY: number;
      lastX: number;
      lastY: number;
      moved: boolean;
      touch: boolean;
    } | null = null;
    let pan: { id: number; x: number; y: number } | null = null;
    let pinch: { distance: number; x: number; y: number } | null = null;

    const at = (event: PointerEvent | WheelEvent): { x: number; y: number } => {
      const box = canvas.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top };
    };

    const turn = (piece: number, direction: 1 | -1): void => {
      table.finish(table.members(piece));
      table.bringToFront(piece);
      const members = table.turn(piece, direction, performance.now());
      onActRef.current(members);
      request();
    };

    const pinchState = (): { distance: number; x: number; y: number } => {
      const [a, b] = [...pointers.values()];
      return { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    };

    const endDrag = (): void => {
      if (!drag) return;
      const members = table.members(drag.piece);
      if (drag.moved) onActRef.current(members);
      else if (drag.touch && interactiveRef.current) turn(drag.piece, 1);
      drag = null;
      dragging = null;
      request();
    };

    const onDown = (event: PointerEvent): void => {
      const point = at(event);
      canvas.setPointerCapture?.(event.pointerId);
      pointers.set(event.pointerId, point);
      // Focus lets R and Q turn the piece under a mouse; a finger has no use for it.
      if (event.pointerType === "mouse") canvas.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
      if (pointers.size === 2) {
        // A second finger turns a drag into a pinch; the piece stays where it was put.
        if (drag?.moved) onActRef.current(table.members(drag.piece));
        drag = null;
        dragging = null;
        pan = null;
        pinch = pinchState();
        request();
        return;
      }
      if (pointers.size > 2) return;
      const [wx, wy] = toTable(point.x, point.y);
      const touch = event.pointerType !== "mouse";
      const piece = table.hit(wx, wy, (touch ? TOUCH_SLOP_PX : 2) / camera.scale);
      // The other button turns clockwise, the middle one back (as does Shift).
      if (event.button === 2 || event.button === 1) {
        event.preventDefault();
        const back = event.button === 1 || event.shiftKey;
        if (piece >= 0 && interactiveRef.current) turn(piece, back ? -1 : 1);
        return;
      }
      if (event.button !== 0) return;
      if (piece >= 0 && interactiveRef.current) {
        table.finish(table.members(piece));
        table.bringToFront(piece);
        drag = { id: event.pointerId, piece, startX: point.x, startY: point.y, lastX: point.x, lastY: point.y, moved: false, touch };
        dragging = table.members(piece);
        canvas.style.cursor = "grabbing";
      } else {
        pan = { id: event.pointerId, x: point.x, y: point.y };
      }
      request();
    };

    const onMove = (event: PointerEvent): void => {
      const point = at(event);
      if (pointers.has(event.pointerId)) pointers.set(event.pointerId, point);
      if (pinch && pointers.size === 2) {
        const next = pinchState();
        camera.x -= (next.x - pinch.x) / camera.scale;
        camera.y -= (next.y - pinch.y) / camera.scale;
        zoomAt(next.x, next.y, next.distance / Math.max(1, pinch.distance));
        pinch = next;
        return;
      }
      if (drag && event.pointerId === drag.id) {
        if (!drag.moved && Math.hypot(point.x - drag.startX, point.y - drag.startY) > DRAG_PX) drag.moved = true;
        if (drag.moved) {
          table.moveBy(drag.piece, (point.x - drag.lastX) / camera.scale, (point.y - drag.lastY) / camera.scale);
          drag.lastX = point.x;
          drag.lastY = point.y;
          request();
        }
        return;
      }
      if (pan && event.pointerId === pan.id) {
        camera.x -= (point.x - pan.x) / camera.scale;
        camera.y -= (point.y - pan.y) / camera.scale;
        pan = { ...pan, x: point.x, y: point.y };
        cameraMove = null;
        request();
        return;
      }
      if (event.pointerType === "mouse" && pointers.size === 0) {
        const [wx, wy] = toTable(point.x, point.y);
        const piece = interactiveRef.current ? table.hit(wx, wy, 2 / camera.scale) : -1;
        if (piece !== hovered) {
          hovered = piece;
          canvas.style.cursor = piece >= 0 ? "grab" : "";
          request();
        }
      }
    };

    const onUp = (event: PointerEvent): void => {
      pointers.delete(event.pointerId);
      if (drag && event.pointerId === drag.id) {
        endDrag();
        canvas.style.cursor = hovered >= 0 ? "grab" : "";
      }
      if (pan?.id === event.pointerId) pan = null;
      if (pinch && pointers.size < 2) {
        pinch = null;
        const [rest] = [...pointers.entries()];
        if (rest) pan = { id: rest[0], x: rest[1].x, y: rest[1].y };
      }
    };

    const onLeave = (): void => {
      if (hovered >= 0 && pointers.size === 0) {
        hovered = -1;
        canvas.style.cursor = "";
        request();
      }
    };

    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const point = at(event);
      const speed = event.deltaMode === 1 ? 0.05 : 0.0018;
      zoomAt(point.x, point.y, Math.exp(-event.deltaY * speed));
    };

    const onKey = (event: KeyboardEvent): void => {
      if (!interactiveRef.current || hovered < 0) return;
      if (event.key === "r" || event.key === "R" || event.key === "e" || event.key === "E") turn(hovered, 1);
      else if (event.key === "q" || event.key === "Q") turn(hovered, -1);
    };

    const onContext = (event: Event): void => event.preventDefault();
    // A middle press would otherwise start the browser's autoscroll.
    const onMouseDown = (event: MouseEvent): void => {
      if (event.button === 1) event.preventDefault();
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("keydown", onKey);
    canvas.addEventListener("contextmenu", onContext);
    canvas.addEventListener("mousedown", onMouseDown);
    const unsubscribe = table.subscribe(request);

    api.current = { fit, draw: request };
    resize();

    return () => {
      observer.disconnect();
      scheme?.removeEventListener?.("change", onScheme);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("keydown", onKey);
      canvas.removeEventListener("contextmenu", onContext);
      canvas.removeEventListener("mousedown", onMouseDown);
      unsubscribe();
      if (frame) cancelAnimationFrame(frame);
      api.current = null;
    };
  }, [table, seed]);

  // Labels come and go with hard mode; the canvas needs telling.
  useEffect(() => {
    api.current?.draw();
  }, [labels]);

  useEffect(() => {
    if (fitSignal > 0) api.current?.fit(true);
  }, [fitSignal]);

  // At the end, follow the map home and frame it.
  useEffect(() => {
    if (!over) return;
    const id = window.setTimeout(() => api.current?.fit(true, true), 320);
    return () => window.clearTimeout(id);
  }, [over]);

  return (
    <div className="table" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="table__canvas"
        tabIndex={0}
        role="img"
        aria-label={label}
      />
    </div>
  );
}
