/**
 * 各頁內容 ← Directus（user 2026-11-21：全站接後台；集合與欄位見 docs/Directus-後台欄位.md）。
 * 每頁 HTML 裡的是示意內容：後台抓不到、或那個集合還沒有任何一筆＝照舊顯示；抓到＝換成後台的。
 * 換上去的標記照抄各頁 HTML 那份（.item-row 積木、摺疊、相簿、輪播…），CSS 與互動不用另外寫。
 * main.js：殼載完叫 loadBarNews()；每頁換進來叫 loadPage(page, params)。
 * 師資／合作企業列表＝item-list-cms.js，聯絡頁＝footer-cms.js，介面文字（選單、頁名、固定小標）＝ui-labels.js。
 * 後台的字一律過 escapeHtml；段落內文（WYSIWYG）過 sanitize，只留 p／h3／清單／粗體斜體／連結。
 */
import { CMS_API_BASE, assetUrl, fetchCmsJson } from '../../config/api.js';
import { escapeHtml as esc } from '../ui/escape-html.js';
import { applyUiLabels } from '../ui/ui-labels.js';
import { applyLang } from '../ui/lang.js';
import { initSectionNav } from '../ui/section-nav.js';
import { initAlbums } from '../ui/album.js';
import { initSlideshow } from '../ui/slideshow.js';
import { fitBar } from '../ui/chrome.js';
import { sitePath } from '../ui/site-base.js';

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
const ymd = (/** @type {string} */ d) => (d || '').slice(0, 10).replace(/-/g, '.');
/** 時間：有填顯示文字就用，沒有用日期 @param {any} n */
const timeOf = (n) => n.time_zh || n.time_en ? bi('p', n.time_zh, n.time_en) : n.date ? `<p>${ymd(n.date)}</p>` : '';
const article = () => document.querySelector('#page-content .page-body');
/** 摺疊一列：展開內容空的＝不能點的 div 列 @param {string} head @param {string} body @param {string} [cls] */
const fold = (head, body, cls = '') => body
  ? `<li><details${cls ? ` class="${cls}"` : ''}><summary class="item-row">${head}</summary><div class="fold-body">${body}</div></details></li>`
  : `<li><div class="item-row">${head}</div></li>`;

/** 抓一個集合；抓不到或一筆都沒有＝null（呼叫端就留 HTML 的示意） @param {string} collection @param {string} query */
async function list(collection, query) {
  try {
    const data = await fetchCmsJson(`${CMS_API_BASE}/${collection}?filter[status][_eq]=published&${query}`);
    // ponytail: 一筆都沒有＝後台還沒開始填，留示意；之後真的要整頁清空再改
    return Array.isArray(data) && data.length ? data : null;
  } catch (e) { console.warn(`[${collection}] 後台抓不到，維持示意：`, e instanceof Error ? e.message : e); return null; }
}
/** 每頁一個單例（關於、捐款、規章、師資頁、合作企業頁；user 2026-11-22 照 SCCD）；抓不到＝null @param {string} collection @param {string} fields */
async function single(collection, fields) {
  try { return await fetchCmsJson(`${CMS_API_BASE}/${collection}?fields=${fields}`); }
  catch (e) { console.warn(`[${collection}] 後台抓不到，維持示意：`, e instanceof Error ? e.message : e); return null; }
}
/** 段落有幾段（關於＝子集合、其他＝重複列，都是陣列；還沒填＝null） @param {any} p */
const sectionsOf = (p) => Array.isArray(p?.sections) ? p.sections.filter((/** @type {any} */ s) => s?.title_zh || s?.title_en || s?.body_zh || s?.body_en || s?.description_zh || s?.description_en || s?.subsections?.length || s?.timeline?.length) : [];

/** 段落內文（WYSIWYG）只留這幾種標籤；其他拆掉留字。連結只放行 http(s)／mailto／tel，外連另開新視窗。
 *  class 只留間距／附註那幾個（示意內容從 HTML 搬過去時帶著；後台編輯器不會自己加） */
const RICH = new Set(['P', 'H3', 'UL', 'OL', 'LI', 'STRONG', 'B', 'EM', 'I', 'A', 'BR']);
const RICH_CLASS = new Set(['mt-sm', 'mt-md', 'text-xs']);
/** @param {string} html */
function sanitize(html) {
  if (!html) return '';
  const root = /** @type {HTMLElement} */ (new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html').body.firstElementChild);
  const walk = (/** @type {Element} */ el) => [...el.children].forEach(c => {
    walk(c);
    if (!RICH.has(c.tagName)) { c.replaceWith(...c.childNodes); return; }
    const href = c.getAttribute('href') || '', cls = [...c.classList].filter(k => RICH_CLASS.has(k)).join(' ');
    [...c.attributes].forEach(a => c.removeAttribute(a.name));
    if (cls) c.setAttribute('class', cls);
    if (c.tagName === 'A' && /^(https?:|mailto:|tel:)/i.test(href)) {
      c.setAttribute('href', href);
      if (/^https?:/i.test(href)) { c.setAttribute('target', '_blank'); c.setAttribute('rel', 'noopener'); }
    }
  });
  walk(root);
  return root.innerHTML.trim();
}
/** 段落內文：中英各一份 HTML（不能用 data-en 切）→ 包兩層、跟著 <html lang> 只顯示一份（page.css [data-lang-block]）；英文空＝都顯示中文 */
const rich = (/** @type {string} */ zh, /** @type {string} */ en) => {
  const z = sanitize(zh), e = sanitize(en);
  if (!z || !e || z === e) return z || e ? `<div class="cms-rich">${z || e}</div>` : '';
  return `<div class="cms-rich" data-lang-block="zh">${z}</div><div class="cms-rich" data-lang-block="en">${e}</div>`;
};
const imgAttrs = (/** @type {any} */ f) => `src="${esc(assetUrl(f))}" alt=""${f.width && f.height ? ` width="${f.width}" height="${f.height}"` : ''} loading="lazy"`;
/** 相簿（動態、入學）：寬高照後台檔案＝一打開就排好、chevron 當下決定 @param {any[]} fs */
const album = (fs) => fs.length ? `<div class="album">${fs.map(f => `<button type="button"><img ${imgAttrs(f)}>${lbl('span', 'common.enlarge', '放大圖片', 'Enlarge image', ' class="sr-only"')}</button>`).join('')}</div>` : '';
/** 段落圖片輪播（關於） @param {any[]} fs */
const slideshow = (fs) => fs.length ? `<div class="slideshow" aria-label="段落圖片">${fs.map(f => `<button type="button" class="slide"><img ${imgAttrs(f)}></button>`).join('')}</div>` : '';
/** 多行純文字 → 一段一個 p（換行照留、空一行＝分段；中英照段的順序對），回傳每段的產生器、class 由呼叫端給 @param {any} zh @param {any} en */
const paras = (zh, en) => {
  const split = (/** @type {any} */ s) => String(s || '').trim().split(/\n\s*\n/), z = split(zh), e = split(en);
  /** @type {((c: string) => string)[]} */
  const out = [];
  for (let i = 0; i < Math.max(z.length, e.length); i++) if (z[i] || e[i]) out.push(c => text(z[i], e[i], c));
  return out;
};
/** 關於的一個小節（user 2026-11-23：不用 rich text，一個小節一筆、可以一直加；同一天加圖片、附註）：標題 → 圖 → 內文 → 附註，有才排。
 *  塊與塊之間隔 sm（同分段）；沒標題＝第一塊自己隔 md（同 h3 的上距）；圖的最高 page.css @param {any} it */
const subsection = (it) => {
  /** @type {((c: string) => string)[]} */
  const blocks = [];
  if (it.image?.id) blocks.push(c => `<img${c ? ` class="${c}"` : ''} ${imgAttrs(it.image)}>`);
  blocks.push(...paras(it.text_zh, it.text_en));
  if (it.note_zh || it.note_en) blocks.push(c => text(it.note_zh, it.note_en, `${c} text-xs`.trim()));
  const top = it.title_zh || it.title_en ? '' : 'mt-md';
  return bi('h3', it.title_zh, it.title_en) + blocks.map((b, i) => b(i ? 'mt-sm' : top)).join('');
};
/** 年份＋說明的條列（師資詳細頁的學歷…、關於的年表；user 2026-11-23：沿革要跟老師的詳細頁一樣）：一筆＝年份一行、說明一行，沒年份＝只有說明；
 *  沒說明的那筆不算、一筆都沒有＝'' @param {any} rows @param {string} [attrs] */
const entryList = (rows, attrs = '') => {
  const r = (Array.isArray(rows) ? rows : []).filter((/** @type {any} */ x) => x?.text_zh || x?.text_en);
  return r.length ? `<ul${attrs}>${r.map(x => x.year ? `<li><p>${esc(x.year)}</p>${bi('p', x.text_zh, x.text_en)}</li>` : bi('li', x.text_zh, x.text_en)).join('')}</ul>` : '';
};
/** 一段（文字頁）＝標題 → 輪播 → 說明 → 內文 → 年表。關於：說明＝段落圖片下面那段、內文＝小節（子集合，照 sort）、年表＝沿革那種年份＋說明（都 user 2026-11-23）；
 *  捐款、規章的內文是一段 rich text @param {any} s */
const textSection = (s) => `<section class="page-section">${bi('h2', s.title_zh, s.title_en, ' class="section-title"')}${slideshow(filesOf(s.images))}${
  paras(s.description_zh, s.description_en).map((b, i) => b(i ? 'mt-sm' : 'mt-md')).join('')}${
  Array.isArray(s.subsections) ? s.subsections.slice().sort(bySort).map(subsection).join('') : rich(s.body_zh, s.body_en)}${entryList(s.timeline, ' class="timeline mt-md"')}</section>`;
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

// ── 動態（news）：動態頁、入學頁（勾了 admission 的）。首頁那串與底列跑馬燈是另一個集合 home_news（user 2026-11-23 拆開，下面） ──
const NEWS = `id,date,title_zh,title_en,summary_zh,summary_en,category_zh,category_en,time_zh,time_en,place_zh,place_en,image,${FILE('album')},${FILE('attachments')}`;
/** 動態頁那一列：縮圖＋標題＋分類；展開＝時間、地點、相簿 @param {any} n */
const newsRow = (n) => {
  const head = `<div class="item-thumb">${n.image ? `<img src="${esc(assetUrl(n.image))}" alt="" loading="lazy">` : ''}</div><div>${bi('h3', n.title_zh, n.title_en)}${bi('p', n.category_zh, n.category_en)}</div>`;
  const meta = timeOf(n) + bi('p', n.place_zh, n.place_en);
  return fold(head, (meta ? `<div class="fold-meta">${meta}</div>` : '') + album(filesOf(n.album)));
};
/** 入學頁那一列：標題＋時間（沒縮圖、沒分類）；展開＝說明 → 相簿 → 附件 @param {any} n */
const admissionRow = (n) => {
  const files = filesOf(n.attachments);
  const links = files.length ? `<ul class="link-list">${files.map(f => `<li><a class="nav-link" href="${esc(assetUrl(f))}" target="_blank" rel="noopener">${esc(f.title || f.filename_download || '')}</a></li>`).join('')}</ul>` : '';
  return fold(bi('h3', n.title_zh, n.title_en) + timeOf(n), text(n.summary_zh, n.summary_en) + album(filesOf(n.album)) + links);
};
/** 動態頁／入學頁的清單。item＝首頁連過來的那一則（入學頁 ?item=<id>，user 2026-11-23 照 SCCD）：打開、捲到 h1 那條線（同段落導覽的對齊） @param {boolean} [admission] @param {string} [item] */
async function newsList(admission = false, item = '') {
  // 抓之前先記住這一頁的清單：後台慢、抓完已經換到動態／入學另一頁（同樣有 .item-list）＝不畫到那一頁去
  const ul = document.querySelector('#page-content .page-section .item-list');
  if (!ul) return;
  const rows = await list('news', `sort=-date&limit=-1${admission ? '&filter[admission][_eq]=true' : ''}&fields=${NEWS}`);
  if (!rows || !ul.isConnected) return;
  ul.innerHTML = rows.map(admission ? admissionRow : newsRow).join('');
  await refresh();
  if (!item || !ul.isConnected) return;   // 等介面文字的時候換頁了，同上
  const li = ul.children[rows.findIndex(n => String(n.id) === item)], h1 = document.querySelector('#page-content h1');
  if (!li) return;
  const d = li.querySelector('details');
  if (d) d.open = true;
  if (h1) window.scrollTo({ top: li.getBoundingClientRect().top - h1.getBoundingClientRect().top, behavior: 'instant' });   // 兩個都是畫面座標＝相減跟目前捲到哪無關（同 section-nav 的 target）
  li.querySelector('summary')?.focus({ preventScroll: true });   // 鍵盤從這一則接著走（同網址的 #錨點）；不然第一下 Tab 從頁首開始、把它捲走
}

// ── 首頁那串＋底列跑馬燈＝首頁動態 home_news（user 2026-11-23 跟動態頁拆開）：照拖曳順序前 8 則 ──
/** 點了去哪（照 SCCD 的首頁 news）→ <a> 的屬性：入學頁的某一則（?item=，到了打開那一則）優先——那則要上架、還勾著「入學」，不然入學頁沒有它＝當作沒選；
 *  再來外部網址（只放 http(s)、另開新視窗）；都沒有＝''（不能點） @param {any} n */
const homeLink = (n) => {
  const a = n.admission_item;
  if (a?.id && a.status === 'published' && a.admission) return `href="${esc(sitePath(`pages/admission.html?item=${encodeURIComponent(a.id)}`))}"`;
  return /^https?:\/\//i.test(n.url || '') ? `href="${esc(n.url)}" target="_blank" rel="noopener"` : '';
};
async function homeNews() {
  const rows = await list('home_news', 'sort=sort&limit=8&fields=title_zh,title_en,summary_zh,summary_en,image,url,admission_item.id,admission_item.status,admission_item.admission');
  const ul = document.querySelector('#page-content .home-news-list ul');
  if (!rows || !ul?.isConnected) return;
  ul.innerHTML = rows.map(n => {
    const body = (n.summary_zh || n.summary_en
      ? `<p class="text-md">${bi('span', n.title_zh, n.title_en, ' class="block"')}${bi('span', n.summary_zh, n.summary_en, ' class="block"')}</p>`
      : bi('p', n.title_zh, n.title_en, ' class="text-md"')) + `<div class="home-news-box">${n.image ? `<img src="${esc(assetUrl(n.image))}" alt="" loading="lazy">` : ''}</div>`;
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
/** 底列動態跑馬燈（殼裡、每頁都在）：最近幾則的標題；換完內容拿掉接力那份、fitBar 重做 */
export async function loadBarNews() {
  const rows = await list('home_news', 'sort=sort&limit=8&fields=title_zh,title_en');
  const copy = document.querySelector('.site-bar .bar-news-copy');
  if (!rows || !copy) return;
  copy.innerHTML = rows.map(n => bi('span', n.title_zh, n.title_en)).join('');
  copy.parentElement?.querySelector('[data-dup]')?.remove();
  applyLang(copy);
  fitBar();
}

// ── 課程：一年級～四年級各一段（介面文字），同年級必修在前、選修在後；一門課一個摺疊、點開＝說明 ──
const YEARS = [['一年級', 'Year 1'], ['二年級', 'Year 2'], ['三年級', 'Year 3'], ['四年級', 'Year 4']];
async function curriculum() {
  const rows = await list('courses', 'sort=sort&limit=-1&fields=year,sort,required,name_zh,name_en,description_zh,description_en');
  const art = article();
  if (!rows || !art?.isConnected) return;
  replaceSections(art, [1, 2, 3, 4].map(y => {
    const cs = rows.filter(c => c.year === y).sort((a, b) => (Number(!!b.required) - Number(!!a.required)) || bySort(a, b));
    if (!cs.length) return '';
    const [yz, ye] = YEARS[y - 1];
    return `<section class="page-section">${lbl('h2', `curriculum.year.${y}`, yz, ye, ' class="section-title"')}<ul class="item-list">${cs.map(c => fold(
      bi('h3', c.name_zh, c.name_en) + (c.required ? lbl('p', 'curriculum.required', '必修', 'Required') : lbl('p', 'curriculum.elective', '選修', 'Elective')),
      text(c.description_zh, c.description_en))).join('')}</ul></section>`;
  }).join(''));
  await refresh();
}

// ── 常見問題：依分類分段，一題一個摺疊 ──
async function qa() {
  const rows = await list('qa', 'sort=sort&limit=-1&fields=sort,category_zh,category_en,question_zh,question_en,answer_zh,answer_en');
  const art = article();
  if (!rows || !art?.isConnected) return;
  replaceSections(art, groups(rows).map(g => `<section class="page-section">${bi('h2', g.zh, g.en, ' class="section-title"')}${g.items.map(q =>
    `<details class="mt-md">${bi('summary', q.question_zh, q.question_en)}${text(q.answer_zh, q.answer_en, 'mt-sm')}</details>`).join('')}</section>`).join(''));
  await refresh();
}

// ── 榮譽：一筆一個摺疊；收著＝國旗＋獎項＋得獎人，點開＝主辦方（單位庫）、獎別 ──
async function records() {
  const rows = await list('records', 'sort=sort&limit=-1&fields=country_code,country_zh,country_en,award_zh,award_en,winner_zh,winner_en,organizer.name_zh,organizer.name_en,prize_zh,prize_en');
  const ul = document.querySelector('#page-content .page-section .item-list');
  if (!rows || !ul?.isConnected) return;
  ul.innerHTML = rows.map(r => {
    const code = /^[a-z]{2}$/.test(r.country_code || '') ? r.country_code : '';
    const flag = code ? `<img class="item-thumb" src="https://cdn.jsdelivr.net/npm/flag-icons@7.5.0/flags/4x3/${code}.svg" alt="" loading="lazy">` : '';
    const head = `${flag}<div>${bi('span', r.country_zh, r.country_en, ' class="sr-only"')}${bi('h3', r.award_zh, r.award_en)}${bi('p', r.winner_zh, r.winner_en)}</div>`;
    const meta = bi('p', r.organizer?.name_zh, r.organizer?.name_en) + bi('p', r.prize_zh, r.prize_en);
    // 國旗的大小掛在 details.record 上（page.css）→ 點開沒東西也照樣是摺疊
    return `<li><details class="record"><summary class="item-row">${head}</summary><div class="fold-body">${meta ? `<div class="fold-meta">${meta}</div>` : ''}</div></details></li>`;
  }).join('');
  await refresh();
}

// ── 報導：一則一列（標題＋媒體庫的媒體），點了放大看截圖；沒截圖＝不能點 ──
async function press() {
  const rows = await list('press', 'sort=-date&limit=-1&fields=title_zh,title_en,media.name_zh,media.name_en,screenshot');
  const ul = document.querySelector('#page-content .page-section .item-list');
  if (!rows || !ul?.isConnected) return;
  ul.innerHTML = rows.map(p => {
    const head = bi('h3', p.title_zh, p.title_en) + bi('p', p.media?.name_zh, p.media?.name_en);
    return p.screenshot ? `<li><a class="item-row" data-zoom href="${esc(assetUrl(p.screenshot))}">${head}</a></li>` : `<li><div class="item-row">${head}</div></li>`;
  }).join('');
  await refresh();
}

// ── 規章與政策（單例 regulations）：規章、表單（重複列 items）依分類分段、整列外連（只放 http(s)，沒有＝不能點；副標一行一個）＋文字段落（使用條款、隱私權政策） ──
async function regulations() {
  const page = await single('regulations', 'items,sections');
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

// ── 文字頁（關於、捐款）＋列表頁的導言（師資、合作企業）：每頁一個單例 ──
// 關於的段落是子集合（要放輪播圖；輪播下面一段說明、再來是小節，小節也是子集合：要放圖）、捐款的段落是重複列（JSON）；師資、合作企業只有導言
const ABOUT_SECTIONS = 'sections.sort,sections.title_zh,sections.title_en,sections.description_zh,sections.description_en,sections.timeline,sections.subsections.*,sections.subsections.image.id,sections.subsections.image.width,sections.subsections.image.height,'
  + FILE('sections.images') + '&deep[sections][_filter][status][_eq]=published&deep[sections][_sort]=sort';
/** @type {Record<string, [string, string]>} slug → [集合, 導言以外要抓的欄位] */
const SINGLE = { about: ['about', ABOUT_SECTIONS], donate: ['donate', 'sections'], faculty: ['faculty_page', ''], partners: ['partners_page', ''] };
/** @param {string} slug */
async function textPage(slug) {
  const [col, more] = SINGLE[slug];
  const page = await single(col, 'lead_zh,lead_en' + (more ? ',' + more : ''));
  const art = article();
  if (!page || !art?.isConnected) return;
  setLead(page);
  const secs = sectionsOf(page);
  if (secs.length) replaceSections(art, secs.map(textSection).join(''));
  await refresh();
}

// ── 師資詳細頁（?id=）：照片、名字（人名庫）＋副標、各段履歷 ──
const CV = [['education', '學歷', 'Education'], ['experience', '經歷', 'Experience'], ['expertise', '專長', 'Expertise'], ['exhibitions', '展覽', 'Exhibitions'], ['awards', '獲獎', 'Awards'], ['publications', '著作', 'Publications']];
/** @param {URLSearchParams} params */
async function facultyDetail(params) {
  const id = params.get('id') || '';
  if (!/^\d+$/.test(id)) return;
  let f;
  try { f = await fetchCmsJson(`${CMS_API_BASE}/faculty/${id}?fields=status,photo.id,photo.width,photo.height,person.name_zh,person.name_en,subtitles,${CV.map(c => c[0]).join(',')}`); }
  catch (e) { console.warn('[faculty] 詳細頁抓不到，維持示意：', e instanceof Error ? e.message : e); return; }
  const art = article(), head = art?.querySelector(':scope > .item-row'), photo = art?.querySelector('.profile-photo');
  if (!f || f.status !== 'published' || !art?.isConnected || !head) return;
  if (photo) photo.innerHTML = f.photo ? `<img ${imgAttrs(f.photo)}>` : '';
  const subs = (Array.isArray(f.subtitles) ? f.subtitles : []).map(x => bi('p', x?.text_zh, x?.text_en)).join('');
  head.innerHTML = bi('h1', f.person?.name_zh, f.person?.name_en) + subs;
  replaceSections(art, `<section class="page-section">${CV.map(([k, zh, en]) => {
    const items = entryList(f[k]);
    return items && lbl('h3', `faculty.cv.${k}`, zh, en) + items;
  }).join('')}</section>`);
  await refresh();
  const name = art.querySelector('h1')?.textContent;
  if (name) document.title = `${name} - SCAID`;
}

/** 每頁換進來叫一次（main.js initPageModules） @param {string} page @param {URLSearchParams} params */
export function loadPage(page, params) {
  /** @type {Record<string, () => Promise<void>>} */
  const run = {
    index: homeNews, news: () => newsList(), admission: () => newsList(true, params.get('item') || ''), curriculum, qa, records, press, regulations,
    about: () => textPage('about'), donate: () => textPage('donate'), faculty: () => textPage('faculty'), partners: () => textPage('partners'),
    'faculty-detail': () => facultyDetail(params),
  };
  return run[page]?.();
}
