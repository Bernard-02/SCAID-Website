/**
 * 右圖的 object（user 2026-11-22 一輪一輪定的；畫布在 pages/header.html .object-canvas，樣式 chrome.css）：
 * 一個 3D 模型從目前的視角打光，再用「同一種 stroke」排出來——每根形狀都一樣，明暗只靠排得多密、排在哪裡。定時隨機換下一個。
 *   - 模型：objects/index.json 列清單、objects/<slug>.bin 一個一檔，輪到（前一個還在的時候）才抓。scripts/build-objects.cjs 產生。
 *     模型面數很低（蛋 24 個頂點）＝輪廓是多邊形 → 載進來先細分、照法線鼓成圓的（refine；user 2026-11-26：「至少圓形物件可以在旋轉之後看出來是圓的」）。
 *   - 排法：每一列從畫布正中往兩邊走、一路累加墨量、每滿 1 放一根（同 logo「從中間往兩邊」）；位置是連續的、不對格子。
 *     淺色模式墨多＝暗面，深色模式反過來。64 列（user 2026-11-26：「grid上要分割更多，才看得出來是什麽」；原本 32 列）。
 *   - 視角（user 2026-11-27：「一進場的時候，這個模型會360°在自己旋轉，如果我們drag它的話則是我們決定它的旋轉角度，離開時則回到預設狀態」；
 *     原本平常停在正面、不動）：預設＝繞模型自己的直軸一直轉、一個轉一圈（SPIN）的時間換下一個；**換的時候也不停**＝新的接著舊的轉到的角度轉下去
 *     （user 2026-11-27：「我想要3d模型在切換的時候不停下旋轉，下一個應該銜接上一個模型」；原本換的途中停住、換完歸回正面）；
 *     在這張圖上按住拖（滑鼠、觸控都一樣）＝自己不轉、照拖的轉：上下左右都可以一直轉、沒有盡頭（user 2026-11-26：「它應該是可以再翻另外一面的」）——
 *     繞的是畫面的直軸、橫軸（拖哪邊、眼前那一面就往哪邊走）；放開＝花 DUR.slow 轉回預設，從按下去時轉到的角度接著轉。不跟游標。
 *   - 換下一個＝stroke 隨機進出場、每一根用淡的（user 2026-11-26：「不是整個fade，是那個stroke做切換時，一個個fade 出場，fade 進場」；
 *     原本每一根是硬切）：舊的一根一根淡出、新的同時一根一根淡入，兩個都照當下的姿態一直轉（每一根什麼時候淡＝照它落在哪一格，go）；拖的角度也接著留給下一個。
 *   - 游標在 object 上（觸控：點一下、或拖著的時候）＝logo 露出它的名字，而且不換下一個；移開後從頭等一輪。
 *   - 放在殼上＝換頁不重來。PC：疊在當頁右圖那一格（page.css .page-figure > *）上，每一幀照它的位置擺；首頁沒有那一格＝不顯示。
 *     首頁 → 內頁（user 2026-11-23）：logo 上移的途中（html.logo-moving，router.js）先不出場、只先抓第一個模型，移完跟 logo 變形同時出場。
 *     PC 以外（手機、iPad；user 2026-11-23）：平常不出、不畫、不載模型，底列右下角那顆鈕點了才搬進放大 dialog（chrome.js 叫 openObject／closeObject）；
 *     沒打開的時候只輪名字（names）＝logo 照樣跟著一個一個物件換 stroke 的長度（user 2026-11-27：手機上 logo 一直是系名的完整長度），打開＝接著從那一個開始。
 *   - 名字跟著網站語言（中／英）回報給 logo（logo.js logoObject）：內頁 logo 的 stroke 長度＝名字的長度。
 * 減少動態＝不換、不自己轉，只畫第一個的正面（照樣可以拖著轉、放開直接回正面）。<html data-logo-still>（煙霧測試其他段落）＝整個不跑。
 */
import { sitePath } from './site-base.js';
import { prefersReducedMotion } from './reduce-motion.js';
import { logoObject } from './logo.js';
import { DUR } from './motion.js';

const COLS = 144, ROWS = 64;          // 排幾列；橫向的解析度（一格＝1.7 根 stroke 寬）。要更細／更粗＝兩個一起乘（比例 9:4＝stroke 的形狀）
const SPIN = 6000, HOLD = SPIN;       // 自己轉一圈多久＝一個停多久（ms；原本停 2.6 秒）
const SWAP = 1600, BACK = DUR.slow * 1000;   // 換一次多久、放開之後轉回預設多久（ms）
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
let R = FRONT.slice(), spin = 0, restX = 0, restY = 0;   // 畫面上的姿態；預設自己轉到的角度；拖了還沒轉完的量（橫拖、直拖，弧度）
/** @type {{ q: number[], t: number } | null} */ let back = null;   // 放開之後轉回預設的途中：從哪個姿態（四元數）、走了幾成
/** @type {{ x: number, y: number, px: number, py: number, moved: boolean, touch: boolean, was: boolean } | null} */ let drag = null;   // x／y＝按下去的位置、px／py＝上一次的位置；touch＝不是滑鼠、was＝按下去之前露不露名字
let reveal = false, inDialog = false, drewAt = 0, ink = '', inkDark = /** @type {boolean | null} */ (null);
const FRAME_MS = 30;   // 自己轉的時候多久才重畫一張（60Hz 的螢幕＝隔一幀畫一次＝每秒 30 張；拖著、換的途中照每一幀畫）
const zb = new Float32Array(BW * BH), sb = new Uint8Array(BW * BH), rho = new Float32Array(BW);
const strokes = () => /** @type {Strokes} */ ({ n: 0, r: new Uint16Array(N * 2), x: new Float32Array(N * 2) });
const A = strokes(), B = strokes();
const off = () => root.hasAttribute('data-logo-still');   // 煙霧測試：整個不跑（不載模型、不畫），logo 也就一直是系名
const still = () => prefersReducedMotion();
const slot = () => document.querySelector('#page-content .page-figure > *');
const visible = () => !off() && !root.classList.contains('logo-moving') && (inDialog || (wide.matches && !!slot()));
const names = () => !off() && !root.classList.contains('logo-moving') && !inDialog && !wide.matches && !!slot();   // PC 以外、有右圖的頁、沒打開：不畫，只輪名字給 logo
let nameTimer = 0;
const dark = () => root.dataset.theme === 'dark';

// 目前的姿態再繞畫面的直軸轉 a、橫軸轉 b（弧度）：每次都是接著轉＝沒有盡頭、可以翻到任何一面。
// ponytail: 一直乘下去會慢慢不正交，沒有重新正交化——放開就回到預設的姿態，累積不到看得出來
function turn(/** @type {number} */ a, /** @type {number} */ b) {
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sinB = Math.sin(b);
  for (let i = 0; i < 3; i++) {
    const x = R[i], y = R[3 + i], z = -x * sa + R[6 + i] * ca;
    R[i] = x * ca + R[6 + i] * sa; R[3 + i] = y * cb - z * sinB; R[6 + i] = y * sinB + z * cb;
  }
}
// 預設的姿態＝正面再繞模型自己的直軸轉 a（FRONT × 繞 y 轉 a）
function spun(/** @type {number} */ a) {
  const c = Math.cos(a), s = Math.sin(a), F = FRONT;
  return [0, 3, 6].flatMap(i => [F[i] * c - F[i + 2] * s, F[i + 1], F[i] * s + F[i + 2] * c]);
}
// 姿態 ↔ 四元數（放開之後轉回預設要內插；矩陣直接內插會退化）
function quat(/** @type {number[]} */ [a, b, c, d, e, f, g, h, i]) {
  const t = a + e + i;
  if (t > 0) { const s = 2 * Math.sqrt(1 + t); return [s / 4, (h - f) / s, (c - g) / s, (d - b) / s]; }
  if (a > e && a > i) { const s = 2 * Math.sqrt(1 + a - e - i); return [(h - f) / s, s / 4, (b + d) / s, (c + g) / s]; }
  if (e > i) { const s = 2 * Math.sqrt(1 + e - a - i); return [(c - g) / s, (b + d) / s, s / 4, (f + h) / s]; }
  const s = 2 * Math.sqrt(1 + i - a - e); return [(d - b) / s, (c + g) / s, (f + h) / s, s / 4];
}
// p → q 走 k 成，回傳姿態。四元數線性內插再正規化、走近的那一邊（點積 ≥ 0 就不會退化）
function blend(/** @type {number[]} */ p, /** @type {number[]} */ q, /** @type {number} */ k) {
  const sg = p[0] * q[0] + p[1] * q[1] + p[2] * q[2] + p[3] * q[3] < 0 ? -1 : 1, r = p.map((v, j) => v + (sg * q[j] - v) * k), n = Math.hypot(...r), [w, x, y, z] = r.map(v => v / n);
  return [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y), 2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x), 2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)];
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
  if (k < 2) return m;   // 面數本來就夠（汽車、拖拉機這種）
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
  logoObject(o && (visible() || names()) ? { text: zh ? o.zh : o.en, zh, reveal } : null);
}
// 換成 o：舊的出場、新的進場，兩個都照當下的姿態一直轉（user 2026-11-27：「我想要3d模型在切換的時候不停下旋轉，下一個應該銜接上一個模型，它們是不會停止旋轉的」；
// 原本換的途中兩個都停住、舊的停在當下的角度、新的從正面進場，換完歸回正面）。每一根什麼時候開始淡＝照它落在哪一格（列 × 橫向的格）各抽一個時間點：
// 轉著的時候每一幀的 stroke 都重排，照第幾根抽的話同一個位置的那一根每幀換一個時間點＝一直閃
function go(/** @type {Item} */ o) {
  const rnd = () => Float32Array.from({ length: ROWS * COLS }, () => Math.random() * (1 - FADE));
  swap = { a: rnd(), b: rnd() };
  nxt = o; prog = still() ? 1 : 0;
  report();
}
function endSwap() {
  cur = nxt; nxt = null; swap = null; hold = HOLD;   // 姿態不歸零＝新的接著轉
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
  if (!inDialog && document.querySelector('#figure-dialog[open]')) return;   // 放大 dialog 開著：殼上的畫布糊在後面（chrome.css）＝停著不畫
  if (nxt) { prog += dt / SWAP; if (prog >= 1) endSwap(); }
  else if (!cur) advance();
  // 露出名字＝停住不換（PC 游標在 object 上）；手機的 dialog 裡例外＝露著名字照樣換，logo 跟著換名字（user 2026-11-27：「頂部的logo應該要一直改變長度，根據圖片的變化」）
  else if ((!reveal || inDialog) && !drag && !still()) { hold -= dt; if (hold <= 0) advance(); }
  // 視角（換的途中照轉，user 2026-11-27）：拖著＝照拖的轉，畫面慢一點點跟上（還沒轉完的量每一幀轉掉一部分，剩一點點就一次轉完）；
  // 沒拖＝自己繞直軸轉，剛放開的那段從放開時的姿態轉回來（smoothstep）。減少動態＝不轉、放開直接回去
  if (drag) {
    if (restX || restY) { const k = Math.abs(restX) + Math.abs(restY) < 1e-3 ? 1 : 1 - Math.exp(-dt / 100); turn(restX * k, restY * k); restX -= restX * k; restY -= restY * k; }
  } else {
    if (!still()) spin = (spin + dt / SPIN * 2 * Math.PI) % (2 * Math.PI);
    if (back && !still()) { const t = back.t = Math.min(1, back.t + dt / BACK); R = blend(back.q, quat(spun(spin)), t * t * (3 - 2 * t)); if (t >= 1) back = null; }
    else { R = spun(spin); back = null; }
  }
  const key = nxt ? '' : `${cur?.slug}|${!!cur?.model}|${dark()}|${R.join()}`;
  if (key && key === drawn) return;   // 沒在換、視角也沒變：不重畫
  if (!drag && !nxt && now - drewAt < FRAME_MS) return;
  drewAt = now; drawn = key;
  // 寬往下取整：DPR 1 的螢幕一格只有 2.6px，四捨五入成 2px 的話最密的地方（相距 1.97px）會連成一片黑
  const PX = W / COLS, PY = W / ROWS, w = Math.max(1, Math.floor(PX * SW)), h = Math.max(2, Math.round(PY * SH));
  // 畫一組 stroke。at＝每一格從什麼時候開始淡（換的途中才給，go）：還沒輪到的照原樣、輪到的那一段照進度淡（out＝淡出，不然淡入）。
  // 不透明的併成一條路徑一次畫完，正在淡的那幾成才一根一根畫
  const draw = (/** @type {Strokes} */ s, /** @type {Float32Array | null} */ at = null, out = false) => {
    g.beginPath();
    for (let i = 0; i < s.n; i++) {
      const t = at ? clamp((prog - at[s.r[i] * COLS + clamp(Math.round(s.x[i]), 0, COLS - 1)]) / FADE, 0, 1) : 1, a = out ? 1 - t : t, x = Math.round(s.x[i] * PX + (PX - w) / 2), y = Math.round(s.r[i] * PY + (PY - h) / 2);
      if (a >= 1) g.rect(x, y, w, h); else if (a > 0) { g.globalAlpha = a; g.fillRect(x, y, w, h); }
    }
    g.globalAlpha = 1; g.fill();
  };
  if (inkDark !== dark()) { inkDark = dark(); ink = getComputedStyle(canvas).color; }   // .object-canvas 的 color＝var(--theme-fg)、沒有過場＝跟著深淺一次換
  g.clearRect(0, 0, W, W); g.fillStyle = ink;
  if (nxt && swap) {   // 換的途中：兩個都照當下的姿態排，舊的一根一根淡出、新的同時一根一根淡入
    if (cur?.model) { shoot(cur.model, R); scatter(A); } else A.n = 0;
    shoot(/** @type {Model} */ (nxt.model), R); scatter(B);
    draw(A, swap.a, true); draw(B, swap.b, false);
  }
  else if (cur?.model) { shoot(cur.model, R); scatter(A); draw(A); }
}
// 看得到才跑；看不到（首頁、手機沒打開）就停，並告訴 logo 現在沒有 object
function sync() {
  if (!canvas || !list.length) return;
  const on = visible();
  canvas.classList.toggle('is-on', on && !inDialog);
  if (on && !cur && !nxt) advance();   // 第一個模型已經抓好（logo 上移的途中先抓了）＝馬上開始進場，名字同時給 logo
  if (on && !raf) { last = performance.now(); drawn = ''; raf = requestAnimationFrame(frame); }
  if (on && cur && !cur.model) load(cur);   // 沒打開時輪到的那一個只有名字＝打開才抓
  if (names()) {
    if (!cur && !nxt) cur = list[order[at = (at + 1) % order.length]];
    // 一個停多久同畫得出來的時候（轉一圈＋換一次）；減少動態＝不換
    const tick = () => { nameTimer = 0; if (!names() || still()) return; nxt = swap = pending = null; cur = list[order[at = (at + 1) % order.length]]; report(); nameTimer = window.setTimeout(tick, HOLD + SWAP); };
    if (!nameTimer && !still()) nameTimer = window.setTimeout(tick, HOLD + SWAP);
  }
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
  // 轉視角（user 2026-11-22：只有在這張圖上按住拖才轉，平常不跟游標）：拖一個畫布寬＝轉半圈，橫的直的都可以一直轉（turn）；放開＝轉回預設、接著自己轉。
  // 觸控沒拖就放開＝點一下，切換露不露名字；拖著＝露出名字、放開回到拖之前。選單開著：第一下只收選單（chrome.js），不轉。
  // 換的途中照樣拖得動（user 2026-11-27：換的時候不停下旋轉）；原本換的途中按下去先不轉、整次拖曳都不算＝常常拖了沒反應
  // 放開＝轉回預設；觸控拖過＝名字回到拖之前的樣子
  const endDrag = () => {
    if (drag) { back = { q: quat(R), t: 0 }; if (drag.touch && drag.moved && reveal !== drag.was) { reveal = drag.was; if (!reveal) hold = HOLD; report(); } }
    drag = null; restX = restY = 0; c.classList.remove('is-dragging');
  };
  c.addEventListener('pointerdown', e => {
    if (root.classList.contains('menu-open')) return;
    drag = { x: e.clientX, y: e.clientY, px: e.clientX, py: e.clientY, moved: false, touch: e.pointerType !== 'mouse', was: reveal };
    c.setPointerCapture(e.pointerId); c.classList.add('is-dragging');
    if (e.pointerType === 'mouse') e.preventDefault();   // 不要拖出選取範圍
  });
  c.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.moved && Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 6) {
      drag.moved = true;
      if (drag.touch && !reveal) { reveal = true; report(); }   // 觸控拖著＝露出名字（user 2026-11-27：「手機上應該是drag的時候，要顯示它的名字」；滑鼠 hover 本來就露）
    }
    restX += (e.clientX - drag.px) / c.clientWidth * Math.PI; restY += (e.clientY - drag.py) / c.clientWidth * Math.PI;
    drag.px = e.clientX; drag.py = e.clientY;
  });
  c.addEventListener('pointerup', () => { if (drag?.touch && !drag.moved) { reveal = !reveal; if (!reveal) hold = HOLD; report(); } endDrag(); });
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
  inDialog = true; reveal = true; hold = HOLD; clearTimeout(nameTimer); nameTimer = 0; sync(); report();   // 打開就露出名字（user 2026-11-27：「打開時就是直接reveal這個圖的名字」）；點一下照舊收起來／再露
}
export function closeObject() {
  if (!canvas || !inDialog) return;
  shell?.append(canvas);
  inDialog = false; reveal = false; sync();
}
