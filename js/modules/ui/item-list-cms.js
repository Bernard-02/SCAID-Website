/**
 * 縮圖＋標題＋副標的列表（.item-list .item-row）← Directus（欄位與後台建法：docs/Directus-後台欄位.md）。
 * 師資、合作企業共用這一種（user 2026-11-21）：標題 h3、副標＝`subtitles` repeater 一筆一行 p、沒填就只有標題。
 * 頁面上每個 ul.item-list 掛 data-cms="集合" 或 "集合:類別"（師資的專任／兼任／業界導師段落寫死在 HTML，順序不看後台），段內照 sort。
 * 抓不到（斷線／集合沒建）或後台還沒任何一筆＝留 HTML 的 MOCK；某一類沒人＝那段整段收掉（段落導覽重做）。
 */
import { CMS_API_BASE, assetUrl, fetchCmsJson } from '../../config/api.js';
import { escapeHtml } from './escape-html.js';
import { applyLang } from './lang.js';
import { initSectionNav } from './section-nav.js';

// 各集合：要抓的欄位、縮圖欄位、標題（名字從人名庫／單位庫來，user 2026-11-21）、整列連到哪（回 '' ＝那列不可點、用 div）
/** @type {Record<string, { fields: string, thumb: (r: any) => unknown, name: (r: any) => any, link: (r: any) => string }>} */
const SPEC = {
  faculty: { fields: 'id,category,photo,person.name_zh,person.name_en', thumb: r => r.photo, name: r => r.person, link: r => `href="faculty-detail.html?id=${encodeURIComponent(r.id)}"` },
  // 企業官網：另開新視窗；只放行 http(s)，空的或其他＝不可點
  partners: { fields: 'id,logo,url,organization.name_zh,organization.name_en', thumb: r => r.logo, name: r => r.organization,
    link: r => (/^https?:\/\//i.test(r.url || '') ? `href="${escapeHtml(r.url)}" target="_blank" rel="noopener"` : '') },
};

/** 中文寫內文、英文寫 data-en（applyLang 套），英文空退中文 @param {string} tag @param {any} zh @param {any} en */
const t = (tag, zh, en) => `<${tag} data-en="${escapeHtml(en || zh || '')}">${escapeHtml(zh || en || '')}</${tag}>`;

/** @param {any} r @param {typeof SPEC[string]} s */
const row = (r, s) => {
  const src = assetUrl(s.thumb(r)), link = s.link(r), tag = link ? 'a' : 'div', n = s.name(r) || {};
  const subs = (Array.isArray(r.subtitles) ? r.subtitles : []).filter(x => x?.text_zh || x?.text_en);
  return `<li><${tag} class="item-row" ${link}>`
    + `<div class="item-thumb">${src ? `<img src="${escapeHtml(src)}" alt="" loading="lazy">` : ''}</div>`
    + `<div>${t('h3', n.name_zh, n.name_en)}${subs.map(x => t('p', x.text_zh, x.text_en)).join('')}</div></${tag}></li>`;
};

export async function loadItemListCms() {
  const lists = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('#page-content .item-list[data-cms]')]);
  let dropped = false;
  for (const col of new Set(lists.map(ul => (ul.dataset.cms || '').split(':')[0]))) {
    const s = SPEC[col];
    if (!s) continue;
    let rows;
    try { rows = await fetchCmsJson(`${CMS_API_BASE}/${col}?filter[status][_eq]=published&sort=sort&limit=-1&fields=${s.fields},subtitles`); }
    catch (e) { console.warn(`[${col}] 後台抓不到，維持示意：`, e instanceof Error ? e.message : e); continue; }
    // ponytail: 一筆都沒有＝後台還沒開始填，留示意；之後真的要整頁清空再改
    if (!Array.isArray(rows) || !rows.length || !lists[0].isConnected) continue;
    for (const ul of lists) {
      const [c, cat] = (ul.dataset.cms || '').split(':');
      if (c !== col) continue;
      const mine = cat ? rows.filter(r => r.category === cat) : rows;
      if (mine.length) ul.innerHTML = mine.map(r => row(r, s)).join('');
      else { ul.closest('.page-section')?.remove(); dropped = true; }
    }
  }
  if (dropped) initSectionNav();   // 收掉的段落不能還留著導覽矩形（舊的 listener 換頁時一起清）
  applyLang(document.querySelector('#page-content') || document);
}
