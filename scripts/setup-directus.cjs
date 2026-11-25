// SCAID Directus 基礎 collection（2026-11-18，照當時各頁 MOCK 結構建；欄位表見 docs/Directus-後台欄位.md）。
// 安全版：collection／欄位／關聯／權限已存在就跳過，可以重跑；新加一個欄位只要補進下面 SPEC 再跑一次。
//
// 先看會做什麼：node scripts/setup-directus.cjs --dry
// 真的做：      node scripts/setup-directus.cjs
// token：scripts/.directus-token（gitignore）或環境變數 DIRECTUS_TOKEN；網域讀 js/config/api.js（唯一來源）。

const fs = require('fs');
const token = (process.env.DIRECTUS_TOKEN || fs.readFileSync('scripts/.directus-token', 'utf8')).trim();
// 建在別台（搬到 v11 時先在新的那台建結構，docs/Directus-搬到11.md）：DIRECTUS_URL=<網址> DIRECTUS_TOKEN=<那台的 token>
const BASE = (process.env.DIRECTUS_URL || fs.readFileSync('js/config/api.js', 'utf8').match(/CMS_API_BASE = '(https:\/\/[^/']+)/)[1]).replace(/\/+$/, '');
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
const sort = { field: 'sort', type: 'integer', meta: { hidden: true, interface: 'input' }, schema: {} };
const str = (field, label, extra = {}, width = 'half') => ({ field, type: 'string', meta: { interface: 'input', width, translations: zh(label), ...extra }, schema: {} });
const strEn = (field, label) => str(field, label, { note: EN_NOTE });
const multi = (field, label, extra = {}) => ({ field, type: 'text', meta: { interface: 'input-multiline', width: 'full', translations: zh(label), ...extra }, schema: {} });
const TOOLBAR = ['bold', 'italic', 'h3', 'bullist', 'numlist', 'link', 'removeformat'];
const rich = (field, label, extra = {}) => ({ field, type: 'text', meta: { interface: 'input-rich-text-html', width: 'full', translations: zh(label), options: { toolbar: TOOLBAR }, ...extra }, schema: {} });
const image = (field, label, note) => ({ field, type: 'uuid', meta: { interface: 'file-image', special: ['file'], width: 'half', translations: zh(label), note }, schema: { is_nullable: true } });
const date = (field, label) => ({ field, type: 'date', meta: { interface: 'datetime', width: 'half', translations: zh(label) }, schema: {} });
// 動態、入學的時間（user 2026-11-24：用選的、不要手動輸入）：日期必填（排序用），跨天才填結束日期。
// 沒有開始／結束時間（user 同一天：「後臺不需要有 time 的設定」——動態的在後台刪掉，入學的「也拿掉，留下日期即可」）
const when = [{ ...date('date', '日期'), schema: { is_nullable: false } }, date('end_date', '結束日期（選填，跨天才填）')];
const bool = (field, label, text) => ({ field, type: 'boolean', meta: { interface: 'boolean', width: 'half', translations: zh(label), options: { label: text } }, schema: { default_value: false } });
const dropdown = (field, label, choices) => ({ field, type: 'string', meta: { interface: 'select-dropdown', width: 'half', translations: zh(label), options: { choices }, display: 'labels', display_options: { choices } }, schema: {} });
const url = (field, label, note) => str(field, label, { note: note || '只接受 https://、mailto:、tel: 開頭' }, 'full');
// 前台照 key 找的那一格（介面文字、網頁 icon）：唯讀、等寬字
const keyField = { field: 'key', type: 'string', meta: { interface: 'input', readonly: true, width: 'half', translations: zh('key（勿改）'), options: { font: 'monospace' } }, schema: { is_unique: true, is_nullable: false } };
// 國家下拉的選項（紀錄的國旗）＝SCCD 後台 people.country 那一份（249 國、常用的在前；user 2026-11-25「國家改成跟sccd一樣的drop down，預設是所有國家都可以選」
// 「動態不需要國家，紀錄才需要國家，且是往下拉的」）：存 ISO 兩碼小寫＝前台照它抓國旗
const COUNTRIES = require('./country-choices.json');
// JSON repeater：子欄位＝[欄位, 名稱, 種類]；種類 空＝一行、'text'＝多行、'rich'＝段落內文（WYSIWYG）
const SUB = { text: ['text', 'input-multiline'], rich: ['text', 'input-rich-text-html', { toolbar: TOOLBAR }] };
const repeater = (field, label, sub, template, note) => ({ field, type: 'json', meta: { interface: 'list', width: 'full', translations: zh(label), note, options: { template, fields: sub.map(([f, name, kind]) => {
  const [type, iface, options] = SUB[kind] || ['string', 'input'];
  return { field: f, name, type, meta: { field: f, type, interface: iface, width: 'full', ...(options ? { options } : {}) } };
}) } }, schema: {} });
// 動態的日期（照 SCCD 的活動 dates，user 2026-11-25：「動態的日期，前臺跟後臺都調整跟sccd的一樣」）：一筆一段、可以好幾段，結束空＝一天；
// 三個勾選三選一（勾了一個、另外兩個變唯讀＝SCCD add-dates-exclusive-guard）。前台 cms-pages.js datesOf()
const DATE_FLAGS = [['monthOnly', '只到月', '只到月（前台 2025 DEC／2025 十二月，忽略日）'], ['monthRange', '月到月', '月到月（開始、結束選那兩個月 → 2025 DEC - 2026 FEB，忽略日）'],
  ['yearOnly', '只到年', '只到年（只知道年份 → 前台只寫年份、排在那一年最後）']];
const activityDates = { field: 'dates', type: 'json', meta: { interface: 'list', width: 'full', translations: zh('日期'), note: '一筆一段、可以好幾段（前台用「, 」接起來）；結束空著＝一天', options: { template: '{{start}} {{end}}', fields: [
  { field: 'start', name: '開始', type: 'date', meta: { field: 'start', type: 'date', interface: 'datetime', width: 'half', required: true } },
  { field: 'end', name: '結束（選填）', type: 'date', meta: { field: 'end', type: 'date', interface: 'datetime', width: 'half' } },
  ...DATE_FLAGS.map(([f, name, label]) => ({ field: f, name, type: 'boolean', meta: { field: f, type: 'boolean', interface: 'boolean', width: 'full', options: { label },
    conditions: [{ name: '三選一', readonly: true, rule: { _and: [{ [f]: { _neq: true } }, { _or: DATE_FLAGS.filter(([o]) => o !== f).map(([o]) => ({ [o]: { _eq: true } })) }] } }] } }))] } }, schema: {} };
// 副標（師資、合作企業共用同一種列，user 2026-11-21；動態也是，2026-11-24）：標題下面一筆一行、沒填就不出
const subtitles = repeater('subtitles', '副標', [['text_zh', '副標（中）'], ['text_en', '副標（英）']], '{{text_zh}}', '一筆＝標題下面一行，可拖曳排序；沒填＝只有標題。' + EN_NOTE);
// 中英成對的「年份／說明」條列（師資的清單 faculty_sections.entries、關於的年表）
const entries = (field, label) => repeater(field, label, [['year', '年份／標題'], ['text_zh', '說明（中）', 'text'], ['text_en', '說明（英）', 'text']], '{{year}} {{text_zh}}', '一列一筆；' + EN_NOTE);
// 從庫選（人名庫／單位庫／媒體庫，user 2026-11-21 照 SCCD）：M2O 一列一個。庫那邊自動多一欄「用在：○○」（欄名＝這個集合），
// 關聯 RESTRICT＝還有人用就刪不掉（重複的要合併、不能直接刪）
const pick = (field, label, pool, note) => ({ field, type: 'integer', pool, meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half', translations: zh(label), note: note || '從庫裡選；沒有就在選單裡新增（會一起加進庫）',
  options: { template: '{{name_zh}} {{name_en}}', enableCreate: true, enableSelect: true }, display: 'related-values', display_options: { template: '{{name_zh}}' } }, schema: { is_nullable: true } });
const usedIn = (field, label, template) => ({ field, type: 'alias', meta: { special: ['o2m'], interface: 'list-o2m', readonly: true, width: 'full', translations: zh(`用在：${label}`), options: { template, enableCreate: false, enableSelect: false } } });
const poolName = [str('name_zh', '中文名'), str('name_en', '英文名', { note: EN_NOTE })];
// 多張圖／多個檔（files M2M）：每個這種欄位要另一張 junction 表 <集合>_<欄位>（下面 junction()）——2026-11-24 前（12 的 Core）集合上限 25 才省著開，v11 沒有上限
const files = (field, label, note) => ({ field, type: 'alias', meta: { special: ['files'], interface: 'files', width: 'full', translations: zh(label), note } });
const junction = (parent, field) => ({
  meta: { hidden: true, icon: 'import_export' },
  fields: [{ field: `${parent}_id`, type: 'integer', meta: { hidden: true }, schema: {} }, { field: 'directus_files_id', type: 'uuid', meta: { hidden: true }, schema: {} }, sort],
  relations: [
    { collection: `${parent}_${field}`, field: 'directus_files_id', related_collection: 'directus_files', meta: { junction_field: `${parent}_id` }, schema: { on_delete: 'SET NULL' } },
    { collection: `${parent}_${field}`, field: `${parent}_id`, related_collection: parent, meta: { one_field: field, junction_field: 'directus_files_id', sort_field: 'sort', one_deselect_action: 'delete' }, schema: { on_delete: 'CASCADE' } },
  ],
});
// 二選一的兩格互鎖（照 SCCD）：另一格有值＝這格唯讀；不藏，看得到為什麼不能填
const LOCK = (other, why) => [{ name: why, rule: { [other]: { _nnull: true } }, readonly: true, hidden: false }];
// 給做好的欄位掛條件（紀錄：獎項名稱跟媒體互鎖、報導沒有主辦方）
const COND = (f, conditions) => ({ ...f, meta: { ...f.meta, conditions } });
// 介面文字的分類（後台整理用，前台只認 key；key 的開頭決定分類，seed-directus.cjs LABEL_CAT）
const LABEL_CATS = ['選單與頁名', '底列與共用', '師資', '課程', '聯絡', '榮譽', '404'].map(c => ({ text: c, value: c }));

// 第三類原本是「業界導師」mentor，user 2026-11-24 改成行政管理、值也改 admin（「key 還是要改，這樣會誤導」）。
// 這支只加不改＝已經建好的後台是另外改的：下拉的選項（PATCH /fields/faculty/category）、原本那幾筆的 category、介面文字的 key（faculty.type.admin）
const FACULTY_CATS = [{ text: '兼任教師', value: 'part_time' }, { text: '專任教師', value: 'full_time' }, { text: '行政管理', value: 'admin' }];
const YEARS = [1, 2, 3, 4].map(n => ({ text: `${'一二三四'[n - 1]}年級`, value: n }));
// 課程的必修／選修＝下拉（user 2026-11-25：「後臺的必選修應該改成dropdown才對，不是checkbox」；原本一格勾選 required，資料搬過來、舊的那格刪了）
const COURSE_TYPES = [{ text: '必修', value: 'required' }, { text: '選修', value: 'elective' }];
// 單例頁的導言、段落（每頁一個集合，user 2026-11-22 照 SCCD）。段落用重複列；關於的段落要放輪播圖、重複列放不了檔案 → 子集合 about_sections（裡面的小節要放圖 → 再一層子集合 about_subsections）
// 導言（後台叫 Hero）每一頁自己一個單例 <頁>_page「○○Hero」、跟那一頁的其他內容收在同一個資料夾（user 2026-11-25：「後臺我想要每個頁面的hero文字都分開，不要混在一起」——
// 師資、合作企業本來就是；關於、捐款原本導言跟段落寫在同一個單例裡，同一天拆出來：about_page／donate_page，原本那兩格 lead_* 搬過去後刪了）
const lead = [multi('lead_zh', '導言（中，選填）'), multi('lead_en', '導言（英，選填）', { note: EN_NOTE })];
const hero = (folder, label) => ({ meta: { icon: 'article', singleton: true, group: folder, translations: zh(`${label}Hero`), note: '頁標題下面那段導言' }, fields: lead });
// 段落＝子集合：單例上的那一格 sections（O2M），在同一個表單裡新增、可拖曳排序。原本規章、捐款的段落是重複列（JSON：標題＋一段 rich text），2026-11-24 都換成這個
const sectionList = { field: 'sections', type: 'alias', meta: { special: ['o2m'], interface: 'list-o2m', width: 'full', translations: zh('段落'), options: { template: '{{title_zh}}', enableCreate: true, enableSelect: false } } };
// 一頁的段落 → 小節那四個集合（同關於）：<頁>_sections（標題、輪播圖、說明、小節、年表）→ <頁>_subsections（標題、圖、內文、附註），圖各一張 junction；前台同一支 textSection()。
// 規章的條款用這支（user 2026-11-24：「使用條款就是跟 about 的一樣，也讓後臺可以 custom 這個文字」）。
// ponytail: 關於（帶藏起來的舊欄位）、捐款的那四個是手寫的、沒併進來；改欄位三邊都要改，之後要整理再把那兩頁換成這支
const pageSections = (page, label) => ({
  [`${page}_sections`]: {
    meta: { icon: 'segment', translations: zh(`${label}的段落`), display_template: '{{title_zh}}', sort_field: 'sort', hidden: true, note: `從「${label}」裡面新增` },
    fields: [sort, { field: page, type: 'integer', meta: { hidden: true, interface: 'select-dropdown-m2o', translations: zh('所屬頁') }, schema: { is_nullable: true } },
      str('title_zh', '段落標題（中）'), strEn('title_en', '段落標題（英）'),
      files('images', '段落圖片（輪播）', '標題下面那排輪播，可拖曳排序；沒放＝不出輪播'),
      multi('description_zh', '說明（中，選填：段落圖片下面那段）', { note: '純文字：換行照留、空一行＝分段' }), multi('description_en', '說明（英）', { note: EN_NOTE }),
      { field: 'subsections', type: 'alias', meta: { special: ['o2m'], interface: 'list-o2m', width: 'full', translations: zh('小節'), note: '一個小節＝標題、圖片、內文、附註（都可以不填），可拖曳排序',
        options: { template: '{{title_zh}} {{text_zh}}', enableCreate: true, enableSelect: false } } },
      entries('timeline', '年表（年份＋文字，沿革那種）')],
    relations: [{ collection: `${page}_sections`, field: page, related_collection: page, meta: { one_field: 'sections', sort_field: 'sort', one_deselect_action: 'delete' }, schema: { on_delete: 'CASCADE' } }],
  },
  [`${page}_sections_images`]: junction(`${page}_sections`, 'images'),
  [`${page}_subsections`]: {
    meta: { icon: 'subject', translations: zh(`${label}的小節`), display_template: '{{title_zh}} {{text_zh}}', sort_field: 'sort', hidden: true, note: `從「${label}」的段落裡面新增` },
    fields: [sort, { field: 'section', type: 'integer', meta: { hidden: true, interface: 'select-dropdown-m2o', translations: zh('所屬段落') }, schema: { is_nullable: true } },
      str('title_zh', '小節標題（中，選填）'), strEn('title_en', '小節標題（英）'),
      files('images', '圖片（選填，可以多張）', '標題下面、內文上面；一張＝照原比例放在內文欄正中，多張＝輪播（同段落圖片），可拖曳排序'),
      multi('text_zh', '內文（中）', { note: '純文字：換行照留、空一行＝分段' }), multi('text_en', '內文（英）', { note: EN_NOTE }),
      multi('note_zh', '附註（中，選填：小節最後一行小字）'), multi('note_en', '附註（英）', { note: EN_NOTE })],
    relations: [{ collection: `${page}_subsections`, field: 'section', related_collection: `${page}_sections`, meta: { one_field: 'subsections', sort_field: 'sort', one_deselect_action: 'delete' }, schema: { on_delete: 'CASCADE' } }],
  },
  [`${page}_subsections_images`]: junction(`${page}_subsections`, 'images'),
});

// ── SPEC：collection → { meta, fields, relations? }（folder: true＝側欄的資料夾）。順序有差：資料夾排在它裡面的集合前面、庫要排在選它的集合前面、junction 排在它的 parent 後面 ──
const SPEC = {
  // 清單頁＝清單＋頁面（導言）兩個集合，收在同一個資料夾（user 2026-11-22，照 SCCD）
  home_folder: { folder: true, meta: { icon: 'folder', translations: zh('首頁') } },   // 首頁的 news＋首頁影片（user 2026-11-23）
  about_folder: { folder: true, meta: { icon: 'folder', translations: zh('關於') } },   // 關於Hero＋關於段落（user 2026-11-25：Hero 分開）
  donate_folder: { folder: true, meta: { icon: 'folder', translations: zh('捐款') } },   // 捐款Hero＋捐款段落
  faculty_folder: { folder: true, meta: { icon: 'folder', translations: zh('師資') } },
  partners_folder: { folder: true, meta: { icon: 'folder', translations: zh('合作企業') } },
  pool_folder: { folder: true, meta: { icon: 'folder', translations: zh('庫') } },   // 人名庫、單位庫、媒體庫（user 2026-11-24：「應該要 grp 起來成資料夾的就都弄」）
  // 庫（user 2026-11-21，照 SCCD）：全站的人名／單位／媒體只在庫裡打一次，用到的地方從庫選；改一次全站跟著換
  people: {
    meta: { icon: 'person', group: 'pool_folder', translations: zh('人名庫'), display_template: '{{name_zh}} {{name_en}}', note: '全站的人名從這裡選（師資）。還有人用就刪不掉；重複的要合併' },
    fields: [...poolName, usedIn('faculty', '師資', '{{category}}')],
  },
  organizations: {
    meta: { icon: 'domain', group: 'pool_folder', translations: zh('單位庫'), display_template: '{{name_zh}} {{name_en}}', note: '全站的單位（公司、學校、主辦方）從這裡選（合作企業、榮譽的主辦方）。還有人用就刪不掉' },
    fields: [...poolName, usedIn('partners', '合作企業', '{{url}}'), usedIn('records', '榮譽（主辦方）', '{{title_zh}}'),
      // 師資的校外單位（多選、經過 junction faculty_external_units）＝反向的 M2M，看得到哪幾位老師在用
      { field: 'faculty_units', type: 'alias', meta: { special: ['m2m'], interface: 'list-m2m', readonly: true, width: 'full', translations: zh('用在：師資（校外單位）'),
        options: { template: '{{faculty_id.person.name_zh}}', enableCreate: false, enableSelect: false } } }],
  },
  media_outlets: {
    meta: { icon: 'newspaper', group: 'pool_folder', translations: zh('媒體庫'), display_template: '{{name_zh}} {{name_en}}', note: '報導的媒體從這裡選（榮譽與報導裡類型＝報導的那幾筆）。還有人用就刪不掉' },
    fields: [...poolName, usedIn('records', '報導（媒體）', '{{title_zh}}')],
  },
  // 介面文字（user 2026-11-21，照 SCCD ui_labels）：選單、頁名、固定的小標（專任教師、一年級、必修…）。一個 key 一筆，HTML 用 data-label="key" 標；
  // 前台抓不到＝照 HTML 原本的字。key 唯讀（前台照 key 找）；新 key 由 scripts/seed-directus.cjs 從 HTML 補（只補缺的、不蓋已經改過的）
  ui_labels: {
    meta: { icon: 'translate', translations: zh('介面文字'), display_template: '{{key}}', sort_field: 'sort', note: '選單、頁名、固定的小標等介面文字；key 不要改。' + EN_NOTE },
    fields: [sort, keyField,
      { ...dropdown('category', '分類', LABEL_CATS), meta: { ...dropdown('category', '分類', LABEL_CATS).meta, options: { choices: LABEL_CATS, allowOther: true }, note: '後台整理用，前台不看' } },
      str('zh', '中文'), strEn('en', '英文')],
  },
  // 網頁 icon（user 2026-11-24：「開一個資料夾，存放網頁的 icon」；照 SCCD 的 site_icons）：一個 icon 一筆、key＝website-icons/ 的檔名，
  // 檔案放檔案庫「網頁 icon」資料夾（下面設）。前台 site-assets.js 開頁後把同名的 icon 換成後台這張；抓不到＝照本地的檔
  site_icons: {
    meta: { icon: 'interests', translations: zh('網頁 icon'), display_template: '{{key}}', sort_field: 'sort', note: '全站的 icon（SVG）；換圖＝在那一筆換檔，畫在跟原本一樣的框裡（高 70、寬照原本那張），不然會被縮。key 不要改' },
    fields: [sort, keyField, { ...image('file', '檔案（SVG）'), meta: { ...image('file', '檔案（SVG）').meta, display: 'image' } }, str('note', '用在哪裡')],
  },
  footer: {
    meta: { icon: 'call_to_action', singleton: true, translations: zh('聯絡'), note: '聯絡頁（原本的頁尾）；只有這一筆，欄位留空＝前台那一塊不顯示' },
    fields: [
      // 聯絡資訊＝清單，同師資詳細頁的做法（user 2026-11-24：「聯絡的這個幫我做成跟老師內頁一樣，然後後臺可以 custom」「每個都有個 url，有寫就可以 jump 到那個 url」）：
      // 子集合 footer_sections，一個清單＝標題＋一筆一筆（文字＋選填的連結），可以自己加。原本是寫死的五格 email／tel／fax／address_zh／address_en、
      // 標題在介面文字 contact.*：搬成四個清單，那四個介面文字刪了；舊的五格 2026-11-25 刪了（user：「沒用到的slot可以去掉了」）。
      // 表單順序＝聯絡頁由上往下：社群（IG、YouTube）→ 聯絡資訊 → 標章（user 2026-11-25：「結構跟順序對不對」）
      // 社群＝IG、YouTube 各一格網址（user 2026-11-24：「只需要這個 icon 即可，不需要兩個 icon」「我加了一個 yt，幫我放在 ig 的右邊」；原本的 social 重複列 2026-11-25 刪了）
      url('instagram', 'Instagram 網址', '聯絡頁那個 IG icon 連到這裡（https://）；留空＝不出 icon'),
      url('youtube', 'YouTube 網址', '聯絡頁 IG 右邊那個 YouTube icon 連到這裡（https://）；留空＝不出 icon'),
      { field: 'sections', type: 'alias', meta: { special: ['o2m'], interface: 'list-o2m', width: 'full', translations: zh('聯絡資訊（電子郵件、電話…可以自己加）'),
        note: '一個清單＝標題＋一筆一筆（文字＋選填的連結），可以自己新增、拖曳排序；裡面一筆都沒有的清單前台不出', options: { template: '{{title_zh}}', enableCreate: true, enableSelect: false } } },
      image('badge', '標章', '圖片替代文字＝檔案標題（在檔案庫改）'),
    ],
  },
  footer_sections: {
    meta: { icon: 'format_list_bulleted', translations: zh('聯絡資訊的清單'), display_template: '{{title_zh}}', sort_field: 'sort', hidden: true, note: '從「聯絡」裡面新增' },
    fields: [sort, { field: 'footer', type: 'integer', meta: { hidden: true, interface: 'select-dropdown-m2o', translations: zh('所屬頁') }, schema: { is_nullable: true } },
      str('title_zh', '標題（中，例：電子郵件）'), strEn('title_en', '標題（英）'),
      repeater('entries', '內容', [['text_zh', '文字（中）'], ['text_en', '文字（英）'], ['url', '連結（選填）']], '{{text_zh}}',
        '一列一筆。連結有填＝那一筆可以點：https:// 開頭的網址（另開新視窗）、mailto:信箱、tel:電話；直接貼信箱也可以。' + EN_NOTE)],
    relations: [{ collection: 'footer_sections', field: 'footer', related_collection: 'footer', meta: { one_field: 'sections', sort_field: 'sort', one_deselect_action: 'delete' }, schema: { on_delete: 'CASCADE' } }],
  },
  // 動態、入學、首頁的 news 各一個集合（user 2026-11-24：「news 是 news，動態是 activities」、「動態的資料庫不需要有入學的打勾」；
  // 原本動態＋入學共用 news、勾「入學」才列在入學頁，首頁那串叫 home_news）。日期、時間都用選的（同一天：不要手動輸入）
  activities: {
    meta: { icon: 'event', translations: zh('動態'), display_template: '{{title_zh}}', note: '動態頁，前台照「日期」第一段的開始新到舊' },
    // 副標（user 2026-11-24：「參照 sccd 的設計…不會有什麼分類…這應該是改成副標才對」）＝同 SCCD 活動的 subtitles、同這站師資／合作企業的那種重複列：
    // 標題下面一筆一行、沒填＝只有標題。原本是一格「分類」category_zh／_en（招生、講座、參訪…）：後台的欄位刪了——別再寫回來，重跑這支會把它建回去
    // 日期照 SCCD 的活動（user 2026-11-25：「動態的日期，前臺跟後臺都調整跟sccd的一樣」）：重複列 dates、取消 cancelled（見上面 activityDates）。
    // 原本是 date＋end_date（同入學的 when）：資料搬進 dates、那兩格 2026-11-25 從後台刪了（別寫回來）
    fields: [activityDates, bool('cancelled', '取消', '活動取消（勾了＝前台日期那行換成「取消／Canceled」）'), str('title_zh', '標題（中）', {}, 'full'), strEn('title_en', '標題（英）'),
      subtitles,
      // 地點可以好幾個、影片連結（user 2026-11-24，照 SCCD 活動的 locations／videoLinks：「影片要有，因爲要做影片渲染，如果有的話。地點也是可以先做吧」）。
      // 地點原本是一格 place_zh／_en：搬成第一筆、舊欄位刪了（同上，別寫回來）
      // 城市（user 2026-11-25：「地點加上城市中英，是一個slot。渲染就是跟在地點後面，（）半型全型再根據語言調整」「城市的是手動key的文字」「動態不需要國家」）：
      // 前台中文「地點（城市）」全形、英文「place (city)」半形。這支只加不改＝已經建好的後台那一格是另外 PATCH /fields/activities/locations 補的子欄位
      repeater('locations', '地點（選填）', [['name_zh', '地點（中）'], ['name_en', '地點（英）'], ['city_zh', '城市（中，選填）'], ['city_en', '城市（英，選填）']],
        '{{name_zh}} {{city_zh}}', '一筆＝點開後時間下面的一行，可以好幾個、可拖曳排序。城市有填＝接在地點後面的括號裡：中文「地點（城市）」全形、英文「place (city)」半形。' + EN_NOTE),
      image('image', '圖片（那一列的縮圖）'), files('album', '相簿', '點開那則的照片，一排橫捲；可拖曳排序'),
      repeater('videos', '影片（選填）', [['url', '影片連結']], '{{url}}',
        '一列一支：YouTube 連結（https://youtu.be/…、https://www.youtube.com/watch?v=…），也可以貼直連的影片檔（.mp4、.m3u8）。排在相簿的照片前面、點了在放大畫面播')],
  },
  activities_album: junction('activities', 'album'),
  admission: {
    meta: { icon: 'school', translations: zh('入學'), display_template: '{{date}} {{title_zh}}', note: '入學頁，依日期新到舊；首頁的 news 可以連到這裡的某一則' },
    fields: [...when, str('title_zh', '標題（中）', {}, 'full'), strEn('title_en', '標題（英）'),
      multi('summary_zh', '說明（中，選填，點開的第一段）'), multi('summary_en', '說明（英，選填）', { note: EN_NOTE }),
      files('album', '相簿', '點開那則的照片，一排橫捲；可拖曳排序'), files('attachments', '附件', '點開的附件，一個檔一個連結、連結文字＝檔案標題')],
  },
  admission_album: junction('admission', 'album'),
  admission_attachments: junction('admission', 'attachments'),
  // 首頁的 news：首頁點底列展開的那串＋底列跑馬燈，照拖曳順序。
  // 點了去哪＝照 SCCD 的首頁 news：外部網址 url，或入學頁的某一則 admission_item；兩格互鎖；都沒填＝不能點
  news: {
    meta: { icon: 'newspaper', group: 'home_folder', translations: zh('News'), display_template: '{{title_zh}}', sort_field: 'sort',
      note: '首頁點底列展開的那串、底列跑馬燈：照拖曳順序、前 8 則。點了去哪＝外部連結或入學頁的某一則，二選一' },
    // 說明 summary_*：user 2026-11-24 在後台刪了（首頁那串只有標題）——別再寫回來，重跑這支會把它建回去
    fields: [sort, str('title_zh', '標題（中）', {}, 'full'), strEn('title_en', '標題（英）'),
      image('image', '圖片（標題上面那格）'),
      str('url', '外部連結（選填）', { note: 'https:// 開頭，點了另開新視窗；跟「入學頁的哪一則」二選一', conditions: LOCK('admission_item', '已經選了入學頁的哪一則') }),
      { field: 'admission_item', type: 'integer', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half', translations: zh('入學頁的哪一則（選填）'),
        note: '點了到入學頁、打開那一則；跟外部連結二選一', conditions: LOCK('url', '已經填了外部連結'),
        options: { template: '{{title_zh}}', enableCreate: false, enableSelect: true }, display: 'related-values', display_options: { template: '{{title_zh}}' } },
        schema: { is_nullable: true } }],
    relations: [{ collection: 'news', field: 'admission_item', related_collection: 'admission', schema: { on_delete: 'SET NULL' } }],
  },
  // 首頁影片（user 2026-11-23：影片也要在後台，「首頁」資料夾裡放 news＋影片）：底列 ▶ 鈕點了播的那一支（chrome.js openIntro），只有一筆
  home_video: {
    meta: { icon: 'smart_display', singleton: true, group: 'home_folder', translations: zh('首頁影片'), note: '首頁底列 ▶ 鈕點了播的那一支；沒填＝點了不會開' },
    fields: [str('url', '影片連結', { note: 'YouTube 連結（例 https://youtu.be/xxxxxxxxxxx、https://www.youtube.com/watch?v=…）；也可以貼直連的影片檔網址（.mp4、.m3u8）' }, 'full')],
  },
  faculty: {
    meta: { icon: 'school', group: 'faculty_folder', translations: zh('師資名單'), display_template: '{{person.name_zh}} {{person.name_en}}', sort_field: 'sort', note: '列表依「類別」分段；名字從人名庫選；副標跟語言切（英文留空＝英文版顯示中文）' },
    fields: [sort, dropdown('category', '類別', FACULTY_CATS), image('photo', '照片'),
      pick('person', '姓名（人名庫）', 'people'),
      // 職稱分兩格（user 2026-11-25：「老師要加上校内職級及校外單位兩個選項，前者是key的，後者是從庫裏面選，跟sccd一樣」＝SCCD 的 internalTitles／occupationItems）：
      // 校內職級＝手打清單；校外單位＝從單位庫多選（SCCD 是職業庫或單位庫，這站只有單位庫）。前台名字下面一行一個：校內職級 → 校外單位 → 副標
      repeater('internal_titles', '校內職級', [['title_zh', '職級（中）'], ['title_en', '職級（英）']], '{{title_zh}} {{title_en}}',
        '手打（教授、副教授、主任…），可多筆、可拖曳排序；前台照這個順序、接在名字下面。' + EN_NOTE),
      { field: 'external_units', type: 'alias', meta: { special: ['m2m'], interface: 'list-m2m', width: 'full', translations: zh('校外單位（單位庫）'),
        note: '從單位庫選，可多選、可拖曳排序；沒有就在選單裡新增（會一起加進庫）。前台接在校內職級下面',
        options: { template: '{{organizations_id.name_zh}} {{organizations_id.name_en}}', enableCreate: true, enableSelect: true },
        display: 'related-values', display_options: { template: '{{organizations_id.name_zh}}' } } },
      subtitles,   // 原本是單一欄位 affiliation_zh／_en（任職單位）
      // 詳細頁的清單（user 2026-11-24：「跟關於一樣，我們可以自己加 list，然後自己去編輯裏面的內容」）＝子集合 faculty_sections，一個清單＝標題＋一筆一筆。
      // 原本是寫死的六格重複列 education／experience／expertise／exhibitions／awards／publications、標題在介面文字 faculty.cv.*：
      // 學歷、經歷搬成每位老師的前兩個清單，其餘四格 user 說刪掉（後台的欄位、那六個介面文字都刪了）
      { field: 'sections', type: 'alias', meta: { special: ['o2m'], interface: 'list-o2m', width: 'full', translations: zh('清單（學歷、經歷…可以自己加）'),
        note: '詳細頁名字下面的清單：一個清單＝標題＋一筆一筆（年份＋說明），可以自己新增、拖曳排序；裡面一筆都沒有的清單前台不出', options: { template: '{{title_zh}}', enableCreate: true, enableSelect: false } } }],
  },
  // 校外單位（faculty.external_units）的 junction：老師 ↔ 單位庫，照拖曳順序。單位那邊 RESTRICT＝還有老師用就刪不掉（同其他庫）
  faculty_external_units: {
    meta: { hidden: true, icon: 'import_export' },
    fields: [{ field: 'faculty_id', type: 'integer', meta: { hidden: true }, schema: {} }, { field: 'organizations_id', type: 'integer', meta: { hidden: true }, schema: {} }, sort],
    relations: [
      { collection: 'faculty_external_units', field: 'organizations_id', related_collection: 'organizations', meta: { one_field: 'faculty_units', junction_field: 'faculty_id' }, schema: { on_delete: 'RESTRICT' } },
      { collection: 'faculty_external_units', field: 'faculty_id', related_collection: 'faculty', meta: { one_field: 'external_units', junction_field: 'organizations_id', sort_field: 'sort', one_deselect_action: 'delete' }, schema: { on_delete: 'CASCADE' } },
    ],
  },
  faculty_sections: {
    meta: { icon: 'format_list_bulleted', translations: zh('師資的清單'), display_template: '{{title_zh}}', sort_field: 'sort', hidden: true, note: '從「師資名單」的老師裡面新增' },
    fields: [sort, { field: 'faculty', type: 'integer', meta: { hidden: true, interface: 'select-dropdown-m2o', translations: zh('所屬老師') }, schema: { is_nullable: true } },
      str('title_zh', '清單標題（中，例：學歷）'), strEn('title_en', '清單標題（英）'),
      entries('entries', '內容（一筆＝年份＋說明；年份可以不填）')],
    relations: [{ collection: 'faculty_sections', field: 'faculty', related_collection: 'faculty', meta: { one_field: 'sections', sort_field: 'sort', one_deselect_action: 'delete' }, schema: { on_delete: 'CASCADE' } }],
  },
  partners: {
    meta: { icon: 'handshake', group: 'partners_folder', translations: zh('合作企業名單'), display_template: '{{organization.name_zh}}', sort_field: 'sort', note: '企業名稱從單位庫選' },
    fields: [sort, image('logo', 'Logo'), pick('organization', '企業（單位庫）', 'organizations'),
      subtitles,   // 原本是一段 description_zh／_en（合作內容）
      url('url', '企業網站（整列可點、另開新視窗；空＝不可點）')],
  },
  // 每一頁的 Hero（導言）：顯示名「○○Hero」是 user 在後台自己改的（原本叫師資頁、合作企業頁）
  faculty_page: hero('faculty_folder', '師資'),
  partners_page: hero('partners_folder', '合作企業'),
  about_page: hero('about_folder', '關於'),
  donate_page: hero('donate_folder', '捐款'),
  courses: {
    meta: { icon: 'menu_book', translations: zh('課程'), display_template: '{{year}} {{name_zh}}', sort_field: 'sort', note: '課程頁依年級分段、同年級照拖曳順序' },
    fields: [sort, { ...dropdown('year', '年級', YEARS), type: 'integer' }, { ...dropdown('category', '必修／選修', COURSE_TYPES), schema: { default_value: 'required', is_nullable: false } },
      str('name_zh', '課程名稱（中）'), strEn('name_en', '課程名稱（英）'),
      multi('description_zh', '課程說明（中，課程頁點開那一段）'), multi('description_en', '課程說明（英）', { note: EN_NOTE })],
  },
  // 常見問題 qa（分類、問題、回答）：user 2026-11-25 整頁拿掉、後台的集合也刪了（「QA這一頁可以拿掉了，包含後臺」）
  // 規章與政策（user 2026-11-22：一頁一個單例，照 SCCD；只放連結、不上傳檔案）：上面規章／表單清單、下面條款這種文字段落
  regulations: {
    meta: { icon: 'gavel', singleton: true, translations: zh('規章與政策'), note: '上面是規章、表單（依分類分段、整列外連），下面是使用條款、隱私權政策這種文字段落（段落裡可以加小節，同關於）' },
    fields: [repeater('items', '規章、表單', [['category_zh', '分類（中，例 學程規章、表單下載）'], ['category_en', '分類（英）'], ['title_zh', '名稱（中）'], ['title_en', '名稱（英）'],
      ['subtitles_zh', '副標（中，一行一個，例 2026.08 修訂）', 'text'], ['subtitles_en', '副標（英，一行一個）', 'text'], ['url', '連結（整列外連、另開新視窗；空＝不能點）']],
    '{{category_zh}}／{{title_zh}}', '一列一筆、可拖曳排序；分類一樣的排在同一段（照第一次出現的順序）。' + EN_NOTE), sectionList],
  },
  // 條款那幾段＝同關於：段落是子集合、段落裡有小節（user 2026-11-24）。原本的 sections 是重複列（JSON，內文一整段 rich text）——同名、要先刪才建得了上面那一格，
  // 正式後台 2026-11-24 把那兩段（使用條款、隱私權政策）搬成新的段落（內文 → 說明）後刪了（同捐款，user：「搬完後刪掉」）
  ...pageSections('regulations', '規章與政策'),
  // 榮譽與報導（user 2026-11-25：「後臺資料庫上，將榮譽跟報導兩者合在一起，要可以上傳圖片，但兩者打開來都會是accordion」；前台的報導頁同一天拿掉、都列在榮譽頁）：
  // 一筆一個摺疊；收著＝國旗＋標題＋類型（榮譽／報導，前台當副標，名字在介面文字 records.type.*），點開＝主辦方（榮譽）／媒體（報導）＋內容（一筆一行：得獎人、獎別、刊出日期…）＋圖片。
  // 主辦方、媒體從庫選（user 同一天：「要，從庫裏面選」；先做成全部打在「內容」裡）：主辦方＝單位庫、只在類型＝榮譽時出現；媒體＝媒體庫、只在類型＝報導時出現。
  // 原本（user 2026-11-19）只有榮譽：award_*／winner_*／prize_* 各一格——標題搬到 title_*、得獎人與獎別搬成「內容」的一筆一筆，舊的那幾格 2026-11-25 刪了。
  // 報導原本自己一個集合 press（date、title_*、media、screenshot）：資料搬進這裡（媒體照舊從媒體庫、截圖放進圖片）、集合刪了（user：「這個集合可以刪掉了」）
  // 類型不用選（user 2026-11-25 稍晚：「如果是寫標題的話，就會是award，如果是從庫裏面選的話，則是press，二選一」）：寫了獎項名稱＝榮譽、從媒體庫選了媒體＝報導
  // （那一列的標題＝媒體的名字，報導標題、刊出日期寫在「內容」），兩格互鎖（LOCK）、報導沒有主辦方；前台照有沒有選媒體分。
  // 原本另外有一格下拉「類型」category（award／press）＋報導的標題也是自己打：那一格刪了，舊的報導把標題搬成內容的第一行
  records: {
    meta: { icon: 'emoji_events', translations: zh('紀錄'), display_template: '{{title_zh}}{{media.name_zh}}', sort_field: 'sort',
      note: '紀錄頁的清單：榮譽、報導都在這裡，照拖曳順序。寫「獎項名稱」＝榮譽、從「媒體」選＝報導（二選一，不用另外選類型）；點開＝主辦方（榮譽）＋內容＋圖片。國旗照國家' },
    fields: [sort,
      // 國家＝下拉、所有國家都可以選（user 2026-11-25：「國家改成跟sccd一樣的drop down，預設是所有國家都可以選」；原本手打兩碼）：
      // 選項＝SCCD 後台 people.country 那一份（scripts/country-choices.json，249 國、常用的在前），存 ISO 兩碼小寫＝前台照舊照它抓國旗。
      // 這支只加不改＝已經建好的那一格是另外 PATCH /fields/records/country_code 換成下拉的
      { ...dropdown('country_code', '國家', COUNTRIES), meta: { ...dropdown('country_code', '國家', COUNTRIES).meta, options: { choices: COUNTRIES, allowNone: true },
        note: '前台照它放國旗（國名給報讀，前台自己生）；沒選＝那一列沒有國旗' } },
      // 原本還有 country_zh／country_en（國名、給報讀念）：前台改用瀏覽器內建的國名（Intl.DisplayNames），2026-11-25 從後台刪了（user：「這個不需要寫在後臺」；別寫回來）
      str('title_zh', '獎項名稱（中）——寫了＝榮譽', { note: '寫這一格＝這一筆是榮譽。報導不要寫這裡，改從「媒體」那一格選（二選一：選了媒體，這格會鎖住）', conditions: LOCK('media', '已經選了媒體＝報導') }, 'full'),
      str('title_en', '獎項名稱（英）', { note: EN_NOTE, conditions: LOCK('media', '已經選了媒體＝報導') }),
      COND(pick('media', '媒體（媒體庫）——選了＝報導', 'media_outlets',
        '選了＝這一筆是報導，那一列的標題就是媒體的名字（報導標題、刊出日期寫在下面的「內容」）。跟獎項名稱二選一：寫了獎項名稱，這格會鎖住。沒有就在選單裡新增（會一起加進庫）'), LOCK('title_zh', '已經寫了獎項名稱＝榮譽')),
      COND(pick('organizer', '主辦方（單位庫，榮譽才有）', 'organizations'), [{ name: '報導沒有主辦方', rule: { media: { _nnull: true } }, hidden: true }]),
      repeater('details', '內容（點開後，一筆一行）', [['text_zh', '內容（中）'], ['text_en', '內容（英）']], '{{text_zh}}', '點開後一筆一行，可拖曳排序；沒填＝不出。榮譽：得獎人、獎別…（排在主辦方下面）；報導：報導標題、刊出日期…。' + EN_NOTE),
      files('album', '圖片', '點開那則的圖片（得獎照片、報導截圖…），一排橫捲、點了放大；可拖曳排序')],
  },
  records_album: junction('records', 'album'),
  // 文字頁（user 2026-11-22：每頁一個單例，照 SCCD；原本全部擠在一個「文字頁」pages、捐款找不到）。頁名在「介面文字」nav.<slug>
  // 關於、捐款的單例只剩段落（導言＝同一個資料夾的 about_page／donate_page，user 2026-11-25）
  about: {
    meta: { icon: 'info', singleton: true, group: 'about_folder', translations: zh('關於段落'), note: '段落；段落標題＝左側段落導覽，段落可以放輪播圖。頁面最上面那段導言在同一個資料夾的「關於Hero」' },
    fields: [{ field: 'sections', type: 'alias', meta: { special: ['o2m'], interface: 'list-o2m', width: 'full', translations: zh('段落'), options: { template: '{{title_zh}}', enableCreate: true, enableSelect: false } } }],
  },
  about_sections: {
    meta: { icon: 'segment', translations: zh('關於的段落'), display_template: '{{title_zh}}', sort_field: 'sort', hidden: true, note: '從「關於」裡面新增' },
    fields: [sort, { field: 'about', type: 'integer', meta: { hidden: true, interface: 'select-dropdown-m2o', translations: zh('所屬頁') }, schema: { is_nullable: true } },
      str('title_zh', '段落標題（中）'), strEn('title_en', '段落標題（英）'),
      files('images', '段落圖片（輪播）', '標題下面那排輪播，可拖曳排序；沒放＝不出輪播'),
      // 說明（user 2026-11-23）：段落圖片下面、小節上面那段
      multi('description_zh', '說明（中，選填：段落圖片下面那段）', { note: '純文字：換行照留、空一行＝分段' }), multi('description_en', '說明（英）', { note: EN_NOTE }),
      // 小節（user 2026-11-23：不要一整段 rich text，標題＋純文字、可以一直加；同一天又要每個小節放一張圖＋附註 → 重複列放不了檔案 → 子集合 about_subsections）。
      // 表單的順序＝前台由上往下（新建的照這裡的順序；正式後台是後來補的欄位，2026-11-23 手動排過 sort）
      { field: 'subsections', type: 'alias', meta: { special: ['o2m'], interface: 'list-o2m', width: 'full', translations: zh('小節'), note: '一個小節＝標題、圖片、內文、附註（都可以不填），可拖曳排序',
        options: { template: '{{title_zh}} {{text_zh}}', enableCreate: true, enableSelect: false } } },
      // 年表（user 2026-11-23：沿革要跟老師的詳細頁一樣，年份＋文字一筆一筆加）＝同師資的學歷那種重複列；前台排在小節後面
      entries('timeline', '年表（年份＋文字，沿革那種）')],
    relations: [{ collection: 'about_sections', field: 'about', related_collection: 'about', meta: { one_field: 'sections', sort_field: 'sort', one_deselect_action: 'delete' }, schema: { on_delete: 'CASCADE' } }],
  },
  about_sections_images: junction('about_sections', 'images'),
  about_subsections: {
    meta: { icon: 'subject', translations: zh('關於的小節'), display_template: '{{title_zh}} {{text_zh}}', sort_field: 'sort', hidden: true, note: '從「關於」的段落裡面新增' },
    fields: [sort, { field: 'section', type: 'integer', meta: { hidden: true, interface: 'select-dropdown-m2o', translations: zh('所屬段落') }, schema: { is_nullable: true } },
      str('title_zh', '小節標題（中，選填）'), strEn('title_en', '小節標題（英）'),
      files('images', '圖片（選填，可以多張）', '標題下面、內文上面；一張＝照原比例放在內文欄正中，多張＝輪播（同段落圖片），可拖曳排序'),
      multi('text_zh', '內文（中）', { note: '純文字：換行照留、空一行＝分段' }), multi('text_en', '內文（英）', { note: EN_NOTE }),
      multi('note_zh', '附註（中，選填：小節最後一行小字）'), multi('note_en', '附註（英）', { note: EN_NOTE })],
    relations: [{ collection: 'about_subsections', field: 'section', related_collection: 'about_sections', meta: { one_field: 'subsections', sort_field: 'sort', one_deselect_action: 'delete' }, schema: { on_delete: 'CASCADE' } }],
  },
  about_subsections_images: junction('about_subsections', 'images'),
  // 捐款＝同關於（user 2026-11-24：「捐款頁面應該比照 about 的去調整」；原本段落是重複列、內文一整段 rich text）：段落子集合（輪播、說明、小節、年表）、小節子集合。
  // 只是不帶關於那幾個藏起來的舊欄位。原本的 sections（JSON 重複列）2026-11-24 刪掉、兩段的內文搬成「說明」
  donate: {
    meta: { icon: 'volunteer_activism', singleton: true, group: 'donate_folder', translations: zh('捐款段落'), note: '段落；段落標題＝左側段落導覽，段落可以放輪播圖。頁面最上面那段導言在同一個資料夾的「捐款Hero」' },
    fields: [{ field: 'sections', type: 'alias', meta: { special: ['o2m'], interface: 'list-o2m', width: 'full', translations: zh('段落'), options: { template: '{{title_zh}}', enableCreate: true, enableSelect: false } } }],
  },
  donate_sections: {
    meta: { icon: 'segment', translations: zh('捐款的段落'), display_template: '{{title_zh}}', sort_field: 'sort', hidden: true, note: '從「捐款」裡面新增' },
    fields: [sort, { field: 'donate', type: 'integer', meta: { hidden: true, interface: 'select-dropdown-m2o', translations: zh('所屬頁') }, schema: { is_nullable: true } },
      str('title_zh', '段落標題（中）'), strEn('title_en', '段落標題（英）'),
      files('images', '段落圖片（輪播）', '標題下面那排輪播，可拖曳排序；沒放＝不出輪播'),
      multi('description_zh', '說明（中，選填：段落圖片下面那段）', { note: '純文字：換行照留、空一行＝分段' }), multi('description_en', '說明（英）', { note: EN_NOTE }),
      { field: 'subsections', type: 'alias', meta: { special: ['o2m'], interface: 'list-o2m', width: 'full', translations: zh('小節'), note: '一個小節＝標題、圖片、內文、附註（都可以不填），可拖曳排序',
        options: { template: '{{title_zh}} {{text_zh}}', enableCreate: true, enableSelect: false } } },
      entries('timeline', '年表（年份＋文字，沿革那種）')],
    relations: [{ collection: 'donate_sections', field: 'donate', related_collection: 'donate', meta: { one_field: 'sections', sort_field: 'sort', one_deselect_action: 'delete' }, schema: { on_delete: 'CASCADE' } }],
  },
  donate_sections_images: junction('donate_sections', 'images'),
  donate_subsections: {
    meta: { icon: 'subject', translations: zh('捐款的小節'), display_template: '{{title_zh}} {{text_zh}}', sort_field: 'sort', hidden: true, note: '從「捐款」的段落裡面新增' },
    fields: [sort, { field: 'section', type: 'integer', meta: { hidden: true, interface: 'select-dropdown-m2o', translations: zh('所屬段落') }, schema: { is_nullable: true } },
      str('title_zh', '小節標題（中，選填）'), strEn('title_en', '小節標題（英）'),
      files('images', '圖片（選填，可以多張）', '標題下面、內文上面；一張＝照原比例放在內文欄正中，多張＝輪播（同段落圖片），可拖曳排序'),
      multi('text_zh', '內文（中）', { note: '純文字：換行照留、空一行＝分段' }), multi('text_en', '內文（英）', { note: EN_NOTE }),
      multi('note_zh', '附註（中，選填：小節最後一行小字）'), multi('note_en', '附註（英）', { note: EN_NOTE })],
    relations: [{ collection: 'donate_subsections', field: 'section', related_collection: 'donate_sections', meta: { one_field: 'subsections', sort_field: 'sort', one_deselect_action: 'delete' }, schema: { on_delete: 'CASCADE' } }],
  },
  donate_subsections_images: junction('donate_subsections', 'images'),
  // 作品頁（user 2026-11-23）：影片＝貼 YouTube 播放清單（可以好幾個，前台用 Data API 拆成一支一支）；
  // 圖片＝多圖欄位（user 2026-11-24：「除了 yt playlist 也可以上傳多張照片」；原本是檔案庫「作品」資料夾裡的圖——12 的 Core 集合上限快滿、省一張 junction，v11 沒有上限了），上傳的檔放進「作品」資料夾（下面設）
  works: {
    meta: { icon: 'movie', singleton: true, translations: zh('作品'), note: '作品頁：影片＝下面貼的 YouTube 播放清單；圖片＝下面「圖片」，一次可以傳很多張。前台每次進來順序都打亂' },
    fields: [repeater('playlists', 'YouTube 播放清單', [['url', '播放清單網址（含 list=）']], '{{url}}', '一列一個播放清單、可以好幾個；清單裡的影片會一支一支出現（私人、已刪除的不會）'),
      files('images', '圖片', '一次可以選很多張；替代文字＝檔案的「描述」（點圖進去改）')],
  },
  works_images: junction('works', 'images'),
  // 即將推出（user 2026-11-25：「後臺想加上coming soon的效果，如果有checked的話，那麽應該是在這個page上加上coming soon的字眼（英中分開，且可以在ui label編輯這個文字）。
  // 但是hero的文字還是需要渲染」，問過＝這六頁）：一頁一格勾選；勾了＝那一頁的 Hero（導言）照出、下面的內容收起來，Hero 下面剩的那塊正中一行字（介面文字 page.coming-soon）。
  // 前台 js/modules/ui/coming-soon.js（欄位名＝頁的 slug）
  coming_soon: {
    meta: { icon: 'hourglass_empty', singleton: true, translations: zh('即將推出'), note: '勾了的頁＝Hero（導言）照出、下面的內容先收起來，換成一行「即將推出」（字在「介面文字」的 page.coming-soon 改）' },
    fields: [['partners', '合作企業'], ['works', '作品'], ['activities', '動態'], ['records', '紀錄'], ['admission', '入學'], ['regulations', '規章與政策']].map(([f, l]) => bool(f, l, '即將推出')),
  },
};
const WORKS_FOLDER = '作品';   // 作品的圖片欄位上傳到這個資料夾（只是放的地方，前台不看資料夾）
// 已經建好的集合要更新的設定（顯示名稱改吃庫裡的名字；師資、合作企業、庫收進資料夾；頁尾改叫聯絡；作品的說明）
const META = ['faculty', 'partners', 'footer', 'people', 'organizations', 'media_outlets', 'works', 'about', 'donate', 'regulations', 'records'];
// 後台側欄的順序＝前台選單（user 2026-11-23）：首頁 → 主選單 → 次選單 → 庫（資料夾）、介面文字；資料夾裡＝頁面的 Hero（導言）→ 名單／段落。
// 網站地圖沒有內容；藏起來的（段落、小節、junction）不用排
const NAV = ['home_folder', 'news', 'home_video', 'about_folder', 'about_page', 'about', 'partners_folder', 'partners_page', 'partners', 'faculty_folder', 'faculty_page', 'faculty', 'courses', 'works', 'activities', 'records',
  'admission', 'regulations', 'donate_folder', 'donate_page', 'donate', 'footer', 'pool_folder', 'people', 'organizations', 'media_outlets', 'ui_labels', 'site_icons', 'coming_soon'];
const ICON_FOLDER = '網頁 icon';   // 網頁 icon 的檔放這個資料夾
// 網頁 icon 每一筆的「用在哪裡」（後台看的；沒寫＝空白）
const ICON_NOTES = { play: '播放（底列 play 鈕、作品影片）', back: '返回鈕、上一個', next: '下一個', pause: '暫停', loud: '音量鈕（大聲）', half: '音量鈕（一半以下）',
  silence: '音量鈕（靜音）', fullscreen: '全螢幕', close: '關閉（放影片時）', day: '深色模式鈕（深色時轉半圈＝night）', slideshow: '作品頁的排法：放映', grid: '作品頁的排法：總覽',
  volume: '音量拉桿那排直條', ig: '聯絡頁的 Instagram', yt: '聯絡頁的 YouTube（IG 右邊）',
  news: '首頁展開動態時底部正中那顆（點了收回去）', shrink: '全螢幕中的全螢幕鈕（離開全螢幕）', share: '外部連結的清單列 hover 收完那一顆', doc: '入學附件名字左邊那顆' };
// 後台清單的預設檢視（照 SCCD）：介面文字照分類排＝同一類聚在一起；網頁 icon 看得到縮圖
const PRESETS = {
  ui_labels: { tabular: { sort: ['category', 'sort'], fields: ['category', 'key', 'zh', 'en'] } },
  site_icons: { tabular: { sort: ['sort'], fields: ['file', 'key', 'note'] } },
};

// contact.html（聯絡頁，原本的 footer）目前的示意值：singleton 建好後第一筆就是這些，前台畫面不變（接真資料時在後台改）
const FOOTER_MOCK = {
  sections: [['電子郵件', 'E-Mail', 'scaid@g2.usc.edu.tw', '', 'mailto:scaid@g2.usc.edu.tw'], ['電話', 'Tel', '02 0000 0000（示意）', '02 0000 0000 (placeholder)', ''],
    ['傳真', 'Fax', '02 0000 0000（示意）', '02 0000 0000 (placeholder)', ''], ['地址', 'Address', '地址（示意）', 'Address (placeholder)', '']]
    .map(([title_zh, title_en, text_zh, text_en, url], i) => ({ sort: i + 1, title_zh, title_en, entries: [{ text_zh, text_en, url }] }))
    // 單位（設計學院、姊妹系所…）＝沒有標題的那一個清單（原本另一格 links，2026-11-25 刪了）
    .concat({ sort: 5, title_zh: null, title_en: null, entries: [['設計學院', 'College of Design', 'https://www.scdesign.usc.edu.tw/'], ['媒體傳達設計學系', 'Department of Communications Design', 'https://sccd.usc.edu.tw/'],
    ['服裝設計學系', 'Department of Fashion Design', 'https://scfd.usc.edu.tw/'], ['工業產品設計學系', 'Department of Industrial Design', 'https://scid.usc.edu.tw/'],
    ['建築設計學系', 'Department of Architecture', 'https://www.arch.usc.edu.tw/'], ['建築職人學程', 'SCAC Program', 'https://www.arch.usc.edu.tw/'],
    ['實踐大學', 'Shih Chien University', 'https://www.usc.edu.tw/']].map(([text_zh, text_en, url]) => ({ text_zh, text_en, url })) }),
  instagram: 'https://www.instagram.com/',
  youtube: 'https://www.youtube.com/',
};

async function ensureCollection(name, s) {
  if (await get(`/collections/${name}`)) console.log(`= ${name} 已存在`);
  else { console.log(`+ 建 ${name}`); await api('POST', '/collections', s.folder ? { collection: name, meta: s.meta, schema: null } : { collection: name, meta: s.meta, schema: {}, fields: [pk] }); }
  if (s.folder) return;
  const have = DRY ? new Set() : new Set(((await get(`/fields/${name}`)) || []).map(f => f.field));
  for (const { pool, ...f } of s.fields) if (!have.has(f.field)) { console.log(`  + 欄位 ${name}.${f.field}`); await api('POST', `/fields/${name}`, f); }
  // 圖片／檔案欄位要掛到 directus_files 才會顯示選圖器
  for (const f of s.fields) if (f.meta?.special?.includes('file')) await ensureRelation({ collection: name, field: f.field, related_collection: 'directus_files', schema: { on_delete: 'SET NULL' } });
  // 從庫選：庫那邊的反向欄位（用在：○○）＝這個集合的名字
  for (const f of s.fields) if (f.pool) await ensureRelation({ collection: name, field: f.field, related_collection: f.pool, meta: { one_field: name }, schema: { on_delete: 'RESTRICT' } });
  for (const r of s.relations || []) await ensureRelation(r);
}
// 已經建好的集合：顯示名稱、說明照 SPEC 更新（只動 SPEC 有寫、跟後台不一樣的那幾項）
async function ensureMeta(name) {
  const cur = (await get(`/collections/${name}`))?.meta || {}, want = SPEC[name].meta;
  const val = (k, m) => k === 'translations' ? (m[k] || []).map(t => t.translation).join() : m[k];
  const diff = Object.fromEntries(['display_template', 'note', 'group', 'translations'].filter(k => want[k] !== undefined && val(k, cur) !== val(k, want)).map(k => [k, want[k]]));
  if (Object.keys(diff).length) { console.log(`  ~ ${name} 設定 ${Object.keys(diff).join('、')}`); await api('PATCH', `/collections/${name}`, { meta: diff }); }
}
async function ensureOrder() {
  for (const [i, name] of NAV.entries()) {
    const cur = (await get(`/collections/${name}`))?.meta;
    if (cur && cur.sort !== i + 1) { console.log(`  ~ ${name} 排第 ${i + 1}`); await api('PATCH', `/collections/${name}`, { meta: { sort: i + 1 } }); }
  }
}
async function ensureRelation(r) {
  if (await get(`/relations/${r.collection}/${r.field}`)) return;
  console.log(`  + 關聯 ${r.collection}.${r.field} → ${r.related_collection}`); await api('POST', '/relations', r);
}
// 檔案庫資料夾：沒有就建；那個欄位上傳的檔放進這個資料夾（不然全擠在檔案庫最外層）
async function ensureFolder(name, collection, field) {
  let f = ((await get(`/folders?filter[name][_eq]=${encodeURIComponent(name)}`)) || [])[0];
  if (!f) { console.log(`+ 檔案庫資料夾「${name}」`); f = await api('POST', '/folders', { name }); }
  const cur = f && await get(`/fields/${collection}/${field}`);
  if (cur && cur.meta?.options?.folder !== f.id) { console.log(`  ~ ${collection}.${field} 上傳到「${name}」`); await api('PATCH', `/fields/${collection}/${field}`, { meta: { options: { ...cur.meta?.options, folder: f.id } } }); }
  return f;
}
// 網頁 icon：CSS 用到的 website-icons/*.svg（icon.css 的 --icon、chrome.css 的 mask、page.css 的 share／doc…）＝要放進後台的那幾個；後台還沒有的 key 才上傳（換過圖的不蓋）
async function ensureIcons(folder) {
  const css = ['css/components/icon.css', 'css/components/chrome.css', 'css/components/page.css'].map(f => fs.readFileSync(f, 'utf8')).join('\n');
  const keys = [...new Set([...css.matchAll(/website-icons\/([\w-]+)\.svg/g)].map(m => m[1]))].filter(k => fs.existsSync(`website-icons/${k}.svg`));
  const have = new Set(((await get('/items/site_icons?fields=key&limit=-1')) || []).map(i => i.key));
  for (const [i, key] of keys.entries()) {
    if (have.has(key)) continue;
    console.log(`  + 網頁 icon ${key}`);
    if (DRY) continue;
    const fd = new FormData();
    fd.append('folder', folder.id);
    fd.append('file', new Blob([fs.readFileSync(`website-icons/${key}.svg`)], { type: 'image/svg+xml' }), `${key}.svg`);
    const res = await fetch(`${BASE}/files`, { method: 'POST', headers: { Authorization: H.Authorization }, body: fd });
    if (!res.ok) throw new Error(`上傳 ${key}.svg → ${res.status} ${(await res.text()).slice(0, 200)}`);
    await api('POST', '/items/site_icons', { key, file: (await res.json()).data.id, note: ICON_NOTES[key] || '', sort: i + 1 });
  }
}
async function ensurePresets() {
  for (const [collection, layout_query] of Object.entries(PRESETS)) {
    const cur = ((await get(`/presets?filter[collection][_eq]=${collection}&filter[user][_null]=true&filter[role][_null]=true&filter[bookmark][_null]=true`)) || [])[0];
    if (cur && JSON.stringify(cur.layout_query) === JSON.stringify(layout_query)) continue;
    console.log(`  ~ ${collection} 預設檢視`);
    const body = { collection, layout: 'tabular', layout_query, layout_options: { tabular: { spacing: 'compact' } } };
    await (cur ? api('PATCH', `/presets/${cur.id}`, body) : api('POST', '/presets', body));
  }
}
async function ensurePublicRead() {
  const pub = ((await get('/policies?filter[admin_access][_eq]=false&filter[app_access][_eq]=false')) || [])[0];
  if (!pub) throw new Error('找不到 Public policy');
  const have = new Set((((await get(`/permissions?limit=-1&filter[policy][_eq]=${pub.id}&filter[action][_eq]=read`)) || [])).map(p => p.collection));
  // directus_files：前台 /assets 要能讀圖（directus_folders 原本給作品頁照資料夾名字抓圖，2026-11-24 改成圖片欄位就不用了；正式後台開過的留著）
  const want = [...Object.keys(SPEC).filter(c => !SPEC[c].folder), 'directus_files'];
  for (const c of want) {
    if (have.has(c)) continue;
    console.log(`  + Public 讀取 ${c}`);
    // 沒有上架／草稿（user 2026-11-24：都不需要狀態）＝整個集合公開讀
    await api('POST', '/permissions', { policy: pub.id, collection: c, action: 'read', fields: ['*'], permissions: {}, validation: {} });
  }
}

(async () => {
  console.log(`Directus ${BASE}${DRY ? '（dry run，不會改任何東西）' : ''}`);
  for (const [name, s] of Object.entries(SPEC)) await ensureCollection(name, s);
  for (const name of META) await ensureMeta(name);
  console.log('側欄順序（照前台選單）');
  await ensureOrder();
  console.log('Public 讀取權');
  await ensurePublicRead();
  await ensureFolder(WORKS_FOLDER, 'works', 'images');
  // 網頁 icon：本地加了新的（CSS 有用到）就補上傳
  const iconFolder = await ensureFolder(ICON_FOLDER, 'site_icons', 'file');
  if (iconFolder) await ensureIcons(iconFolder);
  console.log('預設檢視');
  await ensurePresets();
  // footer 單例：還是空的才塞示意值（已經有人填過就不碰）
  // 「空的」＝什麼都還沒有（原本看 email 那一格，2026-11-24 那格刪了——還看它的話每跑一次都會把示意值蓋回去）
  const f = DRY ? null : await get('/items/footer');
  if (!DRY && f && !f.instagram && !f.youtube && !f.sections?.length) { console.log('+ footer 塞 contact.html 的示意值'); await api('PATCH', '/items/footer', FOOTER_MOCK); }
  console.log('完成');
})().catch(e => { console.error(e.message); process.exit(1); });
