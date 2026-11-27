/**
 * SPA Router（沿用 SCCD：攔截站內連結、只換 <main>、History API）
 * 精簡版：拿掉頁面專屬 CSS 動態載入／hover prefetch／退場動畫／deep-link 鎖，需要時回 ../SCCD Website/js/router.js 搬
 */

import { initPageModules, cleanupPageModules } from './main.js';
import { closeOverlays } from './modules/ui/chrome.js';
import { logoToStroke, logoPage } from './modules/ui/logo.js';
import { syncObject } from './modules/ui/object.js';
import { SITE_BASE_PATHNAME, sitePath } from './modules/ui/site-base.js';
import { PAGE_FILES, pageOfSlug, pagePath, slugsFresh } from './config/slugs.js';
import { DUR } from './modules/ui/motion.js';
import { syncTitle } from './modules/ui/ui-labels.js';
import { prefersReducedMotion } from './modules/ui/reduce-motion.js';

// ── 路由表：頁面清單與對外 slug 都在 js/config/slugs.js（PAGE_FILES／SLUG_DEFAULTS＋後台 site_slugs；user 2026-11-26 照 SCCD）。
// 網址只認兩種寫法：真實檔名（/pages/about.html、/about.html）與乾淨 slug（/about——只認目前的 slug，舊的、內部代號＝404）。
// <頁>-detail＝從 <頁> 列表點進去的詳細頁（不進選單／sitemap，選單亮 <頁>）
const ROUTES = Object.fromEntries(Object.entries(PAGE_FILES).map(([page, htmlFile]) => [page, { page, htmlFile }]));
const FILE_ROUTES = Object.fromEntries(Object.values(ROUTES).map(r => [`/${r.htmlFile.split('/').pop()}`, r]));
const NOT_FOUND_ROUTE = ROUTES[404];

// ── 路徑解析：部署在子路徑時 pathname 帶前綴（/SCAID/about.html），比對前先剝掉；/pages/ 前綴也剝 ──
function stripBase(pathname) {
  if (SITE_BASE_PATHNAME !== '/' && pathname.startsWith(SITE_BASE_PATHNAME)) {
    return '/' + pathname.slice(SITE_BASE_PATHNAME.length);
  }
  return pathname;
}
function resolveRoute(pathname) {
  const normalized = stripBase(pathname).replace(/^\/pages\//, '/').replace(/\/$/, '') || '/';
  if (normalized === '/') return ROUTES.index;
  if (normalized.endsWith('.html')) return FILE_ROUTES[normalized] || null;
  return ROUTES[pageOfSlug(normalized.slice(1)) || ''] || null;
}

// ── pushState 網址：正式站＝乾淨 slug（/about）、其餘＝真實檔案路徑（/pages/about.html）——判法與 CLEAN_URL_HOSTS 在 js/config/slugs.js pagePath ──
/** @param {{ page: string }} route */
const pushPath = (route) => pagePath(route.page);
// 網址列換成這頁目前的對外寫法（不換頁）：舊寫法進來的、後台剛改了 slug 的，都收斂成同一個可分享的網址（同 SCCD canonicalize）
/** @param {{ page: string }} route */
function canonicalize(route) {
  if (route.page === 'index' || route.page === '404') return;
  const { pathname, search, hash } = window.location, url = pagePath(route.page);
  if (url !== pathname) history.replaceState(history.state, '', url + search + hash);
}

// ── 無障礙：SPA 換頁不像整頁載入會移焦點、報讀新頁 → 焦點移到 main、aria-live 報新頁標題（WCAG 2.4.3／4.1.3）──
function getRouteAnnouncer() {
  let region = document.getElementById('sr-route-announcer');
  if (!region) {
    region = document.createElement('div');
    region.id = 'sr-route-announcer';
    region.className = 'sr-only';
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'true');
    document.body.appendChild(region);
  }
  return region;
}
function announceAndFocusMain(main) {
  getRouteAnnouncer().textContent = document.title || '';
  if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
  main.focus({ preventScroll: true });
}

// 選單的 .nav-link active 態：href 對到當前頁 → .active ＋ aria-current（片段 async 載入完 main.js 也呼叫一次）
export function updateNavActive(page = document.body.dataset.page) {
  document.querySelectorAll('#site-header a.nav-link').forEach(a => {
    const route = resolveRoute(new URL(a.getAttribute('href'), window.location.href).pathname);
    const on = !!route && route.page === page?.replace(/-detail$/, '');
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  // logo：首頁點了去關於（user 2026-11-24），其他頁回首頁。報讀名稱跟著換：首頁借選單「關於」那一項的字（跟語言走）
  const logo = document.querySelector('#site-header .site-logo');
  if (!logo) return;
  const home = page === 'index';
  logo.setAttribute('href', home ? 'about.html' : '../index.html');
  if (home) logo.setAttribute('aria-labelledby', 'nav-about'); else logo.removeAttribute('aria-labelledby');
}

// 各頁 <head> 的 metadata（description、canonical、og:*、twitter:*、robots；user 2026-11-26 給的那份，沒進 repo）換頁時跟著換：
// Google 會跑 JS，不換的話 head 一直是第一次載入那頁的——正式站的乾淨網址冷載入都是 index.html＝每一頁的 canonical 都指向首頁
const HEAD_META = 'meta[name="description"], meta[name="robots"], meta[name^="twitter:"], meta[property^="og:"], link[rel="canonical"]';
/** @param {Document} doc 新頁的 HTML */
function syncHeadMeta(doc) {
  document.head.querySelectorAll(HEAD_META).forEach(el => el.remove());
  const title = document.head.querySelector('title');
  doc.head.querySelectorAll(HEAD_META).forEach(el => document.head.insertBefore(document.importNode(el, true), title));
}

// ── 內容替換。navSeq：快速連點時只讓最後一次導航生效（每個 await 後比對，舊的放棄不 swap）──
let navSeq = 0;
// 目前頁（page id＋search；'/' 與 '/index.html' 是不同路由物件，不能比物件）：popstate 比對用——同頁只換 hash 也會觸發 popstate，不能重載
let current = { page: '', search: '' };

// 換頁 transition（user 2026-11-03）：fade out → 換內容 → fade in。html.page-leaving 讓 main 淡出（chrome.css），
// 淡出跟 fetch 並行、兩個都完成才換；換完拿掉 class＝淡入。減少動態效果時不等（CSS 那邊也瞬間）
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// fromUserNav：true＝使用者點連結；false＝初始載入／refresh／popstate（不搶焦點、不報讀）
async function loadPage(route, search = '', fromUserNav = false) {
  const main = document.getElementById('page-content');
  if (!main) return;
  const root = document.documentElement;
  const mySeq = ++navSeq;
  const isStale = () => mySeq !== navSeq;

  try {
    // 選單開著點連結：先收選單（內容滑回原位，--dur-medium），收完才淡出（user 2026-11-18）。fetch 先發不等。
    // 內容裡的連結：chrome.js 在 pointerdown 就把選單收了，click 進來時 class 已沒了但內容還在滑 → 看 transform 還沒回 0 也等
    const fetching = fetch(sitePath(route.htmlFile));
    // 離開首頁：logo 停止來回，正好是文字版就先變回沒有名字的 stroke 版（系名的 17 根）才換頁（user 2026-11-22；logo.js）。跟下面的收選單、淡出並行
    const strokeFirst = document.body.dataset.page === 'index' && route.page !== 'index' ? logoToStroke() : null;
    const shifted = Math.abs(new DOMMatrix(getComputedStyle(main).transform).m41) > 0.5;
    if (root.classList.contains('menu-open') || shifted) {
      // 去內頁：只收選單、首頁展開的動態先不收（user 2026-11-21）——動態開著時 logo 已經在頂，這裡收了它會先回畫面中間、換頁再上移一次；
      // 清單跟著一般換頁淡出，換完 initPageModules 才收。回首頁才連動態一起收
      closeOverlays(route.page === 'index');
      await wait(prefersReducedMotion() ? 0 : DUR.medium * 1000);
      if (isStale()) return;
    }
    // 首頁（logo 在畫面正中）→ 內頁（user 2026-11-21）：logo 先上移到頂、移完內容才淡入。首頁那一屏是空的 → 不等它淡出，
    // 關掉過場直接藏起來、抓到就換內容（data-page 一換 logo 開始上移），page-leaving 留到 logo 移完才拿掉
    const logoFirst = document.body.dataset.page === 'index' && route.page !== 'index' && !root.classList.contains('news-open') && !prefersReducedMotion();
    // 作品頁 → 內頁（user 2026-11-25：「在作品去別的頁面時，應該像首頁一樣，先是完整長度，再做縮窄」）：作品頁沒有右圖＝logo 是系名的完整長度，
    // 右圖的模型逛過別頁就已經載好＝一換頁 logo 就直接跳成 object 名字的長度。同首頁那套：logo 停在原樣、右圖先不出場，DUR.slow 後才一起變（logo 不移，內容照常淡入、不等它）
    const fromWorks = document.body.dataset.page === 'works' && route.page !== 'works' && route.page !== 'index' && !prefersReducedMotion();
    if (logoFirst) main.style.transition = 'none';
    root.classList.add('page-leaving');
    const [res] = await Promise.all([fetching, wait(prefersReducedMotion() || logoFirst ? 0 : DUR.fade * 1000), strokeFirst]);
    if (isStale()) return;
    if (!res.ok) throw new Error(`Failed to load ${route.htmlFile}`);
    const html = await res.text();
    if (isStale()) return;

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const newMain = doc.querySelector('main');
    if (!newMain) throw new Error('No <main> found in ' + route.htmlFile);
    const newTitle = doc.querySelector('title')?.textContent;
    if (newTitle) document.title = newTitle;
    syncHeadMeta(doc);

    cleanupPageModules();
    window.scrollTo({ top: 0, behavior: 'instant' });   // 淡出中瞬間回頂（html 有 scroll-behavior:smooth，不寫 instant 會在淡入時看到捲動）
    main.innerHTML = newMain.innerHTML;
    main.className = newMain.className || '';
    // 首頁 → 內頁（user 2026-11-23）：沒有名字的 stroke 版整個先上移，移完才換成 object 名字的長度、右圖才出場
    // （上移的途中掛 html.logo-moving：logo.js want 停在原樣、object.js visible＝先不出場只抓模型；移完再叫兩邊對一次）
    if (logoFirst || fromWorks) root.classList.add('logo-moving');
    const moved = logoFirst || fromWorks ? wait(DUR.slow * 1000).then(() => { root.classList.remove('logo-moving'); syncObject(); logoPage(); }) : null;
    document.body.dataset.page = route.page;
    current = { page: route.page, search };
    logoPage();   // logo：回首頁＝繼續在系名的 stroke 和文字之間來回；到內頁＝stroke 換成右圖 object 的長度（從首頁來＝移完才換，見上）
    // 後台的內容換好才淡入（user 2026-11-22）；後台慢就最多等 1.5 秒、先淡入（內容晚到再畫）
    const cmsReady = Promise.race([initPageModules(route.page, new URLSearchParams(search)), wait(1500)]);
    // 分頁標題（ui-labels.js syncTitle；HTML 的 <title> 是給 Google、預覽看的「About 關於」）：報讀之前先換好，語言 initPageModules 已經套了
    syncTitle();
    if (fromUserNav) announceAndFocusMain(main);
    if (logoFirst) {
      void main.offsetWidth;          // 「直接藏起來」先生效，再把過場接回去（淡入要用）
      main.style.transition = '';
    }
    await Promise.all([cmsReady, logoFirst ? moved : null]);   // logoFirst：logo 上移（chrome.css .site-logo）移完內容才淡入；從作品頁來的不等
    if (isStale()) return;
    root.classList.remove('page-leaving');   // 淡入
  } catch (err) {
    console.error('[router]', err);
    if (route !== NOT_FOUND_ROUTE) {
      history.replaceState(null, '', pushPath(NOT_FOUND_ROUTE));
      loadPage(NOT_FOUND_ROUTE);
    } else {
      root.classList.remove('page-leaving');   // 連 404 都載不到：至少別讓畫面停在淡出
    }
  } finally {
    main.style.transition = '';   // logoFirst 半路放棄（被新的導航取代／出錯）也要接回去
  }
}

function navigateTo(url) {
  const target = new URL(url, window.location.href);
  const route = resolveRoute(target.pathname) || NOT_FOUND_ROUTE;
  history.pushState(null, '', pushPath(route) + target.search + target.hash);
  loadPage(route, target.search, true);
}

export function initRouter() {
  getRouteAnnouncer();   // 預建 → 螢幕閱讀器先觀察到 region，第一次換頁的文字更新才會被念出

  // 站內連結全部走 SPA；外連／新分頁／下載／錨點／修飾鍵點擊／不在路由表的真實檔案放行給瀏覽器
  document.addEventListener('click', (e) => {
    const link = /** @type {HTMLAnchorElement | null} */ (e.target instanceof Element ? e.target.closest('a[href]') : null);
    if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if ((link.target && link.target !== '_self') || link.hasAttribute('download')) return;
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) return;
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin || !resolveRoute(url.pathname)) return;
    e.preventDefault();
    navigateTo(url.href);
  });

  window.addEventListener('popstate', () => {
    const route = resolveRoute(window.location.pathname) || NOT_FOUND_ROUTE;
    if (route.page === current.page && window.location.search === current.search) return;
    loadPage(route, window.location.search);
  });

  // 初始路由：直接開／refresh 真實檔案＝HTML 已是該頁，只 init 不重抓。
  // 乾淨網址（/about）由 server fallback 回 index.html（body 靜態標 data-page="index"）＝內容不是這頁 → 照 slug 抓那一頁（同 SCCD 冷載入走 loadPage）；
  // 先把 data-page 換成那一頁＝不演「首頁 → 內頁」的 logo 上移，照一般換頁淡入
  const start = (/** @type {{ page: string, htmlFile: string }} */ route) => {
    canonicalize(route);
    const served = document.body.dataset.page;
    document.body.dataset.page = route.page;
    current = { page: route.page, search: window.location.search };
    if (served === 'index' && route.page !== 'index') loadPage(route, window.location.search);
    else initPageModules(route.page, new URLSearchParams(window.location.search));
  };
  // 後台的 slug 表晚到、而且改過：網址列收斂成最新寫法（這台存的是舊表、照舊 slug 開進來的）
  slugsFresh.then(() => { const r = resolveRoute(window.location.pathname); if (r && r.page === current.page) canonicalize(r); });
  const route = resolveRoute(window.location.pathname);
  if (route) { start(route); return; }
  // 不認得的路徑：可能是後台剛改的 slug（這台還沒讀到）→ 等最新的表再認一次（最多 3 秒），還是沒有＝404
  Promise.race([slugsFresh, wait(3000)]).then(() => {
    const late = resolveRoute(window.location.pathname);
    if (late) start(late); else loadPage(NOT_FOUND_ROUTE);
  });
}
