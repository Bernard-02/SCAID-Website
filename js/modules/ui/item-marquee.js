/**
 * 清單列的標題／副標跑馬燈（css/components/page.css「標題、副標各一行」；user 2026-11-21）：
 * 每行一行不折，放不下＝右邊淡掉（.is-clipped）；hover／鍵盤聚焦那一列＝放不下的那幾行一直往左跑、左右都淡（.is-marquee）。
 * 這裡只做兩件事：
 *   1) 量：哪行放不下、跑一圈多遠（--loop＝字寬＋間距；接力那份是 CSS 的 text-shadow 畫在 --loop 外）。
 *      內容一變就重量：換頁、換語言（lang.js 直接換 textContent）、後台渲染（MutationObserver），字體載入、視窗寬變。
 *   2) 跑／停：跑＝text-indent 0 → −loop 一直重複（字在 h3／p 自己的框裡移，不包任何東西）；
 *      停＝往最近的那一端滑回去（0，或剛好一整圈＝接力那份停在起點，長得跟 0 一樣），不會跳回原位（user 不要「直接切換位置」）。
 * 掛在 #page-content（換頁只換裡面、它本身一直在）→ 開機叫一次。觸控／減少動態時 CSS 讓它照常折行＝量不到放不下的行，這裡自然不動。
 */
import { DUR } from './motion.js';
import { MARQUEE_SPEED } from './chrome.js';
import { prefersReducedMotion } from './reduce-motion.js';

const LINES = '.item-row :is(h1, h3, p)';   // h1＝師資詳細頁的頁頭（同列表那一列）
const GAP = 2;   // 一圈的接縫（em），同底列跑馬燈（chrome.css .bar-news-copy）
/** 每行現在在跑的那一個（一直跑的，或停下來往回滑的） @type {WeakMap<HTMLElement, Animation>} */
const runs = new WeakMap();

/** @param {HTMLElement} line */
const loopOf = (line) => parseFloat(line.style.getPropertyValue('--loop')) || 0;
/** 現在往左走了多遠（px，0～loop） @param {HTMLElement} line */
const offsetOf = (line) => -parseFloat(getComputedStyle(line).textIndent) || 0;

// ponytail: 跑到一半字寬變了（字體剛好載進來）＝這一圈的接縫會錯一下，下次 hover 就對；真的看得到再在 measure 裡重開
function measure() {
  document.querySelectorAll(`#page-content ${LINES}`).forEach(el => {
    const line = /** @type {HTMLElement} */ (el), range = document.createRange();
    range.selectNodeContents(line);
    const textW = range.getBoundingClientRect().width;   // 字本身多寬（不管 text-indent 走到哪）
    const clipped = textW > line.clientWidth + 0.5;
    line.classList.toggle('is-clipped', clipped);
    if (clipped) line.style.setProperty('--loop', `${textW + GAP * parseFloat(getComputedStyle(line).fontSize)}px`);
  });
}
let queued = 0;
const schedule = () => { if (!queued) queued = requestAnimationFrame(() => { queued = 0; measure(); }); };

/** 開始跑（停到一半又進來＝從現在的位置接著跑） @param {HTMLElement} line */
function start(line) {
  const loop = loopOf(line);
  if (!loop || prefersReducedMotion()) return;   // 減少動態：CSS 已經讓它折行（中途才切過去的，class 可能還沒重量）
  const x = runs.has(line) ? offsetOf(line) : 0;
  runs.get(line)?.cancel();
  const dur = loop / (MARQUEE_SPEED * parseFloat(getComputedStyle(line).fontSize)) * 1000;   // 速度固定：一圈的時間照距離算
  const a = line.animate({ textIndent: ['0px', `${-loop}px`] }, { duration: dur, iterations: Infinity });
  a.currentTime = (x / loop) * dur;
  line.classList.add('is-marquee');
  runs.set(line, a);
}
/** 停：滑回最近的那一端，到了才收左邊的淡 @param {HTMLElement} line @param {string} easing */
function stop(line, easing) {
  const run = runs.get(line);
  if (!run || !line.classList.contains('is-marquee')) return;
  const loop = loopOf(line), x = offsetOf(line), to = x < loop / 2 ? 0 : loop;
  run.cancel();
  const back = line.animate({ textIndent: [`${-x}px`, `${-to}px`] }, { duration: DUR.medium * 1000, easing, fill: 'forwards' });
  runs.set(line, back);
  back.onfinish = () => { back.cancel(); runs.delete(line); line.classList.remove('is-marquee'); };
}

export function initItemMarquee() {
  const main = document.getElementById('page-content');
  if (!main) return;
  const easing = getComputedStyle(document.documentElement).getPropertyValue('--ease-standard').trim() || 'ease';
  /** 一列裡放不下的那幾行 @param {Element} row */
  const clippedIn = (row) => /** @type {HTMLElement[]} */ ([...row.querySelectorAll('.is-clipped')]);
  // hover：pointerover／out 會冒泡，進出列裡面的子元素也會觸發 → relatedTarget 還在同一列裡＝沒有真的進出
  main.addEventListener('pointerover', (e) => {
    const row = e.target instanceof Element ? e.target.closest('.item-row') : null;
    if (row && !(e.relatedTarget instanceof Node && row.contains(e.relatedTarget))) clippedIn(row).forEach(start);
  });
  main.addEventListener('pointerout', (e) => {
    const row = e.target instanceof Element ? e.target.closest('.item-row') : null;
    if (row && !(e.relatedTarget instanceof Node && row.contains(e.relatedTarget))) clippedIn(row).forEach(l => stop(l, easing));
  });
  // 鍵盤聚焦到那一列（a／summary 本身可以聚焦）＝同 hover；滑鼠點的聚焦不算（:focus-visible）
  main.addEventListener('focusin', (e) => {
    const row = e.target instanceof Element && e.target.matches('.item-row:focus-visible') ? e.target : null;
    if (row) clippedIn(row).forEach(start);
  });
  main.addEventListener('focusout', (e) => {
    if (e.target instanceof Element && e.target.matches('.item-row')) clippedIn(e.target).forEach(l => stop(l, easing));
  });
  new MutationObserver(schedule).observe(main, { childList: true, characterData: true, subtree: true });
  window.addEventListener('resize', schedule);
  document.fonts?.addEventListener('loadingdone', schedule);
  schedule();
}
