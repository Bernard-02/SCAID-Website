// SCAID 煙霧測試：本地靜態 server ＋ Playwright webkit。手機先、桌面後：
// 全站殼（logo 位置、透明選單＋內容右推、語言切換、底列矩形鈕 hover 名字、動態跑馬燈、footer 覆蓋層、intro dialog）、
// router（全部頁面／返回／404／hash 不重載）、首頁動態展開、自製 scrollbar。
// 用法：node scripts/smoke.cjs <playwright 套件目錄> [webkit 執行檔]
//   本機：node scripts/smoke.cjs "../SCCD Website/node_modules/playwright" "%LOCALAPPDATA%/ms-playwright/webkit-2359/Playwright.exe"
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const { webkit } = require(path.resolve(process.argv[2]));
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  fs.readFile(path.join(ROOT, p), (err, data) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});
const PAGES = ['about', 'partners', 'faculty', 'curriculum', 'news', 'admission', 'qa', 'donate', 'regulations', 'terms', 'sitemap'];
const fails = [], errors = [];
const assert = (c, msg) => { if (!c) fails.push(msg); };
const watch = (page) => {
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('requestfailed', r => { const u = r.url(); if (new URL(u).hostname === '127.0.0.1' && !u.endsWith('intro-test.mp4')) errors.push('reqfailed: ' + u); });
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
  watch(m);
  await m.goto(base + '/index.html');
  await m.waitForSelector('#site-header .site-bar');
  await m.waitForSelector('#site-footer .site-footer', { state: 'attached' });
  assert((await m.textContent('main h1')) === '實踐大學AI設計職人學位學程', 'index h1（sr-only）zh');
  assert((await css(m, 'body', 'fontFamily')).includes('JetBrains Mono'), 'font JetBrains Mono');
  assert(await m.$('link[rel="icon"][href$="favicon.svg"]') !== null, 'favicon link');
  assert(await css(m, '#page-content', 'paddingTop') === '96px' && await css(m, '#page-content', 'paddingBottom') === '64px', 'mobile main 頂距 top-h／底距 bar-h');
  // 首頁未展開：logo 置中、放大、名字藏
  let lr = await rect(m, '.site-logo');
  assert(Math.abs(lr.cy - 422) < 3 && Math.abs(lr.left + lr.width / 2 - 195) < 2, `index logo 畫面正中（cx ${lr.left + lr.width / 2} cy ${lr.cy}）`);
  assert(await m.$('.site-logo .logo-strip') === null && await css(m, '.logo-lockup', 'display') === 'flex', '首頁 logo＝鎖定版（沒有長條）');
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
  // logo 名字跟語言：zh 一行中文
  assert(await css(m, '.logo-name-zh', 'display') !== 'none' && await css(m, '.logo-name-en', 'display') === 'none', 'zh：logo 名字中文');
  const lwZh = (await rect(m, '.site-logo')).width;
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
  assert((await m.textContent('.menu-btn .bar-label')) === 'menu' && (await m.textContent('.footer-btn .bar-label')) === 'footer', '切 en：底列名字');
  assert((await m.textContent('main h1')) === 'Bachelor Program in Advanced Integrated Design, Shih Chien University' && (await m.textContent('.bar-news-copy')) === 'Placeholder: latest news title', '切 en：內容標題、動態');
  assert(await css(m, '.logo-name-en', 'display') !== 'none' && await css(m, '.logo-name-zh', 'display') === 'none', '切 en：logo 名字英文');
  const lwEn = (await rect(m, '.site-logo')).width;
  assert(lwEn > lwZh + 20, `切 en：logo 寬度跟著變（zh ${lwZh} en ${lwEn}）`);
  assert(await m.evaluate(() => document.documentElement.lang) === 'en', 'html lang en');
  await m.click('.lang-btn');
  assert((await m.textContent('.menu-main a[href="about.html"]')) === '關於' && await m.evaluate(() => document.documentElement.lang) === 'zh-Hant', '切回 zh');
  assert((await m.textContent('main h1')) === '實踐大學AI設計職人學位學程' && (await m.textContent('.bar-news-copy')) === '示意：最新動態標題', '切回 zh：內容標題、動態');
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
  assert((await css(m, '.site-grid', 'gridTemplateColumns')).split(' ').length === 4, 'mobile grid 4 欄');
  assert((await m.textContent('main h1')).trim() === '網站地圖', 'sitemap h1 zh');
  await m.waitForTimeout(700);   // 選單關閉後 logo 的右推 transition 走完再量位置
  lr = await rect(m, '.site-logo');
  assert(Math.abs(lr.top) < 1 && await css(m, '.logo-lockup', 'display') === 'flex', `內頁 logo 頂到頂、鎖定版（top ${lr.top}）`);
  assert(Math.abs(lr.left + lr.width / 2 - 195) < 2, '內頁 logo 置中');

  // 上一頁
  await m.goBack();
  await m.waitForFunction(() => document.body.dataset.page === 'terms');
  assert((await m.textContent('main h1')).trim() === '條款', 'back → terms');

  // 內容標題跟語言走：當頁切換＋切換後換頁
  await openMenu(m);
  await m.click('.lang-btn');
  assert((await m.textContent('main h1')).trim() === 'Terms', '切 en：當頁標題');
  // 內頁選單開：內容左緣＝max(logo 左緣, 選單右緣)（手機 en logo 幾乎滿版 → 對齊選單右緣 160）
  await m.waitForTimeout(700);
  {
    const h = await rect(m, 'main h1'), lg = await rect(m, '.site-logo');
    void lg;
    assert(Math.abs(h.left - 160) < 2 && Math.abs(h.left - (await rect(m, '.play-btn')).left) < 2, `手機內頁選單開：內容左緣＝選單右緣＝play（h1 ${h.left}）`);
  }
  await m.click('.site-menu a[href="about.html"]');
  await m.waitForFunction(() => document.body.dataset.page === 'about');
  assert((await m.textContent('main h1')).trim() === 'About' && (await m.textContent('main h2')).trim() === 'Competencies', 'en 換頁：新頁標題也是英文');
  assert(await css(m, '.section-nav', 'display') === 'none' && await css(m, '.page-figure', 'display') === 'none', '手機 about：段落導覽、右圖先不出');
  await openMenu(m);
  await m.click('.lang-btn');
  assert((await m.textContent('main h1')).trim() === '關於' && (await m.textContent('main h2')).trim() === '培育能力', '切回 zh：標題');
  await m.keyboard.press('Escape');
  await m.waitForFunction(() => !document.documentElement.classList.contains('menu-open'));

  // footer 覆蓋層：鈕開／關、白圓點＋名字常駐、底列其餘照常、Esc 關、跟選單互斥
  assert(await css(m, '.site-footer', 'display') === 'none', 'footer 預設藏');
  // 點 footer 鈕、逐幀記 menu／play（.bar-left）與動態的 opacity＋visibility：其他鈕要 fade out 退場、關掉時 fade in 回來
  const clickFooterAndTrack = () => m.evaluate(() => new Promise(res => {
    const els = [document.querySelector('.bar-left'), document.querySelector('.bar-news')], out = [];
    /** @type {HTMLElement} */ (document.querySelector('.footer-btn')).click();
    const t0 = performance.now();
    const tick = () => { out.push(els.map(el => { const cs = getComputedStyle(el); return [+cs.opacity, cs.visibility]; })); if (performance.now() - t0 < 700) requestAnimationFrame(tick); else res(out); };
    requestAnimationFrame(tick);
  }));
  const midFrames = (track, i) => track.filter(f => f[i][0] > 0.05 && f[i][0] < 0.95 && f[i][1] === 'visible').length;
  const fOut = await clickFooterAndTrack();
  assert(midFrames(fOut, 0) >= 3 && midFrames(fOut, 1) >= 3 && fOut.at(-1).every(([o, v]) => o === 0 && v === 'hidden'),
    `footer 開：menu／play／動態 fade out 退場（中途 ${midFrames(fOut, 0)}／${midFrames(fOut, 1)} 幀、最後 ${JSON.stringify(fOut.at(-1))}）`);
  assert(await css(m, '.site-footer', 'display') === 'flex' && (await m.textContent('.site-footer')).includes('電子郵件'), 'footer 開');
  assert((await rect(m, '.footer-logo')).top < 1, 'footer logo 頂到頂');
  const cr = await rect(m, '.footer-copyright');
  const fr = await rect(m, '.footer-btn .bar-rect');
  assert(Math.abs(844 - (cr.top + cr.height) - 32) < 3 && Math.abs(cr.top + cr.height - (fr.top + fr.height)) < 3, `footer 內容貼底、跟 footer 鈕同一條線（bottom ${844 - cr.top - cr.height}）`);
  assert(await css(m, '.footer-btn .bar-rect', 'opacity', '::after') === '1', 'footer 鈕白圓點');
  await m.mouse.move(195, 300);
  assert(await css(m, '.footer-btn .bar-label', 'width') === '1px', 'footer 開：只有矩形、不出名字');
  assert(await css(m, '.bar-left', 'visibility') === 'hidden' && await css(m, '.bar-news', 'visibility') === 'hidden' && await css(m, '.site-logo', 'visibility') === 'hidden', 'footer 開：底列只剩 footer 鈕');
  const fIn = await clickFooterAndTrack();
  assert(midFrames(fIn, 0) >= 3 && midFrames(fIn, 1) >= 3 && fIn.at(-1).every(([o, v]) => o === 1 && v === 'visible'),
    `footer 關：menu／play／動態 fade in 回來（中途 ${midFrames(fIn, 0)}／${midFrames(fIn, 1)} 幀）`);
  assert(await css(m, '.site-footer', 'display') === 'none', 'footer 關');
  await m.click('.footer-btn');
  await m.keyboard.press('Escape');
  await m.waitForFunction(() => !document.documentElement.classList.contains('footer-open'));

  // intro：沒 data-video 不開；有就開 dialog、右上鈕關
  await m.click('.play-btn');
  assert(await m.$eval('#intro-dialog', d => d.open) === false, '無影片不開 dialog');
  await m.evaluate(() => { document.querySelector('.play-btn').setAttribute('data-video', 'intro-test.mp4'); });
  await m.click('.play-btn');
  assert(await m.$eval('#intro-dialog', d => d.open) === true, '有影片開 dialog');
  await m.click('.intro-close');
  assert(await m.$eval('#intro-dialog', d => d.open) === false, 'dialog 關');

  // logo 回首頁 → 動態原地展開：logo 上移、清單出來、可捲、＋變－；收合捲回頂
  await m.click('.site-logo');
  await m.waitForFunction(() => document.body.dataset.page === 'index');
  assert(new URL(m.url()).pathname === '/', 'logo → root');
  await m.click('.bar-news');
  await m.waitForFunction(() => document.documentElement.classList.contains('news-open'));
  assert(new URL(m.url()).pathname === '/', '展開不換頁');
  assert(await css(m, '.home-news-list', 'display') === 'block', '清單出來');
  await m.waitForTimeout(700);
  // 底列：標題退掉、＋滑到動態欄外右邊一個 gutter（不擋圖）、大小同＋、變－
  pr = await rect(m, '.bar-plus');
  nr = await rect(m, '.bar-news');
  assert(await css(m, '.bar-plus', 'transform', '::after') !== 'none' && await css(m, '.bar-news-track', 'opacity') === '0', '＋變－、標題退掉');
  assert(Math.abs(pr.left - (nr.left + nr.width) - 16) < 1.5 && Math.abs(pr.width - 21) < 1, `−在動態欄右邊一個 gutter、同＋大小（差 ${pr.left - nr.left - nr.width} w ${pr.width}）`);
  lr = await rect(m, '.site-logo');
  assert(Math.abs(lr.top) < 1 && await css(m, '.logo-lockup', 'display') === 'flex', `展開後 logo 到頂（top ${lr.top}）`);
  assert(await m.evaluate(() => document.documentElement.scrollHeight > innerHeight), '展開後可捲');
  await m.evaluate(() => scrollTo({ top: 400, behavior: 'instant' }));
  assert(await m.evaluate(() => scrollY >= Math.min(400, document.documentElement.scrollHeight - innerHeight) - 1 && scrollY > 0), '捲得下去');
  await m.click('.bar-news');
  await m.waitForFunction(() => !document.documentElement.classList.contains('news-open') && scrollY === 0);
  assert(await css(m, '.home-news-list', 'display') === 'none', '收合');

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

  // ── 桌面 1280 ──
  const d = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  watch(d);
  await d.goto(base + '/pages/about.html');
  await d.waitForSelector('#site-header .site-bar');
  assert(await css(d, '#page-content', 'paddingTop') === '112px', 'desktop 頂距 7rem');
  assert(await css(d, '.site-container', 'paddingLeft') === '60px', 'desktop container padding 60');
  assert((await css(d, '.site-grid', 'gridTemplateColumns')).split(' ').length === 12, 'desktop grid 12 欄');
  // about 內頁版型：標題跟內文同字級、粗體分層；內文從 col 2 起；col 1 段落導覽（矩形左緣對齊 menu 鈕）
  assert(await d.$$eval('main :is(h1, h2, h3, p.page-lead)', els => els.every(e => getComputedStyle(e).fontSize === '20px' && getComputedStyle(e).fontWeight === '700')) && await css(d, 'main li', 'fontWeight') === '400',
    'about 標題／內文同 20px、標題粗體');
  const col2 = 60 + (1280 - 120 - 11 * 24) / 12 + 24;   // 內距＋一欄＋gutter
  assert(Math.abs((await rect(d, 'main h1')).left - col2) < 1, `about 內文從 col 2 起（h1 ${(await rect(d, 'main h1')).left} vs ${col2}）`);
  const dotL = async () => (await rect(d, '.section-nav-dot')).left + 12;   // 矩形畫在 ::before、按鈕左右內距 0.6em
  assert(await d.$$eval('.section-nav-dot', b => b.length) === 3 && Math.abs(await dotL() - 60) < 1, `段落導覽 3 格、矩形左緣對齊 menu 鈕（${await dotL()}）`);
  const navState = () => d.evaluate(() => ({ cur: [...document.querySelectorAll('.section-nav-dot')].findIndex(b => b.getAttribute('aria-current') === 'true'),
    dis: [...document.querySelectorAll('.section-nav-step')].map(b => b.disabled), tops: [...document.querySelectorAll('.section-title')].map(t => t.getBoundingClientRect().top) }));
  const settle = () => d.evaluate(() => new Promise(r => { let last = -1; const t = () => { if (scrollY === last) r(scrollY); else { last = scrollY; setTimeout(t, 150); } }; setTimeout(t, 150); }));
  let ns = await navState();
  const alignY = ns.tops[0];
  assert(ns.cur === 0 && ns.dis[0] && !ns.dis[1], '段落導覽：一開始第 1 段、上一段停用');
  // 點哪段＝那段標題捲到第一段標題的位置；最後一段也捲得到（最後一段撐高）
  for (const i of [1, 2]) {
    await d.click(`.section-nav-dot[data-i="${i}"]`);
    await settle();
    ns = await navState();
    assert(ns.cur === i && Math.abs(ns.tops[i] - alignY) < 1.5, `段落導覽：點第 ${i + 1} 段 → 對齊第一段標題位置（${ns.tops[i]} vs ${alignY}）`);
  }
  assert(ns.dis[1] && !ns.dis[0], '段落導覽：最後一段時下一段停用');
  await d.click('.section-nav-step[data-step="-1"]');
  await settle();
  ns = await navState();
  assert(ns.cur === 1 && Math.abs(ns.tops[1] - alignY) < 1.5, '段落導覽：上一段 chevron');
  assert(await d.$eval('.section-nav-dot', b => b.getAttribute('aria-labelledby') === document.querySelector('.section-title').id), '段落導覽：矩形報讀名稱＝段落標題');
  assert(await css(d, '#custom-scrollbar-thumb', 'display') === 'block', 'about 長頁：自製捲軸 thumb');
  await openMenu(d);
  await d.waitForTimeout(600);
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
  await d.keyboard.press('Escape');

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
