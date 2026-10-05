/**
 * How well a typed name matches a place, lower is better; null for no match.
 * The player's own language comes first: typing "gua" in Turkish should offer
 * Guatemala before French Guiana, whose Spanish name happens to start that way.
 *
 * All strings are expected already folded (lower case, accents removed).
 */
export function matchRank(needle: string, own: string, others: readonly string[]): number | null {
  if (!needle) return null;
  const wordStarts = (key: string): boolean => key.split(" ").some((word) => word.startsWith(needle));
  if (own === needle || others.includes(needle)) return 0;
  if (own.startsWith(needle)) return 1;
  if (wordStarts(own)) return 2;
  if (others.some((key) => key.startsWith(needle))) return 3;
  if (others.some(wordStarts)) return 4;
  if (own.includes(needle) || others.some((key) => key.includes(needle))) return 5;
  return null;
}

/**
 * Edits between `needle` and the closest start of `key`: letters added,
 * dropped, changed, or two neighbours swapped. "estavini" is two from
 * "esvatini", which plain matching never finds.
 */
export function prefixDistance(needle: string, key: string): number {
  // Rows of the edit table: needle's first i letters against key's first j.
  let before: number[] = [];
  let previous = Array.from({ length: key.length + 1 }, (_, j) => j);
  for (let i = 1; i <= needle.length; i++) {
    const row = [i];
    for (let j = 1; j <= key.length; j++) {
      let edits = Math.min(previous[j]! + 1, row[j - 1]! + 1, previous[j - 1]! + (needle[i - 1] === key[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && needle[i - 1] === key[j - 2] && needle[i - 2] === key[j - 1]) {
        edits = Math.min(edits, before[j - 2]! + 1);
      }
      row.push(edits);
    }
    before = previous;
    previous = row;
  }
  // Wherever the key is cut, the rest of it is still to be typed.
  return Math.min(...previous);
}

/** Typos forgiven for a needle this long: none for the first few letters. */
const tolerance = (length: number): number => (length < 4 ? 0 : length < 6 ? 1 : 2);

/**
 * Near misses by edits, the player's own language ahead at equal edits; null
 * past tolerance. Each name is tried whole and from each of its words.
 */
function typoRank(needle: string, own: string, others: readonly string[]): number | null {
  const allowed = tolerance(needle.length);
  if (allowed === 0) return null;
  const edits = (key: string): number =>
    Math.min(...[key, ...key.split(" ").slice(1)].map((candidate) => prefixDistance(needle, candidate)));
  const mine = edits(own);
  const theirs = Math.min(allowed + 1, ...others.map(edits));
  const rank = Math.min(mine * 2, theirs * 2 + 1);
  return rank <= allowed * 2 + 1 ? rank : null;
}

/**
 * The best `limit` of `items` for `needle`: by rank, then alphabetically.
 * Only when nothing matches as typed are near misses offered, fewest edits
 * first, so a typo never pushes a real match down the list.
 */
export function bestMatches<T>(
  items: readonly T[],
  needle: string,
  keys: (item: T) => { own: string; others: readonly string[]; label: string },
  limit: number,
  locale: string,
): T[] {
  const rankAll = (rank: typeof matchRank): T[] => {
    const ranked: Array<{ item: T; rank: number; label: string }> = [];
    for (const item of items) {
      const { own, others, label } = keys(item);
      const found = rank(needle, own, others);
      if (found !== null) ranked.push({ item, rank: found, label });
    }
    ranked.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label, locale));
    return ranked.slice(0, limit).map((r) => r.item);
  };
  const exact = rankAll(matchRank);
  return exact.length > 0 ? exact : rankAll(typoRank);
}
