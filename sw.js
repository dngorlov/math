// Service worker: сайт открывается без интернета после первого визита.
// При изменении файлов увеличь VERSION — старый кэш удалится.
const VERSION = 'v20';
const SHELL = 'shell-' + VERSION;
const RUNTIME = 'runtime-' + VERSION;
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/config.js', 'js/math.js', 'js/tg.js', 'js/storage.js', 'js/ui.js', 'js/streak.js', 'js/streak-ui.js',
  'js/mark.js', 'js/practice.js', 'js/endless.js', 'js/answer.js', 'js/theory.js', 'js/graphs.js', 'js/rating.js', 'js/report.js',
  'js/haptics.js', 'js/api.js', 'js/sync.js', 'js/merge.js', 'js/account.js', 'js/duel.js', 'js/admin.js', 'js/stats.js', 'js/gen/kinds.js', 'js/pair.js', 'js/news.js',
  'js/gen/index.js', 'js/gen/util.js', 'js/gen/oral.js', 'js/gen/written.js',
  'data/bank.txt', 'views/theory.html',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/favicon-64.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== RUNTIME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // API рейтинга — всегда из сети
  if (url.pathname.startsWith('/api/')) return;
  // Свои файлы: сначала кэш, в фоне обновляем
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req, { ignoreSearch: true }).then((hit) => {
        const net = fetch(req).then((res) => {
          if (res.ok) caches.open(SHELL).then((c) => c.put(req, res.clone()));
          return res;
        }).catch(() => hit || caches.match('index.html'));
        return hit || net;
      })
    );
    return;
  }
  // KaTeX, шрифты, скрипт Telegram: кэш с фоновым обновлением
  if (/cdnjs\.cloudflare\.com|telegram\.org/.test(url.host)) {
    e.respondWith(
      caches.open(RUNTIME).then((c) => c.match(req).then((hit) => {
        const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || net;
      }))
    );
  }
});
