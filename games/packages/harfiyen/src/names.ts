/**
 * Players online have no accounts: each device keeps a random secret, and
 * its public id is the secret's SHA-256. The name others see is a name and a
 * number — "Neşeli Kirpi #4821". The number comes from the public id and
 * never changes; the name starts as two words drawn from the id, and the
 * player may roll new ones or type their own, which the server cleans
 * (`cleanName`) before anyone else sees it.
 */

import { BLOCKLIST } from "./blocklist.ts";
import { foldWord } from "./fold.ts";

const ADJECTIVES = [
  "Neşeli", "Meraklı", "Sakin", "Cesur", "Çalışkan", "Sevimli", "Uykucu", "Hızlı", "Kibar", "Şakacı",
  "Dalgın", "Becerikli", "Cömert", "Sabırlı", "Tatlı", "Yaramaz", "Utangaç", "Akıllı", "Güleryüzlü", "Dürüst",
  "Hayalperest", "Düşünceli", "Sessiz", "Konuşkan", "Çevik", "Uslu", "Neşesi Bol", "Yumuşak", "Parlak", "Bilge",
  "Gezgin", "Titiz", "Sabahçı", "Gececi", "Çılgın", "Ağırbaşlı", "Şirin", "Zarif", "Esnek", "Atik",
  "Hevesli", "Kararlı", "Huzurlu", "Hünerli", "Çekirdekçi", "Kurnaz", "Pırıl Pırıl", "Uyanık", "Romantik", "Afacan",
  "Keyifli", "Mütevazı", "Dikkatli", "Yaratıcı", "İnatçı", "Telaşsız", "Cıvıl Cıvıl", "Gümüş", "Altın", "Bulutlu",
  "Rüzgârlı", "Güneşli", "Yıldızlı", "Kadife",
];

const NOUNS = [
  "Kirpi", "Sincap", "Baykuş", "Martı", "Kaplumbağa", "Tilki", "Kedi", "Köpek", "Yunus", "Penguen",
  "Serçe", "Leylek", "Arı", "Uğur Böceği", "Kelebek", "Tavşan", "Ceylan", "Panda", "Koala", "Zürafa",
  "Fil", "Kunduz", "Gelincik", "Ahtapot", "Denizatı", "Flamingo", "Papağan", "Bülbül", "Kanarya", "Karınca",
  "Salyangoz", "Kurbağa", "Su Samuru", "Kartal", "Şahin", "Turna", "Pelikan", "Lama", "Deve", "At",
  "Aslan", "Kaplan", "Ayı", "Kurt", "Geyik", "Kuzu", "Oğlak", "Kanguru", "Tukan", "Saksağan",
  "Kumru", "Güvercin", "Ördek", "Kaz", "Hamsi", "Lüfer", "Palamut", "Çınar", "Lale", "Papatya",
  "Menekşe", "Zeytin", "İncir", "Nar",
];

/** The public id of a device secret: SHA-256, as hex. */
export async function publicId(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`harfiyen:${secret}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

const word = (pub: string, from: number): number => Number.parseInt(pub.slice(from, from + 8), 16) >>> 0;

/** The device's number, the part of its name that never changes: four digits from its public id. */
export const nameTag = (pub: string): string => String(word(pub, 16) % 10000).padStart(4, "0");

/** The two words a device is called until its player picks others. */
export const defaultName = (pub: string): string =>
  `${ADJECTIVES[word(pub, 0) % ADJECTIVES.length]} ${NOUNS[word(pub, 8) % NOUNS.length]}`;

/** Two words drawn at random, for the dice beside the name. */
export const randomName = (random: () => number = Math.random): string =>
  `${ADJECTIVES[Math.floor(random() * ADJECTIVES.length)]} ${NOUNS[Math.floor(random() * NOUNS.length)]}`;

/** What others see: the name and the device's number. */
export const displayName = (name: string, pub: string): string => `${name} #${nameTag(pub)}`;

/** The name that goes with a public id, before its player changes it. */
export function playerName(pub: string): string {
  return displayName(defaultName(pub), pub);
}

export const NAME_MIN = 2;
export const NAME_MAX = 24;

/** Words of their own a name may not be: the published lists, and the game posing as a player. */
const BLOCKED = new Set([...BLOCKLIST, ...["harfiyen", "admin", "moderator", "moderatör", "yönetici", "yonetici"].map((word) => foldWord(word))]);

/** Blocked words this long are caught at the start of a longer word too ("orospular"); shorter ones only whole. */
export const PREFIX_MIN = 6;
const PREFIXES = [...BLOCKED].filter((word) => word.length >= PREFIX_MIN);

/**
 * Whether a name holds a rude word: any of its words, or the whole of it
 * run together ("s i k"), is on the list — whole words only, so "Koç",
 * "Malatyalı" and "Cesur Tukan" are fine — or starts with a long one.
 */
export function rude(name: string): boolean {
  // Read the Turkish way, and — when there's a capital I to be ambiguous about — the English way too.
  const readings = /I/.test(name) ? [true, false] : [true];
  return readings.some((turkish) => {
    const words = name.split(/[\s.'\-]+/).map((word) => foldWord(word, turkish)).filter(Boolean);
    if (BLOCKED.has(words.join("")) || words.some((word) => BLOCKED.has(word))) return true;
    return words.some((word) => word.length > PREFIX_MIN && PREFIXES.some((bad) => word.startsWith(bad)));
  });
}

/**
 * A name as typed, made fit to show: spaces trimmed and squeezed, only
 * letters (any alphabet), digits, spaces and a few marks, 2–24 characters,
 * no rude word (`rude`). Null when nothing fit is left.
 */
export function cleanName(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const name = text.normalize("NFC").replace(/\s+/g, " ").trim();
  const length = [...name].length;
  if (length < NAME_MIN || length > NAME_MAX) return null;
  if (!/^[\p{L}\p{N} .'\-]+$/u.test(name) || !/\p{L}/u.test(name)) return null;
  return rude(name) ? null : name;
}

/** A new device secret: 128 random bits, URL-safe. */
export function newSecret(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const NAME_WORDS = { adjectives: ADJECTIVES, nouns: NOUNS };
