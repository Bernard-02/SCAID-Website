/**
 * 全站殼行為（結構 pages/header.html／footer.html，樣式 css/components/chrome.css）：
 * 選單開關、footer 覆蓋層、intro 影片 dialog、底列量測（兩側等寬＋動態跑馬燈）、首頁動態原地展開。
 * 全部 document 委派＝片段注入前後都綁得到；狀態掛 <html> class（menu-open／footer-open／news-open）
 */

const html = document.documentElement;

function setExpanded(sel, open) {
  document.querySelectorAll(sel).forEach(b => b.setAttribute('aria-expanded', String(open)));
}
// 選單與 footer 互斥（footer 蓋在選單上、選單被 footer 蓋住都沒意義）。打開中的鈕名字常駐 → 側邊變寬，重量底列
function setMenu(open) {
  if (open) setFooter(false);
  html.classList.toggle('menu-open', open);
  setExpanded('.menu-btn', open);
  fitBar();
}
function setFooter(open) {
  if (open) setMenu(false);
  html.classList.toggle('footer-open', open);
  setExpanded('.footer-btn', open);
  fitBar();
}
// 首頁動態展開：logo 上移、清單出來、底列＋滑到右端變－（home.css／chrome.css）；收合捲回頂
function setNews(open) {
  html.classList.toggle('news-open', open);
  if (!open) window.scrollTo(0, 0);
}

// 換頁／Esc：選單、footer、首頁展開全收（main.js initPageModules 每次換頁呼叫）
export function closeOverlays() { setMenu(false); setFooter(false); setNews(false); }

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

// 底列量測（chrome.css .site-bar）：
// 1) 兩側欄最小寬＝左右內容較寬者（--side-min）→ 兩側等寬＝動態永遠畫面正中；hover 名字出來側邊放不下才縮動態。
//    選單開著不量：menu 鈕撐成選單欄那格（chrome.css），量進去會把中欄擠掉；就讓它溢出側欄，中間只剩＋照樣置中
// 2) 動態標題放不下＝加 .is-marquee 跑馬燈（複製第二份接力）；放得下就拆。標題收著（選單開／首頁展開）不量。
//    量之前先拿掉 class（跑時 copy 有 padding-right，會量進去）
export function fitBar() {
  const bar = /** @type {HTMLElement | null} */ (document.querySelector('.site-bar'));
  if (!bar) return;
  const left = /** @type {HTMLElement} */ (bar.querySelector('.bar-left'));
  const right = /** @type {HTMLElement} */ (bar.querySelector('.footer-btn'));
  if (html.classList.contains('menu-open')) return;
  bar.style.setProperty('--side-min', Math.max(left.offsetWidth, right.offsetWidth) + 'px');

  if (html.classList.contains('news-open')) return;
  const track = bar.querySelector('.bar-news-track');
  // 標題退掉／回來的過場中寬度是中間值，量了會誤判要跑馬燈（－↔＋ 時多出一份標題）→ 等 transitionend 再量
  if (track.getAnimations().some(a => a instanceof CSSTransition && a.transitionProperty === 'max-width')) return;
  const copy = /** @type {HTMLElement} */ (track.querySelector('.bar-news-copy'));
  let dup = track.querySelector('[data-dup]');
  track.classList.remove('is-marquee');
  const over = copy.scrollWidth > track.clientWidth;
  if (over && !dup) {
    const d = /** @type {HTMLElement} */ (copy.cloneNode(true));
    d.setAttribute('data-dup', '');
    d.setAttribute('aria-hidden', 'true');
    track.appendChild(d);
    dup = d;
  }
  if (!over && dup) dup.remove();
  track.classList.toggle('is-marquee', over);
}

export function initChrome() {
  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    if (t.closest('.menu-btn')) { setMenu(!html.classList.contains('menu-open')); return; }
    if (t.closest('.footer-btn')) { setFooter(!html.classList.contains('footer-open')); return; }
    if (t.closest('.intro-close')) { /** @type {HTMLDialogElement} */ (document.getElementById('intro-dialog')).close(); return; }
    const play = t.closest('.play-btn');
    if (play instanceof HTMLElement) { openIntro(play); return; }
    if (t.closest('.site-menu a')) { setMenu(false); return; }
    // 首頁：動態原地展開、不走 router（preventDefault → router 看到 defaultPrevented 放行）；footer 開著先收
    if (t.closest('.bar-news') && document.body.dataset.page === 'index') {
      e.preventDefault();
      setFooter(false);
      setNews(!html.classList.contains('news-open'));
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeOverlays(); });

  // 名字現／隱（hover、鍵盤聚焦）→ 側邊寬變 → 下一幀重量（等樣式套上）；視窗寬也是
  const refit = (e) => { if (e.target instanceof Element && e.target.closest('.site-bar')) requestAnimationFrame(fitBar); };
  ['mouseover', 'mouseout', 'focusin', 'focusout'].forEach(type => document.addEventListener(type, refit));
  window.addEventListener('resize', fitBar);
  // 標題退掉／回來的過場走完才量（過場中寬度是中間值）
  document.addEventListener('transitionend', (e) => {
    if (e.propertyName === 'max-width' && e.target instanceof Element && e.target.classList.contains('bar-news-track')) fitBar();
  });
}
