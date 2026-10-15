/**
 * A word reduced to what matters for spotting a rude one: Turkish lower
 * case, digits and symbols read as the letters they stand in for (s1kt1r,
 * @), anything but letters dropped, and a letter held down three times or
 * more (siiiktir) cut to one. Turkish letters stay what they are — "sık"
 * and "sik" are different words — and so do doubled letters ("sikke").
 * `turkish: false` lower-cases the English way, for a capital I typed on a
 * keyboard without İ.
 */
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", $: "s", "!": "i" };

export function foldWord(text: string, turkish = true): string {
  const lower = turkish ? text.normalize("NFC").toLocaleLowerCase("tr") : text.normalize("NFC").toLowerCase();
  return [...lower]
    .map((char) => LEET[char] ?? char)
    .join("")
    .replace(/[^\p{L}]/gu, "")
    .replace(/(.)\1{2,}/gu, "$1");
}
