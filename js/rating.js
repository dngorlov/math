// Рейтинг: общий с Telegram Mini App. Сервер — Cloudflare Worker (папка worker/).
// Сортировка только по лучшему счёту в генераторе; серия показывается рядом.
import { CONFIG } from './config.js';
import { esc } from './math.js';
import { apiEnabled, signedIn, request, me } from './api.js';
import { daysWord } from './streak-ui.js';

export const ratingEnabled = apiEnabled;
export const canSubmit = signedIn;

export async function fetchTop(limit = 100) {
  const r = await fetch(CONFIG.API_BASE.replace(/\/$/, '') + '/api/top?limit=' + limit);
  if (!r.ok) throw new Error('Сервер ответил ' + r.status);
  return r.json();
}

function avatar(u) {
  const initials = esc((u.name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase());
  if (u.photo_url) return '<img class="ava" src="' + esc(u.photo_url) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{className:\'ava ava-i\',textContent:\'' + initials + '\'}))">';
  return '<span class="ava ava-i">' + initials + '</span>';
}

export async function renderRating(root) {
  const self = me();
  let h = '<div class="page-head"><h1>Рейтинг</h1><p class="lead">Сортировка по лучшему счёту в генераторе. Рядом — текущая серия дней.</p></div>';
  if (!ratingEnabled()) {
    root.innerHTML = h + '<div class="empty"><h2>Рейтинг ещё не подключён</h2><p>Нужен сервер на Cloudflare: код лежит в папке <code>worker/</code>, инструкция — в <code>worker/README.md</code>. После запуска впиши адрес в <code>js/config.js</code> → <code>API_BASE</code>.</p></div>';
    return;
  }
  if (!self) h += '<p class="note-line">Чтобы попасть в рейтинг, войди через Telegram (значок профиля справа вверху) или открой тренажёр в боте.</p>';
  root.innerHTML = h + '<div class="rating" aria-busy="true"><p class="muted">Загружаю…</p></div><button class="btn ghost" data-act="rating-refresh">Обновить</button>';
  const box = root.querySelector('.rating');
  try {
    const data = await fetchTop(100);
    const rows = data.top || [];
    if (!rows.length) { box.innerHTML = '<div class="empty"><h2>Пока пусто</h2><p>Сыграй в генератор — и стань первым.</p></div>'; return; }
    box.innerHTML = '<ol class="lb">' + rows.map((u, i) =>
      '<li class="lb-row' + (self && String(self.id) === String(u.id) ? ' me' : '') + '">' +
        '<span class="lb-rank">' + (i + 1) + '</span>' + avatar(u) +
        '<span class="lb-name">' + esc(u.name || 'Без имени') + (u.username ? '<small>@' + esc(u.username) + '</small>' : '') + '</span>' +
        '<span class="lb-streak" title="Серия">' + (u.streak > 0 ? daysWord(u.streak) : '—') + '</span>' +
        '<span class="lb-score">' + Number(u.best_score || 0).toLocaleString('ru-RU') + '</span>' +
      '</li>').join('') + '</ol>';
  } catch (e) {
    box.innerHTML = '<div class="empty"><h2>Не удалось загрузить рейтинг</h2><p>' + esc(e.message) + '. Проверь интернет и нажми «Обновить».</p></div>';
  } finally {
    box.removeAttribute('aria-busy');
  }
}
