// Общие помощники для генераторов задач. Без DOM, чтобы их можно было тестировать в Node.

// Источник случайности можно подменить на детерминированный (дуэли: одинаковые задачи у обоих игроков и на сервере)
let rnd = Math.random;
export const rand = () => rnd();
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function withSeed(seed, fn) {
  const prev = rnd;
  rnd = mulberry32(seed);
  try { return fn(); } finally { rnd = prev; }
}

export const R = {
  int(a, b) { return a + Math.floor(rnd() * (b - a + 1)); },
  pick(arr) { return arr[Math.floor(rnd() * arr.length)]; },
  chance(p) { return rnd() < p; },
  nz(a, b) { let v; do { v = R.int(a, b); } while (v === 0); return v; },
  sign() { return rnd() < 0.5 ? -1 : 1; },
};

export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

export function frac(p, q) {
  if (q < 0) { p = -p; q = -q; }
  const g = gcd(p, q);
  return { p: p / g, q: q / g };
}

// p/q в TeX: «3», «-\frac{1}{2}»
export function fracTex(p, q = 1) {
  const f = frac(p, q);
  if (f.q === 1) return String(f.p);
  return (f.p < 0 ? '-' : '') + '\\frac{' + Math.abs(f.p) + '}{' + f.q + '}';
}

// e^{p/q} в TeX
export function expTex(p, q = 1) {
  const f = frac(p, q);
  if (f.p === 0) return '1';
  if (f.q === 1) return f.p === 1 ? 'e' : 'e^{' + f.p + '}';
  if (f.p === 1 && f.q === 2) return '\\sqrt{e}';
  if (f.p === -1 && f.q === 2) return '\\frac{1}{\\sqrt{e}}';
  return 'e^{' + fracTex(f.p, f.q) + '}';
}

// k·x без «1x»
export function kx(k, v = 'x') {
  if (k === 1) return v;
  if (k === -1) return '-' + v;
  return k + v;
}

export function powTex(v, n) {
  if (n === 0) return '1';
  if (n === 1) return v;
  return v + '^{' + n + '}';
}

// Многочлен из слагаемых [{c, body}] → «3x^{2} - x + 5»
export function polyTex(terms) {
  let out = '';
  terms.forEach(({ c, body }) => {
    if (c === 0) return;
    const neg = c < 0, a = Math.abs(c);
    const coef = body ? (a === 1 ? '' : String(a)) : String(a);
    const piece = coef + (body || '');
    if (!out) out = (neg ? '-' : '') + piece;
    else out += (neg ? ' - ' : ' + ') + piece;
  });
  return out || '0';
}

// Обёртка TeX в $…$ для вариантов ответа
export const m = (t) => '$' + t + '$';

// Варианты ответа: правильный + уникальные отвлекающие, перемешанные
export function options(correct, pool, n = 4) {
  const out = [correct];
  for (const c of pool) {
    if (out.length >= n) break;
    if (c != null && !out.includes(c)) out.push(c);
  }
  return shuffle(out);
}

// Десятичная дробь с запятой для TeX: 1.01 → 1{,}01
export const dec = (x) => String(x).replace('.', '{,}');
