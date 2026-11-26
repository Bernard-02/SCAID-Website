/**
 * 段落圖片輪播（css/components/page.css .slideshow；user 2026-11-18 about 起）＝跑馬燈（user 2026-11-26：「about的輪播改成marquee，然後可以loop，
 * 點blur的區塊可以去下一張，這一張會center這個box」；原本一次一張在正中、點左右那張換、每 4 秒自動換下一張）：
 * 一列、每張一樣高（＝框高）、寬照圖的比例（不裁、不變形；user 2026-11-23：「照片應該以後台的 size 為主，不要 crop」「要一樣大的高度」；
 * 2026-11-25 試過把旁邊的橫向擠扁、同一天拿掉：「about要去掉原本的那個扁的邏輯，一般設計即可」），隔一個 gutter 一張接一張、一直往左走（SPEED），
 * 最後一張後面接回第一張（環狀）。張數不夠「框寬＋一張」那麼長＝複製幾份接在後面（aria-hidden、不能 Tab），不然繞回來時會空一段。
 * 點一張（兩側糊掉的那段裡的＝下一張／上一張）＝滑到框的正中，接著再走；鍵盤 Tab 到一張也是。
 * 滑鼠在上面照走（user 2026-11-26：「hover marquee中的圖片不需要停止」）；鍵盤聚焦在裡面＝慢慢停下來、離開再慢慢走起來；減少動態＝不走、點了直接跳到正中。只有一張＝不走、在正中。
 * 位置每幀照「走了多遠」算（transform），不靠 CSS 過場。
 * 框的左右兩側＝淡出＋模糊（樣子全在 page.css「輪播兩側的淡出＋模糊」，跟相簿、作品頁放映共用）：這裡只插 .slide-blur 的那一層、把照片和它包進 .slide-strip。
 * 框高：兩張以上＝一律 16rem（CSS max-height），不看框寬、不看圖的比例＝每一個輪播一樣高、同「跨領域」那種小節的單圖（直圖 16rem；user 2026-11-26：
 * 「我想要這邊的輪播的高度都一樣，比照跨領域的那個，手機上好像沒調整」——原本最寬的那張要放得進框寬的 68%／手機 72%＝有橫圖的輪播在手機上矮到 180）；
 * 比框寬的圖跑馬燈走過去就看得完。只有一張＝同小節圖：最高 16rem、橫圖照欄寬縮。
 * 元素都在 main 裡、換頁整個換掉 → 掛在它們身上的 listener 不用收；每幀的迴圈、window 的 resize 要收（registerPageCleanup）。
 */
import { prefersReducedMotion } from './reduce-motion.js';
import { registerPageCleanup } from './page-cleanup.js';
import { setLabel } from './lang.js';
import { DUR } from './motion.js';

const SPEED = 40;   // 跑馬燈每秒走幾 px（ponytail: 先抓的，要快要慢改這個）
const BRAKE = 6;    // 停下來／走起來的快慢：每秒往目標速度靠近幾成

/** 圖的寬高比：載好了看圖本身，還沒＝HTML 的 width／height（後台給的），都沒有＝3:2 @param {HTMLElement} s */
const ratio = (s) => {
  const img = s.querySelector('img');
  if (img?.naturalWidth) return img.naturalWidth / img.naturalHeight;
  const k = Number(img?.getAttribute('width')) / Number(img?.getAttribute('height'));
  return Number.isFinite(k) && k > 0 ? k : 1.5;
};
/** 0 → 1 的慢起步慢收尾（quad in-out） @param {number} t */
const ease = (t) => t < 0.5 ? 2 * t * t : 1 - (2 - 2 * t) ** 2 / 2;
/** 取正的餘數 @param {number} a @param {number} m */
const mod = (a, m) => ((a % m) + m) % m;

export function initSlideshow() {
  // 只做還沒做過的（後台的段落晚到、換掉那段之後會再叫一次）
  document.querySelectorAll('#page-content .slideshow:not([data-ready])').forEach(el => {
    const root = /** @type {HTMLElement} */ (el);
    root.dataset.ready = '';
    const slides = /** @type {HTMLButtonElement[]} */ ([...root.querySelectorAll('.slide')]);
    const n = slides.length;
    if (!n) return;
    const blur = document.createElement('span');
    blur.className = 'slide-blur';
    blur.setAttribute('aria-hidden', 'true');
    blur.innerHTML = '<i></i>';   // 一層（page.css .slide-blur > i）
    const strip = document.createElement('div');   // 照片＋模糊那一層：兩側淡出、超出的切掉（page.css .slide-strip）
    strip.className = 'slide-strip';
    strip.append(...slides, blur);
    root.append(strip);
    slides.forEach((s, i) => setLabel(s, `第 ${i + 1} 張圖片`, `Image ${i + 1}`));
    const items = [...slides];   // 原本那幾張＋複製的
    /** @type {number[]} */ let w = [];   // 每張的寬
    /** @type {number[]} */ let b = [];   // 每張排在整圈的哪裡（第一張的左緣＝0）
    let box = 0, M = 0, T = 1, o = NaN, v = 0, focus = false, last = 0, raf = 0;
    /** @type {{ from: number, to: number, t0: number } | null} */ let glide = null;
    // 第 j 張的左緣在框的哪裡：整圈長 T、往左走了 o；左邊留 M（最寬一張＋gutter）＝走出框才繞到最後面
    const xOf = (/** @type {number} */ j) => n < 2 ? (box - w[j]) / 2 : mod(b[j] - o + M, T) - M;
    const place = () => items.forEach((s, j) => { s.style.transform = `translateX(${xOf(j)}px)`; });
    /** 第 j 張滑到框的正中（往近的那邊走） @param {number} j */
    const center = (j) => {
      if (n < 2 || j < 0) return;
      const to = o + mod(xOf(j) + w[j] / 2 - box / 2 + T / 2, T) - T / 2;
      if (prefersReducedMotion()) { o = to; v = 0; place(); return; }   // 速度也歸零：不然停下來前還會滑一小段
      glide = { from: o, to, t0: performance.now() };
      v = 0;   // 滑完從停著慢慢走起來
    };
    const layout = () => {
      const cs = getComputedStyle(root), gap = parseFloat(cs.columnGap) || 0, r = slides.map(ratio);
      const max = parseFloat(cs.maxHeight) || 256, H = n < 2 ? Math.min(max, root.clientWidth / r[0]) : max;
      root.style.height = `${H}px`;
      box = strip.clientWidth;
      const one = r.map(k => H * k), L = one.reduce((a, x) => a + x + gap, 0);
      M = Math.max(...one) + gap;
      const k = n < 2 ? 1 : Math.ceil((box + M) / L);   // 幾份才夠長
      while (items.length < k * n) {
        const c = /** @type {HTMLButtonElement} */ (slides[items.length % n].cloneNode(true));
        setLabel(c); c.tabIndex = -1; c.setAttribute('aria-hidden', 'true');
        strip.insertBefore(c, blur); items.push(c);
      }
      while (items.length > k * n) items.pop()?.remove();
      w = items.map((_, j) => one[j % n]);
      b = w.map((_, j) => w.slice(0, j).reduce((a, x) => a + x + gap, 0));
      T = k * L;
      items.forEach((s, j) => { s.style.width = `${w[j]}px`; });
      if (Number.isNaN(o)) o = w[0] / 2 - box / 2;   // 一開始第一張在正中
      place();
    };
    const tick = (/** @type {number} */ now) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - (last || now)) / 1000);   // 分頁切走再回來＝不一下子跳一大段
      last = now;
      if (glide) {
        const t = Math.min(1, (now - glide.t0) / (DUR.medium * 1000));
        o = glide.from + (glide.to - glide.from) * ease(t);
        if (t === 1) glide = null;
      } else {
        const goal = focus || prefersReducedMotion() ? 0 : SPEED;
        v += (goal - v) * Math.min(1, dt * BRAKE);
        if (!goal && v < 0.05) { v = 0; return; }   // 停住了＝不用每幀重排
        o += v * dt;
      }
      place();
    };
    // 被框切掉的圖瀏覽器當它看不到＝lazy 不載，走進框才冒出來 → 輪播快到畫面裡就整組一起載
    const io = new IntersectionObserver((es) => {
      if (!es.some(e => e.isIntersecting)) return;
      root.querySelectorAll('img').forEach(i => { i.loading = 'eager'; });
      io.disconnect();
    }, { rootMargin: '100%' });
    io.observe(root);
    // 視窗寬變了＝欄寬變、框高跟每張的寬重算。不用 ResizeObserver 盯框：layout 會改框的高，在它的回呼裡改自己的大小＝「ResizeObserver loop」
    window.addEventListener('resize', layout);
    registerPageCleanup(() => { cancelAnimationFrame(raf); io.disconnect(); window.removeEventListener('resize', layout); });
    slides.forEach(s => s.querySelector('img')?.addEventListener('load', layout));   // 圖載好＝照它真的比例重排
    // 鍵盤聚焦才算（滑鼠點了按鈕也會聚焦，算進去的話點完移開還是停著）；Tab 到的那張滑到正中
    root.addEventListener('focusin', e => {
      focus = e.target instanceof Element && e.target.matches(':focus-visible');
      if (focus) center(items.indexOf(/** @type {HTMLButtonElement} */ (e.target)));
    });
    root.addEventListener('focusout', () => { focus = false; });
    strip.addEventListener('click', e => {
      const s = e.target instanceof Element ? e.target.closest('.slide') : null;
      center(items.indexOf(/** @type {HTMLButtonElement} */ (s)));
    });
    layout();
    if (n > 1) raf = requestAnimationFrame(tick);
  });
}
