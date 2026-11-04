/**
 * 內頁段落導覽（css/components/page.css .section-nav）：main 裡每個 .section-title 一個矩形鈕，上下 chevron 跳上／下一段。
 * 點了把該段標題捲到「第一段標題在頁頂時的位置」（user 2026-11-03）；捲動時標目前段落（aria-current）。
 * 頁面沒有 .section-nav 就不做事。main.js initPageModules 在 applyLang 前呼叫（chevron 報讀名稱要吃語言）
 */
import { registerPageCleanup } from './page-cleanup.js';

export function initSectionNav() {
  const nav = document.querySelector('#page-content .section-nav');
  const titles = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('#page-content .section-title')]);
  if (!nav || !titles.length) return;

  titles.forEach((t, i) => { if (!t.id) t.id = `section-${i + 1}`; });
  const step = (dir, zh, en) =>
    `<button type="button" class="section-nav-step" data-step="${dir}"><span class="icon icon-chevron ${dir < 0 ? 'rotate-90' : '-rotate-90'}" aria-hidden="true"></span><span class="sr-only" data-en="${en}">${zh}</span></button>`;
  // 矩形的報讀名稱＝段落標題本身（aria-labelledby）→ 換語言自動跟著
  nav.innerHTML = step(-1, '上一段', 'Previous section')
    + titles.map((t, i) => `<button type="button" class="section-nav-dot" data-i="${i}" aria-labelledby="${t.id}"></button>`).join('')
    + step(1, '下一段', 'Next section');
  const dots = [...nav.querySelectorAll('.section-nav-dot')];
  const [prev, next] = /** @type {HTMLButtonElement[]} */ ([...nav.querySelectorAll('.section-nav-step')]);

  const docTop = (el) => el.getBoundingClientRect().top + window.scrollY;
  // 第 i 段的捲動位置：標題對齊第一段標題（第一段＝0）
  const target = (i) => docTop(titles[i]) - docTop(titles[0]);
  let active = -1;
  const update = () => {
    const i = titles.filter((_, k) => target(k) <= window.scrollY + 1).length - 1;
    if (i === active) return;
    active = i;
    dots.forEach((d, k) => { if (k === i) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current'); });
    prev.disabled = i === 0;
    next.disabled = i === titles.length - 1;
  };
  const go = (i) => window.scrollTo({ top: target(Math.max(0, Math.min(titles.length - 1, i))) });   // 平滑與否看 html scroll-behavior（reduce-motion 關）

  // nav 在 main 裡、換頁整個換掉 → 它的 listener 不用收
  nav.addEventListener('click', (e) => {
    const b = e.target instanceof Element ? e.target.closest('button') : null;
    if (!(b instanceof HTMLElement)) return;
    go(b.dataset.step ? active + Number(b.dataset.step) : Number(b.dataset.i));
  });
  window.addEventListener('scroll', update, { passive: true });
  // 對齊線跟著版面變（換語言、視窗寬、字型載入）→ 重量給 CSS 撐最後一段（page.css --section-y0）。
  // 下一幀才寫：撐高最後一段會再觸發這個 observer，同一幀內改會報 ResizeObserver loop
  const grid = /** @type {HTMLElement} */ (nav.parentElement);
  const ro = new ResizeObserver(() => requestAnimationFrame(() => { grid.style.setProperty('--section-y0', docTop(titles[0]) + 'px'); update(); }));
  ro.observe(titles[0].closest('.page-body') || grid);
  registerPageCleanup(() => { window.removeEventListener('scroll', update); ro.disconnect(); });
  update();
}
