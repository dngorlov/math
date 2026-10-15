// Проверка контента: все формулы банка и генераторов должны рендериться KaTeX без ошибок.
// Запуск: npm i katex && node tools/check.mjs
import fs from 'node:fs';
import katex from 'katex';
import { ORAL, WRITTEN, duelTasks } from '../js/gen/index.js';
import { checkAnswer } from '../js/answer.js';

const MACROS = { '\\tg': '\\operatorname{tg}', '\\ctg': '\\operatorname{ctg}', '\\arctg': '\\operatorname{arctg}', '\\arcctg': '\\operatorname{arcctg}', '\\sh': '\\operatorname{sh}', '\\ch': '\\operatorname{ch}', '\\th': '\\operatorname{th}', '\\cth': '\\operatorname{cth}' };
let errors = 0;
const fail = (msg) => { errors++; console.log('✗', msg); };
function checkRich(s, ctx) {
  const parts = String(s).split('$');
  if (parts.length % 2 === 0) return fail(ctx + ': нечётное число $ в «' + s + '»');
  parts.forEach((p, i) => {
    if (i % 2) {
      try { katex.renderToString('\\displaystyle ' + p, { throwOnError: true, strict: 'ignore', macros: { ...MACROS } }); }
      catch (e) { fail(ctx + ': ' + e.message + ' в «' + p + '»'); }
    }
  });
}

// 1. Банк вопросов
const bank = fs.readFileSync(new URL('../data/bank.txt', import.meta.url), 'utf8');
let cur = null, n = 0;
for (const raw of bank.split('\n')) {
  const line = raw.trim();
  if (!line || line.startsWith('# ')) continue;
  const k = line.slice(0, 2), v = line.slice(2).trim();
  if (k === 'Q:') { cur = { q: v, w: [] }; n++; }
  else if (k === 'A:') cur.a = v;
  else if (k === 'W:') cur.w = v.split(';;').map((x) => x.trim());
  else if (k === 'E:') cur.e = v;
  else { fail('банк: непонятная строка «' + line + '»'); continue; }
  [v].concat(k === 'W:' ? cur.w : []).forEach((s) => checkRich(s, 'банк #' + n));
}
console.log('Банк: вопросов', n);

// 2. Генераторы
for (const [list, mode] of [[ORAL, 'oral'], [WRITTEN, 'written']]) {
  for (const g of list) {
    for (let lvl = 1; lvl <= 4; lvl++) {
      for (let i = 0; i < 60; i++) {
        const t = g.make(lvl);
        const ctx = mode + '/' + g.id + '/L' + lvl;
        checkRich(t.q, ctx); checkRich(t.e, ctx);
        if (mode === 'oral') {
          if (!t.opts.includes(t.a)) fail(ctx + ': правильного ответа нет среди вариантов');
          if (new Set(t.opts).size !== t.opts.length) fail(ctx + ': повторы в вариантах');
          if (t.opts.length < 3) fail(ctx + ': мало вариантов');
          t.opts.forEach((o) => checkRich(o, ctx));
        } else {
          checkRich('$' + t.a + '$', ctx);
          if (!Number.isFinite(t.value) && Math.abs(t.value) !== Infinity) fail(ctx + ': ответ не число');
        }
      }
    }
  }
}
console.log('Генераторы проверены');

// Дуэли: при одинаковом seed задачи должны совпадать (у игроков и на сервере)
for (const seed of [1, 42, 123456789]) {
  if (JSON.stringify(duelTasks(seed, 60)) !== JSON.stringify(duelTasks(seed, 60))) fail('дуэль: задачи для seed ' + seed + ' не совпадают — где-то используется Math.random');
}
if (!duelTasks(7, 60).every((t) => t.kind)) fail('дуэль: у задачи нет kind');

// 3. Разбор ответов
const cases = [['3/2', 1.5], ['1,5', 1.5], ['sqrt(3)/2', Math.sqrt(3) / 2], ['√3/2', Math.sqrt(3) / 2], ['e^2', Math.exp(2)],
  ['e^-1', Math.exp(-1)], ['1/sqrt(e)', 1 / Math.sqrt(Math.E)], ['2pi', 2 * Math.PI], ['-inf', -Infinity], ['∞', Infinity],
  ['−3/4', -0.75], ['2(3+1)', 8], ['е^3', Math.exp(3)], ['пи/2', Math.PI / 2]];
for (const [inp, val] of cases) { const r = checkAnswer(inp, val); if (!r.correct) fail('ответ «' + inp + '» не распознан: ' + (r.error || r.value)); }
if (checkAnswer('2/3', 1.5).correct) fail('2/3 засчитан как 1.5');
console.log(errors ? 'Ошибок: ' + errors : 'Всё чисто');
process.exit(errors ? 1 : 0);
