/**
 * 對外網址用字（slug）的唯一來源（user 2026-11-26：「slug幫我開個後臺，需要跟sccd的後臺做法一致」＝照 SCCD js/config/slugs.js）。
 *
 * 程式內部一律用「內部代號」（route 名 about／faculty-detail…；檔名、後台集合、介面文字的 key 都跟著它），只有進出網址列才換成 slug：
 *   出：router pushState → pagePath
 *   進：冷載入／上一頁 → resolveRoute（router.js）用 pageOfSlug
 * 站內連結（HTML、程式組的 href）照舊寫真實檔名（about.html、faculty-detail.html?id=3），由 router 寫進網址列時換。
 * SCAID 沒有分頁（tab）＝只有「頁面」這一組（SCCD 的 page.／<頁>.<分頁> 兩種 key，這裡只用 page.）。
 *
 * 預設值＝SLUG_DEFAULTS；後台 site_slugs（key、slug）同 key 的列蓋過預設。後台讀不到（或還沒建表）＝用預設。
 * 生效中的整張表存 localStorage：下次進站首繪前就用得到。
 * 改 slug＝舊網址失效（進 404）；該頁 HTML head 的 canonical／og:url 要手動跟著改（寫死的、JS 不動它）。
 */

import { CMS_API_BASE, fetchCmsJson } from './api.js';
import { SITE_BASE_PATHNAME } from '../modules/ui/site-base.js';

// route 名 → 真實檔案（router 的路由表由這裡建；新頁面加在這、再到 SLUG_DEFAULTS 給 slug、跑 setup-directus.cjs 補後台那一列）
export const PAGE_FILES = {
  index: 'index.html',
  about: 'pages/about.html',
  partners: 'pages/partners.html',
  faculty: 'pages/faculty.html',
  'faculty-detail': 'pages/faculty-detail.html',
  curriculum: 'pages/curriculum.html',
  works: 'pages/works.html',
  activities: 'pages/activities.html',
  records: 'pages/records.html',
  admission: 'pages/admission.html',
  donate: 'pages/donate.html',
  regulations: 'pages/regulations.html',
  sitemap: 'pages/sitemap.html',
  contact: 'pages/contact.html',
  404: 'pages/404.html',
};

// key＝page.<route 名>；值＝英文顯示名小寫、空白換連字號（同 SCCD）。首頁（/）與 404 固定、不在表裡。
// scripts/setup-directus.cjs 讀這段物件字面值去後台補列——維持純字面值、別放運算。
export const SLUG_DEFAULTS = {
  'page.about': 'about',
  'page.partners': 'partners',
  'page.faculty': 'faculty',
  'page.faculty-detail': 'faculty-profile',
  'page.curriculum': 'curriculum',
  'page.works': 'works',
  'page.activities': 'activities',
  'page.records': 'records',
  'page.admission': 'admission',
  'page.donate': 'donate',
  'page.regulations': 'regulations-and-policies',
  'page.sitemap': 'site-map',
  'page.contact': 'contact',
};

const RESERVED = ['404', 'index', 'pages'];
const CACHE_KEY = 'scaid:slugs';

/** @type {Record<string, string>} */ let table = {};      // key（page.<route 名>）→ slug（生效中）
/** @type {Record<string, string>} */ let reverse = {};    // slug → route 名

// 預設＋合法的覆寫。該筆不能用就退回預設：格式不對（空、非 a-z0-9-、保留字）、不認得的 key、跟別頁的 slug 撞名
/** @param {Record<string, string> | null} over */
function build(over) {
  /** @type {Record<string, string>} */ const t = {};
  /** @type {Record<string, string>} */ const rev = {};
  const put = (key, slug) => { rev[slug] = key.slice(5); t[key] = slug; };
  const usable = (key) => { const slug = over && over[key]; return typeof slug === 'string' && /^[a-z0-9-]+$/.test(slug) && !RESERVED.includes(slug); };
  const reject = (key) => {
    if (over && over[key] && over[key] !== SLUG_DEFAULTS[key]) console.warn(`[slugs] ${key} 的「${over[key]}」不能用（格式不對或跟別頁撞名），改用預設 ${SLUG_DEFAULTS[key]}`);
    put(key, SLUG_DEFAULTS[key]);
  };
  const keys = Object.keys(SLUG_DEFAULTS), custom = keys.filter(usable);
  keys.filter(k => !custom.includes(k)).forEach(reject);   // 沒改的先佔位，改過的才看有沒有撞到
  custom.forEach(k => { if (rev[over[k]]) reject(k); else put(k, over[k]); });
  table = t;
  reverse = rev;
}

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') || null; } catch { return null; }
}
build(readCache());

// 後台的最新值（單次請求）。resolve 後 table 已換成最新；失敗＝維持上次讀到的／預設
export const slugsFresh = (async () => {
  try {
    const rows = await fetchCmsJson(`${CMS_API_BASE}/site_slugs?limit=-1&fields=key,slug`, 5000);
    /** @type {Record<string, string>} */ const over = {};
    (rows || []).forEach((/** @type {any} */ r) => { if (r && r.key) over[r.key] = r.slug; });
    build(over);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(table)); } catch { /* 存不進去＝下次照樣先用預設 */ }
  } catch { /* 後台連不上／表還沒建 */ }
})();

/** route 名 → slug（首頁＝''） @param {string} page */
export const pageSlug = (page) => (page === 'index' ? '' : page === '404' ? '404' : table[`page.${page}`] || page);
/** slug → route 名（不認得＝null） @param {string} slug */
export const pageOfSlug = (slug) => (slug === '404' ? '404' : reverse[slug] || null);

// 正式站（已設 SPA fallback：CloudFront 403/404→index.html）網址列才用乾淨 slug；其餘（本機、預覽）用真實檔案路徑，
// 任何 server 都找得到實體檔、refresh 不 404。⚠️ 把網域加進來「之前」該站的 fallback 必須先設好（docs/IT-請求-前台上線.txt）
export const CLEAN_URL_HOSTS = [];
/** route 名 → 寫進網址列的 pathname @param {string} page */
export function pagePath(page) {
  if (page === 'index') return SITE_BASE_PATHNAME;
  return SITE_BASE_PATHNAME + (CLEAN_URL_HOSTS.includes(window.location.hostname) ? pageSlug(page) : PAGE_FILES[/** @type {keyof typeof PAGE_FILES} */ (page)]);
}
