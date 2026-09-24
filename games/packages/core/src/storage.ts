/**
 * localStorage that never throws. Private windows, blocked site data and
 * quota errors all just mean "nothing saved", which every caller can handle.
 */
export function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Nothing to do — the game stays playable, it just won't be remembered.
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignored, as above
  }
}

export interface Stats {
  played: number;
  won: number;
  perfect: number;
  streak: number;
  bestStreak: number;
  /** Day index of the most recent completed puzzle, to tell a streak from a gap. */
  lastDay: number | null;
}

export const emptyStats: Stats = {
  played: 0,
  won: 0,
  perfect: 0,
  streak: 0,
  bestStreak: 0,
  lastDay: null,
};

export function recordResult(
  stats: Stats,
  day: number,
  outcome: { won: boolean; perfect: boolean },
): Stats {
  if (stats.lastDay === day) return stats;
  const continues = stats.lastDay !== null && day === stats.lastDay + 1;
  const streak = outcome.won ? (continues ? stats.streak : 0) + 1 : 0;
  return {
    played: stats.played + 1,
    won: stats.won + (outcome.won ? 1 : 0),
    perfect: stats.perfect + (outcome.perfect ? 1 : 0),
    streak,
    bestStreak: Math.max(stats.bestStreak, streak),
    lastDay: day,
  };
}
