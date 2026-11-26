/**
 * 右圖的 object（user 2026-11-22 一輪一輪定的；畫布在 pages/header.html .object-canvas，樣式 chrome.css）：
 * 一個 3D 模型從目前的視角打光，再用「同一種 stroke」排出來——每根形狀都一樣，明暗只靠排得多密、排在哪裡。定時隨機換下一個。
 *   - 模型：objects/index.json 列清單、objects/<slug>.bin 一個一檔，輪到（前一個還在的時候）才抓。scripts/build-objects.cjs 產生。
 *     模型面數很低（蛋 24 個頂點）＝輪廓是多邊形 → 載進來先細分、照法線鼓成圓的（refine；user 2026-11-26：「至少圓形物件可以在旋轉之後看出來是圓的」）。
 *   - 排法：每一列從畫布正中往兩邊走、一路累加墨量、每滿 1 放一根（同 logo「從中間往兩邊」）；位置是連續的、不對格子。
 *     淺色模式墨多＝暗面，深色模式反過來。64 列（user 2026-11-26：「grid上要分割更多，才看得出來是什麽」；原本 32 列）。
 *   - 視角：平常停在正面、不動（不跟游標）；在這張圖上按住拖才轉（滑鼠、觸控都一樣）：上下左右都可以一直轉、沒有盡頭
 *     （user 2026-11-26：「不會有拖曳到最極限的情況發生，它應該是可以再翻另外一面的」；原本上下只到正上／正下）——
 *     繞的是畫面的直軸、橫軸（拖哪邊、眼前那一面就往哪邊走），不是模型自己的軸。
 *   - 換下一個＝stroke 隨機進出場、每一根用淡的（user 2026-11-26：「不是整個fade，是那個stroke做切換時，一個個fade 出場，fade 進場」；
 *     原本每一根是硬切）：舊的停在當下轉到的角度一根一根淡出，新的同時從正面一根一根淡入；拖到一半的角度只留到換下一個為止。
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
import { DUR } from './motion.js';

const COLS = 144, ROWS = 64;          // 排幾列；橫向的解析度（一格＝1.7 根 stroke 寬）。要更細／更粗＝兩個一起乘（比例 9:4＝stroke 的形狀）
const HOLD = 2600, SWAP = 1600;       // 一個停多久、換一次多久（ms）
const FADE = DUR.fade * 1000 / SWAP;  // 換的時候一根淡多久（佔整段的幾成）＝網站 fade 的時長
const VIEW = [-.35, .5];              // 正面的視角（左右、上下，弧度）：稍微從左上方看
const SSX = 4, SSY = 4, AMB = .05;    // 每格再細分幾個點算明暗；最暗的地方還留多少亮度
const SW = .59, SH = .86;             // 一根 stroke 佔一格寬、一列高的幾成
const ROUND = .6, FINE = 6000;        // 細分：鼓出去幾成（.6＝六～八邊形的截面鼓完剛好是圓）；細分到大約幾個三角形為止
const RHO0 = 1 / (5.5 * SW), RHO1 = 1 / (1.3 * SW);   // 最疏、最密：兩根中心相距幾個 stroke 寬
const N = COLS * ROWS, BW = COLS * SSX, BH = ROWS * SSY;
const LIGHT = [-.5, .7, .5].map(v => v / Math.hypot(.5, .7, .5));   // 光從左上前方來（跟著鏡頭）
// 姿態＝3×3 的旋轉（三列＝畫面的右、上、朝鏡頭各是模型的哪個方向）。正面＝先左右轉 VIEW[0]、再上下轉 VIEW[1]
const FRONT = (([cy, sy, cp, sp]) => [cy, 0, sy, sy * sp, cp, -cy * sp, -sy * cp, sp, cy * cp])([Math.cos(VIEW[0]), Math.sin(VIEW[0]), Math.cos(VIEW[1]), Math.sin(VIEW[1])]);
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
/** @type {{ a: Float32Array, b: Float32Array } | null} */ let swap = null;   // 換的途中：舊的、新的每一根從什麼時候開始淡（0～1−FADE）
let prog = 0, hold = 0, last = 0, raf = 0, W = 0, placed = '', drawn = '';
let R = FRONT.slice(), restX = 0, restY = 0;   // 畫面上的姿態；拖了還沒轉完的量（橫拖、直拖，弧度）
/** @type {{ x: number, y: number, px: number, py: number, moved: boolean } | null} */ let drag = null;   // x／y＝按下去的位置、px／py＝上一次的位置
let reveal = false, inDialog = false;
const zb = new Float32Array(BW * BH), sb = new Uint8Array(BW * BH), rho = new Float32Array(BW);
const strokes = () => /** @type {Strokes} */ ({ n: 0, r: new Uint16Array(N * 2), x: new Float32Array(N * 2) });
const A = strokes(), B = strokes();
const off = () => root.hasAttribute('data-logo-still');   // 煙霧測試：整個不跑（不載模型、不畫），logo 也就一直是系名
const still = () => prefersReducedMotion();
const slot = () => document.querySelector('#page-content .page-figure > *');
const visible = () => !off() && !root.classList.contains('logo-moving') && (inDialog || (wide.matches && !!slot()));
const dark = () => root.dataset.theme === 'dark';

// 目前的姿態再繞畫面的直軸轉 a、橫軸轉 b（弧度）：每次都是接著轉＝沒有盡頭、可以翻到任何一面。
// ponytail: 一直乘下去會慢慢不正交，沒有重新正交化——換下一個就回到 FRONT，累積不到看得出來
function turn(/** @type {number} */ a, /** @type {number} */ b) {
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sinB = Math.sin(b);
  for (let i = 0; i < 3; i++) {
    const x = R[i], y = R[3 + i], z = -x * sa + R[6 + i] * ca;
    R[i] = x * ca + R[6 + i] * sa; R[3 + i] = y * cb - z * sinB; R[6 + i] = y * sinB + z * cb;
  }
}
// 模型照某個姿態打光，算進 sb（每個點多亮；0＝沒東西）。z-buffer，亮度在三角形裡平滑內插
function shoot(/** @type {Model} */ m, /** @type {number[]} */ pose) {
  const { v, n, f, t, l } = m, S = .46, [xx, xy, xz, yx, yy, yz, zx, zy, zz] = pose;
  zb.fill(-1e9); sb.fill(0);
  for (let i = 0, j = 0; i < v.length; i += 3, j++) {
    const x = v[i], y = v[i + 1], z = v[i + 2], p = n[i], q = n[i + 1], r = n[i + 2];
    t[i] = ((xx * x + xy * y + xz * z) * S + .5) * BW; t[i + 1] = (.5 - (yx * x + yy * y + yz * z) * S) * BH; t[i + 2] = zx * x + zy * y + zz * z;
    l[j] = AMB + (1 - AMB) * Math.pow(((xx * p + xy * q + xz * r) * LIGHT[0] + (yx * p + yy * q + yz * r) * LIGHT[1] + (zx * p + zy * q + zz * r) * LIGHT[2] + 1) / 2, 1.5);   // 柔光：背光面慢慢暗下去
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

// 低面數的模型輪廓是多邊形 → 每個三角形切成 k×k 個小的，每個點照三個頂點的法線鼓出去（Phong tessellation）：
// 法線平滑的面（蛋、蘋果、杯身）鼓成圓的，三個頂點同一條法線的平面（箱子）不動。
// 兩個面在同一條邊上法線不同（杯口：側面鼓出去、蓋子是平的）＝鼓的量不同、會裂開 → 兩條邊之間補一條窄帶。
function refine(/** @type {Model} */ m) {
  const { v, n, f } = m, k = Math.min(4, Math.sqrt(FINE / (f.length / 3)) | 0);
  if (k < 2) return m;   // 面數本來就夠（動物、機器人）
  /** @type {number[]} */ const V = [], NN = [], F = [];
  /** @type {Map<string, number[][]>} */ const edges = new Map();
  const pos = (/** @type {number} */ i) => `${v[i]},${v[i + 1]},${v[i + 2]}`, steps = Array.from({ length: k + 1 }, (_, s) => s);
  for (let t = 0; t < f.length; t += 3) {
    const id = [f[t] * 3, f[t + 1] * 3, f[t + 2] * 3], base = V.length / 3, at = (/** @type {number} */ i, /** @type {number} */ j) => base + i * (k + 1) - i * (i - 1) / 2 + j;
    for (let i = 0; i <= k; i++) for (let j = 0; j <= k - i; j++) {
      const b = [(k - i - j) / k, i / k, j / k], P = [0, 0, 0], Q = [0, 0, 0], M = [0, 0, 0];   // P＝平的三角形上那一點、Q＝它投到三個頂點切面上的平均
      for (let c = 0; c < 3; c++) for (let a = 0; a < 3; a++) { P[a] += b[c] * v[id[c] + a]; M[a] += b[c] * n[id[c] + a]; }
      for (let c = 0; c < 3; c++) { const d = (P[0] - v[id[c]]) * n[id[c]] + (P[1] - v[id[c] + 1]) * n[id[c] + 1] + (P[2] - v[id[c] + 2]) * n[id[c] + 2]; for (let a = 0; a < 3; a++) Q[a] += b[c] * (P[a] - d * n[id[c] + a]); }
      const len = Math.hypot(M[0], M[1], M[2]) || 1;
      for (let a = 0; a < 3; a++) { V.push(P[a] + ROUND * (Q[a] - P[a])); NN.push(M[a] / len); }
    }
    for (let i = 0; i < k; i++) for (let j = 0; j < k - i; j++) { F.push(at(i, j), at(i + 1, j), at(i, j + 1)); if (j < k - i - 1) F.push(at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)); }
    // 三條邊上的點記下來（照兩端位置的順序），等一下找裂開的
    for (const [a, c, line] of /** @type {[number, number, number[]][]} */ ([[0, 1, steps.map(s => at(s, 0))], [0, 2, steps.map(s => at(0, s))], [1, 2, steps.map(s => at(k - s, s))]])) {
      const ka = pos(id[a]), kc = pos(id[c]), key = ka < kc ? ka + '|' + kc : kc + '|' + ka, lines = edges.get(key) ?? [];
      if (ka === kc) continue;
      lines.push(ka < kc ? line : line.reverse()); edges.set(key, lines);
    }
  }
  for (const lines of edges.values()) for (let e = 1; e < lines.length; e++) {
    const p = lines[0], q = lines[e];
    if (Math.hypot(V[p[1] * 3] - V[q[1] * 3], V[p[1] * 3 + 1] - V[q[1] * 3 + 1], V[p[1] * 3 + 2] - V[q[1] * 3 + 2]) < 1e-4) continue;   // 同一條線＝沒裂
    for (let s = 0; s < k; s++) F.push(p[s], p[s + 1], q[s + 1], p[s], q[s + 1], q[s]);
  }
  return { v: Float32Array.from(V), n: Float32Array.from(NN), f: Uint16Array.from(F), t: new Float32Array(V.length), l: new Float32Array(V.length / 3) };   // 頂點最多約 9000 個＝uint16 放得下
}
function load(/** @type {Item} */ o) {
  return o.loading ??= fetch(sitePath(`objects/${o.slug}.bin`)).then(r => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); }).then(b => {
    const p = new Int16Array(b, 0, o.nv * 3), n = new Int8Array(b, o.nv * 6, o.nv * 3);
    o.model = refine({ v: Float32Array.from(p, x => x / 32767), n: Float32Array.from(n, x => x / 127), f: new Uint16Array(b, o.nv * 9 + o.nv % 2, o.nt * 3), t: new Float32Array(o.nv * 3), l: new Float32Array(o.nv) });
  }).catch(e => { console.warn('[object] 模型載入失敗', o.slug, e); o.failed = true; });
}
// 告訴 logo 現在是哪個 object（名字跟著網站語言）；看不到＝null
function report() {
  const o = nxt || cur, zh = !root.lang.startsWith('en');
  if (canvas) canvas.setAttribute('aria-label', o ? (zh ? o.zh : o.en) : '');
  logoObject(o && visible() ? { text: zh ? o.zh : o.en, zh, reveal } : null);
}
// 換成 o：舊的照當下的角度出場、新的從正面進場，每一根各抽一個時間點開始淡
function go(/** @type {Item} */ o) {
  const rnd = (/** @type {number} */ n) => Float32Array.from({ length: n }, () => Math.random() * (1 - FADE));
  if (cur?.model) { shoot(cur.model, R); scatter(A); } else A.n = 0;
  shoot(/** @type {Model} */ (o.model), FRONT); scatter(B);
  swap = { a: rnd(A.n), b: rnd(B.n) };
  nxt = o; prog = still() ? 1 : 0;
  report();
}
function endSwap() {
  R = FRONT.slice(); restX = restY = 0; drawn = '';   // 新的回到正面
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
  // 視角：預設停在正面、不動；在畫布上按住拖才轉，畫面慢一點點跟上＝還沒轉完的量每一幀轉掉一部分（剩一點點就一次轉完）
  if (!nxt && (restX || restY)) {
    const k = Math.abs(restX) + Math.abs(restY) < 1e-3 ? 1 : 1 - Math.exp(-dt / 100);
    turn(restX * k, restY * k); restX -= restX * k; restY -= restY * k; drawn = '';
  }
  const key = nxt ? '' : `${cur?.slug}|${dark()}`;
  if (key && key === drawn) return;   // 沒在換、視角也沒變：不重畫
  drawn = key;
  // 寬往下取整：DPR 1 的螢幕一格只有 2.6px，四捨五入成 2px 的話最密的地方（相距 1.97px）會連成一片黑
  const PX = W / COLS, PY = W / ROWS, w = Math.max(1, Math.floor(PX * SW)), h = Math.max(2, Math.round(PY * SH));
  // 畫一組 stroke。at＝每一根從什麼時候開始淡（換的途中才給）：還沒輪到的照原樣、輪到的那一段照進度淡（out＝淡出，不然淡入）。
  // 不透明的併成一條路徑一次畫完，正在淡的那幾成才一根一根畫
  const draw = (/** @type {Strokes} */ s, /** @type {Float32Array | null} */ at = null, out = false) => {
    g.beginPath();
    for (let i = 0; i < s.n; i++) {
      const t = at ? clamp((prog - at[i]) / FADE, 0, 1) : 1, a = out ? 1 - t : t, x = Math.round(s.x[i] * PX + (PX - w) / 2), y = Math.round(s.r[i] * PY + (PY - h) / 2);
      if (a >= 1) g.rect(x, y, w, h); else if (a > 0) { g.globalAlpha = a; g.fillRect(x, y, w, h); }
    }
    g.globalAlpha = 1; g.fill();
  };
  g.clearRect(0, 0, W, W); g.fillStyle = getComputedStyle(canvas).color;
  if (nxt && swap) { draw(A, swap.a, true); draw(B, swap.b, false); }   // 換的途中視角不動：舊的一根一根淡出、新的同時一根一根淡入
  else if (cur?.model) { shoot(cur.model, R); scatter(A); draw(A); }
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
  // 轉視角（user 2026-11-22：只有在這張圖上按住拖才轉，平常不跟游標）：拖一個畫布寬＝轉半圈，橫的直的都可以一直轉（turn）。
  // 觸控沒拖就放開＝點一下，切換露不露名字。選單開著：第一下只收選單（chrome.js），不轉。
  // 換的途中視角不動：這時按下去先不轉，換完（手還按著）就接著能轉——原本整次拖曳都不算，
  // 每 4.2 秒裡有 1.6 秒在換＝常常拖了沒反應
  const endDrag = () => { drag = null; c.classList.remove('is-dragging'); };
  c.addEventListener('pointerdown', e => {
    if (root.classList.contains('menu-open')) return;
    drag = { x: e.clientX, y: e.clientY, px: e.clientX, py: e.clientY, moved: false };
    c.setPointerCapture(e.pointerId); c.classList.add('is-dragging');
    if (e.pointerType === 'mouse') e.preventDefault();   // 不要拖出選取範圍
  });
  c.addEventListener('pointermove', e => {
    if (!drag) return;
    if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 6) drag.moved = true;
    if (!nxt) { restX += (e.clientX - drag.px) / c.clientWidth * Math.PI; restY += (e.clientY - drag.py) / c.clientWidth * Math.PI; }
    drag.px = e.clientX; drag.py = e.clientY;
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
