// Синхронизация: серия, заморозки, рекорды и настройки одинаковые на сайте и в Mini App.
// Если задан сервер и пользователь вошёл — через сервер. Иначе в Telegram — через CloudStorage. Иначе только устройство.
import * as S from './streak.js';
import { load, save, cloudLoad } from './storage.js';
import { request, signedIn, apiEnabled } from './api.js';
import { inTelegram, tg } from './tg.js';
import { mergeState, sameState } from './merge.js';
import { hapticsOn, setHaptics } from './haptics.js';

const CLOUD_KEY = 'state_v2';
let rev = load('sync_rev', 0);
let status = { mode: 'local', at: load('sync_at', null), error: null, busy: false };
const listeners = new Set();
export const onSync = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const syncStatus = () => status;
function setStatus(p) { status = { ...status, ...p }; listeners.forEach((f) => f(status)); }

export function mode() {
  if (apiEnabled() && signedIn()) return 'server';
  if (inTelegram && tg.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast('6.9')) return 'cloud';
  return 'local';
}

export function localState() {
  return {
    streak: S.getRaw(),
    best: { oral: load('best_oral', 0), written: load('best_written', 0) },
    settings: { haptics: hapticsOn(), reminders: load('reminders', true) },
    settingsAt: load('settings_at', 0),
  };
}
function applyLocal(s) {
  if (!s) return;
  save('best_oral', (s.best && s.best.oral) || 0);
  save('best_written', (s.best && s.best.written) || 0);
  if (s.settings && 'haptics' in s.settings) setHaptics(s.settings.haptics);
  if (s.settings && 'reminders' in s.settings) save('reminders', !!s.settings.reminders);
  save('settings_at', s.settingsAt || 0);
  if (s.streak) { S.setRaw(s.streak); S.tick(); }
}

// Пометить, что локальные данные изменились (рекорд, настройка) — отправим чуть позже
let timer = null;
export function markDirty() {
  clearTimeout(timer);
  timer = setTimeout(push, 1500);
}
export function settingsChanged() { save('settings_at', Date.now()); markDirty(); }

async function push() {
  const m = mode();
  setStatus({ mode: m });
  if (m === 'local') return;
  const state = localState();
  try {
    setStatus({ busy: true, error: null });
    if (m === 'server') {
      const r = await request('/api/state', { method: 'PUT', body: { state, rev } });
      rev = r.rev; save('sync_rev', rev);
      if (!sameState(r.state, state)) applyLocal(r.state);
    } else {
      await new Promise((res) => tg.CloudStorage.setItem(CLOUD_KEY, JSON.stringify(state), () => res()));
    }
    const at = Date.now(); save('sync_at', at);
    setStatus({ busy: false, at });
  } catch (e) {
    setStatus({ busy: false, error: e.message });
  }
}

export async function pull() {
  const m = mode();
  setStatus({ mode: m });
  if (m === 'local') return;
  const local = localState();
  try {
    setStatus({ busy: true, error: null });
    let remote = null;
    if (m === 'server') {
      const r = await request('/api/state');
      remote = r.state; rev = r.rev || 0; save('sync_rev', rev);
    } else {
      remote = await cloudLoad(CLOUD_KEY);
    }
    const merged = mergeState(local, remote);
    if (!sameState(merged, local)) applyLocal(merged);
    if (!remote || !sameState(merged, remote)) await push();
    const at = Date.now(); save('sync_at', at);
    setStatus({ busy: false, at });
  } catch (e) {
    setStatus({ busy: false, error: e.message });
  }
}

export function initSync() {
  S.onChange(markDirty);
  pull();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });
  setInterval(() => { if (!document.hidden) pull(); }, 5 * 60 * 1000);
}
