/**
 * 相簿（css/components/page.css .album；動態展開內容，user 2026-11-18）：所有圖一排、同一個最大高、照原比例，放不下橫向捲（觸控滑、觸控板、Tab 到下一張）。
 * 框的前後＝淡出＋模糊（user 2026-11-24：「預設整個 box 的前後會有 blur，如果整個 gallery 裏面的圖片比 box 長的話，則需要加上 blur，如果沒有，則不需要 blur」
 * 「第一張跟最後一張不需要有 blur」「這樣就可以去掉 chevron」）：還捲得過去的那一邊才有——放得下＝兩邊都沒有、捲到頭的那邊沒有；原本左右兩顆 chevron。
 * 樣子＝跟關於的段落輪播、作品頁放映共用的那一套（.slide-blur 一層＋框的 mask，page.css「輪播兩側的淡出＋模糊」；user 2026-11-25：「這個要針對有輪播的都要調整」），
 * 這裡只掛 .more-start／.more-end 決定哪一邊開；不伸出內文欄。
 * HTML 只放圖（button > img，img 要寫原圖 width／height＝載入前就有寬，打開當下就量得到要不要糊），圖列與模糊那一層這裡包；
 * 點圖放大走 chrome.js（委派，帶整本相簿可左右切＝捲不到的那幾張也看得到）——**被框切到的那張（＝糊的那段裡的）點了先捲到框的正中、不放大**
 * （user 2026-11-25：「輪播應該會設定一個左右切換的範圍，如果這個圖片是在這個範圍裏面…點擊它會 center 整個 box，不會直接打開 lightbox」），完整露出的才放大。
 * 元素都在 main 裡、換頁整個換掉 → 元素上的 listener 不用收；ResizeObserver 收。
 */
import { registerPageCleanup } from './page-cleanup.js';
import { prefersReducedMotion } from './reduce-motion.js';

export function initAlbums() {
  const albums = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('#page-content .album:not(.is-ready)')]);
  if (!albums.length) return;
  // 下一幀才量（摺疊展開、圖載進來時一起變的版面先排好）
  const ro = new ResizeObserver(entries => requestAnimationFrame(() => entries.forEach(en => check(/** @type {HTMLElement} */ (en.target.parentElement)))));
  for (const album of albums) {
    const strip = document.createElement('div');
    strip.className = 'album-strip';
    strip.append(...album.children);
    album.append(strip);
    album.insertAdjacentHTML('beforeend', '<span class="slide-blur" aria-hidden="true"><i></i></span>');
    album.classList.add('is-ready');
    strip.addEventListener('scroll', () => check(album), { passive: true });
    // 左右切換的範圍＝糊的那段（user 2026-11-25）：被框切到的那張點了＝捲到框的正中（到頭＝捲到頭為止），不往下傳＝chrome.js 在 document 上的委派不開放大。
    // 已經捲不動了（比框還寬的圖、置中了還是被切）＝照常放大，不然那張永遠打不開
    strip.addEventListener('click', (e) => {
      const b = e.target instanceof Element ? e.target.closest('button') : null;
      if (!b) return;
      const box = strip.getBoundingClientRect(), r = b.getBoundingClientRect();
      if (r.left >= box.left - 0.5 && r.right <= box.right + 0.5) return;   // 完整露出
      const left = Math.max(0, Math.min(strip.scrollWidth - strip.clientWidth, b.offsetLeft + b.offsetWidth / 2 - strip.clientWidth / 2));
      if (Math.abs(left - strip.scrollLeft) < 1) return;
      e.stopPropagation();
      strip.scrollTo({ left, behavior: prefersReducedMotion() ? 'instant' : 'smooth' });
    });
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

/** 還捲得過去的那一邊才淡＋糊：放得下＝兩邊都沒有；捲到頭的那邊（第一張／最後一張）沒有 @param {HTMLElement} album */
function check(album) {
  const strip = album.querySelector('.album-strip');
  if (!(strip instanceof HTMLElement)) return;
  const max = strip.scrollWidth - strip.clientWidth;
  album.classList.toggle('more-start', max > 1 && strip.scrollLeft > 1);
  album.classList.toggle('more-end', max > 1 && strip.scrollLeft < max - 1);   // 那段多寬、多糊＝CSS（page.css「輪播兩側的淡出＋模糊」）
}
