/**
 * 相簿（css/components/page.css .album；動態展開內容，user 2026-11-18）：所有圖一排、同一個最大高、照原比例，放不下橫向捲；
 * 左右 chevron（＝play icon，prev 轉 180°；在圖列外面兩邊，user 2026-11-19）捲 60% 可視寬（量到溢出才出、到頭半透明）＝照 SCCD 的 playlist 縮圖列（about-data-loader），只是沒有旋轉。
 * HTML 只放圖（button > img，img 要寫原圖 width／height＝載入前就有寬，打開當下就量得到要不要 chevron），strip 與 chevron 這裡包；
 * 點圖放大走 chrome.js（委派，帶整本相簿可左右切）。
 * 元素都在 main 裡、換頁整個換掉 → 元素上的 listener 不用收；ResizeObserver 收。
 */
import { registerPageCleanup } from './page-cleanup.js';

export function initAlbums() {
  const albums = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('#page-content .album:not(.is-ready)')]);
  if (!albums.length) return;
  const ro = new ResizeObserver(entries => entries.forEach(en => check(/** @type {HTMLElement} */ (en.target.parentElement))));
  for (const album of albums) {
    const strip = document.createElement('div');
    strip.className = 'album-strip';
    strip.append(...album.children);
    const chev = (/** @type {'prev' | 'next'} */ dir) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `album-chev album-${dir}`;
      b.setAttribute('aria-label', dir === 'prev' ? '上一組' : '下一組');
      b.innerHTML = `<span class="icon icon-play${dir === 'prev' ? ' rotate-180' : ''}" aria-hidden="true"></span>`;
      b.addEventListener('click', () => strip.scrollBy({ left: (dir === 'prev' ? -0.6 : 0.6) * strip.clientWidth, behavior: 'smooth' }));
      return b;
    };
    album.append(strip, chev('prev'), chev('next'));
    album.classList.add('is-ready');
    strip.addEventListener('scroll', () => check(album), { passive: true });
    album.addEventListener('load', () => check(album), true);   // 圖（lazy）載進來才有寬 → 重量溢出
    ro.observe(strip);   // 摺疊展開（從 0 變有寬）、視窗寬變 → 重量
    // 收著的摺疊裡 lazy 圖不會載 → 滑鼠移到那則上／鍵盤聚焦就先載，點開時多半已經好了（user 2026-11-19）
    const summary = album.closest('details')?.querySelector(':scope > summary');
    const preload = () => album.querySelectorAll('img[loading="lazy"]').forEach(i => { /** @type {HTMLImageElement} */ (i).loading = 'eager'; });
    summary?.addEventListener('pointerenter', preload, { once: true });
    summary?.addEventListener('focus', preload, { once: true });
  }
  registerPageCleanup(() => ro.disconnect());
}

/** 溢出才出 chevron；到頭的那邊半透明 @param {HTMLElement} album */
function check(album) {
  const strip = album.querySelector('.album-strip');
  if (!(strip instanceof HTMLElement)) return;
  // 跟整個相簿框的寬比，不是扣掉 chevron 後的圖列寬：不然圖寬介於兩者之間時 chevron 一出來就收不回去（user 2026-11-19：圖排得進框就不要 chevron）
  album.classList.toggle('has-chev', strip.scrollWidth > album.clientWidth + 1);
  const max = strip.scrollWidth - strip.clientWidth;   // 上面切了 class → 這裡讀到的是切完的寬
  album.querySelector('.album-prev')?.classList.toggle('is-end', strip.scrollLeft <= 1);
  album.querySelector('.album-next')?.classList.toggle('is-end', strip.scrollLeft >= max - 1);
}
