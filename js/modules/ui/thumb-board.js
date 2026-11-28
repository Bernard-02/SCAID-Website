/**
 * 清單列的縮圖上一直有一片中空板在流、板條裡的圖錯開（user 2026-11-27 一輪一輪定的；樣子在 css/components/page.css .thumb-board）。原本是 hover 才出：
 * 「我想要圖片的hover效果，是直接在圖片上叠加我們背景的那個中空板效果，但不要加上筆刷」（問過＝只有清單列的縮圖、每張圖自己一塊）→「不需要有copy下面的圖片的效果」
 * →「改成一片中空板」（問過＝只要一條）→「加錯視就可以了，然後應該是這塊板在圖上面跑，不是將整個中空板變形成這張圖」。
 * →（一條在跑的那版，user：「這個效果不錯，那我想將中空板的數量加回來」）
 * →（加回很多條之後，user：「可能不需要很多片，3片這樣，有寬有窄」）
 * →（3 條那版，user：「速度可以慢一點，然後每次一個loop的寬度都可以不一樣」）
 * →（3 條、一輪一輪寬窄不同、分割線斷斷續續之後，user：「這個效果是一直在畫面上，但預設隱藏。hover的話，則是fade出來，所以它不是從畫面外進來的」
 * 「再慢一點，然後每張圖的hover可以不一樣的方向。這個分割綫本身可以上下移動」）
 * →（之後，user：「如果這個圖片hover的中空板，分割綫帶有一點blur呢？且預設一開始就是有這個效果，hover則不影響它」）
 * 現在＝每張縮圖上一直有一整片中空板在流（照全站的時鐘），原圖先藏著、貼圖載好板子第一次畫出來才出現（QUICK／WAIT）、hover 不影響；沒有 hover 的裝置也有；
 * 系統減少動態＝板子還在、停住不流。只畫捲進畫面裡的（IntersectionObserver）。
 * 流的方向每張圖不一樣（建板子時隨機往左或往右，之後固定），每 PERIOD 秒流過一個圖寬；一輪 3 條、一輪 LOOP 個圖寬長，每一輪三條的寬各自隨機（WMIN～WMIN＋1 的比例、
 * 合起來一輪＝有寬有窄），兩邊各讓出 GAP 當空隙，每一條裡的圖往旁邊錯開＝那一條寬的 SHIFT 倍、相鄰兩條方向相反（同背景的 direction），空隙照原樣。
 * 沒有背景那種透鏡彎曲、分色、反光。中間的版本：從左邊滑進來、每次 hover 重來；3 條固定寬；照背景那 8 條。
 * 錯開＝每條一邊的邊上有一窄條跟旁邊重複、另一邊少一窄條（錯位本來就是這樣），照條寬算＝窄的條錯得少，看起來才不會像複製。
 * 分割線（user 同一天：「這些中空板可以加上背景中空板的那個分割綫的效果，可以讓中空板有點厚度的感覺」）：每一條的左右邊上一條亮線＝背景看得見的板子那條邊線
 * （bg-shaders.js LOOK 2 的 edges：顏色、強度照抄，寬約 1 個裝置 px），內側緊貼一條淡淡的暗線＝像玻璃邊的斜面（背景的線是加亮的、在亮的照片上看不見，
 * 暗線是這裡加的：亮的地方看得到暗線、暗的地方看得到亮線＝有厚度）。分割線斷斷續續（同一天：「分割綫好像不一定要一整條都渲染出來？可以有點錯落」）：
 * 沿著高度一段平滑的雜訊決定哪裡有線（每一段大約圖高的 1／LINE_RES、頭尾柔邊；每條邊、每一輪的雜訊都不同＝錯開），LINE_ON 越大線越少；
 * 線段會沿著那條線慢慢上下滑（每條邊各抽方向、快慢 0.6～1.4 倍的 LINE_SPEED）。線帶一點糊（同一天：「分割綫帶有一點blur」）＝線的寬照 LINE_BLUR（裝置 px）攤開、柔邊。
 * 中間做過、被換掉的：背景那 8 條會游移的板條（錯位 1.5＝頭在相鄰的條裡各出現一次）→ 錯位 0 → 整張圖撐成一塊板條（透鏡把整張彎掉）。
 * 畫法：全站共用一個不放進頁面的 WebGL 畫布（每張縮圖各開一個 context 會撞到瀏覽器的上限），每幀把每一塊畫好再貼到那一塊自己的 2D 畫布；
 * 畫布疊在縮圖裡真的看得到的那張圖上（object-fit: contain 之後的範圍）。圖另外用 crossOrigin 載一份當貼圖（頁面上那張沒帶 CORS、WebGL 讀不了）；
 * 載不到（後台沒開 CORS）、開不了 WebGL＝不出板子、照常看原圖。
 * 2026-11-22～23 的版本（2D 畫布切直條、每條擠 1.5 倍寬、毛玻璃 1.5px）被這版取代；2026-11-23～27 整個關著（main.js DECOR）。
 */
import { prefersReducedMotion } from './reduce-motion.js';
import { DUR } from './motion.js';

// 有板子的縮圖：清單列（整列連結、摺疊、師資／合作企業不能點的那種列）裡有圖的縮圖；沒圖的佔位不做
const THUMBS = ':is(a.item-row, .page-body summary.item-row, .item-list[data-cms] div.item-row) > .item-thumb:has(img), .profile-photo:has(img)';   // 老師詳細頁的照片也有（user 2026-11-27）
const LOOP = 1.6;      // 一輪（3 條）多長＝幾個圖寬（user 2026-11-27：「板子的寬度都可以再大一點」；原本 1）
const WMIN = 0.35;     // 一輪 3 條的寬＝各抽 WMIN～WMIN＋1 再照比例撐滿一個圖寬（WMIN 越小，寬窄差越多；0.35＝最寬最多約最窄的 3.9 倍）
const GAP = 0.18;      // 條與條之間的空隙：每一格兩邊各讓出這一格寬的幾成（背景是 0.15～0.21 之間慢慢變）
const SHIFT = 0.17;    // 每一條裡的圖錯開多少＝那一條寬的幾倍（越大，邊上重複的那一窄條越寬＝越像複製；同只有一條那版：板寬 3 成、錯開圖寬 5%＝0.17 倍）
const LINE_RES = 5;     // 分割線沿著高度切成大約幾段（越大，一段越短）
const LINE_ON = 0.45;   // 雜訊高過多少才有線（0～1；越大，線越少、斷得越多）
const PERIOD = 8;      // 流過一個圖寬幾秒（user 2026-11-27：「速度可以慢一點」3 → 5、「再慢一點」→ 8）
const LINE_SPEED = 0.3;   // 分割線的線段上下滑多快（每秒幾段；一段＝圖高的 1／LINE_RES）
const LINE_BLUR = 2.2;    // 分割線糊開多寬（裝置 px；原本亮線 0.8、暗線 1.2＝利的）
const TEX_MAX = 512;      // 貼圖的長邊最多幾 px（後台的原圖長邊 2000，縮圖只顯示一兩百 px＝上傳原圖白佔 GPU 記憶體）
// 原圖先藏著（.has-board，page.css）、板子第一次畫出來才出現（user 2026-11-28：「師資照片進場還是先會閃一下原圖再疊filter…能不能先loading filter 後再進照片」）：
// 建板子到畫出來超過 QUICK＝網站的 fade 淡進來（同 img-fade.js：快取裡的直接出）；貼圖 WAIT 內還沒到（網路慢）／載不到＝照常露出原圖，之後到了＝直接蓋上、不淡（淡的話會跟露著的原圖疊在一起）
const QUICK = 100, WAIT = 3000;

const VERT = 'attribute vec2 p; varying vec2 vUv; void main() { vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }';
// uFlow＝板條流到哪（圖寬的幾成；往左流＝負的）：位置照 x − uFlow 算、一個圖寬一輪，第 k 輪的三條寬照 hash(k＋uSeed) 抽（同一輪一直是同樣的寬＝流的時候不會跳）。
const FRAG = `precision highp float;
uniform sampler2D uImg;
uniform float uFlow;
uniform float uTime;
uniform float uLineSpeed;
uniform float uLoop;
uniform float uGap;
uniform float uShift;
uniform float uMin;
uniform float uSeed;
uniform float uPx;
uniform float uLineRes;
uniform float uLineOn;
uniform float uLineBlur;
varying vec2 vUv;
float hash(float n) { return fract(sin(n) * 43758.5453); }
float noise(float t) { float i = floor(t), f = fract(t); return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)); }
void main() {
  vec2 uv = vUv;
  float edge = 1e3, id = 0.0;   // 離最近的板條邊多遠（裝置 px）、是哪一條邊（給分割線的雜訊當種子）
  {
    float p = (uv.x - uFlow) / uLoop, k = floor(p), x = p - k;   // x＝在這一輪裡的位置（0～1）
    float a = uMin + hash(k * 3.1 + uSeed), b = uMin + hash(k * 3.1 + 1.7 + uSeed), c = uMin + hash(k * 3.1 + 3.3 + uSeed);
    float e1 = a / (a + b + c), e2 = (a + b) / (a + b + c);
    for (int i = 0; i < 3; i++) {
      float l = i == 0 ? 0.0 : i == 1 ? e1 : e2, r = i == 0 ? e1 : i == 1 ? e2 : 1.0, bl = l + (r - l) * uGap, br = r - (r - l) * uGap;
      if (x >= bl && x < br) { uv.x -= (br - bl) * uLoop * uShift * (mod(float(i), 2.0) < 1.0 ? 1.0 : -1.0); edge = min(x - bl, br - x) * uLoop / uPx; id = k * 7.0 + float(i) * 2.0 + (x - bl < br - x ? 0.0 : 1.0); }
    }
  }
  vec3 col = texture2D(uImg, clamp(1.0 - abs(1.0 - abs(uv)), 0.0, 1.0)).rgb;
  float drift = uTime * uLineSpeed * (hash(id * 1.3 + uSeed) < 0.5 ? -1.0 : 1.0) * (0.6 + 0.8 * hash(id * 2.1 + uSeed));   // 線段上下滑（每條邊各自的方向、快慢）
  float on = smoothstep(uLineOn - 0.08, uLineOn + 0.08, noise(vUv.y * uLineRes + hash(id + uSeed) * 97.0 + drift));   // 這一段有沒有線（斷斷續續）
  float hi = exp(-pow(edge / uLineBlur, 2.0)) * on, lo = exp(-pow((edge - 1.6 * uLineBlur) / (1.4 * uLineBlur), 2.0)) * on;   // 邊上的亮線、內側的暗線（寬照 uLineBlur 攤開＝帶一點糊）
  // 亮線 0.15、暗線 0.06（user 2026-11-27：「分割綫可以再不明顯一點」0.55／0.22 → 0.3／0.12；線帶糊變寬之後「opacity可以再低一點，目前有點多」→ 再減半）
  col = col * (1.0 - 0.06 * lo) + (vec3(0.30, 0.43, 0.56) * 0.15 + vec3(0.006, 0.012, 0.021)) * hi;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

/** 共用的 WebGL（第一次有縮圖才建；開不了＝null、之後都不做） @type {{ gl: WebGLRenderingContext, canvas: HTMLCanvasElement, u: (n: string) => WebGLUniformLocation | null } | null | undefined} */
let GL;
function gl() {
  if (GL !== undefined) return GL;
  GL = null;
  const canvas = document.createElement('canvas'), g = canvas.getContext('webgl', { premultipliedAlpha: false, antialias: false });
  if (!g) return GL;
  const sh = (/** @type {number} */ type, /** @type {string} */ src) => { const s = /** @type {WebGLShader} */ (g.createShader(type)); g.shaderSource(s, src); g.compileShader(s); return s; };
  const prog = /** @type {WebGLProgram} */ (g.createProgram());
  g.attachShader(prog, sh(g.VERTEX_SHADER, VERT)); g.attachShader(prog, sh(g.FRAGMENT_SHADER, FRAG)); g.linkProgram(prog);
  if (!g.getProgramParameter(prog, g.LINK_STATUS)) { console.warn('[thumb-board] shader', g.getProgramInfoLog(prog)); return GL; }
  g.useProgram(prog);
  g.bindBuffer(g.ARRAY_BUFFER, g.createBuffer());
  g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g.STATIC_DRAW);
  const p = g.getAttribLocation(prog, 'p');
  g.enableVertexAttribArray(p); g.vertexAttribPointer(p, 2, g.FLOAT, false, 0, 0);
  g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, true);
  /** @type {Record<string, WebGLUniformLocation | null>} */
  const locs = {};   // uniform 的位置查一次記著（每張每幀查 12 次）
  return (GL = { gl: g, canvas, u: (n) => (n in locs ? locs[n] : (locs[n] = g.getUniformLocation(prog, n))) });
}

/** 圖的貼圖（同一個網址共用；載好才有 tex、載不到＝failed） @type {Map<string, { tex: WebGLTexture | null, failed: boolean }>} */
const textures = new Map();
function textureOf(/** @type {string} */ src) {
  let t = textures.get(src);
  if (t) return t;
  textures.set(src, t = { tex: null, failed: false });
  const G = GL, im = new Image(), entry = t;
  if (!G) return t;
  im.crossOrigin = 'anonymous';
  im.onerror = () => { entry.failed = true; if (!raf && shown.size) raf = requestAnimationFrame(frame); };
  im.onload = () => {
    // 先縮到長邊 TEX_MAX 再上傳
    const k = Math.min(1, TEX_MAX / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
    c.getContext('2d')?.drawImage(im, 0, 0, c.width, c.height);
    const g = G.gl, tex = g.createTexture();
    g.bindTexture(g.TEXTURE_2D, tex);
    // 寬高不是 2 的次方（WebGL 1）＝不能 repeat、不能 mipmap
    for (const [k, v] of [[g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE], [g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE], [g.TEXTURE_MIN_FILTER, g.LINEAR], [g.TEXTURE_MAG_FILTER, g.LINEAR]]) g.texParameteri(g.TEXTURE_2D, k, v);
    try { g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, c); entry.tex = tex; } catch (e) { entry.failed = true; console.warn('[thumb-board] 貼圖', e); }
    if (!raf && shown.size) raf = requestAnimationFrame(frame);   // 減少動態時迴圈停著＝貼圖到了再畫一次
  };
  im.src = src;
  return t;
}

/** 一張縮圖的板子（縮圖一出現就建）
 *  @typedef {{ thumb: HTMLElement, img: HTMLImageElement, row: HTMLElement, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, dir: number, seed: number, at: string, t0: number, timer: number }} Board */
/** @type {WeakMap<Element, Board>} */
const boards = new WeakMap();
/** 捲進畫面裡的（要畫的） @type {Set<Board>} */
const shown = new Set();
let raf = 0;

/** 縮圖裡真的看得到的那張圖（object-fit: contain／scale-down 之後、照 object-position 擺），座標相對那一列 @param {Board} b */
function placeOf(b) {
  const { img, row } = b, r = img.getBoundingClientRect(), o = row.getBoundingClientRect(), cs = getComputedStyle(img);
  let w = r.width, h = r.height, x = 0, y = 0;
  if (/contain|scale-down/.test(cs.objectFit) && img.naturalWidth && img.naturalHeight) {
    const s = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight, cs.objectFit === 'scale-down' ? 1 : Infinity);
    w = img.naturalWidth * s; h = img.naturalHeight * s;
    const [px, py] = cs.objectPosition.split(' ').map(v => (parseFloat(v) || 0) / 100);   // ponytail: 只認 %（全站都是 %／left、bottom 這種關鍵字＝算成 %）
    x = (r.width - w) * px; y = (r.height - h) * py;
  }
  return { left: r.left - o.left + x, top: r.top - o.top + y, width: w, height: h };
}

/** 隔著板子畫一次（t 秒）；回傳畫出來了沒（貼圖還沒到＝沒有） @param {Board} b @param {number} t @param {{ left: number, top: number, width: number, height: number }} at 這一幀先量好的位置 */
function draw(b, t, at) {
  const G = gl(), dpr = devicePixelRatio || 1;
  const key = `left:${at.left}px;top:${at.top}px;width:${at.width}px;height:${at.height}px`;
  if (key !== b.at) { b.canvas.style.cssText = b.at = key; }   // 位置沒變不寫
  const cw = Math.max(1, Math.round(at.width * dpr)), ch = Math.max(1, Math.round(at.height * dpr));
  if (b.canvas.width !== cw || b.canvas.height !== ch) { b.canvas.width = cw; b.canvas.height = ch; }
  const tx = textureOf(b.img.currentSrc || b.img.src), tex = G && tx.tex;
  if (!G || !tex) { b.ctx.clearRect(0, 0, cw, ch); if (tx.failed) { clearTimeout(b.timer); b.thumb.classList.remove('has-board'); } return tx.failed; }   // 貼圖還沒載好＝透明（原圖藏著）；載不到＝露出原圖
  const g = G.gl;
  // 共用的畫布只長不縮（每張縮圖比例不同，照每張改大小＝每畫一張就重配一次）：畫在左下角那一塊（GL 的原點在左下）、貼的時候切那一塊
  if (G.canvas.width < cw || G.canvas.height < ch) { G.canvas.width = Math.max(G.canvas.width, cw); G.canvas.height = Math.max(G.canvas.height, ch); }
  g.viewport(0, 0, cw, ch);
  g.bindTexture(g.TEXTURE_2D, tex);
  g.uniform1f(G.u('uFlow'), b.dir * t / PERIOD); g.uniform1f(G.u('uTime'), t); g.uniform1f(G.u('uLineSpeed'), LINE_SPEED); g.uniform1f(G.u('uLoop'), LOOP); g.uniform1f(G.u('uGap'), GAP); g.uniform1f(G.u('uShift'), SHIFT); g.uniform1f(G.u('uMin'), WMIN); g.uniform1f(G.u('uSeed'), b.seed); g.uniform1f(G.u('uPx'), 1 / cw); g.uniform1f(G.u('uLineRes'), LINE_RES); g.uniform1f(G.u('uLineOn'), LINE_ON); g.uniform1f(G.u('uLineBlur'), LINE_BLUR);   // 照全站的時鐘一直在流
  g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
  b.ctx.clearRect(0, 0, cw, ch);
  b.ctx.drawImage(G.canvas, 0, G.canvas.height - ch, cw, ch, 0, 0, cw, ch);
  if (!b.canvas.classList.contains('is-on')) {   // 第一次畫出來
    b.canvas.classList.add('is-on');
    clearTimeout(b.timer);
    if (b.thumb.classList.contains('has-board') && !prefersReducedMotion() && performance.now() - b.t0 > QUICK) {
      const cs = getComputedStyle(b.canvas);
      b.canvas.animate([{ opacity: 0, filter: `blur(${cs.getPropertyValue('--blur').trim() || '4px'})` }, { opacity: 1, filter: 'blur(0px)' }],
        { duration: DUR.fade * 1000, easing: cs.getPropertyValue('--ease-standard').trim() || 'ease' });
    }
  }
  return true;
}

/** @param {number} ts */
function frame(ts) {
  raf = 0;
  const still = prefersReducedMotion(), t = still ? 0 : ts / 1000;   // 減少動態＝停住不流
  for (const b of shown) if (!b.canvas.isConnected) shown.delete(b);
  const at = [...shown].map(placeOf);   // 先全部量完再一起寫（量一張寫一張＝每張都強制重排一次）
  let ready = true;
  [...shown].forEach((b, i) => { ready = draw(b, t, at[i]) && ready; });
  if (shown.size && (!still || !ready)) raf = requestAnimationFrame(frame);   // 減少動態：都畫出來了就停（位置變了靠 IntersectionObserver 叫回來）
}

/** 縮圖一出現就建板子（還不畫：捲進畫面才畫） @param {HTMLElement} thumb @param {IntersectionObserver} io */
function build(thumb, io) {
  if (boards.get(thumb)?.canvas.isConnected || !gl()) return;   // 詳細頁重畫照片（innerHTML 換掉）＝畫布跟著沒了、重建
  const img = thumb.querySelector('img'), row = /** @type {HTMLElement | null} */ (thumb.closest('.item-row') || thumb);   // 詳細頁的照片不在列裡＝畫布掛在照片框自己裡面
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
  if (!img || !row || !ctx) return;
  canvas.className = 'thumb-board';
  canvas.setAttribute('aria-hidden', 'true');
  // 放列裡最前面、絕對定位：.item-row:has(> .item-thumb) > :last-child 那條要的還是文字那欄
  row.prepend(canvas);
  thumb.classList.add('has-board');
  boards.set(thumb, { thumb, img, row, canvas, ctx, dir: Math.random() < 0.5 ? -1 : 1, seed: Math.random() * 1000, at: '', t0: performance.now(),
    timer: window.setTimeout(() => { if (!canvas.classList.contains('is-on')) thumb.classList.remove('has-board'); }, WAIT) });   // 這張圖的板子往哪流、寬窄怎麼抽：之後固定
  textureOf(img.currentSrc || img.src);
  io.observe(thumb);
}

export function initThumbBoard() {
  const main = document.getElementById('page-content');
  if (!main) return;
  const io = new IntersectionObserver((es) => {
    for (const e of es) { const b = boards.get(e.target); if (!b) continue; if (e.isIntersecting) shown.add(b); else shown.delete(b); }
    if (shown.size && !raf) raf = requestAnimationFrame(frame);
  });
  const scan = () => main.querySelectorAll(THUMBS).forEach((t) => build(/** @type {HTMLElement} */ (t), io));
  scan();
  // 換頁、後台渲染的清單晚到＝新的縮圖（自己插的畫布不算）
  new MutationObserver((ms) => { if (ms.some(m => [...m.addedNodes].some(n => n instanceof Element && !n.classList.contains('thumb-board')))) scan(); }).observe(main, { childList: true, subtree: true });
}
