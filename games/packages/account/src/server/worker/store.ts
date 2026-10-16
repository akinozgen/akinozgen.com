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

/** The account a Firebase user signs in to, if they have one; email and provider kept current. */
export async function accountOf(db: D1Database, claims: IdClaims, now: number): Promise<UserRow | null> {
  return db
    .prepare("UPDATE users SET email = ?, provider = ?, seen_at = ? WHERE firebase_uid = ? RETURNING *")
    .bind(claims.email, claims.provider, now, claims.uid)
    .first<UserRow>();
}

/** A new account for a Firebase user, with the consent it was opened on. */
export async function openAccount(db: D1Database, claims: IdClaims, newId: string, consent: string, now: number): Promise<UserRow> {
  const row = await db
    .prepare(
      `INSERT INTO users (id, firebase_uid, email, provider, name, created_at, seen_at, consented_at, consent_version)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)
       ON CONFLICT (firebase_uid) DO UPDATE SET email = excluded.email, provider = excluded.provider, seen_at = excluded.seen_at
       RETURNING *`,
    )
    .bind(newId, claims.uid, claims.email, claims.provider, now, now, now, consent)
    .first<UserRow>();
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

/** Accounts nobody has used in this long are deleted, with everything they hold. */
export const IDLE_ACCOUNT = 2 * 365 * DAY;

/**
 * The daily clean-up: accounts unused for two years go (their names leaving
 * other players' records, as on a deletion), and sessions that have run out.
 * Returns how many accounts went.
 */
export async function purgeIdle(db: D1Database, now: number): Promise<number> {
  const cutoff = now - IDLE_ACCOUNT;
  const [, gone] = await db.batch([
    db
      .prepare(
        "UPDATE harfiyen_results SET opponent = NULL, opponent_id = NULL WHERE opponent_id IN (SELECT id FROM users WHERE seen_at < ?)",
      )
      .bind(cutoff),
    db.prepare("DELETE FROM users WHERE seen_at < ?").bind(cutoff),
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
  ]);
  return gone!.meta.changes;
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
