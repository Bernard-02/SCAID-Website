/**
 * 背景（user 2026-11-21）：畫布（筆跡）＜ 中空板 ＜ 內文。兩層包在 .bg 裡、在這裡放進 <body> 最前面，樣子在 css/components/bg.css。
 * 筆目前只有炭筆一種：
 * - 跟著游標畫：每秒下的炭量固定（flow）、攤在這一幀走過的那段路上 → 走越慢越濃，停著不動就一直疊在同一點
 * - 每一筆留 hold 秒、再用 fade 秒消失 → 停著不動時下的跟消失的會打平＝濃度的天花板
 * - 不在畫布上累積再整張淡掉（8-bit 的 alpha 淡不乾淨、會留殘影）：記下還活著的筆（marks），每幀整張重畫
 * - 炭的顆粒＝畫完疊一層紙紋 color-burn（炭量蓋過紙紋的地方才黑），再整張 color-dodge 把淺的灰洗掉
 *   → 淡的筆跡只剩零星顆粒，消失時是一粒一粒被紙吃掉、不是整片變淡
 * - 中空板＝透明毛玻璃＋折射（user 2026-11-21）：**整個背景就一大塊**（user 2026-11-22；中間試過「下筆的當下才生一塊、走滿一段換下一塊、
 *   格各抽各的」——好幾塊疊到的地方，同一筆被各自的格各折一次再疊在一起＝看起來重複了）。格開頁時排一次、排到螢幕那麼寬：
 *   寬窄不一（基準＝骨牌寬 × cell，每一格是它的 vary 倍），每條格線還照自己的節奏左右游移（drift、tide）＝格寬一直在變、不是固定的。
 *   格線的位置不取整、交界照比例混（user 2026-11-22：寬度的變化要順，一 px 一 px 跳看起來卡）
 * - 板子只出現在筆跡周圍、跟著筆跡一起消失（user 2026-11-21）：範圍（mask）＝每一筆一團柔邊的圓（同一筆的炭量與壽命）；
 *   圓的大小一路上起起伏伏（float），而且整片一起慢慢脹縮＝呼吸（breathe）
 * - 筆跡先畫在一張小的、不放進頁面的畫布（raw，1/SOFT 解析度）。板子把它範圍裡的 raw 一格一格貼出來——每一格把後面
 *   bend 格寬的畫面擠進自己那一格＝格跟格的交界對不上（折射錯位）——照範圍切邊，再貼到看得到的畫布（CSS 再糊一層＝毛玻璃）
 * - 板子本身（格線、反光、管壁的暗面）畫在另一張、一樣照範圍切邊。**現在看不到**（bg.css --board-max: 0；user 2026-11-22：
 *   先是材質感少一點，再來試「板子拿掉、只留它對筆觸的效果」＝模糊＋折射）。
 *   ponytail: 看不到但照畫——要放回來只改 --board-max 一個數字，煙霧測試也靠這張量板子的範圍、有沒有疊兩層；
 *   確定不要板子了，再把 .bg-board／ribs 這條線整段刪掉、測試改量 mask
 * - 筆跡固定畫白底（黑炭的 color-burn 只在這組顏色成立）、板子畫黑白，深色模式由 CSS 整張反過來
 * - 畫面不再變就停下來：沒有筆跡了＝整個停；游標停著、筆跡已經打平＝筆跡不用再算（時鐘停住），
 *   只剩格線在游移、板子在呼吸（看得到的兩張照 REST_FPS 重畫）
 * - 選單開著照樣畫（user 2026-11-22），筆跡跟內容一起模糊＋疊白（bg.css）；dialog（放大圖片、intro 影片）開著不畫
 * - 觸控沒有游標＝不畫（筆尖碰著螢幕也算觸控，懸空的筆照畫）；系統減少動態、強制色彩（高對比佈景）＝整個不放
 * - 純裝飾：畫布用不了（擴充套件擋掉、記憶體不夠）就不放；main.js 另外把 initBg 包起來，出錯也不會卡住後面的開機
 */

// 手感都在這幾個數字（濃度上限、毛玻璃多糊、板子本身多明顯、骨牌寬在 bg.css）。煙霧測試照這裡的數字算門檻＝調了不用改測試
export const INK = {
  size: 60,           // 筆頭直徑（px）
  flow: 10,           // 每秒下的炭量（筆頭中心的濃度／秒）
  hold: 1,            // 筆跡留多久才開始消失（秒）
  fade: 3,            // 消失要多久（秒）
  bite: 0.15,         // 顆粒感：比這個淺的灰洗成白（0＝一片霧霧的灰，越大越粗、淡的筆跡越快不見）
  bend: 4,            // 折射：中空板每一格把後面幾格寬的畫面擠進來（1＝不折射；越大，格跟格之間錯位越多）
  cell: 1.5,          // 中空板的格寬（基準）＝logo 骨牌寬的幾倍（user 2026-11-22：再大一點；原本 1＝剛好骨牌寬）
  vary: [0.16, 4],    // 每一格的寬＝格寬（骨牌寬 × cell）的幾倍：最窄～最胖，中間等比地抽（窄的多、胖的少但很胖；平均約 1.2 倍）。
                      // user 2026-11-22：胖的再胖、窄的再窄、變化幅度大一點（0.35～1.65 平均地抽 → 0.22～2.6 等比地抽），
                      // 接著「差距再大一點」「寬的上限再寬一點」→ 現在。最胖的那格要比板子露出來的範圍（halo）窄：
                      // 整塊板子只看得到一格＝沒有交界、看不出錯位
  drift: 0.3,         // 格寬一直在變：每條格線左右游移，最遠走到兩邊較窄那一格寬的幾成（0＝格寬固定；要 < 0.5，不然隔壁兩條線會撞在一起）
  tide: 8,            // 游移一趟幾秒（每條線自己的快慢在 ±40% 之間、起點也不同＝不會整片一起動）
  halo: 220,          // 中空板在每一筆周圍出現的範圍（直徑 px，平均）
  float: 0.35,        // 那個範圍一路上浮動幾成（0＝固定大小）
  breathe: 0.2,       // 呼吸：板子的範圍整片一起脹縮幾成（0＝不呼吸）
  breath: 4,          // 一口氣幾秒
};
const SOFT = 3;      // 筆跡畫在 1/3 解析度：省，放大回來順便先糊一層（毛玻璃主要的糊是 bg.css --frost）；紙紋的顆粒也是這麼大
const COARSE = 8;    // 板子的範圍（mask）、板子那張畫布直的方向＝畫面的 1/8：範圍是一團柔邊，放大回去剛好更柔
const REST_FPS = 30; // 游標停著、只剩格線游移與呼吸時的重畫頻率：都是慢慢動，30fps 就夠順（更新率高的螢幕省最多）

/** @template {keyof HTMLElementTagNameMap} K @param {K} tag @param {string} name */
function layer(tag, name) {
  const el = document.createElement(tag);
  el.className = name;
  el.setAttribute('aria-hidden', 'true');
  return el;
}

// 一顆中心實、往外淡的黑圓（直徑 d）：筆頭、板子在一筆周圍的範圍都是它
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

/**
 * 中空板的格線（開頁時排一次）：從畫面左緣外一路排到 w，每一格的寬＝pitch × vary 之間等比地抽（起點也隨機）。
 * 一條線＝{ x：沒游移時的位置、reach：最遠游移多少（px；照兩邊較窄的那一格算，不會跟隔壁的線交叉）、p／s：游移的起點／快慢 }；
 * 頭尾兩條（都在畫面外）不動＝格子永遠鋪滿畫面
 * @param {number} w @param {number} pitch
 */
export function grid(w, pitch) {
  const { vary, drift } = INK, lines = [{ x: -pitch * vary[1] * Math.random(), reach: 0, p: 0, s: 1 }];
  for (let x = lines[0].x, last = 0; x < w;) {
    const cw = pitch * vary[0] * (vary[1] / vary[0]) ** Math.random();   // 等比：最窄跟最胖一樣常見的話整片幾乎都是胖的，這樣窄的多、胖的少
    if (last) lines[lines.length - 1].reach = drift * Math.min(last, cw);
    lines.push({ x: x += cw, reach: 0, p: Math.random() * 2 * Math.PI, s: 0.6 + 0.8 * Math.random() });
    last = cw;
  }
  return lines;
}

export function initBg() {
  // 強制色彩：畫布是白底點陣、不會換成系統色 → 高對比的深色佈景會變一整頁白（bg.css 另外藏，處理開著頁面才切的情況）
  if (matchMedia('(prefers-reduced-motion: reduce), (forced-colors: active)').matches) return;
  const canvas = layer('canvas', 'bg-ink'), board = layer('canvas', 'bg-board'), bg = layer('div', 'bg');
  // 不放進頁面的畫布：raw＝筆跡本身；mask／pane／ribs＝一塊板子的草稿（範圍、隔著它看到的筆跡、它的格線），畫好才疊到 canvas／board
  const [raw, mask, pane, ribs] = [0, 0, 0, 0].map(() => document.createElement('canvas'));
  const ctx = canvas.getContext('2d'), brd = board.getContext('2d'), ink = raw.getContext('2d');
  const msk = mask.getContext('2d'), pan = pane.getContext('2d'), rib = ribs.getContext('2d');
  if (!ctx || !brd || !ink || !msk || !pan || !rib) return;   // 畫布用不了（擴充套件擋掉、記憶體不夠）：不放背景
  const html = document.documentElement;
  const { size, flow, hold, fade, bite, bend, cell, tide, halo, float, breathe, breath } = INK, life = hold + fade;
  const wash = `rgb(${Math.round(bite * 255)}, ${Math.round(bite * 255)}, ${Math.round(bite * 255)})`;
  const tip = dab(Math.round(size / SOFT)), spot = dab(64);
  const reach = halo * (1 + float) * (1 + breathe) / 2;   // 板子在一筆周圍最遠到哪（px）
  let pitch = 22 * cell, dpr = 1;   // 平均格寬（骨牌寬 bg.css --board-pitch × cell）、螢幕密度：fit() 讀

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

  /** 一筆：這一幀從 (x0, y0) 走到 (x1, y1)、下了 ink 的炭，t＝下筆時的時鐘，r＝這一筆周圍的板子比平均大／小幾倍
   *  @typedef {{ x0: number, y0: number, x1: number, y1: number, t: number, ink: number, r: number }} Mark */
  /** 還活著的筆，由舊到新 @type {Mark[]} */
  const marks = [];
  /** 整個背景那一大塊中空板的格線（fit() 排；視窗拉得比排過的還寬才重排） @type {ReturnType<typeof grid>} */
  let lines = [];
  let x = 0, y = 0, px = 0, py = 0, inside = false;
  let clock = 0, last = 0, movedAt = 0, raf = 0, viewAt = 0;   // movedAt＝游標最後一次有動的時鐘；viewAt＝看得到的兩張上次重畫（ms）

  // dialog（放大圖片、intro 影片）開著不下新的筆。選單開著照樣畫（user 2026-11-22；原本也停）
  const paused = () => !!document.querySelector('dialog[open]');

  // 還活著的筆，沿路每 1/4 個筆頭一顆（炭量平分）：cb(x, y, 濃度, 那一筆)
  function dabs(cb) {
    for (const m of marks) {
      const dx = m.x1 - m.x0, dy = m.y1 - m.y0;
      const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (size / 4)));
      const alpha = Math.min(1, m.ink / n) * Math.min(1, (life - (clock - m.t)) / fade);
      if (alpha < 1 / 255) continue;   // 畫了也看不到
      for (let i = 1; i <= n; i++) cb(m.x0 + dx * i / n, m.y0 + dy * i / n, alpha, m);
    }
  }

  // 筆跡本身（raw）：全部的筆畫在同一張紙上
  function drawInk() {
    clear(ink);
    dabs((sx, sy, a) => { ink.globalAlpha = a; ink.drawImage(tip, (sx - size / 2) / SOFT, (sy - size / 2) / SOFT); });
    ink.globalAlpha = 1;
    ink.globalCompositeOperation = 'color-burn';    // 紙紋：黑度＝炭量 ÷ 紙紋
    ink.fillStyle = paper;
    ink.fillRect(0, 0, raw.width, raw.height);
    ink.globalCompositeOperation = 'color-dodge';   // 黑度不到 bite 的洗成白，剩下的拉開
    ink.fillStyle = wash;
    ink.fillRect(0, 0, raw.width, raw.height);
  }

  // 板子（t 秒）：在草稿上畫好它的範圍、隔著它看到的筆跡、它的格線，後兩張照範圍切邊，再貼到看得到的兩張
  function drawBoard(t) {
    // 筆最遠蓋到哪（照 mask 的格取整、切在畫面裡）
    let l = Infinity, u = Infinity, r = -Infinity, d = -Infinity;
    for (const m of marks) { l = Math.min(l, m.x0, m.x1); r = Math.max(r, m.x0, m.x1); u = Math.min(u, m.y0, m.y1); d = Math.max(d, m.y0, m.y1); }
    const cx = Math.max(0, Math.floor((l - reach) / COARSE)), cy = Math.max(0, Math.floor((u - reach) / COARSE));
    const cw = Math.min(mask.width, Math.ceil((r + reach) / COARSE)) - cx, ch = Math.min(mask.height, Math.ceil((d + reach) / COARSE)) - cy;
    if (cw <= 0 || ch <= 0) return;   // 整塊在畫面外
    // 同一塊範圍在三種解析度：mask（cx…）、畫面 px（X…；pane）、板子那張（橫的照螢幕密度 RX／RW、直的同 mask）
    const X = cx * COARSE, Y = cy * COARSE, W = cw * COARSE, H = ch * COARSE;
    const RX = Math.round(X * dpr), RW = Math.round((X + W) * dpr) - RX, line = Math.max(1, Math.round(dpr)), shine = Math.max(1, Math.round(2 * dpr));

    // 範圍：每一顆一團柔邊的圓；大小＝平均 × 這一筆的浮動 × 現在的呼吸（整片一起）。多清一圈：放大時不會沾到上一幀留下的
    msk.clearRect(cx - 1, cy - 1, cw + 2, ch + 2);
    const k = (1 + breathe * Math.sin(t * 2 * Math.PI / breath)) * halo / COARSE;
    dabs((sx, sy, a, m) => { const w = k * m.r; msk.globalAlpha = a; msk.drawImage(spot, sx / COARSE - w / 2, sy / COARSE - w / 2, w, w); });

    for (const c of [pan, rib]) c.save();   // 兩張草稿都只動這塊範圍（clip），畫完還原
    pan.beginPath();
    pan.rect(X, Y, W, H);
    pan.clip();
    pan.clearRect(X, Y, W, H);
    rib.beginPath();
    rib.rect(RX, cy, RW, ch);
    rib.clip();
    rib.clearRect(RX, cy, RW, ch);
    rib.fillStyle = 'rgba(0, 0, 0, 0.03)';   // 整片帶玻璃一點點色
    rib.fillRect(RX, cy, RW, ch);
    // 格線現在的位置：每條照自己的節奏左右游移 → 格寬一直在變。**不取整**（user 2026-11-22：寬度的變化要順；原本取整＝交界是利的，
    // 但一秒才走幾 px 的線就變成一 px 一 px 地跳、看起來卡）：交界落在半個 px 上就照比例混
    const cols = lines.map((ln) => ln.x + ln.reach * Math.sin(t * 2 * Math.PI / tide * ln.s + ln.p));
    for (let i = 1; i < cols.length; i++) {
      const x0 = cols[i - 1], w = cols[i] - x0;
      if (w <= 0 || x0 + w <= X || x0 >= X + W) continue;
      // 隔著這一格看筆跡：以它的中線為準、把 bend 格寬的畫面擠進來（取到畫面外的部分不畫）。貼的位置都是整數 px
      // （drawImage 貼在半個 px 上，各家瀏覽器邊緣混不混不一樣）：左緣那 1px 照這一格佔的比例疊在左邊那一格上，
      // 剩下的一路畫到右緣往上取整（多出來的那一點留給右邊那一格來疊）
      const mid = x0 + w / 2, from = (v) => (mid + (v - mid) * bend) / SOFT, n = Math.floor(x0), body = Math.ceil(x0 + w) - n - 1;
      pan.globalAlpha = n + 1 - x0;
      pan.drawImage(raw, from(n), Y / SOFT, bend / SOFT, H / SOFT, n, Y, 1, H);
      pan.globalAlpha = 1;
      if (body > 0) pan.drawImage(raw, from(n + 1), Y / SOFT, body * bend / SOFT, H / SOFT, n + 1, Y, body, H);
      // 這一格本身＝左緣暗線＋一條反光＋往右暗下去（管壁的弧度）。畫成黑白，深色模式 CSS 整張反過來（暗線變亮、反光變暗）；
      // 位置一樣不取整（fillRect 落在半個 px 上會自己照比例混）
      const a0 = x0 * dpr, a1 = (x0 + w) * dpr, wallAt = a0 + (a1 - a0) * 0.55, wall = rib.createLinearGradient(wallAt, 0, a1, 0);
      rib.fillStyle = 'rgba(0, 0, 0, 0.14)';
      rib.fillRect(a0, cy, line, ch);
      rib.fillStyle = 'rgba(255, 255, 255, 0.6)';
      rib.fillRect(a0 + line, cy, shine, ch);
      wall.addColorStop(0, 'rgba(0, 0, 0, 0)');
      wall.addColorStop(1, 'rgba(0, 0, 0, 0.07)');
      rib.fillStyle = wall;
      rib.fillRect(wallAt, cy, a1 - wallAt, ch);
    }
    pan.globalCompositeOperation = rib.globalCompositeOperation = 'destination-in';   // 照範圍切邊
    pan.drawImage(mask, cx, cy, cw, ch, X, Y, W, H);
    rib.drawImage(mask, cx, cy, cw, ch, RX, cy, RW, ch);
    for (const c of [pan, rib]) c.restore();

    ctx.drawImage(pane, X, Y, W, H, X, Y, W, H);
    brd.drawImage(ribs, RX, cy, RW, ch, RX, cy, RW, ch);
  }

  // 看得到的兩張（t 秒）
  function view(t) {
    clear(ctx);
    brd.clearRect(0, 0, board.width, board.height);
    if (marks.length) drawBoard(t);
  }

  function frame(ts) {
    raf = 0;   // 先清掉：這一幀中途出錯也不會卡住（wake 還排得到下一幀）
    const dt = last ? Math.min((ts - last) / 1000, 0.05) : 0;   // 分頁切走再回來：不補那段時間
    last = ts;
    if (paused()) inside = false;   // 已經畫的照常消失；收了之後游標一動從那裡重新起筆
    // 游標停著、停滿一輪 life＝畫面上只剩這一點、下的跟消失的打平 → 筆跡不用再算（時鐘停住），只剩格線在游移、板子在呼吸
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
    if (!resting || ts - viewAt >= 1000 / REST_FPS - 2) {   // 格線一直在游移、板子一直在呼吸；停著時降到 REST_FPS
      view(ts / 1000);
      viewAt = ts;
    }
    if (inside || marks.length) raf = requestAnimationFrame(frame);
    else last = 0;
  }
  const wake = () => { if (!raf) raf = requestAnimationFrame(frame); };

  addEventListener('pointermove', (e) => {
    // 觸控沒有游標；dialog 開著不畫（也省得每動一下就整張重畫一次空白）
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
    const w = canvas.width = pane.width = canvas.clientWidth, h = canvas.height = pane.height = canvas.clientHeight;
    raw.width = Math.max(1, Math.ceil(w / SOFT));   // 至少 1px：0 的畫布拿來貼會丟例外（例：一開始高度 0 的 iframe）
    raw.height = Math.max(1, Math.ceil(h / SOFT));
    mask.width = Math.ceil(w / COARSE);
    mask.height = board.height = ribs.height = Math.ceil(h / COARSE);
    dpr = devicePixelRatio || 1;
    board.width = ribs.width = Math.round(w * dpr);
    // 平均格寬＝骨牌寬（bg.css --board-pitch）× cell。下限 8px：極窄的視窗骨牌寬會 ≤ 0，排格子的迴圈就停不下來
    pitch = Math.max(8, (parseFloat(getComputedStyle(board).getPropertyValue('--board-pitch')) || 22) * cell);
    // 那一大塊板子的格：開頁時排一次、排到螢幕那麼寬（換視窗大小沿用＝格子不會亂跳）；視窗拉得比排過的還寬（外接大螢幕）才重排
    if (!(lines[lines.length - 1]?.x >= w)) lines = grid(Math.max(w, screen.width), pitch);
    drawInk();
    view(performance.now() / 1000);
  };
  // 螢幕密度變了（視窗拖到另一個縮放比例的螢幕）大小卻沒變＝不會有 resize：另外聽，板子的線照新的密度重畫
  const watchDpr = () => matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener('change', () => { fit(); watchDpr(); }, { once: true });

  bg.append(canvas, board);   // 包成一組：選單／放大 dialog 開著整組一起模糊＋疊白（bg.css）
  document.body.prepend(bg);
  addEventListener('resize', fit);
  fit();
  watchDpr();
}
