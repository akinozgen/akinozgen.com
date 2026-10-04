import { COLUMNS, TILES } from "@vexle/data/client";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "../i18n/index.tsx";

/**
 * The flag, three by two. Covered tiles flip over as they are earned; when
 * the round ends the seams close and the flag stands whole.
 */
export function FlagBoard({
  tiles,
  opened,
  whole,
  flag = null,
  children,
}: {
  /** Per grid position: the tile image, or null while covered. */
  tiles: ReadonlyArray<string | null>;
  /** Grid positions in the order they opened. */
  opened: readonly number[];
  whole: boolean;
  /** The finished flag as one image, laid over the tiles once their seams close. */
  flag?: string | null;
  /** Laid over the board — the compass. */
  children?: React.ReactNode;
}): React.ReactElement {
  const { t } = useLocale();

  // Tiles already open on arrival appear open; only ones earned now flip.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Several tiles opening at once (the end of a round) flip one after another.
  const seen = useRef<Set<number>>(new Set(opened));
  const [delays, setDelays] = useState<Record<number, number>>({});
  useEffect(() => {
    const fresh = opened.filter((position) => !seen.current.has(position));
    if (fresh.length === 0) return;
    setDelays(Object.fromEntries(fresh.map((position, i) => [position, i * 110])));
    for (const position of fresh) seen.current.add(position);
  }, [opened]);

  const latest = opened[opened.length - 1];

  return (
    <div className={`board${whole ? " is-whole" : ""}${ready ? " is-ready" : ""}`}>
      <div className="board__grid" style={{ gridTemplateColumns: `repeat(${COLUMNS}, 1fr)` }}>
        {Array.from({ length: TILES }, (_, position) => {
          const image = tiles[position];
          const open = image !== null && image !== undefined;
          return (
            <div
              key={position}
              className={`tile${open ? " is-open" : ""}${open && position === latest && !whole ? " is-latest" : ""}`}
              role="img"
              aria-label={t(open ? "tileOpen" : "tileCovered", { n: position + 1 })}
            >
              <div className="tile__inner" style={{ transitionDelay: `${delays[position] ?? 0}ms` }}>
                <div className="tile__front">
                  <span className="tile__number">{position + 1}</span>
                </div>
                <div
                  className="tile__back"
                  style={open ? { backgroundImage: `url("${image}")` } : undefined}
                />
              </div>
            </div>
          );
        })}
        {whole && flag && <img className="board__flag" src={flag} alt="" />}
      </div>
      {children}
    </div>
  );
}
