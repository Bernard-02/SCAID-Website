/**
 * 開發用 grid 疊圖（user 2026-11-03）：按 G 開關、記在 localStorage；網址加 ?grid 也會開。
 * 欄位直接用 .site-container＋.site-grid（手機 4／桌面 12），所以疊圖永遠跟實際版面同一套。不吃滑鼠（pointer-events: none）
 */
const KEY = 'scaid:grid';
const html = document.documentElement;

function set(on) {
  html.classList.toggle('show-grid', on);
  try { localStorage.setItem(KEY, on ? '1' : ''); } catch {}
}

export function initGridOverlay() {
  const el = document.createElement('div');
  el.className = 'grid-overlay';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<div class="site-container site-grid">${'<span></span>'.repeat(12)}</div>`;
  document.body.appendChild(el);

  let on = new URLSearchParams(location.search).has('grid');
  try { on = on || localStorage.getItem(KEY) === '1'; } catch {}
  set(on);

  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'g' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]')) return;
    set(!html.classList.contains('show-grid'));
  });
}
