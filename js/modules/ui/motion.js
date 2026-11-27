/**
 * 動畫時長的 JS 端（DUR，秒）：數值定義在 css/variables.css 的 --dur-*，這裡用 getComputedStyle 讀進來＝改 variables.css 一處，CSS 與 JS 同步。
 * ⚠️ 改 variables.css 後要 `npm run build:css`，否則讀不到新值（會落到 fallback）。曲線＝CSS 的 --ease-*（JS 的 WAAPI 直接讀 CSS 變數）
 */

import { prefersReducedMotion } from './reduce-motion.js';

const rootStyle = getComputedStyle(document.documentElement);

// 讀 CSS 變數的秒數（"0.3s" → 0.3）；讀不到時 fallback = variables.css 同值，保證 robust
function durFromCss(varName, fallback) {
  const n = parseFloat(rootStyle.getPropertyValue(varName));
  return Number.isFinite(n) ? n : fallback;
}

export const DUR = {
  fast:   durFromCss('--dur-fast', 0.3),    // chevron / overlay / hover transform
  base:   durFromCss('--dur-base', 0.4),    // mode fade / 退場淡出
  medium: durFromCss('--dur-medium', 0.5),  // 手風琴展收 / slide-in / clip 收展
  slow:   durFromCss('--dur-slow', 0.6),    // logo size / lightbox bar / 大型 layout
  fade:   durFromCss('--dur-fade', 0.4),   // 網站 transition：fade in／fade out（換頁）
};

/**
 * 整個畫面的切換走網站 fade（深色模式、語言；user 2026-11-21）：View Transition 把切換前、後的畫面各拍一張交叉淡化，
 * 時長與曲線吃 --dur-fade（chrome.css ::view-transition-*）——顏色變數、mask 上色的 logo、換掉的文字都不用各自寫過場。
 * DOM 是下一幀才改（先拍舊畫面）。瀏覽器不支援／減少動態＝直接切。
 * @param {() => void} apply 真的去改 DOM 的那一步
 * @returns {Promise<void>} 淡完了（沒有過場＝馬上）
 */
export function fadeSwap(apply) {
  if (typeof document.startViewTransition === 'function' && !prefersReducedMotion()) return document.startViewTransition(apply).finished.catch(() => {});
  apply();
  return Promise.resolve();
}
