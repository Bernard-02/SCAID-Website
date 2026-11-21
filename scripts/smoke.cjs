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
const [, , LOGO_VB_W, LOGO_VB_H] = fs.readFileSync(path.join(ROOT, 'images/Logo Text.svg'), 'utf8').match(/viewBox="([^"]+)"/)[1].trim().split(/[\s,]+/).map(Number);
const DOT_D = 512 * 20 / LOGO_VB_W;   // 桌面（1280 寬，logo 512）hover 圓點直徑＝logo 骨牌的圓孔（user 2026-11-18）
const PAGES = ['contact', 'about', 'partners', 'faculty', 'curriculum', 'news', 'records', 'press', 'admission', 'qa', 'donate', 'regulations', 'sitemap'];
const fails = [], errors = [];
const assert = (c, msg) => { if (!c) fails.push(msg); };
const CORS = { 'Access-Control-Allow-Origin': '*' };
const BG_JS = /modules\/ui\/bg\.js/;
const watch = async (page) => {
  // 背景（bg.js）游標一動就每幀整張重畫：這支 Windows WebKit 是軟體繪圖、幀率會掉很多，其他段落數幀的動畫斷言會誤判
  // → 換成空的；背景自己那段（搜「背景（user 2026-11-21）」）再拿掉。真的 Safari 的效能要在 Mac 上看
  await page.route(BG_JS, r => r.fulfill({ contentType: 'text/javascript', body: 'export const INK = {}; export function initBg() {}' }));
  // 後台（Directus）：測試不靠正式後台的資料——沒另外給假資料的一律回空的（＝各頁留 HTML 的示意，同後台還沒填）。
  // 最先註冊＝優先順序最低（Playwright 後註冊的先比對），下面與各測試自己給的假資料會蓋過它
  await page.route(/scaidcms\.usc\.edu\.tw/, r => r.fulfill({ headers: CORS, json: { data: [] } }));
  // 相簿／封面／輪播的 stock 圖（picsum）換成本地假圖：排版斷言不靠網路、尺寸固定 1200×800（3:2）
  await page.route(/picsum\.photos/, r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#999"/></svg>' }));
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('requestfailed', r => { const u = r.url(); if (new URL(u).hostname === '127.0.0.1' && !u.endsWith('intro-test.mp4')) errors.push(`reqfailed: ${u}（${r.failure()?.errorText}，頁面 ${new URL(page.url()).pathname}）`); });
  // 輪播／相簿的示意圖是外站 Lorem Picsum：測試不靠外網（DNS 一不穩就一排 console error）→ 回一張空的 3:2 SVG
  const stub = page.route(/picsum\.photos/, r => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 2" width="1200" height="800"/>' }));
  // 假 Directus footer 單例（後台網域還是 placeholder，不接會 DNS 失敗）
  return stub.then(() => page.route(/\/items\/footer/, r => r.fulfill({ headers: { 'Access-Control-Allow-Origin': '*' }, json: { data: {
    email: 'cms@example.com', tel: '02 1111 1111', fax: null, address_zh: '後台地址（示意）', address_en: null,
    social: [{ label: 'Instagram', url: 'https://example.com/ig' }, { label: 'Bad', url: 'javascript:alert(1)' }],
    links: [{ label_zh: '後台系所（示意）', label_en: 'CMS Department', url: 'https://example.com/sccd' }, { label_zh: '只有中文（示意）', label_en: null, url: 'https://example.com/zh' }, { label: 'SCCD', url: 'https://example.com/old' }], badge: null,
  } } }))).then(() => page.route(/\/items\/faculty/, r => r.fulfill({ headers: { 'Access-Control-Allow-Origin': '*' }, json: { data: [
    // 假 Directus faculty：副標兩行／只有一筆空的／沒有；沒有業界導師（那段要收掉）
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
// 次選單兩區之間、次選單 → 深色模式＋EN 那組、那組 → 底列 menu 鈕：同一個分區間距；組裡深色模式 → EN＝選項間距（user 2026-11-21）
const menuGaps = (page) => page.evaluate(() => { const r = (el) => el.getBoundingClientRect(), subs = document.querySelectorAll('.menu-sub'), tools = document.querySelector('.menu-tools');
  return { gap: parseFloat(getComputedStyle(document.querySelector('.site-menu-nav')).rowGap), subs: r(subs[1]).top - r(subs[0]).bottom, lang: r(tools).top - r(subs[1]).bottom, bar: r(document.querySelector('.menu-btn .bar-rect')).top - r(tools).bottom,
    item: parseFloat(getComputedStyle(subs[0]).rowGap), tool: r(document.querySelector('.lang-btn')).top - r(document.querySelector('.theme-btn')).bottom,
    toolH: [r(document.querySelector('.theme-btn')).height, r(document.querySelector('.lang-btn')).height] }; });
const menuGapsOk = (g) => [g.subs, g.lang, g.bar].every(x => Math.abs(x - g.gap) < 1) && Math.abs(g.tool - g.item) < 1 && Math.abs(g.toolH[0] - g.toolH[1]) < 1;
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
const openMenu = async (page) => { if (!(await has(page, 'menu-open'))) { await page.click('.menu-btn'); await page.waitForFunction(() => document.documentElement.classList.contains('menu-open')); } };

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
  assert(await css(m, '#page-content', 'paddingTop') === '96px' && await css(m, '#page-content', 'paddingBottom') === '64px', 'mobile main 頂距 top-h／底距 bar-h');
  // 首頁未展開：logo 置中、放大、名字藏
  let lr = await rect(m, '.site-logo');
  assert(Math.abs(lr.cy - 422) < 3 && Math.abs(lr.left + lr.width / 2 - 195) < 2, `index logo 畫面正中（cx ${lr.left + lr.width / 2} cy ${lr.cy}）`);
  assert(Math.abs(lr.width - 358) < 1 && lr.height > 30, `首頁 logo＝鎖定版（沒有長條）、寬吃滿（${lr.width}×${lr.height}）`);
  // logo SVG 走 mask：網址要抓得到（檔名有空白）
  for (const sel of ['.logo-text'])
    assert(await m.$eval(sel, el => { const s = getComputedStyle(el); return fetch((s.maskImage || s.webkitMaskImage).slice(5, -2)).then(r => r.ok, () => false); }), `${sel} mask SVG 抓得到`);
  // 底列：menu＋play 兩個鈕（右下 footer 鈕 user 2026-11-21 搬進選單＝聯絡頁）、名字 hover 才現
  assert(await m.$$eval('.site-bar .bar-btn', b => b.length) === 2, '底列 2 個鈕');
  let nr = await rect(m, '.bar-news');
  assert(Math.abs(nr.left + nr.width / 2 - 195) < 2, `動態在畫面正中（cx ${nr.left + nr.width / 2}）`);
  const br = await rect(m, '.menu-btn .bar-rect');
  assert(Math.abs(844 - (br.top + br.height) - 32) < 4, `底列貼底 bar-pad 32（rect bottom ${844 - br.top - br.height}）`);
  assert(await m.$('.site-bar .play-btn .icon-play') !== null, 'intro 鈕是 play icon');
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
  assert(await css(m, '.bar-plus', 'transform', '::after') === 'none' && await css(m, '.bar-news-track', 'opacity') === '1', '動態：標題＋「+」');
  // 跑馬燈（user 2026-11-21）：好幾則標題排成一排一直跑（兩份接力）、左右兩端淡掉、速度固定（一圈的時間＝內容寬 ÷ 每秒 2.5em）；
  // 跑馬燈＋「＋」一起＝動態欄（＝logo 寬）：跑馬燈從欄的左緣起、＋在右端（右緣＝欄的右緣）
  {
    const mq = () => m.evaluate(() => { const t = document.querySelector('.bar-news-track'), c = /** @type {HTMLElement} */ (t.querySelector('.bar-news-copy')), s = getComputedStyle(t), cs = getComputedStyle(c);
      return { titles: c.children.length, dups: t.querySelectorAll('[data-dup][aria-hidden="true"]').length, anim: cs.animationName, iter: cs.animationIterationCount, dur: parseFloat(cs.animationDuration),
        want: c.offsetWidth / (2.5 * parseFloat(s.fontSize)), mask: s.maskImage || s.webkitMaskImage, tw: t.getBoundingClientRect().width, cw: c.offsetWidth, x: c.getBoundingClientRect().left }; });
    const q0 = await mq();
    await m.waitForTimeout(300);
    const q1 = await mq(), col = await rect(m, '.bar-news'), pl = await rect(m, '.bar-plus');
    assert(q0.titles >= 3 && q0.dups === 1 && q0.anim === 'bar-marquee' && q0.iter === 'infinite' && Math.abs(q0.dur - q0.want) < 0.1 && /linear-gradient/.test(q0.mask) && q0.cw >= q0.tw && q1.x < q0.x - 3,
      `跑馬燈：好幾則標題、兩份接力、一直跑、兩端淡掉、速度固定（${JSON.stringify(q0)} → x ${q1.x}）`);
    const tkr = await rect(m, '.bar-news-track');
    assert(Math.abs(tkr.left - col.left) < 1 && tkr.left + tkr.width <= pl.left && Math.abs(pl.left + pl.width - (col.left + col.width)) < 1 && Math.abs(pl.width - 21) < 1,
      `跑馬燈＋「＋」一起＝動態欄（跑馬燈 ${tkr.left}～${tkr.left + tkr.width}、＋ ${pl.left}～${pl.left + pl.width}、欄 ${col.left}～${col.left + col.width}）`);
  }

  // 選單：透明、內容右推、語言切換。打開時 play 是「移動」過去不是跳過去：逐幀記位置，中途要有落在起點與終點之間的幀
  assert(await css(m, '.bar-blur', 'display') === 'none', '選單沒開：選單鈕背後沒有毛玻璃');
  const play0 = (await rect(m, '.play-btn')).left;
  const playTrack = await m.evaluate(() => new Promise(res => {
    const play = document.querySelector('.play-btn'), out = [];
    /** @type {HTMLElement} */ (document.querySelector('.menu-btn')).click();
    const t0 = performance.now();
    const tick = () => { out.push(play.getBoundingClientRect().left); if (performance.now() - t0 < 700) requestAnimationFrame(tick); else res(out); };
    requestAnimationFrame(tick);
  }));
  const playMid = playTrack.filter(x => x > play0 + 2 && x < 158);
  assert(playMid.length >= 3 && Math.abs(playTrack[playTrack.length - 1] - 160) < 1.5, `選單開：play 滑過去（起 ${play0} 中途 ${playMid.length} 幀 終 ${playTrack[playTrack.length - 1]}）`);
  await openMenu(m);
  assert(await m.$eval('.menu-btn', b => b.getAttribute('aria-expanded')) === 'true', 'aria-expanded');
  await m.waitForTimeout(700);
  assert(await css(m, '.site-menu', 'transform') === 'none', 'menu open');
  assert(await css(m, '.site-menu', 'backgroundColor') === 'rgba(0, 0, 0, 0)', 'menu 無底色');
  // 選單鈕背後的毛玻璃（同 logo 那塊，user 2026-11-21）：選單開著才出現；範圍＝鈕往上、往右外擴，左、下到畫面邊；6 層漸進模糊＋半透明底色
  {
    const bl = await rect(m, '.bar-blur'), btn = await rect(m, '.menu-btn');
    assert(await css(m, '.bar-blur', 'display') === 'block' && bl.left === 0 && Math.abs(bl.top + bl.height - 844) < 1 && bl.top < btn.top - 1 && bl.left + bl.width > btn.left + btn.width + 1
      && await m.$$eval('.bar-blur > i', is => { const s = getComputedStyle(is[5]); return is.length === 6 && /blur\(8px\)/.test(s.backdropFilter || s.webkitBackdropFilter); })
      && await m.$eval('.bar-blur', e => getComputedStyle(e, '::after').opacity) === '0.6',
      `選單鈕毛玻璃：選單開著出現、蓋住鈕到畫面左下、6 層模糊＋底色（${JSON.stringify(bl)} 鈕 ${JSON.stringify(btn)}）`);
  }
  { const g = await menuGaps(m); assert(menuGapsOk(g), `手機選單：次選單分區、網站地圖 → 深色模式、EN → menu 鈕同一個間距，深色模式 → EN＝選項間距（${JSON.stringify(g)}）`); }
  assert(await css(m, '.site-menu', 'width') === '160px', '選單固定寬 10rem');
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
  assert(Math.abs(await tx(m, '#page-content') - 144) < 1, '內容右推 選單寬−內距 144');
  // 選單開著（首頁）：logo 原地換鎖定版、不右推；menu 鈕白圓點常駐、不出名字（user 2026-11-21）、intro 還在
  lr = await rect(m, '.site-logo');
  assert(Math.abs(lr.left + lr.width / 2 - 195) < 2 && Math.abs(lr.cy - 422) < 3, `選單開：logo 原地不動（cx ${lr.left + lr.width / 2} cy ${lr.cy}）`);
  await m.mouse.move(195, 300);   // 移開，確認圓點不是靠 hover 才出
  assert(await css(m, '.menu-btn .bar-rect', 'opacity', '::after') === '1' && await css(m, '.menu-btn .bar-label', 'width') === '0px' && await css(m, '.menu-btn .bar-label', 'opacity') === '0' && await css(m, '.site-menu', 'opacity') === '1', '選單開：選單淡入完、menu 白圓點常駐、不出名字');
  assert(await css(m, '.play-btn', 'visibility') === 'visible', '選單開：intro 還在');
  const plr = await rect(m, '.play-btn');
  assert(Math.abs(plr.left - 160) < 1.5, `選單開：play 移到選單右緣（left ${plr.left}）`);
  let pr = await rect(m, '.bar-plus');
  nr = await rect(m, '.bar-news');
  // 首頁選單開著：動態當內容處理（user 2026-11-21）——跑馬燈留著，整塊模糊＋疊 60% 白、位置不動（先試過跟內容一起右推，user：不用動）；點它＝只收選單、不展開
  assert(await css(m, '.bar-news-track', 'opacity') === '1' && await css(m, '.bar-news', 'filter') === 'blur(4px)' && await css(m, '.bar-news', 'opacity') === '0.4' && Math.abs(await tx(m, '.bar-news')) < 1 && await tx(m, '#page-content') > 100
    && Math.abs(pr.left + pr.width - (nr.left + nr.width)) < 1.5, `選單開：動態模糊、位置不動（位移 ${await tx(m, '.bar-news')}、＋右緣差 ${pr.left + pr.width - nr.left - nr.width}）`);
  // 深色模式／語言切換時動態自己一組、不放靜止的舊截圖（user 2026-11-21：跑馬燈在交叉淡化時會停一下）
  assert(await css(m, '.bar-news', 'viewTransitionName') === 'bar-news', '動態有自己的 view-transition-name');
  await m.evaluate(() => /** @type {HTMLElement} */ (document.querySelector('.bar-news')).click());
  assert(!(await has(m, 'menu-open')) && !(await has(m, 'news-open')), '選單開著點動態：只收選單、不展開');
  await m.waitForTimeout(700);
  assert(await css(m, '.bar-news', 'filter') === 'none' && await css(m, '.bar-news', 'opacity') === '1' && Math.abs(await tx(m, '.bar-news')) < 1, '選單收了：動態回原位、不糊');
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
  assert((await m.textContent('main h1')) === 'Bachelor Program in Advanced Integrated Design, Shih Chien University' && (await m.textContent('.bar-news-copy > span')) === await m.getAttribute('.bar-news-copy > span', 'data-en') && (await m.textContent('[data-dup] > span')) === await m.getAttribute('.bar-news-copy > span', 'data-en'), '切 en：內容標題、動態（接力那份也換）');
  assert(await m.evaluate(() => document.documentElement.lang) === 'en', 'html lang en');
  await swap(m, '.lang-btn');
  assert((await m.textContent('.menu-main a[href="about.html"]')) === '關於' && await m.evaluate(() => document.documentElement.lang) === 'zh-Hant', '切回 zh');
  assert((await m.textContent('main h1')) === '實踐大學AI設計職人學位學程' && (await m.textContent('.bar-news-copy > span')) === await m.getAttribute('.bar-news-copy > span', 'data-zh'), '切回 zh：內容標題、動態');
  assert((await m.textContent('.play-btn .bar-label')) === '簡介', '切回 zh：底列名字');
  // 關選單：play 一樣滑回來（逐幀）
  const playBack = await m.evaluate(() => new Promise(res => {
    const play = document.querySelector('.play-btn'), out = [];
    /** @type {HTMLElement} */ (document.querySelector('.menu-btn')).click();
    const t0 = performance.now();
    const tick = () => { out.push(play.getBoundingClientRect().left); if (performance.now() - t0 < 700) requestAnimationFrame(tick); else res(out); };
    requestAnimationFrame(tick);
  }));
  const backEnd = playBack[playBack.length - 1];
  assert(playBack.filter(x => x > backEnd + 2 && x < 158).length >= 3 && backEnd < 100, `選單關：play 滑回來（終 ${backEnd}）`);
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
  // 選中的選項：文字右邊一顆圓點（user 2026-11-18 方塊改回圓點；直徑＝logo 骨牌的圓孔＝logo 寬×20/viewBox 寬）、不畫底線；沒選中的圓點藏著
  await m.waitForTimeout(450);   // 圓點的現／隱＝fade＋模糊（user 2026-11-21）：換頁後等它淡完
  assert(await m.$eval('.site-menu .nav-link.active', (a, vbW) => { const s = getComputedStyle(a, '::after'), logoW = document.querySelector('.site-logo').getBoundingClientRect().width; return s.opacity === '1' && s.borderRadius === '50%' && Math.abs(parseFloat(s.width) - logoW * 20 / vbW) < 0.2 && Math.abs(parseFloat(s.height) - parseFloat(s.width)) < 0.1 && getComputedStyle(a).textDecorationLine === 'none'; }, LOGO_VB_W), '選中選項：右邊圓點、沒底線');
  assert(await m.$$eval('.site-menu .nav-link:not(.active)', as => as.length === 12 && as.every(a => getComputedStyle(a, '::after').opacity === '0')), '沒選中的選項沒有圓點');
  assert((await css(m, '.site-grid', 'gridTemplateColumns')).split(' ').length === 4, 'mobile grid 4 欄');
  assert((await m.textContent('main h1')).trim() === '網站地圖', 'sitemap h1 zh');
  await m.waitForTimeout(700);   // 選單關閉後 logo 的右推 transition 走完再量位置
  lr = await rect(m, '.site-logo');
  assert(Math.abs(lr.top) < 1, `內頁 logo 頂到頂（top ${lr.top}）`);
  assert(Math.abs(lr.left + lr.width / 2 - 195) < 2, '內頁 logo 置中');

  // 上一頁
  await m.goBack();
  await m.waitForFunction(() => document.body.dataset.page === 'regulations');
  assert((await m.textContent('main h1')).trim() === '規章與政策', 'back → regulations');

  // 內容標題跟語言走：當頁切換＋切換後換頁
  await openMenu(m);
  await swap(m, '.lang-btn');
  assert((await m.textContent('main h1')).trim() === 'Regulations & Policies', '切 en：當頁標題');
  // 內頁選單開：內容左緣（手機＝左緣的段落導覽矩形）推到選單右緣 160＝play 那條線；內文在它右邊一個 rail（48）
  await m.waitForTimeout(700);
  {
    const n = await rect(m, '.section-nav'), h = await rect(m, 'main h1');
    assert(Math.abs(n.left - 160) < 2 && Math.abs(n.left - (await rect(m, '.play-btn')).left) < 2 && Math.abs(h.left - n.left - 48) < 2,
      `手機內頁選單開：導覽矩形＝選單右緣＝play、內文再讓一個 rail（nav ${n.left} h1 ${h.left}）`);
    // 選單開著（user 2026-11-21）：段落導覽淡出收起來、右邊內容不能 hover／點
    assert(await css(m, '.section-nav', 'visibility') === 'hidden' && await css(m, '.section-nav', 'opacity') === '0' && await css(m, '#page-content', 'pointerEvents') === 'none', '選單開：段落導覽收起來、內容不吃指標');
  }
  await m.click('.site-menu a[href="about.html"]');
  await m.waitForFunction(() => document.body.dataset.page === 'about');
  assert((await m.textContent('main h1')).trim() === 'About' && (await m.textContent('main h2')).trim() === 'Competencies', 'en 換頁：新頁標題也是英文');
  assert(await css(m, '.section-nav', 'display') === 'flex' && await css(m, '.page-figure', 'display') === 'none', '手機 about：段落導覽在、右圖不在內文裡（改右緣縮圖鈕）');
  assert((await m.textContent('.figure-dialog-body')).trim() === 'Image', '右圖複本也跟語言走');
  await openMenu(m);
  await swap(m, '.lang-btn');
  assert((await m.textContent('main h1')).trim() === '關於' && (await m.textContent('main h2')).trim() === '培育能力', '切回 zh：標題');
  // 選單開著點右邊內容（落在輪播的上一張上）：第一下只收選單、輪播沒被點到，段落導覽淡回來。
  // 輪播會自動播（只往下一張走）→ 不比整排位置，只看被點的那張（-1）沒跑到中間
  {
    await m.waitForTimeout(700);   // 右推滑完再量
    const sl = await rect(m, '.slide[data-pos="-1"]'), prevIdx = await m.$$eval('.slide', x => x.findIndex(e => e.dataset.pos === '-1'));
    const x = Math.min(sl.left + sl.width / 2, 380);
    assert(await m.evaluate(([px, py]) => document.elementFromPoint(px, py) === document.body, [x, sl.cy]), '選單開著：輪播那一點的 hit target 是 body');
    await m.mouse.click(x, sl.cy);
    await m.waitForFunction(() => !document.documentElement.classList.contains('menu-open'));
    await m.waitForTimeout(400);
    assert(await m.$$eval('.slide', (x, i) => x[i].dataset.pos !== '0', prevIdx) && await m.evaluate(() => document.body.dataset.page) === 'about'
      && await css(m, '.section-nav', 'visibility') === 'visible' && await css(m, '#page-content', 'pointerEvents') === 'auto', '選單開著點內容：只收選單、內容沒反應、段落導覽回來');
  }

  // 底列中間的動態只在首頁（user 2026-11-10）：內頁藏起來、點不到
  assert(await css(m, '.bar-news', 'visibility') === 'hidden' && await css(m, '.bar-news', 'opacity') === '0' && await css(m, '.bar-news', 'filter') === 'blur(4px)', '內頁：底列沒有動態（藏著的那一態＝透明＋糊）');

  // 手機內頁版型（user 2026-11-13 手機稿）：左緣段落導覽（矩形對齊 menu 鈕、從 h1 那條線往下排）、內文左右各讓一個 rail（48）、
  // 右緣中線上的右圖縮圖鈕（右緣對齊內容右內距、不壓內文）；點了 dialog 放大蓋滿畫面，再點任何地方／Esc 淡出後關；選單開著縮圖退場
  await m.waitForFunction(() => getComputedStyle(document.querySelector('.figure-btn')).opacity === '1'
    && new DOMMatrix(getComputedStyle(document.getElementById('page-content')).transform).m41 === 0);
  {
    const th = await rect(m, '.figure-thumb'), mr = await rect(m, '.menu-btn .bar-rect');
    const n = await rect(m, '.section-nav'), b = await rect(m, '.page-body');
    const d0 = await m.$eval('.section-nav-dot', x => x.getBoundingClientRect().top + parseFloat(getComputedStyle(x).paddingTop));   // 第一格矩形上緣
    // 最上面那一格＝頁標題（user 2026-11-18／21）：跟段落同高的矩形（寬 0.45em，導覽字級 14 → 6.3；高 22.4）、
    // 中心對在 h1 第一行的中線；段落的第一格在它下面隔 0.5em（7）
    const tp = await m.$eval('.section-nav-top', x => { const s = getComputedStyle(x, '::before'), h = parseFloat(s.height); return { cy: x.getBoundingClientRect().top + parseFloat(getComputedStyle(x).paddingTop) + h / 2, w: parseFloat(s.width), h, round: s.borderRadius }; });
    const h1c = await m.$eval('main h1', h => h.getBoundingClientRect().top + parseFloat(getComputedStyle(h).lineHeight) / 2);
    const r0 = await m.$eval('.section-nav-dot', x => parseFloat(getComputedStyle(x, '::before').height));
    assert(await m.$$eval('.section-nav-dot', x => x.length) === 3 && Math.abs(n.left - mr.left) < 1 && Math.abs(tp.cy - h1c) < 1 && Math.abs(tp.w - 6.3) < 0.1 && Math.abs(tp.h - 22.4) < 0.1 && tp.round === '0px'
      && Math.abs(r0 - 22.4) < 0.1 && Math.abs(d0 - (tp.cy + tp.h / 2 + 7)) < 1,
      `手機段落導覽：頁標題那一格＋3 格、矩形左緣對齊 menu 鈕、頁標題那格跟段落同高且中心＝h1 第一行中線、段落的長矩形在下面（left ${n.left} vs ${mr.left}、${JSON.stringify(tp)} vs ${h1c}、段落第一格 top ${d0}）`);
    assert(Math.abs(b.left - 64) < 1 && Math.abs(b.left + b.width - 326) < 1, `手機內文左右各讓 48（${b.left}～${b.left + b.width}）`);
    assert(Math.abs(th.left + th.width - 374) < 1 && Math.abs(th.cy - 422) < 1 && th.width === 32 && th.height === 32 && th.left - (b.left + b.width) >= 15,
      `縮圖鈕：右緣對齊內距、畫面中線、32 見方、不壓內文（right ${th.left + th.width}、cy ${th.cy}、${th.width}×${th.height}、離內文 ${th.left - b.left - b.width}）`);
    assert(await m.$eval('#figure-dialog', d => d.open) === false && await css(m, '#figure-dialog', 'display') === 'none', '放大 dialog 預設關');
    // 點導覽最後一段 → 那段頂捲到 h1 原本的位置（手機也撐高最後一段）
    const y0 = (await rect(m, 'main h1')).top;
    await m.click('.section-nav-dot[data-i="2"]');
    await m.evaluate(() => new Promise(r => { let last = -1; const t = () => { if (scrollY === last) r(scrollY); else { last = scrollY; setTimeout(t, 150); } }; setTimeout(t, 150); }));
    const y2 = await m.$$eval('.page-section', ss => ss[2].getBoundingClientRect().top);
    assert(Math.abs(y2 - y0) < 1.5 && await m.$eval('.section-nav-dot[data-i="2"]', x => x.getAttribute('aria-current') === 'true'), `手機段落導覽：點最後一段 → 段落頂對齊 h1 位置（${y2} vs ${y0}）`);
    await m.evaluate(() => scrollTo({ top: 300, behavior: 'instant' }));
    await m.click('.figure-btn');
    await m.waitForFunction(() => getComputedStyle(document.querySelector('#figure-dialog')).opacity === '1');
    const dr = await rect(m, '#figure-dialog'), ir = await rect(m, '.figure-dialog-body > *'), cr = await rect(m, '.figure-nav');
    assert(await css(m, '#figure-dialog', 'backgroundColor') === 'rgba(0, 0, 0, 0)' && await css(m, '#page-content', 'filter') === 'blur(4px)' && await css(m, '#page-content', 'opacity') === '0.4' && await css(m, '.site-bar', 'filter') === 'blur(4px)' && await css(m, '.site-logo', 'filter') === 'none' && await m.$eval('.top-blur', t => getComputedStyle(t, '::after').opacity) === '0', '放大 dialog：背後的內容與底列模糊＋疊白（同選單開著）、logo 照常清楚');
    assert(await m.$eval('#figure-dialog', d => d.open) && dr.top === 0 && dr.left === 0 && dr.width === 390 && dr.height === 844, `點縮圖：dialog 蓋滿畫面（${JSON.stringify(dr)}）`);
    assert(Math.abs(ir.width - 358) < 1 && Math.abs(ir.height - 358) < 1 && Math.abs(ir.left - 16) < 1 && (await m.textContent('.figure-dialog-body')).trim() === '圖片',
      `放大的圖：內容寬、方形（${ir.width}×${ir.height} left ${ir.left}）`);
    assert(Math.abs(cr.left + cr.width / 2 - 195) < 1 && Math.abs(cr.cy - mr.cy) < 1 && await css(m, '.figure-prev', 'display') === 'none' && await m.$('.figure-close .icon-close') !== null,
      `控制列：X 正中、跟底列矩形同高、只有一張不出左右（cx ${cr.left + cr.width / 2} cy ${cr.cy}）`);
  }
  await m.mouse.click(195, 300);
  assert(await m.$eval('#figure-dialog', d => d.open && d.classList.contains('is-closing')), '點一下放大圖：先淡出');
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
  await m.waitForFunction(() => document.querySelector('[data-cms="email"] a')?.textContent === 'cms@example.com');
  assert((await m.textContent('main h1')).trim() === '聯絡' && (await m.textContent('main')).includes('電子郵件'), '聯絡頁：標題＋內容');
  assert(await m.$eval('[data-cms="email"] a', a => a.textContent === 'cms@example.com' && a.getAttribute('href') === 'mailto:cms@example.com'), '聯絡頁後台：email');
  assert(await css(m, '[data-cms="fax"]', 'display') === 'none' && await css(m, '.footer-badge', 'display') === 'none' && (await m.textContent('[data-cms="tel"] dd')) === '02 1111 1111', '聯絡頁後台：空欄位收掉');
  assert(JSON.stringify(await m.$$eval('.footer-social-box', a => a.map(x => x.getAttribute('href')))) === '["https://example.com/ig","#"]', '聯絡頁後台：社群連結、javascript: 擋掉');
  assert(await m.$eval('[data-cms="address"] dd', d => d.dataset.en === '後台地址（示意）') && await m.$('.footer-copyright') === null, '聯絡頁後台：英文空退中文；沒有版權那一行（user 2026-11-21）');
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

  // intro（只在首頁）：沒 data-video 不開；有就開 dialog、右上鈕關
  await m.waitForFunction(() => getComputedStyle(document.querySelector('.play-btn')).visibility === 'visible');
  await m.click('.play-btn');
  assert(await m.$eval('#intro-dialog', d => d.open) === false, '無影片不開 dialog');
  await m.evaluate(() => { document.querySelector('.play-btn').setAttribute('data-video', 'intro-test.mp4'); });
  await m.click('.play-btn');
  assert(await m.$eval('#intro-dialog', d => d.open) === true, '有影片開 dialog');
  await m.click('.intro-close');
  assert(await m.$eval('#intro-dialog', d => d.open) === false, 'dialog 關');
  await m.waitForFunction(() => getComputedStyle(document.querySelector('.figure-btn')).visibility === 'hidden');   // 首頁沒有右圖 → 縮圖鈕退場
  // 清單出現＝從畫面底下往上滑進來、不是直接跳出來（user 2026-11-19）：點下去逐幀記清單的上緣（還沒出來＝null）。
  // 順序（user 2026-11-21）：底列跑馬燈先淡出，淡完 logo 與清單才一起往上 → 一起記跑馬燈的透明度、logo 的上緣
  const rise = await m.evaluate(() => new Promise(res => {
    const el = document.querySelector('.home-news-list'), track = document.querySelector('.bar-news-track'), logo = document.querySelector('.site-logo'), out = [];
    /** @type {HTMLElement} */ (document.querySelector('.bar-news')).click();
    const t0 = performance.now();
    const tick = () => { const cs = getComputedStyle(el); out.push(cs.display === 'none' ? null : [Math.round(el.getBoundingClientRect().top), Number(cs.opacity), Number(getComputedStyle(track).opacity), Math.round(logo.getBoundingClientRect().top), document.querySelector('.bar-plus').getBoundingClientRect().left - document.querySelector('.bar-news').getBoundingClientRect().right]); if (performance.now() - t0 < 1300) requestAnimationFrame(tick); else res(out); };
    requestAnimationFrame(tick);
  }));
  await m.waitForFunction(() => document.documentElement.classList.contains('news-open'));
  assert(new URL(m.url()).pathname === '/', '展開不換頁');
  assert(await css(m, '.home-news-list', 'display') === 'block', '清單出來');
  {
    const fr = rise.filter(f => f !== null), ys = fr.map(f => f[0]), os = fr.map(f => f[1]);
    assert(ys[0] > 700 && ys.at(-1) === 96 && ys.filter(y => y > 110 && y < 700).length >= 5 && ys.every((y, k) => k === 0 || y <= ys[k - 1]),
      `清單從畫面底下升上來（上緣 ${ys[0]} → ${ys.at(-1)}，中途 ${ys.filter(y => y > 110 && y < 700).length} 幀）`);
    assert(os[0] < 0.2 && os.at(-1) === 1 && os.filter(o => o > 0.05 && o < 0.95).length >= 5 && os.every((o, k) => k === 0 || o >= os[k - 1] - 0.001),
      `清單邊升邊淡入（opacity ${os[0]} → ${os.at(-1)}，中途 ${os.filter(o => o > 0.05 && o < 0.95).length} 幀）`);
    const go = fr.findIndex(f => f[0] < ys[0] - 2), goLogo = fr.findIndex(f => f[3] < fr[0][3] - 2);   // 清單／logo 開始動的那一幀
    assert(fr[0][2] > 0.5 && go >= 5 && fr[go][2] < 0.1 && fr.slice(0, go).filter(f => f[2] > 0.05 && f[2] < 0.95).length >= 5 && Math.abs(goLogo - go) <= 2,
      `展開的順序：跑馬燈先淡出、淡完清單與 logo 才一起往上（第 ${go} 幀清單動、第 ${goLogo} 幀 logo 動，那時跑馬燈 ${fr[go]?.[2]}，一開始 ${fr[0][2]}）`);
    // ＋往右滑出欄外，跟跑馬燈淡出同一段（user 2026-11-21）：清單開始動之前滑完、途中有過場。位置＝＋左緣相對動態欄右緣（−21 在欄內右端 → ＋16 欄外一個 gutter；
    // 用相對的：側欄的名字收寬時欄寬會變）
    const px = fr.map(f => f[4]), pEnd = px.at(-1);
    assert(Math.abs(px[0] + 21) < 3 && Math.abs(pEnd - 16) < 1.5 && Math.abs(px[go] - pEnd) < 1.5 && px.slice(0, go).filter(x => x > px[0] + 2 && x < pEnd - 2).length >= 5 && px.every((x, k) => k === 0 || x >= px[k - 1] - 0.01),
      `展開：＋跟跑馬燈淡出同時往右滑到欄外（${px[0]} → ${pEnd}，清單開始動時 ${px[go]}）`);
  }
  await m.waitForTimeout(700);
  // 底列：標題退掉、＋滑到動態欄外右邊一個 gutter（不擋圖）、大小同＋、變－
  pr = await rect(m, '.bar-plus');
  nr = await rect(m, '.bar-news');
  assert(await css(m, '.bar-plus', 'transform', '::after') !== 'none' && await css(m, '.bar-news-track', 'opacity') === '0', '＋變－、標題退掉');
  assert(Math.abs(pr.left - (nr.left + nr.width) - 16) < 1.5 && Math.abs(pr.width - 21) < 1, `−在動態欄右邊一個 gutter、同＋大小（差 ${pr.left - nr.left - nr.width} w ${pr.width}）`);
  lr = await rect(m, '.site-logo');
  assert(Math.abs(lr.top) < 1, `展開後 logo 到頂（top ${lr.top}）`);
  { const box = await rect(m, '.home-news-box');   // 手機：動態圖片跟 logo 左右對齊（user 2026-11-21）
    assert(Math.abs(box.left - lr.left) < 0.5 && Math.abs(box.width - lr.width) < 0.5, `手機動態圖片＝logo 寬、左右對齊（圖 ${box.left}～${box.left + box.width}、logo ${lr.left}～${lr.left + lr.width}）`); }
  assert(await m.evaluate(() => document.documentElement.scrollHeight > innerHeight), '展開後可捲');
  await m.evaluate(() => scrollTo({ top: 400, behavior: 'instant' }));
  assert(await m.evaluate(() => scrollY >= Math.min(400, document.documentElement.scrollHeight - innerHeight) - 1 && scrollY > 0), '捲得下去');
  // 收合＝反向動畫（user 2026-11-19）：清單往下滑出畫面、滑完才藏起來捲回頂。捲到一半（400）收：畫面上緣以上的那一截先切掉，
  // 不會跟著從上面滑進來。逐幀記「看得到的頂端」（清單上緣＋切掉的高）；藏起來了＝null
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
    assert(ys.length >= 8 && ys[0] < 60 && ys.at(-1) > 780 && ys.every((y, k) => y >= 0 && (k === 0 || y >= ys[k - 1])) && fall.at(-1) === null,
      `收合：清單看得到的頂端從畫面上緣一路往下滑出去、滑完才藏（${ys[0]} → ${ys.at(-1)}，${ys.length} 幀）`);
    assert(os[0] > 0.8 && os.at(-1) < 0.1 && os.filter(o => o > 0.05 && o < 0.95).length >= 5 && os.every((o, k) => k === 0 || o <= os[k - 1] + 0.001),
      `收合：清單邊滑邊淡出（opacity ${os[0]} → ${os.at(-1)}，中途 ${os.filter(o => o > 0.05 && o < 0.95).length} 幀）`);
    await m.waitForFunction(() => getComputedStyle(document.querySelector('.bar-news-track')).opacity === '1');
    assert(fr.every(f => f[2] < 0.05), `收合的順序：清單滑走了跑馬燈才淡回來（滑的途中最大 ${Math.max(...fr.map(f => f[2]))}）`);
    await m.waitForTimeout(450);
    { const col = await rect(m, '.bar-news'), pl = await rect(m, '.bar-plus'); assert(Math.abs(pl.left + pl.width - (col.left + col.width)) < 1, `收合：＋跟跑馬燈一起回到欄的右端（右緣差 ${pl.left + pl.width - col.left - col.width}）`); }
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
  await openMenu(m);
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
  assert((await m.textContent('main h1')).trim() === '404', '404 page');
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
    const bk = await rect(m, '.back-btn .icon'), ph = await rect(m, '.profile-photo'), mr = await rect(m, '.menu-btn .bar-rect');
    await m.evaluate(() => scrollTo({ top: 600, behavior: 'instant' }));
    assert(Math.abs(bk.left - mr.left) < 1 && Math.abs(bk.top - ph.top) < 1 && Math.abs((await rect(m, '.back-btn .icon')).top - bk.top) < 1,
      `手機返回鈕：對齊 menu 鈕、照片上緣、捲動後 sticky（${bk.left},${bk.top} vs ${mr.left},${ph.top}）`);
  }

  // ── 桌面 1280 ──
  const d = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await watch(d);
  await d.goto(base + '/pages/about.html');
  await d.waitForSelector('#site-header .site-bar');
  assert(await css(d, '#page-content', 'paddingTop') === '112px', 'desktop 頂距 7rem');
  assert(await css(d, '.figure-btn', 'display') === 'none' && await css(d, '.page-figure', 'display') === 'block', 'desktop：右圖在內文旁、沒有縮圖鈕');
  assert(await css(d, '.site-container', 'paddingLeft') === '60px', 'desktop container padding 60');
  // 整站不能左右捲：桌面 Chrome 選單開過再關會留一段可捲寬度（webkit 重現不了，這裡只守規則還在）
  assert(await css(d, 'html', 'overflowX') === 'hidden', 'html 擋橫向捲動');
  assert((await css(d, '.site-grid', 'gridTemplateColumns')).split(' ').length === 12, 'desktop grid 12 欄');
  // logo 的框＝SVG viewBox 的比例（圖剛好撐滿框）：對不上的話圖用 contain 縮在框裡、左右各空一截，看起來比動態窄（2026-11-21 換圖後踩過）
  { const lt = await rect(d, '.logo-text');
    assert(Math.abs(lt.width / lt.height - LOGO_VB_W / LOGO_VB_H) < 0.01, `logo 框的比例＝SVG viewBox（框 ${(lt.width / lt.height).toFixed(3)}、SVG ${(LOGO_VB_W / LOGO_VB_H).toFixed(3)}；不對就改 variables.css --logo-vb-w／h）`); }
  // 底列 menu 鈕＝logo 兩端那顆骨牌的大小（user 2026-11-18）：1280 寬 logo 512 → 骨牌 512×70/viewBox 寬、45:70
  const blockR = await rect(d, '.menu-btn .bar-rect');
  assert(Math.abs(blockR.height - 512 * 70 / LOGO_VB_W) < 0.5 && Math.abs(blockR.width - blockR.height * 45 / 70) < 0.5 && Math.abs((await rect(d, '.site-logo')).width - 512) < 0.5, `底列骨牌同 logo 骨牌大小（${blockR.width}×${blockR.height}）`);
  // about 內頁版型（user 2026-11-18）：只有 Page title text-lg、Section title text-md（user 2026-11-21：每一頁都這樣）、Lead text-s（user 2026-11-21 從 md 改）、Subsection title text-s（user 2026-11-21 改過 md 又改回 s）；title＝Medium、Lead 與內文＝Regular，都不用粗體（user 2026-11-21）；內文 text-s；內文從 col 2 起；col 1 段落導覽（矩形左緣對齊 menu 鈕）
  const fw = (sel, size, weight) => d.$$eval(sel, (els, [sz, w]) => els.every(e => getComputedStyle(e).fontSize === sz && getComputedStyle(e).fontWeight === w), [size, weight]);
  assert(await fw('main h1', '32px', '500') && await fw('main h2', '21.6px', '500') && await fw('main p.page-lead', '18.4px', '400') && await fw('main h3', '18.4px', '500')
    && await fw('main .page-section :is(p:not(.text-xs), li)', '18.4px', '400'),
    'about 頁標題 32px（lg 桌面 2rem，user 2026-11-21）、段落標題 21.6px、小節標題 18.4px＝Medium；導言、內文 18.4px＝Regular（user 2026-11-21）');
  // Subsection title → 內文＝xs（8px），掛在標題的 margin-bottom（user 2026-11-21，試過 sm）；條列裡的項目標題不算，照舊
  assert(await d.$$eval('main .page-section > h3', hs => hs.length > 0 && hs.every(h => getComputedStyle(h).marginBottom === '8px'
    && Math.abs(h.nextElementSibling.getBoundingClientRect().top - h.getBoundingClientRect().bottom - 8) < 0.5)), '小節標題下面隔 xs（8px）');
  const col2 = 60 + (1280 - 120 - 11 * 24) / 12 + 24;   // 內距＋一欄＋gutter
  assert(Math.abs((await rect(d, 'main h1')).left - col2) < 1, `about 內文從 col 2 起（h1 ${(await rect(d, 'main h1')).left} vs ${col2}）`);
  const dotL = async () => (await rect(d, '.section-nav-dot')).left + 12;   // 矩形畫在 ::before、按鈕左右內距 0.6em
  assert(await d.$$eval('.section-nav-dot', b => b.length) === 3 && Math.abs(await dotL() - 60) < 1, `段落導覽 3 格、矩形左緣對齊 menu 鈕（${await dotL()}）`);
  const navState = () => d.evaluate(() => ({ cur: [...document.querySelectorAll('.section-nav-dot')].findIndex(b => b.getAttribute('aria-current') === 'true'),
    tops: [...document.querySelectorAll('.page-section')].map(t => t.getBoundingClientRect().top) }));
  const settle = () => d.evaluate(() => new Promise(r => { let last = -1; const t = () => { if (scrollY === last) r(scrollY); else { last = scrollY; setTimeout(t, 150); } }; setTimeout(t, 150); }));
  let ns = await navState();
  const alignY = (await rect(d, 'main h1')).top;   // 對齊線＝h1 在頁頂的位置（--top-h 112）
  // 最上面那一格＝頁標題：在頁頂（還沒捲到第一段）亮的是它、段落的矩形都不亮；導覽裡只有它＋段落的矩形，沒有 chevron
  assert(ns.cur === -1 && await d.$eval('.section-nav-top', b => b.getAttribute('aria-current') === 'true' && b.getAttribute('aria-labelledby') === document.querySelector('main h1').id)
    && await d.$$eval('.section-nav > *', bs => bs.map(b => b.className).join()) === 'section-nav-top,section-nav-dot,section-nav-dot,section-nav-dot', '段落導覽：一開始亮的是頁標題那一格、只有它＋段落的矩形');
  // 點哪段＝那段頂捲到 h1 的位置；最後一段也捲得到（最後一段撐高）
  for (const i of [1, 2]) {
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
  // 段落輪播（user 2026-11-21）：點左右那張照常換、計時從頭算；滑鼠移開後每 4 秒自己換下一張；滑鼠停在上面＝暫停
  {
    const center = () => d.evaluate(() => [...document.querySelectorAll('.slideshow')[0].querySelectorAll('.slide')].findIndex(s => s.dataset.pos === '0'));
    const n = await d.evaluate(() => document.querySelectorAll('.slideshow')[0].querySelectorAll('.slide').length);
    // 每張的模糊量（照 HTML 的順序）、位置
    const blurs = () => d.evaluate(() => [...document.querySelectorAll('.slideshow')[0].querySelectorAll('.slide')].map(el => [el.dataset.pos, parseFloat((/blur\(([\d.]+)px\)/.exec(getComputedStyle(el).filter) || [0, 0])[1])]));
    await d.hover('.slideshow >> nth=0');   // 先停在上面＝暫停，讀到的位置才不會被自動播換掉
    await d.waitForTimeout(500);
    const c0 = await center();
    // 景深（user 2026-11-21）：焦點永遠在中間那個位置——中間清楚、左右糊一格（框寬 1.1%）、藏著的糊兩格；整張失焦（filter 掛在 .slide 本身、沒有另外蓋一層）
    const box = await rect(d, '.slideshow >> nth=0'), step = box.width * 0.011, b0 = await blurs();
    assert(n === 5 && await d.$('.lens') === null && b0.every(([pos, b]) => Math.abs(b - Math.min(Math.abs(Number(pos)), 2) * step) < 0.1),
      `輪播景深：中間清楚、左右糊 ${step.toFixed(2)}px、藏著的更糊（${JSON.stringify(b0)}）`);
    await d.click('.slideshow >> nth=0 >> .slide[data-pos="1"]');
    const c1 = await center();
    assert(c1 === (c0 + 1) % n, `輪播：點下一張照常換（${c0} → ${c1}）`);
    // 模糊跟著位置走：滑到中間的那張途中慢慢對焦、退到旁邊的慢慢失焦；滑完中間那張清楚。
    // 途中＝每一幀讀、抓到兩張都在半路的那一幀就停（固定等幾毫秒再讀，機器一忙過場還沒開始就讀到起點，2026-11-21 踩過）
    const bm = await d.evaluate(([c0, c1, step]) => new Promise(res => {
      const s = [...document.querySelectorAll('.slideshow')[0].querySelectorAll('.slide')], b = (/** @type {Element} */ el) => parseFloat((/blur\(([\d.]+)px\)/.exec(getComputedStyle(el).filter) || [0, '0'])[1]);
      const mid = (/** @type {number} */ v) => v > 0.1 && v < step - 0.1, t0 = performance.now();
      const tick = () => { const n = b(s[c1]), o = b(s[c0]); if (mid(n) && mid(o)) res([n, o]); else if (performance.now() - t0 > 1500) res(null); else requestAnimationFrame(tick); };
      tick();
    }), [c0, c1, step]);
    await d.waitForTimeout(700);
    const b1 = await blurs();
    assert(bm && b1[c1][1] === 0 && Math.abs(b1[c0][1] - step) < 0.1 && b1[c0][0] === '-1',
      `輪播景深：滑到中間的途中對焦、退到旁邊失焦（途中 新中間／舊中間 ${bm ? bm.map(v => v.toFixed(1)).join('／') : '沒抓到半路的一幀'}，滑完 ${b1[c1][1]}／${b1[c0][1].toFixed(1)}）`);
    await d.mouse.move(640, 790);
    await d.waitForTimeout(4300);
    const c2 = await center();
    assert(c2 === (c1 + 1) % n, `輪播自動播：點完 4 秒換下一張（${c1} → ${c2}）`);
    await d.hover('.slideshow >> nth=0');
    await d.waitForTimeout(4300);
    assert(await center() === c2, '輪播：滑鼠停在上面＝不自動換');
  }
  assert(await css(d, '#custom-scrollbar-thumb', 'display') === 'block', 'about 長頁：自製捲軸 thumb');
  // 右圖（user 2026-11-19）：4 欄寬方形、在「內容區右緣～畫面右緣 1280」那段的正中；選單開著內容右推 228 → 那段空間變窄、
  // 右圖跟著在新空間重新置中（中心往右 114）並縮小（寬少掉 228）＝兩邊留白跟原本一樣
  const fig0 = await rect(d, '.page-figure > *'), pb = await rect(d, '.page-body');
  const figMid = (pb.left + pb.width + 1280) / 2, colW4 = (1280 - 120 - 11 * 24) / 12 * 4 + 3 * 24;
  assert(Math.abs(fig0.left + fig0.width / 2 - figMid) < 1 && Math.abs(fig0.width - colW4) < 1 && Math.abs(fig0.height - fig0.width) < 1,
    `desktop 右圖：4 欄寬方形、在內容右緣～畫面右緣正中（中心 ${fig0.left + fig0.width / 2} vs ${figMid}、寬 ${fig0.width}）`);
  await openMenu(d);
  await d.waitForTimeout(600);
  assert(await css(d, '.page-body', 'filter') === 'blur(4px)' && await css(d, '.page-body', 'opacity') === '0.4' && await css(d, '.page-figure', 'opacity') === '1' && await css(d, '.page-figure', 'filter') === 'none' && await d.$eval('.top-blur', t => getComputedStyle(t, '::after').opacity) === '0', '選單開著：內容模糊、右圖照常、logo 後面不疊白');
  // 選單 15 列（加了深色模式鈕，user 2026-11-21）在 800 高放不下（要 604、只有 574）→ 改在 900 高量間距；更矮時選單自己捲
  await d.setViewportSize({ width: 1280, height: 900 });
  { const g = await menuGaps(d); assert(menuGapsOk(g), `桌面選單（900 高）：次選單分區、網站地圖 → 深色模式、EN → menu 鈕同一個間距，深色模式 → EN＝選項間距（${JSON.stringify(g)}）`); }
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
  assert(await css(d, '.site-menu', 'width') === '288px' && Math.abs((await rect(d, '.play-btn')).left - 288) < 1.5, 'desktop 選單固定寬 18rem、play 移到右緣');
  // 窄桌面 logo 左緣跑進選單字裡 → 至少讓開選單文字一個內距
  await d.setViewportSize({ width: 800, height: 800 });
  await d.waitForTimeout(600);
  const navR = await d.$$eval('.site-menu .nav-link, .site-menu .lang-btn', els => Math.max(...els.map(e => e.getBoundingClientRect().right)));
  h1r = await rect(d, '.section-nav');
  assert(h1r.left >= navR + 59 && Math.abs(h1r.left - 288) < 2, `800 寬選單開：內容左緣＝選單右緣、讓開選單字（nav ${h1r.left} 選單字右 ${navR}）`);
  await d.setViewportSize({ width: 1280, height: 800 });
  await d.keyboard.press('Escape');
  await d.goto(base + '/index.html');
  await d.waitForSelector('#site-header .site-bar');
  lr = await rect(d, '.site-logo');
  assert(Math.abs(lr.left + lr.width / 2 - 640) < 2 && Math.abs(lr.cy - 400) < 3, `desktop index logo 畫面正中（cx ${lr.left + lr.width / 2} cy ${lr.cy}）`);
  assert(await css(d, '#custom-scrollbar-thumb', 'display') === 'none', '短頁（首頁未展開）無捲軸 thumb');
  assert((await css(d, '.site-bar', 'gridTemplateColumns')).split(' ').length === 3 && await css(d, '.site-bar', 'paddingLeft') === '60px', 'desktop 底列三欄');
  nr = await rect(d, '.bar-news');
  assert(Math.abs(nr.left + nr.width / 2 - 640) < 2 && Math.abs(nr.width - 512) < 2, `desktop 動態置中、寬＝圖片 32rem（cx ${nr.left + nr.width / 2} w ${nr.width}）`);
  { const tk = await rect(d, '.bar-news-track'), pl = await rect(d, '.bar-plus');
    assert(Math.abs(tk.left - lr.left) < 1 && Math.abs(pl.left + pl.width - (lr.left + lr.width)) < 1 && tk.left + tk.width <= pl.left, `desktop 跑馬燈＋「＋」一起對齊 logo 的寬（跑馬燈左 ${tk.left}、＋右 ${pl.left + pl.width}、logo ${lr.left}～${lr.left + lr.width}）`); }
  // hover menu 鈕（user 2026-11-21）：不出名字＝play 不動、動態中心不動
  const playHome = (await rect(d, '.play-btn')).left;
  await d.hover('.menu-btn');
  await d.waitForTimeout(550);
  nr = await rect(d, '.bar-news');
  assert(Math.abs((await rect(d, '.play-btn')).left - playHome) < 0.5 && Math.abs(nr.left + nr.width / 2 - 640) < 2 && await css(d, '.menu-btn .bar-label', 'width') === '0px',
    'hover menu 鈕：不出名字、play 不動、動態中心不動');
  // 名字的現／隱（play 鈕的「簡介」；user 2026-11-21）：寬是長出來的、邊長邊淡入；移開＝邊淡出邊收寬，收完重量底列
  {
    const side = () => d.$eval('.site-bar', b => parseFloat(b.style.getPropertyValue('--side-min')));
    const sideBefore = await side();
    await d.hover('.play-btn');
    await d.waitForTimeout(550);
    const sideHover = await side(), fullW = parseFloat(await css(d, '.play-btn .bar-label', 'width'));
    nr = await rect(d, '.bar-news');
    assert(fullW > 0 && await css(d, '.play-btn .bar-label', 'opacity') === '1' && sideHover > sideBefore && Math.abs(nr.left + nr.width / 2 - 640) < 2,
      `hover play 鈕：名字長出來（寬 ${fullW}）、底列重量（${sideBefore} → ${sideHover}）、動態中心不動`);
    await d.mouse.move(640, 400);
    await d.waitForTimeout(150);
    const mid = [parseFloat(await css(d, '.play-btn .bar-label', 'width')), Number(await css(d, '.play-btn .bar-label', 'opacity'))];
    await d.waitForTimeout(500);
    assert(mid[0] > 0 && mid[0] < fullW && mid[1] > 0 && mid[1] < 1 && await css(d, '.play-btn .bar-label', 'width') === '0px' && await css(d, '.play-btn .bar-label', 'opacity') === '0'
      && await side() < sideHover, `移開 play 鈕：名字邊淡出邊收寬（途中 ${mid}、全寬 ${fullW}）、收完重量底列`);
  }
  // 側邊放不下名字時才縮動態（窄桌面 800）：兩側等寬＝中心仍在畫面正中
  await d.setViewportSize({ width: 800, height: 800 });
  await d.hover('.play-btn');
  await d.waitForTimeout(550);
  nr = await rect(d, '.bar-news');
  assert(Math.abs(nr.left + nr.width / 2 - 400) < 2 && nr.width < 480, `800 寬 hover：動態縮、仍置中（cx ${nr.left + nr.width / 2} w ${nr.width}）`);
  await d.setViewportSize({ width: 1280, height: 800 });
  await d.mouse.move(640, 300);
  await d.waitForTimeout(150);
  await d.click('.bar-news');
  await d.waitForFunction(() => document.documentElement.classList.contains('news-open'));
  // 捲軸出現＝淡入（user 2026-11-21）：一出現的那一幀還沒全實
  const thumbO = await d.evaluate(() => new Promise(res => { const t = document.getElementById('custom-scrollbar-thumb');
    const tick = () => { if (getComputedStyle(t).display === 'block') res(Number(getComputedStyle(t).opacity)); else requestAnimationFrame(tick); }; tick(); }));
  assert(parseFloat(await css(d, '#custom-scrollbar-thumb', 'height')) > 40 && thumbO < 1 && await css(d, '#custom-scrollbar-thumb', 'animationName') === 'fade-in', `展開後自製捲軸 thumb 出現、淡入（剛出現 opacity ${thumbO}）`);
  const ur = await rect(d, '.home-news-list > ul');
  assert(Math.abs(ur.left + ur.width / 2 - 640) < 2 && Math.abs(ur.width - 512) < 2, `desktop 清單畫面中間 32rem（cx ${ur.left + ur.width / 2} w ${ur.width}）`);
  { const box = await rect(d, '.home-news-box'), lt = await rect(d, '.logo-text');   // 動態圖片跟 logo 左右對齊（user 2026-11-21）
    assert(Math.abs(box.left - lt.left) < 0.5 && Math.abs(box.width - lt.width) < 0.5, `desktop 動態圖片＝logo 寬、左右對齊（圖 ${box.left}～${box.left + box.width}、logo ${lt.left}～${lt.left + lt.width}）`); }
  await d.waitForTimeout(1100);   // 跑馬燈先淡出（0.4s）logo 才上移（0.6s）
  lr = await rect(d, '.site-logo');
  assert(Math.abs(lr.left + lr.width / 2 - 640) < 2 && lr.top < 1, 'desktop 展開後 logo 頂到頂置中');
  const pd = await rect(d, '.bar-plus');
  assert(pd.left >= ur.left + ur.width + 1, `desktop −在圖片右邊、不擋圖（− ${pd.left} 圖右 ${ur.left + ur.width}）`);
  // 首頁展開＋選單開（user 2026-11-21）：展開的動態不右推——清單留在 logo 底下（左緣 384）、－留在圖片右邊，只模糊＋疊白（原本跟內容一起右推）
  await openMenu(d);
  await d.mouse.move(640, 300);
  await d.waitForTimeout(700);
  {
    const u = await rect(d, '.home-news-list > ul'), p = await rect(d, '.bar-plus');
    assert(Math.abs(u.left - 384) < 2 && Math.abs(await tx(d, '#page-content')) < 1 && Math.abs(await tx(d, '.bar-news')) < 1, `首頁展開＋選單：動態不右推（欄 ${u.left}）`);
    assert(p.left >= u.left + u.width + 1 && Math.abs(p.left - pd.left) < 1 && await css(d, '.home-news-list > ul', 'filter') === 'blur(4px)' && await css(d, '.home-news-list > ul', 'opacity') === '0.4',
      `首頁展開＋選單：－留在圖片右邊、清單模糊＋疊白（－ ${p.left} 圖右 ${u.left + u.width}）`);
  }
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
  // 標題、副標各一行（user 2026-11-21）：文字上下對在縮圖的正中；放不下的那行（假資料第二行副標很長）右邊淡掉、左邊不淡，放得下的（名字）不淡；
  // 那行的框（淡掉那段也在框裡）右緣不碰到圓點（有圓點的列右邊先讓出圓點的位置）
  {
    const info = await d.$eval('a.item-row', row => {
      const line = /** @type {HTMLElement} */ (row.querySelector('p:last-child')), h = /** @type {HTMLElement} */ (row.querySelector('h3'));
      const r = (/** @type {Element} */ e) => e.getBoundingClientRect(), mask = (/** @type {Element} */ e) => { const s = getComputedStyle(e); return s.maskImage || s.webkitMaskImage; };
      const th = r(/** @type {Element} */ (row.querySelector('.item-thumb'))), col = r(/** @type {Element} */ (row.lastElementChild));
      return { oneLine: r(line).height < 1.5 * parseFloat(getComputedStyle(line).lineHeight), clipped: line.classList.contains('is-clipped'), mask: mask(line),
        hClipped: h.classList.contains('is-clipped'), hMask: mask(h), dotGap: r(row).right - parseFloat(getComputedStyle(row, '::after').width) - r(line).right,
        center: col.top + col.height / 2 - (th.top + th.height / 2) };
    });
    assert(info.oneLine && info.clipped && /gradient/.test(info.mask) && !info.hClipped && info.hMask === 'none' && info.dotGap > 4 && Math.abs(info.center) < 1,
      `合作企業：文字對在縮圖正中、副標一行、放不下的右邊淡掉、放得下的不淡、不碰到圓點（${JSON.stringify(info)}）`);
  }
  // hover 那一列：放不下的那行跑馬燈（text-indent 一直往左）、左邊的淡淡進來（2em＝36.8），放得下的不動；
  // 移開＝滑回起點（一幀一幀過去、不跳回去），到了才收左邊的淡、動畫收乾淨
  {
    const ind = () => d.$eval('a.item-row p:last-child', p => ({ x: parseFloat(getComputedStyle(p).textIndent), on: p.classList.contains('is-marquee'),
      fade: getComputedStyle(p).getPropertyValue('--marquee-fade-l').trim(), n: p.getAnimations().length }));
    await d.mouse.move(640, 5);
    await d.hover('a.item-row');
    await d.waitForTimeout(600);
    const run = await ind(), h0 = await d.$eval('a.item-row h3', h => getComputedStyle(h).textIndent);
    assert(run.on && run.x < -5 && Math.abs(parseFloat(run.fade) - 36.8) < 0.1 && h0 === '0px', `hover 那一列：放不下的那行跑馬燈、左邊淡進來，放得下的不動（${JSON.stringify(run)}、名字 ${h0}）`);
    const sampling = d.evaluate(() => new Promise(res => {
      const p = /** @type {HTMLElement} */ (document.querySelector('a.item-row p:last-child')), out = /** @type {number[]} */ ([]), t0 = performance.now();
      const tick = () => { out.push(parseFloat(getComputedStyle(p).textIndent)); if (performance.now() - t0 < 900) requestAnimationFrame(tick); else res(out); };
      tick();
    }));
    await d.mouse.move(640, 5);
    const tr = /** @type {number[]} */ (await sampling);
    await d.waitForTimeout(450);
    const end = await ind(), lo = Math.min(...tr), back = tr.slice(tr.indexOf(lo)).filter(x => x > lo + 1 && x < -1).length;
    assert(back >= 3 && tr.every((x, i) => i === 0 || Math.abs(x - tr[i - 1]) < 20) && end.x === 0 && !end.on && end.n === 0 && parseFloat(end.fade) === 0,
      `移開：滑回起點、不跳（最遠 ${lo}、回程中途 ${back} 幀）、左邊的淡收掉、動畫收乾淨（${JSON.stringify(end)}）`);
  }
  // 系統減少動態：跑不了馬燈 → 照常折行、整段看得到（觸控沒有 hover 也是這樣，webkit 模擬不了 hover: none）
  await d.emulateMedia({ reducedMotion: 'reduce' });
  assert(await d.$eval('a.item-row p:last-child', p => getComputedStyle(p).whiteSpace !== 'nowrap' && p.getBoundingClientRect().height > 1.5 * parseFloat(getComputedStyle(p).lineHeight)),
    '減少動態：清單列的標題／副標照常折行、整段看得到');
  await d.emulateMedia({ reducedMotion: 'no-preference' });

  await d.goto(base + '/pages/contact.html');
  await d.waitForSelector('#site-header .site-bar');
  // 姊妹系所（user 2026-11-21）＝連結清單：一行一個、整列可點，hover 圓點在清單最右邊（右緣＝內文欄右緣），同網站地圖那種
  await d.waitForFunction(() => document.querySelectorAll('.footer-links a').length === 3);   // 等後台（假資料）換進來
  await d.hover('.footer-links a >> nth=0');
  await d.waitForTimeout(450);   // hover 的圓點＝fade＋模糊進來（user 2026-11-21）
  assert(await d.$$eval('.footer-links a', as => { const s = getComputedStyle(as[0], '::after'), r = as.map(a => a.getBoundingClientRect()), body = as[0].closest('.page-body').getBoundingClientRect();
    return s.opacity === '1' && s.borderRadius === '50%' && s.right === '0px' && r.every(x => Math.abs(x.right - body.right) < 1 && Math.abs(x.left - body.left) < 1)
      && r.every((x, i) => i === 0 || x.top >= r[i - 1].bottom) && getComputedStyle(as[1], '::after').opacity === '0'; }), '聯絡頁姊妹系所：一行一個、hover 圓點在清單最右邊');

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
  // 名字到副標隔 xs、副標之間不留距；沒人的類別（業界導師）整段收掉、導覽跟著少一格；後台的字不當 HTML
  await d.waitForFunction(() => document.querySelectorAll('.item-list[data-cms] li').length === 3);
  {
    const fac = await d.$$eval('.item-list[data-cms] li', lis => lis.map(li => [li.querySelector('h3').textContent, li.querySelectorAll('p').length, li.querySelector('a').getAttribute('href')].join('|')));
    const gaps = await d.$eval('.item-list[data-cms] h3', h => { const top = (/** @type {Element} */ el) => el.getBoundingClientRect().top, p = /** @type {Element} */ (h.nextElementSibling);
      return { xs: 0.5 * parseFloat(getComputedStyle(document.documentElement).fontSize), title: top(p) - h.getBoundingClientRect().bottom, subs: top(/** @type {Element} */ (p.nextElementSibling)) - p.getBoundingClientRect().bottom }; });
    assert(fac.join() === '後台老師一（示意）|2|faculty-detail.html?id=1,後台老師二（示意）|0|faculty-detail.html?id=2,<b>後台老師三</b>（示意）|0|faculty-detail.html?id=3'
      && (await d.$$eval('main h2', hs => hs.map(h => h.textContent))).join() === '專任教師,兼任教師' && await d.$$eval('.section-nav-dot', b => b.length) === 2
      && await css(d, '.item-row h3', 'fontWeight') === '500' && await css(d, '.item-row p', 'fontWeight') === '400' && Math.abs(gaps.title - gaps.xs) < 0.5 && Math.abs(gaps.subs) < 0.5,
      `師資接後台：副標一筆一行、沒有就不出、名字 Medium、名字→副標 xs／副標之間 0、空的類別收掉（${fac.join()}；${JSON.stringify(gaps)}）`);
  }
  // 列表縮圖＝正方形、寬 1.5 欄（1.5 個欄寬＋半個 gutter，user 2026-11-18），文字接在一個 gutter 之後
  const thumbW = 1.5 * (1280 - 120 - 11 * 24) / 12 + 12;
  const itemTh = await rect(d, '.item-thumb'), itemTxt = await rect(d, '.item-row > :last-child');
  assert(Math.abs(itemTh.width - thumbW) < 1 && Math.abs(itemTh.height - itemTh.width) < 1 && Math.abs(itemTxt.left - (itemTh.left + itemTh.width + 24)) < 1,
    `列表縮圖 1.5 欄、文字隔一個 gutter（縮圖 ${itemTh.width}×${itemTh.height} vs ${thumbW}、文字 ${itemTxt.left}）`);
  // 師資列表（user 2026-11-18）：段落順序專任 → 兼任 → 業界導師（HTML 寫死；後台接上後的順序見上）；名字＝標題 text-md（21.6px）、副標 text-s（18.4px；user 2026-11-21）；
  // 整列 hover 不變淡，改在列的最右邊出一條方塊（寬 0.45em＝9px、長度＝整列高）
  assert(/專任教師[\s\S]*兼任教師[\s\S]*業界導師/.test(fs.readFileSync(path.join(ROOT, 'pages/faculty.html'), 'utf8')), '師資段落順序（HTML）：專任 → 兼任 → 業界導師');
  assert(await css(d, '.item-row h3', 'fontSize') === '21.6px' && await css(d, '.item-row p', 'fontSize') === '18.4px', '師資：名字 21.6px、副標 18.4px');
  {
    const bar = (i) => d.$eval(`a.item-row >> nth=${i}`, el => { const s = getComputedStyle(el, '::after'); return { o: s.opacity, w: parseFloat(s.width), h: parseFloat(s.height), top: parseFloat(s.top), rowH: el.getBoundingClientRect().height, rowO: getComputedStyle(el).opacity }; });
    await d.mouse.move(640, 5);
    await d.waitForTimeout(450);
    assert((await bar(0)).o === '0', '列表列：平常沒有圓點');
    // hover 的圓點＝fade＋模糊進來（user 2026-11-21）：剛 hover 還在半透明＋糊，淡完全實、不糊
    await d.hover('a.item-row >> nth=0');
    await d.waitForTimeout(150);
    const mid = await d.$eval('a.item-row', el => { const s = getComputedStyle(el, '::after'); return { o: +s.opacity, f: s.filter }; });
    assert(mid.o > 0 && mid.o < 1 && /^blur\(/.test(mid.f), `列表列 hover：圓點淡入＋從糊到清楚（途中 ${JSON.stringify(mid)}）`);
    await d.waitForTimeout(400);
    assert(await d.$eval('a.item-row', el => getComputedStyle(el, '::after').filter) === 'none', '列表列 hover：圓點淡完不糊');
    const b0 = await bar(0), b1 = await bar(1);
    assert(b0.o === '1' && b0.rowO === '1' && Math.abs(b0.w - DOT_D) < 0.2 && Math.abs(b0.h - b0.w) < 0.1 && Math.abs(b0.top - b0.rowH / 2) < 1 && b1.o === '0', `列表列 hover：不變淡、右邊整列高的正中出圓點（${JSON.stringify(b0)}）`);
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
  // 學歷／經歷…＝同關於的 Subsection title（h3 text-s、Medium）＋下面一筆一筆：年份一行、說明在下一行（內文 Regular），筆與筆之間不空
  const prof = await d.evaluate(() => {
    const q = (/** @type {string} */ s) => /** @type {Element} */ (document.querySelector(s)), cs = (/** @type {string} */ s) => getComputedStyle(q(s));
    const li = [...document.querySelectorAll('.page-section li')].slice(0, 2), [y, t] = [...li[0].children].map(e => e.getBoundingClientRect());
    return { h1: cs('h1').fontSize, h1w: cs('h1').fontWeight, sub: document.querySelectorAll('.item-row p').length,
      photoGap: q('h1').getBoundingClientRect().top - q('.profile-photo').getBoundingClientRect().bottom, md: 1.5 * parseFloat(getComputedStyle(document.documentElement).fontSize),
      h3: cs('.page-section h3').fontSize, h3w: cs('.page-section h3').fontWeight, li: cs('.page-section li p').fontSize, liw: cs('.page-section li p').fontWeight,
      year: y.top < t.top && Math.abs(t.top - y.bottom) < 0.5 && Math.abs(t.left - y.left) < 0.5, gap: li[1].getBoundingClientRect().top - li[0].getBoundingClientRect().bottom };
  });
  assert(prof.h1 === '21.6px' && prof.h1w === '500' && prof.sub === 2 && Math.abs(prof.photoGap - prof.md) < 0.5 && prof.h3 === '18.4px' && prof.h3w === '500' && prof.li === '18.4px' && prof.liw === '400' && prof.year && Math.abs(prof.gap) < 0.5,
    `師資詳細頁：照片在上、名字副標同列表、學歷等＝Subsection title＋年份一行說明一行（${JSON.stringify(prof)}）`);
  const menuL = (await rect(d, '.menu-btn .bar-rect')).left;   // 詳細頁沒有導覽矩形（user 2026-11-18）→ 對齊線拿 menu 鈕矩形左緣（導覽矩形本來就對齊它）
  assert(Math.abs(bkr.left - menuL) < 1 && Math.abs(bkr.top - ph.top) < 1, `返回鈕左上角：對齊 menu 鈕矩形、照片上緣（${bkr.left},${bkr.top} vs ${menuL},${ph.top}）`);
  await d.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }));
  assert(Math.abs((await bk()).top - bkr.top) < 1, '返回鈕 sticky：捲動後還在左上角');
  await d.click('.back-btn');
  await d.waitForFunction(() => document.body.dataset.page === 'faculty');
  assert(new URL(d.url()).pathname === '/pages/faculty.html', '返回鈕回師資列表');

  // 摺疊（原生 <details>：常見問題、榮譽、動態、入學；user 2026-11-18）：列尾一顆圓點（同選單 hover 那顆），永遠對在整塊的水平中線
  // （user 2026-11-19：收著＝那一列的正中、不是第一行；打開＝整個展開後內容高度的正中）。fold(i)＝第 i 個 details 的圓點（::after，top 是圓心）與整塊的高
  const fold = (i) => d.$eval(`details >> nth=${i}`, el => { const s = getComputedStyle(el, '::after'); return { w: parseFloat(s.width), h: parseFloat(s.height), top: parseFloat(s.top), box: el.getBoundingClientRect().height, open: el.open, op: s.opacity }; });
  await d.goto(base + '/pages/qa.html');
  await d.waitForSelector('#site-header .site-bar');
  assert(await css(d, 'main h2', 'fontSize') === '21.6px' && await css(d, 'summary', 'fontSize') === '18.4px' && await css(d, 'details > p', 'fontSize') === '18.4px', 'qa：分類標題 21.6px（Section title md）、問題與答案 18.4px');
  let f = await fold(0);
  assert(await css(d, 'summary', 'display') === 'block' && Math.abs(f.w - DOT_D) < 0.2 && Math.abs(f.h - f.w) < 0.1 && Math.abs(f.top - f.box / 2) < 0.5 && await css(d, 'details', 'backgroundColor', '::after') === 'rgb(0, 0, 0)',
    `qa：列尾是圓點、對在那一列的正中（沒有原生箭頭；${JSON.stringify(f)}）`);
  // 問題折成兩行（窄欄）也是整塊的正中、不是第一行（user 2026-11-19）
  f = await d.$eval('details', el => { el.style.width = '8em'; const r = { top: parseFloat(getComputedStyle(el, '::after').top), box: el.getBoundingClientRect().height }; el.style.width = ''; return r; });
  assert(f.box > 40 && Math.abs(f.top - f.box / 2) < 0.5, `qa：問題折行 → 圓點還是在整塊的正中（${JSON.stringify(f)}）`);
  f = await fold(0);
  // 展開／收起都有動畫（accordion.js 把 details 的高度補間，user 2026-11-18）：點下去逐幀記「整塊的高、圓點的 top、open」
  const foldTrack = (i) => d.evaluate(k => new Promise(res => {
    const el = /** @type {HTMLDetailsElement} */ (document.querySelectorAll('details')[k]), out = [];
    /** @type {HTMLElement} */ (el.querySelector('summary')).click();
    const t0 = performance.now();
    const tick = () => { out.push([Math.round(el.getBoundingClientRect().height * 10) / 10, parseFloat(getComputedStyle(el, '::after').top), el.open]); if (performance.now() - t0 < 750) requestAnimationFrame(tick); else res(out); };
    requestAnimationFrame(tick);
  }), i);
  const mid = (tr, lo, hi) => tr.filter(([h]) => h > lo + 2 && h < hi - 2).length;   // 落在起點與終點之間的幀數
  const closedH = f.box;
  let tr = await foldTrack(0);
  f = await fold(0);
  assert(f.open && Math.abs(f.top - f.box / 2) < 0.5 && f.box > 60 && Math.abs((await fold(1)).top - closedH / 2) < 0.5, `qa：打開 → 圓點滑到整個展開後高度的正中、別題不動（${JSON.stringify(f)}）`);
  assert(mid(tr, closedH, f.box) >= 5 && tr.every(([h], k) => k === 0 || h >= tr[k - 1][0] - 0.2), `qa：展開有動畫（高度一路長上去，中途 ${mid(tr, closedH, f.box)} 幀）`);
  const openH = f.box;
  tr = await foldTrack(0);
  f = await fold(0);
  assert(!f.open && Math.abs(f.top - closedH / 2) < 0.5 && Math.abs(f.box - closedH) < 0.5, `qa：關起來 → 圓點回到那一列的正中（${JSON.stringify(f)}）`);
  assert(mid(tr, closedH, openH) >= 5 && tr.every(([h, top], k) => k === 0 || (h <= tr[k - 1][0] + 0.2 && top <= tr[k - 1][1] + 0.2)) && tr.filter(([h]) => h > closedH + 2).every(([, , open]) => open),
    `qa：收起有動畫（高度一路縮、圓點一路往上、縮完才拿掉 open；中途 ${mid(tr, closedH, openH)} 幀）`);
  // 動到一半再點＝從目前的高度掉頭，不會卡住
  await d.click('summary >> nth=0');
  await d.waitForTimeout(150);
  await d.click('summary >> nth=0');
  await d.waitForTimeout(700);
  f = await fold(0);
  assert(!f.open && Math.abs(f.box - closedH) < 0.5 && await d.$eval('details', el => !el.classList.contains('is-closing') && !el.style.overflow), `qa：展開到一半再點 → 收回去、狀態乾淨（${JSON.stringify(f)}）`);
  // 一次只開一個（user 2026-11-21）：開第二題 → 第一題跟著收（一起補間）、點的那一列留在原地
  await d.click('summary >> nth=0');
  await d.waitForTimeout(700);
  {
    const y0 = (await rect(d, 'summary >> nth=1')).top;
    await d.click('summary >> nth=1');
    await d.waitForTimeout(700);
    const st = await d.$$eval('details', ds => ds.slice(0, 2).map(x => x.open)), y1 = (await rect(d, 'summary >> nth=1')).top, sy = await d.evaluate(() => scrollY);
    assert(st.join() === 'false,true' && await d.$$eval('details[open]', x => x.length) === 1 && (sy === 0 || Math.abs(y1 - y0) < 1.5), `qa：一次只開一個（${st}、點的那列 ${y0} → ${y1}、scrollY ${sy}）`);
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

  // 動態（user 2026-11-18）：每則是摺疊，收著＝縮圖＋標題＋分類（同師資那一列，md）、外面不寫時間；
  // 展開＝時間／地點＋相簿（對齊文字那一欄）、圓點滑到整塊高的正中；點相簿的圖 → 放大 dialog 放那一張，再點一下關掉
  await d.goto(base + '/pages/news.html');
  await d.waitForSelector('#site-header .site-bar');
  {
    const th = await rect(d, 'summary .item-thumb');
    assert(Math.abs(th.width - thumbW) < 1 && await css(d, 'summary h3', 'fontSize') === '21.6px' && await css(d, 'summary p', 'fontSize') === '18.4px'
      && !/\d{4}\.\d\d/.test(await d.textContent('summary')) && !(await d.isVisible('.fold-body')), '動態：收著＝縮圖 1.5 欄＋標題（md）＋分類（s）、看不到時間');
    // 動態沒有段落導覽（左邊的 anchor 方塊）、不分年份（user 2026-11-21 拿掉年份標題）；沒導覽的頁最後一段不撐高（撐了頁尾會多一截空白）
    assert(await d.$('.section-nav') === null && (await d.$$eval('main h2', hs => hs.map(h => h.textContent))).length === 0
      && await d.$eval('.page-section:last-child', el => Math.abs(el.getBoundingClientRect().height - el.firstElementChild.getBoundingClientRect().height) < 40), '動態：沒有段落導覽、沒有年份標題、最後一段不撐高');
    // 動態的圓點在整個 block 正中（收著＝縮圖那列的中線）、平常藏著、hover 才出（user 2026-11-18）
    f = await fold(0);
    const rowH = (await rect(d, 'summary.item-row')).height;
    assert(Math.abs(f.w - DOT_D) < 0.2 && Math.abs(f.h - f.w) < 0.1 && Math.abs(f.top - rowH / 2) < 0.5 && f.op === '0', `動態：列尾圓點在整個 block 正中、平常藏著（${JSON.stringify(f)} rowH ${rowH}）`);
    await d.hover('summary.item-row >> nth=0'); await d.waitForTimeout(500);
    assert((await fold(0)).op === '1', '動態：hover 才出圓點');
    await d.click('summary >> nth=1');   // 第二則：有地點、6 張相簿
    await d.waitForTimeout(700);
    f = await fold(1);
    const meta = await d.textContent('details[open] .fold-meta');
    assert(f.open && Math.abs(f.top - f.box / 2) < 0.5 && /2026\.10\.20[\s\S]*示意動畫工作室/.test(meta) && !/時間|地點/.test(meta)
      && await d.$$eval('details[open] .album-strip button', b => b.length) === 6, `動態：展開＝時間、地點直接寫（沒標籤）＋相簿、圓點滑到整塊高的正中（${JSON.stringify(f)}）`);
    await d.mouse.move(1000, 700); await d.waitForTimeout(500);
    assert((await fold(1)).op === '1' && (await fold(0)).op === '0', '動態：打開後圓點常駐（滑鼠移開還在）、沒開的那則藏著');
    const fb = await rect(d, 'details[open] .fold-body'), txt = await rect(d, 'details[open] summary .item-thumb');   // 展開內容從縮圖左緣排起（user 2026-11-21）
    const shots = await d.$$eval('details[open] .album-strip button', bs => bs.map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), Math.round(r.top)]; }));
    // 相簿一排（user 2026-11-18）：同高 9rem＝144（user 2026-11-19 從 12rem 縮）、照 3:2 原比例、全部同一列；放不下 → 左右 chevron（左邊到頭半透明）
    assert(Math.abs(fb.left - txt.left) < 1 && shots.every(([w, h, top]) => Math.abs(h - 144) < 1 && Math.abs(w / h - 1.5) < 0.02 && top === shots[0][2])
      && await d.$eval('details[open] .album', a => a.classList.contains('has-chev') && a.querySelector('.album-prev').classList.contains('is-end') && !a.querySelector('.album-next').classList.contains('is-end')),
      `動態：展開內容從縮圖左緣排起、相簿一排同高 144 照比例、溢出有 chevron（${JSON.stringify(shots)}）`);
    // 相簿圖都寫原圖寬高（user 2026-11-19）：載入前就有寬 → 打開當下就排好、chevron 當下決定（沒寫＝寬 0、載完才跳出 chevron）
    assert(await d.$$eval('.album img', is => is.length > 0 && is.every(i => +i.getAttribute('width') > 0 && +i.getAttribute('height') > 0)), '動態：相簿圖都有 width／height');
    // chevron 在圖列外面兩邊、不壓圖（user 2026-11-19）、用 play icon（prev 轉 180°）
    const [cp, cs, cn] = await Promise.all(['.album-prev', '.album-strip', '.album-next'].map(sel => rect(d, `details[open] ${sel}`)));
    assert(cp.left + cp.width <= cs.left && cs.left + cs.width <= cn.left && Math.abs(cp.left - fb.left) < 1
      && await d.$eval('details[open] .album', a => a.querySelector('.album-prev .icon').matches('.icon-play.rotate-180') && a.querySelector('.album-next .icon').matches('.icon-play:not(.rotate-180)')),
      `動態：相簿 chevron 在圖列外面兩邊、play icon（${JSON.stringify([cp, cs, cn].map(r => [Math.round(r.left), Math.round(r.width)]))}）`);
    const sl0 = await d.$eval('details[open] .album-strip', s => s.scrollLeft);
    await d.click('details[open] .album-next'); await d.waitForTimeout(700);
    assert(await d.$eval('details[open] .album-strip', s => s.scrollLeft) > sl0 + 100, '動態：點右 chevron → 相簿往右捲');
    await d.click('details[open] .album-strip button >> nth=2');
    await d.waitForFunction(() => /** @type {HTMLDialogElement} */ (document.getElementById('figure-dialog')).open);
    await d.waitForTimeout(500);
    const big = await rect(d, '#figure-dialog img');
    assert(await d.$eval('#figure-dialog .figure-dialog-body', b => b.children.length === 1 && /** @type {HTMLImageElement} */ (b.firstElementChild).src.includes('scaid-news-2-3'))
      && Math.abs(big.width / big.height - 1.5) < 0.02 && big.height > 500 && Math.abs(big.left + big.width / 2 - 640) < 2, `動態：點相簿的圖 → 整個畫面放大那一張、照原比例置中（${big.width}×${big.height}）`);
    // ‹ X ›：多於一張才出左右；右鍵／右鈕下一張、左鈕上一張；到頭 disabled（user 2026-11-18）
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
  }

  // 清單列＝積木（user 2026-11-21）：師資、合作企業、動態、榮譽、報導、入學、規章全是 .item-row，標題 h3 一律 text-md（21.6）、副標 p 一律 text-s（18.4），同入學；
  // 每一頁都有列、右邊都讓出圓點的位置
  for (const pg of ['faculty', 'partners', 'news', 'records', 'press', 'admission', 'regulations']) {
    await d.goto(base + `/pages/${pg}.html`);
    await d.waitForSelector('#site-header .site-bar');
    const st = await d.$$eval('.item-row', rows => rows.map(r => {
      const h = r.querySelector('h3'), ps = [...r.querySelectorAll('p')], cs = (/** @type {Element} */ e) => getComputedStyle(e);
      const textCol = r.querySelector(':scope > .item-thumb') ? /** @type {Element} */ (r.lastElementChild) : r;
      return [h && cs(h).fontSize, ps.every(p => cs(p).fontSize === '18.4px'), parseFloat(cs(textCol).paddingRight) > 20].join('|');
    }));
    assert(st.length >= 3 && st.every(s => s === '21.6px|true|true'), `${pg}：清單列標題 21.6、副標 18.4、右邊讓出圓點（${[...new Set(st)].join(' / ')}）`);
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

  // ── 背景（user 2026-11-21）：畫布（跟著游標的炭筆筆跡）＜ 中空板 ＜ 內文。自己開一頁：滑鼠亂動不影響其他段的 hover ──
  // 門檻都從 bg.js 的 INK 算：調手感的數字不用跟著改測試
  {
    const b = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await watch(b);
    await b.unroute(BG_JS);   // 這段要真的背景（watch 換成空的，理由見那裡）
    await b.goto(base + '/index.html');
    await b.waitForSelector('#site-header .site-bar');
    const INK = await b.evaluate(() => import('/js/modules/ui/bg.js').then(m => ({ ...m.INK })));
    const layers = await b.evaluate(() => { const bg = document.body.firstElementChild, s = getComputedStyle(bg); return [bg.className, s.position, s.zIndex, s.pointerEvents, ...[...bg.children].map(e => e.className)].join(); });
    assert(layers === 'bg,fixed,-1,none,bg-ink,bg-board,bg-lid' && await css(b, 'body', 'isolation') === 'isolate', `背景：畫布 ＜ 中空板 ＜ 蓋板包成一組，在內容後面、不吃指標（${layers}）`);
    // 中空板的格有大有小、平均＝logo 的骨牌寬（user 2026-11-21）：板子那張畫布的一列裡找每一格左緣那條暗線
    const cols = await b.evaluate(() => { const c = /** @type {HTMLCanvasElement} */ (document.querySelector('.bg-board')), d = c.getContext('2d').getImageData(0, 0, c.width, 1).data, xs = [];
      for (let x = 0; x < c.width; x++) if (d[x * 4 + 3] > 35 && d[x * 4 + 3] < 60 && d[x * 4] < 10) xs.push(x);
      const gaps = xs.slice(1).map((x, i) => x - xs[i]);
      return { pitch: parseFloat(getComputedStyle(c).getPropertyValue('--board-pitch')), block: document.querySelector('.bar-rect').getBoundingClientRect().width,
        min: Math.min(...gaps), max: Math.max(...gaps), avg: gaps.reduce((a, g) => a + g, 0) / gaps.length }; });
    const [lo, hi] = INK.vary, span = hi - lo, wmax = hi * cols.pitch;
    assert(Math.abs(cols.pitch - cols.block) < 0.5 && cols.min < cols.pitch * (lo + span / 4) && cols.max > cols.pitch * (hi - span / 4) && Math.abs(cols.avg / (cols.pitch * (lo + hi) / 2) - 1) < 0.25,
      `中空板的格有大有小、平均＝骨牌寬 ×${(lo + hi) / 2}（${JSON.stringify(cols)}）`);
    // 畫布上一塊有多黑（0＝全白、1＝全黑）
    const ink = (x, y, w, h) => b.evaluate(([x, y, w, h]) => { const p = document.querySelector('.bg-ink').getContext('2d').getImageData(x, y, w, h).data; let s = 0; for (let i = 0; i < p.length; i += 4) s += 255 - p[i]; return s / (p.length / 4) / 255; }, [x, y, w, h]);
    // 中空板在這一點露出幾成（蓋板被挖掉多少；0＝整個蓋住看不到板子）
    const board = (x, y) => b.evaluate(([x, y]) => { const c = document.querySelector('.bg-lid'), k = c.width / innerWidth; return 1 - c.getContext('2d').getImageData(Math.floor(x * k), Math.floor(y * k), 1, 1).data[3] / 255; }, [x, y]);
    assert(await board(450, 500) === 0, '還沒畫：中空板整個蓋住、看不到');
    await b.mouse.move(300, 300);
    await b.mouse.move(600, 300, { steps: 2 });    // 快
    const fast = await ink(350, 290, 200, 20);
    await b.mouse.move(300, 500);
    await b.mouse.move(600, 500, { steps: 20 });   // 慢，然後停在 (600, 500)
    const slow = await ink(350, 490, 200, 20), near = await board(450, 500), far = await board(1000, 150);
    assert(slow > 0.1 && slow > fast * 2, `筆跡：走越慢越濃（快 ${fast.toFixed(3)}、慢 ${slow.toFixed(3)}）`);
    assert(near > 0.5 && far === 0, `中空板只在筆跡周圍出現（筆跡旁 ${near.toFixed(2)}、遠處 ${far}）`);
    // 筆跡過一陣子自己消失、中空板跟著一起；游標停著的那一點一直畫＝筆跡與板子都留著。量「消失」的地方要躲開停著那一點：
    // 它被折射成好幾份，最遠的一份離它 (bend−1)×最寬的格/2＋半個筆頭；板子最大＝halo ×（1＋float）×（1＋breathe）
    const inkX = 300, inkW = Math.floor(600 - ((INK.bend - 1) * wmax / 2 + INK.size / 2) - 15) - inkX;
    const boardX = Math.floor(600 - INK.halo * (1 + INK.float) * (1 + INK.breathe) / 2 - 16);
    await b.waitForFunction(([ix, iw, bx]) => { const ctx = (s) => document.querySelector(s).getContext('2d'), k = document.querySelector('.bg-lid').width / innerWidth;
      return ctx('.bg-ink').getImageData(ix, 490, iw, 20).data.every(v => v === 255) && ctx('.bg-lid').getImageData(Math.floor(bx * k), Math.floor(500 * k), 1, 1).data[3] === 255; }, [inkX, inkW, boardX], { timeout: 30000 }).catch(() => {});
    // 停著那一點自己那一格的那一份：中心離它最多 (bend−1)/(2·bend)×格寬 → 在那附近找最黑的一直條（只量一個小方塊，剛好落在兩格交界時會量到空白）
    const restR = Math.ceil((INK.bend - 1) / (2 * INK.bend) * wmax) + 6;
    const restInk = await b.evaluate(([x0, w]) => { const d = document.querySelector('.bg-ink').getContext('2d').getImageData(x0, 495, w, 10).data; let m = 0;
      for (let x = 0; x < w; x++) { let s = 0; for (let y = 0; y < 10; y++) s += 255 - d[(y * w + x) * 4]; m = Math.max(m, s / 10 / 255); } return m; }, [600 - restR, restR * 2]);
    const gone = [await ink(inkX, 490, inkW, 20), await board(boardX, 500)], rest = [restInk, await board(600, 500)];
    assert(inkW > 0 && gone[0] === 0 && gone[1] === 0 && rest[0] > 0.5 && rest[1] > 0.5,
      `筆跡隨時間消失、中空板跟著消失；游標停著的那一點還在（消失的那段：筆跡 ${gone[0]}（x ${inkX}–${inkX + inkW}）、板子 ${gone[1]}（x ${boardX}）；停著那點：筆跡 ${rest[0].toFixed(2)}、板子 ${rest[1].toFixed(2)}）`);
    // 呼吸（user 2026-11-21）：游標停著，露出來的板子照樣一直脹縮（每 0.5 秒量一次面積、量一口氣多一點）
    if (INK.breathe > 0) {
      const area = [];
      for (let i = 0; i < Math.ceil(INK.breath * 2) + 1; i++) {
        area.push(await b.evaluate(() => { const c = /** @type {HTMLCanvasElement} */ (document.querySelector('.bg-lid')), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] < 128) n++; return n; }));
        await b.waitForTimeout(500);
      }
      assert(Math.max(...area) > Math.min(...area) * (1 + INK.breathe), `中空板會呼吸：游標停著、露出來的面積照樣脹縮（${area.join(' ')}）`);
    }
    // 選單開著（user 2026-11-21）：右邊內容不能 hover → 不畫新的筆跡；背景跟內容一起模糊＋疊白
    await openMenu(b);
    await b.mouse.move(800, 200);
    await b.mouse.move(1100, 200, { steps: 20 });
    await b.waitForFunction(() => getComputedStyle(document.querySelector('.bg')).opacity === '0.4');
    assert(await ink(850, 190, 200, 20) === 0 && await css(b, '.bg', 'filter') === 'blur(4px)', '選單開著：右邊動游標不畫、背景模糊＋疊白（同內容）');
    // 放大 dialog 開著（報導點一則）＝同選單：不畫、背景跟內容一起模糊＋疊白
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
    assert(/^invert\(1\)/.test(await css(b, '.bg-ink', 'filter')) && await css(b, '.bg-lid', 'filter') === 'invert(1)', '深色模式：畫布與蓋板整張反過來');
    await b.close();
    // 系統減少動態：背景三層都不放（照樣掛 watch：不打正式後台、收得到錯誤；拿掉空的 bg.js，不然一定沒有 .bg）
    const r = await browser.newPage({ reducedMotion: 'reduce' });
    await watch(r);
    await r.unroute(BG_JS);
    await r.goto(base + '/index.html');
    await r.waitForSelector('#site-header .site-bar');
    assert(await r.$('.bg') === null, '減少動態：沒有筆跡、也沒有中空板');
    await r.close();
    // 強制色彩（Windows 高對比佈景）：白色的蓋板不會換成系統色、會蓋掉使用者選的底色 → 也不放
    const f = await browser.newPage({ forcedColors: 'active' });
    await watch(f);
    await f.unroute(BG_JS);
    await f.goto(base + '/index.html');
    await f.waitForSelector('#site-header .site-bar');
    assert(await f.$('.bg') === null, '強制色彩：不放背景');
    await f.close();
  }

  // ── 全站接後台（user 2026-11-21；js/modules/pages/cms-pages.js、ui-labels.js）：自己開一頁、給假的後台資料 ──
  // 介面文字換字＋跟語言、動態／入學（相簿照 sort、沒展開內容＝不能點、入學只抓勾了的）、課程（必修在前）、關於（內文 sanitize、輪播、中英各一份）、
  // 師資詳細頁（?id=）、報導（沒截圖＝不能點）、規章（檔案優先、都沒有＝不能點）、常見問題（依分類分段＋導覽重排）
  {
    const c = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await watch(c);
    const ok = (data) => (/** @type {any} */ r) => r.fulfill({ headers: CORS, json: { data } });
    const file = (id, w = 600, h = 400) => ({ id, width: w, height: h, title: `${id}.pdf` });
    await c.route(/scaidcms\.usc\.edu\.tw\/assets\//, r => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"/>' }));
    await c.route(/\/items\/ui_labels/, ok([{ key: 'nav.about', zh: '關於我們', en: 'About us' }, { key: 'curriculum.required', zh: '必修課', en: null }]));
    const NEWS = [
      { id: 1, date: '2026-12-01', title_zh: '後台動態一', title_en: 'CMS News 1', category_zh: '講座', category_en: 'Talk', place_zh: '台北', place_en: 'Taipei', image: null,
        album: [{ sort: 2, directus_files_id: file('b', 300, 200) }, { sort: 1, directus_files_id: file('a') }], attachments: [] },
      { id: 2, date: null, title_zh: '後台動態二', title_en: null, album: [], attachments: [] },   // 沒時間也沒日期、沒地點、沒相簿＝沒得展開
    ];
    const ADM = [{ id: 3, date: '2027-01-01', title_zh: '後台入學一', time_zh: '2027.01（示意）', summary_zh: '第一行\n第二行', summary_en: 'Line 1\nLine 2', album: [], attachments: [{ sort: 1, directus_files_id: file('brochure') }] }];
    await c.route(/\/items\/news\?/, r => r.fulfill({ headers: CORS, json: { data: decodeURIComponent(r.request().url()).includes('filter[admission][_eq]=true') ? ADM : NEWS } }));
    await c.route(/\/items\/courses/, ok([{ year: 2, sort: 2, required: false, name_zh: '選修課', name_en: 'Elective course' }, { year: 2, sort: 1, required: true, name_zh: '必修課 A', name_en: 'Core A', description_zh: '說明', description_en: 'About' }]));
    await c.route(/\/items\/pages\/about/, ok({ lead_zh: '後台導言', lead_en: 'CMS lead', sections: [{ title_zh: '後台段落', title_en: 'CMS section',
      body_zh: '<h3>小標</h3><p class="text-xs evil" onclick="x()">附註</p><script>alert(1)</script><a href="javascript:alert(1)">壞連結</a><div>拆掉 div 留字</div>', body_en: '<p>English body</p>',
      images: [{ sort: 1, directus_files_id: file('img1', 800, 533) }] }] }));
    await c.route(/\/items\/faculty\/\d+/, ok({ status: 'published', photo: null, person: { name_zh: '後台老師', name_en: 'CMS Teacher' }, subtitles: [{ text_zh: '教授', text_en: 'Professor' }],
      education: [{ year: '2001', text_zh: '學士', text_en: 'BA' }], expertise: [{ year: '', text_zh: '專長一', text_en: 'Skill 1' }], awards: [] }));
    await c.route(/\/items\/press/, ok([{ title_zh: '報導一', media: { name_zh: '媒體甲', name_en: 'Media A' }, screenshot: 'shot' }, { title_zh: '報導二', media: null, screenshot: null }]));
    await c.route(/\/items\/regulations/, ok([{ category_zh: '分類甲', title_zh: '有檔案', file: 'doc', url: 'https://example.com/x' }, { category_zh: '分類甲', title_zh: '只有連結', url: 'https://example.com/y' },
      { category_zh: '分類乙', title_zh: '都沒有', url: 'javascript:alert(1)' }]));
    await c.route(/\/items\/qa/, ok([{ category_zh: '甲', question_zh: '問一', answer_zh: '答一' }, { category_zh: '乙', question_zh: '問二', answer_zh: '答二' }, { category_zh: '甲', question_zh: '問三', answer_zh: '答三' }]));

    await c.goto(base + '/pages/about.html');
    await c.waitForFunction(() => document.querySelectorAll('main .page-section').length === 1 && document.querySelector('main h1')?.textContent === '關於我們');
    const about = await c.evaluate(() => {
      const zh = /** @type {HTMLElement} */ (document.querySelector('.cms-rich[data-lang-block="zh"]')), en = /** @type {HTMLElement} */ (document.querySelector('.cms-rich[data-lang-block="en"]'));
      return { menu: document.querySelector('.site-menu a[href="about.html"]')?.textContent, title: document.title, lead: document.querySelector('.page-lead')?.textContent,
        slides: document.querySelectorAll('main .slideshow[data-ready] .slide').length, zhShown: getComputedStyle(zh).display !== 'none', enShown: getComputedStyle(en).display !== 'none',
        html: zh.innerHTML, dots: document.querySelectorAll('.section-nav-dot').length };
    });
    assert(about.menu === '關於我們' && about.title === '關於我們 - SCAID' && about.lead === '後台導言' && about.slides === 1 && about.zhShown && !about.enShown && about.dots === 1
      && about.html === '<h3>小標</h3><p class="text-xs">附註</p>alert(1)<a>壞連結</a>拆掉 div 留字',
      `接後台：介面文字（選單、頁名、分頁標題）、導言、段落（輪播、內文只留安全的標籤與 class）（${JSON.stringify(about)}）`);
    await c.evaluate(() => localStorage.setItem('scaid:lang', 'en'));
    await c.reload();
    await c.waitForFunction(() => document.querySelector('main h1')?.textContent === 'About us' && document.querySelector('.page-lead')?.textContent === 'CMS lead');
    assert(await c.evaluate(() => getComputedStyle(/** @type {Element} */ (document.querySelector('.cms-rich[data-lang-block="en"]'))).display !== 'none'
      && getComputedStyle(/** @type {Element} */ (document.querySelector('.cms-rich[data-lang-block="zh"]'))).display === 'none'), '接後台：切英文＝介面文字與內文都換英文那份');
    await c.evaluate(() => localStorage.setItem('scaid:lang', 'zh'));

    await c.goto(base + '/pages/news.html');
    await c.waitForFunction(() => document.querySelectorAll('main .item-list > li').length === 2 && document.querySelector('.bar-news-copy span')?.textContent === '後台動態一');
    const news = await c.evaluate(() => ({ folds: document.querySelectorAll('main details').length, plain: document.querySelectorAll('main li > div.item-row').length,
      album: [...document.querySelectorAll('main .album img')].map(i => /** @type {HTMLImageElement} */ (i).src.split('/').pop() + ':' + i.getAttribute('width')).join(),
      meta: [...document.querySelectorAll('main .fold-meta p')].map(p => p.textContent).join('|'), cat: document.querySelector('main summary p')?.textContent }));
    assert(news.folds === 1 && news.plain === 1 && news.album === 'a:600,b:300' && news.meta === '2026.12.01|台北' && news.cat === '講座',
      `接後台：動態一則一摺疊、相簿照 sort＋寬高、沒時間用日期、沒展開內容＝不能點、底列跑馬燈換後台的（${JSON.stringify(news)}）`);
    await c.goto(base + '/pages/admission.html');
    await c.waitForFunction(() => document.querySelector('main .item-row h3')?.textContent === '後台入學一');
    const adm = await c.evaluate(() => ({ time: document.querySelector('main summary p')?.textContent, desc: document.querySelector('main .fold-body > p')?.textContent,
      pre: getComputedStyle(/** @type {Element} */ (document.querySelector('main .fold-body > p'))).whiteSpace, file: document.querySelector('main .fold-body .link-list a')?.getAttribute('target') }));
    assert(adm.time === '2027.01（示意）' && adm.desc === '第一行\n第二行' && adm.pre === 'pre-line' && adm.file === '_blank', `接後台：入學只抓勾了入學的、說明換行照留、附件另開（${JSON.stringify(adm)}）`);

    await c.goto(base + '/pages/curriculum.html');
    await c.waitForFunction(() => document.querySelectorAll('main .page-section').length === 1);
    const cur = await c.evaluate(() => ({ year: document.querySelector('main h2')?.textContent, rows: [...document.querySelectorAll('main .item-list > li')].map(li => li.querySelector('h3')?.textContent + '/' + li.querySelector('p')?.textContent + '/' + (li.querySelector('details') ? 'fold' : 'div')).join() }));
    assert(cur.year === '二年級' && cur.rows === '必修課 A/必修課/fold,選修課/選修/div', `接後台：課程依年級分段、必修在前、介面文字換字、沒說明＝不能點（${JSON.stringify(cur)}）`);

    await c.goto(base + '/pages/faculty-detail.html?id=7');
    await c.waitForFunction(() => document.querySelector('main h1')?.textContent === '後台老師');
    const fd = await c.evaluate(() => ({ subs: [...document.querySelectorAll('main .page-body > .item-row p')].map(p => p.textContent).join(), cv: [...document.querySelectorAll('main .page-section h3')].map(h => h.textContent).join(),
      li: [...document.querySelectorAll('main .page-section li')].map(li => li.textContent).join('|'), title: document.title }));
    assert(fd.subs === '教授' && fd.cv === '學歷,專長' && fd.li === '2001學士|專長一' && fd.title === '後台老師 - SCAID', `接後台：師資詳細頁照 ?id= 抓、空的段不出（${JSON.stringify(fd)}）`);

    await c.goto(base + '/pages/press.html');
    await c.waitForFunction(() => document.querySelector('main .item-row h3')?.textContent === '報導一');
    assert(await c.evaluate(() => [...document.querySelectorAll('main .item-list > li > *')].map(e => e.tagName + (e.hasAttribute('data-zoom') ? '+zoom' : '') + ':' + (e.querySelector('p')?.textContent || '')).join()) === 'A+zoom:媒體甲,DIV:',
      '接後台：報導有截圖＝點了放大、沒截圖＝不能點；媒體從媒體庫');
    await c.goto(base + '/pages/regulations.html');
    await c.waitForFunction(() => document.querySelector('main .item-row h3')?.textContent === '有檔案');
    const reg = await c.evaluate(() => [...document.querySelectorAll('main .page-section')].map(s => s.querySelector('h2')?.textContent + ':' + [...s.querySelectorAll('.item-row')].map(r => r.tagName + (r.getAttribute('href') || '').replace(/^.*\//, '')).join('+')).join(' '));
    assert(reg.startsWith('分類甲:Adoc+Ay 分類乙:DIV') && reg.includes('使用條款'), `接後台：規章檔案優先、連結只放 http(s)、文字段落照留（${reg}）`);
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
})().catch(e => { console.error('CRASH', e); server.close(); process.exit(1); });
