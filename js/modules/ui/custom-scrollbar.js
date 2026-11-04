/**
 * 自製 scrollbar（同 SCCD 作法）：原生藏掉（css/base/scrollbar.css），JS 在右側畫一條 thumb，
 * 依 scrollY 更新高度／位置、可拖；內容不比視窗高就不顯示。手機 <768 由 CSS 藏。
 */
export function initCustomScrollbar() {
  const thumb = document.createElement('div');
  thumb.id = 'custom-scrollbar-thumb';
  document.body.appendChild(thumb);
  const doc = document.documentElement;
  /** @type {{ y: number, s: number } | null} */
  let drag = null;

  const update = () => {
    const winH = window.innerHeight, docH = doc.scrollHeight;
    if (docH <= winH + 1) { thumb.style.display = 'none'; return; }
    const h = Math.max(40, winH * winH / docH);
    const top = (winH - h) * window.scrollY / (docH - winH);
    thumb.style.display = 'block';
    thumb.style.height = h + 'px';
    thumb.style.transform = `translateY(${top}px)`;
  };

  thumb.addEventListener('pointerdown', (e) => {
    drag = { y: e.clientY, s: window.scrollY };
    thumb.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  thumb.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const winH = window.innerHeight, docH = doc.scrollHeight, h = thumb.offsetHeight;
    // instant：html 有 scroll-behavior:smooth，拖的時候不能跟著滑
    window.scrollTo({ top: drag.s + (e.clientY - drag.y) * (docH - winH) / (winH - h), behavior: 'instant' });
  });
  thumb.addEventListener('pointerup', () => { drag = null; });
  thumb.addEventListener('pointercancel', () => { drag = null; });

  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  new ResizeObserver(update).observe(document.body);   // 內容高度變（SPA 換頁／首頁展開）
  update();
}
