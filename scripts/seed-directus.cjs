// 介面文字（ui_labels）← 掃前台各頁 HTML 的 data-label，後台沒有的 key 補上（後台改過的字不蓋）。
// 新的固定文字＝HTML 標 data-label（中文內文＋data-en）再跑這支。
// 原本也把各頁 HTML 的示意內容寫進後台（user 2026-11-21：全站接後台），2026-11-26 拿掉：各頁 HTML 不放示意了
// （user：「我們不需要假資料」），內容一律在後台填。JS 自己組的介面文字（curriculum.year.N、activities.type.*…）不在 HTML 裡、掃不到，
// 那幾個 key 後台已經有了；要加新的就直接在後台「介面文字」加。
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
const findAll = (el, p, out = []) => { for (const c of el?.children || []) if (c?.tag) { if (p(c)) out.push(c); findAll(c, p, out); } return out; };
const text = n => (n.text ?? n.children.map(text).join('')).replace(/\s+/g, ' ').trim();

// 介面文字：掃殼＋每頁的 data-label，一個 key 一筆（同 key 取第一次出現的字）；分類照 key 的開頭（setup-directus.cjs LABEL_CATS）
const LABEL_CAT = k => k.startsWith('nav.') ? '選單與頁名' : /^(menu|bar|common|page)\./.test(k) ? '底列與共用' : k.startsWith('faculty.') ? '師資'
  : k.startsWith('curriculum.') ? '課程' : k.startsWith('contact.') ? '聯絡' : k.startsWith('activities.') ? '動態' : k.startsWith('error.') ? '404' : null;
function labels() {
  const m = new Map();
  for (const f of ['pages/header.html', 'index.html', ...fs.readdirSync('pages').filter(f => f.endsWith('.html') && f !== 'header.html').map(f => 'pages/' + f)])
    for (const el of findAll(parse(f), e => e.attrs['data-label'])) {
      const key = el.attrs['data-label'];
      if (!m.has(key)) m.set(key, { key, zh: text(el), en: el.attrs['data-en'] ?? '', category: LABEL_CAT(key) });
    }
  return [...m.values()].map((r, i) => ({ ...r, sort: i + 1 }));
}

(async () => {
  console.log(`Directus ${BASE}${DRY ? '（dry run，只印不寫）' : ''}`);
  const haveKeys = new Set(((await api('GET', '/items/ui_labels?limit=-1&fields=key')) || []).map(r => r.key));
  const add = labels().filter(l => !haveKeys.has(l.key));
  console.log(`${add.length ? '+' : '='} ui_labels：新增 ${add.length} 個 key（後台已有 ${haveKeys.size} 個）`);
  if (DRY) add.forEach(l => console.log(`    ${l.key}：${l.zh} / ${l.en}（${l.category}）`));
  else if (add.length) await api('POST', '/items/ui_labels', add);
  console.log('完成');
})().catch(e => { console.error(e.message); process.exit(1); });
