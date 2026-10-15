// Интерактивные графики на canvas: скорость роста, касательная, замечательные пределы.
import { tex } from './math.js';

const COL = { grid: '#1c1c1c', axis: '#4a4a4a', text: '#8f8f8f', white: '#ececec', red: '#ff3030', gray: '#9b9b9b', pink: '#ff9b9b' };

class Plot {
  constructor(canvas, height = 300) {
    this.c = canvas; this.ctx = canvas.getContext('2d'); this.h = height; this.log = false;
  }
  size() {
    const dpr = window.devicePixelRatio || 1;
    this.w = this.c.clientWidth || 600;
    this.c.width = Math.round(this.w * dpr); this.c.height = Math.round(this.h * dpr);
    this.c.style.height = this.h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.pad = { l: 44, r: 12, t: 12, b: 26 };
  }
  view(x0, x1, y0, y1) { this.x0 = x0; this.x1 = x1; this.y0 = y0; this.y1 = y1; }
  X(x) { return this.pad.l + ((x - this.x0) / (this.x1 - this.x0)) * (this.w - this.pad.l - this.pad.r); }
  Y(y) { return this.pad.t + (1 - (y - this.y0) / (this.y1 - this.y0)) * (this.h - this.pad.t - this.pad.b); }
  invX(px) { return this.x0 + ((px - this.pad.l) / (this.w - this.pad.l - this.pad.r)) * (this.x1 - this.x0); }
  clear() { this.ctx.clearRect(0, 0, this.w, this.h); }
  grid(yLabel = (v) => fmt(v)) {
    const g = this.ctx;
    g.font = '11px ' + getComputedStyle(document.body).fontFamily;
    g.lineWidth = 1;
    const sx = nice((this.x1 - this.x0) / 6), sy = nice((this.y1 - this.y0) / 5);
    g.fillStyle = COL.text; g.textAlign = 'center'; g.textBaseline = 'top';
    for (let x = Math.ceil(this.x0 / sx) * sx; x <= this.x1 + 1e-9; x += sx) {
      g.strokeStyle = COL.grid; g.beginPath(); g.moveTo(this.X(x), this.pad.t); g.lineTo(this.X(x), this.h - this.pad.b); g.stroke();
      g.fillText(fmt(x), this.X(x), this.h - this.pad.b + 6);
    }
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let y = Math.ceil(this.y0 / sy) * sy; y <= this.y1 + 1e-9; y += sy) {
      g.strokeStyle = COL.grid; g.beginPath(); g.moveTo(this.pad.l, this.Y(y)); g.lineTo(this.w - this.pad.r, this.Y(y)); g.stroke();
      g.fillText(yLabel(y), this.pad.l - 6, this.Y(y));
    }
    g.strokeStyle = COL.axis;
    if (this.y0 <= 0 && this.y1 >= 0) { g.beginPath(); g.moveTo(this.pad.l, this.Y(0)); g.lineTo(this.w - this.pad.r, this.Y(0)); g.stroke(); }
    if (this.x0 <= 0 && this.x1 >= 0) { g.beginPath(); g.moveTo(this.X(0), this.pad.t); g.lineTo(this.X(0), this.h - this.pad.b); g.stroke(); }
  }
  fn(f, color, { width = 2, dash = [] } = {}) {
    const g = this.ctx, n = Math.ceil(this.w);
    g.save();
    g.beginPath(); g.rect(this.pad.l, this.pad.t, this.w - this.pad.l - this.pad.r, this.h - this.pad.t - this.pad.b); g.clip();
    g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash); g.lineJoin = 'round';
    g.beginPath();
    let pen = false, prevY = null;
    for (let i = 0; i <= n; i++) {
      const x = this.x0 + ((this.x1 - this.x0) * i) / n;
      let y = f(x);
      if (this.log) y = y > 0 ? Math.log10(y) : NaN;
      if (!isFinite(y)) { pen = false; continue; }
      const py = this.Y(y);
      if (pen && prevY !== null && Math.abs(py - prevY) > this.h * 2) pen = false;
      if (pen) g.lineTo(this.X(x), py); else { g.moveTo(this.X(x), py); pen = true; }
      prevY = py;
    }
    g.stroke(); g.restore();
  }
  hline(y, color, dash = [6, 6]) { this.fn(() => y, color, { width: 1.5, dash }); }
  point(x, y, color, r = 5) {
    const g = this.ctx;
    g.fillStyle = color; g.beginPath(); g.arc(this.X(x), this.Y(this.log ? Math.log10(y) : y), r, 0, Math.PI * 2); g.fill();
  }
}
function nice(step) {
  const p = Math.pow(10, Math.floor(Math.log10(step))), f = step / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}
function fmt(v) {
  if (Math.abs(v) < 1e-10) return '0';
  if (Math.abs(v) >= 1e5 || Math.abs(v) < 1e-3) return v.toExponential(0).replace('e+', 'e');
  return String(+v.toFixed(3)).replace('.', ',');
}
const num = (v, d = 4) => (!isFinite(v) ? '—' : Math.abs(v) >= 1e6 ? v.toExponential(2).replace('e+', '·10^') : (+v.toFixed(d)).toLocaleString('ru-RU', { maximumFractionDigits: d }));

/* ---------- 1. скорость роста ---------- */
const GROW = [
  { id: 'ln', name: '\\ln x', f: Math.log, color: COL.gray, dash: [6, 5] },
  { id: 'sqrt', name: '\\sqrt{x}', f: Math.sqrt, color: COL.gray, dash: [] },
  { id: 'x2', name: 'x^2', f: (x) => x * x, color: COL.white, dash: [] },
  { id: 'x10', name: 'x^{10}', f: (x) => Math.pow(x, 10), color: COL.pink, dash: [8, 5] },
  { id: 'exp2', name: '2^x', f: (x) => Math.pow(2, x), color: COL.red, dash: [] },
];
function growth(card) {
  const on = new Set(['x10', 'exp2', 'x2']);
  card.innerHTML = '<h2>Что растёт быстрее</h2><p class="muted">Включай функции и двигай правую границу. При ' + tex('x\\approx 59') + ' показательная ' + tex('2^x') + ' обгоняет даже ' + tex('x^{10}') + '.</p>' +
    '<div class="g-legend">' + GROW.map((f) => '<label class="g-chip"><input type="checkbox" data-f="' + f.id + '"' + (on.has(f.id) ? ' checked' : '') + '><i style="--c:' + f.color + ';--d:' + (f.dash.length ? 'dashed' : 'solid') + '"></i>' + tex(f.name) + '</label>').join('') + '</div>' +
    '<canvas role="img" aria-label="Графики функций"></canvas>' +
    '<div class="g-ctl"><label>Правая граница ' + tex('x') + ': <b data-o="xmax">20</b></label><input type="range" min="2" max="80" step="1" value="20" data-c="xmax" aria-label="Правая граница x"></div>' +
    '<label class="g-check"><input type="checkbox" data-c="log"> Логарифмическая шкала по ' + tex('y') + '</label><p class="g-read" aria-live="polite"></p>';
  const pl = new Plot(card.querySelector('canvas'), 300);
  const xr = card.querySelector('[data-c="xmax"]'), lg = card.querySelector('[data-c="log"]');
  function draw() {
    const xmax = +xr.value;
    card.querySelector('[data-o="xmax"]').textContent = xmax;
    pl.size(); pl.log = lg.checked;
    const vis = GROW.filter((f) => on.has(f.id));
    let ymax = 1;
    vis.forEach((f) => { ymax = Math.max(ymax, f.f(xmax)); });
    if (pl.log) pl.view(0.5, xmax, -1, Math.log10(ymax) * 1.05 + 0.5);
    else pl.view(0, xmax, 0, ymax * 1.08);
    pl.clear(); pl.grid(pl.log ? (v) => (v === Math.round(v) ? '10^' + v : '') : fmt);
    vis.forEach((f) => pl.fn(f.f, f.color, { width: 2.2, dash: f.dash }));
    if (vis.length) {
      const lead = vis.reduce((a, b) => (b.f(xmax) > a.f(xmax) ? b : a));
      card.querySelector('.g-read').innerHTML = 'При ' + tex('x=' + xmax) + ' больше всех ' + tex(lead.name) + ' = ' + num(lead.f(xmax), 2) + '.';
    } else card.querySelector('.g-read').textContent = 'Включи хотя бы одну функцию.';
  }
  card.addEventListener('input', (e) => {
    if (e.target.dataset.f) { if (e.target.checked) on.add(e.target.dataset.f); else on.delete(e.target.dataset.f); }
    draw();
  });
  return draw;
}

/* ---------- 2. касательная ---------- */
const TAN = [
  { id: 'x2', name: 'x^2', f: (x) => x * x, d: (x) => 2 * x, xr: [-3, 3], yr: [-2, 9], x0: 1 },
  { id: 'cub', name: 'x^3-3x', f: (x) => x ** 3 - 3 * x, d: (x) => 3 * x * x - 3, xr: [-2.6, 2.6], yr: [-5, 5], x0: 0.5 },
  { id: 'sin', name: '\\sin x', f: Math.sin, d: Math.cos, xr: [-6.5, 6.5], yr: [-2, 2], x0: 1 },
  { id: 'exp', name: 'e^x', f: Math.exp, d: Math.exp, xr: [-3, 2.5], yr: [-1, 8], x0: 0 },
  { id: 'ln', name: '\\ln x', f: Math.log, d: (x) => 1 / x, xr: [0.05, 6], yr: [-3, 2.5], x0: 1 },
];
function tangent(card) {
  let cur = TAN[0], x0 = cur.x0;
  card.innerHTML = '<h2>Касательная и производная</h2><p class="muted">Производная в точке — угловой коэффициент касательной. Перетаскивай точку по графику или двигай ползунок.</p>' +
    '<div class="chips">' + TAN.map((t, i) => '<button class="chip' + (i ? '' : ' on') + '" data-t="' + t.id + '">' + tex(t.name) + '</button>').join('') + '</div>' +
    '<canvas role="img" aria-label="График функции и касательной"></canvas>' +
    '<div class="g-ctl"><label>Точка касания</label><input type="range" min="0" max="1000" value="500" data-c="x0" aria-label="Точка касания"></div>' +
    '<label class="g-check"><input type="checkbox" data-c="der"> Показать график производной</label><p class="g-read" aria-live="polite"></p>';
  const cv = card.querySelector('canvas'), pl = new Plot(cv, 300), sl = card.querySelector('[data-c="x0"]'), der = card.querySelector('[data-c="der"]');
  const toSl = () => { sl.value = Math.round(((x0 - cur.xr[0]) / (cur.xr[1] - cur.xr[0])) * 1000); };
  function draw() {
    pl.size(); pl.view(cur.xr[0], cur.xr[1], cur.yr[0], cur.yr[1]); pl.clear(); pl.grid();
    if (der.checked) pl.fn(cur.d, COL.gray, { width: 1.6, dash: [6, 5] });
    pl.fn(cur.f, COL.white, { width: 2.4 });
    const y0 = cur.f(x0), k = cur.d(x0);
    pl.fn((x) => k * (x - x0) + y0, COL.red, { width: 2 });
    pl.point(x0, y0, COL.red, 6);
    card.querySelector('.g-read').innerHTML = tex('x_0=' + num(x0, 2).replace(',', '{,}')) + ', ' + tex('f(x_0)=' + num(y0, 3).replace(',', '{,}')) + ', ' + tex("f'(x_0)=" + num(k, 3).replace(',', '{,}')) +
      '<br><span class="muted">Касательная: </span>' + tex('y=' + num(k, 3).replace(',', '{,}') + '(x-' + num(x0, 2).replace(',', '{,}') + ')+' + num(y0, 3).replace(',', '{,}')).replace('+-', '-');
  }
  card.addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    cur = TAN.find((t) => t.id === b.dataset.t); x0 = cur.x0; toSl();
    card.querySelectorAll('[data-t]').forEach((c) => c.classList.toggle('on', c === b));
    draw();
  });
  sl.addEventListener('input', () => { x0 = cur.xr[0] + (sl.value / 1000) * (cur.xr[1] - cur.xr[0]); draw(); });
  der.addEventListener('change', draw);
  let drag = false;
  const move = (e) => { const r = cv.getBoundingClientRect(); x0 = Math.min(cur.xr[1], Math.max(cur.xr[0], pl.invX(e.clientX - r.left))); toSl(); draw(); };
  cv.addEventListener('pointerdown', (e) => { drag = true; cv.setPointerCapture(e.pointerId); move(e); });
  cv.addEventListener('pointermove', (e) => { if (drag) move(e); });
  cv.addEventListener('pointerup', () => { drag = false; });
  toSl();
  return draw;
}

/* ---------- 3. замечательные пределы ---------- */
const LIM = [
  { id: 'sin', name: '\\frac{\\sin x}{x},\\ x\\to0', f: (x) => Math.sin(x) / x, xr: [-10, 10], yr: [-0.4, 1.3], L: 1, Ltex: '1', path: (t) => 3 * (1 - t) + 0.001 },
  { id: 'e', name: '\\left(1+\\frac{1}{x}\\right)^x,\\ x\\to\\infty', f: (x) => Math.pow(1 + 1 / x, x), xr: [0.2, 60], yr: [1, 3.2], L: Math.E, Ltex: 'e', path: (t) => 0.5 + t * 59 },
  { id: 'sq', name: 'x\\sin\\frac{1}{x},\\ x\\to0', f: (x) => x * Math.sin(1 / x), xr: [-0.5, 0.5], yr: [-0.5, 0.5], L: 0, Ltex: '0', path: (t) => 0.45 * (1 - t) + 0.0005, env: true },
];
function limits(card) {
  let cur = LIM[0];
  card.innerHTML = '<h2>Замечательные пределы</h2><p class="muted">Подвигай ползунок: значение функции приближается к пределу (красная пунктирная линия).</p>' +
    '<div class="chips">' + LIM.map((l, i) => '<button class="chip' + (i ? '' : ' on') + '" data-l="' + l.id + '">' + tex(l.name) + '</button>').join('') + '</div>' +
    '<canvas role="img" aria-label="График функции и её предела"></canvas>' +
    '<div class="g-ctl"><label>Ближе к пределу</label><input type="range" min="0" max="1000" value="300" data-c="t" aria-label="Насколько близко к пределу"></div><p class="g-read" aria-live="polite"></p>';
  const pl = new Plot(card.querySelector('canvas'), 300), sl = card.querySelector('[data-c="t"]');
  function draw() {
    const t = sl.value / 1000, x = cur.path(t), y = cur.f(x);
    pl.size(); pl.view(cur.xr[0], cur.xr[1], cur.yr[0], cur.yr[1]); pl.clear(); pl.grid();
    if (cur.env) { pl.fn((v) => Math.abs(v), COL.gray, { width: 1.2, dash: [4, 4] }); pl.fn((v) => -Math.abs(v), COL.gray, { width: 1.2, dash: [4, 4] }); }
    pl.hline(cur.L, COL.red);
    pl.fn(cur.f, COL.white, { width: 2.2 });
    pl.point(x, y, COL.red, 6);
    card.querySelector('.g-read').innerHTML = tex('x=' + num(x, 4).replace(',', '{,}')) + ': значение ' + tex(num(y, 6).replace(',', '{,}')) + ', до предела ' + tex(cur.Ltex) + ' осталось ' + tex(num(Math.abs(y - cur.L), 6).replace(',', '{,}')) + '.' +
      (cur.env ? '<br><span class="muted">Функция зажата между ' + tex('-|x|') + ' и ' + tex('|x|') + ', поэтому стремится к нулю.</span>' : '');
  }
  card.addEventListener('click', (e) => {
    const b = e.target.closest('[data-l]'); if (!b) return;
    cur = LIM.find((l) => l.id === b.dataset.l);
    card.querySelectorAll('[data-l]').forEach((c) => c.classList.toggle('on', c === b));
    draw();
  });
  sl.addEventListener('input', draw);
  return draw;
}

export function mountGraphs(root) {
  root.innerHTML = '<div class="page-head"><h1>Графики</h1><p class="lead">Три интерактивных графика к теории. Единичная окружность — в разделе «Теория».</p></div>' +
    '<section class="g-card" id="g-growth"></section><section class="g-card" id="g-tan"></section><section class="g-card" id="g-lim"></section>';
  const draws = [growth(root.querySelector('#g-growth')), tangent(root.querySelector('#g-tan')), limits(root.querySelector('#g-lim'))];
  const redraw = () => draws.forEach((d) => d());
  if ('ResizeObserver' in window) new ResizeObserver(() => { if (!root.hidden) redraw(); }).observe(root);
  return redraw;
}
