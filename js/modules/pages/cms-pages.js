/**
 * 各頁內容 ← Directus（user 2026-11-21：全站接後台；集合與欄位見 docs/Directus-後台欄位.md）。
 * 每頁 HTML 裡的是示意內容：後台抓不到、或那個集合還沒有任何一筆＝照舊顯示；抓到＝換成後台的。
 * 換上去的標記照抄各頁 HTML 那份（.item-row 積木、摺疊、相簿、輪播…），CSS 與互動不用另外寫。
 * main.js：殼載完叫 loadBarNews()；每頁換進來叫 loadPage(page, params)。
 * 師資／合作企業列表＝item-list-cms.js，聯絡頁＝footer-cms.js，介面文字（選單、頁名、固定小標）＝ui-labels.js。
 * 後台的字一律過 escapeHtml；後台沒有 rich text 了（2026-11-24 捐款、規章的段落也改成同關於的小節＝純文字），不把後台的 HTML 塞進頁面。
 */
import { CMS_API_BASE, assetUrl, fetchCmsJson } from '../../config/api.js';
import { escapeHtml as esc } from '../ui/escape-html.js';
import { applyUiLabels } from '../ui/ui-labels.js';
import { applyLang } from '../ui/lang.js';
import { initSectionNav } from '../ui/section-nav.js';
import { initAlbums } from '../ui/album.js';
import { initSlideshow } from '../ui/slideshow.js';
import { fitBar, youtubeId } from '../ui/chrome.js';
import { hover } from '../ui/item-marquee.js';
import { DUR } from '../ui/motion.js';
import { prefersReducedMotion } from '../ui/reduce-motion.js';
import { sitePath } from '../ui/site-base.js';
import { FACULTY_LINES, subLines } from '../ui/item-list-cms.js';

// ── 小工具 ──
/** 中文寫內文、英文寫 data-en（lang.js 切），英文空退中文；兩個都空＝不出 @param {string} tag @param {any} zh @param {any} en @param {string} [attrs] */
const bi = (tag, zh, en, attrs = '') => (zh || en) ? `<${tag}${attrs} data-en="${esc(en || zh)}">${esc(zh || en)}</${tag}>` : '';
/** 介面文字：先放原本的字＋data-label，applyUiLabels 再換成後台的 @param {string} tag @param {string} key @param {string} zh @param {string} en @param {string} [attrs] */
const lbl = (tag, key, zh, en, attrs = '') => `<${tag}${attrs} data-label="${key}" data-en="${esc(en)}">${esc(zh)}</${tag}>`;
/** 多行文字（說明、回答）：一個 p、換行照留（whitespace-pre-line），中英一樣走 data-en */
const text = (zh, en, cls = '') => bi('p', zh, en, ` class="whitespace-pre-line${cls ? ' ' + cls : ''}"`);
const bySort = (/** @type {any} */ a, /** @type {any} */ b) => (a.sort ?? 0) - (b.sort ?? 0);
/** files M2M（相簿、附件、段落圖）→ 照 sort 的檔案 @param {any} list */
const filesOf = (list) => (Array.isArray(list) ? list : []).slice().sort(bySort).map(r => r?.directus_files_id).filter(f => f?.id);
const FILE = (/** @type {string} */ f) => `${f}.sort,${f}.directus_files_id.id,${f}.directus_files_id.width,${f}.directus_files_id.height,${f}.directus_files_id.title,${f}.directus_files_id.filename_download`;
const p2 = (/** @type {number} */ x) => String(x).padStart(2, '0');
const EN_DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
/** 入學的時間（動態 2026-11-25 起照 SCCD＝上面的 datesOf）；後台用選的（user 2026-11-24）：日期［–結束日期］，沒有幾點（user 同一天：動態、入學的開始／結束時間都拿掉，「留下日期即可」）。
 *  中文 2025.12.20–12.27（跨年才再寫年）、英文 20–27 Dec 2025 @param {any} n */
const timeOf = (n) => {
  if (!n.date) return '';
  const day = (/** @type {string} */ s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
  const zhDay = (/** @type {Date} */ d, year = true) => `${year ? d.getFullYear() + '.' : ''}${p2(d.getMonth() + 1)}.${p2(d.getDate())}`;
  const a = day(n.date), b = n.end_date && n.end_date.slice(0, 10) !== n.date.slice(0, 10) ? day(n.end_date) : null;
  return bi('p', zhDay(a) + (b ? '–' + zhDay(b, b.getFullYear() !== a.getFullYear()) : ''), b ? EN_DAY.formatRange(a, b) : EN_DAY.format(a));
};
const MON_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MON_ZH = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
const ymd = (/** @type {unknown} */ s) => String(s || '').slice(0, 10).split('-').map(Number);
/** 動態的日期（照 SCCD 的活動，user 2026-11-25：「動態的日期，前臺跟後臺都調整跟sccd的一樣」；SCCD activities-data-loader.js formatSingleDateGroup）：
 *  後台 dates 一筆一段、「, 」接起來；這裡不分年（問過）＝每段都帶開始的年（＝SCCD 的 includeStartYear），數字的中英同一行：
 *  2025/03/05、2025/03/05 - 03/08、跨年 2024/12/28 - 2025/01/03；只到月 2025 DEC／2025 十二月；月到月 2025 DEC - FEB（跨年 2025 DEC - 2026 FEB）；
 *  只到年＝那一年（SCCD 寫 N/A／無記錄：它左邊有年份欄、這裡沒有）；取消（cancelled）＝Canceled／取消（同 SCCD） @param {any} n */
export const datesOf = (n) => {   // export：煙霧測試直接餵各種寫法
  if (n.cancelled) return bi('p', '取消', 'Canceled');
  const mon = (/** @type {number} */ y, /** @type {number} */ m, /** @type {string[]} */ L, withYear = true) => `${withYear ? y + ' ' : ''}${L[m - 1] || ''}`;
  const parts = (Array.isArray(n.dates) ? n.dates : []).filter(d => d?.start).map(d => {
    const [y, m, dd] = ymd(d.start), [y2, m2, d2] = d.end ? ymd(d.end) : [y, m, dd];
    if (d.yearOnly) return [String(y), String(y)];
    if (d.monthOnly || (d.monthRange && y2 === y && m2 === m)) return [mon(y, m, MON_ZH), mon(y, m, MON_EN)];
    if (d.monthRange) return [MON_ZH, MON_EN].map(L => `${mon(y, m, L)} - ${mon(y2, m2, L, y2 !== y)}`);
    const start = `${y}/${p2(m)}/${p2(dd)}`;
    const s = y2 === y && m2 === m && d2 === dd ? start : `${start} - ${y2 !== y ? y2 + '/' : ''}${p2(m2)}/${p2(d2)}`;
    return [s, s];
  });
  return parts.length ? bi('p', parts.map(x => x[0]).join(', '), parts.map(x => x[1]).join(', ')) : '';
};
/** 動態的順序（同 SCCD）：第一段的開始、新到舊；只到年＝排在那一年最後；沒日期＝最後 @param {any} n */
const dateKey = (n) => {
  const d = (Array.isArray(n.dates) ? n.dates : []).find(x => x?.start);
  if (!d) return -Infinity;
  const [y, m, dd] = ymd(d.start);
  return d.yearOnly ? y * 10000 : y * 10000 + m * 100 + dd;
};
const article = () => document.querySelector('#page-content .page-body');
/** 摺疊一列：展開內容空的＝不能點的 div 列 @param {string} head @param {string} body @param {string} [cls] */
const fold = (head, body, cls = '') => body
  ? `<li><details${cls ? ` class="${cls}"` : ''}><summary class="item-row">${head}</summary><div class="fold-body">${body}</div></details></li>`
  : `<li><div class="item-row">${head}</div></li>`;

/** 抓一個集合（沒有上架／草稿，user 2026-11-24：都不需要狀態）；抓不到或一筆都沒有＝null（呼叫端就留 HTML 的示意）
 * @param {string} collection @param {string} query */
async function list(collection, query) {
  try {
    const data = await fetchCmsJson(`${CMS_API_BASE}/${collection}?${query}`);
    // ponytail: 一筆都沒有＝後台還沒開始填，留示意；之後真的要整頁清空再改
    return Array.isArray(data) && data.length ? data : null;
  } catch (e) { console.warn(`[${collection}] 後台抓不到，維持示意：`, e instanceof Error ? e.message : e); return null; }
}
/** 每頁一個單例（關於、捐款、規章、師資頁、合作企業頁；user 2026-11-22 照 SCCD）；抓不到＝null @param {string} collection @param {string} fields */
async function single(collection, fields) {
  try { return await fetchCmsJson(`${CMS_API_BASE}/${collection}?fields=${fields}`); }
  catch (e) { console.warn(`[${collection}] 後台抓不到，維持示意：`, e instanceof Error ? e.message : e); return null; }
}
/** 段落有幾段（關於、捐款、規章的條款：子集合，照 sort 的陣列；還沒填＝空的） @param {any} p */
const sectionsOf = (p) => Array.isArray(p?.sections) ? p.sections.filter((/** @type {any} */ s) => s?.title_zh || s?.title_en || s?.description_zh || s?.description_en || s?.subsections?.length || s?.timeline?.length) : [];

const imgAttrs = (/** @type {any} */ f) => `src="${esc(assetUrl(f))}" alt=""${f.width && f.height ? ` width="${f.width}" height="${f.height}"` : ''} loading="lazy"`;
/** 相簿裡的一支影片（動態；user 2026-11-24：「影片要有，因爲要做影片渲染」，照 SCCD 活動的 videoLinks）：一格 16:9＝YouTube 的縮圖（hqdefault 是 4:3、
 *  上下帶黑邊 → page.css cover 裁掉）＋正中一顆 play；直連的影片檔（.mp4、.m3u8）沒有縮圖＝灰底＋play。點了在放大 dialog 播（chrome.js openGallery）
 *  @param {string} url */
const videoShot = (url) => {
  const id = youtubeId(url);
  return `<button type="button" class="album-video" data-video="${esc(url)}">${id ? `<img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" width="480" height="360" loading="lazy">` : ''
  }<span class="icon icon-play" aria-hidden="true"></span>${lbl('span', 'common.play_video', '播放影片', 'Play video', ' class="sr-only"')}</button>`;
};
/** 後台的影片連結（重複列 [{ url }]）：只收 http(s) @param {any} rows */
const videosOf = (rows) => (Array.isArray(rows) ? rows : []).map(v => String(v?.url || '').trim()).filter(u => /^https?:\/\//i.test(u));
/** 相簿（動態、入學）：寬高照後台檔案＝一打開就排好、chevron 當下決定。影片排在照片前面（同 SCCD：影片 → 圖） @param {any[]} fs @param {string[]} [videos] */
const album = (fs, videos = []) => fs.length || videos.length ? `<div class="album">${videos.map(videoShot).join('')}${
  fs.map(f => `<button type="button"><img ${imgAttrs(f)}>${lbl('span', 'common.enlarge', '放大圖片', 'Enlarge image', ' class="sr-only"')}</button>`).join('')}</div>` : '';
/** 段落圖片輪播（關於；小節放多張也是這個） @param {any[]} fs @param {string} [c] 多掛的 class（小節裡的間距） */
const slideshow = (fs, c = '') => fs.length ? `<div class="slideshow${c ? ` ${c}` : ''}" aria-label="段落圖片" data-en-label="Section images">${fs.map(f => `<button type="button" class="slide"><img ${imgAttrs(f)}></button>`).join('')}</div>` : '';
/** 多行純文字 → 一段一個 p（換行照留、空一行＝分段；中英照段的順序對），回傳每段的產生器、class 由呼叫端給 @param {any} zh @param {any} en */
const paras = (zh, en) => {
  const split = (/** @type {any} */ s) => String(s || '').trim().split(/\n\s*\n/), z = split(zh), e = split(en);
  /** @type {((c: string) => string)[]} */
  const out = [];
  for (let i = 0; i < Math.max(z.length, e.length); i++) if (z[i] || e[i]) out.push(c => text(z[i], e[i], c));
  return out;
};
/** 關於的一個小節（user 2026-11-23：不用 rich text，一個小節一筆、可以一直加；同一天加圖片、附註）：標題 → 圖 → 內文 → 附註，有才排。
 *  圖可以多張（user 2026-11-24）：一張＝照原比例放在內文欄正中、多張＝輪播（同段落圖片，框高也同小節圖）。
 *  一個小節一塊 .subsection（小節之間＝.subsections 的 gap xl，user 2026-11-25）；
 *  塊裡隔 sm（同分段）、第一塊不留上距；圖的最高 page.css @param {any} it */
const subsection = (it) => {
  /** @type {((c: string) => string)[]} */
  const blocks = [], fs = filesOf(it.images);
  if (fs.length > 1) blocks.push(c => slideshow(fs, c));
  else if (fs.length) blocks.push(c => `<img${c ? ` class="${c}"` : ''} ${imgAttrs(fs[0])}>`);
  blocks.push(...paras(it.text_zh, it.text_en));
  if (it.note_zh || it.note_en) blocks.push(c => text(it.note_zh, it.note_en, `${c} text-xs`.trim()));
  return `<div class="subsection">${bi('h3', it.title_zh, it.title_en)}${blocks.map((b, i) => b(i ? 'mt-sm' : '')).join('')}</div>`;
};
/** 年份＋說明的條列（師資詳細頁的學歷…、關於的年表；user 2026-11-23：沿革要跟老師的詳細頁一樣）：一筆＝年份一行、說明一行，沒年份＝只有說明；
 *  沒說明的那筆不算、一筆都沒有＝'' @param {any} rows @param {string} [attrs] */
const entryList = (rows, attrs = '') => {
  const r = (Array.isArray(rows) ? rows : []).filter((/** @type {any} */ x) => x?.text_zh || x?.text_en);
  return r.length ? `<ul${attrs}>${r.map(x => x.year ? `<li><p>${esc(x.year)}</p>${bi('p', x.text_zh, x.text_en)}</li>` : bi('li', x.text_zh, x.text_en)).join('')}</ul>` : '';
};
/** 一段（關於、捐款、規章的條款）＝標題 → 輪播 → 說明 → 小節 → 年表：說明＝段落圖片下面那段、小節＝子集合（照 sort）、年表＝沿革那種年份＋說明（都 user 2026-11-23）。
 *  捐款、規章原本的內文是一段 rich text，2026-11-24 都改成這個（user：「使用條款就是跟 about 的一樣」） @param {any} s */
const textSection = (s) => {
  const subs = (Array.isArray(s.subsections) ? s.subsections : []).slice().sort(bySort).map(subsection).join('');
  return `<section class="page-section">${bi('h2', s.title_zh, s.title_en, ' class="section-title"')}${slideshow(filesOf(s.images))}${
    paras(s.description_zh, s.description_en).map((b, i) => b(i ? 'mt-sm' : 'mt-md')).join('')}${
    subs && `<div class="subsections">${subs}</div>`}${entryList(s.timeline, ' class="timeline mt-xl"')}</section>`;
};
/** 依分類分段（qa、規章）：照第一次出現的順序 @param {any[]} rows */
const groups = (rows) => {
  /** @type {Map<string, { zh: string, en: string, items: any[] }>} */
  const m = new Map();
  rows.forEach(r => { const k = r.category_zh || r.category_en || ''; if (!m.has(k)) m.set(k, { zh: r.category_zh, en: r.category_en, items: [] }); m.get(k)?.items.push(r); });
  return [...m.values()];
};

/** 換掉文章裡的段落（只換 which 選到的那幾段，其他照舊、順序照新的） @param {Element} art @param {string} html @param {(s: Element) => boolean} [which] */
function replaceSections(art, html, which = () => true) {
  const old = [...art.querySelectorAll(':scope > .page-section')].filter(which);
  if (old[0]) old[0].insertAdjacentHTML('beforebegin', html); else art.insertAdjacentHTML('beforeend', html);
  old.forEach(s => s.remove());
}
/** 換完內容：段落導覽重排、新的相簿／輪播接上、介面文字與語言再套一次 */
function refresh() {
  initSectionNav();
  initAlbums();
  initSlideshow();
  return applyUiLabels(document.getElementById('page-content') || document);
}
/** 導言（.page-lead；404 那種掛 data-label 的是介面文字，不是這個） @param {any} p */
function setLead(p) {
  const el = /** @type {HTMLElement | null} */ (document.querySelector('#page-content .page-lead:not([data-label])'));
  if (!el || !(p?.lead_zh || p?.lead_en)) return;
  el.dataset.zh = p.lead_zh || p.lead_en;
  el.dataset.en = p.lead_en || p.lead_zh;
}

// ── 動態（activities）、入學（admission）：各一個集合（user 2026-11-24；原本共用 news、勾「入學」）。首頁那串與底列跑馬燈是 news（下面） ──
// 欄位用 *（這個集合現在有的都拿）＋相簿、附件那幾層，不一個一個點名：後台刪掉不要的欄位（user 2026-11-24 刪了動態的開始／結束時間）前台照樣讀得到——
// 點名一個已經不存在的欄位，Directus 整串回 403、前台退回示意。沒有的欄位這裡本來就當空的（timeOf、bi）
const FIELDS = { activities: `*,${FILE('album')}`, admission: `*,${FILE('album')},${FILE('attachments')}` };
/** 一個地點：城市（手打）有填＝接在後面的括號裡——中文「地點（城市）」全形、英文「place (city)」半形（user 2026-11-25：「渲染就是跟在地點後面，
 *  （）半型全型再根據語言調整」「城市的是手動key的文字」「動態不需要國家」）。英文空退中文 @param {any} x */
const place = (x) => {
  const cz = x?.city_zh || x?.city_en || '', ce = x?.city_en || x?.city_zh || '';
  const nz = x?.name_zh || x?.name_en || '', ne = x?.name_en || x?.name_zh || '';
  return bi('p', nz && cz ? `${nz}（${cz}）` : nz || cz, ne && ce ? `${ne} (${ce})` : ne || ce);
};
/** 動態頁那一列（後台照 SCCD 的活動，user 2026-11-24）：縮圖＋標題＋副標（一筆一行，同師資那種；原本一行「分類」）；
 *  展開＝時間、地點（可以好幾個、一個一行；原本一格 place_*）、相簿（影片在前） @param {any} n */
const newsRow = (n) => {
  const lines = (/** @type {any} */ rows, /** @type {string} */ k) => (Array.isArray(rows) ? rows : []).map(x => bi('p', x?.[`${k}_zh`], x?.[`${k}_en`])).join('');
  const head = `${n.image ? `<div class="item-thumb"><img src="${esc(assetUrl(n.image))}" alt="" loading="lazy"></div>` : ''}<div>${bi('h3', n.title_zh, n.title_en)}${lines(n.subtitles, 'text')}</div>`;
  const meta = datesOf(n) + (Array.isArray(n.locations) ? n.locations : []).map(place).join('');
  return fold(head, (meta ? `<div class="fold-meta">${meta}</div>` : '') + album(filesOf(n.album), videosOf(n.videos)));
};
/** 入學頁那一列：標題＋時間（沒縮圖、沒分類）；展開＝說明 → 相簿 → 附件 @param {any} n */
const admissionRow = (n) => {
  // 附件點了＝下載、不開新頁（user 2026-11-25：「點擊admission的檔案應該是下載，不是開新的page」）：檔在後台的網域＝跨網域，a 的 download 屬性瀏覽器不理，
  // 要 Directus 自己回 attachment（assets 網址加 ?download）；download 屬性留著＝同網域時也是下載
  const files = filesOf(n.attachments);
  const links = files.length ? `<ul class="link-list">${files.map(f => `<li><a class="nav-link" href="${esc(`${assetUrl(f)}?download`)}" download>${esc(f.title || f.filename_download || '')}</a></li>`).join('')}</ul>` : '';
  return fold(bi('h3', n.title_zh, n.title_en) + timeOf(n), text(n.summary_zh, n.summary_en) + album(filesOf(n.album)) + links);
};
/** 動態頁／入學頁的清單。item＝首頁連過來的那一則（入學頁 ?item=<id>，user 2026-11-23 照 SCCD）：打開、捲到內容的起始線（同段落導覽的對齊） @param {boolean} [admission] @param {string} [item] */
async function newsList(admission = false, item = '') {
  // 抓之前先記住這一頁的清單：後台慢、抓完已經換到動態／入學另一頁（同樣有 .item-list）＝不畫到那一頁去
  const ul = document.querySelector('#page-content .page-section .item-list');
  if (!ul) return;
  const col = admission ? 'admission' : 'activities';
  // 動態：日期是重複列（dates，照 SCCD）＝後台排不了 → 這裡排（dateKey）；入學照舊後台照 date 排
  const rows = await list(col, `${admission ? 'sort=-date&' : ''}limit=-1&fields=${FIELDS[col]}`);
  if (!rows || !ul.isConnected) return;
  if (!admission) rows.sort((a, b) => (dateKey(b) - dateKey(a)) || 0);   // || 0：兩個都沒日期（-Infinity − -Infinity＝NaN）
  ul.innerHTML = rows.map(admission ? admissionRow : newsRow).join('');
  await refresh();
  if (!item || !ul.isConnected) return;   // 等介面文字的時候換頁了，同上
  const li = ul.children[rows.findIndex(n => String(n.id) === item)], body = ul.closest('.page-body');
  if (!li) return;
  // 那一則捲到內容的起始線（＝內文欄的頂；原本量 h1，標題 2026-11-25 起只給報讀）。兩個都是畫面座標＝相減跟目前捲到哪無關（同 section-nav 的 target）
  if (body) window.scrollTo({ top: li.getBoundingClientRect().top - body.getBoundingClientRect().top, behavior: 'instant' });
  void reveal(li, ul);   // 不等它：router 等這支換好內容才淡入
}
/** deep link 到的那一則（user 2026-11-24：「應該是先做完 hover，才打開 accordion，不是同時做」；原本一到就直接打開＋聚焦＝hover 跟著同時跑）：
 *  等這一頁看得到了（換頁的淡入、第一次載入的 logo 進場都演完）→ hover 的效果（帶蓋上、收掉）做完 → 照手風琴自己的開法打開（高度補間、一次只開一個；空心點變實心）
 *  → 焦點放到它（鍵盤從這一則接著走，同網址的 #錨點；不然第一下 Tab 從頁首開始、把它捲走） @param {Element} li @param {Element} ul */
async function reveal(li, ul) {
  const html = document.documentElement;
  await new Promise(r => { const tick = () => (ul.isConnected && html.matches('.page-leaving, .is-intro') ? requestAnimationFrame(tick) : r(undefined)); tick(); });
  await new Promise(r => setTimeout(r, prefersReducedMotion() ? 0 : DUR.fade * 1000));   // 淡入那段（--dur-fade）
  const summary = li.querySelector('summary');
  if (!(summary instanceof HTMLElement) || !ul.isConnected) return;
  await hover(summary);
  if (!ul.isConnected) return;
  if (!summary.parentElement?.hasAttribute('open')) summary.click();   // accordion.js 接手（減少動態＝原生瞬間開）
  summary.focus({ preventScroll: true });
}

// ── 首頁那串＋底列跑馬燈＝首頁的 news（user 2026-11-24：「news 是 news」；原本叫 home_news）：照拖曳順序前 8 則 ──
/** 點了去哪（照 SCCD 的首頁 news）→ <a> 的屬性：入學頁的某一則（?item=，到了打開那一則）優先；那則被刪掉＝後台那格自己變空；
 *  再來外部網址（只放 http(s)、另開新視窗）；都沒有＝''（不能點） @param {any} n */
const homeLink = (n) => {
  const a = n.admission_item;
  if (a?.id) return `href="${esc(sitePath(`pages/admission.html?item=${encodeURIComponent(a.id)}`))}"`;
  return /^https?:\/\//i.test(n.url || '') ? `href="${esc(n.url)}" target="_blank" rel="noopener"` : '';
};
async function homeNews() {
  // 只點名用得到的欄位：後台刪掉的欄位還點名＝整串 403（user 2026-11-24 拿掉了說明 summary）
  const rows = await list('news', 'sort=sort&limit=8&fields=title_zh,title_en,image,url,admission_item.id');
  const ul = document.querySelector('#page-content .home-news-list ul');
  if (!rows || !ul?.isConnected) return;
  ul.innerHTML = rows.map(n => {
    // 圖在上、標題在下（user 2026-11-24）；後台沒有圖＝不放圖框（user 2026-11-24，原本灰底佔位）；只有標題（說明拿掉了，user 2026-11-24）
    const body = (n.image ? `<div class="home-news-box"><img src="${esc(assetUrl(n.image))}" alt="" loading="lazy"></div>` : '') + bi('p', n.title_zh, n.title_en, ' class="text-md"');
    const link = homeLink(n);
    return `<li>${link ? `<a class="block" ${link}>${body}</a>` : body}</li>`;
  }).join('');
  await refresh();
}
/** 首頁影片（後台「首頁」資料夾裡的單例 home_video，user 2026-11-23）：底列 ▶ 鈕的 data-video ← 後台的連結（chrome.js openIntro 照它開）。
 *  只收 http(s)；抓不到／沒填＝照 header.html 原本的 data-video */
export async function loadIntroVideo() {
  const v = await single('home_video', 'url'), btn = /** @type {HTMLElement | null} */ (document.querySelector('.site-bar .play-btn'));
  if (btn && /^https?:\/\//i.test(v?.url || '')) btn.dataset.video = v.url;
}
/** 底列的 news（殼裡、只在首頁看得到）：首頁 news 的標題，一則一個 span（順序同首頁清單＝點了定位到同一則）；
 *  換完叫 fitBar＝從第一則重來（chrome.js：一次顯示一則，user 2026-11-23） */
export async function loadBarNews() {
  const rows = await list('news', 'sort=sort&limit=8&fields=title_zh,title_en');
  const copy = document.querySelector('.site-bar .bar-news-copy');
  if (!rows || !copy) return;
  copy.innerHTML = rows.map(n => bi('span', n.title_zh, n.title_en)).join('');
  applyLang(copy);
  fitBar();
}

// ── 課程：一年級～四年級各一段（介面文字），同年級必修在前、選修在後；一門課一個摺疊、點開＝說明 ──
const YEARS = [['一年級', 'Year 1'], ['二年級', 'Year 2'], ['三年級', 'Year 3'], ['四年級', 'Year 4']];
async function curriculum() {
  // 必修／選修＝下拉 category（required／elective；user 2026-11-25：「後臺的必選修應該改成dropdown才對，不是checkbox」，原本一格勾選 required）
  const rows = await list('courses', 'sort=sort&limit=-1&fields=year,sort,category,name_zh,name_en,description_zh,description_en');
  const art = article();
  if (!rows || !art?.isConnected) return;
  const req = (/** @type {any} */ c) => c.category !== 'elective';   // 沒填＝必修（後台的預設）
  replaceSections(art, [1, 2, 3, 4].map(y => {
    const cs = rows.filter(c => c.year === y).sort((a, b) => (Number(req(b)) - Number(req(a))) || bySort(a, b));
    if (!cs.length) return '';
    const [yz, ye] = YEARS[y - 1];
    return `<section class="page-section">${lbl('h2', `curriculum.year.${y}`, yz, ye, ' class="section-title"')}<ul class="item-list">${cs.map(c => fold(
      bi('h3', c.name_zh, c.name_en) + (req(c) ? lbl('p', 'curriculum.required', '必修', 'Required') : lbl('p', 'curriculum.elective', '選修', 'Elective')),
      text(c.description_zh, c.description_en))).join('')}</ul></section>`;
  }).join(''));
  await refresh();
}

// ── 榮譽（榮譽、報導合在一個集合 records；user 2026-11-25：「後臺資料庫上，將榮譽跟報導兩者合在一起，要可以上傳圖片，但兩者打開來都會是accordion」）：
//    一筆一個摺疊＝動態那種列的變體（縮圖＝國旗、小一號，page.css .record）；收著＝國旗＋標題＋類型（榮譽／報導，介面文字 records.type.*），
//    點開＝主辦方（榮譽，從單位庫選）＋內容（重複列 details，一筆一行：得獎人、獎別、報導標題、刊出日期…）＋圖片（album，同動態的相簿、點了放大）。
//    類型不是後台選的（user 2026-11-25：「如果是寫標題的話，就會是award，如果是從庫裏面選的話，則是press，二選一」）：從媒體庫選了媒體＝報導、那一列的標題＝媒體的名字；
//    沒選＝榮譽、標題＝寫的獎項名稱。後台那兩格互鎖；原本另外有一格「類型」category、報導的標題是自己打的 ──
const RECORD_TYPES = { award: ['榮譽', 'Award'], press: ['報導', 'Press'] };
// 國旗給報讀的國名（user 2026-11-25：「這個報讀是指無障礙嗎？這個不需要寫在後臺」）＝瀏覽器內建的國名、照國家代碼自己生（原本後台一格 country_zh／country_en 要人填，刪了）
const REGION = { zh: new Intl.DisplayNames(['zh-Hant'], { type: 'region' }), en: new Intl.DisplayNames(['en'], { type: 'region' }) };
async function records() {
  // 欄位用 *：舊的那幾格（award_*、winner_*…）藏起來了還在，之後後台刪掉也不會整串 403（同動態）
  const rows = await list('records', `sort=sort&limit=-1&fields=*,organizer.name_zh,organizer.name_en,media.name_zh,media.name_en,${FILE('album')}`);
  const ul = document.querySelector('#page-content .page-section .item-list');
  if (!rows || !ul?.isConnected) return;
  ul.innerHTML = rows.map(r => {
    const code = /^[a-z]{2}$/.test(r.country_code || '') ? r.country_code : '';
    const flag = code ? `<div class="item-thumb"><img src="https://cdn.jsdelivr.net/npm/flag-icons@7.5.0/flags/4x3/${code}.svg" alt="" loading="lazy"></div>` : '';   // 同動態的縮圖標記；大小在 page.css .record
    const press = !!(r.media?.name_zh || r.media?.name_en), type = press ? 'press' : 'award', [typeZh, typeEn] = RECORD_TYPES[type];
    const title = press ? bi('h3', r.media.name_zh, r.media.name_en) : bi('h3', r.title_zh, r.title_en);   // 報導＝媒體的名字、榮譽＝獎項名稱
    const words = `${(code ? bi('span', REGION.zh.of(code.toUpperCase()), REGION.en.of(code.toUpperCase()), ' class="sr-only"') : '')}${title}${lbl('p', `records.type.${type}`, typeZh, typeEn)}`;
    const head = flag ? `${flag}<div>${words}</div>` : words;   // 沒國旗＝純文字的列（不放圖框，同動態沒圖的那則）：字直接放在列裡，標題、副標之間的 gap 才吃得到（page.css）
    // 點開後的第一行：榮譽＝主辦方（單位庫；user 2026-11-25：「要，從庫裏面選」）；報導的媒體已經是標題了＝不再重複
    const lines = (press ? '' : bi('p', r.organizer?.name_zh, r.organizer?.name_en)) + (Array.isArray(r.details) ? r.details : []).map((/** @type {any} */ x) => bi('p', x?.text_zh, x?.text_en)).join('');
    // .record＝國旗不是封面（chrome.js：打開了點它照常收合、不放大，相簿放大的那一組也不含它）；點開沒東西也照樣是摺疊
    return `<li><details class="record"><summary class="item-row">${head}</summary><div class="fold-body">${lines ? `<div class="fold-meta">${lines}</div>` : ''}${album(filesOf(r.album))}</div></details></li>`;
  }).join('');
  await refresh();
}

// ── 規章與政策（單例 regulations）：規章、表單（重複列 items）依分類分段、整列外連（只放 http(s)，沒有＝不能點；副標一行一個）
// ＋文字段落（使用條款、隱私權政策）＝同關於的段落：子集合 regulations_sections、裡面有小節（user 2026-11-24；原本是重複列＋一整段 rich text） ──
async function regulations() {
  const page = await single('regulations', 'items,' + TEXT_SECTIONS);
  const art = article();
  if (!page || !art?.isConnected) return;
  const isList = (/** @type {Element} */ s) => !!s.querySelector('.item-list');
  const lines = (/** @type {any} */ s) => String(s || '').split('\n').map(x => x.trim());
  const items = (Array.isArray(page.items) ? page.items : []).filter((/** @type {any} */ r) => r?.title_zh || r?.title_en), secs = sectionsOf(page);
  if (items.length) replaceSections(art, groups(items).map(g => `<section class="page-section">${bi('h2', g.zh, g.en, ' class="section-title"')}<ul class="item-list">${g.items.map(r => {
    const href = /^https?:\/\//i.test(r.url || '') ? r.url : '';
    const zh = lines(r.subtitles_zh), en = lines(r.subtitles_en);
    const head = bi('h3', r.title_zh, r.title_en) + Array.from({ length: Math.max(zh.length, en.length) }, (_, i) => bi('p', zh[i], en[i])).join('');
    return href ? `<li><a class="item-row" href="${esc(href)}" target="_blank" rel="noopener">${head}</a></li>` : `<li><div class="item-row">${head}</div></li>`;
  }).join('')}</ul></section>`).join(''), isList);
  if (secs.length) replaceSections(art, secs.map(textSection).join(''), s => !isList(s));
  if (items.length || secs.length) await refresh();
}

// ── 文字頁（關於、捐款）＋列表頁的導言（師資、合作企業） ──
// 導言（後台叫 Hero）每一頁自己一個單例 <slug>_page，跟那一頁的其他內容分開（user 2026-11-25：「後臺我想要每個頁面的hero文字都分開，不要混在一起」；
// 師資、合作企業本來就是，關於、捐款原本導言跟段落在同一個單例）。
// 關於、捐款的段落在單例 <slug>＝子集合（要放輪播圖；輪播下面一段說明、再來是小節，小節也是子集合：要放圖）——捐款 user 2026-11-24「比照 about」，
// 原本是重複列（JSON）＋一整段 rich text；兩邊欄位一樣＝抓的也一樣（規章的條款也是，上面 regulations()）。師資、合作企業只有導言
const TEXT_SECTIONS = 'sections.sort,sections.title_zh,sections.title_en,sections.description_zh,sections.description_en,sections.timeline,sections.subsections.*,'
  + FILE('sections.subsections.images') + ',' + FILE('sections.images') + '&deep[sections][_sort]=sort';
const WITH_SECTIONS = ['about', 'donate'];   // 有段落的頁（集合名＝slug）
/** @param {string} slug */
async function textPage(slug) {
  // 兩個各抓各的：一個抓不到，另一個照換
  const [hero, page] = await Promise.all([single(`${slug}_page`, 'lead_zh,lead_en'), WITH_SECTIONS.includes(slug) ? single(slug, TEXT_SECTIONS) : null]);
  const art = article();
  if (!(hero || page) || !art?.isConnected) return;
  setLead(hero);
  const secs = sectionsOf(page);
  if (secs.length) replaceSections(art, secs.map(textSection).join(''));
  await refresh();
}

// ── 師資詳細頁（?id=）：照片、名字（人名庫）＋副標、下面的清單 ──
// 清單（學歷、經歷…）＝子集合 faculty_sections，後台可以自己加（user 2026-11-24：「跟關於一樣，我們可以自己加 list」）：一個清單＝標題＋entries，照拖曳順序；
// 原本是寫死的六格（education…publications）、標題在介面文字 faculty.cv.*
/** @param {URLSearchParams} params */
async function facultyDetail(params) {
  const id = params.get('id') || '';
  if (!/^\d+$/.test(id)) return;
  let f;
  try { f = await fetchCmsJson(`${CMS_API_BASE}/faculty/${id}?fields=photo.id,photo.width,photo.height,person.name_zh,person.name_en,${FACULTY_LINES},subtitles,sections.sort,sections.title_zh,sections.title_en,sections.entries&deep[sections][_sort]=sort`); }
  catch (e) { console.warn('[faculty] 詳細頁抓不到，維持示意：', e instanceof Error ? e.message : e); return; }
  const art = article(), head = art?.querySelector(':scope > .item-row'), photo = art?.querySelector('.profile-photo');
  // 不是一筆（沒資料、拿到陣列）＝維持示意：原本靠 f.status 順便擋掉，2026-11-24 拿掉上架狀態後空陣列會把整頁清空
  if (!f || typeof f !== 'object' || Array.isArray(f) || !art?.isConnected || !head) return;
  if (photo) photo.innerHTML = f.photo ? `<img ${imgAttrs(f.photo)}>` : '';
  // 名字下面：校內職級 → 校外單位 → 副標，一筆一行（同列表那一列，item-list-cms.js subLines；user 2026-11-25）
  head.innerHTML = bi('h1', f.person?.name_zh, f.person?.name_en) + subLines(f).map(([z, e]) => bi('p', z, e)).join('');
  // 一個清單（標題＋那幾筆）一塊 .subsection＝同關於的小節：清單之間＝.subsections 的 gap xl（同關於的小節）；一筆都沒有的清單不出
  replaceSections(art, `<section class="page-section"><div class="subsections">${(Array.isArray(f.sections) ? f.sections : []).slice().sort(bySort).map((/** @type {any} */ s) => {
    const items = entryList(s?.entries);
    return items && `<div class="subsection">${bi('h3', s.title_zh, s.title_en)}${items}</div>`;
  }).join('')}</div></section>`);
  await refresh();
  const name = art.querySelector('h1')?.textContent;
  if (name) document.title = `${name} - SCAID`;
}

/** 每頁換進來叫一次（main.js initPageModules） @param {string} page @param {URLSearchParams} params */
export function loadPage(page, params) {
  /** @type {Record<string, () => Promise<void>>} */
  const run = {
    index: homeNews, activities: () => newsList(), admission: () => newsList(true, params.get('item') || ''), curriculum, records, regulations,
    about: () => textPage('about'), donate: () => textPage('donate'), faculty: () => textPage('faculty'), partners: () => textPage('partners'),
    'faculty-detail': () => facultyDetail(params),
  };
  return run[page]?.();
}
