import type { GeoData, Region } from "./types.ts";

export interface Solution {
  /** Region ids that must still be named, in path order. Excludes start and end. */
  path: string[];
  /** path.length — the number of guesses still required. */
  cost: number;
}

const UNREACHABLE: Solution = { path: [], cost: Infinity };

/**
 * The playable border graph.
 *
 * Nodes are areas (contiguous landmasses), not regions: that is what keeps
 * Kaliningrad from joining Poland to mainland Russia. Naming a region unlocks
 * every one of its areas at once, so the cost of a route is the number of
 * distinct regions it names, not the number of areas it crosses.
 */
export class BorderGraph {
  readonly regions: Region[];
  readonly regionIndex: ReadonlyMap<string, number>;

  /** areaAdjacency[area] = neighbouring areas */
  private readonly adjacency: number[][];
  /** areaRegion[area] = index into regions */
  private readonly areaRegion: number[];
  private readonly data: GeoData;

  constructor(data: GeoData) {
    this.data = data;
    this.regions = data.regions;
    this.regionIndex = new Map(data.regions.map((r, i) => [r.id, i]));
    this.areaRegion = data.areas.map((a) => this.regionIndex.get(a.regionId)!);
    this.adjacency = data.areas.map(() => []);
    for (const edge of data.edges) {
      this.adjacency[edge.a].push(edge.b);
      this.adjacency[edge.b].push(edge.a);
    }
  }

  region(id: string): Region {
    const index = this.regionIndex.get(id);
    if (index === undefined) throw new Error(`unknown region: ${id}`);
    return this.regions[index];
  }

  /**
   * Regions sharing a border with this one — every country a route could step
   * into from here. Exclaves count, so Spain neighbours Morocco through Ceuta
   * even though no route crosses from the mainland.
   */
  neighbours(regionId: string): string[] {
    const found = new Set<string>();
    for (const area of this.region(regionId).areas) {
      for (const next of this.adjacency[area]) {
        const id = this.regions[this.areaRegion[next]].id;
        if (id !== regionId) found.add(id);
      }
    }
    return [...found].sort();
  }

  /** Regions that can appear in a puzzle or a route at all. */
  playableRegions(): Region[] {
    return this.regions.filter((r) => !r.isolated);
  }

  /**
   * The same world with some countries lifted off it: their borders stop
   * existing, so they are neither endpoints nor stepping stones. Area
   * numbering is left alone so map geometry still resolves by the same index.
   *
   * Anything cut off by the removal — Africa, once Egypt goes — is marked
   * isolated in turn, which keeps puzzle generation inside what is reachable.
   */
  withOnly(allowed: Iterable<string>): BorderGraph {
    const keep = new Set(allowed);
    const inPlay = (area: number): boolean =>
      keep.has(this.data.areas[area].regionId) &&
      !this.regions[this.areaRegion[area]].isolated;

    const edges = this.data.edges.filter((e) => inPlay(e.a) && inPlay(e.b));
    const neighbours = new Map<string, number>();
    for (const e of edges) {
      const ra = this.data.areas[e.a].regionId;
      const rb = this.data.areas[e.b].regionId;
      if (ra !== rb) {
        neighbours.set(ra, (neighbours.get(ra) ?? 0) + 1);
        neighbours.set(rb, (neighbours.get(rb) ?? 0) + 1);
      }
    }

    const regions = this.regions.map((region) =>
      region.isolated || !keep.has(region.id) || !neighbours.has(region.id)
        ? { ...region, isolated: true }
        : region,
    );
    return new BorderGraph({ regions, areas: this.data.areas, edges });
  }

  /**
   * A start and end that are `min`..`max` guesses apart, or null if the map
   * as filtered has no such pair. Each attempt is one sweep from a random
   * country, so a heavily cut-down map costs no more than a full one.
   */
  randomPair(
    random: () => number,
    min: number,
    max: number,
    attempts = 60,
  ): { start: string; end: string; shortest: number } | null {
    const playable = this.playableRegions();
    if (playable.length < 2) return null;

    for (let attempt = 0; attempt < attempts; attempt++) {
      const start = playable[Math.floor(random() * playable.length)];
      const reachable: Array<[string, number]> = [];
      for (const [id, cost] of this.distancesFrom(start.id)) {
        if (cost >= min && cost <= max && !this.region(id).isolated) {
          reachable.push([id, cost]);
        }
      }
      // distancesFrom charges per area entered, which can overshoot when a
      // route re-enters a country through a second exclave. solve() is the
      // authority, so the candidate is confirmed before it is handed back.
      for (let tries = 0; tries < 8 && reachable.length > 0; tries++) {
        const pick = Math.floor(random() * reachable.length);
        const [end] = reachable[pick];
        reachable.splice(pick, 1);
        const shortest = this.solve(start.id, end).cost;
        if (shortest >= min && shortest <= max) return { start: start.id, end, shortest };
      }
    }
    return null;
  }

  /** The longest shortest-route on this map, to show what difficulty is possible. */
  longestRoute(): number {
    let longest = 0;
    for (const region of this.playableRegions()) {
      for (const cost of this.distancesFrom(region.id).values()) {
        if (cost > longest) longest = cost;
      }
    }
    return longest;
  }

  private componentCache: string[][] | null = null;

  /**
   * Land-connected groups of regions, largest first. There is more than one:
   * no land route joins the Americas to Afro-Eurasia, so a puzzle has to keep
   * both of its endpoints inside a single component.
   */
  components(): string[][] {
    if (this.componentCache) return this.componentCache;
    const visited = new Uint8Array(this.adjacency.length);
    const found: string[][] = [];
    for (let seed = 0; seed < this.adjacency.length; seed++) {
      if (visited[seed]) continue;
      const members = new Set<string>();
      const stack = [seed];
      visited[seed] = 1;
      while (stack.length) {
        const area = stack.pop()!;
        members.add(this.regions[this.areaRegion[area]].id);
        for (const next of this.adjacency[area]) {
          if (visited[next]) continue;
          visited[next] = 1;
          stack.push(next);
        }
      }
      found.push([...members]);
    }
    // A region straddling two components (it cannot, given areas are the nodes)
    // would break this, so components stay disjoint by construction.
    this.componentCache = found.filter((c) => c.length > 1).sort((a, b) => b.length - a.length);
    return this.componentCache;
  }

  /** The component holding `regionId`, or an empty array if it is isolated. */
  componentOf(regionId: string): string[] {
    return this.components().find((c) => c.includes(regionId)) ?? [];
  }

  /**
   * Guesses needed from `from` to every reachable region, in one sweep.
   * Unreachable regions are left out.
   *
   * This charges once per area entered, so it is an upper bound rather than
   * the final answer: a route that leaves a country and comes back through a
   * second exclave pays twice here and once in `solve`. Use it to narrow the
   * field cheaply, then confirm with `solve`.
   */
  distancesFrom(from: string): Map<string, number> {
    const free = this.freeMask([from]);
    const { dist } = this.search(this.region(from).areas, free);
    const out = new Map<string, number>();
    for (let area = 0; area < dist.length; area++) {
      if (dist[area] === 0x7fffffff) continue;
      const id = this.regions[this.areaRegion[area]].id;
      if (id === from) continue;
      // The last step pays for the destination, which the player is given.
      const cost = dist[area] - 1;
      const seen = out.get(id);
      if (seen === undefined || cost < seen) out.set(id, cost);
    }
    return out;
  }

  private freeMask(free: Iterable<string>): Uint8Array {
    const mask = new Uint8Array(this.regions.length);
    for (const id of free) {
      const index = this.regionIndex.get(id);
      if (index !== undefined) mask[index] = 1;
    }
    return mask;
  }

  /**
   * 0-1 BFS over areas. Entering an area costs nothing when its region is
   * already free, and one guess otherwise. Returns the predecessor tree so a
   * route can be read back.
   */
  private search(sources: number[], free: Uint8Array): { dist: Int32Array; prev: Int32Array } {
    const n = this.adjacency.length;
    const dist = new Int32Array(n).fill(0x7fffffff);
    const prev = new Int32Array(n).fill(-1);
    // Bucket queue: costs only ever grow by 0 or 1, so two ends of a deque suffice.
    const deque: number[] = [];
    for (const s of sources) {
      dist[s] = 0;
      deque.push(s);
    }
    let head = 0;
    while (head < deque.length) {
      const area = deque[head++];
      const d = dist[area];
      for (const next of this.adjacency[area]) {
        const weight = free[this.areaRegion[next]] ? 0 : 1;
        if (d + weight < dist[next]) {
          dist[next] = d + weight;
          prev[next] = area;
          if (weight === 0) {
            // Zero-cost hop: process before anything more expensive.
            deque.splice(head, 0, next);
          } else {
            deque.push(next);
          }
        }
      }
    }
    return { dist, prev };
  }

  private routeRegions(target: number, prev: Int32Array, free: Uint8Array): string[] {
    const out: string[] = [];
    const seen = new Set<number>();
    for (let area = target; area !== -1; area = prev[area]) {
      const region = this.areaRegion[area];
      if (!free[region] && !seen.has(region)) {
        seen.add(region);
        out.push(this.regions[region].id);
      }
    }
    return out.reverse();
  }

  /**
   * Fewest further guesses needed to link `start` to `end`, treating every
   * region in `guessed` as already named.
   *
   * The 0-1 BFS charges once per area entered, which over-counts a route that
   * leaves a region and comes back through a second exclave. Counting the
   * distinct regions on the recovered route fixes that, and re-running with
   * those regions free lets the search find the cheaper route it implies.
   */
  solve(start: string, end: string, guessed: Iterable<string> = []): Solution {
    const base = [start, end, ...guessed];
    const free = this.freeMask(base);
    const sources = this.region(start).areas;
    const endAreas = new Set(this.region(end).areas);

    let best: Solution = UNREACHABLE;
    let extra: string[] = [];
    for (let pass = 0; pass < 3; pass++) {
      const mask = pass === 0 ? free : this.freeMask([...base, ...extra]);
      const { dist, prev } = this.search(sources, mask);
      let target = -1;
      let targetDist = 0x7fffffff;
      for (const area of endAreas) {
        if (dist[area] < targetDist) {
          targetDist = dist[area];
          target = area;
        }
      }
      if (target === -1 || targetDist === 0x7fffffff) return best;
      const path = this.routeRegions(target, prev, free);
      if (path.length >= best.cost) return best;
      best = { path, cost: path.length };
      if (path.length === targetDist) return best; // no over-count to unwind
      extra = path;
    }
    return best;
  }

  /** Cheapest solution whose route is forced through `via`. */
  solveThrough(start: string, end: string, guessed: Iterable<string>, via: string): Solution {
    const base = [start, end, via, ...guessed];
    const free = this.freeMask(base);
    const viaAreas = new Set(this.region(via).areas);

    const pick = (from: string): { path: string[]; area: number } | null => {
      const { dist, prev } = this.search(this.region(from).areas, free);
      let target = -1;
      let targetDist = 0x7fffffff;
      for (const area of viaAreas) {
        if (dist[area] < targetDist) {
          targetDist = dist[area];
          target = area;
        }
      }
      if (target === -1 || targetDist === 0x7fffffff) return null;
      return { path: this.routeRegions(target, prev, free), area: target };
    };

    const head = pick(start);
    const tail = pick(end);
    if (!head || !tail) return UNREACHABLE;
    // The two halves may name the same region; it is only guessed once.
    const merged = [...head.path, ...[...tail.path].reverse()];
    const path = merged.filter((id, i) => merged.indexOf(id) === i);
    return { path, cost: path.length };
  }

  /**
   * Regions reachable from `start` using only regions in `guessed` — the set
   * that earns a guess the ✅ mark rather than a plain 🟩.
   */
  reachableFromStart(start: string, guessed: Iterable<string>): Set<string> {
    const free = this.freeMask([start, ...guessed]);
    const seen = new Set<string>([start]);
    const stack = [...this.region(start).areas];
    const visited = new Uint8Array(this.adjacency.length);
    for (const a of stack) visited[a] = 1;
    while (stack.length) {
      const area = stack.pop()!;
      for (const next of this.adjacency[area]) {
        if (visited[next] || !free[this.areaRegion[next]]) continue;
        visited[next] = 1;
        seen.add(this.regions[this.areaRegion[next]].id);
        stack.push(next);
      }
    }
    return seen;
  }

  /** True once the guessed regions form an unbroken chain from start to end. */
  isComplete(start: string, end: string, guessed: Iterable<string>): boolean {
    return this.reachableFromStart(start, [...guessed, end]).has(end);
  }
}
