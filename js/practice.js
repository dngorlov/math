// Практика по темам и марафон: фиксированный банк вопросов из data/bank.txt.
import { rich, esc } from './math.js';
import { registerCorrect } from './streak.js';
import { tap } from './haptics.js';
import { record } from './stats.js';
import { reportButton, openReport } from './report.js';
import { shuffle, CHEV_R, CHEV_L } from './ui.js';

const TOPICS = [
  { id: 'deriv', name: 'Производные', desc: 'Вся таблица и правила дифференцирования' },
  { id: 'growth', name: 'Скорость роста', desc: 'Что растёт быстрее на бесконечности' },
  { id: 'lim', name: 'Устные пределы', desc: 'Считаются в уме за пару секунд' },
  { id: 'rem', name: 'Замечательные пределы', desc: 'Оба предела и эквивалентности' },
  { id: 'circle', name: 'Единичная окружность', desc: 'Значения, знаки, обратные функции' },
];
const tName = (id) => (TOPICS.find((t) => t.id === id) || {}).name || '';

let QS = [], root, screen = 'home', quiz = null, goTheory = () => {};

export function parseBank(txt) {
  const qs = []; let topic = null, cur = null;
  txt.split('\n').forEach((line) => {
    line = line.trim();
    if (!line) return;
    if (line.startsWith('# ')) { topic = line.slice(2).trim(); return; }
    const k = line.slice(0, 2), v = line.slice(2).trim();
    if (k === 'Q:') { cur = { t: topic, q: v, a: '', w: [], e: '' }; qs.push(cur); }
    else if (k === 'A:') cur.a = v;
    else if (k === 'W:') cur.w = v.split(';;').map((s) => s.trim());
    else if (k === 'E:') cur.e = v;
  });
  return qs;
}

export async function mountPractice(el, { onTheory } = {}) {
  root = el;
  goTheory = onTheory || goTheory;
  root.innerHTML = '<p class="muted">Загружаю вопросы…</p>';
  try {
    const r = await fetch('data/bank.txt');
    QS = parseBank(await r.text());
  } catch (e) {
    root.innerHTML = '<div class="empty"><h2>Не удалось загрузить вопросы</h2><p>Обнови страницу. Если открываешь файл напрямую с диска, запусти локальный сервер — инструкция в README.</p></div>';
    return;
  }
  root.addEventListener('click', onClick);
  render();
}

// Для системной кнопки «Назад»: из вопроса или итогов — к списку тем
export function practiceBack() {
  if (screen === 'home') return false;
  screen = 'home'; quiz = null; renderHome(); window.scrollTo(0, 0);
  return true;
}
export const practiceDeep = () => screen !== 'home';

export function practiceKey(e) {
  if (screen !== 'quiz' || !quiz) return false;
  const it = quiz.items[quiz.i];
  if (/^[1-4]$/.test(e.key) && it.chosen === null) { pick(+e.key - 1); return true; }
  if (e.key === 'Enter' && !(e.target && e.target.tagName === 'BUTTON')) { next(); return true; }
  return false;
}

function render() {
  if (screen === 'quiz') renderQuiz();
  else if (screen === 'result') renderResult();
  else renderHome();
}

function renderHome() {
  const total = QS.length;
  let h = '<div class="page-head"><h1>Тренажёр по матанализу</h1><p class="lead">' + total + ' вопросов с вариантами ответа. Выбери тему или пройди всё подряд в марафоне. Для бесконечной тренировки — вкладка «Генератор».</p></div>';
  h += '<button class="marathon" data-act="marathon"><span><span class="row-title">Марафон</span><span class="row-desc">Все ' + total + ' вопросов вперемешку</span></span><span class="row-end">' + total + CHEV_R + '</span></button>';
  h += '<h2 class="list-h">Темы</h2><div class="list">';
  TOPICS.forEach((t) => {
    const n = QS.filter((q) => q.t === t.id).length;
    h += '<button class="row" data-act="topic" data-topic="' + t.id + '"><span><span class="row-title">' + t.name + '</span><span class="row-desc">' + t.desc + '</span></span><span class="row-end">' + n + CHEV_R + '</span></button>';
  });
  root.innerHTML = h + '</div>';
}

function start(mode, title, list) {
  quiz = { mode, title, i: 0, items: shuffle(list.slice()).map((q) => ({ q, opts: shuffle([q.a].concat(q.w)), chosen: null, revealed: false, ok: false })) };
  screen = 'quiz';
  renderQuiz();
  window.scrollTo(0, 0);
}

function renderQuiz() {
  const z = quiz, it = z.items[z.i], q = it.q, n = z.items.length;
  const answered = it.chosen !== null;
  let h = '<div class="qtop"><button class="back" data-act="home">' + CHEV_L + 'Темы</button><span class="counter">' + (z.i + 1) + ' / ' + n + '</span></div>';
  h += '<div class="bar"><i style="width:' + (((z.i + (answered ? 1 : 0)) / n) * 100).toFixed(2) + '%"></i></div>';
  h += '<div class="qmeta">' + esc(tName(q.t)) + '</div><div class="qtext">' + rich(q.q, true) + '</div><div class="opts">';
  it.opts.forEach((o, k) => {
    let cls = 'opt';
    if (answered) {
      if (k === it.chosen) cls += it.ok ? ' correct' : ' wrong';
      else if (it.revealed && o === q.a) cls += ' correct';
      else cls += ' dim';
    }
    h += '<button class="' + cls + '" data-act="pick" data-k="' + k + '"' + (answered ? ' disabled' : '') + '><span class="k">' + (k + 1) + '</span><span class="ov">' + rich(o, true) + '</span></button>';
  });
  h += '</div>';
  if (it.chosen === -1) h += '<div class="verdict skip">Ответ показан</div>';
  else if (answered) h += it.ok ? '<div class="verdict ok">Верно</div>' : '<div class="verdict bad">Неверно</div>';
  else h += '<div class="verdict"></div>';
  if (it.revealed) {
    h += '<div class="expl"><div class="expl-ans">Ответ: ' + rich(q.a, true) + '</div>' + (q.e ? '<p>' + rich(q.e, true) + '</p>' : '') +
      '<div class="expl-links"><button class="link" data-act="theory" data-topic="' + q.t + '">Теория по теме</button>' + reportButton() + '</div></div>';
  }
  h += '<div class="actions"><button class="btn ghost" data-act="reveal">' + (it.revealed ? 'Скрыть ответ' : 'Показать ответ') + '</button>' +
    '<button class="btn primary" data-act="next" id="pr-next">' + (z.i === n - 1 ? 'Завершить' : 'Дальше') + '</button></div>';
  root.innerHTML = h;
}

function renderResult() {
  const z = quiz, n = z.items.length;
  const good = z.items.filter((it) => it.ok).length, bad = n - good;
  let h = '<div class="qtop"><button class="back" data-act="home">' + CHEV_L + 'Темы</button><span class="counter">' + esc(z.title) + '</span></div>';
  h += '<div class="score">' + good + '<span>/ ' + n + '</span></div><p class="lead">' + Math.round((good / n) * 100) + '% верных. ' + (bad ? 'Ошибки и пропуски можно пройти отдельно.' : 'Без единой ошибки.') + '</p>';
  const groups = {};
  z.items.forEach((it) => { const gr = groups[it.q.t] || (groups[it.q.t] = { n: 0, ok: 0 }); gr.n++; if (it.ok) gr.ok++; });
  const keys = TOPICS.filter((t) => groups[t.id]);
  if (keys.length > 1) {
    h += '<div class="bd">' + keys.map((t) => { const gr = groups[t.id]; return '<div class="bd-row"><b>' + t.name + '</b><span>' + gr.ok + ' / ' + gr.n + '</span><div class="bd-bar"><i style="width:' + ((gr.ok / gr.n) * 100).toFixed(1) + '%"></i></div></div>'; }).join('') + '</div>';
  }
  h += '<div class="actions">' + (bad ? '<button class="btn primary" data-act="retry">Повторить ошибки (' + bad + ')</button>' : '') +
    '<button class="btn ' + (bad ? 'ghost' : 'primary') + '" data-act="again">Пройти заново</button><button class="btn ghost" data-act="home">К темам</button></div>';
  root.innerHTML = h;
}

function pick(k) {
  const it = quiz.items[quiz.i];
  if (it.chosen !== null) return;
  it.chosen = k;
  it.ok = it.opts[k] === it.q.a;
  tap(it.ok ? 'medium' : 'error');
  record('practice', { topic: it.q.t, kind: 'bank' }, it.ok);
  if (it.ok) registerCorrect();
  renderQuiz();
  const nb = document.getElementById('pr-next'); if (nb) nb.focus({ preventScroll: true });
}

function next() {
  if (quiz.i < quiz.items.length - 1) {
    quiz.i++;
    renderQuiz();
    const top = root.getBoundingClientRect().top + window.scrollY - 70;
    if (window.scrollY > top) window.scrollTo(0, Math.max(0, top));
  } else { screen = 'result'; renderResult(); window.scrollTo(0, 0); }
}

function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el || !root.contains(el)) return;
  const act = el.dataset.act, z = quiz;
  if (act === 'marathon') start('marathon', 'Марафон', QS);
  else if (act === 'topic') start('topic', tName(el.dataset.topic), QS.filter((q) => q.t === el.dataset.topic));
  else if (act === 'home') { screen = 'home'; quiz = null; renderHome(); window.scrollTo(0, 0); }
  else if (act === 'pick') pick(+el.dataset.k);
  else if (act === 'reveal') {
    const it = z.items[z.i];
    it.revealed = !it.revealed;
    if (it.chosen === null) { it.chosen = -1; it.ok = false; }
    renderQuiz();
  }
  else if (act === 'next') next();
  else if (act === 'retry') start('retry', 'Работа над ошибками', z.items.filter((it) => !it.ok).map((it) => it.q));
  else if (act === 'again') start(z.mode, z.title, z.items.map((it) => it.q));
  else if (act === 'theory') goTheory(el.dataset.topic);
  else if (act === 'report') { const it = z.items[z.i]; openReport({ where: 'Практика, ' + tName(it.q.t), q: it.q.q, a: it.q.a }); }
}
