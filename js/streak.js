// Логика серии. Без DOM: только состояние, дни и события.
// День считается по Москве: новый начинается в 00:00 МСК.
// Заморозка закрывает день без решения: серия не растёт, но и не сгорает. 2 штуки на календарный месяц.
import { CONFIG } from './config.js';
import { load, save } from './storage.js';

const KEY = 'streak_v1';
const DAY = 86400000;
const OFFSET = CONFIG.MSK_OFFSET_HOURS * 3600000;
export const GOAL = CONFIG.STREAK_GOAL;
export const FREEZES = CONFIG.FREEZES_PER_MONTH;

export const STAGES = [
  { from: 1, key: 'bang', name: 'Восклицательный знак' },
  { from: 5, key: 'fire', name: 'Огонёк' },
  { from: 30, key: 'tri', name: 'Три языка пламени' },
  { from: 60, key: 'dark', name: 'Тёмное пламя' },
  { from: 100, key: 'crown', name: 'Тёмная корона' },
];
// 0 — не начата, 1 — знак, 2 — огонёк, 3 — три языка, 4 — тёмное, 5 — корона
export function stageOf(s) {
  let st = 0;
  STAGES.forEach((x, i) => { if (s >= x.from) st = i + 1; });
  return st;
}

/* ---------- время ---------- */
let debugShift = load('debug_shift', 0);
export const now = () => Date.now() + debugShift;
export function shiftDays(n) { debugShift += n * DAY; save('debug_shift', debugShift); }
export function dayKey(t = now()) { return new Date(t + OFFSET).toISOString().slice(0, 10); }
export function addDays(key, n) {
  const d = new Date(key + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const prevDay = (key) => addDays(key, -1);
export function daysBetween(a, b) { return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / DAY); }
export function msToReset(t = now()) { return DAY - ((t + OFFSET) % DAY); }
export const monthKey = (day = dayKey()) => day.slice(0, 7);

/* ---------- состояние ---------- */
const DEF = { streak: 0, best: 0, lastDone: null, lastCovered: null, day: null, count: 0, frozen: [], freeze: { month: null, used: 0 }, pending: null, updated: 0 };
let st = normalize(load(KEY, {}));
function normalize(s) {
  const out = { ...DEF, ...(s || {}) };
  if (!out.lastCovered && out.lastDone) out.lastCovered = out.lastDone;
  if (!Array.isArray(out.frozen)) out.frozen = [];
  if (!out.freeze) out.freeze = { month: null, used: 0 };
  return out;
}

const listeners = new Set();
export function onStreak(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(ev) { const s = get(); listeners.forEach((fn) => fn(ev, s)); }
let changeHook = () => {};
export function onChange(fn) { changeHook = fn; }
function persist() { st.updated = Date.now(); save(KEY, st); changeHook(); }

export function freezesLeft(day = dayKey()) {
  return st.freeze.month === monthKey(day) ? Math.max(0, FREEZES - st.freeze.used) : FREEZES;
}
function useFreezes(n, day) {
  const m = monthKey(day);
  if (st.freeze.month !== m) st.freeze = { month: m, used: 0 };
  st.freeze.used += n;
}

export function get() {
  const today = dayKey();
  return {
    ...st, today,
    doneToday: st.lastDone === today,
    frozenToday: st.frozen.includes(today) && st.lastDone !== today,
    count: st.day === today ? st.count : 0,
    stage: stageOf(st.streak),
    freezesLeft: freezesLeft(today),
  };
}
export const getRaw = () => JSON.parse(JSON.stringify(st));
export function setRaw(s) { st = normalize(s); save(KEY, st); emit({ type: 'sync' }); }

/* ---------- смена дня ---------- */
// Вызывается при запуске, в полночь, при возврате во вкладку и после синхронизации.
export function tick() {
  const today = dayKey();
  let changed = false;
  if (st.day !== today) { st.day = today; st.count = 0; changed = true; }
  if (st.streak > 0 && st.lastCovered && st.lastCovered !== today && st.lastCovered !== prevDay(today)) {
    const missed = daysBetween(st.lastCovered, today) - 1;
    if (missed > 0 && missed <= freezesLeft(today)) {
      const already = st.pending && st.pending.day === today && st.pending.missed === missed;
      st.pending = { prev: st.streak, missed, day: today };
      if (!already) { persist(); emit({ type: 'risk', prev: st.streak, missed }); }
      return;
    }
    const prev = st.streak;
    st.streak = 0; st.pending = null;
    persist();
    emit({ type: 'loss', prev });
    return;
  }
  if (changed) { persist(); emit({ type: 'newday' }); }
}

// Ответ на вопрос «закрыть пропуск заморозкой?»
export function resolveRisk(useFreeze) {
  const p = st.pending;
  if (!p) return;
  const today = dayKey();
  st.pending = null;
  if (useFreeze && p.missed <= freezesLeft(today)) {
    for (let i = 1; i <= p.missed; i++) st.frozen.push(addDays(st.lastCovered, i));
    st.frozen = [...new Set(st.frozen)].sort().slice(-60);
    st.lastCovered = prevDay(today);
    useFreezes(p.missed, today);
    persist();
    emit({ type: 'freeze', mode: 'rescue', days: p.missed, streak: st.streak });
  } else {
    const prev = st.streak;
    st.streak = 0;
    persist();
    emit({ type: 'loss', prev });
  }
}

// Заморозить сегодняшний день заранее
export function canFreezeToday() {
  const s = get();
  if (s.streak === 0) return { ok: false, why: 'Заморозка нужна, когда есть серия. Сначала реши 5 примеров.' };
  if (s.doneToday) return { ok: false, why: 'Сегодня задание уже выполнено, замораживать не нужно.' };
  if (s.frozenToday) return { ok: false, why: 'Сегодня уже заморожено. Если всё же решишь 5 примеров, заморозка вернётся.' };
  if (s.pending) return { ok: false, why: 'Сначала реши, что делать с пропущенным днём.' };
  if (s.freezesLeft === 0) return { ok: false, why: 'Заморозки на этот месяц закончились. Новые — 1-го числа.' };
  return { ok: true };
}
export function freezeToday() {
  if (!canFreezeToday().ok) return false;
  const today = dayKey();
  st.frozen = [...new Set([...st.frozen, today])].sort().slice(-60);
  st.lastCovered = today;
  useFreezes(1, today);
  persist();
  emit({ type: 'freeze', mode: 'today', days: 1, streak: st.streak });
  return true;
}

/* ---------- верный ответ ---------- */
export function registerCorrect() {
  tick();
  const today = dayKey();
  if (st.lastDone === today) return;
  st.count = Math.min(GOAL, st.count + 1);
  if (st.count < GOAL) { persist(); emit({ type: 'progress', count: st.count }); return; }
  const prev = st.streak;
  if (st.pending) { st.pending = null; st.streak = 0; }
  // Сегодня было заморожено, но задание выполнено — заморозка возвращается
  if (st.frozen.includes(today)) {
    st.frozen = st.frozen.filter((d) => d !== today);
    if (st.freeze.month === monthKey(today) && st.freeze.used > 0) st.freeze.used--;
    st.lastCovered = prevDay(today);
  }
  st.streak = st.streak > 0 && st.lastCovered === prevDay(today) ? st.streak + 1 : 1;
  st.lastDone = today;
  st.lastCovered = today;
  st.best = Math.max(st.best, st.streak);
  persist();
  emit({ type: 'extend', prev: st.streak === 1 ? 0 : prev, streak: st.streak, stageFrom: stageOf(st.streak === 1 ? 0 : prev), stageTo: stageOf(st.streak) });
}

export function debugSet(patch) { st = normalize({ ...st, ...patch }); persist(); emit({ type: 'sync' }); }

let timer = null, watching = false;
export function startClock() {
  clearTimeout(timer);
  timer = setTimeout(() => { tick(); startClock(); }, Math.min(msToReset() + 1000, 2147483000));
  if (!watching) {
    watching = true;
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  }
}
