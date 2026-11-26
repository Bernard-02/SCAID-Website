/**
 * 內頁段落導覽（css/components/page.css .section-nav）：main 裡每個 .section-title 一個矩形鈕，沒有上下 chevron（user 2026-11-18）。
 * 頁標題不出了（user 2026-11-25：「每一頁的標題都拿掉，第一個方塊定位的是段落文字即可」；h1 只留給報讀）：
 * 最上面那一格（.section-nav-top）＝導言（.page-lead，頁頂那段文字），有導言的頁才有；點了捲回頁頂、還沒捲到第一段時亮的是它（user 2026-11-18 的規矩照舊，原本對的是 h1）。
 * 沒導言的頁（課程、規章）第一格就是第一段。
 * 點了把該段頂端捲到內容的起始線（--top-h＝內文欄的頂；段落頂＝包著標題的 .page-section）；捲動時標目前段落（aria-current）。
 * 矩形從起始線往下排、排不進時整串上移讓目前那格看得到：這裡只給格數 --n 與由上往下第幾格 --i，排不排得進、位移多少都是 page.css 算。
 * 頁面沒有 .section-nav 就不做事。
 */
import { registerPageCleanup } from './page-cleanup.js';

export function initSectionNav() {
  const nav = /** @type {HTMLElement | null} */ (document.querySelector('#page-content .section-nav'));
  const titles = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('#page-content .section-title')]);
  if (!nav) return;
  if (!titles.length) { nav.innerHTML = ''; return; }   // 段落都收掉了（後台沒東西，main.js settle）＝之前排的矩形也拿掉

  titles.forEach((t, i) => { if (!t.id) t.id = `section-${i + 1}`; });
  const h1 = document.querySelector('#page-content .page-lead') && document.querySelector('#page-content h1');   // 有導言才有最上面那一格
  if (h1 && !h1.id) h1.id = 'page-title';
  // 報讀名稱＝標題本身（aria-labelledby；最上面那一格＝頁名，h1 看不到但還在）→ 換語言自動跟著。最上面那一格是第 -1 格，段落的矩形從 0 起
  nav.innerHTML = (h1 ? `<button type="button" class="section-nav-top" data-i="-1" aria-labelledby="${h1.id}"></button>` : '')
    + titles.map((t, i) => `<button type="button" class="section-nav-dot" data-i="${i}" aria-labelledby="${t.id}"></button>`).join('');
  nav.style.setProperty('--n', String(titles.length));
  const dots = [...nav.querySelectorAll('.section-nav-dot')];
  const top = nav.querySelector('.section-nav-top');
  const first = top ? -1 : 0;   // 最前面那一格：有導言那一格就是它
  /** 排不進畫面時哪一格要看得到（--i＝由上往下第幾格，最上面那格也算） @param {number} i */
  const reveal = (i) => nav.style.setProperty('--i', String(i - first));

  const secs = titles.map(t => /** @type {HTMLElement} */ (t.closest('.page-section') || t));   // 沒包 section 就拿標題本身
  const anchor = titles[0].closest('.page-body') || secs[0];   // 對齊線＝內文欄的頂在頁頂時的位置（--top-h）
  const docTop = (el) => el.getBoundingClientRect().top + window.scrollY;
  // 第 i 段的捲動位置：段落頂對齊起始線；-1（導言）＝頁頂
  const target = (i) => i < 0 ? 0 : docTop(secs[i]) - docTop(anchor);
  let active = -2;   // 還沒標過（-1 是導言那一格，不能拿來當「沒有」）
  let goal = -1;   // 點了、正捲過去的那格
  const update = () => {
    const y = window.scrollY;
    let i;
    if (goal >= 0) {
      // 點擊捲過去的途中：誰的位置最近亮誰（＝過兩段中點就換）。照一般規則往下要捲完才亮（拖在減速的尾巴）、往上卻早一整段亮
      // → 兩個方向都在最後一段的一半到位、一樣快，中間經過的格子照樣一格格亮過去（user 2026-11-18）
      i = secs.reduce((best, _, k) => Math.abs(target(k) - y) < Math.abs(target(best) - y) ? k : best, first);
      if (Math.abs(target(goal) - y) < 2) goal = -1;
    } else {
      // 一般捲動：段落頂過了起始線才算到；還沒捲到第一段（在導言）＝最上面那一格（沒有那一格才算第一段）
      i = Math.max(first, titles.filter((_, k) => target(k) <= y + 1).length - 1);
    }
    if (i === active) return;
    active = i;
    [top, ...dots].forEach((d, k) => { if (!d) return; if (k - 1 === i) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current'); });
    reveal(i);
  };

  // nav 在 main 裡、換頁整個換掉 → 它的 listener 不用收
  nav.addEventListener('click', (e) => {
    const b = e.target instanceof Element ? e.target.closest('button') : null;
    if (!(b instanceof HTMLElement)) return;
    const i = Number(b.dataset.i);
    if (Math.abs(target(i) - window.scrollY) >= 2) goal = i;   // 點目前這格不用捲
    window.scrollTo({ top: target(i) });   // 平滑與否看 html scroll-behavior（reduce-motion 關）
  });
  // 鍵盤 Tab 到被切掉的格子 → 把它帶進來才看得到；離開導覽就回到目前段落。滑鼠點的不算（點了本來就會捲過去）
  nav.addEventListener('focusin', (e) => {
    const b = /** @type {HTMLElement} */ (e.target);
    if (b.matches(':focus-visible')) reveal(Number(b.dataset.i));
  });
  nav.addEventListener('focusout', () => reveal(active));
  window.addEventListener('scroll', update, { passive: true });
  // 捲到一半被使用者自己捲斷：停下來就回一般規則（沒 scrollend 的瀏覽器＝等捲到目標才回）
  const settle = () => { goal = -1; update(); };
  window.addEventListener('scrollend', settle);
  // 對齊線跟著版面變（換語言、視窗寬、字型載入）→ 重量給 CSS 撐最後一段（page.css --section-y0）。
  // 下一幀才寫：撐高最後一段會再觸發這個 observer，同一幀內改會報 ResizeObserver loop
  const grid = /** @type {HTMLElement} */ (nav.parentElement);
  const ro = new ResizeObserver(() => requestAnimationFrame(() => { grid.style.setProperty('--section-y0', docTop(anchor) + 'px'); update(); }));
  ro.observe(titles[0].closest('.page-body') || grid);
  registerPageCleanup(() => { window.removeEventListener('scroll', update); window.removeEventListener('scrollend', settle); ro.disconnect(); });
  update();
}
