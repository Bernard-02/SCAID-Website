/**
 * 清單列的標題／副標跑馬燈（css/components/page.css「標題、副標各一行」；user 2026-11-21）：
 * 每行一行不折，放不下＝右邊淡掉（.is-clipped）；hover／鍵盤聚焦那一列＝放不下的那幾行一直往左跑、左右都淡（.is-marquee）。
 * 這裡只做兩件事：
 *   1) 量：哪行放不下、跑一圈多遠（--loop＝字寬＋間距；接力那份是 CSS 的 text-shadow 畫在 --loop 外）。
 *      內容一變就重量：換頁、換語言（lang.js 直接換 textContent）、後台渲染（MutationObserver），字體載入、視窗寬變。
 *   2) 跑／停：跑＝text-indent 0 → −loop 一直重複（字在 h3／p 自己的框裡移，不包任何東西）；
 *      停＝往最近的那一端滑回去（0，或剛好一整圈＝接力那份停在起點，長得跟 0 一樣），不會跳回原位（user 不要「直接切換位置」）。
 * 事件掛在 document（選單在殼上、不在 #page-content 裡；換頁只換 main）→ 開機叫一次。觸控／減少動態時 CSS 讓它照常折行＝量不到放不下的行，這裡自然不動。
 *
 * 同一個 hover 也做「蓋黑收直條」（user 2026-11-22，PC；清單列與摺疊（手風琴）都是，取代圓點，page.css .item-cover）：見下面 strike()／unstrike()。
 */
import { DUR } from './motion.js';
import { MARQUEE_SPEED } from './chrome.js';
import { prefersReducedMotion } from './reduce-motion.js';

const LINES = '.item-row :is(h1, h3, p)';   // h1＝師資詳細頁的頁頭（同列表那一列）
const GAP = 2;   // 一圈的接縫（em），同底列跑馬燈（chrome.css .bar-news-copy）
/** 每行現在在跑的那一個（一直跑的，或停下來往回滑的） @type {WeakMap<HTMLElement, Animation>} */
const runs = new WeakMap();
const STROKE_W = 0.4;   // 直條寬（em，跟著那一行的字級）；高＝字高 1em（user 2026-11-22：以文字的高度為主、不用跟 logo 一樣）
// 蓋黑收直條的列：整列連結、摺疊（清單列的摺疊＋常見問題那種手風琴）、選單的選項（user 2026-11-22：選單的 hover 比照清單；選中的那項 CSS 常駐直條，strike 跳過）
const ROWS = 'a.item-row, .page-body summary, .site-menu :is(.nav-link, .lang-btn, .theme-btn)';
/** 有直條的列（hover／聚焦著，或摺疊開著）：插進去的帶（收完就是直條）、正在跑的動畫、收完了沒（收完的字變了要跟著重排）、
 * 跑到一半游標就離開了（leave：照樣跑完、但收到沒有＝不留直條）、收的那段正在跑時改終點（aim：照 leave 對準直條或 0）
 * @type {Map<Element, { bands: HTMLElement[], anims: Animation[], settled: boolean, leave: boolean, aim: (() => void) | null }>} */
const striking = new Map();

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

/** 列裡的字一行一段，相對列的框：左緣 x、字的上緣 y（字高 1em、對在字的正中）、字高 h、字尾 end；依元素分組（標題／問題、各個副標）。
 * 清單列一行不折：跑馬燈的 text-indent 走到哪都只算框裡那段，放不下＝到框的右緣；常見問題的問題會折行＝一行一段。
 * 給報讀的字（.sr-only）不算；沒有字的（選單的深色模式鈕只有圖示）＝那顆圖示當成一行
 * @param {Element} row @returns {{ x: number, y: number, h: number, end: number }[][]} */
function textLines(row) {
  const o = row.getBoundingClientRect(), range = document.createRange();
  const els = row.matches('.item-row') ? [...row.querySelectorAll(':is(h1, h3, p):not(.sr-only)')] : [row];
  return els.map(el => {
    const line = /** @type {HTMLElement} */ (el), r = line.getBoundingClientRect(), cs = getComputedStyle(line);
    const lh = parseFloat(cs.lineHeight), fs = parseFloat(cs.fontSize);
    // 字尾不超出框（放不下的那幾行）；行內元素（選單的選項）clientWidth 一律是 0 → 用框的寬
    const left = r.left + parseFloat(cs.paddingLeft), right = r.left + (line.clientWidth || r.width) - parseFloat(cs.paddingRight);
    const clipped = line.classList.contains('is-clipped');
    /** @type {{ x: number, y: number, h: number, end: number }[]} */
    const lines = [];
    const texts = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);   // 只量字：插在列裡的帶（span）不算
    for (let n = texts.nextNode(); n; n = texts.nextNode()) {
      if (n.parentElement?.closest('.sr-only')) continue;
      range.selectNodeContents(n);
      for (const q of range.getClientRects()) {
        if (!q.width) continue;
        // 第幾行（照行高分）；字高 1em 對在字的正中（行內的選項框只有字那麼高，不能拿框頂加半個行距算）
        const cy = q.top + q.height / 2, i = Math.max(0, Math.floor((cy - r.top) / lh));
        const b = lines[i] ??= { x: Infinity, y: cy - fs / 2 - o.top, h: fs, end: -Infinity };
        b.x = Math.min(b.x, q.left);
        b.end = Math.max(b.end, q.right);
      }
    }
    const icon = lines.length ? null : line.querySelector(':scope > .icon');
    if (icon) { const q = icon.getBoundingClientRect(); lines.push({ x: q.left, y: q.top - o.top, h: q.height, end: q.right }); }
    return lines.filter(Boolean).map(b => ({ ...b, x: Math.max(b.x, left) - o.left, end: (clipped ? right : Math.min(b.end, right)) - o.left }));
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
/** 收完的樣子：每組（標題、各個副標；問題）最後一行的字尾後面隔一根直條寬，一根直條 @param {Element} row */
const strokes = (row) => textLines(row).map(g => { const b = g[g.length - 1], sw = b.h * STROKE_W; return band({ x: b.end + sw, y: b.y, w: sw, h: b.h }); });

/** 蓋黑收直條（user 2026-11-22）：每行字先被一條字高的帶蓋住（左 → 右長出來），長完一起往右收——標題、每個副標（常見問題＝問題）
 * 最後一行的帶收成一根直條（寬 STROKE_W、高＝字高），停在字尾後面隔一根直條寬；折行的前幾行收到沒有。
 * 直條留著的時候（hover 著、摺疊開著）不重做；離開又沒開著＝unstrike 直接拿掉。只有 PC（觸控照舊圓點，page.css）；減少動態＝直接出直條。
 * 一 hover 到就整段做完（user 2026-11-22：不管游標有沒有一直停在上面）：跑到一半離開＝照樣跑完，但收到沒有、不留直條
 * （user 2026-11-22：「如果我沒有停在 item 上的話，它這個動畫就不需要有那個 stroke」）；跑完前又回來＝照樣收成直條、留著
 * @param {Element} row @param {string} easing */
function strike(row, easing) {
  const cur = striking.get(row);
  if (cur) { cur.leave = false; cur.aim?.(); return; }   // 跑到一半離開又回來＝照樣收成直條、留著
  if (!window.SCAIDHelpers.canHover() || row.matches('.active')) return;   // 選單選中的那項：CSS 已經有直條（chrome.css）
  const groups = textLines(row);
  if (!groups.length) return;
  const run = { bands: /** @type {HTMLElement[]} */ ([]), anims: /** @type {Animation[]} */ ([]), settled: false, leave: false, aim: /** @type {(() => void) | null} */ (null) };
  striking.set(row, run);
  if (prefersReducedMotion()) { relay(row); return; }   // 減少動態：直接是直條
  // 每條帶的框＝它動到的整個範圍（最後一行多留出字尾後面的間隔＋直條），看得到的那段用 clip-path 切（user 2026-11-22：
  // 「預設是遮罩這個文字，還在 item 上的話才在 stroke 的位置 clip 出來這個 stroke」；原本是一條比字還長的帶整條 scaleX 壓成直條——
  // 縮放的那層邊緣會糊、看起來比較細，收完換成真的直條時像突然大一點）。三種樣子都用 px（% 跟 px 混著補間會變 calc）：
  // text＝剛好蓋住字、stroke＝只剩直條那一格、none＝收到字尾、沒有了；不是最後一行的帶收到右邊沒有
  const items = groups.flatMap(g => g.map((b, i) => {
    const last = i === g.length - 1, sw = b.h * STROKE_W, tail = last ? 2 * sw : 0, w = b.end + tail - b.x;
    return {
      s: band({ x: b.x, y: b.y, w, h: b.h }),
      from: `inset(0px ${w}px 0px 0px)`,
      text: `inset(0px ${tail}px 0px 0px)`,
      stroke: last ? `inset(0px 0px 0px ${w - sw}px)` : `inset(0px 0px 0px ${w}px)`,
      none: `inset(0px ${tail}px 0px ${w - tail}px)`,
    };
  }));
  run.bands = items.map(i => i.s);
  row.prepend(...run.bands);   // 放最前面：.item-row:has(> .item-thumb) > :last-child 那條要的還是文字那欄
  const dur = DUR.fast * 1000, t = { duration: dur, easing }, finished = () => Promise.all(run.anims.map(a => a.finished));
  run.anims = items.map(i => i.s.animate({ clipPath: [i.from, i.text] }, { ...t, fill: 'forwards' }));   // 蓋：從左邊長到剛好蓋住字
  finished().then(() => {
    if (striking.get(row) !== run) return;
    // 收：游標還在＝露出來的那段滑到直條那一格；已經走了＝收到字尾、沒有了
    const end = (/** @type {typeof items[number]} */ i) => (run.leave ? i.none : i.stroke);
    const cover = run.anims;
    run.anims = items.map(i => { i.s.dataset.phase = 'out'; return i.s.animate({ clipPath: [i.text, end(i)] }, { ...t, fill: 'forwards' }); });
    cover.forEach(a => a.cancel());   // 蓋的那段停在終點（fill）是為了接得上；收的接手了就收掉
    // 收到一半才走（或才回來）：從現在的樣子、用剩下的時間收到新的終點（同一個 Animation，finished 照常等得到）
    run.aim = () => run.anims.forEach((a, k) => {
      const e = /** @type {KeyframeEffect} */ (a.effect), now = getComputedStyle(items[k].s).clipPath;
      e.setKeyframes({ clipPath: [now, end(items[k])] });
      e.updateTiming({ duration: Math.max(1, dur - (Number(a.currentTime) || 0)) });
      a.currentTime = 0;
    });
    return finished().then(() => {
      if (striking.get(row) !== run) return;
      if (run.leave) drop(row);   // 游標已經走了：收到沒有了，拿掉
      else relay(row);            // 收完換成乾淨的直條（同一個位置、同一個大小）
    });
  }).catch(() => {});   // 換頁把帶拿掉、動畫被取消
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
  row.prepend(...run.bands);
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

/** 開始跑（停到一半又進來＝從現在的位置接著跑） @param {HTMLElement} line */
function start(line) {
  const loop = loopOf(line);
  if (!loop || prefersReducedMotion()) return;   // 減少動態：CSS 已經讓它折行（中途才切過去的，class 可能還沒重量）
  const x = runs.has(line) ? offsetOf(line) : 0;
  runs.get(line)?.cancel();
  const dur = loop / (MARQUEE_SPEED * parseFloat(getComputedStyle(line).fontSize)) * 1000;   // 速度固定：一圈的時間照距離算
  const a = line.animate({ textIndent: ['0px', `${-loop}px`] }, { duration: dur, iterations: Infinity });
  a.currentTime = (x / loop) * dur;
  line.classList.add('is-marquee');
  runs.set(line, a);
}
/** 停：滑回最近的那一端，到了才收左邊的淡 @param {HTMLElement} line @param {string} easing */
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
  const root = getComputedStyle(document.documentElement);
  const easing = root.getPropertyValue('--ease-standard').trim() || 'ease', wipe = root.getPropertyValue('--ease-wipe').trim() || 'ease';
  /** 一列裡放不下的那幾行 @param {Element} row */
  const clippedIn = (row) => /** @type {HTMLElement[]} */ ([...row.querySelectorAll('.is-clipped')]);
  /** 游標要在哪裡才算 hover 這一列：有縮圖的清單列＝文字那一欄（user 2026-11-22：「hover 文字即可，不需要是整個 box」；
   *  文字那欄＝最後一個子元素，帶與圖片的畫布都插在最前面），其他（沒縮圖的列、常見問題、選單的選項）＝整個。
   *  圖片上的中空板照舊 hover 整個 box 就出（thumb-board.js） @param {Element} row */
  const zoneOf = (row) => (row.matches('.item-row') && row.querySelector(':scope > .item-thumb') && row.lastElementChild) || row;
  // hover：pointerover／out 會冒泡，進出範圍裡面的子元素也會觸發 → relatedTarget 還在同一個範圍裡＝沒有真的進出
  /** 這次事件真的進出了 sel 那一列的範圍（回傳那一列） @param {PointerEvent} e @param {string} sel */
  const crossed = (e, sel) => {
    const row = e.target instanceof Element ? e.target.closest(sel) : null, zone = row && zoneOf(row);
    return zone && zone.contains(/** @type {Node} */ (e.target)) && !(e.relatedTarget instanceof Node && zone.contains(e.relatedTarget)) ? row : null;
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
    if (row) clippedIn(row).forEach(l => stop(l, easing));
    if (hit && !hit.matches(':focus-visible') && !openFold(hit)) unstrike(hit);
  });
  // 鍵盤聚焦到那一列（a／summary 本身可以聚焦）＝同 hover；滑鼠點的聚焦不算（:focus-visible）
  document.addEventListener('focusin', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (t?.matches('.item-row:focus-visible')) clippedIn(t).forEach(start);
    if (t?.matches(`:is(${ROWS}):focus-visible`)) strike(t, wipe);
  });
  document.addEventListener('focusout', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (t?.matches('.item-row')) clippedIn(t).forEach(l => stop(l, easing));
    if (t?.matches(ROWS) && !zoneOf(t).matches(':hover') && !openFold(t)) unstrike(t);
  });
  // 摺疊打開＝直條留著（user 2026-11-22：手風琴打開時 stroke 要留在畫面上）；收起來（開別則時被一起收也是）又沒 hover／聚焦著＝拿掉。
  // toggle 不冒泡 → capture；accordion.js 縮完才拿掉 open（toggle 那時才來），縮的途中先由 CSS 藏（page.css .is-closing）
  main.addEventListener('toggle', (e) => {
    const d = e.target, s = d instanceof HTMLDetailsElement ? d.querySelector(':scope > summary') : null;
    if (!(d instanceof HTMLDetailsElement) || !s?.matches(ROWS)) return;
    if (d.open) strike(s, wipe); else if (!zoneOf(s).matches(':hover') && !s.matches(':focus-visible')) unstrike(s);
  }, true);
  // 自己插／拿的帶不算：不然重排直條又觸發重量，停不下來（圖片上的中空板畫布也是插在列裡，thumb-board.js）。
  // 看整個 body：選單（殼）換語言時選項的字也會變，hover 著的直條要跟著搬
  const ours = (/** @type {MutationRecord} */ r) => r.type === 'childList' && [...r.addedNodes, ...r.removedNodes].every(n => n instanceof Element && n.matches('.item-cover, .thumb-board'));
  new MutationObserver(recs => { if (!recs.every(ours)) schedule(); }).observe(document.body, { childList: true, characterData: true, subtree: true });
  window.addEventListener('resize', schedule);
  document.fonts?.addEventListener('loadingdone', schedule);
  schedule();
}
