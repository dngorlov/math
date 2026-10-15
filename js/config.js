// Настройки проекта. Меняй здесь, остальной код трогать не нужно.
export const CONFIG = {
  BRAND: '!¡ матан',
  // Адрес Cloudflare Worker
  API_BASE: 'https://https://matan-api.matan444ik.workers.dev',
  // Username бота без 
  BOT_USERNAME: 'matan444ik_trainbot',
  // Короткое имя Mini App из @BotFather (/newapp): ссылка 
  APP_NAME: 't.me/matan444ik_trainbot/trainer',
  // Репозиторий для сообщений об ошибках: 
  GITHUB_REPO: 'dngorlov/math',
  // Серия: верных ответов в день, заморозок в месяц, смещение МСК от UTC
  STREAK_GOAL: 5,
  FREEZES_PER_MONTH: 2,
  MSK_OFFSET_HOURS: 3,
};

export const appLink = (param) =>
  CONFIG.BOT_USERNAME && CONFIG.APP_NAME
    ? 'https://t.me/' + CONFIG.BOT_USERNAME + '/' + CONFIG.APP_NAME + (param ? '?startapp=' + param : '')
    : location.origin + location.pathname;
