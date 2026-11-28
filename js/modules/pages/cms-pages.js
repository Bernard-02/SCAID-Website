/**
 * 各頁內容 ← Directus（user 2026-11-21：全站接後台；集合與欄位見 docs/Directus-後台欄位.md）。
 * 內容只從後台來（user 2026-11-26，照 SCCD：「我們不需要假資料，收不到後臺也不需要render假的」）：各頁 HTML 只放空的容器；
 * 抓不到＝退這個分頁上次抓到的真資料（config/api.js cmsGet），連那份都沒有、或後台還沒填＝那一塊不畫（空的段落 main.js 收掉）。
 * 標記：.item-row 積木、摺疊、相簿、輪播…（CSS 與互動照 page.css、各 ui 模組）。
 * main.js：殼載完叫 loadBarNews()；每頁換進來叫 loadPage(page, params)。
 * 師資／合作企業列表＝item-list-cms.js，聯絡頁＝footer-cms.js，介面文字（選單、頁名、固定小標）＝ui-labels.js。
 * 後台的字一律過 escapeHtml；後台沒有 rich text 了（2026-11-24 捐款、規章的段落也改成同關於的小節＝純文字），不把後台的 HTML 塞進頁面。
 */
import { assetUrl, cmsGet } from '../../config/api.js';
import { escapeHtml as esc } from '../ui/escape-html.js';
import { applyUiLabels } from '../ui/ui-labels.js';
import { applyLang, getLang } from '../ui/lang.js';
import { initSectionNav } from '../ui/section-nav.js';
import { initAlbums } from '../ui/album.js';
import { initSlideshow } from '../ui/slideshow.js';
import { fitBar, youtubeId } from '../ui/chrome.js';
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
/** 首頁 news 的時間（原本入學的；動態 2026-11-25 起照 SCCD＝上面的 datesOf）；後台用選的（user 2026-11-24）：日期［–結束日期］，沒有幾點（user 同一天：動態、入學的開始／結束時間都拿掉，「留下日期即可」）。
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

/** 抓一個集合（沒有上架／草稿，user 2026-11-24：都不需要狀態）；抓不到（也沒有上次的）或一筆都沒有＝null＝呼叫端不畫（容器留空、main.js 收掉）
 * @param {string} collection @param {string} query */
async function list(collection, query) {
  try {
    const data = await cmsGet(`${collection}?${query}`);
    return Array.isArray(data) && data.length ? data : null;
  } catch (e) { console.warn(`[${collection}] 後台抓不到：`, e instanceof Error ? e.message : e); return null; }
}
/** 每頁一個單例（關於、捐款、規章、師資頁、合作企業頁；user 2026-11-22 照 SCCD）；抓不到＝null @param {string} collection @param {string} fields */
async function single(collection, fields) {
  try { return await cmsGet(`${collection}?fields=${fields}`); }
  catch (e) { console.warn(`[${collection}] 後台抓不到：`, e instanceof Error ? e.message : e); return null; }
}
/** 段落有幾段（關於、捐款、規章的條款：子集合，照 sort 的陣列；還沒填＝空的） @param {any} p */
const sectionsOf = (p) => Array.isArray(p?.sections) ? p.sections.filter((/** @type {any} */ s) => s?.title_zh || s?.title_en || s?.description_zh || s?.description_en || s?.subsections?.length || s?.timeline?.length) : [];

/** 後台的圖：alt＝它屬於的那一則／那一段的標題（同 SCCD：後台不另外寫圖的名字；WCAG 1.1.1），中英各記一份、換語言 lang.js 換；沒有標題＝alt 空的
 *  @param {any} f @param {any[]} [t] [中文, 英文] */
const imgAttrs = (f, [zh, en] = []) => {
  const z = String(zh || en || ''), e = String(en || zh || '');
  return `src="${esc(assetUrl(f))}" alt="${esc(getLang() === 'en' ? e : z)}"${z ? ` data-zh-alt="${esc(z)}" data-en-alt="${esc(e)}"` : ''}${f.width && f.height ? ` width="${f.width}" height="${f.height}"` : ''} loading="lazy"`;
};
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
/** 相簿（動態、首頁 news）：寬高照後台檔案＝一打開就排好。影片排在照片前面（同 SCCD：影片 → 圖） @param {any[]} fs @param {any[]} t 那一則的標題 @param {string[]} [videos] */
const album = (fs, t, videos = []) => fs.length || videos.length ? `<div class="album">${videos.map(videoShot).join('')}${
  fs.map(f => `<button type="button"><img ${imgAttrs(f, t)}>${lbl('span', 'common.enlarge', '放大圖片', 'Enlarge image', ' class="sr-only"')}</button>`).join('')}</div>` : '';
/** 打亂（Fisher–Yates，同作品頁 works.js） @template T @param {T[]} a */
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
/** 段落圖片輪播（關於、捐款；小節放多張也是這個）：每次進來順序都打亂（user 2026-11-27：「about的輪播圖片，我想要random這個圖片的順序，不一定照著後臺的」）
 * @param {any[]} fs @param {any[]} t 那一段／小節的標題 @param {string} [c] 多掛的 class（小節裡的間距） */
const slideshow = (fs, t, c = '') => fs.length ? `<div class="slideshow${c ? ` ${c}` : ''}" role="group" aria-label="段落圖片" data-en-label="Section images">${shuffle([...fs]).map(f => `<button type="button" class="slide"><img ${imgAttrs(f, t)}></button>`).join('')}</div>` : '';
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
  const blocks = [], fs = filesOf(it.images), t = [it.title_zh, it.title_en];
  if (fs.length > 1) blocks.push(c => slideshow(fs, t, c));
  else if (fs.length) blocks.push(c => `<img${c ? ` class="${c}"` : ''} ${imgAttrs(fs[0], t)}>`);
  blocks.push(...paras(it.text_zh, it.text_en));
  if (it.note_zh || it.note_en) blocks.push(c => text(it.note_zh, it.note_en, `${c} text-xs`.trim()));
  return `<div class="subsection">${bi('h3', it.title_zh, it.title_en)}${blocks.map((b, i) => b(i ? 'mt-sm' : '')).join('')}</div>`;
};
/** 年份＋說明的條列（師資詳細頁的學歷…、關於的年表；user 2026-11-23：沿革要跟老師的詳細頁一樣）：一筆＝年份一行、說明一行，沒年份＝只有說明；
 *  說明可以多行＝一行一個 p、由上往下（user 2026-11-26：「在sccd有分col的，在這裏就是從上往下排列」——SCCD 一筆是一列分好幾欄：年份｜單位｜角色…；
 *  中英照行的順序對、每一行英文空退中文）。沒說明的那筆不算、一筆都沒有＝'' @param {any} rows @param {string} [attrs] */
const entryList = (rows, attrs = '') => {
  const r = (Array.isArray(rows) ? rows : []).filter((/** @type {any} */ x) => x?.text_zh || x?.text_en);
  const split = (/** @type {any} */ s) => String(s || '').split('\n').map(x => x.trim());
  return r.length ? `<ul${attrs}>${r.map(x => {
    const z = split(x.text_zh), e = split(x.text_en), lines = Array.from({ length: Math.max(z.length, e.length) }, (_, i) => bi('p', z[i], e[i])).filter(Boolean);
    return x.year || lines.length > 1 ? `<li>${x.year ? `<p>${esc(x.year)}</p>` : ''}${lines.join('')}</li>` : bi('li', x.text_zh, x.text_en);
  }).join('')}</ul>` : '';
};
/** 一段（關於、捐款、規章的條款）＝標題 → 輪播 → 說明 → 小節 → 年表：說明＝段落圖片下面那段、小節＝子集合（照 sort）、年表＝沿革那種年份＋說明（都 user 2026-11-23）。
 *  捐款、規章原本的內文是一段 rich text，2026-11-24 都改成這個（user：「使用條款就是跟 about 的一樣」） @param {any} s */
const textSection = (s) => {
  const subs = (Array.isArray(s.subsections) ? s.subsections : []).slice().sort(bySort).map(subsection).join('');
  return `<section class="page-section">${bi('h2', s.title_zh, s.title_en, ' class="section-title"')}${slideshow(filesOf(s.images), [s.title_zh, s.title_en])}${
    paras(s.description_zh, s.description_en).map((b, i) => b(i ? 'mt-sm' : 'mt-md')).join('')}${
    subs && `<div class="subsections">${subs}</div>`}${entryList(s.timeline, ' class="timeline mt-xl"')}</section>`;
};
/** 依分類分段（規章）：照第一次出現的順序 @param {any[]} rows */
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
/** 導言（.page-lead） @param {any} p */
function setLead(p) {
  const el = /** @type {HTMLElement | null} */ (document.querySelector('#page-content .page-lead'));
  if (!el || !(p?.lead_zh || p?.lead_en)) return;
  el.dataset.zh = p.lead_zh || p.lead_en;
  el.dataset.en = p.lead_en || p.lead_zh;
}

// ── 動態（activities；user 2026-11-24 跟 news 拆開）。首頁那串與底列跑馬燈是 news（下面；入學 2026-11-27 併進去） ──
// 欄位用 *（這個集合現在有的都拿）＋相簿、附件那幾層，不一個一個點名：後台刪掉不要的欄位（user 2026-11-24 刪了動態的開始／結束時間）前台照樣讀得到——
// 點名一個已經不存在的欄位，Directus 整串回 403＝那一塊不畫。沒有的欄位這裡本來就當空的（timeOf、bi）
// 國名（瀏覽器內建，照 ISO 兩碼）：動態的參與者。代碼不對＝''
const REGION = { zh: new Intl.DisplayNames(['zh-Hant'], { type: 'region' }), en: new Intl.DisplayNames(['en'], { type: 'region' }) };
/** @param {unknown} code @param {'zh' | 'en'} lang */
const countryName = (code, lang) => { try { return code ? REGION[lang].of(String(code).toUpperCase()) || '' : ''; } catch { return ''; } };
/** 動態的參與者（人名庫／單位庫的一筆）→ [中, 英]：有國家＝名字後面接（國家）——中文全形「名字（國家）」、英文半形「name (Country)」（user 2026-11-26：
 *  「這個list的内容是從人名跟單位，他們的國家也是以（）跟在名字後面」）；英文空退中文；沒選國家＝只有名字；沒有名字＝['', '']。
 *  只有這裡接國家：師資、合作企業、榮譽的主辦方照後台的名字（同一天：「這裏應該是不會有國家，幫我刪掉，都要以後臺爲主」） @param {any} o @returns {[string, string]} */
const named = (o) => {
  const z = o?.name_zh || o?.name_en || '', e = o?.name_en || o?.name_zh || '', cz = countryName(o?.country, 'zh'), ce = countryName(o?.country, 'en');
  return [z && cz ? `${z}（${cz}）` : z, e && ce ? `${e} (${ce})` : e];
};
// 參與者／參與單位（M2A：人名庫或單位庫）要一層一層點名（* 只給 junction 的 id）：每個庫的名字＋國家
const WHO = ['people', 'organizations'].flatMap(c => ['name_zh', 'name_en', 'country'].map(f => `participants.item:${c}.${f}`)).join(',');
// 縮圖帶寬高（手機的縮圖框照圖的比例、載入前就要知道，page.css；user 2026-11-27）
const IMAGE = 'image.id,image.width,image.height';
/** 清單列的縮圖（動態、首頁 news）；沒圖＝空的框＝直條跑馬燈的佔位（page.css） @param {any} f @param {any[]} t 那一則的標題 */
const thumb = (f, t) => `<div class="item-thumb">${assetUrl(f) ? `<img ${imgAttrs(f, t)}>` : ''}</div>`;
const FIELDS = `*,${IMAGE},${FILE('album')},participants.sort,participants.collection,${WHO},organizer.name_zh,organizer.name_en,media.name_zh,media.name_en`;
// 動態的類別（user 2026-11-26：「副標是改成dropdown，決定它的類別」）＝SCCD 動態的八類；字在介面文字 activities.type.<值>（這裡是後台抓不到時的原文）
const ACTIVITY_TYPES = { exhibitions: ['展演', 'Exhibitions'], workshops: ['工作營', 'Workshops'], lectures: ['講座', 'Lectures'], visits: ['參訪', 'Visits'],
  competitions: ['競賽', 'Competitions'], forums: ['論壇', 'Forums'], students: ['學生自主', 'Students Present'], industry: ['產學合作', 'Industry Partnerships'],
  award: ['榮譽', 'Award'], press: ['報導', 'Press'] };   // 紀錄頁併進來（user 2026-11-27）
/** 一個地點：城市（手打）有填＝接在後面的括號裡——中文「地點（城市）」全形、英文「place (city)」半形（user 2026-11-25：「渲染就是跟在地點後面，
 *  （）半型全型再根據語言調整」「城市的是手動key的文字」「動態不需要國家」）。英文空退中文 @param {any} x */
const place = (x) => {
  const cz = x?.city_zh || x?.city_en || '', ce = x?.city_en || x?.city_zh || '';
  const nz = x?.name_zh || x?.name_en || '', ne = x?.name_en || x?.name_zh || '';
  return bi('p', nz && cz ? `${nz}（${cz}）` : nz || cz, ne && ce ? `${ne} (${ce})` : ne || ce);
};
/** 動態頁那一列（後台照 SCCD 的活動，user 2026-11-24）：縮圖＋標題＋類別（下拉，user 2026-11-26；原本副標重複列、再原本一格手打的「分類」）；
 *  展開＝時間、地點（可以好幾個、一個一行；原本一格 place_*）、參與者／參與單位（一筆一行）→ 相簿（影片在前）。
 *  參與者／參與單位（user 2026-11-26：「在相簿上可以增加一個section是無限加list，這個list的内容是從人名跟單位」；後台的欄位叫「參與者／參與單位」）：
 *  照拖曳順序、名字有國家＝（國家）（named）；不出標題、接在地點下面往下排（同一天：「不需要渲染title，往下排列即可」——先做過標題＋清單一塊，同師資詳細頁的清單）。
 *  紀錄（榮譽、報導）2026-11-27 併進來（user：「我想要將紀錄放進動態裏面，都比照動態的list進行渲染。然後後臺設定如果沒有填寫的slot就預設不渲染」）＝類別 award／press：
 *  報導＝標題是媒體的名字（從媒體庫選；同原本的紀錄頁），榮譽＝主辦方（單位庫，照後台的名字、不接國家）排在參與者後面，內容（得獎人、獎別、報導標題…）一筆一行排最後。
 *  國旗不出（同一天：「獎項也不需要有國旗，我們會給一個placeholder」；縮圖＝榮譽沒圖放灰底佔位框，同一天：「這個榮譽應該要加上一個placeholder的位置，不是直接沒有渲染」）；每一格沒填＝那一行不出 @param {any} n */
const newsRow = (n) => {
  const type = ACTIVITY_TYPES[/** @type {keyof typeof ACTIVITY_TYPES} */ (n.category)], media = n.media?.name_zh || n.media?.name_en;
  const t = media ? [n.media.name_zh, n.media.name_en] : [n.title_zh, n.title_en], title = bi('h3', t[0], t[1]);
  // 沒圖＝空的縮圖框＝直條跑馬燈的佔位（page.css）：原本只有榮譽放（user 2026-11-27：「這個榮譽應該要加上一個placeholder的位置」），
  // 同一天每一類都放（user：「動態也要有，目前工作營的那個沒有」）
  const head = `${thumb(n.image, t)}<div>${title}${type ? lbl('p', `activities.type.${n.category}`, type[0], type[1]) : ''}</div>`;
  const meta = datesOf(n) + (Array.isArray(n.locations) ? n.locations : []).map(place).join('')
    + (Array.isArray(n.participants) ? n.participants : []).slice().sort(bySort).map((/** @type {any} */ p) => bi('p', ...named(p?.item))).join('')
    + bi('p', n.organizer?.name_zh, n.organizer?.name_en)
    + (Array.isArray(n.details) ? n.details : []).map((/** @type {any} */ x) => bi('p', x?.text_zh, x?.text_en)).join('');
  return fold(head, (meta ? `<div class="fold-meta">${meta}</div>` : '') + album(filesOf(n.album), t, videosOf(n.videos)));
};
/** 動態頁的清單 */
async function newsList() {
  // 抓之前先記住這一頁的清單：後台慢、抓完已經換到別頁（同樣有 .item-list）＝不畫到那一頁去
  const ul = document.querySelector('#page-content .page-section .item-list');
  if (!ul) return;
  // 日期是重複列（dates，照 SCCD）＝後台排不了 → 這裡排（dateKey）
  const rows = await list('activities', `limit=-1&fields=${FIELDS}`);
  if (!rows || !ul.isConnected) return;
  rows.sort((a, b) => (dateKey(b) - dateKey(a)) || 0);   // || 0：兩個都沒日期（-Infinity − -Infinity＝NaN）
  ul.innerHTML = rows.map(newsRow).join('');
  await refresh();
}

// ── 首頁那串＋底列跑馬燈＝首頁的 news（user 2026-11-24：「news 是 news」；原本叫 home_news）。
// 日期新到舊（user 2026-11-27：「排列順序是倒敘排列，最新會在最上面」；原本照拖曳順序）：同一天＝後建的在上面。兩支同一個排法＝底列第 i 則＝清單第 i 則（chrome.js openNewsAt） ──
const NEWEST = 'sort=-date,-id';
/** 首頁那串的一則＝原本入學頁那一列（user 2026-11-27：「我想要將入學跟news頁面結合，入學頁面可以刪掉，然後news就是入學頁面…可以打開，是個accordion」）：
 *  外面＝縮圖（沒圖＝直條跑馬燈的佔位框，2026-11-27）＋標題＋日期；點開＝說明 → 相簿 → 連結 → 附件，都有才出；點開的東西都沒有＝不能點的一列（fold）。
 *  原本整則是連結（入學頁的那一則／外部網址），後台那兩格同一天刪了 @param {any} n */
const homeRow = (n) => {
  // 附件點了＝下載、不開新頁（user 2026-11-25：「點擊admission的檔案應該是下載，不是開新的page」）：檔在後台的網域＝跨網域，a 的 download 屬性瀏覽器不理，
  // 要 Directus 自己回 attachment（assets 網址加 ?download）；download 屬性留著＝同網域時也是下載
  const files = filesOf(n.attachments);
  const downloads = files.length ? `<ul class="link-list">${files.map(f => `<li><a class="nav-link" href="${esc(`${assetUrl(f)}?download`)}" download>${esc(f.title || f.filename_download || '')}</a></li>`).join('')}</ul>` : '';
  // 連結（user 2026-11-28：「news需要加一類叫連結，style和附件一樣…前台順序排在附件和相簿之間」）：後台重複列 links（標題中英＋網址，只收 http(s)），另開新視窗；
  // 樣子＝附件那一套，只有 icon 換成 link（page.css .link-list.is-links）
  const urls = (Array.isArray(n.links) ? n.links : []).filter((/** @type {any} */ l) => /^https?:\/\//i.test(String(l?.url || '').trim()) && (l.title_zh || l.title_en));
  const links = urls.length ? `<ul class="link-list is-links">${urls.map((/** @type {any} */ l) => `<li>${bi('a', l.title_zh, l.title_en, ` class="nav-link" href="${esc(String(l.url).trim())}" target="_blank" rel="noopener"`)}</li>`).join('')}</ul>` : '';
  // 沒圖＝放空的縮圖框＝直條跑馬燈的佔位（page.css；user 2026-11-27：「我發現news的圖片沒有」；原本 11-24 定的是沒圖不放框）
  const t = [n.title_zh, n.title_en], head = `${thumb(n.image, t)}<div>${bi('h3', t[0], t[1])}${timeOf(n)}</div>`;
  return fold(head, text(n.summary_zh, n.summary_en) + album(filesOf(n.album), t) + links + downloads);
};
async function homeNews() {
  // 全部（底列的跑馬燈只跑最新的 8 則）。抓之前先記住這一頁的清單（同 newsList）：抓完已經換到別頁又回首頁＝不畫到新的那份去
  const ul = document.querySelector('#page-content .home-news-list ul');
  if (!ul) return;
  const rows = await list('news', `${NEWEST}&limit=-1&fields=*,${IMAGE},${FILE('album')},${FILE('attachments')}`);
  if (!rows || !ul.isConnected) return;
  ul.innerHTML = rows.map(homeRow).join('');
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
  const rows = await list('news', `${NEWEST}&limit=8&fields=title_zh,title_en`);
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

// ── 文字頁（關於、捐款）＋其他頁的導言（師資、合作企業、課程、動態、規章；loadPage 看 HTML 有沒有放 .page-lead） ──
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

// ── 師資詳細頁（?id=）：照片、名字（人名庫）＋校內職級／校外單位、聯絡（行政管理）、下面的清單 ──
// 結構同 SCCD（user 2026-11-26：「除了sccd的placeholder圖片以外，剩下的結構要一樣，但是學歷那些保持目前的做法，不是寫死的」）：
// 清單（學歷、經歷、榮譽…）＝子集合 faculty_sections，後台可以自己加（user 2026-11-24：「跟關於一樣，我們可以自己加 list」）：一個清單＝標題＋entries，照拖曳順序；
// 原本是寫死的六格（education…publications）、標題在介面文字 faculty.cv.*。
// 聯絡＝SCCD 行政管理的那一格（contact，純文字、一行一行）：排在清單前面、標題＝介面文字 faculty.contact；整行是 Email／網址＝可以點
/** 聯絡的一行：Email＝mailto、http(s)＝另開新視窗，其他＝純文字 @param {string} line */
const contactLine = (line) => {
  const href = /^[^\s@:/]+@[^\s@:/]+\.[^\s@:/]+$/.test(line) ? `mailto:${line}` : /^https?:\/\//i.test(line) ? line : '';
  return href ? `<li><a href="${esc(href)}"${href.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}>${esc(line)}</a></li>` : `<li>${esc(line)}</li>`;
};
/** @param {URLSearchParams} params */
async function facultyDetail(params) {
  const id = params.get('id') || '';
  if (!/^\d+$/.test(id)) return;
  let f;
  try { f = await cmsGet(`faculty/${id}?fields=photo.id,photo.width,photo.height,person.name_zh,person.name_en,${FACULTY_LINES},contact,sections.sort,sections.title_zh,sections.title_en,sections.entries&deep[sections][_sort]=sort`); }
  catch (e) { console.warn('[faculty] 詳細頁抓不到：', e instanceof Error ? e.message : e); return; }
  const art = article(), head = art?.querySelector(':scope > .item-row');
  // 不是一筆（沒資料、拿到陣列）＝不畫：原本靠 f.status 順便擋掉，2026-11-24 拿掉上架狀態後空陣列會把整頁清空
  if (!f || typeof f !== 'object' || Array.isArray(f) || !art?.isConnected || !head) return;
  // 照片框（沒照片＝灰底）有這位老師才放：HTML 不先放，抓不到的時候不留一個空的佔位
  const photo = art.querySelector('.profile-photo') || (head.insertAdjacentHTML('beforebegin', '<div class="profile-photo"></div>'), art.querySelector('.profile-photo'));
  if (photo) photo.innerHTML = f.photo ? `<img ${imgAttrs(f.photo)}>` : '';
  // 名字下面：校內職級 → 校外單位，一筆一行（同列表那一列，item-list-cms.js subLines；user 2026-11-25；副標 2026-11-26 拿掉＝同 SCCD）
  head.innerHTML = bi('h1', f.person?.name_zh, f.person?.name_en) + subLines(f).map(([z, e]) => bi('p', z, e)).join('');
  // 一個清單（標題＋那幾筆）一塊 .subsection＝同關於的小節：清單之間＝.subsections 的 gap xl（同關於的小節）；一筆都沒有的清單不出
  const contact = String(f.contact || '').split('\n').map(x => x.trim()).filter(Boolean);
  replaceSections(art, `<section class="page-section"><div class="subsections">${contact.length ? `<div class="subsection">${lbl('h3', 'faculty.contact', '聯絡', 'Contact')}<ul>${contact.map(contactLine).join('')}</ul></div>` : ''}${(Array.isArray(f.sections) ? f.sections : []).slice().sort(bySort).map((/** @type {any} */ s) => {
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
    index: homeNews, activities: newsList, curriculum, regulations,
    'faculty-detail': () => facultyDetail(params),
  };
  // HTML 放了導言（.page-lead）的頁＝導言從後台 <slug>_page 來（user 2026-11-27：作品、news、聯絡以外都要有 Hero）；關於、捐款順便抓段落
  const hero = document.querySelector('#page-content .page-lead') ? textPage(page) : null;
  return Promise.all([run[page]?.(), hero]).then(() => {});
}
