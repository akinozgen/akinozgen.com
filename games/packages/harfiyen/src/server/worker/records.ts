import type { History, PastGame, PastOutcome } from "../protocol.ts";
import { loadGame } from "../../save.ts";
import { nameAt, type Room } from "../room.ts";

/**
 * What a room leaves in the accounts' database (migrations/0002_harfiyen.sql):
 * which accounts play in it, so each one's list of games is the same on every
 * device, and each finished game, for their history. Seats held by anything
 * but an account (an old device id nobody has moved over) are skipped:
 * the statements only touch ids that are accounts.
 */

const placeholders = (n: number): string => Array.from({ length: n }, () => "?").join(", ");

/** The room joins the lists of the accounts seated in it. */
export async function rememberRoom(db: D1Database, room: Room, now: number): Promise<void> {
  const seated = room.seats.filter((pub): pub is string => pub !== null);
  if (seated.length === 0) return;
  await db
    .prepare(
      `INSERT OR IGNORE INTO harfiyen_rooms (user_id, code, added_at)
       SELECT id, ?, ? FROM users WHERE id IN (${placeholders(seated.length)})`,
    )
    .bind(room.code, now, ...seated)
    .run();
}

/** A game over: each seated account's result, once. */
export async function recordResult(db: D1Database, room: Room, now: number): Promise<void> {
  const game = room.game ? loadGame(room.game) : null;
  if (!game) return;
  const statements = room.seats.flatMap((pub, seat) => {
    if (!pub) return [];
    const other = 1 - seat;
    const winner = game.over?.winner ?? null;
    const outcome: PastOutcome = room.abandoned ? "abandoned" : winner === null ? "draw" : winner === seat ? "won" : "lost";
    return [
      db
        .prepare(
          `INSERT OR IGNORE INTO harfiyen_results (user_id, code, game_no, opponent, opponent_id, you, them, outcome, ended_at)
           SELECT id, ?, ?, ?, ?, ?, ?, ?, ? FROM users WHERE id = ?`,
        )
        .bind(room.code, room.gameNo, nameAt(room, other), room.seats[other] ?? null, game.scores[seat] ?? 0, game.scores[other] ?? 0, outcome, now, pub),
    ];
  });
  if (statements.length) await db.batch(statements);
}

/** Rooms an account plays in, newest first. */
export async function roomsOf(db: D1Database, userId: string, limit: number): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT code FROM harfiyen_rooms WHERE user_id = ? ORDER BY added_at DESC LIMIT ?")
    .bind(userId, limit)
    .all<{ code: string }>();
  return results.map((row) => row.code);
}

/** Rooms that are gone leave the account's list. */
export async function forgetRooms(db: D1Database, userId: string, codes: string[]): Promise<void> {
  if (codes.length === 0) return;
  await db
    .prepare(`DELETE FROM harfiyen_rooms WHERE user_id = ? AND code IN (${placeholders(codes.length)})`)
    .bind(userId, ...codes)
    .run();
}

/** An account's record: totals over every game, and the latest ones. */
export async function historyOf(db: D1Database, userId: string, limit: number): Promise<History> {
  const [totals, latest] = await db.batch([
    db
      .prepare(
        `SELECT COUNT(*) AS played,
                SUM(outcome = 'won') AS won, SUM(outcome = 'lost') AS lost, SUM(outcome = 'draw') AS drawn
         FROM harfiyen_results WHERE user_id = ? AND outcome != 'abandoned'`,
      )
      .bind(userId),
    db
      .prepare(
        `SELECT code, game_no, opponent, you, them, outcome, ended_at FROM harfiyen_results
         WHERE user_id = ? ORDER BY ended_at DESC LIMIT ?`,
      )
      .bind(userId, limit),
  ]);
  const sums = (totals!.results[0] ?? {}) as { played?: number; won?: number | null; lost?: number | null; drawn?: number | null };
  const games = (latest!.results as { code: string; game_no: number; opponent: string | null; you: number; them: number; outcome: PastOutcome; ended_at: number }[]).map(
    (row): PastGame => ({
      code: row.code,
      gameNo: row.game_no,
      opponent: row.opponent,
      you: row.you,
      them: row.them,
      outcome: row.outcome,
      endedAt: row.ended_at,
    }),
  );
  return { played: sums.played ?? 0, won: sums.won ?? 0, lost: sums.lost ?? 0, drawn: sums.drawn ?? 0, games };
}
