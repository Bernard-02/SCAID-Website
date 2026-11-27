/**
 * 介面文字 ← Directus `ui_labels`（user 2026-11-21，照 SCCD）：選單、頁名、固定的小標（專任教師、一年級、必修…）。
 * HTML 在元素上標 data-label="key"，元素本身的字＝後台抓不到時的原文（中文內文、英文 data-en，同全站規則）。
 * 後台有值＝寫進 data-zh／data-en 交給 lang.js 切（英文空退中文）；textContent，後台的字不會變成 HTML。
 * 一次抓全部、整個網站共用；抓失敗不記住（下次換頁再試，SCCD 那份會整個 session 都放棄）。
 * key 從哪來：scripts/seed-directus.cjs 掃 HTML 的 data-label 補進後台（只補缺的，不蓋後台改過的）。
 */
import { CMS_API_BASE, fetchCmsJson } from '../../config/api.js';
import { applyLang, getLang } from './lang.js';

/** @type {Promise<Record<string, { zh?: string, en?: string }>> | null} */
let cache = null;
/** 抓到的那張表（syncTitle 要同步讀；還沒抓到＝空） @type {Record<string, { zh?: string, en?: string }>} */
let map = {};

function loadUiLabels() {
  if (!cache) {
    cache = fetchCmsJson(`${CMS_API_BASE}/ui_labels?limit=-1&fields=key,zh,en`)
      .then(rows => map = Object.fromEntries((rows || []).filter(r => r?.key).map(r => [r.key, r])))
      .catch(e => { console.warn('[ui-labels] 後台抓不到，維持原本的字：', e instanceof Error ? e.message : e); cache = null; return {}; });
  }
  return cache;
}

/** root 裡標了 data-label 的元素換成後台的字，再套一次語言 @param {ParentNode} [root] */
export async function applyUiLabels(root = document) {
  const map = await loadUiLabels();
  if (root instanceof Node && !root.isConnected) return;   // 抓的時候已經換頁了
  /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll('[data-label]')).forEach(el => {
    const row = map[el.dataset.label || ''];
    if (!row?.zh && !row?.en) return;
    el.dataset.zh = row.zh || row.en;
    el.dataset.en = row.en || row.zh;
  });
  applyLang(root);
  syncTitle();
}

/** 分頁標題＝介面文字 title.<route 名>（user 2026-11-27：跟 slug、頁名分開，中英各寫一整串；英文空＝中文）。
 * 沒填＝「頁名 - SCAID」（頁名＝nav.<slug>，同選單）；首頁、師資詳細頁沒填＝不動（HTML 的 <title>／cms-pages.js 設的老師名字）。
 * 換頁（router）、換語言（scaid:lang）、後台的字到了（上面）都叫 */
export function syncTitle() {
  const row = map[`title.${document.body.dataset.page}`];
  const custom = (getLang() === 'en' && row?.en) || row?.zh;
  const h1 = /** @type {HTMLElement | null} */ (document.querySelector('#page-content h1'));
  if (custom) document.title = custom;
  else if (h1 && (h1.dataset.label || / - SCAID$/.test(document.title))) document.title = `${h1.textContent?.trim()} - SCAID`;
}
document.addEventListener('scaid:lang', syncTitle);
