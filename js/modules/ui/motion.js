/**
 * 動畫 token 單一來源（GSAP 端）。2026-06-04 統一。
 *
 * duration 數值定義在 css/variables.css 的 --dur-*；這裡用 getComputedStyle 讀進來，
 * 所以改 variables.css 一處，CSS transition 與 GSAP tween 同步生效（真正單一來源）。
 * ⚠️ 改 variables.css 後要 `npm run build:css`，否則首頁讀不到新值（會落到 fallback）。
 *
 * ease 因 GSAP 的 power* 與 CSS 的 cubic-bezier 是兩套數學無法互轉，於此另定義；
 * 命名按「進場 / 退場 / 雙向」意圖切分。
 *
 * 用法：
 *   import { DUR, EASE } from '../ui/motion.js';
 *   gsap.to(el, { yPercent: 0, duration: DUR.reveal, ease: EASE.enter });
 */

import { prefersReducedMotion } from './reduce-motion.js';

const rootStyle = getComputedStyle(document.documentElement);

// 讀 CSS 變數的秒數（"0.3s" → 0.3）；讀不到時 fallback = variables.css 同值，保證 robust
function durFromCss(varName, fallback) {
  const n = parseFloat(rootStyle.getPropertyValue(varName));
  return Number.isFinite(n) ? n : fallback;
}

export const DUR = {
  micro:  durFromCss('--dur-micro', 0.2),   // hover 透明度 / 小淡出
  fast:   durFromCss('--dur-fast', 0.3),    // chevron / overlay / hover transform
  base:   durFromCss('--dur-base', 0.4),    // mode fade / 退場淡出
  medium: durFromCss('--dur-medium', 0.5),  // 手風琴展收 / slide-in / clip 收展
  slow:   durFromCss('--dur-slow', 0.6),    // logo size / lightbox bar / 大型 layout
  fade:   durFromCss('--dur-fade', 0.4),   // 網站 transition：fade in／fade out（換頁）
  reveal: durFromCss('--dur-reveal', 1.0),  // 招牌 clip-reveal 進場 + 大型 fly-in / idle standby（原 reveal 0.9 + dramatic 1.1 合併 1.0s）
};

export const EASE = {
  enter:     'power3.out',   // 進場 / reveal（大、招牌）
  enterSoft: 'power2.out',   // 小進場 / 卡片位移 / hover-in
  exit:      'power3.in',    // 退場 / hide（大）
  exitSoft:  'power2.in',    // 退場 / hide（小）
  move:      'power2.inOut', // 雙向 layout（寬高 / size / marginLeft）
  sway:      'sine.inOut',   // atlas 永久擺動
  wipe:      'wipe',         // nav chip / clip 擦除 / 回彈：慢起步、快衝、長收尾（＝CSS --ease-wipe；CustomEase 註冊在 helpers.js）
};

/**
 * 整個畫面的切換走網站 fade（深色模式、語言；user 2026-11-21）：View Transition 把切換前、後的畫面各拍一張交叉淡化，
 * 時長與曲線吃 --dur-fade（chrome.css ::view-transition-*）——顏色變數、mask 上色的 logo、換掉的文字都不用各自寫過場。
 * DOM 是下一幀才改（先拍舊畫面）。瀏覽器不支援／減少動態＝直接切。
 * @param {() => void} apply 真的去改 DOM 的那一步
 */
export function fadeSwap(apply) {
  if (typeof document.startViewTransition === 'function' && !prefersReducedMotion()) document.startViewTransition(apply);
  else apply();
}
