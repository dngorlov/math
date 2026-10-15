// Знак серии: серый логотип → «!» с числом → огонь по ступеням.
// createMark(container) возвращает объект с методами apply() и play*().
// Холст 1024×1024. Все трансформации — через Web Animations API, поэтому переходы плавные и прерываемые.
import { stageOf } from './streak.js';
import { rhythm, tap } from './haptics.js';

const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((r) => setTimeout(r, reduce() ? 0 : ms));

export const EASE = {
  io: 'cubic-bezier(.65,0,.35,1)',
  out: 'cubic-bezier(.22,1,.36,1)',
  in: 'cubic-bezier(.55,0,1,.45)',
  spring: 'cubic-bezier(.34,1.4,.64,1)',
  soft: 'cubic-bezier(.3,1.2,.5,1)',
};

/* ---------- геометрия ---------- */
const P = {
  chev: { b1: [517, 314, 45], b2: [517, 709, -45], dot: [715, 512] },
  bang: { b1: [320, 431, 90], b2: [320, 431, -90], dot: [320, 698] },
};
const STICK_X = 320, STICK_Y = 431, DOT_Y = 698, DOT_BOTTOM = 748;
// Масштаб огня по ступеням: композиция всегда влезает в квадрат с запасом
const FIRE_SCALE = { 2: 2.2, 3: 1.85, 4: 1.85, 5: 1.8 };
const fireT = (stage, lit) => {
  const s = FIRE_SCALE[stage] || 2.2;
  return 'translate(512px,' + (512 + 150 * s) + 'px) scale(' + (lit ? s : s * 0.9) + ')';
};
const FIRE_HIDDEN = 'translate(' + STICK_X + 'px,' + DOT_BOTTOM + 'px) scale(0.15)';
const barT = ([x, y, a]) => 'translate(' + x + 'px,' + y + 'px) rotate(' + a + 'deg)';
const dotT = ([x, y], s = 1) => 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')';

const PO = 'M0,-300 C40,-230 110,-180 110,-90 C110,-30 60,0 0,0 C-60,0 -110,-30 -110,-90 C-110,-150 -75,-180 -60,-215 C-50,-180 -35,-160 -20,-155 C-25,-210 -15,-260 0,-300 Z';
const PI_ = 'M4,-200 C30,-150 70,-120 70,-70 C70,-25 40,-5 0,-5 C-40,-5 -70,-25 -70,-70 C-70,-110 -45,-130 -35,-150 C-30,-125 -20,-110 -10,-108 C-12,-145 -6,-175 4,-200 Z';
const PC = 'M3,-155 C26,-118 58,-95 58,-55 C58,-24 33,-8 0,-8 C-33,-8 -58,-24 -58,-55 C-58,-88 -36,-108 -27,-122 C-22,-104 -12,-96 -5,-94 C-8,-118 -4,-138 3,-155 Z';

function flame(tf, c1, c2) {
  return '<g transform="' + tf + '"><path class="ly ' + c1 + '" fill="#ff0000" d="' + PO + '"/>' +
    '<g class="ly ' + c2 + '"><path fill="#fff" d="' + PI_ + '"/><path class="core" fill="#000" d="' + PC + '"/></g></g>';
}

const TPL =
  '<svg class="mark-svg" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<rect class="tile" width="1024" height="1024" rx="180"/>' +
  '<g class="ring-g" data-r="ring"><circle r="100" fill="none" stroke="#ff0000" stroke-width="3" vector-effect="non-scaling-stroke" opacity="0"/></g>' +
  '<g class="fl" data-r="fl"><g class="flc">' +
    '<g class="f-top"><g class="wrap-b" data-r="topw">' +
      flame('translate(-60,-135) rotate(-10) scale(.5)', 'a5', 'a6') + flame('translate(60,-135) rotate(10) scale(-.5,.5)', 'a6', 'a5') +
    '</g></g>' +
    '<g class="f-side"><g class="wrap-b" data-r="sidew">' +
      flame('translate(-92,0) rotate(-16) scale(.62)', 'a3', 'a4') + flame('translate(92,0) rotate(16) scale(-.62,.62)', 'a4', 'a3') +
    '</g></g>' +
    '<path class="ly a1" fill="#ff0000" d="' + PO + '"/>' +
    '<g class="ly a2"><path fill="#fff" d="' + PI_ + '"/><path class="core" fill="#000" d="' + PC + '"/>' +
      '<text class="num" data-r="num" x="0" y="-44" text-anchor="middle" font-size="64" font-weight="700">5</text></g>' +
  '</g></g>' +
  '<g class="markg" data-r="markg">' +
    '<g data-r="dg"><g data-r="dsq" class="dsq"><circle class="dot" r="50"/></g></g>' +
    '<rect class="stick" data-r="b1" x="-155" y="-49" width="310" height="98"/>' +
    '<rect class="stick" data-r="b2" x="-155" y="-49" width="310" height="98"/>' +
    '<text class="bnum" data-r="bnum" x="600" y="748" text-anchor="middle" font-size="540" font-weight="700">1</text>' +
  '</g></svg>';

export function createMark(container) {
  container.innerHTML = TPL;
  const svg = container.querySelector('svg');
  const q = (n) => svg.querySelector('[data-r="' + n + '"]');
  const el = { b1: q('b1'), b2: q('b2'), dg: q('dg'), dsq: q('dsq'), fl: q('fl'), num: q('num'), bnum: q('bnum'), markg: q('markg'), sidew: q('sidew'), topw: q('topw'), ring: q('ring') };
  let busy = Promise.resolve();
  let shown = { streak: 0, done: false };

  // Трансформация с запоминанием текущего значения, чтобы анимация шла от фактического положения
  function T(node, t, dur = 0, ease = EASE.io, delay = 0) {
    const from = node._t || t;
    node._t = t;
    node.getAnimations().forEach((a) => { if (a._kind === 'T') a.cancel(); });
    node.style.transform = t;
    if (dur && !reduce() && from !== t) {
      const a = node.animate([{ transform: from }, { transform: t }], { duration: dur, easing: ease, delay, fill: 'backwards' });
      a._kind = 'T';
      return a.finished.catch(() => {});
    }
    return Promise.resolve();
  }
  function O(node, o, dur = 0, delay = 0, ease = EASE.out) {
    const from = node._o == null ? o : node._o;
    node._o = o;
    node.getAnimations().forEach((a) => { if (a._kind === 'O') a.cancel(); });
    node.style.opacity = o;
    if (dur && !reduce() && from !== o) {
      const a = node.animate([{ opacity: from }, { opacity: o }], { duration: dur, easing: ease, delay, fill: 'backwards' });
      a._kind = 'O';
    }
  }
  function setNum(node, v) {
    node.textContent = v;
    if (node === el.num) {
      const len = String(v).length;
      node.setAttribute('font-size', len <= 2 ? 64 : len === 3 ? 50 : 40);
      node.setAttribute('y', len <= 2 ? -44 : len === 3 ? -48 : -50);
    }
  }
  function data(k, v) { svg.dataset[k] = v; }

  function ring(y, scale, dur = 750, x = 512) {
    if (reduce()) return;
    const c = el.ring.firstChild;
    el.ring.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    c.animate([{ transform: 'scale(.4)', opacity: 1, strokeWidth: 10 }, { transform: 'scale(' + scale + ')', opacity: 0, strokeWidth: 1 }],
      { duration: dur, easing: EASE.out });
  }
  function squash() {
    if (reduce()) return;
    el.dsq.animate([{ transform: 'scale(1.45,.6)' }, { transform: 'scale(.9,1.12)', offset: .45 }, { transform: 'scale(1.03,.97)', offset: .75 }, { transform: 'scale(1)' }],
      { duration: 560, easing: EASE.out });
  }
  function flip(node, v, dist = 50) {
    if (reduce()) { setNum(node, v); return; }
    const out = node.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(' + -dist + 'px)', opacity: 0 }], { duration: 220, easing: EASE.in, fill: 'forwards' });
    out.finished.then(() => {
      setNum(node, v);
      out.cancel();
      node.animate([{ transform: 'translateY(' + dist + 'px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 480, easing: EASE.spring });
    }).catch(() => {});
  }

  // Мгновенно или плавно привести знак к состоянию серии
  function apply(state, animate = false) {
    const d = animate ? 700 : 0;
    const stage = stageOf(state.streak);
    const pose = stage === 0 ? 'chev' : stage === 1 ? 'bang' : 'fire';
    data('pose', pose); data('stage', stage); data('done', state.done ? 1 : 0); data('lit', state.done ? 1 : 0); data('frozen', state.frozen && !state.done ? 1 : 0);
    T(el.markg, 'rotate(0deg)'); O(el.markg, 1);
    if (pose === 'fire') {
      setNum(el.num, state.streak);
      T(el.fl, fireT(stage, state.done), d, EASE.soft); O(el.fl, 1, d);
      O(el.b1, 0, d); O(el.b2, 0, d); O(el.dg, 0, d); O(el.bnum, 0, d);
    } else {
      const p = P[pose];
      T(el.b1, barT(p.b1), d); T(el.b2, barT(p.b2), d); T(el.dg, dotT(p.dot), d);
      O(el.b1, 1, d); O(el.b2, 1, d); O(el.dg, 1, d);
      setNum(el.bnum, state.streak);
      O(el.bnum, pose === 'bang' ? 1 : 0, d);
      O(el.fl, 0, d); T(el.fl, FIRE_HIDDEN);
    }
    shown = { ...state };
  }

  // Удар палочки по точке; onImpact вызывается в момент касания
  async function strike(onImpact) {
    const kf = (a) => [
      { transform: barT([STICK_X, STICK_Y, a]), easing: EASE.out },
      { transform: barT([STICK_X, STICK_Y - 52, a]), offset: 0.42, easing: EASE.in },
      { transform: barT([STICK_X, STICK_Y + 62, a]), offset: 0.56, easing: EASE.out },
      { transform: barT([STICK_X, STICK_Y - 8, a]), offset: 0.8, easing: EASE.io },
      { transform: barT([STICK_X, STICK_Y, a]) },
    ];
    if (!reduce()) { el.b1.animate(kf(90), { duration: 860 }); el.b2.animate(kf(-90), { duration: 860 }); }
    await wait(860 * 0.56);
    tap('heavy');
    onImpact();
    await wait(860 * 0.44);
  }

  // День 1: серый логотип центрируется и становится «!»
  async function playStart() {
    data('pose', 'bang'); data('stage', 1); data('done', 0);
    O(el.bnum, 0); setNum(el.bnum, 1);
    const p = P.bang;
    T(el.b1, barT(p.b1), 1100, EASE.io); T(el.b2, barT(p.b2), 1100, EASE.io); T(el.dg, dotT(p.dot), 1100, EASE.io);
    await wait(1250);
    await strike(() => { data('done', 1); squash(); ring(DOT_Y, 2.6, 750, STICK_X); rhythm('start'); });
    T(el.bnum, 'translate(0px,60px) scale(.6)'); T(el.bnum, 'translate(0px,0px) scale(1)', 800, EASE.spring); O(el.bnum, 1, 450);
    await wait(700);
    shown = { streak: 1, done: true };
  }

  // Обычный день на «!»: удар и новая цифра
  async function playBang(n) {
    data('pose', 'bang'); data('done', 0);
    data('frozen', 0);
    await strike(() => { data('done', 1); squash(); ring(DOT_Y, 2.2, 750, STICK_X); flip(el.bnum, n, 70); });
    await wait(300);
    shown = { streak: n, done: true };
  }

  // 5 дней: точка разрастается в огонь и вытесняет остальное
  async function playFireBirth(n) {
    data('pose', 'bang'); data('done', 0); data('frozen', 0);
    await strike(() => { data('done', 1); squash(); rhythm('fire'); });
    data('stage', 2); data('lit', 1); setNum(el.num, n);
    T(el.fl, FIRE_HIDDEN); O(el.fl, 0);
    T(el.fl, fireT(2, true), 1500, EASE.soft); O(el.fl, 1, 350);
    O(el.dg, 0, 500, 200); O(el.b1, 0, 600, 100); O(el.b2, 0, 600, 100);
    T(el.bnum, 'translate(0px,40px) scale(.8)', 500, EASE.in); O(el.bnum, 0, 400);
    if (!reduce()) el.num.animate([{ opacity: 0, transform: 'scale(.3)' }, { opacity: 0, transform: 'scale(.3)', offset: .55 }, { opacity: 1, transform: 'scale(1.15)', offset: .82 }, { opacity: 1, transform: 'scale(1)' }], { duration: 1500, easing: EASE.out });
    await wait(350); ring(500, 4.4, 1000);
    await wait(1300);
    shown = { streak: n, done: true };
  }

  // Огонь: вспышка утром серого огня, при новой ступени — появление новых языков
  async function playFlare(n, stageFrom, stageTo) {
    data('stage', stageTo); data('lit', 1); data('done', 1); data('frozen', 0);
    rhythm(stageTo > stageFrom ? 'stage' : 'flare');
    T(el.fl, fireT(stageTo, true), 1100, EASE.soft);
    flip(el.num, n, 40);
    if (!reduce()) {
      if (stageTo === 3 && stageFrom < 3) el.sidew.animate([{ transform: 'scale(.12,.08)' }, { transform: 'scale(1.08,1.18)', offset: .7 }, { transform: 'scale(1)' }], { duration: 1200, easing: EASE.out, delay: 150 });
      if (stageTo === 4 && stageFrom < 4) svg.querySelectorAll('.core').forEach((c) => c.animate([{ transform: 'scale(.1)' }, { transform: 'scale(1.12)', offset: .7 }, { transform: 'scale(1)' }], { duration: 1100, easing: EASE.out, delay: 200 }));
      if (stageTo === 5 && stageFrom < 5) el.topw.animate([{ transform: 'translateY(120px) scale(.15,.1)' }, { transform: 'translateY(-8px) scale(1.08,1.25)', offset: .7 }, { transform: 'translateY(0) scale(1)' }], { duration: 1200, easing: EASE.out, delay: 150 });
    }
    ring(500, stageTo > stageFrom ? 4.6 : 3.4, stageTo > stageFrom ? 1000 : 750);
    await wait(stageTo > stageFrom ? 1500 : 1000);
    shown = { streak: n, done: true };
  }

  // Потеря серии: всё сереет, «!» переворачивается в «¡», затем возвращается серый логотип
  async function playLoss() {
    const wasFire = svg.dataset.pose === 'fire';
    rhythm('loss');
    data('pose', 'lost'); data('done', 0); data('lit', 0); data('frozen', 0);
    const p = P.bang;
    if (wasFire) {
      T(el.b1, barT(p.b1)); T(el.b2, barT(p.b2)); T(el.dg, dotT(p.dot));
      T(el.fl, FIRE_HIDDEN, 1200, EASE.in); O(el.fl, 0, 600, 700);
      O(el.dg, 1, 500, 800); O(el.b1, 1, 600, 900); O(el.b2, 1, 600, 900);
      await wait(1600);
    } else {
      O(el.bnum, 0, 500);
      await wait(700);
    }
    T(el.markg, 'rotate(180deg)', 1200, EASE.spring);
    await wait(1700);
    O(el.markg, 0, 500);
    await wait(550);
    apply({ streak: 0, done: false });
    O(el.markg, 0); O(el.markg, 1, 700);
    await wait(700);
  }

  // Заморозка: знак покрывается «льдом», от него расходится белое кольцо
  async function playFreeze(state) {
    const pose = svg.dataset.pose;
    rhythm('freeze');
    data('frozen', 1);
    const y = pose === 'fire' ? 500 : DOT_Y;
    if (!reduce()) {
      el.ring.firstChild.setAttribute('stroke', '#ffffff');
      ring(y, pose === 'fire' ? 4.2 : 2.6, 900, pose === 'fire' ? 512 : STICK_X);
      const target = pose === 'fire' ? el.fl : el.markg;
      target.animate([{ filter: 'none' }, { filter: 'brightness(1.8)' }, { filter: 'none' }], { duration: 700, easing: EASE.out });
      if (pose !== 'fire') squash();
      setTimeout(() => el.ring.firstChild.setAttribute('stroke', '#ff0000'), 950);
    }
    await wait(1300);
    apply(state, true);
    await wait(500);
  }

  function queue(fn) { busy = busy.then(fn, fn); return busy; }

  return {
    el: container,
    apply: (s, animate) => apply(s, animate),
    get shown() { return shown; },
    // Сыграть переход для события серии и дождаться окончания
    play(ev, state) {
      return queue(async () => {
        if (ev.type === 'loss') return playLoss();
        if (ev.type === 'freeze') return playFreeze(state);
        if (ev.type === 'extend') {
          if (ev.streak === 1) return playStart();
          if (ev.stageTo === 1) return playBang(ev.streak);
          if (ev.stageTo === 2 && ev.stageFrom < 2) return playFireBirth(ev.streak);
          return playFlare(ev.streak, ev.stageFrom, ev.stageTo);
        }
        apply(state, true);
      });
    },
  };
}
