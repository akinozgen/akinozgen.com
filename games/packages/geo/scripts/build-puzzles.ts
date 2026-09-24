import { writeFile } from "node:fs/promises";
import { BorderGraph } from "../src/graph.ts";
import type { GeoData } from "../src/types.ts";
import geo from "../data/geo.json" with { type: "json" };

/** First puzzle day, as an ISO date. Day 0 of the schedule. */
const EPOCH = "2026-01-01";
/** How many days to schedule ahead. */
const DAYS = 366 * 8;
/** A pair may not come round again inside this many days. */
const PAIR_COOLDOWN = 366 * 4;

/**
 * Difficulty mix. Each entry is a shortest-solution length; the bag is drawn
 * from without replacement and reshuffled when empty, so a fortnight never
 * turns out to be all three-country hops or all ten-country treks.
 */
const LENGTH_BAG = [3, 3, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 7, 7, 8, 8, 9, 10, 11, 12];

export interface Puzzle {
  start: string;
  end: string;
  /** Shortest solution length, which fixes the guess budget. */
  shortest: number;
}

/** mulberry32 — small, fast, and identical across runs. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function main(): Promise<void> {
  const graph = new BorderGraph(geo as unknown as GeoData);
  const playable = graph.playableRegions().map((r) => r.id);
  const isPlayable = new Set(playable);

  // Every pair worth playing, grouped by how many guesses it needs.
  const byLength = new Map<number, Array<[string, string]>>();
  for (const from of playable) {
    for (const [to, cost] of graph.distancesFrom(from)) {
      if (from >= to || !isPlayable.has(to)) continue;
      if (cost < 3 || cost > 14) continue;
      const bucket = byLength.get(cost);
      if (bucket) bucket.push([from, to]);
      else byLength.set(cost, [[from, to]]);
    }
  }

  // Solving a pair is the expensive part, and the scheduler revisits pairs a
  // lot while it hunts for one that fits the week.
  const routes = new Map<string, string[]>();
  const routeOf = (a: string, b: string): string[] => {
    const key = `${a}|${b}`;
    let route = routes.get(key);
    if (!route) {
      route = graph.solve(a, b).path;
      routes.set(key, route);
    }
    return route;
  };

  const random = rng(0x7a4e1e);
  const pools = new Map(
    [...byLength].map(([length, pairs]) => [length, shuffle(pairs, random)] as const),
  );
  const cursor = new Map([...pools.keys()].map((k) => [k, 0]));
  const lastUsed = new Map<string, number>();
  const weekBlocked = new Map<number, Set<string>>();

  let bag: number[] = [];
  const nextLength = (): number => {
    if (bag.length === 0) bag = shuffle(LENGTH_BAG, random);
    return bag.pop()!;
  };

  const puzzles: Puzzle[] = [];
  const skipped: string[] = [];

  for (let day = 0; day < DAYS; day++) {
    const week = Math.floor(day / 7);
    let blocked = weekBlocked.get(week);
    if (!blocked) {
      blocked = new Set();
      weekBlocked.set(week, blocked);
    }

    let chosen: Puzzle | null = null;
    // Try the drawn length first, then neighbouring lengths, so a thin bucket
    // shifts the day's difficulty rather than leaving a gap in the calendar.
    const wanted = nextLength();
    const order = [...pools.keys()].sort(
      (a, b) => Math.abs(a - wanted) - Math.abs(b - wanted) || a - b,
    );

    // Ideally a week repeats no country at all, not even mid-route. Long
    // puzzles block a third of the map at a time though, so the rule is
    // relaxed a step at a time rather than leaving the day empty.
    for (const strictness of ["route", "endpoints", "none"] as const) {
      for (const length of order) {
        const pool = pools.get(length)!;
        const start = cursor.get(length)!;
        for (let step = 0; step < pool.length; step++) {
          const index = (start + step) % pool.length;
          const [a, b] = pool[index];
          const key = `${a}|${b}`;
          if ((lastUsed.get(key) ?? -Infinity) > day - PAIR_COOLDOWN) continue;
          if (strictness !== "none" && (blocked.has(a) || blocked.has(b))) continue;
          const solution = routeOf(a, b);
          if (solution.length !== length) continue;
          if (strictness === "route" && solution.some((id) => blocked.has(id))) continue;

          chosen = { start: a, end: b, shortest: length };
          lastUsed.set(key, day);
          cursor.set(length, index + 1);
          for (const id of [a, b, ...solution]) blocked.add(id);
          break;
        }
        if (chosen) break;
      }
      if (chosen) break;
    }

    if (!chosen) {
      skipped.push(String(day));
      continue;
    }
    puzzles.push(chosen);
  }

  const spread = new Map<number, number>();
  for (const p of puzzles) spread.set(p.shortest, (spread.get(p.shortest) ?? 0) + 1);

  await writeFile(
    new URL("../data/puzzles.json", import.meta.url),
    JSON.stringify({ epoch: EPOCH, puzzles }),
  );

  console.log(`pairs available: ${[...byLength.values()].reduce((n, p) => n + p.length, 0)}`);
  console.log(`scheduled ${puzzles.length} days from ${EPOCH}` + (skipped.length ? ` (${skipped.length} unfilled)` : ""));
  console.log(
    "length spread: " +
      [...spread].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(" "),
  );
  console.log("first week: " + puzzles.slice(0, 7).map((p) => `${p.start}->${p.end}(${p.shortest})`).join(", "));
}

await main();
