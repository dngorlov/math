-- Для баз, созданных до дуэлей и статистики
CREATE TABLE IF NOT EXISTS duels (
  code       TEXT PRIMARY KEY,
  a_id       INTEGER NOT NULL,
  b_id       INTEGER NOT NULL,
  a_score    INTEGER NOT NULL,
  b_score    INTEGER NOT NULL,
  winner     INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_duels_a ON duels (a_id);
CREATE INDEX IF NOT EXISTS idx_duels_b ON duels (b_id);
CREATE TABLE IF NOT EXISTS stats_daily (
  day      TEXT    NOT NULL,
  src      TEXT    NOT NULL,
  topic    TEXT    NOT NULL,
  kind     TEXT    NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  errors   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, src, topic, kind)
);
