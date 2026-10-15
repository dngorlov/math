// Бесконечный режим: устно (варианты, бонус за скорость) и письменно (ввод ответа, проверка по значению).
import { taskAt, topicsFor, topicName, GEN_VERSION } from './gen/index.js';
import { parseAnswer, checkAnswer } from './answer.js';
import { rich, tex, esc } from './math.js';
import { registerCorrect } from './streak.js';
import { load, save } from './storage.js';
import { share, tg, inTelegram } from './tg.js';
import { tap } from './haptics.js';
import { markDirty } from './sync.js';
import { record } from './stats.js';
import { reportButton, openReport } from './report.js';
import { canSubmit, ratingEnabled } from './rating.js';
import { request } from './api.js';
import { toast, CHEV_R } from './ui.js';
import { appLink } from './config.js';

const LIVES = 3, ORAL_TIME = 10000, LEVEL_EVERY = 6, MAX_LEVEL = 4;
const MODES = {
  oral: { name: 'Устно', desc: 'Варианты ответа, решается в уме. Чем быстрее ответ, тем больше очков.' },
  written: { name: 'Письменно', desc: 'Понадобятся бумага и ручка. Ответ вводишь сам: 3/2, sqrt(3)/2, e^2, inf.' },
};

let root, view = 'menu', g = null;
let pref = load('endless_pref', { mode: 'oral', topics: [] });

export function mountEndless(el) {
  root = el;
  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  root.addEventListener('keydown', onKeyField);
  render();
}
export function endlessKey(e) {
  if (view !== 'game' || !g) return false;
  if (g.mode === 'oral' && !g.answered && /^[1-4]$/.test(e.key)) { pick(+e.key - 1); return true; }
  if (e.key === 'Enter' && g.answered && !(e.target && e.target.tagName === 'BUTTON')) { next(); return true; }
  return false;
}

function render() {
  if (view === 'game') renderGame();
  else if (view === 'over') renderOver();
  else renderMenu();
}

/* ---------- меню ---------- */
function renderMenu() {
  const topics = topicsFor(pref.mode);
  const sel = pref.topics.filter((t) => topics.some((x) => x.id === t));
  let h = '<div class="page-head"><h1>Генератор задач</h1><p class="lead">Задачи не кончаются. Три жизни, сложность растёт каждые ' + LEVEL_EVERY + ' верных ответов. Каждый верный ответ идёт в серию дня.</p></div>';
  h += '<div class="modes" role="radiogroup" aria-label="Режим">';
  for (const [id, m] of Object.entries(MODES)) {
    h += '<button class="mode' + (pref.mode === id ? ' on' : '') + '" role="radio" aria-checked="' + (pref.mode === id) + '" data-act="mode" data-mode="' + id + '">' +
      '<span class="mode-name">' + m.name + '</span><span class="mode-desc">' + m.desc + '</span>' +
      '<span class="mode-best">Рекорд: ' + load('best_' + id, 0) + '</span></button>';
  }
  h += '</div><h2 class="list-h">Темы</h2><div class="chips">';
  h += '<button class="chip' + (!sel.length ? ' on' : '') + '" data-act="topic" data-topic="">Все</button>';
  topics.forEach((t) => { h += '<button class="chip' + (sel.includes(t.id) ? ' on' : '') + '" data-act="topic" data-topic="' + t.id + '">' + t.name + '</button>'; });
  h += '</div>';
  h += '<button class="btn primary big" data-act="start">Начать</button>';
  h += '<a class="duel-entry" href="#/duel"><span><span class="row-title">Дуэль 1 на 1</span><span class="row-desc">60 секунд против соперника в реальном времени</span></span><span class="row-end">' + CHEV_R + '</span></a>';
  if (ratingEnabled()) h += '<p class="note-line">' + (canSubmit() ? 'Результат попадёт в общий рейтинг.' : 'Чтобы результат попал в рейтинг, войди через Telegram: значок профиля справа вверху.') + '</p>';
  root.innerHTML = h;
}

/* ---------- игра ---------- */
// Забег. Если пользователь вошёл, сервер выдаёт seed и проверяет каждый ответ — только такие забеги идут в рейтинг.
async function start() {
  const topics = topicsFor(pref.mode).map((t) => t.id);
  g = {
    mode: pref.mode, topics: pref.topics.filter((t) => topics.includes(t)).sort(), score: 0, lives: LIVES, correct: 0, total: 0, idx: 0,
    seed: ((Math.random() * 2147483647) | 0) || 1, startedAt: Date.now(), task: null, answered: false,
    server: null, serverNote: '', serverResult: null, pending: Promise.resolve(),
  };
  view = 'game';
  closingGuard(true);
  if (canSubmit()) {
    root.innerHTML = '<p class="muted">Готовлю забег…</p>';
    try {
      const r = await request('/api/run/start', { method: 'POST', body: { mode: g.mode, topics: g.topics } });
      if (r.genVersion !== GEN_VERSION) g.serverNote = 'Версия тренажёра устарела — обнови страницу, чтобы результат попал в рейтинг.';
      else { g.server = { runId: r.runId }; g.seed = r.seed; }
    } catch (e) { g.serverNote = 'Нет связи с сервером — этот забег не попадёт в рейтинг.'; }
  }
  newTask();
}

// Отправить ответ на сервер; сервер — источник истины для очков и жизней
function sendAnswer(i, answer) {
  if (!g.server) return;
  const runId = g.server.runId;
  g.pending = g.pending.then(() => request('/api/run/answer', { method: 'POST', body: { runId, i, answer } })).then((r) => {
    if (!g || !g.server || g.server.runId !== runId) return;
    g.score = r.score; g.lives = r.lives; g.correct = r.correct;
    if (r.finished) g.serverResult = r;
    const sc = root.querySelector('#eg-score'); if (sc) sc.textContent = g.score;
    const l = root.querySelector('.lives'); if (l) l.outerHTML = lives();
  }).catch((e) => {
    if (!g) return;
    g.server = null;
    g.serverNote = 'Связь с сервером потеряна (' + e.message + ') — забег продолжится, но в рейтинг не попадёт.';
    const n = root.querySelector('#eg-note'); if (n) n.textContent = g.serverNote;
  });
}

// В Telegram спрашиваем подтверждение, если игру закрывают посреди забега
function closingGuard(on) {
  if (!inTelegram) return;
  try { if (on) tg.enableClosingConfirmation(); else tg.disableClosingConfirmation(); } catch (e) { /* старый клиент */ }
}
const level = () => Math.min(MAX_LEVEL, 1 + Math.floor(g.correct / LEVEL_EVERY));

function newTask() {
  g.task = taskAt(g.seed, g.idx, g.mode, level(), g.topics);
  g.answered = false;
  g.qStart = performance.now();
  renderGame();
  if (g.mode === 'written') root.querySelector('#ans').focus({ preventScroll: true });
}

function lives() {
  let s = '<span class="lives" aria-label="Жизни: ' + g.lives + '">';
  for (let i = 0; i < LIVES; i++) s += '<i class="' + (i < g.lives ? 'on' : '') + '"></i>';
  return s + '</span>';
}

function renderGame() {
  const t = g.task;
  let h = '<div class="eg-top">' + lives() + '<span class="eg-score"><b id="eg-score">' + g.score + '</b> очков</span><span class="eg-lvl">Уровень ' + level() + '</span>' +
    '<button class="link" data-act="quit">Завершить</button></div>' +
    (g.serverNote ? '<p class="note-line" id="eg-note">' + esc(g.serverNote) + '</p>' : '<p class="note-line" id="eg-note" hidden></p>');
  h += g.mode === 'oral' ? '<div class="bar timer"><i id="eg-timer"></i></div>' : '<div class="bar"><i style="width:0"></i></div>';
  h += '<div class="qmeta">' + esc(topicName(t.topic)) + (g.mode === 'written' ? ' · письменно' : '') + '</div>';
  h += '<div class="qtext">' + rich(t.q, true) + '</div>';
  if (g.mode === 'oral') {
    h += '<div class="opts">' + t.opts.map((o, k) => '<button class="opt" data-act="pick" data-k="' + k + '"><span class="k">' + (k + 1) + '</span><span class="ov">' + rich(o, true) + '</span></button>').join('') + '</div>';
  } else {
    h += '<div class="ans-row"><input id="ans" class="ans" type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Например, 3/2" aria-label="Ответ" aria-describedby="ans-prev">' +
      '<button class="btn primary" data-act="check">Проверить</button></div>' +
      '<div class="keys" aria-label="Символы">' + ['π', 'e', '√', '^', '/', '(', ')', '∞', '−'].map((k) => '<button class="key" data-act="key" data-key="' + k + '">' + k + '</button>').join('') + '</div>' +
      '<div class="preview" id="ans-prev" aria-live="polite"></div>';
  }
  h += '<div class="verdict" id="eg-verdict"></div><div id="eg-expl"></div>';
  h += '<div class="actions" id="eg-actions" hidden><button class="btn primary" data-act="next" id="eg-next">Дальше</button></div>';
  root.innerHTML = h;
  if (g.mode === 'oral') {
    const bar = root.querySelector('#eg-timer');
    g.timerAnim = bar.animate([{ width: '100%' }, { width: '0%' }], { duration: ORAL_TIME, easing: 'linear', fill: 'forwards' });
  }
}

function finishAnswer(ok, userText) {
  const t = g.task;
  g.answered = true;
  sendAnswer(g.idx, userText);
  g.idx++;
  g.total++;
  if (g.timerAnim) g.timerAnim.pause();
  record('endless', t, ok);
  const v = root.querySelector('#eg-verdict');
  let gained = 0;
  g.lastOk = ok;
  if (ok) {
    g.correct++;
    if (g.mode === 'oral') {
      const el = performance.now() - g.qStart;
      gained = 10 * level() + Math.max(0, Math.round(10 * (1 - el / ORAL_TIME)));
    } else gained = 30 * level();
    g.score += gained;
    v.className = 'verdict ok'; v.textContent = 'Верно, +' + gained;
    tap('medium');
    registerCorrect();
    const sc = root.querySelector('#eg-score');
    sc.textContent = g.score;
    sc.animate([{ transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 400, easing: 'cubic-bezier(.34,1.4,.64,1)' });
  } else {
    g.lives--;
    v.className = 'verdict bad'; v.textContent = g.lives ? 'Неверно, минус жизнь' : 'Неверно. Жизни закончились';
    tap('error');
    const l = root.querySelector('.lives');
    l.outerHTML = lives();
    root.querySelector('.lives').animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 320 });
  }
  g.lastUser = userText;
  // Устно и верно — сразу следующая задача, без пояснения (бонус за скорость считает сервер)
  if (ok && g.mode === 'oral') { setTimeout(() => { if (g && g.answered && view === 'game') next(); }, 650); return; }
  root.querySelector('#eg-expl').innerHTML = '<div class="expl"><div class="expl-ans">Ответ: ' + (g.mode === 'written' ? tex('\\displaystyle ' + t.a) : rich(t.a, true)) + '</div>' +
    (t.e ? '<p>' + rich(t.e, true) + '</p>' : '') + reportButton() + '</div>';
  const acts = root.querySelector('#eg-actions');
  acts.hidden = false;
  const nb = root.querySelector('#eg-next');
  nb.textContent = g.lives ? 'Дальше' : 'Итоги';
  nb.focus({ preventScroll: true });
}

function pick(k) {
  if (g.answered) return;
  const t = g.task;
  const ok = t.opts[k] === t.a;
  root.querySelectorAll('.opt').forEach((b, i) => {
    b.disabled = true;
    if (t.opts[i] === t.a) b.classList.add('correct');
    else if (i === k) b.classList.add('wrong');
    else b.classList.add('dim');
  });
  finishAnswer(ok, t.opts[k]);
}

function check() {
  if (g.answered) return;
  const inp = root.querySelector('#ans');
  const r = checkAnswer(inp.value, g.task.value);
  const prev = root.querySelector('#ans-prev');
  if (!r.ok) {
    prev.innerHTML = '<span class="err">' + esc(r.error) + '</span>';
    inp.focus({ preventScroll: true });
    return;
  }
  inp.disabled = true;
  root.querySelectorAll('.key, [data-act="check"]').forEach((b) => { b.disabled = true; });
  inp.classList.add(r.correct ? 'correct' : 'wrong');
  finishAnswer(r.correct, inp.value);
}

function next() {
  if (!g.answered) return;
  if (g.lives <= 0) { over(); return; }
  // После ошибки читали пояснение — сервер сбрасывает таймер скорости
  if (g.server && !g.lastOk) { const runId = g.server.runId; g.pending = g.pending.then(() => request('/api/run/next', { method: 'POST', body: { runId } })).catch(() => {}); }
  newTask();
  const top = root.getBoundingClientRect().top + window.scrollY - 70;
  if (window.scrollY > top) window.scrollTo(0, Math.max(0, top));
}

/* ---------- итоги ---------- */
async function over() {
  view = 'over';
  g.duration = Date.now() - g.startedAt;
  closingGuard(false);
  root.innerHTML = '<p class="muted">Подвожу итоги…</p>';
  await g.pending;
  if (g.server && !g.serverResult) {
    try { g.serverResult = await request('/api/run/end', { method: 'POST', body: { runId: g.server.runId } }); } catch (e) { g.serverNote = 'Не удалось завершить забег на сервере: ' + e.message; }
  }
  if (g.serverResult && typeof g.serverResult.score === 'number') g.score = g.serverResult.score;
  const key = 'best_' + g.mode;
  g.prevBest = load(key, 0);
  if (g.score > g.prevBest) { save(key, g.score); markDirty(); }
  renderOver();
  const st = root.querySelector('#eg-submit');
  const r = g.serverResult;
  if (r && r.counted) st.textContent = 'В рейтинге: ' + r.rank + '-е место, лучший результат ' + r.best + '.';
  else if (r && g.score > 0) st.textContent = 'Этот забег не попал в рейтинг: слишком много подозрительно быстрых ответов.';
  else if (g.serverNote) st.textContent = g.serverNote;
  else if (!canSubmit() && ratingEnabled()) st.textContent = 'Чтобы результаты попадали в рейтинг, войди через Telegram.';
  window.scrollTo(0, 0);
}

function renderOver() {
  const acc = g.total ? Math.round((g.correct / g.total) * 100) : 0;
  const mins = Math.max(1, Math.round(g.duration / 60000));
  const record = g.score > g.prevBest && g.score > 0;
  root.innerHTML =
    '<div class="page-head"><p class="qmeta">' + MODES[g.mode].name + '</p><div class="score">' + g.score + '<span>очков</span></div>' +
    '<p class="lead">' + (record ? 'Новый рекорд! ' : 'Рекорд: ' + Math.max(g.prevBest, g.score) + '. ') + 'Верно ' + g.correct + ' из ' + g.total + ' (' + acc + '%), ' + mins + ' мин.</p>' +
    '<p class="note-line" id="eg-submit" aria-live="polite"></p></div>' +
    '<div class="actions"><button class="btn primary" data-act="again">Ещё раз</button><button class="btn ghost" data-act="share">Поделиться</button><button class="btn ghost" data-act="menu">Выбрать режим</button></div>';
}

/* ---------- события ---------- */
function onClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b || !root.contains(b)) return;
  const act = b.dataset.act;
  if (act === 'mode') { pref.mode = b.dataset.mode; save('endless_pref', pref); renderMenu(); }
  else if (act === 'topic') {
    const id = b.dataset.topic;
    if (!id) pref.topics = [];
    else pref.topics = pref.topics.includes(id) ? pref.topics.filter((x) => x !== id) : pref.topics.concat(id);
    save('endless_pref', pref); renderMenu();
  }
  else if (act === 'start' || act === 'again') start();
  else if (act === 'menu') { view = 'menu'; g = null; closingGuard(false); renderMenu(); }
  else if (act === 'quit') quit();
  else if (act === 'pick') pick(+b.dataset.k);
  else if (act === 'check') check();
  else if (act === 'next') next();
  else if (act === 'key') insertKey(b.dataset.key);
  else if (act === 'share') {
    share('Набрал ' + g.score + ' очков в генераторе задач по матану (' + MODES[g.mode].name.toLowerCase() + '). Попробуй побить!', appLink('endless'))
      .then((r) => { if (r === 'copied') toast('Ссылка скопирована'); });
  }
  else if (act === 'report') openReport({ where: 'Генератор, ' + MODES[g.mode].name.toLowerCase(), q: g.task.q, a: g.task.a, user: g.lastUser, gen: g.task.gen });
}

// Для системной кнопки «Назад»
export const endlessDeep = () => view !== 'menu';
export function endlessBack() {
  if (view === 'over') { view = 'menu'; g = null; renderMenu(); return true; }
  if (view !== 'game') return false;
  const ask = 'Завершить забег? Результат засчитается как есть.';
  if (inTelegram && tg.showConfirm) tg.showConfirm(ask, (ok) => { if (ok) quit(); });
  else if (window.confirm(ask)) quit();
  return true;
}

export function quit() {
  if (!g || view !== 'game') return;
  if (g.total) { over(); return; }
  if (g.server) request('/api/run/end', { method: 'POST', body: { runId: g.server.runId } }).catch(() => {});
  view = 'menu'; g = null; closingGuard(false); renderMenu();
}

function insertKey(k) {
  const inp = root.querySelector('#ans');
  if (!inp || inp.disabled) return;
  const map = { 'π': 'π', 'e': 'e', '√': '√(', '^': '^', '/': '/', '(': '(', ')': ')', '∞': '∞', '−': '-' };
  const ins = map[k] || k;
  const s = inp.selectionStart ?? inp.value.length, en = inp.selectionEnd ?? inp.value.length;
  inp.value = inp.value.slice(0, s) + ins + inp.value.slice(en);
  inp.focus({ preventScroll: true });
  inp.setSelectionRange(s + ins.length, s + ins.length);
  onInput({ target: inp });
}

function onInput(e) {
  if (!e.target || e.target.id !== 'ans') return;
  const prev = root.querySelector('#ans-prev');
  const r = parseAnswer(e.target.value);
  if (r.empty) prev.innerHTML = '';
  else if (r.ok) prev.innerHTML = '<span class="muted">Вы ввели:</span> ' + tex('\\displaystyle ' + r.tex);
  else prev.innerHTML = '<span class="muted">' + esc(r.error) + '</span>';
}

function onKeyField(e) {
  if (e.target && e.target.id === 'ans' && e.key === 'Enter') { e.preventDefault(); check(); }
}
