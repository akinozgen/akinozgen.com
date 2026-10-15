-- harfiyen online, by account: the rooms each account plays in (its list of
-- games, the same on every device) and every game it finished.
CREATE TABLE harfiyen_rooms (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, code)
);

CREATE TABLE harfiyen_results (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  -- Which game in the room: a rematch is the next number.
  game_no INTEGER NOT NULL,
  -- The other player's name when the game ended, and their id, so that the
  -- name is cleared from this record when they delete their account.
  opponent TEXT,
  opponent_id TEXT,
  you INTEGER NOT NULL,
  them INTEGER NOT NULL,
  -- won | lost | draw | abandoned
  outcome TEXT NOT NULL,
  ended_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, code, game_no)
);
CREATE INDEX harfiyen_results_by_time ON harfiyen_results(user_id, ended_at DESC);
CREATE INDEX harfiyen_results_by_opponent ON harfiyen_results(opponent_id);
