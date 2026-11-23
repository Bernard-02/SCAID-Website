// 後台資料 ← 直接解析前台各頁 HTML（各頁的示意內容是唯一來源；HTML 改好、決定要同步時跑這支，不另抄一份）。
// user 2026-11-21：全站接後台、把現在的文字實際放進後台，之後在後台改。只放文字（圖之後在後台上傳）。
// 順序：庫（人名／單位／媒體）→ 內容（選庫的照名字對到 id）→ 每頁的單例（關於、捐款、規章、師資頁、合作企業頁）→ 介面文字（ui_labels，掃 HTML 的 data-label）。
// 安全版、可重跑：內容集合還是空的才塞（單例＝每個欄位都空著）；庫只補沒有的名字（中英都一樣才算同一個）；
// 介面文字只補沒有的 key（後台改過的字不蓋）。
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

// ── HTML 解析：小小的 DOM（自己寫的 HTML 都是成對、乾淨的標記）。內頁只看 <main>；殼（header.html）整份 ──
// ponytail: 不是完整的 HTML parser（不處理沒關的 <p>、<script> 內文）；標記寫歪了這裡會漏，先看 --dry 的筆數
const VOID = new Set(['img', 'br', 'input', 'meta', 'link', 'hr', 'source']);
const decode = s => s.replace(/&(amp|lt|gt|quot|#39);/g, (m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e]);
function parse(file) {
  const src = fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const html = src.match(/<main[\s\S]*<\/main>/)?.[0] ?? src;
  const root = { tag: '#root', attrs: {}, children: [] }, stack = [root];
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)((?:\s+[\w:-]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g)) {
    const top = stack[stack.length - 1];
    if (m[5] !== undefined) { top.children.push({ text: decode(m[5]) }); continue; }
    const [, close, name, attrs, self] = m, tag = name.toLowerCase();
    if (close) { const i = stack.map(e => e.tag).lastIndexOf(tag); if (i > 0) stack.length = i; continue; }
    const el = { tag, attrs: Object.fromEntries([...attrs.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)].map(([, k, v]) => [k, decode(v ?? '')])), children: [] };
    top.children.push(el);
    if (!VOID.has(tag) && !self) stack.push(el);
  }
  return root;
}
const read = slug => parse(`pages/${slug}.html`);
const isEl = n => !!n?.tag;
const tag = t => e => e.tag === t;
const cls = c => e => (e.attrs.class || '').split(/\s+/).includes(c);
const find = (el, p) => { for (const c of el?.children || []) if (isEl(c)) { if (p(c)) return c; const r = find(c, p); if (r) return r; } return null; };
const findAll = (el, p, out = []) => { for (const c of el?.children || []) if (isEl(c)) { if (p(c)) out.push(c); findAll(c, p, out); } return out; };
const kids = (el, p = () => true) => (el?.children || []).filter(c => isEl(c) && p(c));
const text = n => (n.text ?? n.children.map(text).join('')).replace(/\s+/g, ' ').trim();
// 中英一組：中文＝內文、英文＝data-en（沒有＝同中文）→ { <k>_zh, <k>_en }
const zhEn = (el, k) => el ? { [`${k}_zh`]: text(el), [`${k}_en`]: el.attrs['data-en'] ?? text(el) } : {};
// 名字下面每個 p＝一行副標（subtitles；師資、合作企業、規章）
const subsOf = el => kids(el, tag('p')).map(p => ({ text_zh: text(p), text_en: p.attrs['data-en'] ?? text(p) }));
const sections = root => findAll(root, e => e.tag === 'section' && cls('page-section')(e));
const titleOf = sec => find(sec, cls('section-title'));
const pub = rows => rows.map((r, i) => ({ status: 'published', sort: i + 1, ...r }));
// 日期＝時間那行的第一個日期（2026.11.22／2027.04 → 2027-04-01），排序用
const dateOf = el => { const m = (el ? text(el) : '').match(/(\d{4})\.(\d{1,2})(?:\.(\d{1,2}))?/); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${(m[3] || '1').padStart(2, '0')}` : null; };
// 從庫選的欄位：先記名字，寫進後台前換成庫裡那筆的 id
const pool = (p, el) => el ? { $pool: p, name_zh: text(el), name_en: el.attrs['data-en'] ?? text(el) } : null;
const keyOf = r => `${(r.name_en || '').trim().toLowerCase()}|${(r.name_zh || '').trim()}`;

// 文字頁的段落內文：照 HTML 抄成中英兩份（只留前台 sanitize 會放行的標籤與 class；輪播、sr-only 不進內文）
const RICH = new Set(['p', 'h3', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'a', 'br']);
const KEEP_CLASS = new Set(['mt-sm', 'mt-md', 'text-xs']);
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function rich(n, lang) {
  if (!isEl(n)) return /^\s*$/.test(n.text) ? '' : esc(n.text);
  if (!RICH.has(n.tag)) return '';
  if (n.tag === 'br') return '<br>';
  const c = (n.attrs.class || '').split(/\s+/).filter(k => KEEP_CLASS.has(k)).join(' ');
  const href = n.tag === 'a' && n.attrs.href ? ` href="${esc(n.attrs.href)}"` : '';
  const inner = lang === 'en' && n.attrs['data-en'] != null ? esc(n.attrs['data-en']) : n.children.map(x => rich(x, lang)).join('');
  return `<${n.tag}${c ? ` class="${c}"` : ''}${href}>${inner}</${n.tag}>`;
}

// ── 各集合（照各頁現在的標記；標記改了這裡跟著改） ──
// 動態：動態頁每則（縮圖＋標題＋分類；展開＝時間、地點）＋入學頁每則（標題＋時間；展開＝說明；勾 admission）
function news() {
  const meta = d => kids(find(d, cls('fold-meta')), tag('p'));
  const list = findAll(read('news'), tag('details')).map(d => {
    const sum = find(d, tag('summary')), [time, place] = meta(d);
    return { status: 'published', date: dateOf(time), ...zhEn(find(sum, tag('h3')), 'title'), ...zhEn(find(sum, tag('p')), 'category'), ...zhEn(time, 'time'), ...zhEn(place, 'place') };
  });
  const adm = findAll(read('admission'), tag('details')).map(d => {
    const sum = find(d, tag('summary')), time = find(sum, tag('p'));
    return { status: 'published', admission: true, date: dateOf(time), ...zhEn(find(sum, tag('h3')), 'title'), ...zhEn(time, 'time'), ...zhEn(kids(find(d, cls('fold-body')), tag('p'))[0], 'summary') };
  });
  // 兩頁都有的同一則（標題一樣）＝一筆、勾入學（user 2026-11-21：入學頁＝勾了「入學」的動態），不重複建
  for (const a of adm) {
    const n = list.find(x => x.title_zh === a.title_zh);
    if (n) Object.assign(n, { admission: true }, a.summary_zh ? { summary_zh: a.summary_zh, summary_en: a.summary_en } : {});
    else list.push(a);
  }
  return list;
}
// 師資：三段（介面文字 faculty.type.*）；名字進人名庫；履歷只有 faculty-detail.html 那一位有（名字對得上的才掛）
const FAC_CAT = { 'faculty.type.full_time': 'full_time', 'faculty.type.part_time': 'part_time', 'faculty.type.mentor': 'mentor' };
function faculty() {
  const d = read('faculty-detail'), who = text(find(find(d, cls('item-row')), tag('h1'))), cv = {};
  let k = null;
  for (const n of kids(find(d, cls('page-section')))) {
    if (n.tag === 'h3') k = (n.attrs['data-label'] || '').replace('faculty.cv.', '');
    else if (n.tag === 'ul' && k) cv[k] = kids(n, tag('li')).map(li => { const ps = kids(li, tag('p')); return ps.length === 2 ? { year: text(ps[0]), text_zh: text(ps[1]), text_en: ps[1].attrs['data-en'] ?? text(ps[1]) } : { year: '', text_zh: text(li), text_en: li.attrs['data-en'] ?? text(li) }; });
  }
  return sections(read('faculty')).flatMap(sec => pub(findAll(sec, cls('item-row')).map(row => {
    const box = kids(row).at(-1), h3 = find(box, tag('h3'));
    return { category: FAC_CAT[titleOf(sec)?.attrs['data-label']], person: pool('people', h3), subtitles: subsOf(box), ...(text(h3) === who ? cv : {}) };
  })));
}
// 合作企業：名字進單位庫；整列外連
const partners = () => pub(findAll(read('partners'), cls('item-row')).map(row => {
  const box = kids(row).at(-1);
  return { organization: pool('organizations', find(box, tag('h3'))), subtitles: subsOf(box), url: row.attrs.href || null };
}));
// 課程：每個年級一段（介面文字 curriculum.year.N）；一門課一個摺疊＝課名＋必修／選修，點開＝說明
const courses = () => sections(read('curriculum')).flatMap(sec => pub(findAll(sec, tag('details')).map(d => {
  const sum = find(d, tag('summary'));
  return { year: Number((titleOf(sec)?.attrs['data-label'] || '').split('.').pop()), required: find(sum, tag('p'))?.attrs['data-label'] === 'curriculum.required',
    ...zhEn(find(sum, tag('h3')), 'name'), ...zhEn(find(find(d, cls('fold-body')), tag('p')), 'description') };
})));
const qa = () => pub(sections(read('qa')).flatMap(sec => findAll(sec, tag('details')).map(d => ({
  ...zhEn(titleOf(sec), 'category'), ...zhEn(find(d, tag('summary')), 'question'), ...zhEn(kids(d, tag('p'))[0], 'answer') }))));
// 規章與政策（單例）：有清單的段（學程規章、表單下載）一條一列（重複列 items，副標一行一個）＋沒清單的段（使用條款…）
function regulations() {
  const items = sections(read('regulations')).filter(s => find(s, cls('item-list'))).flatMap(sec => findAll(sec, cls('item-row')).map(row => {
    const subs = subsOf(row);
    return { ...zhEn(titleOf(sec), 'category'), ...zhEn(find(row, tag('h3')), 'title'), subtitles_zh: subs.map(s => s.text_zh).join('\n'), subtitles_en: subs.map(s => s.text_en).join('\n'), url: row.attrs.href || '' };
  }));
  return { items, sections: page('regulations').sections };
}
// 榮譽：國旗檔名＝國家代碼；主辦方進單位庫
const records = () => pub(findAll(read('records'), tag('details')).map(d => {
  const sum = find(d, tag('summary')), box = kids(sum).at(-1), [org, prize] = kids(find(d, cls('fold-meta')), tag('p'));
  return { country_code: (find(sum, tag('img'))?.attrs.src.match(/\/(\w{2})\.svg$/) || [])[1] || null, ...zhEn(find(box, cls('sr-only')), 'country'),
    ...zhEn(find(box, tag('h3')), 'award'), ...zhEn(kids(box, tag('p'))[0], 'winner'), organizer: pool('organizations', org), ...zhEn(prize, 'prize') };
}));
// 報導：媒體進媒體庫；截圖之後在後台上傳（沒截圖前台那列不能點）
const press = () => findAll(read('press'), cls('item-row')).map(row => ({ status: 'published', ...zhEn(find(row, tag('h3')), 'title'), media: pool('media_outlets', find(row, tag('p'))) }));
// 文字頁：導言＋沒有清單的段落（標題＋內文）。頁名不在這裡（介面文字 nav.<slug>）
function page(slug) {
  const root = read(slug), lead = find(root, cls('page-lead')), row = {};
  if (lead && !lead.attrs['data-label']) Object.assign(row, zhEn(lead, 'lead'));
  const secs = sections(root).filter(s => !find(s, cls('item-list')) && titleOf(s));
  if (secs.length) row.sections = secs.map(s => {
    const body = kids(s).filter(n => !cls('section-title')(n));
    return { ...zhEn(titleOf(s), 'title'), body_zh: body.map(n => rich(n, 'zh')).filter(Boolean).join('\n'), body_en: body.map(n => rich(n, 'en')).filter(Boolean).join('\n') };
  });
  return row;
}
// 介面文字：掃殼＋每頁的 data-label，一個 key 一筆（同 key 取第一次出現的字）；分類照 key 的開頭（setup-directus.cjs LABEL_CATS）
const LABEL_CAT = k => k.startsWith('nav.') ? '選單與頁名' : /^(menu|bar|common)\./.test(k) ? '底列與共用' : k.startsWith('faculty.') ? '師資'
  : k.startsWith('curriculum.') ? '課程' : k.startsWith('contact.') ? '聯絡' : k.startsWith('records.') ? '榮譽' : k.startsWith('error.') ? '404' : null;
function labels() {
  const m = new Map();
  for (const f of ['pages/header.html', 'index.html', ...fs.readdirSync('pages').filter(f => f.endsWith('.html') && f !== 'header.html').map(f => 'pages/' + f)])
    for (const el of findAll(parse(f), e => e.attrs['data-label'])) {
      const key = el.attrs['data-label'];
      if (!m.has(key)) m.set(key, { key, zh: text(el), en: el.attrs['data-en'] ?? '', category: LABEL_CAT(key) });
    }
  return [...m.values()].map((r, i) => ({ ...r, sort: i + 1 }));
}

const POOLS = ['people', 'organizations', 'media_outlets'];
// 每頁一個單例（user 2026-11-22，照 SCCD）。關於的段落是子集合（about_sections，有上架狀態與排序）、其他是重複列
const SINGLES = {
  about: () => { const r = page('about'); return { ...r, sections: pub(r.sections || []) }; },
  donate: () => page('donate'),
  regulations,
  faculty_page: () => page('faculty'),
  partners_page: () => page('partners'),
};
const blank = v => v == null || v === '' || (Array.isArray(v) && !v.length);

(async () => {
  console.log(`Directus ${BASE}${DRY ? '（dry run，只印不寫）' : ''}`);
  const content = { news: news(), faculty: faculty(), partners: partners(), courses: courses(), qa: qa(), records: records(), press: press() };
  for (const [col, rows] of Object.entries(content)) if (!rows.length) throw new Error(`${col}：HTML 解析出 0 筆，標記大概改了，先修 seed 的解析`);

  // 內容集合還是空的才塞 → 庫也只補那幾個集合要用到的名字（不然後台改過名字、HTML 還是舊的，會多一個沒人用的）
  const counts = {};
  for (const col of Object.keys(content)) counts[col] = Number((await api('GET', `/items/${col}?aggregate[count]=*`))[0].count);
  // 1) 庫：內容裡要用到的名字，沒有的補上；再整份讀回來照名字對 id（批次 POST 回來的順序不一定照送出的）
  const ids = {};
  for (const p of POOLS) {
    const want = new Map();
    Object.entries(content).filter(([col]) => !counts[col]).flatMap(([, rows]) => rows).forEach(r => Object.values(r).forEach(v => { if (v?.$pool === p) want.set(keyOf(v), { name_zh: v.name_zh, name_en: v.name_en }); }));
    const readPool = async () => new Map(((await api('GET', `/items/${p}?limit=-1&fields=id,name_zh,name_en`)) || []).map(r => [keyOf(r), r.id]));
    const have = await readPool(), add = [...want].filter(([k]) => !have.has(k)).map(([, r]) => r);
    console.log(`${add.length ? '+' : '='} ${p}：用到 ${want.size} 個、新增 ${add.length} 個`);
    if (DRY) add.forEach(r => console.log(`    ${r.name_zh} / ${r.name_en}`));
    else if (add.length) await api('POST', `/items/${p}`, add);
    ids[p] = DRY ? have : await readPool();
  }
  const resolve = r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v?.$pool ? ids[v.$pool].get(keyOf(v)) ?? null : v]));

  // 2) 內容：集合還是空的才塞
  for (const [col, rows] of Object.entries(content)) {
    const n = counts[col];
    if (n > 0) { console.log(`= ${col} 已有 ${n} 筆，跳過`); continue; }
    console.log(`+ ${col} ${rows.length} 筆`);
    const out = rows.map(resolve);
    if (DRY) out.forEach(r => console.log('   ', JSON.stringify(r).slice(0, 170)));
    else await api('POST', `/items/${col}`, out);
  }

  // 3) 每頁的單例：每個欄位都還空著才塞（段落一起建）
  for (const [col, build] of Object.entries(SINGLES)) {
    const cur = (await api('GET', `/items/${col}?fields=*`).catch(() => null)) || {};
    if (Object.entries(cur).some(([k, v]) => k !== 'id' && !blank(v))) { console.log(`= ${col} 已經填過，跳過`); continue; }
    const row = build(), secs = row.sections || [];
    console.log(`+ ${col}（導言${row.lead_zh ? '有' : '沒有'}、${secs.length} 段${row.items ? `、${row.items.length} 列` : ''}）`);
    if (DRY) for (const s of [...(row.items || []), ...secs]) console.log(`    § ${s.category_zh ? s.category_zh + '／' : ''}${s.title_zh} / ${s.title_en}：${(s.body_zh || s.subtitles_zh || s.url || '').slice(0, 90)}`);
    else await api('PATCH', `/items/${col}`, row);
  }

  // 4) 介面文字：只補後台沒有的 key
  const haveKeys = new Set(((await api('GET', '/items/ui_labels?limit=-1&fields=key')) || []).map(r => r.key));
  const add = labels().filter(l => !haveKeys.has(l.key));
  console.log(`${add.length ? '+' : '='} ui_labels：新增 ${add.length} 個 key（後台已有 ${haveKeys.size} 個）`);
  if (DRY) add.forEach(l => console.log(`    ${l.key}：${l.zh} / ${l.en}（${l.category}）`));
  else if (add.length) await api('POST', '/items/ui_labels', add);
  console.log('完成');
})().catch(e => { console.error(e.message); process.exit(1); });
