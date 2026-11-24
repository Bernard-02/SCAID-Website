/**
 * 右圖的 object（user 2026-11-22 一輪一輪定的；畫布在 pages/header.html .object-canvas，樣式 chrome.css）：
 * 一個 3D 模型從目前的視角打光，再用「同一種 stroke」排出來——每根形狀都一樣，明暗只靠排得多密、排在哪裡。定時隨機換下一個。
 *   - 模型：objects/index.json 列清單、objects/<slug>.bin 一個一檔，輪到（前一個還在的時候）才抓。scripts/build-objects.cjs 產生。
 *   - 排法：每一列從畫布正中往兩邊走、一路累加墨量、每滿 1 放一根（同 logo「從中間往兩邊」）；位置是連續的、不對格子。
 *     淺色模式墨多＝暗面，深色模式反過來。
 *   - 視角：平常停在正面、不動（不跟游標）；在這張圖上按住拖才轉（滑鼠、觸控都一樣）：左右可以一直轉、上下到正上／正下。
 *   - 換下一個＝stroke 隨機進出場：舊的停在當下轉到的角度一根一根消失，新的同時從正面一根一根出現；
 *     拖到一半的角度只留到換下一個為止。
 *   - 游標在 object 上（觸控：點一下）＝logo 露出它的名字，而且不換下一個；移開後從頭等一輪。
 *   - 放在殼上＝換頁不重來。PC：疊在當頁右圖那一格（page.css .page-figure > *）上，每一幀照它的位置擺；首頁沒有那一格＝不顯示。
 *     首頁 → 內頁（user 2026-11-23）：logo 上移的途中（html.logo-moving，router.js）先不出場、只先抓第一個模型，移完跟 logo 變形同時出場。
 *     PC 以外（手機、iPad；user 2026-11-23）：平常不出、也不跑（不載模型），底列右下角那顆鈕點了才搬進放大 dialog（chrome.js 叫 openObject／closeObject）。
 *   - 名字跟著網站語言（中／英）回報給 logo（logo.js logoObject）：內頁 logo 的 stroke 長度＝名字的長度。
 * 減少動態＝不換，只畫第一個（照樣可以拖著轉）。<html data-logo-still>（煙霧測試其他段落）＝整個不跑。
 */
import { sitePath } from './site-base.js';
import { prefersReducedMotion } from './reduce-motion.js';
import { logoObject } from './logo.js';

const COLS = 72, ROWS = 32;           // 排幾列；橫向的解析度（一格＝1.7 根 stroke 寬）
const HOLD = 2600, SWAP = 1600;       // 一個停多久、換一次多久（ms）
const VIEW = [-.35, .5];              // 正面的視角（左右、上下，弧度）：稍微從左上方看
const SSX = 4, SSY = 8, AMB = .05;    // 每格再細分幾個點算明暗；最暗的地方還留多少亮度
const SW = .59, SH = .86;             // 一根 stroke 佔一格寬、一列高的幾成
const RHO0 = 1 / (5.5 * SW), RHO1 = 1 / (1.3 * SW);   // 最疏、最密：兩根中心相距幾個 stroke 寬
const N = COLS * ROWS, BW = COLS * SSX, BH = ROWS * SSY, H = Math.PI / 2;
const LIGHT = [-.5, .7, .5].map(v => v / Math.hypot(.5, .7, .5));   // 光從左上前方來（跟著鏡頭）
const clamp = (/** @type {number} */ v, /** @type {number} */ a, /** @type {number} */ b) => Math.min(b, Math.max(a, v));

/** @typedef {{ v: Float32Array, n: Float32Array, f: Uint16Array, t: Float32Array, l: Float32Array }} Model */
/** @typedef {{ slug: string, zh: string, en: string, nv: number, nt: number, model?: Model, loading?: Promise<void>, failed?: boolean }} Item */
/** @typedef {{ n: number, r: Uint16Array, x: Float32Array }} Strokes */

const root = document.documentElement, wide = matchMedia('(min-width: 768px) and (hover: hover)');   // ＝tailwind.config.js screens.pc：只有 PC 出右圖
/** @type {HTMLCanvasElement | null} */ let canvas = null;
/** @type {CanvasRenderingContext2D} */ let g;
/** @type {Element | null} */ let shell = null;
/** @type {Item[]} */ let list = [];
/** @type {number[]} */ let order = [];
let at = -1;
/** @type {Item | null} */ let cur = null, nxt = null, pending = null;
/** @type {{ a: Float32Array, b: Float32Array } | null} */ let swap = null;
let prog = 0, hold = 0, last = 0, raf = 0, W = 0, placed = '', drawn = '';
let vYaw = 0, vPitch = 0, dYaw = 0, dPitch = 0;   // 畫面上的視角（離正面多少）、拖到的視角
/** @type {{ x: number, y: number, yaw: number, pitch: number, moved: boolean, locked: boolean } | null} */ let drag = null;
let reveal = false, inDialog = false;
const zb = new Float32Array(BW * BH), sb = new Uint8Array(BW * BH), rho = new Float32Array(BW);
const strokes = () => /** @type {Strokes} */ ({ n: 0, r: new Uint16Array(N * 2), x: new Float32Array(N * 2) });
const A = strokes(), B = strokes();
const off = () => root.hasAttribute('data-logo-still');   // 煙霧測試：整個不跑（不載模型、不畫），logo 也就一直是系名
const still = () => prefersReducedMotion();
const slot = () => document.querySelector('#page-content .page-figure > *');
const visible = () => !off() && !root.classList.contains('logo-moving') && (inDialog || (wide.matches && !!slot()));
const dark = () => root.dataset.theme === 'dark';

// 模型從某個視角打光，算進 sb（每個點多亮；0＝沒東西）。z-buffer，亮度在三角形裡平滑內插
function shoot(/** @type {Model} */ m, /** @type {number} */ yaw, /** @type {number} */ pitch) {
  const { v, n, f, t, l } = m, S = .46;
  zb.fill(-1e9); sb.fill(0);
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  for (let i = 0, j = 0; i < v.length; i += 3, j++) {
    let x1 = v[i] * cy + v[i + 2] * sy, z1 = -v[i] * sy + v[i + 2] * cy;
    t[i] = (x1 * S + .5) * BW; t[i + 1] = (.5 - (v[i + 1] * cp - z1 * sp) * S) * BH; t[i + 2] = v[i + 1] * sp + z1 * cp;
    x1 = n[i] * cy + n[i + 2] * sy; z1 = -n[i] * sy + n[i + 2] * cy;
    l[j] = AMB + (1 - AMB) * Math.pow((x1 * LIGHT[0] + (n[i + 1] * cp - z1 * sp) * LIGHT[1] + (n[i + 1] * sp + z1 * cp) * LIGHT[2] + 1) / 2, 1.5);   // 柔光：背光面慢慢暗下去
  }
  for (let k = 0; k < f.length; k += 3) {
    const ia = f[k], ib = f[k + 1], ic = f[k + 2], a = ia * 3, b = ib * 3, c = ic * 3;
    const ax = t[a], ay = t[a + 1], bx = t[b], by = t[b + 1], ex = t[c], ey = t[c + 1], area = (bx - ax) * (ey - ay) - (by - ay) * (ex - ax);
    if (Math.abs(area) < 1e-6) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, ex))), x1 = Math.min(BW - 1, Math.ceil(Math.max(ax, bx, ex))), y0 = Math.max(0, Math.floor(Math.min(ay, by, ey))), y1 = Math.min(BH - 1, Math.ceil(Math.max(ay, by, ey)));
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const qx = px + .5, qy = py + .5;
      const w0 = ((bx - qx) * (ey - qy) - (by - qy) * (ex - qx)) / area, w1 = ((ex - qx) * (ay - qy) - (ey - qy) * (ax - qx)) / area, w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const d = w0 * t[a + 2] + w1 * t[b + 2] + w2 * t[c + 2], i = py * BW + px;
      if (d > zb[i]) { zb[i] = d; sb[i] = 1 + 254 * (w0 * l[ia] + w1 * l[ib] + w2 * l[ic]); }
    }
  }
}
// 把 sb 排成 stroke：每一列從正中往兩邊走，一路累加墨量、每滿 1 放一根；奇數列錯開半拍（不然每列正中都對成一條直線）
function scatter(/** @type {Strokes} */ out) {
  const mid = BW >> 1, inv = dark();
  let n = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let x = 0; x < BW; x++) {
      let cnt = 0, sum = 0;
      for (let y = 0; y < SSY; y++) { const v = sb[(r * SSY + y) * BW + x]; if (v) { cnt++; sum += v; } }
      const br = cnt ? sum / cnt / 255 : 0;
      rho[x] = cnt * 2 > SSY ? (RHO0 + (RHO1 - RHO0) * Math.pow(inv ? br : 1 - br, 1.25)) / SSX : 0;
    }
    for (const dir of [1, -1]) {
      let acc = r & 1 ? .5 : dir > 0 ? 1 : 0;
      for (let x = dir > 0 ? mid : mid - 1; x >= 0 && x < BW; x += dir) {
        if (!rho[x]) { if (acc >= 1) acc -= 1; continue; }
        acc += rho[x];
        if (acc >= 1) { acc -= 1; const k = 1 - acc / rho[x]; out.r[n] = r; out.x[n] = (x + (dir > 0 ? k : 1 - k)) / SSX - .5; n++; }
      }
    }
  }
  out.n = n;
}

function load(/** @type {Item} */ o) {
  return o.loading ??= fetch(sitePath(`objects/${o.slug}.bin`)).then(r => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); }).then(b => {
    const p = new Int16Array(b, 0, o.nv * 3), n = new Int8Array(b, o.nv * 6, o.nv * 3);
    o.model = { v: Float32Array.from(p, x => x / 32767), n: Float32Array.from(n, x => x / 127), f: new Uint16Array(b, o.nv * 9 + o.nv % 2, o.nt * 3), t: new Float32Array(o.nv * 3), l: new Float32Array(o.nv) };
  }).catch(e => { console.warn('[object] 模型載入失敗', o.slug, e); o.failed = true; });
}
// 告訴 logo 現在是哪個 object（名字跟著網站語言）；看不到＝null
function report() {
  const o = nxt || cur, zh = !root.lang.startsWith('en');
  if (canvas) canvas.setAttribute('aria-label', o ? (zh ? o.zh : o.en) : '');
  logoObject(o && visible() ? { text: zh ? o.zh : o.en, zh, reveal } : null);
}
// 換成 o：舊的照當下的角度出場、新的從正面進場，每一根各抽一個時間點
function go(/** @type {Item} */ o) {
  const rnd = (/** @type {number} */ n) => Float32Array.from({ length: n }, Math.random);
  if (cur?.model) { shoot(cur.model, VIEW[0] + vYaw, clamp(VIEW[1] + vPitch, -H, H)); scatter(A); } else A.n = 0;
  shoot(/** @type {Model} */ (o.model), VIEW[0], VIEW[1]); scatter(B);
  swap = { a: rnd(A.n), b: rnd(B.n) };
  nxt = o; prog = still() ? 1 : 0;
  report();
}
function endSwap() {
  vYaw = vPitch = dYaw = dPitch = 0; drawn = '';   // 新的回到正面
  cur = nxt; nxt = null; swap = null; hold = HOLD;
  pending = list[order[at = (at + 1) % order.length]]; load(pending);   // 下一個先抓
}
function advance() {
  pending ??= list[order[at = (at + 1) % order.length]];
  load(pending);
  if (pending.failed) { pending = null; return; }
  if (pending.model) { const o = pending; pending = null; go(o); }
}
// 畫布擺到這一頁右圖那一格上（桌面）；回傳畫不畫得了
function place() {
  if (!canvas) return false;
  let w = canvas.clientWidth;
  if (!inDialog) {
    const r = slot()?.getBoundingClientRect();
    if (!r) return false;
    w = r.width;
    const key = `left:${r.left}px;top:${r.top}px;width:${w}px;height:${w}px`;
    if (key !== placed) canvas.style.cssText = placed = key;
  }
  const px = Math.round(w * Math.min(window.devicePixelRatio || 1, 2.5));
  if (px < 16) return false;
  if (px !== W) { W = canvas.width = canvas.height = px; drawn = ''; }
  return true;
}
function frame(/** @type {number} */ now) {
  raf = 0;
  if (!canvas || !visible()) { sync(); return; }
  raf = requestAnimationFrame(frame);
  const dt = Math.min(64, now - last); last = now;
  if (!place()) return;
  if (nxt) { prog += dt / SWAP; if (prog >= 1) endSwap(); }
  else if (!cur) advance();
  else if (!reveal && !drag && !still()) { hold -= dt; if (hold <= 0) advance(); }
  // 視角：預設停在正面、不動；在畫布上按住拖才轉（dYaw／dPitch），畫面慢一點點跟上
  if (!nxt) { const k = 1 - Math.exp(-dt / 100); vYaw += (dYaw - vYaw) * k; vPitch += (dPitch - vPitch) * k; }
  const yaw = VIEW[0] + vYaw, pitch = clamp(VIEW[1] + vPitch, -H, H), key = nxt ? '' : `${cur?.slug}|${yaw.toFixed(4)}|${pitch.toFixed(4)}|${dark()}`;
  if (key && key === drawn) return;   // 沒在換、視角也沒變：不重畫
  drawn = key;
  const PX = W / COLS, PY = W / ROWS, w = Math.max(1, Math.round(PX * SW)), h = Math.max(2, Math.round(PY * SH));
  const put = (/** @type {Strokes} */ s, /** @type {number} */ i) => g.rect(Math.round(s.x[i] * PX + (PX - w) / 2), Math.round(s.r[i] * PY + (PY - h) / 2), w, h);
  g.clearRect(0, 0, W, W); g.fillStyle = getComputedStyle(canvas).color; g.beginPath();
  if (nxt && swap) {   // 換的途中視角不動：舊的一根一根消失、新的同時一根一根出現
    for (let i = 0; i < A.n; i++) if (swap.a[i] >= prog) put(A, i);
    for (let i = 0; i < B.n; i++) if (swap.b[i] < prog) put(B, i);
  } else if (cur?.model) { shoot(cur.model, yaw, pitch); scatter(A); for (let i = 0; i < A.n; i++) put(A, i); }
  g.fill();
}
// 看得到才跑；看不到（首頁、手機沒打開）就停，並告訴 logo 現在沒有 object
function sync() {
  if (!canvas || !list.length) return;
  const on = visible();
  canvas.classList.toggle('is-on', on && !inDialog);
  if (on && !cur && !nxt) advance();   // 第一個模型已經抓好（logo 上移的途中先抓了）＝馬上開始進場，名字同時給 logo
  if (on && !raf) { last = performance.now(); drawn = ''; raf = requestAnimationFrame(frame); }
  report();
}

/** 片段注入後叫一次（main.js） */
export function initObject() {
  canvas = document.querySelector('.object-canvas');
  if (!canvas) return;
  g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  shell = canvas.parentElement;
  fetch(sitePath('objects/index.json')).then(r => r.json()).then((/** @type {Item[]} */ items) => {
    list = items; order = items.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [order[i], order[j]] = [order[j], order[i]]; }   // 每次進站順序都不一樣
    sync();
  }).catch(e => console.warn('[object] 清單載入失敗', e));
  const c = canvas;
  // 滑鼠：移上去＝露出名字、不換下一個；移開＝從頭等一輪
  c.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { reveal = true; report(); } });
  c.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { reveal = false; hold = HOLD; report(); } });
  // 轉視角（user 2026-11-22：只有在這張圖上按住拖才轉，平常不跟游標）：橫拖一個畫布寬＝轉半圈、可以一直轉；直拖到正上／正下為止。
  // 觸控沒拖就放開＝點一下，切換露不露名字。選單開著：第一下只收選單（chrome.js），不轉；換的途中視角不動
  const endDrag = () => { drag = null; c.classList.remove('is-dragging'); };
  c.addEventListener('pointerdown', e => {
    if (root.classList.contains('menu-open')) return;
    drag = { x: e.clientX, y: e.clientY, yaw: dYaw, pitch: dPitch, moved: false, locked: !!nxt };   // 換的途中按下去：不轉，但還是算一次點
    c.setPointerCapture(e.pointerId); c.classList.add('is-dragging');
    if (e.pointerType === 'mouse') e.preventDefault();   // 不要拖出選取範圍
  });
  c.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
    if (!drag.locked) { dYaw = drag.yaw + dx / c.clientWidth * Math.PI; dPitch = clamp(drag.pitch + dy / c.clientWidth * Math.PI, -H - VIEW[1], H - VIEW[1]); }
  });
  c.addEventListener('pointerup', e => { if (drag && e.pointerType !== 'mouse' && !drag.moved) { reveal = !reveal; if (!reveal) hold = HOLD; report(); } endDrag(); });
  c.addEventListener('pointercancel', endDrag);
  wide.addEventListener('change', sync);   // 視窗跨過 768：右圖出／收
  new MutationObserver(() => { drawn = ''; report(); }).observe(root, { attributes: true, attributeFilter: ['lang', 'data-theme'] });   // 換語言＝名字換；換深淺色＝墨多的那一面反過來
}

/** 換頁了（chrome.js syncFigure；首頁 → 內頁的 logo 移完 router.js 再叫一次）：找這一頁右圖那一格。
 * logo 上移的途中（html.logo-moving）先不出場，只先把第一個模型抓下來 */
export function syncObject() {
  placed = '';
  if (root.classList.contains('logo-moving') && list.length && !cur) load(pending ??= list[order[at = (at + 1) % order.length]]);
  sync();
}

/** 手機：畫布搬進放大 dialog（chrome.js）；關掉搬回殼上 @param {Element} box */
export function openObject(box) {
  if (!canvas) return;
  canvas.style.cssText = placed = '';
  box.replaceChildren(canvas);
  inDialog = true; sync();
}
export function closeObject() {
  if (!canvas || !inDialog) return;
  shell?.append(canvas);
  inDialog = false; reveal = false; sync();
}
