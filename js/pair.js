// Совместный огонёк: состояние пары с сервера, приглашения, уведомления. Серию пары считает сервер.
import { apiEnabled, signedIn, request } from './api.js';
import { load, save } from './storage.js';
import { stageOf } from './streak.js';

let data = null;
let seen = load('pair_seen', null); // { id, streak } — что пользователь уже видел, для анимаций роста и потери
const shown = new Set();            // приглашения и уведомления, уже показанные в этой сессии
const listeners = new Set();
export const onPair = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (ev) => listeners.forEach((fn) => fn(ev, data));
export const pairData = () => data;
export const sharedActive = () => !!(data && data.pair);

export async function refreshPair() {
  if (!apiEnabled() || !signedIn()) { data = null; emit({ type: 'pair-state' }); return; }
  let next;
  try { next = await request('/api/pair'); } catch (e) { return; }
  data = next;
  const p = data.pair;
  if (p) {
    if (!seen || seen.id !== p.id) { seen = { id: p.id, streak: p.streak }; save('pair_seen', seen); emit({ type: 'pair-state' }); }
    else if (p.streak > seen.streak) {
      const prev = seen.streak;
      seen = { id: p.id, streak: p.streak }; save('pair_seen', seen);
      emit({ type: 'extend', shared: true, prev, streak: p.streak, stageFrom: stageOf(prev), stageTo: stageOf(p.streak) });
    } else if (p.streak < seen.streak) {
      const prev = seen.streak;
      seen = { id: p.id, streak: p.streak }; save('pair_seen', seen);
      emit({ type: 'loss', shared: true, prev });
    } else emit({ type: 'pair-state' });
  } else {
    if (seen) { seen = null; save('pair_seen', null); }
    emit({ type: 'pair-state' });
  }
  if (p && p.poked && load('poke_seen', 0) < p.poked.at) { save('poke_seen', p.poked.at); emit({ type: 'poked', partner: p.partner }); }
  for (const inv of data.incoming || []) if (!shown.has('i' + inv.id)) { shown.add('i' + inv.id); emit({ type: 'invite', invite: inv }); }
  for (const n of data.notices || []) if (!shown.has('n' + n.id + n.type)) { shown.add('n' + n.id + n.type); emit({ type: 'notice', notice: n }); }
}

export async function invite(username) { const r = await request('/api/pair/invite', { method: 'POST', body: { username } }); await refreshPair(); return r; }
export async function respond(id, accept) { const r = await request('/api/pair/respond', { method: 'POST', body: { id, accept } }); await refreshPair(); return r; }
export function ack(id) { return request('/api/pair/ack', { method: 'POST', body: { id } }).catch(() => {}); }
export async function poke() { const r = await request('/api/pair/poke', { method: 'POST' }); await refreshPair(); return r; }
export async function leave() { const r = await request('/api/pair/leave', { method: 'POST' }); await refreshPair(); return r; }

let soon = null;
export function refreshSoon(ms = 3000) { clearTimeout(soon); soon = setTimeout(refreshPair, ms); }

export function initPair() {
  refreshPair();
  setInterval(() => { if (!document.hidden) refreshPair(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshPair(); });
}
