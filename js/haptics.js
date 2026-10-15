// Вибрация. В Telegram — через HapticFeedback, в браузере — navigator.vibrate (Android; на iPhone в браузере вибрации нет).
// tap() — одиночный отклик на верный ответ; rhythm() — ритм для анимаций огня.
import { tg, inTelegram } from './tg.js';
import { load, save } from './storage.js';

let enabled = load('haptics', true);
export const hapticsOn = () => enabled;
export function setHaptics(v) { enabled = !!v; save('haptics', enabled); }

const WEB = { light: 10, soft: 12, medium: 20, rigid: 24, heavy: 35, success: [20, 60, 20], error: [40, 60, 40], warning: 30 };
function pulse(style) {
  if (inTelegram && tg.HapticFeedback) {
    try {
      if (style === 'success' || style === 'error' || style === 'warning') tg.HapticFeedback.notificationOccurred(style);
      else tg.HapticFeedback.impactOccurred(style);
    } catch (e) { /* старый клиент */ }
  } else if (navigator.vibrate) {
    try { navigator.vibrate(WEB[style] || 15); } catch (e) { /* нет поддержки */ }
  }
}

// Одиночная вибрация
export function tap(style = 'medium') { if (enabled) pulse(style); }

// Ритмы: [задержка мс, сила]. Удар палочки по точке — отдельная одиночная вибрация (mark.js → strike).
const RHYTHMS = {
  start: [[140, 'light'], [260, 'medium']],                                       // серия началась (после удара)
  fire: [[160, 'light'], [300, 'light'], [440, 'medium'], [620, 'heavy'], [900, 'heavy']], // точка → искра (после удара)
  flare: [[0, 'medium'], [180, 'heavy']],                                         // огонь разгорается утром
  stage: [[0, 'light'], [110, 'light'], [220, 'medium'], [340, 'medium'], [480, 'heavy'], [760, 'heavy']], // новая ступень
  freeze: [[0, 'light'], [70, 'light'], [140, 'light'], [210, 'light'], [400, 'rigid']], // хруст льда
  loss: [[0, 'rigid'], [420, 'soft'], [900, 'soft']],                             // угасание
  tick: [[0, 'light']],                                                           // отсчёт дуэли
  go: [[0, 'heavy'], [90, 'heavy']],                                              // старт дуэли
  win: [[0, 'medium'], [120, 'medium'], [240, 'heavy'], [520, 'heavy']],          // победа
  lose: [[0, 'soft'], [300, 'soft']],                                             // поражение
};
export function rhythm(name) {
  if (!enabled) return;
  (RHYTHMS[name] || []).forEach(([t, s]) => setTimeout(() => pulse(s), t));
}
