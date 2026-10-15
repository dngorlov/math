// Совместный огонёк и напоминания.
//
// Правила пары (всё по московскому времени):
// - серия +1 за день, когда ОБА решили задание дня (5 верных);
// - если кто-то заморозил свой день — день закрыт, серия не растёт, но и не гаснет;
// - если хотя бы один не решил и не заморозил — в полночь серия гаснет.
import { HttpError, authUser } from './auth.js';
import { dm, escHtml } from './bot.js';

const MSK = 3 * 3600000;
const dayMSK = (t = Date.now()) => new Date(t + MSK).toISOString().slice(0, 10);
const GOAL = 5;
const POKE_EVERY_MS = 3 * 3600000; // пинать можно не чаще раза в 3 часа

async function readJson(req) { const t = await req.text(); if (!t.trim()) return {}; try { return JSON.parse(t); } catch (e) { throw new HttpError(400, 'Неверный JSON'); } }

async function stateOf(env, id) {
  const row = await env.DB.prepare('SELECT data FROM user_state WHERE user_id = ?1').bind(id).first();
  if (!row) return { streak: {}, settings: {} };
  try { const d = JSON.parse(row.data); return { streak: d.streak || {}, settings: d.settings || {} }; } catch (e) { return { streak: {}, settings: {} }; }
}
const userRow = (env, id) => env.DB.prepare('SELECT id, name, username, photo_url FROM users WHERE id = ?1').bind(id).first();

// Сегодняшний статус участника: сколько решено, выполнено ли, заморожено ли
function today(st, day = dayMSK()) {
  const s = st.streak || {};
  const done = s.lastDone === day;
  const frozen = !done && Array.isArray(s.frozen) && s.frozen.includes(day);
  return { count: done ? GOAL : s.day === day ? Math.min(GOAL, s.count || 0) : 0, done, frozen, covered: s.lastCovered === day || done || frozen };
}

// Пересчитать серию пары по состояниям участников. Вызывается при любом изменении данных участника и при чтении.
async function evalPair(env, pair) {
  if (pair.status !== 'active') return pair;
  const day = dayMSK(), yesterday = dayMSK(Date.now() - 86400000);
  const [sa, sb] = await Promise.all([stateOf(env, pair.a_id), stateOf(env, pair.b_id)]);
  const ta = today(sa, day), tb = today(sb, day);
  let { streak, best, last_covered: lastCov, last_inc: lastInc } = pair;
  if (streak > 0 && lastCov && lastCov < yesterday) streak = 0; // погасла
  if (ta.covered && tb.covered) {
    lastCov = day;
    if (ta.done && tb.done && lastInc !== day) { streak += 1; lastInc = day; }
  }
  best = Math.max(best || 0, streak);
  if (streak !== pair.streak || lastCov !== pair.last_covered || lastInc !== pair.last_inc || best !== pair.best) {
    await env.DB.prepare('UPDATE pairs SET streak = ?1, best = ?2, last_covered = ?3, last_inc = ?4, updated_at = ?5 WHERE id = ?6')
      .bind(streak, best, lastCov, lastInc, Date.now(), pair.id).run();
  }
  return { ...pair, streak, best, last_covered: lastCov, last_inc: lastInc, _today: { a: ta, b: tb } };
}

export async function evalPairsFor(env, userId) {
  const p = await activePair(env, userId);
  if (p) await evalPair(env, p);
}

const activePair = (env, id) => env.DB.prepare("SELECT * FROM pairs WHERE status = 'active' AND (a_id = ?1 OR b_id = ?1) LIMIT 1").bind(id).first();
const pendingOut = (env, id) => env.DB.prepare("SELECT * FROM pairs WHERE status = 'pending' AND a_id = ?1 LIMIT 1").bind(id).first();

/* ---------- API ---------- */
export async function pairGet(req, env) {
  const u = await authUser(req, env);
  const out = { pair: null, outgoing: null, incoming: [], notices: [] };
  let p = await activePair(env, u.id);
  if (p) {
    p = await evalPair(env, p);
    const mine = p.a_id === u.id ? 'a' : 'b', other = mine === 'a' ? 'b' : 'a';
    const partner = await userRow(env, p[other + '_id']);
    const day = dayMSK(), yesterday = dayMSK(Date.now() - 86400000);
    const alive = p.last_covered && p.last_covered >= yesterday;
    const canPokeAt = (p.poke_at || 0) + POKE_EVERY_MS;
    out.pair = {
      id: p.id, partner, streak: alive ? p.streak : 0, best: p.best,
      // Пинок от партнёра сегодня — клиент покажет уведомление один раз
      poked: p.poke_by && p.poke_by !== u.id && p.poke_at && dayMSK(p.poke_at) === day ? { at: p.poke_at } : null,
      pokeAvailableAt: p.poke_by === u.id ? canPokeAt : 0,
      countedToday: p.last_inc === day, coveredToday: p.last_covered === day,
      today: { me: p._today[mine], partner: p._today[other] },
    };
  }
  const og = await pendingOut(env, u.id);
  if (og) out.outgoing = { id: og.id, to: await userRow(env, og.b_id), created_at: og.created_at };
  const { results: inc } = await env.DB.prepare("SELECT * FROM pairs WHERE status = 'pending' AND b_id = ?1 ORDER BY created_at").bind(u.id).all();
  for (const r of inc) out.incoming.push({ id: r.id, from: await userRow(env, r.a_id), created_at: r.created_at });
  const { results: nts } = await env.DB.prepare('SELECT * FROM pairs WHERE notice_for = ?1').bind(u.id).all();
  for (const r of nts) {
    const otherId = r.a_id === u.id ? r.b_id : r.a_id;
    out.notices.push({ id: r.id, type: r.status === 'active' ? 'accepted' : r.status, by: await userRow(env, otherId), streak: r.streak });
  }
  return out;
}

export async function pairInvite(req, env) {
  const body = await readJson(req);
  const u = await authUser(req, env, body);
  const name = String(body.username || '').trim().replace(/^@/, '').replace(/^https?:\/\/t\.me\//i, '');
  if (!/^[a-zA-Z0-9_]{4,32}$/.test(name)) throw new HttpError(400, 'Юзернейм Telegram — латиница, цифры и _, от 4 до 32 символов');
  if (await activePair(env, u.id)) throw new HttpError(409, 'У тебя уже есть совместный огонёк. Сначала выйди из него');
  if (await pendingOut(env, u.id)) throw new HttpError(409, 'Ты уже отправил приглашение. Отмени его, чтобы пригласить другого');
  const to = await env.DB.prepare('SELECT id, name, username, photo_url FROM users WHERE LOWER(username) = LOWER(?1)').bind(name).first();
  if (!to) throw new HttpError(404, '@' + name + ' ещё не заходил в тренажёр. Пусть откроет бота хотя бы раз, потом отправь приглашение снова');
  if (to.id === u.id) throw new HttpError(400, 'Нельзя пригласить самого себя');
  if (await activePair(env, to.id)) throw new HttpError(409, '@' + name + ' уже ведёт совместный огонёк с кем-то другим');
  const dup = await env.DB.prepare("SELECT id FROM pairs WHERE status = 'pending' AND a_id = ?1 AND b_id = ?2").bind(u.id, to.id).first();
  if (dup) throw new HttpError(409, 'Приглашение уже отправлено');
  const now = Date.now();
  await env.DB.prepare("INSERT INTO pairs (a_id, b_id, status, created_at, updated_at) VALUES (?1, ?2, 'pending', ?3, ?3)").bind(u.id, to.id, now).run();
  await dm(env, to.id, '🔥 <b>' + escHtml(u.name) + '</b>' + (u.username ? ' (@' + escHtml(u.username) + ')' : '') + ' предлагает вести совместный огонёк в !¡ матан.\n\nОгонёк растёт, когда вы оба решаете по 5 примеров в день. Открой тренажёр, чтобы принять или отклонить.');
  return { ok: true, to };
}

export async function pairRespond(req, env) {
  const body = await readJson(req);
  const u = await authUser(req, env, body);
  const p = await env.DB.prepare("SELECT * FROM pairs WHERE id = ?1 AND b_id = ?2 AND status = 'pending'").bind(Number(body.id), u.id).first();
  if (!p) throw new HttpError(404, 'Приглашение не найдено или уже неактуально');
  const now = Date.now();
  if (body.accept) {
    if (await activePair(env, u.id)) throw new HttpError(409, 'У тебя уже есть совместный огонёк. Сначала выйди из него');
    if (await activePair(env, p.a_id)) {
      await env.DB.prepare("UPDATE pairs SET status = 'ended', updated_at = ?1 WHERE id = ?2").bind(now, p.id).run();
      throw new HttpError(409, 'Пригласивший уже ведёт огонёк с кем-то другим');
    }
    await env.DB.batch([
      env.DB.prepare("UPDATE pairs SET status = 'active', notice_for = ?1, updated_at = ?2 WHERE id = ?3").bind(p.a_id, now, p.id),
      // Остальные приглашения обоим участникам больше не нужны
      env.DB.prepare("UPDATE pairs SET status = 'ended', updated_at = ?1 WHERE status = 'pending' AND id != ?2 AND (a_id IN (?3, ?4) OR b_id IN (?3, ?4))").bind(now, p.id, p.a_id, p.b_id),
    ]);
    await evalPair(env, { ...p, status: 'active', streak: 0, best: 0 });
    await dm(env, p.a_id, '🔥 <b>' + escHtml(u.name) + '</b> принял(а) приглашение. Совместный огонёк зажжён — решайте по 5 примеров в день!');
  } else {
    await env.DB.prepare("UPDATE pairs SET status = 'declined', notice_for = ?1, updated_at = ?2 WHERE id = ?3").bind(p.a_id, now, p.id).run();
    await dm(env, p.a_id, '<b>' + escHtml(u.name) + '</b> отклонил(а) приглашение на совместный огонёк. Твой одиночный огонёк продолжает гореть.');
  }
  return { ok: true };
}

// Уведомление показано — больше не показываем
export async function pairAck(req, env) {
  const body = await readJson(req);
  const u = await authUser(req, env, body);
  await env.DB.prepare('UPDATE pairs SET notice_for = NULL WHERE id = ?1 AND notice_for = ?2').bind(Number(body.id), u.id).run();
  return { ok: true };
}

// Выйти из пары или отменить своё приглашение
export async function pairLeave(req, env) {
  const body = await readJson(req);
  const u = await authUser(req, env, body);
  const now = Date.now();
  const p = await activePair(env, u.id);
  if (p) {
    const other = p.a_id === u.id ? p.b_id : p.a_id;
    await env.DB.prepare("UPDATE pairs SET status = 'ended', ended_by = ?1, notice_for = ?2, updated_at = ?3 WHERE id = ?4").bind(u.id, other, now, p.id).run();
    await dm(env, other, '<b>' + escHtml(u.name) + '</b> вышел(ла) из совместного огонька. Твой одиночный огонёк продолжает гореть.');
    return { ok: true };
  }
  const og = await pendingOut(env, u.id);
  if (og) { await env.DB.prepare("UPDATE pairs SET status = 'ended', updated_at = ?1 WHERE id = ?2").bind(now, og.id).run(); return { ok: true }; }
  throw new HttpError(404, 'Нечего отменять');
}

// Пнуть партнёра: ты решил, он ещё нет
export async function pairPoke(req, env) {
  const body = await readJson(req);
  const u = await authUser(req, env, body);
  let p = await activePair(env, u.id);
  if (!p) throw new HttpError(404, 'Нет совместного огонька');
  p = await evalPair(env, p);
  const mine = p.a_id === u.id ? 'a' : 'b', other = mine === 'a' ? 'b' : 'a';
  if (!p._today[mine].done) throw new HttpError(409, 'Сначала реши задание дня сам');
  if (p._today[other].done || p._today[other].frozen) throw new HttpError(409, 'Партнёр уже закрыл сегодняшний день');
  const now = Date.now();
  if (p.poke_by === u.id && p.poke_at && now - p.poke_at < POKE_EVERY_MS) {
    const mins = Math.ceil((p.poke_at + POKE_EVERY_MS - now) / 60000);
    throw new HttpError(429, 'Пинать можно раз в 3 часа. Следующий — через ' + (mins >= 60 ? Math.floor(mins / 60) + ' ч ' : '') + (mins % 60) + ' мин');
  }
  await env.DB.prepare('UPDATE pairs SET poke_at = ?1, poke_by = ?2 WHERE id = ?3').bind(now, u.id, p.id).run();
  const left = GOAL - p._today[other].count;
  const r = await dm(env, p[other + '_id'], '👉 <b>' + escHtml(u.name) + '</b> пинает тебя: совместный огонёк (' + p.streak + ' дн.) ждёт. Осталось решить ' + left + ' из ' + GOAL + '.', 'Решить сейчас', 'endless');
  return { ok: true, delivered: !!r.ok };
}

/* ---------- напоминание в 22:00 МСК ---------- */
export async function remind(env, { dry = false } = {}) {
  const day = dayMSK(), yesterday = dayMSK(Date.now() - 86400000);
  const { results } = await env.DB.prepare('SELECT us.user_id, us.data FROM user_state us').all();
  const report = { checked: results.length, sent: 0, failed: 0, skipped: 0, messages: [] };
  for (const row of results) {
    let d; try { d = JSON.parse(row.data); } catch (e) { continue; }
    const st = d.streak || {}, settings = d.settings || {};
    if (settings.reminders === false) { report.skipped++; continue; }
    const t = today({ streak: st }, day);
    if (t.covered) continue;
    const lines = [];
    // Одиночный огонёк жив, если вчерашний день закрыт
    if ((st.streak || 0) > 0 && st.lastCovered === yesterday) {
      lines.push('🔥 Твой огонёк (' + st.streak + ' дн.) погаснет в полночь.');
    }
    // Совместный огонёк
    let pair = await activePair(env, row.user_id);
    if (pair) {
      pair = await evalPair(env, pair);
      if (pair.streak > 0 && pair.last_covered === yesterday) {
        const other = await userRow(env, pair.a_id === row.user_id ? pair.b_id : pair.a_id);
        lines.push('🔥 Огонёк на двоих (' + pair.streak + ' дн., партнёр — ' + escHtml(other ? other.name : '?') + ') погаснет, если ты не решишь задание дня.');
      }
    }
    if (!lines.length) continue;
    const left = GOAL - t.count;
    const freezes = st.freeze && st.freeze.month === day.slice(0, 7) ? Math.max(0, 2 - (st.freeze.used || 0)) : 2;
    const text = lines.join('\n') + '\n\nСегодня решено ' + t.count + ' из ' + GOAL + ' — осталось ' + left + '.' +
      (freezes ? ' Если не успеваешь, можно заморозить день в меню серии (осталось ' + freezes + ').' : '');
    report.messages.push({ user_id: row.user_id, text });
    if (dry) continue;
    const r = await dm(env, row.user_id, text, 'Решить сейчас', 'endless');
    if (r.ok) report.sent++; else report.failed++;
    await new Promise((res) => setTimeout(res, 40)); // не больше ~25 сообщений в секунду
  }
  if (!dry) delete report.messages;
  return report;
}
