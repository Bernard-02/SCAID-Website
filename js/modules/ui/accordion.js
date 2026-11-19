/**
 * 摺疊的展開／收起動畫（原生 <details>，css/components/page.css「摺疊」；常見問題、動態、入學；user 2026-11-18）。
 * 原生 <details> 的開合是瞬間的（內容直接出現／消失）→ 這裡接手 summary 的點擊，把整個 details 的高度補間：
 *   展開＝先標 open（內容才量得到高）、高度從收著的高長到全高；
 *   收起＝高度縮回 summary 的高，縮完才真的拿掉 open。收的時候一開始就標 .is-closing——圓點的位置是 CSS 的事，
 *   CSS 看到它就當已經關了，圓點跟著內容一起往上滑回第一行。
 * 補間走 Web Animations（時長 DUR.medium、曲線 --ease-standard＝跟圓點的 CSS 過場同一組，兩個才會同步）。
 * 動到一半再點＝從目前的高度掉頭。系統「減少動態」＝不接手，照原生瞬間開合。
 * 掛在 #page-content（換頁只換裡面、它本身一直在）→ 開機叫一次，之後才渲染出來的題目也吃得到。
 */
import { DUR } from './motion.js';
import { prefersReducedMotion } from './reduce-motion.js';

/** @type {WeakMap<HTMLDetailsElement, Animation>} */
const running = new WeakMap();

export function initAccordion() {
  const main = document.getElementById('page-content');
  if (!main) return;
  const easing = getComputedStyle(document.documentElement).getPropertyValue('--ease-standard').trim() || 'ease';
  main.addEventListener('click', (e) => {
    const summary = e.target instanceof Element ? e.target.closest('summary') : null;
    const d = summary?.parentElement;
    if (!summary || !(d instanceof HTMLDetailsElement) || prefersReducedMotion()) return;
    e.preventDefault();   // 開合自己來（鍵盤 Enter／空白鍵也是走 click）
    const closing = d.open && !d.classList.contains('is-closing');   // 開著、而且不是正在收 → 這一下是要收
    const from = d.offsetHeight;   // 動到一半的話＝目前補間到的高
    running.get(d)?.cancel();
    d.classList.toggle('is-closing', closing);
    if (!closing) d.open = true;
    const to = closing ? summary.offsetHeight : d.offsetHeight;
    d.style.overflow = 'hidden';
    // fill forwards：跑完到 onfinish 之間停在終點的高，不會閃回全高
    const anim = d.animate({ height: [`${from}px`, `${to}px`] }, { duration: DUR.medium * 1000, easing, fill: 'forwards' });
    running.set(d, anim);
    anim.onfinish = () => {
      if (closing) { d.open = false; d.classList.remove('is-closing'); }
      d.style.overflow = '';
      anim.cancel();
      running.delete(d);
    };
  });
}
