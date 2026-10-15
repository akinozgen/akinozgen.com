import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chooseMove } from "../src/bot.ts";
import { loadGame } from "../src/save.ts";
import { Lexicon } from "../src/lexicon.ts";
import { seeded } from "../src/rng.ts";
import { toWire } from "../src/server/protocol.ts";
import {
  createInvite,
  createMatched,
  type Deps,
  handle,
  IDLE_TTL,
  INVITE_TTL,
  noticesFor,
  onAlarm,
  OVER_TTL,
  rename,
  type Room,
  stateFor,
  summaryOf,
} from "../src/server/room.ts";
import { tableFromJson } from "../src/view.ts";

const words = Lexicon.parse(readFileSync(new URL("../data/kelimeler.txt", import.meta.url), "utf8"));
const everyday = Lexicon.parse(readFileSync(new URL("../data/yaygin.txt", import.meta.url), "utf8"));

function deps(label = "deps"): Deps & { tick: (ms: number) => void } {
  let now = 1_760_000_000_000;
  let seeds = 0;
  const random = seeded(label);
  return {
    now: () => now,
    seed: () => `${label}-seed-${seeds++}`,
    random,
    lexicon: () => words,
    tick: (ms) => (now += ms),
  };
}

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const both = [true, true];

const tableOf = (room: Room, pub: string) => {
  const message = stateFor(room, pub, both);
  return message.t === "room" ? tableFromJson(message.table) : null;
};

/** Plays the seat whose turn it is with the computer's choice, through the room. */
function botTurn(room: Room, d: Deps): Room {
  const game = loadGame(room.game!)!;
  const pub = room.seats[game.turn]!;
  const action = chooseMove(game, everyday, "zor");
  const n = game.log.length;
  const request =
    action.kind === "play"
      ? ({ t: "play", n, p: action.placements.map(toWire) } as const)
      : action.kind === "swap"
        ? ({ t: "swap", n, tiles: action.tiles } as const)
        : ({ t: "pass", n } as const);
  const outcome = handle(room, pub, request, d);
  expect(outcome.reply, JSON.stringify(outcome.reply)).toBeUndefined();
  expect(outcome.changed).toBe(true);
  return outcome.room!;
}

describe("an invitation", () => {
  it("seats the host, waits, and starts a game when someone opens the link", () => {
    const d = deps();
    const room = createInvite("K7Q2XM", A, d);
    expect(room.phase).toBe("waiting");
    expect(room.seats.filter(Boolean)).toEqual([A]);
    expect(stateFor(room, A, both)).toMatchObject({ t: "room", room: { you: room.host, phase: "waiting" }, table: null });
    // A visitor sees who is asking, and no seat of their own.
    expect(stateFor(room, B, both)).toMatchObject({ room: { you: null, host: room.host, seats: expect.any(Array) } });

    const joined = handle(room, B, { t: "join" }, d);
    expect(joined).toMatchObject({ changed: true, broadcast: true });
    const playing = joined.room!;
    expect(playing.phase).toBe("playing");
    expect(playing.seats).toContain(A);
    expect(playing.seats).toContain(B);
    expect(playing.gameNo).toBe(1);
    expect(tableOf(playing, A)?.rack).toHaveLength(7);
    expect(tableOf(playing, B)?.rack).toHaveLength(7);

    // The host joining again changes nothing; a third person finds it full.
    expect(handle(playing, A, { t: "join" }, d).changed).toBe(false);
    expect(handle(playing, C, { t: "join" }, d).reply).toEqual({ t: "error", code: "dolu" });
  });

  it("can be withdrawn by the host only", () => {
    const d = deps();
    const room = createInvite("K7Q2XM", A, d);
    expect(handle(room, B, { t: "cancel" }, d).changed).toBe(false);
    expect(handle(room, A, { t: "cancel" }, d)).toMatchObject({ room: null, changed: true });
  });
});

describe("a game in a room", () => {
  it("never lets a browser see the seed, the bag or the other rack until the end", () => {
    const d = deps("leak");
    let room = createMatched("Q9TR4K", [A, B], d);
    expect(room.phase).toBe("playing");
    let turns = 0;
    while (room.phase === "playing") {
      const game = loadGame(room.game!)!;
      for (const [pub, other] of [
        [A, B],
        [B, A],
      ] as const) {
        const json = JSON.stringify(stateFor(room, pub, both));
        expect(json).not.toContain(game.seed);
        expect(json).not.toContain('"bag"');
        const otherSeat = room.seats.indexOf(other);
        expect(json).not.toContain(`"rack":${JSON.stringify(game.racks[otherSeat])}`);
        expect(json).not.toContain("finalRacks");
      }
      room = botTurn(room, d);
      if (++turns > 200) throw new Error("game never ended");
    }
    expect(turns).toBeGreaterThan(15);
    const end = JSON.parse(JSON.stringify(stateFor(room, A, both)));
    expect(end.table.over).not.toBeNull();
    expect(end.table.finalRacks).toHaveLength(2);
    expect(JSON.stringify(end)).not.toContain(loadGame(room.game!)!.seed);
  }, 20_000);

  it("drops an action meant for an older table, and turns down what the rules don't allow", () => {
    const d = deps();
    const room = createMatched("Q9TR4K", [A, B], d);
    const game = loadGame(room.game!)!;
    const mover = room.seats[game.turn]!;
    const waiter = room.seats[1 - game.turn]!;
    expect(handle(room, mover, { t: "pass", n: 3 }, d)).toMatchObject({ changed: false, resend: true });
    expect(handle(room, waiter, { t: "pass", n: 0 }, d).reply).toMatchObject({ t: "refused", refusal: { kind: "turn" } });
    // Tiles the player doesn't have, or a word that isn't one.
    expect(handle(room, mover, { t: "play", n: 0, p: [[112, 12, 0], [113, 12, 0]] }, d).reply).toMatchObject({
      t: "refused",
    });
    expect(handle(room, C, { t: "pass", n: 0 }, d).reply).toEqual({ t: "error", code: "kimlik" });
    const passed = handle(room, mover, { t: "pass", n: 0 }, d);
    expect(passed).toMatchObject({ changed: true, broadcast: true });
    expect(loadGame(passed.room!.game!)!.log).toHaveLength(1);
  });

  it("lets either side resign at any time", () => {
    const d = deps();
    const room = createMatched("Q9TR4K", [A, B], d);
    const game = loadGame(room.game!)!;
    const waiter = room.seats[1 - game.turn]!;
    const outcome = handle(room, waiter, { t: "resign" }, d);
    expect(outcome.room!.phase).toBe("over");
    expect(loadGame(outcome.room!.game!)!.over).toMatchObject({ reason: "resign", winner: game.turn });
  });

  it("starts a rematch once both ask, the other side going first", () => {
    const d = deps();
    let room = createMatched("Q9TR4K", [A, B], d);
    const first = loadGame(room.game!)!.first;
    room = handle(room, A, { t: "resign" }, d).room!;
    const asked = handle(room, B, { t: "rematch" }, d);
    expect(asked.room!.rematch).toEqual(room.seats.map((s) => s === B));
    expect(asked.room!.phase).toBe("over");
    expect(handle(asked.room!, B, { t: "rematch" }, d).changed).toBe(false);
    const again = handle(asked.room!, A, { t: "rematch" }, d).room!;
    expect(again.phase).toBe("playing");
    expect(again.gameNo).toBe(2);
    expect(loadGame(again.game!)!.first).toBe(1 - first!);
    expect(loadGame(again.game!)!.seed).not.toBe(loadGame(room.game!)!.seed);
  });

  it("sums itself up for the list of games", () => {
    const d = deps();
    const room = createMatched("Q9TR4K", [A, B], d);
    const summary = summaryOf(room, "Q9TR4K", A);
    expect(summary).toMatchObject({ code: "Q9TR4K", phase: "playing", you: room.seats.indexOf(A), scores: [0, 0], winner: null });
    expect(summaryOf(room, "Q9TR4K", C)).toMatchObject({ you: null });
    expect(summaryOf(null, "ZZZZZZ", A)).toEqual({ code: "ZZZZZZ", gone: true });
  });
});

describe("the room's alarm", () => {
  it("clears unanswered invitations, closes idle games, clears finished rooms", () => {
    const d = deps();
    const invite = createInvite("K7Q2XM", A, d);
    expect(onAlarm(invite, invite.createdAt + INVITE_TTL - 1)).toMatchObject({ room: invite, changed: false, next: invite.createdAt + INVITE_TTL });
    expect(onAlarm(invite, invite.createdAt + INVITE_TTL)).toMatchObject({ room: null, changed: true });

    const game = createMatched("Q9TR4K", [A, B], d);
    expect(onAlarm(game, game.updatedAt + IDLE_TTL - 1).changed).toBe(false);
    const closed = onAlarm(game, game.updatedAt + IDLE_TTL);
    expect(closed.room).toMatchObject({ phase: "over", abandoned: true });
    expect(onAlarm(closed.room!, closed.room!.updatedAt + OVER_TTL)).toMatchObject({ room: null });
  });
});

describe("notices", () => {
  const sub = { endpoint: "https://push.example.com/a", keys: { p256dh: "x".repeat(87), auth: "y".repeat(22) } };

  it("keeps each seat's subscription, writing only when it changes", () => {
    const d = deps();
    const room = createMatched("Q9TR4K", [A, B], d);
    const seat = room.seats.indexOf(A);
    const saved = handle(room, A, { t: "push", sub }, d);
    expect(saved).toMatchObject({ changed: true, broadcast: false });
    expect(saved.room!.push![seat]).toEqual(sub);
    expect(handle(saved.room!, A, { t: "push", sub }, d).changed).toBe(false);
    expect(handle(saved.room!, A, { t: "push", sub: null }, d).room!.push![seat]).toBeNull();
    expect(handle(saved.room!, C, { t: "push", sub }, d).changed).toBe(false);
  });

  it("tell the host their invitation was taken", () => {
    const d = deps();
    const invite = createInvite("K7Q2XM", A, d);
    const started = handle(invite, B, { t: "join" }, d).room!;
    const notices = noticesFor(invite, started);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ seat: invite.host, notice: { title: "Davetin kabul edildi", url: "#/oda/K7Q2XM", tag: "K7Q2XM" } });
    expect(notices[0].notice.body).toMatch(/katıldı\. İlk hamle (senin|onda)\./);
  });

  it("tell the other player it's their turn, with what was played", () => {
    const d = deps("turns");
    let room = createMatched("Q9TR4K", [A, B], d);
    for (let i = 0; i < 4; i++) {
      const before = room;
      room = botTurn(room, d);
      const game = loadGame(room.game!)!;
      const turn = game.log[game.log.length - 1];
      const notices = noticesFor(before, room);
      expect(notices).toEqual([{ seat: 1 - turn.player, notice: expect.objectContaining({ title: "Sıra sende" }) }]);
      if (turn.kind === "play") expect(notices[0].notice.body).toContain(`yazdı, +${turn.score}.`);
    }
  });

  it("tell the loser how it ended, and each side about a rematch", () => {
    const d = deps();
    const room = createMatched("Q9TR4K", [A, B], d);
    const over = handle(room, A, { t: "resign" }, d).room!;
    const seatB = room.seats.indexOf(B);
    expect(noticesFor(room, over)).toEqual([
      { seat: seatB, notice: expect.objectContaining({ title: "Oyun bitti", body: expect.stringContaining("pes etti. Kazandın.") }) },
    ]);
    const asked = handle(over, A, { t: "rematch" }, d).room!;
    expect(noticesFor(over, asked)).toEqual([{ seat: seatB, notice: expect.objectContaining({ title: "Rövanş" }) }]);
    const again = handle(asked, B, { t: "rematch" }, d).room!;
    expect(noticesFor(asked, again).map((n) => n.notice.title)).toEqual(["Rövanş başladı", "Rövanş başladı"]);
  });
});

describe("names in a room", () => {
  it("are the ones the players chose, cleaned, with each device's number", () => {
    const d = deps();
    const invite = createInvite("K7Q2XM", A, d, "  Akın  ");
    const room = handle(invite, B, { t: "join" }, d, "Orospu").room!;
    const info = stateFor(room, A, both);
    if (info.t !== "room") throw new Error("no room");
    const a = room.seats.indexOf(A);
    const b = room.seats.indexOf(B);
    expect(info.room.seats[a]!.name).toMatch(/^Akın #\d{4}$/);
    // An unfit name falls back to the device's own.
    expect(info.room.seats[b]!.name).not.toContain("Orospu");
    expect(info.room.seats[b]!.name).toMatch(/^\S+.* #\d{4}$/);
    expect(summaryOf(room, "K7Q2XM", B).gone).toBeFalsy();
  });

  it("follow a rename from the next hello, writing only on a change", () => {
    const d = deps();
    const room = createMatched("Q9TR4K", [A, B], d, ["Ali", "Veli"]);
    const renamed = rename(room, A, "Ali Can")!;
    expect(renamed.names![room.seats.indexOf(A)]).toBe("Ali Can");
    expect(rename(renamed, A, "Ali Can")).toBeNull();
    expect(rename(renamed, A, undefined)).toBeNull();
    expect(rename(renamed, C, "Kimse")).toBeNull();
  });
});

describe("nudges", () => {
  it("go to the player whose turn it is, five a game, thirty seconds apart", () => {
    const d = deps("nudge");
    let room = createMatched("Q9TR4K", [A, B], d);
    const game = loadGame(room.game!)!;
    const mover = room.seats[game.turn]!;
    const waiter = room.seats[1 - game.turn]!;
    // The one who has the move has nobody to nudge.
    expect(handle(room, mover, { t: "nudge" }, d).changed).toBe(false);
    const first = handle(room, waiter, { t: "nudge" }, d);
    expect(first).toMatchObject({ changed: true, broadcast: true, nudge: game.turn });
    room = first.room!;
    const info = stateFor(room, waiter, both);
    expect(info.t === "room" && info.room.nudges[1 - game.turn]).toBe(4);
    // Too soon.
    expect(handle(room, waiter, { t: "nudge" }, d).reply).toMatchObject({ t: "nudgeRefused", left: 4, wait: 30_000 });
    for (let i = 0; i < 4; i++) {
      d.tick(30_000);
      room = handle(room, waiter, { t: "nudge" }, d).room!;
    }
    d.tick(30_000);
    expect(handle(room, waiter, { t: "nudge" }, d).reply).toMatchObject({ t: "nudgeRefused", left: 0 });
    // A new game brings them back.
    room = handle(room, A, { t: "resign" }, d).room!;
    room = handle(handle(room, A, { t: "rematch" }, d).room!, B, { t: "rematch" }, d).room!;
    const again = stateFor(room, A, both);
    expect(again.t === "room" && again.room.nudges).toEqual([5, 5]);
  });
});
