/**
 * 段落圖片輪播（css/components/page.css .slideshow；user 2026-11-18 about 起）：
 * 一列、每張一樣高（＝框高）、寬照圖的比例（不裁、不變形；user 2026-11-23：「照片應該以後台的 size 為主，不要 crop」「要一樣大的高度」；
 * 2026-11-25 試過把旁邊的橫向擠扁、同一天拿掉：「about要去掉原本的那個扁的邏輯，一般設計即可」），
 * 目前那張在正中、其他隔一個 gutter 接在兩邊，超出框的切掉；點左右那張就換到中間（環狀），整列滑過去。
 * 這裡照每張的寬算位置（left／width），寫 data-pos（跟中間的距離：報讀、測試用）；過場是 CSS。
 * 框的左右兩側＝淡出＋模糊（user 2026-11-23 起；樣子全在 page.css「輪播兩側的淡出＋模糊」＝user 2026-11-25 貼的那段 CSS，跟相簿、作品頁放映共用）：
 * 這裡只插 .slide-blur 的那一層、把照片和它包進 .slide-strip。
 * 自動播放（user 2026-11-21）：每 AUTOPLAY_MS 換下一張；滑鼠在上面／鍵盤聚焦在裡面＝暫停（WCAG 2.2.2），點了從頭計時；減少動態＝不自動播。
 * 框高＝同小節圖（user 2026-11-23：「段落應該跟小節圖同步」）：最高 16rem、最寬的那張也放得進「兩側淡掉的那段以內」（下面 CLEAR）。
 * 元素都在 main 裡、換頁整個換掉 → 掛在它們身上的 listener 不用收；計時器、window 的 resize 要收（registerPageCleanup）。
 */
import { prefersReducedMotion } from './reduce-motion.js';
import { registerPageCleanup } from './page-cleanup.js';
import { setLabel } from './lang.js';

const AUTOPLAY_MS = 4000;
// 最寬的那張最多佔框寬幾成＝旁邊那張露得出來、看得出點得到（PC 68%＝兩邊各留 16%：定的時候兩側淡掉的那段就是 16%，
// 同一天晚上那段縮成 10%、這個沒跟著放寬；手機 72%，同作品頁手機的放映，user 2026-11-25）。只有一張＝兩側不淡＝整個框
const CLEAR = { pc: 0.68, phone: 0.72 };

/** 圖的寬高比：載好了看圖本身，還沒＝HTML 的 width／height（後台給的），都沒有＝3:2 @param {HTMLElement} s */
const ratio = (s) => {
  const img = s.querySelector('img');
  if (img?.naturalWidth) return img.naturalWidth / img.naturalHeight;
  const k = Number(img?.getAttribute('width')) / Number(img?.getAttribute('height'));
  return Number.isFinite(k) && k > 0 ? k : 1.5;
};

export function initSlideshow() {
  // 只做還沒做過的（後台的段落晚到、換掉那段之後會再叫一次）
  document.querySelectorAll('#page-content .slideshow:not([data-ready])').forEach(el => {
    const root = /** @type {HTMLElement} */ (el);
    root.dataset.ready = '';
    const slides = /** @type {HTMLButtonElement[]} */ ([...root.querySelectorAll('.slide')]);
    const n = slides.length, half = Math.floor(n / 2);
    if (!n) return;
    const blur = document.createElement('span');
    blur.className = 'slide-blur';
    blur.setAttribute('aria-hidden', 'true');
    blur.innerHTML = '<i></i>';   // 一層（page.css .slide-blur > i）
    const strip = document.createElement('div');   // 照片＋模糊那一層：兩側淡出、超出的切掉（page.css .slide-strip）
    strip.className = 'slide-strip';
    strip.append(...slides, blur);
    root.append(strip);
    let active = 0;
    /** @type {number[]} */ let was = [];
    const render = () => {
      const pos = slides.map((_, i) => (((i - active) % n) + n + half) % n - half);   // 跟中間的距離，環狀
      const cs = getComputedStyle(root), gap = parseFloat(cs.columnGap) || 0, r = slides.map(ratio);
      // 框高＝同小節圖（user 2026-11-23：「段落應該跟小節圖同步」）：最高 16rem（CSS max-height），而且最寬的那張也放得進框寬的 CLEAR 那幾成
      const fit = root.clientWidth * (n < 2 ? 1 : matchMedia('(min-width: 768px)').matches ? CLEAR.pc : CLEAR.phone);
      const H = Math.min(parseFloat(cs.maxHeight) || Infinity, fit / Math.max(...r));
      root.style.height = `${H}px`;
      const w = r.map(k => H * k), x = slides.map(() => 0), at = (/** @type {number} */ p) => pos.indexOf(p);
      const c = at(0);
      x[c] = (strip.clientWidth - w[c]) / 2;                                                 // 目前那張在正中
      for (let p = 1; at(p) >= 0; p++) x[at(p)] = x[at(p - 1)] + w[at(p - 1)] + gap;         // 右邊一張接一張
      for (let p = -1; at(p) >= 0; p--) x[at(p)] = x[at(p + 1)] - gap - w[at(p)];            // 左邊
      slides.forEach((s, i) => {
        const jump = was.length > 0 && Math.abs(pos[i] - was[i]) > 1;   // 環狀繞到另一頭的那張：直接跳過去，不滑過整列
        if (jump) s.style.transition = 'none';
        s.style.left = `${x[i]}px`;
        s.style.width = `${w[i]}px`;
        if (jump) { void s.offsetWidth; s.style.transition = ''; }
        s.dataset.pos = String(pos[i]);
        s.disabled = Math.abs(pos[i]) !== 1;                                                  // 只有左右兩張能點
        if (pos[i] === 0) { setLabel(s, '目前圖片', 'Current image'); s.removeAttribute('aria-hidden'); }
        else if (Math.abs(pos[i]) === 1) { setLabel(s, pos[i] < 0 ? '上一張' : '下一張', pos[i] < 0 ? 'Previous image' : 'Next image'); s.removeAttribute('aria-hidden'); }
        else { setLabel(s); s.setAttribute('aria-hidden', 'true'); }   // 其他的不給讀
      });
      was = pos;
    };
    let timer = 0, hover = false, focus = false;
    const restart = () => {
      clearInterval(timer);
      if (n > 1 && !prefersReducedMotion()) timer = window.setInterval(() => { if (!hover && !focus) { active = (active + 1) % n; render(); } }, AUTOPLAY_MS);
    };
    // 視窗寬變了＝欄寬變、框高跟每張的寬重算。不用 ResizeObserver 盯框：render 會改框的高，在它的回呼裡改自己的大小＝「ResizeObserver loop」
    window.addEventListener('resize', render);
    registerPageCleanup(() => { clearInterval(timer); window.removeEventListener('resize', render); });
    slides.forEach(s => s.querySelector('img')?.addEventListener('load', render));   // 圖載好＝照它真的比例重排
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
