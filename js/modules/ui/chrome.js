/**
 * 全站殼行為（結構 pages/header.html，樣式 css/components/chrome.css）：
 * 選單開關、intro 影片 dialog、底列量測（兩側等寬＋動態跑馬燈）、首頁動態原地展開、手機的右圖縮圖鈕＋放大 dialog。
 * 全部 document 委派＝片段注入前後都綁得到；狀態掛 <html> class（menu-open／news-open）
 */
import { DUR, fadeSwap } from './motion.js';
import { prefersReducedMotion } from './reduce-motion.js';

const html = document.documentElement;
const phoneMenu = matchMedia('(max-width: 767px)');   // ＝chrome.css 手機全螢幕選單那段的斷點

function setExpanded(sel, open) {
  document.querySelectorAll(sel).forEach(b => b.setAttribute('aria-expanded', String(open)));
}
// 選單開關：menu 鈕撐成選單欄那格／縮回來 → 重量底列
// 收選單後內容先鎖住不捲（html.menu-closing，chrome.css）：第一下滾輪／觸控只負責關選單、內容不動（user 2026-11-18）。
// 鎖至少撐到選單滑完（--dur-medium）；同一個手勢後面還在送事件（觸控板慣性可拖到 1 秒）就一直往後推，停了 LOCK_TAIL 才解
const LOCK_TAIL = 250;
let menuClosingTimer = 0, menuUnlockAt = 0;
function lockScroll(ms) {
  menuUnlockAt = Math.max(menuUnlockAt, performance.now() + ms);   // 只往後推、不提早
  clearTimeout(menuClosingTimer);
  html.classList.add('menu-closing');
  menuClosingTimer = setTimeout(() => html.classList.remove('menu-closing'), menuUnlockAt - performance.now());
}
function setMenu(open) {
  const was = html.classList.contains('menu-open');
  html.classList.toggle('menu-open', open);
  setExpanded('.menu-btn', open);
  if (was && !open) { menuUnlockAt = 0; lockScroll(prefersReducedMotion() ? 0 : DUR.medium * 1000); }
  else if (open) { clearTimeout(menuClosingTimer); html.classList.remove('menu-closing'); menuUnlockAt = 0; }
  fitBar();
}
// 首頁動態展開：底列跑馬燈先淡出，logo 上移、清單從畫面底下升上來（晚 --news-wait 才動，home.css），底列＋變－（chrome.css）。
// 收合＝反向（user 2026-11-19）：news-open 先拿掉（logo 回中間、－變回＋），清單掛著 html.news-closing 往下滑出畫面，
// 滑完才真的藏起來、捲回頂。捲到一半收的話，畫面上緣以上的部分先切掉（--news-cut），不然往下滑時會從上面跑出來
let newsClosingTimer = 0;
function endNewsClosing() {
  clearTimeout(newsClosingTimer);
  if (!html.classList.contains('news-closing')) return;
  html.classList.remove('news-closing');
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function setNews(open) {
  const was = html.classList.contains('news-open');
  const list = /** @type {HTMLElement | null} */ (document.querySelector('#page-content .home-news-list'));
  if (open) { endNewsClosing(); html.classList.add('news-open'); return; }   // 收到一半又開＝先收完再照常升上來
  if (!was) { if (!list) endNewsClosing(); return; }   // 本來沒開著就沒事（closeOverlays 每次 Esc／換頁都會進來）；收到一半換頁了＝直接收尾
  const slide = !!list && !prefersReducedMotion();     // 換頁帶走了清單／減少動態：照舊直接收、捲回頂
  if (list && slide) {
    // 先量、先掛 news-closing，才拿掉 news-open：中間只要有一刻兩個 class 都不在，清單就是 display none——
    // 這時候量位置會量到 0，而且版面一重算頁面就被捲回頂（Chrome）
    const top = list.getBoundingClientRect().top;
    list.style.setProperty('--news-cut', `${Math.max(0, -top)}px`);                          // 清單在畫面上緣以上的那一截
    list.style.setProperty('--news-drop', `${window.innerHeight - Math.max(0, top)}px`);     // 看得到的頂端到畫面底緣的距離＝要滑多遠
    html.classList.add('news-closing');
  }
  html.classList.remove('news-open');
  if (slide) newsClosingTimer = setTimeout(endNewsClosing, DUR.slow * 1000);
  else window.scrollTo(0, 0);
}

// 深色模式（user 2026-11-21；variables.css :root[data-theme="dark"]）：選單 EN 上面那顆切、記 localStorage。
// 一進頁的套用在各頁 <head> 的 inline script（CSS 之前，免得閃白）；這裡只管切換與鈕的 aria-pressed（header 注入後 main.js 也呼叫一次）
const THEME_KEY = 'scaid:theme';
export function syncTheme() {
  document.querySelectorAll('.theme-btn').forEach(b => b.setAttribute('aria-pressed', String(html.dataset.theme === 'dark')));
}
function toggleTheme() {
  const dark = html.dataset.theme !== 'dark';
  try { localStorage.setItem(THEME_KEY, dark ? 'dark' : ''); } catch {}
  // 切換＝整個畫面 fade 過去（user 2026-11-21；motion.js fadeSwap）
  fadeSwap(() => {
    if (dark) html.dataset.theme = 'dark'; else delete html.dataset.theme;
    syncTheme();
  });
}

// 換頁／Esc：選單、首頁展開全收（main.js initPageModules 每次換頁呼叫）。news＝false：只收選單、首頁展開先留著（router.js 換頁前用）
export function closeOverlays(news = true) { setMenu(false); if (news) setNews(false); }

// intro：data-video 有網址才開 <dialog> 播；關掉就停並卸載
function openIntro(btn) {
  const url = btn.dataset.video;
  if (!url) return;   // TODO intro 影片網址（header.html .play-btn data-video）
  const dialog = /** @type {HTMLDialogElement} */ (document.getElementById('intro-dialog'));
  const video = dialog.querySelector('video');
  video.src = url;
  dialog.showModal();
  video.play().catch(() => {});
  dialog.addEventListener('close', () => { video.pause(); video.removeAttribute('src'); video.load(); }, { once: true });
}

// 內頁右圖的手機版（user 2026-11-13；chrome.css .figure-btn／.figure-dialog）：桌面右圖在 main 裡，手機是畫面右緣中線上的縮圖鈕、點了開 dialog 放大。
// 縮圖與放大的內容＝當頁 .page-figure 內容的複本 → 換頁（main.js initPageModules）、header 片段注入後都要 sync；
// 之後接 Directus 把右圖換掉時也要再呼叫一次。該頁沒圖（首頁）＝鈕不現身
const figureDialog = () => /** @type {HTMLDialogElement | null} */ (document.getElementById('figure-dialog'));
export function syncFigure() {
  const btn = document.querySelector('.figure-btn'), dialog = figureDialog();
  if (!btn || !dialog) return;   // header 片段還沒注入
  if (dialog.open) dialog.close();   // 開著時換頁（上一頁／下一頁）
  const src = document.querySelector('#page-content .page-figure > *');
  btn.classList.toggle('has-figure', !!src);
  dialog.classList.remove('has-nav');
  for (const box of [btn.querySelector('.figure-thumb'), dialog.querySelector('.figure-dialog-body')]) {
    box.replaceChildren(...(src ? [src.cloneNode(true)] : []));
  }
}
// 開放大 dialog：內容開的時候才放（那個節點的複本）——右緣縮圖鈕＝當頁右圖；動態那則（打開的）點封面縮圖或相簿哪張＝
// 同一組「封面（第一張）＋相簿」可左右切（user 2026-11-19；原本點封面只有那一張）。多於一張才出 ‹ ›（.has-nav）；到頭的那邊 disabled
let figureItems = /** @type {Element[]} */ ([]), figureIndex = 0;
function renderFigure() {
  const dialog = figureDialog();
  if (!dialog || !figureItems[figureIndex]) return;
  dialog.querySelector('.figure-dialog-body')?.replaceChildren(figureItems[figureIndex].cloneNode(true));
  dialog.classList.toggle('has-nav', figureItems.length > 1);
  const prev = dialog.querySelector('.figure-prev'), next = dialog.querySelector('.figure-next');
  if (prev instanceof HTMLButtonElement) prev.disabled = figureIndex <= 0;
  if (next instanceof HTMLButtonElement) next.disabled = figureIndex >= figureItems.length - 1;
}
/** 動態那則的一組圖：封面縮圖在前、相簿照順序（不在摺疊裡的相簿＝只有那本） @param {Element} el */
const galleryOf = (el) => [...(el.closest('details') ?? el.closest('.album'))?.querySelectorAll(':scope > summary .item-thumb img, .album button img') ?? []];
/** @param {Element | null} node @param {MouseEvent} e @param {Element[]} [items] 這一組（不給＝只有這一張） */
function openFigure(node, e, items) {
  const dialog = figureDialog();
  if (!dialog || !node) return;
  figureItems = items?.length ? items : [node];
  figureIndex = Math.max(0, figureItems.indexOf(node));
  renderFigure();
  dialog.showModal();
  // showModal 會自動聚焦第一個鈕 → 滑鼠／觸控點開的不要一開就亮焦點框（鍵盤 Enter 的 detail 是 0，照常聚焦）
  if (e.detail && document.activeElement instanceof HTMLElement) document.activeElement.blur();
}
/** 上一張／下一張（到頭不動） @param {number} dir */
function stepFigure(dir) {
  const i = figureIndex + dir;
  if (!figureDialog()?.open || i < 0 || i >= figureItems.length) return;
  figureIndex = i;
  renderFigure();
}
// 關＝先淡出（.is-closing）、淡完才真的 close()
function closeFigure() {
  const dialog = figureDialog();
  if (!dialog?.open || dialog.classList.contains('is-closing')) return;
  dialog.classList.add('is-closing');
  setTimeout(() => { dialog.classList.remove('is-closing'); dialog.close(); }, prefersReducedMotion() ? 0 : DUR.fade * 1000);
}

// 底列量測（chrome.css .site-bar）：
// 1) 兩側欄最小寬＝左欄內容寬（--side-min；右欄空著，原本 footer 鈕）→ 兩側等寬＝動態永遠畫面正中；hover 名字出來側邊放不下才縮動態。
//    選單開著不量：menu 鈕撐成選單欄那格（chrome.css），量進去會把中欄擠掉；就讓它溢出側欄（跑馬燈那時已淡掉）
// 2) 動態跑馬燈（user 2026-11-21：好幾則標題排成一排一直跑，chrome.css .bar-news-track）：複製第二份接力（還沒有才做）；
//    一圈的時間照內容寬算＝速度固定（標題幾則、中英怎麼換、字體載入前後都一樣快）→ 盯著 copy 的寬，變了重算
export const MARQUEE_SPEED = 2.5;   // 每秒走幾個 em（清單列的跑馬燈也用這個速度，item-marquee.js）
const marqueeSize = new ResizeObserver(([e]) => {
  const copy = /** @type {HTMLElement} */ (e.target), track = copy.parentElement;
  if (track) track.style.setProperty('--marquee-dur', `${copy.offsetWidth / (MARQUEE_SPEED * parseFloat(getComputedStyle(track).fontSize))}s`);
});
export function fitBar() {
  const bar = /** @type {HTMLElement | null} */ (document.querySelector('.site-bar'));
  if (!bar) return;
  const track = bar.querySelector('.bar-news-track'), copy = track?.querySelector('.bar-news-copy');
  if (track && copy && !track.querySelector('[data-dup]')) {
    const dup = /** @type {HTMLElement} */ (copy.cloneNode(true));
    dup.setAttribute('data-dup', '');
    dup.setAttribute('aria-hidden', 'true');
    track.appendChild(dup);
    marqueeSize.observe(copy);
  }
  const left = /** @type {HTMLElement} */ (bar.querySelector('.bar-left'));
  if (html.classList.contains('menu-open')) return;
  bar.style.setProperty('--side-min', left.offsetWidth + 'px');
}

export function initChrome() {
  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    if (t.closest('.menu-btn')) { setMenu(!html.classList.contains('menu-open')); return; }
    if (t.closest('.theme-btn')) { toggleTheme(); return; }
    if (t.closest('.intro-close')) { /** @type {HTMLDialogElement} */ (document.getElementById('intro-dialog')).close(); return; }
    const play = t.closest('.play-btn');
    if (play instanceof HTMLElement) { openIntro(play); return; }
    if (t.closest('.figure-btn')) { openFigure(document.querySelector('#page-content .page-figure > *'), e); return; }
    if (t.closest('.figure-prev')) { stepFigure(-1); return; }
    if (t.closest('.figure-next')) { stepFigure(1); return; }
    const shot = t.closest('.album button');
    if (shot) { openFigure(shot.querySelector('img'), e, galleryOf(shot)); return; }
    // 清單列掛 data-zoom（報導，user 2026-11-21）：不換頁、不另開，放大 dialog 直接看 href 那張圖（報導的截圖）
    const zoom = t.closest('a[data-zoom]');
    if (zoom instanceof HTMLAnchorElement) { e.preventDefault(); openFigure(Object.assign(new Image(), { src: zoom.href, alt: zoom.querySelector('h3')?.textContent ?? '' }), e); return; }
    if (t.closest('#figure-dialog')) { closeFigure(); return; }   // 放大後點任何地方都關（X 也是）
    // 點選單連結：這裡不收，交給 router.js loadPage 先收選單、收完才淡出換頁（user 2026-11-18）；修飾鍵另開分頁的不路由＝選單留著
    if (t.closest('.site-menu a')) return;
    // 手機選單全螢幕（chrome.css，user 2026-11-22）：點選單的空白處＝收選單。用 click 不用 pointerdown：拖著捲選單不會觸發
    if (t.closest('.site-menu') && !t.closest('button') && phoneMenu.matches) { setMenu(false); return; }
    // 首頁：動態原地展開、不走 router（preventDefault → router 看到 defaultPrevented 放行）
    // 選單開著時動態是糊掉的內容（chrome.css，user 2026-11-21）：點它＝第一下只收選單、不展開／收合（同右邊內容）。
    // 滑鼠點不到它（不吃指標，下面 pointerdown 那條收）；這裡接的是沒經過聚焦的 click（程式、輔助科技）
    if (t.closest('.bar-news') && document.body.dataset.page === 'index') {
      e.preventDefault();
      if (html.classList.contains('menu-open')) setMenu(false); else setNews(!html.classList.contains('news-open'));
    }
  });
  // 打開的那則（details[open]）點封面縮圖＝放大封面（user 2026-11-18）。走 capture：那時 open 還是點之前的狀態
  // （accordion.js 在 main 的冒泡 listener 會先把它標 open）；攔下來不往下傳＝不開合、也不走上面那個委派
  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    const cover = t?.closest('details[open]:not(.is-closing) > summary .item-thumb');
    const img = cover?.querySelector('img');   // 裡面有圖的才是封面（榮譽的國旗本身就是 .item-thumb＝點了照常收合）
    if (!cover || !img) return;
    e.preventDefault(); e.stopPropagation();
    openFigure(img, e, galleryOf(cover));
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeOverlays();
    // 放大 dialog 開著：左右鍵切上一張／下一張
    if (e.key === 'ArrowLeft') stepFigure(-1); else if (e.key === 'ArrowRight') stepFigure(1);
  });
  // 選單開著時對右邊內容做任何操作＝第一下只收選單、內容不動（user 2026-11-18）：在 #page-content 按下（滑鼠／觸控）、鍵盤聚焦進去、
  // 選單外滾輪／觸控滑動（內容本來就鎖住捲不動，見 chrome.css .menu-open overflow）。不用 scroll 事件：換頁回頂那類程式捲動會誤收。
  // 選單開著內容不吃指標（chrome.css，user 2026-11-21）→ 按在右邊時 target 是 body／html；連結也點不到＝第一下真的只收選單。
  // 首頁底列的動態也算內容（同樣不吃指標）→ 按在它上面時 target 是底列本身（.site-bar；底列的空白處一起算，那裡也在選單外）
  const inContent = (/** @type {Event} */ e) => e.target === document.body || e.target === html
    || (e.target instanceof Element && (e.target.matches('.site-bar') || !!e.target.closest('#page-content, .bar-news')));
  // 選單那一欄不算內容：target 在 .site-menu 裡，或指標 x 在選單右緣左邊（選單透明、空隙處事件會穿到底下的內容）
  const inMenuColumn = (/** @type {Event} */ e) => {
    if (e.target instanceof Element && e.target.closest('.site-menu')) return true;
    const x = 'touches' in e ? /** @type {TouchEvent} */ (e).touches[0]?.clientX : /** @type {MouseEvent} */ (e).clientX;
    const m = document.querySelector('.site-menu');
    return !!m && x !== undefined && x <= m.getBoundingClientRect().right;
  };
  const closeMenuIfOpen = () => { if (html.classList.contains('menu-open')) setMenu(false); };
  // 滾輪／觸控滑動：選單開著＝第一下只關選單；關掉後同一個手勢還在送事件＝繼續鎖，停了才解。兩種都 preventDefault 讓內容不動
  // （CSS 的 overflow: hidden 在 WebKit 擋不住滾輪捲 viewport，實測照樣捲 100px）→ listener 要 passive: false；平常不開選單時什麼都不做
  const onScrollGesture = (/** @type {Event} */ e) => {
    const open = html.classList.contains('menu-open'), closing = html.classList.contains('menu-closing');
    if (!open && !closing) return;
    if (open && inMenuColumn(e)) return;   // 在選單那一欄捲＝捲選單自己（選單比畫面高時）
    e.preventDefault();
    if (closing) lockScroll(LOCK_TAIL); else setMenu(false);
  };
  document.addEventListener('pointerdown', (e) => { if (inContent(e)) closeMenuIfOpen(); });
  document.addEventListener('focusin', (e) => { if (inContent(e)) closeMenuIfOpen(); });
  document.addEventListener('wheel', onScrollGesture, { passive: false });
  document.addEventListener('touchmove', onScrollGesture, { passive: false });
  // 右圖 dialog 的 Esc：原生會直接關 → 攔下來走淡出。cancel 不冒泡 → capture
  document.addEventListener('cancel', (e) => { if (e.target === figureDialog()) { e.preventDefault(); closeFigure(); } }, true);

  // 名字現／隱（hover、鍵盤聚焦）→ 側邊寬變 → 下一幀重量（等樣式套上）；視窗寬也是
  const refit = (e) => { if (e.target instanceof Element && e.target.closest('.site-bar')) requestAnimationFrame(fitBar); };
  ['mouseover', 'mouseout', 'focusin', 'focusout'].forEach(type => document.addEventListener(type, refit));
  window.addEventListener('resize', fitBar);
  // 頂部模糊帶：捲離頂端才疊半透明（chrome.css .top-blur）；換頁捲回頂也會觸發 scroll
  const onScroll = () => html.classList.toggle('is-scrolled', window.scrollY > 0);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  // 鈕的名字寬是補間的（chrome.css .bar-label：旁邊的 play 滑過去，user 2026-11-21）→ 補間那段每幀重量底列：
  // 側邊放不下名字時動態跟著一點一點縮／放回來，不會等名字長完才跳
  let fitUntil = 0;
  const fitLoop = () => { fitBar(); if (performance.now() < fitUntil) requestAnimationFrame(fitLoop); else fitUntil = 0; };
  document.addEventListener('transitionrun', (e) => {
    if (e.propertyName !== 'grid-template-columns' || !(e.target instanceof Element) || !e.target.matches('.bar-label')) return;
    const looping = fitUntil > 0;
    fitUntil = performance.now() + DUR.fade * 1000 + 100;   // 補間的時長（--dur-fade）＋一點餘裕，最後一幀量到定位後的寬
    if (!looping) requestAnimationFrame(fitLoop);
  });
}
