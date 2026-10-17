import { JOKER } from "@harfiyen/engine";
import { useCallback, useRef, useState } from "react";
import type { PlayApi } from "../game/useHand.ts";

/** A tile in flight under the pointer, from the rack or from the board. */
export interface Lift {
  from: { slot: number } | { square: number };
  letter: number;
  joker: boolean;
  x: number;
  y: number;
  startX: number;
  startY: number;
  moved: boolean;
  over: number | null;
  /** A finger: the tile floats above it, and lands where the tile is, not under the finger. */
  touch: boolean;
}

/** How far above a finger a dragged tile rides, so the square it's going to stays in sight. */
export const FINGER_LIFT = 46;

const aimY = (lift: Pick<Lift, "touch">, y: number): number => (lift.touch ? y - FINGER_LIFT : y);

/** How close to a zoomed board's edge a tile must be to pan it, and how far it pans per frame. */
const EDGE = 28;
const PAN_STEP = 6;

const squareUnder = (x: number, y: number): number | null => {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-square]");
  return el ? Number(el.dataset.square) : null;
};

/**
 * Dragging tiles: from the rack to a square, between squares, back to the
 * rack, or along the rack to rearrange it. A press that doesn't travel is
 * left to the click that follows it.
 */
export function useDrag(api: PlayApi, onJoker: (square: number) => void) {
  const [lift, setLift] = useState<Lift | null>(null);
  const current = useRef<Lift | null>(null);
  const dragged = useRef(false);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      const el = (event.target as Element).closest<HTMLElement>("[data-slot],[data-draft]");
      if (!el) return;
      let from: Lift["from"];
      let letter: number;
      let joker: boolean;
      if (el.dataset.slot !== undefined) {
        const slot = Number(el.dataset.slot);
        const tile = api.view[slot];
        from = { slot };
        joker = tile === JOKER;
        letter = joker ? -1 : tile;
      } else {
        const square = Number(el.dataset.draft);
        const entry = api.draft.find((d) => d.square === square);
        if (!entry) return;
        from = { square };
        letter = entry.letter;
        joker = entry.joker;
      }
      current.current = {
        from,
        letter,
        joker,
        x: event.clientX,
        y: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        over: null,
        touch: event.pointerType === "touch" || event.pointerType === "pen",
      };
      dragged.current = false;

      // On a zoomed board, a tile held near the window's edge pans the board that way.
      let pan = 0;
      const edgePan = (): void => {
        pan = 0;
        const lifted = current.current;
        const frame = document.querySelector<HTMLElement>(".frame.is-zoomed");
        if (!lifted?.moved || !frame) return;
        const box = frame.getBoundingClientRect();
        const y = aimY(lifted, lifted.y);
        const dx = lifted.x < box.left + EDGE ? -PAN_STEP : lifted.x > box.right - EDGE ? PAN_STEP : 0;
        const dy = y < box.top + EDGE && y > box.top - EDGE ? -PAN_STEP : y > box.bottom - EDGE && y < box.bottom + EDGE ? PAN_STEP : 0;
        if (dx === 0 && dy === 0) return;
        frame.scrollBy(dx, dy);
        const next = { ...lifted, over: squareUnder(lifted.x, y) };
        current.current = next;
        setLift(next);
        pan = requestAnimationFrame(edgePan);
      };

      const move = (e: PointerEvent): void => {
        const lifted = current.current;
        if (!lifted) return;
        const moved = lifted.moved || Math.hypot(e.clientX - lifted.startX, e.clientY - lifted.startY) > 6;
        if (!moved) return;
        e.preventDefault();
        const next = { ...lifted, x: e.clientX, y: e.clientY, moved, over: squareUnder(e.clientX, aimY(lifted, e.clientY)) };
        current.current = next;
        setLift(next);
        if (pan === 0) pan = requestAnimationFrame(edgePan);
      };
      const up = (e: PointerEvent): void => {
        cancelAnimationFrame(pan);
        pan = 0;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        const lifted = current.current;
        current.current = null;
        setLift(null);
        if (!lifted?.moved || e.type === "pointercancel") return;
        dragged.current = true;
        window.setTimeout(() => (dragged.current = false), 0);
        // Rack slots are judged under the finger itself; squares under the tile.
        const target = document.elementFromPoint(e.clientX, e.clientY);
        const square = squareUnder(e.clientX, aimY(lifted, e.clientY));
        const slotEl = target?.closest<HTMLElement>("[data-slot]");
        const onRack = !!target?.closest("[data-rack]");
        if ("slot" in lifted.from) {
          if (square !== null) {
            const placed = api.place(lifted.from.slot, square);
            if (placed?.joker) onJoker(square);
          } else if (slotEl) {
            api.reorder(lifted.from.slot, Number(slotEl.dataset.slot));
          }
        } else if (square !== null && square !== lifted.from.square) {
          api.move(lifted.from.square, square);
        } else if (onRack || square === null) {
          api.recall(lifted.from.square);
        }
      };
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    },
    [api, onJoker],
  );

  return { lift, onPointerDown, wasDrag: () => dragged.current };
}
