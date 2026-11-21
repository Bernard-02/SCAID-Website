/**
 * 背景（user 2026-11-21）：畫布（筆跡）＜ 中空板 ＜ 內文。三層包在 .bg 裡、在這裡放進 <body> 最前面，樣子在 css/components/bg.css。
 * 筆目前只有炭筆一種：
 * - 跟著游標畫：每秒下的炭量固定（flow）、攤在這一幀走過的那段路上 → 走越慢越濃，停著不動就一直疊在同一點
 * - 每一筆留 hold 秒、再用 fade 秒消失 → 停著不動時下的跟消失的會打平＝濃度的天花板
 * - 不在畫布上累積再整張淡掉（8-bit 的 alpha 淡不乾淨、會留殘影）：記下還活著的筆（marks），每幀整張重畫
 * - 炭的顆粒＝畫完疊一層紙紋 color-burn（炭量蓋過紙紋的地方才黑），再整張 color-dodge 把淺的灰洗掉
 *   → 淡的筆跡只剩零星顆粒，消失時是一粒一粒被紙吃掉、不是整片變淡
 * - 中空板＝透明毛玻璃＋折射（user 2026-11-21）：一格一格、寬窄不一（骨牌寬的 vary 倍，開頁時抽一次）。
 *   筆跡先畫在一張小的、不放進頁面的畫布（raw，1/SOFT 解析度），再一格一格貼到看得到的那張畫布（CSS 再糊一層＝毛玻璃），
 *   每一格把後面 bend 格寬的畫面擠進自己那一格＝格跟格的交界對不上（折射錯位）
 * - 中空板只在筆跡周圍出現、跟著筆跡一起消失（user 2026-11-21）：板子（.bg-board）是滿版的，
 *   上面再蓋一張底色的蓋板（.bg-lid），每一筆在蓋板上挖一個柔邊的洞（同一筆的炭量與壽命）→ 筆跡淡了洞也跟著合起來；
 *   洞的大小一路上起起伏伏（float），而且整片一起慢慢脹縮＝呼吸（breathe）
 * - 筆跡與蓋板固定畫白底（黑炭的 color-burn 只在這組顏色成立）、板子畫黑白，深色模式由 CSS 整張反過來
 * - 畫面不再變就停下來：沒有筆跡了＝整個停；游標停著、筆跡已經打平＝筆跡那張不再重畫（時鐘停住），只剩板子在呼吸（REST_FPS）
 * - 選單或 dialog（放大圖片、intro 影片）開著不畫（右邊內容不能 hover），已經畫的跟內容一起模糊＋疊白（bg.css）
 * - 觸控沒有游標＝不畫（筆尖碰著螢幕也算觸控，懸空的筆照畫）；系統減少動態、強制色彩（高對比佈景）＝整個不放
 * - 純裝飾：畫布用不了（擴充套件擋掉、記憶體不夠）就不放；main.js 另外把 initBg 包起來，出錯也不會卡住後面的開機
 */

// 手感都在這幾個數字（濃度上限、毛玻璃多糊、骨牌寬在 bg.css）。煙霧測試照這裡的數字算門檻＝調了不用改測試
export const INK = {
  size: 60,           // 筆頭直徑（px）
  flow: 10,           // 每秒下的炭量（筆頭中心的濃度／秒）
  hold: 1,            // 筆跡留多久才開始消失（秒）
  fade: 3,            // 消失要多久（秒）
  bite: 0.15,         // 顆粒感：比這個淺的灰洗成白（0＝一片霧霧的灰，越大越粗、淡的筆跡越快不見）
  bend: 4,            // 折射：中空板每一格把後面幾格寬的畫面擠進來（1＝不折射；越大，格跟格之間錯位越多）
  vary: [0.35, 1.65], // 中空板每一格的寬＝骨牌寬的幾倍（每一格在這之間隨機，有大有小）
  halo: 220,          // 中空板在每一筆周圍露出來的範圍（直徑 px，平均）
  float: 0.35,        // 那個範圍一路上浮動幾成（0＝固定大小）
  breathe: 0.2,       // 呼吸：露出來的板子整片一起脹縮幾成（0＝不呼吸）
  breath: 4,          // 一口氣幾秒
};
const SOFT = 3;      // 筆跡畫在 1/3 解析度：省，放大回來順便先糊一層（毛玻璃主要的糊是 bg.css --frost）；紙紋的顆粒也是這麼大
const COARSE = 8;    // 蓋板的解析度＝畫面的 1/8：洞是一團柔邊，放大回去剛好更柔
const REST_FPS = 30; // 游標停著、只剩呼吸時蓋板的重畫頻率：慢慢脹縮，30fps 就夠順（更新率高的螢幕省最多）

/** @template {keyof HTMLElementTagNameMap} K @param {K} tag @param {string} name */
function layer(tag, name) {
  const el = document.createElement(tag);
  el.className = name;
  el.setAttribute('aria-hidden', 'true');
  return el;
}

// 一顆中心實、往外淡的黑圓（直徑 d）：筆頭、蓋板上挖的洞都是它
function dab(d) {
  const c = document.createElement('canvas');
  c.width = c.height = d;
  const g = c.getContext('2d'), soft = g.createRadialGradient(d / 2, d / 2, 0, d / 2, d / 2, d / 2);
  soft.addColorStop(0, '#000');
  soft.addColorStop(0.4, 'rgba(0, 0, 0, 0.9)');
  soft.addColorStop(1, 'rgba(0, 0, 0, 0)');
  g.fillStyle = soft;
  g.fillRect(0, 0, d, d);
  return c;
}

// 整張塗白
function clear(c) {
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
  c.fillStyle = '#fff';
  c.fillRect(0, 0, c.canvas.width, c.canvas.height);
}

// −1…1 的起伏：兩個不同步的波疊起來，看不出週期
const wobble = (t) => (Math.sin(t * 2.3) + Math.sin(t * 5.9 + 2)) / 2;

export function initBg() {
  // 強制色彩：蓋板是白色點陣、不會換成系統色 → 高對比的深色佈景會變一整頁白（bg.css 另外藏，處理開著頁面才切的情況）
  if (matchMedia('(prefers-reduced-motion: reduce), (forced-colors: active)').matches) return;
  const canvas = layer('canvas', 'bg-ink'), board = layer('canvas', 'bg-board'), cover = layer('canvas', 'bg-lid'), bg = layer('div', 'bg');
  const raw = document.createElement('canvas');
  const ctx = canvas.getContext('2d'), ink = raw.getContext('2d'), cov = cover.getContext('2d'), brd = board.getContext('2d');
  if (!ctx || !ink || !cov || !brd) return;   // 畫布用不了（擴充套件擋掉、記憶體不夠）：不放背景
  const html = document.documentElement;
  const { size, flow, hold, fade, bite, bend, vary, halo, float, breathe, breath } = INK, life = hold + fade;
  const wash = `rgb(${Math.round(bite * 255)}, ${Math.round(bite * 255)}, ${Math.round(bite * 255)})`;
  const tip = dab(Math.round(size / SOFT)), hole = dab(64);
  /** 中空板每一格的寬（骨牌寬的倍數）：開頁時抽、換視窗大小沿用＝格子不會亂跳 @type {number[]} */
  const widths = [];
  let cols = [0];   // 格的邊界（px，整數＝交界是利的）：fit() 排

  // 紙紋：一塊隨機灰階鋪滿。最暗留在 40：到 0 的話再淡的炭也會被燒成全黑
  const tile = document.createElement('canvas');
  tile.width = tile.height = 256;
  const noise = new ImageData(256, 256);
  for (let i = 0; i < noise.data.length; i += 4) {
    noise.data[i] = noise.data[i + 1] = noise.data[i + 2] = 40 + Math.random() * 215;
    noise.data[i + 3] = 255;
  }
  tile.getContext('2d').putImageData(noise, 0, 0);
  const paper = ink.createPattern(tile, 'repeat');

  /** 還活著的筆：這一幀從 (x0, y0) 走到 (x1, y1)、下了 ink 的炭，t＝下筆時的時鐘，r＝這一筆周圍的板子比平均大／小幾倍
   *  @type {{ x0: number, y0: number, x1: number, y1: number, t: number, ink: number, r: number }[]} */
  const marks = [];
  let x = 0, y = 0, px = 0, py = 0, inside = false;
  let clock = 0, last = 0, movedAt = 0, raf = 0, coverAt = 0;   // movedAt＝游標最後一次有動的時鐘；coverAt＝蓋板上次重畫（ms）

  // 選單或 dialog（放大圖片、intro 影片）開著＝右邊內容不能 hover（user 2026-11-21）：不下新的筆
  const paused = () => html.classList.contains('menu-open') || !!document.querySelector('dialog[open]');

  // 沿路每 1/4 個筆頭一顆（炭量平分）：cb(x, y, 濃度, 那一筆)
  function eachDab(cb) {
    for (const m of marks) {
      const dx = m.x1 - m.x0, dy = m.y1 - m.y0;
      const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (size / 4)));
      const alpha = Math.min(1, m.ink / n) * Math.min(1, (life - (clock - m.t)) / fade);
      if (alpha < 1 / 255) continue;   // 畫了也看不到
      for (let i = 1; i <= n; i++) cb(m.x0 + dx * i / n, m.y0 + dy * i / n, alpha, m);
    }
  }

  function drawInk() {
    clear(ink);
    eachDab((sx, sy, a) => { ink.globalAlpha = a; ink.drawImage(tip, (sx - size / 2) / SOFT, (sy - size / 2) / SOFT); });
    ink.globalAlpha = 1;
    ink.globalCompositeOperation = 'color-burn';    // 紙紋：黑度＝炭量 ÷ 紙紋
    ink.fillStyle = paper;
    ink.fillRect(0, 0, raw.width, raw.height);
    ink.globalCompositeOperation = 'color-dodge';   // 黑度不到 bite 的洗成白，剩下的拉開
    ink.fillStyle = wash;
    ink.fillRect(0, 0, raw.width, raw.height);
    // 隔著中空板看：一格一格貼過去，每一格以自己的中線為準、把 bend 格寬的畫面擠進來（取到畫面外的部分留白）
    clear(ctx);
    for (let i = 1; i < cols.length; i++) {
      const x0 = cols[i - 1], w = cols[i] - x0;
      ctx.drawImage(raw, (x0 + w / 2 - w * bend / 2) / SOFT, 0, w * bend / SOFT, raw.height, x0, 0, w, canvas.height);
    }
  }

  // 蓋板：每一顆在上面挖洞；洞的大小＝平均 × 這一筆的浮動 × 現在的呼吸（整片一起）
  function drawCover(t) {
    clear(cov);
    cov.globalCompositeOperation = 'destination-out';
    const k = (1 + breathe * Math.sin(t * 2 * Math.PI / breath)) * halo / COARSE;
    eachDab((sx, sy, a, m) => { const d = k * m.r; cov.globalAlpha = a; cov.drawImage(hole, sx / COARSE - d / 2, sy / COARSE - d / 2, d, d); });
  }

  // 中空板（fit 時畫一次）：每一格＝左緣暗線＋一條反光＋往右暗下去（管壁的弧度）；整片帶玻璃一點點色。
  // 畫成黑白，深色模式 CSS 整張反過來（暗線變亮、反光變暗＝同 theme 的前景／背景）。高 1px、CSS 拉滿；
  // 寬照螢幕密度、每條線對齊螢幕像素＝1.25／1.5 倍的螢幕線也是利的
  function drawBoard() {
    const dpr = devicePixelRatio || 1, at = (v) => Math.round(v * dpr), line = Math.max(1, at(1)), shine = Math.max(1, at(2));
    board.width = at(canvas.width);
    board.height = 1;
    brd.fillStyle = 'rgba(0, 0, 0, 0.03)';
    brd.fillRect(0, 0, board.width, 1);
    for (let i = 1; i < cols.length; i++) {
      const x0 = at(cols[i - 1]), x1 = at(cols[i]), a = x0 + Math.round((x1 - x0) * 0.55), wall = brd.createLinearGradient(a, 0, x1, 0);
      brd.fillStyle = 'rgba(0, 0, 0, 0.14)';
      brd.fillRect(x0, 0, line, 1);
      brd.fillStyle = 'rgba(255, 255, 255, 0.6)';
      brd.fillRect(x0 + line, 0, shine, 1);
      wall.addColorStop(0, 'rgba(0, 0, 0, 0)');
      wall.addColorStop(1, 'rgba(0, 0, 0, 0.07)');
      brd.fillStyle = wall;
      brd.fillRect(a, 0, x1 - a, 1);
    }
  }

  function frame(ts) {
    raf = 0;   // 先清掉：這一幀中途出錯也不會卡住（wake 還排得到下一幀）
    const dt = last ? Math.min((ts - last) / 1000, 0.05) : 0;   // 分頁切走再回來：不補那段時間
    last = ts;
    if (paused()) inside = false;   // 已經畫的照常消失；收了之後游標一動從那裡重新起筆
    // 游標停著、停滿一輪 life＝畫面上只剩這一點、下的跟消失的打平 → 筆跡不用再算（時鐘停住），只剩板子在呼吸
    const resting = inside && clock - movedAt >= life;
    if (!resting) {
      clock += dt;
      if (inside && dt) {
        const prev = marks[marks.length - 1];
        if (x !== px || y !== py) movedAt = clock;   // 有走的最後一筆＝這一筆（它消失了才算停滿一輪）
        // 停著不動：同一點 1/20 秒內的筆併成一筆＝停著時活著的筆數跟螢幕更新率無關（不然 120Hz 的螢幕每幀要疊上百顆）。
        // 濃度照疊色的算法合（a＋b−ab）＝跟一筆一筆疊上去一樣濃
        if (prev && x === px && y === py && prev.x0 === x && prev.x1 === x && prev.y0 === y && prev.y1 === y && clock - prev.t < 0.05) prev.ink = 1 - (1 - prev.ink) * (1 - flow * dt);
        else marks.push({ x0: px, y0: py, x1: x, y1: y, t: clock, ink: flow * dt, r: 1 + float * wobble(clock) });
        px = x;
        py = y;
      }
      while (marks.length && clock - marks[0].t >= life) marks.shift();
      drawInk();
    }
    if (!resting || ts - coverAt >= 1000 / REST_FPS - 2) {   // 板子一直在呼吸；停著時降到 REST_FPS
      drawCover(ts / 1000);
      coverAt = ts;
    }
    if (inside || marks.length) raf = requestAnimationFrame(frame);
    else last = 0;
  }
  const wake = () => { if (!raf) raf = requestAnimationFrame(frame); };

  addEventListener('pointermove', (e) => {
    // 觸控沒有游標；選單／dialog 開著不畫（也省得每動一下就整張重畫一次空白）
    if (e.pointerType === 'touch' || paused()) return;
    // 筆尖碰著螢幕＝也是觸控（懸空的筆照畫）：連「停著也一直畫」都停掉，不然放下筆的那一點會一直疊
    if (e.pointerType === 'pen' && e.buttons) { inside = false; return; }
    x = e.clientX;
    y = e.clientY;
    if (!inside) { inside = true; px = x; py = y; }   // 從外面進來：不從上次離開的地方拉一條線過來
    movedAt = clock;
    wake();
  }, { passive: true });
  html.addEventListener('pointerleave', () => { inside = false; wake(); });

  const fit = () => {
    const w = canvas.width = canvas.clientWidth, h = canvas.height = canvas.clientHeight;
    raw.width = Math.max(1, Math.ceil(w / SOFT));   // 至少 1px：0 的畫布拿來貼會丟例外（例：一開始高度 0 的 iframe）
    raw.height = Math.max(1, Math.ceil(h / SOFT));
    cover.width = Math.ceil(w / COARSE);
    cover.height = Math.ceil(h / COARSE);
    // 中空板的格：骨牌寬（bg.css --board-pitch）× 每一格自己的倍數。下限 8px：極窄的視窗骨牌寬會 ≤ 0，排格子的迴圈就停不下來
    const pitch = Math.max(8, parseFloat(getComputedStyle(board).getPropertyValue('--board-pitch')) || 22);
    cols = [0];
    for (let i = 0, cx = 0; cx < w; i++) {
      widths[i] ??= vary[0] + (vary[1] - vary[0]) * Math.random();
      cx += widths[i] * pitch;
      cols.push(Math.round(cx));
    }
    drawBoard();
    drawInk();
    drawCover(performance.now() / 1000);
  };
  // 螢幕密度變了（視窗拖到另一個縮放比例的螢幕）大小卻沒變＝不會有 resize：另外聽，板子的線照新的密度重畫
  const watchDpr = () => matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener('change', () => { fit(); watchDpr(); }, { once: true });

  bg.append(canvas, board, cover);   // 包成一組：選單／放大 dialog 開著整組一起模糊＋疊白（bg.css）
  document.body.prepend(bg);
  addEventListener('resize', fit);
  fit();
  watchDpr();
}
