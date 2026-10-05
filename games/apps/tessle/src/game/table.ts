import { type FitReply, type Piece, type PieceState, type Reveal, STEP_DEGREES, STEPS } from "@tessle/data/client";

/**
 * The table the pieces lie on: where each one is, which way it is turned,
 * which have been fitted together, and the animations that carry them from
 * one state to the next. Nothing here knows what fits what — the server says
 * so — and nothing here draws; the board does that.
 */

/** A piece's outline in its own frame, as the server cut and turned it. */
export interface Shape {
  /** Flat [x0, y0, x1, y1, …] rings, filled even-odd. */
  rings: number[][];
  label: [number, number];
  /** The furthest any point lies from the piece's centre. */
  radius: number;
  /** The radius of a disc with the piece's area: how big it looks. */
  size: number;
}

/** Where a piece is drawn this frame. `a` is in degrees and runs on past 360. */
export interface Visual {
  x: number;
  y: number;
  a: number;
}

interface Animation {
  from: Visual;
  to: Visual;
  /** Turned about this point on the way; otherwise a straight slide. */
  pivot: [number, number] | null;
  start: number;
  duration: number;
}

export interface SavedTable {
  pieces: PieceState[];
  groups: number[][];
  order: number[];
  /** Pieces held in the frame. */
  placed?: number[];
}

type Box = [number, number, number, number];

const SNAP_MS = 170;
const TURN_MS = 150;
const SETTLE_MS = 750;
/** How long a fresh fit glows. */
export const FLASH_MS = 650;

export function turned(x: number, y: number, degrees: number): [number, number] {
  const a = (degrees * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return [x * cos - y * sin, x * sin + y * cos];
}

const mod = (n: number, m: number): number => ((n % m) + m) % m;

/** The shorter way from one turn to another, in steps: −5 … +6. */
function shortest(from: number, to: number): number {
  const d = mod(to - from, STEPS);
  return d > STEPS / 2 ? d - STEPS : d;
}

const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const easeInOut = (t: number): number => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

export function toShape(piece: Piece): Shape {
  let radius = 0;
  let area = 0;
  for (const ring of piece.rings) {
    for (let i = 0; i < ring.length; i += 2) {
      radius = Math.max(radius, Math.hypot(ring[i], ring[i + 1]));
    }
    let twice = 0;
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      twice += ring[j] * ring[i + 1] - ring[i] * ring[j + 1];
    }
    area += twice / 2;
  }
  return { rings: piece.rings, label: piece.label, radius, size: Math.sqrt(Math.abs(area) / Math.PI) };
}

/** Even-odd: inside if a ray from the point crosses the rings an odd number of times. */
function inside(x: number, y: number, rings: number[][]): boolean {
  let odd = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      const xi = ring[i];
      const yi = ring[i + 1];
      const xj = ring[j];
      const yj = ring[j + 1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) odd = !odd;
    }
  }
  return odd;
}

function edgeDistance(x: number, y: number, rings: number[][]): number {
  let best = Infinity;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      const ax = ring[j];
      const ay = ring[j + 1];
      const dx = ring[i] - ax;
      const dy = ring[i + 1] - ay;
      const length = dx * dx + dy * dy;
      const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length));
      best = Math.min(best, Math.hypot(ax + t * dx - x, ay + t * dy - y));
    }
  }
  return best;
}

/** A small seeded generator, so a round's opening layout is the same on every reload. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function boxOf(rings: number[][]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 2) {
      minX = Math.min(minX, ring[i]);
      maxX = Math.max(maxX, ring[i]);
      minY = Math.min(minY, ring[i + 1]);
      maxY = Math.max(maxY, ring[i + 1]);
    }
  }
  return [minX, minY, maxX, maxY];
}

export class Table {
  readonly shapes: Shape[];
  state: PieceState[];
  /** Pieces fitted together, two or more to a group. A loose piece is in none. */
  groups: number[][];
  /** Drawing order, bottom first. */
  order: number[];
  visual: Visual[];
  /** Pieces that have just been fitted, and when. */
  readonly flashes = new Map<number, number>();
  /** Board units per screen pixel, as the board last drew them: the server's snap distance follows it. */
  unitsPerPx = 1;
  /** The finished map's silhouette, at the table's origin: the frame. */
  readonly outline: number[][];
  readonly frame: Box | null;
  /** Pieces the frame holds: they stay put. */
  placed: Set<number>;
  private laidOut: boolean;
  private readonly animations = new Map<number, Animation>();
  private readonly listeners = new Set<() => void>();

  constructor(pieces: Piece[], saved?: SavedTable | null, outline: number[][] = []) {
    this.shapes = pieces.map(toShape);
    this.outline = outline;
    this.frame = outline.length > 0 ? boxOf(outline) : null;
    const fits = saved && saved.pieces.length === pieces.length;
    this.laidOut = !!fits;
    this.placed = new Set(fits ? (saved.placed ?? []) : []);
    this.state = fits ? saved.pieces.map((p) => ({ ...p })) : pieces.map(() => ({ x: 0, y: 0, r: 0 }));
    this.groups = fits ? saved.groups.map((g) => [...g]) : [];
    this.order = fits && saved.order.length === pieces.length ? [...saved.order] : pieces.map((_, i) => i);
    this.visual = this.state.map((p) => ({ x: p.x, y: p.y, a: p.r * STEP_DEGREES }));
  }

  get isPlaced(): boolean {
    return this.laidOut;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Something changed: whoever draws the table should draw it again. */
  invalidate(): void {
    for (const listener of this.listeners) listener();
  }

  save(): SavedTable {
    return {
      pieces: this.snapshot(),
      groups: this.groups.map((g) => [...g]),
      order: [...this.order],
      placed: [...this.placed],
    };
  }

  snapshot(): PieceState[] {
    return this.state.map((p) => ({ ...p }));
  }

  /**
   * Scatters the pieces over a patch of table shaped like the screen,
   * biggest first, each where it crowds the others least.
   */
  layout(aspect: number, seed: number): void {
    const random = mulberry32(seed);
    const reach = this.shapes.map((s) => (s.radius + s.size) / 2);
    const frame = this.frame ?? [0, 0, 0, 0];
    const frameArea = (frame[2] - frame[0]) * (frame[3] - frame[1]);
    const area = reach.reduce((sum, r) => sum + Math.PI * r * r, 0) * 2.1 + frameArea * 1.3;
    // A patch shaped like the screen, and never narrower than the frame.
    let height = Math.sqrt(area / aspect);
    let width = height * aspect;
    width = Math.max(width, (frame[2] - frame[0]) * 1.15);
    height = Math.max(height, (frame[3] - frame[1]) * 1.15);
    const byReach = this.shapes.map((_, i) => i).sort((a, b) => reach[b] - reach[a]);
    const done: number[] = [];
    for (const i of byReach) {
      let best: [number, number] = [0, 0];
      let bestRoom = -Infinity;
      for (let attempt = 0; attempt < 160; attempt++) {
        const x = (random() - 0.5) * Math.max(0, width - reach[i] * 1.4);
        const y = (random() - 0.5) * Math.max(0, height - reach[i] * 1.4);
        // Room to the frame counts like room to another piece: pieces start around it, not in it.
        const gapX = Math.max(frame[0] - x, 0, x - frame[2]);
        const gapY = Math.max(frame[1] - y, 0, y - frame[3]);
        let room = this.frame ? Math.hypot(gapX, gapY) - reach[i] * 0.9 : Infinity;
        for (const j of done) {
          room = Math.min(room, Math.hypot(x - this.state[j].x, y - this.state[j].y) - (reach[i] + reach[j]));
        }
        if (room > bestRoom) {
          bestRoom = room;
          best = [x, y];
        }
      }
      this.state[i] = { x: best[0], y: best[1], r: 0 };
      done.push(i);
    }
    // Small pieces on top, where a big one cannot hide them.
    this.order = [...byReach];
    this.visual = this.state.map((p) => ({ x: p.x, y: p.y, a: 0 }));
    this.groups = [];
    this.placed = new Set();
    this.laidOut = true;
    this.invalidate();
  }

  /** The piece and everything fitted to it. */
  members(piece: number): number[] {
    return this.groups.find((group) => group.includes(piece)) ?? [piece];
  }

  /** How many separate things are left to fit together. */
  get clusters(): number {
    return this.shapes.length - this.groups.reduce((sum, group) => sum + group.length - 1, 0);
  }

  /** Pieces not yet in the frame. */
  get unplaced(): number {
    return this.shapes.length - this.placed.size;
  }

  /** Puts the frame's pieces at the bottom, under anything still loose. */
  private sinkPlaced(): void {
    this.order = [...this.order.filter((i) => this.placed.has(i)), ...this.order.filter((i) => !this.placed.has(i))];
  }

  bringToFront(piece: number): void {
    const lift = new Set(this.members(piece));
    this.order = [...this.order.filter((i) => !lift.has(i)), ...this.order.filter((i) => lift.has(i))];
    this.invalidate();
  }

  /** Ends any animation on these pieces at once, so a grab starts from where they will be. */
  finish(pieces: number[]): void {
    for (const i of pieces) {
      const animation = this.animations.get(i);
      if (!animation) continue;
      this.visual[i] = { ...animation.to };
      this.animations.delete(i);
    }
  }

  moveBy(piece: number, dx: number, dy: number): void {
    for (const i of this.members(piece)) {
      this.state[i].x += dx;
      this.state[i].y += dy;
      const animation = this.animations.get(i);
      if (animation) {
        animation.from.x += dx;
        animation.from.y += dy;
        animation.to.x += dx;
        animation.to.y += dy;
        if (animation.pivot) animation.pivot = [animation.pivot[0] + dx, animation.pivot[1] + dy];
      }
      this.visual[i].x += dx;
      this.visual[i].y += dy;
    }
    this.invalidate();
  }

  /** Turns a piece, and whatever is fitted to it, one step about their middle. */
  turn(piece: number, direction: 1 | -1, now: number): number[] {
    if (this.placed.has(piece)) return [];
    const members = this.members(piece);
    const xs = members.map((i) => this.state[i].x);
    const ys = members.map((i) => this.state[i].y);
    const pivot: [number, number] = [
      (Math.min(...xs) + Math.max(...xs)) / 2,
      (Math.min(...ys) + Math.max(...ys)) / 2,
    ];
    const degrees = direction * STEP_DEGREES;
    for (const i of members) {
      const p = this.state[i];
      const [x, y] = turned(p.x - pivot[0], p.y - pivot[1], degrees);
      this.state[i] = { x: pivot[0] + x, y: pivot[1] + y, r: mod(p.r + direction, STEPS) };
      const from = { ...this.visual[i] };
      const to = { x: pivot[0] + x, y: pivot[1] + y, a: (this.animations.get(i)?.to.a ?? from.a) + degrees };
      this.animations.set(i, { from, to, pivot, start: now, duration: TURN_MS });
    }
    this.invalidate();
    return members;
  }

  /**
   * Takes the server's word on what fits. A group is only joined if none
   * of its pieces has moved since the board was sent; the rest come back
   * as stale, to be asked about again.
   */
  applyFit(reply: FitReply, sent: PieceState[], now: number): { joined: number[]; stale: number[] } {
    const joined: number[] = [];
    const stale: number[] = [];
    const parent = this.state.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const union = (a: number, b: number): void => {
      parent[find(a)] = find(b);
    };
    for (const group of this.groups) for (const i of group) union(i, group[0]);
    const movedSince = (i: number): boolean => {
      const current = this.state[i];
      const then = sent[i];
      return !then || current.x !== then.x || current.y !== then.y || current.r !== then.r;
    };

    const framed = reply.placed ?? [];
    if (framed.some(movedSince)) {
      stale.push(...framed);
    } else {
      for (const i of framed) {
        const at = reply.at[i];
        if (this.placed.has(i) || !at) continue;
        this.placed.add(i);
        joined.push(i);
        this.flashes.set(i, now);
        this.state[i] = { ...this.state[i], x: at[0], y: at[1] };
        this.slide(i, { ...this.visual[i], x: at[0], y: at[1] }, now, SNAP_MS);
      }
      this.sinkPlaced();
    }

    for (const group of reply.groups) {
      if (group.some(movedSince)) {
        stale.push(...group);
        continue;
      }
      const isNew = group.some((i) => find(i) !== find(group[0]));
      for (const i of group) {
        const at = reply.at[i];
        if (!at || (at[0] === this.state[i].x && at[1] === this.state[i].y)) continue;
        this.state[i] = { ...this.state[i], x: at[0], y: at[1] };
        this.slide(i, { ...this.visual[i], x: at[0], y: at[1] }, now, SNAP_MS);
      }
      for (const i of group) union(i, group[0]);
      if (isNew) {
        joined.push(...group.filter((i) => !joined.includes(i)));
        for (const i of group) this.flashes.set(i, now);
      }
    }

    const byRoot = new Map<number, number[]>();
    this.state.forEach((_, i) => {
      const root = find(i);
      byRoot.set(root, [...(byRoot.get(root) ?? []), i]);
    });
    this.groups = [...byRoot.values()].filter((group) => group.length > 1);
    this.invalidate();
    return { joined, stale };
  }

  /**
   * The round is over: the map turns north up and lies as it does on the
   * globe. Solved, it turns as one; given up, every piece flies home.
   */
  settle(reveal: Reveal, now: number): void {
    const all = this.state.map((_, i) => i);
    this.finish(all);
    const xs = this.state.map((p) => p.x);
    const ys = this.state.map((p) => p.y);
    const middle: [number, number] = [
      (Math.min(...xs) + Math.max(...xs)) / 2,
      (Math.min(...ys) + Math.max(...ys)) / 2,
    ];
    // Into the frame, if there is one; otherwise wherever it lies.
    const centre: [number, number] = this.frame ? [0, 0] : middle;
    const together = this.groups.length === 1 && this.groups[0].length === all.length;
    const swing = together ? shortest(this.state[0].r, reveal.turns[0]) * STEP_DEGREES : 0;
    for (const i of all) {
      const to = {
        x: centre[0] + reveal.home[i][0],
        y: centre[1] + reveal.home[i][1],
        a: this.visual[i].a + (together ? swing : shortest(this.state[i].r, reveal.turns[i]) * STEP_DEGREES),
      };
      this.animations.set(i, {
        from: { ...this.visual[i] },
        to,
        pivot: together ? middle : null,
        start: now,
        duration: SETTLE_MS,
      });
      this.state[i] = { x: to.x, y: to.y, r: mod(reveal.turns[i], STEPS) };
    }
    this.groups = [all];
    this.placed = new Set(all);
    this.invalidate();
  }

  private slide(piece: number, to: Visual, now: number, duration: number): void {
    const running = this.animations.get(piece);
    const target = running ? { ...to, a: running.to.a } : to;
    this.animations.set(piece, { from: { ...this.visual[piece] }, to: target, pivot: null, start: now, duration });
  }

  /** Advances every animation to `now`. True while anything is still moving or glowing. */
  tick(now: number): boolean {
    for (const [i, animation] of this.animations) {
      const t = Math.min(1, Math.max(0, (now - animation.start) / animation.duration));
      const e = animation.duration >= SETTLE_MS ? easeInOut(t) : easeOut(t);
      const { from, to, pivot } = animation;
      if (t >= 1) {
        this.visual[i] = { ...to };
        this.animations.delete(i);
        continue;
      }
      const a = from.a + (to.a - from.a) * e;
      if (pivot) {
        // Turn about the pivot, and close whatever gap is left by the end, so
        // the piece always lands exactly where its state says.
        const [fx, fy] = turned(from.x - pivot[0], from.y - pivot[1], a - from.a);
        const [ex, ey] = turned(from.x - pivot[0], from.y - pivot[1], to.a - from.a);
        const gapX = to.x - (pivot[0] + ex);
        const gapY = to.y - (pivot[1] + ey);
        this.visual[i] = { x: pivot[0] + fx + gapX * e, y: pivot[1] + fy + gapY * e, a };
      } else {
        this.visual[i] = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, a };
      }
    }
    for (const [i, start] of this.flashes) if (now - start > FLASH_MS) this.flashes.delete(i);
    return this.animations.size > 0 || this.flashes.size > 0;
  }

  /** A point on the table in a piece's own frame, as drawn. */
  private local(piece: number, x: number, y: number): [number, number] {
    const v = this.visual[piece];
    return turned(x - v.x, y - v.y, -v.a);
  }

  /**
   * The topmost piece under a point. With `slop`, a near miss within that
   * distance of an edge counts too — a fingertip is wider than a cursor.
   */
  hit(x: number, y: number, slop = 0): number {
    let near = -1;
    let nearest = slop;
    for (let k = this.order.length - 1; k >= 0; k--) {
      const i = this.order[k];
      // The frame holds its pieces; the hand passes over them.
      if (this.placed.has(i)) continue;
      const shape = this.shapes[i];
      const [lx, ly] = this.local(i, x, y);
      if (Math.hypot(lx, ly) > shape.radius + slop) continue;
      if (inside(lx, ly, shape.rings)) return i;
      if (slop > 0) {
        const d = edgeDistance(lx, ly, shape.rings);
        if (d < nearest) {
          nearest = d;
          near = i;
        }
      }
    }
    return near;
  }

  /** A piece's outline on the table, as its state has it (not mid-animation). */
  private corners(piece: number): number[] {
    const p = this.state[piece];
    const out: number[] = [];
    for (const ring of this.shapes[piece].rings) {
      for (let i = 0; i < ring.length; i += 2) {
        const [x, y] = turned(ring[i], ring[i + 1], p.r * STEP_DEGREES);
        out.push(p.x + x, p.y + y);
      }
    }
    return out;
  }

  /**
   * Whether anything that just moved now lies against something else:
   * a corner of one within `distance` of a corner of the other. Pieces that
   * fit share their border's corners exactly, so a fit is never missed;
   * this only spares the server questions about pieces nowhere near.
   */
  touches(moved: number[], distance: number): boolean {
    const mine = new Set(moved.flatMap((i) => this.members(i)));
    // Anything over the frame might be in its place.
    if (this.frame) {
      const [minX, minY, maxX, maxY] = this.frame;
      for (const m of mine) {
        const { x, y } = this.state[m];
        const reach = this.shapes[m].radius + distance;
        if (x + reach >= minX && x - reach <= maxX && y + reach >= minY && y - reach <= maxY) return true;
      }
    }
    const others = this.state.map((_, i) => i).filter((i) => !mine.has(i));
    const reach = distance * distance;
    for (const m of mine) {
      const a = this.corners(m);
      for (const o of others) {
        const pm = this.state[m];
        const po = this.state[o];
        if (Math.hypot(pm.x - po.x, pm.y - po.y) > this.shapes[m].radius + this.shapes[o].radius + distance) continue;
        const b = this.corners(o);
        for (let i = 0; i < a.length; i += 2) {
          for (let j = 0; j < b.length; j += 2) {
            const dx = a[i] - b[j];
            const dy = a[i + 1] - b[j + 1];
            if (dx * dx + dy * dy <= reach) return true;
          }
        }
      }
    }
    return false;
  }

  /** The box round everything as drawn: what the camera frames. */
  bounds(): [number, number, number, number] {
    let [minX, minY, maxX, maxY] = this.frame ?? [Infinity, Infinity, -Infinity, -Infinity];
    this.visual.forEach((v, piece) => {
      for (const ring of this.shapes[piece].rings) {
        for (let i = 0; i < ring.length; i += 2) {
          const [x, y] = turned(ring[i], ring[i + 1], v.a);
          minX = Math.min(minX, v.x + x);
          maxX = Math.max(maxX, v.x + x);
          minY = Math.min(minY, v.y + y);
          maxY = Math.max(maxY, v.y + y);
        }
      }
    });
    return [minX, minY, maxX, maxY];
  }

  /** Where everything will be once the animations end: the box the camera heads for. */
  restingBounds(): [number, number, number, number] {
    const visual = this.visual;
    this.visual = this.state.map((p, i) => ({ x: p.x, y: p.y, a: this.animations.get(i)?.to.a ?? p.r * STEP_DEGREES }));
    const box = this.bounds();
    this.visual = visual;
    return box;
  }
}
