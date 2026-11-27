/**
 * 即將推出 ← Directus 單例 `coming_soon`（user 2026-11-25：「後臺想加上coming soon的效果，如果有checked的話，那麽應該是在這個page上加上coming soon的字眼…
 * 但是hero的文字還是需要渲染」）：一頁一格勾選、欄位名＝頁的 slug（合作企業、作品、動態、規章；紀錄、入學 2026-11-27 併掉了）。
 * 勾了＝這一頁的 .page-body 掛 .is-coming-soon：Hero（導言）照出、其他內容收掉、那一行字在 Hero 下面那塊的正中（page.css）。
 * 字＝各頁 HTML 的 p.coming-soon（介面文字 page.coming-soon，後台改得到、中英分開）；頁面沒放那一行＝不支援、不抓。
 * 一次抓、整個網站共用（同 ui-labels.js）；抓失敗不記住、照舊顯示內容。
 */
import { CMS_API_BASE, fetchCmsJson } from '../../config/api.js';

/** @type {Promise<Record<string, unknown> | null> | null} */
let cache = null;

/** main.js initPageModules 每頁叫；回傳＝套好了（router 等它才淡入＝勾了的頁內容不會先閃一下） @param {string} page */
export function applyComingSoon(page) {
  const body = document.querySelector('#page-content .page-body');
  if (!body?.querySelector(':scope > .coming-soon')) return Promise.resolve();
  cache ||= fetchCmsJson(`${CMS_API_BASE}/coming_soon`).catch(() => { cache = null; return null; });
  return cache.then(d => { if (body.isConnected) body.classList.toggle('is-coming-soon', d?.[page] === true); });
}
