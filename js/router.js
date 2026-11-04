/**
 * SPA Router（沿用 SCCD：攔截站內連結、只換 <main>、History API）
 * 精簡版：拿掉頁面專屬 CSS 動態載入／hover prefetch／退場動畫／deep-link 鎖，需要時回 ../SCCD Website/js/router.js 搬
 */

import { initPageModules, cleanupPageModules } from './main.js';
import { SITE_BASE_PATHNAME, sitePath } from './modules/ui/site-base.js';
import { DUR } from './modules/ui/motion.js';
import { prefersReducedMotion } from './modules/ui/reduce-motion.js';

// ── 路由表：新頁＝PAGES 加一個 slug ＋ pages/<slug>.html（乾淨路徑 /slug 與 /slug.html 都對到） ──
const PAGES = ['about', 'partners', 'faculty', 'curriculum', 'news', 'admission',
               'qa', 'donate', 'regulations', 'terms', 'sitemap', '404'];
const routes = {
  '/':           { page: 'index', htmlFile: 'index.html' },
  '/index.html': { page: 'index', htmlFile: 'index.html' },
};
for (const p of PAGES) routes[`/${p}`] = routes[`/${p}.html`] = { page: p, htmlFile: `pages/${p}.html` };
const NOT_FOUND_ROUTE = routes['/404'];

// ── 路徑解析：部署在子路徑時 pathname 帶前綴（/SCAID/about.html），比對前先剝掉；/pages/ 前綴也剝 ──
function stripBase(pathname) {
  if (SITE_BASE_PATHNAME !== '/' && pathname.startsWith(SITE_BASE_PATHNAME)) {
    return '/' + pathname.slice(SITE_BASE_PATHNAME.length);
  }
  return pathname;
}
function resolveRoute(pathname) {
  const normalized = stripBase(pathname).replace(/^\/pages\//, '/').replace(/\/$/, '') || '/';
  return routes[normalized] || null;
}

// ── pushState 網址：已設好 SPA fallback（.htaccess／CloudFront 404→index.html）的正式網域才輸出乾淨 URL（/about）；
//    其餘（本地 dev server）用真實檔案路徑（/pages/about.html）→ refresh 不 404。resolveRoute 兩種都吃。
//    ⚠️ 把網域加進來「之前」server fallback 必須先設好。TODO 正式網域定案後填入
const CLEAN_URL_HOSTS = [];
function pushPath(route) {
  if (route.htmlFile === 'index.html') return SITE_BASE_PATHNAME;
  return CLEAN_URL_HOSTS.includes(window.location.hostname)
    ? SITE_BASE_PATHNAME + route.htmlFile.replace(/^pages\//, '').replace(/\.html$/, '')
    : SITE_BASE_PATHNAME + route.htmlFile;
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

// header／footer 的 .nav-link active 態：href 對到當前頁 → .active ＋ aria-current（片段 async 載入完 main.js 也呼叫一次）
export function updateNavActive(page = document.body.dataset.page) {
  document.querySelectorAll('#site-header a.nav-link, #site-footer a.nav-link').forEach(a => {
    const route = resolveRoute(new URL(a.getAttribute('href'), window.location.href).pathname);
    const on = !!route && route.page === page;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

// ── 內容替換。navSeq：快速連點時只讓最後一次導航生效（每個 await 後比對，舊的放棄不 swap）──
let navSeq = 0;
// 目前頁（page id＋search；'/' 與 '/index.html' 是不同路由物件，不能比物件）：popstate 比對用——同頁只換 hash（首頁 footer 錨點）也會觸發 popstate，不能重載
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
    root.classList.add('page-leaving');
    const [res] = await Promise.all([fetch(sitePath(route.htmlFile)), wait(prefersReducedMotion() ? 0 : DUR.fade * 1000)]);
    if (isStale()) return;
    if (!res.ok) throw new Error(`Failed to load ${route.htmlFile}`);
    const html = await res.text();
    if (isStale()) return;

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const newMain = doc.querySelector('main');
    if (!newMain) throw new Error('No <main> found in ' + route.htmlFile);
    const newTitle = doc.querySelector('title')?.textContent;
    if (newTitle) document.title = newTitle;

    cleanupPageModules();
    window.scrollTo({ top: 0, behavior: 'instant' });   // 淡出中瞬間回頂（html 有 scroll-behavior:smooth，不寫 instant 會在淡入時看到捲動）
    main.innerHTML = newMain.innerHTML;
    main.className = newMain.className || '';
    document.body.dataset.page = route.page;
    current = { page: route.page, search };
    initPageModules(route.page, new URLSearchParams(search), fromUserNav);
    if (fromUserNav) announceAndFocusMain(main);
    root.classList.remove('page-leaving');   // 淡入
  } catch (err) {
    console.error('[router]', err);
    if (route !== NOT_FOUND_ROUTE) {
      history.replaceState(null, '', pushPath(NOT_FOUND_ROUTE));
      loadPage(NOT_FOUND_ROUTE);
    } else {
      root.classList.remove('page-leaving');   // 連 404 都載不到：至少別讓畫面停在淡出
    }
  }
}

export function navigateTo(url) {
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

  // 初始路由：直接開／refresh 時 HTML 已是該頁，只 init 不重抓；網址不在路由表（server fallback 到 index.html）→ 載 404
  const route = resolveRoute(window.location.pathname);
  if (!route) { loadPage(NOT_FOUND_ROUTE); return; }
  document.body.dataset.page = route.page;
  current = { page: route.page, search: window.location.search };
  initPageModules(route.page, new URLSearchParams(window.location.search), false);
}
