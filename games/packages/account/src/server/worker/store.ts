import { DAY, SESSION_DAYS } from "../session.ts";
import type { IdClaims } from "../token.ts";
import type { UserRow } from "../user.ts";

/**
 * The account tables in D1 (migrations/0001_hesap.sql). Each call is one or
 * two small statements: a session check is one row read, and a session is
 * written to at most once a day.
 */

const LIFETIME = SESSION_DAYS * DAY;

/** The account behind a session hash, if the session is live; its expiry is pushed back once a day. */
export async function userBySession(db: D1Database, hash: string, now: number): Promise<UserRow | null> {
  const row = await db
    .prepare(
      `SELECT u.*, s.seen_at AS session_seen FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id_hash = ? AND s.expires_at > ?`,
    )
    .bind(hash, now)
    .first<UserRow & { session_seen: number }>();
  if (!row) return null;
  const { session_seen, ...user } = row;
  if (now - session_seen > DAY) {
    await db.batch([
      db.prepare("UPDATE sessions SET seen_at = ?, expires_at = ? WHERE id_hash = ?").bind(now, now + LIFETIME, hash),
      db.prepare("UPDATE users SET seen_at = ? WHERE id = ?").bind(now, user.id),
    ]);
  }
  return user;
}

/** The account for a Firebase user, made the first time they sign in; email and provider kept current. */
export async function accountFor(db: D1Database, claims: IdClaims, newId: string, now: number): Promise<UserRow> {
  await db
    .prepare(
      `INSERT INTO users (id, firebase_uid, email, provider, name, created_at, seen_at) VALUES (?, ?, ?, ?, NULL, ?, ?)
       ON CONFLICT (firebase_uid) DO UPDATE SET email = excluded.email, provider = excluded.provider, seen_at = excluded.seen_at`,
    )
    .bind(newId, claims.uid, claims.email, claims.provider, now, now)
    .run();
  const row = await db.prepare("SELECT * FROM users WHERE firebase_uid = ?").bind(claims.uid).first<UserRow>();
  if (!row) throw new Error("account not written");
  return row;
}

/** A new session; sessions that have run out, anyone's, are cleared on the way. */
export async function startSession(db: D1Database, userId: string, hash: string, now: number): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
    db.prepare("INSERT INTO sessions (id_hash, user_id, created_at, seen_at, expires_at) VALUES (?, ?, ?, ?, ?)").bind(hash, userId, now, now, now + LIFETIME),
  ]);
}

export async function endSession(db: D1Database, hash: string): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(hash).run();
}

export async function setName(db: D1Database, userId: string, name: string | null): Promise<UserRow | null> {
  return db.prepare("UPDATE users SET name = ? WHERE id = ? RETURNING *").bind(name, userId).first<UserRow>();
}

/**
 * The account and everything it holds: deleting the user row takes its
 * sessions, rooms, results and puzzle records with it (the tables' foreign
 * keys cascade). Its name also leaves other players' records of games
 * against it.
 */
export async function removeAccount(db: D1Database, userId: string): Promise<void> {
  await db.batch([
    db.prepare("UPDATE harfiyen_results SET opponent = NULL, opponent_id = NULL WHERE opponent_id = ?").bind(userId),
    db.prepare("DELETE FROM users WHERE id = ?").bind(userId),
  ]);
}
