// Мелкие общие элементы интерфейса
let toastTimer = null;
export function toast(text) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = text;
  t.hidden = false;
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => { t.hidden = true; }, 300);
  }, 2600);
}

export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const CHEV_R = '<svg class="chev" viewBox="0 0 9 16" aria-hidden="true"><path d="M1 1l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>';
export const CHEV_L = '<svg class="chev" viewBox="0 0 9 16" aria-hidden="true"><path d="M8 1L1 8l7 7" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>';
