-- Для баз, созданных до защиты рейтинга, админки и пинка
ALTER TABLE pairs ADD COLUMN poke_at INTEGER;
ALTER TABLE pairs ADD COLUMN poke_by INTEGER;
CREATE TABLE IF NOT EXISTS run_sessions (
  id         TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  seed       INTEGER NOT NULL,
  mode       TEXT    NOT NULL,
  topics     TEXT    NOT NULL,
  idx        INTEGER NOT NULL,
  score      INTEGER NOT NULL,
  lives      INTEGER NOT NULL,
  correct    INTEGER NOT NULL,
  total      INTEGER NOT NULL,
  suspicious INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  last_at    INTEGER NOT NULL,
  finished   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_run_sessions_user ON run_sessions (user_id, finished);
CREATE TABLE IF NOT EXISTS seasons (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  created_by INTEGER NOT NULL,
  top        TEXT    NOT NULL
);
