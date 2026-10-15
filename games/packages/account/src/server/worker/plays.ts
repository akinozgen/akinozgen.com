/**
 * A signed-in player's puzzles, kept by the server (migrations/0003_plays.sql).
 * A game's API keeps, for each puzzle, the moves it judged and — once the
 * puzzle is over — its verdict. The page can't edit either: the moves only
 * grow (a request that would take one back is refused, and told what is on
 * record), and the result is what the server decided.
 */

export interface Play<Moves = unknown, Result = unknown> {
  moves: Moves;
  result: Result | null;
  startedAt: number;
  finishedAt: number | null;
}

/** Whether `before` is where `after` started: every item of `before`, in order, at the front of `after`. */
export const isPrefix = (before: readonly string[], after: readonly string[]): boolean =>
  before.length <= after.length && before.every((item, i) => after[i] === item);

export async function playOf<Moves, Result>(db: D1Database, userId: string, game: string, puzzle: string): Promise<Play<Moves, Result> | null> {
  const row = await db
    .prepare("SELECT moves, result, started_at, finished_at FROM plays WHERE user_id = ? AND game = ? AND puzzle = ?")
    .bind(userId, game, puzzle)
    .first<{ moves: string; result: string | null; started_at: number; finished_at: number | null }>();
  if (!row) return null;
  return {
    moves: JSON.parse(row.moves) as Moves,
    result: row.result === null ? null : (JSON.parse(row.result) as Result),
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

/** Writes a puzzle's moves, and its result when it's over. A finished puzzle is never written again. */
export async function savePlay(
  db: D1Database,
  userId: string,
  game: string,
  puzzle: string,
  moves: unknown,
  result: unknown | null,
  now: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO plays (user_id, game, puzzle, moves, result, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, game, puzzle) DO UPDATE SET moves = excluded.moves, result = excluded.result, finished_at = excluded.finished_at
       WHERE plays.finished_at IS NULL`,
    )
    .bind(userId, game, puzzle, JSON.stringify(moves), result === null ? null : JSON.stringify(result), now, result === null ? null : now)
    .run();
}

export interface FinishedPlay<Result = unknown> {
  puzzle: string;
  result: Result;
  startedAt: number;
  finishedAt: number;
}

/** A player's finished puzzles in one game, newest first. */
export async function finishedPlays<Result>(db: D1Database, userId: string, game: string, limit: number): Promise<FinishedPlay<Result>[]> {
  const { results } = await db
    .prepare(
      `SELECT puzzle, result, started_at, finished_at FROM plays
       WHERE user_id = ? AND game = ? AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT ?`,
    )
    .bind(userId, game, limit)
    .all<{ puzzle: string; result: string; started_at: number; finished_at: number }>();
  return results.map((row) => ({
    puzzle: row.puzzle,
    result: JSON.parse(row.result) as Result,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  }));
}

/** The device's own record from before the account, if it was ever sent. */
export async function importedStats<Stats>(db: D1Database, userId: string, game: string): Promise<{ stats: Stats; importedAt: number } | null> {
  const row = await db
    .prepare("SELECT stats, imported_at FROM imported_stats WHERE user_id = ? AND game = ?")
    .bind(userId, game)
    .first<{ stats: string; imported_at: number }>();
  return row ? { stats: JSON.parse(row.stats) as Stats, importedAt: row.imported_at } : null;
}

/** Keeps a device's record once per game; a second one is ignored. */
export async function importStats(db: D1Database, userId: string, game: string, stats: unknown, now: number): Promise<boolean> {
  const { meta } = await db
    .prepare("INSERT OR IGNORE INTO imported_stats (user_id, game, stats, imported_at) VALUES (?, ?, ?, ?)")
    .bind(userId, game, JSON.stringify(stats), now)
    .run();
  return meta.changes > 0;
}
