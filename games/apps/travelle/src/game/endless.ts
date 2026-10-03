import { readJson, writeJson } from "@travelle/core";
import { CONTINENTS, continentMask } from "@travelle/geo/client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchEndless } from "./api.ts";
import { fromEndless, type Puzzle } from "./puzzle.ts";
import { mapSummary, PLAYABLE } from "./regions.ts";

export { CONTINENTS };

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

const freshSeed = (): number => (Math.random() * 2 ** 32) >>> 0;

export interface Endless {
  settings: EndlessSettings;
  update: (patch: Partial<EndlessSettings>) => void;
  reset: () => void;
  /** Countries that can still be named on the map as filtered. */
  allowed: string[];
  /** Null while loading, or when the filter leaves no pair at the requested difficulty. */
  puzzle: Puzzle | null;
  loading: boolean;
  failed: boolean;
  retry: () => void;
  round: number;
  next: () => void;
  inPlay: number;
  longest: number;
}

export function useEndless(active: boolean): Endless {
  const [settings, setSettings] = useState<EndlessSettings>(
    () => ({ ...defaultSettings, ...readJson<EndlessSettings>(SETTINGS_KEY) }),
  );
  const [run, setRun] = useState<Run>(
    () => readJson<Run>(RUN_KEY) ?? { seed: freshSeed(), round: 1 },
  );
  const [served, setServed] = useState<{ puzzle: Puzzle | null; inPlay: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const mask = continentMask(settings.continents);

  const allowed = useMemo(() => {
    const continents = new Set(settings.continents);
    const excluded = new Set(settings.excluded);
    return PLAYABLE.filter((r) => continents.has(r.continent) && !excluded.has(r.id)).map(
      (r) => r.id,
    );
  }, [settings.continents, settings.excluded]);

  // The server draws the round: only it knows which countries connect.
  useEffect(() => {
    if (!active) return;
    let live = true;
    setServed(null);
    setFailed(false);
    const scope =
      settings.continents.length === CONTINENTS.length ? undefined : [...settings.continents];
    fetchEndless({
      seed: run.seed,
      mask,
      excluded: settings.excluded,
      min: settings.minLength,
      max: settings.maxLength,
    })
      .then((reply) => {
        if (!live) return;
        setServed({
          inPlay: reply.inPlay,
          puzzle: reply.puzzle && fromEndless(reply.puzzle, run.round, run.seed, scope),
        });
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [run, mask, settings.continents, settings.excluded, settings.minLength, settings.maxLength, attempt, active]);

  const store = useCallback((next: Run) => {
    setRun(next);
    writeJson(RUN_KEY, next);
  }, []);

  const update = useCallback((patch: Partial<EndlessSettings>) => {
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
      const next = { seed: freshSeed(), round: current.round };
      writeJson(RUN_KEY, next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setSettings(defaultSettings);
    writeJson(SETTINGS_KEY, defaultSettings);
    store({ seed: freshSeed(), round: run.round });
  }, [store, run.round]);

  const next = useCallback(() => {
    store({ seed: freshSeed(), round: run.round + 1 });
  }, [store, run.round]);

  const summary = mapSummary(mask);

  return {
    settings,
    update,
    reset,
    allowed,
    puzzle: served?.puzzle ?? null,
    loading: served === null && !failed,
    failed,
    retry: () => setAttempt((n) => n + 1),
    round: run.round,
    next,
    inPlay: served?.inPlay ?? summary.inPlay,
    longest: summary.longest,
  };
}
