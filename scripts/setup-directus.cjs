// SCAID Directus 基礎 collection（2026-11-18，照當時各頁 MOCK 結構建；欄位表見 docs/Directus-後台欄位.md）。
// 安全版：collection／欄位／關聯／權限已存在就跳過，可以重跑；新加一個欄位只要補進下面 SPEC 再跑一次。
//
// 先看會做什麼：node scripts/setup-directus.cjs --dry
// 真的做：      node scripts/setup-directus.cjs
// token：scripts/.directus-token（gitignore）或環境變數 DIRECTUS_TOKEN；網域讀 js/config/api.js（唯一來源）。

const fs = require('fs');
const token = (process.env.DIRECTUS_TOKEN || fs.readFileSync('scripts/.directus-token', 'utf8')).trim();
const BASE = fs.readFileSync('js/config/api.js', 'utf8').match(/CMS_API_BASE = '(https:\/\/[^/']+)/)[1];
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const DRY = process.argv.includes('--dry');

const api = async (method, p, body) => {
  if (DRY && method !== 'GET') { console.log(`  [dry] ${method} ${p}`); return null; }
  const res = await fetch(`${BASE}${p}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${JSON.stringify(json).slice(0, 400)}`);
  return json && json.data;
};
const get = p => api('GET', p).catch(() => null);
const zh = t => [{ language: 'zh-TW', translation: t }];
const EN_NOTE = '英文留空＝英文版顯示中文';

// ── 欄位小工具 ──
const pk = { field: 'id', type: 'integer', meta: { hidden: true, readonly: true, interface: 'input' }, schema: { is_primary_key: true, has_auto_increment: true } };
const status = { field: 'status', type: 'string', meta: { interface: 'select-dropdown', width: 'half', translations: zh('狀態'), options: { choices: [{ text: '上架', value: 'published' }, { text: '草稿', value: 'draft' }] }, display: 'labels', display_options: { showAsDot: true, choices: [{ text: '上架', value: 'published', foreground: '#FFFFFF', background: '#2ECDA7' }, { text: '草稿', value: 'draft', foreground: '#18222F', background: '#D3DAE4' }] } }, schema: { default_value: 'published', is_nullable: false } };
const sort = { field: 'sort', type: 'integer', meta: { hidden: true, interface: 'input' }, schema: {} };
const str = (field, label, extra = {}, width = 'half') => ({ field, type: 'string', meta: { interface: 'input', width, translations: zh(label), ...extra }, schema: {} });
const strEn = (field, label) => str(field, label, { note: EN_NOTE });
const multi = (field, label, extra = {}) => ({ field, type: 'text', meta: { interface: 'input-multiline', width: 'full', translations: zh(label), ...extra }, schema: {} });
const rich = (field, label, extra = {}) => ({ field, type: 'text', meta: { interface: 'input-rich-text-html', width: 'full', translations: zh(label), options: { toolbar: ['bold', 'italic', 'h3', 'bullist', 'numlist', 'link', 'removeformat'] }, ...extra }, schema: {} });
const image = (field, label, note) => ({ field, type: 'uuid', meta: { interface: 'file-image', special: ['file'], width: 'half', translations: zh(label), note }, schema: { is_nullable: true } });
const file = (field, label, note) => ({ field, type: 'uuid', meta: { interface: 'file', special: ['file'], width: 'half', translations: zh(label), note }, schema: { is_nullable: true } });
const date = (field, label) => ({ field, type: 'date', meta: { interface: 'datetime', width: 'half', translations: zh(label) }, schema: {} });
const bool = (field, label, text) => ({ field, type: 'boolean', meta: { interface: 'boolean', width: 'half', translations: zh(label), options: { label: text } }, schema: { default_value: false } });
const dropdown = (field, label, choices) => ({ field, type: 'string', meta: { interface: 'select-dropdown', width: 'half', translations: zh(label), options: { choices }, display: 'labels', display_options: { choices } }, schema: {} });
const url = (field, label, note) => str(field, label, { note: note || '只接受 https://、mailto:、tel: 開頭' }, 'full');
// JSON repeater：子欄位都是文字輸入
const repeater = (field, label, sub, template, note) => ({ field, type: 'json', meta: { interface: 'list', width: 'full', translations: zh(label), note, options: { template, fields: sub.map(([f, name, type]) => ({ field: f, name, type: type || 'string', meta: { field: f, type: type || 'string', interface: type === 'text' ? 'input-multiline' : 'input', width: 'full' } })) } }, schema: {} });
// 中英成對的「年份／說明」條列（faculty-detail 每段一個）
const entries = (field, label) => repeater(field, label, [['year', '年份／標題'], ['text_zh', '說明（中）', 'text'], ['text_en', '說明（英）', 'text']], '{{year}} {{text_zh}}', '一列一筆；' + EN_NOTE);

const FACULTY_CATS = [{ text: '兼任教師', value: 'part_time' }, { text: '專任教師', value: 'full_time' }, { text: '業界導師', value: 'mentor' }];
const YEARS = [1, 2, 3, 4].map(n => ({ text: `${'一二三四'[n - 1]}年級`, value: n }));

// ── SPEC：collection → { meta, fields, relations?, public:讀取條件 } ──
const SPEC = {
  footer: {
    meta: { icon: 'call_to_action', singleton: true, translations: zh('頁尾'), note: '只有這一筆；欄位留空＝前台那一列不顯示' },
    fields: [
      str('email', '電子郵件'), str('tel', '電話（中英共用）'), str('fax', '傳真（中英共用）'),
      str('address_zh', '地址（中）'), strEn('address_en', '地址（英）'),
      repeater('social', '社群連結', [['label', '名稱（報讀用，例 Instagram）'], ['url', '網址']], '{{label}}', '可拖曳排序；網址只接受 https://、mailto:、tel:'),
      repeater('links', '姊妹系所連結', [['label', '顯示文字（例 SCCD）'], ['url', '網址']], '{{label}}', '可拖曳排序'),
      image('badge', '標章', '圖片替代文字＝檔案標題（在檔案庫改）'),
      str('copyright_zh', '版權文字（中）'), strEn('copyright_en', '版權文字（英）'),
    ],
  },
  news: {
    meta: { icon: 'newspaper', translations: zh('動態'), display_template: '{{date}} {{title_zh}}', sort_field: null, archive_field: 'status', archive_value: 'draft', unarchive_value: 'published', note: '首頁清單與底列只顯示上架的，依日期新到舊' },
    fields: [status, date('date', '日期'), str('title_zh', '標題（中）', {}, 'full'), strEn('title_en', '標題（英）'),
      multi('summary_zh', '說明（中，選填，首頁清單第二行）'), multi('summary_en', '說明（英，選填）', { note: EN_NOTE }),
      image('image', '圖片'), url('link', '外部連結（選填）')],
  },
  faculty: {
    meta: { icon: 'school', translations: zh('師資'), display_template: '{{name_zh}} {{name_en}}', sort_field: 'sort', archive_field: 'status', archive_value: 'draft', unarchive_value: 'published', note: '列表依「類別」分段；名字／單位跟語言切（英文留空＝英文版顯示中文）' },
    fields: [status, sort, dropdown('category', '類別', FACULTY_CATS), image('photo', '照片'),
      str('name_zh', '姓名（中）'), str('name_en', '姓名（英）'), str('affiliation_zh', '任職單位（中）'), str('affiliation_en', '任職單位（英）'),
      entries('education', '學歷'), entries('experience', '經歷'), entries('expertise', '專長'), entries('exhibitions', '展覽'), entries('awards', '獲獎'), entries('publications', '著作')],
  },
  partners: {
    meta: { icon: 'handshake', translations: zh('合作企業'), display_template: '{{name_zh}}', sort_field: 'sort', archive_field: 'status', archive_value: 'draft', unarchive_value: 'published' },
    fields: [status, sort, image('logo', 'Logo'), str('name_zh', '企業名稱（中）'), strEn('name_en', '企業名稱（英）'),
      multi('description_zh', '合作內容（中）'), multi('description_en', '合作內容（英）', { note: EN_NOTE }), url('url', '企業網站（整列可點、另開新視窗；空＝不可點）')],
  },
  courses: {
    meta: { icon: 'menu_book', translations: zh('課程'), display_template: '{{year}} {{name_zh}}', sort_field: 'sort', archive_field: 'status', archive_value: 'draft', unarchive_value: 'published', note: '課程頁依年級分段、同年級照拖曳順序' },
    fields: [status, sort, { ...dropdown('year', '年級', YEARS), type: 'integer' }, bool('required', '必修', '必修（不勾＝選修）'),
      str('name_zh', '課程名稱（中）'), strEn('name_en', '課程名稱（英）'),
      multi('description_zh', '課程說明（中，詳細頁那一段）'), multi('description_en', '課程說明（英）', { note: EN_NOTE })],
  },
  qa: {
    meta: { icon: 'help', translations: zh('常見問題'), display_template: '{{question_zh}}', sort_field: 'sort', archive_field: 'status', archive_value: 'draft', unarchive_value: 'published', note: '前台依「分類」分段，分類名一樣的會排在同一段' },
    fields: [status, sort, str('category_zh', '分類（中）'), strEn('category_en', '分類（英）'),
      str('question_zh', '問題（中）', {}, 'full'), strEn('question_en', '問題（英）'), multi('answer_zh', '回答（中）'), multi('answer_en', '回答（英）', { note: EN_NOTE })],
  },
  regulations: {
    meta: { icon: 'gavel', translations: zh('規章'), display_template: '{{title_zh}}', sort_field: 'sort', archive_field: 'status', archive_value: 'draft', unarchive_value: 'published', note: '前台依「分類」分段；檔案與外部連結二選一' },
    fields: [status, sort, str('category_zh', '分類（中）'), strEn('category_en', '分類（英）'),
      str('title_zh', '規章名稱（中）', {}, 'full'), strEn('title_en', '規章名稱（英）'), file('file', '檔案（PDF）'), url('url', '外部連結')],
  },
  // 文字頁（about／admission／donate／terms…）：pages 一頁一筆（slug 當主鍵＝前台 route）＋ page_sections 每段一筆
  pages: {
    meta: { icon: 'article', translations: zh('文字頁'), display_template: '{{slug}} {{title_zh}}', note: 'slug＝前台網址（about／admission／donate／terms）；段落在下方 sections 新增' },
    pk: { field: 'slug', type: 'string', meta: { interface: 'input', readonly: false, width: 'half', translations: zh('slug（前台網址，建好不要改）'), options: { slug: true } }, schema: { is_primary_key: true, length: 64 } },
    fields: [str('title_zh', '頁標題（中）'), strEn('title_en', '頁標題（英）'), multi('lead_zh', '導言（中，選填）'), multi('lead_en', '導言（英，選填）', { note: EN_NOTE }),
      { field: 'sections', type: 'alias', meta: { special: ['o2m'], interface: 'list-o2m', width: 'full', translations: zh('段落'), options: { template: '{{title_zh}}', enableCreate: true, enableSelect: false } } }],
  },
  page_sections: {
    meta: { icon: 'segment', translations: zh('文字頁段落'), display_template: '{{page}} / {{title_zh}}', sort_field: 'sort', archive_field: 'status', archive_value: 'draft', unarchive_value: 'published', hidden: true, note: '從「文字頁」裡面新增；段落標題＝左側段落導覽' },
    fields: [status, sort, { field: 'page', type: 'string', meta: { hidden: true, interface: 'select-dropdown-m2o', translations: zh('所屬頁') }, schema: { is_nullable: true, length: 64 } },
      str('title_zh', '段落標題（中）'), strEn('title_en', '段落標題（英）'), rich('body_zh', '內文（中）'), rich('body_en', '內文（英）', { note: EN_NOTE })],
    relations: [{ collection: 'page_sections', field: 'page', related_collection: 'pages', meta: { one_field: 'sections', sort_field: 'sort', one_deselect_action: 'delete' }, schema: { on_delete: 'CASCADE' } }],
  },
};

// footer.html 目前的示意值：singleton 建好後第一筆就是這些，前台畫面不變（接真資料時在後台改）
const FOOTER_MOCK = {
  email: 'scaid@g2.usc.edu.tw', tel: '02 0000 0000（示意）', fax: '02 0000 0000（示意）', address_zh: '地址（示意）', address_en: 'Address (placeholder)',
  social: [{ label: '社群一（示意）', url: 'https://example.com' }, { label: '社群二（示意）', url: 'https://example.com' }],
  links: [['SCD', 'https://www.scdesign.usc.edu.tw/'], ['SCCD', 'https://sccd.usc.edu.tw/'], ['SCFD', 'https://scfd.usc.edu.tw/'], ['SCID', 'https://scid.usc.edu.tw/'], ['SCA', 'https://www.arch.usc.edu.tw/'], ['SCAC', 'https://www.arch.usc.edu.tw/'], ['USC', 'https://www.usc.edu.tw/']].map(([label, url]) => ({ label, url })),
  copyright_zh: '版權所有（示意）', copyright_en: 'Copyright (placeholder)',
};

async function ensureCollection(name, s) {
  const first = s.pk || pk;  // 預設整數 id；pages 用 slug 當主鍵
  if (await get(`/collections/${name}`)) console.log(`= ${name} 已存在`);
  else { console.log(`+ 建 ${name}`); await api('POST', '/collections', { collection: name, meta: s.meta, schema: {}, fields: [first] }); }
  const have = DRY ? new Set() : new Set(((await get(`/fields/${name}`)) || []).map(f => f.field));
  for (const f of s.fields) if (!have.has(f.field)) { console.log(`  + 欄位 ${name}.${f.field}`); await api('POST', `/fields/${name}`, f); }
  // 圖片／檔案欄位要掛到 directus_files 才會顯示選圖器
  for (const f of s.fields) if (f.meta?.special?.includes('file')) await ensureRelation({ collection: name, field: f.field, related_collection: 'directus_files', schema: { on_delete: 'SET NULL' } });
  for (const r of s.relations || []) await ensureRelation(r);
}
async function ensureRelation(r) {
  if (await get(`/relations/${r.collection}/${r.field}`)) return;
  console.log(`  + 關聯 ${r.collection}.${r.field} → ${r.related_collection}`); await api('POST', '/relations', r);
}
async function ensurePublicRead() {
  const pub = ((await get('/policies?filter[admin_access][_eq]=false&filter[app_access][_eq]=false')) || [])[0];
  if (!pub) throw new Error('找不到 Public policy');
  const have = new Set((((await get(`/permissions?limit=-1&filter[policy][_eq]=${pub.id}&filter[action][_eq]=read`)) || [])).map(p => p.collection));
  const want = [...Object.keys(SPEC), 'directus_files'];  // directus_files：前台 /assets 要能讀圖
  for (const c of want) {
    if (have.has(c)) continue;
    console.log(`  + Public 讀取 ${c}`);
    // ponytail: Directus 12 Core 不給條件式權限（custom_permission_rules 是付費功能）→ 全開，前台抓時自己帶 filter[status][_eq]=published；草稿知道網址就讀得到，接受
    await api('POST', '/permissions', { policy: pub.id, collection: c, action: 'read', fields: ['*'], permissions: {}, validation: {} });
  }
}

(async () => {
  console.log(`Directus ${BASE}${DRY ? '（dry run，不會改任何東西）' : ''}`);
  for (const [name, s] of Object.entries(SPEC)) await ensureCollection(name, s);
  console.log('Public 讀取權');
  await ensurePublicRead();
  // footer 單例：還是空的才塞示意值（已經有人填過就不碰）
  const f = DRY ? null : await get('/items/footer');
  if (!DRY && f && !f.email && !f.copyright_zh) { console.log('+ footer 塞 footer.html 的示意值'); await api('PATCH', '/items/footer', FOOTER_MOCK); }
  console.log('完成');
})().catch(e => { console.error(e.message); process.exit(1); });
