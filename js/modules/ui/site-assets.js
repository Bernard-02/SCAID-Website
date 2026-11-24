/**
 * 網頁 icon ← 後台 site_icons（user 2026-11-24：「開一個資料夾，存放網頁的 icon」；照 SCCD site-assets.js，只有 icon、沒有游標）。
 * 本地 website-icons/ 是備援：先畫本地的，抓到後台＝掃 CSS 裡用到 website-icons/<key>.svg 的規則（.icon-X 的 --icon、音量拉桿的 mask…），
 * 同一個 selector 補一條換成後台那張、插在 head 最後（順序贏）。不用手寫 class ↔ 檔名的對照，CSS 加了新的 icon 自動跟上。
 * 抓不到／空的＝什麼都不做。後台換的圖要畫在跟原本一樣的框裡（--ar 寫在 icon.css，不跟著後台變）
 */
import { CMS_API_BASE, assetUrl, fetchCmsJson } from '../../config/api.js';

export async function initSiteIcons() {
  let rows;
  try { rows = await fetchCmsJson(`${CMS_API_BASE}/site_icons?fields=key,file&limit=-1`); } catch { return; }
  const map = new Map((Array.isArray(rows) ? rows : []).filter(r => r?.key && r.file).map(r => [r.key, assetUrl(r.file)]));
  if (!map.size) return;
  const swap = (/** @type {string} */ v) => v.replace(/url\((['"]?)[^'")]*website-icons\/([\w-]+)\.svg\1\)/g, (m, _q, key) => (map.has(key) ? `url("${map.get(key)}")` : m));
  let css = '';
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }   // 跨網域的（Google Fonts）讀不到
    // ponytail: 只看最外層的規則（現在用到 icon 的都在最外層）；@media 裡面有用到再往下找、包回同一個條件
    for (const r of rules) {
      if (!(r instanceof CSSStyleRule) || !r.style.cssText.includes('website-icons/')) continue;
      // 從 cssText 一條一條宣告找、不逐個屬性讀：簡寫裡有 var() 的（音量拉桿的 mask）拆開讀是空字串
      const decl = r.style.cssText.split(';').map(d => [d, swap(d)]).filter(([d, n]) => n !== d).map(([, n]) => n.trim()).join(';');
      if (decl) css += `${r.selectorText}{${decl}}`;
    }
  }
  if (!css) return;
  const style = document.createElement('style');
  style.id = 'site-icons';
  style.textContent = css;
  document.head.append(style);
}
