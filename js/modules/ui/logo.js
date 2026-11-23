/**
 * 全站 logo 的動態（結構 pages/header.html .site-logo；樣式 css/components/chrome.css）。照 user 2026-11-22 的分鏡，硬切不淡：
 * logo＝兩個骨牌夾一段「stroke 區」。stroke 區有三種內容，彼此之間都經過「一條實心的帶」，變化一律從正中往兩邊——
 *   stroke        一根根直條（.logo-bars）：根數與位置照文字長度算（bars()）
 *   系名（文字）   三行字（.logo-text＝images/Logo Text.svg）：帶要先往下長到三行高、右骨牌跟著降到最後一行
 *   object 的名字  一行字（.logo-word）
 *   換內容        stroke 從中間併成帶／文字被黑從兩邊蓋回來 →（長度不同：帶換長度、骨牌跟著移）→ 帶從中間切成 stroke／打開露出文字
 *   進場          兩個骨牌貼在一起 → 拉開成帶 → 切成 stroke
 * 流程（同日）：
 *   - 第一次載入先演進場（首頁接著展開成系名），演完才拿掉 html.is-intro＝其他東西 fade in（chrome.css）。
 *   - 首頁：系名的 stroke（17 根）和文字之間一直來回；滑鼠在上面／鍵盤聚焦＝先不換（WCAG 2.2.2）。
 *   - 離開首頁：正好是文字就先變回 stroke 才換頁（router.js 等 logoToStroke()）。
 *   - 內頁：stroke 的長度＝右圖 object 的名字（object.js 回報，logoObject()）；只在 stroke 的狀態換長度。游標在 object 上＝露出名字。
 *     看不到 object 的時候（手機沒打開、模型還沒載到）＝系名的 17 根。
 * 座標用 SVG viewBox 的單位、寫成無單位的 CSS 變數（--tall、--x、--y、--w、--h），長度由 CSS 的 --u 換算：版面寬變了不用重量。
 * 減少動態／<html data-logo-still>（煙霧測試用）＝不演，直接到位（首頁是系名的文字）。
 */
import { DUR } from './motion.js';
import { prefersReducedMotion } from './reduce-motion.js';

const TEXT_HOLD = 2600, STROKE_HOLD = 1400;   // 首頁來回：文字停多久、stroke 停多久（ms）
const BLOCK = 45, GAP = 20, STROKE = 20;       // 骨牌寬、骨牌到 stroke 區的間隙、一根 stroke 的寬（viewBox 單位）
const POW = 1.24;                              // stroke 中疏邊密的曲線（Illustrator blend「Ease Out 6%」對出來的）
const ease = (/** @type {number} */ t) => t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;   // ＝EASE.move（power2.inOut）
const pause = (/** @type {number} */ ms) => new Promise(r => setTimeout(r, ms));
const lerp = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ t) => a + (b - a) * t;

/** @typedef {{ kind: 'dept' | 'obj', text: string, zh: boolean, L: number, mode: 'stroke' | 'text' }} Look  stroke 區現在的樣子（L＝長度，viewBox 單位） */

const root = document.documentElement;
/** @type {HTMLElement | null} */ let el = null;
/** @type {{ text: HTMLElement, word: HTMLElement, ruler: HTMLElement, bars: HTMLElement[], band: HTMLElement[], blocks: HTMLElement[] }} */ let parts;
let VW = 0, VH = 0, SH = 0, DEPT = 0;          // 文字版 viewBox 的寬、高；stroke 的高；系名的長度
/** @type {Look | null} */ let shown = null;   // 現在畫面上的樣子
/** @type {{ text: string, zh: boolean, reveal: boolean } | null} */ let obj = null;   // 右圖的 object（object.js 回報；null＝現在沒有）
/** @type {'stroke' | 'text'} */ let homeMode = 'stroke';
/** @type {Promise<void> | null} */ let busy = null;
let loop = 0, timer = 0;
const widths = new Map();                       // 名字 → 長度（量過的）
const still = () => prefersReducedMotion() || root.hasAttribute('data-logo-still');
const atHome = () => document.body.dataset.page === 'index';

// stroke 區：文字長度（幾個 stroke 寬）→ 每一根的左緣。a＝第一根左緣到正中那根右緣，每邊中間放 ⌊a÷3⌋ 根；
// 不到 5 一根置中、5–7 三根（公式在這一段會擠成一塊）。user 2026-11-22 定
function bars(/** @type {number} */ L) {
  if (L < 5) return [Math.max(0, (L - 1) / 2)];
  const a = L / 2 + .5, n = L < 7 ? 0 : Math.floor(a / 3), D = a - 1, out = [];
  for (let i = 0; i <= n; i++) out.push(D * Math.pow(i / (n + 1), POW));
  out.push(D);
  for (let i = n; i >= 0; i--) out.push(L - 1 - out[i]);
  return out;
}
// object 的名字用 logo 的字排出來多長（viewBox 單位）
function measure(/** @type {string} */ text, /** @type {boolean} */ zh) {
  const key = (zh ? 'zh:' : 'en:') + text, u = el ? el.offsetWidth / VW : 0;
  if (!widths.has(key) && u) { parts.ruler.textContent = text; parts.ruler.classList.toggle('is-zh', zh); widths.set(key, parts.ruler.offsetWidth / u); }
  return widths.get(key) ?? DEPT;
}
/** 現在該是什麼樣子 @returns {Look} */
function want() {
  if (atHome()) return { kind: 'dept', text: '', zh: false, L: DEPT, mode: still() ? 'text' : homeMode };
  if (obj) return { kind: 'obj', text: obj.text, zh: obj.zh, L: measure(obj.text, obj.zh), mode: obj.reveal ? 'text' : 'stroke' };
  return { kind: 'dept', text: '', zh: false, L: DEPT, mode: 'stroke' };
}
const same = (/** @type {Look | null} */ a, /** @type {Look} */ b) => !!a && a.kind === b.kind && a.text === b.text && a.mode === b.mode && Math.abs(a.L - b.L) < .01;

// 畫 a → b 的某一段演到 e（0…1）；不給 type＝停在 a
function draw(/** @type {Look} */ a, /** @type {Look} */ b = a, type = '', e = 0) {
  if (!el) return;
  const c = type === 'tall' || type === 'open' || type === 'cut' ? b : a;                               // 帶底下現在放誰的內容
  const L = type === 'resize' ? lerp(a.L, b.L, e) : c.L, xl = (VW - L) / 2 - BLOCK - GAP, xr = xl + L + BLOCK + 2 * GAP, span = L + 2 * GAP;
  const text = type === 'open' || type === 'close' || (!type && c.mode === 'text'), dept = c.kind === 'dept';
  const tall = type === 'tall' ? e : type === 'short' ? 1 - e : text && dept ? 1 : 0;                   // 帶長高幾成（只有系名的三行字）
  const mid = type === 'merge' ? e : 0;                                                                 // 中間那塊：從正中往兩邊長（併）
  const side = type === 'close' ? e : type === 'open' || type === 'cut' ? 1 - e : type && type !== 'merge' ? 1 : 0;   // 左右兩塊：縮回去＝切開／打開，伸出來＝蓋回來
  const set = (/** @type {HTMLElement} */ node, /** @type {Record<string, number>} */ vars) => { for (const k in vars) node.style.setProperty('--' + k, String(vars[k])); };
  set(el, { tall });
  set(parts.blocks[0], { x: xl, y: 0 }); set(parts.blocks[1], { x: xr, y: (VH - SH) * tall });
  parts.text.style.opacity = text && dept ? '1' : '0';
  parts.word.style.opacity = text && !dept ? '1' : '0';
  if (text && !dept) { parts.word.textContent = c.text; parts.word.classList.toggle('is-zh', c.zh); set(parts.word, { x: xl + BLOCK + GAP }); }
  const strokes = !text && type !== 'resize' && type !== 'tall' && type !== 'short';                    // 帶蓋滿的那幾段不用畫 stroke
  const at = strokes ? bars(c.L / STROKE) : [];
  parts.bars.forEach((bar, j) => {
    bar.style.opacity = strokes ? '1' : '0';
    if (strokes) set(bar, { x: xl + BLOCK + GAP + at[at.length === 1 ? 0 : Math.round(j * (at.length - 1) / (parts.bars.length - 1))] * STROKE });
  });
  const h = SH + (VH - SH) * tall, w = span * side * .505;                                              // 多 0.5%／0.5 單位：兩塊在正中、帶跟骨牌之間不留細縫
  set(parts.band[0], { x: xl + BLOCK - .5, w: w ? w + .5 : 0, h });
  set(parts.band[1], { x: VW / 2 - span * mid / 2, w: span * mid, h: SH });
  set(parts.band[2], { x: xr - w, w: w ? w + .5 : 0, h });
  el.dataset.kind = c.kind; el.dataset.mode = c.mode; el.toggleAttribute('data-busy', !!type);
}

// 一段一段演完 a → b
async function play(/** @type {Look} */ a, /** @type {Look} */ b, slow = false) {
  const steps = a.L < 0 ? [] : a.mode === 'text' ? (a.kind === 'dept' ? ['close', 'short'] : ['close']) : ['merge'];   // 進場（骨牌貼著、沒有 stroke 區）不用先併
  if (Math.abs(a.L - b.L) > .01) steps.push('resize');
  if (b.mode === 'text') steps.push(...(b.kind === 'dept' ? ['tall', 'open'] : ['open'])); else steps.push('cut');
  for (const type of steps) await new Promise(done => {
    const dur = (type === 'resize' && slow ? DUR.medium : DUR.fast) * 1000;
    let t0 = 0;
    const frame = (/** @type {number} */ now) => { t0 ||= now; const t = Math.min(1, (now - t0) / dur); draw(a, b, type, ease(t)); if (t < 1) requestAnimationFrame(frame); else done(undefined); };
    requestAnimationFrame(frame);
  });
  shown = b; draw(b);
}
// 一直演到「畫面上的樣子＝現在該有的樣子」；同時只跑一個
function settle() {
  if (!busy) busy = (async () => {
    for (;;) { const w = want(); if (same(shown, w)) break; if (still() || !shown) { shown = w; draw(w); break; } await play(shown, w); }
  })().finally(() => { busy = null; });
  return busy;
}

function stopLoop() { loop++; clearTimeout(timer); }
function startLoop() {   // 首頁：stroke ⇄ 文字
  stopLoop();
  if (still()) return;
  const id = loop;
  const tick = () => {
    if (id !== loop || !el) return;
    if ((window.SCAIDHelpers.canHover() && el.matches(':hover')) || el.matches(':focus-visible')) { timer = window.setTimeout(tick, 500); return; }
    homeMode = homeMode === 'text' ? 'stroke' : 'text';
    settle().then(() => { if (id === loop) timer = window.setTimeout(tick, homeMode === 'text' ? TEXT_HOLD : STROKE_HOLD); });
  };
  timer = window.setTimeout(tick, homeMode === 'text' ? TEXT_HOLD : STROKE_HOLD);
}

/** 片段注入後叫一次（main.js）：演進場，演完把其他東西放出來 */
export function initLogo() {
  el = document.querySelector('.site-logo');
  const reveal = () => root.classList.remove('is-intro');
  if (!el) { reveal(); return; }   // 殼沒載到：至少別讓內容一直藏著
  const q = (/** @type {string} */ s) => /** @type {HTMLElement[]} */ ([...(/** @type {HTMLElement} */ (el)).querySelectorAll(s)]);
  parts = { text: q('.logo-text')[0], word: q('.logo-word')[0], ruler: q('.logo-ruler')[0], bars: q('.logo-bars i'), band: q('.logo-band i'), blocks: q('.logo-block') };
  const cs = getComputedStyle(root), num = (/** @type {string} */ k) => parseFloat(cs.getPropertyValue(k));
  VW = num('--logo-vb-w'); VH = num('--logo-vb-h'); SH = num('--logo-stroke-vb-h'); DEPT = VW - 2 * (BLOCK + GAP);
  document.fonts?.ready.then(() => { widths.clear(); settle(); });   // 字體載好：名字的長度重量
  if (still()) { settle(); reveal(); return; }
  // 進場：兩個骨牌貼在一起（長度＝負的兩個間隙）→ 拉開成帶 → 切成 stroke；首頁再停一下、展開成系名
  const to = { ...want(), mode: /** @type {'stroke'} */ ('stroke') }, from = { ...to, L: -2 * GAP };
  draw(from, to, 'resize', 0);
  busy = play(from, to, true).finally(() => { busy = null; });
  busy.then(async () => {
    if (atHome()) { await pause(DUR.base * 1000); homeMode = 'text'; }
    await settle();
    reveal();
    if (atHome()) startLoop();
  });
}

/** 要離開首頁了：停止來回，正好是文字就先變回 stroke（router.js 等它） */
export async function logoToStroke() {
  stopLoop(); homeMode = 'stroke';
  if (!el) return;
  do { await settle(); } while (!same(shown, want()));
}

/** 換頁了（router.js）：首頁＝開始來回；內頁＝換成 object 的長度 */
export function logoPage() {
  if (!el) return;
  if (atHome()) startLoop(); else stopLoop();
  settle();
}

/** 右圖的 object 變了／露出名字／看不到了（object.js） @param {{ text: string, zh: boolean, reveal: boolean } | null} next */
export function logoObject(next) {
  obj = next;
  if (el && shown) settle();
}
