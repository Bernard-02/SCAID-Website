// SCAID 煙霧測試：本地靜態 server ＋ Playwright webkit。手機先、桌面後：
// 全站殼（logo 位置、透明選單＋內容右推、語言切換、底列矩形鈕 hover 名字、動態跑馬燈、footer 覆蓋層、intro dialog）、
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
const DOT_D = 512 * 20 / 1067.29;   // 桌面（1280 寬，logo 512）hover 圓點直徑＝logo 骨牌的圓孔（user 2026-11-18）
const PAGES = ['about', 'partners', 'faculty', 'curriculum', 'news', 'records', 'admission', 'qa', 'donate', 'regulations', 'terms', 'sitemap'];
const fails = [], errors = [];
const assert = (c, msg) => { if (!c) fails.push(msg); };
const watch = async (page) => {
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
    links: [{ label: 'SCCD', url: 'https://example.com/sccd' }], badge: null,
    copyright_zh: '後台版權（示意）', copyright_en: 'CMS copyright (placeholder)',
  } } })));
};
const css = (page, sel, prop, pseudo) => page.$eval(sel, (el, a) => getComputedStyle(el, a.pseudo || null)[a.prop], { prop, pseudo });
const rect = (page, sel) => page.$eval(sel, el => { const r = el.getBoundingClientRect(); return { top: r.top, left: r.left, width: r.width, height: r.height, cy: r.top + r.height / 2 }; });
const tx = (page, sel) => page.$eval(sel, el => new DOMMatrix(getComputedStyle(el).transform).m41);
const has = (page, cls) => page.evaluate(c => document.documentElement.classList.contains(c), cls);
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
  await m.waitForSelector('#site-footer .site-footer', { state: 'attached' });
  assert((await m.textContent('main h1')) === '實踐大學AI設計職人學位學程', 'index h1（sr-only）zh');
  assert(/JetBrains Mono.+Glow Sans TC Compressed/.test(await css(m, 'body', 'fontFamily')), 'font 堆疊：JetBrains Mono → Glow Sans TC Compressed');
  // 中文字體是自架切片：兩個字重都抓得到；TC 版缺、從 J 版補的字（教清真…，build-fonts.py 的 -j 那片）也在
  assert(await m.evaluate(() => Promise.all([400, 700].map(w => document.fonts.load(`${w} 16px "Glow Sans TC Compressed"`, '實踐大學教清真值告')))
    .then(r => r.every(f => f.length >= 2 && f.every(x => x.status === 'loaded')), () => false)), '中文字體 Glow Sans 切片載入（含補上的字）');
  assert(await m.$('link[rel="icon"][href*="favicon.svg"]') !== null, 'favicon link');
  assert(await css(m, '#page-content', 'paddingTop') === '96px' && await css(m, '#page-content', 'paddingBottom') === '64px', 'mobile main 頂距 top-h／底距 bar-h');
  // 首頁未展開：logo 置中、放大、名字藏
  let lr = await rect(m, '.site-logo');
  assert(Math.abs(lr.cy - 422) < 3 && Math.abs(lr.left + lr.width / 2 - 195) < 2, `index logo 畫面正中（cx ${lr.left + lr.width / 2} cy ${lr.cy}）`);
  assert(await m.$('.site-logo .logo-strip') === null && Math.abs(lr.width - 358) < 1 && lr.height > 30, `首頁 logo＝鎖定版（沒有長條）、寬吃滿（${lr.width}×${lr.height}）`);
  // logo SVG 走 mask：網址要抓得到（檔名有空白）
  for (const sel of ['.logo-text', '.logo-strip'])
    assert(await m.$eval(sel, el => { const s = getComputedStyle(el); return fetch((s.maskImage || s.webkitMaskImage).slice(5, -2)).then(r => r.ok, () => false); }), `${sel} mask SVG 抓得到`);
  // 底列：三個矩形鈕、play icon、名字 hover 才現
  assert(await m.$$eval('.site-bar .bar-btn', b => b.length) === 3, '底列 3 個鈕');
  let nr = await rect(m, '.bar-news');
  assert(Math.abs(nr.left + nr.width / 2 - 195) < 2, `動態在畫面正中（cx ${nr.left + nr.width / 2}）`);
  const br = await rect(m, '.menu-btn .bar-rect');
  assert(Math.abs(844 - (br.top + br.height) - 32) < 4, `底列貼底 bar-pad 32（rect bottom ${844 - br.top - br.height}）`);
  assert(await m.$('.site-bar .play-btn .icon-play') !== null, 'intro 鈕是 play icon');
  assert(await css(m, '.menu-btn .bar-label', 'width') === '1px', 'label 視覺隱藏');
  assert(await m.$$eval('.site-bar .bar-btn', bs => bs.every(b => !b.hasAttribute('aria-label'))), '名字＝報讀名稱（不另掛 aria-label）');
  await m.hover('.menu-btn');
  assert(await css(m, '.menu-btn .bar-label', 'width') !== '1px' && (await m.textContent('.menu-btn .bar-label')) === '選單', 'hover 出名字（zh 選單）');
  assert(await css(m, '.bar-plus', 'transform', '::after') === 'none' && await css(m, '.bar-news-track', 'opacity') === '1', '動態：標題＋「+」');
  // 跑馬燈：文字放不下才標 .is-marquee＋複製一份；放得下就拆
  // 底列標題是示意字、長短會變：先設短字再驗（文字跟語言的比對一律讀 data-en／data-zh，不寫死）
  await m.evaluate(() => { document.querySelector('.bar-news-copy').textContent = '短'; dispatchEvent(new Event('resize')); });
  assert(await m.$('.bar-news-track.is-marquee') === null, '短文字不跑');
  await m.evaluate(() => { document.querySelector('.bar-news-copy').textContent = '示意：這是一則很長很長很長很長很長很長很長的動態標題'; dispatchEvent(new Event('resize')); });
  assert(await m.$('.bar-news-track.is-marquee [data-dup]') !== null, '長文字跑馬燈＋複製');
  await m.evaluate(() => { document.querySelector('.bar-news-copy').textContent = '短'; dispatchEvent(new Event('resize')); });
  assert(await m.$('.bar-news-track.is-marquee') === null && await m.$('[data-dup]') === null, '縮回去就拆掉');

  // 選單：透明、內容右推、語言切換。打開時 play 是「移動」過去不是跳過去：逐幀記位置，中途要有落在起點與終點之間的幀
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
  assert(await css(m, '.site-menu', 'width') === '160px', '選單固定寬 10rem');
  assert(Math.abs(await tx(m, '#page-content') - 144) < 1, '內容右推 選單寬−內距 144');
  // 選單開著（首頁）：logo 原地換鎖定版、不右推；menu 鈕白圓點＋名字常駐、intro 還在；動態收成只剩＋、置中
  lr = await rect(m, '.site-logo');
  assert(Math.abs(lr.left + lr.width / 2 - 195) < 2 && Math.abs(lr.cy - 422) < 3, `選單開：logo 原地不動（cx ${lr.left + lr.width / 2} cy ${lr.cy}）`);
  await m.mouse.move(195, 300);   // 移開，確認名字不是靠 hover 才出
  assert(await css(m, '.menu-btn .bar-rect', 'opacity', '::after') === '1' && await css(m, '.menu-btn .bar-label', 'width') !== '1px', '選單開：menu 白圓點、名字常駐');
  assert(await css(m, '.play-btn', 'visibility') === 'visible', '選單開：intro 還在');
  const plr = await rect(m, '.play-btn');
  assert(Math.abs(plr.left - 160) < 1.5, `選單開：play 移到選單右緣（left ${plr.left}）`);
  let pr = await rect(m, '.bar-plus');
  assert(await css(m, '.bar-news-track', 'opacity') === '0' && Math.abs(pr.left + pr.width / 2 - 195) < 2, `選單開：動態只剩＋置中（cx ${pr.left + pr.width / 2}）`);
  // 語言：選單、底列名字都跟著換
  assert((await m.textContent('.lang-btn')) === 'EN' && (await m.textContent('.menu-main a[href="about.html"]')) === '關於', 'zh 預設');
  const pl0 = (await rect(m, '.play-btn')).left;
  await m.click('.lang-btn');
  await m.waitForTimeout(60);
  const pl1 = (await rect(m, '.play-btn')).left;
  await m.waitForTimeout(600);
  const pl2 = (await rect(m, '.play-btn')).left;
  assert(Math.abs(pl1 - pl0) < 1 && Math.abs(pl2 - pl0) < 1, `切語言時 play 不動（前 ${pl0} 切後 ${pl1} 過場後 ${pl2}）`);
  assert((await m.textContent('.lang-btn')) === '中文' && (await m.textContent('.menu-main a[href="about.html"]')) === 'About' && (await m.textContent('.menu-sub a[href="qa.html"]')) === 'QA', '切 en');
  assert((await m.textContent('.menu-btn .bar-label')) === 'menu' && (await m.textContent('.footer-btn .bar-label')) === 'contact', '切 en：底列名字');
  assert((await m.textContent('main h1')) === 'Bachelor Program in Advanced Integrated Design, Shih Chien University' && (await m.textContent('.bar-news-copy')) === await m.getAttribute('.bar-news-copy', 'data-en'), '切 en：內容標題、動態');
  assert(await m.evaluate(() => document.documentElement.lang) === 'en', 'html lang en');
  await m.click('.lang-btn');
  assert((await m.textContent('.menu-main a[href="about.html"]')) === '關於' && await m.evaluate(() => document.documentElement.lang) === 'zh-Hant', '切回 zh');
  assert((await m.textContent('main h1')) === '實踐大學AI設計職人學位學程' && (await m.textContent('.bar-news-copy')) === await m.getAttribute('.bar-news-copy', 'data-zh'), '切回 zh：內容標題、動態');
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
  // 選中的選項：文字右邊一顆圓點（user 2026-11-18 方塊改回圓點；直徑＝logo 骨牌的圓孔＝logo 寬×20/1067.29）、不畫底線；沒選中的圓點藏著
  assert(await m.$eval('.site-menu .nav-link.active', a => { const s = getComputedStyle(a, '::after'), logoW = document.querySelector('.site-logo').getBoundingClientRect().width; return s.opacity === '1' && s.borderRadius === '50%' && Math.abs(parseFloat(s.width) - logoW * 20 / 1067.29) < 0.2 && Math.abs(parseFloat(s.height) - parseFloat(s.width)) < 0.1 && getComputedStyle(a).textDecorationLine === 'none'; }), '選中選項：右邊圓點、沒底線');
  assert(await m.$$eval('.site-menu .nav-link:not(.active)', as => as.length === 11 && as.every(a => getComputedStyle(a, '::after').opacity === '0')), '沒選中的選項沒有圓點');
  assert((await css(m, '.site-grid', 'gridTemplateColumns')).split(' ').length === 4, 'mobile grid 4 欄');
  assert((await m.textContent('main h1')).trim() === '網站地圖', 'sitemap h1 zh');
  await m.waitForTimeout(700);   // 選單關閉後 logo 的右推 transition 走完再量位置
  lr = await rect(m, '.site-logo');
  assert(Math.abs(lr.top) < 1, `內頁 logo 頂到頂（top ${lr.top}）`);
  assert(Math.abs(lr.left + lr.width / 2 - 195) < 2, '內頁 logo 置中');

  // 上一頁
  await m.goBack();
  await m.waitForFunction(() => document.body.dataset.page === 'terms');
  assert((await m.textContent('main h1')).trim() === '條款', 'back → terms');

  // 內容標題跟語言走：當頁切換＋切換後換頁
  await openMenu(m);
  await m.click('.lang-btn');
  assert((await m.textContent('main h1')).trim() === 'Terms', '切 en：當頁標題');
  // 內頁選單開：內容左緣（手機＝左緣的段落導覽矩形）推到選單右緣 160＝play 那條線；內文在它右邊一個 rail（48）
  await m.waitForTimeout(700);
  {
    const n = await rect(m, '.section-nav'), h = await rect(m, 'main h1');
    assert(Math.abs(n.left - 160) < 2 && Math.abs(n.left - (await rect(m, '.play-btn')).left) < 2 && Math.abs(h.left - n.left - 48) < 2,
      `手機內頁選單開：導覽矩形＝選單右緣＝play、內文再讓一個 rail（nav ${n.left} h1 ${h.left}）`);
  }
  await m.click('.site-menu a[href="about.html"]');
  await m.waitForFunction(() => document.body.dataset.page === 'about');
  assert((await m.textContent('main h1')).trim() === 'About' && (await m.textContent('main h2')).trim() === 'Competencies', 'en 換頁：新頁標題也是英文');
  assert(await css(m, '.section-nav', 'display') === 'flex' && await css(m, '.page-figure', 'display') === 'none', '手機 about：段落導覽在、右圖不在內文裡（改右緣縮圖鈕）');
  assert((await m.textContent('.figure-dialog-body')).trim() === 'Placeholder: image', '右圖複本也跟語言走');
  await openMenu(m);
  await m.click('.lang-btn');
  assert((await m.textContent('main h1')).trim() === '關於' && (await m.textContent('main h2')).trim() === '培育能力', '切回 zh：標題');
  await m.keyboard.press('Escape');
  await m.waitForFunction(() => !document.documentElement.classList.contains('menu-open'));

  // 底列中間的動態只在首頁（user 2026-11-10）：內頁藏起來、點不到
  assert(await css(m, '.bar-news', 'visibility') === 'hidden' && await css(m, '.bar-news', 'opacity') === '0', '內頁：底列沒有動態');

  // 手機內頁版型（user 2026-11-13 手機稿）：左緣段落導覽（矩形對齊 menu 鈕、從 h1 那條線往下排）、內文左右各讓一個 rail（48）、
  // 右緣中線上的右圖縮圖鈕（右緣對齊 footer 鈕、不壓內文）；點了 dialog 放大蓋滿畫面，再點任何地方／Esc 淡出後關；選單開著縮圖退場
  await m.waitForFunction(() => getComputedStyle(document.querySelector('.figure-btn')).opacity === '1'
    && new DOMMatrix(getComputedStyle(document.getElementById('page-content')).transform).m41 === 0);
  {
    const th = await rect(m, '.figure-thumb'), mr = await rect(m, '.menu-btn .bar-rect'), fr = await rect(m, '.footer-btn .bar-rect');
    const n = await rect(m, '.section-nav'), b = await rect(m, '.page-body');
    const d0 = await m.$eval('.section-nav-dot', x => x.getBoundingClientRect().top + parseFloat(getComputedStyle(x).paddingTop));   // 第一格矩形上緣
    // 最上面那一格＝頁標題（user 2026-11-18／19）：一顆正方形方塊（邊長＝矩形的寬 0.45em，導覽字級 14 → 6.3；跟下面的長矩形不一樣才看得出差別）、
    // 中心對在 h1 第一行的中線；段落的第一格在它下面隔 0.5em（7）
    const tp = await m.$eval('.section-nav-top', x => { const s = getComputedStyle(x, '::before'), h = parseFloat(s.height); return { cy: x.getBoundingClientRect().top + parseFloat(getComputedStyle(x).paddingTop) + h / 2, w: parseFloat(s.width), h, round: s.borderRadius }; });
    const h1c = await m.$eval('main h1', h => h.getBoundingClientRect().top + parseFloat(getComputedStyle(h).lineHeight) / 2);
    const r0 = await m.$eval('.section-nav-dot', x => parseFloat(getComputedStyle(x, '::before').height));
    assert(await m.$$eval('.section-nav-dot', x => x.length) === 3 && Math.abs(n.left - mr.left) < 1 && Math.abs(tp.cy - h1c) < 1 && Math.abs(tp.w - 6.3) < 0.1 && Math.abs(tp.h - tp.w) < 0.1 && tp.round === '0px'
      && Math.abs(r0 - 22.4) < 0.1 && Math.abs(d0 - (tp.cy + tp.h / 2 + 7)) < 1,
      `手機段落導覽：頁標題那一格＋3 格、矩形左緣對齊 menu 鈕、頁標題那格是正方形且中心＝h1 第一行中線、段落的長矩形在下面（left ${n.left} vs ${mr.left}、${JSON.stringify(tp)} vs ${h1c}、段落第一格 top ${d0}）`);
    assert(Math.abs(b.left - 64) < 1 && Math.abs(b.left + b.width - 326) < 1, `手機內文左右各讓 48（${b.left}～${b.left + b.width}）`);
    assert(Math.abs(th.left + th.width - (fr.left + fr.width)) < 1 && Math.abs(th.cy - 422) < 1 && th.width === 32 && th.height === 32 && th.left - (b.left + b.width) >= 15,
      `縮圖鈕：右緣對齊 footer 鈕、畫面中線、32 見方、不壓內文（right ${th.left + th.width} vs ${fr.left + fr.width}、cy ${th.cy}、${th.width}×${th.height}、離內文 ${th.left - b.left - b.width}）`);
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
    assert(await m.$eval('#figure-dialog', d => d.open) && dr.top === 0 && dr.left === 0 && dr.width === 390 && dr.height === 844, `點縮圖：dialog 蓋滿畫面（${JSON.stringify(dr)}）`);
    assert(Math.abs(ir.width - 358) < 1 && Math.abs(ir.height - 358) < 1 && Math.abs(ir.left - 16) < 1 && (await m.textContent('.figure-dialog-body')).trim() === '示意：圖片',
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

  // footer 覆蓋層：鈕開／關、白圓點＋名字常駐、底列其餘照常、Esc 關、跟選單互斥
  assert(await css(m, '.site-footer', 'display') === 'none', 'footer 預設藏');
  // 點 footer 鈕、逐幀記 menu／play（.bar-left）的 opacity＋visibility（內頁沒有動態）：其他鈕要 fade out 退場、關掉時 fade in 回來
  const clickFooterAndTrack = () => m.evaluate(() => new Promise(res => {
    const els = [document.querySelector('.bar-left')], out = [];
    /** @type {HTMLElement} */ (document.querySelector('.footer-btn')).click();
    const t0 = performance.now();
    const tick = () => { out.push(els.map(el => { const cs = getComputedStyle(el); return [+cs.opacity, cs.visibility]; })); if (performance.now() - t0 < 700) requestAnimationFrame(tick); else res(out); };
    requestAnimationFrame(tick);
  }));
  const midFrames = (track, i) => track.filter(f => f[i][0] > 0.05 && f[i][0] < 0.95 && f[i][1] === 'visible').length;
  const fOut = await clickFooterAndTrack();
  assert(midFrames(fOut, 0) >= 3 && fOut.at(-1).every(([o, v]) => o === 0 && v === 'hidden'),
    `footer 開：menu／play fade out 退場（中途 ${midFrames(fOut, 0)} 幀、最後 ${JSON.stringify(fOut.at(-1))}）`);
  assert(await css(m, '.site-footer', 'display') === 'flex' && (await m.textContent('.site-footer')).includes('電子郵件'), 'footer 開');
  // footer 內容走後台：值換上、空欄位整列收、javascript: 網址擋掉、英文空退中文
  await m.waitForFunction(() => document.querySelector('.footer-copyright')?.textContent === '後台版權（示意）');
  assert(await m.$eval('[data-cms="email"] a', a => a.textContent === 'cms@example.com' && a.getAttribute('href') === 'mailto:cms@example.com'), 'footer 後台：email');
  assert(await css(m, '[data-cms="fax"]', 'display') === 'none' && await css(m, '.footer-badge', 'display') === 'none' && (await m.textContent('[data-cms="tel"] dd')) === '02 1111 1111', 'footer 後台：空欄位收掉');
  assert(JSON.stringify(await m.$$eval('.footer-social-box', a => a.map(x => x.getAttribute('href')))) === '["https://example.com/ig","#"]', 'footer 後台：社群連結、javascript: 擋掉');
  assert(await m.$eval('[data-cms="address"] dd', d => d.dataset.en === '後台地址（示意）') && await m.$eval('.footer-copyright', p => p.dataset.en === 'CMS copyright (placeholder)'), 'footer 後台：中英（英文空退中文）');
  assert((await m.$$eval('.footer-links a', a => a.map(x => x.textContent))).join() === 'SCCD', 'footer 後台：姊妹系所');
  assert((await rect(m, '.footer-logo')).top < 1, 'footer logo 頂到頂');
  const cr = await rect(m, '.footer-copyright');
  const fr = await rect(m, '.footer-btn .bar-rect');
  assert(Math.abs(844 - (cr.top + cr.height) - 32) < 3 && Math.abs(cr.top + cr.height - (fr.top + fr.height)) < 3, `footer 內容貼底、跟 footer 鈕同一條線（bottom ${844 - cr.top - cr.height}）`);
  assert(await css(m, '.footer-btn .bar-rect', 'opacity', '::after') === '1', 'footer 鈕白圓點');
  await m.mouse.move(195, 300);
  assert(await css(m, '.footer-btn .bar-label', 'width') === '1px', 'footer 開：只有矩形、不出名字');
  assert(await css(m, '.bar-left', 'visibility') === 'hidden' && await css(m, '.bar-news', 'visibility') === 'hidden' && await css(m, '.site-logo', 'visibility') === 'hidden', 'footer 開：底列只剩 footer 鈕');
  const fIn = await clickFooterAndTrack();
  assert(midFrames(fIn, 0) >= 3 && fIn.at(-1).every(([o, v]) => o === 1 && v === 'visible'),
    `footer 關：menu／play fade in 回來（中途 ${midFrames(fIn, 0)} 幀）`);
  assert(await css(m, '.bar-news', 'visibility') === 'hidden', 'footer 關回內頁：動態還是藏著');
  assert(await css(m, '.site-footer', 'display') === 'none', 'footer 關');
  await m.click('.footer-btn');
  await m.keyboard.press('Escape');
  await m.waitForFunction(() => !document.documentElement.classList.contains('footer-open'));

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
  // 清單出現＝從畫面底下往上滑進來、不是直接跳出來（user 2026-11-19）：點下去逐幀記清單的上緣（還沒出來＝null）
  const rise = await m.evaluate(() => new Promise(res => {
    const el = document.querySelector('.home-news-list'), out = [];
    /** @type {HTMLElement} */ (document.querySelector('.bar-news')).click();
    const t0 = performance.now();
    const tick = () => { const cs = getComputedStyle(el); out.push(cs.display === 'none' ? null : [Math.round(el.getBoundingClientRect().top), Number(cs.opacity)]); if (performance.now() - t0 < 850) requestAnimationFrame(tick); else res(out); };
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
  }
  await m.waitForTimeout(700);
  // 底列：標題退掉、＋滑到動態欄外右邊一個 gutter（不擋圖）、大小同＋、變－
  pr = await rect(m, '.bar-plus');
  nr = await rect(m, '.bar-news');
  assert(await css(m, '.bar-plus', 'transform', '::after') !== 'none' && await css(m, '.bar-news-track', 'opacity') === '0', '＋變－、標題退掉');
  assert(Math.abs(pr.left - (nr.left + nr.width) - 16) < 1.5 && Math.abs(pr.width - 21) < 1, `−在動態欄右邊一個 gutter、同＋大小（差 ${pr.left - nr.left - nr.width} w ${pr.width}）`);
  lr = await rect(m, '.site-logo');
  assert(Math.abs(lr.top) < 1, `展開後 logo 到頂（top ${lr.top}）`);
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
      out.push(cs.display === 'none' ? null : [Math.round(el.getBoundingClientRect().top + parseFloat(el.style.getPropertyValue('--news-cut'))), Number(cs.opacity)]);
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
    const tick = () => { out.push([+getComputedStyle(main).opacity, document.body.dataset.page]); if (performance.now() - t0 < 1400) requestAnimationFrame(tick); else res(out); };
    requestAnimationFrame(tick);
  }));
  const fadeOutMid = fade.filter(([o, pg]) => pg === 'about' && o > 0.05 && o < 0.95).length;
  const fadeInMid = fade.filter(([o, pg]) => pg === 'partners' && o > 0.05 && o < 0.95).length;
  const firstNew = fade.find(([, pg]) => pg === 'partners');
  assert(fadeOutMid >= 3 && fadeInMid >= 3 && firstNew && firstNew[0] < 0.1 && fade[fade.length - 1][0] === 1,
    `換頁 fade out／in（淡出中途 ${fadeOutMid} 幀、淡入中途 ${fadeInMid} 幀、換內容時 opacity ${firstNew && firstNew[0]}、最後 ${fade[fade.length - 1][0]}）`);
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
  // 底列 menu／footer 鈕＝logo 兩端那顆骨牌的大小（user 2026-11-18）：1280 寬 logo 512 → 骨牌 512×70/1067.29 高、45:70
  const blockR = await rect(d, '.footer-btn .bar-rect');
  assert(Math.abs(blockR.height - 512 * 70 / 1067.29) < 0.5 && Math.abs(blockR.width - blockR.height * 45 / 70) < 0.5 && Math.abs((await rect(d, '.site-logo')).width - 512) < 0.5, `底列骨牌同 logo 骨牌大小（${blockR.width}×${blockR.height}）`);
  // about 內頁版型（user 2026-11-18）：Page title text-lg、Section title／Lead text-md、Subsection title 內文大小 text-s，都粗體；內文 text-s；內文從 col 2 起；col 1 段落導覽（矩形左緣對齊 menu 鈕）
  const fw = (sel, size, weight) => d.$$eval(sel, (els, [sz, w]) => els.every(e => getComputedStyle(e).fontSize === sz && getComputedStyle(e).fontWeight === w), [size, weight]);
  assert(await fw('main h1', '25.6px', '700') && await fw('main :is(h2, p.page-lead)', '20px', '700') && await fw('main h3', '16px', '700')
    && await fw('main .page-section :is(p:not(.text-xs), li)', '16px', '400'),
    'about 頁標題 25.6px／段落標題與導言 20px／小節標題 16px 粗體、內文 16px');
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
  // 右圖永遠在畫面正中、段落導覽最上面那一格（頁標題的正方形）的中心停在 h1 第一行的中線（112＋行高 33.28 的一半）：頂／底都量，矮視窗（圖高 > 畫面一半 − 底列）也不能被頂走（user 2026-11-10／11-18）
  const dotTop = () => d.$eval('.section-nav-top', b => b.getBoundingClientRect().top + parseFloat(getComputedStyle(b).paddingTop) + parseFloat(getComputedStyle(b, '::before').height) / 2);   // 頁標題那顆正方形的中心
  for (const [vw, vh] of [[1280, 800], [1280, 560]]) {
    await d.setViewportSize({ width: vw, height: vh });
    for (const y of [0, 1e6]) {
      await d.evaluate(t => window.scrollTo({ top: t, behavior: 'instant' }), y);
      await d.waitForTimeout(100);
      const fy = (await rect(d, '.page-figure > *')).cy, ny = await dotTop();
      assert(Math.abs(fy - vh / 2) < 1 && Math.abs(ny - (112 + 25.6 * 1.3 / 2)) < 1, `${vw}x${vh} 捲到${y ? '底' : '頂'}：右圖在畫面正中、導覽最上面的正方形在 h1 第一行中線（圖 ${fy} 導覽 ${ny}）`);
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
  assert(await css(d, '#custom-scrollbar-thumb', 'display') === 'block', 'about 長頁：自製捲軸 thumb');
  // 右圖（user 2026-11-19）：4 欄寬方形、在「內容區右緣～畫面右緣 1280」那段的正中；選單開著內容右推 228 → 那段空間變窄、
  // 右圖跟著在新空間重新置中（中心往右 114）並縮小（寬少掉 228）＝兩邊留白跟原本一樣
  const fig0 = await rect(d, '.page-figure > *'), pb = await rect(d, '.page-body');
  const figMid = (pb.left + pb.width + 1280) / 2, colW4 = (1280 - 120 - 11 * 24) / 12 * 4 + 3 * 24;
  assert(Math.abs(fig0.left + fig0.width / 2 - figMid) < 1 && Math.abs(fig0.width - colW4) < 1 && Math.abs(fig0.height - fig0.width) < 1,
    `desktop 右圖：4 欄寬方形、在內容右緣～畫面右緣正中（中心 ${fig0.left + fig0.width / 2} vs ${figMid}、寬 ${fig0.width}）`);
  await openMenu(d);
  await d.waitForTimeout(600);
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
  await d.hover('.footer-btn');
  await d.waitForTimeout(100);
  nr = await rect(d, '.bar-news');
  assert(Math.abs(nr.left + nr.width / 2 - 640) < 2 && await css(d, '.footer-btn .bar-label', 'width') !== '1px', 'hover footer 名字出來、動態中心不動');
  // 側邊放不下名字時才縮動態（窄桌面 800）：兩側等寬＝中心仍在畫面正中
  await d.setViewportSize({ width: 800, height: 800 });
  await d.hover('.menu-btn');
  await d.waitForTimeout(150);
  nr = await rect(d, '.bar-news');
  assert(Math.abs(nr.left + nr.width / 2 - 400) < 2 && nr.width < 480, `800 寬 hover：動態縮、仍置中（cx ${nr.left + nr.width / 2} w ${nr.width}）`);
  await d.setViewportSize({ width: 1280, height: 800 });
  await d.mouse.move(640, 300);
  await d.waitForTimeout(150);
  await d.click('.bar-news');
  await d.waitForFunction(() => document.documentElement.classList.contains('news-open'));
  await d.waitForFunction(() => getComputedStyle(document.getElementById('custom-scrollbar-thumb')).display === 'block');
  assert(parseFloat(await css(d, '#custom-scrollbar-thumb', 'height')) > 40, '展開後自製捲軸 thumb 出現');
  const ur = await rect(d, '.home-news-list > ul');
  assert(Math.abs(ur.left + ur.width / 2 - 640) < 2 && Math.abs(ur.width - 512) < 2, `desktop 清單畫面中間 32rem（cx ${ur.left + ur.width / 2} w ${ur.width}）`);
  await d.waitForTimeout(700);
  lr = await rect(d, '.site-logo');
  assert(Math.abs(lr.left + lr.width / 2 - 640) < 2 && lr.top < 1, 'desktop 展開後 logo 頂到頂置中');
  const pd = await rect(d, '.bar-plus');
  assert(pd.left >= ur.left + ur.width + 1, `desktop −在圖片右邊、不擋圖（− ${pd.left} 圖右 ${ur.left + ur.width}）`);
  // 首頁展開＋選單開：置中的動態欄對齊 logo 左緣（不是推過頭），－跟著走、仍在圖片右邊
  await openMenu(d);
  await d.mouse.move(640, 300);
  await d.waitForTimeout(700);
  {
    const u = await rect(d, '.home-news-list > ul'), lg = await rect(d, '.site-logo'), p = await rect(d, '.bar-plus');
    void lg;
    assert(Math.abs(u.left - (384 + 228)) < 2, `首頁展開＋選單：動態欄右推 選單寬−內距（欄 ${u.left}）`);
    assert(p.left >= u.left + u.width + 1, `首頁展開＋選單：－仍在圖片右邊（－ ${p.left} 圖右 ${u.left + u.width}）`);
  }
  await d.keyboard.press('Escape');

  // 矮桌面 footer：內容比畫面高 → 可捲，捲到底最後一行停在底列那條線（800−48）
  await d.click('.footer-btn');
  await d.waitForFunction(() => document.documentElement.classList.contains('footer-open'));
  await d.$eval('.site-footer', f => { f.scrollTop = f.scrollHeight; });
  const dcr = await rect(d, '.footer-copyright');
  assert(Math.abs(dcr.top + dcr.height - 752) < 1, `desktop footer 捲到底：最後一行在底列那條線（bottom ${dcr.top + dcr.height}）`);
  // footer 連結 hover＝右邊圓點（user 2026-11-18）；姊妹系所的圓點落在跟下一個的間距裡、不碰到下一個字
  await d.hover('.footer-links a >> nth=0');
  assert(await d.$eval('.footer-links a', a => { const s = getComputedStyle(a, '::after'), gap = parseFloat(getComputedStyle(a.closest('.footer-links')).columnGap);
    return s.opacity === '1' && s.borderRadius === '50%' && parseFloat(s.marginLeft) + parseFloat(s.width) < gap; }), 'footer 連結 hover：右邊圓點、落在間距裡不碰到下一個');
  await d.keyboard.press('Escape');

  // 課程課名點進課程詳細頁（user 2026-11-18）：只有課名＋一段說明（沒段落＝導覽 0 格）、選單亮課程
  await d.goto(base + '/pages/curriculum.html');
  await d.waitForSelector('#site-header .site-bar');
  // 課名 hover：圓點在清單最右邊（右緣＝內文欄右緣），不跟在字後面（user 2026-11-18）
  await d.hover('.link-list a >> nth=0');
  assert(await d.$eval('.link-list a', a => { const s = getComputedStyle(a, '::after'), r = a.getBoundingClientRect(), body = a.closest('.page-body').getBoundingClientRect();
    return s.opacity === '1' && s.right === '0px' && Math.abs(r.right - body.right) < 1; }), '課名 hover：圓點在清單最右邊');
  await d.click('.link-list a >> nth=0');
  await d.waitForFunction(() => document.body.dataset.page === 'curriculum-detail');
  assert(await d.$$eval('.section-nav-dot', b => b.length) === 0 && await d.$eval('.page-body', b => b.children.length === 2 && b.children[0].tagName === 'H1' && b.children[1].tagName === 'P')
    && await d.$eval('.site-menu a[href="curriculum.html"]', a => a.classList.contains('active')), '課程詳細頁：課名＋一段說明、沒段落、選單亮課程');

  // 師資列表點進詳細頁：左上角返回鈕（左緣對齊導覽矩形、上緣＝內容第一行、捲動時 sticky 停住）、選單亮師資、返回回列表
  await d.goto(base + '/pages/faculty.html');
  await d.waitForSelector('#site-header .site-bar');
  // 列表縮圖＝正方形、寬 1.5 欄（1.5 個欄寬＋半個 gutter，user 2026-11-18），文字接在一個 gutter 之後
  const thumbW = 1.5 * (1280 - 120 - 11 * 24) / 12 + 12;
  const itemTh = await rect(d, '.item-thumb'), itemTxt = await rect(d, '.item-row > :last-child');
  assert(Math.abs(itemTh.width - thumbW) < 1 && Math.abs(itemTh.height - itemTh.width) < 1 && Math.abs(itemTxt.left - (itemTh.left + itemTh.width + 24)) < 1,
    `列表縮圖 1.5 欄、文字隔一個 gutter（縮圖 ${itemTh.width}×${itemTh.height} vs ${thumbW}、文字 ${itemTxt.left}）`);
  // 師資列表（user 2026-11-18）：段落順序專任 → 兼任 → 業界導師；名字與單位都是 text-md（20px）；
  // 整列 hover 不變淡，改在列的最右邊出一條方塊（寬 0.45em＝9px、長度＝整列高）
  assert((await d.$$eval('main h2', hs => hs.map(h => h.textContent))).join() === '專任教師,兼任教師,業界導師', '師資段落順序：專任 → 兼任 → 業界導師');
  assert(await css(d, '.item-row h3', 'fontSize') === '20px' && await css(d, '.item-row p', 'fontSize') === '20px' && await css(d, '.item-row h3', 'fontWeight') === '400', '師資：名字與單位都是 20px');
  {
    const bar = (i) => d.$eval(`a.item-row >> nth=${i}`, el => { const s = getComputedStyle(el, '::after'); return { o: s.opacity, w: parseFloat(s.width), h: parseFloat(s.height), top: parseFloat(s.top), rowH: el.getBoundingClientRect().height, rowO: getComputedStyle(el).opacity }; });
    await d.mouse.move(640, 5);
    assert((await bar(0)).o === '0', '列表列：平常沒有圓點');
    await d.hover('a.item-row >> nth=0');
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
  assert(await css(d, 'main h2', 'fontSize') === '20px' && await css(d, 'summary', 'fontSize') === '16px' && await css(d, 'details > p', 'fontSize') === '16px', 'qa：分類標題 20px、問題與答案 16px');
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
  assert(f.open && Math.abs(f.top - f.box / 2) < 0.5 && f.box > 60 && Math.abs((await fold(1)).top - 12) < 0.5, `qa：打開 → 圓點滑到整個展開後高度的正中、別題不動（${JSON.stringify(f)}）`);
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

  // 動態（user 2026-11-18）：每則是摺疊，收著＝縮圖＋標題＋分類（同師資那一列，md）、外面不寫時間；
  // 展開＝時間／地點＋相簿（對齊文字那一欄）、圓點滑到整塊高的正中；點相簿的圖 → 放大 dialog 放那一張，再點一下關掉
  await d.goto(base + '/pages/news.html');
  await d.waitForSelector('#site-header .site-bar');
  {
    const th = await rect(d, 'summary .item-thumb');
    assert(Math.abs(th.width - thumbW) < 1 && await css(d, 'summary h3', 'fontSize') === '20px' && await css(d, 'summary p', 'fontSize') === '20px'
      && !/\d{4}\.\d\d/.test(await d.textContent('summary')) && !(await d.isVisible('.fold-body')), '動態：收著＝縮圖 1.5 欄＋標題＋分類（md）、看不到時間');
    // 動態沒有段落導覽（左邊的 anchor 方塊），年份標題照留；沒導覽的頁最後一段不撐高（撐了頁尾會多一截空白）
    assert(await d.$('.section-nav') === null && (await d.$$eval('main h2', hs => hs.map(h => h.textContent))).join() === '2026,2025'
      && await d.$eval('.page-section:last-child', el => Math.abs(el.getBoundingClientRect().height - el.firstElementChild.getBoundingClientRect().height - el.lastElementChild.getBoundingClientRect().height) < 40), '動態：沒有段落導覽、最後一段不撐高');
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
    const fb = await rect(d, 'details[open] .fold-body'), txt = await rect(d, 'details[open] summary > :last-child');
    const shots = await d.$$eval('details[open] .album-strip button', bs => bs.map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), Math.round(r.top)]; }));
    // 相簿一排（user 2026-11-18）：同高 9rem＝144（user 2026-11-19 從 12rem 縮）、照 3:2 原比例、全部同一列；放不下 → 左右 chevron（左邊到頭半透明）
    assert(Math.abs(fb.left - txt.left) < 1 && shots.every(([w, h, top]) => Math.abs(h - 144) < 1 && Math.abs(w / h - 1.5) < 0.02 && top === shots[0][2])
      && await d.$eval('details[open] .album', a => a.classList.contains('has-chev') && a.querySelector('.album-prev').classList.contains('is-end') && !a.querySelector('.album-next').classList.contains('is-end')),
      `動態：展開內容對齊文字欄、相簿一排同高 144 照比例、溢出有 chevron（${JSON.stringify(shots)}）`);
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

  // 入學（user 2026-11-18）：一則一則的動態（同動態頁那種列、沒有別種摺疊）；外面只有標題＋時間（沒有分類）；
  // 第一則是完整示意：點開的順序＝說明文字 → 相簿 → 附件（粗體、另開新視窗的連結），沒有地點那一行
  await d.goto(base + '/pages/admission.html');
  await d.waitForSelector('#site-header .site-bar');
  {
    assert(await d.$$eval('summary', ss => ss.length >= 5 && ss.every(x => !x.querySelector('.item-thumb') && x.querySelectorAll('h3').length === 1
      && x.querySelectorAll('p').length === 1 && /^\d{4}\.\d\d/.test(x.querySelector('p').textContent)))
      && await css(d, 'summary p', 'fontSize') === '20px' && await d.$('.section-nav') === null, '入學：每一列＝標題＋時間（沒有縮圖、沒有分類）、沒有段落導覽');
    await d.click('summary >> nth=0');
    await d.waitForTimeout(700);
    const body = await d.$eval('details[open] .fold-body', b => ({ order: [...b.children].map(c => c.tagName === 'P' ? '說明' : c.className.split(' ')[0]).join(' → '), desc: b.querySelector(':scope > p')?.textContent.length,
      files: [...b.querySelectorAll('.link-list a')].map(a => a.target + a.getAttribute('href').slice(-4) + getComputedStyle(a).fontWeight).join(), shots: b.querySelectorAll('.album-strip button').length }));
    assert(body.order === '說明 → album → link-list' && body.desc > 20 && body.files === '_blank.pdf700,_blank.pdf700' && body.shots === 3 && await css(d, 'details[open] .fold-body > p', 'fontSize') === '16px'
      && Math.abs((await rect(d, 'details[open] .fold-body')).left - (await rect(d, 'details[open] summary')).left) < 1,
      `入學：完整示意那一則＝說明 → 相簿 → 附件（粗體）、展開內容靠左（沒有縮圖那一欄）（${JSON.stringify(body)}）`);
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
