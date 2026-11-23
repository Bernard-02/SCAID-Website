/**
 * 清單列 hover＝圖片上浮一塊流動的中空板（user 2026-11-22，PC；樣子在 css/components/page.css .thumb-board）。
 * hover 整個 box（整列，文字那邊也算；user 2026-11-22）或鍵盤聚焦到那一列＝圖片出板子，同標題的蓋黑收直條（item-marquee.js）。
 * 樣子照 user 2026-11-22 的參考圖（Photoshop 的條紋玻璃：人像被切成一根根直條、每條各自錯開）：圖切成差不多寬的直條
 * （平均＝圖寬 ÷ STRIPS、寬窄只差 ±VARY），每一條把自己中線兩邊 LENS 倍寬的圖擠進來（＝置換圖每條裡從 −到＋一路變的位移；方向照原圖），
 * 交界斷開、五官只在交界附近被多帶到一小段；沒有條線。毛玻璃的糊在 CSS（page.css .thumb-board --frost 1.5px，同背景筆跡；user 2026-11-22「加上 blur」，3px 就看不出條了）。每條格線照自己的節奏左右游移（幅度、快慢同背景 bg.js INK.drift／tide＝流動）。
 * 試過、被退掉的（都在 2026-11-22）：每格擠進 4 倍寬＋照骨牌寬切三四格（同一張照片重複好幾次）、條裡左右反過來＋紅綠藍色散（user：色散拿掉、
 * 反過來是反的）、切 12 條細條擠 3 倍（頭在相鄰幾條裡被複製）、只錯開不變形（細條上看不出來）、半圓柱透鏡變形＋條線＋只糊圖（user：「超怪的」）。
 * 條太細的話倍數小看不出來、倍數大就像在複製：條要寬一點（STRIPS 小）、倍數小一點（LENS 1.5～2）。
 * 隔著板子看到的圖畫在一張疊在縮圖上的畫布；進出場＝網站 fade（CSS），淡出那段照樣在流、淡完才停。
 * 縮圖兩種：div.item-thumb > img（動態；師資、合作企業接後台的照片也是）、img.item-thumb（榮譽的國旗）；沒有圖（灰底佔位）＝不做。
 * 觸控（沒有 hover）、系統減少動態＝不做（同背景）。換頁整個換掉：畫布離開頁面就不畫了。
 */
import { DUR } from './motion.js';
import { INK } from './bg.js';
import { prefersReducedMotion } from './reduce-motion.js';

const ROWS = 'a.item-row, .page-body summary.item-row';   // 會出板子的列：整列連結、清單列的摺疊（裡面有 .item-thumb 才有圖）
const STRIPS = 8;     // 一張圖平均切幾條（條太細＝錯位看不出來）
const VARY = 0.3;     // 每條的寬差平均幾成（參考圖每條差不多寬）
const LENS = 1.5;     // 每一條擠進來的圖＝自己寬的幾倍（1＝原樣；越大，交界錯得越多、五官被多帶到的那段越長；老師的照片 1.7 頭邊開始多出半個、2 就像複製了好幾個頭）
// 游移的幅度、一趟幾秒：同背景（bg.js INK）。讀不到（煙霧測試把 bg.js 換成空殼）就不游移——NaN 丟給 drawImage，WebKit 會丟例外
const DRIFT = INK.drift ?? 0, TIDE = INK.tide ?? 8;
/** 一張縮圖的板子（第一次 hover 才建、之後留著；until＝淡出到什麼時候還要畫）
 *  @typedef {{ thumb: HTMLElement, img: HTMLImageElement, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, lines: ReturnType<typeof cells>, until: number }} Board */
/** @type {WeakMap<Element, Board>} */
const boards = new WeakMap();
/** 看得到的（hover 著、或還在淡出） @type {Set<Board>} */
const shown = new Set();
let raf = 0;
/** 不放進頁面的畫布：先把看得到的那一張（object-fit: cover 裁好）整張畫進來，再從這裡一條一條切——
 *  沒寫寬高的 SVG（國旗）直接從圖切片 WebKit 畫不出來（實測：只剩一小點），整張畫可以 */
const flat = document.createElement('canvas'), fctx = flat.getContext('2d');

/** 一張圖寬 W 的直條格線（寫法同 bg.js grid()，只是寬窄差得少）：從圖左緣外排到 W，每條寬＝平均 × (1 ± VARY)。
 * 一條線＝{ x：沒游移時的位置、reach：最遠游移多少（照兩邊較窄的那一條 × INK.drift，不會跟隔壁交叉）、p／s：游移的起點／快慢 }；頭尾兩條不動
 * @param {number} W */
function cells(W) {
  const avg = Math.max(1, W / STRIPS), lines = [{ x: -avg * Math.random(), reach: 0, p: 0, s: 1 }];
  for (let x = lines[0].x, last = 0; x < W;) {
    const cw = avg * (1 + VARY * (2 * Math.random() - 1));
    if (last) lines[lines.length - 1].reach = DRIFT * Math.min(last, cw);
    lines.push({ x: x += cw, reach: 0, p: Math.random() * 2 * Math.PI, s: 0.6 + 0.8 * Math.random() });
    last = cw;
  }
  return lines;
}

/** 隔著板子畫一次（t 秒）：畫布對齊縮圖，圖照 object-fit: cover 裁好、一條一條貼 @param {Board} b @param {number} t */
function draw(b, t) {
  const { thumb, img, canvas, ctx } = b, W = thumb.offsetWidth, H = thumb.offsetHeight, dpr = devicePixelRatio || 1;
  Object.assign(canvas.style, { left: `${thumb.offsetLeft}px`, top: `${thumb.offsetTop}px`, width: `${W}px`, height: `${H}px` });
  const cw = Math.round(W * dpr), ch = Math.round(H * dpr);
  if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
  ctx.clearRect(0, 0, cw, ch);
  if (!img.naturalWidth || !W || !H || !fctx) return;   // 圖還沒載好
  flat.width = cw;   // 設寬高＝清空
  flat.height = ch;
  const s = Math.max(W / img.naturalWidth, H / img.naturalHeight) * dpr, iw = img.naturalWidth * s, ih = img.naturalHeight * s;
  fctx.drawImage(img, (cw - iw) / 2, (ch - ih) / 2, iw, ih);
  if (!(b.lines[b.lines.length - 1]?.x >= W)) b.lines = cells(W);   // 縮圖變寬了（視窗拉大）：格重抽到鋪滿
  const cols = b.lines.map((ln) => ln.x + ln.reach * Math.sin(t * 2 * Math.PI / TIDE * ln.s + ln.p));
  for (let i = 1; i < cols.length; i++) {
    const x0 = cols[i - 1], w = cols[i] - x0;
    if (w <= 0 || x0 + w <= 0 || x0 >= W) continue;
    // 隔著這一條看：它中線兩邊 LENS 倍寬的圖擠進這一條；取到圖外面就整段往裡挪（邊上那條也是滿的，不會露出底下沒折射的圖）
    const span = Math.min(W, w * LENS), a = Math.min(Math.max(x0 + w / 2 - span / 2, 0), W - span);
    // 格線不取整（同背景：游移要順）；往右多畫 1 個裝置 px、下一條蓋上來＝交界不留縫
    ctx.drawImage(flat, a * dpr, 0, span * dpr, ch, x0 * dpr, 0, w * dpr + 1, ch);
  }
}

/** @param {number} ts */
function frame(ts) {
  raf = 0;
  for (const b of shown) {
    if (!b.canvas.isConnected || (!b.canvas.classList.contains('is-on') && ts > b.until)) { shown.delete(b); continue; }
    draw(b, ts / 1000);
  }
  if (shown.size) raf = requestAnimationFrame(frame);
}

/** @param {HTMLElement} thumb */
function show(thumb) {
  let b = boards.get(thumb);
  if (!b) {
    const img = thumb instanceof HTMLImageElement ? thumb : thumb.querySelector('img'), row = thumb.closest('.item-row');
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
    if (!img || !row || !ctx) return;
    canvas.className = 'thumb-board';
    canvas.setAttribute('aria-hidden', 'true');
    // 放列裡最前面、絕對定位（img.item-thumb 裡面放不了東西）：.item-row:has(> .item-thumb) > :last-child 那條要的還是文字那欄
    row.prepend(canvas);
    getComputedStyle(canvas).opacity;   // 先把「藏著」那一態算出來，下面加 is-on 才有 fade（剛插進來就加的話會直接跳到現身）
    b = { thumb, img, canvas, ctx, lines: cells(thumb.offsetWidth), until: 0 };
    boards.set(thumb, b);
  }
  b.canvas.classList.add('is-on');
  shown.add(b);
  if (!raf) raf = requestAnimationFrame(frame);
}

/** @param {HTMLElement} thumb */
function hide(thumb) {
  const b = boards.get(thumb);
  if (!b) return;
  b.canvas.classList.remove('is-on');
  b.until = performance.now() + DUR.fade * 1000;   // 淡出那段照樣在流
}

export function initThumbBoard() {
  const main = document.getElementById('page-content');
  if (!main) return;
  /** 那一列的縮圖 @param {Element | null} row */
  const thumbOf = (row) => /** @type {HTMLElement | null} */ (row?.querySelector('.item-thumb') ?? null);
  const on = (/** @type {Element | null} */ row) => { const t = thumbOf(row); if (t && window.SCAIDHelpers.canHover() && !prefersReducedMotion()) show(t); };
  const off = (/** @type {Element | null} */ row) => { const t = thumbOf(row); if (t) hide(t); };
  // pointerover／out 會冒泡，進出列裡面的子元素也會觸發 → relatedTarget 還在同一列裡＝沒有真的進出
  /** @param {PointerEvent} e */
  const crossed = (e) => {
    const row = e.target instanceof Element ? e.target.closest(ROWS) : null;
    return row && !(e.relatedTarget instanceof Node && row.contains(e.relatedTarget)) ? row : null;
  };
  main.addEventListener('pointerover', (e) => on(crossed(e)));
  main.addEventListener('pointerout', (e) => { const row = crossed(e); if (row && !row.matches(':focus-visible')) off(row); });
  // 鍵盤聚焦到那一列＝同 hover；滑鼠點的聚焦不算（:focus-visible）
  main.addEventListener('focusin', (e) => { if (e.target instanceof Element && e.target.matches(`:is(${ROWS}):focus-visible`)) on(e.target); });
  main.addEventListener('focusout', (e) => { if (e.target instanceof Element && e.target.matches(ROWS) && !e.target.matches(':hover')) off(e.target); });
}
