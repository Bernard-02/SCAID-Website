// 後台示意資料 ← 直接解析前台各頁 HTML（前台 MOCK 是唯一來源；HTML 改好、決定要同步時跑這支，不另抄一份）。
// 解析規則照各頁現在的標記：段落＝<section class="page-section"> ＋ h2.section-title；條列照各頁的 li 結構；中文內文、英文 data-en。
// 安全版：集合還是空的才塞（pages 以 slug 判斷），重跑不會重複；真資料進了就不會碰。
//
// 先看會寫什麼：node scripts/seed-directus.cjs --dry
// 真的寫：      node scripts/seed-directus.cjs
// token：scripts/.directus-token（gitignore）或環境變數 DIRECTUS_TOKEN；網域讀 js/config/api.js。

const fs = require('fs');
const token = (process.env.DIRECTUS_TOKEN || fs.readFileSync('scripts/.directus-token', 'utf8')).trim();
const BASE = fs.readFileSync('js/config/api.js', 'utf8').match(/CMS_API_BASE = '(https:\/\/[^/']+)/)[1];
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const DRY = process.argv.includes('--dry');

const api = async (method, p, body) => {
  if (DRY && method !== 'GET') return null;
  const res = await fetch(`${BASE}${p}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${JSON.stringify(json).slice(0, 400)}`);
  return json && json.data;
};

// ── HTML 解析小工具 ──
const read = f => fs.readFileSync(`pages/${f}.html`, 'utf8');
const all = (s, re) => [...s.matchAll(re)];
// 一頁的段落：[{ en, zh, body }]（news 的 h2 是年份、沒 data-en）
// 段落裡的輪播（about，標題下面那排 stock 圖）不進後台 body
const sections = html => all(html, /<section class="page-section">\s*<h2 class="section-title"(?: data-en="([^"]*)")?>([^<]*)<\/h2>([\s\S]*?)<\/section>/g).map(([, en, zh, body]) => ({ en, zh, body: body.replace(/\s*<div class="slideshow"[\s\S]*?<\/div>/, '') }));
// data-en 拆成中英兩份 HTML：zh 把 data-en 拿掉；en 把內文換成 data-en 的字。class（mt-sm／text-xs）留著，前台 sanitize 要放行 class
const split = html => ({ zh: html.replace(/ data-en="[^"]*"/g, ''), en: html.replace(/<(\w+)([^>]*?) data-en="([^"]*)"([^>]*)>[^<]*</g, '<$1$2$4>$3<') });
const tidy = s => s.replace(/^\s+/gm, '').trim();
const pub = (rows, extra = () => ({})) => rows.map((r, i) => ({ status: 'published', sort: i + 1, ...r, ...extra(r, i) }));

const CAT = { 兼任教師: 'part_time', 專任教師: 'full_time', 業界導師: 'mentor' };
const CV = { 學歷: 'education', 經歷: 'experience', 專長: 'expertise', 展覽: 'exhibitions', 獲獎: 'awards', 著作: 'publications' };
const YEAR = { 一年級: 1, 二年級: 2, 三年級: 3, 四年級: 4 };

// 文字頁：h1、導言、段落（listOnly＝列表頁只要 h1＋導言，列表本身是別的集合）
function page(slug, listOnly) {
  const html = read(slug);
  const h1 = html.match(/<h1 data-en="([^"]*)">([^<]*)<\/h1>/);
  const lead = html.match(/<p class="page-lead[^"]*" data-en="([^"]*)">([^<]*)<\/p>/);
  const row = { slug, title_zh: h1[2], title_en: h1[1], ...(lead ? { lead_zh: lead[2], lead_en: lead[1] } : {}) };
  if (!listOnly) row.sections = pub(sections(html).map(({ en, zh, body }) => { const b = split(tidy(body)); return { title_zh: zh, title_en: en, body_zh: b.zh, body_en: b.en }; }));
  return row;
}
const news = () => sections(read('news')).flatMap(({ body }) =>
  all(body, /<p class="text-xs">([^<]*)<\/p>\s*<h3 data-en="([^"]*)">([^<]*)<\/h3>(?:\s*<p data-en="([^"]*)">([^<]*)<\/p>)?/g)
    .map(([, d, en, zh, en2, zh2]) => ({ status: 'published', date: d.replace(/\./g, '-'), title_zh: zh, title_en: en, ...(zh2 ? { summary_zh: zh2, summary_en: en2 } : {}) })));
function faculty() {
  // 六段條列只有 faculty-detail.html 那一位有（名字對得上的才掛），其他人空的
  const d = read('faculty-detail');
  const who = d.match(/<h1 data-en="[^"]*">([^<]*)<\/h1>/)[1];
  const cv = Object.fromEntries(sections(d).map(({ zh, body }) => [CV[zh], all(body, /<li><h3(?: data-en="[^"]*")?>([^<]*)<\/h3><p data-en="([^"]*)">([^<]*)<\/p><\/li>/g).map(([, year, en, z]) => ({ year, text_zh: z, text_en: en }))]));
  return pub(sections(read('faculty')).flatMap(({ zh: cat, body }) =>
    all(body, /<h3 data-en="([^"]*)">([^<]*)<\/h3>\s*<p data-en="([^"]*)">([^<]*)<\/p>/g).map(([, ne, nz, ae, az]) => ({ category: CAT[cat], name_zh: nz, name_en: ne, affiliation_zh: az, affiliation_en: ae, ...(nz === who ? cv : {}) }))));
}
const partners = () => pub(all(read('partners'), /<a class="item-row" href="([^"]*)"[^>]*>[\s\S]*?<h3 data-en="([^"]*)">([^<]*)<\/h3>\s*<p data-en="([^"]*)">([^<]*)<\/p>/g).map(([, url, ne, nz, de, dz]) => ({ name_zh: nz, name_en: ne, description_zh: dz, description_en: de, url })));
// 每個年級：必修／選修各一組（h3 ＋ ul），課名是 li；同年級照出現順序給 sort
const courses = () => sections(read('curriculum')).flatMap(({ zh: y, body }) =>
  pub(all(body, /<h3 data-en="(Required|Elective)">[^<]*<\/h3>\s*<ul[^>]*>([\s\S]*?)<\/ul>/g).flatMap(([, req, list]) =>
    all(list, /<li data-en="([^"]*)">([^<]*)<\/li>/g).map(([, ne, nz]) => ({ year: YEAR[y], required: req === 'Required', name_zh: nz, name_en: ne })))));
const qa = () => pub(sections(read('qa')).flatMap(({ en: ce, zh: cz, body }) =>
  all(body, /<summary[^>]*data-en="([^"]*)">([^<]*)<\/summary>\s*<p[^>]*data-en="([^"]*)">([^<]*)<\/p>/g).map(([, qe, qz, ae, az]) => ({ category_zh: cz, category_en: ce, question_zh: qz, question_en: qe, answer_zh: az, answer_en: ae }))));
const regulations = () => pub(sections(read('regulations')).flatMap(({ en: ce, zh: cz, body }) =>
  all(body, /<li><h3 data-en="([^"]*)">([^<]*)<\/h3><\/li>/g).map(([, te, tz]) => ({ category_zh: cz, category_en: ce, title_zh: tz, title_en: te }))));

const SEED = {
  news: news(), faculty: faculty(), partners: partners(), courses: courses(), qa: qa(), regulations: regulations(),
  pages: [page('about'), page('faculty', true), page('partners', true), page('admission'), page('donate'), page('terms')],
};

(async () => {
  console.log(`Directus ${BASE}${DRY ? '（dry run，只印不寫）' : ''}`);
  for (const [col, rows] of Object.entries(SEED)) {
    if (col === 'pages') continue;
    if (!rows.length) throw new Error(`${col}：HTML 解析出 0 筆，標記大概改了，先修 seed 的 regex`);
    const n = (await api('GET', `/items/${col}?aggregate[count]=*`))[0].count;
    if (Number(n) > 0) { console.log(`= ${col} 已有 ${n} 筆，跳過`); continue; }
    console.log(`+ ${col} ${rows.length} 筆`);
    if (DRY) for (const r of rows) console.log('   ', JSON.stringify(r).slice(0, 160));
    else await api('POST', `/items/${col}`, rows);
  }
  const have = new Set(((await api('GET', '/items/pages?fields=slug')) || []).map(r => r.slug));
  for (const page of SEED.pages) {
    if (have.has(page.slug)) { console.log(`= pages/${page.slug} 已存在，跳過`); continue; }
    const { sections = [], ...row } = page;
    console.log(`+ pages/${page.slug}（${sections.length} 段）`);
    if (DRY) { console.log('   ', JSON.stringify(row).slice(0, 200)); for (const s of sections) console.log(`    § ${s.title_zh} / ${s.title_en}\n${s.body_zh.replace(/^/gm, '      ')}`); }
    else await api('POST', '/items/pages', { ...row, sections });  // O2M 一起建
  }
  console.log('完成');
})().catch(e => { console.error(e.message); process.exit(1); });
