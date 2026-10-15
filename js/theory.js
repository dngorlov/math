// Теория: подгружается из views/theory.html, формулы рендерятся KaTeX, внутри — интерактивная окружность.
import { renderMathIn, tex } from './math.js';

const CHIPS = [['th-deriv', 'Производные'], ['th-growth', 'Скорость роста'], ['th-lim', 'Устные пределы'], ['th-rem', 'Замечательные пределы'], ['th-circle', 'Окружность']];
let root, chips = [], ready = null;

export function mountTheory(el) {
  root = el;
  ready = (async () => {
    root.innerHTML = '<nav class="subnav" aria-label="Разделы теории"><div class="subnav-in">' +
      CHIPS.map(([id, n], i) => '<button class="chip' + (i ? '' : ' on') + '" data-go="' + id + '">' + n + '</button>').join('') +
      '</div></nav><div class="wrap" id="theory-body"><p class="muted">Загружаю теорию…</p></div>';
    const body = root.querySelector('#theory-body');
    try {
      body.innerHTML = await (await fetch('views/theory.html')).text();
    } catch (e) {
      body.innerHTML = '<div class="empty"><h2>Теория не загрузилась</h2><p>Проверь интернет и обнови страницу.</p></div>';
      return;
    }
    renderMathIn(body);
    initCircle(body.querySelector('#uc-fig'), body.querySelector('#uc-out'));
    chips = [...root.querySelectorAll('.chip')];
    chips.forEach((c) => c.addEventListener('click', () => scrollToSection(c.dataset.go)));
    window.addEventListener('scroll', () => requestAnimationFrame(spy), { passive: true });
  })();
  return ready;
}

export async function showTopic(topic) {
  await ready;
  scrollToSection('th-' + topic, false);
}

function scrollToSection(id, smooth = true) {
  const sec = document.getElementById(id);
  if (!sec) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  sec.scrollIntoView({ behavior: smooth && !reduce ? 'smooth' : 'auto' });
}

function spy() {
  if (!root || root.hidden || !chips.length) return;
  let cur = 'th-deriv';
  root.querySelectorAll('.tsec').forEach((s) => { if (s.getBoundingClientRect().top < 150) cur = s.id; });
  if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = 'th-circle';
  chips.forEach((c) => {
    const on = c.dataset.go === cur;
    if (on !== c.classList.contains('on')) {
      c.classList.toggle('on', on);
      if (on) c.parentNode.scrollTo({ left: c.offsetLeft - 16, behavior: 'smooth' });
    }
  });
}

/* ---------- интерактивная единичная окружность ---------- */
const UC = {
  rad: ['0', '\\frac{\\pi}{6}', '\\frac{\\pi}{4}', '\\frac{\\pi}{3}', '\\frac{\\pi}{2}', '\\frac{2\\pi}{3}', '\\frac{3\\pi}{4}', '\\frac{5\\pi}{6}', '\\pi', '\\frac{7\\pi}{6}', '\\frac{5\\pi}{4}', '\\frac{4\\pi}{3}', '\\frac{3\\pi}{2}', '\\frac{5\\pi}{3}', '\\frac{7\\pi}{4}', '\\frac{11\\pi}{6}'],
  lbl: ['0', 'π/6', 'π/4', 'π/3', 'π/2', '2π/3', '3π/4', '5π/6', 'π', '7π/6', '5π/4', '4π/3', '3π/2', '5π/3', '7π/4', '11π/6'],
  deg: [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330],
  sin: ['0', 'h', 'r2', 'r3', '1', 'r3', 'r2', 'h', '0', '-h', '-r2', '-r3', '-1', '-r3', '-r2', '-h'],
  cos: ['1', 'r3', 'r2', 'h', '0', '-h', '-r2', '-r3', '-1', '-r3', '-r2', '-h', '0', 'h', 'r2', 'r3'],
  tg: ['0', 'i', '1', 'R', 'x', '-R', '-1', '-i', '0', 'i', '1', 'R', 'x', '-R', '-1', '-i'],
  ctg: ['x', 'R', '1', 'i', '0', '-i', '-1', '-R', 'x', 'R', '1', 'i', '0', '-i', '-1', '-R'],
};
const UV = { '0': '0', '1': '1', '-1': '-1', h: '\\frac{1}{2}', '-h': '-\\frac{1}{2}', r2: '\\frac{\\sqrt{2}}{2}', '-r2': '-\\frac{\\sqrt{2}}{2}', r3: '\\frac{\\sqrt{3}}{2}', '-r3': '-\\frac{\\sqrt{3}}{2}', R: '\\sqrt{3}', '-R': '-\\sqrt{3}', i: '\\frac{\\sqrt{3}}{3}', '-i': '-\\frac{\\sqrt{3}}{3}' };
const ucVal = (c) => (c === 'x' ? '<span class="nd">не определён</span>' : tex('\\displaystyle ' + UV[c]));

function initCircle(fig, out) {
  if (!fig || !out) return;
  let sel = 1;
  const C = 180, R = 118, f = (n) => n.toFixed(2);
  const P = (a, r) => [C + r * Math.cos(a), C - r * Math.sin(a)];
  function draw(keepFocus) {
    const a = (UC.deg[sel] * Math.PI) / 180, p = P(a, R);
    let s = '<svg viewBox="0 0 360 360" role="group" aria-label="Единичная окружность">';
    s += '<line class="ax" x1="52" y1="180" x2="308" y2="180"/><line class="ax" x1="180" y1="52" x2="180" y2="308"/><circle class="cir" cx="180" cy="180" r="' + R + '"/>';
    s += '<line class="proj" x1="' + f(p[0]) + '" y1="' + f(p[1]) + '" x2="' + f(p[0]) + '" y2="180"/><line class="proj" x1="' + f(p[0]) + '" y1="' + f(p[1]) + '" x2="180" y2="' + f(p[1]) + '"/>';
    if (Math.abs(p[0] - C) > 1) s += '<line class="sg" x1="180" y1="180" x2="' + f(p[0]) + '" y2="180"/><text class="slbl" x="' + f((C + p[0]) / 2) + '" y="' + (p[1] > C ? 172 : 196) + '" text-anchor="middle">cos</text>';
    if (Math.abs(p[1] - C) > 1) s += '<line class="sg" x1="180" y1="180" x2="180" y2="' + f(p[1]) + '"/><text class="slbl" x="' + (p[0] >= C ? 172 : 188) + '" y="' + f((C + p[1]) / 2) + '" text-anchor="' + (p[0] >= C ? 'end' : 'start') + '" dominant-baseline="middle">sin</text>';
    s += '<line class="rad" x1="180" y1="180" x2="' + f(p[0]) + '" y2="' + f(p[1]) + '"/>';
    if (a > 0) { const e = P(a, 26); s += '<path class="arc" d="M206 180 A26 26 0 ' + (a > Math.PI ? 1 : 0) + ' 0 ' + f(e[0]) + ' ' + f(e[1]) + '"/>'; }
    for (let k = 0; k < 16; k++) {
      const ak = (UC.deg[k] * Math.PI) / 180, q = P(ak, R), l = P(ak, 146), cs = Math.cos(ak);
      s += '<text class="lbl' + (k === sel ? ' on' : '') + '" x="' + f(l[0]) + '" y="' + f(l[1]) + '" text-anchor="' + (cs > 0.3 ? 'start' : cs < -0.3 ? 'end' : 'middle') + '" dominant-baseline="middle">' + UC.lbl[k] + '</text>';
      s += '<g class="pt" data-i="' + k + '" tabindex="0" role="button" aria-label="Угол ' + UC.lbl[k] + '" aria-pressed="' + (k === sel) + '"><circle class="hit" cx="' + f(q[0]) + '" cy="' + f(q[1]) + '" r="15"/><circle class="dot" cx="' + f(q[0]) + '" cy="' + f(q[1]) + '" r="4"/></g>';
    }
    s += '<circle class="reddot" cx="' + f(p[0]) + '" cy="' + f(p[1]) + '" r="7"/></svg>';
    fig.innerHTML = s;
    const d = UC.deg[sel];
    const quarter = d % 90 === 0 ? 'на оси' : ['I', 'II', 'III', 'IV'][Math.floor(d / 90)] + ' четверть';
    out.innerHTML = '<div class="uc-angle">' + tex('\\alpha=' + UC.rad[sel]) + '<span class="muted">' + d + '°, ' + quarter + '</span></div><div class="uc-vals">' +
      ['sin', 'cos', 'tg', 'ctg'].map((fn) => '<div><span class="lb">' + fn + ' α</span><span class="vl">' + ucVal(UC[fn][sel]) + '</span></div>').join('') +
      '</div><div class="uc-step"><button class="btn ghost" data-step="-1">Предыдущий угол</button><button class="btn ghost" data-step="1">Следующий угол</button></div>';
    if (keepFocus) { const g = fig.querySelector('.pt[data-i="' + sel + '"]'); if (g) g.focus({ preventScroll: true }); }
  }
  fig.addEventListener('click', (e) => { const g = e.target.closest('.pt'); if (g) { sel = +g.dataset.i; draw(false); } });
  fig.addEventListener('keydown', (e) => {
    const g = e.target.closest && e.target.closest('.pt');
    if (!g) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sel = +g.dataset.i; draw(true); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + 1) % 16; draw(true); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 15) % 16; draw(true); }
  });
  out.addEventListener('click', (e) => { const b = e.target.closest('[data-step]'); if (b) { sel = (sel + 16 + +b.dataset.step) % 16; draw(false); } });
  draw(false);
}
