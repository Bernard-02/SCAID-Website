/**
 * 聯絡頁內容 ← Directus 單例 `footer`（欄位與後台建法：docs/Directus-後台欄位.md；原本是 footer 覆蓋層，user 2026-11-21 搬成聯絡頁，後台名照舊）。
 * 進聯絡頁才呼叫（main.js initPageModules）。contact.html 只放空的容器（user 2026-11-26：不放假資料）；抓不到＝退上次抓到的（config/api.js cmsGet），
 * 連那份都沒有＝那幾塊收掉、只剩標章與版權；抓到＝後台為準，空的那一塊收掉。
 * 聯絡資訊＝清單，同師資詳細頁（user 2026-11-24：「做成跟老師內頁一樣，然後後臺可以 custom」「每個都有個 url，有寫就可以 jump 到那個 url」）：
 * 子集合 footer_sections，一個清單＝標題＋一筆一筆（文字＋選填的連結），後台可以自己加。原本是寫死的四列（email／tel／fax／address_*）、標籤在介面文字 contact.*。
 */
import { assetUrl, cmsGet } from '../../config/api.js';
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
  // 版權的年份＝今年（user 2026-11-25：「年份會自動更新」）；後台抓不到也照樣換
  const copyright = root.querySelector('.footer-copyright');
  if (copyright) copyright.textContent = `Copyright © ${new Date().getFullYear()}`;
  let d;
  try { d = await cmsGet('footer?fields=*,badge.id,badge.title,sections.sort,sections.title_zh,sections.title_en,sections.entries&deep[sections][_sort]=sort'); }
  catch (e) { console.warn('[footer] 後台抓不到：', e instanceof Error ? e.message : e); }
  if (!d) { root.querySelectorAll('.footer-social, .footer-contact').forEach(el => { if (!el.children.length) show(el, false); }); return; }

  // 聯絡資訊＝清單（同師資詳細頁的標記：.subsections > .subsection > h3 + ul，page.css）：照拖曳順序；一筆＝文字，連結有填＝整筆是連結；
  // 沒文字的那筆不算、一筆都沒有的清單不出、一個清單都沒有＝整塊收掉。
  // 單位（設計學院、姊妹系所…）＝其中一個清單（user 2026-11-25：「聯絡的這些單位改成跟上面的一樣，就是如果有 link 的話，就會導航到別的 page」；
  // 原本另一格 footer.links、另一塊連結清單 .footer-links——資料搬進 footer_sections 之後那一格 2026-11-25 刪了）。沒填標題的清單＝不出 h3
  const contact = root.querySelector('.footer-contact');
  if (contact) {
    /** @param {string} title @param {any[]} entries */
    const block = (title, entries) => {
      const rows = entries.filter(x => x?.text_zh || x?.text_en).map(x => {
        const link = entryLink(x.url);
        return link ? `<li>${bi('a', x.text_zh, x.text_en, ` ${link}`)}</li>` : bi('li', x.text_zh, x.text_en);
      }).join('');
      return rows ? `<div class="subsection">${title}<ul>${rows}</ul></div>` : '';
    };
    contact.innerHTML = list(d.sections).slice().sort((a, b) => (a?.sort ?? 0) - (b?.sort ?? 0))
      .map(s => block(s?.title_zh || s?.title_en ? bi('h3', s.title_zh, s.title_en) : '', list(s?.entries))).join('');
    show(contact, contact.children.length);
  }

  // 社群＝IG、YouTube 兩個 icon，IG 在左（user 2026-11-24）；各自的網址空的／不是 http(s)＝那個不出
  const social = root.querySelector('.footer-social');
  if (social) {
    // icon 的 class 寫完整（不要 `icon-${…}` 拼）：Tailwind 掃得到才會把 icon.css 的 .icon-ig／.icon-yt 編進 output.css——
    // 2026-11-26 contact.html 拿掉示意之後，只剩這裡用到、拼出來的掃不到＝只剩一塊沒有遮罩的黑方塊（user：「contact這邊沒有出現ig icon」）
    social.innerHTML = [[d.instagram, 'Instagram', 'icon-ig'], [d.youtube, 'YouTube', 'icon-yt']].map(([u, name, ic]) => {
      const url = safeUrl(u);
      return /^https?:/i.test(url) ? `<a ${ext(url)} aria-label="${name}"><span class="icon ${ic}" aria-hidden="true"></span></a>` : '';
    }).join('');
    show(social, social.children.length);
  }
  // 標章：alt＝Directus 檔案標題（檔案庫可改）；還沒放＝留著灰色佔位（user 2026-11-25 要佔位；原本收掉）
  const badge = root.querySelector('.footer-badge'), src = assetUrl(d.badge);
  if (src && badge) badge.outerHTML = `<img class="footer-badge" src="${escapeHtml(src)}" alt="${escapeHtml(d.badge.title)}">`;

  applyLang(root);
}
