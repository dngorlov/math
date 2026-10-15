// KaTeX: рендер формул в строках вида «текст $формула$ текст».
const MACROS = {
  '\\tg': '\\operatorname{tg}', '\\ctg': '\\operatorname{ctg}',
  '\\arctg': '\\operatorname{arctg}', '\\arcctg': '\\operatorname{arcctg}',
  '\\sh': '\\operatorname{sh}', '\\ch': '\\operatorname{ch}',
  '\\th': '\\operatorname{th}', '\\cth': '\\operatorname{cth}',
};

export const hasKatex = () => typeof window !== 'undefined' && typeof window.katex !== 'undefined';

export function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function tex(s, display = false) {
  if (hasKatex()) {
    try {
      return window.katex.renderToString(s, { throwOnError: false, displayMode: display, macros: { ...MACROS } });
    } catch (e) { /* упадём в запасной вариант */ }
  }
  return '<code class="tex">' + esc(s) + '</code>';
}

// ds — displaystyle для дробей и пределов в вопросах
export function rich(str, ds = false) {
  return String(str).split('$').map((p, i) => (i % 2 ? tex((ds ? '\\displaystyle ' : '') + p) : esc(p))).join('');
}

// Рендер всех $…$ и $$…$$ внутри DOM-узла (для теории)
export function renderMathIn(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  while (walker.nextNode()) if (walker.currentNode.nodeValue.includes('$')) nodes.push(walker.currentNode);
  nodes.forEach((n) => {
    const ds = !!(n.parentElement && n.parentElement.closest('.ds'));
    const html = n.nodeValue.split('$$').map((p, i) => (i % 2 ? tex(p.trim(), true) : rich(p, ds))).join('');
    const tmp = document.createElement('span');
    tmp.innerHTML = html;
    const frag = document.createDocumentFragment();
    while (tmp.firstChild) frag.appendChild(tmp.firstChild);
    n.parentNode.replaceChild(frag, n);
  });
}
