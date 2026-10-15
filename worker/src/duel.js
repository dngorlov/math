// Комната дуэли: один Durable Object на код. WebSocket с гибернацией: пока игроки молчат, объект не тратит ресурсы.
// Задачи сервер генерирует сам по тому же seed, что и клиенты, поэтому ответы и очки проверяются здесь.
import { duelTasks, GEN_VERSION } from '../../js/gen/index.js';
import { authFromCredentials } from './auth.js';

const PLAY_MS = 60000;           // длительность раунда
const COUNTDOWN_MS = 3500;       // отсчёт 3-2-1
const GRACE_MS = 800;            // ответы, отправленные в последнюю секунду, ещё долетают
const LOBBY_TTL = 15 * 60000;    // комната без игры живёт 15 минут
const END_TTL = 10 * 60000;      // после игры — 10 минут на реванш
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newCode() {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return [...b].map((x) => ALPHABET[x % ALPHABET.length]).join('');
}

export async function createRoom(env, owner) {
  const code = newCode();
  const stub = env.DUEL.get(env.DUEL.idFromName(code));
  const r = await stub.fetch('https://duel/init', { method: 'POST', body: JSON.stringify({ code, owner }) });
  if (!r.ok) throw new Error('Не удалось создать комнату');
  return code;
}

export class DuelRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.s = null;
    this.tasks = null;
  }

  async load() {
    if (!this.s) this.s = (await this.state.storage.get('s')) || null;
    return this.s;
  }
  async save() { await this.state.storage.put('s', this.s); }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/init') {
      const { code, owner } = await req.json();
      this.s = { code, owner: owner.id, phase: 'lobby', players: {}, createdAt: Date.now(), seed: null, startAt: null, endAt: null, winner: null, stats: {}, rematch: null };
      await this.save();
      await this.state.storage.setAlarm(Date.now() + LOBBY_TTL);
      return new Response('ok');
    }
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Нужен WebSocket', { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  sendTo(ws, m) { try { ws.send(JSON.stringify({ ...m, now: Date.now() })); } catch (e) { /* сокет закрыт */ } }
  broadcast(m) { for (const ws of this.state.getWebSockets()) this.sendTo(ws, m); }
  uidOf(ws) { return (ws.deserializeAttachment && ws.deserializeAttachment() || {}).uid; }
  connected(id) { return this.state.getWebSockets().some((ws) => this.uidOf(ws) === id); }

  stateMsg() {
    const s = this.s;
    return {
      t: s.phase === 'end' ? 'end' : 'state',
      code: s.code, phase: s.phase, seed: s.seed, startAt: s.startAt, endAt: s.endAt, winner: s.winner, genVersion: GEN_VERSION,
      players: Object.values(s.players).map((p) => ({ id: p.id, name: p.name, photo_url: p.photo_url, ready: p.ready, score: p.score, idx: p.idx, correct: p.correct, answered: p.answered, connected: this.connected(p.id) })),
    };
  }

  getTasks() {
    if (!this.tasks || this.tasks.seed !== this.s.seed) { this.tasks = duelTasks(this.s.seed, 150); this.tasks.seed = this.s.seed; }
    return this.tasks;
  }

  async webSocketMessage(ws, raw) {
    await this.load();
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!this.s) { this.sendTo(ws, { t: 'error', msg: 'Дуэль не найдена или уже закрыта' }); try { ws.close(1000, 'gone'); } catch (e) { /* уже */ } return; }

    if (m.t === 'hello') {
      let user;
      try { user = await authFromCredentials(m, this.env); }
      catch (e) { this.sendTo(ws, { t: 'error', msg: e.message }); try { ws.close(1008, 'auth'); } catch (err) { /* уже */ } return; }
      if (!this.s.players[user.id]) {
        if (Object.keys(this.s.players).length >= 2 || this.s.phase !== 'lobby') {
          this.sendTo(ws, { t: 'error', msg: this.s.phase === 'lobby' ? 'В этой дуэли уже два игрока' : 'Дуэль уже идёт без тебя' });
          try { ws.close(1000, 'full'); } catch (e) { /* уже */ }
          return;
        }
        this.s.players[user.id] = { ...user, ready: false, score: 0, idx: 0, correct: 0, answered: 0 };
      }
      // Тот же игрок подключился заново (вторая вкладка, переподключение) — старое соединение закрываем
      for (const other of this.state.getWebSockets()) {
        if (other !== ws && this.uidOf(other) === user.id) { try { other.close(1000, 'replaced'); } catch (e) { /* уже */ } }
      }
      ws.serializeAttachment({ uid: user.id });
      await this.save();
      this.broadcast(this.stateMsg());
      return;
    }

    const p = this.s.players[this.uidOf(ws)];
    if (!p) return;

    if (m.t === 'ready' && this.s.phase === 'lobby') {
      p.ready = true;
      const ps = Object.values(this.s.players);
      if (ps.length === 2 && ps.every((x) => x.ready)) {
        this.s.phase = 'play';
        this.s.seed = (Math.random() * 2147483647) | 0;
        this.s.startAt = Date.now() + COUNTDOWN_MS;
        this.s.endAt = this.s.startAt + PLAY_MS;
        await this.state.storage.setAlarm(this.s.endAt + GRACE_MS);
      }
      await this.save();
      this.broadcast(this.stateMsg());
      return;
    }

    if (m.t === 'answer' && this.s.phase === 'play') {
      const t = Date.now();
      if (t < this.s.startAt - 300 || t > this.s.endAt + GRACE_MS) return;
      if (m.i !== p.idx) { this.sendTo(ws, { t: 'res', i: m.i, stale: true, score: p.score }); return; }
      const task = this.getTasks()[m.i];
      if (!task) return;
      const ok = m.a === task.a;
      p.idx++; p.answered++;
      if (ok) p.correct++;
      p.score = Math.max(0, p.score + (ok ? 10 : -5));
      const key = task.topic + '|' + task.kind;
      const st = this.s.stats[key] || (this.s.stats[key] = [0, 0]);
      st[0]++; if (!ok) st[1]++;
      await this.save();
      this.sendTo(ws, { t: 'res', i: m.i, ok, score: p.score });
      this.broadcast({ t: 'score', id: p.id, score: p.score, idx: p.idx });
      return;
    }

    if (m.t === 'rematch' && this.s.phase === 'end') {
      if (!this.s.rematch) {
        this.s.rematch = await createRoom(this.env, p);
        await this.save();
      }
      this.broadcast({ t: 'rematch', code: this.s.rematch });
    }
  }

  async webSocketClose() {
    await this.load();
    if (this.s && this.s.phase !== 'end') this.broadcast(this.stateMsg());
  }
  async webSocketError() { return this.webSocketClose(); }

  async alarm() {
    await this.load();
    if (!this.s) return;
    const now = Date.now();
    if (this.s.phase === 'play' && now >= this.s.endAt) return this.finish();
    if (this.s.phase === 'lobby' && now >= this.s.createdAt + LOBBY_TTL - 1000) {
      this.broadcast({ t: 'error', msg: 'Комната закрыта: за 15 минут игра так и не началась' });
      for (const ws of this.state.getWebSockets()) { try { ws.close(1000, 'expired'); } catch (e) { /* уже */ } }
      await this.state.storage.deleteAll();
      this.s = null;
      return;
    }
    if (this.s.phase === 'end') { await this.state.storage.deleteAll(); this.s = null; }
  }

  async finish() {
    const ps = Object.values(this.s.players);
    this.s.phase = 'end';
    this.s.winner = ps.length === 2 && ps[0].score !== ps[1].score ? (ps[0].score > ps[1].score ? ps[0].id : ps[1].id) : null;
    await this.save();
    this.broadcast(this.stateMsg());
    await this.state.storage.setAlarm(Date.now() + END_TTL);
    try {
      const [a, b] = ps;
      if (a && b) {
        await this.env.DB.prepare('INSERT OR IGNORE INTO duels (code, a_id, b_id, a_score, b_score, winner, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
          .bind(this.s.code, a.id, b.id, a.score, b.score, this.s.winner, Date.now()).run();
      }
      await recordStats(this.env, Object.entries(this.s.stats).map(([k, [att, err]]) => { const [topic, kind] = k.split('|'); return { src: 'duel', topic, kind, attempts: att, errors: err }; }));
    } catch (e) { console.error('duel finish', e); }
  }
}

// Агрегированная статистика по дням (МСК): без пользователей, только тема, тип и количество
export async function recordStats(env, rows) {
  if (!rows.length) return;
  const day = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
  await env.DB.batch(rows.map((r) => env.DB.prepare(
    `INSERT INTO stats_daily (day, src, topic, kind, attempts, errors) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(day, src, topic, kind) DO UPDATE SET attempts = attempts + excluded.attempts, errors = errors + excluded.errors`
  ).bind(day, r.src, r.topic, r.kind, r.attempts, r.errors)));
}
