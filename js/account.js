// Профиль: вход через Telegram на сайте, статус синхронизации, настройка вибрации.
import { CONFIG } from './config.js';
import { esc } from './math.js';
import { inTelegram, tg } from './tg.js';
import { load, save } from './storage.js';
import { apiEnabled, me, request, setSession, getSession } from './api.js';
import { pull, syncStatus, onSync, mode, settingsChanged } from './sync.js';
import { hapticsOn, setHaptics, tap } from './haptics.js';
import { toast } from './ui.js';
import { refreshPair } from './pair.js';
import { openNews } from './news.js';

let meInfo = null; // { isAdmin, duels: { wins, losses, draws } } с сервера

const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 20c1.6-3.6 4.5-5 8-5s6.4 1.4 8 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

function initials(name) { return esc((name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()); }
function avatar(u, cls = 'ava') {
  if (u && u.photo_url) return '<img class="' + cls + '" src="' + esc(u.photo_url) + '" alt="" referrerpolicy="no-referrer">';
  return '<span class="' + cls + ' ava-i">' + (u ? initials(u.name) : ICON) + '</span>';
}

export function renderAccountButton() {
  const b = document.getElementById('acct-btn');
  if (!b) return;
  const u = me();
  b.innerHTML = u ? avatar(u, 'ava ava-sm') : '<span class="ava ava-sm ava-i">' + ICON + '</span>';
  b.setAttribute('aria-label', u ? 'Профиль: ' + u.name : 'Войти и настройки');
}

function fmtAgo(t) {
  if (!t) return 'ещё не было';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'только что';
  if (s < 3600) return Math.round(s / 60) + ' мин назад';
  return new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

function syncLine() {
  const st = syncStatus(), m = mode();
  if (m === 'server') return st.error ? '<span class="err">Не удалось синхронизировать: ' + esc(st.error) + '</span>' : 'Синхронизировано с сервером: ' + fmtAgo(st.at);
  if (m === 'cloud') return 'Данные хранятся в Telegram и одинаковы на всех твоих устройствах.';
  return 'Данные хранятся только на этом устройстве.';
}

async function loadMe() {
  if (!apiEnabled() || !me()) { meInfo = null; return; }
  try { meInfo = await request('/api/me'); } catch (e) { meInfo = null; }
}

function render() {
  const body = document.getElementById('acct-body');
  const u = me();
  let h = '';
  if (u) {
    h += '<div class="acct-user">' + avatar(u, 'ava ava-lg') + '<div><div class="acct-name">' + esc(u.name || 'Без имени') + '</div>' +
      (u.username ? '<div class="muted">@' + esc(u.username) + '</div>' : '') + '<div class="muted small">' + 'Вход через Telegram · ID ' + esc(u.id) + '</div></div></div>';
    if (meInfo && meInfo.duels) h += '<p class="small">Дуэли: побед ' + meInfo.duels.wins + ', поражений ' + meInfo.duels.losses + ', ничьих ' + meInfo.duels.draws + '</p>';
    if (meInfo && meInfo.isAdmin) h += '<a class="btn ghost acct-admin" href="#/stats">Админка: статистика, серии, рейтинг</a>';
  } else if (!apiEnabled()) {
    h += '<p class="muted">Вход пока недоступен. Загляни чуть позже.</p>';
  } else if (!CONFIG.BOT_USERNAME) {
    h += '<p class="muted">Вход пока недоступен. Загляни чуть позже.</p>';
  } else {
    h += '<p>Войди через Telegram, чтобы серия, заморозки и рекорды были одинаковыми на сайте и в боте, а результаты попадали в рейтинг.</p><div id="tg-login" class="tg-login"></div>' +
      '<p class="muted small">Если кнопка входа не появилась, обнови страницу или открой тренажёр через бота в Telegram.</p>';
  }
  if (apiEnabled()) h += '<button class="btn ghost acct-news" data-a="news">Новости и обновления</button>';
  h += '<h3>Синхронизация</h3><p class="small" id="acct-sync">' + syncLine() + '</p>';
  if (mode() !== 'local') h += '<button class="btn ghost" data-a="sync">Синхронизировать сейчас</button>';
  h += '<h3>Настройки</h3><label class="switch"><input type="checkbox" data-a="haptics"' + (hapticsOn() ? ' checked' : '') + '><span class="sw"></span><span>Вибрация<small>' +
    (inTelegram ? 'Одиночная на верный ответ, ритм на анимациях огня' : 'Работает на Android; браузер на iPhone вибрацию не поддерживает') + '</small></span></label>';
  if (apiEnabled() && u) h += '<label class="switch"><input type="checkbox" data-a="reminders"' + (load('reminders', true) ? ' checked' : '') + '><span class="sw"></span><span>Напоминание в 22:00<small>Бот напишет в личку, если огонёк сегодня ещё не продлён</small></span></label>';
  if (u && u.via === 'site') h += '<button class="link" data-a="logout">Выйти</button>';
  body.innerHTML = h;
  if (!u && apiEnabled() && CONFIG.BOT_USERNAME) mountLoginWidget(body.querySelector('#tg-login'));
}

function mountLoginWidget(box) {
  window.onTelegramAuth = async (user) => {
    try {
      const r = await request('/api/auth/widget', { method: 'POST', body: user });
      setSession(r);
      tap('success');
      toast('Вход выполнен');
      renderAccountButton();
      await pull();
      refreshPair();
      render();
    } catch (e) {
      toast('Не удалось войти: ' + e.message);
    }
  };
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://telegram.org/js/telegram-widget.js?22';
  s.setAttribute('data-telegram-login', CONFIG.BOT_USERNAME);
  s.setAttribute('data-size', 'large');
  s.setAttribute('data-radius', '12');
  s.setAttribute('data-onauth', 'onTelegramAuth(user)');
  s.setAttribute('data-request-access', 'write');
  box.appendChild(s);
}

export function openAccount() {
  const bd = document.getElementById('acct');
  render();
  loadMe().then(() => { if (!bd.hidden) render(); });
  bd.hidden = false;
  bd.querySelector('.sheet').scrollTop = 0;
  requestAnimationFrame(() => bd.classList.add('show'));
}
export function closeAccount() { close(); }
function close() {
  const bd = document.getElementById('acct');
  bd.classList.remove('show');
  setTimeout(() => { bd.hidden = true; }, 300);
}

export function initAccount() {
  renderAccountButton();
  document.getElementById('acct-btn').addEventListener('click', openAccount);
  const bd = document.getElementById('acct');
  bd.addEventListener('click', async (e) => {
    if (e.target === bd || e.target.closest('.sheet-close') || e.target.closest('.acct-admin')) return close();
    const a = e.target.closest('[data-a]');
    if (!a) return;
    if (a.dataset.a === 'sync') { await pull(); render(); toast(syncStatus().error ? 'Не получилось синхронизировать' : 'Синхронизировано'); }
    if (a.dataset.a === 'news') { close(); setTimeout(() => openNews(false), 300); }
    if (a.dataset.a === 'logout') { setSession(null); renderAccountButton(); refreshPair(); render(); toast('Ты вышел из аккаунта'); }
  });
  bd.addEventListener('change', (e) => {
    if (e.target.dataset.a === 'haptics') { setHaptics(e.target.checked); settingsChanged(); if (e.target.checked) tap('medium'); }
    if (e.target.dataset.a === 'reminders') {
      save('reminders', e.target.checked); settingsChanged();
      // В Mini App боту нужно разрешение писать в личку
      if (e.target.checked && inTelegram && tg.requestWriteAccess && tg.isVersionAtLeast && tg.isVersionAtLeast('6.9')) {
        try { tg.requestWriteAccess((ok) => { if (!ok) toast('Без разрешения бот не сможет присылать напоминания'); }); } catch (err) { /* старый клиент */ }
      }
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !bd.hidden) close(); });
  onSync(() => { const n = document.getElementById('acct-sync'); if (n) n.innerHTML = syncLine(); renderAccountButton(); });
  if (getSession() || inTelegram) renderAccountButton();
}
