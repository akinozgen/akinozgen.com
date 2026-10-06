import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import answersList from "../data/answers.json" with { type: "json" };
import balanced from "../data/answers-v2.json" with { type: "json" };
import countries from "../data/countries.json" with { type: "json" };
import {
  bearing,
  dailyRound,
  endlessRound,
  distanceKm,
  handleVexle,
  judgeGuess,
  latestDate,
  puzzleNumber,
  type VexleVerdict,
} from "../src/server.ts";
import { type Country, ENDLESS_DECK } from "../src/types.ts";

const SEED = "test-seed-not-the-real-one";
const NOW = new Date("2026-10-10T12:00:00Z");
const PACKS = new URL("../tiles/", import.meta.url);
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

  it("never repeats an answer within 45 days, across cycle boundaries too", async () => {
    const answers: string[] = [];
    // Three passes through the list, boundaries included.
    for (let day = 1; day <= answersList.length * 3; day++) answers.push((await dailyRound(SEED, day)).answer);
    for (let i = 0; i < answers.length; i++) {
      const window = answers.slice(Math.max(0, i - 45), i);
      expect(window).not.toContain(answers[i]);
    }
  });

  it("draws only from the frozen answer list, all of them real flags", () => {
    const codes = new Set((countries as Country[]).map((c) => c.code));
    for (const code of answersList) expect(codes.has(code)).toBe(true);
    expect(new Set(answersList).size).toBe(answersList.length);
  });

  it("keeps the days already dealt", async () => {
    // Days 1–3 went out under the old list; the change to it starts on day 4.
    const dealt = await Promise.all([1, 2, 3].map(async (day) => (await dailyRound(SEED, day)).answer));
    expect(dealt).toEqual(["BD", "GQ", "GS"]);
  });

  it("from day 4 deals countries only, Africa at half weight, continents taking turns", async () => {
    const pool = new Set([...balanced.core, ...balanced.half]);
    const african = new Set(balanced.half);
    const seas: Record<string, string> = { MU: "Africa", SC: "Africa", MV: "Asia" };
    const continent = (code: string): string => seas[code] ?? byCode(code).continent;
    const days: string[] = [];
    // Two passes: every core flag twice, every African flag once.
    const span = balanced.core.length * 2 + balanced.half.length;
    for (let day = 4; day < 4 + span; day++) days.push((await dailyRound(SEED, day)).answer);
    expect(days.every((code) => pool.has(code))).toBe(true);
    expect(new Set(days.filter((code) => african.has(code))).size).toBe(balanced.half.length);
    expect(days.filter((code) => african.has(code)).length / span).toBeLessThan(0.18);
    const twice = days.filter((code, i) => i > 0 && continent(code) === continent(days[i - 1])).length;
    expect(twice).toBeLessThanOrEqual(10);
  });

  it("lists every answer once, territories never in the new list", () => {
    const codes = new Set((countries as Country[]).map((c) => c.code));
    const all = [...balanced.core, ...balanced.half];
    for (const code of all) expect(codes.has(code)).toBe(true);
    expect(new Set(all).size).toBe(all.length);
    for (const territory of ["AI", "PN", "TK", "MS", "GU", "PR", "GL", "HK", "AQ", "EH"]) expect(all).not.toContain(territory);
    expect(all).toHaveLength(197);
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

  it("points the way a flat map would, not over the pole", () => {
    // Great-circle, Russia to the Dominican Republic heads due north over
    // the pole. On the map the Caribbean is west-south-west.
    const toCaribbean = bearing(byCode("RU"), byCode("DO"));
    expect(toCaribbean).toBeGreaterThan(235);
    expect(toCaribbean).toBeLessThan(265);
    // Across the Pacific the short way: Guam to the Caribbean is east.
    const fromGuam = bearing(byCode("GU"), byCode("DO"));
    expect(fromGuam).toBeGreaterThan(70);
    expect(fromGuam).toBeLessThan(110);
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

  it("opens the die's tile at the start, then one per guess", async () => {
    const { answer, order } = await dailyRound(SEED, 7);
    const wrong = (countries as Country[]).filter((c) => c.code !== answer).slice(0, 2).map((c) => c.code);

    const start = await judge({ d: "2026-10-10" });
    expect(start.limit).toBe(5);
    expect(start.free).toBe(1);
    // The die's tile is the server's first in the order: the same for everyone.
    expect(start.opened).toEqual([order[0]]);
    expect(start.tiles.filter(Boolean).length).toBe(1);
    expect(start.answer).toBeNull();

    const two = await judge({ d: "2026-10-10", g: wrong.join(",") });
    expect(two.status).toBe("playing");
    expect(two.opened.length).toBe(3);
    expect(two.tiles.filter(Boolean).length).toBe(3);
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
    expect(won.flag).toMatch(/^data:image\/webp;base64,/);
    expect(colour.flag ?? null).toBeNull();
    const finished = await judge({ d: "2026-10-10", g: `${wrong},${answer}` });
    expect(won.tiles).toEqual(finished.tiles);
  });

  it("ends the round after five misses, with every tile open", async () => {
    const { answer } = await dailyRound(SEED, 7);
    const misses = (countries as Country[]).filter((c) => c.code !== answer).map((c) => c.code);
    const four = await judge({ d: "2026-10-10", g: misses.slice(0, 4).join(",") });
    expect(four.status).toBe("playing");
    expect(four.opened.length).toBe(5);
    const lost = await judge({ d: "2026-10-10", g: misses.slice(0, 5).join(",") });
    expect(lost.status).toBe("lost");
    expect(lost.answer).toBe(answer);
    expect(lost.tiles.every(Boolean)).toBe(true);
    expect((await call("judge", { d: "2026-10-10", g: misses.slice(0, 6).join(",") })).status).toBe(400);
  });

  it("keeps day 1 on the rules it was played with", async () => {
    const reply = await handleVexle("judge", new URLSearchParams({ d: "2026-10-04" }), SEED, load, NOW);
    const day1 = reply.body as VexleVerdict;
    expect(day1.limit).toBe(6);
    expect(day1.free).toBe(0);
    expect(day1.tiles.every((t) => t === null)).toBe(true);
  });

  it("rejects junk", async () => {
    expect((await call("judge", { d: "2026-10-10", g: "ZZ" })).status).toBe(400);
    expect((await call("judge", { d: "2026-10-10", g: "FR,FR" })).status).toBe(400);
    expect((await call("judge", { d: "2026-10-10", g: "FR,DE,IT,ES,PT,BE,NL" })).status).toBe(400);
    expect((await call("nope", {})).status).toBe(404);
  });
});

describe("endless", () => {
  const endless = async (params: Record<string, string>) =>
    (await call("endless", params)).body as VexleVerdict;

  it("deals a round from the secret and the round number", async () => {
    const a = await endlessRound(SEED, 12345);
    expect(await endlessRound(SEED, 12345)).toEqual(a);
    let same = 0;
    for (let n = 0; n < 40; n++) {
      if ((await endlessRound(SEED, n)).answer === (await endlessRound("another", n)).answer) same++;
    }
    // Without the secret, the number says nothing about the flag.
    expect(same).toBeLessThan(4);
  });

  it("judges like the daily and reveals only at the end", async () => {
    const { answer } = await endlessRound(SEED, 99);
    const wrong = (countries as Country[]).find((c) => c.code !== answer)!.code;
    const mid = await endless({ e: "99", g: wrong });
    expect(mid.status).toBe("playing");
    expect(mid.answer).toBeNull();
    expect(mid.tiles.filter(Boolean).length).toBe(2);
    expect(JSON.stringify(mid)).not.toContain(`"${answer}"`);
    const won = await endless({ e: "99", g: `${wrong},${answer}` });
    expect(won.status).toBe("won");
    expect(won.answer).toBe(answer);
  });

  it("does not steer around the daily: every flag can turn up", async () => {
    // A rule like "never deal today's flag" would be measurable from outside.
    const seen = new Set<string>();
    for (let n = 0; n < 4000; n++) seen.add((await endlessRound(SEED, n)).answer);
    expect(seen.size).toBe(balanced.core.length + balanced.half.length);
  });

  it("deals a deck: no flag twice until it runs out, Africa at half", async () => {
    const { endlessCard } = await import("../src/server.ts");
    const cards: string[] = [];
    for (let i = 0; i < ENDLESS_DECK; i++) cards.push((await endlessCard(SEED, 777, i)).answer);
    expect(new Set(cards).size).toBe(ENDLESS_DECK);
    expect(cards.filter((code) => balanced.half.includes(code)).length).toBe(ENDLESS_DECK - balanced.core.length);
    expect(await endlessCard(SEED, 777, 5)).toEqual(await endlessCard(SEED, 777, 5));
    const other: string[] = [];
    for (let i = 0; i < 20; i++) other.push((await endlessCard(SEED, 778, i)).answer);
    expect(other).not.toEqual(cards.slice(0, 20));
    expect((await call("endless", { e: "777", i: String(ENDLESS_DECK) })).status).toBe(400);
    expect((await call("endless", { e: "777", i: "-1" })).status).toBe(400);
    const judged = (await call("endless", { e: "777", i: "3", g: cards[3] })).body as VexleVerdict;
    expect(judged.status).toBe("won");
  });

  it("rejects a bad round number and runs only with a secret", async () => {
    expect((await call("endless", { e: "-1" })).status).toBe(400);
    expect((await call("endless", { e: "abc" })).status).toBe(400);
    expect((await call("endless", { e: String(2 ** 32) })).status).toBe(400);
    expect((await call("endless", { e: "5" }, null)).status).toBe(503);
  });
});
