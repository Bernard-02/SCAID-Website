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
const status = { field: 'status', type: 'string', meta: { interface: 'select-dropdown', width: 'half', translations: zh('狀態'), options: { choices: [{ text: '上架', value: 'published' }, { text: '草稿', value: 'draft' }] }, display: 'labels', display_options: { showAsDot: true, choices: [{ text: '上架', value: 'published', foreground: '#FFFFFF', background: '#2ECDA7' }, { text: '草稿', value: 'draft', foreground: '#18222F', background: '#D3DAE4' }] } }, schema: { default_value: 'published', is_nullable: false } };
const sort = { field: 'sort', type: 'integer', meta: { hidden: true, interface: 'input' }, schema: {} };
const str = (field, label, extra = {}, width = 'half') => ({ field, type: 'string', meta: { interface: 'input', width, translations: zh(label), ...extra }, schema: {} });
const strEn = (field, label) => str(field, label, { note: EN_NOTE });
const multi = (field, label, extra = {}) => ({ field, type: 'text', meta: { interface: 'input-multiline', width: 'full', translations: zh(label), ...extra }, schema: {} });
const TOOLBAR = ['bold', 'italic', 'h3', 'bullist', 'numlist', 'link', 'removeformat'];
const rich = (field, label, extra = {}) => ({ field, type: 'text', meta: { interface: 'input-rich-text-html', width: 'full', translations: zh(label), options: { toolbar: TOOLBAR }, ...extra }, schema: {} });
const image = (field, label, note) => ({ field, type: 'uuid', meta: { interface: 'file-image', special: ['file'], width: 'half', translations: zh(label), note }, schema: { is_nullable: true } });
const date = (field, label) => ({ field, type: 'date', meta: { interface: 'datetime', width: 'half', translations: zh(label) }, schema: {} });
const bool = (field, label, text) => ({ field, type: 'boolean', meta: { interface: 'boolean', width: 'half', translations: zh(label), options: { label: text } }, schema: { default_value: false } });
const dropdown = (field, label, choices) => ({ field, type: 'string', meta: { interface: 'select-dropdown', width: 'half', translations: zh(label), options: { choices }, display: 'labels', display_options: { choices } }, schema: {} });
const url = (field, label, note) => str(field, label, { note: note || '只接受 https://、mailto:、tel: 開頭' }, 'full');
// JSON repeater：子欄位＝[欄位, 名稱, 種類]；種類 空＝一行、'text'＝多行、'rich'＝段落內文（WYSIWYG）
const SUB = { text: ['text', 'input-multiline'], rich: ['text', 'input-rich-text-html', { toolbar: TOOLBAR }] };
const repeater = (field, label, sub, template, note) => ({ field, type: 'json', meta: { interface: 'list', width: 'full', translations: zh(label), note, options: { template, fields: sub.map(([f, name, kind]) => {
  const [type, iface, options] = SUB[kind] || ['string', 'input'];
  return { field: f, name, type, meta: { field: f, type, interface: iface, width: 'full', ...(options ? { options } : {}) } };
}) } }, schema: {} });
// 副標（師資、合作企業共用同一種列，user 2026-11-21）：標題下面一筆一行、沒填就不出
const subtitles = repeater('subtitles', '副標', [['text_zh', '副標（中）'], ['text_en', '副標（英）']], '{{text_zh}}', '一筆＝標題下面一行，可拖曳排序；沒填＝只有標題。' + EN_NOTE);
// 中英成對的「年份／說明」條列（faculty-detail 每段一個）
const entries = (field, label) => repeater(field, label, [['year', '年份／標題'], ['text_zh', '說明（中）', 'text'], ['text_en', '說明（英）', 'text']], '{{year}} {{text_zh}}', '一列一筆；' + EN_NOTE);
// 從庫選（人名庫／單位庫／媒體庫，user 2026-11-21 照 SCCD）：M2O 一列一個。庫那邊自動多一欄「用在：○○」（欄名＝這個集合），
// 關聯 RESTRICT＝還有人用就刪不掉（重複的要合併、不能直接刪）
const pick = (field, label, pool, note) => ({ field, type: 'integer', pool, meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half', translations: zh(label), note: note || '從庫裡選；沒有就在選單裡新增（會一起加進庫）',
  options: { template: '{{name_zh}} {{name_en}}', enableCreate: true, enableSelect: true }, display: 'related-values', display_options: { template: '{{name_zh}}' } }, schema: { is_nullable: true } });
const usedIn = (field, label, template) => ({ field, type: 'alias', meta: { special: ['o2m'], interface: 'list-o2m', readonly: true, width: 'full', translations: zh(`用在：${label}`), options: { template, enableCreate: false, enableSelect: false } } });
const poolName = [str('name_zh', '中文名'), str('name_en', '英文名', { note: EN_NOTE })];
// 多張圖／多個檔（files M2M）：每個這種欄位要另一張 junction 表 <集合>_<欄位>（下面 junction()）——集合上限 25，別亂開
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
// 介面文字的分類（後台整理用，前台只認 key；key 的開頭決定分類，seed-directus.cjs LABEL_CAT）
const LABEL_CATS = ['選單與頁名', '底列與共用', '師資', '課程', '聯絡', '榮譽', '404'].map(c => ({ text: c, value: c }));

const FACULTY_CATS = [{ text: '兼任教師', value: 'part_time' }, { text: '專任教師', value: 'full_time' }, { text: '業界導師', value: 'mentor' }];
const YEARS = [1, 2, 3, 4].map(n => ({ text: `${'一二三四'[n - 1]}年級`, value: n }));

// 單例頁的導言、段落（每頁一個集合，user 2026-11-22 照 SCCD）。段落用重複列；關於的段落要放輪播圖、重複列放不了檔案 → 子集合 about_sections（裡面的小節要放圖 → 再一層子集合 about_subsections）
const lead = [multi('lead_zh', '導言（中，選填）'), multi('lead_en', '導言（英，選填）', { note: EN_NOTE })];
const textSections = repeater('sections', '段落', [['title_zh', '段落標題（中）'], ['title_en', '段落標題（英）'], ['body_zh', '內文（中）', 'rich'], ['body_en', '內文（英）', 'rich']],
  '{{title_zh}}', '一段一列、可拖曳排序；段落標題＝左側段落導覽。' + EN_NOTE);

// ── SPEC：collection → { meta, fields, relations? }（folder: true＝側欄的資料夾）。順序有差：資料夾排在它裡面的集合前面、庫要排在選它的集合前面、junction 排在它的 parent 後面 ──
const SPEC = {
  // 清單頁＝清單＋頁面（導言）兩個集合，收在同一個資料夾（user 2026-11-22，照 SCCD）
  home_folder: { folder: true, meta: { icon: 'folder', translations: zh('首頁') } },   // 首頁動態＋首頁影片（user 2026-11-23）
  faculty_folder: { folder: true, meta: { icon: 'folder', translations: zh('師資') } },
  partners_folder: { folder: true, meta: { icon: 'folder', translations: zh('合作企業') } },
  // 庫（user 2026-11-21，照 SCCD）：全站的人名／單位／媒體只在庫裡打一次，用到的地方從庫選；改一次全站跟著換
  people: {
    meta: { icon: 'person', translations: zh('人名庫'), display_template: '{{name_zh}} {{name_en}}', note: '全站的人名從這裡選（師資）。還有人用就刪不掉；重複的要合併' },
    fields: [...poolName, usedIn('faculty', '師資', '{{category}}')],
  },
  organizations: {
    meta: { icon: 'domain', translations: zh('單位庫'), display_template: '{{name_zh}} {{name_en}}', note: '全站的單位（公司、學校、主辦方）從這裡選（合作企業、榮譽的主辦方）。還有人用就刪不掉' },
    fields: [...poolName, usedIn('partners', '合作企業', '{{url}}'), usedIn('records', '榮譽（主辦方）', '{{award_zh}}')],
  },
  media_outlets: {
    meta: { icon: 'newspaper', translations: zh('媒體庫'), display_template: '{{name_zh}} {{name_en}}', note: '報導的媒體從這裡選。還有人用就刪不掉' },
    fields: [...poolName, usedIn('press', '報導', '{{title_zh}}')],
  },
  // 介面文字（user 2026-11-21，照 SCCD ui_labels）：選單、頁名、固定的小標（專任教師、一年級、必修…）。一個 key 一筆，HTML 用 data-label="key" 標；
  // 前台抓不到＝照 HTML 原本的字。key 唯讀（前台照 key 找）；新 key 由 scripts/seed-directus.cjs 從 HTML 補（只補缺的、不蓋已經改過的）
  ui_labels: {
    meta: { icon: 'translate', translations: zh('介面文字'), display_template: '{{key}}', sort_field: 'sort', note: '選單、頁名、固定的小標等介面文字；key 不要改。' + EN_NOTE },
    fields: [sort, { field: 'key', type: 'string', meta: { interface: 'input', readonly: true, width: 'half', translations: zh('key（勿改）'), options: { font: 'monospace' } }, schema: { is_unique: true, is_nullable: false } },
      { ...dropdown('category', '分類', LABEL_CATS), meta: { ...dropdown('category', '分類', LABEL_CATS).meta, options: { choices: LABEL_CATS, allowOther: true }, note: '後台整理用，前台不看' } },
      str('zh', '中文'), strEn('en', '英文')],
  },
  footer: {
    meta: { icon: 'call_to_action', singleton: true, translations: zh('聯絡'), note: '聯絡頁（原本的頁尾）；只有這一筆，欄位留空＝前台那一列不顯示' },
    fields: [
      str('email', '電子郵件'), str('tel', '電話（中英共用）'), str('fax', '傳真（中英共用）'),
      str('address_zh', '地址（中）'), strEn('address_en', '地址（英）'),
      repeater('social', '社群連結', [['label', '名稱（報讀用，例 Instagram）'], ['url', '網址']], '{{label}}', '可拖曳排序；網址只接受 https://、mailto:、tel:'),
      // 姊妹系所（user 2026-11-21）：寫全名、前台一行一個；原本子欄位只有 label（縮寫）
      repeater('links', '姊妹系所連結', [['label_zh', '全名（中，例 媒體傳達設計學系）'], ['label_en', '全名（英）'], ['url', '網址']], '{{label_zh}}', '一列一筆、可拖曳排序；前台一行一個。' + EN_NOTE),
      image('badge', '標章', '圖片替代文字＝檔案標題（在檔案庫改）'),
    ],
  },
  news: {
    meta: { icon: 'newspaper', translations: zh('動態'), display_template: '{{date}} {{title_zh}}', sort_field: null, archive_field: 'status', archive_value: 'draft', unarchive_value: 'published', note: '動態頁（依日期新到舊）＋入學頁（勾了「入學」的）；首頁那串與底列跑馬燈另外在「首頁動態」（user 2026-11-23 拆開）' },
    fields: [status, date('date', '日期'), str('title_zh', '標題（中）', {}, 'full'), strEn('title_en', '標題（英）'),
      multi('summary_zh', '說明（中，選填，入學頁點開的第一段）'), multi('summary_en', '說明（英，選填）', { note: EN_NOTE }),   // 首頁那串改在 home_news（2026-11-23），名稱跟著改（正式後台手動 PATCH 過）
      image('image', '圖片（動態頁那一列的縮圖）'), url('link', '外部連結（選填）'),
      // 2026-11-21 補（動態頁＋入學頁的版型，docs/Directus-後台欄位.md）
      str('category_zh', '分類（中，例 講座、參訪）'), strEn('category_en', '分類（英）'),
      str('time_zh', '時間（中，選填，例 2026.11.22 14:00–16:00；空＝用日期）'), strEn('time_en', '時間（英）'),
      str('place_zh', '地點（中，選填）'), strEn('place_en', '地點（英）'),
      bool('admission', '入學頁', '也列在入學頁'),
      files('album', '相簿', '點開那則的照片，一排橫捲；可拖曳排序'), files('attachments', '附件', '入學頁點開的附件，一個檔一個連結、連結文字＝檔案標題')],
  },
  news_album: junction('news', 'album'),
  news_attachments: junction('news', 'attachments'),
  // 首頁動態（user 2026-11-23：原本首頁、動態頁、入學頁共用 news，首頁要自己一個）：首頁點「＋」展開的那串＋底列跑馬燈，照拖曳順序。
  // 點了去哪＝照 SCCD 的首頁 news：外部網址 url，或入學頁的某一則 admission_item（＝勾了「入學」的動態）；兩格互鎖；都沒填＝不能點
  home_news: {
    meta: { icon: 'home', group: 'home_folder', translations: zh('首頁動態'), display_template: '{{title_zh}}', sort_field: 'sort', archive_field: 'status', archive_value: 'draft', unarchive_value: 'published',
      note: '首頁點「＋」展開的那串、底列跑馬燈：照拖曳順序、前 8 則。點了去哪＝外部連結或入學頁的某一則，二選一' },
    fields: [status, sort, str('title_zh', '標題（中）', {}, 'full'), strEn('title_en', '標題（英）'),
      multi('summary_zh', '說明（中，選填，標題下面第二行）'), multi('summary_en', '說明（英，選填）', { note: EN_NOTE }),
      image('image', '圖片（標題下面那格，裁成 3:1）'),
      str('url', '外部連結（選填）', { note: 'https:// 開頭，點了另開新視窗；跟「入學頁的哪一則」二選一', conditions: LOCK('admission_item', '已經選了入學頁的哪一則') }),
      { field: 'admission_item', type: 'integer', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half', translations: zh('入學頁的哪一則（選填）'),
        note: '點了到入學頁、打開那一則（只列勾了「入學」的動態）；跟外部連結二選一', conditions: LOCK('url', '已經填了外部連結'),
        options: { template: '{{title_zh}}', filter: { admission: { _eq: true } }, enableCreate: false, enableSelect: true }, display: 'related-values', display_options: { template: '{{title_zh}}' } },
        schema: { is_nullable: true } }],
    relations: [{ collection: 'home_news', field: 'admission_item', related_collection: 'news', schema: { on_delete: 'SET NULL' } }],
  },
  // 首頁影片（user 2026-11-23：影片也要在後台，「首頁」資料夾裡放首頁動態＋影片）：底列 ▶ 鈕點了播的那一支（chrome.js openIntro），只有一筆
  home_video: {
    meta: { icon: 'smart_display', singleton: true, group: 'home_folder', translations: zh('首頁影片'), note: '首頁底列 ▶ 鈕點了播的那一支；沒填＝點了不會開' },
    fields: [str('url', '影片連結', { note: 'YouTube 連結（例 https://youtu.be/xxxxxxxxxxx、https://www.youtube.com/watch?v=…）；也可以貼直連的影片檔網址（.mp4、.m3u8）' }, 'full')],
  },
  faculty: {
    meta: { icon: 'school', group: 'faculty_folder', translations: zh('師資名單'), display_template: '{{person.name_zh}} {{person.name_en}}', sort_field: 'sort', archive_field: 'status', archive_value: 'draft', unarchive_value: 'published', note: '列表依「類別」分段；名字從人名庫選；副標跟語言切（英文留空＝英文版顯示中文）' },
    fields: [status, sort, dropdown('category', '類別', FACULTY_CATS), image('photo', '照片'),
      pick('person', '姓名（人名庫）', 'people'),
      str('name_zh', '姓名（中）'), str('name_en', '姓名（英）'),   // 舊欄位：名字改從人名庫選（user 2026-11-21），藏起來（HIDE）
      subtitles,   // 原本是單一欄位 affiliation_zh／_en（任職單位）
      entries('education', '學歷'), entries('experience', '經歷'), entries('expertise', '專長'), entries('exhibitions', '展覽'), entries('awards', '獲獎'), entries('publications', '著作')],
  },
  partners: {
    meta: { icon: 'handshake', group: 'partners_folder', translations: zh('合作企業名單'), display_template: '{{organization.name_zh}}', sort_field: 'sort', archive_field: 'status', archive_value: 'draft', unarchive_value: 'published', note: '企業名稱從單位庫選' },
    fields: [status, sort, image('logo', 'Logo'), pick('organization', '企業（單位庫）', 'organizations'),
      str('name_zh', '企業名稱（中）'), strEn('name_en', '企業名稱（英）'),   // 舊欄位：改從單位庫選（user 2026-11-21），藏起來（HIDE）
      subtitles,   // 原本是一段 description_zh／_en（合作內容）
      url('url', '企業網站（整列可點、另開新視窗；空＝不可點）')],
  },
  faculty_page: { meta: { icon: 'article', singleton: true, group: 'faculty_folder', translations: zh('師資頁'), note: '頁標題下面那段導言' }, fields: lead },
  partners_page: { meta: { icon: 'article', singleton: true, group: 'partners_folder', translations: zh('合作企業頁'), note: '頁標題下面那段導言' }, fields: lead },
  courses: {
    meta: { icon: 'menu_book', translations: zh('課程'), display_template: '{{year}} {{name_zh}}', sort_field: 'sort', archive_field: 'status', archive_value: 'draft', unarchive_value: 'published', note: '課程頁依年級分段、同年級照拖曳順序' },
    fields: [status, sort, { ...dropdown('year', '年級', YEARS), type: 'integer' }, bool('required', '必修', '必修（不勾＝選修）'),
      str('name_zh', '課程名稱（中）'), strEn('name_en', '課程名稱（英）'),
      multi('description_zh', '課程說明（中，課程頁點開那一段）'), multi('description_en', '課程說明（英）', { note: EN_NOTE })],
  },
  qa: {
    meta: { icon: 'help', translations: zh('常見問題'), display_template: '{{question_zh}}', sort_field: 'sort', archive_field: 'status', archive_value: 'draft', unarchive_value: 'published', note: '前台依「分類」分段，分類名一樣的會排在同一段' },
    fields: [status, sort, str('category_zh', '分類（中）'), strEn('category_en', '分類（英）'),
      str('question_zh', '問題（中）', {}, 'full'), strEn('question_en', '問題（英）'), multi('answer_zh', '回答（中）'), multi('answer_en', '回答（英）', { note: EN_NOTE })],
  },
  // 規章與政策（user 2026-11-22：一頁一個單例，照 SCCD；只放連結、不上傳檔案）：上面規章／表單清單、下面條款這種文字段落
  regulations: {
    meta: { icon: 'gavel', singleton: true, translations: zh('規章與政策'), note: '上面是規章、表單（依分類分段、整列外連），下面是使用條款、隱私權政策這種文字段落' },
    fields: [repeater('items', '規章、表單', [['category_zh', '分類（中，例 學程規章、表單下載）'], ['category_en', '分類（英）'], ['title_zh', '名稱（中）'], ['title_en', '名稱（英）'],
      ['subtitles_zh', '副標（中，一行一個，例 2026.08 修訂）', 'text'], ['subtitles_en', '副標（英，一行一個）', 'text'], ['url', '連結（整列外連、另開新視窗；空＝不能點）']],
    '{{category_zh}}／{{title_zh}}', '一列一筆、可拖曳排序；分類一樣的排在同一段（照第一次出現的順序）。' + EN_NOTE), textSections],
  },
  // 榮譽（user 2026-11-19）：一筆一個摺疊；收著＝國旗＋獎項＋得獎人，點開＝主辦方、獎別。得獎人照打字（同 SCCD：學生不進人名庫）
  records: {
    meta: { icon: 'emoji_events', translations: zh('榮譽'), display_template: '{{award_zh}}', sort_field: 'sort', archive_field: 'status', archive_value: 'draft', unarchive_value: 'published', note: '主辦方從單位庫選；國旗照國家代碼' },
    fields: [status, sort, str('country_code', '國家代碼', { note: 'ISO 3166-1 兩碼小寫（tw／jp／de…），前台照它抓國旗' }),
      str('country_zh', '國家（中）', { note: '畫面上不顯示，給報讀用' }), strEn('country_en', '國家（英）'),
      str('award_zh', '獎項名稱（中）', {}, 'full'), strEn('award_en', '獎項名稱（英）'), str('winner_zh', '得獎人（中）'), strEn('winner_en', '得獎人（英）'),
      pick('organizer', '主辦方（單位庫）', 'organizations'), str('prize_zh', '獎別（中，例 金獎、佳作）'), strEn('prize_en', '獎別（英）')],
  },
  // 報導（user 2026-11-21）：一則一列（同入學、沒縮圖），點了放大看報導截圖。媒體從媒體庫選
  press: {
    meta: { icon: 'feed', translations: zh('報導'), display_template: '{{title_zh}}', archive_field: 'status', archive_value: 'draft', unarchive_value: 'published', note: '依刊出日期新到舊；點了放大看截圖（沒放截圖＝不能點）' },
    fields: [status, date('date', '刊出日期（排序用，前台不顯示）'), str('title_zh', '報導標題（中）', {}, 'full'), strEn('title_en', '報導標題（英）'),
      pick('media', '媒體（媒體庫）', 'media_outlets'), image('screenshot', '報導截圖（點了放大看）')],
  },
  // 文字頁（user 2026-11-22：每頁一個單例，照 SCCD；原本全部擠在一個「文字頁」pages、捐款找不到）。頁名在「介面文字」nav.<slug>
  about: {
    meta: { icon: 'info', singleton: true, translations: zh('關於'), note: '導言＋段落；段落標題＝左側段落導覽，段落可以放輪播圖' },
    fields: [...lead, { field: 'sections', type: 'alias', meta: { special: ['o2m'], interface: 'list-o2m', width: 'full', translations: zh('段落'), options: { template: '{{title_zh}}', enableCreate: true, enableSelect: false } } }],
  },
  about_sections: {
    meta: { icon: 'segment', translations: zh('關於的段落'), display_template: '{{title_zh}}', sort_field: 'sort', archive_field: 'status', archive_value: 'draft', unarchive_value: 'published', hidden: true, note: '從「關於」裡面新增' },
    fields: [status, sort, { field: 'about', type: 'integer', meta: { hidden: true, interface: 'select-dropdown-m2o', translations: zh('所屬頁') }, schema: { is_nullable: true } },
      str('title_zh', '段落標題（中）'), strEn('title_en', '段落標題（英）'),
      rich('body_zh', '內文（中）'), rich('body_en', '內文（英）', { note: EN_NOTE }),   // 舊欄位：改成下面的小節（user 2026-11-23），藏起來（HIDE）
      files('images', '段落圖片（輪播）', '標題下面那排輪播，可拖曳排序；沒放＝不出輪播'),
      // 說明（user 2026-11-23）：段落圖片下面、小節上面那段
      multi('description_zh', '說明（中，選填：段落圖片下面那段）', { note: '純文字：換行照留、空一行＝分段' }), multi('description_en', '說明（英）', { note: EN_NOTE }),
      // 小節（user 2026-11-23：不要一整段 rich text，標題＋純文字、可以一直加；同一天又要每個小節放一張圖＋附註 → 重複列放不了檔案 → 子集合 about_subsections）。
      // 表單的順序＝前台由上往下（新建的照這裡的順序；正式後台是後來補的欄位，2026-11-23 手動排過 sort）
      { field: 'subsections', type: 'alias', meta: { special: ['o2m'], interface: 'list-o2m', width: 'full', translations: zh('小節'), note: '一個小節＝標題、圖片、內文、附註（都可以不填），可拖曳排序',
        options: { template: '{{title_zh}} {{text_zh}}', enableCreate: true, enableSelect: false } } },
      // 年表（user 2026-11-23：沿革要跟老師的詳細頁一樣，年份＋文字一筆一筆加）＝同師資的學歷那種重複列；前台排在小節後面
      entries('timeline', '年表（年份＋文字，沿革那種）'),
      repeater('items', '小節', [['title_zh', '小節標題（中，選填）'], ['title_en', '小節標題（英）'], ['text_zh', '內文（中）', 'text'], ['text_en', '內文（英）', 'text']],
        '{{title_zh}} {{text_zh}}', '一個小節一列、可拖曳排序：標題＋純文字（換行照留、空一行＝分段）；沒標題＝只有內文。' + EN_NOTE),   // 舊欄位：改成上面的子集合（小節要放圖），藏起來（HIDE）
      multi('note_zh', '附註（中，選填：段落最後一行小字）'), multi('note_en', '附註（英）', { note: EN_NOTE })],   // 舊欄位：附註改放在小節裡（user 2026-11-23），藏起來（HIDE）
    relations: [{ collection: 'about_sections', field: 'about', related_collection: 'about', meta: { one_field: 'sections', sort_field: 'sort', one_deselect_action: 'delete' }, schema: { on_delete: 'CASCADE' } }],
  },
  about_sections_images: junction('about_sections', 'images'),
  about_subsections: {
    meta: { icon: 'subject', translations: zh('關於的小節'), display_template: '{{title_zh}} {{text_zh}}', sort_field: 'sort', hidden: true, note: '從「關於」的段落裡面新增' },
    fields: [sort, { field: 'section', type: 'integer', meta: { hidden: true, interface: 'select-dropdown-m2o', translations: zh('所屬段落') }, schema: { is_nullable: true } },
      str('title_zh', '小節標題（中，選填）'), strEn('title_en', '小節標題（英）'), image('image', '圖片（選填）', '標題下面、內文上面'),
      multi('text_zh', '內文（中）', { note: '純文字：換行照留、空一行＝分段' }), multi('text_en', '內文（英）', { note: EN_NOTE }),
      multi('note_zh', '附註（中，選填：小節最後一行小字）'), multi('note_en', '附註（英）', { note: EN_NOTE })],
    relations: [{ collection: 'about_subsections', field: 'section', related_collection: 'about_sections', meta: { one_field: 'subsections', sort_field: 'sort', one_deselect_action: 'delete' }, schema: { on_delete: 'CASCADE' } }],
  },
  donate: { meta: { icon: 'volunteer_activism', singleton: true, translations: zh('捐款'), note: '導言＋段落' }, fields: [...lead, textSections] },
  // 作品頁（user 2026-11-23）：影片＝貼 YouTube 播放清單（可以好幾個，前台用 Data API 拆成一支一支）；圖片不開欄位＝檔案庫的「作品」資料夾（下面建）——
  // 多圖欄位要多一張 junction 表，集合上限 25 已經快滿（Directus 12 Core：資料夾不算、junction 算；works 建下去＝25＝滿了，第 26 個會被拒絕）
  works: {
    meta: { icon: 'movie', singleton: true, translations: zh('作品'), note: '作品頁：影片＝下面貼的 YouTube 播放清單；圖片＝檔案庫「作品」資料夾裡的圖（丟進去就會出現、刪掉或移出去就不見）。前台每次進來順序都打亂' },
    fields: [repeater('playlists', 'YouTube 播放清單', [['url', '播放清單網址（含 list=）']], '{{url}}', '一列一個播放清單、可以好幾個；清單裡的影片會一支一支出現（私人、已刪除的不會）')],
  },
};
const WORKS_FOLDER = '作品';   // js/modules/pages/works.js 照這個名字抓圖：改名兩邊一起改
// 舊欄位只藏不刪（同 SCCD 的做法；之後確定不要再刪）：名字改從庫選；關於的段落內文改成小節（先是 JSON 重複列，再改子集合）、段落的附註改放在小節裡
const HIDE = [['faculty', 'name_zh'], ['faculty', 'name_en'], ['partners', 'name_zh'], ['partners', 'name_en'], ['about_sections', 'body_zh'], ['about_sections', 'body_en'], ['about_sections', 'items'],
  ['about_sections', 'note_zh'], ['about_sections', 'note_en']];
// 已經建好的集合要更新的設定（顯示名稱改吃庫裡的名字；師資、合作企業收進資料夾；動態只管動態頁、頁尾改叫聯絡）
const META = ['faculty', 'partners', 'news', 'footer', 'home_news'];
// 後台側欄的順序＝前台選單（user 2026-11-23）：首頁 → 主選單 → 次選單 → 庫、介面文字；資料夾裡＝頁面（導言）→ 名單。
// 入學沒有自己的集合（＝勾了「入學」的動態）、網站地圖沒有內容；藏起來的（段落、小節、junction）不用排
const NAV = ['home_folder', 'home_news', 'home_video', 'about', 'partners_folder', 'partners_page', 'partners', 'faculty_folder', 'faculty_page', 'faculty', 'courses', 'works', 'news', 'records', 'press',
  'qa', 'donate', 'footer', 'regulations', 'people', 'organizations', 'media_outlets', 'ui_labels'];

// contact.html（聯絡頁，原本的 footer）目前的示意值：singleton 建好後第一筆就是這些，前台畫面不變（接真資料時在後台改）
const FOOTER_MOCK = {
  email: 'scaid@g2.usc.edu.tw', tel: '02 0000 0000（示意）', fax: '02 0000 0000（示意）', address_zh: '地址（示意）', address_en: 'Address (placeholder)',
  social: [{ label: '社群一（示意）', url: 'https://example.com' }, { label: '社群二（示意）', url: 'https://example.com' }],
  links: [['設計學院', 'College of Design', 'https://www.scdesign.usc.edu.tw/'], ['媒體傳達設計學系', 'Department of Communications Design', 'https://sccd.usc.edu.tw/'],
    ['服裝設計學系', 'Department of Fashion Design', 'https://scfd.usc.edu.tw/'], ['工業產品設計學系', 'Department of Industrial Design', 'https://scid.usc.edu.tw/'],
    ['建築設計學系', 'Department of Architecture', 'https://www.arch.usc.edu.tw/'], ['建築職人學程', 'SCAC Program', 'https://www.arch.usc.edu.tw/'],
    ['實踐大學', 'Shih Chien University', 'https://www.usc.edu.tw/']].map(([label_zh, label_en, url]) => ({ label_zh, label_en, url })),
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
async function hideField(name, field) {
  const f = await get(`/fields/${name}/${field}`);
  if (f && !f.meta?.hidden) { console.log(`  ~ 藏起舊欄位 ${name}.${field}`); await api('PATCH', `/fields/${name}/${field}`, { meta: { hidden: true } }); }
}
async function ensureRelation(r) {
  if (await get(`/relations/${r.collection}/${r.field}`)) return;
  console.log(`  + 關聯 ${r.collection}.${r.field} → ${r.related_collection}`); await api('POST', '/relations', r);
}
async function ensurePublicRead() {
  const pub = ((await get('/policies?filter[admin_access][_eq]=false&filter[app_access][_eq]=false')) || [])[0];
  if (!pub) throw new Error('找不到 Public policy');
  const have = new Set((((await get(`/permissions?limit=-1&filter[policy][_eq]=${pub.id}&filter[action][_eq]=read`)) || [])).map(p => p.collection));
  // directus_files：前台 /assets 要能讀圖；directus_folders：作品頁照資料夾名字抓圖（filter[folder][name]）
  const want = [...Object.keys(SPEC).filter(c => !SPEC[c].folder), 'directus_files', 'directus_folders'];
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
  for (const name of META) await ensureMeta(name);
  for (const [name, field] of HIDE) await hideField(name, field);
  console.log('側欄順序（照前台選單）');
  await ensureOrder();
  console.log('Public 讀取權');
  await ensurePublicRead();
  if (!((await get(`/folders?filter[name][_eq]=${encodeURIComponent(WORKS_FOLDER)}`)) || []).length) { console.log(`+ 檔案庫資料夾「${WORKS_FOLDER}」`); await api('POST', '/folders', { name: WORKS_FOLDER }); }
  // footer 單例：還是空的才塞示意值（已經有人填過就不碰）
  const f = DRY ? null : await get('/items/footer');
  if (!DRY && f && !f.email) { console.log('+ footer 塞 contact.html 的示意值'); await api('PATCH', '/items/footer', FOOTER_MOCK); }
  console.log('完成');
})().catch(e => { console.error(e.message); process.exit(1); });
