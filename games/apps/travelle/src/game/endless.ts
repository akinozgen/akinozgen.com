import { readJson, writeJson } from "@travelle/core";
import { guessBudget } from "@travelle/geo";
import { useCallback, useMemo, useState } from "react";
import { graph, type Puzzle } from "./puzzle.ts";

/** Continent names as Natural Earth spells them, in the order they're shown. */
export const CONTINENTS = [
  "Europe",
  "Asia",
  "Africa",
  "North America",
  "South America",
  "Oceania",
] as const;

export interface EndlessSettings {
  /** Continents left on the map. Everything else is lifted off it entirely. */
  continents: string[];
  /** Individual countries removed, whatever their continent. */
  excluded: string[];
  minLength: number;
  maxLength: number;
}

export const defaultSettings: EndlessSettings = {
  continents: [...CONTINENTS],
  excluded: [],
  minLength: 3,
  maxLength: 8,
};

const SETTINGS_KEY = "travle:endless:settings:v1";
const RUN_KEY = "travle:endless:run:v1";
export const ENDLESS_STATS_KEY = "travle:endless:stats:v1";

interface Run {
  seed: number;
  round: number;
}

/** mulberry32 — the same puzzle comes back after a reload. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Endless {
  settings: EndlessSettings;
  update: (patch: Partial<EndlessSettings>) => void;
  reset: () => void;
  /** The map as filtered, ready to play on. */
  map: ReturnType<typeof graph.withOnly>;
  /** Null when the filter leaves no pair at the requested difficulty. */
  puzzle: Puzzle | null;
  round: number;
  next: () => void;
  inPlay: number;
  longest: number;
}

export function useEndless(): Endless {
  const [settings, setSettings] = useState<EndlessSettings>(
    () => ({ ...defaultSettings, ...readJson<EndlessSettings>(SETTINGS_KEY) }),
  );
  const [run, setRun] = useState<Run>(
    () => readJson<Run>(RUN_KEY) ?? { seed: (Math.random() * 2 ** 32) >>> 0, round: 1 },
  );

  const allowed = useMemo(() => {
    const continents = new Set(settings.continents);
    const excluded = new Set(settings.excluded);
    return graph
      .playableRegions()
      .filter((r) => continents.has(r.continent) && !excluded.has(r.id))
      .map((r) => r.id);
  }, [settings.continents, settings.excluded]);

  const map = useMemo(() => graph.withOnly(allowed), [allowed]);
  const inPlay = useMemo(() => map.playableRegions().length, [map]);
  const longest = useMemo(() => map.longestRoute(), [map]);

  const puzzle = useMemo<Puzzle | null>(() => {
    const pair = map.randomPair(rng(run.seed), settings.minLength, settings.maxLength);
    if (!pair) return null;
    return {
      id: `endless:${run.seed}`,
      kind: "endless",
      number: run.round,
      scope:
        settings.continents.length === CONTINENTS.length ? undefined : [...settings.continents],
      start: pair.start,
      end: pair.end,
      shortest: pair.shortest,
      budget: guessBudget(pair.shortest),
    };
  }, [map, run, settings.minLength, settings.maxLength, settings.continents]);

  const store = useCallback((next: Run) => {
    setRun(next);
    writeJson(RUN_KEY, next);
  }, []);

  const update = useCallback(
    (patch: Partial<EndlessSettings>) => {
      setSettings((current) => {
        const next = { ...current, ...patch };
        if (next.maxLength < next.minLength) {
          // Dragging one end past the other pushes the other along.
          if (patch.minLength !== undefined) next.maxLength = next.minLength;
          else next.minLength = next.maxLength;
        }
        writeJson(SETTINGS_KEY, next);
        return next;
      });
      // A different map means a different puzzle; keep the round count going.
      setRun((current) => {
        const next = { seed: (Math.random() * 2 ** 32) >>> 0, round: current.round };
        writeJson(RUN_KEY, next);
        return next;
      });
    },
    [],
  );

  const reset = useCallback(() => {
    setSettings(defaultSettings);
    writeJson(SETTINGS_KEY, defaultSettings);
    store({ seed: (Math.random() * 2 ** 32) >>> 0, round: run.round });
  }, [store, run.round]);

  const next = useCallback(() => {
    store({ seed: (Math.random() * 2 ** 32) >>> 0, round: run.round + 1 });
  }, [store, run.round]);

  return { settings, update, reset, map, puzzle, round: run.round, next, inPlay, longest };
}
