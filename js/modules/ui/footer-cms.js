/**
 * footer 內容 ← Directus 單例 `footer`（欄位與後台建法：docs/Directus-後台欄位.md）。
 * 抓不到（網域未設／斷線／集合還沒建）＝留 footer.html 的 MOCK 靜態字；抓到＝後台為準，空欄位整列收掉。
 * 欄位標籤（電子郵件／電話…）與 logo 鎖定版是版面，留在 HTML。
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

// 有英文值（含 null）＝跟語言切：data-zh／data-en 交給 applyLang，英文空退中文；沒英文（電話）＝不切
/** @param {Element | null | undefined} el @param {string | null | undefined} zh @param {string | null} [en] */
function setText(el, zh, en) {
  if (!(el instanceof HTMLElement)) return;
  const z = zh || '';
  if (en === undefined) { el.removeAttribute('data-en'); el.textContent = z; }
  else { el.dataset.zh = z; el.dataset.en = en || z; }
}

export async function loadFooterCms() {
  const root = document.querySelector('.site-footer');
  if (!root) return;
  let d;
  try { d = await fetchCmsJson(`${CMS_API_BASE}/footer?fields=*,badge.id,badge.title`); }
  catch (e) { console.warn('[footer] 後台抓不到，維持靜態字：', e instanceof Error ? e.message : e); return; }
  if (!d) return;

  // 聯絡資訊：每列 [data-cms]，值空＝整列收掉
  const dd = (/** @type {string} */ key, /** @type {unknown} */ v) => {
    const row = root.querySelector(`[data-cms="${key}"]`);
    show(row, v);
    return row?.querySelector('dd');
  };
  const mail = dd('email', d.email)?.querySelector('a');
  if (mail) { mail.href = `mailto:${d.email || ''}`; mail.textContent = d.email || ''; }
  setText(dd('tel', d.tel), d.tel);
  setText(dd('fax', d.fax), d.fax);
  setText(dd('address', d.address_zh), d.address_zh, d.address_en);

  const social = root.querySelector('.footer-social');
  if (social) {
    social.innerHTML = list(d.social).map(s => `<a ${ext(s?.url)} class="footer-social-box" aria-label="${escapeHtml(s?.label)}"></a>`).join('');
    show(social, social.children.length);
  }
  const links = root.querySelector('.footer-links');
  if (links) {
    links.innerHTML = list(d.links).map(l => `<li><a ${ext(l?.url)}>${escapeHtml(l?.label)}</a></li>`).join('');
    show(links, links.children.length);
  }

  // 標章：alt＝Directus 檔案標題（檔案庫可改）；沒放＝收掉
  const badge = root.querySelector('.footer-badge'), src = assetUrl(d.badge);
  if (src && badge) badge.outerHTML = `<img class="footer-badge" src="${escapeHtml(src)}" alt="${escapeHtml(d.badge.title)}">`;
  else show(badge, false);

  const copy = root.querySelector('.footer-copyright');
  show(copy, d.copyright_zh);
  setText(copy, d.copyright_zh, d.copyright_en);

  applyLang(root);
}
