// Дуэль 1 на 1 в реальном времени: 60 секунд, одинаковые устные задачи, кто больше очков.
// Сервер (Durable Object) хранит комнату, проверяет ответы и считает очки. +10 за верный, −5 за неверный.
import { CONFIG, appLink } from './config.js';
import { rich, esc } from './math.js';
import { tg, inTelegram, share } from './tg.js';
import { apiEnabled, signedIn, me, request, getSession } from './api.js';
import { duelTasks, GEN_VERSION } from './gen/index.js';
import { registerCorrect } from './streak.js';
import { tap, rhythm } from './haptics.js';
import { openAccount } from './account.js';
import { toast } from './ui.js';

let pendingCode = null;
let root, ws = null, code = null, room = null, tasks = null, offset = 0, myIdx = 0, myScore = 0, retries = 0, closing = false, tickTimer = null;
const now = () => Date.now() + offset;
const wsUrl = (c) => CONFIG.API_BASE.replace(/\/$/, '').replace(/^http/, 'ws') + '/api/duel/' + c + '/ws';

function initials(n) { return esc((n || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()); }
function ava(p) { return p && p.photo_url ? '<img class="ava" src="' + esc(p.photo_url) + '" alt="" referrerpolicy="no-referrer">' : '<span class="ava ava-i">' + initials(p && p.name) + '</span>'; }

export function mountDuel(el) {
  root = el;
  root.addEventListener('click', onClick);
}

// Вызывается роутером: code — из адреса #/duel/CODE или пусто
export function showDuel(c) {
  if (c && (!apiEnabled() || !signedIn())) { leaveDuel(); pendingCode = c.toUpperCase(); renderIntro(); return; }
  if (c && c !== code) { leaveDuel(); code = c.toUpperCase(); connect(); renderConnecting(); }
  else if (!c) { leaveDuel(); renderIntro(); }
}

export function leaveDuel() {
  closing = true;
  if (ws) { try { ws.close(); } catch (e) { /* уже закрыт */ } }
  ws = null; room = null; tasks = null; code = null;
  clearInterval(tickTimer);
  if (inTelegram) { try { tg.disableClosingConfirmation(); } catch (e) { /* нет */ } }
}

/* ---------- вход в дуэль ---------- */
function renderIntro() {
  let h = '<div class="page-head"><h1>Дуэль 1 на 1</h1><p class="lead">60 секунд, одинаковые устные задачи у обоих. Верный ответ +10, неверный −5. Побеждает тот, у кого больше очков. Каждый верный ответ идёт в серию дня.</p></div>';
  if (!apiEnabled()) h += '<div class="empty"><h2>Дуэли пока недоступны</h2><p>Нужен сервер: см. <code>docs/SETUP_GUIDE.md</code>.</p></div>';
  else if (!signedIn()) h += '<div class="empty"><h2>Нужен вход через Telegram</h2><p>Соперник увидит твоё имя и аватар.' + (pendingCode ? ' После входа нажми «Войти» рядом с кодом ' + esc(pendingCode) + '.' : '') + '</p></div><button class="btn primary big" data-d="login">Войти</button>';
  else {
    h += '<button class="btn primary big" data-d="create">Создать дуэль</button>' +
      '<h2 class="list-h">Есть код от соперника?</h2><div class="ans-row"><input id="duel-code" class="ans" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Например, K7M2QX" aria-label="Код дуэли" value="' + esc(pendingCode || '') + '"><button class="btn ghost" data-d="join">Войти</button></div><p class="preview" id="duel-err"></p>';
  }
  root.innerHTML = h;
}

function renderConnecting(text = 'Подключаюсь к дуэли…') {
  root.innerHTML = '<div class="duel-center"><div class="duel-spinner" aria-hidden="true"></div><p class="muted">' + esc(text) + '</p><button class="btn ghost" data-d="leave">Выйти</button></div>';
}

/* ---------- соединение ---------- */
function connect() {
  closing = false;
  try { ws = new WebSocket(wsUrl(code)); } catch (e) { renderError('Не удалось подключиться'); return; }
  ws.onopen = () => {
    retries = 0;
    const auth = inTelegram && tg.initData ? { initData: tg.initData } : { token: getSession() && getSession().token };
    ws.send(JSON.stringify({ t: 'hello', ...auth }));
  };
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } onMessage(m); };
  ws.onclose = () => {
    if (closing || !code) return;
    if (room && room.phase === 'end') return;
    if (retries < 5) { retries++; renderBanner('Связь потеряна, переподключаюсь…'); setTimeout(() => { if (code && !closing) connect(); }, 1000 * retries); }
    else renderError('Связь с сервером потеряна. Проверь интернет и открой дуэль заново.');
  };
}
const send = (m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };

function onMessage(m) {
  if (m.now) offset = m.now - Date.now();
  if (m.t === 'error') { renderError(m.msg); closing = true; return; }
  if (m.t === 'rematch') { location.hash = '#/duel/' + m.code; return; }
  if (m.t === 'state' || m.t === 'start' || m.t === 'end') {
    const prevPhase = room && room.phase;
    room = { ...(room || {}), ...m };
    if (m.seed && (!tasks || tasks.seed !== m.seed)) {
      if (m.genVersion !== GEN_VERSION) { renderError('Версия тренажёра устарела. Обнови страницу и зайди в дуэль снова.'); return; }
      tasks = duelTasks(m.seed, 150); tasks.seed = m.seed;
    }
    const mine = room.players && room.players.find((p) => String(p.id) === String(me().id));
    if (mine && (room.phase !== 'play' || prevPhase !== 'play')) { myIdx = mine.idx; myScore = mine.score; }
    if (room.phase === 'lobby') renderLobby();
    else if (room.phase === 'countdown' || room.phase === 'play') startGame(prevPhase);
    else if (room.phase === 'end') renderEnd(prevPhase !== 'end');
    return;
  }
  if (m.t === 'score' && room && room.players) {
    const p = room.players.find((x) => String(x.id) === String(m.id));
    if (p) { p.score = m.score; p.idx = m.idx; }
    if (String(m.id) !== String(me().id)) updateOpponent(p);
    return;
  }
  if (m.t === 'res') { myScore = m.score; updateMyScore(); }
}

/* ---------- лобби ---------- */
function renderLobby() {
  const ps = room.players || [];
  const self = ps.find((p) => String(p.id) === String(me().id));
  const opp = ps.find((p) => String(p.id) !== String(me().id));
  const slot = (p, label) => p
    ? '<div class="duel-slot' + (p.ready ? ' ready' : '') + '">' + ava(p) + '<b>' + esc(p.name) + '</b><span>' + (p.ready ? 'Готов' : p.connected === false ? 'Не в сети' : 'Не готов') + '</span></div>'
    : '<div class="duel-slot empty-slot"><span class="ava ava-i pulse">?</span><b>' + label + '</b><span>Отправь приглашение</span></div>';
  root.innerHTML =
    '<div class="page-head"><h1>Дуэль</h1><p class="lead">Код комнаты: <b class="duel-code">' + esc(code) + '</b></p></div>' +
    '<div class="duel-vs">' + slot(self, 'Ты') + '<span class="vs">vs</span>' + slot(opp, 'Ждём соперника') + '</div>' +
    '<div class="actions">' +
      (opp ? (self && self.ready ? '<button class="btn ghost" disabled>Ждём соперника…</button>' : '<button class="btn primary" data-d="ready">Я готов</button>') : '') +
      '<button class="btn ' + (opp ? 'ghost' : 'primary') + '" data-d="invite">Пригласить соперника</button>' +
      '<button class="btn ghost" data-d="leave">Выйти</button></div>' +
    '<p class="note-line">Игра начнётся, когда оба нажмут «Я готов». Комната закроется через 15 минут без игры.</p>';
}

/* ---------- игра ---------- */
function startGame(prevPhase) {
  if (inTelegram) { try { tg.enableClosingConfirmation(); } catch (e) { /* нет */ } }
  if (!root.querySelector('.duel-game')) renderGameShell();
  clearInterval(tickTimer);
  let lastCount = null;
  tickTimer = setInterval(() => {
    const t = now();
    const cd = root.querySelector('.duel-count');
    if (t < room.startAt) {
      const n = Math.min(3, Math.ceil((room.startAt - t) / 1000));
      if (n !== lastCount) { lastCount = n; cd.textContent = n; cd.hidden = false; cd.animate([{ transform: 'scale(1.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 400, easing: 'cubic-bezier(.22,1,.36,1)' }); rhythm('tick'); }
      return;
    }
    if (!cd.hidden) { cd.textContent = 'Старт!'; rhythm('go'); setTimeout(() => { cd.hidden = true; }, 500); renderTask(); }
    if (!root.querySelector('.duel-q .opt') && myIdx < tasks.length) renderTask();
    const left = Math.max(0, room.endAt - t);
    const bar = root.querySelector('#duel-timer');
    if (bar) bar.style.width = (left / (room.endAt - room.startAt)) * 100 + '%';
    const sec = root.querySelector('#duel-sec');
    if (sec) sec.textContent = Math.ceil(left / 1000);
    if (left <= 0) { clearInterval(tickTimer); const q = root.querySelector('.duel-q'); if (q) q.innerHTML = '<p class="muted">Время вышло. Подводим итоги…</p>'; }
  }, 100);
}

function renderGameShell() {
  const ps = room.players || [];
  const self = ps.find((p) => String(p.id) === String(me().id)) || me();
  const opp = ps.find((p) => String(p.id) !== String(me().id)) || { name: 'Соперник' };
  root.innerHTML =
    '<div class="duel-game"><div class="duel-board">' +
      '<div class="duel-pl">' + ava(self) + '<div><small>Ты</small><b id="duel-me">' + myScore + '</b></div></div>' +
      '<div class="duel-clock"><b id="duel-sec">60</b><small>сек</small></div>' +
      '<div class="duel-pl right"><div><small>' + esc(opp.name) + '</small><b id="duel-opp">' + (opp.score || 0) + '</b></div>' + ava(opp) + '</div>' +
    '</div><div class="bar duel-bar"><i id="duel-timer" style="width:100%"></i></div>' +
    '<div class="duel-count" hidden></div><div class="duel-q"></div></div>';
}

function renderTask() {
  const box = root.querySelector('.duel-q');
  if (!box || !tasks || now() < room.startAt || now() > room.endAt) return;
  const t = tasks[myIdx];
  if (!t) { box.innerHTML = '<p class="muted">Задачи закончились — жди конца раунда.</p>'; return; }
  box.innerHTML = '<div class="qtext">' + rich(t.q, true) + '</div><div class="opts">' +
    t.opts.map((o, k) => '<button class="opt" data-d="pick" data-k="' + k + '"><span class="k">' + (k + 1) + '</span><span class="ov">' + rich(o, true) + '</span></button>').join('') + '</div>';
}

function pick(k) {
  const t = tasks && tasks[myIdx];
  if (!t || now() < room.startAt || now() > room.endAt) return;
  const btns = root.querySelectorAll('.duel-q .opt');
  if (!btns.length || btns[0].disabled) return;
  const ok = t.opts[k] === t.a;
  btns.forEach((b, i) => { b.disabled = true; if (t.opts[i] === t.a) b.classList.add('correct'); else if (i === k) b.classList.add('wrong'); });
  send({ t: 'answer', i: myIdx, a: t.opts[k] });
  myIdx++;
  myScore = Math.max(0, myScore + (ok ? 10 : -5));
  updateMyScore();
  if (ok) { tap('medium'); registerCorrect(); } else tap('error');
  setTimeout(renderTask, ok ? 220 : 450);
}

// Для системной кнопки «Назад»: во время игры — с подтверждением
export function duelBack() {
  const go = () => { leaveDuel(); location.hash = '#/endless'; };
  if (room && room.phase === 'play' && Date.now() + offset < room.endAt) {
    const ask = 'Выйти из дуэли? Соперник продолжит без тебя.';
    if (inTelegram && tg.showConfirm) tg.showConfirm(ask, (ok) => { if (ok) go(); });
    else if (window.confirm(ask)) go();
  } else go();
  return true;
}

export function duelKey(e) {
  if (!room || room.phase !== 'play' || !/^[1-4]$/.test(e.key)) return false;
  pick(+e.key - 1);
  return true;
}

function bump(el) { if (el) el.animate([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 350, easing: 'cubic-bezier(.34,1.4,.64,1)' }); }
function updateMyScore() { const n = root.querySelector('#duel-me'); if (n && n.textContent !== String(myScore)) { n.textContent = myScore; bump(n); } }
function updateOpponent(p) {
  const n = root.querySelector('#duel-opp');
  if (!n || !p) return;
  const before = Number(n.textContent);
  if (before !== p.score) { n.textContent = p.score; bump(n); if (before <= myScore && p.score > myScore) tap('light'); }
}

/* ---------- итоги ---------- */
function renderEnd(first) {
  clearInterval(tickTimer);
  if (inTelegram) { try { tg.disableClosingConfirmation(); } catch (e) { /* нет */ } }
  const ps = room.players || [];
  const self = ps.find((p) => String(p.id) === String(me().id)) || { score: myScore };
  const opp = ps.find((p) => String(p.id) !== String(me().id)) || { name: 'Соперник', score: 0 };
  const win = room.winner && String(room.winner) === String(me().id);
  const draw = !room.winner;
  const title = draw ? 'Ничья' : win ? 'Победа' : 'Поражение';
  if (first) rhythm(win ? 'win' : 'lose');
  root.innerHTML =
    '<div class="duel-end ' + (win ? 'win' : draw ? 'draw' : 'lose') + '"><h1>' + title + '</h1>' +
    '<div class="duel-final"><div>' + ava(self) + '<b>' + self.score + '</b><small>Ты</small></div><span>:</span><div>' + ava(opp) + '<b>' + opp.score + '</b><small>' + esc(opp.name) + '</small></div></div>' +
    '<p class="lead">Верных ответов: ' + (self.correct ?? '—') + ' из ' + (self.answered ?? '—') + '.</p>' +
    '<div class="actions"><button class="btn primary" data-d="rematch">Реванш</button><button class="btn ghost" data-d="share">Поделиться</button><button class="btn ghost" data-d="leave">В генератор</button></div></div>';
}

function renderError(msg) {
  root.innerHTML = '<div class="empty"><h2>Дуэль недоступна</h2><p>' + esc(msg) + '</p></div><button class="btn ghost" data-d="leave">Выйти</button>';
}
function renderBanner(text) {
  const b = root.querySelector('.duel-banner') || Object.assign(document.createElement('p'), { className: 'duel-banner' });
  b.textContent = text;
  root.prepend(b);
}

/* ---------- действия ---------- */
async function onClick(e) {
  const b = e.target.closest('[data-d]');
  if (!b || !root.contains(b)) return;
  const d = b.dataset.d;
  if (d === 'login') openAccount();
  else if (d === 'create') {
    b.disabled = true;
    try { const r = await request('/api/duel', { method: 'POST' }); location.hash = '#/duel/' + r.code; }
    catch (err) { b.disabled = false; toast('Не удалось создать дуэль: ' + err.message); }
  }
  else if (d === 'join') {
    const v = (root.querySelector('#duel-code').value || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(v)) { root.querySelector('#duel-err').innerHTML = '<span class="err">Код — 6 букв и цифр</span>'; return; }
    location.hash = '#/duel/' + v;
  }
  else if (d === 'ready') { send({ t: 'ready' }); tap('light'); }
  else if (d === 'invite') {
    const link = CONFIG.BOT_USERNAME && CONFIG.APP_NAME ? appLink('duel_' + code) : location.origin + location.pathname + '#/duel/' + code;
    const r = await share('Вызываю на дуэль по матану: 60 секунд, кто больше решит. Код ' + code, link);
    if (r === 'copied') toast('Ссылка скопирована');
  }
  else if (d === 'pick') pick(+b.dataset.k);
  else if (d === 'rematch') { send({ t: 'rematch' }); b.disabled = true; b.textContent = 'Создаю…'; }
  else if (d === 'share') {
    const ps = room.players || [];
    const self = ps.find((p) => String(p.id) === String(me().id)) || {};
    const opp = ps.find((p) => String(p.id) !== String(me().id)) || {};
    share('Дуэль по матану: ' + (self.score || 0) + ' : ' + (opp.score || 0) + '. Сыграем?', appLink('endless'));
  }
  else if (d === 'leave') { leaveDuel(); location.hash = '#/endless'; }
}
