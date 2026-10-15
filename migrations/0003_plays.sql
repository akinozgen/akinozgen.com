-- The daily puzzles (travelle, vexle, tessle, sizele), by account: what a
-- signed-in player has done in each puzzle, as the server judged it. The
-- moves only ever grow, so a guess once made stays made; the result is the
-- server's verdict, written when the puzzle ends.
CREATE TABLE plays (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game TEXT NOT NULL,
  -- "d:2026-10-15" for a day's puzzle, "e:<round>" for an endless one.
  puzzle TEXT NOT NULL,
  -- JSON: the moves so far, in the game's own terms.
  moves TEXT NOT NULL,
  -- JSON: the verdict's summary once the puzzle is over; NULL while it's being played.
  result TEXT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  PRIMARY KEY (user_id, game, puzzle)
);
CREATE INDEX plays_finished ON plays(user_id, game, finished_at DESC);

-- What a player's device had recorded before the account, sent once per game
-- at the first sign-in. Kept apart and marked for what it is: the device's
-- word, not the server's.
CREATE TABLE imported_stats (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game TEXT NOT NULL,
  stats TEXT NOT NULL,
  imported_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, game)
);
