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
 * 同一個 hover 也做「蓋黑收直條」（user 2026-11-22，PC；清單列與摺疊（手風琴）都是，取代圓點，page.css .item-cover）：見下面 strike()／unstrike()。
 */
import { DUR } from './motion.js';
import { prefersReducedMotion } from './reduce-motion.js';

const LINES = '.item-row p';   // 只有副標跑馬燈；標題（h3、師資詳細頁頁頭的 h1）折行（user 2026-11-23）
const GAP = 2;   // 一圈的接縫（em），同底列跑馬燈（chrome.css .bar-news-copy）、同 SCCD
const SPEED = 80;   // 每秒幾 px，同 SCCD 桌面（marqueeSpeed）；原本跟底列同速 2.5em/s（user 2026-11-23 嫌「只動一點」）
/** 每行現在在跑的那一個（一直跑的，或停下來往回滑的） @type {WeakMap<HTMLElement, Animation>} */
const runs = new WeakMap();
const STROKE_W = 0.4;   // 直條寬（em，跟著那一行的字級）；高＝字高 1em（user 2026-11-22：以文字的高度為主、不用跟 logo 一樣）——標題折行＝整塊的高（user 2026-11-23）
// 中文字右邊燒在字體裡的字距（em；＝scripts/build-fonts.py TRACKING ÷ 1000，重切字體改了那個數字這裡跟著改）：帶與直條算到字本身的右緣、不含這段
// （user 2026-11-23：「精確到這個文字 box 的最右緣」「去掉 hover 時最後一個字的字距」）。英數走 JetBrains Mono、沒有加字距
const TRACK = 0.205;
// ponytail: 只認 BMP 的中日韓區段＝走中文字體的字（含中文標點）；fallback 到中文字體的其他符號（★…）不扣，真的看到再加區段
const CJK = /[⺀-鿿豈-﫿︰-﹏＀-￯]/;
// 蓋黑收直條的列：整列連結、摺疊（清單列的摺疊：動態、課程、常見問題…）、選單的選項（user 2026-11-22：選單的 hover 比照清單；選中的那項 CSS 常駐直條，strike 跳過）、
// 首頁展開的動態（一則＝li、hover 整則；user 2026-11-23：「hover news title 時也要加上我們設定的 hover 效果」）、
// 內頁的連結（連結清單＝網站地圖、姊妹系所、入學附件，404 的回首頁，聯絡頁的社群、email；user 2026-11-23，原本圓點）、
// 首頁底列的動態（user 2026-11-23：「hover 外層的 news 時也有這個 hover 的效果」）
const ROWS = 'a.item-row, .page-body summary, .site-menu :is(.nav-link, .lang-btn, .theme-btn), .home-news-list li, .page-body :is(.nav-link, .footer-body a), .bar-news';
/** 帶／直條插在哪、照誰的框擺：底列的動態＝軌道（展開時跟它一起淡掉；放不下的字在軌道裡面那層切，欄外的直條才看得到，chrome.css），其他＝列本身
 * @param {Element} row */
const hostOf = (row) => row.querySelector(':scope > .bar-news-track') || row;
const HOLD = 1000;   // 定位後閃一下（flash）：直條停多久才淡掉（ms）
/** 有直條的列（hover／聚焦著，或摺疊開著）：插進去的帶（收完就是直條）、正在跑的動畫、收完了沒（收完的字變了要跟著重排）、
 * 跑到一半游標就離開了（leave：照樣跑完、但收到沒有＝不留直條）、收的那段正在跑時改終點（aim：照 leave 對準直條或 0）
 * @typedef {{ bands: HTMLElement[], anims: Animation[], settled: boolean, leave: boolean, aim: (() => void) | null }} Strike
 * @type {Map<Element, Strike>} */
const striking = new Map();
let wipe = 'ease';   // 帶的曲線＝--ease-wipe（initItemMarquee 讀）

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
 * 清單列的標題折行＝整塊一段（第一行的上緣到最後一行的下緣、最寬那行的字尾；user 2026-11-23：兩行字不是兩個遮罩）；首頁動態的標題也是。
 * 給報讀的字（.sr-only）不算；沒有字的（選單的深色模式鈕只有圖示）＝那顆圖示當成一行、連圖示都沒有（社群方框）＝整個框
 * @param {Element} row @returns {{ x: number, y: number, h: number, end: number, fs: number }[][]} */
function textLines(row) {
  const o = hostOf(row).getBoundingClientRect(), range = document.createRange();
  // 首頁的動態：標題、摘要各一組（有摘要＝p 裡兩個 span.block，cms-pages.js homeNews）、第一組是標題；摘要折行＝一行一段
  const news = row.matches('.home-news-list li');
  const els = row.matches('.item-row') ? [...row.querySelectorAll(':is(h1, h3, p):not(.sr-only)')]
    : news ? [...row.querySelectorAll('p')].flatMap(p => p.children.length ? [...p.children] : [p])
    : row.matches('.bar-news') ? [...row.querySelectorAll('.bar-news-copy > .is-current')]   // 底列：只有正在顯示的那則（其他則疊在同一格、藏著）
    : [row];
  return els.map((el, k) => {
    const line = /** @type {HTMLElement} */ (el), r = line.getBoundingClientRect(), cs = getComputedStyle(line);
    const lh = parseFloat(cs.lineHeight), fs = parseFloat(cs.fontSize);
    // 字尾不超出框（放不下的那幾行）；用框的寬不用 clientWidth：行內元素（選單的選項）clientWidth 是 0、有框線的（社群方框）會少掉框線。
    // 底列的動態：框＝欄（那則放不下＝比欄寬、在跑馬燈＝同副標放不下：帶到欄的右緣、直條在欄外）
    const box = line.matches('.bar-news-copy > *') ? /** @type {Element} */ (line.parentElement).getBoundingClientRect() : null;
    const left = box ? box.left : r.left + parseFloat(cs.paddingLeft), right = box ? box.right : r.right - parseFloat(cs.paddingRight);
    const clipped = line.classList.contains(box ? 'is-long' : 'is-clipped');
    /** @type {{ x: number, y: number, h: number, end: number, fs: number }[]} */
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
        const b = lines[i] ??= { x: Infinity, y: cy - fs / 2 - o.top, h: fs, end: -Infinity, fs };
        b.x = Math.min(b.x, q.left);
        b.end = Math.max(b.end, q.right - (CJK.test(s[k]) ? TRACK * fs : 0));
      }
    }
    // 沒有字：圖示當那一行（選單的深色模式鈕）；連圖示都沒有＝整個框（聯絡頁的社群方框）
    const icon = lines.length ? null : line.querySelector(':scope > .icon') ?? (line === row ? line : null);
    if (icon) { const q = icon.getBoundingClientRect(); lines.push({ x: q.left, y: q.top - o.top, h: q.height, end: q.right, fs: q.height }); }
    const out = lines.filter(Boolean).map(b => ({ ...b, x: Math.max(b.x, left) - o.left, end: (clipped ? right : Math.min(b.end, right)) - o.left }));
    if (out.length < 2 || !(line.matches('.item-row :is(h1, h3)') || (news && !k))) return out;
    const last = out[out.length - 1];   // 標題折行＝整塊一段
    return [{ x: Math.min(...out.map(b => b.x)), y: out[0].y, h: last.y + last.h - out[0].y, end: Math.max(...out.map(b => b.end)), fs }];
  }).filter(ls => ls.length);
}
/** 一條帶／直條（插進列裡、相對列的框） @param {{ x: number, y: number, w: number, h: number }} r */
function band(r) {
  const s = document.createElement('span');
  s.className = 'item-cover';
  s.setAttribute('aria-hidden', 'true');
  Object.assign(s.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
  return s;
}
/** 直條的位置：每組（標題、各個副標；問題）最後一段的字尾後面隔一根直條寬，寬 STROKE_W（em）、高＝那一段的高（字高；折行的標題＝整塊）
 * @param {{ x: number, y: number, h: number, end: number, fs: number }[]} g */
const bar = (g) => { const b = g[g.length - 1], sw = b.fs * STROKE_W; return { x: b.end + sw, y: b.y, w: sw, h: b.h }; };
/** 收完的樣子：每組一根直條 @param {Element} row */
const strokes = (row) => textLines(row).map(g => band(bar(g)));

/** 蓋黑收直條（user 2026-11-22）：每行字先被一條字高的帶蓋住（左 → 右長出來），長完一起往右收到字尾、沒有了——標題、每個副標；
 * 帶收完、游標還在，直條才在它自己的位置（bar）淡出來（user 2026-11-23：「stroke 應該要等前面的遮罩做完才出現」「改成 fade 出來」）；一行一段的那種折行時，前幾行沒有直條。
 * 清單列的標題折行＝整塊一條帶、直條跟整塊一樣高（user 2026-11-23：「如果是兩行文字，就不是兩個遮罩」；textLines）。
 * 直條留著的時候（hover 著、摺疊開著）不重做；離開又沒開著＝unstrike 直接拿掉。只有 PC（觸控照舊圓點，page.css）；減少動態＝直接出直條。
 * 一 hover 到就整段做完（user 2026-11-22：不管游標有沒有一直停在上面）：跑到一半離開＝帶照樣跑完，但直條不出來、不留
 * （user 2026-11-22：「如果我沒有停在 item 上的話，它這個動畫就不需要有那個 stroke」）；跑完前又回來＝照樣淡出直條、留著
 * @param {Element} row @param {string} easing @param {boolean} [always] 觸控也做（定位後閃一下＝flash，不是 hover）
 * @returns {Promise<void> | undefined} 直條出來了（或沒出來、拿掉了）；沒做＝undefined */
function strike(row, easing, always = false) {
  const cur = striking.get(row);
  if (cur) { cur.leave = false; cur.aim?.(); return; }   // 跑到一半離開又回來＝照樣淡出直條、留著
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
  const covers = groups.flat().map(b => ({ s: band({ x: b.x, y: b.y, w: b.end - b.x, h: b.h }), w: b.end - b.x }));
  run.bands = covers.map(c => c.s);
  hostOf(row).prepend(...run.bands);   // 放最前面：.item-row:has(> .item-thumb) > :last-child 那條要的還是文字那欄
  const dur = DUR.fast * 1000, t = { duration: dur, easing }, finished = () => Promise.all(run.anims.map(a => a.finished));
  const alive = () => striking.get(row) === run;
  run.anims = covers.map(c => c.s.animate({ clipPath: [`inset(0px ${c.w}px 0px 0px)`, OPEN] }, { ...t, fill: 'forwards' }));   // 蓋
  return finished().then(() => {
    if (!alive()) return;
    // 收：帶收到字尾、沒有了（游標在不在都一樣）
    const cover = run.anims;
    run.anims = covers.map(c => { c.s.dataset.phase = 'out'; return c.s.animate({ clipPath: [OPEN, `inset(0px 0px 0px ${c.w}px)`] }, { ...t, fill: 'forwards' }); });
    cover.forEach(a => a.cancel());   // 蓋的那段停在終點（fill）是為了接得上；收的接手了就收掉
    return finished();
  }).then(() => {
    if (!alive()) return;
    if (run.leave) { drop(row); return; }   // 游標已經走了：不出直條，拿掉
    // 直條：帶收完、游標還在才在自己那一格淡出來（user 2026-11-23：「hover 的 stroke 改成 fade 出來」；原本從左往右長出來）。
    // 收完的帶先拿掉：clip 切到寬 0 在 WebKit 會留一條細線
    run.anims.forEach(a => a.cancel());
    run.bands.forEach(s => s.remove());
    run.bands = groups.map(g => band(bar(g)));
    run.bands.forEach(s => { s.dataset.phase = 'stroke'; });
    hostOf(row).prepend(...run.bands);
    return fadeStroke(row, run, 0);
  }).catch(() => {});   // 換頁把帶拿掉、動畫被取消
}
/** 直條淡到 run.leave 決定的那一端（leave＝沒有、不然＝有），淡完拿掉、或換成乾淨的直條（同一個位置、同一個大小）：
 * 只有透明度、不帶模糊（user 2026-11-23：「不要有 blur 的效果」＝網站「每個 fade 都帶模糊」的例外），時長、曲線同 --transition-fade。
 * 淡到一半改主意（游標走了／回來）＝aim：從現在的樣子、用剩下的時間淡到新的終點（同一個 Animation，finished 照常等得到）
 * @param {Element} row @param {Strike} run @param {number} from 起點的透明度 */
function fadeStroke(row, run, from) {
  const fade = DUR.fade * 1000, easing = getComputedStyle(document.documentElement).getPropertyValue('--ease-standard').trim() || 'ease';
  const end = () => ({ opacity: run.leave ? 0 : 1 });
  run.settled = false;
  run.anims = run.bands.map(s => s.animate([{ opacity: from }, end()], { duration: fade, easing, fill: 'forwards' }));
  run.aim = () => run.anims.forEach((a, k) => {
    const e = /** @type {KeyframeEffect} */ (a.effect);
    e.setKeyframes([{ opacity: getComputedStyle(run.bands[k]).opacity }, end()]);
    e.updateTiming({ duration: Math.max(1, fade - (Number(a.currentTime) || 0)) });
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
/** 離開那一列（又沒開著）：直條直接拿掉（不淡，user 2026-11-22）；還在跑＝照樣跑完、但收到沒有（strike） @param {Element} row */
function unstrike(row) {
  const run = striking.get(row);
  if (!run) return;
  if (!run.settled) { run.leave = true; run.aim?.(); return; }
  drop(row);
}
/** 帶／直條整組拿掉 @param {Element} row */
function drop(row) {
  const run = striking.get(row);
  if (!run) return;
  striking.delete(row);
  run.anims.forEach(a => a.cancel());
  run.bands.forEach(s => s.remove());
}
/** 定位後閃一下（首頁點底列的動態、展開定位到那則；chrome.js openNewsAt）＝同 hover 的蓋黑收直條，直條停一下（HOLD）就淡掉
 * （user 2026-11-23：「highlight 是指我 hover 的效果，不是新的」「title 也會有 stroke，但就是停留一下就 fade out」）。
 * 觸控也閃（不是 hover）；中間游標移上去＝照 hover 的規矩（直條留著、離開直接拿掉） @param {Element} row */
export function flash(row) {
  if (striking.has(row)) return;   // 游標剛好在上面：直條已經有了／正在跑
  const done = strike(row, wipe, true), run = striking.get(row);
  done?.then(() => new Promise(r => setTimeout(r, HOLD))).then(() => {
    if (!run || striking.get(row) !== run || !run.settled || row.matches(':hover')) return;
    run.leave = true;
    if (prefersReducedMotion()) drop(row); else fadeStroke(row, run, 1);
  });
}

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
    if (hit) strike(hit, wipe);
  });
  /** 開著的摺疊（不是正在收）的那一列：直條留著（user 2026-11-22） @param {Element} el */
  const openFold = (el) => el.matches('details[open]:not(.is-closing) > summary');
  document.addEventListener('pointerout', (e) => {
    const row = crossed(e, '.item-row'), hit = crossed(e, ROWS);
    if (row) clippedIn(row).forEach(l => stop(l, wipe));
    if (hit && !hit.matches(':focus-visible') && !openFold(hit)) unstrike(hit);
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
    if (hit && !hit.matches(':hover') && !openFold(hit)) unstrike(hit);
  });
  // 摺疊打開＝直條留著（user 2026-11-22：手風琴打開時 stroke 要留在畫面上）；收起來（開別則時被一起收也是）又沒 hover／聚焦著＝拿掉。
  // toggle 不冒泡 → capture；accordion.js 縮完才拿掉 open（toggle 那時才來），縮的途中先由 CSS 藏（page.css .is-closing）
  main.addEventListener('toggle', (e) => {
    const d = e.target, s = d instanceof HTMLDetailsElement ? d.querySelector(':scope > summary') : null;
    if (!(d instanceof HTMLDetailsElement) || !s?.matches(ROWS)) return;
    if (d.open) strike(s, wipe); else if (!s.matches(':hover') && !s.matches(':focus-visible')) unstrike(s);
  }, true);
  // 自己插／拿的帶不算：不然重排直條又觸發重量，停不下來（圖片上的中空板畫布也是插在列裡，thumb-board.js）。
  // 看整個 body：選單（殼）換語言時選項的字也會變，hover 著的直條要跟著搬
  const ours = (/** @type {MutationRecord} */ r) => r.type === 'childList' && [...r.addedNodes, ...r.removedNodes].every(n => n instanceof Element && n.matches('.item-cover, .thumb-board'));
  new MutationObserver(recs => { if (!recs.every(ours)) schedule(); }).observe(document.body, { childList: true, characterData: true, subtree: true });
  window.addEventListener('resize', schedule);
  document.fonts?.addEventListener('loadingdone', schedule);
  schedule();
}
