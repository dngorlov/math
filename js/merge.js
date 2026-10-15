// Слияние состояний с разных устройств. Один и тот же код работает в браузере и на сервере (worker импортирует этот файл).
// Состояние: { streak: {...}, best: { oral, written }, settings: {...}, settingsAt }

const later = (a, b) => ((a || '') > (b || '') ? a : b);

export function mergeStreak(x, y) {
  if (!x) return y || null;
  if (!y) return x;
  // Правка из админки (adminAt) побеждает целиком, пока устройство её не увидело
  if ((x.adminAt || 0) !== (y.adminAt || 0)) return (x.adminAt || 0) > (y.adminAt || 0) ? { ...x } : { ...y };
  // Главное — у кого позже последний закрытый день (решён или заморожен), затем последний решённый
  let primary = x, other = y;
  const kx = (x.lastCovered || '') + '|' + (x.lastDone || '');
  const ky = (y.lastCovered || '') + '|' + (y.lastDone || '');
  if (ky > kx || (ky === kx && (y.streak || 0) > (x.streak || 0))) { primary = y; other = x; }
  const out = { ...primary };
  out.best = Math.max(x.best || 0, y.best || 0, out.streak || 0);
  // Прогресс дня: если день совпадает — берём больший
  if (x.day && x.day === y.day) out.count = Math.max(x.count || 0, y.count || 0);
  // Заморозки: в одном месяце — больше использованных (честнее), иначе более поздний месяц
  const fx = x.freeze || {}, fy = y.freeze || {};
  if (fx.month && fx.month === fy.month) out.freeze = { month: fx.month, used: Math.max(fx.used || 0, fy.used || 0) };
  else out.freeze = (fx.month || '') > (fy.month || '') ? fx : fy;
  out.frozen = [...new Set([...(x.frozen || []), ...(y.frozen || [])])].sort().slice(-60);
  out.updated = Math.max(x.updated || 0, y.updated || 0);
  // Незакрытый пропуск оставляем, только если он относится к выбранному состоянию
  out.pending = primary.pending || null;
  if (other.lastCovered && primary.lastCovered === other.lastCovered && !primary.pending) out.pending = null;
  return out;
}

export function mergeState(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  const ba = a.best || {}, bb = b.best || {};
  return {
    streak: mergeStreak(a.streak, b.streak),
    best: { oral: Math.max(ba.oral || 0, bb.oral || 0), written: Math.max(ba.written || 0, bb.written || 0) },
    settings: (a.settingsAt || 0) >= (b.settingsAt || 0) ? (a.settings || {}) : (b.settings || {}),
    settingsAt: Math.max(a.settingsAt || 0, b.settingsAt || 0),
  };
}

export const sameState = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export { later };
