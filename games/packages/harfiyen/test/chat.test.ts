import { describe, expect, it } from "vitest";
import { CHAT_BURST, CHAT_KEEP, CHAT_PUSH_GAP, canChat, chatFor, cleanChat, emptyChat, mute, pushDue, pushed, say } from "../src/server/chat.ts";
import { CHAT_MAX } from "../src/server/protocol.ts";
import { createInvite, createMatched, type Deps } from "../src/server/room.ts";
import { seeded } from "../src/rng.ts";

const T = 1_760_000_000_000;

/** Says each text a minute apart, so the rate limit stays out of the way. */
function talk(texts: [seat: number, text: string][]) {
  let chat = emptyChat();
  texts.forEach(([seat, text], i) => {
    const result = say(chat, seat, text, T + i * 60_000);
    if ("refused" in result) throw new Error(`refused: ${text}`);
    chat = result.chat;
  });
  return chat;
}

describe("chat lines", () => {
  it("are trimmed, squeezed and cut to length", () => {
    expect(cleanChat("  İyi   oyunlar!\n\nHadi bakalım  ")).toBe("İyi oyunlar! Hadi bakalım");
    expect(cleanChat("a‮b\u0000c")).toBe("a b c");
    expect([...cleanChat("ş".repeat(CHAT_MAX + 50))].length).toBe(CHAT_MAX);
    expect(cleanChat("👨‍👩‍👧 güzel")).toBe("👨‍👩‍👧 güzel");
  });

  it("have rude words starred, however they are spelled", () => {
    expect(cleanChat("Merhaba amk")).toBe("Merhaba ***");
    expect(cleanChat("AMK!")).toBe("***!");
    expect(cleanChat("s1kt1r git")).toBe("****** git");
    expect(cleanChat("orospular")).toBe("********");
    expect(cleanChat("amk'yı")).toBe("******");
    expect(cleanChat("s i k t i r lan")).toBe("* * * * * * lan");
    expect(cleanChat("s.i.k.t.i.r")).toBe("********");
    expect(cleanChat("fuck this")).toBe("**** this");
    expect(cleanChat("ne avel hamle")).toBe("ne **** hamle");
    expect(cleanChat("AVEL!")).toBe("****!");
  });

  it("keep the everyday words the lists also hold", () => {
    for (const fine of [
      "Allah Allah, ne şans",
      "Allah'tan bitti",
      "Puanım azdır",
      "kelime cikar mi",
      "kaşar yazdım 30 puan",
      "saksofon çalıyorum",
      "Sikke ve sıkı fıkı",
      "Ananas yazacaktım",
      "Malatyalıyım",
      "Atkafası seni",
      "Salak hamle oldu",
      "a b c de",
      "harfiyen çok iyi",
      "Penisilin kelimesi var mı",
    ]) {
      expect(cleanChat(fine), fine).toBe(fine);
    }
  });

  it("have links cut", () => {
    expect(cleanChat("bak https://evil.example/x tamam")).toBe("bak [bağlantı] tamam");
    expect(cleanChat("www.ornek.com.tr")).toBe("[bağlantı]");
    expect(cleanChat("site: kazan.xyz")).toBe("site: [bağlantı]");
    expect(cleanChat("bitti. sıra sende")).toBe("bitti. sıra sende");
  });
});

describe("a room's chat", () => {
  it("numbers its lines and keeps the latest", () => {
    const chat = talk(Array.from({ length: CHAT_KEEP + 5 }, (_, i) => [i % 2, `satır ${i}`] as [number, string]));
    expect(chat.lines).toHaveLength(CHAT_KEEP);
    expect(chat.lines[0]!.id).toBe(6);
    expect(chat.lines.at(-1)).toMatchObject({ id: CHAT_KEEP + 5, from: 0, text: `satır ${CHAT_KEEP + 4}` });
    expect(chat.next).toBe(CHAT_KEEP + 6);
  });

  it("holds a fast talker back: a second between lines, ten a minute", () => {
    let chat = emptyChat();
    const first = say(chat, 0, "bir", T);
    if ("refused" in first) throw new Error("refused");
    chat = first.chat;
    expect(say(chat, 0, "iki", T + 400)).toEqual({ refused: 600 });
    // The other seat has its own allowance.
    expect("line" in say(chat, 1, "selam", T + 400)).toBe(true);
    for (let i = 1; i < CHAT_BURST; i++) {
      const next = say(chat, 0, `satır ${i}`, T + i * 1_000);
      if ("refused" in next) throw new Error(`refused at ${i}`);
      chat = next.chat;
    }
    expect(say(chat, 0, "bir daha", T + CHAT_BURST * 1_000)).toEqual({ refused: 60_000 - CHAT_BURST * 1_000 });
    expect("line" in say(chat, 0, "şimdi oldu", T + 60_000)).toBe(true);
  });

  it("turns away a line with nothing left to say", () => {
    for (const empty of ["", "   ", "\u0000‮", "...", "!!"]) expect(say(emptyChat(), 0, empty, T), JSON.stringify(empty)).toEqual({ refused: 0 });
    expect("line" in say(emptyChat(), 0, "🙂", T)).toBe(true);
  });

  it("hides the other's lines from a seat that muted them, and shows them again after", () => {
    const chat = talk([
      [0, "selam"],
      [1, "merhaba"],
      [0, "iyi oyunlar"],
    ]);
    const muted = mute(chat, 1, true)!;
    expect(mute(muted, 1, true)).toBeNull();
    expect(chatFor(muted, 1)).toEqual({ t: "chat", lines: [chat.lines[1]], muted: true });
    expect(chatFor(muted, 0).lines).toHaveLength(3);
    expect(chatFor(mute(muted, 1, false)!, 1)).toEqual({ t: "chat", lines: chat.lines, muted: false });
  });

  it("tells an absent player by push now and then, and never one who muted", () => {
    let chat = emptyChat();
    expect(pushDue(chat, 1, T)).toBe(true);
    chat = pushed(chat, 1, T);
    expect(pushDue(chat, 1, T + CHAT_PUSH_GAP - 1)).toBe(false);
    expect(pushDue(chat, 1, T + CHAT_PUSH_GAP)).toBe(true);
    expect(pushDue(mute(chat, 1, true)!, 1, T + CHAT_PUSH_GAP)).toBe(false);
  });

  it("opens once both seats are taken", () => {
    let now = T;
    const deps: Deps = { now: () => now++, seed: () => "s", random: seeded("chat"), lexicon: () => { throw new Error("no words"); } };
    const invite = createInvite("K7Q2XM", "a".repeat(64), deps);
    expect(canChat(invite, invite.host)).toBe(false);
    const matched = createMatched("K7Q2XN", ["a".repeat(64), "b".repeat(64)], deps);
    expect(canChat(matched, 0)).toBe(true);
    expect(canChat(matched, null)).toBe(false);
  });
});
