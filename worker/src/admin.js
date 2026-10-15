// Админка: правка серии и заморозок пользователя, сброс рейтинга с архивом сезона. Только для ADMIN_IDS.
import { HttpError, authUser, isAdmin } from './auth.js';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const dayMSK = (t = Date.now()) => new Date(t + 3 * 3600000).toISOString().slice(0, 10);
async function readJson(req) { const t = await req.text(); if (!t.trim()) return {}; try { return JSON.parse(t); } catch (e) { throw new HttpError(400, 'Неверный JSON'); } }
async function admin(req, env, body) {
  const u = await authUser(req, env, body);
  if (!isAdmin(env, u)) throw new HttpError(403, 'Только для преподавателей');
  return u;
}

async function findUser(env, q) {
  q = String(q || '').trim().replace(/^@/, '');
  if (/^\d+$/.test(q)) return env.DB.prepare('SELECT * FROM users WHERE id = ?1').bind(Number(q)).first();
  if (/^[a-zA-Z0-9_]{3,32}$/.test(q)) return env.DB.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?1)').bind(q).first();
  throw new HttpError(400, 'Введи числовой ID или @юзернейм');
}

async function view(env, user) {
  const st = await env.DB.prepare('SELECT data, rev, updated_at FROM user_state WHERE user_id = ?1').bind(user.id).first();
  const data = st ? JSON.parse(st.data) : {};
  const s = data.streak || {};
  const month = dayMSK().slice(0, 7);
  const pair = await env.DB.prepare("SELECT * FROM pairs WHERE status = 'active' AND (a_id = ?1 OR b_id = ?1)").bind(user.id).first();
  let partner = null;
  if (pair) partner = await env.DB.prepare('SELECT id, name, username FROM users WHERE id = ?1').bind(pair.a_id === user.id ? pair.b_id : pair.a_id).first();
  return {
    user: { id: user.id, name: user.name, username: user.username, photo_url: user.photo_url, best_score: user.best_score, games: user.games },
    streak: {
      streak: s.streak || 0, best: s.best || 0, lastDone: s.lastDone || null, lastCovered: s.lastCovered || null,
      freezeUsed: s.freeze && s.freeze.month === month ? s.freeze.used || 0 : 0, month, frozen: s.frozen || [], count: s.count || 0, day: s.day || null,
    },
    synced: !!st, syncedAt: st ? st.updated_at : null,
    pair: pair ? { id: pair.id, streak: pair.streak, last_covered: pair.last_covered, partner } : null,
  };
}

export async function adminGetUser(req, env, url) {
  await admin(req, env);
  const user = await findUser(env, url.searchParams.get('q'));
  if (!user) throw new HttpError(404, 'Пользователь не найден. Он должен хотя бы раз войти в тренажёр');
  return view(env, user);
}

export async function adminSaveUser(req, env) {
  const body = await readJson(req);
  await admin(req, env, body);
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?1').bind(Number(body.id)).first();
  if (!user) throw new HttpError(404, 'Пользователь не найден');
  const p = body.streak || {};
  const streak = Number(p.streak);
  if (!Number.isInteger(streak) || streak < 0 || streak > 100000) throw new HttpError(400, 'Серия — целое число от 0');
  const lastCovered = p.lastCovered ? String(p.lastCovered) : null;
  if (lastCovered && !DAY_RE.test(lastCovered)) throw new HttpError(400, 'Дата в формате ГГГГ-ММ-ДД');
  if (streak > 0 && !lastCovered) throw new HttpError(400, 'Для серии больше нуля укажи последний закрытый день');
  const freezeUsed = Number(p.freezeUsed);
  if (!Number.isInteger(freezeUsed) || freezeUsed < 0 || freezeUsed > 10) throw new HttpError(400, 'Использовано заморозок — от 0');

  const row = await env.DB.prepare('SELECT data, rev FROM user_state WHERE user_id = ?1').bind(user.id).first();
  const data = row ? JSON.parse(row.data) : { best: {}, settings: {}, settingsAt: 0 };
  const today = dayMSK();
  const s = data.streak || {};
  // adminAt: правка администратора побеждает при слиянии с устройствами пользователя (см. js/merge.js)
  data.streak = {
    ...s, streak, lastCovered, lastDone: p.lastDone && DAY_RE.test(p.lastDone) ? p.lastDone : lastCovered,
    best: Math.max(Number(p.best) || 0, streak), pending: null,
    freeze: { month: today.slice(0, 7), used: freezeUsed },
    day: s.day || today, count: s.day === today ? s.count || 0 : 0,
    frozen: Array.isArray(s.frozen) ? s.frozen : [], adminAt: Date.now(), updated: Date.now(),
  };
  const now = Date.now();
  if (row) await env.DB.prepare('UPDATE user_state SET data = ?1, rev = rev + 1, updated_at = ?2 WHERE user_id = ?3').bind(JSON.stringify(data), now, user.id).run();
  else await env.DB.prepare('INSERT INTO user_state (user_id, data, rev, updated_at) VALUES (?1, ?2, 1, ?3)').bind(user.id, JSON.stringify(data), now).run();
  const sets = ['streak = ?1', 'last_covered = ?2'];
  const args = [streak, lastCovered];
  if (body.bestScore !== undefined && body.bestScore !== null && body.bestScore !== '') {
    const bs = Number(body.bestScore);
    if (!Number.isInteger(bs) || bs < 0) throw new HttpError(400, 'Лучший счёт — целое число от 0');
    sets.push('best_score = ?3'); args.push(bs);
  }
  args.push(user.id);
  await env.DB.prepare('UPDATE users SET ' + sets.join(', ') + ' WHERE id = ?' + args.length).bind(...args).run();
  return view(env, await env.DB.prepare('SELECT * FROM users WHERE id = ?1').bind(user.id).first());
}

// Сброс рейтинга: топ-100 сохраняется в архив сезона, лучшие счёты обнуляются
export async function adminResetRating(req, env) {
  const body = await readJson(req);
  const u = await admin(req, env, body);
  if (body.confirm !== 'СБРОС') throw new HttpError(400, 'Для подтверждения впиши слово СБРОС');
  const { results } = await env.DB.prepare('SELECT id, name, username, best_score FROM users WHERE best_score > 0 ORDER BY best_score DESC LIMIT 100').all();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO seasons (created_at, created_by, top) VALUES (?1, ?2, ?3)').bind(now, u.id, JSON.stringify(results)),
    env.DB.prepare('UPDATE users SET best_score = 0'),
  ]);
  return { ok: true, archived: results.length };
}

export async function adminSeasons(req, env) {
  await admin(req, env);
  const { results } = await env.DB.prepare('SELECT id, created_at, top FROM seasons ORDER BY created_at DESC LIMIT 20').all();
  return { seasons: results.map((r) => { const top = JSON.parse(r.top || '[]'); return { id: r.id, created_at: r.created_at, players: top.length, top3: top.slice(0, 3) }; }) };
}
