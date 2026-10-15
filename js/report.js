// «Сообщить об ошибке»: готовит текст и открывает новую задачу (issue) на GitHub.
import { CONFIG } from './config.js';
import { esc, rich } from './math.js';
import { openLink } from './tg.js';
import { toast } from './ui.js';

let ctx = null;

export function reportButton() {
  return '<button class="link report-link" data-act="report">Сообщить об ошибке</button>';
}

function issueBody(comment) {
  const c = ctx || {};
  return [
    '**Что не так:**', comment || '_не указано_', '',
    '**Где:** ' + (c.where || '—'),
    '**Задача:** `' + (c.q || '—') + '`',
    '**Правильный ответ по тренажёру:** `' + (c.a || '—') + '`',
    c.user ? '**Мой ответ:** `' + c.user + '`' : '',
    c.gen ? '**Генератор:** `' + c.gen + '`' : '',
    '', '---', 'Отправлено из тренажёра · ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' · ' + navigator.userAgent,
  ].filter((x) => x !== '').join('\n');
}

export function openReport(context) {
  ctx = context;
  const dlg = document.getElementById('report');
  const q = dlg.querySelector('.rp-q');
  q.innerHTML = esc(context.where ? context.where + ': ' : '') + rich(context.q);
  dlg.querySelector('textarea').value = '';
  dlg.querySelector('.rp-gh').hidden = !CONFIG.GITHUB_REPO;
  dlg.hidden = false;
  requestAnimationFrame(() => dlg.classList.add('show'));
  dlg.querySelector('textarea').focus({ preventScroll: true });
}

export function closeReport() { close(); }
function close() {
  const dlg = document.getElementById('report');
  dlg.classList.remove('show');
  setTimeout(() => { dlg.hidden = true; }, 250);
}

export function initReport() {
  const dlg = document.getElementById('report');
  dlg.addEventListener('click', async (e) => {
    if (e.target === dlg || e.target.closest('.rp-close')) return close();
    const comment = dlg.querySelector('textarea').value.trim();
    if (e.target.closest('.rp-gh')) {
      const title = 'Ошибка в задаче: ' + String((ctx && ctx.q) || '').replace(/\$/g, '').slice(0, 70);
      const url = 'https://github.com/' + CONFIG.GITHUB_REPO + '/issues/new?labels=' + encodeURIComponent('ошибка в задаче') +
        '&title=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(issueBody(comment));
      openLink(url);
      close();
    } else if (e.target.closest('.rp-copy')) {
      try { await navigator.clipboard.writeText(issueBody(comment)); toast('Текст скопирован'); } catch (err) { toast('Не удалось скопировать'); }
      close();
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !dlg.hidden) close(); });
}
export { esc };
