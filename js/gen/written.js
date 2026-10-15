// Письменные генераторы: задачи, которые решаются на бумаге.
// Ответ — число, дробь, корень, e или ∞. Проверка по числовому значению.
// Генератор: { id, topic, make(level) } → { topic, q, a (TeX ответа), value, e }

import { R, fracTex, expTex, kx, powTex, polyTex } from './util.js';

// «+3x» / «-3x» для подстановки после другого слагаемого
const st = (a, v = 'x') => (a < 0 ? '-' + kx(-a, v) : '+' + kx(a, v));

/* ---------- производная в точке ---------- */
const derivPoint = {
  id: 'w-derivpoint', topic: 'deriv',
  make(level) {
    const n = R.int(2, level >= 2 ? 5 : 3);
    let mm; do { mm = R.int(1, level >= 2 ? 4 : 2); } while (mm === n);
    const a = R.nz(-5, 5), b = R.nz(-6, 6), c = R.int(-9, 9);
    const x0 = R.int(-2, 2);
    const f = polyTex([{ c: a, body: powTex('x', n) }, { c: b, body: powTex('x', mm) }, { c, body: '' }]);
    const val = a * n * Math.pow(x0, n - 1) + b * mm * Math.pow(x0, mm - 1);
    const fp = polyTex([{ c: a * n, body: powTex('x', n - 1) }, { c: b * mm, body: powTex('x', mm - 1) }]);
    return {
      topic: 'deriv', kind: 'w-derivpoint',
      q: 'Найдите $f\'(' + x0 + ')$, если $f(x)=' + f + '$',
      a: String(val), value: val,
      e: '$f\'(x)=' + fp + '$. Подставляем $x=' + x0 + '$ и получаем $' + val + '$.',
    };
  },
};

/* ---------- производная сложной функции в нуле ---------- */
const derivChain = {
  id: 'w-derivchain', topic: 'deriv',
  make() {
    const a = R.nz(-6, 6), b = R.int(1, 5), n = R.int(2, 5);
    const kind = R.pick(['powlin', 'lnexp', 'sqrt', 'prod']);
    if (kind === 'powlin') {
      const val = n * a * Math.pow(b, n - 1);
      return { topic: 'deriv', kind: 'w-derivchain:' + kind, q: 'Найдите $f\'(0)$, если $f(x)=(' + kx(a) + '+' + b + ')^{' + n + '}$', a: String(val), value: val,
        e: '$f\'(x)=' + n + '(' + kx(a) + '+' + b + ')^{' + (n - 1) + '}\\cdot ' + a + '$, при $x=0$ получаем $' + n + '\\cdot ' + b + '^{' + (n - 1) + '}\\cdot ' + a + '=' + val + '$.' };
    }
    if (kind === 'lnexp') {
      const c = R.nz(-5, 5), val = a + c;
      return { topic: 'deriv', kind: 'w-derivchain:' + kind, q: 'Найдите $f\'(0)$, если $f(x)=\\ln(1' + st(a) + ')+e^{' + kx(c) + '}$', a: String(val), value: val,
        e: '$f\'(x)=\\frac{' + a + '}{1' + st(a) + '}' + (c < 0 ? '' : '+') + c + 'e^{' + kx(c) + '}$, при $x=0$ это $' + a + (c < 0 ? '' : '+') + c + '=' + val + '$.' };
    }
    if (kind === 'sqrt') {
      const val = a / (2 * b);
      return { topic: 'deriv', kind: 'w-derivchain:' + kind, q: 'Найдите $f\'(0)$, если $f(x)=\\sqrt{' + kx(a) + '+' + b * b + '}$', a: fracTex(a, 2 * b), value: val,
        e: '$f\'(x)=\\frac{' + a + '}{2\\sqrt{' + kx(a) + '+' + b * b + '}}$, при $x=0$ получаем $\\frac{' + a + '}{2\\cdot ' + b + '}=' + fracTex(a, 2 * b) + '$.' };
    }
    const val = b;
    return { topic: 'deriv', kind: 'w-derivchain:' + kind, q: 'Найдите $f\'(0)$, если $f(x)=e^{' + kx(a) + '}\\sin ' + kx(b) + '$', a: String(val), value: val,
      e: 'По правилу произведения $f\'(x)=' + a + 'e^{' + kx(a) + '}\\sin ' + kx(b) + '+' + b + 'e^{' + kx(a) + '}\\cos ' + kx(b) + '$. При $x=0$ первое слагаемое обнуляется, остаётся $' + b + '$.' };
  },
};

/* ---------- предел с сокращением множителя ---------- */
function quadTex(p, q) { // x^2 + p x + q
  return polyTex([{ c: 1, body: 'x^{2}' }, { c: p, body: 'x' }, { c: q, body: '' }]);
}
const limFactor = {
  id: 'w-limfactor', topic: 'lim',
  make() {
    const r = R.int(-4, 4);
    let s, t;
    do { s = R.int(-5, 5); } while (s === r);
    do { t = R.int(-5, 5); } while (t === r || t === s);
    const num = quadTex(-(r + s), r * s), den = quadTex(-(r + t), r * t);
    return {
      topic: 'lim', kind: 'w-limfactor',
      q: 'Вычислите $\\lim_{x\\to' + r + '}\\frac{' + num + '}{' + den + '}$',
      a: fracTex(r - s, r - t), value: (r - s) / (r - t),
      e: 'Числитель $=(x' + (r < 0 ? '+' + -r : r === 0 ? '' : '-' + r) + ')(x' + (s < 0 ? '+' + -s : s === 0 ? '' : '-' + s) + ')$, знаменатель $=(x' + (r < 0 ? '+' + -r : r === 0 ? '' : '-' + r) + ')(x' + (t < 0 ? '+' + -t : t === 0 ? '' : '-' + t) + ')$. Сокращаем общий множитель и подставляем $x=' + r + '$.',
    };
  },
};

/* ---------- эквивалентности ---------- */
const limEquiv = {
  id: 'w-limequiv', topic: 'rem',
  make(level) {
    const a = R.int(1, 6), b = R.int(1, 6), c = R.int(1, 6), d = R.int(1, 6);
    const nums = [
      ['\\sin ' + kx(a), a], ['\\ln(1+' + kx(a) + ')', a], ['\\arctg ' + kx(a), a], ['(e^{' + kx(a) + '}-1)', a],
    ];
    const dens = [['\\tg ' + kx(c), c], ['\\arcsin ' + kx(c), c], ['\\sin ' + kx(c), c]];
    const [n1] = [R.pick(nums)];
    const n2 = [['\\sin ' + kx(b), b], ['(e^{' + kx(b) + '}-1)', b], ['\\ln(1+' + kx(b) + ')', b]][R.int(0, 2)];
    const d1 = R.pick(dens);
    if (level <= 1) {
      return { topic: 'rem', kind: 'w-limequiv:single', q: 'Вычислите $\\lim_{x\\to0}\\frac{' + n1[0] + '}{' + d1[0] + '}$', a: fracTex(a, c), value: a / c,
        e: 'Заменяем на эквивалентные: $' + n1[0] + '\\sim ' + kx(a) + '$, $' + d1[0] + '\\sim ' + kx(c) + '$. Получаем $\\frac{' + a + '}{' + c + '}$.' };
    }
    const val = (a * b) / (c * d);
    return {
      topic: 'rem', kind: 'w-limequiv:product',
      q: 'Вычислите $\\lim_{x\\to0}\\frac{' + n1[0] + '\\cdot ' + n2[0] + '}{' + d1[0] + '\\cdot ' + kx(d) + '}$',
      a: fracTex(a * b, c * d), value: val,
      e: 'В произведении заменяем каждую бесконечно малую на эквивалентную: $\\frac{' + kx(a) + '\\cdot ' + kx(b) + '}{' + kx(c) + '\\cdot ' + kx(d) + '}=' + fracTex(a * b, c * d) + '$.',
    };
  },
};

/* ---------- второй замечательный предел ---------- */
const limSecond = {
  id: 'w-limsecond', topic: 'rem',
  make() {
    const a = R.int(-3, 5);
    let b; do { b = R.int(-3, 5); } while (b === a);
    const c = R.int(1, 2);
    const k = c * (a - b);
    const sg = (v) => (v < 0 ? '-' + -v : v === 0 ? '' : '+' + v);
    return {
      topic: 'rem', kind: 'w-limsecond',
      q: 'Вычислите $\\lim_{n\\to\\infty}\\left(\\frac{n' + sg(a) + '}{n' + sg(b) + '}\\right)^{' + kx(c, 'n') + '}$',
      a: expTex(k), value: Math.exp(k),
      e: 'Неопределённость $1^\\infty$: $\\frac{n' + sg(a) + '}{n' + sg(b) + '}=1+\\frac{' + (a - b) + '}{n' + sg(b) + '}$, поэтому предел равен $e^{\\lim ' + kx(c, 'n') + '\\cdot\\frac{' + (a - b) + '}{n' + sg(b) + '}}=' + expTex(k) + '$. Ответ можно вводить как e^' + k + '.',
    };
  },
};

/* ---------- разность корней ---------- */
const limConj = {
  id: 'w-limconj', topic: 'lim',
  make() {
    const a = R.nz(-9, 9), b = R.int(1, 9);
    return {
      topic: 'lim', kind: 'w-limconj',
      q: 'Вычислите $\\lim_{n\\to\\infty}\\left(\\sqrt{n^2' + (a < 0 ? '-' + kx(-a, 'n') : '+' + kx(a, 'n')) + '+' + b + '}-n\\right)$',
      a: fracTex(a, 2), value: a / 2,
      e: 'Домножаем на сопряжённое: $\\frac{' + kx(a, 'n') + '+' + b + '}{\\sqrt{n^2' + (a < 0 ? '' : '+') + kx(a, 'n') + '+' + b + '}+n}$. Делим на $n$, получаем $\\frac{' + a + '}{2}$.',
    };
  },
};

/* ---------- рациональная функция на бесконечности ---------- */
const limRatInf = {
  id: 'w-limratinf', topic: 'lim',
  make() {
    const a = R.int(1, 4), b = R.nz(-5, 5), c = R.int(1, 5), d = R.nz(-5, 5), e2 = R.int(1, 6), f = R.nz(-9, 9);
    const lin = (p, q) => '(' + kx(p) + (q < 0 ? '-' + -q : '+' + q) + ')';
    return {
      topic: 'lim', kind: 'w-limratinf',
      q: 'Вычислите $\\lim_{x\\to\\infty}\\frac{' + lin(a, b) + '^{2}' + lin(c, d) + '}{' + polyTex([{ c: e2, body: 'x^{3}' }, { c: f, body: '' }]) + '}$',
      a: fracTex(a * a * c, e2), value: (a * a * c) / e2,
      e: 'Старший член числителя: $(' + kx(a) + ')^2\\cdot ' + kx(c) + '=' + a * a * c + 'x^3$, знаменателя — $' + e2 + 'x^3$. Ответ $' + fracTex(a * a * c, e2) + '$.',
    };
  },
};

export const WRITTEN = [derivPoint, derivChain, limFactor, limEquiv, limSecond, limConj, limRatInf];
