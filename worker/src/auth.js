// Авторизация: подпись Telegram Mini App (initData) и токен входа на сайте.
export class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const enc = new TextEncoder();
const AUTH_MAX_AGE = 86400;

/* ---------- криптография ---------- */
export async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? enc.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data)));
}
export const hex = (buf) => [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
export const b64url = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
export const sessionKey = (env) => env.SESSION_SECRET || 'session:' + env.BOT_TOKEN;

export function userFrom(u) {
  return {
    id: u.id,
    name: [u.first_name, u.last_name].filter(Boolean).join(' ').trim().slice(0, 64) || 'Без имени',
    username: u.username || null,
    photo_url: u.photo_url || null,
  };
}

// Mini App: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
export async function checkInitData(initData, env) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new HttpError(401, 'Нет подписи Telegram');
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => k + '=' + v).join('\n');
  const secret = await hmac('WebAppData', env.BOT_TOKEN);
  if (!safeEqual(hex(await hmac(secret, check)), hash)) throw new HttpError(401, 'Подпись Telegram не сошлась');
  if (Date.now() / 1000 - Number(params.get('auth_date') || 0) > AUTH_MAX_AGE) throw new HttpError(401, 'Сессия устарела, перезапусти приложение');
  const u = JSON.parse(params.get('user') || 'null');
  if (!u || !u.id) throw new HttpError(401, 'Нет пользователя');
  return userFrom(u);
}

export async function checkSession(token, env) {
  const [payload, sig] = String(token).split('.');
  if (!payload || !sig || !safeEqual(hex(await hmac(sessionKey(env), payload)), sig)) throw new HttpError(401, 'Войди заново');
  const data = JSON.parse(unb64url(payload));
  if (!data.exp || data.exp * 1000 < Date.now()) throw new HttpError(401, 'Сессия истекла, войди заново');
  return { id: data.id, name: data.name, username: data.username, photo_url: data.photo_url };
}

export async function authUser(req, env, body) {
  if (!env.BOT_TOKEN) throw new HttpError(500, 'На сервере не задан BOT_TOKEN');
  const init = req.headers.get('X-Telegram-Init-Data') || (body && body.initData);
  if (init) return checkInitData(init, env);
  const auth = req.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) return checkSession(auth.slice(7), env);
  throw new HttpError(401, 'Нужен вход через Telegram');
}


// Для WebSocket: данные авторизации приходят в первом сообщении
export async function authFromCredentials(m, env) {
  if (!env.BOT_TOKEN) throw new HttpError(500, 'На сервере не задан BOT_TOKEN');
  if (m && m.initData) return checkInitData(m.initData, env);
  if (m && m.token) return checkSession(m.token, env);
  throw new HttpError(401, 'Нужен вход через Telegram');
}

export const isAdmin = (env, user) => (env.ADMIN_IDS || '').split(',').map((x) => x.trim()).filter(Boolean).includes(String(user.id));
