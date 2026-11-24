// 後台搬家：舊的那台 Directus（現在的 v12，scaidcms）→ 新的那台（v11；user 2026-11-23 決定改裝 11：12 的免費 Core 方案只給 25 個集合、3 個帳號）。
// 全部照原本的編號搬：檔案庫的資料夾 → 檔案（連實體檔）→ 每個集合的內容（單例、清單、子表、junction）→ 專案設定（名稱、顏色、語言）。
// 舊的那台只讀（只發 GET），不會改到它。帳號（密碼搬不了）、書籤、Flow（目前沒有）不搬：新的那台自己開。
// 完整流程（IT 裝好 → 建結構 → 搬 → 比對 → 切網址）見 docs/Directus-搬到11.md。
//
// 1. 新的那台先建好結構：DIRECTUS_URL=<新網址> DIRECTUS_TOKEN=<新的那台的 token> node scripts/setup-directus.cjs
// 2. 先看會搬什麼：      TO_URL=<新網址> TO_TOKEN=<新的那台的 token> node scripts/migrate-directus.cjs --dry
//    真的搬：            TO_URL=<新網址> TO_TOKEN=<新的那台的 token> node scripts/migrate-directus.cjs
// 最後逐筆比對兩邊（每個集合的每一筆、每個檔案）。可以重跑：新的那台已經有的那一筆＝照舊的那台蓋過去、檔案只更新資料不重傳。
// 舊的那台：FROM_URL（預設 js/config/api.js 的網域）＋FROM_TOKEN（預設 scripts/.directus-token）。token 都要是管理員的（讀得到草稿、系統表）。

const fs = require('fs');
const DRY = process.argv.includes('--dry');
const env = (k) => (process.env[k] || '').trim();
const FROM = (env('FROM_URL') || fs.readFileSync('js/config/api.js', 'utf8').match(/CMS_API_BASE = '(https:\/\/[^/']+)/)[1]).replace(/\/+$/, '');
const FROM_TOKEN = env('FROM_TOKEN') || fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const TO = env('TO_URL').replace(/\/+$/, ''), TO_TOKEN = env('TO_TOKEN');
if (!TO || !TO_TOKEN) { console.error('要給新的那台的網址與 token：TO_URL=… TO_TOKEN=… node scripts/migrate-directus.cjs（見檔頭）'); process.exit(1); }
if (TO === FROM) { console.error(`TO_URL 跟舊的那台一樣（${FROM}）：不能搬到自己身上`); process.exit(1); }

/** @param {string} base @param {string} token @param {string} method @param {string} p @param {any} [body] FormData＝上傳檔案 */
async function call(base, token, method, p, body) {
  const form = body instanceof FormData;
  const res = await fetch(base + p, { method, headers: { Authorization: `Bearer ${token}`, ...(body && !form ? { 'Content-Type': 'application/json' } : {}) }, body: form ? body : body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${base}${p} → ${res.status} ${JSON.stringify(json).slice(0, 400)}`);
  return json && json.data;
}
const src = (p) => call(FROM, FROM_TOKEN, 'GET', p);   // 舊的那台：只有 GET
const dst = (method, p, body) => {
  if (DRY && method !== 'GET') { console.log(`  [dry] ${method} ${p}${Array.isArray(body) ? `（${body.length} 筆）` : ''}`); return Promise.resolve(null); }
  return call(TO, TO_TOKEN, method, p, body);
};
const isSystem = (c) => !c || c.startsWith('directus_');
const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
// 比對用：key 排好的 JSON（兩邊的資料庫回的欄位順序不一定一樣）
const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x));

(async () => {
  const [fi, ti] = await Promise.all([src('/server/info'), dst('GET', '/server/info')]);
  console.log(`舊：${FROM}（Directus ${fi?.version ?? '?'}）→ 新：${TO}（Directus ${ti?.version ?? '?'}）${DRY ? '（dry run，新的那台也不會改）' : ''}`);

  // ── 結構：舊的那台每個有資料表的集合（資料夾 schema 是 null、不搬內容）都要先在新的那台建好（setup-directus.cjs）──
  const [sCols, tCols] = await Promise.all([src('/collections?limit=-1'), dst('GET', '/collections?limit=-1')]);
  const cols = sCols.filter(c => !isSystem(c.collection) && c.schema);
  const tHave = new Set(tCols.filter(c => c.schema).map(c => c.collection));
  const missing = cols.map(c => c.collection).filter(c => !tHave.has(c));
  if (missing.length) throw new Error(`新的那台還沒有這些集合：${missing.join('、')}——先跑 setup-directus.cjs（DIRECTUS_URL／DIRECTUS_TOKEN 指到新的那台）`);
  const rels = await src('/relations?limit=-1');
  const relOf = (c, f) => rels.find(r => r.collection === c && r.field === f);
  // 連到帳號、角色這些系統表的欄位不搬（帳號不搬）；連到檔案、資料夾的照搬（下面先搬了）
  const toSystem = (c, f) => { const r = relOf(c, f)?.related_collection; return !!r && isSystem(r) && r !== 'directus_files' && r !== 'directus_folders'; };

  // ── 檔案庫的資料夾：照原本的 id 建（有上層的先建上層）；新的那台已經有同名同層的（setup 建的「作品」）＝沿用它的 id ──
  const folders = await src('/folders?limit=-1&fields=id,name,parent');
  const tFolders = await dst('GET', '/folders?limit=-1&fields=id,name,parent');
  const folderMap = new Map();   // 舊 id → 新 id（大多一樣）
  const byId = new Map(folders.map(f => [f.id, f])), done = new Set();
  const putFolder = async (f) => {
    if (done.has(f.id)) return;
    done.add(f.id);
    if (f.parent && byId.has(f.parent)) await putFolder(byId.get(f.parent));
    const parent = f.parent ? (folderMap.get(f.parent) ?? f.parent) : null;
    const same = tFolders.find(t => t.id === f.id) || tFolders.find(t => t.name === f.name && (t.parent ?? null) === parent);
    folderMap.set(f.id, same ? same.id : f.id);
    if (same) await dst('PATCH', `/folders/${same.id}`, { name: f.name, parent });
    else await dst('POST', '/folders', { id: f.id, name: f.name, parent });
  };
  for (const f of folders) await putFolder(f);
  console.log(`資料夾 ${folders.length} 個`);

  // ── 檔案：實體檔從舊的那台下載、照原本的 id 傳上去（欄位要放在檔案前面，Directus 才吃得到）；已經有的只更新資料 ──
  const FILE_META = ['title', 'description', 'tags', 'filename_download', 'focal_point_x', 'focal_point_y'];
  const files = await src(`/files?limit=-1&fields=id,folder,filesize,${FILE_META.join(',')}`);
  const tFiles = new Set((await dst('GET', '/files?limit=-1&fields=id')).map(f => f.id));
  const fileMap = new Map();   // 舊 id → 新 id（新的那台不收指定 id 時才會不一樣）
  let uploaded = 0;
  for (const f of files) {
    const meta = { folder: f.folder ? (folderMap.get(f.folder) ?? f.folder) : null, ...Object.fromEntries(FILE_META.map(k => [k, f[k]])) };
    if (tFiles.has(f.id)) { await dst('PATCH', `/files/${f.id}`, meta); fileMap.set(f.id, f.id); continue; }
    if (DRY) { console.log(`  [dry] 上傳 ${f.filename_download}（${Math.round((f.filesize || 0) / 1024)} KB）`); fileMap.set(f.id, f.id); continue; }
    const res = await fetch(`${FROM}/assets/${f.id}`, { headers: { Authorization: `Bearer ${FROM_TOKEN}` } });
    if (!res.ok) throw new Error(`下載 ${f.filename_download}（${f.id}）→ ${res.status}`);
    const form = new FormData();
    form.append('id', f.id);
    for (const [k, v] of Object.entries(meta)) if (v != null) form.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    form.append('file', await res.blob(), f.filename_download || f.id);
    const made = await dst('POST', '/files', form);
    fileMap.set(f.id, made?.id ?? f.id);
    uploaded++;
  }
  const remapped = [...fileMap].filter(([a, b]) => a !== b).length;
  console.log(`檔案 ${files.length} 個（新傳 ${uploaded}）${remapped ? `；${remapped} 個 id 變了，內容裡的引用照新的改` : ''}`);

  // ── 內容：照關聯排順序（被選的先搬：庫 → 內容 → 子表 → junction），每一筆照原本的主鍵 ──
  const deps = new Map(cols.map(c => [c.collection, new Set()]));
  for (const r of rels) if (deps.has(r.collection) && deps.has(r.related_collection) && r.collection !== r.related_collection) deps.get(r.collection).add(r.related_collection);
  const order = [], seen = new Set();
  const visit = (c) => { if (seen.has(c)) return; seen.add(c); deps.get(c).forEach(visit); order.push(c); };
  [...deps.keys()].forEach(visit);

  const skipped = [], report = [];
  for (const c of order) {
    const meta = cols.find(x => x.collection === c).meta || {};
    const [sf, tf] = await Promise.all([src(`/fields/${c}`), dst('GET', `/fields/${c}`)]);
    const tFields = new Set(tf.map(f => f.field));
    const pk = sf.find(f => f.schema?.is_primary_key)?.field || 'id';
    // 只搬實際的欄位（alias＝一對多、多對多、檔案群組這些是反向的，資料在子表／junction 裡，跟著那張表搬）
    const raw = sf.filter(f => f.type !== 'alias' && !toSystem(c, f.field)).map(f => f.field);
    const lost = raw.filter(f => !tFields.has(f));
    if (lost.length) skipped.push(`${c}：${lost.join('、')}`);
    const keep = raw.filter(f => tFields.has(f));
    const fileFields = keep.filter(f => relOf(c, f)?.related_collection === 'directus_files');
    const fix = (x) => { const o = Object.fromEntries(keep.map(k => [k, x[k]])); fileFields.forEach(k => { if (o[k]) o[k] = fileMap.get(o[k]) ?? o[k]; }); return o; };
    if (meta.singleton) {
      const item = await src(`/items/${c}?fields=${raw.join(',')}`);
      if (item) { const { [pk]: _, ...body } = fix(item); await dst('PATCH', `/items/${c}`, body); }   // 單例：沒有就建、有就蓋
      report.push([c, item ? 1 : 0]);
      continue;
    }
    const items = (await src(`/items/${c}?limit=-1&fields=${raw.join(',')}`)) || [];
    const have = new Set(((await dst('GET', `/items/${c}?limit=-1&fields=${pk}`)) || []).map(x => String(x[pk])));
    const create = items.filter(x => !have.has(String(x[pk]))), update = items.filter(x => have.has(String(x[pk])));
    for (const batch of chunks(create.map(fix), 100)) await dst('POST', `/items/${c}`, batch);
    for (const x of update) await dst('PATCH', `/items/${c}/${encodeURIComponent(x[pk])}`, fix(x));
    report.push([c, items.length]);
  }
  console.log('內容：' + report.map(([c, n]) => `${c} ${n}`).join('、'));
  if (skipped.length) console.log(`⚠ 新的那台沒有、沒搬的欄位（多半是藏起來的舊欄位；要的話先補進 setup-directus.cjs 再重跑）：\n  ${skipped.join('\n  ')}`);

  // ── 專案設定：名稱、顏色、語言、登入頁（只搬兩邊都有的那幾欄）──
  const KEEP = ['project_name', 'project_descriptor', 'project_url', 'project_color', 'project_logo', 'default_language', 'default_appearance', 'public_foreground', 'public_background', 'public_note'];
  const tSettings = await dst('GET', '/settings') || {};
  const want = KEEP.filter(k => k in tSettings);
  if (want.length) {
    const st = await src(`/settings?fields=${want.join(',')}`);
    const body = Object.fromEntries(want.map(k => [k, ['project_logo', 'public_foreground', 'public_background'].includes(k) && st[k] ? (fileMap.get(st[k]) ?? st[k]) : st[k]]));
    await dst('PATCH', '/settings', body);
  }
  if (DRY) { console.log('dry run 結束（沒有比對）'); return; }

  // ── 比對：每個集合的每一筆（照主鍵、只看兩邊都有的欄位）、每個檔案 ──
  const bad = [];
  for (const c of order) {
    const meta = cols.find(x => x.collection === c).meta || {};
    const [sf, tf] = await Promise.all([src(`/fields/${c}`), dst('GET', `/fields/${c}`)]);
    const tFields = new Set(tf.map(f => f.field));
    const pk = sf.find(f => f.schema?.is_primary_key)?.field || 'id';
    const keep = sf.filter(f => f.type !== 'alias' && tFields.has(f.field) && (!meta.singleton || f.field !== pk) && !toSystem(c, f.field)).map(f => f.field);
    const fileFields = keep.filter(f => relOf(c, f)?.related_collection === 'directus_files');
    const get = async (base, token) => { const d = await call(base, token, 'GET', `/items/${c}?limit=-1&fields=${keep.join(',')}`); return Array.isArray(d) ? d : d ? [d] : []; };
    const [a, b] = await Promise.all([get(FROM, FROM_TOKEN), get(TO, TO_TOKEN)]);
    const norm = (x, map) => { const o = Object.fromEntries(keep.map(k => [k, x[k] ?? null])); if (map) fileFields.forEach(k => { if (o[k]) o[k] = fileMap.get(o[k]) ?? o[k]; }); return o; };
    const bMap = new Map(b.map(x => [meta.singleton ? 'single' : String(x[pk]), canon(norm(x))]));
    const diff = a.filter(x => bMap.get(meta.singleton ? 'single' : String(x[pk])) !== canon(norm(x, true)));
    if (a.length !== b.length || diff.length) bad.push(`${c}：舊 ${a.length} 筆、新 ${b.length} 筆，不一樣的 ${diff.length} 筆${diff[0] ? `（例：${pk} ${diff[0][pk] ?? 'single'}）` : ''}`);
  }
  const tAll = new Map(((await dst('GET', '/files?limit=-1&fields=id,filesize')) || []).map(f => [f.id, f.filesize]));
  const lostFiles = files.filter(f => tAll.get(fileMap.get(f.id) ?? f.id) === undefined);
  const sizeOff = files.filter(f => { const s = tAll.get(fileMap.get(f.id) ?? f.id); return s !== undefined && Number(s) !== Number(f.filesize); });
  if (lostFiles.length) bad.push(`檔案少了 ${lostFiles.length} 個（例：${lostFiles[0].filename_download}）`);
  if (sizeOff.length) bad.push(`檔案大小對不上 ${sizeOff.length} 個（例：${sizeOff[0].filename_download}）`);
  console.log(bad.length ? `✗ 比對不一致：\n  ${bad.join('\n  ')}` : `✓ 比對完全一致：${order.length} 個集合、${files.length} 個檔案`);
  console.log('記得：帳號沒有搬（密碼搬不出來），請在新的那台後台自己開；之後換網址見 docs/Directus-搬到11.md');
  if (bad.length) process.exit(1);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
