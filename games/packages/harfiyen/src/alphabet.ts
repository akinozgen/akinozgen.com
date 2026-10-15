/**
 * The Turkish alphabet, 29 letters in dictionary order. Everything inside the
 * engine works on a letter's index here (0–28), never on the character, so
 * the dotted and dotless i can never be confused by a case conversion.
 */
export const LETTERS = [
  "a", "b", "c", "ç", "d", "e", "f", "g", "ğ", "h", "ı", "i", "j", "k", "l",
  "m", "n", "o", "ö", "p", "r", "s", "ş", "t", "u", "ü", "v", "y", "z",
] as const;

export const ALPHABET_SIZE = LETTERS.length;

/** A bitmask with every letter allowed: 29 bits fit in one int. */
export const ALL_LETTERS = (1 << ALPHABET_SIZE) - 1;

const INDEX = new Map<string, number>(LETTERS.map((letter, i) => [letter, i]));

/** Circumflexed vowels are spelling variants: "kâğıt" is played as "kağıt". */
const PLAIN: Record<string, string> = { â: "a", î: "i", û: "u" };

/** Lower case the Turkish way: I → ı, İ → i. */
export const lower = (text: string): string => text.toLocaleLowerCase("tr");

/** Upper case the Turkish way, for tiles: i → İ, ı → I. */
export const upper = (text: string): string => text.toLocaleUpperCase("tr");

/** A letter's index, or -1 for anything outside the alphabet. */
export function letterIndex(char: string): number {
  const folded = lower(char);
  return INDEX.get(PLAIN[folded] ?? folded) ?? -1;
}

/** A word as letter indices, or null if any character isn't a Turkish letter. */
export function encode(word: string): number[] | null {
  const out: number[] = [];
  for (const char of lower(word).normalize("NFC")) {
    const index = INDEX.get(PLAIN[char] ?? char);
    if (index === undefined) return null;
    out.push(index);
  }
  return out;
}

export const decode = (letters: readonly number[]): string => letters.map((i) => LETTERS[i]).join("");
