import { describe, expect, it } from "vitest";
import answers from "../data/answers.json" with { type: "json" };
import schedule from "../data/schedule.json" with { type: "json" };
import publicData from "../data/public.json" with { type: "json" };
import { type BabelleVerdict, dailyRound, endlessRound, handleBabelle, puzzleNumber } from "../src/server.ts";

const SEED = "test-seed-not-the-real-one";
const NOW = new Date("2026-10-10T12:00:00Z");
const call = (params: Record<string, string>, seed: string | null = SEED) =>
  handleBabelle("judge", new URLSearchParams(params), seed ?? undefined, NOW);
const verdict = async (params: Record<string, string>) => (await call(params)).body as BabelleVerdict;

describe("the calendar", () => {
  it("numbers days from the epoch", () => {
    expect(puzzleNumber("2026-10-04")).toBe(1);
    expect(puzzleNumber("2026-10-10")).toBe(7);
  });

  it("never repeats a language within 12 days, across cycles", async () => {
    for (const seed of [SEED, "another-seed"]) {
      const seen: string[] = [];
      for (let day = 1; day <= 450; day++) seen.push((await dailyRound(seed, day)).language.id);
      for (let i = 0; i < seen.length; i++) expect(seen.slice(Math.max(0, i - 12), i)).not.toContain(seen[i]);
    }
  });

  it("deals the big languages most and the rare ones least", async () => {
    const count = new Map<string, number>();
    for (let day = 2; day <= 2 + 145 * 4 - 1; day++) {
      const id = (await dailyRound(SEED, day)).language.id;
      count.set(id, (count.get(id) ?? 0) + 1);
    }
    // Four full cycles: three, two or one appearance per cycle.
    for (const id of schedule.tiers.common) expect(count.get(id)).toBe(12);
    for (const id of schedule.tiers.known) expect(count.get(id)).toBe(8);
    for (const id of schedule.tiers.rare) expect(count.get(id)).toBe(4);
  });

  it("keeps day 1 as it was first played", async () => {
    expect((await dailyRound(SEED, 1)).language.id).toBe("sah");
  });

  it("depends on the secret", async () => {
    let same = 0;
    for (let day = 1; day <= 30; day++) {
      if ((await dailyRound(SEED, day)).language.id === (await dailyRound("other", day)).language.id) same++;
    }
    expect(same).toBeLessThan(4);
  });
});

describe("the questions", () => {
  it("are five, with four distinct options and one right answer each, every day", async () => {
    for (let day = 1; day <= answers.length; day++) {
      const round = await dailyRound(SEED, day);
      expect(round.questions.length).toBe(5);
      round.questions.forEach((q, i) => {
        expect(q.options.length).toBe(4);
        expect(new Set(q.options).size).toBe(4);
        expect(round.correct[i]).toBeGreaterThanOrEqual(0);
        expect(round.correct[i]).toBeLessThan(4);
      });
    }
  });

  it("asks about real concepts", async () => {
    const concepts = new Set(publicData.concepts.map((c) => c.id));
    const round = await dailyRound(SEED, 3);
    for (const q of round.questions) {
      if (q.kind === "word" || q.kind === "which") expect(concepts.has(q.concept)).toBe(true);
      if (q.kind === "meaning") for (const o of q.options) expect(concepts.has(o)).toBe(true);
    }
  });
});

describe("the API", () => {
  it("shows one question at a time and never names the language mid-round", async () => {
    const first = await verdict({ d: "2026-10-10" });
    expect(first.questions.length).toBe(1);
    expect(first.phase).toBe("questions");
    expect(first.reveal).toBeNull();

    const round = await dailyRound(SEED, 7);
    const third = await verdict({ d: "2026-10-10", a: "0,1" });
    expect(third.questions.length).toBe(3);
    expect(third.answers).toEqual([
      { chosen: 0, correct: round.correct[0] },
      { chosen: 1, correct: round.correct[1] },
    ]);
    expect(JSON.stringify(third)).not.toContain(`"${round.language.id}"`);
  });

  it("moves to the final after five answers and reveals on a win", async () => {
    const round = await dailyRound(SEED, 7);
    const final = await verdict({ d: "2026-10-10", a: "0,0,0,0,0" });
    expect(final.phase).toBe("final");
    expect(final.reveal).toBeNull();

    const won = await verdict({ d: "2026-10-10", a: "0,0,0,0,0", g: round.language.id });
    expect(won.status).toBe("won");
    expect(won.phase).toBe("done");
    expect(won.reveal?.language).toBe(round.language.id);
    expect(won.reveal?.words.length).toBeGreaterThanOrEqual(3);
  });

  it("scores a wrong guess with distance, direction and family", async () => {
    const round = await dailyRound(SEED, 7);
    const wrong = round.language.id === "eng" ? "jpn" : "eng";
    const reply = await verdict({ d: "2026-10-10", a: "0,0,0,0,0", g: wrong });
    expect(reply.status).toBe("playing");
    expect(reply.guesses[0].km).toBeGreaterThan(0);
    expect(reply.guesses[0].bearing).toBeGreaterThanOrEqual(0);
    expect(typeof reply.guesses[0].sameFamily).toBe("boolean");
  });

  it("ends after three wrong guesses", async () => {
    const round = await dailyRound(SEED, 7);
    const wrong = ["eng", "jpn", "fin", "arb"].filter((id) => id !== round.language.id).slice(0, 3);
    const lost = await verdict({ d: "2026-10-10", a: "0,0,0,0,0", g: wrong.join(",") });
    expect(lost.status).toBe("lost");
    expect(lost.reveal?.language).toBe(round.language.id);
  });

  it("refuses the future, junk, and running without a secret", async () => {
    expect((await call({ d: "2026-10-12" })).status).toBe(404);
    expect((await call({ d: "2026-10-10", a: "4" })).status).toBe(400);
    expect((await call({ d: "2026-10-10", g: "eng" })).status).toBe(400);
    expect((await call({ d: "2026-10-10", a: "0,0,0,0,0", g: "xxx" })).status).toBe(400);
    expect((await call({ d: "2026-10-10" }, null)).status).toBe(503);
  });
});

describe("endless", () => {
  const endless = async (params: Record<string, string>) =>
    (await handleBabelle("endless", new URLSearchParams(params), SEED, NOW)).body as BabelleVerdict;

  it("deals a round from the secret and the round number", async () => {
    const a = await endlessRound(SEED, 777);
    expect((await endlessRound(SEED, 777)).language.id).toBe(a.language.id);
    let same = 0;
    for (let n = 0; n < 40; n++) {
      if ((await endlessRound(SEED, n)).language.id === (await endlessRound("another", n)).language.id) same++;
    }
    expect(same).toBeLessThan(5);
  });

  it("plays like the daily: one question at a time, the language only at the end", async () => {
    const round = await endlessRound(SEED, 777);
    const first = await endless({ e: "777" });
    expect(first.questions.length).toBe(1);
    expect(first.reveal).toBeNull();
    expect(JSON.stringify(first)).not.toContain(`"${round.language.id}"`);
    const won = await endless({ e: "777", a: "0,0,0,0,0", g: round.language.id });
    expect(won.status).toBe("won");
    expect(won.reveal?.language).toBe(round.language.id);
  });

  it("does not steer around the daily: every language can turn up", async () => {
    const seen = new Set<string>();
    for (let n = 0; n < 3000; n++) seen.add((await endlessRound(SEED, n)).language.id);
    expect(seen.size).toBe(answers.length);
  });

  it("builds a sound round for many numbers", async () => {
    for (let n = 0; n < 300; n++) {
      const round = await endlessRound(SEED, n);
      for (const q of round.questions) expect(new Set(q.options).size).toBe(4);
    }
  });

  it("rejects a bad round number", async () => {
    for (const e of ["-1", "x", String(2 ** 32)]) {
      expect((await handleBabelle("endless", new URLSearchParams({ e }), SEED, NOW)).status).toBe(400);
    }
  });
});

describe("familiar decoys", () => {
  it("fills options only with languages a player may have met", async () => {
    const familiar = new Set([...schedule.tiers.common, ...schedule.tiers.known]);
    const srv = (await import("../data/server.json", { with: { type: "json" } })).default as {
      languages: Array<{ id: string; family: string }>;
      forms: Record<string, Record<string, string>>;
    };
    const family = new Map(srv.languages.map((l) => [l.id, l.family]));
    for (let day = 2; day <= 300; day++) {
      const round = await dailyRound(SEED, day);
      for (const q of round.questions) {
        if (q.kind === "relative" || q.kind === "neighbour") {
          // The right answer may be an obscure relative; the decoys never are.
          q.options.forEach((id, i) => {
            if (i !== round.correct[round.questions.indexOf(q)]) expect(familiar.has(id)).toBe(true);
          });
        }
        if (q.kind === "which") {
          // Every decoy word belongs to a familiar language or a relative of the day's.
          for (const word of q.options) {
            if (word === srv.forms[round.language.id][q.concept]) continue;
            const owners = [...family.keys()].filter((id) => srv.forms[id][q.concept] === word);
            expect(owners.some((id) => familiar.has(id) || family.get(id) === round.language.family)).toBe(true);
          }
        }
      }
    }
  });
});

describe("withdrawn languages", () => {
  it("never appear as the language, an option, or in the browser's list", async () => {
    const { WITHDRAWN } = await import("../src/types.ts");
    for (const id of WITHDRAWN) {
      expect(answers).not.toContain(id);
      expect(publicData.languages.some((l) => l.id === id)).toBe(false);
    }
    for (let n = 1; n <= 400; n++) {
      for (const round of [await dailyRound(SEED, n), await endlessRound(SEED, n)]) {
        expect(WITHDRAWN.has(round.language.id)).toBe(false);
        for (const q of round.questions) for (const o of q.options) expect(WITHDRAWN.has(o)).toBe(false);
      }
    }
  });

  it("can't be guessed", async () => {
    expect((await call({ d: "2026-10-10", a: "0,0,0,0,0", g: "kmr" })).status).toBe(400);
  });
});
