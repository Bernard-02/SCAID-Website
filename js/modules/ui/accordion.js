/**
 * 摺疊的展開／收起動畫（原生 <details>，css/components/page.css「摺疊」；常見問題、動態、入學；user 2026-11-18）。
 * 原生 <details> 的開合是瞬間的（內容直接出現／消失）→ 這裡接手 summary 的點擊，把整個 details 的高度補間：
 *   展開＝先標 open（內容才量得到高）、高度從收著的高長到全高；
 *   收起＝高度縮回 summary 的高，縮完才真的拿掉 open。收的時候一開始就標 .is-closing——CSS 看到它就當已經關了
 *   （動態那種列的圓點開始淡出、封面縮圖不再放大）。
 * 圓點對在整塊高的 50%（page.css；user 2026-11-19）→ 跟著這裡的高度補間一起走，不用另外同步。
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

/** 把一則補間到開／收 @param {HTMLDetailsElement} d @param {boolean} closing @param {string} easing */
function tween(d, closing, easing) {
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
  d.classList.toggle('is-closing', closing);
  if (!closing) d.open = true;
  const to = (closing ? summary : d).getBoundingClientRect().height;
  // 只切上下：左右跟展開完一樣（內容淡入的模糊、超出框的東西不會補間時被切、補間完才冒出來）。
  // 下緣多留 1.5rem＝相簿兩側的模糊往下暈出去的那段（page.css .album --album-up；user 2026-11-24）也一樣；落在列距裡、碰不到下一則。原本 overflowY: clip
  d.style.clipPath = 'inset(0 -100vw -1.5rem -100vw)';
  // fill forwards：跑完到 onfinish 之間停在終點，不會閃回全高／全實
  /** @type {KeyframeAnimationOptions} */
  const timing = { duration: DUR.medium * 1000, easing, fill: 'forwards' };
  const anims = [d.animate({ height: [`${from}px`, `${to}px`] }, timing),
    ...body.map((c, i) => c.animate({ opacity: [fromO[i], closing ? '0' : '1'], filter: [fromF[i], closing ? blur : 'none'] }, timing))];
  running.set(d, anims);
  anims[0].onfinish = () => {
    if (closing) { d.open = false; d.classList.remove('is-closing'); }
    d.style.clipPath = '';
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
    for (const o of others) tween(/** @type {HTMLDetailsElement} */ (o), true, easing);
    tween(d, closing, easing);
    if (others.length) requestAnimationFrame(function hold() { stay(); if (running.has(d)) requestAnimationFrame(hold); });
  });
}
