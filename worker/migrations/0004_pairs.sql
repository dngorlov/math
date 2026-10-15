-- Для баз, созданных до совместного огонька
CREATE TABLE IF NOT EXISTS pairs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  a_id         INTEGER NOT NULL,
  b_id         INTEGER NOT NULL,
  status       TEXT    NOT NULL,
  streak       INTEGER NOT NULL DEFAULT 0,
  best         INTEGER NOT NULL DEFAULT 0,
  last_covered TEXT,
  last_inc     TEXT,
  ended_by     INTEGER,
  notice_for   INTEGER,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pairs_a ON pairs (a_id, status);
CREATE INDEX IF NOT EXISTS idx_pairs_b ON pairs (b_id, status);
