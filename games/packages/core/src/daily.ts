const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parse(epoch: string): { year: number; month: number; day: number } {
  const match = ISO_DATE.exec(epoch);
  if (!match) throw new Error(`epoch must look like YYYY-MM-DD, got ${epoch}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/**
 * Which day of a game's calendar it is, counted in the player's own timezone
 * so the puzzle rolls over at their midnight rather than at UTC.
 */
export function dayIndex(epoch: string, now: Date = new Date()): number {
  const { year, month, day } = parse(epoch);
  const start = new Date(year, month - 1, day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - start.getTime()) / 86_400_000);
}

/** The calendar date `index` days after `epoch`, as an ISO date string. */
export function dateForIndex(epoch: string, index: number): string {
  const { year, month, day } = parse(epoch);
  const date = new Date(year, month - 1, day + index);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Milliseconds until the next local midnight, for a countdown. */
export function msUntilNextDay(now: Date = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}
