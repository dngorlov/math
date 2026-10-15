-- База (Cloudflare D1). Для новой базы выполни целиком.
CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY,         -- Telegram user id
  name         TEXT    NOT NULL DEFAULT '',
  username     TEXT,
  photo_url    TEXT,
  best_score   INTEGER NOT NULL DEFAULT 0,  -- лучший счёт в генераторе, по нему сортировка
  streak       INTEGER NOT NULL DEFAULT 0,  -- серия дней, только для показа
  last_covered TEXT,                        -- последний закрытый день серии (YYYY-MM-DD, МСК)
  games        INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL DEFAULT 0,
  last_submit  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_users_best ON users (best_score DESC);

-- Синхронизируемое состояние: серия, заморозки, рекорды, настройки
CREATE TABLE IF NOT EXISTS user_state (
  user_id    INTEGER PRIMARY KEY,
  data       TEXT    NOT NULL,
  rev        INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

-- История забегов: для разбора подозрительных результатов
CREATE TABLE IF NOT EXISTS runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  score       INTEGER NOT NULL,
  mode        TEXT    NOT NULL,
  correct     INTEGER NOT NULL,
  total       INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_user ON runs (user_id, created_at);

-- Дуэли: история для профиля
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

-- Статистика ответов по дням: без пользователей, только тема и тип задачи
CREATE TABLE IF NOT EXISTS stats_daily (
  day      TEXT    NOT NULL,
  src      TEXT    NOT NULL,
  topic    TEXT    NOT NULL,
  kind     TEXT    NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  errors   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, src, topic, kind)
);

-- Совместный огонёк: пара из двух человек
CREATE TABLE IF NOT EXISTS pairs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  a_id         INTEGER NOT NULL,              -- кто пригласил
  b_id         INTEGER NOT NULL,              -- кого пригласили
  status       TEXT    NOT NULL,              -- pending | active | declined | ended
  streak       INTEGER NOT NULL DEFAULT 0,
  best         INTEGER NOT NULL DEFAULT 0,
  last_covered TEXT,                          -- последний день, когда оба решили или заморозили (МСК)
  last_inc     TEXT,                          -- последний день, когда оба решили (серия выросла)
  ended_by     INTEGER,
  notice_for   INTEGER,                       -- кому показать уведомление (отказ, выход, принятие)
  poke_at      INTEGER,                       -- последний пинок
  poke_by      INTEGER,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pairs_a ON pairs (a_id, status);
CREATE INDEX IF NOT EXISTS idx_pairs_b ON pairs (b_id, status);

-- Пинок партнёру по совместному огоньку
-- (в новой базе колонки сразу есть; для старой — migrations/0005)

-- Забеги генератора, проверяемые сервером
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

-- Архив рейтинга при сбросе
CREATE TABLE IF NOT EXISTS seasons (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  created_by INTEGER NOT NULL,
  top        TEXT    NOT NULL
);
