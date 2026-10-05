import groupsData from "../data/groups.json" with { type: "json" };
import worldData from "../data/world.json" with { type: "json" };
import {
  type FitReply,
  MAP_SIZE,
  type Piece,
  type PieceState,
  type Puzzle,
  type Reveal,
  SNAP_PX,
  STEP_DEGREES,
  STEPS,
  UNITS_PER_PX,
} from "./types.ts";

/**
 * tessle's game server. The browser gets each country as a loose piece:
 * centred on itself, turned by a secret number of steps, in shuffled order.
 * Where a piece belongs, which way is north, which pieces share a border
 * and — in hard mode — which countries they are, stay here. Whether two
 * pieces fit, and whether the map is whole, is decided here too.
 *
 * Everything is a GET carrying the whole board, so no state is kept and any
 * edge can answer.
 */

export const EPOCH = "2026-10-05";

interface World {
  regions: Array<{ id: string; continent: string; areas: number[] }>;
  areas: Array<{ region: number; kind: "main" | "near" | "border"; touches?: number[]; rings: number[][] }>;
  adjacent: Array<[number, number]>;
}

const WORLD = worldData as unknown as World;
const REGION_INDEX = new Map(WORLD.regions.map((region, i) => [region.id, i]));
const AREA_NEIGHBOURS = new Map<number, number[]>();
for (const [a, b] of WORLD.adjacent) {
  if (!AREA_NEIGHBOURS.has(a)) AREA_NEIGHBOURS.set(a, []);
  if (!AREA_NEIGHBOURS.has(b)) AREA_NEIGHBOURS.set(b, []);
  AREA_NEIGHBOURS.get(a)!.push(b);
  AREA_NEIGHBOURS.get(b)!.push(a);
}

/**
 * Every group a round can deal, in a fixed order. Append-only: the schedule
 * indexes into it, so removing or reordering a group would change days
 * already played.
 */
export const GROUPS = groupsData as string[][];

const CONTINENT = new Map(WORLD.regions.map((region) => [region.id, region.continent]));
/** The continent most of a group's countries are on (ties go alphabetically). */
const GROUP_CONTINENT = GROUPS.map((group) => {
  const votes = new Map<string, number>();
  for (const id of group) votes.set(CONTINENT.get(id)!, (votes.get(CONTINENT.get(id)!) ?? 0) + 1);
  return [...votes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
});

/**
 * The daily schedule, in eras. An era deals the first `groups` entries of
 * the list from day `from` on, a shuffled pass at a time. Groups appended to
 * the list wait for a new era, starting on a future day: changing the length
 * an era cycles through would reshuffle every day it has dealt, today's
 * included.
 */
export const ERAS: ReadonlyArray<{ from: number; groups: number }> = [{ from: 1, groups: 126 }];

/** A group does not come round again within this many days of a pass's end. */
const LOOKBACK = 30;

export interface Reply {
  status: number;
  body: unknown;
  cache: string;
}

class BadRequest extends Error {}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function utcDay(date: string): number | null {
  const match = ISO_DATE.exec(date);
  if (!match) return null;
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const back = new Date(time);
  if (back.getUTCDate() !== Number(match[3]) || back.getUTCMonth() !== Number(match[2]) - 1) {
    return null;
  }
  return time / DAY_MS;
}

/** Puzzle number for a date: the epoch is #1. Null if malformed. */
export function puzzleNumber(date: string): number | null {
  const day = utcDay(date);
  return day === null ? null : day - utcDay(EPOCH)! + 1;
}

/** The latest date anyone on Earth can be living in: UTC+14. */
export function latestDate(now: Date): string {
  return new Date(now.getTime() + 14 * 3_600_000).toISOString().slice(0, 10);
}

const encoder = new TextEncoder();
const keys = new Map<string, Promise<CryptoKey>>();

/** A random stream for one label, unpredictable without the seed. */
async function stream(seed: string, label: string): Promise<() => number> {
  let key = keys.get(seed);
  if (!key) {
    key = crypto.subtle.importKey("raw", encoder.encode(seed), { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
    ]);
    keys.set(seed, key);
  }
  const digest = new Uint32Array(await crypto.subtle.sign("HMAC", await key, encoder.encode(label)));
  // xoshiro128** seeded with the first 128 bits of the digest.
  let [a, b, c, d] = digest;
  if ((a | b | c | d) === 0) a = 1;
  const rotl = (x: number, k: number): number => (x << k) | (x >>> (32 - k));
  return () => {
    const result = Math.imul(rotl(Math.imul(b, 5), 7), 9) >>> 0;
    const t = b << 9;
    c ^= a;
    d ^= b;
    b ^= c;
    a ^= d;
    c ^= t;
    d = rotl(d, 11);
    return result / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** An era's groups shuffled for one pass through them. */
async function shuffled(seed: string, era: number, cycle: number): Promise<number[]> {
  const random = await stream(seed, era === 0 ? `tessle:cycle:${cycle}` : `tessle:cycle:${era}:${cycle}`);
  return shuffle(
    Array.from({ length: ERAS[era].groups }, (_, i) => i),
    random,
  );
}

/**
 * Deals a shuffled pass out day by day. Each day takes the next group whose
 * continent has rested long enough — a day for the commonest, up to three
 * for the rarer ones — and, for the first `lookback` days, that the previous
 * pass did not end on. Where nothing qualifies, the rest still have to go.
 */
function arrange(shuffledPass: number[], before: number[], lookback: number): number[] {
  const counts = new Map<string, number>();
  for (const group of shuffledPass) counts.set(GROUP_CONTINENT[group], (counts.get(GROUP_CONTINENT[group]) ?? 0) + 1);
  const rest = (continent: string): number =>
    Math.min(3, Math.max(1, Math.floor(shuffledPass.length / counts.get(continent)!) - 2));
  const recent = new Set(before.slice(-lookback));
  const dealt = before.slice(-3);
  const left = [...shuffledPass];
  const out: number[] = [];
  while (left.length > 0) {
    const fresh = (group: number): boolean => out.length >= lookback || !recent.has(group);
    const rested = (group: number): boolean => {
      const continent = GROUP_CONTINENT[group];
      return !dealt.slice(-rest(continent)).some((other) => GROUP_CONTINENT[other] === continent);
    };
    let next = left.findIndex((group) => fresh(group) && rested(group));
    if (next < 0) next = left.findIndex(fresh);
    const [group] = left.splice(Math.max(0, next), 1);
    out.push(group);
    dealt.push(group);
  }
  return out;
}

const cycles = new Map<string, number[]>();

/**
 * One pass through an era's groups, so nothing repeats within a pass, and
 * nothing the previous pass ended on comes round again straight away. Each
 * pass is laid out after the one before it, so the turn of a pass is as
 * mixed as its middle.
 */
async function cycleOrder(seed: string, era: number, cycle: number): Promise<number[]> {
  const key = `${seed}\u0000${era}\u0000${cycle}`;
  const cached = cycles.get(key);
  if (cached) return cached;
  const length = ERAS[era].groups;
  const before = cycle > 0 ? await cycleOrder(seed, era, cycle - 1) : [];
  const order = arrange(await shuffled(seed, era, cycle), before, Math.min(LOOKBACK, Math.floor(length / 4)));
  if (cycles.size > 8) cycles.clear();
  cycles.set(key, order);
  return order;
}

/** Which group day `number` deals, as an index into GROUPS. */
export async function dailyGroup(seed: string, number: number): Promise<number> {
  let era = 0;
  while (era + 1 < ERAS.length && ERAS[era + 1].from <= number) era++;
  const index = number - ERAS[era].from;
  const length = ERAS[era].groups;
  const cycle = Math.floor(index / length);
  return (await cycleOrder(seed, era, cycle))[index - cycle * length];
}

// --- geometry ---

type Point = [number, number];

const COS = Array.from({ length: STEPS }, (_, i) => Math.cos((i * STEP_DEGREES * Math.PI) / 180));
const SIN = Array.from({ length: STEPS }, (_, i) => Math.sin((i * STEP_DEGREES * Math.PI) / 180));

/** Turns a vector by `steps`, clockwise on a screen whose y grows downwards. */
function turn(x: number, y: number, steps: number): Point {
  const s = ((steps % STEPS) + STEPS) % STEPS;
  return [x * COS[s] - y * SIN[s], x * SIN[s] + y * COS[s]];
}

const round1 = (value: number): number => Math.round(value * 10) / 10;
const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Twice the signed area and the matching centroid sums of a flat ring. */
function ringMoments(ring: number[]): { area: number; cx: number; cy: number } {
  let area = 0;
  let cx = 0;
  let cy = 0;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const cross = ring[j * 2] * ring[i * 2 + 1] - ring[i * 2] * ring[j * 2 + 1];
    area += cross;
    cx += (ring[j * 2] + ring[i * 2]) * cross;
    cy += (ring[j * 2 + 1] + ring[i * 2 + 1]) * cross;
  }
  return { area, cx, cy };
}

/** Squared distance from a point to a segment. */
function segmentDistanceSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  let x = ax;
  let y = ay;
  let dx = bx - x;
  let dy = by - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = bx;
      y = by;
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = px - x;
  dy = py - y;
  return dx * dx + dy * dy;
}

/** Signed distance to the outline: positive inside (even-odd), negative outside. */
function signedDistance(x: number, y: number, rings: number[][]): number {
  let inside = false;
  let best = Infinity;
  for (const ring of rings) {
    const n = ring.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ax = ring[i * 2];
      const ay = ring[i * 2 + 1];
      const bx = ring[j * 2];
      const by = ring[j * 2 + 1];
      if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
      best = Math.min(best, segmentDistanceSq(x, y, ax, ay, bx, by));
    }
  }
  return (inside ? 1 : -1) * Math.sqrt(best);
}

interface Cell {
  x: number;
  y: number;
  h: number;
  d: number;
  max: number;
}

/**
 * The point deepest inside a polygon — its pole of inaccessibility — found
 * the way Mapbox's polylabel does it: split cells, keep the promising ones.
 * A centroid can fall outside a crescent like Croatia; this cannot.
 */
function polylabel(rings: number[][], precision = 4): Point {
  const outer = rings[0];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < outer.length; i += 2) {
    minX = Math.min(minX, outer[i]);
    maxX = Math.max(maxX, outer[i]);
    minY = Math.min(minY, outer[i + 1]);
    maxY = Math.max(maxY, outer[i + 1]);
  }
  const size = Math.min(maxX - minX, maxY - minY);
  if (size <= precision) return [(minX + maxX) / 2, (minY + maxY) / 2];

  const cell = (x: number, y: number, h: number): Cell => {
    const d = signedDistance(x, y, rings);
    return { x, y, h, d, max: d + h * Math.SQRT2 };
  };
  // A max-heap on each cell's best possible distance.
  const heap: Cell[] = [];
  const push = (item: Cell): void => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent].max >= heap[i].max) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  };
  const pop = (): Cell => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let largest = i;
        if (l < heap.length && heap[l].max > heap[largest].max) largest = l;
        if (r < heap.length && heap[r].max > heap[largest].max) largest = r;
        if (largest === i) break;
        [heap[largest], heap[i]] = [heap[i], heap[largest]];
        i = largest;
      }
    }
    return top;
  };

  const h = size / 2;
  for (let x = minX; x < maxX; x += size) {
    for (let y = minY; y < maxY; y += size) push(cell(x + h, y + h, h));
  }
  const { area, cx, cy } = ringMoments(outer);
  let best = area === 0 ? cell(outer[0], outer[1], 0) : cell(cx / (3 * area), cy / (3 * area), 0);
  const middle = cell(minX + (maxX - minX) / 2, minY + (maxY - minY) / 2, 0);
  if (middle.d > best.d) best = middle;

  while (heap.length > 0) {
    const next = pop();
    if (next.d > best.d) best = next;
    if (next.max - best.d <= precision) continue;
    const half = next.h / 2;
    push(cell(next.x - half, next.y - half, half));
    push(cell(next.x + half, next.y - half, half));
    push(cell(next.x - half, next.y + half, half));
    push(cell(next.x + half, next.y + half, half));
  }
  return [best.x, best.y];
}

// --- rounds ---

/**
 * The outline of several pieces put together. Neighbours share their border
 * point for point, so every edge inside the map turns up twice — once in each
 * piece — and every edge on the outside once. Keeping the edges seen once
 * and chaining them end to end gives the silhouette, holes and all.
 */
function silhouette(rings: number[][], cx: number, cy: number): number[][] {
  const key = (x: number, y: number): string => `${x},${y}`;
  const edgeKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const seen = new Map<string, number>();
  const edges: Array<{ a: string; b: string; ax: number; ay: number }> = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 2) {
      const j = (i + 2) % ring.length;
      const a = key(ring[i], ring[i + 1]);
      const b = key(ring[j], ring[j + 1]);
      if (a === b) continue;
      const k = edgeKey(a, b);
      seen.set(k, (seen.get(k) ?? 0) + 1);
      edges.push({ a, b, ax: ring[i], ay: ring[i + 1] });
    }
  }
  const outer = edges.filter(({ a, b }) => seen.get(edgeKey(a, b)) === 1);
  const from = new Map<string, number[]>();
  outer.forEach(({ a }, i) => from.set(a, [...(from.get(a) ?? []), i]));
  const used = new Uint8Array(outer.length);
  const out: number[][] = [];
  for (let start = 0; start < outer.length; start++) {
    if (used[start]) continue;
    const ring: number[] = [];
    let at = start;
    while (at !== -1 && !used[at]) {
      used[at] = 1;
      const edge = outer[at];
      ring.push(round1(edge.ax - cx), round1(edge.ay - cy));
      at = (from.get(edge.b) ?? []).find((next) => !used[next]) ?? -1;
    }
    if (ring.length >= 6) out.push(ring);
  }
  return out;
}

export interface Round {
  /** Region ids, in the order the pieces are sent. */
  ids: string[];
  /** Pieces with their ids; hard mode strips them on the way out. */
  pieces: Piece[];
  /** Each piece's centre in the finished map, north up. */
  centres: Point[];
  /** The secret turn each piece was sent at. */
  turns: number[];
  /** Pieces that share a border, by index. */
  pairs: Array<[number, number]>;
  /** Each piece's place in the frame: its centre around the map's own centre. */
  home: Point[];
  /** The frame: the finished map's silhouette, around the same centre. */
  outline: number[][];
}

/**
 * Cuts a group into pieces. `random` decides each piece's turn and the order
 * they are sent in; everything else follows from the map.
 */
export function cutRound(ids: readonly string[], random: () => number): Round {
  const members = new Set(ids.map((id) => REGION_INDEX.get(id)!));
  const kept = ids.map((id) => {
    const region = WORLD.regions[REGION_INDEX.get(id)!];
    return region.areas.filter((area) => {
      const { kind, touches } = WORLD.areas[area];
      return kind !== "border" || (touches ?? []).some((other) => members.has(other));
    });
  });

  // Lambert's azimuthal equal-area projection, centred on the group.
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const areas of kept) {
    for (const area of areas) {
      for (const ring of WORLD.areas[area].rings) {
        for (let i = 0; i < ring.length; i += 2) {
          minLon = Math.min(minLon, ring[i]);
          maxLon = Math.max(maxLon, ring[i]);
          minLat = Math.min(minLat, ring[i + 1]);
          maxLat = Math.max(maxLat, ring[i + 1]);
        }
      }
    }
  }
  const rad = Math.PI / 180;
  const λ0 = ((minLon + maxLon) / 2) * rad;
  const φ0 = ((minLat + maxLat) / 2) * rad;
  const sinφ0 = Math.sin(φ0);
  const cosφ0 = Math.cos(φ0);
  const project = (ring: number[]): number[] => {
    const out = new Array<number>(ring.length);
    for (let i = 0; i < ring.length; i += 2) {
      const λ = ring[i] * rad - λ0;
      const φ = ring[i + 1] * rad;
      const cosφ = Math.cos(φ);
      const sinφ = Math.sin(φ);
      const k = Math.sqrt(2 / (1 + sinφ0 * sinφ + cosφ0 * cosφ * Math.cos(λ)));
      out[i] = k * cosφ * Math.sin(λ);
      // North up on a screen, where y grows downwards.
      out[i + 1] = -k * (cosφ0 * sinφ - sinφ0 * cosφ * Math.cos(λ));
    }
    return out;
  };
  const projected = kept.map((areas) => areas.map((area) => WORLD.areas[area].rings.map(project)));

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const piece of projected) {
    for (const area of piece) {
      for (const ring of area) {
        for (let i = 0; i < ring.length; i += 2) {
          minX = Math.min(minX, ring[i]);
          maxX = Math.max(maxX, ring[i]);
          minY = Math.min(minY, ring[i + 1]);
          maxY = Math.max(maxY, ring[i + 1]);
        }
      }
    }
  }
  const scale = MAP_SIZE / Math.max(maxX - minX, maxY - minY);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  for (const piece of projected) {
    for (const area of piece) {
      for (const ring of area) {
        for (let i = 0; i < ring.length; i += 2) {
          ring[i] = (ring[i] - midX) * scale;
          ring[i + 1] = (ring[i + 1] - midY) * scale;
        }
      }
    }
  }

  const cut = projected.map((areas) => {
    const rings = areas.flat();
    // Holes wind against their outline; reading every ring's sign against
    // the biggest one's makes them subtract, whichever way the data winds.
    const moments = rings.map(ringMoments);
    const biggest = moments.reduce((best, m, i) => (Math.abs(m.area) > Math.abs(moments[best].area) ? i : best), 0);
    const sign = Math.sign(moments[biggest].area) || 1;
    let area = 0;
    let cx = 0;
    let cy = 0;
    for (const m of moments) {
      area += m.area * sign;
      cx += m.cx * sign;
      cy += m.cy * sign;
    }
    const centre: Point = area > 0 ? [cx / (3 * area), cy / (3 * area)] : [0, 0];
    // The name goes in the biggest landmass, holes and all.
    let offset = 0;
    let labelArea = areas[0];
    for (const ringsOfArea of areas) {
      if (biggest >= offset && biggest < offset + ringsOfArea.length) {
        labelArea = [ringsOfArea[biggest - offset], ...ringsOfArea.filter((_, i) => i !== biggest - offset)];
        break;
      }
      offset += ringsOfArea.length;
    }
    const local = (ring: number[]): number[] => ring.map((v, i) => v - centre[i % 2]);
    return { centre, rings: rings.map(local), labelArea: labelArea.map(local) };
  });

  const turns = ids.map(() => Math.floor(random() * STEPS));
  const order = shuffle(
    ids.map((_, i) => i),
    random,
  );

  const send = (ring: number[], steps: number): number[] => {
    const out = new Array<number>(ring.length);
    for (let i = 0; i < ring.length; i += 2) {
      const [x, y] = turn(ring[i], ring[i + 1], steps);
      out[i] = round1(x);
      out[i + 1] = round1(y);
    }
    return out;
  };

  const position = new Map(order.map((original, sent) => [original, sent]));
  const areaOwner = new Map<number, number>();
  kept.forEach((areas, i) => areas.forEach((area) => areaOwner.set(area, position.get(i)!)));
  const pairKeys = new Set<string>();
  const pairs: Array<[number, number]> = [];
  for (const [area, owner] of areaOwner) {
    for (const other of AREA_NEIGHBOURS.get(area) ?? []) {
      const next = areaOwner.get(other);
      if (next === undefined || next === owner) continue;
      const pair: [number, number] = owner < next ? [owner, next] : [next, owner];
      const key = pair.join(",");
      if (pairKeys.has(key)) continue;
      pairKeys.add(key);
      pairs.push(pair);
    }
  }
  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const centres = order.map((i) => cut[i].centre);
  const meanX = centres.reduce((sum, [x]) => sum + x, 0) / centres.length;
  const meanY = centres.reduce((sum, [, y]) => sum + y, 0) / centres.length;

  // The pieces themselves — turned, rounded, labelled — and the frame are
  // only needed to send the puzzle, not to judge a fit, so they wait until
  // asked for.
  let pieces: Piece[] | null = null;
  let outline: number[][] | null = null;
  return {
    get outline(): number[][] {
      outline ??= silhouette(projected.flat(2), meanX, meanY);
      return outline;
    },
    home: centres.map(([x, y]) => [round2(x - meanX), round2(y - meanY)]),
    ids: order.map((i) => ids[i]),
    get pieces(): Piece[] {
      pieces ??= order.map((i) => {
        const label = polylabel(cut[i].labelArea);
        const [lx, ly] = turn(label[0], label[1], turns[i]);
        return { rings: cut[i].rings.map((ring) => send(ring, turns[i])), label: [round1(lx), round1(ly)], id: ids[i] };
      });
      return pieces;
    },
    centres,
    turns: order.map((i) => turns[i]),
    pairs,
  };
}

const memo = new Map<string, Round>();

async function memoised(key: string, make: () => Promise<Round>): Promise<Round> {
  const cached = memo.get(key);
  if (cached) return cached;
  const round = await make();
  if (memo.size >= 32) memo.delete(memo.keys().next().value!);
  memo.set(key, round);
  return round;
}

/** Day `number`'s round: the same pieces, turns and order for everyone. */
export function dailyRound(seed: string, number: number): Promise<Round> {
  return memoised(`${seed}\u0000d${number}`, async () => {
    const group = GROUPS[await dailyGroup(seed, number)];
    return cutRound(group, await stream(seed, `tessle:pieces:${number}`));
  });
}

/**
 * An endless round, from a number the player's browser picks at random. The
 * group comes from HMAC(secret, number), so the number alone says nothing,
 * and endless avoids nothing — not even today's group: a rule like that
 * could be measured by asking for thousands of rounds. The page opens
 * endless only once the day's round is finished instead.
 */
export function endlessRound(seed: string, round: number): Promise<Round> {
  return memoised(`${seed}\u0000e${round}`, async () => {
    const random = await stream(seed, `tessle:endless:${round}`);
    const group = GROUPS[Math.floor(random() * GROUPS.length)];
    return cutRound(group, random);
  });
}

// --- judging ---

function reveal(round: Round): Reveal {
  return {
    ids: round.ids,
    home: round.home,
    turns: round.turns.map((k) => (STEPS - k) % STEPS),
  };
}

/**
 * Which pieces fit together on the player's board. Two neighbours fit when
 * they face the same way and sit within the snap distance of where the map
 * puts one relative to the other. Each group that fits is snapped exactly
 * into place around a piece that stayed still, so a piece dropped onto the
 * board joins it rather than dragging it along.
 */
export function judgeFit(round: Round, board: readonly PieceState[], moved: ReadonlySet<number>, unitsPerPx: number): FitReply {
  const n = round.ids.length;
  const tolerance = SNAP_PX * Math.min(UNITS_PER_PX.max, Math.max(UNITS_PER_PX.min, unitsPerPx));
  const facing = board.map(({ r }, i) => (round.turns[i] + r) % STEPS);
  // Index n is the frame, drawn at the table's origin, north up.
  const frame = n;
  const parent = Array.from({ length: n + 1 }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (const [i, j] of round.pairs) {
    if (facing[i] !== facing[j]) continue;
    const [ox, oy] = turn(round.centres[j][0] - round.centres[i][0], round.centres[j][1] - round.centres[i][1], facing[i]);
    const dx = board[j].x - board[i].x - ox;
    const dy = board[j].y - board[i].y - oy;
    if (dx * dx + dy * dy <= tolerance * tolerance) parent[find(i)] = find(j);
  }
  // A piece north up and near its place drops into the frame.
  for (let i = 0; i < n; i++) {
    if (facing[i] !== 0) continue;
    const dx = board[i].x - round.home[i][0];
    const dy = board[i].y - round.home[i][1];
    if (dx * dx + dy * dy <= tolerance * tolerance) parent[find(i)] = find(frame);
  }

  const members = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!members.has(root)) members.set(root, []);
    members.get(root)!.push(i);
  }
  const framed = find(frame);
  const placed = members.get(framed) ?? [];
  const groups = [...members.values()].filter((group) => group.length > 1).sort((a, b) => a[0] - b[0]);
  const at: Array<[number, number] | null> = Array.from({ length: n }, () => null);
  // What is in the frame goes exactly where the frame has it.
  for (const i of placed) at[i] = [round.home[i][0], round.home[i][1]];
  for (const group of groups) {
    if (find(group[0]) === framed) continue;
    const anchor = group.find((i) => !moved.has(i)) ?? group[0];
    for (const i of group) {
      const [ox, oy] = turn(
        round.centres[i][0] - round.centres[anchor][0],
        round.centres[i][1] - round.centres[anchor][1],
        facing[anchor],
      );
      at[i] = [round2(board[anchor].x + ox), round2(board[anchor].y + oy)];
    }
  }
  const solved = groups.length === 1 && groups[0].length === n || placed.length === n;
  return { groups, placed, at, solved, reveal: solved ? reveal(round) : null };
}

const MAX_COORDINATE = 100_000;

/** `x,y,r;x,y,r;…`, one entry per piece. */
function parseBoard(text: string | null, count: number): PieceState[] {
  const entries = (text ?? "").split(";");
  if (entries.length !== count) throw new BadRequest("one entry per piece");
  return entries.map((entry) => {
    const fields = entry.split(",");
    if (fields.length !== 3 || fields.some((field) => field.trim() === "")) throw new BadRequest("bad piece");
    const [x, y, r] = fields.map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > MAX_COORDINATE || Math.abs(y) > MAX_COORDINATE) {
      throw new BadRequest("bad position");
    }
    if (!Number.isInteger(r) || r < 0 || r >= STEPS) throw new BadRequest("bad turn");
    return { x, y, r };
  });
}

function parseMoved(text: string | null, count: number): Set<number> {
  const moved = new Set<number>();
  for (const field of (text ?? "").split(",").filter(Boolean)) {
    const index = Number(field);
    if (!Number.isInteger(index) || index < 0 || index >= count) throw new BadRequest("bad piece index");
    moved.add(index);
  }
  return moved;
}

const fail = (status: number, error: string): Reply => ({ status, body: { error }, cache: "no-store" });
const ok = (body: unknown): Reply => ({ status: 200, body, cache: "private, max-age=86400" });

/** The day a request is about, refusing any that has not begun anywhere on Earth. */
function dayOf(date: string | null, now: Date): { number: number; date: string } | null {
  const number = date ? puzzleNumber(date) : null;
  if (number === null || number < 1) throw new BadRequest("bad date");
  if (date! > latestDate(now)) return null;
  return { number, date: date! };
}

/**
 * Answers `/api/tessle/<action>?…`. Without `seed` it refuses to run rather
 * than fall back to anything guessable.
 */
export async function handleTessle(
  action: string,
  query: URLSearchParams,
  seed: string | undefined,
  now: Date = new Date(),
): Promise<Reply> {
  try {
    if (action !== "daily" && action !== "endless" && action !== "fit" && action !== "reveal") {
      return fail(404, "no such endpoint");
    }
    if (!seed) return fail(503, "tessle is not configured");

    let round: Round;
    let meta: Pick<Puzzle, "number" | "date" | "round">;
    if (action === "endless" || (action !== "daily" && query.has("e"))) {
      const number = Number(query.get("e") ?? "");
      if (query.get("e") === "" || !Number.isInteger(number) || number < 0 || number > 0xffffffff) {
        throw new BadRequest("bad round");
      }
      round = await endlessRound(seed, number);
      meta = { number: null, date: null, round: number };
    } else {
      const day = dayOf(query.get("date") ?? query.get("d"), now);
      if (!day) return fail(404, "that day has not started anywhere yet");
      round = await dailyRound(seed, day.number);
      meta = { number: day.number, date: day.date, round: null };
    }

    if (action === "daily" || action === "endless") {
      const hard = query.get("hard") === "1";
      const puzzle: Puzzle = {
        ...meta,
        pieces: round.pieces.map(({ rings, label, id }) => (hard ? { rings, label } : { rings, label, id })),
        outline: round.outline,
      };
      return ok(puzzle);
    }
    if (action === "reveal") return ok(reveal(round));

    const count = round.ids.length;
    const board = parseBoard(query.get("p"), count);
    const moved = parseMoved(query.get("m"), count);
    const u = Number(query.get("u"));
    return ok(judgeFit(round, board, moved, Number.isFinite(u) && u > 0 ? u : 1));
  } catch (error) {
    if (error instanceof BadRequest) return fail(400, error.message);
    throw error;
  }
}
