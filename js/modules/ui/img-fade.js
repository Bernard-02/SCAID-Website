/**
 * 圖片載入完才淡進來（user 2026-11-27：「如果圖片還來不及loading完的話，我覺得它出場要用fade的，不是直接跳出來」）：
 * 插進頁面的時候還沒載好的 <img>（後台渲染的縮圖、相簿、輪播、作品、放大畫面…，lazy 還沒輪到的也算）掛 .img-wait＝先藏著，
 * 載好（或載不到）拿掉＝網站的 fade（淡＋糊，chrome.css）。一開始就載好的（快取）照常直接顯示、不閃。全站的圖都是，不用各自寫。
 */
const QUICK = 100;   // 插進來幾 ms 內就載好＝當成本來就在（快取），直接顯示

export function initImgFade() {
  /** @param {HTMLImageElement} img */
  const wait = (img) => {
    if (img.complete && img.naturalWidth) return;
    // 藏起來是瞬間的（還沒掛 .img-fade＝沒有過場；插進來那一下頁面可能已經排過版，先掛過場的話會先淡出一下），載好才掛過場、再拿掉 .img-wait＝只有淡進來
    // 快取裡的圖插進來那一下也還不算 complete（幾 ms 後才 load）＝QUICK 內就載好的直接顯示、不淡（只有「來不及載完」的才淡）
    img.classList.add('img-wait');
    const t0 = performance.now();
    const done = () => {
      if (performance.now() - t0 > QUICK) { img.classList.add('img-fade'); getComputedStyle(img).opacity; }
      img.classList.remove('img-wait');
    };
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', done, { once: true });
  };
  /** @param {Node} n */
  const scan = (n) => { if (n instanceof HTMLImageElement) wait(n); else if (n instanceof Element) n.querySelectorAll('img').forEach(wait); };
  scan(document.body);
  new MutationObserver((ms) => { for (const m of ms) m.addedNodes.forEach(scan); }).observe(document.body, { childList: true, subtree: true });
}
