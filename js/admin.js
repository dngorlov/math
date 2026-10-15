// Статистика интенсива для преподавателя: где чаще ошибаются, по темам и типам задач. Данные обезличены.
import { esc } from './math.js';
import { request } from './api.js';
import { kindName } from './gen/kinds.js';
import { topicName } from './gen/index.js';
import { toast } from './ui.js';

let root, body, tab = 'stats', params = { days: 30, src: 'all' }, current = null;
const TABS = [['stats', 'Статистика'], ['posts', 'Объявления'], ['user', 'Пользователь'], ['rating', 'Рейтинг']];
const SRC = [['all', 'Все режимы'], ['practice', 'Темы и марафон'], ['endless', 'Генератор'], ['duel', 'Дуэли']];
const DAYS = [[7, '7 дней'], [30, '30 дней'], [0, 'Всё время']];
const pct = (e, a) => (a ? Math.round((e / a) * 100) : 0);

export function mountAdmin(el) {
  root = el;
  root.innerHTML = '<div class="page-head"><h1>Админка</h1></div><div class="seg2 adm-tabs" role="tablist">' +
    TABS.map(([id, n]) => '<button role="tab" data-tab="' + id + '">' + n + '</button>').join('') + '</div><div id="adm-body"></div>';
  body = root.querySelector('#adm-body');
  root.querySelector('.adm-tabs').style.gridTemplateColumns = 'repeat(2, 1fr)';
  root.addEventListener('click', onClick);
  root.addEventListener('submit', (e) => e.preventDefault());
}

export function load() {
  root.querySelectorAll('[data-tab]').forEach((b) => { const on = b.dataset.tab === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  if (tab === 'user') return renderUser();
  if (tab === 'rating') return renderRatingTab();
  if (tab === 'posts') return renderPosts();
  return loadStats();
}

async function onClick(e) {
  const tb = e.target.closest('[data-tab]');
  if (tb) { tab = tb.dataset.tab; load(); return; }
  const b = e.target.closest('[data-p]');
  if (b) { params[b.dataset.p] = b.dataset.p === 'days' ? +b.dataset.v : b.dataset.v; loadStats(); return; }
  const t = e.target.closest('[data-topic]');
  if (t) { const sec = t.closest('.st-topic'); sec.classList.toggle('open'); t.setAttribute('aria-expanded', sec.classList.contains('open')); return; }
  const a = e.target.closest('[data-adm]');
  if (!a) return;
  if (a.dataset.adm === 'find') findUser();
  if (a.dataset.adm === 'save') saveUser(a);
  if (a.dataset.adm === 'reset') resetRating(a);
  if (a.dataset.adm === 'publish') publish(a);
  if (a.dataset.adm === 'kind') setKind(a.dataset.v);
  if (a.dataset.adm === 'del-post') deletePost(a);
}

/* ---------- пользователь: серия и заморозки ---------- */
function renderUser() {
  body.innerHTML = '<p class="lead">Если у участника сломалась серия или пропали заморозки — найди его по ID или @юзернейму и поправь. Правка придёт на его устройства при следующей синхронизации и перезапишет то, что там было.</p>' +
    '<div class="ans-row"><input id="adm-q" class="ans" placeholder="ID или @username" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn primary" data-adm="find">Найти</button></div>' +
    '<p class="small err" id="adm-err"></p><div id="adm-user"></div>';
  const q = body.querySelector('#adm-q');
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') findUser(); });
  if (current) showUser(current);
}

async function findUser() {
  const q = body.querySelector('#adm-q').value.trim();
  const err = body.querySelector('#adm-err');
  err.textContent = '';
  if (!q) { err.textContent = 'Впиши ID или юзернейм'; return; }
  try { current = await request('/api/admin/user?q=' + encodeURIComponent(q)); showUser(current); }
  catch (e) { err.textContent = e.message; body.querySelector('#adm-user').innerHTML = ''; }
}

function showUser(v) {
  const u = v.user, s = v.streak;
  const f = (id, label, value, type = 'number', hint = '') => '<label class="adm-f"><span>' + label + '</span><input id="' + id + '" class="ans" type="' + type + '" value="' + esc(value ?? '') + '"' + (type === 'number' ? ' min="0" inputmode="numeric"' : '') + '>' + (hint ? '<small>' + hint + '</small>' : '') + '</label>';
  body.querySelector('#adm-user').innerHTML =
    '<div class="acct-user"><div><div class="acct-name">' + esc(u.name) + '</div><div class="muted small">ID ' + u.id + (u.username ? ' · @' + esc(u.username) : '') + ' · игр ' + (u.games || 0) + '</div>' +
    '<div class="muted small">' + (v.synced ? 'Последняя синхронизация: ' + new Date(v.syncedAt).toLocaleString('ru-RU') : 'Ещё ни разу не синхронизировался') + '</div></div></div>' +
    (v.pair ? '<p class="small">Совместный огонёк с ' + esc(v.pair.partner ? v.pair.partner.name : '?') + ': ' + v.pair.streak + ' дн. (его серия считается от их ежедневных результатов)</p>' : '') +
    '<div class="adm-grid">' +
      f('adm-streak', 'Серия, дней', s.streak) +
      f('adm-last', 'Последний закрытый день', s.lastCovered || '', 'date', 'Сегодня или вчера — серия жива. Раньше — сгорит при следующем входе') +
      f('adm-best', 'Лучшая серия', s.best) +
      f('adm-freeze', 'Заморозок использовано за ' + s.month, s.freezeUsed, 'number', 'Из 2 в месяц. 0 — обе доступны') +
      f('adm-score', 'Лучший счёт в рейтинге', u.best_score) +
    '</div><p class="muted small">Сегодня по Москве: решено ' + (s.day === new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10) ? s.count : 0) + ' из 5. Последний решённый день: ' + (s.lastDone || '—') + '.</p>' +
    '<button class="btn primary big" data-adm="save">Сохранить</button><p class="small" id="adm-saved" aria-live="polite"></p>';
}

async function saveUser(btn) {
  const val = (id) => body.querySelector('#' + id).value.trim();
  const out = body.querySelector('#adm-saved');
  btn.disabled = true; out.textContent = '';
  try {
    current = await request('/api/admin/user', { method: 'POST', body: {
      id: current.user.id,
      streak: { streak: Number(val('adm-streak')), lastCovered: val('adm-last') || null, best: Number(val('adm-best')), freezeUsed: Number(val('adm-freeze')) },
      bestScore: val('adm-score') === '' ? null : Number(val('adm-score')),
    } });
    showUser(current);
    body.querySelector('#adm-saved').textContent = 'Сохранено. Участник увидит изменения при следующем открытии тренажёра.';
  } catch (e) { out.innerHTML = '<span class="err">' + esc(e.message) + '</span>'; btn.disabled = false; }
}

/* ---------- объявления: обновления и цели ---------- */
let postKind = 'update';
function renderPosts() {
  body.innerHTML = '<p class="lead">Объявление увидят все при следующем открытии тренажёра. Цель (КР, экзамен, дедлайн) ещё и висит баннером с обратным отсчётом до даты.</p>' +
    '<div class="seg2" role="radiogroup" aria-label="Тип"><button data-adm="kind" data-v="update" role="radio">Обновление</button><button data-adm="kind" data-v="goal" role="radio">Новая цель</button></div>' +
    '<label class="adm-f"><span>Заголовок</span><input id="post-title" class="ans" maxlength="80" placeholder="Например, КР-2 по пределам"></label>' +
    '<label class="adm-f" id="post-date-f"><span>Дата цели</span><input id="post-date" class="ans" type="date"></label>' +
    '<label class="adm-f"><span>Текст</span><textarea id="post-body" class="post-text" rows="6" maxlength="2000" placeholder="Что изменилось или что будет на КР. Пустая строка — новый абзац."></textarea></label>' +
    '<label class="g-check"><input type="checkbox" id="post-dm"> Разослать в личку через бота</label>' +
    '<p class="muted small">Рассылка уходит постепенно, около 25 сообщений в минуту. Дойдёт тем, кто разрешил боту писать.</p>' +
    '<button class="btn primary big" data-adm="publish">Опубликовать</button><p class="small" id="post-out" aria-live="polite"></p>' +
    '<h2 class="list-h">Опубликованные</h2><div id="post-list"><p class="muted">Загружаю…</p></div>';
  setKind(postKind);
  loadPostList();
}
function setKind(k) {
  postKind = k;
  body.querySelectorAll('[data-adm="kind"]').forEach((b) => { const on = b.dataset.v === k; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  const f = body.querySelector('#post-date-f'); if (f) f.hidden = k !== 'goal';
}
async function loadPostList() {
  const box = body.querySelector('#post-list');
  try {
    const r = await request('/api/posts?fresh=' + Date.now());
    box.innerHTML = r.posts.length ? r.posts.map((p) => '<div class="adm-post"><div><span class="tag' + (p.kind === 'goal' ? ' goal-tag' : '') + '">' + (p.kind === 'goal' ? 'Цель' : 'Обновление') + '</span> <b>' + esc(p.title) + '</b>' +
      '<div class="muted small">' + new Date(p.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) + (p.goal_date ? ' · дата цели ' + p.goal_date.split('-').reverse().join('.') : '') + '</div></div>' +
      '<button class="link" data-adm="del-post" data-id="' + p.id + '">Удалить</button></div>').join('') : '<p class="muted">Пока ничего.</p>';
  } catch (e) { box.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; }
}
async function publish(btn) {
  const out = body.querySelector('#post-out');
  const title = body.querySelector('#post-title').value.trim();
  const text = body.querySelector('#post-body').value.trim();
  const goalDate = body.querySelector('#post-date').value;
  const dm = body.querySelector('#post-dm').checked;
  if (!title) { out.innerHTML = '<span class="err">Впиши заголовок</span>'; return; }
  if (postKind === 'goal' && !goalDate) { out.innerHTML = '<span class="err">Укажи дату цели</span>'; return; }
  btn.disabled = true; out.textContent = '';
  try {
    const r = await request('/api/admin/posts', { method: 'POST', body: { kind: postKind, title, body: text, goalDate: postKind === 'goal' ? goalDate : null, broadcast: dm } });
    toast('Опубликовано');
    renderPosts();
    body.querySelector('#post-out').textContent = 'Опубликовано.' + (dm ? ' В очереди на рассылку: ' + r.queued + '.' : '');
  } catch (e) { out.innerHTML = '<span class="err">' + esc(e.message) + '</span>'; btn.disabled = false; }
}
async function deletePost(btn) {
  if (!btn.dataset.sure) { btn.dataset.sure = '1'; btn.textContent = 'Точно удалить?'; return; }
  try { await request('/api/admin/posts/delete', { method: 'POST', body: { id: Number(btn.dataset.id) } }); loadPostList(); toast('Удалено'); }
  catch (e) { toast(e.message); }
}

/* ---------- рейтинг: сброс сезона ---------- */
async function renderRatingTab() {
  body.innerHTML = '<p class="lead">Сброс обнуляет лучшие счёты всех участников. Топ-100 перед сбросом сохраняется в архив. Серии, заморозки и дуэли не затрагиваются.</p>' +
    '<label class="adm-f"><span>Для подтверждения впиши слово СБРОС</span><input id="adm-confirm" class="ans" autocomplete="off"></label>' +
    '<button class="btn primary big danger" data-adm="reset">Сбросить рейтинг</button><p class="small" id="adm-reset-out" aria-live="polite"></p>' +
    '<h2 class="list-h">Архив сезонов</h2><div id="adm-seasons"><p class="muted">Загружаю…</p></div>';
  try {
    const r = await request('/api/admin/seasons');
    body.querySelector('#adm-seasons').innerHTML = r.seasons.length ? '<ol class="st-worst">' + r.seasons.map((x) =>
      '<li><span>' + new Date(x.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) + '<small>' + x.players + ' участников · ' +
      x.top3.map((u, i) => (i + 1) + '. ' + esc(u.name) + ' ' + u.best_score).join(', ') + '</small></span></li>').join('') + '</ol>' : '<p class="muted">Сбросов ещё не было.</p>';
  } catch (e) { body.querySelector('#adm-seasons').innerHTML = '<p class="err">' + esc(e.message) + '</p>'; }
}

async function resetRating(btn) {
  const out = body.querySelector('#adm-reset-out');
  const confirm = body.querySelector('#adm-confirm').value.trim();
  if (confirm !== 'СБРОС') { out.innerHTML = '<span class="err">Впиши слово СБРОС заглавными буквами</span>'; return; }
  btn.disabled = true;
  try { const r = await request('/api/admin/reset-rating', { method: 'POST', body: { confirm } }); toast('Рейтинг сброшен. В архиве участников: ' + r.archived); await renderRatingTab(); body.querySelector('#adm-reset-out').textContent = 'Готово: рейтинг обнулён, топ сохранён в архив.'; }
  catch (e) { out.innerHTML = '<span class="err">' + esc(e.message) + '</span>'; btn.disabled = false; }
}

async function loadStats() {
  const chips = (key, list) => '<div class="chips">' + list.map(([v, n]) => '<button class="chip' + (String(params[key]) === String(v) ? ' on' : '') + '" data-p="' + key + '" data-v="' + v + '">' + n + '</button>').join('') + '</div>';
  body.innerHTML = '<p class="lead">Где участники ошибаются чаще всего. Без имён: только тема, тип задачи и результат. Учитываются ответы тех, кто вошёл через Telegram.</p>' +
    chips('days', DAYS) + chips('src', SRC) + '<div id="st-body" aria-busy="true"><p class="muted">Загружаю…</p></div>';
  const box = body.querySelector('#st-body');
  try {
    const r = await request('/api/stats?days=' + params.days + '&src=' + params.src);
    box.removeAttribute('aria-busy');
    if (!r.rows.length) { box.innerHTML = '<div class="empty"><h2>Пока нет данных</h2><p>Статистика появится, когда участники начнут решать задачи после входа через Telegram.</p></div>'; return; }
    const topics = {};
    r.rows.forEach((x) => {
      const t = topics[x.topic] || (topics[x.topic] = { attempts: 0, errors: 0, kinds: [] });
      t.attempts += x.attempts; t.errors += x.errors; t.kinds.push(x);
    });
    const total = r.rows.reduce((s, x) => ({ a: s.a + x.attempts, e: s.e + x.errors }), { a: 0, e: 0 });
    const worst = r.rows.filter((x) => x.attempts >= 10).sort((a, b) => b.errors / b.attempts - a.errors / a.attempts).slice(0, 5);
    let h = '<div class="st-sum"><div><b>' + total.a.toLocaleString('ru-RU') + '</b><span>ответов</span></div><div><b>' + pct(total.e, total.a) + '%</b><span>ошибок</span></div><div><b>' + (r.users || 0) + '</b><span>участников</span></div></div>';
    if (worst.length) {
      h += '<h2 class="list-h">Разобрать на занятии</h2><ol class="st-worst">' + worst.map((x) =>
        '<li><span>' + esc(kindName(x.kind)) + '<small>' + esc(topicName(x.topic) || x.topic) + '</small></span><b>' + pct(x.errors, x.attempts) + '%</b></li>').join('') + '</ol>' +
        '<p class="muted small">Типы задач с самой высокой долей ошибок, минимум 10 ответов.</p>';
    }
    h += '<h2 class="list-h">По темам</h2>';
    Object.entries(topics).sort((a, b) => b[1].errors / b[1].attempts - a[1].errors / a[1].attempts).forEach(([tp, t]) => {
      const p = pct(t.errors, t.attempts);
      h += '<section class="st-topic"><button class="st-row" data-topic aria-expanded="false"><span class="st-name">' + esc(topicName(tp) || tp) + '<small>' + t.attempts + ' ответов</small></span>' +
        '<span class="st-bar"><i style="width:' + p + '%"></i></span><b>' + p + '%</b></button><div class="st-kinds">' +
        t.kinds.sort((a, b) => b.errors / b.attempts - a.errors / a.attempts).map((k) => {
          const kp = pct(k.errors, k.attempts);
          return '<div class="st-row sub"><span class="st-name">' + esc(kindName(k.kind)) + '<small>' + k.attempts + ' ответов, ошибок ' + k.errors + '</small></span><span class="st-bar"><i style="width:' + kp + '%"></i></span><b>' + kp + '%</b></div>';
        }).join('') + '</div></section>';
    });
    box.innerHTML = h;
  } catch (e) {
    box.innerHTML = '<div class="empty"><h2>' + (e.status === 403 ? 'Нет доступа' : 'Не удалось загрузить') + '</h2><p>' +
      (e.status === 403 ? 'Этот раздел доступен только преподавателям.' : esc(e.message)) + '</p></div>';
  }
}
