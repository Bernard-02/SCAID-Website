/**
 * SCAID 網站主入口（ES module）。沿用 SCCD 架構：
 *   殼片段 fetch 注入（logo／選單／底列在 header.html；在 <main> 外，換頁不動）
 *   → SPA router 只換 <main> → 各頁 init／cleanup 在這裡分派
 */

import { initRouter, updateNavActive } from './router.js';
import { sitePath } from './modules/ui/site-base.js';
import { runPageCleanups } from './modules/ui/page-cleanup.js';
import { installReducedMotionGsap } from './modules/ui/reduce-motion.js';
import { initChrome, closeOverlays, fitBar, syncFigure, syncTheme } from './modules/ui/chrome.js';
import { initLogo } from './modules/ui/logo.js';
import { initLang, applyLang } from './modules/ui/lang.js';
import { initCustomScrollbar } from './modules/ui/custom-scrollbar.js';
import { initGridOverlay } from './modules/ui/grid-overlay.js';
import { initBg } from './modules/ui/bg.js';
import { initSectionNav } from './modules/ui/section-nav.js';
import { initSlideshow } from './modules/ui/slideshow.js';
import { initAlbums } from './modules/ui/album.js';
import { initAccordion } from './modules/ui/accordion.js';
import { initItemMarquee } from './modules/ui/item-marquee.js';
import { initThumbBoard } from './modules/ui/thumb-board.js';
import { applyUiLabels } from './modules/ui/ui-labels.js';

// 片段注入：pages/header.html → #site-header
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
  closeOverlays();      // 選單／首頁展開態不跨頁
  updateNavActive(page);
  initSectionNav();     // 內頁段落導覽
  initSlideshow();      // 段落圖片輪播（有 .slideshow 的頁）
  initAlbums();         // 相簿一排橫捲＋chevron（有 .album 的頁）
  syncFigure();         // 手機：右緣縮圖鈕換成這一頁的右圖（先於 applyLang：複本也要套語言）
  applyLang();          // 新換進來的內容若有 data-zh 也套語言
  // ── 後台（Directus，user 2026-11-21 全站接上）：抓不到／還沒填＝留 HTML 的示意 ──
  applyUiLabels(document.getElementById('page-content') || document);   // 介面文字（頁名、固定小標）
  if (page === 'contact') import('./modules/ui/footer-cms.js').then(m => m.loadFooterCms());   // 聯絡頁＝Directus 單例 footer
  // 縮圖＋標題＋副標的列表（師資、合作企業）＝Directus；頁面有 ul.item-list[data-cms] 才載
  if (document.querySelector('#page-content .item-list[data-cms]')) import('./modules/ui/item-list-cms.js').then(m => m.loadItemListCms());
  import('./modules/pages/cms-pages.js').then(m => m.loadPage(page, params));   // 其他各頁的內容
}

// ── 開機 ──
installReducedMotionGsap();
try { initBg(); } catch (e) { console.warn('[bg] 背景載入失敗', e); }   // 背景：畫布（筆跡）＜ 中空板 ＜ 內文；純裝飾，出錯也不能卡住後面的開機
initLang();
initChrome();          // 先於 router：底列動態在首頁要攔 click（preventDefault → router 放行）
initRouter();
initCustomScrollbar();
initGridOverlay();      // 開發用：按 G 顯示 grid
initAccordion();        // 摺疊（<details>）展開／收起的動畫
initItemMarquee();      // 清單列的標題／副標：放不下右邊淡掉、hover 跑馬燈
initThumbBoard();       // 清單列的圖片：hover 浮一塊流動的中空板
loadPartial('site-header', 'pages/header.html').then(() => {
  updateNavActive(); syncFigure(); syncTheme(); applyLang(); fitBar();
  applyUiLabels(document.getElementById('site-header') || document);   // 殼的介面文字（選單、底列）
  initLogo();            // logo 的進場動畫：演完才把其他東西放出來（html.is-intro，各頁 <head> 的 inline script 先掛上）
  import('./modules/pages/cms-pages.js').then(m => m.loadBarNews());     // 底列動態跑馬燈＝後台最近幾則
});
