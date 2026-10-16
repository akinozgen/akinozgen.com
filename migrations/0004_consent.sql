-- A new account is opened only with the player's say-so: that they are 18 or
-- older and have read the privacy notice. When they said it, and which
-- version of the notice they read.
ALTER TABLE users ADD COLUMN consented_at INTEGER;
ALTER TABLE users ADD COLUMN consent_version TEXT;
