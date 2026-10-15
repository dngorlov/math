// Обезличенная статистика ответов для преподавателя: тема, тип задачи, верно или нет.
// Копится пачкой и отправляется на сервер, только если пользователь вошёл через Telegram.
import { load, save } from './storage.js';
import { signedIn, request } from './api.js';

let queue = load('stats_queue', []);
let timer = null;

export function record(src, task, ok) {
  if (!signedIn()) return;
  queue.push({ src, topic: task.topic || 'other', kind: task.kind || 'bank', ok: !!ok });
  if (queue.length > 500) queue = queue.slice(-500);
  save('stats_queue', queue);
  clearTimeout(timer);
  timer = setTimeout(flush, queue.length >= 20 ? 0 : 10000);
}

export async function flush() {
  if (!queue.length || !signedIn()) return;
  const batch = queue.slice(0, 200);
  try {
    await request('/api/events', { method: 'POST', body: { events: batch } });
    queue = queue.slice(batch.length);
    save('stats_queue', queue);
    if (queue.length) timer = setTimeout(flush, 1000);
  } catch (e) { /* попробуем позже */ }
}

document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
