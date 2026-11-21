/**
 * 介面文字 ← Directus `ui_labels`（user 2026-11-21，照 SCCD）：選單、頁名、固定的小標（專任教師、一年級、必修…）。
 * HTML 在元素上標 data-label="key"，元素本身的字＝後台抓不到時的原文（中文內文、英文 data-en，同全站規則）。
 * 後台有值＝寫進 data-zh／data-en 交給 lang.js 切（英文空退中文）；textContent，後台的字不會變成 HTML。
 * 一次抓全部、整個網站共用；抓失敗不記住（下次換頁再試，SCCD 那份會整個 session 都放棄）。
 * key 從哪來：scripts/seed-directus.cjs 掃 HTML 的 data-label 補進後台（只補缺的，不蓋後台改過的）。
 */
import { CMS_API_BASE, fetchCmsJson } from '../../config/api.js';
import { applyLang } from './lang.js';

/** @type {Promise<Record<string, { zh?: string, en?: string }>> | null} */
let cache = null;

export function loadUiLabels() {
  if (!cache) {
    cache = fetchCmsJson(`${CMS_API_BASE}/ui_labels?limit=-1&fields=key,zh,en`)
      .then(rows => Object.fromEntries((rows || []).filter(r => r?.key).map(r => [r.key, r])))
      .catch(e => { console.warn('[ui-labels] 後台抓不到，維持原本的字：', e instanceof Error ? e.message : e); cache = null; return {}; });
  }
  return cache;
}

/** 一個 key 的中英文（給 JS 自己組的元素用；後台沒有＝回 fallback） @param {Record<string, any>} map @param {string} key @param {string} zh @param {string} en */
export const label = (map, key, zh, en) => ({ zh: map[key]?.zh || zh, en: map[key]?.en || map[key]?.zh || en });

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
  // 分頁標題跟頁名走（頁名＝nav.<slug>，同選單）
  const h1 = document.querySelector('#page-content h1[data-label]');
  if (h1 && root.contains?.(h1)) document.title = `${h1.textContent} - SCAID`;
}
