// Интерфейс серии: знак в шапке, полноэкранные ключевые анимации, меню серии с правилами и заморозками.
import { createMark } from './mark.js';
import * as S from './streak.js';
import { tap } from './haptics.js';
import { toast } from './ui.js';
import { esc } from './math.js';
import { apiEnabled, signedIn, me } from './api.js';
import { openAccount } from './account.js';
import { sharedActive, pairData, onPair, invite, respond, ack, leave, poke, refreshSoon } from './pair.js';

let head, big;
let chain = Promise.resolve();
const stateOf = (s) => ({ streak: s.streak, done: s.doneToday, frozen: s.frozenToday });
// Что показывает знак: совместный огонёк, если есть пара, иначе личный
function headState() {
  if (sharedActive()) { const p = pairData().pair; return { streak: p.streak, done: p.countedToday, frozen: p.coveredToday && !p.countedToday }; }
  return stateOf(S.get());
}
const firstName = (u) => ((u && u.name) || 'партнёр').split(' ')[0];
function initials(n) { return esc((n || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()); }
function ava(u, cls = 'ava') { return u && u.photo_url ? '<img class="' + cls + '" src="' + esc(u.photo_url) + '" alt="" referrerpolicy="no-referrer">' : '<span class="' + cls + ' ava-i">' + initials(u && u.name) + '</span>'; }
const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b : c; };
export const daysWord = (n) => n + ' ' + plural(n, 'день', 'дня', 'дней');
const freezeWord = (n) => n + ' ' + plural(n, 'заморозка', 'заморозки', 'заморозок');
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
function nextMonthText(day) { const m = Number(day.slice(5, 7)); return '1 ' + MONTHS_GEN[m % 12]; }

const TITLES = {
  1: ['Серия началась', 'Решай 5 примеров каждый день. На пятый день знак превратится в искру.'],
  2: ['Искра', '5 дней подряд — зажглась искра. Следующая ступень — огонь, 30 дней.'],
  3: ['Огонь', '30 дней подряд. Следующая ступень — пламя, 60 дней.'],
  4: ['Пламя', '60 дней подряд. Следующая ступень — огнище, 100 дней.'],
  5: ['Огнище', '100 дней подряд. Это высшая ступень. Держи огонь.'],
};

function partnerBadge(u) {
  const brand = document.querySelector('.brand');
  let b = brand.querySelector('.pair-badge');
  if (!u) { if (b) b.remove(); return; }
  if (!b) { b = document.createElement('span'); b.className = 'pair-badge'; b.setAttribute('aria-hidden', 'true'); brand.appendChild(b); }
  b.innerHTML = ava(u);
}

function updateHeader(s) {
  const sub = document.getElementById('streak-sub');
  if (!sub) return;
  if (sharedActive()) {
    const p = pairData().pair;
    sub.textContent = 'Огонёк на двоих: ' + daysWord(p.streak) + (p.countedToday ? '' : p.today.me.done ? ' · ждём партнёра' : ' · сегодня ' + p.today.me.count + ' / ' + S.GOAL);
    partnerBadge(p.partner);
    document.getElementById('streak-btn').setAttribute('aria-label', 'Совместный огонёк: ' + daysWord(p.streak) + '. Открыть меню серии');
    return;
  }
  partnerBadge(null);
  if (s.streak === 0) sub.textContent = 'Сегодня ' + s.count + ' / ' + S.GOAL;
  else if (s.doneToday) sub.textContent = 'Серия: ' + daysWord(s.streak);
  else if (s.frozenToday) sub.textContent = daysWord(s.streak) + ' · заморожено';
  else sub.textContent = daysWord(s.streak) + ' · сегодня ' + s.count + ' / ' + S.GOAL;
  document.getElementById('streak-btn').setAttribute('aria-label', 'Серия: ' + daysWord(s.streak) + '. Открыть меню серии');
}

function pulseHeader() {
  const n = document.getElementById('streak-btn');
  if (n && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    n.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.22)' }, { transform: 'scale(1)' }], { duration: 650, easing: 'cubic-bezier(.34,1.4,.64,1)' });
  }
}

/* ---------- полноэкранное окно ---------- */
const fxEl = () => document.getElementById('fx');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function fxOpen() {
  const fx = fxEl();
  if (!fx.hidden && fx.classList.contains('show')) return false;
  fx.hidden = false;
  requestAnimationFrame(() => fx.classList.add('show'));
  return true;
}
function fxClose() {
  const fx = fxEl();
  fx.classList.remove('show', 'texts');
  setTimeout(() => { fx.hidden = true; fx.querySelector('.fx-people').hidden = true; document.getElementById('fx-mark').hidden = false; }, 400);
  head.apply(headState());
  pulseHeader();
}
function fxTexts(title, text, buttons) {
  const fx = fxEl();
  fx.querySelector('.fx-title').textContent = title;
  fx.querySelector('.fx-text').textContent = text;
  const box = fx.querySelector('.fx-actions');
  box.innerHTML = '';
  buttons.forEach((b, i) => {
    const el = document.createElement('button');
    el.className = 'btn ' + (b.primary ? 'primary' : 'ghost');
    el.textContent = b.label;
    el.addEventListener('click', () => { fx.classList.remove('texts'); b.onClick(); }, { once: true });
    box.appendChild(el);
    if (i === 0) setTimeout(() => el.focus({ preventScroll: true }), 50);
  });
  fx.classList.add('texts');
}
function fxClearTexts() { fxEl().classList.remove('texts'); }

// Окно без анимации знака: приглашение и уведомления о паре
async function dialog(ev, resolve) {
  const fx = fxEl();
  const opened = fxOpen();
  fxClearTexts();
  const people = fx.querySelector('.fx-people');
  document.getElementById('fx-mark').hidden = true;
  const other = ev.type === 'invite' ? ev.invite.from : ev.notice.by;
  people.innerHTML = ava(me(), 'ava ava-xl') + '<span class="fx-plus">+</span>' + ava(other, 'ava ava-xl');
  people.hidden = false;
  await sleep(opened ? 350 : 100);
  const who = esc(other ? other.name : 'Кто-то') + (other && other.username ? ' (@' + esc(other.username) + ')' : '');
  const done = () => { fxClose(); resolve(); };
  if (ev.type === 'invite') {
    tap('warning');
    fxTexts('Совместный огонёк', '', [
      { label: 'Принять', primary: true, onClick: async () => { try { await respond(ev.invite.id, true); tap('success'); } catch (e) { toast(e.message); } done(); } },
      { label: 'Отклонить', onClick: async () => { try { await respond(ev.invite.id, false); } catch (e) { toast(e.message); } done(); } },
    ]);
    fx.querySelector('.fx-text').innerHTML = who + ' предлагает вести огонёк вместе. Он растёт, когда вы оба решаете по 5 примеров в день, и гаснет, если кто-то пропустит. Твой одиночный огонёк продолжит считаться в фоне.';
    return;
  }
  const n = ev.notice;
  const T = {
    declined: ['Приглашение отклонено', ' не захотел(а) вести совместный огонёк. Твой одиночный огонёк продолжает гореть.', 'Понятно'],
    ended: ['Совместный огонёк погашен', ' вышел(ла) из пары. Твой одиночный огонёк продолжает гореть.', 'Понятно'],
    accepted: ['Приглашение принято', ' теперь ведёт огонёк вместе с тобой. Он вырастет в день, когда вы оба решите по 5 примеров.', 'Отлично'],
  }[n.type] || ['Совместный огонёк', '', 'Понятно'];
  tap(n.type === 'accepted' ? 'success' : 'warning');
  fxTexts(T[0], '', [{ label: T[2], primary: true, onClick: () => { ack(n.id); done(); } }]);
  fx.querySelector('.fx-text').innerHTML = who + T[1];
}

function fullscreen(ev, s) {
  return new Promise(async (resolve) => {
    if (ev.type === 'invite' || ev.type === 'notice') return dialog(ev, resolve);
    const opened = fxOpen();
    fxClearTexts();
    const left = s.freezesLeft;

    if (ev.type === 'risk') {
      big.apply({ streak: ev.prev, done: false });
      await sleep(opened ? 450 : 150);
      tap('warning');
      const days = ev.missed === 1 ? 'Вчера задание не выполнено.' : 'Пропущено ' + daysWord(ev.missed) + '.';
      fxTexts('Серия под угрозой', days + ' Можно закрыть пропуск заморозкой. Заморозок в этом месяце: ' + left + ' из ' + S.FREEZES + '.', [
        { label: ev.missed === 1 ? 'Спасти серию заморозкой' : 'Потратить ' + freezeWord(ev.missed), primary: true, onClick: () => { resolve(); S.resolveRisk(true); } },
        { label: 'Начать заново', onClick: () => { resolve(); S.resolveRisk(false); } },
      ]);
      return;
    }

    const before = ev.type === 'freeze' ? { streak: s.streak, done: false } : { streak: ev.prev, done: false };
    big.apply(before);
    await sleep(opened ? 450 : 200);
    await big.play(ev, ev.shared ? headState() : stateOf(s));
    let title, text;
    const partner = ev.shared && sharedActive() ? pairData().pair.partner : null;
    if (ev.shared && ev.type === 'loss') {
      title = 'Совместный огонёк погас';
      text = 'Было ' + daysWord(ev.prev) + ' на двоих' + (partner ? ' (партнёр — ' + firstName(partner) + ')' : '') + '. Решите оба по 5 примеров сегодня, чтобы зажечь его заново.';
    } else if (ev.shared) {
      [title, text] = TITLES[ev.stageTo] || ['Огонёк растёт', ''];
      if (ev.stageTo === 1) { title = 'Совместная серия началась'; text = 'Вы оба решили задание дня. Через 4 дня знак превратится в искру.'; }
      text = 'Огонёк на двоих' + (partner ? ', партнёр — ' + firstName(partner) : '') + '. ' + text;
    } else if (ev.type === 'loss') {
      title = 'Серия прервалась';
      text = 'Было ' + daysWord(ev.prev) + ' подряд. Начни заново: 5 верных примеров сегодня.';
    } else if (ev.type === 'freeze') {
      title = ev.mode === 'rescue' ? 'Серия спасена' : 'Огонёк заморожен';
      text = (ev.mode === 'rescue'
        ? 'Пропуск закрыт заморозкой. Сегодня реши 5 примеров, чтобы серия выросла.'
        : 'Сегодня можно отдохнуть: серия не сгорит. Если всё же решишь 5 примеров, заморозка вернётся.') +
        ' Заморозок осталось: ' + left + ' из ' + S.FREEZES + ', новые — ' + nextMonthText(s.today) + '.';
    } else {
      [title, text] = TITLES[ev.stageTo] || ['Серия продлена', ''];
    }
    fxTexts(title, text, [{ label: 'Продолжить', primary: true, onClick: () => { fxClose(); resolve(); } }]);
  });
}

/* ---------- меню серии ---------- */
let sheetTimer = null;
function fmtLeft(ms) {
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return (h ? h + ' ч ' : '') + m + ' мин';
}
function renderSheet() {
  const s = S.get();
  const body = document.getElementById('sheet-body');
  const debug = new URLSearchParams(location.search).has('debug');
  const pct = s.doneToday || s.frozenToday ? 100 : (s.count / S.GOAL) * 100;
  const cf = S.canFreezeToday();
  const flakes = Array.from({ length: S.FREEZES }, (_, i) => '<i class="' + (i < s.freezesLeft ? 'on' : '') + '"></i>').join('');
  body.innerHTML =
    (sharedActive()
      ? '<div class="sh-top"><div class="sh-mark" id="sh-mark"></div><div><div class="sh-big">' + daysWord(pairData().pair.streak) + '</div>' +
        '<div class="muted">Партнёр: ' + esc(firstName(pairData().pair.partner)) + ' · лучшая ' + pairData().pair.best + '</div><div class="muted small">Личная серия: ' + daysWord(s.streak) + '</div></div></div>'
      : '<div class="sh-top"><div class="sh-mark" id="sh-mark"></div><div>' +
        '<div class="sh-big">' + daysWord(s.streak) + '</div>' +
        '<div class="muted">Лучшая серия: ' + daysWord(s.best) + '</div></div></div>') +
    '<div class="sh-prog"><div class="sh-prog-row"><span>' +
      (s.doneToday ? 'Сегодня выполнено' : s.frozenToday ? 'Сегодня заморожено' : 'Сегодня: ' + s.count + ' из ' + S.GOAL + ' верных') + '</span>' +
      '<span class="muted" id="sh-left"></span></div>' +
      '<div class="bar' + (s.frozenToday ? ' frost' : '') + '"><i style="width:' + pct + '%"></i></div></div>' +
    '<div class="sh-freeze"><div class="sh-freeze-row"><span>Заморозки</span><span class="flakes" aria-label="Заморозок осталось: ' + s.freezesLeft + '">' + flakes + '</span></div>' +
      '<p class="muted small">Заморозок осталось: ' + s.freezesLeft + ' из ' + S.FREEZES + ', новые — ' + nextMonthText(s.today) + '. Заморозка закрывает день без решения: серия не растёт, но и не сгорает.</p>' +
      (cf.ok ? '<button class="btn ghost" data-f="today">Заморозить сегодня</button>' : '<p class="small sh-why">' + cf.why + '</p>') +
    '</div>' +
    pairSection() +
    '<h3>Правила</h3><ul class="sh-rules">' +
      '<li>Реши ' + S.GOAL + ' примеров верно за день — в любом режиме: по темам, в марафоне или в генераторе.</li>' +
      '<li>День считается по московскому времени. Новый день и обновление огня — в 00:00 МСК.</li>' +
      '<li>Пропустишь день — серия сгорит. Если остались заморозки, приложение предложит спасти серию.</li>' +
      '<li>' + S.FREEZES + ' заморозки в месяц. Их можно потратить заранее кнопкой выше или задним числом.</li>' +
      '<li>Пока задание дня не выполнено, знак серый; заморожен — белый.</li>' +
      '<li>Совместный огонёк растёт, когда оба решили задание дня, и гаснет, если кто-то пропустил день без заморозки.</li></ul>' +
    '<h3>Ступени</h3><div class="sh-stages">' +
      S.STAGES.map((st, i) => '<div class="sh-st' + (s.stage >= i + 1 ? ' on' : '') + '"><div class="sh-mini" data-mini="' + st.from + '"></div><b>' + st.from + '</b><span>' + st.name + '</span></div>').join('') +
    '</div>' +
    (debug ? '<h3>Отладка</h3><div class="sh-debug">' +
      '<button class="btn ghost" data-d="one">+1 верный</button><button class="btn ghost" data-d="day">Решить день</button>' +
      '<button class="btn ghost" data-d="next">Следующий день</button><button class="btn ghost" data-d="skip">Пропустить день</button>' +
      '<button class="btn ghost" data-d="skip2">Пропустить 2 дня</button><button class="btn ghost" data-d="refill">Вернуть заморозки</button>' +
      '<button class="btn ghost" data-d="4">Серия 4</button><button class="btn ghost" data-d="29">Серия 29</button>' +
      '<button class="btn ghost" data-d="59">Серия 59</button><button class="btn ghost" data-d="99">Серия 99</button>' +
      '<button class="btn ghost" data-d="reset">Сброс</button></div>' : '');
  createMark(document.getElementById('sh-mark')).apply(headState());
  wirePairSection(body);
  body.querySelectorAll('[data-mini]').forEach((n) => createMark(n).apply({ streak: +n.dataset.mini, done: true }));
  const left = document.getElementById('sh-left');
  const upd = () => { left.textContent = 'новый день через ' + fmtLeft(S.msToReset()); };
  upd(); clearInterval(sheetTimer); sheetTimer = setInterval(upd, 30000);
  body.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => debugAction(b.dataset.d)));
  const fb = body.querySelector('[data-f="today"]');
  if (fb) fb.addEventListener('click', () => { closeSheet(); setTimeout(() => S.freezeToday(), 250); });
}
function pairSection() {
  let h = '<h3>Огонёк</h3>';
  if (!apiEnabled()) return h + '<p class="muted small">Совместный огонёк пока недоступен.</p>';
  if (!signedIn()) return h + '<p class="small">Огонёк можно вести вдвоём с другом. Для этого нужен вход через Telegram.</p><button class="btn ghost" data-pm="login">Войти</button>';
  const d = pairData() || {};
  if (d.pair) {
    const p = d.pair, t = p.today;
    const st = (x) => (x.done ? 'выполнено' : x.frozen ? 'заморожено' : x.count + ' из ' + S.GOAL);
    return h + '<div class="pair-card"><div class="pair-avas">' + ava(me()) + ava(p.partner) + '</div><div><b>Партнёр: ' + esc(p.partner.name) + '</b>' +
      (p.partner.username ? '<span class="muted small"> @' + esc(p.partner.username) + '</span>' : '') + '</div></div>' +
      '<div class="pair-today"><div class="' + (t.me.done ? 'ok' : '') + '"><span>Ты</span><b>' + st(t.me) + '</b></div><div class="' + (t.partner.done ? 'ok' : '') + '"><span>' + esc(firstName(p.partner)) + '</span><b>' + st(t.partner) + '</b></div></div>' +
      pokeButton(p) +
      '<button class="link pair-leave" data-pm="leave">Выйти из совместного огонька</button>';
  }
  if (d.outgoing) {
    const to = d.outgoing.to || {};
    return h + '<p class="small">Приглашение отправлено ' + esc(to.name || '') + (to.username ? ' (@' + esc(to.username) + ')' : '') + '. Ждём ответа.</p><button class="btn ghost" data-pm="cancel">Отменить приглашение</button>';
  }
  return h + '<div class="seg2" role="radiogroup" aria-label="Режим огонька"><button class="on" role="radio" aria-checked="true" data-pm="solo">Одиночный</button><button role="radio" aria-checked="false" data-pm="shared">Совместный</button></div>' +
    '<div class="pair-form" hidden><label class="rp-label" for="pair-user">Юзернейм друга в Telegram</label><div class="ans-row"><input id="pair-user" class="ans" placeholder="@username" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn primary" data-pm="invite">Пригласить</button></div>' +
    '<p class="muted small">Друг должен хотя бы раз открыть тренажёр. Он увидит запрос при входе и сможет принять или отклонить, а бот напишет ему в личку.</p><p class="small err" id="pair-err"></p></div>';
}

// «Пнуть» доступно, когда ты решил, а партнёр — нет; не чаще раза в 3 часа
function pokeButton(p) {
  const t = p.today;
  if (!t.me.done || t.partner.done || t.partner.frozen) return '';
  const wait = (p.pokeAvailableAt || 0) - Date.now();
  if (wait > 0) {
    const mins = Math.ceil(wait / 60000);
    return '<p class="muted small">Пнуть ещё раз можно через ' + (mins >= 60 ? Math.floor(mins / 60) + ' ч ' : '') + (mins % 60) + ' мин.</p>';
  }
  return '<button class="btn primary pair-poke" data-pm="poke">Пнуть партнёра</button><p class="muted small">' + esc(firstName(p.partner)) + ' получит напоминание в личку от бота. Можно раз в 3 часа.</p>';
}

function wirePairSection(body) {
  body.querySelectorAll('[data-pm]').forEach((b) => b.addEventListener('click', async () => {
    const a = b.dataset.pm;
    if (a === 'login') { closeSheet(); setTimeout(openAccount, 300); }
    else if (a === 'shared' || a === 'solo') {
      body.querySelectorAll('.seg2 button').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); });
      body.querySelector('.pair-form').hidden = a === 'solo';
      if (a === 'shared') body.querySelector('#pair-user').focus({ preventScroll: true });
    } else if (a === 'invite') {
      const v = body.querySelector('#pair-user').value.trim();
      const err = body.querySelector('#pair-err');
      if (!v) { err.textContent = 'Впиши юзернейм друга'; return; }
      b.disabled = true; err.textContent = '';
      try { const r = await invite(v); tap('success'); toast('Приглашение отправлено: ' + (r.to && r.to.name ? r.to.name : v)); renderSheet(); }
      catch (e) { err.textContent = e.message; b.disabled = false; }
    } else if (a === 'poke') {
      b.disabled = true;
      try { const r = await poke(); tap('rigid'); toast(r.delivered ? 'Пинок отправлен в личку' : 'Пинок записан — партнёр увидит его в тренажёре'); renderSheet(); }
      catch (e) { toast(e.message); b.disabled = false; }
    } else if (a === 'cancel') {
      try { await leave(); toast('Приглашение отменено'); renderSheet(); } catch (e) { toast(e.message); }
    } else if (a === 'leave') {
      if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Точно выйти? Нажми ещё раз'; return; }
      try { await leave(); toast('Ты вышел из совместного огонька'); closeSheet(); } catch (e) { toast(e.message); }
    }
  }));
}

function debugAction(d) {
  const today = S.dayKey();
  closeSheet();
  setTimeout(() => {
    if (d === 'one') S.registerCorrect();
    else if (d === 'day') { for (let i = 0; i < S.GOAL; i++) S.registerCorrect(); }
    else if (d === 'next') { S.shiftDays(1); S.tick(); }
    else if (d === 'skip') { S.shiftDays(2); S.tick(); }
    else if (d === 'skip2') { S.shiftDays(3); S.tick(); }
    else if (d === 'refill') S.debugSet({ freeze: { month: null, used: 0 } });
    else if (d === 'reset') S.debugSet({ streak: 0, best: 0, lastDone: null, lastCovered: null, count: 0, day: today, frozen: [], freeze: { month: null, used: 0 }, pending: null });
    else S.debugSet({ streak: +d, lastDone: S.prevDay(today), lastCovered: S.prevDay(today), count: 0, day: today, pending: null, best: Math.max(S.get().best, +d) });
  }, 250);
}
export function openSheet() {
  const bd = document.getElementById('sheet');
  renderSheet();
  bd.hidden = false;
  bd.querySelector('.sheet').scrollTop = 0;
  requestAnimationFrame(() => bd.classList.add('show'));
}
export function closeSheet() {
  const bd = document.getElementById('sheet');
  bd.classList.remove('show');
  clearInterval(sheetTimer);
  setTimeout(() => { bd.hidden = true; }, 300);
}

export function initStreakUI() {
  head = createMark(document.getElementById('streak-btn'));
  big = createMark(document.getElementById('fx-mark'));
  head.apply(headState());
  updateHeader(S.get());

  document.getElementById('streak-btn').addEventListener('click', openSheet);
  const sheet = document.getElementById('sheet');
  sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('.sheet-close')) closeSheet(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });

  S.onStreak((ev, s) => {
    updateHeader(s);
    if (ev.type === 'progress') return;
    // В совместном режиме знак показывает пару: личные события — короткими уведомлениями
    if (sharedActive() && ev.type !== 'risk') {
      const p = pairData().pair;
      if (ev.type === 'extend') { toast(p.today.partner.done ? 'Оба справились — совместный огонёк растёт' : 'Твоя часть на сегодня выполнена. Ждём партнёра: ' + firstName(p.partner)); refreshSoon(3000); }
      else if (ev.type === 'freeze') { toast('День заморожен: совместный огонёк не погаснет из-за тебя'); refreshSoon(3000); }
      else if (ev.type === 'loss') toast('Личная серия прервалась. Совместный огонёк считается отдельно');
      else { head.apply(headState(), true); refreshSoon(800); }
      return;
    }
    if (ev.type === 'newday' || ev.type === 'sync') { chain = chain.then(() => head.play(ev, headState())); return; }
    if (ev.type === 'risk' || ev.type === 'loss' || ev.type === 'freeze') { chain = chain.then(() => fullscreen(ev, s)); return; }
    if (ev.type === 'extend') {
      const key = ev.streak === 1 || ev.stageTo > ev.stageFrom;
      if (key) chain = chain.then(() => fullscreen(ev, s));
      else {
        chain = chain.then(() => head.play(ev, stateOf(s)));
        toast('Серия продлена: ' + daysWord(ev.streak));
      }
    }
  });

  onPair((ev) => {
    updateHeader(S.get());
    if (ev.type === 'pair-state') { if (fxEl().hidden) head.apply(headState(), true); return; }
    if (ev.type === 'poked') { tap('warning'); toast('👉 ' + firstName(ev.partner) + ' пинает тебя: реши задание дня, огонёк ждёт'); return; }
    if (ev.type === 'invite' || ev.type === 'notice') { chain = chain.then(() => fullscreen(ev, S.get())); return; }
    if (ev.type === 'loss') { chain = chain.then(() => fullscreen(ev, S.get())); return; }
    if (ev.type === 'extend') {
      const key = ev.streak === 1 || ev.stageTo > ev.stageFrom;
      if (key) chain = chain.then(() => fullscreen(ev, S.get()));
      else { chain = chain.then(() => head.play(ev, headState())); toast('Совместный огонёк: ' + daysWord(ev.streak)); }
    }
  });
}
