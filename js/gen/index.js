import { ORAL } from './oral.js';
import { WRITTEN } from './written.js';
import { rand, withSeed } from './util.js';

// Меняй при любом изменении генераторов: у игроков дуэли и на сервере задачи должны совпадать
export const GEN_VERSION = 4;

export const TOPICS = [
  { id: 'deriv', name: 'Производные' },
  { id: 'growth', name: 'Скорость роста' },
  { id: 'lim', name: 'Пределы' },
  { id: 'rem', name: 'Замечательные пределы' },
  { id: 'circle', name: 'Окружность' },
];

export function topicName(id) {
  const t = TOPICS.find((x) => x.id === id);
  return t ? t.name : '';
}

// Темы, для которых есть генераторы в данном режиме
export function topicsFor(mode) {
  const list = mode === 'written' ? WRITTEN : ORAL;
  return TOPICS.filter((t) => list.some((g) => g.topic === t.id));
}

const recent = [];

// Следующая задача: mode — 'oral' | 'written', level 1..4, topics — массив id
export function nextTask(mode, level, topics) {
  const list = (mode === 'written' ? WRITTEN : ORAL).filter((g) => !topics || !topics.length || topics.includes(g.topic));
  const pool = list.length ? list : (mode === 'written' ? WRITTEN : ORAL);
  let task;
  for (let i = 0; i < 12; i++) {
    const g = pool[Math.floor(rand() * pool.length)];
    task = g.make(level);
    task.gen = g.id;
    task.mode = mode;
    if (!recent.includes(task.q)) break;
  }
  recent.push(task.q);
  if (recent.length > 15) recent.shift();
  return task;
}

// Задача забега генератора по номеру: одинаковая у клиента и на сервере (сервер так проверяет ответы для рейтинга)
const mix = (seed, i) => ((seed ^ Math.imul(i + 1, 0x9E3779B1)) >>> 0) || 1;
export function taskAt(seed, i, mode, level, topics) {
  const all = mode === 'written' ? WRITTEN : ORAL;
  const list = all.filter((g) => !topics || !topics.length || topics.includes(g.topic));
  const pool = list.length ? list : all;
  return withSeed(mix(seed, i), () => {
    const g = pool[Math.floor(rand() * pool.length)];
    const t = g.make(level);
    t.gen = g.id;
    t.mode = mode;
    return t;
  });
}

// Задачи дуэли: одинаковые для обоих игроков и для сервера при одинаковом seed
export function duelTasks(seed, count = 120) {
  return withSeed(seed, () => {
    const out = [], seen = [];
    for (let i = 0; i < count; i++) {
      const level = Math.min(3, 1 + Math.floor(i / 8));
      let t;
      for (let k = 0; k < 8; k++) {
        const g = ORAL[Math.floor(rand() * ORAL.length)];
        t = g.make(level);
        t.gen = g.id;
        if (!seen.includes(t.q)) break;
      }
      seen.push(t.q);
      if (seen.length > 12) seen.shift();
      out.push(t);
    }
    return out;
  });
}

export { ORAL, WRITTEN };
