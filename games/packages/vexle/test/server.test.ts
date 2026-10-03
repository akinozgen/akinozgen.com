import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import countries from "../data/countries.json" with { type: "json" };
import {
  bearing,
  dailyRound,
  distanceKm,
  handleVexle,
  judgeGuess,
  latestDate,
  puzzleNumber,
  type VexleVerdict,
} from "../src/server.ts";
import type { Country } from "../src/types.ts";

const SEED = "test-seed-not-the-real-one";
const NOW = new Date("2026-10-10T12:00:00Z");
const PACKS = new URL("../../../../public/games/vexle-tiles/", import.meta.url);
const load = async (code: string) => new Uint8Array(await readFile(new URL(`${code.toLowerCase()}.bin`, PACKS)));
const byCode = (code: string) => (countries as Country[]).find((c) => c.code === code)!;

const call = (action: string, params: Record<string, string>, seed: string | null = SEED) =>
  handleVexle(action, new URLSearchParams(params), seed ?? undefined, load, NOW);

const judge = async (params: Record<string, string>) => (await call("judge", params)).body as VexleVerdict;

describe("the calendar", () => {
  it("numbers days from the epoch", () => {
    expect(puzzleNumber("2026-10-04")).toBe(1);
    expect(puzzleNumber("2026-10-10")).toBe(7);
    expect(puzzleNumber("2026-02-30")).toBeNull();
  });

  it("is the same for everyone, and changes with the secret", async () => {
    expect(await dailyRound(SEED, 9)).toEqual(await dailyRound(SEED, 9));
    let same = 0;
    for (let day = 1; day <= 30; day++) {
      if ((await dailyRound(SEED, day)).answer === (await dailyRound("another", day)).answer) same++;
    }
    expect(same).toBeLessThan(3);
  });

  it("does not repeat an answer within weeks", async () => {
    const answers: string[] = [];
    for (let day = 1; day <= 40; day++) answers.push((await dailyRound(SEED, day)).answer);
    expect(new Set(answers).size).toBeGreaterThanOrEqual(39);
  });

  it("opens every tile exactly once", async () => {
    const { order } = await dailyRound(SEED, 3);
    expect([...order].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("knows the latest date anywhere on Earth", () => {
    expect(latestDate(new Date("2026-10-04T11:00:00Z"))).toBe("2026-10-05");
  });
});

describe("geometry", () => {
  it("measures distance and direction", () => {
    const tr = byCode("TR");
    const de = byCode("DE");
    expect(distanceKm(tr, de)).toBeGreaterThan(1800);
    expect(distanceKm(tr, de)).toBeLessThan(2600);
    // Germany lies north-west of Turkey.
    const toGermany = bearing(tr, de);
    expect(toGermany).toBeGreaterThan(280);
    expect(toGermany).toBeLessThan(330);
  });

  it("scores the answer as 100 and anything else below", () => {
    expect(judgeGuess(byCode("FR"), byCode("FR"))).toEqual({ code: "FR", km: 0, bearing: null, proximity: 100 });
    expect(judgeGuess(byCode("BE"), byCode("FR")).proximity).toBeLessThan(100);
  });
});

describe("the API", () => {
  it("serves the day without saying what it is", async () => {
    const reply = await call("daily", { date: "2026-10-10" });
    expect(reply.status).toBe(200);
    expect(reply.body).toEqual({ number: 7, date: "2026-10-10" });
  });

  it("refuses days not yet begun, and runs only with a secret", async () => {
    expect((await call("daily", { date: "2026-10-12" })).status).toBe(404);
    expect((await call("judge", { d: "2026-10-12", g: "FR" })).status).toBe(404);
    expect((await call("daily", { date: "2026-10-10" }, null)).status).toBe(503);
  });

  it("opens one tile per guess and keeps the rest covered", async () => {
    const { answer } = await dailyRound(SEED, 7);
    const wrong = (countries as Country[]).filter((c) => c.code !== answer).slice(0, 2).map((c) => c.code);

    const none = await judge({ d: "2026-10-10" });
    expect(none.tiles.every((t) => t === null)).toBe(true);
    expect(none.answer).toBeNull();

    const two = await judge({ d: "2026-10-10", g: wrong.join(",") });
    expect(two.status).toBe("playing");
    expect(two.opened.length).toBe(2);
    expect(two.tiles.filter(Boolean).length).toBe(2);
    expect(two.tiles[two.opened[0]]).toMatch(/^data:image\/webp;base64,/);
    expect(two.answer).toBeNull();
    // Nothing in the reply names the answer while the round is on.
    expect(JSON.stringify(two)).not.toContain(`"${answer}"`);
  });

  it("serves grey tiles in hard mode, and the full colour flag at the end", async () => {
    const { answer } = await dailyRound(SEED, 7);
    const wrong = (countries as Country[]).find((c) => c.code !== answer)!.code;
    const colour = await judge({ d: "2026-10-10", g: wrong });
    const grey = await judge({ d: "2026-10-10", g: wrong, hard: "1" });
    expect(grey.tiles[grey.opened[0]]).not.toBe(colour.tiles[colour.opened[0]]);

    const won = await judge({ d: "2026-10-10", g: `${wrong},${answer}`, hard: "1" });
    expect(won.status).toBe("won");
    expect(won.answer).toBe(answer);
    expect(won.tiles.every(Boolean)).toBe(true);
    const finished = await judge({ d: "2026-10-10", g: `${wrong},${answer}` });
    expect(won.tiles).toEqual(finished.tiles);
  });

  it("ends the round after six misses", async () => {
    const { answer } = await dailyRound(SEED, 7);
    const misses = (countries as Country[]).filter((c) => c.code !== answer).slice(0, 6).map((c) => c.code);
    const lost = await judge({ d: "2026-10-10", g: misses.join(",") });
    expect(lost.status).toBe("lost");
    expect(lost.answer).toBe(answer);
  });

  it("rejects junk", async () => {
    expect((await call("judge", { d: "2026-10-10", g: "ZZ" })).status).toBe(400);
    expect((await call("judge", { d: "2026-10-10", g: "FR,FR" })).status).toBe(400);
    expect((await call("judge", { d: "2026-10-10", g: "FR,DE,IT,ES,PT,BE,NL" })).status).toBe(400);
    expect((await call("nope", {})).status).toBe(404);
  });
});
