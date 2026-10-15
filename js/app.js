// Точка входа: маршруты, навигация, инициализация модулей.
import { CONFIG } from './config.js';
import { hasKatex } from './math.js';
import { initTelegram, tg, inTelegram } from './tg.js';
import * as S from './streak.js';
import { initStreakUI } from './streak-ui.js';
import { mountPractice, practiceKey, practiceBack, practiceDeep } from './practice.js';
import { mountEndless, endlessKey, endlessBack, endlessDeep } from './endless.js';
import { mountTheory, showTopic } from './theory.js';
import { mountGraphs } from './graphs.js';
import { renderRating } from './rating.js';
import { initSync } from './sync.js';
import { initAccount } from './account.js';
import { initPair } from './pair.js';
import { initNews, closeNews } from './news.js';
import { mountDuel, showDuel, leaveDuel, duelKey, duelBack } from './duel.js';
import { mountAdmin, load as loadStats } from './admin.js';
import { initReport, closeReport } from './report.js';
import { closeSheet } from './streak-ui.js';
import { closeAccount } from './account.js';

const ROUTES = ['practice', 'endless', 'theory', 'graphs', 'rating', 'duel', 'stats'];
const mounted = {};
const scrollPos = {};
let current = null;

function view(name) { return document.getElementById('view-' + name); }

async function show(name, sub) {
  if (!ROUTES.includes(name)) name = 'practice';
  if (current && current !== name) scrollPos[current] = window.scrollY;
  ROUTES.forEach((r) => { view(r).hidden = r !== name; });
  const navName = name === 'duel' ? 'endless' : name;
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === navName) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const first = !mounted[name];
  if (first) {
    mounted[name] = true;
    if (name === 'practice') mountPractice(view(name), { onTheory: (t) => { location.hash = '#/theory/' + t; } });
    if (name === 'endless') mountEndless(view(name));
    if (name === 'theory') mountTheory(view(name));
    if (name === 'graphs') mounted.graphsRedraw = mountGraphs(view(name));
    if (name === 'duel') mountDuel(view(name));
    if (name === 'stats') mountAdmin(view(name));
  }
  if (name === 'graphs' && mounted.graphsRedraw) requestAnimationFrame(mounted.graphsRedraw);
  if (name === 'rating') renderRating(view(name));
  if (name === 'duel') showDuel(sub);
  else if (current === 'duel') leaveDuel();
  if (name === 'stats') loadStats();
  const prev = current;
  current = name;
  document.title = { practice: 'Практика', endless: 'Генератор', theory: 'Теория', graphs: 'Графики', rating: 'Рейтинг', duel: 'Дуэль', stats: 'Админка' }[name] + ' · ' + CONFIG.BRAND;
  if (name === 'theory' && sub) await showTopic(sub);
  else if (prev !== name) window.scrollTo(0, scrollPos[name] || 0);
}

function route() {
  const [, name, sub] = (location.hash || '#/practice').split('/');
  show(name, sub);
}

function onKey(e) {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (['sheet', 'fx', 'report', 'acct', 'news'].some((id) => !document.getElementById(id).hidden)) return;
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'TEXTAREA' || (tag === 'INPUT' && e.target.type === 'text')) return;
  const handled = current === 'practice' ? practiceKey(e) : current === 'endless' ? endlessKey(e) : current === 'duel' ? duelKey(e) : false;
  if (handled) e.preventDefault();
}

/* ---------- системная кнопка «Назад» Telegram ---------- */
const isOpen = (id) => !document.getElementById(id).hidden;
function backAvailable() {
  if (isOpen('fx')) return false; // полноэкранные окна закрываются своими кнопками
  if (isOpen('sheet') || isOpen('acct') || isOpen('report') || isOpen('news')) return true;
  if (current === 'practice') return practiceDeep();
  return true; // из любого другого раздела — назад к темам или в меню раздела
}
function goBack() {
  if (isOpen('fx')) return;
  if (isOpen('news')) return closeNews();
  if (isOpen('report')) return closeReport();
  if (isOpen('acct')) return closeAccount();
  if (isOpen('sheet')) return closeSheet();
  if (current === 'practice') { practiceBack(); return; }
  if (current === 'endless' && endlessBack()) return;
  if (current === 'duel') { duelBack(); return; }
  if (current === 'stats' || current === 'rating' || current === 'theory' || current === 'graphs' || current === 'endless') location.hash = '#/practice';
}
function updateBack() {
  if (!inTelegram || !tg.BackButton) return;
  try { if (backAvailable()) tg.BackButton.show(); else tg.BackButton.hide(); } catch (e) { /* старый клиент */ }
}
function initBackButton() {
  if (!inTelegram || !tg.BackButton) return;
  tg.BackButton.onClick(() => { goBack(); setTimeout(updateBack, 350); });
  // Экраны меняются по нажатиям и клавишам — после них пересчитываем, нужна ли кнопка
  const later = () => setTimeout(updateBack, 380);
  document.addEventListener('click', later, true);
  document.addEventListener('keydown', later, true);
  window.addEventListener('hashchange', later);
  setInterval(updateBack, 1500);
  updateBack();
}

function init() {
  initTelegram();
  if (!hasKatex()) {
    document.getElementById('warn').innerHTML = '<div class="warn">Формулы не загрузились: при первом открытии нужен интернет. Дальше сайт работает и без него.</div>';
  }
  document.querySelectorAll('.brand-name').forEach((n) => { n.textContent = CONFIG.BRAND; });

  initReport();
  initStreakUI();
  initAccount();
  S.tick();
  S.startClock();
  initSync();
  initPair();
  initNews();

  view('rating').addEventListener('click', (e) => { if (e.target.closest('[data-act="rating-refresh"]')) renderRating(view('rating')); });
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', onKey);

  // Ссылка из Telegram вида t.me/бот/приложение?startapp=endless или startapp=theory_rem
  const sp = inTelegram && tg.initDataUnsafe && tg.initDataUnsafe.start_param;
  if (sp && !location.hash) location.hash = '#/' + sp.replace('_', '/');
  route();
  initBackButton();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
