// Устные генераторы: короткие задачи с вариантами ответа, решаются в уме.
// Каждый генератор: { id, topic, make(level) } → { topic, q, a, opts, e }
// q, a, opts, e — «богатые» строки: обычный текст + формулы в $…$.

import { R, shuffle, fracTex, expTex, kx, powTex, m, options } from './util.js';

/* ---------- единичная окружность ---------- */
const ANGLES = [
  ['0', 0], ['\\frac{\\pi}{6}', 30], ['\\frac{\\pi}{4}', 45], ['\\frac{\\pi}{3}', 60],
  ['\\frac{\\pi}{2}', 90], ['\\frac{2\\pi}{3}', 120], ['\\frac{3\\pi}{4}', 135], ['\\frac{5\\pi}{6}', 150],
  ['\\pi', 180], ['\\frac{7\\pi}{6}', 210], ['\\frac{5\\pi}{4}', 225], ['\\frac{4\\pi}{3}', 240],
  ['\\frac{3\\pi}{2}', 270], ['\\frac{5\\pi}{3}', 300], ['\\frac{7\\pi}{4}', 315], ['\\frac{11\\pi}{6}', 330],
];
const MAG = [
  [0, '0'], [0.5, '\\frac{1}{2}'], [0.7071, '\\frac{\\sqrt{2}}{2}'], [0.866, '\\frac{\\sqrt{3}}{2}'],
  [1, '1'], [0.5774, '\\frac{\\sqrt{3}}{3}'], [1.7321, '\\sqrt{3}'],
];
const UNDEF = 'Не определён';
function valTex(v) {
  if (!isFinite(v) || Math.abs(v) > 1e6) return null;
  const a = Math.abs(v);
  const hit = MAG.find(([x]) => Math.abs(x - a) < 2e-3);
  if (!hit) return null;
  return (v < -1e-9 && hit[1] !== '0' ? '-' : '') + hit[1];
}
const FN = {
  sin: (d) => Math.sin(d * Math.PI / 180),
  cos: (d) => Math.cos(d * Math.PI / 180),
  tg: (d) => (d % 180 === 90 ? Infinity : Math.tan(d * Math.PI / 180)),
  ctg: (d) => (d % 180 === 0 ? Infinity : 1 / Math.tan(d * Math.PI / 180)),
};
const FN_TEX = { sin: '\\sin', cos: '\\cos', tg: '\\tg', ctg: '\\ctg' };
const neg = (t) => (t === '0' ? null : t.startsWith('-') ? t.slice(1) : '-' + t);

const trig = {
  id: 'trig', topic: 'circle',
  make(level) {
    const pool = level <= 1 ? ANGLES.slice(0, 5) : ANGLES;
    const fns = level <= 1 ? ['sin', 'cos', 'tg'] : ['sin', 'cos', 'tg', 'ctg'];
    const [at, deg] = R.pick(pool);
    const fn = R.pick(fns);
    const t = valTex(FN[fn](deg));
    const correct = t === null ? UNDEF : m(t);
    const base = fn === 'sin' || fn === 'cos'
      ? ['0', '\\frac{1}{2}', '\\frac{\\sqrt{2}}{2}', '\\frac{\\sqrt{3}}{2}', '1']
      : ['0', '\\frac{\\sqrt{3}}{3}', '1', '\\sqrt{3}'];
    const signed = base.flatMap((b) => (b === '0' ? [b] : [b, '-' + b]));
    const pool2 = [];
    if (t && neg(t)) pool2.push(m(neg(t)));
    shuffle(signed).forEach((s) => pool2.push(m(s)));
    if (fn === 'tg' || fn === 'ctg') pool2.splice(1, 0, UNDEF);
    const quarter = deg % 90 === 0 ? 'лежит на оси' : 'в ' + ['I', 'II', 'III', 'IV'][Math.floor(deg / 90)] + ' четверти';
    let e = 'Угол $' + at + '$ ' + quarter + '. Точка на окружности — $(\\cos\\alpha;\\ \\sin\\alpha)$.';
    if (t === null) e += ' Здесь знаменатель равен нулю, поэтому значение не определено.';
    return { topic: 'circle', kind: 'trig:' + fn, q: '$' + FN_TEX[fn] + at.replace(/^0$/, ' 0') + '$', a: correct, opts: options(correct, pool2), e };
  },
};

/* ---------- производные ---------- */
const DERIV_TABLE = [
  ['\\sin x', '\\cos x', ['-\\cos x', '-\\sin x', '\\frac{1}{\\cos^2 x}']],
  ['\\cos x', '-\\sin x', ['\\sin x', '-\\cos x', '\\cos x']],
  ['\\tg x', '\\frac{1}{\\cos^2 x}', ['-\\frac{1}{\\sin^2 x}', '\\frac{1}{\\sin^2 x}', '\\ctg x']],
  ['\\ctg x', '-\\frac{1}{\\sin^2 x}', ['\\frac{1}{\\sin^2 x}', '-\\frac{1}{\\cos^2 x}', '-\\tg x']],
  ['\\arcsin x', '\\frac{1}{\\sqrt{1-x^2}}', ['-\\frac{1}{\\sqrt{1-x^2}}', '\\frac{1}{1+x^2}', '\\frac{1}{\\sqrt{1+x^2}}']],
  ['\\arccos x', '-\\frac{1}{\\sqrt{1-x^2}}', ['\\frac{1}{\\sqrt{1-x^2}}', '-\\frac{1}{1+x^2}', '-\\frac{1}{\\sqrt{x^2-1}}']],
  ['\\arctg x', '\\frac{1}{1+x^2}', ['-\\frac{1}{1+x^2}', '\\frac{1}{\\sqrt{1-x^2}}', '\\frac{1}{1-x^2}']],
  ['\\arcctg x', '-\\frac{1}{1+x^2}', ['\\frac{1}{1+x^2}', '-\\frac{1}{\\sqrt{1-x^2}}', '-\\frac{1}{1-x^2}']],
  ['e^x', 'e^x', ['xe^{x-1}', 'e^x\\ln x', '\\frac{e^x}{x}']],
  ['\\ln x', '\\frac{1}{x}', ['\\frac{1}{x\\ln x}', '-\\frac{1}{x^2}', '\\frac{\\ln x}{x}']],
  ['\\sqrt{x}', '\\frac{1}{2\\sqrt{x}}', ['\\frac{1}{\\sqrt{x}}', '2\\sqrt{x}', '\\frac{\\sqrt{x}}{2}']],
  ['\\frac{1}{x}', '-\\frac{1}{x^2}', ['\\frac{1}{x^2}', '\\ln x', '-\\frac{1}{x}']],
  ['2^x', '2^x\\ln 2', ['x\\cdot 2^{x-1}', '\\frac{2^x}{\\ln 2}', '2^x']],
  ['\\log_2 x', '\\frac{1}{x\\ln 2}', ['\\frac{\\ln 2}{x}', '\\frac{1}{2x}', '\\frac{2}{x}']],
  ['\\sh x', '\\ch x', ['-\\ch x', '\\sh x', '\\frac{1}{\\ch^2 x}']],
  ['\\ch x', '\\sh x', ['-\\sh x', '\\ch x', '-\\ch x']],
];

function derivParam(level) {
  const k = R.int(2, level >= 3 ? 9 : 5);
  const kind = R.pick(['pow', 'exp', 'sin', 'cos', 'ln']);
  if (kind === 'pow') {
    const n = R.int(2, 9);
    return {
      kind: 'pow', f: powTex('x', n), a: n + powTex('x', n - 1),
      w: [powTex('x', n - 1), n + powTex('x', n), '\\frac{' + powTex('x', n + 1) + '}{' + (n + 1) + '}', (n - 1) + powTex('x', n - 1)],
      e: '$(x^\\alpha)\'=\\alpha x^{\\alpha-1}$: показатель выносится и уменьшается на единицу.',
    };
  }
  if (kind === 'exp') return {
    kind, f: 'e^{' + kx(k) + '}', a: k + 'e^{' + kx(k) + '}',
    w: ['e^{' + kx(k) + '}', '\\frac{e^{' + kx(k) + '}}{' + k + '}', k + 'x\\,e^{' + kx(k) + '-1}'],
    e: 'Цепочка: $(e^{u})\'=e^{u}\\cdot u\'$, а $(' + kx(k) + ')\'=' + k + '$.',
  };
  if (kind === 'sin') return {
    kind, f: '\\sin ' + kx(k), a: k + '\\cos ' + kx(k),
    w: ['\\cos ' + kx(k), '-' + k + '\\cos ' + kx(k), k + '\\cos x'],
    e: 'Цепочка: $(\\sin u)\'=\\cos u\\cdot u\'$, множитель $' + k + '$ выходит вперёд.',
  };
  if (kind === 'cos') return {
    kind, f: '\\cos ' + kx(k), a: '-' + k + '\\sin ' + kx(k),
    w: [k + '\\sin ' + kx(k), '-\\sin ' + kx(k), '-' + k + '\\cos ' + kx(k)],
    e: '$(\\cos u)\'=-\\sin u\\cdot u\'$: не забудьте и минус, и множитель $' + k + '$.',
  };
  return {
    kind: 'ln', f: '\\ln ' + kx(k), a: '\\frac{1}{x}',
    w: ['\\frac{' + k + '}{x}', '\\frac{1}{' + k + 'x}', '\\ln ' + k],
    e: '$\\ln ' + kx(k) + '=\\ln ' + k + '+\\ln x$, а производная константы равна нулю. Поэтому ответ $\\frac{1}{x}$ при любом $k$.',
  };
}

const deriv = {
  id: 'deriv', topic: 'deriv',
  make(level) {
    if (level >= 2 && R.chance(0.55)) {
      const d = derivParam(level);
      return { topic: 'deriv', kind: 'deriv:chain-' + d.kind, q: 'Найдите $(' + d.f + ')\'$', a: m(d.a), opts: options(m(d.a), d.w.map(m)), e: d.e };
    }
    const [f, a, w] = R.pick(DERIV_TABLE);
    if (R.chance(0.25)) {
      return { topic: 'deriv', kind: 'deriv:reverse', q: 'Производная какой функции равна $' + a + '$?', a: m(f),
        opts: options(m(f), shuffle(DERIV_TABLE.filter((r) => r[0] !== f)).map((r) => m(r[0]))),
        e: 'Табличная производная: $(' + f + ')\'=' + a + '$.' };
    }
    return { topic: 'deriv', kind: 'deriv:table', q: 'Найдите $(' + f + ')\'$', a: m(a), opts: options(m(a), w.map(m)), e: 'Табличная производная: $(' + f + ')\'=' + a + '$.' };
  },
};

/* ---------- пределы: дробь из многочленов ---------- */
function termN(c, k, v = 'n') { return { c, body: powTex(v, k) }; }
const ratLim = {
  id: 'ratlim', topic: 'lim',
  make(level) {
    const maxDeg = level >= 2 ? 3 : 2;
    const k = R.int(1, maxDeg), mDeg = R.int(1, maxDeg);
    const a = R.int(1, 9), c = R.int(1, 9);
    const b = R.nz(-9, 9), d = R.nz(-9, 9);
    const num = polyTexSimple([termN(a, k), { c: b, body: '' }]);
    const den = polyTexSimple([termN(c, mDeg), { c: d, body: '' }]);
    let correct, e;
    if (k === mDeg) { correct = m(fracTex(a, c)); e = 'Степени равны, предел — отношение старших коэффициентов: $' + fracTex(a, c) + '$.'; }
    else if (k < mDeg) { correct = m('0'); e = 'Степень знаменателя больше, дробь стремится к нулю.'; }
    else { correct = m('+\\infty'); e = 'Степень числителя больше, дробь неограниченно растёт.'; }
    const pool = [m('0'), m('+\\infty'), m(fracTex(a, c)), m(fracTex(c, a)), m('1'), m(fracTex(b, d))];
    return { topic: 'lim', kind: 'ratlim:' + (k === mDeg ? 'equal' : k < mDeg ? 'less' : 'more'), q: '$\\lim_{n\\to\\infty}\\frac{' + num + '}{' + den + '}$', a: correct, opts: options(correct, pool), e };
  },
};
function polyTexSimple(terms) {
  let out = '';
  terms.forEach(({ c, body }) => {
    if (c === 0) return;
    const a = Math.abs(c);
    const piece = body ? (a === 1 ? '' : a) + body : String(a);
    out += out ? (c < 0 ? '-' : '+') + piece : (c < 0 ? '-' : '') + piece;
  });
  return out;
}

/* ---------- базовые устные пределы ---------- */
const BASIC_LIMITS = [
  ['\\lim_{x\\to+\\infty}\\arctg x', '\\frac{\\pi}{2}', ['+\\infty', '\\pi', '0'], 'Арктангенс ограничен, асимптота $y=\\frac{\\pi}{2}$.'],
  ['\\lim_{x\\to-\\infty}\\arctg x', '-\\frac{\\pi}{2}', ['-\\infty', '\\frac{\\pi}{2}', '0'], 'Нижняя асимптота арктангенса — $y=-\\frac{\\pi}{2}$.'],
  ['\\lim_{x\\to0^+}\\ln x', '-\\infty', ['0', '1', '+\\infty'], 'Ось $Oy$ — вертикальная асимптота логарифма.'],
  ['\\lim_{n\\to\\infty}\\sqrt[n]{n}', '1', ['+\\infty', '0', 'e'], '$\\sqrt[n]{n}=e^{\\ln n/n}$, а $\\frac{\\ln n}{n}\\to0$.'],
  ['\\lim_{x\\to0^+}\\frac{1}{x}', '+\\infty', ['-\\infty', '0', '1'], 'Единица делится на маленькое положительное число.'],
  ['\\lim_{x\\to0^-}\\frac{1}{x}', '-\\infty', ['+\\infty', '0', '-1'], 'При $x<0$ дробь отрицательна и растёт по модулю.'],
  ['\\lim_{x\\to+\\infty}e^{-x}', '0', ['1', '+\\infty', '-\\infty'], '$e^{-x}=\\frac{1}{e^x}\\to0$.'],
  ['\\lim_{n\\to\\infty}\\frac{\\sin n}{n}', '0', ['1', '\\infty', '-1'], 'Ограниченная величина делится на бесконечно большую.'],
  ['\\lim_{x\\to0}x\\sin\\frac{1}{x}', '0', ['1', '\\infty', '-1'], 'Бесконечно малая, умноженная на ограниченную, — бесконечно малая.'],
  ['\\lim_{x\\to0^-}e^{1/x}', '0', ['+\\infty', '1', 'e'], '$\\frac{1}{x}\\to-\\infty$, а $e^{t}\\to0$ при $t\\to-\\infty$.'],
  ['\\lim_{x\\to0^+}x^x', '1', ['0', '+\\infty', 'e'], '$x^x=e^{x\\ln x}$, а $x\\ln x\\to0$.'],
  ['\\lim_{n\\to\\infty}\\left(\\sqrt{n+1}-\\sqrt{n}\\right)', '0', ['1', '\\frac{1}{2}', '+\\infty'], 'Домножьте на сопряжённое: $\\frac{1}{\\sqrt{n+1}+\\sqrt n}\\to0$.'],
];
const basicLim = {
  id: 'basiclim', topic: 'lim',
  make(level) {
    if (R.chance(0.35)) {
      const kind = R.pick(['q', 'root']);
      if (kind === 'root') {
        const a = R.int(2, 99);
        return { topic: 'lim', kind: 'basiclim:root', q: '$\\lim_{n\\to\\infty}\\sqrt[n]{' + a + '}$', a: m('1'), opts: options(m('1'), [m(String(a)), m('0'), m('+\\infty')]), e: '$\\sqrt[n]{' + a + '}=' + a + '^{1/n}$, показатель стремится к нулю.' };
      }
      const p = R.int(1, 9), q = R.int(1, 9);
      const base = fracTex(p, q);
      const correct = p < q ? m('0') : p > q ? m('+\\infty') : m('1');
      return { topic: 'lim', kind: 'basiclim:q', q: '$\\lim_{n\\to\\infty}\\left(' + base + '\\right)^n$', a: correct, opts: options(correct, [m('0'), m('1'), m('+\\infty'), m(base)]), e: '$q^n\\to0$ при $|q|<1$, $q^n\\to+\\infty$ при $q>1$, а $1^n=1$.' };
    }
    const [q, a, w, e] = R.pick(BASIC_LIMITS);
    return { topic: 'lim', kind: 'basiclim:table', q: '$' + q + '$', a: m(a), opts: options(m(a), w.map(m)), e };
  },
};

/* ---------- замечательные пределы ---------- */
const remark = {
  id: 'remark', topic: 'rem',
  make(level) {
    const a = R.int(1, level >= 2 ? 9 : 5), b = R.int(1, level >= 2 ? 9 : 5);
    const kind = R.pick(level <= 1 ? ['sin', 'ln', 'exp', 'second'] : ['sin', 'tgsin', 'ln', 'exp', 'cos', 'second', 'secondneg']);
    const ab = fracTex(a, b), ba = fracTex(b, a);
    const fracPool = [m(ba), m('1'), m(String(a * b)), m('0'), m(fracTex(a + 1, b))];
    if (kind === 'sin') return { topic: 'rem', kind: 'remark:' + kind, q: '$\\lim_{x\\to0}\\frac{\\sin ' + kx(a) + '}{' + kx(b) + '}$', a: m(ab), opts: options(m(ab), fracPool), e: '$\\sin ' + kx(a) + '\\sim ' + kx(a) + '$, поэтому ответ $\\frac{' + a + '}{' + b + '}=' + ab + '$.' };
    if (kind === 'tgsin') return { topic: 'rem', kind: 'remark:' + kind, q: '$\\lim_{x\\to0}\\frac{\\tg ' + kx(a) + '}{\\sin ' + kx(b) + '}$', a: m(ab), opts: options(m(ab), fracPool), e: '$\\tg ' + kx(a) + '\\sim ' + kx(a) + '$ и $\\sin ' + kx(b) + '\\sim ' + kx(b) + '$.' };
    if (kind === 'ln') return { topic: 'rem', kind: 'remark:' + kind, q: '$\\lim_{x\\to0}\\frac{\\ln(1+' + kx(a) + ')}{' + kx(b) + '}$', a: m(ab), opts: options(m(ab), fracPool), e: '$\\ln(1+u)\\sim u$ при $u\\to0$.' };
    if (kind === 'exp') return { topic: 'rem', kind: 'remark:' + kind, q: '$\\lim_{x\\to0}\\frac{e^{' + kx(a) + '}-1}{' + kx(b) + '}$', a: m(ab), opts: options(m(ab), fracPool), e: '$e^{u}-1\\sim u$ при $u\\to0$.' };
    if (kind === 'cos') {
      const ans = fracTex(a * a, 2);
      return { topic: 'rem', kind: 'remark:' + kind, q: '$\\lim_{x\\to0}\\frac{1-\\cos ' + kx(a) + '}{x^2}$', a: m(ans), opts: options(m(ans), [m(fracTex(a, 2)), m(String(a * a)), m('\\frac{1}{2}'), m('0')]), e: '$1-\\cos u\\sim\\frac{u^2}{2}$, здесь $u=' + kx(a) + '$.' };
    }
    if (kind === 'second') {
      const ans = expTex(a * b);
      const base = a === 1 ? '\\frac{1}{n}' : '\\frac{' + a + '}{n}';
      return { topic: 'rem', kind: 'remark:' + kind, q: '$\\lim_{n\\to\\infty}\\left(1+' + base + '\\right)^{' + kx(b, 'n') + '}$', a: m(ans), opts: options(m(ans), [m(expTex(a + b)), m(expTex(a, b)), m('1'), m(expTex(a)), m('+\\infty')]), e: '$\\left(1+\\frac{a}{n}\\right)^{bn}\\to e^{ab}$.' };
    }
    const ans = expTex(-a);
    return { topic: 'rem', kind: 'remark:' + kind, q: '$\\lim_{n\\to\\infty}\\left(1-' + (a === 1 ? '\\frac{1}{n}' : '\\frac{' + a + '}{n}') + '\\right)^{n}$', a: m(ans), opts: options(m(ans), [m(expTex(a)), m('1'), m('0'), m('-' + expTex(a))]), e: 'Здесь $a=-' + a + '$, поэтому получаем $e^{-' + a + '}$.' };
  },
};

/* ---------- скорость роста ---------- */
const GROWTH = [
  ['\\ln n', 1], ['\\log_2 n', 1], ['\\ln^2 n', 1.5], ['\\sqrt{n}', 2], ['n', 3], ['n\\ln n', 3.5],
  ['n^2', 4], ['n^{10}', 5], ['n^{100}', 5.5], ['1{,}01^n', 6], ['2^n', 7], ['e^n', 7.5],
  ['3^n', 8], ['10^n', 8.5], ['n!', 9], ['n^n', 10],
];
const SAME = 'Одного порядка';
const growth = {
  id: 'growth', topic: 'growth',
  make(level) {
    let A, B;
    do { A = R.pick(GROWTH); B = R.pick(GROWTH); } while (A === B || (level <= 1 && Math.abs(A[1] - B[1]) < 1));
    const e = 'Шкала роста: логарифм $\\ll$ степень $\\ll$ показательная $\\ll$ $n!$ $\\ll$ $n^n$. Основание логарифма на порядок не влияет.';
    if (A[1] !== B[1] && R.chance(0.4)) {
      const ans = A[1] < B[1] ? m('0') : m('+\\infty');
      return { topic: 'growth', kind: 'growth:limit', q: '$\\lim_{n\\to\\infty}\\frac{' + A[0] + '}{' + B[0] + '}$', a: ans, opts: options(ans, [m('0'), m('+\\infty'), m('1')]), e };
    }
    const correct = A[1] === B[1] ? SAME : m(A[1] > B[1] ? A[0] : B[0]);
    return {
      topic: 'growth', kind: 'growth:compare', q: 'Что растёт быстрее при $n\\to\\infty$: $' + A[0] + '$ или $' + B[0] + '$?',
      a: correct, opts: options(correct, [m(A[0]), m(B[0]), SAME], 3), e,
    };
  },
};

export const ORAL = [trig, deriv, ratLim, basicLim, remark, growth];
