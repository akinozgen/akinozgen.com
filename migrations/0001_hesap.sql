-- Accounts: one per Firebase user, shared by every game on the site.
-- `id` is ours (256 random bits as hex) and doubles as the account's public
-- id in the games; Firebase's uid stays here and goes nowhere else.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  firebase_uid TEXT NOT NULL UNIQUE,
  email TEXT,
  provider TEXT NOT NULL,
  -- The player's own words for a name; NULL keeps the default drawn from the id.
  name TEXT,
  created_at INTEGER NOT NULL,
  seen_at INTEGER NOT NULL
);

-- Sessions, by the SHA-256 of the id in the cookie: a copy of this table opens nothing.
CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_by_user ON sessions(user_id);
