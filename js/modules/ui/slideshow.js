/**
 * 段落圖片輪播（css/components/page.css .slideshow；user 2026-11-18 about 起）：
 * 中間一張最大、壓最上層，左右兩張最小在後面，再外面的藏著；點左右那張就換到中間（環狀）。
 * 這裡只決定誰在中間：每張寫 data-pos（-2…2），位置、大小、轉場、景深（中間清楚、左右失焦；user 2026-11-21）全是 CSS。
 * 自動播放（user 2026-11-21）：每 AUTOPLAY_MS 換下一張；滑鼠在上面／鍵盤聚焦在裡面＝暫停（WCAG 2.2.2），點了從頭計時；減少動態＝不自動播。
 * 元素都在 main 裡、換頁整個換掉 → listener 不用收；計時器要收（registerPageCleanup）。
 */
import { prefersReducedMotion } from './reduce-motion.js';
import { registerPageCleanup } from './page-cleanup.js';

const AUTOPLAY_MS = 4000;

export function initSlideshow() {
  // 只做還沒做過的（後台的段落晚到、換掉那段之後會再叫一次）
  document.querySelectorAll('#page-content .slideshow:not([data-ready])').forEach(root => {
    /** @type {HTMLElement} */ (root).dataset.ready = '';
    const slides = /** @type {HTMLButtonElement[]} */ ([...root.querySelectorAll('.slide')]);
    const n = slides.length, half = Math.floor(n / 2);
    if (!n) return;
    let active = 0;
    const render = () => slides.forEach((s, i) => {
      const pos = (((i - active) % n) + n + half) % n - half;   // 跟中間的距離，環狀
      s.dataset.pos = String(pos);
      s.disabled = Math.abs(pos) !== 1;                          // 只有左右兩張能點
      if (pos === 0) { s.setAttribute('aria-label', '目前圖片'); s.removeAttribute('aria-hidden'); }
      else if (Math.abs(pos) === 1) { s.setAttribute('aria-label', pos < 0 ? '上一張' : '下一張'); s.removeAttribute('aria-hidden'); }
      else { s.removeAttribute('aria-label'); s.setAttribute('aria-hidden', 'true'); }   // 藏著的不給讀
    });
    let timer = 0, hover = false, focus = false;
    const restart = () => {
      clearInterval(timer);
      if (n > 1 && !prefersReducedMotion()) timer = window.setInterval(() => { if (!hover && !focus) { active = (active + 1) % n; render(); } }, AUTOPLAY_MS);
    };
    registerPageCleanup(() => clearInterval(timer));
    root.addEventListener('pointerenter', () => { hover = true; });
    root.addEventListener('pointerleave', () => { hover = false; });
    root.addEventListener('focusin', () => { focus = true; });
    root.addEventListener('focusout', () => { focus = false; });
    root.addEventListener('click', e => {
      const b = e.target instanceof Element ? e.target.closest('.slide') : null;
      if (b instanceof HTMLButtonElement && !b.disabled) { active = slides.indexOf(b); render(); restart(); }
    });
    render();
    restart();
  });
}
