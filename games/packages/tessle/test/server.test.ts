import { describe, expect, it } from "vitest";
import geo from "../../geo/data/geo.json" with { type: "json" };
import names from "../data/names.json" with { type: "json" };
import world from "../data/world.json" with { type: "json" };
import {
  cutRound,
  dailyGroup,
  dailyRound,
  endlessRound,
  ERAS,
  GROUPS,
  handleTessle,
  judgeFit,
  latestDate,
  puzzleNumber,
  type Round,
} from "../src/server.ts";
import { type FitReply, LANGUAGES, type PieceState, type Puzzle, type Reveal, STEPS } from "../src/types.ts";

const SEED = "test-seed-not-the-real-one";
const NOW = new Date("2026-10-10T12:00:00Z");
const DAY = "2026-10-07";

const call = (action: string, params: Record<string, string>, seed: string | null = SEED) =>
  handleTessle(action, new URLSearchParams(params), seed ?? undefined, NOW);

const turn = (x: number, y: number, steps: number): [number, number] => {
  const a = (((steps % STEPS) + STEPS) % STEPS) * (Math.PI / 6);
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
};

/** The board as the reveal says it goes, turned `extra` steps as one and moved to (ox, oy). */
function solvedBoard(reveal: Reveal, extra = 0, ox = 0, oy = 0): PieceState[] {
  return reveal.home.map(([x, y], i) => {
    const [tx, ty] = turn(x, y, extra);
    return { x: ox + tx, y: oy + ty, r: (reveal.turns[i] + extra) % STEPS };
  });
}

const encode = (board: PieceState[]): string => board.map(({ x, y, r }) => `${x.toFixed(2)},${y.toFixed(2)},${r}`).join(";");

const fit = async (board: PieceState[], extra: Record<string, string> = {}): Promise<FitReply> => {
  const reply = await call("fit", { d: DAY, p: encode(board), ...extra });
  expect(reply.status).toBe(200);
  return reply.body as FitReply;
};

const revealFor = async (): Promise<Reveal> => (await call("reveal", { d: DAY })).body as Reveal;

describe("the calendar", () => {
  it("numbers days from the epoch", () => {
    expect(puzzleNumber("2026-10-05")).toBe(1);
    expect(puzzleNumber("2026-10-11")).toBe(7);
    expect(puzzleNumber("2026-02-30")).toBeNull();
    expect(latestDate(new Date("2026-10-10T12:00:00Z"))).toBe("2026-10-11");
  });

  it("is the same for everyone, and changes with the secret", async () => {
    expect(await dailyGroup(SEED, 9)).toBe(await dailyGroup(SEED, 9));
    let same = 0;
    for (let day = 1; day <= 30; day++) {
      if ((await dailyGroup(SEED, day)) === (await dailyGroup("another", day))) same++;
    }
    expect(same).toBeLessThan(5);
  });

  it("deals every group once per pass, and not again straight after", async () => {
    const length = ERAS[0].groups;
    const pass = await Promise.all(Array.from({ length }, (_, i) => dailyGroup(SEED, i + 1)));
    expect(new Set(pass).size).toBe(length);
    const tail = new Set(pass.slice(-30));
    for (let day = length + 1; day <= length + 30; day++) {
      expect(tail.has(await dailyGroup(SEED, day))).toBe(false);
    }
  });

  it("rarely deals the same continent two days running", async () => {
    const length = ERAS[0].groups;
    const continentOf = new Map((world as { regions: Array<{ id: string; continent: string }> }).regions.map((r) => [r.id, r.continent]));
    const main = (group: string[]): string => {
      const votes = new Map<string, number>();
      for (const id of group) votes.set(continentOf.get(id)!, (votes.get(continentOf.get(id)!) ?? 0) + 1);
      return [...votes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    };
    const days = await Promise.all(Array.from({ length: length * 2 }, (_, i) => dailyGroup(SEED, i + 1)));
    const repeats = days.filter((group, i) => i > 0 && main(GROUPS[group]) === main(GROUPS[days[i - 1]])).length;
    expect(repeats).toBeLessThanOrEqual(12);
  });

  it("only cycles through groups that exist, era by era", () => {
    for (let i = 0; i < ERAS.length; i++) {
      expect(ERAS[i].groups).toBeLessThanOrEqual(GROUPS.length);
      if (i > 0) {
        expect(ERAS[i].from).toBeGreaterThan(ERAS[i - 1].from);
        expect(ERAS[i].groups).toBeGreaterThanOrEqual(ERAS[i - 1].groups);
      }
    }
  });

  it("refuses days that have not begun anywhere", async () => {
    expect((await call("daily", { date: "2026-10-12" })).status).toBe(404);
    expect((await call("daily", { date: "2026-10-11" })).status).toBe(200);
    expect((await call("daily", { date: "2026-10-04" })).status).toBe(400);
  });
});

describe("the pieces", () => {
  it("are sent turned, centred and shuffled, with nothing about where they go", async () => {
    const reply = await call("daily", { date: DAY });
    expect(reply.status).toBe(200);
    const puzzle = reply.body as Puzzle;
    expect(puzzle.number).toBe(3);
    expect(puzzle.date).toBe(DAY);
    expect(puzzle.round).toBeNull();
    expect(puzzle.pieces.length).toBe(GROUPS[await dailyGroup(SEED, 3)].length);
    const text = JSON.stringify(puzzle);
    for (const secret of ["home", "turns", "centres", "pairs"]) expect(text).not.toContain(secret);
    for (const piece of puzzle.pieces) {
      expect(piece.id).toBeTypeOf("string");
      expect(piece.label).toHaveLength(2);
      for (const ring of piece.rings) {
        expect(ring.length % 2).toBe(0);
        expect(ring.length).toBeGreaterThanOrEqual(6);
      }
    }
    // Some piece arrives off north: the turns are the server's, not zero.
    expect((await dailyRound(SEED, 3)).turns.some((k) => k !== 0)).toBe(true);
  });

  it("keep their names to themselves in hard mode", async () => {
    const puzzle = (await call("daily", { date: DAY, hard: "1" })).body as Puzzle;
    expect(puzzle.pieces.every((piece) => piece.id === undefined)).toBe(true);
    expect(JSON.stringify(puzzle)).not.toMatch(/"id"/);
  });

  it("deal endless rounds from the browser's number, the same each time", async () => {
    const a = (await call("endless", { e: "12345" })).body as Puzzle;
    const b = (await call("endless", { e: "12345" })).body as Puzzle;
    expect(a).toEqual(b);
    expect(a.round).toBe(12345);
    expect(a.number).toBeNull();
    let differ = 0;
    for (let e = 0; e < 10; e++) {
      const x = await endlessRound(SEED, e);
      const y = await endlessRound(SEED, e + 100);
      if (x.ids.join() !== y.ids.join()) differ++;
    }
    expect(differ).toBeGreaterThan(5);
  });
});

describe("fitting", () => {
  it("calls the map whole when every piece is in place", async () => {
    const reveal = await revealFor();
    const reply = await fit(solvedBoard(reveal, 0, 200, -50));
    expect(reply.solved).toBe(true);
    expect(reply.groups).toEqual([reveal.ids.map((_, i) => i)]);
    expect(reply.reveal).toEqual(reveal);
    expect(reply.at.every((point) => point !== null)).toBe(true);
  });

  it("does not mind which way the whole map faces", async () => {
    const reveal = await revealFor();
    const reply = await fit(solvedBoard(reveal, 4, -300, 80));
    expect(reply.solved).toBe(true);
  });

  it("snaps a near miss exactly into place, around the pieces that stayed still", async () => {
    const reveal = await revealFor();
    const board = solvedBoard(reveal, 2);
    const exact = { ...board[0] };
    board[0] = { ...board[0], x: board[0].x + 5, y: board[0].y - 4 };
    const reply = await fit(board, { m: "0", u: "1" });
    expect(reply.solved).toBe(true);
    expect(reply.at[0]![0]).toBeCloseTo(exact.x, 1);
    expect(reply.at[0]![1]).toBeCloseTo(exact.y, 1);
    // The still pieces stay where they were.
    expect(reply.at[1]![0]).toBeCloseTo(board[1].x, 1);
  });

  it("leaves a piece loose beyond the snap distance, which grows as the board shrinks", async () => {
    const reveal = await revealFor();
    const board = solvedBoard(reveal);
    board[0] = { ...board[0], x: board[0].x + 15 };
    const tight = await fit(board, { m: "0", u: "1" });
    expect(tight.solved).toBe(false);
    expect(tight.at[0]).toBeNull();
    const loose = await fit(board, { m: "0", u: "4" });
    expect(loose.solved).toBe(true);
    // Whatever the browser claims, the distance has a ceiling.
    board[0] = { ...board[0], x: board[0].x + 60 };
    expect((await fit(board, { m: "0", u: "1000" })).at[0]).toBeNull();
  });

  it("needs a piece to face the same way as its neighbours", async () => {
    const reveal = await revealFor();
    const board = solvedBoard(reveal);
    board[0] = { ...board[0], r: (board[0].r + 1) % STEPS };
    const reply = await fit(board);
    expect(reply.solved).toBe(false);
    expect(reply.at[0]).toBeNull();
    expect(reply.reveal).toBeNull();
  });

  it("only joins pieces that share a border", async () => {
    const round = await dailyRound(SEED, 3);
    const n = round.ids.length;
    const pairs = new Set(round.pairs.map((pair) => pair.join(",")));
    let apart: [number, number] | null = null;
    for (let i = 0; i < n && !apart; i++) {
      for (let j = i + 1; j < n && !apart; j++) if (!pairs.has(`${i},${j}`)) apart = [i, j];
    }
    expect(apart).not.toBeNull();
    const reveal = await revealFor();
    const solved = solvedBoard(reveal);
    // Only the two strangers in place; everyone else scattered far apart.
    const board = solved.map((state, i) =>
      i === apart![0] || i === apart![1] ? state : { ...state, x: 5000 + i * 3000, y: -5000 },
    );
    const reply = await fit(board);
    expect(reply.groups).toEqual([]);
  });

  it("refuses a board it cannot read", async () => {
    const reveal = await revealFor();
    const good = encode(solvedBoard(reveal));
    const n = reveal.ids.length;
    const bad: Array<Record<string, string>> = [
      { d: DAY, p: good.split(";").slice(1).join(";") },
      { d: DAY, p: good.replace(/^[^,]+/, "NaN") },
      { d: DAY, p: good.replace(/^[^,]+/, "") },
      { d: DAY, p: good.replace(/^[^,]+/, "1e9") },
      { d: DAY, p: good.replace(/^([^,]+,[^,]+),\d+/, "$1,12") },
      { d: DAY, p: good.replace(/^([^,]+,[^,]+),\d+/, "$1,1.5") },
      { d: DAY, p: good, m: String(n) },
      { d: DAY, p: good, m: "-1" },
      { e: "-1", p: good },
      { e: "1.5", p: good },
      { d: "2026-13-01", p: good },
    ];
    for (const params of bad) expect((await call("fit", params)).status, JSON.stringify(params)).toBe(400);
  });

  it("answers only what it knows, and only with a secret", async () => {
    expect((await call("answer", { d: DAY })).status).toBe(404);
    expect((await call("daily", { date: DAY }, null)).status).toBe(503);
    const reply = await call("daily", { date: DAY });
    expect(reply.cache).toContain("max-age");
    expect((await call("fit", { d: DAY, p: "x" })).cache).toBe("no-store");
  });

  it("hands over the answer on giving up", async () => {
    const reveal = await revealFor();
    const round = await dailyRound(SEED, 3);
    expect(reveal.ids).toEqual(round.ids);
    expect(reveal.turns.every((t, i) => (t + round.turns[i]) % STEPS === 0)).toBe(true);
    expect(judgeFit(round, solvedBoard(reveal), new Set(), 1).solved).toBe(true);
  });
});

describe("the data", () => {
  const W = world as unknown as {
    regions: Array<{ id: string; areas: number[] }>;
    areas: Array<{ region: number; kind: string; touches?: number[]; rings: number[][] }>;
  };
  const regionIndex = new Map(W.regions.map((region, i) => [region.id, i]));

  it("goes round the world rather than living in Africa", () => {
    const continentOf = new Map((geo as { regions: Array<{ id: string; continent: string }> }).regions.map((r) => [r.id, r.continent]));
    const counts = new Map<string, number>();
    for (const group of GROUPS) {
      const votes = new Map<string, number>();
      for (const id of group) votes.set(continentOf.get(id)!, (votes.get(continentOf.get(id)!) ?? 0) + 1);
      const main = [...votes].sort((a, b) => b[1] - a[1])[0][0];
      counts.set(main, (counts.get(main) ?? 0) + 1);
    }
    const share = (name: string): number => (counts.get(name) ?? 0) / GROUPS.length;
    expect(share("Africa")).toBeLessThanOrEqual(0.23);
    expect(share("Europe")).toBeLessThanOrEqual(0.37);
    expect(share("Asia")).toBeGreaterThan(0.2);
    expect(share("South America") + share("North America")).toBeGreaterThan(0.1);
  });

  it("names every piece in every language", () => {
    const named = names as Record<string, Record<string, string>>;
    for (const id of new Set(GROUPS.flat())) {
      for (const language of LANGUAGES) expect(named[id]?.[language], `${id}.${language}`).toBeTruthy();
    }
  });

  it("deals groups of five to seven, all different, all joined by land", () => {
    const keys = new Set<string>();
    const random = (): number => 0.5;
    for (const group of GROUPS) {
      expect(group.length).toBeGreaterThanOrEqual(5);
      expect(group.length).toBeLessThanOrEqual(7);
      const key = [...group].sort().join();
      expect(keys.has(key)).toBe(false);
      keys.add(key);
      const round: Round = cutRound(group, random);
      const parent = group.map((_, i) => i);
      const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
      for (const [a, b] of round.pairs) parent[find(a)] = find(b);
      expect(new Set(group.map((_, i) => find(i))).size, group.join()).toBe(1);
    }
  });

  it("keeps pieces within a sensible size of each other, and groups within one projection", () => {
    for (const group of GROUPS) {
      const members = new Set(group.map((id) => regionIndex.get(id)!));
      let minLon = Infinity;
      let minLat = Infinity;
      let maxLon = -Infinity;
      let maxLat = -Infinity;
      for (const id of group) {
        for (const area of W.regions[regionIndex.get(id)!].areas) {
          const { kind, touches, rings } = W.areas[area];
          if (kind === "border" && !(touches ?? []).some((other) => members.has(other))) continue;
          for (const ring of rings) {
            for (let i = 0; i < ring.length; i += 2) {
              minLon = Math.min(minLon, ring[i]);
              maxLon = Math.max(maxLon, ring[i]);
              minLat = Math.min(minLat, ring[i + 1]);
              maxLat = Math.max(maxLat, ring[i + 1]);
            }
          }
        }
      }
      const cos = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
      const extent = Math.max((maxLat - minLat) * 111.32, (maxLon - minLon) * 111.32 * cos);
      expect(extent, group.join()).toBeLessThanOrEqual(5500);

      // The projection is equal-area, so piece areas compare as land does.
      const round = cutRound(group, () => 0);
      const areas = round.pieces.map((piece) =>
        Math.max(
          ...piece.rings.map((ring) => {
            let sum = 0;
            for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
              sum += ring[j] * ring[i + 1] - ring[i] * ring[j + 1];
            }
            return Math.abs(sum / 2);
          }),
        ),
      );
      // Measured on the biggest landmass alone, so the build's bound of 30 gets some slack.
      expect(Math.max(...areas) / Math.min(...areas), group.join()).toBeLessThanOrEqual(40);
    }
  });
});
