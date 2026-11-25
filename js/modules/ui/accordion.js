/**
 * 摺疊的展開／收起動畫（原生 <details>，css/components/page.css「摺疊」；常見問題、動態、入學；user 2026-11-18）。
 * 原生 <details> 的開合是瞬間的（內容直接出現／消失）→ 這裡接手 summary 的點擊，把整個 details 的高度補間：
 *   展開＝先標 open（內容才量得到高）、高度從收著的高長到全高；
 *   收起＝高度縮回 summary 的高，縮完才真的拿掉 open。收的時候一開始就標 .is-closing——CSS 看到它就當已經關了
 *   （那一列的圓點變回空心、封面縮圖不再放大）。
 * 圓點留在收著那一列的正中（page.css summary::after；user 2026-11-25，原本對整塊高的 50%、跟著高度補間走）。
 * 補間走 Web Animations（時長 DUR.medium、曲線 --ease-standard）。
 * 內容（summary 以外的子元素）跟著淡入／淡出（user 2026-11-21）：同一組時長與曲線，展開 0 → 1、收起 1 → 0，帶模糊（糊 ↔ 清楚）。
 * 動到一半再點＝從目前的高度掉頭。系統「減少動態」＝不接手，照原生瞬間開合。
 * 一次只開一個（user 2026-11-21）：打開一則＝同頁其他開著的一起收（同一組補間）。上面那則收起來會把點的這一列往上帶
 * （可能帶出畫面）→ 補間期間捲動跟著補回去＝點的那一列留在原地。
 * 掛在 #page-content（換頁只換裡面、它本身一直在）→ 開機叫一次，之後才渲染出來的題目也吃得到。
 */
import { DUR } from './motion.js';
import { prefersReducedMotion } from './reduce-motion.js';

/** 正在跑的那一組：[高度, ...內容的淡入淡出] @type {WeakMap<HTMLDetailsElement, Animation[]>} */
const running = new WeakMap();

/** 把一則補間到開／收。snap＝高度每一幀取整數 px（被一起收的那幾則：點的那一列靠捲動補回原地，捲動只能整數 px——
 * 高度縮掉帶小數的量的話每一幀差半像素、那一列跟著抖；user 2026-11-25 手機回報「下一個打開的會出現抖動」）
 * @param {HTMLDetailsElement} d @param {boolean} closing @param {string} easing @param {boolean} [snap] */
function tween(d, closing, easing, snap = false) {
  const summary = /** @type {HTMLElement} */ (d.querySelector(':scope > summary'));
  const body = [...d.children].filter(c => c !== summary);
  const prev = running.get(d);
  // 動到一半的話＝目前補間到的高／透明度（先量、再取消上一組）。高用 getBoundingClientRect：offsetHeight 是整數，
  // 列高不是整數 px 時（字級 1.15rem）補間的終點跟實際的高差一點、跑完會跳一下
  const from = d.getBoundingClientRect().height;
  const fromO = body.map(c => (prev ? getComputedStyle(c).opacity : closing ? '1' : '0'));
  // fade 都帶模糊（user 2026-11-21；variables.css --blur）：展開＝從糊到清楚、收起反過來
  const blur = `blur(${getComputedStyle(d).getPropertyValue('--blur').trim() || '0px'})`;
  const fromF = body.map(c => (prev ? getComputedStyle(c).filter : closing ? 'none' : blur));
  prev?.forEach(a => a.cancel());
  d.style.height = '';   // 上一組 snap 留下的（下面量終點要量自然的高）
  d.classList.toggle('is-closing', closing);
  if (!closing) d.open = true;
  const to = (closing ? summary : d).getBoundingClientRect().height;
  // 只切上下：左右跟展開完一樣（內容淡入的模糊、超出框的東西不會補間時被切、補間完才冒出來）。
  // （11-24～25 下緣多留過 1.5rem＝相簿兩側的模糊往下暈出去的那段；2026-11-25 相簿的模糊不往上下暈了＝拿掉。）原本 overflowY: clip
  d.style.clipPath = 'inset(0 -100vw)';
  // fill forwards：跑完到 onfinish 之間停在終點，不會閃回全高／全實
  /** @type {KeyframeAnimationOptions} */
  const timing = { duration: DUR.medium * 1000, easing, fill: 'forwards' };
  // snap：高度不交給補間，這一組的第一個只當時鐘（同時長、同曲線），每一幀照它的進度寫整數的高
  const anims = [d.animate(snap ? [] : { height: [`${from}px`, `${to}px`] }, timing),
    ...body.map((c, i) => c.animate({ opacity: [fromO[i], closing ? '0' : '1'], filter: [fromF[i], closing ? blur : 'none'] }, timing))];
  running.set(d, anims);
  if (snap) (function step() {
    if (running.get(d) !== anims) return;
    d.style.height = `${from + Math.round((to - from) * (anims[0].effect?.getComputedTiming().progress ?? 1))}px`;   // 起點不捨（第一幀不跳），縮掉的量取整數
    requestAnimationFrame(step);   // 比點的那一列的補捲動（initAccordion 的 hold）先排＝同一幀裡先改高、再量、再捲
  })();
  anims[0].onfinish = () => {
    if (closing) { d.open = false; d.classList.remove('is-closing'); }
    d.style.clipPath = '';
    d.style.height = '';
    anims.forEach(a => a.cancel());
    running.delete(d);
  };
}

export function initAccordion() {
  const main = document.getElementById('page-content');
  if (!main) return;
  const easing = getComputedStyle(document.documentElement).getPropertyValue('--ease-standard').trim() || 'ease';
  main.addEventListener('click', (e) => {
    const summary = e.target instanceof Element ? e.target.closest('summary') : null;
    const d = summary?.parentElement;
    if (!summary || !(d instanceof HTMLDetailsElement)) return;
    const closing = d.open && !d.classList.contains('is-closing');   // 開著、而且不是正在收 → 這一下是要收
    // 這一下是要開 → 其他開著的都收（一次只開一個）
    const others = closing ? [] : [...main.querySelectorAll('details[open]:not(.is-closing)')].filter(o => !o.contains(d));
    // 點的那一列留在原地：捲動補上它被帶走的距離（html 有 scroll-behavior: smooth → 指定 instant）
    const y0 = summary.getBoundingClientRect().top;
    const stay = () => window.scrollBy({ top: summary.getBoundingClientRect().top - y0, behavior: 'instant' });
    if (prefersReducedMotion()) { for (const o of others) /** @type {HTMLDetailsElement} */ (o).open = false; stay(); return; }   // 這一則的開合留給原生
    e.preventDefault();   // 開合自己來（鍵盤 Enter／空白鍵也是走 click）
    for (const o of others) tween(/** @type {HTMLDetailsElement} */ (o), true, easing, true);
    tween(d, closing, easing);
    if (others.length) requestAnimationFrame(function hold() { stay(); if (running.has(d)) requestAnimationFrame(hold); });
  });
}
