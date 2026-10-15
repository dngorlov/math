// Разбор ответа, введённого вручную: 3/2, -1.5, sqrt(3)/2, 2pi, e^-2, 1/sqrt(e), inf, ∞.
// Без eval: свой маленький парсер. Возвращает число и TeX для предпросмотра.

const NAMES = ['sqrt', 'inf', 'exp', 'tan', 'sin', 'cos', 'ln', 'lg', 'tg', 'pi', 'e'];
const FUNCS = { sqrt: Math.sqrt, ln: Math.log, lg: Math.log10, exp: Math.exp, sin: Math.sin, cos: Math.cos, tg: Math.tan, tan: Math.tan };
const CONSTS = { pi: Math.PI, e: Math.E, inf: Infinity };

export function normalize(s) {
  return String(s).toLowerCase()
    .replace(/бесконечност[ьи]|беск/g, 'inf').replace(/∞/g, 'inf')
    .replace(/π|пи/g, 'pi').replace(/√/g, 'sqrt').replace(/корень/g, 'sqrt')
    .replace(/е/g, 'e')
    .replace(/[−–—]/g, '-').replace(/[×·∙]/g, '*').replace(/[÷:]/g, '/')
    .replace(/,/g, '.').replace(/\*\*/g, '^').replace(/\s+/g, '');
}

function tokenize(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/[0-9.]/.test(ch)) {
      const mm = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
      if (!mm) throw new Error('Не понял число');
      out.push({ t: 'num', v: parseFloat(mm[1]), raw: mm[1] });
      i += mm[1].length;
    } else if (/[a-z]/.test(ch)) {
      const name = NAMES.find((n) => s.startsWith(n, i));
      if (!name) throw new Error('Неизвестное обозначение: «' + s.slice(i).match(/^[a-z]+/)[0] + '»');
      out.push({ t: FUNCS[name] ? 'fn' : 'const', v: name });
      i += name.length;
    } else if ('+-*/^()'.includes(ch)) {
      out.push({ t: 'op', v: ch });
      i++;
    } else {
      throw new Error('Лишний символ: «' + ch + '»');
    }
  }
  return out;
}

function parser(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;
  const startsPrimary = () => peek() && (peek().t === 'num' || peek().t === 'const' || peek().t === 'fn' || isOp('('));

  function expr() {
    let node = term();
    while (isOp('+') || isOp('-')) {
      const op = tokens[p++].v;
      node = { k: 'bin', op, l: node, r: term() };
    }
    return node;
  }
  function term() {
    let node = unary();
    for (;;) {
      if (isOp('*') || isOp('/')) {
        const op = tokens[p++].v;
        node = { k: 'bin', op, l: node, r: unary() };
      } else if (startsPrimary()) {
        node = { k: 'bin', op: '*', implicit: true, l: node, r: power() };
      } else break;
    }
    return node;
  }
  function unary() {
    if (isOp('-')) { p++; return { k: 'neg', a: unary() }; }
    if (isOp('+')) { p++; return unary(); }
    return power();
  }
  function power() {
    const base = primary();
    if (isOp('^')) { p++; return { k: 'pow', l: base, r: unary() }; }
    return base;
  }
  function primary() {
    const tk = peek();
    if (!tk) throw new Error('Ответ оборвался');
    if (tk.t === 'num') { p++; return { k: 'num', v: tk.v, raw: tk.raw }; }
    if (tk.t === 'const') { p++; return { k: 'const', v: tk.v }; }
    if (tk.t === 'fn') {
      p++;
      if (isOp('(')) { p++; const a = expr(); if (!isOp(')')) throw new Error('Не хватает закрывающей скобки'); p++; return { k: 'fn', v: tk.v, a }; }
      return { k: 'fn', v: tk.v, a: power() };
    }
    if (isOp('(')) {
      p++;
      const a = expr();
      if (!isOp(')')) throw new Error('Не хватает закрывающей скобки');
      p++;
      return { k: 'par', a };
    }
    throw new Error('Неожиданный символ «' + tk.v + '»');
  }
  const tree = expr();
  if (p < tokens.length) throw new Error('Лишний символ «' + tokens[p].v + '»');
  return tree;
}

function evaluate(n) {
  switch (n.k) {
    case 'num': return n.v;
    case 'const': return CONSTS[n.v];
    case 'par': return evaluate(n.a);
    case 'neg': return -evaluate(n.a);
    case 'fn': return FUNCS[n.v](evaluate(n.a));
    case 'pow': return Math.pow(evaluate(n.l), evaluate(n.r));
    case 'bin': {
      const a = evaluate(n.l), b = evaluate(n.r);
      if (n.op === '+') return a + b;
      if (n.op === '-') return a - b;
      if (n.op === '*') return a * b;
      return a / b;
    }
  }
  return NaN;
}

const FN_TEX = { ln: '\\ln', lg: '\\lg', exp: '\\exp', sin: '\\sin', cos: '\\cos', tg: '\\tg', tan: '\\tg' };
function toTex(n) {
  switch (n.k) {
    case 'num': return n.raw.replace('.', '{,}');
    case 'const': return n.v === 'pi' ? '\\pi' : n.v === 'inf' ? '\\infty' : 'e';
    case 'par': return '\\left(' + toTex(n.a) + '\\right)';
    case 'neg': return '-' + (n.a.k === 'bin' && (n.a.op === '+' || n.a.op === '-') ? '\\left(' + toTex(n.a) + '\\right)' : toTex(n.a));
    case 'fn': return n.v === 'sqrt' ? '\\sqrt{' + toTex(strip(n.a)) + '}' : FN_TEX[n.v] + '\\left(' + toTex(strip(n.a)) + '\\right)';
    case 'pow': return (n.l.k === 'num' || n.l.k === 'const' || n.l.k === 'par' ? toTex(n.l) : '\\left(' + toTex(n.l) + '\\right)') + '^{' + toTex(strip(n.r)) + '}';
    case 'bin':
      if (n.op === '/') return '\\frac{' + toTex(strip(n.l)) + '}{' + toTex(strip(n.r)) + '}';
      if (n.op === '*') return toTex(n.l) + (n.implicit ? '' : '\\cdot ') + toTex(n.r);
      return toTex(n.l) + n.op + toTex(n.r);
  }
  return '';
}
const strip = (n) => (n.k === 'par' ? n.a : n);

export function parseAnswer(input) {
  const s = normalize(input);
  if (!s) return { ok: false, empty: true, error: 'Введите ответ' };
  try {
    const tree = parser(tokenize(s));
    const value = evaluate(tree);
    if (Number.isNaN(value)) return { ok: false, error: 'Выражение не имеет смысла' };
    return { ok: true, value, tex: toTex(tree) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export function checkAnswer(input, expected) {
  const r = parseAnswer(input);
  if (!r.ok) return { ...r, correct: false };
  let correct;
  if (!isFinite(expected)) correct = r.value === expected;
  else if (expected === 0) correct = Math.abs(r.value) < 1e-9;
  else correct = isFinite(r.value) && Math.abs(r.value - expected) <= 1e-6 * Math.abs(expected);
  return { ...r, correct };
}
