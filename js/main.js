/**
 * SCAID 網站主入口（ES module）。沿用 SCCD 架構：
 *   殼片段 fetch 注入（logo／選單／底列在 header.html，footer 覆蓋層在 footer.html；都在 <main> 外，換頁不動）
 *   → SPA router 只換 <main> → 各頁 init／cleanup 在這裡分派
 */

import { initRouter, updateNavActive } from './router.js';
import { sitePath } from './modules/ui/site-base.js';
import { runPageCleanups } from './modules/ui/page-cleanup.js';
import { installReducedMotionGsap } from './modules/ui/reduce-motion.js';
import { initChrome, closeOverlays, fitBar } from './modules/ui/chrome.js';
import { initLang, applyLang } from './modules/ui/lang.js';
import { initCustomScrollbar } from './modules/ui/custom-scrollbar.js';
import { initGridOverlay } from './modules/ui/grid-overlay.js';
import { initSectionNav } from './modules/ui/section-nav.js';
import { loadFooterCms } from './modules/ui/footer-cms.js';

// 片段注入：pages/header.html → #site-header、pages/footer.html → #site-footer
// cache: 'no-cache' 強制 revalidate：開發時改片段立即看到（SPA 不 hard reload）
async function loadPartial(id, file) {
  const el = document.getElementById(id);
  if (!el) return;
  try {
    const res = await fetch(sitePath(file), { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    el.innerHTML = await res.text();
  } catch (e) {
    console.warn(`[partial] ${file} 載入失敗`, e);
  }
}

// ── 換頁前 cleanup（router 呼叫）：各模組 registerPageCleanup 的 listener、<main> 內的 ScrollTrigger／tween ──
export function cleanupPageModules() {
  runPageCleanups();
  document.body.style.overflow = '';
  const main = document.getElementById('page-content');
  if (!main || typeof gsap === 'undefined') return;
  if (typeof ScrollTrigger !== 'undefined') {
    const inMain = new Set(main.querySelectorAll('*'));
    ScrollTrigger.getAll().forEach(t => { if (t.trigger && inMain.has(t.trigger)) t.kill(); });
  }
  gsap.killTweensOf(main.querySelectorAll('*'));
}

// ── 各頁 init（router 每次換頁呼叫）。頁面專屬模組用動態 import：進該頁才載，瀏覽器 module cache 共用一份 ──
/**
 * @param {string} page
 * @param {URLSearchParams} [params]
 * @param {boolean} [fromUserNav]  true＝使用者點連結；false＝初始載入／refresh／popstate
 */
export function initPageModules(page, params = new URLSearchParams(), fromUserNav = false) {
  closeOverlays();      // 選單／footer 覆蓋層／首頁展開態不跨頁
  updateNavActive(page);
  initSectionNav();     // 內頁段落導覽（先於 applyLang：生成的報讀文字也要套語言）
  applyLang();          // 新換進來的內容若有 data-zh 也套語言
  // 接 Directus 後：if (page === 'news') import('./modules/pages/news.js').then(m => m.initNews(params));
}

// ── 開機 ──
installReducedMotionGsap();
initLang();
initChrome();           // 先於 router：底列動態在首頁要攔 click（preventDefault → router 放行）
initRouter();
initCustomScrollbar();
initGridOverlay();      // 開發用：按 G 顯示 grid
loadPartial('site-header', 'pages/header.html').then(() => { updateNavActive(); applyLang(); fitBar(); });
loadPartial('site-footer', 'pages/footer.html').then(() => { applyLang(); loadFooterCms(); });
