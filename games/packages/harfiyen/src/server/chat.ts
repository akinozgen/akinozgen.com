import { BLOCKLIST } from "../blocklist.ts";
import { foldWord } from "../fold.ts";
import { PREFIX_MIN } from "../names.ts";
import { CHAT_MAX, type ChatLine, type RoomMessage } from "./protocol.ts";
import type { Room } from "./room.ts";

/**
 * A room's chat, kept apart from the room's record so that a line costs
 * one small row written and a move doesn't carry the talk with it. Plain
 * data and pure functions, like the room; the Durable Object stores it
 * and carries the lines.
 */
export interface Chat {
  /** The latest lines, oldest first. */
  lines: ChatLine[];
  /** The id the next line gets. */
  next: number;
  /** When each seat sent its recent lines, oldest first, for the rate limit. */
  sent: number[][];
  /** Which seats have muted the other. */
  muted: boolean[];
  /** When each seat was last told of a line by push. */
  pushedAt: number[];
}

/** Lines a room keeps. */
export const CHAT_KEEP = 50;
/** How long a player waits between lines. */
export const CHAT_GAP = 1_000;
/** Lines a player may send in a minute. */
export const CHAT_BURST = 10;
const MINUTE = 60_000;
/** A player who is away hears of the chat by push at most this often. */
export const CHAT_PUSH_GAP = 5 * MINUTE;

export const emptyChat = (): Chat => ({ lines: [], next: 1, sent: [[], []], muted: [false, false], pushedAt: [0, 0] });

/**
 * Words the lists hold that a chat line may still say: an everyday word in
 * one of its senses ("Allah'tan", "puanım azdır", "kaşar", "saksofon"), or
 * a Turkish word typed without its Turkish letters ("cikar" for çıkar).
 */
const CHAT_FINE = new Set(
  `allah azdır azdım cikar pic meme diktim hoşafı veled anam ferre sekis biting krar toplarm iserim işerim ag
  saksofon kaşar`
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => foldWord(word)),
);
const RUDE = new Set(BLOCKLIST.filter((word) => !CHAT_FINE.has(word)));
const RUDE_PREFIXES = [...RUDE].filter((word) => word.length >= PREFIX_MIN);

/** Whether one written word is a rude one: on the lists whole, or starting with a long one. */
function rudeWord(word: string): boolean {
  const readings = /I/.test(word) ? [true, false] : [true];
  return readings.some((turkish) => {
    const folded = foldWord(word, turkish);
    if (!folded || CHAT_FINE.has(folded)) return false;
    return RUDE.has(folded) || (folded.length > PREFIX_MIN && RUDE_PREFIXES.some((bad) => folded.startsWith(bad)));
  });
}

const LINK = /^(?:[a-z][a-z0-9+.-]*:\/\/|www\.)|\.(?:com|net|org|tr|io|gg|xyz|ru|me|co|app|link|ly|info|biz|site|online)(?:[/:?#]|$)/i;
const stars = (word: string): string => "*".repeat(Math.min([...word].length, 8));

/**
 * A word as said, its rude parts starred: the whole word, the parts an
 * apostrophe or a hyphen joins ("amk'ya"), and the word without its closing
 * marks ("amk!").
 */
function maskWord(word: string): string {
  if (LINK.test(word)) return "[bağlantı]";
  const core = word.replace(/^[^\p{L}\p{N}@$]+|[^\p{L}\p{N}]+$/gu, "");
  if (!core) return word;
  const parts = core.split(/['’\-.]+/).filter(Boolean);
  return rudeWord(core) || parts.some(rudeWord) ? word.replace(core, stars(core)) : word;
}

/**
 * A chat line made fit to show: control and direction marks dropped, spaces
 * squeezed, at most CHAT_MAX characters, links cut and rude words starred —
 * also when spelled out a letter at a time ("s i k t i r"). Empty when
 * nothing is left.
 */
export function cleanChat(text: string): string {
  const plain = text
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, (char) => (char === "‍" ? char : " "))
    .replace(/\s+/g, " ")
    .trim();
  const words = [...plain].slice(0, CHAT_MAX).join("").trim().split(" ").filter(Boolean).map(maskWord);
  // Letters typed one by one, three or more in a row, are read as one word.
  for (let i = 0; i < words.length; ) {
    let j = i;
    while (j < words.length && [...words[j]!.replace(/[^\p{L}\p{N}@$]/gu, "")].length === 1) j++;
    if (j - i >= 3 && rudeWord(words.slice(i, j).join(""))) {
      for (let k = i; k < j; k++) words[k] = "*";
    }
    i = Math.max(j, i + 1);
  }
  return words.join(" ");
}

/** Whether a seat may talk: both seats taken, a game begun. */
export const canChat = (room: Room, seat: number | null): seat is number =>
  seat !== null && room.phase !== "waiting" && room.seats.every((pub) => pub !== null);

/** The chat as a seat sees it: the other's lines left out while it has them muted. */
export function chatFor(chat: Chat, seat: number): Extract<RoomMessage, { t: "chat" }> {
  const muted = chat.muted[seat] ?? false;
  return { t: "chat", lines: muted ? chat.lines.filter((line) => line.from === seat) : [...chat.lines], muted };
}

/** A line from `seat`: the chat with it added, or how long to wait (0: nothing fit to say). */
export function say(chat: Chat, seat: number, text: string, now: number): { chat: Chat; line: ChatLine } | { refused: number } {
  const recent = (chat.sent[seat] ?? []).filter((at) => now - at < MINUTE);
  const last = recent[recent.length - 1] ?? -Infinity;
  const wait = Math.max(last + CHAT_GAP - now, recent.length >= CHAT_BURST ? recent[0]! + MINUTE - now : 0, 0);
  if (wait > 0) return { refused: wait };
  const clean = cleanChat(text);
  if (!/[\p{L}\p{N}\p{So}]/u.test(clean)) return { refused: 0 };
  const line: ChatLine = { id: chat.next, from: seat, text: clean, at: now };
  const sent = [...chat.sent];
  sent[seat] = [...recent, now];
  return { chat: { ...chat, lines: [...chat.lines, line].slice(-CHAT_KEEP), next: chat.next + 1, sent }, line };
}

/** A seat mutes the other, or stops; null if nothing changes. */
export function mute(chat: Chat, seat: number, on: boolean): Chat | null {
  if ((chat.muted[seat] ?? false) === on) return null;
  const muted = [...chat.muted];
  muted[seat] = on;
  return { ...chat, muted };
}

/** Whether a seat that is away should hear of a line from the other by push now. */
export const pushDue = (chat: Chat, seat: number, now: number): boolean =>
  !(chat.muted[seat] ?? false) && now - (chat.pushedAt[seat] ?? 0) >= CHAT_PUSH_GAP;

/** The chat after a push to `seat`. */
export function pushed(chat: Chat, seat: number, now: number): Chat {
  const pushedAt = [...chat.pushedAt];
  pushedAt[seat] = now;
  return { ...chat, pushedAt };
}
