/**
 * 段落圖片輪播（css/components/page.css .slideshow；user 2026-11-18 about 起）：
 * 中間一張最大、壓最上層，左右兩張最小在後面，再外面的藏著；點左右那張就換到中間（環狀）。
 * 這裡只決定誰在中間：每張寫 data-pos（-2…2），位置、大小、轉場全是 CSS。
 * 元素都在 main 裡、換頁整個換掉 → listener 不用收。
 */
export function initSlideshow() {
  document.querySelectorAll('#page-content .slideshow').forEach(root => {
    const slides = /** @type {HTMLButtonElement[]} */ ([...root.querySelectorAll('.slide')]);
    const n = slides.length, half = Math.floor(n / 2);
    if (n < 2) return;
    let active = 0;
    const render = () => slides.forEach((s, i) => {
      const pos = (((i - active) % n) + n + half) % n - half;   // 跟中間的距離，環狀
      s.dataset.pos = String(pos);
      s.disabled = Math.abs(pos) !== 1;                          // 只有左右兩張能點
      if (pos === 0) { s.setAttribute('aria-label', '目前圖片'); s.removeAttribute('aria-hidden'); }
      else if (Math.abs(pos) === 1) { s.setAttribute('aria-label', pos < 0 ? '上一張' : '下一張'); s.removeAttribute('aria-hidden'); }
      else { s.removeAttribute('aria-label'); s.setAttribute('aria-hidden', 'true'); }   // 藏著的不給讀
    });
    root.addEventListener('click', e => {
      const b = e.target instanceof Element ? e.target.closest('.slide') : null;
      if (b instanceof HTMLButtonElement && !b.disabled) { active = slides.indexOf(b); render(); }
    });
    render();
  });
}
