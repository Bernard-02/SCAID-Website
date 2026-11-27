/**
 * 摺疊的展開／收起動畫（原生 <details>，css/components/page.css「摺疊」；動態、課程、首頁的 news；user 2026-11-18）。
 * 原生 <details> 的開合是瞬間的（內容直接出現／消失）→ 這裡接手 summary 的點擊，把整個 details 的高度補間：
 *   展開＝先標 open（內容才量得到高）、高度從收著的高長到全高；
 *   收起＝高度縮回 summary 的高，縮完才真的拿掉 open。收的時候一開始就標 .is-closing——CSS 看到它就當已經關了
 *   （那一列的圓點變回空心、封面縮圖不再放大）。
 * 圓點留在收著那一列的正中（page.css summary::after；user 2026-11-25，原本對整塊高的 50%、跟著高度補間走）。
 * 補間走 Web Animations（高度 DUR.medium、曲線 --ease-standard）。
 * 內容（summary 以外的子元素）淡入／淡出（user 2026-11-21），帶模糊（糊 ↔ 清楚），時長 DUR.fade。
 * 高度跟淡入淡出分開、一前一後（user 2026-11-26：「accordion能不能去掉clip的效果，讓它不要有被crop到的感覺」——原本兩個同時跑，
 * 長高的途中超出目前高度的內容被切掉＝看得到一條邊一路往下切開）：展開＝先長高（內容透明）、快長完才淡入（FADE_AT、DUR.fast）；收起＝先淡出、再縮。
 * 高度在變的時候內容是透明的＝切的那條邊看不到（clip 照留：擋住透明的內容蓋到下面幾列、吃到游標）。
 * 動到一半再點＝從目前的高度掉頭。系統「減少動態」＝不接手，照原生瞬間開合。
 * 一次只開一個（user 2026-11-21）：打開一則＝同頁其他開著的一起收（同一組補間）。上面那則收起來會把點的這一列往上帶
 * （可能帶出畫面）→ 補間期間捲動跟著補回去。
 * 打開的那一則捲到畫面正中（user 2026-11-26：「我想要在list加上對齊畫面的效果，跟menu的選項類似的做法」，問過＝同選單打開時當前頁的選項捲到框的正中）：
 * 「畫面」＝內容的起始線到底列上緣那一塊（#page-content 的上下內距）；展開完整則（標題＋內容）的中線對到那塊的中線，比那塊高＝標題停在起始線；
 * 捲不到（太上面、太下面）＝捲到頭為止。跟著展開的高度補間一起滑過去（同一個進度、同一條曲線），上面那則收起來的量也在同一個迴圈裡補。收起＝不捲。
 * 掛在 #page-content（換頁只換裡面、它本身一直在）→ 開機叫一次，之後才渲染出來的題目也吃得到。
 */
import { DUR } from './motion.js';
import { prefersReducedMotion } from './reduce-motion.js';

// 展開時淡入提早到高度補間的這個時間點開始（user 2026-11-26：「能不能讓内容fade in的時間更快點」；原本等高度長完才淡入）：
// --ease-standard 前快後慢，七成的時間已經長完約九成五＝剩下被切到的那一小段，內容才剛開始出來、看不出來。淡入本身也縮成 DUR.fast
const FADE_AT = 0.7;

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
  // 一前一後（見檔頭）：展開＝高度先、淡入等它長到 FADE_AT（高度本來就到了＝不等）；收起＝淡出先、高度等它淡完（掉頭時內容已經淡了幾成＝只等那幾成）。
  // fill both：等的那段停在起點、跑完到收尾之間停在終點，不會閃
  const grow = Math.abs(to - from) > 0.5 ? DUR.medium * 1000 * FADE_AT : 0, shown = Math.max(0, ...fromO.map(Number));
  /** @type {KeyframeAnimationOptions} */
  const sizeT = { duration: DUR.medium * 1000, delay: closing ? DUR.fade * 1000 * shown : 0, easing, fill: 'both' };
  /** @type {KeyframeAnimationOptions} */
  const fadeT = { duration: (closing ? DUR.fade : DUR.fast) * 1000, delay: closing ? 0 : grow, easing, fill: 'both' };
  // snap：高度不交給補間，這一組的第一個只當時鐘（同時長、同曲線、同延遲），每一幀照它的進度寫整數的高
  const anims = [d.animate(snap ? [] : { height: [`${from}px`, `${to}px`] }, sizeT),
    ...body.map((c, i) => c.animate({ opacity: [fromO[i], closing ? '0' : '1'], filter: [fromF[i], closing ? blur : 'none'] }, fadeT))];
  running.set(d, anims);
  if (snap) (function step() {
    if (running.get(d) !== anims) return;
    d.style.height = `${from + Math.round((to - from) * (anims[0].effect?.getComputedTiming().progress ?? 1))}px`;   // 起點不捨（第一幀不跳），縮掉的量取整數
    requestAnimationFrame(step);   // 比點的那一列的補捲動（initAccordion 的 hold）先排＝同一幀裡先改高、再量、再捲
  })();
  // 全部跑完才收尾（展開時高度先完、淡入還在跑）；中途掉頭＝上一組被 cancel、finished 會 reject＝不收
  Promise.all(anims.map(a => a.finished)).then(() => {
    if (running.get(d) !== anims) return;
    if (closing) { d.open = false; d.classList.remove('is-closing'); }
    d.style.clipPath = '';
    d.style.height = '';
    anims.forEach(a => a.cancel());
    running.delete(d);
  }, () => {});
  return { anims, to };
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
    // 捲動一律補「點的那一列現在在哪」跟「該在哪」的差（html 有 scroll-behavior: smooth → 指定 instant）
    const y0 = summary.getBoundingClientRect().top;
    const put = (/** @type {number} */ y) => window.scrollBy({ top: summary.getBoundingClientRect().top - y, behavior: 'instant' });
    // 打開＝展開完整則高 h 時標題該在的位置（見檔頭：起始線～底列上緣那塊的正中，比那塊高＝起始線）
    const goal = (/** @type {number} */ h) => { const cs = getComputedStyle(main), top = parseFloat(cs.paddingTop) || 0, room = innerHeight - top - (parseFloat(cs.paddingBottom) || 0);
      return top + Math.max(0, (room - h) / 2); };
    if (prefersReducedMotion()) {   // 這一則的開合留給原生（click 之後才開）＝下一幀量好了直接跳過去
      for (const o of others) /** @type {HTMLDetailsElement} */ (o).open = false;
      put(y0);
      if (!closing) requestAnimationFrame(() => put(goal(d.getBoundingClientRect().height)));
      return;
    }
    e.preventDefault();   // 開合自己來（鍵盤 Enter／空白鍵也是走 click）
    for (const o of others) tween(/** @type {HTMLDetailsElement} */ (o), true, easing, true);
    const { anims, to } = tween(d, closing, easing);
    if (closing) return;   // 收起＝不捲（一次只開一個＝收的時候沒有別則在動）
    const y1 = goal(to);
    // 跟著這一則的高度補間滑到 y1（同進度、同曲線）；高度長完了、上面那幾則還在縮＝停在 y1 繼續補。這一則被掉頭／又點了別則＝交給新的那一組
    requestAnimationFrame(function glide() {
      if (running.has(d) && running.get(d) !== anims) return;
      put(y0 + (y1 - y0) * (anims[0].effect?.getComputedTiming().progress ?? 1));
      if (running.has(d) || others.some(o => running.has(/** @type {HTMLDetailsElement} */ (o)))) requestAnimationFrame(glide);
    });
  });
}
