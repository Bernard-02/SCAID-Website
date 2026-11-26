/**
 * SCAID 網站主入口（ES module）。沿用 SCCD 架構：
 *   殼片段 fetch 注入（logo／選單／底列在 header.html；在 <main> 外，換頁不動）
 *   → SPA router 只換 <main> → 各頁 init／cleanup 在這裡分派
 */

import { initRouter, updateNavActive } from './router.js';
import { sitePath } from './modules/ui/site-base.js';
import { runPageCleanups } from './modules/ui/page-cleanup.js';
import { installReducedMotionGsap } from './modules/ui/reduce-motion.js';
import { initChrome, closeOverlays, fitBar, syncFigure, syncTheme, syncPageTheme } from './modules/ui/chrome.js';
import { initLogo } from './modules/ui/logo.js';
import { initObject } from './modules/ui/object.js';
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
import { initSiteIcons } from './modules/ui/site-assets.js';
import { cmsDown } from './config/api.js';

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
  syncPageTheme(page);  // 作品頁一律深色、離開回到原本的（user 2026-11-23）
  updateNavActive(page);
  initSectionNav();     // 內頁段落導覽
  initSlideshow();      // 段落圖片輪播（有 .slideshow 的頁）
  initAlbums();         // 相簿一排橫捲＋chevron（有 .album 的頁）
  syncFigure();         // 右圖的 object：畫布重找這一頁右圖那一格；手機右緣那顆鈕看這一頁有沒有右圖
  applyLang();          // 新換進來的內容若有 data-zh 也套語言
  // ── 後台（Directus，user 2026-11-21 全站接上）：各頁 HTML 只放空的容器，內容只從後台來（user 2026-11-26，照 SCCD；settle 收尾） ──
  // 回傳＝後台這幾支都換完、收好（router 等它才淡入）
  const cms = [applyUiLabels(document.getElementById('page-content') || document)];   // 介面文字（頁名、固定小標）
  if (page === 'contact') cms.push(import('./modules/ui/footer-cms.js').then(m => m.loadFooterCms()));   // 聯絡頁＝Directus 單例 footer
  if (page === 'works') cms.push(import('./modules/pages/works.js').then(m => m.initWorks()));         // 作品頁：兩種排法＋後台／YouTube 播放清單
  // 縮圖＋標題＋副標的列表（師資、合作企業）＝Directus；頁面有 ul.item-list[data-cms] 才載
  if (document.querySelector('#page-content .item-list[data-cms]')) cms.push(import('./modules/ui/item-list-cms.js').then(m => m.loadItemListCms()));
  cms.push(import('./modules/pages/cms-pages.js').then(m => m.loadPage(page, params)));   // 其他各頁的內容
  cms.push(import('./modules/ui/coming-soon.js').then(m => m.applyComingSoon(page)));     // 後台「即將推出」勾了這一頁＝只剩 Hero＋一行字
  const body = document.querySelector('#page-content .page-body');   // 這一頁的：抓完時已經換到別頁＝不動那一頁（它的容器還在等自己的資料）
  return Promise.allSettled(cms).then(() => settle(page, body));
}

// 後台抓完的收尾（user 2026-11-26：「我們不需要假資料，收不到後臺也不需要render假的，做法比照sccd的去設計」）：
// ①後台整個連不上（cmsDown：憑證／DNS／拒連；逾時、HTTP 錯不算＝那種退上次抓到的，config/api.js cmsGet）＝這一頁只剩「即將推出」
//   （同 SCCD 後台掛掉每頁只剩 COMING SOON；樣子＝後台勾了「即將推出」那種，page.css .is-coming-soon；導言也是後台的＝一起拿掉）。
//   網站地圖、404 不接後台＝照常。首頁沒有 .page-body：news 抓不到＝清單、底列的 news 都是空的（chrome.css 空的不出）＝只剩 logo
// ②沒畫到東西的：空的導言、清單是空的那一段（HTML 留的容器）收掉，段落導覽重排
const STATIC_PAGES = new Set(['sitemap', '404']);
/** @param {string} page @param {Element | null} body */
function settle(page, body) {
  if (!body?.isConnected) return;
  if (cmsDown && !STATIC_PAGES.has(page)) {
    if (!body.querySelector(':scope > .coming-soon')) {
      const h1 = body.querySelector(':scope > h1'), p = '<p class="coming-soon" data-label="page.coming-soon" data-en="Coming soon">即將推出</p>';
      h1 ? h1.insertAdjacentHTML('afterend', p) : body.insertAdjacentHTML('afterbegin', p);
    }
    body.querySelector(':scope > .page-lead:not([data-label])')?.remove();
    body.classList.add('is-coming-soon');
    applyLang(body);
  }
  let dropped = false;
  body.querySelectorAll(':scope > .page-lead:not([data-label])').forEach(el => { if (!el.textContent?.trim()) { el.remove(); dropped = true; } });
  body.querySelectorAll(':scope > .page-section').forEach(s => { if (s.querySelector('.item-list:empty')) { s.remove(); dropped = true; } });
  if (dropped) initSectionNav();
}

// ── 開機 ──
// 背景（BG）：背景試驗場那一份（user 2026-11-26：「我想要你幫我將背景apply在現在的網站上」；bg.js）。
// 清單圖片 hover 的中空板（DECOR）：先關掉（user 2026-11-23；原本跟舊的炭筆背景同一個開關），要開回來改 true。煙霧測試讀這兩行決定測不測
const BG = true;
const DECOR = false;
installReducedMotionGsap();
if (BG) try { initBg(); } catch (e) { console.warn('[bg] 背景載入失敗', e); }   // 背景 ＜ 內文；純裝飾，出錯也不能卡住後面的開機
initLang();
initChrome();          // 先於 router：底列動態在首頁要攔 click（preventDefault → router 放行）
initRouter();
initCustomScrollbar();
initGridOverlay();      // 開發用：按 G 顯示 grid
initAccordion();        // 摺疊（<details>）展開／收起的動畫
initItemMarquee();      // 清單列的標題／副標：放不下右邊淡掉、hover 跑馬燈
initSiteIcons();        // 網頁 icon：後台「網頁 icon」換了圖＝換成後台那張（抓不到＝本地的 website-icons/）
if (DECOR) initThumbBoard();   // 清單列的圖片：hover 浮一塊流動的中空板
loadPartial('site-header', 'pages/header.html').then(() => {
  updateNavActive(); syncFigure(); syncTheme(); applyLang(); fitBar();
  applyUiLabels(document.getElementById('site-header') || document);   // 殼的介面文字（選單、底列）
  initObject();          // 右圖的 object（殼上的畫布；模型清單載到才開始）
  initLogo();            // logo 的進場動畫：演完才把其他東西放出來（html.is-intro，各頁 <head> 的 inline script 先掛上）
  import('./modules/pages/cms-pages.js').then(m => { m.loadBarNews(); m.loadIntroVideo(); });   // 底列：跑馬燈＝後台首頁的 news 前 8 則的標題；▶ 鈕的影片＝「首頁影片」
});
