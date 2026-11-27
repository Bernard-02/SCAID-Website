/**
 * 語言切換：選單底部 .lang-btn 切 zh ↔ en、存 localStorage。中英分開、不混排：每個元素只顯示一種語言。
 * 標記法：中文直接寫在內文，英文寫 data-en；第一次套用時把中文記到 data-zh，之後來回切都有得換（textContent，不吃 HTML →
 * 內含子元素的要拆成各自的 span）。頁面內容之後接 Directus 再依 lang 抓對應欄位。
 */
import { DUR, fadeSwap } from './motion.js';
import { prefersReducedMotion } from './reduce-motion.js';

const KEY = 'scaid:lang';

export function getLang() {
  try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'zh'; } catch { return 'zh'; }
}

// 中文裡英數前後的空格（一邊是中文字、一邊是英數）＝中文字體的空格（Regular 0.447em，英數字體的空格是 0.642em）；英文詞中間的空格照舊
// （user 2026-11-27：「在中文裏面，英文前後的空格，是用中文的空格，英文内的則維持原狀，比如vision base」「英文前或英文後若是中文的話」）。
// 字體分不出前後文 → 那個空格包一個 span、指定中文字體（typography.css .cjk-sp）；字還是一般的空格（複製出來一樣）。中文字的範圍同 item-marquee.js CJK。
// 不用 lookbehind（(?<=…)）：iOS 16.3 以前的 Safari 解析時就丟 SyntaxError＝整支程式不跑 → 空格前那個字放進比對、切的時候留下
const GAP = /([⺀-鿿豈-﫿︰-﹏＀-￯]) +(?=[!-~])|([!-~]) +(?=[⺀-鿿豈-﫿︰-﹏＀-￯])/g;
/** @param {HTMLElement} el @param {string} text */
function setZh(el, text) {
  /** @type {(string | Node)[]} */
  const out = [];
  let at = 0;
  for (const m of text.matchAll(GAP)) {
    const s = document.createElement('span'); s.className = 'cjk-sp'; s.textContent = ' ';
    out.push(text.slice(at, /** @type {number} */ (m.index) + 1), s);
    at = /** @type {number} */ (m.index) + m[0].length;
  }
  if (!at) { el.textContent = text; return; }
  out.push(text.slice(at));
  el.replaceChildren(...out);
}
// 每個元素上次寫進去的「語言＋字」：一樣就不重寫（換頁時 applyLang 會被叫好幾次，重寫＝item-marquee 的 MutationObserver 每次都整串重量）
/** @type {WeakMap<Element, string>} */
const shown = new WeakMap();

/** @param {ParentNode} [root] */
export function applyLang(root = document) {
  const lang = getLang();
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-Hant';
  /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll('[data-en]')).forEach(el => {
    if (el.dataset.zh == null) el.dataset.zh = el.textContent;
    const v = (lang === 'en' ? el.dataset.en : el.dataset.zh) || '';
    if (shown.get(el) === lang + v) return;
    shown.set(el, lang + v);
    if (lang === 'en') el.textContent = v; else setZh(el, v);
  });
  // 報讀名稱（aria-label）也跟語言走（user 2026-11-25：「報讀要用英文」）：aria-label 寫中文、英文寫 data-en-label；JS 自己設的走下面 setLabel
  /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll('[data-en-label]')).forEach(el => {
    if (el.dataset.zhLabel == null) el.dataset.zhLabel = el.getAttribute('aria-label') || '';
    el.setAttribute('aria-label', (lang === 'en' ? el.dataset.enLabel : el.dataset.zhLabel) || '');
  });
  // 後台的圖的 alt（cms-pages.js imgAttrs：那一則／那一段的標題）也跟語言走
  /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll('[data-en-alt]')).forEach(el => el.setAttribute('alt', (lang === 'en' ? el.dataset.enAlt : el.dataset.zhAlt) || ''));
  // 切換鈕顯示「要切過去」的語言；報讀名稱也跟著換
  root.querySelectorAll('.lang-btn').forEach(b => {
    b.textContent = lang === 'en' ? '中文' : 'EN';
    b.setAttribute('aria-label', lang === 'en' ? 'Switch to Chinese' : '切換為英文');
  });
}

/** JS 自己設的報讀名稱：照現在的語言寫 aria-label、兩種都記著（換語言 applyLang 接手）；沒給中文＝拿掉 @param {HTMLElement} el @param {string} [zh] @param {string} [en] */
export function setLabel(el, zh, en) {
  if (!zh) { el.removeAttribute('aria-label'); delete el.dataset.zhLabel; delete el.dataset.enLabel; return; }
  el.dataset.zhLabel = zh; el.dataset.enLabel = en || zh;
  el.setAttribute('aria-label', getLang() === 'en' ? el.dataset.enLabel : zh);
}

/** 切一次：留著的圓點（選單選中那項、hover 著的；2026-11-25 前是直條）先切出去 → 換字＝整個畫面 fade（user 2026-11-21）→ 照新的字切進來
 * （user 2026-11-24：「切換成英文的時候，應該要看英文的寬度，再做一次 stroke 的進出場」；chrome.css html.strokes-out／strokes-in） */
async function toggle() {
  try { localStorage.setItem(KEY, getLang() === 'en' ? 'zh' : 'en'); } catch {}
  const html = document.documentElement, still = prefersReducedMotion(), wait = () => new Promise(r => setTimeout(r, DUR.fast * 1000));
  if (!still) { html.classList.add('strokes-out'); await wait(); }
  html.classList.add('lang-swap');   // 底列的動態這次也跟著整個畫面淡（chrome.css）
  await fadeSwap(() => {
    applyLang();
    document.dispatchEvent(new Event('scaid:lang'));   // 底列的動態從頭跑（chrome.js restartNews）、分頁標題跟著換（ui-labels.js syncTitle）
  });
  html.classList.remove('lang-swap');
  if (!still) { html.classList.replace('strokes-out', 'strokes-in'); await wait(); html.classList.remove('strokes-in'); }
}

export function initLang() {
  let queue = Promise.resolve();
  document.addEventListener('click', (e) => {
    if (!(e.target instanceof Element) || !e.target.closest('.lang-btn')) return;
    queue = queue.then(toggle).catch(() => {});   // 切到一半又按＝這一段做完再切；出錯也不卡住之後的切換
  });
  applyLang();
}
