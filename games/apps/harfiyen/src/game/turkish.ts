import { splitName } from "./identity.ts";

const FRONT = new Set(["e", "i", "ö", "ü"]);
const VOWELS = new Set(["a", "e", "ı", "i", "o", "ö", "u", "ü"]);
const HARD = new Set(["ç", "f", "h", "k", "p", "s", "ş", "t"]);
/** Names whose last word already carries a possessive, which takes an extra n: Su Samuru'nda. */
const POSSESSIVE = ["Böceği", "Samuru", "Denizatı"];

/**
 * A player's name with the locative ending, without the number: "Neşeli
 * Kirpi #4821" → "Neşeli Kirpi'de", "Sakin Köpek" → "Sakin Köpek'te".
 */
export function locative(name: string): string {
  const { base } = splitName(name);
  const lower = base.toLocaleLowerCase("tr");
  const vowel = [...lower].reverse().find((c) => VOWELS.has(c)) ?? "a";
  const e = FRONT.has(vowel) ? "e" : "a";
  if (POSSESSIVE.some((word) => base.endsWith(word))) return `${base}'nd${e}`;
  const last = lower.charAt(lower.length - 1);
  return `${base}'${HARD.has(last) ? "t" : "d"}${e}`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

/** How long ago, briefly: "az önce", "5 dk önce", "3 sa önce", "dün", "4 gün önce", "12 Eki". */
export function ago(then: number, now: number = Date.now()): string {
  const past = Math.max(0, now - then);
  if (past < MINUTE) return "az önce";
  if (past < HOUR) return `${Math.floor(past / MINUTE)} dk önce`;
  if (past < DAY) return `${Math.floor(past / HOUR)} sa önce`;
  if (past < 2 * DAY) return "dün";
  if (past < 7 * DAY) return `${Math.floor(past / DAY)} gün önce`;
  const date = new Date(then);
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}
