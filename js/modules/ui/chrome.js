/**
 * 全站殼行為（結構 pages/header.html，樣式 css/components/chrome.css）：
 * 選單開關、底列量測（兩側等寬）、首頁底列的動態（一則一則換）與原地展開、手機的右圖鈕、放大 dialog（圖片／影片＋自己的控制列；首頁的 intro 影片也開在這裡）。
 * 全部 document 委派＝片段注入前後都綁得到；狀態掛 <html> class（menu-open／news-open）
 */
import { DUR, fadeSwap } from './motion.js';
import { prefersReducedMotion } from './reduce-motion.js';
import { syncObject, openObject, closeObject } from './object.js';
import { logoToStroke, logoPage } from './logo.js';
import { flash, remeasure, hoverIfOver } from './item-marquee.js';

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
// 首頁動態展開（點底列的動態，下面 openNewsAt）：底列的動態先淡出，logo 上移、清單從畫面底下升上來（晚 --news-wait 才動，home.css）。
// 收合（點動態以外的地方／再點底列／Esc）＝反向（user 2026-11-19）：news-open 先拿掉（logo 回中間），清單掛著 html.news-closing 往下滑出畫面，
// 滑完才真的藏起來、捲回頂。捲到一半收的話，畫面上緣以上的部分先切掉（--news-cut），不然往下滑時會從上面跑出來
let newsClosingTimer = 0;
function endNewsClosing() {
  clearTimeout(newsClosingTimer);
  if (!html.classList.contains('news-closing')) return;
  html.classList.remove('news-closing');
  window.scrollTo({ top: 0, behavior: 'instant' });
}
let risingTimer = 0;
function setNews(open) {
  const was = html.classList.contains('news-open');
  const list = /** @type {HTMLElement | null} */ (document.querySelector('#page-content .home-news-list'));
  clearTimeout(risingTimer);
  if (open) {   // 收到一半又開＝先收完再照常升上來
    endNewsClosing(); html.classList.add('news-open', 'news-rising'); awayNews();
    // 升上來的途中不能 hover（item-marquee.js rising；user 2026-11-24），升完（＝home.css --news-wait＋news-rise，同 openNewsAt 那一閃）才可以、游標停著的那則補做
    risingTimer = window.setTimeout(() => {
      html.classList.remove('news-rising');
      document.querySelectorAll('#page-content .home-news-list li').forEach(hoverIfOver);
    }, prefersReducedMotion() ? 0 : (DUR.fade + DUR.slow) * 1000);
    return;
  }
  html.classList.remove('news-rising');
  if (!was) { if (!list) endNewsClosing(); return; }   // 本來沒開著就沒事（closeOverlays 每次 Esc／換頁都會進來）；收到一半換頁了＝直接收尾
  clearTimeout(flashTimer);   // 定位後那一閃還沒開始就收＝不閃了（openNewsAt；閃到一半的跟著清單滑走）
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
  document.querySelectorAll('.theme-btn').forEach(b => {
    b.setAttribute('aria-pressed', String(html.dataset.theme === 'dark'));
    /** @type {HTMLButtonElement} */ (b).disabled = document.body.dataset.page === 'works';   // 作品頁一律深色（下面 syncPageTheme）
  });
}
// 作品頁（user 2026-11-23）：不管存的是哪種都暗；離開＝回到存的那種（不寫進 localStorage）。換頁時 main.js initPageModules 叫，
// 過場同切換（整個畫面 fade）；直接開 works.html＝<head> 的 inline script 就先暗了。放大 dialog 在放影片＝也暗（關燈，下面 lights） @param {string} page
let lightsOff = false;
/** @param {string} page @param {boolean} [fade] false＝不整張交叉淡化（關燈：背景、logo 的顏色自己過場，見 lights） */
export function syncPageTheme(page, fade = true) {
  let saved = '';
  try { saved = localStorage.getItem(THEME_KEY) || ''; } catch {}
  const dark = lightsOff || page === 'works' || saved === 'dark';
  if (dark === (html.dataset.theme === 'dark')) { syncTheme(); return; }
  const apply = () => {
    if (dark) html.dataset.theme = 'dark'; else delete html.dataset.theme;
    syncTheme();
  };
  // 首頁 → 作品頁：logo 正在上移（router 掛 logo-moving），整張交叉淡化＝舊截圖的黑 logo 定在正中淡掉、白的在移＝卡、疊兩個（user 2026-11-24）→ 同關燈
  if (!fade) apply(); else if (html.classList.contains('logo-moving')) glide(apply); else fadeSwap(apply);
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
export function closeOverlays(news = true) { setMenu(false); if (news) setNews(false); awayNews(); }   // awayNews：換頁離開首頁（router 先換 data-page 才叫這裡）

// intro（首頁底列的 ▶）：data-video 有網址才開。一支影片開在放大 dialog（user 2026-11-23；原本自己一個滿版黑底的 dialog、用 YouTube 自己的控制列）：
// YouTube 連結＝iframe（youtube-nocookie：規章頁寫了不蒐集個人資料；autoplay＝點了就播、playsinline＝iPhone 不自己跳全螢幕）；
// 其他＝直連的影片檔（.mp4、.m3u8）＝原生 <video>。控制列、關燈、關掉整個拿掉＝放大 dialog 那套（renderFigure）
/** YouTube 的影片 id（youtu.be/…、watch?v=…、/embed/、/shorts/、/live/）；不是 YouTube 的網域＝undefined——不先看網域的話，
 *  …/live/graduation-2026.mp4、?v=快取參數 這種直連的檔會被認成 YouTube @param {string} url */
export const youtubeId = (url) => {
  let u;
  try { u = new URL(url, location.href); } catch { return undefined; }
  if (!/(^|\.)(youtube(-nocookie)?\.com|youtu\.be)$/.test(u.hostname)) return undefined;
  const id = u.hostname.endsWith('youtu.be') ? u.pathname.slice(1) : u.searchParams.get('v') || u.pathname.split('/')[2];
  return id && /^[\w-]{11}$/.test(id) && id !== 'videoseries' ? id : undefined;   // videoseries＝播放清單，不是一支
};
/** YouTube 播放器（intro、作品頁共用）：youtube-nocookie、autoplay＝點了就播、playsinline＝iPhone 不自己跳全螢幕、可以全螢幕 @param {string} id @param {string} title */
export const youtubeFrame = (id, title) => Object.assign(document.createElement('iframe'), {
  src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&playsinline=1&rel=0`,
  allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowFullscreen: true, title,
});
/** 一支影片的播放器（intro、動態相簿裡的影片）：YouTube 連結＝iframe，其他＝直連的影片檔＝原生 <video>
 *  （preload auto：logo 還在動、影片先藏著不播（openFigure）的時候就開始緩衝，淡出來時接得上） @param {string} url @param {string} title */
const player = (url, title) => {
  const id = youtubeId(url);
  return id ? youtubeFrame(id, title) : Object.assign(document.createElement('video'), { src: url, playsInline: true, preload: 'auto' });
};
/** @param {HTMLElement} btn @param {MouseEvent} e */
function openIntro(btn, e) {
  const url = btn.dataset.video;
  if (!url) return;   // 後台「首頁影片」沒填、header.html 的備援也空著
  openFigure(player(url, btn.textContent?.trim() || 'intro'), e);
}

// 內頁的右圖＝殼上的 object 畫布（user 2026-11-22；object.js）。PC：疊在當頁右圖那一格（page.css .page-figure）上；
// PC 以外（手機、iPad，user 2026-11-23；user 2026-11-13 的縮圖鈕，2026-11-22 改成 object 可以打開、關閉）：底列右下角的鈕（長得跟 menu 鈕一樣，user 2026-11-23；原本在畫面右緣中線上），點了開 dialog、把畫布搬進去，關掉搬回來。
// 換頁（main.js initPageModules）、header 片段注入後都要 sync：畫布重找這一頁的那一格；該頁沒有右圖（首頁）＝鈕不現身
const figureDialog = () => /** @type {HTMLDialogElement | null} */ (document.getElementById('figure-dialog'));
export function syncFigure() {
  const btn = document.querySelector('.figure-btn'), dialog = figureDialog();
  if (!btn || !dialog) return;   // header 片段還沒注入
  if (dialog.open) dialog.close();   // 開著時換頁（上一頁／下一頁）
  btn.classList.toggle('has-figure', !!document.querySelector('#page-content .page-figure'));
  dialog.classList.remove('has-nav');
  syncObject();
}
/** PC 以外那顆鈕：開 dialog 看 object @param {MouseEvent} e */
function openObjectDialog(e) {
  const dialog = figureDialog(), box = dialog?.querySelector('.figure-dialog-body');
  if (!dialog || !box) return;
  figureItems = []; dialog.classList.remove('has-nav', 'has-video'); dialog.setAttribute('aria-label', '圖片');
  dialog.classList.add('is-object');   // 沒有 ‹ X ›、關閉＝右下角那顆骨牌（chrome.css .figure-obj-close；user 2026-11-24）
  openObject(box);
  dialog.showModal();
  if (e.detail && document.activeElement instanceof HTMLElement) document.activeElement.blur();   // 同 openFigure：滑鼠／觸控點開的不亮焦點框
}
// 開放大 dialog：內容開的時候才放（那個節點的複本）——右緣縮圖鈕＝當頁右圖；動態那則（打開的）點封面縮圖或相簿哪張＝
// 同一組「封面（第一張）＋相簿」可左右切（user 2026-11-19；原本點封面只有那一張）。多於一張才出 ‹ ›（.has-nav）；到頭的那邊 disabled
// 影片（作品頁總覽的 YouTube、首頁的 intro）用自己的控制列（user 2026-11-23：播放／暫停、音量、全螢幕，關閉＝menu 鈕那顆）、開著＝關燈
let figureItems = /** @type {Element[]} */ ([]), figureIndex = 0;
let figureStep = /** @type {((i: number) => void) | null} */ (null);   // 切到第幾個時叫（openFigure 給；作品總覽：背景跟著捲過去）
function renderFigure() {
  const dialog = figureDialog();
  if (!dialog || !figureItems[figureIndex]) return;
  dialog.classList.remove('is-object');   // 手機的右圖 object 那種（openObjectDialog）以外＝照常有控制列
  const node = /** @type {Element} */ (figureItems[figureIndex].cloneNode(true)), video = node instanceof HTMLVideoElement, yt = node instanceof HTMLIFrameElement;
  if (yt) node.src += '&controls=0&enablejsapi=1';   // YouTube 收掉它自己的控制列、開 postMessage（下面 mediaAct）
  if (video) node.controls = false;
  dialog.querySelector('.figure-dialog-body')?.replaceChildren(node);
  dialog.classList.toggle('has-video', video || yt);
  dialog.classList.toggle('no-fs', !document.fullscreenEnabled && !video);   // iPhone：只有 <video> 能全螢幕（webkitEnterFullscreen）
  dialog.classList.toggle('no-vol', !canVolume);
  dialog.setAttribute('aria-label', video || yt ? '影片' : '圖片');
  if (video) { mediaState(true, node.muted, node.volume); if (!dialog.classList.contains('is-waiting')) node.play().catch(() => {}); }   // 播了（play 事件）圖示才換；等 logo 的時候先不播（openFigure）
  if (yt) { mediaState(false, false, 1); listen(node); }                                    // autoplay=1：先當作在播、全音量，播放器回報了再照它
  lights(video || yt);
  dialog.classList.toggle('has-nav', figureItems.length > 1);
  const prev = dialog.querySelector('.figure-prev'), next = dialog.querySelector('.figure-next');
  if (prev instanceof HTMLButtonElement) prev.disabled = figureIndex <= 0;
  if (next instanceof HTMLButtonElement) next.disabled = figureIndex >= figureItems.length - 1;
}
/** 動態那則的一組：封面縮圖在前、相簿照順序（不在摺疊裡的相簿＝只有那本）。相簿裡的影片（button[data-video]；動態，user 2026-11-24，
 *  cms-pages.js videoShot）＝放大 dialog 裡放播放器、切到才載（同作品頁的總覽），其他＝那張圖
 *  @param {Element} el 點的那一格（相簿的 button）或封面的 img @param {MouseEvent} e */
function openGallery(el, e) {
  const src = [...(el.closest('details') ?? el.closest('.album'))?.querySelectorAll(':scope > summary .item-thumb img, .album button') ?? []];
  const items = src.map(s => !(s instanceof HTMLButtonElement) ? s : s.dataset.video ? player(s.dataset.video, s.textContent?.trim() || '影片') : s.querySelector('img'));
  const node = items[src.indexOf(el)];
  if (node) openFigure(node, e, /** @type {Element[]} */ (items.filter(Boolean)));
}
/** 作品頁的總覽也用它（user 2026-11-23：點了就地開 lightbox，一組＝總覽全部；影片的節點＝youtubeFrame，切到才載、切走就停）
 *  @param {Element | null} node @param {MouseEvent} e @param {Element[]} [items] 這一組（不給＝只有這一張）
 *  @param {(i: number) => void} [onStep] 上一個／下一個切到第 i 個時叫（作品總覽：背景的總覽跟著捲到那一個） */
export function openFigure(node, e, items, onStep) {
  const dialog = figureDialog();
  if (!dialog || !node) return;
  figureItems = items?.length ? items : [node];
  figureIndex = Math.max(0, figureItems.indexOf(node));
  figureStep = onStep || null;
  clearTimeout(swapTimer); dialog.classList.remove('is-swapping');   // 上次切到一半就關了
  // 先讓背景跟 logo 動（user 2026-11-23：「背景跟 logo 同時開始動畫，logo 淡成白色；logo 動畫好了之後，影片跟 ui 才開始 fade 出來」）：
  // 首頁（intro）logo 從正中移到頂（home.css）、停在 stroke；影片＝關燈（lights，顏色過場同 logo 上移的時長）。這段內容藏著（.is-waiting）、影片先不播，動完才淡出來、開始播
  const home = document.body.dataset.page === 'index', item = figureItems[figureIndex];
  const wait = !prefersReducedMotion() && ((home && !html.classList.contains('news-open'))
    || ((item instanceof HTMLVideoElement || item instanceof HTMLIFrameElement) && html.dataset.theme !== 'dark'));
  dialog.classList.toggle('is-waiting', wait);
  renderFigure();
  dialog.showModal();
  const logo = home ? logoToStroke(true) : null;   // 首頁：停在 stroke 同內頁（正在變的那段直接切過去），關了再接著來回
  if (wait) Promise.all([logo, new Promise(r => setTimeout(r, DUR.slow * 1000))]).then(() => {
    if (!dialog.open || dialog.classList.contains('is-closing')) return;
    dialog.classList.remove('is-waiting');
    const m = shownMedia();
    if (m instanceof HTMLVideoElement) m.play().catch(() => {});
  });
  // showModal 會自動聚焦第一個鈕 → 滑鼠／觸控點開的不要一開就亮焦點框（鍵盤 Enter 的 detail 是 0，照常聚焦）
  if (e.detail && document.activeElement instanceof HTMLElement) document.activeElement.blur();
}
/** 放大 dialog 裡現在那支影片（沒有＝null） */
const shownMedia = () => /** @type {HTMLVideoElement | HTMLIFrameElement | null} */ (figureDialog()?.querySelector('.figure-dialog-body > :is(video, iframe)') ?? null);
/** 現在全螢幕的是不是放大 dialog 那一塊（內容＋控制列） */
const fsStage = () => { const f = document.fullscreenElement; return f instanceof HTMLElement && f.matches('.figure-stage') ? f : null; };
// 全螢幕時控制列平常藏著、游標也藏（chrome.css .is-idle）：游標動了／按了鍵才淡出來，停 IDLE（游標不在控制列上）又藏
// （user 2026-11-23：「游標有動那些 ui 才在全螢幕狀態下 fade 出來」；3 秒同 SCCD 播放器沒動自動收）
const IDLE = 3000;
let idleTimer = 0;
/** @param {Event} e */
function wakeControls(e) {
  const st = fsStage();
  if (!st) return;
  st.classList.remove('is-idle');
  clearTimeout(idleTimer);
  if (e.target instanceof Element && e.target.closest('.figure-ctrl, .media-play')) return;   // 游標在控制列（含影片正中的播放鈕）上＝先不藏
  idleTimer = window.setTimeout(() => st.classList.add('is-idle'), IDLE);
}
// 這台能不能用網頁調音量（iPhone 不行：volume 設了還是 1，只能用手機的音量鍵）→ 不行就只留靜音（chrome.css .no-vol）
const canVolume = (() => { const v = document.createElement('video'); v.volume = 0.5; return v.volume === 0.5; })();
let volume = 1;   // 現在的音量（0～1；靜音另外記）
const BARS = 20;   // 音量拉桿的直條數＝一根 5%（樣子照 ai 的 volume、長度照一般播放器；header.html 那個 range 的 max、chrome.css --bars）
/** 播著沒、靜音沒、音量 → dialog 的 class（控制列的圖示照它換，chrome.css：靜音 silence、一半以下 half、其他 loud）、鈕的 aria-pressed、
 *  拉桿亮幾根（靜音＝0 根） @param {boolean} paused @param {boolean} muted @param {number} [v] */
function mediaState(paused, muted, v = volume) {
  const d = figureDialog();
  if (!d) return;
  volume = v;
  const level = muted ? 0 : Math.round(v * BARS);
  d.classList.toggle('is-paused', paused);
  d.classList.toggle('is-muted', muted);
  d.classList.toggle('is-half', level > 0 && level <= BARS / 2);
  d.querySelector('.media-play')?.setAttribute('aria-pressed', String(!paused));
  d.querySelector('.media-mute')?.setAttribute('aria-pressed', String(muted));
  const range = d.querySelector('.media-vol');
  if (range instanceof HTMLInputElement) { range.value = String(level); range.parentElement?.style.setProperty('--level', String(level)); }
}
/** YouTube 的播放器（enablejsapi）：叫它做事 @param {HTMLIFrameElement} f @param {string} func @param {unknown[]} [args] */
const ytSend = (f, func, args = []) => f.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
/** 控制列的鈕：<video> 直接叫（圖示等 play／pause／volumechange 事件換）；YouTube＝postMessage 給它的播放器（同 SCCD pause-offscreen-video.js），
 *  它不會馬上回報 → 先照按的改圖示。全螢幕＝.figure-stage（內容＋控制列）；iPhone 只能讓 <video> 自己全螢幕 @param {'play' | 'mute' | 'fs'} act */
function mediaAct(act) {
  const m = shownMedia(), d = figureDialog();
  if (!m || !d) return;
  const paused = d.classList.contains('is-paused'), muted = d.classList.contains('is-muted');
  if (act === 'mute' && muted && !volume) { mediaVolume(1); return; }   // 拉到 0 之後按取消靜音：回到全音量（不然按了還是沒聲音）
  if (act === 'fs') {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (document.fullscreenEnabled) d.querySelector('.figure-stage')?.requestFullscreen().catch(() => {});
    else /** @type {any} */ (m).webkitEnterFullscreen?.();
  } else if (m instanceof HTMLVideoElement) {
    if (act === 'mute') m.muted = !muted; else if (paused) m.play().catch(() => {}); else m.pause();
  } else {
    ytSend(m, act === 'mute' ? (muted ? 'unMute' : 'mute') : (paused ? 'playVideo' : 'pauseVideo'));
    mediaState(act === 'play' ? !paused : paused, act === 'mute' ? !muted : muted);
  }
}
/** 音量拉桿：拉到 0＝靜音、拉起來＝取消靜音 @param {number} v 0～1 */
function mediaVolume(v) {
  const m = shownMedia(), d = figureDialog();
  if (!m || !d) return;
  if (m instanceof HTMLVideoElement) { m.volume = v; m.muted = !v; return; }   // volumechange → mediaState
  ytSend(m, 'setVolume', [Math.round(v * 100)]);
  ytSend(m, v ? 'unMute' : 'mute');
  mediaState(d.classList.contains('is-paused'), !v, v);
}
// YouTube 的播放器（enablejsapi）要先跟它說「在聽」，它才回報狀態；沒回就每 0.25 秒再說一次（官方 iframe_api 也這樣），最多 10 秒
const heard = new WeakSet();
/** @param {HTMLIFrameElement} f */
function listen(f) {
  let n = 0;
  const t = setInterval(() => {
    if (heard.has(f) || !f.isConnected || ++n > 40) clearInterval(t);
    else f.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*');
  }, 250);
}
// 關燈（user 2026-11-23：開影片＝像作品頁那樣整頁變暗）：放大 dialog 在放影片＝深色，關掉／換到圖片＝回到這頁該有的那種（syncPageTheme）。
// 不走 fadeSwap 的整張交叉淡化（logo 同時在上移，會疊出兩個）：掛 html.is-lights 這段＝背景、logo 的顏色自己過場（chrome.css）
let lightsTimer = 0;
/** 換深淺、顏色自己過場（--dur-slow，同 logo 上移） @param {() => void} apply */
function glide(apply) {
  html.classList.add('is-lights');
  clearTimeout(lightsTimer);
  lightsTimer = window.setTimeout(() => html.classList.remove('is-lights'), DUR.slow * 1000 + 100);
  apply();
}
/** @param {boolean} off */
function lights(off) {
  if (off === lightsOff) return;
  lightsOff = off;
  glide(() => syncPageTheme(document.body.dataset.page || '', false));
}
/** 上一張／下一張（到頭不動）。作品頁＝淡出 → 換 → 淡入（user 2026-11-24：「作品頁面中的影片跟圖片切換，要用 fade in out」；網站 fade，
 *  chrome.css .is-swapping）；連按＝只換到最後那一個。其他頁（動態的相簿）照舊直接換 @param {number} dir */
let swapTimer = 0;
function stepFigure(dir) {
  const i = figureIndex + dir, d = figureDialog();
  if (!d?.open || i < 0 || i >= figureItems.length) return;
  figureIndex = i;
  figureStep?.(i);
  if (document.body.dataset.page !== 'works' || prefersReducedMotion()) { renderFigure(); return; }
  d.classList.add('is-swapping');
  clearTimeout(swapTimer);
  swapTimer = window.setTimeout(() => {
    if (d.open && !d.classList.contains('is-closing')) renderFigure();
    d.classList.remove('is-swapping');
  }, DUR.fade * 1000);
}
// 關＝先淡出（.is-closing）、淡完才真的 close()；全螢幕先退、開燈跟著淡出一起
function closeFigure() {
  const dialog = figureDialog();
  if (!dialog?.open || dialog.classList.contains('is-closing')) return;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  lights(false);
  dialog.classList.add('is-closing');
  setTimeout(() => { dialog.classList.remove('is-closing'); dialog.close(); }, prefersReducedMotion() ? 0 : DUR.fade * 1000);
}

// 底列量測（chrome.css .site-bar）：兩側欄最小寬＝左欄內容寬（--side-min；右欄只有右圖的鈕、比左欄窄，user 2026-11-23）→ 兩側等寬＝動態永遠畫面正中。
// 選單開著不量：menu 鈕撐成選單欄那格（chrome.css），量進去會把中欄擠掉；就讓它溢出側欄（動態那時是糊掉的內容）。
// 順便：動態的標題整個換掉了（後台晚到：cms-pages.js loadBarNews 換完叫這裡）＝從第一則重來
export function fitBar() {
  const bar = /** @type {HTMLElement | null} */ (document.querySelector('.site-bar'));
  if (!bar) return;
  if (!newsCur?.isConnected) startNews();
  const left = /** @type {HTMLElement} */ (bar.querySelector('.bar-left'));
  if (html.classList.contains('menu-open')) return;
  bar.style.setProperty('--side-min', left.offsetWidth + 'px');
}

// 首頁底列的動態（user 2026-11-23：拿掉＋、一次只顯示一則；原本好幾則排成一排一直跑、兩份接力）：
// 放得下＝停 NEWS_HOLD；放不下＝淡入完就從頭捲到尾、捲到尾馬上換（user 2026-11-23：前後都不停；原本前後各停 1 秒）；
// 換＝網站 fade，先淡出、淡完才淡入下一則（不交疊＝不會兩則疊在一起）。
// 滑鼠在上面／鍵盤聚焦＝先不換（WCAG 2.2.2；點下去展開的就是看到的這則）；看不到的時候（不在首頁、首頁展開著）＝在底下換好下一則、停著，
// 回來才開始計時（awayNews）。減少動態＝不捲、直接換
const MARQUEE_SPEED = 2.5;                  // 跑馬燈每秒走幾個 em（清單列的跑馬燈 2026-11-23 起照 SCCD 每秒 80px，不跟這個，item-marquee.js）
const NEWS_HOLD = 3000;                     // 放得下停多久（ms）
let newsAt = 0, newsGen = 0, newsSeen = false;   // newsSeen：現在這則被看到過了（awayNews 才換）
/** 現在顯示的那則（被換掉＝不在頁面上了＝fitBar 從頭重來） @type {HTMLElement | null} */ let newsCur = null;
const newsItems = () => /** @type {HTMLElement[]} */ ([...document.querySelectorAll('.site-bar .bar-news-copy > span')]);
const newsSleep = (/** @type {number} */ ms) => new Promise(r => setTimeout(r, ms));
/** 看不到動態：不在首頁、首頁展開著（底列的動態淡掉了） */
const newsAway = () => document.body.dataset.page !== 'index' || html.classList.contains('news-open') || html.classList.contains('news-closing');
const newsHeld = () => newsAway()
  || !!document.querySelector(window.SCAIDHelpers?.canHover() ? '.bar-news:is(:hover, :focus-visible)' : '.bar-news:focus-visible');   // 觸控：點完 :hover 會黏著
function startNews() { newsAt = 0; runNews(++newsGen); }
/** 動態看不到了（展開清單、離開首頁；setNews／closeOverlays 叫）：看到過的那則等淡完就換到下一則、停在那裡——
 * 回來淡出現的就是下一則、從那時才開始計時（user 2026-11-23：「回到外面時是直接下一個 news，它不需要回來又 fade 成下一個」） */
function awayNews() {
  if (!newsSeen || !newsAway()) return;
  newsSeen = false;
  const gen = ++newsGen, prev = newsCur;
  newsSleep(prefersReducedMotion() ? 0 : DUR.fade * 1000).then(() => {
    if (gen !== newsGen) return;
    prev?.getAnimations().forEach(a => { if (!(a instanceof CSSTransition)) a.cancel(); });   // 跑到一半的跑馬燈回到起點（看不到了）
    newsAt++;
    runNews(gen);
  });
}
/** @param {number} gen 重來一次就換一個號碼，舊的那圈看到號碼不對就停 */
async function runNews(gen) {
  const still = prefersReducedMotion(), fade = still ? 0 : DUR.fade * 1000, alive = () => gen === newsGen;
  for (;;) {
    const items = newsItems();
    if (!items.length) { newsCur = null; return; }
    newsAt %= items.length;
    const cur = newsCur = items[newsAt], track = cur.closest('.bar-news-track');
    const over = cur.getBoundingClientRect().width - (track?.clientWidth ?? Infinity);
    cur.classList.toggle('is-long', over > 0.5);   // 放不下＝從欄的左緣起；放得下＝置中（chrome.css）
    items.forEach(s => s.classList.toggle('is-current', s === cur));   // 淡入（看不到的時候＝在底下換好）
    remeasure();   // hover 著的直條搬到這則的字尾（展開時在底下換的，收回來游標還在上面）
    await newsSleep(fade);
    while (alive() && newsAway()) await newsSleep(300);   // 看不到：停在這則，回來才開始算
    if (!alive()) return;
    newsSeen = true;
    if (over > 0.5 && !still) {
      const run = cur.animate([{ transform: 'none' }, { transform: `translateX(${-over}px)` }],
        { duration: over / (MARQUEE_SPEED * parseFloat(getComputedStyle(cur).fontSize)) * 1000, easing: 'linear', fill: 'forwards' });
      await run.finished.catch(() => {});
    } else await newsSleep(NEWS_HOLD);
    while (alive() && newsHeld()) await newsSleep(300);
    if (!alive()) return;
    cur.classList.remove('is-current');   // 淡出，淡完才換下一則
    await newsSleep(fade);
    cur.getAnimations().forEach(a => { if (!(a instanceof CSSTransition)) a.cancel(); });   // 捲過去的那則回到起點（已經淡掉、看不到了）
    if (!alive()) return;
    newsAt++;
  }
}
// 首頁：點底列的動態＝原地展開清單，定位到點下去時顯示的那一則、閃一下（user 2026-11-23）
let flashTimer = 0;
/** @param {number} i */
function openNewsAt(i) {
  setNews(true);
  const li = /** @type {HTMLElement | undefined} */ (document.querySelectorAll('#page-content .home-news-list li')[i]);
  const list = /** @type {HTMLElement | null | undefined} */ (li?.closest('.home-news-list'));
  if (!li || !list) return;
  // 那則的中線對到畫面正中；捲不到（太上面、只有一則）＝捲到能捲的地方為止、不硬置中。清單這時還在畫面底下等著升上來
  // （home.css news-rise，有位移）→ 量的時候先拿掉動畫（還沒開始跑；拿掉再放回＝照常從頭跑）；先捲好，升上來就是定位好的樣子
  list.style.animation = 'none';
  const r = li.getBoundingClientRect(), y = r.top + scrollY + r.height / 2 - innerHeight / 2, max = document.documentElement.scrollHeight - innerHeight;
  const top = Math.max(0, Math.min(max, y)), listTop = list.getBoundingClientRect().top + scrollY - top;   // 捲好之後清單上緣在畫面的哪裡
  list.style.animation = '';
  // 升上來的起點＝看得到的最上面那一點在畫面底緣（同收合的 --news-drop）：沒捲＝原本的 100svh − top-h，捲了就照捲完的位置算
  list.style.setProperty('--news-rise', `${innerHeight - Math.max(0, listTop)}px`);
  window.scrollTo({ top, behavior: 'instant' });
  // 升好了閃一下（同 SCCD 的 deep link）＝hover 的蓋黑收直條、直條停一下就淡掉（item-marquee.js flash；user 2026-11-23：「highlight 是指我 hover 的效果」）
  clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => flash(li), prefersReducedMotion() ? 0 : (DUR.fade + DUR.slow) * 1000);   // ＝home.css --news-wait（底列的動態淡出）＋清單升上來
}

export function initChrome() {
  let menuTap = false;   // 這一下的按下剛把選單收掉（下面 pointerdown）＝它的 click 不再做別的事（第一下只收選單）
  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null, tap = menuTap;
    menuTap = false;
    if (!t) return;
    if (t.closest('.menu-btn')) { setMenu(!html.classList.contains('menu-open')); return; }
    if (t.closest('.theme-btn')) { toggleTheme(); return; }
    const play = t.closest('.play-btn');
    if (play instanceof HTMLElement) { openIntro(play, e); return; }
    if (t.closest('.figure-btn')) { openObjectDialog(e); return; }
    if (t.closest('.object-canvas')) return;   // dialog 裡的 object：點它＝露出名字、拖＝轉視角（object.js），不算「點任何地方都關」
    if (t.closest('.figure-prev')) { stepFigure(-1); return; }
    if (t.closest('.figure-next')) { stepFigure(1); return; }
    // 影片的控制列；點影片本身＝播放／暫停、不關（YouTube 的點擊在它自己的 iframe 裡，到不了這裡）
    // 全螢幕時 YouTube 上面蓋的那層透明的（chrome.css；點到的是 .figure-dialog-body 本身）也是
    if (t.closest('.media-play, .figure-dialog-body > video') || (t.matches('.figure-dialog-body') && fsStage())) { mediaAct('play'); return; }
    if (t.closest('.media-mute')) { mediaAct('mute'); return; }
    if (t.closest('.media-fs')) { mediaAct('fs'); return; }
    if (t.closest('.figure-close')) { closeFigure(); return; }   // 關閉（X）在正中那排裡（user 2026-11-24），下一行之前先接
    if (t.closest('.figure-ctrl')) return;   // 控制列的空隙、音量拉桿：不算「點旁邊」
    const shot = t.closest('.album button');
    if (shot) { openGallery(shot, e); return; }
    // 清單列掛 data-zoom（報導，user 2026-11-21）：不換頁、不另開，放大 dialog 直接看 href 那張圖（報導的截圖）
    const zoom = t.closest('a[data-zoom]');
    if (zoom instanceof HTMLAnchorElement) { e.preventDefault(); openFigure(Object.assign(new Image(), { src: zoom.href, alt: zoom.querySelector('h3')?.textContent ?? '' }), e); return; }
    if (t.closest('#figure-dialog')) { closeFigure(); return; }   // 放大後點任何地方都關（X 也是）
    // 點選單連結：這裡不收，交給 router.js loadPage 先收選單、收完才淡出換頁（user 2026-11-18）；修飾鍵另開分頁的不路由＝選單留著
    if (t.closest('.site-menu a')) return;
    // 手機選單全螢幕（chrome.css，user 2026-11-22）：點選單的空白處＝收選單。用 click 不用 pointerdown：拖著捲選單不會觸發
    if (t.closest('.site-menu') && !t.closest('button') && phoneMenu.matches) { setMenu(false); return; }
    // 首頁展開著：點動態以外的地方＝收回去（user 2026-11-23：「點別的地方可以回到上一個畫面」；原本靠底列的 －）。
    // 清單裡那幾則照常點進去；連結、鈕、選單照它們自己的——底列的 menu、play 這時點不到（chrome.css，user 2026-11-24）＝按下去落在底列本身＝收回去；
    // 這一下的按下剛收掉選單＝不算
    if (!tap && html.classList.contains('news-open') && document.body.dataset.page === 'index' && !t.closest('.home-news-list li, a, button, .site-menu')) { setNews(false); return; }
    // 首頁：點底列的動態＝原地展開、定位到看到的那則（不走 router：preventDefault → router 看到 defaultPrevented 放行）；展開著再點＝收回去。
    // 選單開著時動態是糊掉的內容（chrome.css，user 2026-11-21）：點它＝第一下只收選單、不展開／收合（同右邊內容）。
    // 滑鼠點不到它（不吃指標，下面 pointerdown 那條收）；這裡接的是沒經過聚焦的 click（程式、輔助科技）
    if (t.closest('.bar-news') && document.body.dataset.page === 'index') {
      e.preventDefault();
      if (html.classList.contains('menu-open')) setMenu(false);
      else if (html.classList.contains('news-open')) setNews(false);
      else openNewsAt(newsAt);
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
    openGallery(img, e);
  }, true);
  // 放大 dialog 關了（X、點旁邊、Esc、換頁）：object 的畫布搬回殼上。close 不冒泡 → 用 capture 接
  document.addEventListener('close', (e) => { if (e.target === figureDialog()) closeObject(); }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeOverlays();
    // 放大 dialog 開著：左右鍵切上一張／下一張（焦點在音量拉桿上＝左右鍵是調音量，不切）
    if (!(e.target instanceof HTMLInputElement)) { if (e.key === 'ArrowLeft') stepFigure(-1); else if (e.key === 'ArrowRight') stepFigure(1); }
    // 影片：空白鍵＝播放／暫停（user 2026-11-23）。焦點在控制列的鈕上＝照那顆鈕自己的（空白鍵按它）；其他地方都是播放／暫停——
    // 包括一開就聚焦的關閉鈕（autofocus，不然鍵盤開的一按空白鍵就關了；關＝Enter／Esc）。按著不放的重複不算
    const d = figureDialog();
    const own = document.activeElement instanceof HTMLButtonElement && document.activeElement.closest('.figure-ctrl, .media-play') && !document.activeElement.matches('.figure-close');
    if (e.key === ' ' && d?.open && d.classList.contains('has-video') && !own) {
      e.preventDefault();
      if (!e.repeat) mediaAct('play');
    }
  });
  // 選單開著時對右邊內容做任何操作＝第一下只收選單、內容不動（user 2026-11-18）：在 #page-content 按下（滑鼠／觸控）、鍵盤聚焦進去、
  // 選單外滾輪／觸控滑動（內容本來就鎖住捲不動，見 chrome.css .menu-open overflow）。不用 scroll 事件：換頁回頂那類程式捲動會誤收。
  // 選單開著內容不吃指標（chrome.css，user 2026-11-21）→ 按在右邊時 target 是 body／html；連結也點不到＝第一下真的只收選單。
  // 首頁底列的動態也算內容（同樣不吃指標）→ 按在它上面時 target 是底列本身（.site-bar；底列的空白處一起算，那裡也在選單外）
  const inContent = (/** @type {Event} */ e) => e.target === document.body || e.target === html
    || (e.target instanceof Element && (e.target.matches('.site-bar') || !!e.target.closest('#page-content, .bar-news, .object-canvas')));
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
  document.addEventListener('pointerdown', (e) => { menuTap = inContent(e) && html.classList.contains('menu-open'); if (menuTap) setMenu(false); });
  document.addEventListener('focusin', (e) => { if (inContent(e)) closeMenuIfOpen(); });
  document.addEventListener('wheel', onScrollGesture, { passive: false });
  document.addEventListener('touchmove', onScrollGesture, { passive: false });
  // 右圖 dialog 的 Esc：原生會直接關 → 攔下來走淡出。cancel 不冒泡 → capture
  document.addEventListener('cancel', (e) => { if (e.target === figureDialog()) { e.preventDefault(); closeFigure(); } }, true);
  // 關了（淡完、換頁）＝影片拿掉（dialog 關了它照樣在播、聽得到聲音）、開燈、全螢幕退掉、首頁的 logo 接著來回。
  // 只拿影片——手機的右圖 object 也住在這裡、由 object.js 搬回去。close 不冒泡 → capture
  document.addEventListener('close', (e) => {
    if (e.target !== figureDialog()) return;
    shownMedia()?.remove();
    figureDialog()?.classList.remove('is-waiting');   // logo 還在動就關了：別留著（下次開手機的右圖會整個藏著）
    lights(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (document.body.dataset.page === 'index') logoPage();
  }, true);
  // 直連的影片：播放／暫停／音量變了 → 控制列的圖示（media 事件不冒泡 → capture）
  ['play', 'pause', 'volumechange'].forEach(type => document.addEventListener(type, (e) => {
    if (e.target instanceof HTMLVideoElement && e.target === shownMedia()) mediaState(e.target.paused, e.target.muted, e.target.volume);
  }, true));
  // 全螢幕的控制列：游標動了／按了鍵＝淡出來（wakeControls）；一進全螢幕先藏（游標動了才出來），出來全螢幕拿掉
  ['pointermove', 'pointerdown', 'keydown'].forEach(type => document.addEventListener(type, wakeControls, true));
  document.addEventListener('fullscreenchange', () => {
    clearTimeout(idleTimer);
    const st = fsStage();
    if (st) st.classList.add('is-idle');
    else document.querySelector('.figure-stage.is-idle')?.classList.remove('is-idle');
  });
  // 音量拉桿（拉的途中就一直調）：亮幾根 → 0～1
  document.addEventListener('input', (e) => { if (e.target instanceof HTMLInputElement && e.target.matches('.media-vol')) mediaVolume(Number(e.target.value) / BARS); });
  // YouTube 的播放器回報（listen 之後）：onStateChange／infoDelivery 的 playerState（1 在播、3 緩衝也算在播；-1 還沒開始＝不算數）、muted、volume（0～100）
  window.addEventListener('message', (e) => {
    const f = shownMedia(), d = figureDialog();
    if (!(f instanceof HTMLIFrameElement) || !d || e.source !== f.contentWindow || typeof e.data !== 'string') return;
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    heard.add(f);
    const info = msg?.info, s = msg?.event === 'onStateChange' ? info : info?.playerState;
    mediaState(typeof s === 'number' && s !== -1 ? !(s === 1 || s === 3) : d.classList.contains('is-paused'), typeof info?.muted === 'boolean' ? info.muted : d.classList.contains('is-muted'),
      typeof info?.volume === 'number' ? info.volume / 100 : volume);
  });

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
