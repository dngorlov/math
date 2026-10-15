// Забеги генератора с проверкой на сервере: рейтинг нельзя накрутить из браузера.
// Сервер выдаёт seed, по нему генерирует ту же задачу, что и клиент, проверяет ответ и считает очки по своим часам.
import { HttpError, authUser } from './auth.js';
import { taskAt, GEN_VERSION } from '../../js/gen/index.js';
import { checkAnswer } from '../../js/answer.js';

const LIVES = 3, ORAL_TIME = 10000, LEVEL_EVERY = 6, MAX_LEVEL = 4;
const IDLE_MS = 15 * 60000;     // забег без ответов 15 минут завершается
const MIN_MS = 600;             // быстрее человек не отвечает
const MAX_SUSPICIOUS = 5;       // столько «слишком быстрых» ответов — забег не идёт в рейтинг
const TOPICS = ['deriv', 'growth', 'lim', 'rem', 'circle'];
const level = (correct) => Math.min(MAX_LEVEL, 1 + Math.floor(correct / LEVEL_EVERY));

async function readJson(req) { const t = await req.text(); if (!t.trim()) return {}; try { return JSON.parse(t); } catch (e) { throw new HttpError(400, 'Неверный JSON'); } }

async function finish(env, run) {
  const now = Date.now();
  await env.DB.prepare('UPDATE run_sessions SET finished = 1 WHERE id = ?1').bind(run.id).run();
  if (run.score <= 0 || run.suspicious >= MAX_SUSPICIOUS) return { best: null, rank: null, counted: false };
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE users SET best_score = MAX(best_score, ?1), games = games + 1,
         updated_at = CASE WHEN ?1 > best_score THEN ?2 ELSE updated_at END WHERE id = ?3`
    ).bind(run.score, now, run.user_id),
    env.DB.prepare('INSERT INTO runs (user_id, score, mode, correct, total, duration_ms, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
      .bind(run.user_id, run.score, run.mode, run.correct, run.total, now - run.started_at, now),
  ]);
  const row = await env.DB.prepare('SELECT best_score FROM users WHERE id = ?1').bind(run.user_id).first();
  const r = await env.DB.prepare('SELECT COUNT(*) + 1 AS r FROM users WHERE best_score > ?1').bind(row.best_score).first();
  return { best: row.best_score, rank: r.r, counted: true };
}

export async function runStart(req, env) {
  const body = await readJson(req);
  const u = await authUser(req, env, body);
  const mode = body.mode === 'written' ? 'written' : 'oral';
  const topics = (Array.isArray(body.topics) ? body.topics : []).filter((t) => TOPICS.includes(t)).sort();
  // Незавершённые забеги этого пользователя закрываем
  const { results: open } = await env.DB.prepare('SELECT * FROM run_sessions WHERE user_id = ?1 AND finished = 0').bind(u.id).all();
  for (const r of open) await finish(env, r);
  const id = crypto.randomUUID();
  const seed = (crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff) || 1;
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO run_sessions (id, user_id, seed, mode, topics, idx, score, lives, correct, total, suspicious, started_at, last_at, finished)
     VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, ?6, 0, 0, 0, ?7, ?7, 0)`
  ).bind(id, u.id, seed, mode, JSON.stringify(topics), LIVES, now).run();
  // Имя и аватар в рейтинге — из подписанных данных Telegram
  await env.DB.prepare(
    `INSERT INTO users (id, name, username, photo_url, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, username = excluded.username, photo_url = COALESCE(excluded.photo_url, users.photo_url)`
  ).bind(u.id, u.name, u.username, u.photo_url, now).run();
  return { runId: id, seed, mode, topics, lives: LIVES, genVersion: GEN_VERSION };
}

async function loadRun(env, u, runId) {
  const run = await env.DB.prepare('SELECT * FROM run_sessions WHERE id = ?1 AND user_id = ?2').bind(String(runId || ''), u.id).first();
  if (!run) throw new HttpError(404, 'Забег не найден');
  run.topics = JSON.parse(run.topics || '[]');
  return run;
}

export async function runAnswer(req, env) {
  const body = await readJson(req);
  const u = await authUser(req, env, body);
  const run = await loadRun(env, u, body.runId);
  if (run.finished) throw new HttpError(409, 'Забег уже завершён');
  const now = Date.now();
  if (now - run.last_at > IDLE_MS) { const f = await finish(env, run); return { finished: true, expired: true, ...run, ...f }; }
  if (Number(body.i) !== run.idx) return { stale: true, idx: run.idx, score: run.score, lives: run.lives, correct: run.correct };

  const task = taskAt(run.seed, run.idx, run.mode, level(run.correct), run.topics);
  let ok;
  if (run.mode === 'written') {
    const r = checkAnswer(String(body.answer || ''), task.value);
    if (!r.ok) throw new HttpError(400, 'Не понял ответ: ' + r.error);
    ok = r.correct;
  } else ok = body.answer === task.a;

  const elapsed = now - run.last_at;
  const fast = elapsed < MIN_MS;
  let gained = 0;
  if (ok && !fast) gained = run.mode === 'oral' ? 10 * level(run.correct) + Math.max(0, Math.round(10 * (1 - elapsed / ORAL_TIME))) : 30 * level(run.correct);
  const next = {
    idx: run.idx + 1, total: run.total + 1,
    correct: run.correct + (ok ? 1 : 0),
    lives: run.lives - (ok ? 0 : 1),
    score: run.score + gained,
    suspicious: run.suspicious + (fast ? 1 : 0),
  };
  await env.DB.prepare('UPDATE run_sessions SET idx = ?1, total = ?2, correct = ?3, lives = ?4, score = ?5, suspicious = ?6, last_at = ?7 WHERE id = ?8 AND idx = ?9')
    .bind(next.idx, next.total, next.correct, next.lives, next.score, next.suspicious, now, run.id, run.idx).run();
  const out = { ok, gained, ...next, answer: task.a, finished: false };
  if (next.lives <= 0) Object.assign(out, { finished: true }, await finish(env, { ...run, ...next }));
  return out;
}

// После ошибки клиент показывает пояснение; «Дальше» сбрасывает таймер, чтобы чтение не съедало бонус
export async function runNext(req, env) {
  const body = await readJson(req);
  const u = await authUser(req, env, body);
  const run = await loadRun(env, u, body.runId);
  if (!run.finished) await env.DB.prepare('UPDATE run_sessions SET last_at = ?1 WHERE id = ?2').bind(Date.now(), run.id).run();
  return { ok: true };
}

export async function runEnd(req, env) {
  const body = await readJson(req);
  const u = await authUser(req, env, body);
  const run = await loadRun(env, u, body.runId);
  if (run.finished) return { finished: true, best: null, rank: null, counted: false, score: run.score };
  return { finished: true, score: run.score, ...(await finish(env, run)) };
}
