// Directus REST base URL 的唯一注入點（沿用 SCCD 架構：前台只吃 JSON，渲染全在 SPA）。
// 後台網域 2026-11-18 定案；要換只改這裡。
// SCCD 經驗：用網域不用裸 IP（憑證綁網域）、走 https、後台要開 CORS。
export const CMS_API_BASE = 'https://scaidcms.usc.edu.tw/items';
export const CMS_ASSETS_BASE = 'https://scaidcms.usc.edu.tw/assets';

// Directus 檔案 → 顯示 URL。吃 file id 字串或深取的 { id }；已是完整 URL／站內路徑原樣回；空回 ''。
// SCCD 後期改走 CloudFront 直吃 S3（用 filename_disk 組 key）繞過弱機；有 CDN 時回來改這裡一處。
export function assetUrl(v) {
  const id = typeof v === 'string' ? v : v?.id;
  if (!id) return '';
  return /^(https?:)?\/\//.test(id) || id.startsWith('/') || id.startsWith('.') ? id : `${CMS_ASSETS_BASE}/${id}`;
}
// files M2M（每列 { directus_files_id: {...} }，相容直接檔物件）→ URL 陣列（濾掉空的）
export function assetUrls(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(x => assetUrl(x?.directus_files_id ?? x)).filter(Boolean);
}

// 抓 Directus JSON 回 .data。弱機的故障模式是「hang 而非拒絕」→ 統一逾時 abort 讓呼叫端走失敗鏈。
// 逾時涵蓋到 body 讀完（headers 到了 body stream 照樣可能 hang）。
// cmsDown：後台連不上（憑證／DNS／拒連＝fetch 丟 TypeError；逾時與 HTTP 錯誤不算）。live binding＝importer 讀到最新值
export let cmsDown = false;
export async function fetchCmsJson(url, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    cmsDown = false;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()).data;
  } catch (e) {
    if (e instanceof TypeError) cmsDown = true;
    throw e;
  } finally { clearTimeout(t); }
}

// YouTube Data API v3（作品頁用 playlistItems.list 把播放清單拆成一支一支影片，1 unit／50 支；user 2026-11-23，照 SCCD）。
// 沿用 SCCD 那支 key：GCP HTTP-referrer 限制（放行 github.io／sccd.usc.edu.tw／localhost）＝曝在前端無妨、限制網域才是防線。
// ⚠️ SCAID 的正式網域要加進這支 key 的白名單（或另開一支 SCAID 的 key 換掉這裡）；本機要用 http://localhost:PORT 開（127.0.0.1、file:// 會被擋）
export const YT_API_KEY = 'AIzaSyBU-muAPWSpX6hn4gKw4fec6yM1Yqd4lFA';

// sessionStorage last-known-good：上次成功的真資料，後台失敗時退這份（存不進去／壞快取都當沒有）
export function saveLKG(key, data) { try { sessionStorage.setItem(`scaid:${key}`, JSON.stringify(data)); } catch {} }
export function readLKG(key) { try { const s = sessionStorage.getItem(`scaid:${key}`); return s ? JSON.parse(s) : null; } catch { return null; } }

// 各頁內容一律走這支（照 SCCD，user 2026-11-26：「我們不需要假資料，收不到後臺也不需要render假的」）：
// 抓到＝存一份；抓不到（逾時、HTTP 錯、連不上）＝退這個分頁上次抓到的那份；連那份都沒有＝丟錯（呼叫端那一塊就不畫）。
// 整個連不上（cmsDown）時每頁只剩「即將推出」（main.js），這份只墊逾時、HTTP 錯那種偶發的。path＝/items/ 後面那段（含 query），也是 LKG 的 key
/** @param {string} path */
export async function cmsGet(path) {
  try { const d = await fetchCmsJson(`${CMS_API_BASE}/${path}`); saveLKG(path, d); return d; }
  catch (e) { const lkg = readLKG(path); if (lkg != null) return lkg; throw e; }
}
