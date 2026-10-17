import { JOKER } from "@harfiyen/engine";
import { Tile, tileName } from "./Tile.tsx";

/** The player's seven tiles. Tap one to pick it up, then a square to put it down; or drag. */
export function Rack({
  view,
  free,
  selected,
  dragging,
  values,
  size,
  onTap,
}: {
  view: readonly number[];
  /** Slots still on the rack, in order. */
  free: readonly number[];
  selected: number | null;
  dragging: number | null;
  values: readonly number[];
  size: number;
  onTap: (slot: number) => void;
}): React.ReactElement {
  return (
    <div className="rack" data-rack="" role="group" aria-label="Harflerin">
      {free.map((slot, i) => {
        const tile = view[slot];
        const joker = tile === JOKER;
        const value = joker ? 0 : values[tile];
        return (
          <button
            key={`${slot}-${tile}`}
            type="button"
            data-slot={slot}
            className={`rack__slot${selected === slot ? " is-picked" : ""}${dragging === slot ? " is-lifted" : ""}`}
            style={{ animationDelay: `${i * 35}ms` }}
            aria-pressed={selected === slot}
            aria-label={tileName(joker ? -1 : tile, joker, value)}
            onClick={() => onTap(slot)}
          >
            <Tile letter={joker ? -1 : tile} joker={joker} value={value} />
          </button>
        );
      })}
      {Array.from({ length: Math.max(0, size - free.length) }, (_, i) => (
        <span key={`gap-${i}`} className="rack__gap" aria-hidden="true" />
      ))}
    </div>
  );
}
