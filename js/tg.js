// Telegram Mini App: всё, что работает только внутри Telegram. Вне Telegram функции молча ничего не делают.
export const tg = (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) || null;
export const inTelegram = !!(tg && tg.initData);

export function initTelegram() {
  if (!inTelegram) return;
  try {
    tg.ready();
    tg.expand();
    if (tg.setHeaderColor) tg.setHeaderColor('#000000');
    if (tg.setBackgroundColor) tg.setBackgroundColor('#000000');
    if (tg.isVersionAtLeast && tg.isVersionAtLeast('7.7') && tg.disableVerticalSwipes) tg.disableVerticalSwipes();
    document.documentElement.classList.add('in-telegram');
  } catch (e) { /* старые клиенты */ }
}

export function openLink(url) {
  if (inTelegram && tg.openLink) tg.openLink(url);
  else window.open(url, '_blank', 'noopener');
}

// Поделиться текстом и ссылкой: в Telegram — выбор чата, иначе системное меню или копирование
export async function share(text, url) {
  if (inTelegram && tg.openTelegramLink) {
    tg.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(text));
    return 'telegram';
  }
  if (navigator.share) {
    try { await navigator.share({ text, url }); return 'native'; } catch (e) { return 'cancel'; }
  }
  try { await navigator.clipboard.writeText(text + ' ' + url); return 'copied'; } catch (e) { return 'fail'; }
}

export const tgUser = () => (inTelegram && tg.initDataUnsafe && tg.initDataUnsafe.user) || null;
