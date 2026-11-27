/**
 * Reduce Motion — 偵測使用者「減少動態效果」的系統偏好（WCAG 2.3.3 / 2.2.2）。
 * 由 OS 設定（Windows 視覺效果 / macOS·iOS 減少動態效果 / Android 移除動畫）控制，站內不放開關。
 * 用法：在各動畫進入點 early-return 到終態／靜態。CSS 的過場由 typography.css 的 reduce blanket（duration→0.01ms）處理。
 * MediaQueryList 建一次重複讀（每幀叫的地方很多：object.js、slideshow.js、thumb-board.js）；.matches 會跟著系統設定即時變
 */
const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
export const prefersReducedMotion = () => !!mq?.matches;
