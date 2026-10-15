// Запросы к серверу с авторизацией: в Telegram — подписанные данные initData, на сайте — токен после входа через Telegram.
import { CONFIG } from './config.js';
import { tg, inTelegram } from './tg.js';
import { load, save } from './storage.js';

export const apiEnabled = () => !!CONFIG.API_BASE;
const url = (p) => CONFIG.API_BASE.replace(/\/$/, '') + p;

let session = load('session', null); // { token, user, exp }
export function getSession() {
  if (session && session.exp && session.exp * 1000 < Date.now()) { session = null; save('session', null); }
  return session;
}
export function setSession(s) { session = s; save('session', s); }

// Кто мы: пользователь Telegram из Mini App или из входа на сайте
export function me() {
  if (inTelegram && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    const u = tg.initDataUnsafe.user;
    return { id: u.id, name: [u.first_name, u.last_name].filter(Boolean).join(' '), username: u.username, photo_url: u.photo_url, via: 'telegram' };
  }
  const s = getSession();
  return s ? { ...s.user, via: 'site' } : null;
}
export const signedIn = () => apiEnabled() && !!me();

export async function request(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (inTelegram && tg.initData) headers['X-Telegram-Init-Data'] = tg.initData;
  else if (getSession()) headers['Authorization'] = 'Bearer ' + getSession().token;
  const r = await fetch(url(path), { method, headers, body: body ? JSON.stringify(body) : method === 'GET' ? undefined : '{}' });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && !inTelegram) setSession(null);
  if (!r.ok) { const e = new Error(data.error || 'Сервер ответил ' + r.status); e.status = r.status; throw e; }
  return data;
}
