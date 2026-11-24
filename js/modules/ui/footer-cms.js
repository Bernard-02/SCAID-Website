/**
 * 聯絡頁內容 ← Directus 單例 `footer`（欄位與後台建法：docs/Directus-後台欄位.md；原本是 footer 覆蓋層，user 2026-11-21 搬成聯絡頁，後台名照舊）。
 * 進聯絡頁才呼叫（main.js initPageModules）。抓不到（網域未設／斷線／集合還沒建）＝留 contact.html 的 MOCK 靜態字；抓到＝後台為準，空的那一塊收掉。
 * 聯絡資訊＝清單，同師資詳細頁（user 2026-11-24：「做成跟老師內頁一樣，然後後臺可以 custom」「每個都有個 url，有寫就可以 jump 到那個 url」）：
 * 子集合 footer_sections，一個清單＝標題＋一筆一筆（文字＋選填的連結），後台可以自己加。原本是寫死的四列（email／tel／fax／address_*）、標籤在介面文字 contact.*。
 */
import { CMS_API_BASE, assetUrl, fetchCmsJson } from '../../config/api.js';
import { escapeHtml } from './escape-html.js';
import { applyLang } from './lang.js';

/** @param {Element | null} el @param {unknown} on */
const show = (el, on) => { if (el instanceof HTMLElement) el.style.display = on ? '' : 'none'; };
// 後台填的網址只放行 http(s)／mailto／tel（擋 javascript: 之類）
const safeUrl = (/** @type {unknown} */ u) => (typeof u === 'string' && /^(https?:|mailto:|tel:)/i.test(u) ? u : '#');
const ext = (/** @type {unknown} */ u) => `href="${escapeHtml(safeUrl(u))}" target="_blank" rel="noopener"`;
const list = (/** @type {unknown} */ v) => (Array.isArray(v) ? v : []);
/** 聯絡資訊那一筆的連結：http(s)（另開新視窗）、mailto:、tel:；直接貼信箱＝當 mailto；其他（javascript:…）、沒填＝不是連結 @param {unknown} u */
const entryLink = (u) => {
  const s = typeof u === 'string' ? u.trim() : '';
  const href = /^(https?:|mailto:|tel:)/i.test(s) ? s : /^[^\s@:/]+@[^\s@:/]+\.[^\s@:/]+$/.test(s) ? `mailto:${s}` : '';
  return href && `href="${escapeHtml(href)}"${/^https?:/i.test(href) ? ' target="_blank" rel="noopener"' : ''}`;
};
/** 中文寫內文、英文寫 data-en（最後 applyLang 套），英文空退中文 @param {string} tag @param {unknown} zh @param {unknown} en @param {string} [attrs] */
const bi = (tag, zh, en, attrs = '') => { const z = String(zh || en || ''); return `<${tag}${attrs} data-en="${escapeHtml(String(en || z))}">${escapeHtml(z)}</${tag}>`; };

export async function loadFooterCms() {
  const root = document.querySelector('#page-content .footer-body');
  if (!root) return;
  let d;
  try { d = await fetchCmsJson(`${CMS_API_BASE}/footer?fields=*,badge.id,badge.title,sections.sort,sections.title_zh,sections.title_en,sections.entries&deep[sections][_sort]=sort`); }
  catch (e) { console.warn('[footer] 後台抓不到，維持靜態字：', e instanceof Error ? e.message : e); return; }
  if (!d) return;

  // 聯絡資訊＝清單（同師資詳細頁的標記：.subsections > .subsection > h3 + ul，page.css）：照拖曳順序；一筆＝文字，連結有填＝整筆是連結；
  // 沒文字的那筆不算、一筆都沒有的清單不出、一個清單都沒有＝整塊收掉
  const contact = root.querySelector('.footer-contact');
  if (contact) {
    contact.innerHTML = list(d.sections).slice().sort((a, b) => (a?.sort ?? 0) - (b?.sort ?? 0)).map(s => {
      const rows = list(s?.entries).filter(x => x?.text_zh || x?.text_en).map(x => {
        const link = entryLink(x.url);
        return link ? `<li>${bi('a', x.text_zh, x.text_en, ` ${link}`)}</li>` : bi('li', x.text_zh, x.text_en);
      }).join('');
      return rows ? `<div class="subsection">${s.title_zh || s.title_en ? bi('h3', s.title_zh, s.title_en) : ''}<ul>${rows}</ul></div>` : '';
    }).join('');
    show(contact, contact.children.length);
  }

  // 社群＝IG、YouTube 兩個 icon，IG 在左（user 2026-11-24）；各自的網址空的／不是 http(s)＝那個不出
  const social = root.querySelector('.footer-social');
  if (social) {
    social.innerHTML = [[d.instagram, 'Instagram', 'ig'], [d.youtube, 'YouTube', 'yt']].map(([u, name, ic]) => {
      const url = safeUrl(u);
      return /^https?:/i.test(url) ? `<a ${ext(url)} aria-label="${name}"><span class="icon icon-${ic}" aria-hidden="true"></span></a>` : '';
    }).join('');
    show(social, social.children.length);
  }
  // 姊妹系所（user 2026-11-21）：全名、一行一個＝連結清單（.link-list 裡的 a.nav-link）；中文寫內文、英文寫 data-en（最後 applyLang 套），英文空退中文。
  // 舊資料只有 label（縮寫）＝先照它顯示
  const links = root.querySelector('.footer-links');
  if (links) {
    links.innerHTML = list(d.links).map(l => {
      const zh = l?.label_zh || l?.label || '';
      return `<li><a class="nav-link" ${ext(l?.url)} data-en="${escapeHtml(l?.label_en || zh)}">${escapeHtml(zh)}</a></li>`;
    }).join('');
    show(links, links.children.length);
  }

  // 標章：alt＝Directus 檔案標題（檔案庫可改）；沒放＝收掉
  const badge = root.querySelector('.footer-badge'), src = assetUrl(d.badge);
  if (src && badge) badge.outerHTML = `<img class="footer-badge" src="${escapeHtml(src)}" alt="${escapeHtml(d.badge.title)}">`;
  else show(badge, false);

  applyLang(root);
}
