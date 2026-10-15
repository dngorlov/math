-- Только если база создавалась старым schema.sql (до синхронизации и заморозок)
ALTER TABLE users ADD COLUMN last_covered TEXT;
CREATE TABLE IF NOT EXISTS user_state (
  user_id    INTEGER PRIMARY KEY,
  data       TEXT    NOT NULL,
  rev        INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
