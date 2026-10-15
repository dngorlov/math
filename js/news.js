// Объявления: «Что нового» при входе, баннер текущей цели (КР, экзамен…) с обратным отсчётом.
import { CONFIG } from './config.js';
import { esc } from './math.js';
import { apiEnabled } from './api.js';
import { load, save } from './storage.js';

let data = { posts: [], goal: null, today: null };
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const dateWords = (d) => Number(d.slice(8, 10)) + ' ' + MONTHS[Number(d.slice(5, 7)) - 1];
const todayMSK = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
function daysLeft(d) { return Math.round((new Date(d + 'T00:00:00Z') - new Date(todayMSK() + 'T00:00:00Z')) / 86400000); }
function leftText(d) {
  const n = daysLeft(d);
  if (n <= 0) return 'сегодня';
  if (n === 1) return 'завтра';
  const m10 = n % 10, m100 = n % 100;
  return 'через ' + n + ' ' + (m10 === 1 && m100 !== 11 ? 'день' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'дня' : 'дней');
}
const fmt = (t) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
const paragraphs = (s) => esc(s).split(/\n{2,}/).map((p) => '<p>' + p.replace(/\n/g, '<br>') + '</p>').join('');

function renderBanner() {
  const box = document.getElementById('goal-banner');
  if (!box) return;
  const g = data.goal;
  if (!g || daysLeft(g.goal_date) < 0) { box.hidden = true; return; }
  box.innerHTML = '<button class="goal" data-news="goal"><span class="goal-dot" aria-hidden="true"></span><span class="goal-txt"><b>' + esc(g.title) + '</b> — ' + leftText(g.goal_date) +
    ' <span class="muted">(' + dateWords(g.goal_date) + ')</span></span></button>';
  box.hidden = false;
}

function postHtml(p, isNew) {
  return '<article class="post' + (isNew ? ' new' : '') + '"><div class="post-meta">' +
    (p.kind === 'goal' ? '<span class="tag goal-tag">Цель</span>' : '<span class="tag">Обновление</span>') +
    (isNew ? '<span class="tag new-tag">Новое</span>' : '') + '<span class="muted small">' + fmt(p.created_at) + '</span></div>' +
    '<h3>' + esc(p.title) + '</h3>' +
    (p.kind === 'goal' && p.goal_date ? '<p class="post-goal">' + dateWords(p.goal_date) + ' — ' + leftText(p.goal_date) + '</p>' : '') +
    (p.body ? paragraphs(p.body) : '') + '</article>';
}

// Открыть ленту: onlyNew — только непрочитанные (при входе), иначе всё
export function openNews(onlyNew = false) {
  const seen = load('news_seen', 0);
  const list = onlyNew ? data.posts.filter((p) => p.id > seen) : data.posts;
  const body = document.getElementById('news-body');
  body.innerHTML = list.length ? list.map((p) => postHtml(p, p.id > seen)).join('') : '<p class="muted">Пока объявлений нет.</p>';
  document.getElementById('news-title').textContent = onlyNew ? 'Что нового' : 'Новости и обновления';
  const bd = document.getElementById('news');
  bd.hidden = false;
  bd.querySelector('.sheet').scrollTop = 0;
  requestAnimationFrame(() => bd.classList.add('show'));
  if (data.posts.length) save('news_seen', Math.max(seen, data.posts[0].id));
}
export function closeNews() {
  const bd = document.getElementById('news');
  bd.classList.remove('show');
  setTimeout(() => { bd.hidden = true; }, 300);
}

export async function loadNews(showNew = true) {
  if (!apiEnabled()) return;
  try {
    const r = await fetch(CONFIG.API_BASE.replace(/\/$/, '') + '/api/posts');
    if (!r.ok) return;
    data = await r.json();
  } catch (e) { return; }
  renderBanner();
  const seen = load('news_seen', null);
  const latest = data.posts.length ? data.posts[0].id : 0;
  // Новичку старые объявления не показываем — только то, что выйдет после первого входа
  if (seen === null) { save('news_seen', latest); return; }
  if (showNew && latest > seen) setTimeout(() => openNews(true), 900);
}

export function initNews() {
  const bd = document.getElementById('news');
  bd.addEventListener('click', (e) => { if (e.target === bd || e.target.closest('.sheet-close') || e.target.closest('[data-news-close]')) closeNews(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !bd.hidden) closeNews(); });
  document.getElementById('goal-banner').addEventListener('click', (e) => { if (e.target.closest('[data-news]')) openNews(false); });
  loadNews(true);
  // Обратный отсчёт меняется в полночь, объявления подтягиваются при возврате во вкладку
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadNews(true); });
}
