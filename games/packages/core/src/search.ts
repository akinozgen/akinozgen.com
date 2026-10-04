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

/** The best `limit` of `items` for `needle`: by rank, then alphabetically. */
export function bestMatches<T>(
  items: readonly T[],
  needle: string,
  keys: (item: T) => { own: string; others: readonly string[]; label: string },
  limit: number,
  locale: string,
): T[] {
  const ranked: Array<{ item: T; rank: number; label: string }> = [];
  for (const item of items) {
    const { own, others, label } = keys(item);
    const rank = matchRank(needle, own, others);
    if (rank !== null) ranked.push({ item, rank, label });
  }
  ranked.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label, locale));
  return ranked.slice(0, limit).map((r) => r.item);
}
