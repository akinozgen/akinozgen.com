import { defaultName, displayName, nameTag } from "../../../harfiyen/src/names.ts";
import type { User } from "../protocol.ts";

/** An account as the database keeps it. */
export interface UserRow {
  /** 64 hex digits; also the account's public id in the games. */
  id: string;
  firebase_uid: string;
  email: string | null;
  provider: string;
  /** The player's own words; null keeps the default. */
  name: string | null;
  created_at: number;
  seen_at: number;
}

/** The account as its player sees it. The words default to two drawn from the id, as harfiyen's device names did. */
export function userOf(row: UserRow): User {
  const base = row.name ?? defaultName(row.id);
  return {
    name: displayName(base, row.id),
    base,
    tag: nameTag(row.id),
    chosen: row.name,
    email: row.email,
    provider: row.provider,
    createdAt: row.created_at,
  };
}
