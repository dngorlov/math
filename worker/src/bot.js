// Вызовы Telegram Bot API
export async function tg(env, method, payload) {
  try {
    const r = await fetch('https://api.telegram.org/bot' + env.BOT_TOKEN + '/' + method, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    if (!data.ok) console.error('Telegram ' + method, JSON.stringify(data));
    return data;
  } catch (e) {
    console.error('Telegram ' + method, e.message);
    return { ok: false, description: e.message };
  }
}
export const appUrl = (env, param) => 'https://t.me/' + env.BOT_USERNAME + '/' + env.APP_NAME + (param ? '?startapp=' + param : '');
export const escHtml = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
// Личное сообщение с кнопкой, открывающей Mini App прямо в чате с ботом
export function dm(env, userId, html, button = 'Открыть тренажёр', param) {
  return tg(env, 'sendMessage', {
    chat_id: userId, text: html, parse_mode: 'HTML', link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: [[{ text: button, web_app: { url: env.SITE_URL + (param ? '#/' + param : '') } }]] },
  });
}
