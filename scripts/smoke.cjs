// SCAID 煙霧測試：本地靜態 server ＋ Playwright webkit。手機先、桌面後：
// 全站殼（logo 位置、透明選單＋內容右推、語言切換、底列矩形鈕 hover 名字、動態跑馬燈、intro dialog）、聯絡頁（後台 footer 單例）、
// router（全部頁面／返回／404／hash 不重載）、首頁動態展開、自製 scrollbar。
// 用法：node scripts/smoke.cjs <playwright 套件目錄> [webkit 執行檔]
//   本機：node scripts/smoke.cjs "../SCCD Website/node_modules/playwright" "%LOCALAPPDATA%/ms-playwright/webkit-2370/Playwright.exe"
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const { webkit } = require(path.resolve(process.argv[2]));
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  fs.readFile(path.join(ROOT, p), (err, data) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});
// logo SVG 的 viewBox（寬、高）：直接讀檔，設計換圖後 CSS 的 --logo-vb-w／h 沒跟著改就會掛
const vb = f => fs.readFileSync(path.join(ROOT, 'images', f), 'utf8').match(/viewBox="([^"]+)"/)[1].trim().split(/[\s,]+/).map(Number);
const [, , LOGO_VB_W, LOGO_VB_H] = vb('Logo Text.svg');   // 系名的文字版
const [, , LOGO_M_VB_W, LOGO_M_VB_H] = vb('Logo Text Mobile.svg');   // 手機那張（user 2026-11-23：窄、英文拆三行）
// 文字版 logo 英文最後一行的底（viewBox 單位）：照 y 把字分成一行一行（兩端的骨牌 45×70 不算），中文是最後一行、它上面那行就是英文最後一行。
// 英文版（variables.css html[lang="en"] --logo-vb-h）＝框只到這裡、右骨牌對齊它（user 2026-11-23）；設計換圖後要跟著改
const lastEnBottom = (/** @type {any} */ pg, /** @type {string} */ file) => pg.evaluate((/** @type {string} */ svg) => {
  const box = document.createElement('div'); box.innerHTML = svg; document.body.append(box);
  /** @type {{ t: number, b: number }[]} */ const rows = [];
  for (const e of /** @type {NodeListOf<SVGGraphicsElement>} */ (box.querySelectorAll('path'))) {
    const g = e.getBBox(); if (Math.abs(g.width - 45) < .5 && Math.abs(g.height - 70) < .5) continue;
    const r = rows.find(r => g.y < r.b - 2 && g.y + g.height > r.t + 2);
    if (r) { r.t = Math.min(r.t, g.y); r.b = Math.max(r.b, g.y + g.height); } else rows.push({ t: g.y, b: g.y + g.height });
  }
  box.remove(); rows.sort((x, y) => x.t - y.t); return rows[rows.length - 2].b;
}, fs.readFileSync(path.join(ROOT, 'images', file), 'utf8'));
/** 這一頁在英文版時的 --logo-vb-h（只換 <html lang>、馬上換回來） @param {any} pg */
const enVbH = (pg) => pg.evaluate(() => { const h = document.documentElement, l = h.lang; h.lang = 'en'; const v = parseFloat(getComputedStyle(h).getPropertyValue('--logo-vb-h')); h.lang = l; return v; });
const STROKE_VB_H = 70;   // stroke 的高（variables.css --logo-stroke-vb-h）；2026-11-22 起 stroke 是 logo.js 排的直條（.logo-bars）、不是一張圖
const PAGES = ['contact', 'about', 'partners', 'faculty', 'curriculum', 'works', 'activities', 'records', 'press', 'admission', 'qa', 'donate', 'regulations', 'sitemap'];
const fails = [], errors = [];
// 進度寫到 stderr（SMOKE_PROGRESS=1）：卡住時看得出停在哪一條（page.evaluate 裡的 Promise 沒有逾時，等不到就一直等）
const assert = (c, msg) => { if (!c) fails.push(msg); if (process.env.SMOKE_PROGRESS) process.stderr.write(`${c ? 'ok' : 'FAIL'} ${String(msg).slice(0, 80)}\n`); };
const CORS = { 'Access-Control-Allow-Origin': '*' };
const BG_JS = /modules\/ui\/bg\.js/;
// 背景與清單圖片 hover 的中空板先關掉（user 2026-11-23）：照 main.js 的 DECOR 決定測不測；關著＝只守「真的沒有」
const DECOR = /^const DECOR = true;/m.test(fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8'));
const watch = async (page, { logo = false } = {}) => {
  // logo（logo.js）第一次載入有進場動畫、首頁一直在 stroke 和文字之間來回：其他段落量 logo 的位置大小會撞到
  // → 掛 <html data-logo-still>＝不演、直接到位（首頁文字版、內頁 stroke 版；進場那段「其他東西先藏著」也沒有）。
  // logo 自己那段（搜「logo 的動態」）傳 { logo: true } 演真的。init script 跑的時候 <html> 還沒長出來（WebKit）→ 等它一出現就掛
  if (!logo) await page.addInitScript(() => {
    const mark = () => document.documentElement && (document.documentElement.setAttribute('data-logo-still', ''), true);
    if (!mark()) new MutationObserver((_, o) => { if (mark()) o.disconnect(); }).observe(document, { childList: true });
  });
  // 背景（bg.js）游標一動就每幀整張重畫：這支 Windows WebKit 是軟體繪圖、幀率會掉很多，其他段落數幀的動畫斷言會誤判
  // → 換成空的；背景自己那段（搜「背景（user 2026-11-21）」）再拿掉。真的 Safari 的效能要在 Mac 上看
  await page.route(BG_JS, r => r.fulfill({ contentType: 'text/javascript', body: 'export const INK = {}; export function initBg() {}' }));
  // 後台（Directus）：測試不靠正式後台的資料——沒另外給假資料的一律回空的（＝各頁留 HTML 的示意，同後台還沒填）。
  // 最先註冊＝優先順序最低（Playwright 後註冊的先比對），下面與各測試自己給的假資料會蓋過它
  await page.route(/scaidcms\.usc\.edu\.tw/, r => r.fulfill({ headers: CORS, json: { data: [] } }));
  // 相簿／封面／輪播的 stock 圖（picsum）換成本地假圖：排版斷言不靠網路、尺寸固定 1200×800（3:2）
  await page.route(/picsum\.photos/, r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#999"/></svg>' }));
  // 作品頁的 YouTube（縮圖、播放器、Data API）也不靠網路：縮圖＝假圖、播放器＝空頁、播放清單＝沒有影片（作品那段自己給假的）
  await page.route(/i\.ytimg\.com|youtube-nocookie\.com|googleapis\.com\/youtube/, r => {
    const u = r.request().url();
    if (/ytimg/.test(u)) r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#555"/></svg>' });
    else if (/googleapis/.test(u)) r.fulfill({ headers: CORS, json: { items: [] } });
    else r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>player</title>' });
  });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  // 換頁時還在路上的模型（objects/）、字體切片被取消＝不是錯（object 的模型輪到才抓、logo 量 object 的名字會多抓一個字重）
  const cancelled = r => /cancel/i.test(r.failure()?.errorText ?? '') && /\/(objects|fonts)\//.test(r.url());
  page.on('requestfailed', r => { const u = r.url(); if (new URL(u).hostname === '127.0.0.1' && !u.endsWith('intro-test.mp4') && !cancelled(r)) errors.push(`reqfailed: ${u}（${r.failure()?.errorText}，頁面 ${new URL(page.url()).pathname}）`); });
  // 輪播／相簿的示意圖是外站 Lorem Picsum：測試不靠外網（DNS 一不穩就一排 console error）→ 回一張空的 3:2 SVG
  const stub = page.route(/picsum\.photos/, r => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 2" width="1200" height="800"/>' }));
  // 假 Directus footer 單例（後台網域還是 placeholder，不接會 DNS 失敗）
  return stub.then(() => page.route(/\/items\/footer/, r => r.fulfill({ headers: { 'Access-Control-Allow-Origin': '*' }, json: { data: {
    // 聯絡資訊＝清單（子集合 footer_sections；user 2026-11-24：同師資詳細頁、後台可以自己加、每一筆可以填連結）：照 sort、英文空退中文；
    // 連結＝直接貼信箱（當 mailto）／https（另開新視窗）／javascript: 擋掉＝純文字；沒文字的那筆不算、一筆都沒有的清單（傳真）不出
    sections: [
      { sort: 2, title_zh: '電話', title_en: null, entries: [{ text_zh: '02 1111 1111', text_en: null, url: null }, { text_zh: '壞連結', text_en: 'Bad', url: 'javascript:alert(1)' }] },
      { sort: 1, title_zh: '電子郵件', title_en: 'E-Mail', entries: [{ text_zh: 'cms@example.com', text_en: null, url: 'cms@example.com' }, { text_zh: '', text_en: '', url: 'https://example.com/empty' }] },
      { sort: 3, title_zh: '傳真', title_en: 'Fax', entries: [] },
      { sort: 4, title_zh: '地址', title_en: 'Address', entries: [{ text_zh: '後台地址（示意）', text_en: null, url: 'https://example.com/map' }] },
    ],
    instagram: 'https://example.com/ig', youtube: 'https://example.com/yt',
    links: [{ label_zh: '後台系所（示意）', label_en: 'CMS Department', url: 'https://example.com/sccd' }, { label_zh: '只有中文（示意）', label_en: null, url: 'https://example.com/zh' }, { label: 'SCCD', url: 'https://example.com/old' }], badge: null,
  } } }))).then(() => page.route(/\/items\/faculty/, r => r.fulfill({ headers: { 'Access-Control-Allow-Origin': '*' }, json: { data: [
    // 假 Directus faculty：副標兩行／只有一筆空的／沒有；沒有行政管理（類別值 admin；那段要收掉）
    // 名字從人名庫來（person，user 2026-11-21）
    { id: 1, category: 'full_time', photo: null, person: { name_zh: '後台老師一（示意）', name_en: 'CMS Teacher 1' }, subtitles: [{ text_zh: '學程主任', text_en: 'Program Director' }, { text_zh: '教授', text_en: null }] },
    { id: 2, category: 'full_time', photo: null, person: { name_zh: '後台老師二（示意）', name_en: null }, subtitles: [{ text_zh: '', text_en: '' }] },
    { id: 3, category: 'part_time', photo: null, person: { name_zh: '<b>後台老師三</b>（示意）', name_en: 'CMS Teacher 3' }, subtitles: null },
  ] } }))).then(() => page.route(/\/items\/partners/, r => r.fulfill({ headers: { 'Access-Control-Allow-Origin': '*' }, json: { data: [
    // 假 Directus partners（同師資那種列）：有官網＋兩行副標（第二行長、會折行）／沒官網／官網不是 http(s)
    // 名字從單位庫來（organization，user 2026-11-21）
    { id: 1, logo: null, organization: { name_zh: '後台企業一（示意）', name_en: 'CMS Partner 1' }, url: 'https://example.com/p1', subtitles: [{ text_zh: '示意：協同授課', text_en: null },
      { text_zh: '示意：三年級專案命題、四年級全年實習、業師進班、美術管線工作坊、虛擬製作設備支援、展演專案合作、獎助學金、就業媒合', text_en: null }] },
    { id: 2, logo: null, organization: { name_zh: '後台企業二（示意）', name_en: null }, url: null, subtitles: [] },
    { id: 3, logo: null, organization: { name_zh: '後台企業三（示意）', name_en: null }, url: 'javascript:alert(1)', subtitles: [{ text_zh: '示意：專案命題', text_en: 'Placeholder: briefs' }] },
  ] } })));
};
const css = (page, sel, prop, pseudo) => page.$eval(sel, (el, a) => getComputedStyle(el, a.pseudo || null)[a.prop], { prop, pseudo });
const rect = (page, sel) => page.$eval(sel, el => { const r = el.getBoundingClientRect(); return { top: r.top, left: r.left, width: r.width, height: r.height, cy: r.top + r.height / 2 }; });
const tx = (page, sel) => page.$eval(sel, el => new DOMMatrix(getComputedStyle(el).transform).m41);
const has = (page, cls) => page.evaluate(c => document.documentElement.classList.contains(c), cls);
// 選單下半部（user 2026-11-21）：次選單兩區之間、聯絡 → 語言鈕、語言鈕 → menu 鈕骨牌，三段距離都＝nav 的 gap
// 次選單兩區之間、次選單 → 深色模式＋EN 那組、那組 → 底列 menu 鈕：同一個分區間距；組裡深色模式 → EN＝選項間距（user 2026-11-21）；
// 深色模式鈕的 icon＝menu 鈕骨牌的高（user 2026-11-24；原本鈕跟 EN 同高＝一行字）
// 2026-11-24 起（user：「我想讓規章那組跟常見問題那組對調位置，然後讓常見問題那組也 sticky 在畫面上」「組跟組之間的 gap 改成 xl 吧」）：
// 捲動框＝主選單＋規章那組；固定＝常見問題那組（.site-menu-links 裡、框的下面）＋深色模式、EN。捲動框 → 常見問題那組 → 深色模式那組 → menu 鈕骨牌＝同一個分區間距 xl
const menuGaps = (page) => page.evaluate(() => { const r = (el) => el.getBoundingClientRect(), q = (s) => /** @type {Element} */ (document.querySelector(s)), fixed = q('.site-menu-links > .menu-sub'), tools = q('.menu-tools');
  return { gap: parseFloat(getComputedStyle(q('.site-menu-nav')).rowGap), xl: parseFloat(getComputedStyle(q('.site-menu-links')).rowGap),
    fixed: r(fixed).top - r(q('.site-menu-nav')).bottom, tools: r(tools).top - r(fixed).bottom, bar: r(q('.menu-btn .bar-rect')).top - r(tools).bottom,
    order: [...document.querySelectorAll('.menu-sub')].map(u => u.querySelector('a')?.getAttribute('href')).join(), inNav: !!q('.site-menu-nav > .menu-sub a[href="regulations.html"]'),
    item: parseFloat(getComputedStyle(fixed).rowGap), tool: r(q('.lang-btn')).top - r(q('.theme-btn')).bottom,
    toolH: [r(q('.theme-btn .icon')).height, r(q('.menu-btn .bar-rect')).height],
    // 內容區的底線（畫面底往上 --top-h＝#page-content 的上內距）到 menu 鈕骨牌＝燈箱裡撐滿高度的圖片到 ‹X› 的距離
    line: r(q('.menu-btn .bar-rect')).top - (innerHeight - parseFloat(getComputedStyle(q('#page-content')).paddingTop)) }; });
// 選項間距＝sm（user 2026-11-24：「menu 的選單之間的 gap 改成 sm，同步調整 sitemap 的」；原本 xs）
// 深色模式那組 → menu 鈕：手機＝分區的 gap xl；桌面＝那組的底停在內容區的底線＝同燈箱圖片到 ‹X›（user 2026-11-24：「改跟圖片的一樣」；手機那條線貼到底列，照舊 xl）
const menuGapsOk = (/** @type {any} */ g, desktop = false) => g.gap === g.xl && [g.fixed, g.tools].every(x => Math.abs(x - g.xl) < 1) && Math.abs(g.bar - (desktop ? g.line : g.xl)) < 1
  && g.order === 'regulations.html,qa.html' && g.inNav
  && g.item === 16 && Math.abs(g.tool - g.item) < 1 && Math.abs(g.toolH[0] - g.toolH[1]) < 1;
// 切深色模式／語言＝整個畫面交叉淡化（View Transition，user 2026-11-21）：DOM 是下一幀才改 → 點完等它換好。
// 回傳那一下畫面上正在跑的交叉淡化各多久（ms；新舊兩張）——沒有＝沒在淡
const swap = async (page, sel) => {
  const state = () => page.evaluate(() => document.documentElement.lang + '|' + (document.documentElement.dataset.theme || ''));
  const before = await state();
  await page.click(sel);
  await page.waitForFunction(b => document.documentElement.lang + '|' + (document.documentElement.dataset.theme || '') !== b, before);
  const vt = () => document.getAnimations().filter(x => x.effect instanceof KeyframeEffect && /^::view-transition-(old|new)/.test(x.effect.pseudoElement || '')).map(x => x.effect.getTiming().duration);
  await page.waitForFunction(`(${vt})().length > 0`, null, { timeout: 2000 }).catch(() => {});
  return page.evaluate(`(${vt})()`);
};
// key＝用鍵盤開：首頁動態展開著 menu 鈕點不到（chrome.css，user 2026-11-24），鍵盤照常按得到
const openMenu = async (page, key = false) => { if (!(await has(page, 'menu-open'))) { if (key) { await page.focus('.menu-btn'); await page.keyboard.press('Enter'); } else await page.click('.menu-btn'); await page.waitForFunction(() => document.documentElement.classList.contains('menu-open')); } };

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await webkit.launch(process.argv[3] ? { executablePath: process.argv[3] } : {});

  // ── 手機 390 ──
  const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await watch(m);
  await m.goto(base + '/index.html');
  await m.waitForSelector('#site-header .site-bar');
  assert((await m.textContent('main h1')) === '實踐大學AI設計職人學位學程', 'index h1（sr-only）zh');
  assert(/JetBrains Mono.+Glow Sans TC Compressed/.test(await css(m, 'body', 'fontFamily')), 'font 堆疊：JetBrains Mono → Glow Sans TC Compressed');
  // 中文字體是自架切片：兩個字重都抓得到；TC 版缺、從 J 版補的字（教清真…，build-fonts.py 的 -j 那片）也在
  assert(await m.evaluate(() => Promise.all([400, 700].map(w => document.fonts.load(`${w} 16px "Glow Sans TC Compressed"`, '實踐大學教清真值告')))
    .then(r => r.every(f => f.length >= 2 && f.every(x => x.status === 'loaded')), () => false)), '中文字體 Glow Sans 切片載入（含補上的字）');
  // 中文字距照 logo 的中文（user 2026-11-21）：字寬燒在字體裡＝每個中文字 1.005em（原本 0.8em＋0.205em）、J 補的字一樣；英數（JetBrains Mono）不變 0.6em
  {
    const w = await m.evaluate(() => { const s = document.createElement('span'); s.style.cssText = 'position:absolute;white-space:nowrap;font-size:100px;visibility:hidden'; document.body.append(s);
      const out = ['學學學學', '為教，。', 'AI20'].map(t => { s.textContent = t; return s.getBoundingClientRect().width / t.length; }); s.remove(); return out; });
    assert(Math.abs(w[0] - 100.5) < 0.2 && Math.abs(w[1] - 100.5) < 0.2 && Math.abs(w[2] - 60) < 0.2, `中文字距：每字 1.005em、英數 0.6em（${w.map(x => x.toFixed(2))}）`);
  }
  assert(await m.$('link[rel="icon"][href*="favicon.svg"]') !== null, 'favicon link');
  { const pt = parseFloat(await css(m, '#page-content', 'paddingTop')), bh = (await rect(m, '.menu-btn .bar-rect')).height;   // 骨牌高＝logo 一行（stroke 版）的高
    assert(Math.abs(pt - 2 * bh) < 0.5 && await css(m, '#page-content', 'paddingBottom') === '64px', `mobile main 頂距 top-h＝logo 高的兩倍（user 2026-11-24，原本 6rem；${pt} vs 骨牌 ${bh}）／底距 bar-h`); }
  // 首頁未展開：logo 置中、放大、名字藏
  let lr = await rect(m, '.site-logo');
  assert(Math.abs(lr.cy - 422) < 3 && Math.abs(lr.left + lr.width / 2 - 195) < 2, `index logo 畫面正中（cx ${lr.left + lr.width / 2} cy ${lr.cy}）`);
  assert(Math.abs(lr.width - 280.5) < 1 && lr.height > 30, `首頁 logo＝鎖定版（沒有長條）、寬＝扣內距後第 1 欄正中 → 第 4 欄正中（390：(358＋16)×3/4；user 2026-11-24）（${lr.width}×${lr.height}）`);
  // logo SVG 走 mask：網址要抓得到（檔名有空白）
  assert(await css(m, '.logo-text', 'opacity') === '1' && await css(m, '.logo-bars i', 'opacity') === '0' && Math.abs(lr.height - lr.width * LOGO_M_VB_H / LOGO_M_VB_W) < 0.5, `首頁 logo＝有名字那版（手機那張，${lr.width}×${lr.height}）`);
  for (const sel of ['.logo-text'])
    assert(await m.$eval(sel, el => { const s = getComputedStyle(el); return fetch((s.maskImage || s.webkitMaskImage).slice(5, -2)).then(r => r.ok, () => false); }), `${sel} mask SVG 抓得到`);
  // 底列：menu＋play＋右下角的右圖鈕（user 2026-11-23；右下原本的 footer 鈕 2026-11-21 搬進選單＝聯絡頁）、名字 hover 才現
  assert(await m.$$eval('.site-bar .bar-btn', b => b.length) === 3, '底列 3 個鈕：menu、intro、右下角的右圖鈕（user 2026-11-23）');
  // 手機的 logo＝Logo Text Mobile.svg（user 2026-11-23）：框的比例＝它的 viewBox；英文版只到英文最後一行（去掉中文那行、右骨牌對齊）
  { const lt = await rect(m, '.logo-text'), en = await lastEnBottom(m, 'Logo Text Mobile.svg'), got = await enVbH(m);
    assert(Math.abs(lt.width / lt.height - LOGO_M_VB_W / LOGO_M_VB_H) < 0.01 && Math.abs(got - en) < 0.05,
      `手機 logo：框的比例＝Logo Text Mobile.svg、英文版的高＝英文最後一行的底（框 ${(lt.width / lt.height).toFixed(3)} vs ${(LOGO_M_VB_W / LOGO_M_VB_H).toFixed(3)}；英文 ${got} vs ${en.toFixed(2)}）`); }
  let nr = await rect(m, '.bar-news');
  assert(Math.abs(nr.left + nr.width / 2 - 195) < 2, `動態在畫面正中（cx ${nr.left + nr.width / 2}）`);
  const br = await rect(m, '.menu-btn .bar-rect');
  assert(Math.abs(844 - (br.top + br.height) - 32) < 4, `底列貼底 bar-pad 32（rect bottom ${844 - br.top - br.height}）`);
  assert(await m.$('.site-bar .play-btn .icon-play') !== null && Math.abs((await rect(m, '.play-btn .icon')).height - br.height) < 0.5,
    'intro 鈕是 play icon、跟 menu 鈕的骨牌一樣高（user 2026-11-24：icon 的高度都跟 menu 的那個一樣）');
  assert(await css(m, '.menu-btn .bar-label', 'width') === '0px' && await css(m, '.menu-btn .bar-label', 'opacity') === '0' && Math.abs((await rect(m, '.menu-btn')).width - br.width) < 0.5, 'label 視覺隱藏（寬 0、不佔位）');
  // 進出場＝fade（user 2026-11-21）：選單收著是透明的、menu 鈕的圓點與名字現／隱都有 opacity 過場
  assert(await css(m, '.site-menu', 'opacity') === '0' && /opacity/.test(await css(m, '.site-menu', 'transitionProperty')) && /opacity/.test(await css(m, '.menu-btn .bar-rect', 'transitionProperty', '::after'))
    && /opacity/.test(await css(m, '.menu-btn .bar-label', 'transitionProperty')), '選單、menu 鈕圓點與名字：進出場有 fade');
  assert(await m.$$eval('.site-bar .bar-btn', bs => bs.every(b => !b.hasAttribute('aria-label'))), '名字＝報讀名稱（不另掛 aria-label）');
  // menu 鈕 hover 不出名字（user 2026-11-21：hover、點開選單都不要文字說明），只出中間的圓點；名字還在＝報讀名稱
  await m.hover('.menu-btn');
  await m.waitForTimeout(450);
  assert(await css(m, '.menu-btn .bar-label', 'width') === '0px' && await css(m, '.menu-btn .bar-label', 'opacity') === '0' && await css(m, '.menu-btn .bar-rect', 'opacity', '::after') === '1'
    && (await m.textContent('.menu-btn .bar-label')) === '選單', 'hover menu 鈕：只出圓點、不出名字（名字留著當報讀名稱）');
  // 首頁的動態（user 2026-11-23：拿掉＋、只剩跑馬燈、一次只顯示一則；換的節奏在桌面那段測）：同時只看得到一則、沒有＋、兩端不淡、佔滿中欄
  {
    await m.waitForFunction(() => !!document.querySelector('.bar-news-copy > .is-current'));
    const s0 = await m.evaluate(() => { const sp = [...document.querySelectorAll('.bar-news-copy > span')], t = /** @type {Element} */ (document.querySelector('.bar-news-track')), cs = getComputedStyle(t);
      return { n: sp.length, shown: sp.filter(x => getComputedStyle(x).visibility === 'visible').length, plus: !!document.querySelector('.bar-plus'), mask: cs.maskImage || cs.webkitMaskImage, o: cs.opacity }; });
    const col = await rect(m, '.bar-news'), tkr = await rect(m, '.bar-news-track');
    assert(s0.n >= 3 && s0.shown === 1 && !s0.plus && s0.mask === 'none' && s0.o === '1' && Math.abs(tkr.left - col.left) < 1 && Math.abs(tkr.width - col.width) < 1,
      `動態：一次一則、沒有＋、兩端不淡、佔滿中欄（${JSON.stringify(s0)}、欄 ${col.left}～${col.left + col.width}、跑馬燈 ${tkr.left}～${tkr.left + tkr.width}）`);
    // 放得下的在欄裡置中（user 2026-11-23 手機回報被切到：自動的欄被最長那則撐寬，放得下的置中到撐寬的欄裡＝偏右、被切掉）。
    // 每則都看（藏著的也照樣排版）；offset＝不算跑馬燈的位移
    const off = await m.evaluate(() => { const c = /** @type {HTMLElement} */ (document.querySelector('.bar-news-copy'));
      return [.../** @type {HTMLCollectionOf<HTMLElement>} */ (c.children)].filter(x => x.offsetWidth <= c.clientWidth && !x.classList.contains('is-long'))
        .map(x => Math.round(x.offsetLeft - c.offsetLeft + x.offsetWidth / 2 - c.clientWidth / 2)); });
    assert(off.length > 0 && off.every(v => Math.abs(v) <= 1), `手機動態：放得下的那幾則在欄裡置中、不偏右被切（偏 ${JSON.stringify(off)}）`);
  }

  // 選單：透明、內容右推、語言切換。打開時 play 是「移動」過去不是跳過去：逐幀記位置，中途要有落在起點與終點之間的幀
  const play0 = (await rect(m, '.play-btn')).left;
  const playTrack = await m.evaluate(() => new Promise(res => {
    const play = document.querySelector('.play-btn'), out = [];
    /** @type {HTMLElement} */ (document.querySelector('.menu-btn')).click();
    const t0 = performance.now();
    const tick = () => { out.push(play.getBoundingClientRect().left); if (performance.now() - t0 < 700) requestAnimationFrame(tick); else res(out); };
    requestAnimationFrame(tick);
  }));
  // 手機選單全螢幕（user 2026-11-22）：menu 鈕不撐、play 原地不動（桌面才滑到選單右緣）
  assert(playTrack.every(x => Math.abs(x - play0) < 0.5), `手機選單開：play 不動（起 ${play0} 終 ${playTrack[playTrack.length - 1]}）`);
  await openMenu(m);
  assert(await m.$eval('.menu-btn', b => b.getAttribute('aria-expanded')) === 'true', 'aria-expanded');
  await m.waitForTimeout(700);
  assert(await css(m, '.site-menu', 'transform') === 'none', 'menu open');
  assert(await css(m, '.site-menu', 'backgroundColor') === 'rgba(0, 0, 0, 0)', 'menu 無底色');
  // 深色模式＋語言鈕不跟著捲、只有選項捲（user 2026-11-24）；選項框的底到鈕隔一段分區的 gap（user：「模糊到下面 sticky 的內容應該要有個 gap」）。
  // 框的兩端：有東西捲過去的那一邊才淡出＋糊（選項自己糊，不碰後面的內容、選單裡沒有毛玻璃；user：「應該是要上下都 blur」「底部還多一個 blur」）＝
  // 不捲的時候第一項、捲到底時最後一項是清楚的。畫面要矮到選單捲得動
  {
    await m.setViewportSize({ width: 390, height: 560 }); await m.waitForTimeout(300);
    // 固定的那塊從常見問題那組起（user 2026-11-24：常見問題那組也 sticky）；捲動框底 → 它＝分區的 gap
    const tools0 = (await rect(m, '.site-menu-links > .menu-sub')).top, lg = parseFloat(await css(m, '.site-menu-nav', 'rowGap'));
    const rest = await m.evaluate(() => { const n = document.querySelector('.site-menu-nav'), f = getComputedStyle(document.querySelector('.menu-main li')).filter;
      return { st: getComputedStyle(n).getPropertyValue('--st').trim(), blur: f === 'none' || /blur\(0px\)/.test(f), bottom: n.getBoundingClientRect().bottom }; });
    await m.$eval('.site-menu-nav', n => { n.scrollTop = n.scrollHeight; }); await m.waitForTimeout(100);
    const end = await m.evaluate(() => { const blur = (el) => parseFloat(getComputedStyle(el).filter.match(/blur\(([\d.]+)px\)/)?.[1] ?? '0'), n = document.querySelector('.site-menu-nav'), s = /** @type {Element} */ (n.querySelector(':scope > .menu-sub'));
      return { scrolled: n.scrollTop > 0, last: s.getBoundingClientRect().bottom, tools: /** @type {Element} */ (document.querySelector('.site-menu-links > .menu-sub')).getBoundingClientRect().top,
        lastBlur: blur(/** @type {Element} */ (s.lastElementChild)), firstBlur: blur(document.querySelector('.menu-main li')), sb: getComputedStyle(n).getPropertyValue('--sb').trim(), sd: CSS.supports('animation-timeline', 'view()') }; });
    await m.$eval('.site-menu-nav', n => { n.scrollTop = 0; });
    await m.setViewportSize({ width: 390, height: 844 }); await m.waitForTimeout(300);
    assert(end.scrolled && Math.abs(end.tools - tools0) < 0.5 && Math.abs(end.tools - end.last - lg) < 1 && Math.abs(tools0 - rest.bottom - lg) < 1
      && (!end.sd || (rest.st === '0' && rest.blur && end.sb === '0' && end.lastBlur === 0 && end.firstBlur > 3.9)) && await m.$$eval('.menu-blur', e => e.length) === 0,
      `選單：只有選項捲（主選單＋規章那組）、常見問題那組＋深色模式、語言鈕固定，選項框底 → 常見問題那組＝分區間距；不捲／捲到底那一端不淡不糊、捲出去的選項自己糊掉（鈕 ${tools0}→${end.tools}、${JSON.stringify(rest)}、${JSON.stringify(end)}）`);
  }
  { const g = await menuGaps(m); assert(menuGapsOk(g), `手機選單：捲動框 → 常見問題那組 → 深色模式那組 → menu 鈕同一個分區間距 xl、規章那組在捲動框裡、選項間距 sm（${JSON.stringify(g)}）`); }
  assert(await css(m, '.site-menu', 'width') === '390px', '手機選單全螢幕（user 2026-11-22）');
  { const th = parseFloat(await css(m, '#page-content', 'paddingTop')), bh = (await rect(m, '.menu-btn .bar-rect')).height, first = (await rect(m, '.site-menu .nav-link')).top, nav = await rect(m, '.site-menu-nav');
    assert(Math.abs(first - th) < 1.5 && Math.abs(nav.top - th) < 0.5 && await css(m, '.site-menu-nav', 'overflowY') === 'auto' && /gradient/.test(await css(m, '.site-menu-nav', 'webkitMaskImage') || await css(m, '.site-menu-nav', 'maskImage')),
      `選單上緣：選項的捲動框從內容起始線開始、線以上什麼都看不到、看不見的那截在框外＝點不到（user 2026-11-24：「那個 box 就只到起始位置那裏」；第一項 ${first}、起始線 ${th}、logo 底 ${bh}、選項框頂 ${nav.top}）`); }
  // 深色模式（user 2026-11-21）：EN 上面一顆 icon 鈕；切了黑底白字、記住（reload 還是深色、CSS 前就套上）、再按切回
  {
    const theme = () => m.evaluate(() => ({ t: document.documentElement.dataset.theme || '', bg: getComputedStyle(document.body).backgroundColor, fg: getComputedStyle(document.body).color, p: document.querySelector('.theme-btn')?.getAttribute('aria-pressed') }));
    assert(await m.$('.theme-btn .icon-theme') !== null && (await theme()).bg === 'rgb(255, 255, 255)', '深色模式鈕是 icon、預設淺色');
    const fadeT = await swap(m, '.theme-btn');
    assert(fadeT.length >= 2 && fadeT.every(d => d === 400), `切深色模式：整個畫面交叉淡化 0.4s（${JSON.stringify(fadeT)}）`);
    let t = await theme();
    assert(t.t === 'dark' && t.bg === 'rgb(0, 0, 0)' && t.fg === 'rgb(255, 255, 255)' && t.p === 'true', `點深色模式：黑底白字（${JSON.stringify(t)}）`);
    await m.reload();
    assert(await m.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'reload：深色記住、一開始就套上');
    await m.waitForSelector('#site-header .site-bar');
    await openMenu(m);
    await swap(m, '.theme-btn');
    t = await theme();
    assert(t.t === '' && t.bg === 'rgb(255, 255, 255)' && t.p === 'false', '再按：切回淺色');
  }
  assert(Math.abs(await tx(m, '#page-content')) < 1, '手機選單開：內容不右推');
  // 選單開著（首頁）：logo 原地換鎖定版、不右推；menu 鈕白圓點常駐、不出名字（user 2026-11-21）、intro 還在
  lr = await rect(m, '.site-logo');
  assert(Math.abs(lr.left + lr.width / 2 - 195) < 2 && Math.abs(lr.cy - 422) < 3, `選單開：logo 原地不動（cx ${lr.left + lr.width / 2} cy ${lr.cy}）`);
  await m.mouse.move(195, 300);   // 移開，確認圓點不是靠 hover 才出
  assert(await css(m, '.menu-btn .bar-rect', 'opacity', '::after') === '1' && await css(m, '.menu-btn .bar-label', 'width') === '0px' && await css(m, '.menu-btn .bar-label', 'opacity') === '0' && await css(m, '.site-menu', 'opacity') === '1', '選單開：選單淡入完、menu 白圓點常駐、不出名字');
  assert(await css(m, '.play-btn', 'visibility') === 'visible', '選單開：intro 還在');
  const plr = await rect(m, '.play-btn');
  assert(Math.abs(plr.left - play0) < 0.5, `手機選單開：play 留在原位（left ${plr.left}）`);
  // 首頁選單開著：動態當內容處理（user 2026-11-21）——跑馬燈留著，整塊模糊＋疊 60% 白、位置不動（先試過跟內容一起右推，user：不用動）；點它＝只收選單、不展開
  assert(await css(m, '.bar-news-track', 'opacity') === '1' && await css(m, '.bar-news', 'filter') === 'blur(4px)' && await css(m, '.bar-news', 'opacity') === '0.4' && Math.abs(await tx(m, '.bar-news')) < 1,
    `選單開：動態模糊、位置不動（位移 ${await tx(m, '.bar-news')}）`);
  // 手機首頁正中的 logo、play 鈕也是首頁的內容（user 2026-11-24：原本清楚地疊在選項上）：同動態模糊＋疊白；play 不吃指標（按下去＝只收選單）
  assert(await css(m, '.site-logo', 'filter') === 'blur(4px)' && await css(m, '.site-logo', 'opacity') === '0.4' && await css(m, '.play-btn', 'filter') === 'blur(4px)'
    && await css(m, '.play-btn', 'opacity') === '0.4' && await css(m, '.play-btn', 'pointerEvents') === 'none', '手機首頁選單開：正中的 logo、play 鈕模糊＋疊白、play 不吃指標');
  // 深色模式／語言切換時動態自己一組、不放靜止的舊截圖（user 2026-11-21：跑馬燈在交叉淡化時會停一下）
  assert(await css(m, '.bar-news', 'viewTransitionName') === 'bar-news', '動態有自己的 view-transition-name');
  await m.evaluate(() => /** @type {HTMLElement} */ (document.querySelector('.bar-news')).click());
  assert(!(await has(m, 'menu-open')) && !(await has(m, 'news-open')), '選單開著點動態：只收選單、不展開');
  await m.waitForTimeout(700);
  assert(await css(m, '.bar-news', 'filter') === 'none' && await css(m, '.bar-news', 'opacity') === '1' && Math.abs(await tx(m, '.bar-news')) < 1, '選單收了：動態回原位、不糊');
  assert(await css(m, '.site-logo', 'filter') === 'none' && await css(m, '.site-logo', 'opacity') === '1' && await css(m, '.play-btn', 'opacity') === '1',
    '選單收了：logo、play 也回清楚');
  // 選單開著動態不吃指標（user 2026-11-21，同其他頁的內容）：指上去那一點最上面是底列本身＝不 hover；真的按下去＝只收選單、不展開
  await openMenu(m);
  {
    const c = await rect(m, '.bar-news'), x = c.left + c.width / 2, y = c.top + c.height / 2;
    const top = await m.evaluate(([x, y]) => document.elementFromPoint(x, y)?.className, [x, y]);
    await m.mouse.click(x, y);
    assert(top === 'site-bar' && !(await has(m, 'menu-open')) && !(await has(m, 'news-open')), `選單開著動態不吃指標：指到的是底列（${top}）、按下去只收選單、不展開`);
  }
  await m.waitForTimeout(700);
  await openMenu(m);
  await m.waitForTimeout(700);
  // 語言：選單、底列名字都跟著換
  assert((await m.textContent('.lang-btn')) === 'EN' && (await m.textContent('.menu-main a[href="about.html"]')) === '關於', 'zh 預設');
  const pl0 = (await rect(m, '.play-btn')).left;
  const fadeL = await swap(m, '.lang-btn');
  assert(fadeL.length >= 2 && fadeL.every(d => d === 400), `切語言：整個畫面交叉淡化 0.4s（${JSON.stringify(fadeL)}）`);
  await m.waitForTimeout(60);
  const pl1 = (await rect(m, '.play-btn')).left;
  await m.waitForTimeout(600);
  const pl2 = (await rect(m, '.play-btn')).left;
  assert(Math.abs(pl1 - pl0) < 1 && Math.abs(pl2 - pl0) < 1, `切語言時 play 不動（前 ${pl0} 切後 ${pl1} 過場後 ${pl2}）`);
  assert((await m.textContent('.lang-btn')) === '中文' && (await m.textContent('.menu-main a[href="about.html"]')) === 'About' && (await m.textContent('.menu-sub a[href="qa.html"]')) === 'QA', '切 en');
  assert((await m.textContent('.menu-btn .bar-label')) === 'menu', '切 en：底列名字');
  assert((await m.textContent('main h1')) === 'Bachelor Program in Advanced Integrated Design, Shih Chien University' && (await m.textContent('.bar-news-copy > span')) === await m.getAttribute('.bar-news-copy > span', 'data-en'), '切 en：內容標題、動態');
  assert(await m.evaluate(() => document.documentElement.lang) === 'en', 'html lang en');
  await swap(m, '.lang-btn');
  assert((await m.textContent('.menu-main a[href="about.html"]')) === '關於' && await m.evaluate(() => document.documentElement.lang) === 'zh-Hant', '切回 zh');
  assert((await m.textContent('main h1')) === '實踐大學AI設計職人學位學程' && (await m.textContent('.bar-news-copy > span')) === await m.getAttribute('.bar-news-copy > span', 'data-zh'), '切回 zh：內容標題、動態');
  assert((await m.textContent('.play-btn .bar-label')) === '簡介', '切回 zh：底列名字');
  // 關選單：play 一樣不動（逐幀；手機選單全螢幕，user 2026-11-22）
  const playBack = await m.evaluate(() => new Promise(res => {
    const play = document.querySelector('.play-btn'), out = [];
    /** @type {HTMLElement} */ (document.querySelector('.menu-btn')).click();
    const t0 = performance.now();
    const tick = () => { out.push(play.getBoundingClientRect().left); if (performance.now() - t0 < 700) requestAnimationFrame(tick); else res(out); };
    requestAnimationFrame(tick);
  }));
  const backEnd = playBack[playBack.length - 1];
  assert(playBack.every(x => Math.abs(x - play0) < 0.5), `手機選單關：play 不動（終 ${backEnd}）`);
  await m.waitForFunction(() => !document.documentElement.classList.contains('menu-open'));
  assert(await css(m, '.bar-news-track', 'opacity') === '1' && Math.abs(await tx(m, '#page-content')) < 1, '選單關：標題回來、內容回原位');

  // 每一頁都從選單走一遍
  for (const slug of PAGES) {
    await openMenu(m);
    await m.click(`.site-menu a[href="${slug}.html"]`);
    await m.waitForFunction(s => document.body.dataset.page === s && !document.documentElement.classList.contains('menu-open'), slug);
    assert(new URL(m.url()).pathname === `/pages/${slug}.html`, 'url ' + slug);
    assert((await m.textContent('main h1')).trim().length > 0, 'h1 ' + slug);
    assert(await m.$eval(`.site-menu a[href="${slug}.html"]`, a => a.classList.contains('active') && a.getAttribute('aria-current') === 'page'), 'active ' + slug);
    assert(await m.$eval('#sr-route-announcer', el => el.textContent) === await m.title(), 'announced ' + slug);
    assert(await m.evaluate(() => document.activeElement.id) === 'page-content', 'focus main ' + slug);
  }
  // 選中的選項＝字尾後面一根直條常駐（user 2026-11-22：選單的 hover 比照清單；同清單收完的直條：隔一根直條寬、寬 0.4em、高＝字高）、不畫底線；沒選中的沒有
  await m.waitForTimeout(450);   // 現／隱＝fade＋模糊（user 2026-11-21）：換頁後等它淡完
  assert(await m.$eval('.site-menu .nav-link.active', (a) => { const s = getComputedStyle(a, '::after'), fs = parseFloat(getComputedStyle(a).fontSize);
    return s.opacity === '1' && s.borderRadius === '0px' && Math.abs(parseFloat(s.width) - fs * 0.4) < 0.2 && Math.abs(parseFloat(s.height) - fs) < 0.2 && Math.abs(parseFloat(s.marginLeft) - fs * (0.4 - 0.205)) < 0.2 && getComputedStyle(a).textDecorationLine === 'none'; }), '選中選項：字尾後面一根直條（中文扣掉最後一個字的字距，同 hover 的直條）、沒底線');
  assert(await m.$$eval('.site-menu .nav-link:not(.active)', as => as.length === 13 && as.every(a => getComputedStyle(a, '::after').opacity === '0')), '沒選中的選項沒有直條');
  // 選單的選項 hover＝跟清單一樣蓋黑收直條（user 2026-11-22）：收完一根直條在字尾、不出圓點；離開切出去（user 2026-11-24）；hover 一下就走＝動畫照樣做完、直條再淡掉
  {
    await openMenu(m);
    await m.waitForTimeout(700);
    // tr＝最後一個中文字右邊燒在字體裡的字距（0.205em）：直條精確到字本身的右緣（user 2026-11-23）
    const st = () => m.$eval('.site-menu .nav-link:not(.active)', a => { const o = a.getBoundingClientRect(), fs = parseFloat(getComputedStyle(a).fontSize);
      return { fs, w: o.width, tr: /[⺀-鿿豈-﫿︰-﹏＀-￯]$/.test((a.textContent || '').trim()) ? 0.205 * fs : 0, dot: getComputedStyle(a, '::after').opacity, covers: [...a.querySelectorAll('.item-cover')].map(c => { const r = c.getBoundingClientRect(); return [r.left - o.left, r.width, r.height]; }) }; });
    await m.hover('.site-menu .nav-link:not(.active) >> nth=0');
    await m.waitForTimeout(1700);   // 蓋、收各 DUR.fast，收完再等 0.2 秒、直條切出來（user 2026-11-24）
    const s0 = await st(), sw = s0.fs * 0.4;
    assert(s0.covers.length === 1 && s0.tr > 0 && Math.abs(s0.covers[0][0] - (s0.w - s0.tr + sw)) < 1 && Math.abs(s0.covers[0][1] - sw) < 0.2 && Math.abs(s0.covers[0][2] - s0.fs) < 0.2 && s0.dot === '0',
      `選單選項 hover：收成字尾的一根直條、不出圓點（${JSON.stringify(s0)}）`);
    await m.mouse.move(380, 400);
    await m.waitForTimeout(600);   // 離開＝直條切出去（user 2026-11-24）
    assert((await st()).covers.length === 0, '選單選項：游標離開＝直條切出去、切完拿掉');
    await m.hover('.site-menu .nav-link:not(.active) >> nth=0');
    await m.waitForTimeout(60);
    await m.mouse.move(380, 400);
    const left = (await st()).covers.length;
    await m.waitForFunction(() => { const c = document.querySelector('.site-menu .nav-link:not(.active) .item-cover'); return !c || c.dataset.phase === 'out'; }, null, { timeout: 3000 }).catch(() => {});
    const endsAt = await m.$eval('.site-menu .nav-link:not(.active)', a => { const c = a.querySelector('.item-cover'), k = c?.getAnimations()[0]?.effect.getKeyframes(), f = k?.[k.length - 1], n = (String(f?.clipPath).match(/-?[\d.]+/g) || []).map(Number);
      return !c || !f ? null : f.width ? parseFloat(String(f.width)) : n.length === 4 ? Math.round((c.getBoundingClientRect().width - n[1] - n[3]) * 10) / 10 : null; });   // 收的終點露出多寬（帶＝clip-path、直條＝寬；0＝收到沒有）
    await m.waitForTimeout(900);
    assert(left >= 1 && endsAt === 0 && (await st()).covers.length === 0, `選單選項：hover 一下就走＝帶照樣收完、不出直條（剛走 ${left} 條、收的終點 ${endsAt}、做完 ${(await st()).covers.length} 條）`);
    await m.click('.menu-btn');
    await m.waitForFunction(() => !document.documentElement.classList.contains('menu-open'));
  }
  assert((await css(m, '.site-grid', 'gridTemplateColumns')).split(' ').length === 4, 'mobile grid 4 欄');
  assert((await m.textContent('main h1')).trim() === '網站地圖', 'sitemap h1 zh');
  await m.waitForTimeout(700);   // 選單關閉後 logo 的右推 transition 走完再量位置
  lr = await rect(m, '.site-logo');
  assert(Math.abs(lr.top) < 1, `內頁 logo 頂到頂（top ${lr.top}）`);
  assert(Math.abs(lr.left + lr.width / 2 - 195) < 2, '內頁 logo 置中');
  assert(await css(m, '.logo-text', 'opacity') === '0' && await css(m, '.logo-bars i', 'opacity') === '1' && Math.abs(lr.height - lr.width * STROKE_VB_H / LOGO_M_VB_W) < 0.5, `內頁 logo＝沒字的長條版（手機那張的比例，${lr.width}×${lr.height}，user 2026-11-22）`);

  // 上一頁
  await m.goBack();
  await m.waitForFunction(() => document.body.dataset.page === 'regulations');
  assert((await m.textContent('main h1')).trim() === '規章與政策', 'back → regulations');

  // 內容標題跟語言走：當頁切換＋切換後換頁
  await openMenu(m);
  await swap(m, '.lang-btn');
  assert((await m.textContent('main h1')).trim() === 'Regulations & Policies', '切 en：當頁標題');
  // 內頁選單開（手機全螢幕，user 2026-11-22）：內容不右推——導覽矩形照舊對齊 menu 鈕、內文在它右邊一個 rail（半欄＝38.75）
  await m.waitForTimeout(700);
  {
    const n = await rect(m, '.section-nav'), h = await rect(m, 'main h1');
    assert(Math.abs(n.left - 16) < 2 && Math.abs(n.left - (await rect(m, '.menu-btn')).left) < 2 && Math.abs(h.left - n.left - 38.75) < 2,
      `手機內頁選單開：內容不右推、導覽矩形＝menu 鈕、內文再讓一個 rail（nav ${n.left} h1 ${h.left}）`);
    // 選單開著（user 2026-11-21）：段落導覽淡出收起來、右邊內容不能 hover／點
    assert(await css(m, '.section-nav', 'visibility') === 'hidden' && await css(m, '.section-nav', 'opacity') === '0' && await css(m, '#page-content', 'pointerEvents') === 'none', '選單開：段落導覽收起來、內容不吃指標');
    // logo 在頂：選項的捲動框從 logo 底開始、不重疊，logo 照常清楚（user 2026-11-24）
    { const lg = await rect(m, '.site-logo'), nav = await rect(m, '.site-menu-nav');
      assert(await css(m, '.site-logo', 'filter') === 'none' && nav.top >= lg.top + lg.height - 0.5, `內頁選單開：logo 照常清楚、選項在 logo 下面（logo 底 ${lg.top + lg.height}、選項框頂 ${nav.top}）`); }
  }
  await m.click('.site-menu a[href="about.html"]');
  await m.waitForFunction(() => document.body.dataset.page === 'about');
  assert((await m.textContent('main h1')).trim() === 'About' && (await m.textContent('main h2')).trim() === 'Competencies', 'en 換頁：新頁標題也是英文');
  assert(await css(m, '.section-nav', 'display') === 'flex' && await css(m, '.page-figure', 'display') === 'none', '手機 about：段落導覽在、右圖不在內文裡（改右緣縮圖鈕）');
  await openMenu(m);
  await swap(m, '.lang-btn');
  assert((await m.textContent('main h1')).trim() === '關於' && (await m.textContent('main h2')).trim() === '培育能力', '切回 zh：標題');
  // 手機選單全螢幕（user 2026-11-22）：輪播那一列被選單蓋住，點下去落在選單的空白處＝只收選單、輪播沒被點到，段落導覽淡回來。
  // 輪播會自動播（只往下一張走）→ 不比整排位置，只看被點的那張（-1）沒跑到中間
  {
    await m.waitForTimeout(700);   // 右推滑完再量
    const sl = await rect(m, '.slide[data-pos="-1"]'), prevIdx = await m.$$eval('.slide', x => x.findIndex(e => e.dataset.pos === '-1'));
    const x = 380;   // 選單右內距：不會落在選項上
    assert(await m.evaluate(([px, py]) => { const el = document.elementFromPoint(px, py); return !!el?.closest('.site-menu') && !el.closest('a, button'); }, [x, sl.cy]), '選單開著：輪播那一列的 hit target 是選單的空白處');
    await m.mouse.click(x, sl.cy);
    await m.waitForFunction(() => !document.documentElement.classList.contains('menu-open'));
    await m.waitForTimeout(400);
    assert(await m.$$eval('.slide', (x, i) => x[i].dataset.pos !== '0', prevIdx) && await m.evaluate(() => document.body.dataset.page) === 'about'
      && await css(m, '.section-nav', 'visibility') === 'visible' && await css(m, '#page-content', 'pointerEvents') === 'auto', '選單開著點內容：只收選單、內容沒反應、段落導覽回來');
  }

  // 底列中間的動態只在首頁（user 2026-11-10）：內頁藏起來、點不到
  assert(await css(m, '.bar-news', 'visibility') === 'hidden' && await css(m, '.bar-news', 'opacity') === '0' && await css(m, '.bar-news', 'filter') === 'blur(4px)', '內頁：底列沒有動態（藏著的那一態＝透明＋糊）');

  // 手機內頁版型（user 2026-11-13 手機稿）：左緣段落導覽（矩形對齊 menu 鈕、從 h1 那條線往下排）、內文左右各讓一個 rail（半欄＝38.75）、
  // 右圖的鈕在底列右下角、長得跟 menu 鈕一樣（user 2026-11-23；原本在右緣中線上）；點了 dialog 放大蓋滿畫面，再點任何地方／Esc 淡出後關；選單開著縮圖退場
  await m.waitForFunction(() => getComputedStyle(document.querySelector('.figure-btn')).opacity === '1'
    && new DOMMatrix(getComputedStyle(document.getElementById('page-content')).transform).m41 === 0);
  {
    const th = await rect(m, '.figure-btn .bar-rect'), mr = await rect(m, '.menu-btn .bar-rect');
    const n = await rect(m, '.section-nav'), b = await rect(m, '.page-body');
    const d0 = await m.$eval('.section-nav-dot', x => x.getBoundingClientRect().top + parseFloat(getComputedStyle(x).paddingTop));   // 第一格矩形上緣
    // 最上面那一格＝頁標題（user 2026-11-18／21）：跟段落同高的矩形（寬 0.45em、高 1.6em；em＝導覽的字級＝text-md）、
    // 中心對在 h1 第一行的中線；段落的第一格在它下面隔 0.5em
    const nfs = await m.$eval('.section-nav-top', x => parseFloat(getComputedStyle(x).fontSize));
    const tp = await m.$eval('.section-nav-top', x => { const s = getComputedStyle(x, '::before'), h = parseFloat(s.height); return { cy: x.getBoundingClientRect().top + parseFloat(getComputedStyle(x).paddingTop) + h / 2, w: parseFloat(s.width), h, round: s.borderRadius }; });
    const h1c = await m.$eval('main h1', h => h.getBoundingClientRect().top + parseFloat(getComputedStyle(h).lineHeight) / 2);
    const r0 = await m.$eval('.section-nav-dot', x => parseFloat(getComputedStyle(x, '::before').height));
    assert(await m.$$eval('.section-nav-dot', x => x.length) === 4 && Math.abs(n.left - mr.left) < 1 && Math.abs(tp.cy - h1c) < 1 && Math.abs(tp.w - 0.45 * nfs) < 0.1 && Math.abs(tp.h - 1.6 * nfs) < 0.1 && tp.round === '0px'
      && Math.abs(r0 - 1.6 * nfs) < 0.1 && Math.abs(d0 - (tp.cy + tp.h / 2 + 0.5 * nfs)) < 1,
      `手機段落導覽：頁標題那一格＋4 格（2026-11-23 加了沿革）、矩形左緣對齊 menu 鈕、頁標題那格跟段落同高且中心＝h1 第一行中線、段落的長矩形在下面（left ${n.left} vs ${mr.left}、${JSON.stringify(tp)} vs ${h1c}、段落第一格 top ${d0}）`);
    assert(Math.abs(b.left - 54.75) < 1 && Math.abs(b.left + b.width - 335.25) < 1, `手機內文左右各讓半欄（第 1 欄正中 → 第 4 欄正中）（${b.left}～${b.left + b.width}）`);
    assert(Math.abs(th.left + th.width - 374) < 1 && Math.abs(th.cy - mr.cy) < 1 && Math.abs(th.width - mr.width) < 0.5 && Math.abs(th.height - mr.height) < 0.5,
      `右圖的鈕：底列右下角、右緣對齊內距、跟 menu 鈕同高同大小（right ${th.left + th.width}、cy ${th.cy} vs ${mr.cy}、${th.width}×${th.height} vs ${mr.width}×${mr.height}）`);
    assert(await m.$eval('#figure-dialog', d => d.open) === false && await css(m, '#figure-dialog', 'display') === 'none', '放大 dialog 預設關');
    // 點導覽最後一段 → 那段頂捲到 h1 原本的位置（手機也撐高最後一段）
    const y0 = (await rect(m, 'main h1')).top;
    await m.click('.section-nav-dot[data-i="3"]');
    await m.evaluate(() => new Promise(r => { let last = -1; const t = () => { if (scrollY === last) r(scrollY); else { last = scrollY; setTimeout(t, 150); } }; setTimeout(t, 150); }));
    const y2 = await m.$$eval('.page-section', ss => ss[3].getBoundingClientRect().top);
    assert(Math.abs(y2 - y0) < 1.5 && await m.$eval('.section-nav-dot[data-i="3"]', x => x.getAttribute('aria-current') === 'true'), `手機段落導覽：點最後一段 → 段落頂對齊 h1 位置（${y2} vs ${y0}）`);
    await m.evaluate(() => scrollTo({ top: 300, behavior: 'instant' }));
    await m.click('.figure-btn');
    await m.waitForFunction(() => getComputedStyle(document.querySelector('#figure-dialog')).opacity === '1' && getComputedStyle(document.querySelector('.site-bar')).opacity === '0');
    const dr = await rect(m, '#figure-dialog'), ir = await rect(m, '.figure-dialog-body > *'), ob = await rect(m, '.figure-obj-close .bar-rect');
    assert(await css(m, '#figure-dialog', 'backgroundColor') === 'rgba(0, 0, 0, 0)' && await css(m, '#page-content', 'filter') === 'blur(4px)' && await css(m, '#page-content', 'opacity') === '0.4' && await css(m, '.site-logo', 'filter') === 'none' && await m.$eval('.top-blur', t => getComputedStyle(t, '::after').opacity) === '0',
      '放大 dialog：背後的內容模糊＋疊白（同選單開著）、底列收起來（控制列在底列那條線的正中）、logo 照常清楚');
    assert(await m.$eval('#figure-dialog', d => d.open) && dr.top === 0 && dr.left === 0 && dr.width === 390 && dr.height === 844, `點縮圖：dialog 蓋滿畫面（${JSON.stringify(dr)}）`);
    // 手機的右圖 object（user 2026-11-24：「這個也要在畫面中間」）：內容寬、方形、上下置中＝畫面正中
    assert(Math.abs(ir.width - 358) < 1 && Math.abs(ir.height - 358) < 1 && Math.abs(ir.left - 16) < 1 && Math.abs(ir.top + ir.height / 2 - 422) < 1 && await m.$eval('.figure-dialog-body', b => b.children.length === 1 && b.firstElementChild.classList.contains('object-canvas')),
      `點右緣的鈕：object 的畫布搬進 dialog、內容寬、方形、在畫面正中（${ir.width}×${ir.height} left ${ir.left} top ${ir.top}）`);
    // 沒有 ‹ X ›（整組控制列不出）；關閉＝打開它的那顆骨牌、留在右下角原位、中央圓點常駐＝同 menu 鈕開著
    // （user 2026-11-24：「下面沒有 X，是打開的那個 btn，保持在右下角，跟 menu 一樣的邏輯」；chrome.css .figure-obj-close）
    assert(await m.$$eval('.figure-ctrl', cs => cs.every(c => getComputedStyle(c).display === 'none'))
      && Math.abs(ob.left - th.left) < 0.5 && Math.abs(ob.top - th.top) < 0.5 && Math.abs(ob.width - th.width) < 0.5 && Math.abs(ob.height - th.height) < 0.5
      && await m.$eval('.figure-obj-close .bar-rect', r => getComputedStyle(r, '::after').opacity) === '1',
      `手機 object：沒有 ‹ X ›；關閉＝右下角那顆骨牌、跟底列的鈕同一個位置、圓點亮著（${JSON.stringify(ob)} vs ${JSON.stringify(th)}）`);
  }
  await m.mouse.click(195, 400);   // 點在 object 上：不關（那是露出名字／拖著轉，object.js）
  assert(await m.$eval('#figure-dialog', d => d.open && !d.classList.contains('is-closing')), '點 object 本身：dialog 不關');
  await m.mouse.click(195, 700);   // 點旁邊（object 在畫面正中 243～601）
  assert(await m.$eval('#figure-dialog', d => d.open && d.classList.contains('is-closing')), '點 object 旁邊：先淡出');
  await m.waitForFunction(() => !(/** @type {HTMLDialogElement} */ (document.querySelector('#figure-dialog')).open));
  await m.click('.figure-btn');   // 右下角那顆骨牌再點一次＝關（同 menu 鈕）
  await m.waitForFunction(() => getComputedStyle(/** @type {Element} */ (document.querySelector('#figure-dialog'))).opacity === '1');
  await m.click('.figure-obj-close');
  assert(await m.$eval('#figure-dialog', d => d.classList.contains('is-closing')), '手機 object：點右下角那顆骨牌＝關');
  await m.waitForFunction(() => !(/** @type {HTMLDialogElement} */ (document.querySelector('#figure-dialog')).open));
  await m.click('.figure-btn');
  await m.keyboard.press('Escape');
  await m.waitForFunction(() => !(/** @type {HTMLDialogElement} */ (document.querySelector('#figure-dialog')).open));
  assert(await m.evaluate(() => scrollY) === 300, `Esc 關放大圖：頁面沒被捲回頂（scrollY ${await m.evaluate(() => scrollY)}）`);
  await m.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await openMenu(m);
  await m.waitForFunction(() => getComputedStyle(document.querySelector('.figure-btn')).visibility === 'hidden');
  await m.keyboard.press('Escape');
  await m.waitForFunction(() => !document.documentElement.classList.contains('menu-open') && getComputedStyle(document.querySelector('.figure-btn')).opacity === '1');

  // 聯絡頁（原本的 footer 覆蓋層，user 2026-11-21 搬成選單最後一頁）：內容走後台——值換上、空欄位整列收、javascript: 網址擋掉、英文空退中文
  assert(await m.$('.footer-btn') === null, '底列沒有 footer 鈕');
  await openMenu(m);
  await m.click('.site-menu a[href="contact.html"]');
  await m.waitForFunction(() => document.querySelector('.footer-contact a')?.textContent === 'cms@example.com');
  assert((await m.textContent('main h1')).trim() === '聯絡' && (await m.textContent('main')).includes('電子郵件'), '聯絡頁：標題＋內容');
  // 聯絡資訊＝清單，同師資詳細頁（user 2026-11-24：「做成跟老師內頁一樣，然後後臺可以 custom」「每個都有個 url，有寫就可以 jump 到那個 url」）
  const con = await m.$$eval('.footer-contact > .subsection', bs => bs.map(b => { const h = /** @type {HTMLElement} */ (b.querySelector('h3'));
    return `${h.textContent}/${h.dataset.en}:` + [...b.querySelectorAll('ul > li')].map(li => { const a = li.querySelector('a');
      return a ? `a[${a.getAttribute('href')}|${a.getAttribute('target') || '-'}]${a.textContent}/${a.dataset.en}` : `${li.textContent}/${/** @type {HTMLElement} */ (li).dataset.en}`; }).join(','); }).join(' ; '));
  assert(con === '電子郵件/E-Mail:a[mailto:cms@example.com|-]cms@example.com/cms@example.com ; 電話/電話:02 1111 1111/02 1111 1111,壞連結/Bad ; 地址/Address:a[https://example.com/map|_blank]後台地址（示意）/後台地址（示意）'
    && await m.$('.footer-contact [data-label]') === null,
    `聯絡頁後台：聯絡資訊＝清單照 sort、標題照後台（不是介面文字）、連結有填＝那一筆可以點（信箱當 mailto、https 另開、javascript: 擋掉）、沒文字的筆與空的清單不出（${con}）`);
  const conCss = await m.evaluate(() => { const q = (/** @type {string} */ s) => getComputedStyle(/** @type {Element} */ (document.querySelector(s))), rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const bs = [...document.querySelectorAll('.footer-contact > .subsection')].map(b => b.getBoundingClientRect());
    return { top: q('.footer-contact').marginTop, gap: bs[1].top - bs[0].bottom, xl: parseFloat(q('.subsections').rowGap), h3w: q('.footer-contact h3').fontWeight, same: q('.footer-contact h3').fontSize === q('.footer-contact li').fontSize,
      s: q('.footer-contact li').fontSize === getComputedStyle(/** @type {Element} */ (document.querySelector('.page-body'))).fontSize, mb: q('.footer-contact h3').marginBottom, ul: q('.footer-contact h3 + ul').rowGap, sm: `${rem}px` }; });
  assert(conCss.top === '0px' && Math.abs(conCss.gap - conCss.xl) < 0.5 && conCss.xl > 0 && conCss.h3w === '500' && conCss.same && conCss.s && conCss.mb === conCss.sm && conCss.ul === conCss.sm,
    `聯絡頁：聯絡資訊的樣子同師資詳細頁的清單——清單之間 xl、標題 Medium、字級＝內文（s）、標題到第一筆與筆之間 sm（${JSON.stringify(conCss)}）`);
  assert(await css(m, '.footer-badge', 'display') === 'none', '聯絡頁後台：空欄位收掉');
  assert(await m.$$eval('.footer-social a', a => a.length === 2 && a.map(x => [x.getAttribute('aria-label'), x.getAttribute('href'), x.target].join('|')).join(',') === 'Instagram|https://example.com/ig|_blank,YouTube|https://example.com/yt|_blank')
    && (await rect(m, '.footer-social .icon-yt')).left > (await rect(m, '.footer-social .icon-ig')).left
    && Math.abs((await rect(m, '.footer-social .icon-ig')).height - (await rect(m, '.menu-btn .bar-rect')).height) < 0.5
    && Math.abs((await rect(m, '.footer-social .icon-yt')).height - (await rect(m, '.menu-btn .bar-rect')).height) < 0.5,
    '聯絡頁後台：社群＝IG、YouTube 兩個 icon、YT 在 IG 右邊（高同 menu 鈕那顆骨牌），各自連到後台的網址（user 2026-11-24）');
  assert(await m.$('.footer-copyright') === null, '聯絡頁：沒有版權那一行（user 2026-11-21）');
  // 姊妹系所（user 2026-11-21）：全名、一列一筆的連結清單；英文空退中文、舊資料（只有 label）照它顯示
  assert(JSON.stringify(await m.$$eval('.footer-links.link-list a.nav-link', a => a.map(x => [x.textContent, x.dataset.en, x.getAttribute('target')])))
    === '[["後台系所（示意）","CMS Department","_blank"],["只有中文（示意）","只有中文（示意）","_blank"],["SCCD","SCCD","_blank"]]', '聯絡頁後台：姊妹系所＝全名清單（中英、英文空退中文、舊 label 相容）');

  assert(await css(m, '.play-btn', 'visibility') === 'hidden', 'intro（play）內頁藏著');

  // logo 回首頁 → 動態原地展開：logo 上移、清單出來、可捲、＋變－；收合捲回頂
  await m.click('.site-logo');
  await m.waitForFunction(() => document.body.dataset.page === 'index');
  assert(new URL(m.url()).pathname === '/', 'logo → root');
  await m.waitForFunction(() => getComputedStyle(document.querySelector('.bar-news')).opacity === '1');
  assert(await css(m, '.bar-news', 'visibility') === 'visible', '回首頁：動態淡入回來');

  // intro（只在首頁）：開在放大 dialog（user 2026-11-23；原本自己一個滿版黑底的 dialog）——沒 data-video 不開；YouTube 連結＝youtube-nocookie 的 iframe
  // （點了就播、iPhone 不跳全螢幕；收掉它自己的控制列、開 postMessage）、直連的檔＝原生 video（不出原生的控制列）；頂對齊 title 那條線、左右置中；
  // 自己的控制列（關閉＝menu 鈕那顆、播放／暫停、音量；只有一支＝沒有上下一個）；關燈（整頁深色）、logo 移到頂；
  // 一開焦點在關閉鈕（不在 YouTube 的 iframe 裡，Safari 的 Esc 才不會被吃掉）；Esc／關閉＝影片整個拿掉、開燈、logo 回正中。YouTube 攔下來回空頁＝watch() 全域那條（不連網）
  await m.waitForFunction(() => getComputedStyle(document.querySelector('.play-btn')).visibility === 'visible');
  await m.click('.play-btn');
  assert(await m.$eval('#figure-dialog', d => d.open) === false, '無影片不開 dialog');
  await m.evaluate(() => { document.querySelector('.play-btn').setAttribute('data-video', 'https://youtu.be/dQw4w9WgXcQ'); });
  await m.click('.play-btn');
  // 先讓背景跟 logo 動（關燈＝顏色過場、logo 上移），影片跟控制列藏著；動完才淡出來（user 2026-11-23）
  const early = await m.evaluate(() => { const d = /** @type {HTMLDialogElement} */ (document.getElementById('figure-dialog'));
    return [d.open, d.classList.contains('is-waiting'), document.documentElement.dataset.theme || 'light', document.documentElement.classList.contains('is-lights'), getComputedStyle(/** @type {Element} */ (d.querySelector('.figure-stage'))).opacity].join(); });
  await m.waitForFunction(() => document.documentElement.dataset.theme === 'dark' && !document.getElementById('figure-dialog')?.classList.contains('is-waiting')
    && getComputedStyle(/** @type {Element} */ (document.querySelector('.figure-stage'))).opacity === '1' && /** @type {Element} */ (document.querySelector('.site-logo')).getBoundingClientRect().top < 1, null, { timeout: 5000 });
  assert(early === 'true,true,dark,true,0', `intro：一點下去先關燈（顏色過場）、logo 上移，影片跟控制列先藏著、動完才出來（${early}）`);
  const yt = await m.evaluate(() => {
    const d = /** @type {HTMLDialogElement} */ (document.getElementById('figure-dialog')), f = d.querySelector('.figure-dialog-body > iframe'), r = f?.getBoundingClientRect();
    const on = (/** @type {string} */ s) => getComputedStyle(/** @type {Element} */ (d.querySelector(s))).display !== 'none';
    return f && r ? { src: f.getAttribute('src'), allow: f.getAttribute('allow'), ratio: r.width / r.height, cx: r.left + r.width / 2, mid: r.top + r.height / 2 - innerHeight / 2, w: r.width, label: d.getAttribute('aria-label'),
      focus: !(document.activeElement instanceof HTMLIFrameElement), btns: ['.media-play', '.media-mute', '.media-vol', '.figure-prev', '.figure-next'].filter(on).join() } : null;
  });
  assert(yt?.src === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&playsinline=1&rel=0&controls=0&enablejsapi=1' && /autoplay/.test(yt.allow || '') && yt.focus && yt.label === '影片'
    && Math.abs(yt.ratio - 16 / 9) < 0.01 && Math.abs(yt.cx - 195) < 1 && Math.abs(yt.mid) < 1 && Math.abs(yt.w - 358) < 1 && yt.btns === '.media-play,.media-mute,.media-vol',
    `intro：YouTube 連結＝放大 dialog 裡的 iframe（收掉它的控制列）、16:9、上下置中＝畫面正中（user 2026-11-24）；自己的控制列、沒有上下一個；關燈、logo 到頂；焦點不在 iframe 裡（${JSON.stringify(yt)}）`);
  // 控制列（user 2026-11-24）：關閉＝X 在正中那排（只有一支影片＝沒有上下一個＝X 就在畫面正中），跟 menu 骨牌一樣高、同一條線；
  // 音量、全螢幕在右邊那組、右緣對齊影片的右緣（user：「vol 跟全螢幕應該對齊影片的右邊」）；X 跟其他鈕一樣 hover 變淡
  await m.hover('.figure-close'); await m.waitForTimeout(600);
  { const x = await m.evaluate(() => { const q = (/** @type {string} */ s) => /** @type {Element} */ (document.querySelector(s)).getBoundingClientRect(), i = q('.figure-close .icon'), mn = q('.menu-btn .bar-rect'), md = q('.figure-media'), v = q('.figure-dialog-body > *');
      return { cx: i.left + i.width / 2, h: Math.abs(i.height - mn.height) < 0.5, line: Math.abs(i.top + i.height / 2 - (mn.top + mn.height / 2)) < 1, right: Math.abs(md.right - v.right) < 1,
        mline: Math.abs(md.top + md.height / 2 - (mn.top + mn.height / 2)) < 1, order: [...document.querySelectorAll('.figure-media > button, .figure-media > div')].map(b => b.className.split(' ').pop()).join(),
        o: getComputedStyle(/** @type {Element} */ (document.querySelector('.figure-close'))).opacity }; });
    assert(Math.abs(x.cx - 195) < 1 && x.h && x.line && x.right && x.mline && x.order === 'media-vol-wrap,media-fs' && x.o === '0.6',
      `intro（影片）：X 在畫面正中、跟骨牌同高同一條線；音量、全螢幕在右邊、右緣對齊影片；X hover 變淡（同其他鈕）（${JSON.stringify(x)}）`); }
  // YouTube 不會馬上回報 → 按了先照按的換圖示（之後照它的 onStateChange）
  await m.click('.media-play');
  assert(await m.$eval('#figure-dialog', d => d.classList.contains('is-paused') && d.querySelector('.media-play')?.getAttribute('aria-pressed') === 'false'), 'intro：按暫停＝圖示換成播放');
  // 空白鍵＝播放／暫停（user 2026-11-23）：焦點不在控制列的鈕上（包括一開就聚焦的關閉鈕）＝播放／暫停、不關；焦點在靜音鈕＝按靜音
  const sp = async (/** @type {string | null} */ focus) => {
    await m.evaluate((s) => { if (s) /** @type {HTMLElement} */ (document.querySelector(s)).focus(); else if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); }, focus);
    await m.keyboard.press(' '); await m.waitForTimeout(100);
    return m.$eval('#figure-dialog', d => [/** @type {HTMLDialogElement} */ (d).open && !d.classList.contains('is-closing'), d.classList.contains('is-paused'), d.classList.contains('is-muted')].join());
  };
  const k1 = await sp(null), k2 = await sp('.figure-close'), k3 = await sp('.media-mute');
  assert(k1 === 'true,false,false' && k2 === 'true,true,false' && k3 === 'true,true,true', `intro：空白鍵＝播放／暫停（關閉鈕上也是、不關）；焦點在靜音鈕＝按靜音（${k1}｜${k2}｜${k3}）`);
  // dialog 的 close 事件晚一個 task 才到（影片在那時候拿掉）→ 等，不是馬上看
  const closedEmpty = () => m.waitForFunction(() => !(/** @type {HTMLDialogElement} */ (document.getElementById('figure-dialog')).open) && !document.documentElement.dataset.theme
    && !document.querySelector('#figure-dialog .figure-dialog-body > *'), null, { timeout: 5000 }).then(() => true, () => false);
  await m.keyboard.press('Escape');
  assert(await closedEmpty(), 'intro：Esc 關＝影片整個拿掉（停播）、開燈');
  // 不是 YouTube 的網域＝直連的檔（路徑裡有 /live/ 也不會被認成 YouTube 的 id）：原生 video、不出它自己的控制列；音量鈕＝靜音
  await m.evaluate(() => { document.querySelector('.play-btn').setAttribute('data-video', 'live/opening-ceremony/intro-test.mp4'); });
  await m.click('.play-btn');
  await m.waitForFunction(() => /** @type {HTMLDialogElement} */ (document.getElementById('figure-dialog')).open);
  assert(await m.$('.figure-dialog-body > video:not([controls])') !== null && await m.$('.figure-dialog-body > iframe') === null, 'intro：直連的檔＝原生 video、不出它自己的控制列（/live/… 不會被當成 YouTube）');
  // 音量拉桿平常收著（寬 0），游標移到音量那一組才長出來（user 2026-11-23：「hover btn 時才會出現」）；
  // 長出來＝20 格（user 2026-11-24：直條照 ai 的 volume、長度照一般播放器＝一根 5%）：一格 10.223 個 ai 單位，icon 的框高 70＝控制列 icon 的高
  const vw = () => m.$eval('.media-vol', r => r.getBoundingClientRect().width);
  const w0 = await vw();
  const want = await m.$eval('.media-fs .icon', i => i.getBoundingClientRect().height * 20 * 10.223 / 70);
  await m.click('.media-mute');
  const grown = await m.waitForFunction(w => Math.abs(/** @type {Element} */ (document.querySelector('.media-vol')).getBoundingClientRect().width - w) < 0.5, want, { timeout: 3000 }).then(() => true, () => false);
  assert(w0 === 0 && grown, `intro：音量拉桿平常收著、游標移到音量鈕才長出來、寬＝20 格（${w0} → ${await vw()}／${want}）`);
  // 長出來之後：喇叭 → 第一根直條、最後一根 → 全螢幕，看起來都是一個 bar gap（user 2026-11-24：「lightbox 打開的 icon 之間的 gap 都統一吧，就是 bar gap」；原本喇叭到拉桿減半）。
  // 等寬度、margin 的補間真的跑完再量（上面只等到寬差 < 0.5，最後那零點幾 px 還在走＝量到 -0.1，2026-11-24 scaid-56 那輪踩過）
  await m.waitForFunction(() => !/** @type {Element} */ (document.querySelector('.media-vol-bars')).getAnimations().length, null, { timeout: 2000 }).catch(() => {});
  const vgap = await m.evaluate(() => { const q = (/** @type {string} */ s) => /** @type {Element} */ (document.querySelector(s)), g = parseFloat(getComputedStyle(q('.figure-media')).columnGap);
    const ic = /** @type {Element} */ ([...q('.media-mute').querySelectorAll('.icon')].find(i => getComputedStyle(i).visibility !== 'hidden')), fs = q('.media-fs .icon').getBoundingClientRect(), b = q('.media-vol-bars').getBoundingClientRect();
    return [b.left + 7.223 * fs.height / 70 - ic.getBoundingClientRect().right - g, fs.left - b.right - g]; });
  assert(vgap.every(x => Math.abs(x) < 0.25), `intro：拉桿長出來＝喇叭到第一根、最後一根到全螢幕都是 bar gap（差 ${vgap.map(x => x.toFixed(2)).join()}）`);
  assert(await m.$eval('.figure-dialog-body > video', v => /** @type {HTMLVideoElement} */ (v).muted) && await m.$eval('#figure-dialog', d => d.classList.contains('is-muted')), 'intro：音量鈕＝靜音、圖示跟著換');
  // 音量拉桿（user 2026-11-23：「音量要可以調整大小」；11-24 起＝20 根直條、亮幾根＝音量）：拉到 3 根＝音量 3/20、取消靜音、鈕是 half；
  // 拉到 0＝靜音（silence）；在 0 按音量鈕＝回到全音量（20 根、loud）。拉桿點了不關 dialog
  const vol = (/** @type {number} */ v) => m.$eval('.media-vol', (r, v) => { /** @type {HTMLInputElement} */ (r).value = String(v); r.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  const vs = () => m.evaluate(() => { const v = /** @type {HTMLVideoElement} */ (document.querySelector('.figure-dialog-body > video')), r = /** @type {HTMLInputElement} */ (document.querySelector('.media-vol'));
    const icon = [...document.querySelectorAll('.media-mute .icon')].find(i => getComputedStyle(i).visibility !== 'hidden')?.classList[1];   // 三張疊在同一格，藏的是 visibility
    return [Math.round(v.volume * 100) / 100, v.muted, r.value, r.parentElement?.style.getPropertyValue('--level'), icon].join(); });
  // volumechange 是排進下一個 task 才到（拉桿、圖示在那時候換）→ 各等一下
  await vol(3); await m.waitForTimeout(150); const v1 = await vs();
  await vol(0); await m.waitForTimeout(150); const v2 = await vs();
  await m.click('.media-mute'); await m.waitForTimeout(150); const v3 = await vs();
  await m.click('.media-vol');
  assert(v1 === '0.15,false,3,3,icon-half' && v2 === '0,true,0,0,icon-silence' && v3 === '1,false,20,20,icon-loud' && await m.$eval('#figure-dialog', d => d.open && !d.classList.contains('is-closing')),
    `intro：音量拉桿調大小、拉到 0＝靜音、在 0 取消靜音＝全音量、鈕的圖示照音量換；點拉桿不關（${v1}｜${v2}｜${v3}）`);
  // 全螢幕＝放大 dialog 那一塊（內容＋自己的控制列；不是讓 <video> 本身全螢幕＝不出瀏覽器原生的控制列，SCCD 是那樣）：
  // 一進去控制列跟游標先藏，游標動了才淡出來（user 2026-11-23；停 3 秒又藏＝chrome.js IDLE）；再按一次離開
  await m.click('.media-fs'); await m.waitForTimeout(800);   // 一進去控制列跟毛玻璃先淡掉（消失也要 fade）→ 等它淡完
  const fs0 = await m.evaluate(() => { const s = /** @type {Element} */ (document.querySelector('.figure-stage'));
    const b = /** @type {Element} */ (document.querySelector('.figure-media > .fs-blur'));
    return [document.fullscreenElement === s, s.classList.contains('is-idle'), /** @type {HTMLVideoElement} */ (document.querySelector('.figure-dialog-body > video')).controls, getComputedStyle(b).display, getComputedStyle(/** @type {Element} */ (b.querySelector('i'))).opacity].join(); });
  await m.mouse.move(100, 300); await m.mouse.move(120, 320); await m.waitForTimeout(700);
  const fs1 = await m.evaluate(() => [/** @type {Element} */ (document.querySelector('.figure-stage')).classList.contains('is-idle'), getComputedStyle(/** @type {Element} */ (document.querySelector('.figure-close'))).opacity,
    getComputedStyle(/** @type {Element} */ (document.querySelector('.figure-media > .fs-blur > i'))).opacity, getComputedStyle(/** @type {Element} */ (document.querySelector('.figure-media > .fs-blur')), '::after').opacity,
    (() => { const n = /** @type {Element} */ (document.querySelector('.figure-nav')).getBoundingClientRect(), g = /** @type {Element} */ (document.querySelector('.figure-nav > .fs-blur')).getBoundingClientRect();
      return g.left < n.left && g.right > n.right && g.top < n.top && g.bottom > n.bottom && g.width < innerWidth / 2; })()].join());
  await m.click('.media-fs'); await m.waitForTimeout(300);
  const fs2 = await m.evaluate(() => [!!document.fullscreenElement, /** @type {Element} */ (document.querySelector('.figure-stage')).classList.contains('is-idle')].join());
  assert(fs0 === 'true,true,false,block,0' && fs1 === 'false,1,1,0.6,true' && fs2 === 'false,false' && await css(m, '.figure-media > .fs-blur', 'display') === 'none',
    `intro：全螢幕＝那一塊、沒有原生控制列；一進去先藏、游標動了才出來，後面墊毛玻璃（同 logo 那塊：貼著每一組、不是整條；跟著一起淡；user 2026-11-23）、不是全螢幕不出；再按離開（${fs0}｜${fs1}｜${fs2}）`);
  await m.click('.figure-close');
  assert(await closedEmpty(), 'intro：關閉鈕（正中的 X）關＝影片拿掉、開燈');
  await m.waitForFunction(() => { const r = /** @type {Element} */ (document.querySelector('.site-logo')).getBoundingClientRect(); return Math.abs(r.top + r.height / 2 - innerHeight / 2) < 1; });   // logo 回正中（下面量展開）
  await m.waitForFunction(() => getComputedStyle(document.querySelector('.figure-btn')).visibility === 'hidden');   // 首頁沒有右圖 → 縮圖鈕退場
  // 點底列的動態＝展開、定位到點下去時看到的那則、閃一下（user 2026-11-23；原本點的是底列右端的＋）。
  // 清單出現＝從畫面底下往上滑進來、不是直接跳出來（user 2026-11-19）：點下去逐幀記清單的上緣（還沒出來＝null）；先捲到那則了也一樣從畫面底緣升上來。
  // 順序（user 2026-11-21）：底列的動態先淡出，淡完 logo 與清單才一起往上 → 一起記動態的透明度、logo 的上緣。
  // 點的那一刻要有一則正亮著（換的空檔＝沒有）→ 在頁面裡等到有、同一幀就點
  await m.mouse.move(5, 5);   // 游標先移開：程式點的不會移游標，前面留在畫面中間的話，閃的那則會剛好在游標底下（＝照 hover 的規矩留著、不切掉）
  const rise = await m.evaluate(() => new Promise(res => {
    const el = document.querySelector('.home-news-list'), track = document.querySelector('.bar-news-track'), logo = document.querySelector('.site-logo'), out = [];
    const go = () => {
      const k = [...document.querySelectorAll('.bar-news-copy > span')].findIndex(x => x.classList.contains('is-current'));
      if (k < 0) { requestAnimationFrame(go); return; }
      /** @type {HTMLElement} */ (document.querySelector('.bar-news')).click();
      const t0 = performance.now();
      const tick = () => { const cs = getComputedStyle(el); out.push(cs.display === 'none' ? null : [Math.round(el.getBoundingClientRect().top), Number(cs.opacity), Number(getComputedStyle(track).opacity), Math.round(logo.getBoundingClientRect().top), Math.round(performance.now() - t0)]); if (performance.now() - t0 < 1300) requestAnimationFrame(tick); else res({ k, out }); };
      requestAnimationFrame(tick);
    };
    go();
  }));
  await m.waitForFunction(() => document.documentElement.classList.contains('news-open'));
  assert(new URL(m.url()).pathname === '/', '展開不換頁');
  assert(await css(m, '.home-news-list', 'display') === 'block', '清單出來');
  {
    const fr = rise.out.filter(f => f !== null), ys = fr.map(f => f[0]), os = fr.map(f => f[1]), dy = ys.map(y => y - ys.at(-1));   // 離終點還有多遠
    assert(dy[0] > 700 && dy.filter(d => d > 14 && d < 700).length >= 5 && dy.every((d, j) => j === 0 || d <= dy[j - 1]),
      `清單從畫面底下升上來（離終點 ${dy[0]} → 0，中途 ${dy.filter(d => d > 14 && d < 700).length} 幀）`);
    assert(os[0] < 0.2 && os.at(-1) === 1 && os.filter(o => o > 0.05 && o < 0.95).length >= 5 && os.every((o, j) => j === 0 || o >= os[j - 1] - 0.001),
      `清單邊升邊淡入（opacity ${os[0]} → ${os.at(-1)}，中途 ${os.filter(o => o > 0.05 && o < 0.95).length} 幀）`);
    const go = fr.findIndex(f => f[0] < ys[0] - 2), goLogo = fr.findIndex(f => f[3] < fr[0][3] - 2);   // 清單／logo 開始動的那一幀
    assert(fr[0][2] > 0.5 && go >= 5 && fr[go][2] < 0.1 && fr.slice(0, go).filter(f => f[2] > 0.05 && f[2] < 0.95).length >= 5 && goLogo >= 0 && Math.abs(fr[goLogo][4] - fr[go][4]) <= 50,   // 比毫秒、不比格數：logo 動 top（主執行緒），清單的位移交給合成器＝固定晚一格起跑，整輪跑時格速一慢就差到 3 格
      `展開的順序：動態先淡出、淡完清單與 logo 才一起往上（第 ${go} 幀 ${fr[go]?.[4]}ms 清單動、第 ${goLogo} 幀 ${fr[goLogo]?.[4]}ms logo 動，那時動態 ${fr[go]?.[2]}，一開始 ${fr[0][2]}）`);
  }
  // 定位：點下去時看到的那則（第 k 則）中線對到畫面正中（422）；捲不到（太上面／太下面）＝捲到頭為止。
  // 升好了閃一下＝hover 的蓋黑收直條（觸控也閃）、直條停一下就淡掉（user 2026-11-23：「highlight 是指我 hover 的效果」「停留一下就 fade out」）
  await m.waitForTimeout(100);
  {
    const pos = await m.evaluate((k) => { const li = /** @type {Element} */ (document.querySelectorAll('.home-news-list li')[k]), r = li.getBoundingClientRect();
      return { mid: r.top + r.height / 2, sy: scrollY, max: document.documentElement.scrollHeight - innerHeight, flash: !!li.querySelector('.item-cover') }; }, rise.k);
    assert(rise.k >= 0 && (pos.sy < 0.5 ? pos.mid <= 422.5 : pos.sy > pos.max - 0.5 ? pos.mid >= 421.5 : Math.abs(pos.mid - 422) < 1),
      `展開：定位到點下去時看到的那則（第 ${rise.k} 則中線 ${pos.mid}、畫面中線 422、捲 ${pos.sy}／${pos.max}）`);
    assert(pos.flash, `展開：定位好那則閃一下＝蓋黑收直條（第 ${rise.k} 則）`);
    // 逐幀記直條露出幾成（clip-path；還在帶＝-1），拿掉了＝null：最後一個 1＝直條停完，之後從左往右切掉（user 2026-11-24：「stroke 離開的時候，改成 clip 的出去，不是用 fade」）
    const fo = await m.evaluate((k) => new Promise(res => { const li = document.querySelectorAll('.home-news-list li')[k], out = /** @type {(number | null)[]} */ ([]), t0 = performance.now();
      const tick = () => { const any = li.querySelector('.item-cover'), s = li.querySelector('.item-cover[data-phase="stroke"]');
        let v = -1; if (s) { const n = (getComputedStyle(s).clipPath.match(/-?[\d.]+/g) || []).map(Number), w = s.getBoundingClientRect().width; v = n.length === 4 ? (w - n[1] - n[3]) / w : 1; }
        out.push(any ? v : null); if (any && performance.now() - t0 < 4000) requestAnimationFrame(tick); else res(out); };
      requestAnimationFrame(tick); }), rise.k);
    const held = fo.lastIndexOf(1), mid = fo.slice(held + 1).filter(o => o !== null && o > 0.05 && o < 0.95).length;
    assert(fo.at(-1) === null && held > 0 && mid >= 3, `閃一下：直條停一下就從左往右切掉（停到第 ${held} 幀、切的途中 ${mid} 幀、共 ${fo.length} 幀）`);
  }
  assert(await css(m, '.bar-news-track', 'opacity') === '0', '展開：底列的動態退掉');
  lr = await rect(m, '.site-logo');
  assert(Math.abs(lr.top) < 1, `展開後 logo 到頂（top ${lr.top}）`);
  { const box = await rect(m, '.home-news-list > ul');   // 手機：動態＝內頁內文的寬＝內距 16＋rail（半欄 38.75）（user 2026-11-23：「比照其他頁面的內容寬度，不一定要跟 logo 等寬」；原本＝logo 寬、滿版）；量清單本身
    assert(Math.abs(box.left - 54.75) < 0.5 && Math.abs(box.width - 280.5) < 0.5,
      `手機動態＝內頁內文的寬、左右各讓內距＋rail（清單 ${box.left}～${box.left + box.width}、應為 54.75～335.25）`); }
  assert(await m.evaluate(() => document.documentElement.scrollHeight > innerHeight), '展開後可捲');
  await m.evaluate(() => scrollTo({ top: 400, behavior: 'instant' }));
  assert(await m.evaluate(() => scrollY >= Math.min(400, document.documentElement.scrollHeight - innerHeight) - 1 && scrollY > 0), '捲得下去');
  // 收合＝反向動畫（user 2026-11-19）：清單往下滑出畫面、滑完才藏起來捲回頂。捲到一半（400）收：畫面上緣以上的那一截先切掉，
  // 不會跟著從上面滑進來。逐幀記「看得到的頂端」（清單上緣＋切掉的高）；藏起來了＝null。展開著再點底列＝收回去
  const fall = await m.evaluate(() => new Promise(res => {
    const el = /** @type {HTMLElement} */ (document.querySelector('.home-news-list')), out = [];
    /** @type {HTMLElement} */ (document.querySelector('.bar-news')).click();
    const t0 = performance.now();
    const tick = () => {
      const cs = getComputedStyle(el);
      out.push(cs.display === 'none' ? null : [Math.round(el.getBoundingClientRect().top + parseFloat(el.style.getPropertyValue('--news-cut'))), Number(cs.opacity), Number(getComputedStyle(document.querySelector('.bar-news-track')).opacity)]);
      if (performance.now() - t0 < 850) requestAnimationFrame(tick); else res(out);
    };
    requestAnimationFrame(tick);
  }));
  await m.waitForFunction(() => !document.documentElement.classList.contains('news-open') && scrollY === 0);
  assert(await css(m, '.home-news-list', 'display') === 'none' && !(await has(m, 'news-closing')), '收合');
  {
    const fr = fall.filter(f => f !== null), ys = fr.map(f => f[0]), os = fr.map(f => f[1]);
    assert(ys.length >= 8 && ys[0] < 60 && ys.at(-1) > 780 && ys.every((y, j) => y >= 0 && (j === 0 || y >= ys[j - 1])) && fall.at(-1) === null,
      `收合：清單看得到的頂端從畫面上緣一路往下滑出去、滑完才藏（${ys[0]} → ${ys.at(-1)}，${ys.length} 幀）`);
    assert(os[0] > 0.8 && os.at(-1) < 0.1 && os.filter(o => o > 0.05 && o < 0.95).length >= 5 && os.every((o, j) => j === 0 || o <= os[j - 1] + 0.001),
      `收合：清單邊滑邊淡出（opacity ${os[0]} → ${os.at(-1)}，中途 ${os.filter(o => o > 0.05 && o < 0.95).length} 幀）`);
    await m.waitForFunction(() => getComputedStyle(document.querySelector('.bar-news-track')).opacity === '1');
    assert(fr.every(f => f[2] < 0.05), `收合的順序：清單滑走了動態才淡回來（滑的途中最大 ${Math.max(...fr.map(f => f[2]))}）`);
    // 收回來直接是下一則（展開時在底下換好）、回來才開始計時（user 2026-11-23：「回到外面時是直接下一個 news，它不需要回來又 fade 成下一個」）
    const shown = () => m.evaluate(() => [...document.querySelectorAll('.bar-news-copy > span')].findIndex(x => x.classList.contains('is-current')));
    const n = await m.evaluate(() => document.querySelectorAll('.bar-news-copy > span').length), back = await shown();
    // 0.3 秒＝比任何一則的淡入（--dur-fade）都短：放不下的那則淡入完就開始捲、捲到尾馬上換，1.5 秒可能已經在換了（看點到哪一則）
    await m.waitForTimeout(300);
    const later = await shown();
    assert(back === (rise.k + 1) % n && later === back, `收回來直接是下一則、回來才開始計時（點的是第 ${rise.k} 則，回來 ${back}、0.3 秒後 ${later}）`);
  }

  // 首頁 → 內頁（user 2026-11-21）：logo 先上移到頂、移完內容才淡入（logo 還在路上時內容一直藏著）。逐幀記 logo 上緣、main 的 opacity、當前頁
  {
    const fr = await m.evaluate(() => new Promise(res => {
      const main = document.getElementById('page-content'), logo = document.querySelector('.site-logo'), out = [];
      /** @type {HTMLElement} */ (document.querySelector('.site-menu a[href="about.html"]')).click();
      const t0 = performance.now();
      const tick = () => { out.push([logo.getBoundingClientRect().top, +getComputedStyle(main).opacity, document.body.dataset.page]); if (performance.now() - t0 < 1500) requestAnimationFrame(tick); else res(out); };
      requestAnimationFrame(tick);
    }));
    const moving = fr.filter(([y, , pg]) => pg === 'about' && y > 2), arrived = fr.findIndex(([y, , pg]) => pg === 'about' && y <= 2);
    assert(fr[0][0] > 300 && moving.length >= 5 && moving.every(([, o]) => o < 0.05) && arrived > 0 && fr.slice(arrived).filter(([, o]) => o > 0.05 && o < 0.95).length >= 3 && fr.at(-1)[1] === 1,
      `首頁 → 內頁：logo 先上移、移完內容才淡入（logo ${fr[0][0]} → ${fr.at(-1)[0]}、上移中 ${moving.length} 幀、那時內容 opacity 最大 ${Math.max(...moving.map(f => f[1]))}、最後 ${fr.at(-1)[1]}）`);
  }

  // 首頁動態開著（logo 已經在頂）從選單去內頁（user 2026-11-21）：只收選單、動態不先收 → logo 全程留在頂，不會先回畫面中間再上移一次
  await m.click('.site-logo');
  await m.waitForFunction(() => document.body.dataset.page === 'index' && getComputedStyle(document.querySelector('.bar-news')).opacity === '1');
  await m.click('.bar-news');
  await m.waitForFunction(() => document.documentElement.classList.contains('news-open'));
  await m.waitForTimeout(1100);   // 跑馬燈淡出（0.4s）＋ logo 上移（0.6s）
  await openMenu(m, true);   // 展開著 menu 鈕點不到（user 2026-11-24）＝鍵盤開
  await m.waitForTimeout(600);
  {
    const tops = await m.evaluate(() => new Promise(res => {
      const logo = document.querySelector('.site-logo'), out = [];
      /** @type {HTMLElement} */ (document.querySelector('.site-menu a[href="about.html"]')).click();
      const t0 = performance.now();
      const tick = () => { out.push(logo.getBoundingClientRect().top); if (performance.now() - t0 < 1800) requestAnimationFrame(tick); else res(out); };
      requestAnimationFrame(tick);
    }));
    assert(Math.max(...tops) < 2 && await m.evaluate(() => document.body.dataset.page) === 'about' && !(await has(m, 'news-open')) && await css(m, '#page-content', 'opacity') === '1',
      `動態開著從選單去內頁：logo 全程在頂（最低 ${Math.max(...tops)}）、換到內頁、動態收了`);
  }

  // 未知路徑 → 404；直開內頁
  await m.evaluate(() => { history.pushState(null, '', '/foo'); dispatchEvent(new PopStateEvent('popstate')); });
  await m.waitForFunction(() => document.body.dataset.page === '404');
  // 404＝簡單版（user 2026-11-24）：只有 stroke 的 logo＋一個字（介面文字 error.unknown：未知／unknown）；左下角是語言鈕、沒有 menu 鈕
  assert((await m.textContent('main h1')).trim() === '未知' && await m.$('main .page-figure') === null && await css(m, '.menu-btn', 'display') === 'none'
    && await css(m, '.bar-lang', 'display') === 'flex' && (await m.textContent('.bar-lang')).trim() === 'EN', '404 page：未知、沒有右圖、左下角語言鈕取代 menu 鈕');
  await m.goto(base + '/pages/about.html');
  await m.waitForSelector('#site-header .site-bar');
  assert(await m.$eval('.site-menu a[href="about.html"]', a => a.classList.contains('active')), 'direct open about active');
  // 換頁 transition＝fade out → 換內容 → fade in：逐幀記 main 的 opacity＋當前頁
  const fade = await m.evaluate(() => new Promise(res => {
    const main = document.getElementById('page-content'), out = [];
    /** @type {HTMLElement} */ (document.querySelector('.site-menu a[href="partners.html"]')).click();
    const t0 = performance.now();
    const tick = () => { out.push([+getComputedStyle(main).opacity, document.body.dataset.page, parseFloat(getComputedStyle(main).filter.slice(5)) || 0]); if (performance.now() - t0 < 1400) requestAnimationFrame(tick); else res(out); };
    requestAnimationFrame(tick);
  }));
  const fadeOutMid = fade.filter(([o, pg]) => pg === 'about' && o > 0.05 && o < 0.95).length;
  const fadeInMid = fade.filter(([o, pg]) => pg === 'partners' && o > 0.05 && o < 0.95).length;
  const firstNew = fade.find(([, pg]) => pg === 'partners');
  assert(fadeOutMid >= 3 && fadeInMid >= 3 && firstNew && firstNew[0] < 0.1 && fade[fade.length - 1][0] === 1,
    `換頁 fade out／in（淡出中途 ${fadeOutMid} 幀、淡入中途 ${fadeInMid} 幀、換內容時 opacity ${firstNew && firstNew[0]}、最後 ${fade[fade.length - 1][0]}）`);
  // 每個 fade 都帶模糊（user 2026-11-21）：淡出＝從清楚到糊（4px）、淡入反過來；第三格＝main 的 blur px
  assert(fade.some(f => f[2] > 0.5 && f[2] < 3.5) && Math.max(...fade.map(f => f[2])) > 3.5 && fade.at(-1)[2] === 0,
    `換頁 fade 帶模糊（最糊 ${Math.max(...fade.map(f => f[2]))}px、最後 ${fade.at(-1)[2]}）`);
  assert(await m.evaluate(() => scrollY) === 0, '換頁後在頂部');
  assert(await css(m, '#custom-scrollbar-thumb', 'display') === 'none', 'mobile 無自製捲軸');
  // 手機詳細頁：返回鈕在左緣那一條（對齊 menu 鈕、上緣＝照片）、捲動後 sticky 停住
  await m.goto(base + '/pages/faculty-detail.html');
  await m.waitForSelector('#site-header .site-bar');
  {
    // 示意只剩學歷、經歷兩個清單（user 2026-11-24）＝844 高的畫面捲不動 → 壓矮才有得捲；scrollY > 0 守著「真的捲了」（不然 sticky 那半等於沒測）
    await m.setViewportSize({ width: 390, height: 560 }); await m.waitForTimeout(300);
    const bk = await rect(m, '.back-btn .icon'), ph = await rect(m, '.profile-photo'), mr = await rect(m, '.menu-btn .bar-rect');
    await m.evaluate(() => scrollTo({ top: 600, behavior: 'instant' }));
    const y = await m.evaluate(() => scrollY);
    assert(Math.abs(bk.left - mr.left) < 1 && Math.abs(bk.top - ph.top) < 1 && y > 0 && Math.abs((await rect(m, '.back-btn .icon')).top - bk.top) < 1,
      `手機返回鈕：對齊 menu 鈕、照片上緣、捲動後 sticky（${bk.left},${bk.top} vs ${mr.left},${ph.top}；捲了 ${y}）`);
    await m.setViewportSize({ width: 390, height: 844 }); await m.waitForTimeout(300);
  }

  // ── 桌面 1280 ──
  const d = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await watch(d);
  await d.goto(base + '/pages/about.html');
  await d.waitForSelector('#site-header .site-bar');
  assert(await css(d, '#page-content', 'paddingTop') === '112px', 'desktop 頂距 7rem');
  assert(await css(d, '.figure-btn', 'display') === 'none' && await css(d, '.page-figure', 'display') === 'block', 'desktop：右圖在內文旁、沒有縮圖鈕');
  // PC 以外（iPad…觸控）收右圖（user 2026-11-23）：webkit 模擬不了 hover: none → 只守 CSS 的 pc: 跟 object.js 是同一條 query
  { const q = fs.readFileSync(path.join(ROOT, 'tailwind.config.js'), 'utf8').match(/'pc': \{ raw: '([^']+)'/)[1];
    assert(/hover: hover/.test(q) && fs.readFileSync(path.join(ROOT, 'js/modules/ui/object.js'), 'utf8').includes(`matchMedia('${q}')`), 'PC 以外收右圖：tailwind pc: 與 object.js 同一條 media query'); }
  assert(await css(d, '.site-container', 'paddingLeft') === '60px', 'desktop container padding 60');
  // 整站不能左右捲：桌面 Chrome 選單開過再關會留一段可捲寬度（webkit 重現不了，這裡只守規則還在）
  assert(await css(d, 'html', 'overflowX') === 'hidden', 'html 擋橫向捲動');
  assert((await css(d, '.site-grid', 'gridTemplateColumns')).split(' ').length === 12, 'desktop grid 12 欄');
  // logo 的框＝SVG viewBox 的比例（圖剛好撐滿框）：對不上的話圖用 contain 縮在框裡、左右各空一截，看起來比動態窄（2026-11-21 換圖後踩過）
  { const lt = await rect(d, '.logo-text');
    const en = await lastEnBottom(d, 'Logo Text.svg'), got = await enVbH(d);
    assert(Math.abs(got - en) < 0.05 && Math.abs(got - STROKE_VB_H) < 0.05, `桌面 logo 英文版的高＝英文最後一行的底＝剛好一個骨牌高（${got} vs ${en.toFixed(2)}）`);
    assert(Math.abs(lt.width / lt.height - LOGO_VB_W / LOGO_VB_H) < 0.01, `logo 框的比例＝SVG viewBox（框 ${(lt.width / lt.height).toFixed(3)}、SVG ${(LOGO_VB_W / LOGO_VB_H).toFixed(3)}；不對就改 variables.css --logo-vb-w／h）`);
  }
  // 底列 menu 鈕＝logo 兩端那顆骨牌的大小（user 2026-11-18）：1280 寬 logo 512 → 骨牌 512×70/viewBox 寬、45:70
  const blockR = await rect(d, '.menu-btn .bar-rect');
  assert(Math.abs(blockR.height - 512 * 70 / LOGO_VB_W) < 0.5 && Math.abs(blockR.width - blockR.height * 45 / 70) < 0.5 && Math.abs((await rect(d, '.site-logo')).width - 512) < 0.5, `底列骨牌同 logo 骨牌大小（${blockR.width}×${blockR.height}）`);
  // about 內頁版型（user 2026-11-18）：只有 Page title text-lg、Section title text-md（user 2026-11-21：每一頁都這樣）、Lead text-s（user 2026-11-21 從 md 改）、Subsection title text-s（user 2026-11-21 改過 md 又改回 s）；title＝Medium、Lead 與內文＝Regular，都不用粗體（user 2026-11-21）；內文 text-s；內文從 col 2 起；col 1 段落導覽（矩形左緣對齊 menu 鈕）
  const fw = (sel, size, weight) => d.$$eval(sel, (els, [sz, w]) => els.every(e => getComputedStyle(e).fontSize === sz && getComputedStyle(e).fontWeight === w), [size, weight]);
  assert(await fw('main h1', '32px', '500') && await fw('main h2', '21.6px', '500') && await fw('main p.page-lead', '18.4px', '400') && await fw('main h3', '18.4px', '500')
    && await fw('main .page-section :is(p:not(.text-xs), li)', '18.4px', '400'),
    'about 頁標題 32px（lg 桌面 2rem，user 2026-11-21）、段落標題 21.6px、小節標題 18.4px＝Medium；導言、內文 18.4px＝Regular（user 2026-11-21）');
  // Subsection title → 內文＝sm（16px），掛在標題的 margin-bottom（user 2026-11-24：「subsection 下面的 mb 改成 sm 大小」；11-21 定的是 xs）；條列裡的項目標題不算，照舊
  assert(await d.$$eval('main .page-section h3', hs => hs.length > 0 && hs.every(h => getComputedStyle(h).marginBottom === '16px'
    && Math.abs(h.nextElementSibling.getBoundingClientRect().top - h.getBoundingClientRect().bottom - 16) < 0.5)), '小節標題下面隔 sm（16px）');
  // 小節一塊一塊、塊與塊之間＝容器的 gap，同清單列 xl（user 2026-11-24：「年級這邊應該是用 gap 來調整，且 gap 跟 list 的調整一致」）；段落標題到第一塊也是 xl
  assert(await d.$$eval('main .subsections', bs => bs.length === 2 && bs.every(b => { const s = getComputedStyle(b), k = [...b.children], r = (/** @type {Element} */ e) => e.getBoundingClientRect();
    return s.rowGap === '48px' && s.marginTop === '48px' && k.length > 1 && k.every((x, i) => !i || Math.abs(r(x).top - r(k[i - 1]).bottom - 48) < 0.5) && getComputedStyle(/** @type {Element} */ (k[0].firstElementChild)).marginTop === '0px'; })),
    '關於的小節：塊與塊之間＝gap xl（48px，同清單列）、段落標題到第一塊也是 xl');
  // 標題那塊（h1＋導言）到第一段＝3xl（桌面 96px）、段跟段之間照舊 2xl（64px）（user 2026-11-24：「這個 title 的區塊到下面的內容，gap 改成 3xl」「分開好了，不要合在一起」）
  assert(await d.$$eval('main .page-body > .page-section', ss => ss.length > 1 && getComputedStyle(ss[0]).marginTop === '96px' && ss.slice(1).every(s => getComputedStyle(s).marginTop === '64px')),
    '標題那塊到第一段 3xl（96px）、段跟段之間 2xl（64px）');
  const col2 = 60 + (1280 - 120 - 11 * 24) / 12 + 24;   // 內距＋一欄＋gutter
  assert(Math.abs((await rect(d, 'main h1')).left - col2) < 1, `about 內文從 col 2 起（h1 ${(await rect(d, 'main h1')).left} vs ${col2}）`);
  const dotL = async () => (await rect(d, '.section-nav-dot')).left + 12;   // 矩形畫在 ::before、按鈕左右內距 0.6em
  assert(await d.$$eval('.section-nav-dot', b => b.length) === 4 && Math.abs(await dotL() - 60) < 1, `段落導覽 4 格（2026-11-23 加了沿革）、矩形左緣對齊 menu 鈕（${await dotL()}）`);
  const navState = () => d.evaluate(() => ({ cur: [...document.querySelectorAll('.section-nav-dot')].findIndex(b => b.getAttribute('aria-current') === 'true'),
    tops: [...document.querySelectorAll('.page-section')].map(t => t.getBoundingClientRect().top) }));
  const settle = () => d.evaluate(() => new Promise(r => { let last = -1; const t = () => { if (scrollY === last) r(scrollY); else { last = scrollY; setTimeout(t, 150); } }; setTimeout(t, 150); }));
  let ns = await navState();
  const alignY = (await rect(d, 'main h1')).top;   // 對齊線＝h1 在頁頂的位置（--top-h 112）
  // 最上面那一格＝頁標題：在頁頂（還沒捲到第一段）亮的是它、段落的矩形都不亮；導覽裡只有它＋段落的矩形，沒有 chevron
  assert(ns.cur === -1 && await d.$eval('.section-nav-top', b => b.getAttribute('aria-current') === 'true' && b.getAttribute('aria-labelledby') === document.querySelector('main h1').id)
    && await d.$$eval('.section-nav > *', bs => bs.map(b => b.className).join()) === 'section-nav-top,section-nav-dot,section-nav-dot,section-nav-dot,section-nav-dot', '段落導覽：一開始亮的是頁標題那一格、只有它＋段落的矩形');
  // 點哪段＝那段頂捲到 h1 的位置；最後一段也捲得到（最後一段撐高）
  for (const i of [1, 2, 3]) {
    await d.click(`.section-nav-dot[data-i="${i}"]`);
    await settle();
    ns = await navState();
    assert(ns.cur === i && Math.abs(ns.tops[i] - alignY) < 1.5, `段落導覽：點第 ${i + 1} 段 → 段落頂對齊 h1 位置（${ns.tops[i]} vs ${alignY}）`);
  }
  // 右圖永遠在畫面正中、段落導覽最上面那一格（頁標題的正方形）的中心停在 h1 第一行的中線（112＋行高 41.6 的一半）：頂／底都量，矮視窗（圖高 > 畫面一半 − 底列）也不能被頂走（user 2026-11-10／11-18）
  const dotTop = () => d.$eval('.section-nav-top', b => b.getBoundingClientRect().top + parseFloat(getComputedStyle(b).paddingTop) + parseFloat(getComputedStyle(b, '::before').height) / 2);   // 頁標題那顆正方形的中心
  for (const [vw, vh] of [[1280, 800], [1280, 560]]) {
    await d.setViewportSize({ width: vw, height: vh });
    for (const y of [0, 1e6]) {
      await d.evaluate(t => window.scrollTo({ top: t, behavior: 'instant' }), y);
      await d.waitForTimeout(100);
      const fy = (await rect(d, '.page-figure > *')).cy, ny = await dotTop();
      assert(Math.abs(fy - vh / 2) < 1 && Math.abs(ny - (112 + 32 * 1.3 / 2)) < 1, `${vw}x${vh} 捲到${y ? '底' : '頂'}：右圖在畫面正中、導覽最上面的正方形在 h1 第一行中線（圖 ${fy} 導覽 ${ny}）`);
    }
  }
  await d.setViewportSize({ width: 1280, height: 800 });
  await d.click('.section-nav-dot[data-i="1"]');
  await settle();
  ns = await navState();
  assert(ns.cur === 1 && Math.abs(ns.tops[1] - alignY) < 1.5 && await d.$eval('.section-nav-top', b => !b.hasAttribute('aria-current')), '段落導覽：往回點上一段（頁標題那格不亮）');
  // 點最上面那一格（頁標題）＝回頁頂、換它亮；再點回第 2 段給後面的檢查用
  await d.click('.section-nav-top');
  await settle();
  ns = await navState();
  assert(await d.evaluate(() => scrollY) === 0 && ns.cur === -1 && await d.$eval('.section-nav-top', b => b.getAttribute('aria-current') === 'true'), '段落導覽：點頁標題那一格 → 回頁頂、換它亮');
  await d.click('.section-nav-dot[data-i="1"]');
  await settle();
  assert(await d.$eval('.section-nav-dot', b => b.getAttribute('aria-labelledby') === document.querySelector('.section-title').id), '段落導覽：矩形報讀名稱＝段落標題');
  // 段落輪播（user 2026-11-21／23）：一列、每張一樣高（＝框高）、寬照圖的比例（不裁）、目前那張在正中、其他隔一個 gutter（24）接在兩邊；
  // 照片本身不糊，框的左右兩側蓋漸進模糊（.slide-blur 5 層、每層模糊加倍；Windows 的 WebKit 不畫 backdrop-filter → 只看設定）；
  // 點左右那張照常換、計時從頭算；滑鼠移開後每 4 秒自己換下一張；滑鼠停在上面＝暫停
  {
    const center = () => d.evaluate(() => [...document.querySelectorAll('.slideshow')[0].querySelectorAll('.slide')].findIndex(s => s.dataset.pos === '0'));
    const n = await d.evaluate(() => document.querySelectorAll('.slideshow')[0].querySelectorAll('.slide').length);
    // 框、每張（照 HTML 的順序）：位置、寬高、圖本身的比例（還沒載到＝0）、照片本身有沒有糊；兩側那幾層的模糊
    const geo = () => d.evaluate(() => { const root = document.querySelectorAll('.slideshow')[0], b = root.getBoundingClientRect();
      return { W: b.width, H: b.height, s: [...root.querySelectorAll('.slide')].map(el => { const r = el.getBoundingClientRect(), im = /** @type {HTMLImageElement} */ (el.querySelector('img'));
        return { pos: el.dataset.pos, x: r.left - b.left, w: r.width, h: r.height, ratio: im.naturalWidth ? im.naturalWidth / im.naturalHeight : 0, filter: getComputedStyle(el).filter }; }),
        layers: [...root.querySelectorAll('.slide-blur > i')].map(i => { const cs = getComputedStyle(i); return parseFloat((/blur\(([\d.]+)px\)/.exec(cs.webkitBackdropFilter || cs.backdropFilter) || [0, '0'])[1]); }),
        // 照片列：左右各伸出框外、透明度淡掉（框的邊不是一刀切，user 2026-11-23）、超出的 clip 掉（不是 hidden＝捲不動）
        strip: (() => { const el = /** @type {Element} */ (root.querySelector('.slide-strip')), r = el.getBoundingClientRect(), cs = getComputedStyle(el); return { dx: r.left - b.left, dw: r.width - b.width, dy: r.top - b.top, dh: r.height - b.height, mask: cs.webkitMaskImage || cs.maskImage, clip: cs.overflowX, cut: parseFloat(cs.getPropertyValue('--slide-cut')) }; })() }; });
    const at = (/** @type {any} */ g, /** @type {string} */ p) => g.s.find((/** @type {any} */ x) => x.pos === p);
    await d.hover('.slideshow >> nth=0');   // 先停在上面＝暫停，讀到的位置才不會被自動播換掉
    await d.waitForTimeout(700);
    const c0 = await center(), g0 = await geo(), m0 = at(g0, '0'), r0 = at(g0, '1');
    // 框高＝同小節圖（user 2026-11-23：段落跟小節圖同步）：最高 16rem（256）、最寬的那張也放得進欄寬
    assert(n === 5 && Math.abs(g0.H - Math.min(256, g0.W / Math.max(...g0.s.map((/** @type {any} */ x) => x.w / x.h)))) < 1
      && g0.s.every((/** @type {any} */ x) => Math.abs(x.h - g0.H) < 1 && x.filter === 'none' && (!x.ratio || Math.abs(x.w / x.h - x.ratio) < 0.02))
      && Math.abs(m0.x + m0.w / 2 - g0.W / 2) < 1 && Math.abs(r0.x - (m0.x + m0.w + 24)) < 1 && g0.layers.join() === '0.5,1,2,4,8'
      && Math.abs(g0.strip.dx + 24) < 0.5 && Math.abs(g0.strip.dw - 48) < 0.5 && /gradient/.test(g0.strip.mask) && g0.strip.clip === 'clip'
      && Math.abs(g0.strip.dy + 24) < 0.5 && Math.abs(g0.strip.dh - 48) < 0.5   // 上下也各伸 1.5rem（user 2026-11-24：兩側的模糊往上下暈出去、不在上下緣切成直線，同作品頁）；照片照舊＝框高（上面）
      && Math.abs(g0.strip.cut - (m0.x + 24)) < 1,   // 糊的那段＝目前那張以外（user 2026-11-24 照作品頁的放映）：列的外緣（框外 24）到目前那張的左緣
      `輪播：一樣高、照圖的比例不裁、目前那張在正中、下一張隔 24 接在右邊、照片本身不糊、兩側 5 層漸進模糊只糊目前那張以外、照片列伸出框外 24 淡掉、上下各伸 24（${JSON.stringify(g0)}）`);
    await d.click('.slideshow >> nth=0 >> .slide[data-pos="1"]', { position: { x: 8, y: 20 } });   // 點看得到的那一截（右邊那張的正中多半在框外、被切掉）
    const c1 = await center();
    assert(c1 === (c0 + 1) % n, `輪播：點下一張照常換（${c0} → ${c1}）`);
    await d.waitForTimeout(700);
    const g1 = await geo(), m1 = at(g1, '0');
    assert(Math.abs(m1.x + m1.w / 2 - g1.W / 2) < 1 && Math.abs(at(g1, '-1').x + at(g1, '-1').w + 24 - m1.x) < 1, `輪播：滑完新的那張在正中、上一張接在左邊（${JSON.stringify(g1.s)}）`);
    await d.mouse.move(640, 790);
    await d.waitForTimeout(4300);
    const c2 = await center();
    assert(c2 === (c1 + 1) % n, `輪播自動播：點完 4 秒換下一張（${c1} → ${c2}）`);
    await d.hover('.slideshow >> nth=0');
    await d.waitForTimeout(4300);
    assert(await center() === c2, '輪播：滑鼠停在上面＝不自動換');
  }
  assert(await css(d, '#custom-scrollbar-thumb', 'display') === 'block', 'about 長頁：自製捲軸 thumb');
  // logo 背後的毛玻璃只在有東西捲到它底下才出（user 2026-11-23：「有被遮擋才會加，不然預設沒有」；原本漸進模糊常駐、捲上來才疊底色）
  {
    const y0 = await d.evaluate(() => scrollY), blur = (/** @type {string} */ o) => d.waitForFunction((o) => getComputedStyle(/** @type {Element} */ (document.querySelector('.top-blur > i'))).opacity === o, o, { timeout: 3000 }).then(() => true, () => false);
    await d.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    const off = await blur('0');
    await d.evaluate(() => scrollTo({ top: 300, behavior: 'instant' }));
    const on = await blur('1');
    assert(off && on, 'logo 的毛玻璃：沒捲＝沒有、捲了（內容到 logo 底下）才出');
    await d.evaluate((y) => scrollTo({ top: y, behavior: 'instant' }), y0);
  }
  // 右圖（user 2026-11-19）：4 欄寬方形、在「內容區右緣～畫面右緣 1280」那段的正中；選單開著內容右推 228 → 那段空間變窄、
  // 右圖跟著在新空間重新置中（中心往右 114）並縮小（寬少掉 228）＝兩邊留白跟原本一樣
  const fig0 = await rect(d, '.page-figure > *'), pb = await rect(d, '.page-body');
  const figMid = (pb.left + pb.width + 1280) / 2, colW4 = (1280 - 120 - 11 * 24) / 12 * 4 + 3 * 24;
  assert(Math.abs(fig0.left + fig0.width / 2 - figMid) < 1 && Math.abs(fig0.width - colW4) < 1 && Math.abs(fig0.height - fig0.width) < 1,
    `desktop 右圖：4 欄寬方形、在內容右緣～畫面右緣正中（中心 ${fig0.left + fig0.width / 2} vs ${figMid}、寬 ${fig0.width}）`);
  await openMenu(d);
  await d.waitForTimeout(600);
  assert(await css(d, '.page-body', 'filter') === 'blur(4px)' && await css(d, '.page-body', 'opacity') === '0.4' && await css(d, '.page-figure', 'opacity') === '1' && await css(d, '.page-figure', 'filter') === 'none' && await d.$eval('.top-blur', t => getComputedStyle(t, '::after').opacity) === '0', '選單開著：內容模糊、右圖照常、logo 後面不疊白');
  // 選單 15 列（加了深色模式鈕，user 2026-11-21）在 800 高放不下（要 604、只有 574）→ 改在 900 高量間距；更矮時選單自己捲。
  // 16 列（加了作品，user 2026-11-23）900 高也差一點（最後一段被壓成 30）→ 改在 960 高量
  await d.setViewportSize({ width: 1280, height: 960 });
  { const g = await menuGaps(d); assert(menuGapsOk(g, true), `桌面選單（960 高）：捲動框 → 常見問題那組 → 深色模式那組＝分區間距 xl、那組到 menu 鈕＝同燈箱圖片到 ‹X›、規章那組在捲動框裡、選項間距 sm（${JSON.stringify(g)}）`); }
  await d.setViewportSize({ width: 1280, height: 800 });
  await d.waitForTimeout(100);
  {
    const fg = await rect(d, '.page-figure > *');
    const pb2 = await rect(d, '.page-body'), figMid2 = (pb2.left + pb2.width + 1280) / 2;
    assert(Math.abs(figMid2 - (figMid + 114)) < 1 && Math.abs(fg.left + fg.width / 2 - figMid2) < 1 && Math.abs(fg.width - (fig0.width - 228)) < 1 && Math.abs(fg.height - fg.width) < 1 && Math.abs(fg.cy - fig0.cy) < 1
      && Math.abs(fg.left - (pb2.left + pb2.width) - (fig0.left - (pb.left + pb.width))) < 1,
      `desktop 選單開：右圖在變窄後的空間重新置中、縮小、兩邊留白不變（${fig0.width} → ${fg.width}，中心 ${fg.left + fg.width / 2} vs ${figMid2}）`);
  }
  let h1r = await rect(d, '.section-nav');
  lr = await rect(d, '.site-logo');
  assert(Math.abs(h1r.left - 288) < 2 && Math.abs(await dotL() - 288) < 1, `desktop 選單開：內容左緣＝選單右緣 288、段落導覽跟著右推（nav ${h1r.left}）`);
  { const mb = await rect(d, '.menu-btn'), mr = await rect(d, '.menu-btn .bar-rect'), nav = await rect(d, '.site-menu-nav');
    assert(await css(d, '.site-menu', 'width') === '288px' && Math.abs(mb.width - mr.width) < 0.5 && nav.left === 0 && Math.abs(nav.width - 288) < 0.5,
      `desktop 選單固定寬 18rem；menu 鈕不撐＝play 留在原位（user 2026-11-24，原本滑到選單右緣）、選項的捲動框吃滿選單那一欄（鈕 ${mb.width}、選項框 ${nav.left}～${nav.left + nav.width}）`); }
  // 窄桌面 logo 左緣跑進選單字裡 → 至少讓開選單文字一個內距
  await d.setViewportSize({ width: 800, height: 800 });
  await d.waitForTimeout(600);
  const navR = await d.$$eval('.site-menu .nav-link, .site-menu .lang-btn', els => Math.max(...els.map(e => e.getBoundingClientRect().right)));
  h1r = await rect(d, '.section-nav');
  assert(h1r.left >= navR + 59 && Math.abs(h1r.left - 288) < 2, `800 寬選單開：內容左緣＝選單右緣、讓開選單字（nav ${h1r.left} 選單字右 ${navR}）`);
  await d.setViewportSize({ width: 1280, height: 800 });
  await d.keyboard.press('Escape');
  // 換頁：捲軸跟著內容一起淡出、換到短頁才藏（CLAUDE.md「消失也要 fade」；原本內容淡掉了它還亮著、換完才一下子不見）。about（長）→ 首頁（短），逐幀記 opacity，藏起來了＝null
  {
    await d.waitForTimeout(600);   // 選單收完
    const fo = await d.evaluate(() => new Promise(res => { const t = /** @type {HTMLElement} */ (document.getElementById('custom-scrollbar-thumb')), out = /** @type {(number | null)[]} */ ([]);
      /** @type {HTMLElement} */ (document.querySelector('.site-logo')).click();
      const tick = () => { const cs = getComputedStyle(t); out.push(cs.display === 'none' ? null : Number(cs.opacity)); if (out.at(-1) !== null && out.length < 150) requestAnimationFrame(tick); else res(out); }; tick(); }));
    const mid = fo.filter(o => o !== null && o > 0.05 && o < 0.95).length;
    assert(fo.at(-1) === null && mid >= 3, `換頁：捲軸跟著內容淡出、換到短頁才藏（淡的途中 ${mid} 幀、共 ${fo.length} 幀）`);
  }
  await d.goto(base + '/index.html');
  await d.waitForSelector('#site-header .site-bar');
  lr = await rect(d, '.site-logo');
  assert(Math.abs(lr.left + lr.width / 2 - 640) < 2 && Math.abs(lr.cy - 400) < 3, `desktop index logo 畫面正中（cx ${lr.left + lr.width / 2} cy ${lr.cy}）`);
  assert(await css(d, '#custom-scrollbar-thumb', 'display') === 'none', '短頁（首頁未展開）無捲軸 thumb');
  assert((await css(d, '.site-bar', 'gridTemplateColumns')).split(' ').length === 3 && await css(d, '.site-bar', 'paddingLeft') === '60px', 'desktop 底列三欄');
  nr = await rect(d, '.bar-news');
  assert(Math.abs(nr.left + nr.width / 2 - 640) < 2 && Math.abs(nr.width - 512) < 2, `desktop 動態置中、寬＝圖片 32rem（cx ${nr.left + nr.width / 2} w ${nr.width}）`);
  { const tk = await rect(d, '.bar-news-track');
    assert(Math.abs(tk.left - lr.left) < 1 && Math.abs(tk.left + tk.width - (lr.left + lr.width)) < 1, `desktop 動態對齊 logo 的寬（沒有＋了，user 2026-11-23；動態 ${tk.left}～${tk.left + tk.width}、logo ${lr.left}～${lr.left + lr.width}）`); }
  // 一次一則（user 2026-11-23）：放得下＝置中、停 3 秒才 fade 換下一則；放不下＝從欄的左緣起、停一下再往左捲到尾，跑完才換
  {
    await d.mouse.move(640, 300);   // 游標在動態上＝先不換
    const at = () => d.evaluate(() => [...document.querySelectorAll('.bar-news-copy > span')].findIndex(x => x.classList.contains('is-current')));
    const c0 = await d.evaluate(() => new Promise(res => {   // 等到剛換上新的一則，從那一刻起算
      const now = () => [...document.querySelectorAll('.bar-news-copy > span')].findIndex(x => x.classList.contains('is-current')), was = now();
      const tick = () => { const c = now(); if (c >= 0 && c !== was) res(c); else requestAnimationFrame(tick); };
      tick();
    }));
    const fit = await d.evaluate((c) => { const x = document.querySelectorAll('.bar-news-copy > span')[c], t = /** @type {Element} */ (document.querySelector('.bar-news-track')).getBoundingClientRect(), r = x.getBoundingClientRect();
      return { long: x.classList.contains('is-long'), mid: Math.round(r.left + r.width / 2 - (t.left + t.width / 2)) }; }, c0);
    await d.waitForTimeout(2600);
    const c1 = await at();
    const next = await d.waitForFunction((c) => { const sp = [...document.querySelectorAll('.bar-news-copy > span')]; return sp.findIndex(x => x.classList.contains('is-current')) === (c + 1) % sp.length; }, c0, { timeout: 2500 }).then(() => true, () => false);
    assert(!fit.long && Math.abs(fit.mid) < 1 && c1 === c0 && next, `動態：放得下的置中、停 3 秒才換到下一則（第 ${c0} 則 ${JSON.stringify(fit)}，2.6 秒時 ${c1}）`);
    const k = await d.evaluate(() => { const sp = [...document.querySelectorAll('.bar-news-copy > span')], n = (sp.findIndex(x => x.classList.contains('is-current')) + 1) % sp.length;
      sp[n].textContent = '很長的動態標題'.repeat(4); return n; });
    await d.waitForFunction((n) => document.querySelectorAll('.bar-news-copy > span')[n].classList.contains('is-current'), k, { timeout: 6000 });
    const long = await d.evaluate((n) => { const x = document.querySelectorAll('.bar-news-copy > span')[n], t = /** @type {Element} */ (document.querySelector('.bar-news-track')).getBoundingClientRect(), r = x.getBoundingClientRect();
      return { long: x.classList.contains('is-long'), left: Math.round(r.left - t.left), over: Math.round(r.width - t.width) }; }, k);
    // 前後都不停（user 2026-11-23：「marquee 結束之後不需要停頓一下，可以直接切，開始的時候也不需要停一下再跑」；原本前後各停 1 秒）：淡入完（0.4s）就在捲、捲到尾馬上換
    await d.waitForTimeout(800);
    const moved = await d.evaluate((n) => Math.round(new DOMMatrix(getComputedStyle(document.querySelectorAll('.bar-news-copy > span')[n]).transform).m41), k);
    const end = await d.waitForFunction((n) => { const r = document.querySelectorAll('.bar-news-copy > span')[n].getBoundingClientRect(), t = /** @type {Element} */ (document.querySelector('.bar-news-track')).getBoundingClientRect(); return r.right <= t.right + 0.5; }, k, { timeout: 15000 }).then(() => true, () => false);
    const t0 = Date.now();
    const gone = await d.waitForFunction((n) => !document.querySelectorAll('.bar-news-copy > span')[n].classList.contains('is-current'), k, { timeout: 3000 }).then(() => true, () => false), lag = Date.now() - t0;
    assert(long.long && Math.abs(long.left) < 1 && long.over > 50 && moved < -5 && end && gone && lag < 500,
      `動態：放不下的從欄的左緣起、一出來就往左捲、捲到尾馬上換（${JSON.stringify(long)}，0.8 秒時位移 ${moved}、捲到尾 ${end}、${lag}ms 後換掉）`);
  }
  // hover menu 鈕（user 2026-11-21）：不出名字＝play 不動、動態中心不動
  const playHome = (await rect(d, '.play-btn')).left;
  await d.hover('.menu-btn');
  await d.waitForTimeout(550);
  nr = await rect(d, '.bar-news');
  assert(Math.abs((await rect(d, '.play-btn')).left - playHome) < 0.5 && Math.abs(nr.left + nr.width / 2 - 640) < 2 && await css(d, '.menu-btn .bar-label', 'width') === '0px',
    'hover menu 鈕：不出名字、play 不動、動態中心不動');
  // play（intro）鈕也不出名字（user 2026-11-23：hover 時拿掉「簡介」；原本 2026-11-21 是寬長出來、邊長邊淡入）：
  // 名字留著當報讀名稱；play 不動、底列不重量、動態中心不動
  {
    const side = () => d.$eval('.site-bar', b => parseFloat(b.style.getPropertyValue('--side-min')));
    const sideBefore = await side();
    await d.hover('.play-btn');
    await d.waitForTimeout(550);
    nr = await rect(d, '.bar-news');
    assert(await css(d, '.play-btn .bar-label', 'width') === '0px' && await css(d, '.play-btn .bar-label', 'opacity') === '0' && await side() === sideBefore
      && Math.abs((await rect(d, '.play-btn')).left - playHome) < 0.5 && Math.abs(nr.left + nr.width / 2 - 640) < 2 && (await d.textContent('.play-btn .bar-label')) === '簡介',
      `hover play 鈕：不出名字（留著當報讀名稱）、play 不動、底列不重量（${sideBefore} → ${await side()}）、動態中心不動`);
  }
  // 窄桌面 800：兩側等寬＝動態仍在畫面正中（底列的鈕都不出名字了，hover 也不會把動態擠窄）
  await d.setViewportSize({ width: 800, height: 800 });
  await d.hover('.play-btn');
  await d.waitForTimeout(550);
  nr = await rect(d, '.bar-news');
  assert(Math.abs(nr.left + nr.width / 2 - 400) < 2, `800 寬 hover play：動態仍置中（cx ${nr.left + nr.width / 2} w ${nr.width}）`);
  await d.setViewportSize({ width: 1280, height: 800 });
  // hover 底列的動態＝蓋黑收直條（user 2026-11-23：「hover 外層的 news 時也有這個 hover 的效果」；原本字色變 0.75）：
  // 帶與直條插在軌道裡（展開時跟著淡掉）、直條在字尾後面（放不下＝欄的右緣外）、字色不變；離開拿掉
  {
    await d.mouse.move(640, 300);
    await d.waitForTimeout(150);
    const nb = await rect(d, '.bar-news');
    await d.mouse.move(nb.left + nb.width / 2, nb.top + nb.height / 2);
    const band = await d.evaluate(() => document.querySelector('.bar-news-track > .item-cover')?.getBoundingClientRect().width || 0);
    await d.waitForTimeout(1700);   // 蓋、收各 DUR.fast，收完再等 0.2 秒、直條切出來（user 2026-11-24）
    const st = await d.evaluate(() => { const cur = /** @type {Element} */ (document.querySelector('.bar-news-copy > .is-current')), rg = document.createRange(); rg.selectNodeContents(cur);
      return { end: Math.min(rg.getBoundingClientRect().right, /** @type {Element} */ (document.querySelector('.bar-news-copy')).getBoundingClientRect().right),
        s: [...document.querySelectorAll('.bar-news-track > .item-cover')].map(s => { const r = s.getBoundingClientRect(); return [r.left, r.width, getComputedStyle(s).opacity]; }),
        same: getComputedStyle(/** @type {Element} */ (document.querySelector('.bar-news'))).color === getComputedStyle(/** @type {Element} */ (document.querySelector('.site-bar'))).color }; });
    await d.mouse.move(640, 300); await d.waitForTimeout(600);   // 離開＝直條切出去（user 2026-11-24）
    const gone = await d.evaluate(() => !document.querySelector('.bar-news .item-cover'));
    assert(band > 50 && st.s.length === 1 && st.s[0][1] < 15 && st.s[0][2] === '1' && Math.abs(st.s[0][0] - st.end - 5) < 12 && st.same && gone,
      `底列的動態 hover＝蓋黑收直條、字色不變（帶 ${band}、${JSON.stringify(st)}、離開拿掉 ${gone}）`);
  }
  await d.waitForTimeout(150);
  await d.click('.bar-news');
  await d.waitForFunction(() => document.documentElement.classList.contains('news-open'));
  // 捲軸出現＝淡入（user 2026-11-21）：一出現的那一幀還沒全實
  const thumbO = await d.evaluate(() => new Promise(res => { const t = document.getElementById('custom-scrollbar-thumb');
    const t0 = performance.now(), tick = () => { if (getComputedStyle(t).display === 'block') res(Number(getComputedStyle(t).opacity)); else if (performance.now() - t0 > 3000) res(-1); else requestAnimationFrame(tick); }; tick(); }));   // 等不到（清單太短沒捲軸）＝-1、斷言失敗，不要整輪卡住
  assert(parseFloat(await css(d, '#custom-scrollbar-thumb', 'height')) > 40 && thumbO >= 0 && thumbO < 1 && await css(d, '#custom-scrollbar-thumb', 'animationName') === 'fade-in', `展開後自製捲軸 thumb 出現、淡入（剛出現 opacity ${thumbO}）`);
  const ur = await rect(d, '.home-news-list > ul');
  assert(Math.abs(ur.left + ur.width / 2 - 640) < 2 && Math.abs(ur.width - 512) < 2, `desktop 清單畫面中間 32rem（cx ${ur.left + ur.width / 2} w ${ur.width}）`);
  // 首頁動態 PC＝同內頁的清單列（user 2026-11-24；原本圖＝logo 寬、圖在上）：縮圖＝內頁清單的縮圖一樣大（--item-thumb-w，1280 寬＝124）、方框、文字隔一個 gutter、沒有框線；
  // 後台沒有圖＝不放圖框（user 2026-11-24）由接後台那段驗
  {     const box = await rect(d, '.home-news-box'), txt = await rect(d, '.home-news-list li p'), W = ((1280 - 120 - 24) / 2 - 5 * 24) / 6 * 1.5 + 12;
    assert(Math.abs(box.left - ur.left) < 0.5 && Math.abs(box.width - W) < 0.5 && Math.abs(box.height - W) < 0.5
      && Math.abs(txt.left - (box.left + W + 24)) < 0.5 && await css(d, '.home-news-box', 'borderTopWidth') === '0px',
      `desktop 動態＝清單列：縮圖同清單（${W}）貼左、文字隔一個 gutter、沒有框（圖 ${box.left}～${box.left + box.width}×${box.height}、字 ${txt.left}）`);
  }
  await d.waitForTimeout(1100);   // 跑馬燈先淡出（0.4s）logo 才上移（0.6s）
  lr = await rect(d, '.site-logo');
  assert(Math.abs(lr.left + lr.width / 2 - 640) < 2 && lr.top < 1, 'desktop 展開後 logo 頂到頂置中');
  // 捲軸照升完的可捲高度（user 2026-11-23：升上來的位移撐大可捲高度、捲軸照撐大的量畫，要捲一下才跳回去；home.css #page-content overflow-y: clip）
  { const sb = await d.evaluate(() => ({ h: /** @type {HTMLElement} */ (document.getElementById('custom-scrollbar-thumb')).getBoundingClientRect().height, want: Math.max(40, innerHeight * innerHeight / document.documentElement.scrollHeight) }));
    assert(Math.abs(sb.h - sb.want) < 1, `首頁展開：捲軸照升完的高、不用捲一下才對（${sb.h}／${sb.want}）`); }
  // hover 一則＝蓋黑收直條（user 2026-11-23：「hover news title 時也要加上我們設定的 hover 效果」）：帶 → 直條留著 → 離開直接拿掉。挑畫面裡、沒在閃的那則
  {
    // 一則（標題＋圖）比畫面的一半還高，置中那則以外只露出一截：滑鼠停在露出來那段（logo 以下、底列以上）的正中
    const at = await d.evaluate(() => { const lo = 130, hi = innerHeight - 120, vis = (/** @type {DOMRect} */ r) => Math.min(r.bottom, hi) - Math.max(r.top, lo);
      const li = /** @type {HTMLElement} */ ([...document.querySelectorAll('.home-news-list li')].find(l => vis(l.getBoundingClientRect()) > 40 && !l.querySelector('.item-cover')));
      const r = li.getBoundingClientRect(); li.dataset.t = '1'; return { x: r.left + r.width / 2, y: (Math.max(r.top, lo) + Math.min(r.bottom, hi)) / 2 }; });
    await d.mouse.move(at.x, at.y);
    const band = await d.evaluate(() => document.querySelector('[data-t] .item-cover')?.getBoundingClientRect().width || 0);
    await d.waitForTimeout(1700);   // 蓋、收各 DUR.fast，收完再等 0.2 秒、直條切出來（user 2026-11-24）
    const st = await d.evaluate(() => [...document.querySelectorAll('[data-t] .item-cover')].map(s => [Math.round(s.getBoundingClientRect().width), getComputedStyle(s).opacity]));
    await d.mouse.move(20, 400); await d.waitForTimeout(600);   // 離開＝直條切出去（user 2026-11-24）
    const gone = await d.evaluate(() => !document.querySelector('[data-t] .item-cover'));
    await d.evaluate(() => document.querySelector('[data-t]')?.removeAttribute('data-t'));
    assert(band > 100 && st.length >= 1 && st.every(([w, o]) => w < 15 && o === '1') && gone, `首頁展開：hover 一則＝蓋黑收直條（帶 ${band}、直條 ${JSON.stringify(st)}、離開拿掉 ${gone}）`);
  }
  // 首頁展開＝清單在前、底列的 menu、play 是背景（user 2026-11-24：「點擊 news 的時候，讓背景加上 blur，那 menu 跟 play 就沒辦法點擊」）：模糊＋疊白、不吃指標
  assert(await d.$$eval('.site-bar :is(.menu-btn, .play-btn)', bs => bs.length === 2 && bs.every(b => { const s = getComputedStyle(b); return s.filter === 'blur(4px)' && s.opacity === '0.4' && s.pointerEvents === 'none'; })),
    '首頁展開：底列 menu、play 模糊＋疊白、點不到');
  // 首頁展開＋選單開（user 2026-11-21）：展開的動態不右推——清單留在 logo 底下（左緣 384），只模糊＋疊白（原本跟內容一起右推）。menu 鈕點不到＝鍵盤開
  await openMenu(d, true);
  await d.mouse.move(640, 300);
  await d.waitForTimeout(700);
  {
    const u = await rect(d, '.home-news-list > ul');
    assert(Math.abs(u.left - 384) < 2 && Math.abs(await tx(d, '#page-content')) < 1 && Math.abs(await tx(d, '.bar-news')) < 1, `首頁展開＋選單：動態不右推（欄 ${u.left}）`);
    assert(await css(d, '.home-news-list > ul', 'filter') === 'blur(4px)' && await css(d, '.home-news-list > ul', 'opacity') === '0.4', '首頁展開＋選單：清單模糊＋疊白');
  }
  // 選單開著點內容＝第一下只收選單、清單還開著（user 2026-11-18）；再點動態以外的地方＝收回去（user 2026-11-23：「點別的地方可以回到上一個畫面」）
  await d.mouse.click(1100, 400);
  await d.waitForTimeout(300);
  assert(!(await has(d, 'menu-open')) && await has(d, 'news-open'), '首頁展開＋選單開：點內容＝只收選單、清單還開著');
  await d.waitForTimeout(500);
  // 點在糊掉的 menu 鈕上也算動態以外（user 2026-11-24：menu 點不到＝落在底列本身）：收回去、不開選單
  { const mb = await rect(d, '.menu-btn'); await d.mouse.click(mb.left + mb.width / 2, mb.top + mb.height / 2); }
  assert(await d.waitForFunction(() => !document.documentElement.classList.contains('news-open'), null, { timeout: 2000 }).then(() => true, () => false) && !(await has(d, 'menu-open')),
    '首頁展開：點動態以外的地方＝收回去（點在糊掉的 menu 鈕上也是、不開選單）');
  // 捲軸跟著清單淡掉、滑完才藏（user 2026-11-23：「news 離開的時候，scrollbar 的消失也是 fade out 才對」）：逐幀記 opacity，藏起來了＝null
  { const fo = await d.evaluate(() => new Promise(res => { const t = /** @type {HTMLElement} */ (document.getElementById('custom-scrollbar-thumb')), out = /** @type {(number | null)[]} */ ([]);
      const tick = () => { const cs = getComputedStyle(t); out.push(cs.display === 'none' ? null : Number(cs.opacity)); if (out.at(-1) !== null && out.length < 150) requestAnimationFrame(tick); else res(out); }; tick(); }));
    const mid = fo.filter(o => o !== null && o > 0.05 && o < 0.95).length;
    assert(fo.at(-1) === null && mid >= 3 && fo.every((o, j) => j === 0 || o === null || o <= /** @type {number} */ (fo[j - 1]) + 0.001), `首頁收回去：捲軸跟著淡出、滑完才藏（淡的途中 ${mid} 幀、共 ${fo.length} 幀）`); }
  await d.keyboard.press('Escape');

  // 合作企業＝跟師資同一種列、接後台（user 2026-11-21）：有官網＝整列外連另開新視窗、沒有或不是 http(s)＝那列不可點（div）；副標一筆一行
  await d.goto(base + '/pages/partners.html');
  await d.waitForSelector('#site-header .site-bar');
  await d.waitForFunction(() => document.querySelectorAll('.item-list[data-cms] li').length === 3);
  {
    const pr = await d.$$eval('.item-list[data-cms] li', lis => lis.map(li => { const row = /** @type {HTMLElement} */ (li.firstElementChild);
      return [row.tagName, row.getAttribute('href'), row.getAttribute('target'), li.querySelector('h3')?.textContent, li.querySelectorAll('p').length].join('|'); }));
    assert(pr.join() === 'A|https://example.com/p1|_blank|後台企業一（示意）|2,DIV|||後台企業二（示意）|0,DIV|||後台企業三（示意）|1'
      && await css(d, '.item-row h3', 'fontWeight') === '500', `合作企業接後台：同師資的列、官網外連、沒官網不可點（${pr.join()}）`);
  }
  // 標題、副標各一行（user 2026-11-21）：文字上下對在縮圖的正中；放不下的那行（假資料第二行副標很長）直接切掉、不淡（照 SCCD，user 2026-11-23）；
  // 那行的框右緣不碰到圓點（有圓點的列右邊先讓出圓點的位置）
  {
    const info = await d.$eval('a.item-row', row => {
      const line = /** @type {HTMLElement} */ (row.querySelector('p:last-child')), h = /** @type {HTMLElement} */ (row.querySelector('h3'));
      const r = (/** @type {Element} */ e) => e.getBoundingClientRect(), mask = (/** @type {Element} */ e) => { const s = getComputedStyle(e); return s.maskImage || s.webkitMaskImage; };
      const th = r(/** @type {Element} */ (row.querySelector('.item-thumb'))), col = r(/** @type {Element} */ (row.lastElementChild));
      return { oneLine: r(line).height < 1.5 * parseFloat(getComputedStyle(line).lineHeight), clipped: line.classList.contains('is-clipped'), mask: mask(line),
        hClipped: h.classList.contains('is-clipped'), hMask: mask(h), dotGap: r(row).right - parseFloat(getComputedStyle(row, '::after').width) - r(line).right,
        center: col.top + col.height / 2 - (th.top + th.height / 2) };
    });
    assert(info.oneLine && info.clipped && info.mask === 'none' && !info.hClipped && info.hMask === 'none' && info.dotGap > 4 && Math.abs(info.center) < 1,
      `合作企業：文字對在縮圖正中、副標一行、放不下的直接切掉（不淡）、不碰到圓點（${JSON.stringify(info)}）`);
  }
  // hover 那一列：放不下的那行跑馬燈（text-indent 一直往左）、每秒 80px、兩端不淡（照 SCCD，user 2026-11-23），放得下的不動；
  // 移開＝滑回起點（一幀一幀過去、不跳回去）、動畫收乾淨
  {
    const ind = () => d.$eval('a.item-row p:last-child', p => { const s = getComputedStyle(p), a = p.getAnimations()[0];
      return { x: parseFloat(s.textIndent), on: p.classList.contains('is-marquee'), mask: s.maskImage || s.webkitMaskImage, n: p.getAnimations().length,
        speed: a ? parseFloat(p.style.getPropertyValue('--loop')) / Number(a.effect?.getComputedTiming().duration) * 1000 : 0 }; });
    await d.mouse.move(640, 5);
    await d.hover('a.item-row');
    await d.waitForTimeout(600);
    const run = await ind(), h0 = await d.$eval('a.item-row h3', h => getComputedStyle(h).textIndent);
    assert(run.on && run.x < -5 && Math.abs(run.speed - 80) < 0.5 && run.mask === 'none' && h0 === '0px', `hover 那一列：放不下的那行跑馬燈、每秒 80px、不淡，放得下的不動（${JSON.stringify(run)}、名字 ${h0}）`);
    const sampling = d.evaluate(() => new Promise(res => {
      const p = /** @type {HTMLElement} */ (document.querySelector('a.item-row p:last-child')), out = /** @type {number[]} */ ([]), t0 = performance.now();
      const tick = () => { out.push(parseFloat(getComputedStyle(p).textIndent)); if (performance.now() - t0 < 900) requestAnimationFrame(tick); else res(out); };
      tick();
    }));
    await d.mouse.move(640, 5);
    const tr = /** @type {number[]} */ (await sampling);
    await d.waitForTimeout(450);
    const end = await ind(), lo = Math.min(...tr), back = tr.slice(tr.indexOf(lo)).filter(x => x > lo + 1 && x < -1).length;
    assert(back >= 3 && tr.every((x, i) => i === 0 || Math.abs(x - tr[i - 1]) < Math.abs(lo) / 2) && end.x === 0 && !end.on && end.n === 0,
      `移開：滑回起點、不跳（最遠 ${lo}、回程中途 ${back} 幀）、動畫收乾淨（${JSON.stringify(end)}）`);
  }
  // 系統減少動態：跑不了馬燈 → 照常折行、整段看得到（觸控沒有 hover 也是這樣，webkit 模擬不了 hover: none）
  await d.emulateMedia({ reducedMotion: 'reduce' });
  assert(await d.$eval('a.item-row p:last-child', p => getComputedStyle(p).whiteSpace !== 'nowrap' && p.getBoundingClientRect().height > 1.5 * parseFloat(getComputedStyle(p).lineHeight)),
    '減少動態：清單列的標題／副標照常折行、整段看得到');
  await d.emulateMedia({ reducedMotion: 'no-preference' });

  await d.goto(base + '/pages/contact.html');
  await d.waitForSelector('#site-header .site-bar');
  // 聯絡、網站地圖沒分段，標題到下面的內容也同有分段的頁＝3xl（桌面 96px；user 2026-11-24：「這個 title 到下面的 padding 要跟其他頁面一樣」）
  assert(await d.$eval('main .page-body > h1', h => getComputedStyle(/** @type {Element} */ (h.nextElementSibling)).marginTop) === '96px', '聯絡：標題到內容 3xl（同其他頁）');
  // 姊妹系所（user 2026-11-21）＝連結清單：一行一個、整列可點，同網站地圖那種；hover＝蓋黑收直條、不出圓點（user 2026-11-23）
  await d.waitForFunction(() => document.querySelectorAll('.footer-links a').length === 3);   // 等後台（假資料）換進來
  await d.hover('.footer-links a >> nth=0');
  await d.waitForTimeout(1700);   // 蓋、收各 DUR.fast，收完再等 0.2 秒、直條切出來（user 2026-11-24）
  assert(await d.$$eval('.footer-links a', as => { const r = as.map(a => a.getBoundingClientRect()), body = as[0].closest('.page-body').getBoundingClientRect();
    // 只量字（最後一段文字節點）：直條是插在連結裡的 span，量整個連結會把直條也算進去
    const range = document.createRange(), txt = [...as[0].childNodes].filter(n => n.nodeType === 3 && (n.textContent || '').trim()).pop();
    range.selectNodeContents(txt || as[0]); const t = range.getBoundingClientRect(), c = as[0].querySelectorAll('.item-cover');
    // 直條在字尾後面隔一根直條寬（寬 0.4em），同選單（user 2026-11-24：「網站地圖的 stroke 位置，比照 menu 的」；同一天先做過貼在這一列的最右緣）；中文字尾扣掉燒在字體裡的 0.205em 字距
    const fs = parseFloat(getComputedStyle(as[0]).fontSize), tr = /[⺀-鿿豈-﫿︰-﹏＀-￯]$/.test((as[0].textContent || '').trim()) ? 0.205 * fs : 0;
    return getComputedStyle(as[0], '::after').opacity === '0' && c.length === 1 && Math.abs(c[0].getBoundingClientRect().left - (t.right - tr + 0.4 * fs)) < 1
      && as[1].querySelectorAll('.item-cover').length === 0 && r.every(x => Math.abs(x.right - body.right) < 1 && Math.abs(x.left - body.left) < 1)
      && r.every((x, i) => i === 0 || x.top >= r[i - 1].bottom); }), '聯絡頁姊妹系所：一行一個、hover 收成字尾一根直條、不出圓點');
  // 社群的 IG icon（沒有字）＝icon 當那一行：hover 收完一根直條在 icon 右邊、跟 icon 一樣高
  await d.hover('.footer-social a');
  await d.waitForTimeout(1700);
  assert(await d.$eval('.footer-social a', a => { const c = a.querySelector('.item-cover'), o = a.getBoundingClientRect(), q = c?.getBoundingClientRect();
    return !!q && q.left > o.right && Math.abs(q.height - o.height) < 0.5; }), '聯絡頁社群 IG icon：hover 收成 icon 右邊一根直條');

  // ── 網頁 icon ← 後台（site_icons，user 2026-11-24；js/modules/ui/site-assets.js）：後台有那個 key 的檔＝CSS 裡用到 website-icons/<key>.svg 的地方換成後台那張，
  // 沒有的照本地。play＝.icon-play 的 --icon；volume＝音量拉桿的 mask（不在 --icon 上，一樣換）；沒放檔的 key 不算
  {
    const s = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await watch(s);
    await s.route(/scaidcms\.usc\.edu\.tw\/items\/site_icons/, r => r.fulfill({ headers: CORS, json: { data: [{ key: 'play', file: 'p1' }, { key: 'volume', file: 'v1' }, { key: 'next', file: null }] } }));
    await s.goto(base + '/pages/about.html');
    await s.waitForSelector('#site-icons', { state: 'attached' });
    assert(await s.evaluate(() => {
      const v = (sel) => getComputedStyle(document.querySelector(sel)).getPropertyValue('--icon'), bars = getComputedStyle(document.querySelector('.media-vol-bars'), '::before');
      return v('.play-btn .icon').includes('/assets/p1') && v('.icon-next').includes('website-icons/next.svg') && /assets\/v1/.test(bars.maskImage || bars.webkitMaskImage);
    }), '網頁 icon：後台有的換成後台那張（play 的 --icon、音量拉桿的 mask），沒有的照本地（user 2026-11-24）');
    await s.close();
  }

  // 課程（user 2026-11-21 改）：排法同入學——一門課一個摺疊，外面＝課名＋必修／選修（在課名下面），點開＝課程說明；沒有詳細頁。
  // 年級照樣是 Section title（有段落導覽）、text-md（全站 Section title 都是 md，剛好同課名）；同年級必修在前、選修在後
  await d.goto(base + '/pages/curriculum.html');
  await d.waitForSelector('#site-header .site-bar');
  {
    const c = await d.evaluate(() => {
      const fs = (el) => getComputedStyle(el).fontSize, secs = [...document.querySelectorAll('main .page-section')];
      return {
        years: secs.map(s => s.querySelector('h2.section-title').textContent).join(), dots: document.querySelectorAll('.section-nav-dot').length,
        h1: fs(document.querySelector('main h1')), h2: fs(document.querySelector('main h2')), name: fs(document.querySelector('summary.item-row h3')),
        rows: secs.every(s => { const ss = [...s.querySelectorAll('.item-list > li > details > summary.item-row')], types = ss.map(x => x.querySelector('p')?.textContent);
          return ss.length > 0 && ss.every(x => x.children.length === 2 && x.children[0].tagName === 'H3' && x.children[1].tagName === 'P'
            && x.children[1].getBoundingClientRect().top >= x.children[0].getBoundingClientRect().bottom)
            && types.every(t => t === '必修' || t === '選修') && types.join('').replace(/^(必修)*(選修)*$/, '') === ''; }),
        links: document.querySelectorAll('main .link-list, main a[href*="curriculum-detail"]').length,
      };
    });
    assert(c.years === '一年級,二年級,三年級,四年級' && c.dots === 4 && c.h2 === c.name && parseFloat(c.h1) > parseFloat(c.h2) && c.rows && c.links === 0,
      `課程：年級 text-md（同課名）＋段落導覽；一門課一列＝課名、下面必修／選修，必修在前；不連詳細頁（${JSON.stringify(c)}）`);
    await d.click('summary >> nth=0');
    await d.waitForTimeout(700);
    assert(await d.evaluate(() => document.body.dataset.page) === 'curriculum' && await d.$$eval('details[open]', ds => ds.length) === 1
      && await d.$eval('details[open] .fold-body', b => b.children.length === 1 && b.children[0].tagName === 'P' && b.children[0].textContent.length > 200)
      && await css(d, 'details[open] .fold-body > p', 'fontSize') === await css(d, 'summary.item-row p', 'fontSize'), '課程：點開＝一段課程說明（不換頁）');
  }

  // 師資列表點進詳細頁：左上角返回鈕（左緣對齊導覽矩形、上緣＝內容第一行、捲動時 sticky 停住）、選單亮師資、返回回列表
  await d.goto(base + '/pages/faculty.html');
  await d.waitForSelector('#site-header .site-bar');
  // 後台接上（item-list-cms.js，假資料見 watch；user 2026-11-21）：副標一筆一行、空的不出、沒填就只有名字；名字 Medium；
  // 名字、副標之間都是 sm＝字那一塊的 gap（user 2026-11-24：「如果是 list 類別，就是像這樣的老師副標…gap 從 xs 改成 sm，且用 gap 來分」；原本名字到副標 xs、副標之間 0）；
  // 沒人的類別（行政管理）整段收掉、導覽跟著少一格；後台的字不當 HTML
  await d.waitForFunction(() => document.querySelectorAll('.item-list[data-cms] li').length === 3);
  {
    const fac = await d.$$eval('.item-list[data-cms] li', lis => lis.map(li => [li.querySelector('h3').textContent, li.querySelectorAll('p').length, li.querySelector('a').getAttribute('href')].join('|')));
    const gaps = await d.$eval('.item-list[data-cms] h3', h => { const top = (/** @type {Element} */ el) => el.getBoundingClientRect().top, p = /** @type {Element} */ (h.nextElementSibling);
      return { sm: parseFloat(getComputedStyle(document.documentElement).fontSize), gap: getComputedStyle(/** @type {Element} */ (h.parentElement)).rowGap,
        title: top(p) - h.getBoundingClientRect().bottom, subs: top(/** @type {Element} */ (p.nextElementSibling)) - p.getBoundingClientRect().bottom }; });
    assert(fac.join() === '後台老師一（示意）|2|faculty-detail.html?id=1,後台老師二（示意）|0|faculty-detail.html?id=2,<b>後台老師三</b>（示意）|0|faculty-detail.html?id=3'
      && (await d.$$eval('main h2', hs => hs.map(h => h.textContent))).join() === '專任教師,兼任教師' && await d.$$eval('.section-nav-dot', b => b.length) === 2
      && await css(d, '.item-row h3', 'fontWeight') === '500' && await css(d, '.item-row p', 'fontWeight') === '400'
      && gaps.gap === `${gaps.sm}px` && Math.abs(gaps.title - gaps.sm) < 0.5 && Math.abs(gaps.subs - gaps.sm) < 0.5,
      `師資接後台：副標一筆一行、沒有就不出、名字 Medium、名字／副標之間都是 sm（gap）、空的類別收掉（${fac.join()}；${JSON.stringify(gaps)}）`);
  }
  // 列表縮圖＝正方形、寬 1.5 欄（1.5 個欄寬＋半個 gutter，user 2026-11-18），文字接在一個 gutter 之後
  const thumbW = 1.5 * (1280 - 120 - 11 * 24) / 12 + 12;
  const itemTh = await rect(d, '.item-thumb'), itemTxt = await rect(d, '.item-row > :last-child');
  assert(Math.abs(itemTh.width - thumbW) < 1 && itemTh.height <= itemTh.width + 1 && Math.abs(itemTxt.left - (itemTh.left + itemTh.width + 24)) < 1,
    `列表縮圖框 1.5 欄（圖照原比例、高不超過框寬；user 2026-11-24）、文字隔一個 gutter（縮圖 ${itemTh.width}×${itemTh.height} vs ${thumbW}、文字 ${itemTxt.left}）`);
  // 師資列表（user 2026-11-18）：段落順序專任 → 兼任 → 行政管理（HTML 寫死；後台接上後的順序見上）；名字＝標題 text-md（21.6px）、副標 text-s（18.4px；user 2026-11-21）；
  // 清單列 hover（user 2026-11-22，PC；取代圓點）：標題、副標每行字先被一條字高的帶蓋住（左 → 右長出來），再一起往右收到字尾，
  // 帶收完、游標還在，再等 0.2 秒、還在才切出直條（進出場都是 clip），直條貼在列的最右緣（user 2026-11-24；寬 0.4em、高＝字高；帶不跨過去）；
  // hover 著才留、離開＝淡出（user 2026-11-24：「出場是 fade out」）、再 hover 重做；整列不變淡
  assert(/專任教師[\s\S]*兼任教師[\s\S]*行政管理/.test(fs.readFileSync(path.join(ROOT, 'pages/faculty.html'), 'utf8')), '師資段落順序（HTML）：專任 → 兼任 → 行政管理（user 2026-11-24 從業界導師改名）');
  assert(await css(d, '.item-row h3', 'fontSize') === '21.6px' && await css(d, '.item-row p', 'fontSize') === '18.4px', '師資：名字 21.6px、副標 18.4px');
  {
    // 每行字（標題、副標）的字尾與正中、字級；帶（.item-cover，跟行的順序一樣）畫出來的樣子
    const row = (i) => d.$eval(`a.item-row >> nth=${i}`, el => {
      const o = el.getBoundingClientRect(), range = document.createRange();
      // 字尾＝最後一個字本身的右緣：中文字扣掉右邊燒在字體裡的字距（0.205em，user 2026-11-23）
      const lines = [...el.querySelectorAll('h3, p')].map(l => { range.selectNodeContents(l); const t = range.getBoundingClientRect(), r = l.getBoundingClientRect(), fs = parseFloat(getComputedStyle(l).fontSize);
        const tr = /[⺀-鿿豈-﫿︰-﹏＀-￯]$/.test((l.textContent || '').trim()) ? 0.205 * fs : 0;
        // 筆畫的上下緣（canvas 量每個字離基線多遠；基線＝字框頂＋主字型的 ascent）：帶要蓋到這裡（中文字的頂、g、j、y 的腳）
        const cs = getComputedStyle(l), pen = /** @type {CanvasRenderingContext2D} */ (document.createElement('canvas').getContext('2d'));
        pen.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const base = t.top + pen.measureText('x').fontBoundingBoxAscent - o.top, ms = [...(l.textContent || '').replace(/\s/g, '')].map(ch => pen.measureText(ch));
        return { end: Math.min(r.left + t.width - tr, r.left + l.clientWidth) - o.left, cy: r.top + r.height / 2 - o.top, fs,
          inkTop: Math.min(...ms.map(m => base - m.actualBoundingBoxAscent)) - 1 / devicePixelRatio, inkBot: Math.max(...ms.map(m => base + m.actualBoundingBoxDescent)) + 1 / devicePixelRatio }; });   // 多一個實體像素＝反鋸齒的邊
      // 帶看得到的那段＝clip-path 切出來的（inset 上右下左）：l＝左邊切掉多少、v＝露出多寬
      const covers = [...el.querySelectorAll('.item-cover')].map(c => { const r = c.getBoundingClientRect(), n = (getComputedStyle(c).clipPath.match(/-?[\d.]+/g) || []).map(Number);
        return { x: r.left - o.left, w: r.width, h: r.height, cy: r.top + r.height / 2 - o.top, l: n.length === 4 ? n[3] : 0, v: n.length === 4 ? r.width - n[1] - n[3] : r.width, ph: c.dataset.phase || '', op: Number(getComputedStyle(c).opacity) }; });
      // 縮圖裡看得到的圖（user 2026-11-24：「stroke 的高度應該是看內容的高度，而不是 box 的高度」）：桌面的圖 contain 在框的正中＝照原比例縮、上下置中
      const t = el.querySelector('.item-thumb'), q = t?.getBoundingClientRect(), im = t?.querySelector('img'), ih = q && (im?.naturalWidth ? Math.min(q.height, q.width * im.naturalHeight / im.naturalWidth) : q.height);
      const th = q ? { top: q.top + (q.height - ih) / 2 - o.top, h: ih } : null;
      return { lines, covers, th, W: o.width, dot: getComputedStyle(el, '::after').display, rowO: getComputedStyle(el).opacity };
    });
    await d.mouse.move(640, 5);
    let r0 = await row(0);
    assert(r0.covers.length === 0 && r0.dot === 'none' && r0.lines.length >= 2, `列表列：平常沒有直條、PC 不出圓點（${JSON.stringify(r0)}）`);
    // hover＝整列、圖片上也算（user 2026-11-23：「hover 整個 list 會觸發 hover 的效果，而不是將文字跟圖片分開」；11-22 只看文字那一欄）
    await d.hover('a.item-row >> nth=0 >> .item-thumb');
    await d.waitForTimeout(150);
    assert((await row(0)).covers.length > 0, '列表列：游標在縮圖上也蓋黑收直條（hover 整列）');
    await d.mouse.move(640, 5); await d.waitForTimeout(1300);   // 走掉＝帶照樣跑完、不出直條
    assert((await row(0)).covers.length === 0, '列表列：縮圖上 hover 一下就走＝帶跑完、不出直條');
    const t0 = Date.now();
    await d.hover('a.item-row >> nth=0');
    await d.waitForTimeout(100);
    r0 = await row(0);
    // 帶＝字高、頂對在字高的頂；有 g、j、y 的行往下多蓋到字腳（user 2026-11-24：「g、j、y 這樣的也覆蓋到，現在他們的腳會露出來」）＝高 1～1.3 個字高
    // 中文字的頂比字高高的也往上蓋（同一天：「這個遮罩，在中文字體上也會有之前設定的 gyj 類似的問題」）＝帶的上下緣＝字高與筆畫取外側
    assert(r0.covers.length === r0.lines.length && r0.covers.every((c, k) => { const L = r0.lines[k];
      return c.ph !== 'stroke' && c.l === 0 && c.v > 0.5 && c.v < L.end - c.x - 0.5 && c.h < L.fs * 1.5
        && Math.abs(c.cy - c.h / 2 - Math.min(L.cy - L.fs / 2, L.inkTop)) < 1 && Math.abs(c.cy + c.h / 2 - Math.max(L.cy + L.fs / 2, L.inkBot)) < 1; }),
      `列表列 hover：每行字一條字高的帶、往上往下蓋到筆畫（中文字的頂、字腳）、從左邊長出來、還沒蓋到字尾；直條還沒出來（途中 ${JSON.stringify(r0.covers)}、字 ${JSON.stringify(r0.lines)}）`);
    // 收（user 2026-11-23：「嚴格來說全部都是到文字 box 的右邊緣」）：帶的框＝剛好那一行字、往右收到沒有（不跨過字尾後面的間隔）
    const out = await d.waitForFunction(() => {
      const el = /** @type {Element} */ (document.querySelector('a.item-row')), o = el.getBoundingClientRect(), cs = [...el.querySelectorAll('.item-cover')];
      if (!cs.length || !cs.every(c => c.dataset.phase === 'out')) return null;
      return cs.map(c => { const r = c.getBoundingClientRect(), k = c.getAnimations()[0]?.effect?.getKeyframes() || [], n = (String(k[k.length - 1]?.clipPath).match(/-?[\d.]+/g) || []).map(Number);
        return { x: r.left - o.left, w: r.width, cy: r.top + r.height / 2 - o.top, endV: n.length === 4 ? r.width - n[1] - n[3] : null }; });
    }, null, { polling: 'raf', timeout: 3000 }).then(h => h.jsonValue()).catch(() => []);
    assert(out.length === r0.lines.length && r0.lines.every(l => out.some(c => Math.abs(c.x + c.w - l.end) < 1 && Math.abs(c.endV) < 0.5 && Math.abs(c.cy - l.cy) < 1)),
      `列表列收：帶只走到字尾、收到沒有（${JSON.stringify(out)}）`);
    // 帶收完：先空著等 0.2 秒（沒有直條），游標還在才在自己那一格從左到右切出直條——clip、不淡（user 2026-11-24：「stroke 的進場是用 clip 不是 fade」）
    const gap = await d.waitForFunction(() => /** @type {Element} */ (document.querySelector('a.item-row')).querySelectorAll('.item-cover').length === 0, null, { polling: 'raf', timeout: 2000 }).then(() => true, () => false);
    const fi = await d.waitForFunction(() => { const cs = [.../** @type {Element} */ (document.querySelector('a.item-row')).querySelectorAll('.item-cover[data-phase="stroke"]')];
      // 起點露出多寬／終點露出多寬（clip-path inset 上右下左）、有沒有動到透明度
      return cs.length ? cs.map(c => { const k = c.getAnimations()[0]?.effect?.getKeyframes(), w = c.getBoundingClientRect().width, v = (/** @type {any} */ f) => { const n = (String(f?.clipPath).match(/-?[\d.]+/g) || []).map(Number); if (!n.length) return null; const [t, r = t, b = t, l = r] = n; return Math.round((w - r - l) * 10) / 10; };   // inset() 簡寫（WebKit：inset(0px)）補成上右下左
        return k ? [v(k[0]), v(k[k.length - 1]), Math.round(w * 10) / 10, k.some(f => 'opacity' in f)] : null; }) : null; },
      null, { polling: 'raf', timeout: 3000 }).then(h => h.jsonValue()).catch(() => []);
    const waited = Date.now() - t0;
    assert(gap && waited >= 750 && fi.length === 1 && fi.every(f => f && f[0] === 0 && Math.abs(f[1] - f[2]) < 0.2 && !f[3]),
      `列表列：帶收完、游標還在＝空著等 0.2 秒才從左到右切出直條（user 2026-11-24：選單也是；hover 後 ${waited}ms 出現、應 ≥ 800；中間空著 ${gap}；[起點露出, 終點露出, 寬, 有沒有淡] ${JSON.stringify(fi)}）`);
    await d.waitForTimeout(600);
    r0 = await row(0);
    // 一列一根（user 2026-11-24：「出現的時候拿 title 的寬度，然後是 box 的高度（看哪個元素比較高…）」）：寬＝標題字級 × 0.4、貼在列的最右緣；
    // 高＝文字塊（標題第一行上緣～最後一行下緣，字高）和縮圖裡看得到的圖比較高的那一塊，上下也對齊那一塊
    { const tt = Math.min(...r0.lines.map(l => l.cy - l.fs / 2)), tb = Math.max(...r0.lines.map(l => l.cy + l.fs / 2)), c = r0.covers[0], sw = r0.lines[0].fs * 0.4;
      const want = r0.th && r0.th.h > tb - tt ? r0.th : { top: tt, h: tb - tt };
      assert(r0.rowO === '1' && r0.covers.length === 1 && Math.abs(c.w - sw) < 0.2 && Math.abs(c.x + c.w - r0.W) < 1 && c.x > Math.max(...r0.lines.map(l => l.end))
        && Math.abs(c.h - want.h) < 1 && Math.abs(c.cy - c.h / 2 - want.top) < 1,
        `列表列 hover：一列一根直條、標題的寬、比較高那塊（${r0.th && r0.th.h > tb - tt ? '縮圖' : '文字'}）的高、貼在列的最右緣、不壓到字（${JSON.stringify(r0)}）`); }
    // 游標不動＝直條一直在；離開＝從左往右切出去（user 2026-11-24：「stroke 離開的時候，改成 clip 的出去，不是用 fade」）、不淡，切完才拿掉；再 hover＝重新蓋黑收直條
    await d.waitForTimeout(300);
    assert((await row(0)).covers.length === 1, '列表列：游標不動＝直條一直在');
    await d.mouse.move(640, 5);
    // [起點整根露出, 終點左邊切掉多少, 直條寬, 有沒有動到透明度]
    const fo = await d.$eval('a.item-row', el => [...el.querySelectorAll('.item-cover')].map(c => { const k = c.getAnimations()[0]?.effect?.getKeyframes(), n = (/** @type {any} */ f) => { const q = (String(f?.clipPath).match(/-?[\d.]+/g) || []).map(Number), [t = 0, r = t, b = t, l = r] = q; return [t, r, b, l]; };   // inset() 簡寫補成上右下左
      if (!k) return null; const a = n(k[0]), z = n(k[k.length - 1]); return [a.every(x => x === 0), Math.round((z[3] ?? 0) * 10) / 10, Math.round(c.getBoundingClientRect().width * 10) / 10, k.some(f => 'opacity' in f)]; }));
    assert(fo.length === 1 && fo.every(f => f && f[0] && Math.abs(f[1] - f[2]) < 0.2 && !f[3]), `列表列：游標離開＝直條從左往右切出去（clip、不淡；${JSON.stringify(fo)}）`);
    await d.waitForTimeout(600);
    assert((await row(0)).covers.length === 0, '列表列：切完才拿掉');
    await d.hover('a.item-row >> nth=0'); await d.waitForTimeout(100);
    assert((await row(0)).covers.filter(c => c.ph !== 'stroke').length === r0.lines.length, '列表列：再 hover＝重新蓋黑收直條');
    // 一 hover 到帶就整段做完（user 2026-11-22）：跑到一半離開＝帶照樣收完，但不出直條（user 2026-11-22：「如果我沒有停在 item 上的話，它這個動畫就不需要有那個 stroke」）
    await d.mouse.move(640, 5);
    // 帶收的終點露出多寬（clip-path；0＝收到沒有）
    const ends = () => d.$eval('a.item-row', el => [...el.querySelectorAll('.item-cover:not([data-phase="stroke"])')].map(c => { const k = c.getAnimations()[0]?.effect.getKeyframes(), f = k?.[k.length - 1], n = (String(f?.clipPath).match(/-?[\d.]+/g) || []).map(Number);
      return n.length === 4 ? Math.round((c.getBoundingClientRect().width - n[1] - n[3]) * 10) / 10 : 'still'; }));
    assert((await row(0)).covers.length === r0.lines.length, '列表列：跑到一半離開＝帶照樣跑完');
    await d.waitForFunction(() => [...document.querySelector('a.item-row').querySelectorAll('.item-cover:not([data-phase="stroke"])')].every(c => c.dataset.phase === 'out'), null, { timeout: 3000 }).catch(() => {});
    const e = await ends();
    assert(e.length >= r0.lines.length && e.every(x => x === 0), `列表列：游標已經走了＝帶照樣收到沒有（收的終點露出 ${JSON.stringify(e)} px）`);
    await d.waitForTimeout(1300);   // 收完（DUR.fast）＋本來要等的 0.2 秒＋淡入的時間，都不該冒出直條
    assert((await row(0)).covers.length === 0 && (await row(1)).covers.length === 0, '列表列：跑到一半離開＝帶收完就沒了、不出直條；沒碰過的列沒有');
  }
  // 標題放不下＝折行、不跑馬燈（user 2026-11-23）；hover＝一行一條帶（user 2026-11-24）；直條一列一根、貼在列的最右緣、高＝文字塊和縮圖框比較高的那一塊（user 2026-11-24）
  {
    const was = await d.$eval('a.item-row >> nth=1 >> h3', h => { const t = h.textContent; h.textContent = '很長的標題'.repeat(12); return t; });
    await d.hover('a.item-row >> nth=1');
    await d.waitForTimeout(1700);   // 蓋 → 收 → 等 0.2 秒 → 直條淡完（user 2026-11-24）
    const t = await d.$eval('a.item-row >> nth=1', el => {
      const h = /** @type {Element} */ (el.querySelector('h3')), o = el.getBoundingClientRect(), range = document.createRange(), fs = parseFloat(getComputedStyle(h).fontSize);
      range.selectNodeContents(h);
      const rs = [...range.getClientRects()].filter(q => q.width), a = rs[0], z = rs[rs.length - 1];
      return { lines: rs.length, ws: getComputedStyle(h).whiteSpace, subs: [...el.querySelectorAll('p:not(.sr-only)')].filter(p => p.textContent?.trim()).length, fs, W: o.width,
        top: a.top + a.height / 2 - fs / 2 - o.top, h: z.top + z.height / 2 - a.top - a.height / 2 + fs, end: Math.max(...rs.map(q => q.right)) - 0.205 * fs - o.left,   // 每行都是中文字結尾：扣掉最後一個字右邊的字距
        bars: [...el.querySelectorAll('.item-cover')].map(c => { const r = c.getBoundingClientRect(); return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height }; }),
        // 文字塊的下緣＝最後一個副標那一行的字（字高對在行的正中）；縮圖框
        bot: (() => { const ps = [...el.querySelectorAll('p:not(.sr-only)')].filter(p => p.textContent?.trim()), p = ps[ps.length - 1]; if (!p) return null; const r = p.getBoundingClientRect(); return r.top + r.height / 2 + parseFloat(getComputedStyle(p).fontSize) / 2 - o.top; })(),
        th: (() => { const t = el.querySelector('.item-thumb'), q = t?.getBoundingClientRect(), im = t?.querySelector('img'); if (!q) return null;   // 看得到的圖（同上 row()）
          const h = im?.naturalWidth ? Math.min(q.height, q.width * im.naturalHeight / im.naturalWidth) : q.height; return { top: q.top + (q.height - h) / 2 - o.top, h }; })() };
    });
    const tb = t.bars[0], text = { top: t.top, h: (t.bot ?? t.top + t.h) - t.top }, want = t.th && t.th.h > text.h ? t.th : text;
    assert(t.lines >= 2 && t.ws !== 'nowrap' && t.bars.length === 1 && !!tb && Math.abs(tb.h - want.h) < 1 && Math.abs(tb.y - want.top) < 1 && Math.abs(tb.w - t.fs * 0.4) < 0.2 && Math.abs(tb.x + tb.w - t.W) < 1 && tb.x > t.end,
      `標題太長＝折行、不跑馬燈；直條一列一根、比較高那塊的高、貼在列的最右緣（${JSON.stringify(t)}）`);
    await d.mouse.move(640, 5);
    await d.$eval('a.item-row >> nth=1 >> h3', (h, t) => { h.textContent = t; }, was);
  }
  await d.click('a.item-row >> nth=0');
  await d.waitForFunction(() => document.body.dataset.page === 'faculty-detail');
  assert(new URL(d.url()).pathname === '/pages/faculty-detail.html' && await d.$$eval('.section-nav-dot', b => b.length) === 0 && await d.$('.section-nav') === null && await css(d, '.page-figure', 'display') === 'block', '詳細頁：網址、沒有段落導覽（user 2026-11-18）、右圖');
  assert(await d.$eval('.site-menu a[href="faculty.html"]', a => a.classList.contains('active')), '詳細頁：選單亮師資');
  // 段落導覽「排不進」（整串上移到目前那格看得到）沒有頁面段數夠多可以測（詳細頁不放導覽了，user 2026-11-18）；page.css --nav-shift 的算式見註解
  const bk = async () => (await rect(d, '.back-btn .icon'));
  let bkr = await bk();
  const ph = await rect(d, '.profile-photo');
  assert(Math.abs(ph.width - thumbW) < 1 && Math.abs(ph.height - ph.width) < 1, `詳細頁照片跟列表縮圖同寬 1.5 欄（${ph.width}×${ph.height}）`);
  // 頁頭＝照片在上、下面名字＋副標（user 2026-11-21：上下排）：名字 h1 同列表的名字（text-md、Medium）、副標一行一個；
  // 學歷／經歷…＝同關於的 Subsection title（h3 text-s、Medium）＋下面一筆一筆：年份一行、說明在下一行（內文 Regular），筆與筆之間 sm＝ul 的 gap
  // （user 2026-11-24：「gap 從 xs 改成 sm，且用 gap 來分，不要用 mt」；11-23 是標題到第一筆的距離 xs）；頁頭的名字、副標之間也是 sm；
  // 一組一塊 .subsection、組與組之間＝.subsections 的 gap xl＝同動態的清單列（user 2026-11-24：「所有的 list 的 gap 都調整跟 activities 的一樣」；量上一組最後一筆 → 下一組標題）
  const prof = await d.evaluate(() => {
    const q = (/** @type {string} */ s) => /** @type {Element} */ (document.querySelector(s)), cs = (/** @type {string} */ s) => getComputedStyle(q(s));
    const li = [...document.querySelectorAll('.page-section li')].slice(0, 2), [y, t] = [...li[0].children].map(e => e.getBoundingClientRect());
    const bs = [...document.querySelectorAll('.page-section > .subsections > .subsection')];
    return { blocks: bs.length, blockGap: /** @type {Element} */ (bs[1].firstElementChild).getBoundingClientRect().top - /** @type {Element} */ (bs[0].lastElementChild).getBoundingClientRect().bottom,
      h1: cs('h1').fontSize, h1w: cs('h1').fontWeight, sub: document.querySelectorAll('.item-row p').length,
      photoGap: q('h1').getBoundingClientRect().top - q('.profile-photo').getBoundingClientRect().bottom, md: 1.5 * parseFloat(getComputedStyle(document.documentElement).fontSize),
      sm: parseFloat(getComputedStyle(document.documentElement).fontSize), ulGap: cs('.subsection > h3 + ul').rowGap,
      hdr: (ks => ks.slice(1).map((e, i) => Math.round(e.getBoundingClientRect().top - ks[i].getBoundingClientRect().bottom)).join())([...document.querySelectorAll('.page-body > .item-row > :is(h1, p)')]),
      h3: cs('.page-section h3').fontSize, h3w: cs('.page-section h3').fontWeight, li: cs('.page-section li p').fontSize, liw: cs('.page-section li p').fontWeight,
      year: y.top < t.top && Math.abs(t.top - y.bottom) < 0.5 && Math.abs(t.left - y.left) < 0.5, gap: li[1].getBoundingClientRect().top - li[0].getBoundingClientRect().bottom, title: li[0].getBoundingClientRect().top - q('.page-section h3').getBoundingClientRect().bottom };
  });
  assert(prof.h1 === '21.6px' && prof.h1w === '500' && prof.sub === 2 && Math.abs(prof.photoGap - prof.md) < 0.5 && prof.h3 === '18.4px' && prof.h3w === '500' && prof.li === '18.4px' && prof.liw === '400' && prof.year && prof.ulGap === `${prof.sm}px` && Math.abs(prof.gap - prof.sm) < 0.5 && Math.abs(prof.title - prof.sm) < 0.5 && prof.hdr === `${prof.sm},${prof.sm}`
    && prof.blocks === 2 && Math.abs(prof.blockGap - 48) < 0.5   // 示意只留學歷、經歷兩個清單（user 2026-11-24：其餘刪掉、之後在後台自己加）
    && await d.$$eval('.page-section h3', hs => hs.map(h => h.textContent).join() === '學歷,經歷' && hs.every(h => !h.hasAttribute('data-label'))),   // 標題是內容、不是介面文字
    `師資詳細頁：照片在上、名字副標同列表、清單（學歷、經歷）＝Subsection title＋年份一行說明一行、清單之間 xl、標題不標 data-label（${JSON.stringify(prof)}）`);
  const menuL = (await rect(d, '.menu-btn .bar-rect')).left;   // 詳細頁沒有導覽矩形（user 2026-11-18）→ 對齊線拿 menu 鈕矩形左緣（導覽矩形本來就對齊它）
  assert(Math.abs(bkr.left - menuL) < 1 && Math.abs(bkr.top - ph.top) < 1, `返回鈕左上角：對齊 menu 鈕矩形、照片上緣（${bkr.left},${bkr.top} vs ${menuL},${ph.top}）`);
  await d.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }));
  assert(await d.evaluate(() => scrollY) > 0 && Math.abs((await bk()).top - bkr.top) < 1, '返回鈕 sticky：捲動後還在左上角（真的有捲）');
  await d.click('.back-btn');
  await d.waitForFunction(() => document.body.dataset.page === 'faculty');
  assert(new URL(d.url()).pathname === '/pages/faculty.html', '返回鈕回師資列表');

  // 摺疊（原生 <details>：常見問題、榮譽、動態、入學；user 2026-11-18）：沒有原生箭頭；PC 不出圓點（user 2026-11-22：手風琴也改蓋黑收直條，下面）。
  // fold(i)＝第 i 個 details 整塊的高、open
  const fold = (i) => d.$eval(`details >> nth=${i}`, el => ({ box: el.getBoundingClientRect().height, open: el.open, dot: getComputedStyle(el, '::after').display }));
  await d.goto(base + '/pages/qa.html');
  await d.waitForSelector('#site-header .site-bar');
  // 排法同課程（user 2026-11-23）：分類一段、一題一列（清單列的摺疊）；問題＝標題 h3（md）、答案＝展開的 .fold-body（s）
  assert(await css(d, 'main h2', 'fontSize') === '21.6px' && await css(d, '.item-list > li > details > summary.item-row > h3', 'fontSize') === '21.6px' && await css(d, 'details > .fold-body > p', 'fontSize') === '18.4px',
    'qa：分類標題 21.6px（Section title md）、問題＝清單列標題 21.6px、答案 18.4px（同課程）');
  // 展開內容跟那一列隔 sm（16px）＝內容自己的 padding-top（user 2026-11-24：先 xs，看課程頁又說「這個內文的 pt 改成 sm」；手風琴共用）
  assert(await css(d, 'details > .fold-body', 'paddingTop') === '16px', `摺疊：展開內容的上內距 sm（${await css(d, 'details > .fold-body', 'paddingTop')}）`);
  // 手風琴的清單（一列＝一個 details）列距 lg（32px；user 2026-11-24：「這個 accordion 之間的 gap 應該是 lg」）；同一天點進內頁／外連的清單也改 lg＝每一種清單都一樣（規章那段有量）
  assert(await css(d, 'main .item-list', 'rowGap') === '32px', `qa：手風琴之間 lg（${await css(d, 'main .item-list', 'rowGap')}）`);
  let f = await fold(0);
  // 原生箭頭＝summary 是 list-item 才有（WebKit 另外藏 ::-webkit-details-marker，getComputedStyle 讀不到它）；清單列的 summary 是 flex（字那一塊的 gap，user 2026-11-24）
  assert(await css(d, 'summary', 'display') !== 'list-item' && f.dot === 'none', `qa：沒有原生箭頭、PC 不出圓點（${JSON.stringify(f)}）`);
  // 手風琴也蓋黑收直條（user 2026-11-22）：問題（清單列的標題）折成好幾行（窄欄）＝一行一條帶（user 2026-11-24）、直條一根跟整塊一樣高，
  // 停在最寬那行的字尾後面隔一根直條寬；離開直接拿掉
  {
    await d.$eval('details', el => { el.style.width = '7em'; });
    const q = await rect(d, 'summary');
    await d.mouse.move(q.left + 10, q.top + 10);
    await d.waitForTimeout(100);
    const n = await d.$eval('summary', el => el.querySelectorAll('.item-cover:not([data-phase="stroke"])').length);   // 帶
    await d.waitForTimeout(1600);   // 蓋、收各 DUR.fast，收完再等 0.2 秒、直條切出來（user 2026-11-24）
    const st = await d.$eval('summary', el => {
      const o = el.getBoundingClientRect(), h = /** @type {Element} */ (el.querySelector('h3')), cs = getComputedStyle(h), lh = parseFloat(cs.lineHeight), fs = parseFloat(cs.fontSize), range = document.createRange();
      range.selectNodeContents(h);
      const rs = [...range.getClientRects()].filter(r => r.width > 0), hr = h.getBoundingClientRect();
      const tr = /[⺀-鿿豈-﫿︰-﹏＀-￯]$/.test((h.textContent || '').trim()) ? 0.205 * fs : 0;   // 中文字結尾：扣掉右邊的字距（user 2026-11-23）
      const vis = [...el.querySelectorAll('.item-cover')].map(c => c.getBoundingClientRect()).filter(r => r.width > 0.5).map(r => ({ x: r.left - o.left, w: r.width, h: r.height }));
      return { lines: Math.round(hr.height / lh), vis, end: Math.max(...rs.map(r => r.right)) - tr - o.left, fs, lh, W: o.width };
    });
    const v = st.vis[0], sw = st.fs * 0.4;
    assert(st.lines >= 2 && n === st.lines && st.vis.length === 1 && Math.abs(v.w - sw) < 0.2 && v.h > st.lh && Math.abs(v.x + v.w - st.W) < 1 && v.x > st.end,
      `qa：問題折行＝一行一條帶（user 2026-11-24：「改成一行一個遮罩」）、直條一根跟整塊一樣高、貼在這一列的最右緣（帶 ${n} 條；${JSON.stringify(st)}）`);
    await d.mouse.move(640, 5); await d.waitForTimeout(600);
    assert(await d.$eval('summary', el => el.querySelectorAll('.item-cover').length) === 0, 'qa：游標離開＝直條切出去、切完拿掉（user 2026-11-24）');
    await d.$eval('details', el => { el.style.width = ''; });
  }
  f = await fold(0);
  // 展開／收起都有動畫（accordion.js 把 details 的高度補間，user 2026-11-18）：點下去逐幀記「整塊的高、open」
  const foldTrack = (i) => d.evaluate(k => new Promise(res => {
    const el = /** @type {HTMLDetailsElement} */ (document.querySelectorAll('details')[k]), out = [];
    /** @type {HTMLElement} */ (el.querySelector('summary')).click();
    const t0 = performance.now();
    const tick = () => { out.push([Math.round(el.getBoundingClientRect().height * 10) / 10, el.open]); if (performance.now() - t0 < 750) requestAnimationFrame(tick); else res(out); };
    requestAnimationFrame(tick);
  }), i);
  const mid = (tr, lo, hi) => tr.filter(([h]) => h > lo + 2 && h < hi - 2).length;   // 落在起點與終點之間的幀數
  const closedH = f.box;
  let tr = await foldTrack(0);
  f = await fold(0);
  const f1 = await fold(1);
  assert(f.open && f.box > 60 && !f1.open && Math.abs(f1.box - closedH) < 0.5, `qa：打開 → 整塊長高、別題不動（${JSON.stringify(f)}）`);
  assert(mid(tr, closedH, f.box) >= 5 && tr.every(([h], k) => k === 0 || h >= tr[k - 1][0] - 0.2), `qa：展開有動畫（高度一路長上去，中途 ${mid(tr, closedH, f.box)} 幀）`);
  const openH = f.box;
  tr = await foldTrack(0);
  f = await fold(0);
  assert(!f.open && Math.abs(f.box - closedH) < 0.5, `qa：關起來 → 回到一列的高（${JSON.stringify(f)}）`);
  assert(mid(tr, closedH, openH) >= 5 && tr.every(([h], k) => k === 0 || h <= tr[k - 1][0] + 0.2) && tr.filter(([h]) => h > closedH + 2).every(([, open]) => open),
    `qa：收起有動畫（高度一路縮、縮完才拿掉 open；中途 ${mid(tr, closedH, openH)} 幀）`);
  // 動到一半再點＝從目前的高度掉頭，不會卡住
  await d.click('summary >> nth=0');
  await d.waitForTimeout(150);
  await d.click('summary >> nth=0');
  await d.waitForTimeout(700);
  f = await fold(0);
  assert(!f.open && Math.abs(f.box - closedH) < 0.5 && await d.$eval('details', el => !el.classList.contains('is-closing') && !el.style.overflow), `qa：展開到一半再點 → 收回去、狀態乾淨（${JSON.stringify(f)}）`);
  // 一次只開一個（user 2026-11-21）：開第二題 → 第一題跟著收（一起補間）、點的那一列留在原地；
  // 直條（user 2026-11-22：手風琴打開時 stroke 要留在畫面上）：開著的那題游標移開還在，被一起收的那題拿掉
  await d.click('summary >> nth=0');
  await d.waitForTimeout(1300);   // 蓋、收，再等 0.5 秒才出直條（user 2026-11-24）
  {
    const strokes = () => d.$$eval('summary', ss => ss.slice(0, 2).map(x => x.querySelectorAll('.item-cover').length).join());
    await d.mouse.move(640, 5);
    assert(await strokes() === '1,0', `qa：打開的那題游標移開，直條還在（${await strokes()}）`);
    const y0 = (await rect(d, 'summary >> nth=1')).top;
    await d.click('summary >> nth=1');
    await d.waitForTimeout(1300);
    const st = await d.$$eval('details', ds => ds.slice(0, 2).map(x => x.open)), y1 = (await rect(d, 'summary >> nth=1')).top, sy = await d.evaluate(() => scrollY);
    assert(st.join() === 'false,true' && await d.$$eval('details[open]', x => x.length) === 1 && (sy === 0 || Math.abs(y1 - y0) < 1.5), `qa：一次只開一個（${st}、點的那列 ${y0} → ${y1}、scrollY ${sy}）`);
    await d.mouse.move(640, 5);
    assert(await strokes() === '0,1', `qa：開第二題 → 第一題跟著收、直條拿掉；第二題移開直條還在（${await strokes()}）`);
    await d.click('summary >> nth=1');
    await d.waitForTimeout(700);
  }
  // 展開／收起內容跟著淡入／淡出（user 2026-11-21）：中途半透明、跑完全實且沒有殘留的動畫
  {
    const op = () => d.$eval('details > :not(summary)', el => ({ o: parseFloat(getComputedStyle(el).opacity), n: el.getAnimations().length }));
    await d.click('summary >> nth=0'); await d.waitForTimeout(150);
    const a1 = await op(); await d.waitForTimeout(600);
    const a2 = await op();
    await d.click('summary >> nth=0'); await d.waitForTimeout(150);
    const b1 = await op(); await d.waitForTimeout(600);
    assert(a1.o > 0 && a1.o < 1 && a2.o === 1 && a2.n === 0 && b1.o > 0 && b1.o < 1 && !(await fold(0)).open && (await op()).n === 0,
      `qa：內容展開淡入、收起淡出（展開中 ${a1.o} → ${a2.o}、收起中 ${b1.o}）`);
  }

  // 動態（user 2026-11-18）：每則是摺疊，收著＝縮圖＋標題＋副標（同師資那一列，md；副標一筆一行、可以沒有——user 2026-11-24 照 SCCD，原本一行「分類」）、外面不寫時間；
  // 展開＝時間／地點＋相簿（對齊文字那一欄）；點相簿的圖 → 放大 dialog 放那一張，再點一下關掉
  await d.goto(base + '/pages/activities.html');
  await d.waitForSelector('#site-header .site-bar');
  {
    const th = await rect(d, 'summary .item-thumb');
    assert(Math.abs(th.width - thumbW) < 1 && await css(d, 'summary h3', 'fontSize') === '21.6px' && await css(d, 'summary p', 'fontSize') === '18.4px'
      && !/\d{4}\.\d\d/.test(await d.textContent('summary')) && !(await d.isVisible('.fold-body'))
      && (await d.$$eval('summary.item-row', rows => rows.map(r => r.querySelectorAll('p').length).join())) === '1,1,2,1,0,1',   // 示意：副標一行／兩行／沒有
      '動態：收著＝縮圖 1.5 欄＋標題（md）＋副標（s，一筆一行、可以沒有）、看不到時間');
    // 動態沒有段落導覽（左邊的 anchor 方塊）、不分年份（user 2026-11-21 拿掉年份標題）；沒導覽的頁最後一段不撐高（撐了頁尾會多一截空白）
    assert(await d.$('.section-nav') === null && (await d.$$eval('main h2', hs => hs.map(h => h.textContent))).length === 0
      && await d.$eval('.page-section:last-child', el => Math.abs(el.getBoundingClientRect().height - el.firstElementChild.getBoundingClientRect().height) < 40), '動態：沒有段落導覽、沒有年份標題、最後一段不撐高');
    // 動態（摺疊的清單列）PC 也不出圓點、改直條（user 2026-11-22）：hover 時收成直條、離開就拿掉；打開的那則直條留著
    const struck = (i) => d.$eval(`summary.item-row >> nth=${i}`, el => el.querySelectorAll('.item-cover').length > 0);
    assert(await css(d, 'details', 'display', '::after') === 'none' && !(await struck(0)), '動態：PC 不出圓點、平常沒有直條');
    await d.hover('summary.item-row >> nth=0'); await d.waitForTimeout(1700);   // 蓋、收，再等 0.5 秒才出直條（user 2026-11-24）
    assert(await struck(0), '動態：hover 收成直條');
    await d.click('summary >> nth=1');   // 第二則：有地點、6 張相簿
    // 展開補間時只切上下（accordion.js）：左右跟展開完一樣（user 2026-11-24：相簿當時伸出欄外的那段補間完才冒出來＝「另外渲染一個比較寬的 box」），
    // 下緣多留 1.5rem（24）＝相簿兩側的模糊往下暈出去的那段也不被切（同一天）＝clip-path，不是 overflow
    const ov = await d.$eval('details >> nth=1', el => { const s = getComputedStyle(el); return `${s.overflowX},${s.clipPath}`; });
    assert(/^visible,inset\(0(px)? -\d.* -24px/.test(ov), `動態：展開補間中只切上下、下緣多留 24（${ov}）`);
    await d.waitForTimeout(1300);   // 這則：蓋、收，再等 0.5 秒才出直條（user 2026-11-24）
    assert(!(await struck(0)) && await struck(1), '動態：游標移到下一則＝上一則的直條拿掉、這則收成直條');
    f = await fold(1);
    const meta = await d.textContent('details[open] .fold-meta');
    // 時間、地點一行一個＝清單：之間 sm＝gap（user 2026-11-24：「這個應該是 list 的 gap，比照老師的副標那個去調整」）
    const metaGap = await d.$eval('details[open] .fold-meta', m => { const [a, b] = [...m.children].map(p => p.getBoundingClientRect()); return `${getComputedStyle(m).rowGap}:${Math.round(b.top - a.bottom)}`; });
    assert(f.open && /2026\.10\.20[\s\S]*示意動畫工作室/.test(meta) && !/時間|地點/.test(meta) && metaGap === '16px:16'
      && await d.$$eval('details[open] .album-strip button', b => b.length) === 6, `動態：展開＝時間、地點直接寫（沒標籤）、之間 sm＋相簿（${JSON.stringify(f)}、${metaGap}）`);
    await d.mouse.move(1000, 700); await d.waitForTimeout(500);
    assert(await struck(1) && (await fold(1)).open, '動態：打開的那則游標離開直條還在');
    // 清單列 hover＝圖片上浮一塊流動的中空板（user 2026-11-22，PC；thumb-board.js）：hover 整列（游標在文字那邊也算）圖片就出；
    // 畫布疊在縮圖上、fade 進來（停在毛玻璃那一點糊）；離開 fade 掉。
    // 背景在這裡換成空的（watch）＝沒有格線可切，只量畫布的位置與進出場；隔著板子的樣子靠截圖看（跨網域的圖讀不回像素）
    if (DECOR) {
      const board = () => d.$eval('summary.item-row >> nth=2', row => {
        const c = row.querySelector('.thumb-board'), t = row.querySelector('.item-thumb');
        if (!c || !t) return null;
        const a = c.getBoundingClientRect(), b = t.getBoundingClientRect(), st = getComputedStyle(c);
        return { on: c.classList.contains('is-on'), o: +st.opacity, f: st.filter, fit: ['left', 'top', 'width', 'height'].every(k => Math.abs(a[k] - b[k]) < 0.5) };
      });
      assert(await board() === null, '清單圖片：平常沒有中空板');
      await d.hover('summary.item-row >> nth=2 >> h3'); await d.waitForTimeout(150);   // 游標在標題上、不在圖上
      const mid = await board();
      assert(!!mid && mid.on && mid.o > 0 && mid.o < 1 && /^blur\(/.test(mid.f) && mid.fit, `清單列 hover（游標在標題上）：圖片上疊一塊中空板、fade 進來（途中 ${JSON.stringify(mid)}）`);
      await d.waitForTimeout(500);
      const on = await board();
      assert(on?.o === 1 && on.f === 'blur(1.5px)', `清單圖片 hover：淡完＝毛玻璃那一點糊（同背景筆跡 1.5px；${JSON.stringify(on)}）`);
      await d.mouse.move(1000, 700); await d.waitForTimeout(500);
      const off = await board();
      assert(!!off && !off.on && off.o === 0, `清單圖片：離開＝中空板淡掉（${JSON.stringify(off)}）`);
    } else {
      await d.hover('summary.item-row >> nth=2 >> h3'); await d.waitForTimeout(300);
      assert(await d.$('.thumb-board') === null, '清單圖片 hover 的中空板先關掉（user 2026-11-23）');
      await d.mouse.move(1000, 700); await d.waitForTimeout(500);
    }
    const fb = await rect(d, 'details[open] .fold-body'), txt = await rect(d, 'details[open] summary .item-thumb');   // 展開內容從縮圖左緣排起（user 2026-11-21）
    const shots = await d.$$eval('details[open] .album-strip button', bs => bs.map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), Math.round(r.top)]; }));
    // 相簿一排（user 2026-11-18）：同高 9rem＝144（user 2026-11-19 從 12rem 縮）、照 3:2 原比例、全部同一列；
    // 放不下＝還捲得過去的那一邊糊（user 2026-11-24：框的前後 blur、第一張／最後一張不糊、去掉 chevron）：一開始＝右邊糊、左邊（第一張）不糊
    assert(Math.abs(fb.left - txt.left) < 1 && shots.every(([w, h, top]) => Math.abs(h - 144) < 1 && Math.abs(w / h - 1.5) < 0.02 && top === shots[0][2])
      && await d.$eval('details[open] .album', a => a.classList.contains('more-end') && !a.classList.contains('more-start') && !a.querySelector('.album-chev')),
      `動態：展開內容從縮圖左緣排起、相簿一排同高 144 照比例、放不下＝右邊糊、第一張不糊、沒有 chevron（${JSON.stringify(shots)}）`);
    // 相簿圖都寫原圖寬高（user 2026-11-19）：載入前就有寬 → 打開當下就排好、chevron 當下決定（沒寫＝寬 0、載完才跳出 chevron）
    assert(await d.$$eval('.album img', is => is.length > 0 && is.every(i => +i.getAttribute('width') > 0 && +i.getAttribute('height') > 0)), '動態：相簿圖都有 width／height');
    // 相簿的圖跟上面那塊（時間、地點）隔 sm（user 2026-11-24：「gallery 到上面的 gap 改成 sm」；展開內容其他的塊照舊 md）
    // 圖 ↔ 字再補半個行距（user 2026-11-24：「是不是圖到文字之間要加上字的 line height，視覺上才會對齊」）：字 → 相簿、PC 有縮圖的摘要 → 展開的第一行字，都是 sm＋半個行距
    const lead = await d.$eval('details[open] .fold-meta p', p => { const cs = getComputedStyle(p); return (parseFloat(cs.lineHeight) - parseFloat(cs.fontSize)) / 2; });
    const gapAbove = await d.$eval('details[open] .album', a => /** @type {Element} */ (a.querySelector('.album-strip')).getBoundingClientRect().top - /** @type {Element} */ (a.previousElementSibling).getBoundingClientRect().bottom);
    const padTop = parseFloat(await css(d, 'details[open] > .fold-body', 'paddingTop'));
    assert(lead > 2 && Math.abs(gapAbove - 16 - lead) < 0.5 && Math.abs(padTop - 16 - lead) < 0.5, `動態：相簿跟上面那塊、展開內容跟縮圖都隔 sm＋半個行距（半個行距 ${lead}、相簿 ${gapAbove}、上內距 ${padTop}）`);
    // 糊法同關於的輪播、但框不伸出內文欄（user 2026-11-24：「左右還是比較大了點…要 blur 的那個邊緣看起來還是有對到寬度」）：相簿＝展開內容的寬（.fold-body 扣掉內距＝右邊讓給直條的那段，同上面的時間、地點）、
    // 圖列吃滿相簿（沒有 chevron 夾著）、第一張對齊欄的左緣；前後各一塊 5 層的漸進模糊，在框裡、寬＝完整露出的那幾張以外；
    // 相簿的框比圖列上下各高 1.5rem（24）、模糊跟框一樣高＝往圖的上下暈出去（user 2026-11-24：「左右的 fade，是會延伸到上下的區塊」，同作品頁）
    // （Windows 的 WebKit 不畫 backdrop-filter → 只看結構和開關）
    const [ab, cs, f0, bl] = await Promise.all(['.album', '.album-strip', '.album-strip > button', '.album-blur-end'].map(sel => rect(d, `details[open] ${sel}`)));
    const cutEnd = await d.$eval('details[open] .album', a => { const box = a.getBoundingClientRect(), whole = [...a.querySelectorAll('.album-strip > button')].map(c => c.getBoundingClientRect()).filter(r => r.left >= box.left - 0.5 && r.right <= box.right + 0.5); return box.right - whole[whole.length - 1].right; });
    const fc = await d.$eval('details[open] .fold-body', el => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return { left: r.left + parseFloat(s.paddingLeft), width: r.width - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) }; });
    assert(Math.abs(ab.left - fc.left) < 1 && Math.abs(ab.width - fc.width) < 1 && Math.abs(cs.left - ab.left) < 1 && Math.abs(cs.width - ab.width) < 1
      && Math.abs(f0.left - fc.left) < 1 && Math.abs(bl.top - ab.top) < 1 && Math.abs(bl.height - ab.height) < 1
      && Math.abs(cs.top - ab.top - 24) < 1 && Math.abs(ab.height - cs.height - 48) < 1
      && Math.abs(bl.left + bl.width - (ab.left + ab.width)) < 1 && Math.abs(bl.width - cutEnd) < 1   // 糊的那段＝完整露出的那幾張以外（user 2026-11-24，同輪播、作品頁）
      && await d.$eval('details[open] .album', a => [...a.querySelectorAll(':scope > .album-blur')].map(b => b.querySelectorAll(':scope > i').length).join() === '5,5'),
      `動態：相簿＝展開內容的寬、第一張對齊欄、前後各一塊 5 層漸進模糊在框裡、只糊被框切到的那張、框上下各比圖列高 24（相簿${Math.round(ab.left)}+${Math.round(ab.width)} vs 內容 ${Math.round(fc.left)}+${Math.round(fc.width)}、第一張 ${Math.round(f0.left)}、模糊 ${Math.round(bl.width)}×${Math.round(bl.height)} vs ${Math.round(cutEnd)}）`);
    // 捲到底＝最後一張不糊、左邊（還捲得回去）糊；馬上糊、馬上收、不補間（user 2026-11-24：「blur 的添加可以再及時一點」）＝捲完沒多久模糊層就全實、右邊的全收
    await d.$eval('details[open] .album-strip', s => s.scrollTo({ left: s.scrollWidth, behavior: 'instant' })); await d.waitForTimeout(80);
    const edge = await d.$eval('details[open] .album', a => `${a.classList.contains('more-start')},${a.classList.contains('more-end')},`
      + ['start', 'end'].map(k => getComputedStyle(/** @type {Element} */ (a.querySelector(`.album-blur-${k} > i`))).opacity).join());
    assert(edge === 'true,false,1,0', `動態：相簿捲到底＝左邊馬上糊、最後一張馬上不糊（more-start、more-end、兩邊模糊層：${edge}）`);
    await d.$eval('details[open] .album-strip', s => s.scrollTo({ left: 0, behavior: 'instant' })); await d.waitForTimeout(300);
    assert(await css(d, 'details[open] .album-strip > button', 'cursor') === 'pointer', '動態：相簿的圖 hover＝手指（user 2026-11-23；原本放大鏡）');
    await d.click('details[open] .album-strip button >> nth=2');
    await d.waitForFunction(() => /** @type {HTMLDialogElement} */ (document.getElementById('figure-dialog')).open);
    await d.waitForTimeout(500);
    const big = await rect(d, '#figure-dialog img');
    assert(await d.$eval('#figure-dialog .figure-dialog-body', b => b.children.length === 1 && /** @type {HTMLImageElement} */ (b.firstElementChild).src.includes('scaid-news-2-3'))
      && Math.abs(big.width / big.height - 1.5) < 0.02 && big.height > 500 && Math.abs(big.left + big.width / 2 - 640) < 2 && Math.abs(big.top - 112) < 1 && Math.abs(big.top + big.height - (800 - 112)) < 1
      && !(await d.evaluate(() => document.documentElement.dataset.theme)),
      `動態：點相簿的圖 → 放大那一張、照原比例、左右置中、頂對齊 title 那條線、下面留一樣多（user 2026-11-23）；圖片不關燈（${big.width}×${big.height} top ${big.top}）`);
    // 上一個／下一個：多於一張才出；右鍵／右鈕下一張、左鈕上一張；到頭 disabled（user 2026-11-18）
    const cur = () => d.$eval('#figure-dialog .figure-dialog-body img', i => /** @type {HTMLImageElement} */ (i).src.replace(/.*scaid-news-/, '').replace(/\/.*/, ''));
    assert(await d.$eval('#figure-dialog', x => x.classList.contains('has-nav')) && await css(d, '.figure-prev', 'display') !== 'none' && await d.$eval('.figure-prev', b => !/** @type {HTMLButtonElement} */ (b).disabled), '放大：相簿多張 → 出 ‹ ›');
    await d.keyboard.press('ArrowRight'); assert(await cur() === '2-4', `放大：右鍵 → 下一張（${await cur()}）`);
    await d.click('.figure-prev'); await d.click('.figure-prev'); assert(await cur() === '2-2', `放大：左鈕兩下 → 上兩張（${await cur()}）`);
    for (let i = 0; i < 9; i++) await d.keyboard.press('ArrowRight');
    assert(await cur() === '2-6' && await d.$eval('.figure-next', b => /** @type {HTMLButtonElement} */ (b).disabled) && await d.$eval('#figure-dialog', x => x.open), `放大：到最後一張停住、› disabled（${await cur()}）`);
    await d.click('.figure-close');
    await d.waitForFunction(() => !(/** @type {HTMLDialogElement} */ (document.getElementById('figure-dialog')).open));
    assert(await d.$eval('details >> nth=1', el => el.open), '動態：X 關掉、那一則還開著');
    // 打開的那則點封面縮圖＝放大封面、封面是那一組的第一張（後面接相簿，可左右切；user 2026-11-19）、那一則不收；收著的那則點封面＝照常展開
    await d.click('details[open] summary .item-thumb');
    await d.waitForFunction(() => /** @type {HTMLDialogElement} */ (document.getElementById('figure-dialog')).open);
    assert(await cur() === '2-cover' && await d.$eval('#figure-dialog', x => x.classList.contains('has-nav')) && await d.$eval('.figure-prev', b => /** @type {HTMLButtonElement} */ (b).disabled)
      && await d.$eval('details >> nth=1', el => el.open), `動態：打開那則點封面 → 放大封面、是第一張（‹ disabled）、那則不收（${await cur()}）`);
    await d.keyboard.press('ArrowRight'); assert(await cur() === '2-1', `放大封面：右鍵 → 相簿第一張（${await cur()}）`);
    await d.mouse.click(640, 400);
    await d.waitForFunction(() => !(/** @type {HTMLDialogElement} */ (document.getElementById('figure-dialog')).open));
    await d.click('details >> nth=2 >> summary .item-thumb'); await d.waitForTimeout(700);
    assert(await d.$eval('details >> nth=2', el => el.open) && !(await d.$eval('#figure-dialog', x => x.open)), '動態：收著那則點封面＝照常展開、不放大');
    // 相簿裡的影片（user 2026-11-24：「影片要有，因爲要做影片渲染」，照 SCCD）：示意的第三則有一支。一格＝16:9（YouTube 的 4:3 縮圖 cover 裁掉黑邊）、同相簿的高、
    // 正中一顆 play（大小＝menu 鈕那顆骨牌的高）；點了＝放大 dialog 開播放器、關燈；封面排在它前面＝同一組可以切回封面
    const vb = await d.$eval('details[open] .album-video', b => { const r = b.getBoundingClientRect(), i = /** @type {Element} */ (b.querySelector('img')).getBoundingClientRect(), ic = /** @type {Element} */ (b.querySelector('.icon-play')).getBoundingClientRect();
      return { w: r.width, h: r.height, fill: Math.abs(i.width - r.width) < 0.5 && Math.abs(i.height - r.height) < 0.5, fit: getComputedStyle(/** @type {Element} */ (b.querySelector('img'))).objectFit,
        dx: ic.left + ic.width / 2 - (r.left + r.width / 2), dy: ic.top + ic.height / 2 - (r.top + r.height / 2), icon: ic.height, name: b.textContent?.trim() }; });
    const blockH = await d.$eval('.menu-btn .bar-rect', el => el.getBoundingClientRect().height);
    assert(Math.abs(vb.h - 144) < 1 && Math.abs(vb.w / vb.h - 16 / 9) < 0.02 && vb.fill && vb.fit === 'cover' && Math.abs(vb.dx) < 1 && Math.abs(vb.dy) < 1 && Math.abs(vb.icon - blockH) < 1 && vb.name === '播放影片',
      `動態：相簿裡的影片＝16:9 的一格、縮圖鋪滿（cover）、正中一顆 play（同 menu 鈕的高 ${blockH}）、報讀名稱（${JSON.stringify(vb)}）`);
    await d.click('details[open] .album-video');
    await d.waitForFunction(() => /** @type {HTMLDialogElement} */ (document.getElementById('figure-dialog')).open);
    await d.waitForTimeout(900);
    const vd = await d.$eval('#figure-dialog', dlg => { const f = /** @type {any} */ (dlg.querySelector('.figure-dialog-body')?.firstElementChild);
      return `${f?.tagName}:${/embed\/aqz-KE-bpKQ\?autoplay=1/.test(f?.src || '')}:${dlg.classList.contains('has-video')}:${dlg.classList.contains('has-nav')}:${document.documentElement.dataset.theme}`; });
    await d.click('.figure-prev'); await d.waitForTimeout(200);
    const vp = await d.$eval('#figure-dialog', dlg => `${dlg.querySelector('.figure-dialog-body')?.firstElementChild?.tagName}:${dlg.classList.contains('has-video')}:${document.documentElement.dataset.theme || 'light'}`);
    assert(vd === 'IFRAME:true:true:true:dark' && vp === 'IMG:false:light', `動態：點相簿裡的影片＝放大 dialog 開 YouTube 播放器、關燈；‹ 切回封面＝圖片、開燈（${vd}｜${vp}）`);
    await d.click('.figure-close');
    await d.waitForFunction(() => !(/** @type {HTMLDialogElement} */ (document.getElementById('figure-dialog')).open));
  }

  // 報導（user 2026-11-21）：入學那種列、不展開；點了＝放大 dialog 看那則的截圖（只有一張、不出左右、沒換頁）
  await d.goto(base + '/pages/press.html');
  await d.waitForSelector('#site-header .site-bar');
  await d.click('a.item-row[data-zoom] >> nth=0');
  await d.waitForFunction(() => getComputedStyle(document.querySelector('#figure-dialog')).opacity === '1');
  assert(await d.$eval('.figure-dialog-body > img', i => i.src.includes('scaid-press-1') && i.alt === '報導標題一') && await css(d, '.figure-prev', 'display') === 'none'
    && new URL(d.url()).pathname === '/pages/press.html' && await d.$('details') === null, '報導：點列＝放大看截圖、不換頁、不展開');
  await d.keyboard.press('Escape');
  await d.waitForFunction(() => !(/** @type {HTMLDialogElement} */ (document.querySelector('#figure-dialog')).open));

  // 規章（user 2026-11-21）：入學那種列（標題＋副標、沒縮圖）、不展開；整列外連、另開新視窗
  await d.goto(base + '/pages/regulations.html');
  await d.waitForSelector('#site-header .site-bar');
  {
    const rows = await d.$$eval('main .item-list > li', lis => lis.map(li => { const a = /** @type {Element} */ (li.firstElementChild);
      return [a.tagName, a.classList.contains('item-row'), a.getAttribute('target'), /^https?:\/\//.test(a.getAttribute('href') || ''), a.querySelectorAll(':scope > h3').length, a.querySelectorAll(':scope > p').length].join('|'); }));
    assert(rows.length === 5 && rows.every(r => r === 'A|true|_blank|true|1|1') && await d.$('main details') === null && await d.$('main .item-thumb') === null,
      `規章：一條一列＝標題＋副標、沒縮圖、不展開、整列外連另開新視窗（${[...new Set(rows)].join(' / ')}）`);
    // 列距同課程（user 2026-11-24：「這個規章應該跟課程一樣」）：每一種清單都 lg（32px）、標題到清單照舊 xl（48px）——原本只有手風琴的清單 lg、外連的還是 xl
    const gap = await d.$eval('main .item-list', ul => { const s = getComputedStyle(ul), [a, b] = [...ul.children].map(li => li.getBoundingClientRect()); return `${s.rowGap}|${s.marginTop}|${Math.round(b.top - a.bottom)}`; });
    assert(gap === '32px|48px|32', `規章：列距 lg、標題到清單 xl（同課程；${gap}）`);
  }

  // 清單列＝積木（user 2026-11-21）：師資、合作企業、動態、榮譽、報導、入學、規章全是 .item-row，標題 h3 一律 text-md（21.6）、副標 p 一律 text-s（18.4），同入學；
  // 每一頁都有列、右邊都讓出圓點的位置
  for (const pg of ['faculty', 'partners', 'activities', 'records', 'press', 'admission', 'regulations']) {
    await d.goto(base + `/pages/${pg}.html`);
    await d.waitForSelector('#site-header .site-bar');
    const st = await d.$$eval('.item-row', rows => rows.map(r => {
      const h = r.querySelector('h3'), ps = [...r.querySelectorAll('p')], cs = (/** @type {Element} */ e) => getComputedStyle(e);
      const textCol = r.querySelector(':scope > .item-thumb') ? /** @type {Element} */ (r.lastElementChild) : r;
      return [h && cs(h).fontSize, ps.every(p => cs(p).fontSize === '18.4px'), Math.abs(parseFloat(cs(textCol).paddingRight) - 16) < 0.5].join('|');   // --row-pad 桌面 16px（(gutter＋0.5rem)÷2，user 2026-11-24）
    }));
    assert(st.length >= 3 && st.every(s => s === '21.6px|true|true'), `${pg}：清單列標題 21.6、副標 18.4、右邊讓出直條的位置 16px（${[...new Set(st)].join(' / ')}）`);
  }
  // 榮譽的圖＝國旗：4:3、寬 2em（text-s 的 2em＝36.8）、彩色不加框、上下對在文字的正中；打開那則點國旗＝照常收合（不是封面、不放大）
  await d.goto(base + '/pages/records.html');
  await d.waitForSelector('#site-header .site-bar');
  {
    const fl = await rect(d, '.record .item-thumb'), tx = await rect(d, '.record summary > div');
    assert(Math.abs(fl.width - 36.8) < 0.5 && Math.abs(fl.height - 27.6) < 0.5 && Math.abs(fl.cy - tx.cy) < 1 && await css(d, '.record .item-thumb', 'backgroundColor') === 'rgba(0, 0, 0, 0)',
      `榮譽：國旗 4:3、寬 2em、對在文字正中（${fl.width}×${fl.height}、cy ${fl.cy} vs ${tx.cy}）`);
    await d.click('.record summary >> nth=0');
    await d.waitForTimeout(700);
    const meta = await rect(d, '.record[open] .fold-meta');
    assert(Math.abs(meta.left - tx.left) < 1, `榮譽：展開的主辦方／獎別對齊獎項那一欄（${meta.left} vs ${tx.left}）`);
    await d.click('.record[open] .item-thumb');
    await d.waitForTimeout(700);
    assert(!(await d.$eval('.record', x => x.open)) && !(await d.$eval('#figure-dialog', x => x.open)), '榮譽：打開那則點國旗＝收合、不放大');
  }

  // 入學（user 2026-11-18）：一則一則的動態（同動態頁那種列、沒有別種摺疊）；外面只有標題＋時間（沒有分類）；
  // 第一則是完整示意：點開的順序＝說明文字 → 相簿 → 附件（粗體、另開新視窗的連結），沒有地點那一行
  await d.goto(base + '/pages/admission.html');
  await d.waitForSelector('#site-header .site-bar');
  {
    assert(await d.$$eval('summary', ss => ss.length >= 5 && ss.every(x => !x.querySelector('.item-thumb') && x.querySelectorAll('h3').length === 1
      && x.querySelectorAll('p').length === 1 && /^\d{4}\.\d\d/.test(x.querySelector('p').textContent)))
      && await css(d, 'summary p', 'fontSize') === '18.4px' && await d.$('.section-nav') === null, '入學：每一列＝標題＋時間（沒有縮圖、沒有分類）、沒有段落導覽');
    await d.click('summary >> nth=0');
    await d.waitForTimeout(700);
    const body = await d.$eval('details[open] .fold-body', b => ({ order: [...b.children].map(c => c.tagName === 'P' ? '說明' : c.className.split(' ')[0]).join(' → '), desc: b.querySelector(':scope > p')?.textContent.length,
      files: [...b.querySelectorAll('.link-list a')].map(a => a.target + a.getAttribute('href').slice(-4) + getComputedStyle(a).fontWeight).join(), shots: b.querySelectorAll('.album-strip button').length }));
    assert(body.order === '說明 → album → link-list' && body.desc > 20 && body.files === '_blank.pdf700,_blank.pdf700' && body.shots === 3 && await css(d, 'details[open] .fold-body > p', 'fontSize') === '18.4px'
      && Math.abs((await rect(d, 'details[open] .fold-body')).left - (await rect(d, 'details[open] summary')).left) < 1,
      `入學：完整示意那一則＝說明 → 相簿 → 附件（粗體）、展開內容靠左（沒有縮圖那一欄）（${JSON.stringify(body)}）`);
  }

  // ── logo 的動態（user 2026-11-22；logo.js）：自己開一頁、不掛 data-logo-still，演真的 ──
  {
    const g = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await watch(g, { logo: true });
    await g.goto(base + '/index.html');
    await g.waitForSelector('#site-header .site-logo');
    const st = () => g.evaluate(() => { const l = /** @type {HTMLElement} */ (document.querySelector('.site-logo')), o = s => getComputedStyle(document.querySelector(s)).opacity;
      return { mode: l.dataset.mode, busy: l.hasAttribute('data-busy'), intro: document.documentElement.classList.contains('is-intro'), page: document.body.dataset.page, main: o('#page-content'), bar: o('.site-bar'), text: o('.logo-text'), stroke: o('.logo-bars i'), h: l.getBoundingClientRect().height / l.getBoundingClientRect().width }; });
    const rest = mode => g.waitForFunction(m => { const l = /** @type {HTMLElement} */ (document.querySelector('.site-logo')); return l.dataset.mode === m && !l.hasAttribute('data-busy'); }, mode, { timeout: 9000 });
    let s = await st();
    assert(s.intro && s.busy && s.main === '0' && s.bar === '0', `進場：logo 在演的時候其他東西先藏著（${JSON.stringify(s)}）`);
    await g.waitForFunction(() => !document.documentElement.classList.contains('is-intro'), null, { timeout: 9000 });
    s = await st();
    assert(s.mode === 'text' && !s.busy && s.text === '1' && s.stroke === '0' && Math.abs(s.h - LOGO_VB_H / LOGO_VB_W) < 0.002, `首頁進場演到文字版才把其他東西放出來，框＝文字版三行高（${JSON.stringify(s)}）`);
    await g.waitForTimeout(600);
    s = await st();
    assert(s.main === '1' && s.bar === '1', `進場演完：內容與底列 fade in（${JSON.stringify(s)}）`);
    // 首頁一直在文字和 stroke 之間來回；stroke 版＝框縮回一行高。兩版都在畫面正中（user 2026-11-23；原本左上角不動、以文字版的高置中）
    const cy0 = (await rect(g, '.site-logo')).cy;
    await g.mouse.move(640, 700);
    await rest('stroke');
    s = await st();
    const cy1 = (await rect(g, '.site-logo')).cy;
    assert(s.text === '0' && s.stroke === '1' && Math.abs(s.h - STROKE_VB_H / LOGO_VB_W) < 0.002 && Math.abs(cy0 - 400) < 0.5 && Math.abs(cy1 - 400) < 0.5,
      `首頁來回：變成 stroke 版、框一行高，兩版都在畫面正中（文字版中線 ${cy0}、stroke 版 ${cy1}；${JSON.stringify(s)}）`);
    // 正好是文字版的時候去內頁：先變回沒有名字的 stroke 版（系名的 17 根）才換頁（user 2026-11-22）；
    // 這個樣子整個上移、右圖先不出場，移完才換成 object 名字的長度、右圖同時出場（user 2026-11-23）
    await rest('text');
    await g.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<a id="go-about" href="pages/about.html" style="position:fixed;left:0;top:0;z-index:999">x</a>'));
    await g.click('#go-about');
    await g.waitForTimeout(150);
    s = await st();
    assert(s.page === 'index' && s.busy, `文字版的時候點連結：先留在首頁、logo 變回 stroke（${JSON.stringify(s)}）`);
    await g.waitForFunction(() => document.body.dataset.page === 'about', null, { timeout: 9000 });
    const lm = () => g.evaluate(() => { const l = /** @type {HTMLElement} */ (document.querySelector('.site-logo'));
      return { kind: l.dataset.kind, mode: l.dataset.mode, busy: l.hasAttribute('data-busy'), moving: document.documentElement.classList.contains('logo-moving'), on: /** @type {Element} */ (document.querySelector('.object-canvas')).classList.contains('is-on'), top: l.getBoundingClientRect().top }; });
    await g.waitForTimeout(200);
    const mv = await lm();
    assert(mv.moving && mv.kind === 'dept' && mv.mode === 'stroke' && !mv.busy && !mv.on && mv.top > 20, `上移的途中：沒有名字的 stroke 版（系名的長度）、沒在變，右圖還沒出場（${JSON.stringify(mv)}）`);
    await g.waitForFunction(() => !document.documentElement.classList.contains('logo-moving'), null, { timeout: 5000 });
    const mv2 = await lm();
    assert(Math.abs(mv2.top) < 3 && mv2.on, `移完：logo 已經在頂，右圖這時才出場（${JSON.stringify(mv2)}）`);
    assert(await g.waitForFunction(() => { const l = /** @type {HTMLElement} */ (document.querySelector('.site-logo')); return l.dataset.kind === 'obj' && l.dataset.mode === 'stroke' && !l.hasAttribute('data-busy'); }, null, { timeout: 12000 }).then(() => true, () => false),
      '內頁：logo 的 stroke 換成右圖 object 的名字長度');
    // 背後的毛玻璃左右跟著 logo 實際的寬（user 2026-11-23；原本照整個 logo 框，logo 短的時候糊到旁邊）：兩個骨牌外緣往外擴一樣多
    const lb = await g.evaluate(() => { const r = (/** @type {string} */ s) => [...document.querySelectorAll(s)].map(e => e.getBoundingClientRect()), [a, b] = r('.logo-block'), [t] = r('.top-blur'), [f] = r('.site-logo');
      return { l: a.left - t.left, r: t.right - b.right, blocks: [a.left, b.right], frame: [f.left, f.right] }; });
    assert(lb.blocks[0] - lb.frame[0] > 1 && lb.l > 0 && Math.abs(lb.l - lb.r) < 1, `內頁：logo 比框短時，背後的毛玻璃只罩兩個骨牌外緣往外一段（${JSON.stringify(lb)}）`);
    // 回首頁：繼續來回
    await g.click('.site-logo');
    await g.waitForFunction(() => document.body.dataset.page === 'index', null, { timeout: 9000 });
    assert(await rest('text').then(() => true, () => false), '回首頁：logo 繼續在 stroke 和文字之間來回');
    // 直接開內頁：進場演到 stroke 版，演的時候內容先藏著
    await g.goto(base + '/pages/faculty.html');
    await g.waitForSelector('#site-header .site-logo');
    s = await st();
    assert(s.intro && s.main === '0', `直接開內頁：進場時內容先藏著（${JSON.stringify(s)}）`);
    await g.waitForFunction(() => !document.documentElement.classList.contains('is-intro'), null, { timeout: 9000 });
    s = await st();
    assert(s.mode === 'stroke', `直接開內頁：進場演到 stroke 版（${JSON.stringify(s)}）`);
    await g.close();
  }

  // ── 右圖的 object（user 2026-11-22；object.js）：殼上的畫布，演真的 ──
  {
    const lg = (p, kind, mode) => p.waitForFunction(([k, m]) => { const l = /** @type {HTMLElement} */ (document.querySelector('.site-logo')); return l.dataset.kind === k && l.dataset.mode === m && !l.hasAttribute('data-busy'); }, [kind, mode], { timeout: 12000 }).then(() => true, () => false);
    const name = p => p.$eval('.object-canvas', c => c.getAttribute('aria-label'));
    // 桌面：疊在當頁右圖那一格上；logo 的 stroke 跟著它的名字
    const o = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await watch(o, { logo: true });
    await o.goto(base + '/pages/about.html');
    assert(await lg(o, 'obj', 'stroke'), 'object：內頁的 logo 換成它的名字長度');
    await o.waitForTimeout(1800);   // 第一個 object 的 stroke 進場完
    const at = await o.evaluate(() => { const c = /** @type {HTMLCanvasElement} */ (document.querySelector('.object-canvas')), a = c.getBoundingClientRect(), b = document.querySelector('#page-content .page-figure > *').getBoundingClientRect();
      const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let ink = 0; for (let i = 3; i < px.length; i += 4) if (px[i]) ink++;
      return { off: Math.abs(a.left - b.left) + Math.abs(a.top - b.top) + Math.abs(a.width - b.width), on: c.classList.contains('is-on'), ink, slot: getComputedStyle(document.querySelector('#page-content .page-figure > *')).visibility }; });
    assert(at.off < 1 && at.on && at.ink > 500 && at.slot === 'hidden' && !!(await name(o)), `object：畫布疊在右圖那一格上、有畫東西、那一格本身看不到（${JSON.stringify(at)}）`);
    // 游標移到它上面：logo 露出名字，而且不換下一個；移開變回 stroke
    const c0 = await rect(o, '.object-canvas'), n0 = await name(o);
    await o.mouse.move(c0.left + c0.width / 2, c0.cy);
    assert(await lg(o, 'obj', 'text'), 'object：游標移上去，logo 露出名字');
    await o.waitForTimeout(4500);
    assert(await name(o) === n0 && (await o.textContent('.logo-word')).length > 0, 'object：游標在上面的時候不換下一個');
    // 平常不跟游標（user 2026-11-22）：在圖上移動不轉，按住拖才轉
    { const pic = () => o.$eval('.object-canvas', c => /** @type {HTMLCanvasElement} */ (c).toDataURL()), was = await pic();
      await o.mouse.move(c0.left + c0.width / 2 + 60, c0.cy - 40); await o.waitForTimeout(500);
      const kept = await pic() === was;
      await o.mouse.down(); await o.mouse.move(c0.left + c0.width / 2 + 160, c0.cy + 20, { steps: 5 }); await o.waitForTimeout(500); await o.mouse.up();
      assert(kept && await pic() !== was, 'object：游標在圖上移動不轉，按住拖才轉'); }
    await o.mouse.move(300, 500);
    assert(await lg(o, 'obj', 'stroke'), 'object：游標移開，logo 變回 stroke');
    // 換頁不重來；首頁不顯示、logo 回系名
    const n1 = await name(o);
    await o.evaluate(() => /** @type {HTMLElement} */ (document.querySelector('a[href$="faculty.html"]')).click());
    await o.waitForFunction(() => document.body.dataset.page === 'faculty');
    assert(await name(o) === n1, 'object：換頁不重來（還是同一個）');
    await o.click('.site-logo');
    await o.waitForFunction(() => document.body.dataset.page === 'index');
    assert(await lg(o, 'dept', 'text') && !(await o.$eval('.object-canvas', c => c.classList.contains('is-on'))), 'object：首頁不顯示，logo 回到系名');
    await o.close();
    // 手機：平常不出、也不載模型；右緣的鈕點了才搬進 dialog，點它露出名字，關掉搬回殼上
    const p = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await watch(p, { logo: true });
    let bins = 0; p.on('request', r => { if (/\/objects\/.+\.bin/.test(r.url())) bins++; });
    await p.goto(base + '/pages/about.html');
    assert(await lg(p, 'dept', 'stroke'), '手機：object 沒打開，logo 是系名的 stroke');
    await p.waitForTimeout(1500);
    assert(bins === 0, `手機：object 沒打開就不載模型（抓了 ${bins} 個）`);
    await p.waitForFunction(() => getComputedStyle(document.querySelector('.figure-btn')).opacity === '1');
    await p.tap('.figure-btn');
    assert(await lg(p, 'obj', 'stroke') && await p.$eval('.object-canvas', c => !!c.closest('#figure-dialog')), '手機：點右緣的鈕，object 搬進 dialog、logo 換成它的名字長度');
    await p.tap('.object-canvas');
    assert(await lg(p, 'obj', 'text') && await p.$eval('#figure-dialog', d => d.open), '手機：點 object 露出名字，dialog 不關');
    await p.tap('.figure-obj-close');   // object 沒有 ‹ X ›，關閉＝右下角那顆骨牌（user 2026-11-24）
    assert(await lg(p, 'dept', 'stroke') && await p.$eval('.object-canvas', c => c.parentElement.classList.contains('site-chrome')), '手機：點右下角的骨牌關掉後畫布搬回殼上、logo 回系名');
    await p.close();
  }

  // ── 背景（user 2026-11-21）：畫布（跟著游標的炭筆筆跡）＜ 中空板 ＜ 內文。自己開一頁：滑鼠亂動不影響其他段的 hover ──
  // 門檻都從 bg.js 的 INK 算：調手感的數字不用跟著改測試
  if (DECOR) {
    const b = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await watch(b);
    await b.unroute(BG_JS);   // 這段要真的背景（watch 換成空的，理由見那裡）
    await b.goto(base + '/index.html');
    await b.waitForSelector('#site-header .site-bar');
    const INK = await b.evaluate(() => import('/js/modules/ui/bg.js').then(m => ({ ...m.INK })));
    const layers = await b.evaluate(() => { const bg = document.body.firstElementChild, s = getComputedStyle(bg); return [bg.className, s.position, s.zIndex, s.pointerEvents, ...[...bg.children].map(e => e.className)].join(); });
    assert(layers === 'bg,fixed,-1,none,bg-ink,bg-board' && await css(b, 'body', 'isolation') === 'isolate' && await css(b, '.bg-board', 'opacity') < 1,
      `背景：畫布 ＜ 中空板包成一組，在內容後面、不吃指標；板子本身畫得淡（${layers}）`);
    // 中空板的格有大有小、平均＝logo 的骨牌寬（user 2026-11-21），開頁時抽（每次排都不一樣）：直接叫 bg.js 排格線的那支、排很寬來量
    const cols = await b.evaluate(() => import('/js/modules/ui/bg.js').then(m => {
      // 平均格寬 pitch＝骨牌寬（--board-pitch）× INK.cell（user 2026-11-22：格寬再大一點）
      const unit = parseFloat(getComputedStyle(document.querySelector('.bg-board')).getPropertyValue('--board-pitch')), pitch = unit * m.INK.cell, xs = () => m.grid(pitch * 400, pitch).map(l => l.x), one = xs(), gaps = one.slice(1).map((x, i) => x - one[i]);
      return { unit, pitch, block: document.querySelector('.bar-rect').getBoundingClientRect().width, min: Math.min(...gaps), max: Math.max(...gaps), avg: gaps.reduce((a, g) => a + g, 0) / gaps.length, same: one.join() === xs().join() }; }));
    // 最寬的格：格線會游移（user 2026-11-22），兩邊各往外最多 drift 成
    // 每一格在 lo～hi 倍之間等比地抽（user 2026-11-22：胖的更胖、窄的更窄）→ 平均＝(hi−lo)/ln(hi/lo) 倍
    const [lo, hi] = INK.vary, span = hi - lo, mean = span / Math.log(hi / lo), wmax = hi * cols.pitch * (1 + 2 * INK.drift);
    assert(Math.abs(cols.unit - cols.block) < 0.5 && cols.min < cols.pitch * (lo + span / 4) && cols.max > cols.pitch * (hi - span / 4) && Math.abs(cols.avg / (cols.pitch * mean) - 1) < 0.25 && !cols.same,
      `中空板的格有大有小（${lo}～${hi} 倍）、平均＝骨牌寬 ×${(INK.cell * mean).toFixed(2)}，每次排都不一樣（${JSON.stringify(cols)}）`);
    // 畫布上一塊有多黑（0＝全白、1＝全黑）
    const ink = (x, y, w, h) => b.evaluate(([x, y, w, h]) => { const p = document.querySelector('.bg-ink').getContext('2d').getImageData(x, y, w, h).data; let s = 0; for (let i = 0; i < p.length; i += 4) s += 255 - p[i]; return s / (p.length / 4) / 255; }, [x, y, w, h]);
    // 板子那張畫布上、y 那一列從 x0 起 w 點的 alpha（0＝那一點沒有板子；一塊板子完整蓋住的地方最淡是玻璃那一點點色＝8，兩塊疊著 ≥ 15）。
    // 這張橫的＝螢幕 px（測試的螢幕密度 1）、直的是縮過的
    const row = (x0, y, w = 1) => b.evaluate(([x0, y, w]) => { const c = /** @type {HTMLCanvasElement} */ (document.querySelector('.bg-board'));
      return [...c.getContext('2d').getImageData(x0, Math.floor(y * c.height / innerHeight), w, 1).data].filter((_, i) => i % 4 === 3); }, [x0, y, w]);
    const board = async (x, y) => (await row(x, y))[0];
    assert(await board(450, 500) === 0, '還沒畫：沒有中空板');
    await b.mouse.move(300, 300);
    await b.mouse.move(600, 300, { steps: 2 });    // 快
    const fast = await ink(350, 290, 200, 20);
    await b.mouse.move(300, 500);
    await b.mouse.move(600, 500, { steps: 20 });   // 慢，然後停在 (600, 500)
    const slow = await ink(350, 490, 200, 20), near = await board(450, 500), far = await board(1000, 150);
    assert(slow > 0.1 && slow > fast * 2, `筆跡：走越慢越濃（快 ${fast.toFixed(3)}、慢 ${slow.toFixed(3)}）`);
    assert(near > 0 && far === 0, `中空板只在筆跡周圍出現（筆跡旁 ${near}、遠處 ${far}）`);
    // 筆跡過一陣子自己消失、中空板跟著一起；游標停著的那一點一直畫＝筆跡與板子都留著。量「消失」的地方要躲開停著那一點：
    // 它被折射成好幾份，最遠的一份離它 (bend−1)×最寬的格/2＋半個筆頭——但出了它那塊板子就看不到（筆跡照板子的範圍切邊；
    // 格很胖時前者比板子還遠）；板子最大＝halo ×（1＋float）×（1＋breathe）
    const reach = INK.halo * (1 + INK.float) * (1 + INK.breathe) / 2;
    const inkX = 300, inkW = Math.floor(600 - Math.min((INK.bend - 1) * wmax / 2 + INK.size / 2, reach) - 15) - inkX;
    const boardX = Math.floor(600 - reach - 16);
    await b.waitForFunction(([ix, iw, bx]) => { const ctx = (s) => document.querySelector(s).getContext('2d'), c = document.querySelector('.bg-board');
      return ctx('.bg-ink').getImageData(ix, 490, iw, 20).data.every(v => v === 255) && ctx('.bg-board').getImageData(bx, Math.floor(500 * c.height / innerHeight), 1, 1).data[3] === 0; }, [inkX, inkW, boardX], { timeout: 30000 }).catch(() => {});
    // 停著那一點自己那一格的那一份：中心離它最多 (bend−1)/(2·bend)×格寬 → 在那附近找最黑的一直條（只量一個小方塊，剛好落在兩格交界時會量到空白）
    const restR = Math.ceil((INK.bend - 1) / (2 * INK.bend) * wmax) + 6;
    const restInk = await b.evaluate(([x0, w]) => { const d = document.querySelector('.bg-ink').getContext('2d').getImageData(x0, 495, w, 10).data; let m = 0;
      for (let x = 0; x < w; x++) { let s = 0; for (let y = 0; y < 10; y++) s += 255 - d[(y * w + x) * 4]; m = Math.max(m, s / 10 / 255); } return m; }, [600 - restR, restR * 2]);
    const gone = [await ink(inkX, 490, inkW, 20), await board(boardX, 500)], rest = [restInk, await board(600, 500)];
    assert(inkW > 0 && gone[0] === 0 && gone[1] === 0 && rest[0] > 0.5 && rest[1] > 0,
      `筆跡隨時間消失、中空板跟著消失；游標停著的那一點還在（消失的那段：筆跡 ${gone[0]}（x ${inkX}–${inkX + inkW}）、板子 ${gone[1]}（x ${boardX}）；停著那點：筆跡 ${rest[0].toFixed(2)}、板子 ${rest[1]}）`);
    // 呼吸（user 2026-11-21）：游標停著，板子的範圍照樣一直脹縮（每 0.5 秒量一次面積、量一口氣多一點）
    if (INK.breathe > 0) {
      const area = [];
      for (let i = 0; i < Math.ceil(INK.breath * 2) + 1; i++) {
        area.push(await b.evaluate(() => { const c = /** @type {HTMLCanvasElement} */ (document.querySelector('.bg-board')), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; }));
        await b.waitForTimeout(500);
      }
      assert(Math.max(...area) > Math.min(...area) * (1 + INK.breathe), `中空板會呼吸：游標停著、板子的面積照樣脹縮（${area.join(' ')}）`);
    }
    // 整個背景就一大塊中空板（user 2026-11-22；試過一段筆跡生一塊、格各抽各的：疊到的地方同一筆被折兩次＝看起來重複）。
    // 量停著那一點的正中（最小的範圍也整個蓋住的那一圈：那裡不受呼吸影響）：一塊板子＝最淡的地方只有玻璃那一點點色（alpha 8）；疊兩層會 ≥ 15
    const core = Math.floor(INK.halo * (1 - INK.float) * (1 - INK.breathe) / 2 * 0.4), coreMin = async () => Math.min(...await row(600 - core, 500, core * 2));
    const until = async (fn, ms) => { for (const end = Date.now() + ms; Date.now() < end; await b.waitForTimeout(100)) if (await fn()) return true; return false; };
    // 停著不動：只有一塊（一層）
    const single = await until(async () => { const m = await coreMin(); return m > 0 && m < 12; }, 20000);
    // 格寬一直在變、而且是一點一點滑、不是一 px 一 px 跳（user 2026-11-22）：同一塊板子、游標停著，量比最寬的格再寬一點的一段
    // （一定有格線；停著那一點周圍這麼近也整個蓋住）：反光那條（蓋滿 1px＝alpha 156 上下）照樣在動，
    // 而且有只蓋到一部分的 px（60–140；位置取整的話只會有 156）
    // 最胖的格比板子最小的範圍還寬：格線可能落在只有板子脹大時才蓋得到的地方 → 「有格線」等它呼吸一輪
    const half = Math.ceil(wmax / 2) + 4, ribs = () => row(600 - half, 500, half * 2);
    const lined = await until(async () => Math.max(...await ribs()) > 100, INK.breath * 2000), was = await ribs();
    const moved = !INK.drift || await until(async () => (await ribs()).some((a, i) => Math.abs(a - was[i]) > 20), 8000);
    const glide = !INK.drift || await until(async () => (await ribs()).some(a => a > 60 && a < 140), 8000);
    assert(single && lined && moved && glide, `中空板：停著不動＝同一塊板子（${await coreMin()}）、有格線（${lined}）、格線一直在游移（${moved}）、位置不取整（${glide}）`);
    // 走開一大段再回到原地停著：還是同一塊（不會再生一塊疊上去＝同一筆不會被折兩次）。
    // 中途等兩幀：確定背景那一幀看到游標真的走到那麼遠（不然兩次移動併成一幀＝幾乎沒走）
    await b.mouse.move(600, 100);
    await b.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await b.mouse.move(600, 500);
    await b.waitForTimeout(1500);
    const back = await coreMin();
    assert(back > 0 && back < 12, `一大塊中空板：走開再回來還是同一塊、不會疊兩層（${back}）`);
    // 選單開著照樣畫（user 2026-11-22；原本不畫），背景跟內容一起模糊＋疊白
    await openMenu(b);
    await b.mouse.move(800, 200);
    await b.mouse.move(1100, 200, { steps: 20 });
    await b.waitForFunction(() => getComputedStyle(document.querySelector('.bg')).opacity === '0.4');
    assert(await ink(850, 190, 200, 20) > 0 && await css(b, '.bg', 'filter') === 'blur(4px)', '選單開著：右邊動游標照樣畫、背景模糊＋疊白（同內容）');
    // 放大 dialog 開著（報導點一則）：不畫、背景跟內容一起模糊＋疊白（同選單）
    await b.goto(base + '/pages/press.html');
    await b.waitForSelector('#site-header .site-bar');
    await b.click('main a.item-row[data-zoom]');
    await b.waitForFunction(() => document.querySelector('#figure-dialog[open]') && getComputedStyle(document.querySelector('.bg')).opacity === '0.4');
    await b.mouse.move(200, 120);
    await b.mouse.move(1000, 120, { steps: 20 });
    assert(await ink(200, 110, 800, 20) === 0 && await css(b, '.bg', 'filter') === 'blur(4px)', '放大 dialog 開著：動游標不畫、背景模糊＋疊白（同選單）');
    await b.emulateMedia({ media: 'print' });
    assert(await css(b, '.bg', 'display') === 'none', '列印：不印背景');
    await b.emulateMedia({ media: null });
    await b.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    assert(/^invert\(1\)/.test(await css(b, '.bg-ink', 'filter')) && await css(b, '.bg-board', 'filter') === 'invert(1)', '深色模式：畫布與中空板整張反過來');
    await b.close();
    // 系統減少動態：背景整組不放（照樣掛 watch：不打正式後台、收得到錯誤；拿掉空的 bg.js，不然一定沒有 .bg）
    const r = await browser.newPage({ reducedMotion: 'reduce' });
    await watch(r);
    await r.unroute(BG_JS);
    await r.goto(base + '/index.html');
    await r.waitForSelector('#site-header .site-bar');
    assert(await r.$('.bg') === null, '減少動態：沒有筆跡、也沒有中空板');
    await r.close();
    // 強制色彩（Windows 高對比佈景）：白底的畫布不會換成系統色、會蓋掉使用者選的底色 → 也不放
    const f = await browser.newPage({ forcedColors: 'active' });
    await watch(f);
    await f.unroute(BG_JS);
    await f.goto(base + '/index.html');
    await f.waitForSelector('#site-header .site-bar');
    assert(await f.$('.bg') === null, '強制色彩：不放背景');
    await f.close();
  } else {
    // 先關掉（user 2026-11-23）：載真的 bg.js、游標亂動也不放背景
    const b = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await watch(b);
    await b.unroute(BG_JS);
    await b.goto(base + '/index.html');
    await b.waitForSelector('#site-header .site-bar');
    await b.mouse.move(400, 400); await b.mouse.move(700, 450, { steps: 8 }); await b.waitForTimeout(300);
    assert(await b.$('.bg') === null, '背景先關掉（user 2026-11-23）：沒有畫布、沒有中空板');
    await b.close();
  }

  // ── 作品（user 2026-11-23；js/modules/pages/works.js、css/components/works.css）：自己開一頁、給假的後台與 YouTube ──
  // 從亮色的頁走選單進來＝整頁深色、深色模式鈕停用，離開回亮色；沒有右圖、內容置中；圖片欄位的圖＋播放清單拆出來的影片混在一起、打亂；
  // 放映：正中最大、兩邊縮小貼著舞台兩邊從後面露出來，方向鍵／點兩邊換，只有正中出 play、正中的影片點了就地播（可以全螢幕）、圖片不放大；
  // 總覽：照比例排三欄、照閱讀順序（同放映），點一個＝就地開 lightbox（user 2026-11-23）
  {
    const w = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await watch(w);
    await w.addInitScript(() => { Math.random = () => 0; });   // 打亂固定成「整串往前轉一格」（Fisher–Yates 每次都抽到 0）＝斷言得出順序
    await w.route(/scaidcms\.usc\.edu\.tw\/items\/works/, r => r.fulfill({ headers: CORS, json: { data: { playlists: [{ url: 'https://www.youtube.com/playlist?list=PLaaa' },
      { url: 'https://www.youtube.com/watch?v=x&list=PLbbb' }, { url: 'https://youtube.com/playlist?list=PLaaa' }, { url: '' }],
      // 圖片欄位（files M2M，user 2026-11-24）：PDF 不是圖、檔案刪掉了（null）都不出
      images: [{ directus_files_id: { id: 'f1', type: 'image/jpeg', width: 1600, height: 900 } }, { directus_files_id: { id: 'f2', type: 'image/png', width: 900, height: 1200, description: '直的' } },
        { directus_files_id: { id: 'pdf', type: 'application/pdf' } }, { directus_files_id: null }, { directus_files_id: { id: 'f3', type: 'image/webp', width: 200, height: 150 } }] } } }));
    await w.route(/scaidcms\.usc\.edu\.tw\/assets\//, r => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"/>' }));
    const yt = [];
    await w.route(/googleapis\.com\/youtube/, r => { const u = new URL(r.request().url()), id = u.searchParams.get('playlistId');
      // 影片真正的比例（videos.list player，user 2026-11-24）：PLbbb 那支是寬銀幕 1000×420、其他 16:9
      if (u.pathname.endsWith('/videos')) { r.fulfill({ headers: CORS, json: { items: String(u.searchParams.get('id')).split(',').map(v => ({ id: v, player: { embedWidth: 1000, embedHeight: v.startsWith('PLbbb') ? 420 : 563 } })) } }); return; }
      yt.push(id); r.fulfill({ headers: CORS, json: { items: [
      { snippet: { title: `${id} 影片`, resourceId: { videoId: `${id}-v` }, thumbnails: { medium: { url: 'https://i.ytimg.com/vi/m/mqdefault.jpg', width: 320, height: 180 }, standard: { url: `https://i.ytimg.com/vi/${id}/sddefault.jpg`, width: 640, height: 480 } } } },
      { snippet: { title: '私人影片', resourceId: { videoId: `${id}-private` }, thumbnails: {} } }] } }); });
    await w.goto(base + '/pages/sitemap.html');
    await w.waitForSelector('#site-header .site-bar');
    // 網站地圖沒分段，標題到連結清單也同有分段的頁＝3xl（桌面 96px；user 2026-11-24，同聯絡頁）
    assert(await w.$eval('main .page-body > h1', h => getComputedStyle(/** @type {Element} */ (h.nextElementSibling)).marginTop) === '96px', '網站地圖：標題到內容 3xl（同其他頁）');
    await w.click('.menu-btn'); await w.waitForTimeout(600);
    await w.click('.site-menu a[href="works.html"]');
    await w.waitForFunction(() => document.body.dataset.page === 'works' && document.querySelectorAll('.works .work').length === 5);
    await w.waitForTimeout(900);
    // 標題不出、只留給報讀（user 2026-11-24：「作品頁的 title 可以拿掉」）：舞台從 title 那條線（--top-h 112）起
    assert(await w.$eval('main h1', h => h.classList.contains('sr-only') && h.textContent === '作品') && Math.abs((await rect(w, '.works-items')).top - 112) < 1,
      `作品：標題只留給報讀、舞台從 title 那條線起（舞台頂 ${(await rect(w, '.works-items')).top}）`);
    // 每個作品：誰（影片＝vid、圖＝檔案 id）、位置、大小、看不看得到
    const works = () => w.evaluate(() => {
      const stage = /** @type {Element} */ (document.querySelector('.works-items')).getBoundingClientRect();
      return { stage: { l: stage.left, r: stage.right, h: stage.height }, body: /** @type {Element} */ (document.querySelector('.works')).getBoundingClientRect().width, mode: /** @type {HTMLElement} */ (document.querySelector('.works')).dataset.mode,
        items: [...document.querySelectorAll('.works .work')].map(el => { const e = /** @type {HTMLElement} */ (el), r = e.getBoundingClientRect(), s = getComputedStyle(e), hit = /** @type {HTMLButtonElement} */ (e.querySelector('.work-hit'));
          const icon = e.querySelector('.work-hit .icon');
          return { id: e.dataset.vid || /** @type {HTMLImageElement} */ (e.querySelector('img')).src.split('/').pop(), pos: e.dataset.pos, l: r.left, r: r.right, t: r.top, w: r.width, h: r.height, o: +s.opacity, z: s.zIndex, blur: s.filter,
            hit: !hit.disabled, label: hit.getAttribute('aria-label'), icon: icon ? +getComputedStyle(icon).opacity : null }; }) };
    });
    let s = await works();
    const byId = (id) => /** @type {any} */ (s.items.find(x => x.id === id));
    const art = await rect(w, '.works');
    const env = await w.evaluate(() => ({ theme: document.documentElement.dataset.theme, btn: /** @type {HTMLButtonElement} */ (document.querySelector('.theme-btn')).disabled, hid: getComputedStyle(/** @type {Element} */ (document.querySelector('.theme-btn'))).display === 'none',
      fig: !!document.querySelector('#page-content .page-figure'), figBtn: document.querySelector('.figure-btn')?.classList.contains('has-figure'), bar: getComputedStyle(/** @type {Element} */ (document.querySelector('.bar-works'))).visibility }));
    assert(env.theme === 'dark' && env.btn && env.hid && !env.fig && !env.figBtn && env.bar === 'visible' && Math.abs(art.left + art.width / 2 - 640) < 1,
      `作品：亮色的頁走進來＝深色、深色模式鈕藏起來（user 2026-11-23）、沒有右圖、內容置中、底列有排法鈕（${JSON.stringify(env)}、內容 ${art.left}～${art.left + art.width}）`);
    assert(s.items.map(x => x.id).join() === 'f2,f3,PLaaa-v,PLbbb-v,f1' && yt.slice().sort().join() === 'PLaaa,PLbbb',
      `作品：圖片欄位的圖（不是圖、刪掉的不出）＋播放清單拆出來的影片（私人的不出、同一個清單只抓一次）、順序打亂（${s.items.map(x => x.id).join()}；YouTube ${yt.join()}）`);
    const [c, L, R, v] = ['f2', 'f1', 'f3', 'PLaaa-v'].map(byId);
    { const wide = byId('PLbbb-v');   // 影片照真正的比例（YouTube videos.list 的 player；user 2026-11-24：總覽要 Pinterest 那種錯落）
      assert(Math.abs(wide.w / wide.h - 1000 / 420) < 0.01, `作品：影片照它真正的比例（寬銀幕 1000×420、不是一律 16:9；${wide.w}×${wide.h}）`); }
    // 放映＝一列（user 2026-11-24：「左右都幫我改成一樣大，然後整個 box 的左右邊緣加上 blur 的效果」；原本正中大、兩邊小貼著舞台兩邊、各自失焦）：
    // 每個都撐滿最大框（舞台 72% 寬 × 舞台高裡照比例）、正中那個在舞台正中、其他隔一個 gutter 接在兩邊、不自己失焦；舞台兩側有漸進模糊那 5 層
    // PC：最寬＝內文 6 欄（.works 的寬）、舞台＝畫面扣兩邊內距（兩邊的往外排、切在 menu 鈕那條線；user 2026-11-24）
    { const full = (/** @type {number} */ ar) => Math.min(s.body, s.stage.h * ar);
      const gap = await w.$eval('.works-items', l => parseFloat(getComputedStyle(l).columnGap)), layers = await w.$$eval('.works-items > .slide-blur > i', i => i.length);
      const sized = /** @type {[any, number][]} */ ([[c, 900 / 1200], [L, 1600 / 900], [R, 200 / 150], [v, 1000 / 563]]).every(([x, ar]) => Math.abs(x.w - full(ar)) < 1 && Math.abs(x.w / x.h - ar) < 0.01);
      assert(c.pos === '0' && Math.abs((c.l + c.r) / 2 - (s.stage.l + s.stage.r) / 2) < 1 && !c.hit && sized && Math.abs(s.stage.l - 60) < 1 && Math.abs(s.stage.r - 1220) < 1
        && L.pos === '-1' && Math.abs(L.r + gap - c.l) < 1 && R.pos === '1' && Math.abs(R.l - gap - c.r) < 1 && Math.abs(v.l - gap - R.r) < 1
        && s.items.every(x => x.o === 1 && x.blur === 'none') && layers === 5 && L.label === '上一個' && R.label === '下一個',
        `作品放映：一列、每個跟正中一樣大（撐滿內文 6 欄或舞台高、照比例；舞台＝畫面扣兩邊內距＝切在 menu 鈕那條線）、隔一個 gutter 接在兩邊、不自己失焦；舞台兩側漸進模糊 ${layers} 層（gap ${gap}；${JSON.stringify(s)}）`); }
    // Chrome：.works 只有 min-height＝舞台的高是 flex 長出來的，cqh 算成 0、作品全是 0×0（user 2026-11-23 回報）。WebKit 重現不了，只守規則還在
    assert(await w.evaluate(() => { const all = (/** @type {any} */ rs) => [...rs].flatMap(r => [r, ...(r.cssRules ? all(r.cssRules) : [])]);
      return [...document.styleSheets].flatMap(s => { try { return all(s.cssRules); } catch { return []; } })
        .some(r => r instanceof CSSStyleRule && r.selectorText === '.works[data-mode="slideshow"]' && /100vh/.test(r.style.height)); }),
      '作品放映：.works 定高（不然 Chrome 的 cqh＝0、放映什麼都看不到）');
    await w.keyboard.press('ArrowRight'); await w.waitForTimeout(800);
    assert((s = await works(), byId('f3').pos === '0' && byId('f2').pos === '-1' && byId('PLaaa-v').pos === '1' && byId('PLaaa-v').icon === 0),
      `作品放映：→ 換下一個；兩邊的影片不出 play（user 2026-11-23：只有正中那個出；PLaaa-v play ${byId('PLaaa-v').icon}）`);
    // 正中一律撐滿最大框（user 2026-11-23：「中間的這張要保持 full screen，不會是比較小的」）：200×150 的小圖也放大到舞台寬的 72% 或舞台高
    { const f3 = byId('f3'), full = Math.min(s.body, s.stage.h * 4 / 3);
      assert(Math.abs(f3.w - full) < 1 && Math.abs(f3.w / f3.h - 4 / 3) < 0.01, `作品放映：正中的小圖（200×150）也撐滿最大框（寬 ${f3.w} vs ${full}）`); }
    // 點左邊那個露出來的那一段（一列之後它的左半多半切在舞台外 → 點它的右緣那邊；user 2026-11-24）
    { const [lw, lh] = await w.$eval('.work[data-pos="-1"]', e => [e.getBoundingClientRect().width, e.getBoundingClientRect().height]);
      await w.click('.work[data-pos="-1"] .work-hit', { position: { x: lw - 8, y: lh / 2 } }); } await w.waitForTimeout(500);
    s = await works();
    assert(byId('f2').pos === '0', '作品放映：點左邊那個＝換回上一個');
    await w.keyboard.press('ArrowDown'); await w.keyboard.press('ArrowDown'); await w.waitForTimeout(500);
    s = await works();
    assert(byId('PLaaa-v').pos === '0' && byId('PLaaa-v').hit && byId('PLaaa-v').icon === 1 && /^播放：PLaaa 影片$/.test(byId('PLaaa-v').label), `作品放映：↓ 也是下一個；正中的影片出 play、能點（${byId('PLaaa-v').label}）`);
    await w.click('.work[data-pos="0"] .work-hit');
    const frame = await w.$eval('.work[data-pos="0"] .work-frame', f => ({ src: f.getAttribute('src'), fs: f.hasAttribute('allowfullscreen'), allow: f.getAttribute('allow') })).catch(() => null);
    assert(!!frame && /youtube-nocookie\.com\/embed\/PLaaa-v\?autoplay=1/.test(frame.src) && frame.fs && /fullscreen/.test(frame.allow), `作品放映：點正中的影片＝就地播、可以全螢幕（${JSON.stringify(frame)}）`);
    await w.keyboard.press('ArrowRight'); await w.waitForTimeout(300);
    assert(await w.$$eval('.work-frame', f => f.length) === 0, '作品放映：換到下一個＝影片收掉');
    // 總覽：照比例排三欄、照閱讀順序擺（user 2026-11-23：同放映的順序＝放映的第 8 個就是總覽的第 8 個；一個一個由左到右放進最矮的那一欄）、每個都撐滿一欄
    await w.click('.bar-works [data-works-mode="bento"]'); await w.waitForTimeout(800);
    s = await works();
    const cols = await w.$eval('.works-items', l => { const cs = getComputedStyle(l), n = parseInt(cs.getPropertyValue('--cols'), 10), gap = parseFloat(cs.columnGap); return { n, w: (l.clientWidth - gap * (n - 1)) / n }; });
    const pressed = await w.$$eval('.bar-works button', bs => bs.map(b => b.getAttribute('aria-pressed')).join());
    const reading = s.items.slice().sort((a, b) => (Math.abs(a.t - b.t) < 0.5 ? 0 : a.t - b.t) || a.l - b.l).map(x => x.id).join();
    assert(s.mode === 'bento' && cols.n === 3 && reading === s.items.map(x => x.id).join() && s.items.slice(0, 3).every(x => Math.abs(x.t - s.items[0].t) < 0.5)
      && s.items.every(x => Math.abs(x.w - cols.w) < 0.5 && x.o === 1 && x.hit) && pressed === 'false,true',
      `作品總覽：三欄、照閱讀順序擺（同放映）、每個都撐滿一欄（f3 只有 200 寬也拉滿，user 2026-11-23）、都點得到；底列的鈕跟著換（${JSON.stringify({ cols, pressed, reading, items: s.items.map(x => [x.id, Math.round(x.t), Math.round(x.w)]) })}）`);
    // 總覽點一個＝就地開 lightbox（user 2026-11-23；原本切到放映）：放大 dialog、一組＝總覽全部可以左右切，影片＝YouTube 播放器；關了影片拿掉、還在總覽
    const lb = () => w.evaluate(() => { const d = /** @type {HTMLDialogElement} */ (document.getElementById('figure-dialog')), b = d.querySelector('.figure-dialog-body > *');
      return { open: d.open, tag: b?.tagName || '', src: b?.getAttribute('src') || '', nav: d.classList.contains('has-nav'), mode: /** @type {HTMLElement} */ (document.querySelector('.works')).dataset.mode }; });
    await w.click('.work:has(img[src$="/f3"]) .work-hit'); await w.waitForTimeout(600);
    let box = await lb();
    assert(box.open && box.tag === 'IMG' && /\/f3$/.test(box.src) && box.nav && box.mode === 'bento', `作品總覽：點一個＝就地開 lightbox（不切到放映）、一組可以左右切（${JSON.stringify(box)}）`);
    // 切換＝淡出 → 換 → 淡入（user 2026-11-24：「作品頁面中的影片跟圖片切換，要用 fade in out」）：一按先淡掉、還是原本那張，淡完才換成影片
    await w.keyboard.press('ArrowRight'); await w.waitForTimeout(150);
    const mid = await w.evaluate(() => [document.getElementById('figure-dialog')?.classList.contains('is-swapping'), document.querySelector('.figure-dialog-body > *')?.tagName,
      Number(getComputedStyle(/** @type {Element} */ (document.querySelector('.figure-dialog-body'))).opacity) < 1].join());
    await w.waitForTimeout(800);
    box = await lb();
    assert(mid === 'true,IMG,true' && box.tag === 'IFRAME' && /youtube-nocookie\.com\/embed\/PLaaa-v\?autoplay=1/.test(box.src) && await css(w, '.figure-dialog-body', 'opacity') === '1',
      `作品總覽：lightbox 切到影片＝先淡出原本那張、淡完換成 YouTube 播放器再淡入（${mid}｜${JSON.stringify(box)}）`);
    await w.keyboard.press('Escape'); await w.waitForTimeout(700);
    box = await lb();
    assert(!box.open && !box.tag && box.mode === 'bento', `作品總覽：關 lightbox＝影片拿掉（不留在背景播）、還在總覽（${JSON.stringify(box)}）`);
    // lightbox 切到別的作品再關＝背景的總覽對齊最後看的那一個（user 2026-11-24：「離開時應該要讓背景的 grid 對齊到之前查看的那個作品」）：
    // 那一個在畫面正中；捲不到（在頁頭／頁尾附近）＝捲到頭為止（scrollIntoView center 的規矩）
    const aligned = await w.evaluate(() => {
      const r = /** @type {Element} */ (document.querySelector('.work[data-vid="PLaaa-v"]')).getBoundingClientRect(), mid = r.top + r.height / 2 - innerHeight / 2;
      const max = document.documentElement.scrollHeight - innerHeight;
      return Math.abs(mid) < 2 || (scrollY <= 0 && mid > 0) || (scrollY >= max - 1 && mid < 0) ? true : `mid ${mid} scrollY ${scrollY}/${max}`;
    });
    assert(aligned === true, `作品總覽：lightbox 切到別的再關＝背景對齊最後看的那一個（${aligned}）`);
    // 切回放映＝從總覽最後看的那一個開始（兩種排法同一個順序、同一個 active；lightbox 裡切到哪就記到哪）
    await w.click('.bar-works [data-works-mode="slideshow"]'); await w.waitForTimeout(800);
    s = await works();
    assert(s.mode === 'slideshow' && byId('PLaaa-v').pos === '0', '作品：總覽最後看的那一個＝切回放映從它開始');
    // 離開：回到存的那種（亮色）、深色模式鈕回來、排法鈕淡掉
    await w.click('.menu-btn'); await w.waitForTimeout(600);
    await w.click('.site-menu a[href="about.html"]');
    await w.waitForFunction(() => document.body.dataset.page === 'about');
    await w.waitForTimeout(700);
    const back = await w.evaluate(() => ({ theme: document.documentElement.dataset.theme || '', btn: /** @type {HTMLButtonElement} */ (document.querySelector('.theme-btn')).disabled, bar: getComputedStyle(/** @type {Element} */ (document.querySelector('.bar-works'))).visibility }));
    assert(back.theme === '' && !back.btn && back.bar === 'hidden', `作品：離開＝回到原本的亮色、深色模式鈕回來、排法鈕收掉（${JSON.stringify(back)}）`);
    await w.goto(base + '/pages/works.html');
    assert(await w.evaluate(() => document.documentElement.dataset.theme) === 'dark', '作品：直接開 works.html 也是深色（<head> 的 inline script）');
    await w.setViewportSize({ width: 390, height: 844 }); await w.waitForTimeout(300);
    { const box = await rect(w, '.works');   // 手機＝內頁內文的寬＝內距 16＋rail（半欄 38.75）（user 2026-11-24：「不需要整個 page 那麼寬」；原本手機不讓 rail、滿版）
      assert(Math.abs(box.left - 54.75) < 0.5 && Math.abs(box.width - 280.5) < 0.5, `手機作品＝內頁內文的寬、左右各讓內距＋rail（${box.left}～${box.left + box.width}、應為 54.75～335.25）`);
      // 放映的舞台＝畫面扣左右內距就好、不讓 rail（user 2026-11-24：「這邊不需要跟全站的寬度一樣」）；總覽照舊＝內文的寬（下面那條）
      const st = await rect(w, '.works-items');
      assert(Math.abs(st.left - 16) < 0.5 && Math.abs(st.width - 358) < 0.5, `手機放映的舞台＝畫面扣左右內距（${st.left}＋${st.width}、應為 16＋358）`); }
    await w.click('.bar-works [data-works-mode="bento"]'); await w.waitForTimeout(800);
    { const col = await rect(w, '.works'), one = await w.$$eval('.works .work', els => els.map(e => { const r = e.getBoundingClientRect(); return [r.left, r.width, r.top]; }));
      assert(one.length > 1 && one.every(([l, wd, t], i) => Math.abs(l - col.left) < 0.5 && Math.abs(wd - col.width) < 0.5 && (i === 0 || one[i - 1][2] < t)),
        `手機總覽＝一欄、由上往下（user 2026-11-24：「不用分兩列」；欄 ${col.left}＋${col.width}，前三個 ${JSON.stringify(one.slice(0, 3))}）`); }
    await w.close();
  }

  // ── 全站接後台（user 2026-11-21；js/modules/pages/cms-pages.js、ui-labels.js）：自己開一頁、給假的後台資料 ──
  // 介面文字換字＋跟語言、動態／入學（相簿照 sort、沒展開內容＝不能點、入學只抓勾了的）、課程（必修在前）、關於（內文 sanitize、輪播、中英各一份）、
  // 師資詳細頁（?id=）、報導（沒截圖＝不能點）、規章（單例：連結只放 http(s)、副標一行一個）、捐款（單例）、常見問題（依分類分段＋導覽重排）
  {
    const c = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await watch(c);
    const ok = (data) => (/** @type {any} */ r) => r.fulfill({ headers: CORS, json: { data } });
    const file = (id, w = 600, h = 400) => ({ id, width: w, height: h, title: `${id}.pdf` });
    await c.route(/scaidcms\.usc\.edu\.tw\/assets\//, r => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"/>' }));
    await c.route(/\/items\/ui_labels/, ok([{ key: 'nav.about', zh: '關於我們', en: 'About us' }, { key: 'curriculum.required', zh: '必修課', en: null }]));
    const NEWS = [
      // 後台照 SCCD 的活動（user 2026-11-24）：副標一筆一行（原本一格分類）、地點可以好幾個（原本一格 place_*）、影片連結排在相簿的照片前面（只收 http(s)；
      // YouTube＝縮圖＋play、直連的檔沒有縮圖）；舊欄位還在回應裡也不出
      { id: 1, date: '2026-12-01', title_zh: '後台動態一', title_en: 'CMS News 1', category_zh: '舊分類', place_zh: '舊地點', image: null,
        subtitles: [{ text_zh: '副標一', text_en: 'Sub 1' }, { text_zh: '副標二', text_en: null }], locations: [{ name_zh: '台北', name_en: 'Taipei' }, { name_zh: '高雄', name_en: null }],
        videos: [{ url: 'https://youtu.be/dQw4w9WgXcQ' }, { url: 'javascript:alert(1)' }, { url: 'https://example.com/clip.mp4' }],
        album: [{ sort: 2, directus_files_id: file('b', 300, 200) }, { sort: 1, directus_files_id: file('a') }], attachments: [] },
      { id: 2, date: null, title_zh: '後台動態二', title_en: null, album: [], attachments: [] },   // 沒時間也沒日期、沒地點、沒相簿＝沒得展開
    ];
    // 入學的時間用選的（user 2026-11-24）：日期＋結束日期 → 2027.01.05–01.08；沒有幾點（同一天拿掉開始／結束時間，「留下日期即可」）
    const ADM = [{ id: 3, date: '2027-01-05', end_date: '2027-01-08', title_zh: '後台入學一', summary_zh: '第一行\n第二行', summary_en: 'Line 1\nLine 2', album: [], attachments: [{ sort: 1, directus_files_id: file('brochure') }] }];
    await c.route(/\/items\/activities\?/, ok(NEWS));   // 動態、入學各一個集合（user 2026-11-24）
    await c.route(/\/items\/admission\?/, ok(ADM));
    // 首頁的 news（user 2026-11-24：原本叫 home_news）：首頁那串＋底列跑馬燈；點了去哪＝入學頁某一則（ADM 那則）／外部網址（只放 http(s)）／都沒有＝不能點
    await c.route(/\/items\/news\?/, ok([{ title_zh: '首頁一', title_en: 'Home 1', image: 'img1', admission_item: { id: 3 } },
      { title_zh: '首頁二', url: 'https://example.com/z' }, { title_zh: '首頁三', url: 'javascript:alert(1)' }, { title_zh: '首頁四' }]));
    await c.route(/\/items\/home_video\?/, ok({ url: 'https://youtu.be/dQw4w9WgXcQ' }));   // 首頁影片（單例）→ 底列 ▶ 鈕的 data-video
    await c.route(/\/items\/courses/, ok([{ year: 2, sort: 2, required: false, name_zh: '選修課', name_en: 'Elective course' }, { year: 2, sort: 1, required: true, name_zh: '必修課 A', name_en: 'Core A', description_zh: '說明', description_en: 'About' }]));
    await c.route(/\/items\/about\?/, ok({ lead_zh: '後台導言', lead_en: 'CMS lead', sections: [{ title_zh: '後台段落', title_en: 'CMS section', description_zh: '段落說明\n第二行\n\n說明第二段', description_en: 'Section intro',
      timeline: [{ year: '2026', text_zh: '成立', text_en: 'Founded' }, { year: '', text_zh: '沒年份' }, { year: '2030' }],
      // 小節的圖可以多張（user 2026-11-24）：一張＝<img>、多張＝輪播（照 sort）
      subsections: [{ sort: 2, text_zh: '沒標題的小節', images: [{ sort: 2, directus_files_id: file('sub3') }, { sort: 1, directus_files_id: file('sub2', 400, 600) }] },
        { sort: 1, title_zh: '小標', title_en: 'Sub', images: [{ sort: 1, directus_files_id: file('sub1') }], text_zh: '第一行\n第二行\n\n第二段<b>', text_en: 'Line 1', note_zh: '小節附註' },
        { sort: 3, title_zh: '多圖', images: [{ sort: 1, directus_files_id: file('sub4') }, { sort: 2, directus_files_id: file('sub5') }] }],
      images: [{ sort: 1, directus_files_id: file('img1', 800, 533) }] }] }));
    await c.route(/\/items\/faculty\/\d+/, ok({ status: 'published', photo: null, person: { name_zh: '後台老師', name_en: 'CMS Teacher' }, subtitles: [{ text_zh: '教授', text_en: 'Professor' }],
      // 清單＝子集合 faculty_sections（user 2026-11-24：後台可以自己加）：照 sort、標題自己取、英文空退中文、一筆都沒有的清單不出、沒年份只有說明
      sections: [{ sort: 2, title_zh: '自己加的清單', title_en: null, entries: [{ year: '', text_zh: '專長一', text_en: 'Skill 1' }] },
        { sort: 1, title_zh: '學歷', title_en: 'Education', entries: [{ year: '2001', text_zh: '學士', text_en: 'BA' }] }, { sort: 3, title_zh: '空的清單', title_en: 'Empty', entries: [] }] }));
    await c.route(/\/items\/press/, ok([{ title_zh: '報導一', media: { name_zh: '媒體甲', name_en: 'Media A' }, screenshot: 'shot' }, { title_zh: '報導二', media: null, screenshot: null }]));
    await c.route(/\/items\/regulations/, ok({ items: [{ category_zh: '分類甲', title_zh: '有連結', subtitles_zh: '第一行\n第二行', subtitles_en: 'Line 1', url: 'https://example.com/x' },
      { category_zh: '分類甲', title_zh: '另一個', url: 'https://example.com/y' }, { category_zh: '分類乙', title_zh: '壞連結', url: 'javascript:alert(1)' }], sections: null }));
    // 捐款＝同關於（user 2026-11-24：「捐款頁面應該比照 about 的去調整」）：段落子集合（說明、小節…）；前台抓的欄位同關於
    let donReq = '';
    await c.route(/\/items\/donate/, r => { donReq = r.request().url(); return ok({ lead_zh: '捐款導言', lead_en: 'Donate lead', sections: [{ sort: 1, title_zh: '捐款段落', title_en: 'Giving',
      description_zh: '捐款說明', description_en: 'How to give', subsections: [{ sort: 1, title_zh: '捐款小節', title_en: null, text_zh: '小節內文', text_en: 'Sub text' }] }] })(r); });
    await c.route(/\/items\/qa/, ok([{ category_zh: '甲', question_zh: '問一', answer_zh: '答一' }, { category_zh: '乙', question_zh: '問二', answer_zh: '答二' }, { category_zh: '甲', question_zh: '問三', answer_zh: '答三' }]));

    await c.goto(base + '/pages/about.html');
    await c.waitForFunction(() => document.querySelectorAll('main .page-section').length === 1 && document.querySelector('main h1')?.textContent === '關於我們');
    // 關於的段落（user 2026-11-23）＝標題 → 輪播 → 說明（隔 md）→ 小節（子集合、照 sort；標題 h3 → 圖 → 內文 → 附註，有才排）：換行照留、空一行＝分段、塊之間 sm、
    // 小節一塊一個 .subsection、包在 .subsections，塊之間＝gap xl（user 2026-11-24，同清單列）、沒標題＝第一塊（圖／輪播）貼塊頂；附註 text-xs；段落自己沒有附註了；
    // 小節圖限高（page.css，600×400 的圖在 6 欄寬會超過）；英文空退中文；
    // 最後是年表（沿革）＝同師資詳細頁的學歷：年份一行、說明一行、沒年份只有說明、沒說明的那筆不出，筆與筆之間 sm（ul 的 gap，user 2026-11-24）
    const subs = () => c.evaluate(() => [...document.querySelectorAll('main .page-section > :not(h2, .slideshow, .subsections), main .subsection > :not(.slideshow)')]
      .map(e => `${e.tagName}.${e.className}:${e instanceof HTMLImageElement ? e.src.split('/').pop() : e.textContent}`).join('|'));
    const about = await c.evaluate(() => {
      const img = /** @type {HTMLElement} */ (document.querySelector('main .subsection > img')), cs = getComputedStyle(img);
      const blocks = [...document.querySelectorAll('main .subsection')], r = (/** @type {Element} */ e) => e.getBoundingClientRect();
      return { menu: document.querySelector('.site-menu a[href="about.html"]')?.textContent, title: document.title, lead: document.querySelector('.page-lead')?.textContent,
        slides: document.querySelector('main .page-section > h2 + .slideshow[data-ready]')?.querySelectorAll('.slide').length, dots: document.querySelectorAll('.section-nav-dot').length,
        // 輪播（段落的、小節多張的）：class、裡面的圖照 sort；小節標題下面的輪播跟標題隔 xs（同一張圖）
        shows: [...document.querySelectorAll('main :is(.page-section, .subsection) > .slideshow[data-ready]')].map(s => `${s.className}:${[...s.querySelectorAll('img')].map(i => i.src.split('/').pop()).join('+')}`).join('|'),
        showGap: (h => h && /** @type {Element} */ (h.nextElementSibling).getBoundingClientRect().top - h.getBoundingClientRect().bottom)([...document.querySelectorAll('main .subsection > h3')].find(x => x.textContent === '多圖')),
        // 塊之間＝gap 48（桌面 xl）、沒標題那塊（第 2 塊）的輪播離塊頂＝上下暈出去的模糊那段（--up 24）
        blocks: blocks.length === 3 && blocks.every((b, i) => !i || Math.abs(r(b).top - r(blocks[i - 1]).bottom - 48) < 0.5) && Math.abs(r(/** @type {Element} */ (blocks[1].firstElementChild)).top - r(blocks[1]).top - 24) < 0.5,
        img: { max: cs.maxHeight, fit: cs.objectFit, h: img.getBoundingClientRect().height,
          // 標題 → 圖 md（24）、圖 → 下面的內文 xl（48）（user 2026-11-24：「我想要圖片到那個段落文字是 xl，但 title 到圖片可以是 md」，一張圖同輪播）
          gaps: [r(img).top - r(/** @type {Element} */ (img.previousElementSibling)).bottom, r(/** @type {Element} */ (img.nextElementSibling)).top - r(img).bottom].map(Math.round).join() },
        // 年表＝清單：筆與筆之間 sm＝ul 的 gap（user 2026-11-24：「gap 從 xs 改成 sm，且用 gap 來分，不要用 mt」）
        tlGap: (ul => getComputedStyle(ul).rowGap === '16px' && [...ul.children].every((l, i, ls) => !i || (Math.abs(r(l).top - r(ls[i - 1]).bottom - 16) < 0.5 && getComputedStyle(l).marginTop === '0px')))(/** @type {Element} */ (document.querySelector('main .timeline'))) };
    });
    const aboutZh = await subs(), tail = '|P.whitespace-pre-line mt-sm:第二段<b>|P.whitespace-pre-line mt-sm text-xs:小節附註|P.whitespace-pre-line mt-sm:沒標題的小節|H3.:多圖|UL.timeline mt-xl:2026';
    assert(about.shows === 'slideshow:img1|slideshow:sub2+sub3|slideshow:sub4+sub5' && Math.abs(about.showGap - 24) < 0.5 && about.blocks,
      `接後台：小節的圖多張＝輪播、照 sort，跟標題隔 md（user 2026-11-24：「title 到圖片可以是 md」）、沒標題＝離塊頂 24，塊之間 gap xl（${about.shows}、${about.showGap}、${about.blocks}）`);
    assert(about.menu === '關於我們' && about.title === '關於我們 - SCAID' && about.lead === '後台導言' && about.slides === 1 && about.dots === 1 && about.tlGap
      && about.img.max !== 'none' && about.img.fit === 'contain' && Math.abs(about.img.h - parseFloat(about.img.max)) < 1 && about.img.gaps === '24,48'
      && aboutZh === 'P.whitespace-pre-line mt-md:段落說明\n第二行|P.whitespace-pre-line mt-sm:說明第二段|H3.:小標|IMG.:sub1|P.whitespace-pre-line mt-sm:第一行\n第二行' + tail + '成立沒年份',
      `接後台：介面文字（選單、頁名、分頁標題）、導言、段落（輪播、說明、小節＝標題＋圖＋純文字＋附註、照 sort、圖限高、年表）（${JSON.stringify(about)} ${aboutZh}）`);
    // 行距中英分開（user 2026-11-24：「中文 s 的行距也調整成 1.4…將中英分開不同的行距調整」）：text-s 中文 1.4、英文 1.5（variables.css 兩組）
    const lh = () => c.$eval('.page-lead', p => { const cs = getComputedStyle(p); return Math.round(parseFloat(cs.lineHeight) / parseFloat(cs.fontSize) * 100) / 100; });
    const lhZh = await lh();
    await c.evaluate(() => localStorage.setItem('scaid:lang', 'en'));
    await c.reload();
    await c.waitForFunction(() => document.querySelector('main h1')?.textContent === 'About us' && document.querySelector('.page-lead')?.textContent === 'CMS lead');
    const lhEn = await lh();
    assert(lhZh === 1.4 && lhEn === 1.5, `行距中英分開：text-s 中文 1.4、英文 1.5（${lhZh}／${lhEn}）`);
    const aboutEn = await subs();
    assert(aboutEn === 'P.whitespace-pre-line mt-md:Section intro|P.whitespace-pre-line mt-sm:說明第二段|H3.:Sub|IMG.:sub1|P.whitespace-pre-line mt-sm:Line 1' + tail + 'Founded沒年份',
      `接後台：切英文＝介面文字、說明與小節都換英文、沒填英文的退中文（${aboutEn}）`);
    // 捐款＝同關於：段落＝標題 → 說明 → 小節（英文版看英文、沒填英文的退中文）；抓的欄位同關於（小節、圖片一起抓）
    await c.goto(base + '/pages/donate.html');
    await c.waitForFunction(() => document.querySelector('main h2')?.textContent === 'Giving');
    const don = await c.evaluate(() => ({ secs: document.querySelectorAll('main .page-section').length, lead: document.querySelector('.page-lead')?.textContent,
      desc: document.querySelector('main .page-section > p')?.textContent, sub: [...document.querySelectorAll('main .subsections > .subsection > *')].map(e => `${e.tagName}:${e.textContent}`).join('|') }));
    assert(don.secs === 1 && don.lead === 'Donate lead' && don.desc === 'How to give' && don.sub === 'H3:捐款小節|P:Sub text' && /sections\.subsections/.test(decodeURIComponent(donReq)),
      `接後台：捐款單例＝同關於（導言＋段落子集合：說明、小節；英文空退中文）（${JSON.stringify(don)}）`);
    await c.evaluate(() => localStorage.setItem('scaid:lang', 'zh'));

    await c.goto(base + '/pages/activities.html');
    await c.waitForFunction(() => document.querySelectorAll('main .item-list > li').length === 2 && document.querySelector('.bar-news-copy span')?.textContent === '首頁一');
    const news = await c.evaluate(() => ({ folds: document.querySelectorAll('main details').length, plain: document.querySelectorAll('main li > div.item-row').length,
      album: [...document.querySelectorAll('main .album img')].map(i => /** @type {HTMLImageElement} */ (i).src.split('/').pop() + ':' + i.getAttribute('width')).join(),
      meta: [...document.querySelectorAll('main .fold-meta p')].map(p => p.textContent).join('|'), subs: [...document.querySelectorAll('main summary p')].map(p => `${p.textContent}/${p.getAttribute('data-en')}`).join('|'),
      // 相簿那一排照順序：影片（YouTube 的縮圖／直連的檔沒有圖）在前、照片在後
      strip: [...document.querySelectorAll('main .album button')].map(b => b.classList.contains('album-video') ? `v:${/** @type {HTMLElement} */ (b).dataset.video}:${b.querySelector('img')?.getAttribute('src') ?? '-'}:${b.querySelectorAll('.icon-play').length}` : 'img').join('|') }));
    assert(news.folds === 1 && news.plain === 1 && news.album === 'hqdefault.jpg:480,a:600,b:300' && news.meta === '2026.12.01|台北|高雄' && news.subs === '副標一/Sub 1|副標二/副標二'
      && news.strip === 'v:https://youtu.be/dQw4w9WgXcQ:https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg:1|v:https://example.com/clip.mp4:-:1|img|img',
      `接後台：動態一則一摺疊、副標一筆一行（不出舊的分類）、地點一個一行、影片排在照片前面（只收 http(s)）、相簿照 sort＋寬高、只有日期、沒展開內容＝不能點、底列跑馬燈換首頁 news 的（${JSON.stringify(news)}）`);
    // 點相簿裡的影片＝放大 dialog 開播放器（YouTube 的 iframe、直連的檔＝<video>），同一組可以左右切到照片
    await c.click('main details > summary'); await c.waitForTimeout(700);
    await c.click('main .album-video >> nth=0');
    await c.waitForFunction(() => /** @type {HTMLDialogElement} */ (document.getElementById('figure-dialog')).open);
    await c.waitForTimeout(900);
    const vid = () => c.$eval('#figure-dialog', dlg => { const n = /** @type {any} */ (dlg.querySelector('.figure-dialog-body')?.firstElementChild);
      return `${n?.tagName}:${String(n?.src || '').replace(/[?#].*/, '')}:${dlg.classList.contains('has-video')}:${dlg.classList.contains('has-nav')}:${document.documentElement.dataset.theme || 'light'}`; });
    const v0 = await vid();
    await c.keyboard.press('ArrowRight'); await c.waitForTimeout(200);
    const v1 = await vid();
    await c.keyboard.press('ArrowRight'); await c.waitForTimeout(900);
    const v2 = await vid();
    assert(v0 === 'IFRAME:https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ:true:true:dark' && v1 === 'VIDEO:https://example.com/clip.mp4:true:true:dark' && /^IMG:.*\/a:false:true:light$/.test(v2),
      `接後台：動態相簿裡的影片＝放大 dialog 開播放器、關燈；右鍵切到下一支、再切到照片＝開燈（${v0}｜${v1}｜${v2}）`);
    await c.keyboard.press('Escape');
    await c.waitForFunction(() => !(/** @type {HTMLDialogElement} */ (document.getElementById('figure-dialog')).open));
    await c.goto(base + '/index.html');
    await c.waitForFunction(() => document.querySelector('#page-content .home-news-list li p')?.textContent === '首頁一');
    const home = await c.evaluate(() => [...document.querySelectorAll('#page-content .home-news-list li')]
      .map(li => { const a = /** @type {HTMLAnchorElement | null} */ (li.querySelector(':scope > a')); return a ? (a.getAttribute('href') || '').replace(/^.*\//, '') + (a.target ? '+' + a.target : '') : '-'; }).join());
    assert(home === 'admission.html?item=3,z+_blank,-,-', `接後台：首頁 news 點了＝入學頁那一則（站內）／外部網址（另開）／不安全的網址、都沒填的不能點（${home}）`);
    const boxes = await c.$$eval('#page-content .home-news-list li', ls => ls.map(l => l.querySelector('.home-news-box img') ? 'img' : l.querySelector('.home-news-box') ? 'box' : '-').join());
    assert(boxes === 'img,-,-,-', `接後台：首頁動態有圖＝圖框、沒有圖＝不放圖框（user 2026-11-24；${boxes}）`);
    assert(await c.waitForFunction(() => /** @type {HTMLElement | null} */ (document.querySelector('.site-bar .play-btn'))?.dataset.video === 'https://youtu.be/dQw4w9WgXcQ', null, { timeout: 5000 }).then(() => true, () => false),
      '接後台：首頁影片（單例）的連結填進底列 ▶ 鈕');
    await c.goto(base + '/pages/admission.html?item=3');
    await c.waitForFunction(() => document.querySelector('main .item-row h3')?.textContent === '後台入學一');
    // 首頁連過來（?item=）＝先做完 hover 的蓋黑收直條、才打開那一則（user 2026-11-24：「不是同時做」）：一到還沒開、等一下才開，開的時候直條已經在
    const early = await c.evaluate(() => !!document.querySelector('main .item-list details')?.open);
    const opened = await c.waitForFunction(() => document.querySelector('main .item-list details')?.open, null, { timeout: 5000 }).then(() => true, () => false);
    const adm = await c.evaluate(() => ({ time: document.querySelector('main summary p')?.textContent, desc: document.querySelector('main .fold-body > p')?.textContent,
      pre: getComputedStyle(/** @type {Element} */ (document.querySelector('main .fold-body > p'))).whiteSpace, file: document.querySelector('main .fold-body .link-list a')?.getAttribute('target'),
      stroke: !!document.querySelector('main .item-list details[open] .item-cover') }));
    assert(adm.time === '2027.01.05–01.08' && adm.desc === '第一行\n第二行' && adm.pre === 'pre-line' && adm.file === '_blank' && !early && opened && adm.stroke,
      `接後台：入學的時間（日期用選的、只有日期）、說明換行照留、附件另開、首頁連過來（?item=）＝先做完 hover 才打開那一則（一到 ${early ? '已經開了' : '還沒開'}、${opened ? '後來打開' : '沒打開'}；${JSON.stringify(adm)}）`);

    await c.goto(base + '/pages/curriculum.html');
    await c.waitForFunction(() => document.querySelectorAll('main .page-section').length === 1);
    const cur = await c.evaluate(() => ({ year: document.querySelector('main h2')?.textContent, rows: [...document.querySelectorAll('main .item-list > li')].map(li => li.querySelector('h3')?.textContent + '/' + li.querySelector('p')?.textContent + '/' + (li.querySelector('details') ? 'fold' : 'div')).join() }));
    assert(cur.year === '二年級' && cur.rows === '必修課 A/必修課/fold,選修課/選修/div', `接後台：課程依年級分段、必修在前、介面文字換字、沒說明＝不能點（${JSON.stringify(cur)}）`);

    await c.goto(base + '/pages/faculty-detail.html?id=7');
    await c.waitForFunction(() => document.querySelector('main h1')?.textContent === '後台老師');
    const fd = await c.evaluate(() => ({ subs: [...document.querySelectorAll('main .page-body > .item-row p')].map(p => p.textContent).join(), cv: [...document.querySelectorAll('main .page-section h3')].map(h => h.textContent).join(),
      li: [...document.querySelectorAll('main .page-section li')].map(li => li.textContent).join('|'), title: document.title,
      blocks: document.querySelectorAll('main .subsections > .subsection > h3 + ul').length }));
    assert(fd.subs === '教授' && fd.cv === '學歷,自己加的清單' && fd.li === '2001學士|專長一' && fd.title === '後台老師 - SCAID' && fd.blocks === 2
      && await c.$$eval('main .page-section h3', hs => hs.map(h => h.getAttribute('data-en')).join() === 'Education,自己加的清單' && hs.every(h => !h.hasAttribute('data-label'))),
      `接後台：師資詳細頁照 ?id= 抓、清單照 sort、標題照後台（英文空退中文）、空的清單不出、一個清單一塊（${JSON.stringify(fd)}）`);

    await c.goto(base + '/pages/press.html');
    await c.waitForFunction(() => document.querySelector('main .item-row h3')?.textContent === '報導一');
    assert(await c.evaluate(() => [...document.querySelectorAll('main .item-list > li > *')].map(e => e.tagName + (e.hasAttribute('data-zoom') ? '+zoom' : '') + ':' + (e.querySelector('p')?.textContent || '')).join()) === 'A+zoom:媒體甲,DIV:',
      '接後台：報導有截圖＝點了放大、沒截圖＝不能點；媒體從媒體庫');
    await c.goto(base + '/pages/regulations.html');
    await c.waitForFunction(() => document.querySelector('main .item-row h3')?.textContent === '有連結');
    const reg = await c.evaluate(() => [...document.querySelectorAll('main .page-section')].map(s => s.querySelector('h2')?.textContent + ':' + [...s.querySelectorAll('.item-row')].map(r => r.tagName + (r.getAttribute('href') || '').replace(/^.*\//, '')
      + [...r.querySelectorAll('p')].map(p => '/' + p.textContent + '|' + p.dataset.en).join('')).join('+')).join(' '));
    assert(reg.startsWith('分類甲:Ax/第一行|Line 1/第二行|第二行+Ay 分類乙:DIV') && reg.includes('使用條款'), `接後台：規章單例（依分類分段、副標一行一個、英文空退中文、連結只放 http(s)、沒填段落＝文字段落照留）（${reg}）`);
    // 規章的文字段落（使用條款…）＝同關於、捐款（user 2026-11-24：「使用條款就是跟 about 的一樣，也讓後臺可以 custom 這個文字」）：段落子集合（說明、小節…）、抓的欄位同關於；
    // 沒填清單（items 空）＝清單那幾段照留 HTML 的、只換文字段落。後台沒有 rich text 了（原本這裡測 sanitize）：後台的字一律當純文字、標籤不會變成元素
    await c.unroute(/\/items\/regulations/);
    let regReq = '';
    await c.route(/\/items\/regulations/, r => { regReq = r.request().url(); return ok({ items: [], sections: [{ sort: 1, title_zh: '規章段落', title_en: 'Terms',
      description_zh: '第一段\n\n第二段<script>alert(1)</script>', description_en: 'Para 1', subsections: [{ sort: 1, title_zh: '規章小節', title_en: null, text_zh: '<b>小節內文</b>', text_en: 'Sub text' }] }] })(r); });
    await c.goto(base + '/pages/regulations.html');
    await c.waitForFunction(() => [...document.querySelectorAll('main h2')].some(h => h.textContent === '規章段落'));
    const terms = await c.evaluate(() => {
      const secs = [...document.querySelectorAll('main .page-section')], s = /** @type {Element} */ (secs.find(x => x.querySelector('h2')?.textContent === '規章段落'));
      return { h2: secs.map(x => x.querySelector('h2')?.textContent).join(), lists: document.querySelectorAll('main .item-list').length,
        body: [...s.querySelectorAll(':scope > p, .subsections > .subsection > *')].map(e => `${e.tagName}.${e.className}:${e.textContent}`).join('|'),
        tags: s.querySelectorAll('script, b, .cms-rich').length, dots: document.querySelectorAll('.section-nav-dot').length };
    });
    assert(terms.h2 === '學程規章,表單下載,規章段落' && terms.lists === 2 && terms.tags === 0 && terms.dots === 3 && /sections\.subsections/.test(decodeURIComponent(regReq))
      && terms.body === 'P.whitespace-pre-line mt-md:第一段|P.whitespace-pre-line mt-sm:第二段<script>alert(1)</script>|H3.:規章小節|P.whitespace-pre-line:<b>小節內文</b>',
      `接後台：規章的文字段落＝同關於（說明＋小節、純文字不當 HTML）、清單沒填照留（${JSON.stringify(terms)}）`);
    await c.goto(base + '/pages/qa.html');
    await c.waitForFunction(() => document.querySelector('main h2')?.textContent === '甲');
    assert(await c.evaluate(() => [...document.querySelectorAll('main .page-section')].map(s => s.querySelector('h2')?.textContent + [...s.querySelectorAll('summary')].map(x => x.textContent).join('')).join() + '|' + document.querySelectorAll('.section-nav-dot').length) === '甲問一問三,乙問二|2',
      '接後台：常見問題依分類分段（第一次出現的順序）、段落導覽重排');
    await c.close();
  }

  // grid 疊圖：按 G 開關、記住；桌面 12 欄、手機 4 欄
  await d.goto(base + '/pages/about.html');
  await d.waitForSelector('#site-header .site-bar');
  assert(await css(d, '.grid-overlay', 'display') === 'none', 'grid 預設關');
  await d.keyboard.press('g');
  assert(await css(d, '.grid-overlay', 'display') === 'block' && await d.$$eval('.grid-overlay span', s => s.filter(e => getComputedStyle(e).display !== 'none').length) === 12, '按 G：桌面 12 欄');
  const g1 = await rect(d, '.grid-overlay span'), c1 = await rect(d, 'main .site-container');
  assert(Math.abs(g1.left - 60) < 1 && Math.abs(c1.left + 60 - g1.left) < 1, 'grid 第一欄對齊 container 內距');
  await d.reload();
  await d.waitForSelector('.grid-overlay');
  assert(await css(d, '.grid-overlay', 'display') === 'block', 'grid 開關記住（reload 後還開著）');
  await d.setViewportSize({ width: 390, height: 844 });
  await d.waitForTimeout(100);   // resize 後 media query 偶爾還沒套上
  assert(await d.$$eval('.grid-overlay span', s => s.filter(e => getComputedStyle(e).display !== 'none').length) === 4, '手機 4 欄');
  await d.keyboard.press('g');
  assert(await css(d, '.grid-overlay', 'display') === 'none', '再按 G 關');

  await browser.close();
  server.close();
  const real = errors.filter(e => !/fonts\.g|jsdelivr/.test(e));
  console.log(fails.length ? 'FAIL\n - ' + fails.join('\n - ') : 'PASS (all assertions)');
  if (real.length) console.log('page errors:\n - ' + real.join('\n - '));
  process.exit(fails.length || real.length ? 1 : 0);
})().catch(e => { console.error('CRASH', e); if (fails.length) console.error('failures before the crash:\n - ' + fails.join('\n - ')); server.close(); process.exit(1); });
