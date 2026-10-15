// Сервер тренажёра: рейтинг, синхронизация, вход с сайта, бот.
//
// GET  /api/top?limit=100   — топ по лучшему счёту (без авторизации)
// POST /api/run/*          — забег генератора с проверкой ответов на сервере
// POST /api/admin/*        — админка (ADMIN_IDS)
// GET  /api/state           — синхронизируемое состояние пользователя
// PUT  /api/state           — сохранить состояние { state, rev }
// POST /api/auth/widget     — вход на сайте через Telegram Login Widget → токен
// POST /telegram            — вебхук бота: /start, /top, inline-режим @бот
// GET  /admin/setup?key=…   — один раз: подключить вебхук, команды и кнопку меню
// POST /api/duel            — создать дуэль → { code }
// GET  /api/duel/<код>/ws   — WebSocket комнаты дуэли (Durable Object)
// POST /api/events          — обезличенная статистика ответов
// GET  /api/stats           — статистика для преподавателей (ADMIN_IDS)
// GET  /api/me              — { id, isAdmin, duels }
//
// Авторизация: заголовок X-Telegram-Init-Data (Mini App) или Authorization: Bearer <токен> (сайт).
import { mergeState } from '../../js/merge.js';
import { HttpError, hmac, hex, safeEqual, b64url, sessionKey, userFrom, authUser, isAdmin } from './auth.js';
import { DuelRoom, createRoom, recordStats } from './duel.js';
import { tg, appUrl, escHtml } from './bot.js';
import { pairGet, pairInvite, pairRespond, pairAck, pairLeave, pairPoke, evalPairsFor, remind } from './pair.js';
import { runStart, runAnswer, runNext, runEnd } from './run.js';
import { adminGetUser, adminSaveUser, adminResetRating, adminSeasons } from './admin.js';

export { DuelRoom };

const MAX_SCORE = 200000;
const MIN_MS_PER_ANSWER = 700;
const SUBMIT_COOLDOWN_MS = 15000;
const AUTH_MAX_AGE = 86400;          // initData и данные виджета старше суток не принимаем
const SESSION_DAYS = 60;             // сколько живёт вход на сайте
const MAX_STATE_BYTES = 20000;
const MSK = 3 * 3600000;

const enc = new TextEncoder();

export default {
  // Ежедневно в 22:00 МСК: напомнить тем, у кого огонёк сегодня ещё не продлён
  async scheduled(event, env, ctx) { ctx.waitUntil(remind(env)); },

  async fetch(req, env) {
    const url = new URL(req.url);
    const cors = corsHeaders(env, req.headers.get('Origin') || '');
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      const p = url.pathname, m = req.method;
      if (p === '/telegram' && m === 'POST') return await webhook(req, env);
      if (p === '/admin/setup' && m === 'GET') return json(await setup(env, url), 200, {});
      if (p === '/api/top' && m === 'GET') return json(await top(env, url), 200, cors, 'public, max-age=15');
      if (p === '/api/score' && m === 'POST') throw new HttpError(410, 'Обнови страницу: результаты теперь проверяются на сервере');
      if (p === '/api/run/start' && m === 'POST') return json(await runStart(req, env), 200, cors);
      if (p === '/api/run/answer' && m === 'POST') return json(await runAnswer(req, env), 200, cors);
      if (p === '/api/run/next' && m === 'POST') return json(await runNext(req, env), 200, cors);
      if (p === '/api/run/end' && m === 'POST') return json(await runEnd(req, env), 200, cors);
      if (p === '/api/admin/user' && m === 'GET') return json(await adminGetUser(req, env, url), 200, cors);
      if (p === '/api/admin/user' && m === 'POST') return json(await adminSaveUser(req, env), 200, cors);
      if (p === '/api/admin/reset-rating' && m === 'POST') return json(await adminResetRating(req, env), 200, cors);
      if (p === '/api/admin/seasons' && m === 'GET') return json(await adminSeasons(req, env), 200, cors);
      if (p === '/api/pair/poke' && m === 'POST') return json(await pairPoke(req, env), 200, cors);
      if (p === '/api/state' && m === 'GET') return json(await getState(req, env), 200, cors);
      if (p === '/api/state' && m === 'PUT') return json(await putState(req, env), 200, cors);
      if (p === '/api/auth/widget' && m === 'POST') return json(await widgetLogin(req, env), 200, cors);
      if (p === '/api/duel' && m === 'POST') { const u = await authUser(req, env); return json({ code: await createRoom(env, u) }, 200, cors); }
      const dm = p.match(/^\/api\/duel\/([A-Z0-9]{6})\/ws$/);
      if (dm) {
        if (req.headers.get('Upgrade') !== 'websocket') throw new HttpError(426, 'Нужен WebSocket');
        return env.DUEL.get(env.DUEL.idFromName(dm[1])).fetch(req);
      }
      if (p === '/api/events' && m === 'POST') return json(await events(req, env), 200, cors);
      if (p === '/api/stats' && m === 'GET') return json(await stats(req, env, url), 200, cors);
      if (p === '/api/me' && m === 'GET') return json(await meInfo(req, env), 200, cors);
      if (p === '/api/pair' && m === 'GET') return json(await pairGet(req, env), 200, cors);
      if (p === '/api/pair/invite' && m === 'POST') return json(await pairInvite(req, env), 200, cors);
      if (p === '/api/pair/respond' && m === 'POST') return json(await pairRespond(req, env), 200, cors);
      if (p === '/api/pair/ack' && m === 'POST') return json(await pairAck(req, env), 200, cors);
      if (p === '/api/pair/leave' && m === 'POST') return json(await pairLeave(req, env), 200, cors);
      if (p === '/admin/remind' && m === 'GET') {
        if (!env.WEBHOOK_SECRET || url.searchParams.get('key') !== env.WEBHOOK_SECRET) throw new HttpError(403, 'Неверный ключ');
        return json(await remind(env, { dry: url.searchParams.has('dry') }), 200, {});
      }
      if (p === '/') return json({ ok: true, service: 'matan-api' }, 200, cors);
      throw new HttpError(404, 'Не найдено');
    } catch (e) {
      if (!e.status) console.error(e);
      return json({ error: e.message || 'Внутренняя ошибка' }, e.status || 500, cors);
    }
  },
};

/* ---------- общее ---------- */
function corsHeaders(env, origin) {
  const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim());
  const any = allowed.includes('*');
  return {
    'Access-Control-Allow-Origin': any ? '*' : allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Telegram-Init-Data',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
function json(data, status, headers, cache) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache || 'no-store' } });
}
const readJson = async (req) => { const t = await req.text(); if (!t.trim()) return {}; try { return JSON.parse(t); } catch (e) { throw new HttpError(400, 'Неверный JSON'); } };
const int = (v, min, max, name) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, 'Неверное поле ' + name);
  return n;
};
const dayMSK = (t = Date.now()) => new Date(t + MSK).toISOString().slice(0, 10);

// Вход на сайте: https://core.telegram.org/widgets/login#checking-authorization
async function widgetLogin(req, env) {
  const data = await readJson(req);
  const { hash, ...fields } = data || {};
  if (!hash) throw new HttpError(400, 'Нет подписи');
  const check = Object.keys(fields).filter((k) => fields[k] != null).sort().map((k) => k + '=' + fields[k]).join('\n');
  const secret = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(env.BOT_TOKEN)));
  if (!safeEqual(hex(await hmac(secret, check)), hash)) throw new HttpError(401, 'Подпись Telegram не сошлась');
  if (Date.now() / 1000 - Number(fields.auth_date || 0) > AUTH_MAX_AGE) throw new HttpError(401, 'Данные входа устарели');
  const user = userFrom(fields);
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  const payload = b64url(JSON.stringify({ ...user, exp }));
  const token = payload + '.' + hex(await hmac(sessionKey(env), payload));
  await upsertUser(env, user);
  return { token, exp, user };
}

function upsertUser(env, u) {
  return env.DB.prepare(
    `INSERT INTO users (id, name, username, photo_url, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, username = excluded.username, photo_url = COALESCE(excluded.photo_url, users.photo_url)`
  ).bind(u.id, u.name, u.username, u.photo_url, Date.now()).run();
}

/* ---------- рейтинг ---------- */
function effectiveStreak(row) {
  if (!row.last_covered) return row.streak || 0;
  const today = dayMSK(), yesterday = dayMSK(Date.now() - 86400000);
  return row.last_covered >= yesterday || row.last_covered === today ? row.streak : 0;
}
async function topRows(env, limit) {
  const { results } = await env.DB.prepare(
    'SELECT id, name, username, photo_url, best_score, streak, last_covered FROM users WHERE best_score > 0 ORDER BY best_score DESC, updated_at ASC LIMIT ?1'
  ).bind(limit).all();
  return results.map((r) => ({ id: r.id, name: r.name, username: r.username, photo_url: r.photo_url, best_score: r.best_score, streak: effectiveStreak(r) }));
}
async function top(env, url) {
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));
  return { top: await topRows(env, limit), updated: Date.now() };
}
async function rankOf(env, userId) {
  const row = await env.DB.prepare('SELECT best_score FROM users WHERE id = ?1').bind(userId).first();
  if (!row || !row.best_score) return null;
  const r = await env.DB.prepare('SELECT COUNT(*) + 1 AS r FROM users WHERE best_score > ?1').bind(row.best_score).first();
  return { best: row.best_score, rank: r.r };
}

/* ---------- синхронизация ---------- */
async function getState(req, env) {
  const u = await authUser(req, env);
  const row = await env.DB.prepare('SELECT data, rev FROM user_state WHERE user_id = ?1').bind(u.id).first();
  return row ? { state: JSON.parse(row.data), rev: row.rev } : { state: null, rev: 0 };
}

function sanitize(state) {
  if (!state || typeof state !== 'object') throw new HttpError(400, 'Нет состояния');
  const s = state.streak || {};
  int(s.streak || 0, 0, 100000, 'streak');
  const raw = JSON.stringify(state);
  if (raw.length > MAX_STATE_BYTES) throw new HttpError(413, 'Слишком большое состояние');
  return JSON.parse(raw);
}

async function putState(req, env) {
  const body = await readJson(req);
  const u = await authUser(req, env, body);
  const incoming = sanitize(body.state);
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await env.DB.prepare('SELECT data, rev FROM user_state WHERE user_id = ?1').bind(u.id).first();
    const rev = row ? row.rev : 0;
    // Клиент видел последнюю версию — принимаем как есть; иначе сливаем, чтобы не потерять данные с другого устройства
    const stored = !row || body.rev === rev ? incoming : mergeState(JSON.parse(row.data), incoming);
    const now = Date.now();
    const res = row
      ? await env.DB.prepare('UPDATE user_state SET data = ?1, rev = rev + 1, updated_at = ?2 WHERE user_id = ?3 AND rev = ?4').bind(JSON.stringify(stored), now, u.id, rev).run()
      : await env.DB.prepare('INSERT OR IGNORE INTO user_state (user_id, data, rev, updated_at) VALUES (?1, ?2, 1, ?3)').bind(u.id, JSON.stringify(stored), now).run();
    if (res.meta && res.meta.changes === 0) continue; // кто-то успел записать раньше — повторяем
    const s = stored.streak || {};
    await env.DB.prepare(
      `INSERT INTO users (id, name, username, photo_url, streak, last_covered, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, username = excluded.username,
         photo_url = COALESCE(excluded.photo_url, users.photo_url), streak = excluded.streak, last_covered = excluded.last_covered`
    ).bind(u.id, u.name, u.username, u.photo_url, s.streak || 0, s.lastCovered || null, now).run();
    await evalPairsFor(env, u.id);
    return { state: stored, rev: rev + 1 };
  }
  throw new HttpError(409, 'Конфликт записи, попробуй ещё раз');
}

/* ---------- бот ---------- */
const MEDALS = ['🥇', '🥈', '🥉'];

function topText(rows, mine) {
  let t = '<b>!¡ матан — топ-10</b>\n\n';
  if (!rows.length) t += 'Пока пусто. Сыграй в генератор и стань первым!';
  t += rows.map((u, i) =>
    (MEDALS[i] || (i + 1) + '.') + ' ' + escHtml(u.name) + ' — <b>' + u.best_score.toLocaleString('ru-RU') + '</b>' + (u.streak > 0 ? ' · 🔥' + u.streak : '')
  ).join('\n');
  if (mine && mine.rank > rows.length) t += '\n…\n' + mine.rank + '. ' + escHtml(mine.name) + ' — <b>' + mine.best.toLocaleString('ru-RU') + '</b>';
  return t + '\n\n<i>Сортировка по лучшему счёту в генераторе, 🔥 — серия дней.</i>';
}
const openButton = (env, param) => ({ inline_keyboard: [[{ text: 'Открыть тренажёр', url: appUrl(env, param) }]] });

async function webhook(req, env) {
  if (!env.WEBHOOK_SECRET || req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
  const upd = await req.json().catch(() => ({}));
  try {
    if (upd.inline_query) await onInline(env, upd.inline_query);
    else if (upd.message && upd.message.text) await onMessage(env, upd.message);
  } catch (e) { console.error(e); }
  return new Response('ok');
}

async function onInline(env, q) {
  const rows = await topRows(env, 10);
  const r = await rankOf(env, q.from.id);
  const mine = r ? { ...r, name: [q.from.first_name, q.from.last_name].filter(Boolean).join(' ') } : null;
  const results = [{
    type: 'article', id: 'top10',
    title: 'Топ-10 рейтинга',
    description: rows.length ? rows.slice(0, 3).map((u, i) => (i + 1) + '. ' + u.name + ' ' + u.best_score).join('   ') : 'Пока пусто',
    thumbnail_url: env.SITE_URL + 'icons/icon-192.png',
    input_message_content: { message_text: topText(rows, mine), parse_mode: 'HTML', link_preview_options: { is_disabled: true } },
    reply_markup: openButton(env, 'rating'),
  }];
  if (mine) results.push({
    type: 'article', id: 'me',
    title: 'Моё место: ' + mine.rank,
    description: 'Лучший счёт ' + mine.best + '. Отправить вызов в чат',
    thumbnail_url: env.SITE_URL + 'icons/icon-192.png',
    input_message_content: { message_text: 'Я на <b>' + mine.rank + '-м месте</b> в !¡ матан с результатом <b>' + mine.best.toLocaleString('ru-RU') + '</b>. Попробуй обогнать!', parse_mode: 'HTML' },
    reply_markup: openButton(env, 'endless'),
  });
  await tg(env, 'answerInlineQuery', { inline_query_id: q.id, results, cache_time: 20, is_personal: true });
}

async function onMessage(env, msg) {
  const cmd = msg.text.trim().split(/[\s@]/)[0].toLowerCase();
  const chat = msg.chat.id, priv = msg.chat.type === 'private';
  if (cmd === '/start' || cmd === '/help') {
    await tg(env, 'sendMessage', {
      chat_id: chat,
      text: '<b>!¡ матан</b> — тренажёр по матанализу.\n\nТеория, задачи по темам, бесконечный генератор, графики и серия дней.\n\n/top — топ-10 рейтинга.\n/duel — вызвать на дуэль, можно с @соперником. В любом чате можно написать @' + env.BOT_USERNAME + ' и отправить топ одним нажатием.',
      parse_mode: 'HTML',
      reply_markup: priv ? { inline_keyboard: [[{ text: 'Открыть тренажёр', web_app: { url: env.SITE_URL } }]] } : openButton(env),
    });
  } else if (cmd === '/duel') {
    // Вызов на дуэль прямо в чате: «/duel» или «/duel @username»
    const target = (msg.text.match(/@([a-zA-Z0-9_]{4,32})/g) || []).map((x) => x.slice(1)).find((n) => n.toLowerCase() !== String(env.BOT_USERNAME).toLowerCase());
    const owner = userFrom(msg.from);
    const code = await createRoom(env, owner);
    await tg(env, 'sendMessage', {
      chat_id: chat,
      text: '⚔️ <b>' + escHtml(owner.name) + '</b> вызывает ' + (target ? '@' + escHtml(target) : 'на дуэль') + (target ? ' на дуэль' : '') +
        '!\n\n60 секунд, одинаковые устные задачи, кто больше очков. Код комнаты: <code>' + code + '</code>' +
        (priv ? '\n\nПерешли это сообщение сопернику и открой комнату сам.' : ''),
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: 'Принять вызов', url: appUrl(env, 'duel_' + code) }]] },
    });
    const rows = await topRows(env, 10);
    const r = await rankOf(env, msg.from.id);
    const mine = r ? { ...r, name: [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ') } : null;
    await tg(env, 'sendMessage', { chat_id: chat, text: topText(rows, mine), parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: openButton(env, 'rating') });
  }
}

// Однократная настройка бота: вебхук, команды, кнопка меню
async function setup(env, url) {
  if (!env.WEBHOOK_SECRET || url.searchParams.get('key') !== env.WEBHOOK_SECRET) throw new HttpError(403, 'Неверный ключ');
  const hook = url.origin + '/telegram';
  return {
    webhook: await tg(env, 'setWebhook', { url: hook, secret_token: env.WEBHOOK_SECRET, allowed_updates: ['message', 'inline_query'], drop_pending_updates: true }),
    commands: await tg(env, 'setMyCommands', { commands: [{ command: 'start', description: 'Открыть тренажёр' }, { command: 'top', description: 'Топ-10 рейтинга' }, { command: 'duel', description: 'Вызвать на дуэль (можно указать @соперника)' }] }),
    menu: await tg(env, 'setChatMenuButton', { menu_button: { type: 'web_app', text: 'Тренажёр', web_app: { url: env.SITE_URL } } }),
  };
}

/* ---------- статистика для преподавателя ---------- */
const SRCS = ['practice', 'endless', 'duel'];
const TOPICS = ['deriv', 'growth', 'lim', 'rem', 'circle', 'other'];
async function events(req, env) {
  const body = await readJson(req);
  await authUser(req, env, body);
  const list = Array.isArray(body.events) ? body.events.slice(0, 200) : [];
  const agg = {};
  for (const e of list) {
    if (!e || !SRCS.includes(e.src) || !TOPICS.includes(e.topic) || typeof e.kind !== 'string' || !/^[a-z0-9:-]{1,40}$/i.test(e.kind)) continue;
    const k = e.src + '|' + e.topic + '|' + e.kind;
    const a = agg[k] || (agg[k] = { src: e.src, topic: e.topic, kind: e.kind, attempts: 0, errors: 0 });
    a.attempts++; if (!e.ok) a.errors++;
  }
  await recordStats(env, Object.values(agg));
  return { ok: true, accepted: Object.values(agg).reduce((s, x) => s + x.attempts, 0) };
}

async function stats(req, env, url) {
  const u = await authUser(req, env);
  if (!isAdmin(env, u)) throw new HttpError(403, 'Статистика доступна только преподавателям');
  const days = Math.max(0, Math.min(3650, Number(url.searchParams.get('days')) || 0));
  const src = url.searchParams.get('src');
  const since = days ? dayMSK(Date.now() - (days - 1) * 86400000) : '0000-00-00';
  const where = 'day >= ?1' + (SRCS.includes(src) ? ' AND src = ?2' : '');
  const q = env.DB.prepare('SELECT topic, kind, SUM(attempts) AS attempts, SUM(errors) AS errors FROM stats_daily WHERE ' + where + ' GROUP BY topic, kind');
  const { results } = await (SRCS.includes(src) ? q.bind(since, src) : q.bind(since)).all();
  const sinceMs = days ? Date.now() - days * 86400000 : 0;
  const users = await env.DB.prepare('SELECT COUNT(*) AS n FROM user_state WHERE updated_at >= ?1').bind(sinceMs).first();
  return { rows: results, users: users ? users.n : 0, days, src: src || 'all' };
}

async function meInfo(req, env) {
  const u = await authUser(req, env);
  const r = await env.DB.prepare(
    `SELECT SUM(CASE WHEN winner = ?1 THEN 1 ELSE 0 END) AS wins,
            SUM(CASE WHEN winner IS NOT NULL AND winner != ?1 THEN 1 ELSE 0 END) AS losses,
            SUM(CASE WHEN winner IS NULL THEN 1 ELSE 0 END) AS draws
     FROM duels WHERE a_id = ?1 OR b_id = ?1`
  ).bind(u.id).first();
  return { id: u.id, isAdmin: isAdmin(env, u), duels: { wins: (r && r.wins) || 0, losses: (r && r.losses) || 0, draws: (r && r.draws) || 0 } };
}
