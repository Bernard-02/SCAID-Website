/**
 * 清單列的副標跑馬燈（css/components/page.css「副標各一行」；user 2026-11-21）：
 * 副標一行不折，放不下＝直接切掉（.is-clipped）；hover／鍵盤聚焦那一列＝放不下的那幾行一直往左跑（.is-marquee）。
 * 標題放不下＝折行、不跑（user 2026-11-23：「去掉 title 過長 marquee 的效果，直接往下排」）。
 * 照 SCCD（user 2026-11-23；SCCD js/modules/ui/marquee-overflow.js）：每秒 80px、兩端不淡，放開滑回去＝wipe 曲線。
 * 這裡只做兩件事：
 *   1) 量：哪行放不下、跑一圈多遠（--loop＝字寬＋間距；接力那份是 CSS 的 text-shadow 畫在 --loop 外）。
 *      內容一變就重量：換頁、換語言（lang.js 直接換 textContent）、後台渲染（MutationObserver），字體載入、視窗寬變。
 *   2) 跑／停：跑＝text-indent 0 → −loop 一直重複（字在 p 自己的框裡移，不包任何東西）；
 *      停＝往最近的那一端滑回去（0，或剛好一整圈＝接力那份停在起點，長得跟 0 一樣），不會跳回原位（user 不要「直接切換位置」）。
 * 事件掛在 document（選單在殼上、不在 #page-content 裡；換頁只換 main）→ 開機叫一次。觸控／減少動態時 CSS 讓它照常折行＝量不到放不下的行，這裡自然不動。
 *
 * 同一個 hover 也做「蓋黑收圓點」（page.css .item-cover）：見下面 strike()／unstrike()。user 2026-11-22 定的是蓋黑收直條（清單列與摺疊都是），
 * 2026-11-25 最後出來的那根直條換成一顆圓點（「hover效果從stroke改成出現點，menu的也是」「hover時的那個動態要留下」）＝帶照舊蓋上、收到字尾；
 * 摺疊的圓點是 CSS 的（平常空心、打開實心），這裡只做帶。程式裡「stroke」＝收完留著的那一顆。
 */
import { DUR } from './motion.js';
import { prefersReducedMotion } from './reduce-motion.js';

const LINES = '.item-row p';   // 只有副標跑馬燈；標題（h3、師資詳細頁頁頭的 h1）折行（user 2026-11-23）
const GAP = 2;   // 一圈的接縫（em），同底列跑馬燈（chrome.css .bar-news-copy）、同 SCCD
const SPEED = 80;   // 每秒幾 px，同 SCCD 桌面（marqueeSpeed）；原本跟底列同速 2.5em/s（user 2026-11-23 嫌「只動一點」）
/** 每行現在在跑的那一個（一直跑的，或停下來往回滑的） @type {WeakMap<HTMLElement, Animation>} */
const runs = new WeakMap();
const DOT_GAP = 0.5;   // 圓點離字尾多遠（em，那一列的字級；＝chrome.css 選單選中那項常駐的圓點 margin-left）。圓點多大＝--dot-size（骨牌的圓孔，cssPx）
// 中文字右邊燒在字體裡的字距（em；＝scripts/build-fonts.py TRACKING ÷ 1000，重切字體改了那個數字這裡跟著改）：帶與直條算到字本身的右緣、不含這段
// （user 2026-11-23：「精確到這個文字 box 的最右緣」「去掉 hover 時最後一個字的字距」）。英數走 JetBrains Mono、沒有加字距
const TRACK = 0.205;
/** 量字的筆畫有多低（textLines：「蓋」的帶要蓋住 g、j、y 的腳） */
const pen = /** @type {CanvasRenderingContext2D} */ (document.createElement('canvas').getContext('2d'));
// ponytail: 只認 BMP 的中日韓區段＝走中文字體的字（含中文標點）；fallback 到中文字體的其他符號（★…）不扣，真的看到再加區段
const CJK = /[⺀-鿿豈-﫿︰-﹏＀-￯]/;
// 蓋黑收圓點的列：整列連結、摺疊（清單列的摺疊：動態、課程、常見問題…；只有帶，圓點是 CSS 的）、選單的選項（user 2026-11-22：選單的 hover 比照清單；選中的那項 CSS 常駐圓點，strike 跳過）、
// 首頁展開的動態（一則＝li、hover 整則；user 2026-11-23：「hover news title 時也要加上我們設定的 hover 效果」）、
// 內頁的連結（連結清單＝網站地圖、姊妹系所、入學附件，404 的回首頁，聯絡頁的 email；user 2026-11-23，原本圓點）、
// 首頁底列的動態（user 2026-11-23：「hover 外層的 news 時也有這個 hover 的效果」）
const ROWS = 'a.item-row, .page-body summary, .site-menu :is(.nav-link, .lang-btn), .site-bar .bar-lang, .home-news-list li, .page-body :is(.nav-link, .footer-body a:not(.footer-social a)), .bar-news';
// 深色模式鈕、聯絡頁的社群（只有 icon）不在這裡：icon 的 hover 不加遮罩（user 2026-11-25：「hover它們時不需要加上那個遮罩」）＝深色模式上下顛倒、社群 icon 下方一顆圓點（chrome.css）
/** 帶／直條插在哪、照誰的框擺：底列的動態＝軌道（展開時跟它一起淡掉；放不下的字在軌道裡面那層切，欄外的直條才看得到，chrome.css），其他＝列本身
 * @param {Element} row */
const hostOf = (row) => row.querySelector(':scope > .bar-news-track') || row;
const HOLD = 1000;   // 定位後閃一下（flash）：圓點停多久才切掉（ms）
/** 有直條的列（hover／聚焦著，或摺疊開著）：插進去的帶與直條、正在跑的動畫、做完了沒（做完的字變了要跟著重排）、
 * 游標離開了（leave：還在跑＝照樣跑完、做完時不出／切出去）、直條切出去的途中改終點（aim：游標回來／又走，照 leave 切回整根或切到沒有）
 * @typedef {{ bands: HTMLElement[], anims: Animation[], settled: boolean, leave: boolean, aim: (() => void) | null }} Strike
 * @type {Map<Element, Strike>} */
const striking = new Map();
let wipe = 'ease';   // 帶的曲線＝--ease-wipe（initItemMarquee 讀）
let soft = 'ease';   // chevron 淡入淡出的曲線＝--ease-standard（同上）

/** @param {HTMLElement} line */
const loopOf = (line) => parseFloat(line.style.getPropertyValue('--loop')) || 0;
/** 現在往左走了多遠（px，0～loop） @param {HTMLElement} line */
const offsetOf = (line) => -parseFloat(getComputedStyle(line).textIndent) || 0;

// ponytail: 跑到一半字寬變了（字體剛好載進來）＝這一圈的接縫會錯一下，下次 hover 就對；真的看得到再在 measure 裡重開
function measure() {
  document.querySelectorAll(`#page-content ${LINES}`).forEach(el => {
    const line = /** @type {HTMLElement} */ (el), range = document.createRange();
    range.selectNodeContents(line);
    const textW = range.getBoundingClientRect().width;   // 字本身多寬（不管 text-indent 走到哪）
    const clipped = textW > line.clientWidth + 0.5;
    line.classList.toggle('is-clipped', clipped);
    if (clipped) line.style.setProperty('--loop', `${textW + GAP * parseFloat(getComputedStyle(line).fontSize)}px`);
  });
  // 收完的直條照現在的字重排（換語言、視窗寬變；摺疊開著時直條會留很久）；換頁換掉的列順手清掉
  striking.forEach((run, row) => { if (!row.isConnected) striking.delete(row); else if (run.settled) relay(row); });
}
let queued = 0;
const schedule = () => { if (!queued) queued = requestAnimationFrame(() => { queued = 0; measure(); }); };
/** 重量（直條照現在的字擺）：底列的動態換了一則（chrome.js runNews；換的是 class，MutationObserver 看不到） */
export const remeasure = schedule;

/** 列裡的字一行一段，相對列的框：左緣 x、字的上緣 y（字高 1em、對在字的正中）、字高 h、字尾 end、字級 fs；依元素分組（標題／問題、各個副標）。
 * 副標一行不折：跑馬燈的 text-indent 走到哪都只算框裡那段，放不下＝到框的右緣；會折行的內文（首頁動態的摘要、內頁的連結）＝一行一段、直條只在最後一行；
 * 標題折行也是一行一段＝一行一條帶（user 2026-11-24：「改成一行一個遮罩好了，不需要一起做一個大的遮罩」；11-23 是整塊一段）。
 * 給報讀的字（.sr-only）不算；沒有字的（選單的深色模式鈕只有圖示）＝那顆圖示當成一行、連圖示都沒有（社群方框）＝整個框
 * @param {Element} row @returns {{ x: number, y: number, h: number, end: number, fs: number, ink: number, top: number }[][]} */
function textLines(row) {
  const o = hostOf(row).getBoundingClientRect(), range = document.createRange();
  // 首頁的動態：標題、摘要各一組（有摘要＝p 裡兩個 span.block，cms-pages.js homeNews）、第一組是標題；摘要折行＝一行一段
  const news = row.matches('.home-news-list li');
  const els = row.matches('.item-row') ? [...row.querySelectorAll(':is(h1, h3, p):not(.sr-only)')]
    : news ? [...row.querySelectorAll('p')].flatMap(p => p.children.length ? [...p.children] : [p])
    : row.matches('.bar-news') ? [...row.querySelectorAll('.bar-news-copy > .is-current')]   // 底列：只有正在顯示的那則（其他則疊在同一格、藏著）
    : [row];
  return els.map((el) => {
    const line = /** @type {HTMLElement} */ (el), r = line.getBoundingClientRect(), cs = getComputedStyle(line);
    const lh = parseFloat(cs.lineHeight), fs = parseFloat(cs.fontSize);
    // 字的筆畫上下緣（g、j、y 的腳；user 2026-11-24：「hover 時的那個 box，應該要將文字的 g、j、y 這樣的也覆蓋到」；
    // 中文的頂同一天：「這個遮罩，在中文字體上也會有之前設定的 gyj 類似的問題」——中文字比 1em 的帶高、頂會露出來）：canvas 量每個字往基線上、下伸多少，
    // 基線＝字框頂＋主字型的 ascent（Range 量到的字框＝主字型 JetBrains Mono 的 ascent＋descent，上 1.02、下 0.3：1em 的帶對在正中只蓋到基線上 0.86、下 0.14em）
    pen.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const asc = pen.measureText('x').fontBoundingBoxAscent;
    // 字尾不超出框（放不下的那幾行）；用框的寬不用 clientWidth：行內元素（選單的選項）clientWidth 是 0、有框線的（社群方框）會少掉框線。
    // 底列的動態：框＝欄（那則放不下＝比欄寬、在跑馬燈＝同副標放不下：帶到欄的右緣、直條在欄外）
    const box = line.matches('.bar-news-copy > *') ? /** @type {Element} */ (line.parentElement).getBoundingClientRect() : null;
    const left = box ? box.left : r.left + parseFloat(cs.paddingLeft), right = box ? box.right : r.right - parseFloat(cs.paddingRight);
    const clipped = line.classList.contains(box ? 'is-long' : 'is-clipped');
    /** @type {{ x: number, y: number, h: number, end: number, fs: number, ink: number, top: number }[]} */
    const lines = [];
    const texts = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);   // 只量字：插在列裡的帶（span）不算
    for (let n = texts.nextNode(); n; n = texts.nextNode()) {
      if (n.parentElement?.closest('.sr-only')) continue;
      const s = /** @type {Text} */ (n).data;
      // 一個字一個字量：空白不算（行尾的空白不延長帶）、中文字扣掉右邊的字距（TRACK）＝字尾精確到最後一個字
      for (let k = 0; k < s.length; k++) {
        if (/\s/.test(s[k])) continue;
        range.setStart(n, k); range.setEnd(n, k + 1);
        const q = range.getBoundingClientRect();
        if (!q.width) continue;
        // 第幾行（照行高分）；字高 1em 對在字的正中（行內的選項框只有字那麼高，不能拿框頂加半個行距算）
        const cy = q.top + q.height / 2, i = Math.max(0, Math.floor((cy - r.top) / lh));
        const b = lines[i] ??= { x: Infinity, y: cy - fs / 2 - o.top, h: fs, end: -Infinity, fs, ink: -Infinity, top: Infinity };
        b.x = Math.min(b.x, q.left);
        b.end = Math.max(b.end, q.right - (CJK.test(s[k]) ? TRACK * fs : 0));
        const m = pen.measureText(s[k]), base = q.top + asc - o.top;
        b.ink = Math.max(b.ink, base + m.actualBoundingBoxDescent);   // 這一行字最低的筆畫、最高的筆畫（「蓋」的帶要蓋到這裡，strike）
        b.top = Math.min(b.top, base - m.actualBoundingBoxAscent);
      }
    }
    // 沒有字：圖示當那一行（選單的深色模式鈕）；連圖示都沒有＝整個框（聯絡頁的社群方框）
    const icon = lines.length ? null : line.querySelector(':scope > .icon') ?? (line === row ? line : null);
    if (icon) { const q = icon.getBoundingClientRect(); lines.push({ x: q.left, y: q.top - o.top, h: q.height, end: q.right, fs: q.height, ink: -Infinity, top: Infinity }); }
    return lines.filter(Boolean).map(b => ({ ...b, x: Math.max(b.x, left) - o.left, end: (clipped ? right : Math.min(b.end, right)) - o.left }));
  }).filter(ls => ls.length);
}
/** 一條帶／一顆圓點（插進列裡、相對列的框） @param {{ x: number, y: number, w: number, h: number }} r */
function band(r) {
  const s = document.createElement('span');
  s.className = 'item-cover';
  s.setAttribute('aria-hidden', 'true');
  Object.assign(s.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
  return s;
}
/** 圓點貼在列的最右緣的：清單列、首頁展開的動態——右邊都讓出了 --row-pad（page.css；首頁動態 home.css），圓點落在那一段裡
 * （user 2026-11-24 直條那時定的：「stroke 的位置是這個 box 的最右緣」）。其他（選單——「stroke 的位置是跟在文字後面」、內頁的連結清單——「網站地圖的 stroke 位置，比照 menu 的」、
 * 底列的動態、聯絡頁的連結）在字尾後面 */
// 入學的附件（摺疊展開裡的連結）：圓點也在最右邊、對齊上面摺疊那顆（details 的右緣；user 2026-11-25：「hover這兩個也要有」，同一天稍早是只做帶、不出點）
const FILE = '.fold-body .link-list .nav-link';
const EDGE = `a.item-row, .home-news-list li, ${FILE}`;
// 摺疊：圓點是 CSS 的（summary::after：平常空心、打開實心；user 2026-11-25）＝這裡只做帶、收完不留東西
const FOLD = '.page-body summary';
// 開內頁的清單列（師資 → 詳細頁）：收完的不是圓點、是 ai 的 next（chevron；user 2026-11-25：「如果是開啓裏面的頁面的話，在hover的時候，圓點會改成右邊的chevron」）。
// 外連（另開新視窗）＝下面的 EXT_LINK（share）。大小同全站 icon＝骨牌的高、寬照 next.svg 的比例（icon.css .icon-next）；右邊讓的位置跟著寬（page.css）
const PAGE_LINK = 'a.item-row[href]:not([target="_blank"])';
// 整列是外部連結的清單列（另開新視窗：合作企業、規章）：收完的是 share（往右上的箭頭；user 2026-11-25：「我也上傳一個 share 的 svg，我想要有外部鏈接的 list 都用這個 icon」），
// 進出、位置、手機常駐都比照 chevron。沒 href 的 a（實際上沒網址的列是 div）照舊圓點
const EXT_LINK = 'a.item-row[href][target="_blank"]';
/** 收完的是 icon 的列：[class, 寬 ÷ 高（高＝骨牌 --block-h，同全站 icon）]；不是＝null（圓點） @param {Element} row @returns {[string, number] | null} */
const iconOf = (row) => (row.matches(PAGE_LINK) ? ['item-chevron', 32.793 / 70] : row.matches(EXT_LINK) ? ['item-share', 46.14 / 69.96] : null);
// 收完的那一顆（圓點、chevron、share）的進出＝只淡、不糊（--dur-fade、--ease-standard（user 2026-11-25：「hover之後出現的item不需要加blur，fade就好了」；原本淡＋糊＝網站的 fade））
const SHOWN = { opacity: 1 }, faded = () => ({ opacity: 0 });
/** CSS 長度算成 px（--dot-size、--block-h 是 calc()、讀變數拿不到算好的值 → 拿一個掛著它的元素量）。
 * class 用 .item-cover（絕對定位＝不動版面）：下面的 MutationObserver 才認得是自己插的、不會又觸發重量（重量 → 重排圓點 → 再量，停不下來） */
const cssPx = (/** @type {string} */ v) => { const p = document.createElement('i'); p.className = 'item-cover'; p.style.width = v; document.body.append(p); const w = p.getBoundingClientRect().width; p.remove(); return w; };
/** 收完的樣子＝一顆圓點（.item-dot；user 2026-11-25，原本一根直條）：清單列（EDGE）一列一顆、貼在列的最右緣、對在字那一塊（標題第一行～最後一個副標）的正中
 * ——有縮圖的列字跟圖上下置中＝也是整列的正中；手機圖在上、字在下＝對字、不落在圖上。其他每組一顆、在最後一行的字尾後面隔 DOT_GAP、對在那一行的正中。摺疊沒有。
 * 標 phase＝stroke：重排換上的那組也認得出是收完的那一顆、不是帶 @param {Element} row */
const strokes = (row) => {
  const groups = row.matches(FOLD) ? [] : textLines(row);
  if (!groups.length) return [];
  const d = cssPx('var(--dot-size)'), all = groups.flat(), gap = DOT_GAP * parseFloat(getComputedStyle(row).fontSize);
  const icon = iconOf(row), [w, h, cls] = icon ? [cssPx(`calc(var(--block-h) * ${icon[1]})`), cssPx('var(--block-h)'), `item-icon ${icon[0]}`] : [d, d, 'item-dot'];
  const o = hostOf(row).getBoundingClientRect(), right = (row.matches(FILE) ? /** @type {Element} */ (row.closest('details')).getBoundingClientRect().right : o.right) - o.left;
  const rs = row.matches(EDGE)
    ? [{ x: right - w, y: (Math.min(...all.map(b => b.y)) + Math.max(...all.map(b => b.y + b.h))) / 2 - h / 2 }]
    // 底列的動態：字的上方、對在看得到那段字的正中、離字頂 DOT_GAP（user 2026-11-25：「hover news marquee的時候，點設定在上方」；原本在字尾後面）
    : row.matches('.bar-news') ? all.slice(0, 1).map(b => ({ x: (b.x + b.end) / 2 - d / 2, y: b.y - gap - d }))
    : groups.map(g => { const b = g[g.length - 1]; return { x: b.end + gap, y: b.y + b.h / 2 - d / 2 }; });
  return rs.map(r => { const s = band({ ...r, w, h }); s.classList.add(...cls.split(' ')); s.dataset.phase = 'stroke'; return s; });
};

/** 蓋黑收圓點（user 2026-11-22 蓋黑收直條；2026-11-25 直條換成圓點、帶的動態照舊；下面說的「直條」現在都是那顆圓點，摺疊沒有這一顆）：
 * 每行字先被一條字高的帶蓋住（左 → 右長出來），長完一起往右收到字尾、沒有了——標題、每個副標；
 * 帶收完、游標還在，馬上在圓點自己的位置淡出來（不等；user 2026-11-25：「直接開始吧，不用delay」——同一天先改 0.1 秒，11-24 起是再等 0.2 秒）（網站的 fade；user 2026-11-25：「hover時的點改成fade出來」——11-24 起是 clip 從左到右切出來；位置見 strokes）（user 2026-11-24：「回到原本的設計，stroke 出來的 timing 改成 0.5s 之後出現，
 * 如果 cursor 有繼續留在 item 上的話」）；出場＝淡出（fadeOut；同一天，11-24 起是從左往右切出去）。
 * 程式叫的（always：首頁定位後閃一下 flash、入學頁 deep link 的 hover）同樣不等。選單同這一套、只是圓點在字尾後面（user 2026-11-24）。
 * 折行＝一行一條帶（標題也是，user 2026-11-24）；選單這類每組一根直條的，前幾行沒有直條。
 * 直條留著的時候（hover 著）不重做；離開＝unstrike 淡出。只有 PC（觸控沒有 hover）；減少動態＝直接出、直接拿掉。
 * 一 hover 到帶就整段做完（user 2026-11-22：不管游標有沒有一直停在上面）：帶收完或等完時游標已經走了＝不出直條（user 2026-11-22：
 * 「如果我沒有停在 item 上的話，它這個動畫就不需要有那個 stroke」）；跑到一半離開又回來＝照樣出
 * @param {Element} row @param {string} easing @param {boolean} [always] 觸控也做（定位後閃一下＝flash，不是 hover）
 * @returns {Promise<void> | undefined} 做完了（直條留著或拿掉了）；沒做＝undefined */
function strike(row, easing, always = false) {
  const cur = striking.get(row);
  if (cur) { cur.leave = false; cur.aim?.(); return; }   // 跑到一半離開又回來＝做完時直條留著
  if ((!always && !window.SCAIDHelpers.canHover()) || row.matches('.active')) return;   // 選單選中的那項：CSS 已經有直條（chrome.css）
  const groups = textLines(row);
  if (!groups.length) return;
  /** @type {Strike} */
  const run = { bands: [], anims: [], settled: false, leave: false, aim: null };
  striking.set(row, run);
  if (prefersReducedMotion()) { relay(row); return Promise.resolve(); }   // 減少動態：直接是直條
  // 帶的框＝剛好那一行字，看得到的那段用 clip-path 切（px；% 跟 px 混著補間會變 calc）：蓋＝從左邊長到蓋住字、收＝往右收到字尾。
  // 直條是另一條、左緣就在直條那一格——帶不跨過字尾後面的間隔（user 2026-11-23：「嚴格來說全部都是到文字 box 的右邊緣，
  // 如果是判斷有懸浮的話，應該是在原本應該出現的 stroke 位置 clip 出現」；原本是帶露出來的那段一路滑到直條那一格）
  const OPEN = 'inset(0px 0px 0px 0px)';
  // 往上、往下蓋到最高、最低的筆畫（中文字的頂、g、j、y 的腳；textLines top／ink），再多一個實體像素＝筆畫邊上反鋸齒的那一圈也蓋到
  // （user 2026-11-24 截圖：中文字頂只超出字高 0.2px，放大看是一排細細的邊露在帶的上緣）
  const px = 1 / devicePixelRatio;
  const covers = groups.flat().map(b => { const y = Math.min(b.y, b.top - px); return { s: band({ x: b.x, y, w: b.end - b.x, h: Math.max(b.y + b.h, b.ink + px) - y }), w: b.end - b.x }; });
  run.bands = covers.map(c => c.s);
  hostOf(row).prepend(...run.bands);   // 放最前面：.item-row:has(> .item-thumb) > :last-child 那條要的還是文字那欄
  const dur = DUR.fast * 1000, t = { duration: dur, easing }, alive = () => striking.get(row) === run;
  run.anims = covers.map(c => c.s.animate({ clipPath: [`inset(0px ${c.w}px 0px 0px)`, OPEN] }, { ...t, fill: 'forwards' }));   // 蓋
  /** 收完的那一顆（圓點、chevron、share 都一樣）：帶收完、馬上在自己那一格淡出來（不等，user 2026-11-25：「直接開始吧，不用delay」）（網站的 fade：淡＋糊、--dur-fade；user 2026-11-25：「hover時的點改成fade出來」、
   * 「如果一開始沒有icon在右邊的話，則做完遮罩之後，0.2s後fade出icon。適用於share、chevron」——chevron、share 同一天稍早是一 hover 就跟帶一起淡進來；
   * 圓點 11-24 起是 clip 從左到右切出來）。沒有 hover 的裝置右邊常駐 chevron／share（page.css）＝不走這裡。
   * 照現在的字擺；游標已經走了＝不出；淡的途中走了＝淡完再淡掉（fadeOut） */
  const appear = () => {
    if (!alive()) return;
    if (run.leave) { drop(row); return; }
    run.bands = strokes(row);
    hostOf(row).prepend(...run.bands);
    const from = faded();
    run.anims = run.bands.map(s => s.animate([from, SHOWN], { duration: DUR.fade * 1000, easing: soft, fill: 'forwards' }));
    return Promise.all(run.anims.map(a => a.finished)).then(() => {
      if (!alive()) return;
      relay(row);   // 換成乾淨的圓點
      if (run.leave) return fadeOut(row, run);
    });
  };
  return Promise.all(run.anims.map(a => a.finished)).then(() => {
    if (!alive()) return;
    // 收：帶收到字尾、沒有了（游標在不在都一樣）
    const cover = run.anims;
    run.anims = covers.map(c => { c.s.dataset.phase = 'out'; return c.s.animate({ clipPath: [OPEN, `inset(0px 0px 0px ${c.w}px)`] }, { ...t, fill: 'forwards' }); });
    cover.forEach(a => a.cancel());   // 蓋的那段停在終點（fill）是為了接得上；收的接手了就收掉
    return Promise.all(run.anims.map(a => a.finished));
  }).then(() => {
    if (!alive()) return;
    // 收完的帶拿掉（clip 切到寬 0 在 WebKit 會留一條細線）；游標還在＝馬上出那一顆
    run.anims.forEach(a => a.cancel());
    covers.forEach(c => c.s.remove());
    run.anims = []; run.bands = [];
    if (run.leave) { drop(row); return; }
    return appear();
  }).catch(() => {});   // 換頁把帶拿掉、動畫被取消
}
/** 圓點／chevron 出場：淡出（網站的 fade；user 2026-11-25；11-24 起圓點是從左往右切掉）。出場都走這裡（離開 unstrike、淡進來的途中游標就走了 strike、flash 停完）；淡完拿掉。
 * 淡到一半游標回來＝aim：從現在的樣子、用剩下的時間淡回來、留著（同一個 Animation，finished 照常等得到），淡回來後換成乾淨的那一顆
 * @param {Element} row @param {Strike} run */
function fadeOut(row, run) {
  // 圓點、chevron 都淡出：淡進來的東西消失也用淡的（user 2026-11-25：「chevron 出現改 fade 好了」「hover時的點改成fade出來」；圓點原本切出去）
  const dur = DUR.fade * 1000, gone = faded();
  /** @returns {Keyframe} */
  const end = () => (run.leave ? gone : SHOWN);
  /** 現在的樣子（淡到一半游標回來，從這裡接） @param {HTMLElement} s @returns {Keyframe} */
  const now = (s) => ({ opacity: getComputedStyle(s).opacity });
  run.settled = false;
  run.anims = run.bands.map(s => s.animate([SHOWN, end()], { duration: dur, easing: soft, fill: 'forwards' }));
  run.aim = () => run.anims.forEach((a, k) => {
    const e = /** @type {KeyframeEffect} */ (a.effect), s = run.bands[k];
    e.setKeyframes([now(s), end()]);
    e.updateTiming({ duration: Math.max(1, dur - (Number(a.currentTime) || 0)) });
    a.currentTime = 0;
  });
  return Promise.all(run.anims.map(a => a.finished)).then(() => {
    if (striking.get(row) !== run) return;
    if (run.leave) drop(row); else relay(row);
  }).catch(() => {});   // 被拿掉（換頁、離開）、動畫被取消
}
/** 直條照現在的字擺（收完、字或視窗寬變了） @param {Element} row */
function relay(row) {
  const run = striking.get(row);
  if (!run) return;
  run.anims.forEach(a => a.cancel());
  run.bands.forEach(s => s.remove());
  run.anims = [];
  run.bands = strokes(row);
  run.settled = true;
  hostOf(row).prepend(...run.bands);
}
/** 離開那一列（又沒開著）：圓點淡出（fadeOut；user 2026-11-25；11-24 是切出去、更早直接拿掉）；
 * 還在跑＝照樣跑完、做完時不出／淡出（strike）；正在淡出又回來又走＝改淡到沒有（aim）。減少動態＝直接拿掉 @param {Element} row */
function unstrike(row) {
  const run = striking.get(row);
  if (!run) return;
  run.leave = true;
  if (!run.settled) { run.aim?.(); return; }
  if (prefersReducedMotion()) drop(row); else fadeOut(row, run);
}
/** 帶／直條整組拿掉 @param {Element} row */
function drop(row) {
  const run = striking.get(row);
  if (!run) return;
  striking.delete(row);
  run.anims.forEach(a => a.cancel());
  run.bands.forEach(s => s.remove());
}
/** 定位後閃一下（首頁點底列的動態、展開定位到那則；chrome.js openNewsAt）＝同 hover 的蓋黑收直條，直條停一下（HOLD）就切掉
 * （user 2026-11-23：「highlight 是指我 hover 的效果，不是新的」「title 也會有 stroke，但就是停留一下就 fade out」）。
 * 觸控也閃（不是 hover）；中間游標移上去＝照 hover 的規矩（直條留著、離開直接拿掉） @param {Element} row */
export function flash(row) {
  if (striking.has(row)) return;   // 游標剛好在上面：直條已經有了／正在跑
  const done = strike(row, wipe, true), run = striking.get(row);
  done?.then(() => new Promise(r => setTimeout(r, HOLD))).then(() => {
    if (!run || striking.get(row) !== run || !run.settled || row.matches(':hover')) return;
    run.leave = true;
    if (prefersReducedMotion()) drop(row); else fadeOut(row, run);
  });
}

/** 首頁的動態正在升上來（chrome.js setNews 掛 html.news-rising）：還不能 hover，升完才可以（user 2026-11-24：「這個 news 出場時應該要 disable 掉 hover，只有在動畫結束才可以 hover」）。
 * 點照常（不用 pointer-events: none：點下去會穿到後面＝被當成點動態以外、收回去） @param {Element} row */
const rising = (row) => document.documentElement.classList.contains('news-rising') && !!row.closest('.home-news-list');
/** 選單的選項在捲動框兩端糊掉的那段裡（chrome.css .site-menu-nav li：照位置糊）＝不能 hover（user 2026-11-25：「menu的選項如果在模糊區的話，就不能hover它」）。
 * 鍵盤聚焦照常（瀏覽器會把它捲進來）。ponytail: 只在游標進去那一下看——停在上面把它捲清楚了，要再進出一次才有 hover。
 * 也不能點（chrome.js；user 2026-11-25：「模糊的那個選項也不能點」）、游標是一般的箭頭（下面 pointerover；「cursor也是default的才對」）。
 * 糊到 1px 以上才算：捲動框只比選項少幾 px 時，最後一項的糊只有零點幾 px＝看起來是清楚的、卻被擋掉（user 同一天：「捐款」要先往下捲才點得到，
 * 「沒有出現blur，但實際上應該是可以直接點擊的才對」；原本 > 0 就算） @param {Element} row */
export const fogged = (row) => { const li = row.closest('.site-menu-nav li'); return !!li && parseFloat(getComputedStyle(li).filter.slice(5)) >= 1; };   // 'blur(1.2px)' → 1.2；'none' → NaN
/** 升完：游標停在那一則上（升的途中進去、沒有再進出一次＝pointerover 不會再來）＝照 hover 的規矩補做（chrome.js） @param {Element} row */
export function hoverIfOver(row) { if (row.matches(':hover')) strike(/** @type {HTMLElement} */ (row), wipe); }

/** 程式叫的 hover：不管游標在不在都跑完整段（蓋 → 收 → 直條），回傳做完的 Promise；做完直條留著。
 * 入學頁的 deep link 先做完這個才打開那一則（cms-pages.js newsList；user 2026-11-24：「應該是先做完 hover，才打開 accordion，不是同時做」）
 * @param {Element} row */
export function hover(row) { return strike(/** @type {HTMLElement} */ (row), wipe, true) || Promise.resolve(); }

/** 開始跑（停到一半又進來＝從現在的位置接著跑） @param {HTMLElement} line */
function start(line) {
  const loop = loopOf(line);
  if (!loop || prefersReducedMotion()) return;   // 減少動態：CSS 已經讓它折行（中途才切過去的，class 可能還沒重量）
  const x = runs.has(line) ? offsetOf(line) : 0;
  runs.get(line)?.cancel();
  const dur = loop / SPEED * 1000;   // 速度固定：一圈的時間照距離算
  const a = line.animate({ textIndent: ['0px', `${-loop}px`] }, { duration: dur, iterations: Infinity });
  a.currentTime = (x / loop) * dur;
  line.classList.add('is-marquee');
  runs.set(line, a);
}
/** 停：滑回最近的那一端（時長、曲線同 SCCD 放開回彈） @param {HTMLElement} line @param {string} easing */
function stop(line, easing) {
  const run = runs.get(line);
  if (!run || !line.classList.contains('is-marquee')) return;
  const loop = loopOf(line), x = offsetOf(line), to = x < loop / 2 ? 0 : loop;
  run.cancel();
  const back = line.animate({ textIndent: [`${-x}px`, `${-to}px`] }, { duration: DUR.medium * 1000, easing, fill: 'forwards' });
  runs.set(line, back);
  back.onfinish = () => { back.cancel(); runs.delete(line); line.classList.remove('is-marquee'); };
}

export function initItemMarquee() {
  const main = document.getElementById('page-content');
  if (!main) return;
  wipe = getComputedStyle(document.documentElement).getPropertyValue('--ease-wipe').trim() || 'ease';
  soft = getComputedStyle(document.documentElement).getPropertyValue('--ease-standard').trim() || 'ease';
  /** 一列裡放不下的那幾行 @param {Element} row */
  const clippedIn = (row) => /** @type {HTMLElement[]} */ ([...row.querySelectorAll('.is-clipped')]);
  // hover＝整列，圖片上也算（user 2026-11-23：「hover 整個 list 會觸發 hover 的效果，而不是將文字跟圖片分開」；11-22 有縮圖的列只看文字那一欄）。
  // pointerover／out 會冒泡，進出列裡面的子元素也會觸發 → relatedTarget 還在同一列裡＝沒有真的進出
  /** 這次事件真的進出了 sel 那一列（回傳那一列） @param {PointerEvent} e @param {string} sel */
  const crossed = (e, sel) => {
    const row = e.target instanceof Element ? e.target.closest(sel) : null;
    return row && !(e.relatedTarget instanceof Node && row.contains(e.relatedTarget)) ? row : null;
  };
  document.addEventListener('pointerover', (e) => {
    const row = crossed(e, '.item-row'), hit = crossed(e, ROWS);
    if (row) clippedIn(row).forEach(start);
    const fog = !!hit && fogged(hit);
    // 選單糊掉那段裡的選項：游標也不是手指（user 2026-11-25：「cursor也是default的才對」）；清楚的＝照連結原本的
    if (hit instanceof HTMLElement && hit.matches('.site-menu-nav .nav-link')) hit.style.cursor = fog ? 'default' : '';
    if (hit && !rising(hit) && !fog) strike(hit, wipe);
  });
  document.addEventListener('pointerout', (e) => {
    const row = crossed(e, '.item-row'), hit = crossed(e, ROWS);
    if (row) clippedIn(row).forEach(l => stop(l, wipe));
    if (hit && !hit.matches(':focus-visible')) unstrike(hit);
  });
  // 鍵盤聚焦到那一列（a／summary 本身可以聚焦；首頁的動態＝一則裡面的連結）＝同 hover；滑鼠點的聚焦不算（:focus-visible）
  document.addEventListener('focusin', (e) => {
    const t = e.target instanceof Element ? e.target : null, hit = t?.matches(':focus-visible') ? t.closest(ROWS) : null;
    if (t?.matches('.item-row:focus-visible')) clippedIn(t).forEach(start);
    if (hit) strike(hit, wipe);
  });
  document.addEventListener('focusout', (e) => {
    const t = e.target instanceof Element ? e.target : null, hit = t?.closest(ROWS);
    if (t?.matches('.item-row')) clippedIn(t).forEach(l => stop(l, wipe));
    if (hit && !hit.matches(':hover')) unstrike(hit);
  });
  // 自己插／拿的帶不算：不然重排直條又觸發重量，停不下來（圖片上的中空板畫布也是插在列裡，thumb-board.js）。
  // 看整個 body：選單（殼）換語言時選項的字也會變，hover 著的直條要跟著搬
  const ours = (/** @type {MutationRecord} */ r) => r.type === 'childList' && [...r.addedNodes, ...r.removedNodes].every(n => n instanceof Element && n.matches('.item-cover, .thumb-board'));
  new MutationObserver(recs => { if (!recs.every(ours)) schedule(); }).observe(document.body, { childList: true, characterData: true, subtree: true });
  window.addEventListener('resize', schedule);
  document.fonts?.addEventListener('loadingdone', schedule);
  schedule();
}
