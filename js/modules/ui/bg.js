// @ts-nocheck —— 照背景試驗場原文搬的（筆刷引擎＋WebGL），型別檢查略過：要改去試驗場改好再重搬
/**
 * 背景（user 2026-11-26：「我想要你幫我將背景apply在現在的網站上」）＝背景試驗場 https://claude.ai/artifact/YJ4JpmdDhwZsArffEnphKX 的那一份：
 * 游標一動就畫出光（WebGL 的光跡「光有 movement」＋從筆觸試驗場搬來的筆刷），光自己會淡掉；隔著看得見的中空板（板條錯位、反光、邊線）。
 * 設定（user 同一天選的）：中空板＝看得見、筆刷＝整支筆（開站那支：炭筆、圓頭；換頁隨機換一支）、錯位 1.5、深淺 100%、濃度 70%（bg.css 畫布的 opacity）；
 * 光的顏色：白天＝粉彩，夜晚＝每次換成夜晚隨機抽「原來的光」或「粉彩」。其他照試驗場的預設。
 * 跟試驗頁不同的只有：沒有介面、游標聽整頁（觸控不畫、放大的 dialog 開著不畫）、白天／夜晚跟網站的 data-theme。
 * 引擎（筆刷、光跡、畫面）照原文：要改去試驗場改好再重搬（scratchpad 的 port-bg.cjs：抽 IIFE、照記號換掉介面那幾段）。
 * 取代原本的炭筆背景（2026-11-21～23 那一套：畫布＜中空板、筆跡留 1 秒再 3 秒消失；2026-11-23 起關著）。
 * main.js 開機叫一次（BG 開關）；畫布在 <main> 外面＝換頁不重來。減少動態、強制色彩＝不放（列印 bg.css 藏）
 */
import { SHADERS } from './bg-shaders.js';

export function initBg() {
  if (matchMedia('(prefers-reduced-motion: reduce), (forced-colors: active)').matches) return;
  'use strict';
  const say = () => {};   // 試驗頁的狀態列；網站上不出字

  // ═══ 筆刷：從筆觸試驗場原封不動搬來的那幾段（筆頭、紋路、每支筆怎麼畫）。標「舊試驗場」的區塊不要改，要改去那一頁改了再搬 ═══
  // ── 舊試驗場：亂數與小工具 ──
  // 亂數都從這裡來、可以指定種子：每一筆記下自己的種子，改了設定重畫時紋理才不會每次換一個樣子
  let rs = (Math.random() * 2 ** 31) | 0;
  const rnd = () => { rs = rs + 0x6D2B79F5 | 0; let t = Math.imul(rs ^ rs >>> 15, 1 | rs); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const R = (a, b) => a + (b - a) * rnd(), clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, k) => a + (b - a) * k;
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;                 // 約 −1…1、中間多
  const lum = (v) => { const k = Math.round(255 * clamp(v, 0, 1)); return `rgb(${k},${k},${k})`; };   // 亮度 0 黑…1 白
  const gray = (d) => lum(1 - d);                                           // 多黑：0 白…1 黑
  const mk = () => document.createElement('canvas');
  // 畫布（都不放進頁面）：live／liveH／liveA＝筆頭一路蓋上去的量／厚度／沾到多少（會慢慢忘，見 forget）、tmp…＝加工用、
  // out＝這支筆在紙上的樣子（黑底、越白＝越多）、prev＝這一幀下筆前的 out、crop＝要傳給 shader 的那一塊、pa／pb＝縮小放大（糊）用
  // 網站：畫布放進 <body> 最前面、固定滿版、不吃指標、z -1（css/components/bg.css；濃度＝它的 opacity）
  const view = document.createElement('canvas'); view.className = 'bg'; view.setAttribute('aria-hidden', 'true'); document.body.prepend(view);
  const live = mk(), liveH = mk(), liveA = mk(), tmp = mk(), tmp2 = mk(), tmp3 = mk(), tmp4 = mk(), out = mk(), prev = mk(), crop = mk(), pa = mk(), pb = mk();
  const lx = live.getContext('2d'), hx = liveH.getContext('2d'), mx = liveA.getContext('2d');
  const tx = tmp.getContext('2d'), t2 = tmp2.getContext('2d'), t3 = tmp3.getContext('2d'), t4 = tmp4.getContext('2d');
  const ox = out.getContext('2d'), px = prev.getContext('2d'), cx = crop.getContext('2d');
  let W = 0, H = 0, DPR = 1;   // 畫布的大小（CSS px）、畫在幾倍的解析度
  // ── 舊試驗場：在裝置像素上做事／回到平常的座標 ──
  const dev = (ctx, box, fn) => { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.beginPath(); ctx.rect(box[0], box[1], box[2], box[3]); ctx.clip(); fn(); ctx.restore(); };
  const home = (...list) => { for (const c of list) { c.setTransform(DPR, 0, 0, DPR, 0, 0); c.globalAlpha = 1; } };   // 回到平常的座標（CSS px）

  // ── Grain：四種紋路（值越小＝越凸、越先沾到顏料） ──
  const speckle = (n) => { const c = mk(); c.width = c.height = n; const d = new ImageData(n, n);
    for (let i = 0; i < d.data.length; i += 4) { d.data[i] = d.data[i + 1] = d.data[i + 2] = 10 + rnd() * 245; d.data[i + 3] = 255; }
    c.getContext('2d').putImageData(d, 0, 0); return c; };
  const layers = (octaves, liftTo = 0) => { const c = mk(), g = c.getContext('2d'); c.width = c.height = 256;
    for (const [n, a] of octaves) { g.globalAlpha = a; g.drawImage(speckle(n), 0, 0, 256, 256); }
    if (liftTo) { g.globalAlpha = 1; g.globalCompositeOperation = 'screen'; g.fillStyle = lum(liftTo); g.fillRect(0, 0, 256, 256); }
    return tx.createPattern(c, 'repeat'); };
  const weaveTile = mk(); weaveTile.width = weaveTile.height = 256;
  { const d = new ImageData(256, 256);   // 畫布的織紋：2px 一格、一上一下
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const k = 255 * clamp((((x >> 1) + (y >> 1)) & 1 ? 0.85 : 0.4) + (rnd() - 0.5) * 0.3, 0.05, 1); d.data.set([k, k, k, 255], (y * 256 + x) * 4); }
    weaveTile.getContext('2d').putImageData(d, 0, 0); }
  const PAT = {
    paper: layers([[256, 1], [64, 0.5]]),                                 // 紙：細顆粒＋大一號的起伏（一叢一叢）——蠟筆、鉛筆、粉筆、炭筆、乾刷
    fine: layers([[256, 1]]),                                             // 霧點：只有細的——噴漆
    soft: layers([[256, 1], [128, 0.5]], 0.6),                            // 很淺的細顆粒：只把邊緣弄毛、不打散——乾刷的飛白、顏料表面、水彩的沉澱
    cloud: layers([[8, 1], [16, 0.5], [32, 0.33], [64, 0.25]], 0.4),      // 雲：大塊柔的起伏——水彩往外渲染得有遠有近
    weave: tx.createPattern(weaveTile, 'repeat'),                         // 畫布織紋——厚塗的顏料刷薄了露出來
  };

  // ── Shape：筆頭 ──
  // 一顆印：中心實、core 之外淡掉；tex＝表面不平（挖掉幾塊 → 拖過去留下順著筆勢的條紋）
  function disc(core, tex) {
    const c = mk(), n = 64; c.width = c.height = n;
    const g = c.getContext('2d'), gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    gr.addColorStop(0, '#000'); gr.addColorStop(core, 'rgba(0,0,0,.92)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, n, n);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < tex * 40; i++) { g.globalAlpha = R(0.25, 0.8); g.beginPath(); g.arc(R(0, n), R(0, n), R(1.5, 5), 0, 7); g.fill(); }
    return c;
  }
  const soft = disc(0.45, 0);
  // 噴霧的一團：中心濃、往外很快變淡但拖得很遠（像鐘形）
  const mist = (() => { const c = mk(), n = 64; c.width = c.height = n; const g = c.getContext('2d'), gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    for (const [at, a] of [[0, 1], [0.2, 0.62], [0.4, 0.26], [0.6, 0.09], [0.8, 0.025], [1, 0]]) gr.addColorStop(at, `rgba(0,0,0,${a})`);
    g.fillStyle = gr; g.fillRect(0, 0, n, n); return c; })();
  // 一排刷毛的起伏（0…1）：periods＝[[幾根一個起伏, 份量], …]，大的（一撮一撮）跟細的（一根一根）疊起來
  function wave(n, periods) {
    const out = new Float32Array(n); let total = 0;
    for (const [P, amp] of periods) { const knots = Array.from({ length: Math.ceil(n / P) + 2 }, rnd); total += amp;
      for (let i = 0; i < n; i++) { const u = i / P, j = u | 0, t = u - j; out[i] += amp * lerp(knots[j], knots[j + 1], t * t * (3 - 2 * t)); } }
    return out.map((v) => v / total);
  }
  // 把一排數字做成 1px 高的一條圖（之後拉成筆頭那麼寬、沿路徑一路蓋＝一條條順著筆勢的刷痕）
  const strip = (n, px) => { const c = mk(); c.width = n; c.height = 1; const d = new ImageData(n, 1); for (let i = 0; i < n; i++) d.data.set(px(i), i * 4); c.getContext('2d').putImageData(d, 0, 0); return c; };
  const shade = (v) => { const k = Math.round(255 * (1 - clamp(v, 0, 1))); return [k, k, k, 255]; };   // 多黑 → 不透明的灰
  const veil = (v) => [0, 0, 0, Math.round(255 * clamp(v, 0, 1))];                                      // 多少 → 黑的透明度
  const white1 = strip(1, () => [255, 255, 255, 255]);
  const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  function hsl([r, g, b]) { r /= 255; g /= 255; b /= 255; const hi = Math.max(r, g, b), lo = Math.min(r, g, b), l = (hi + lo) / 2, d = hi - lo; if (!d) return [0, 0, l];
    return [(hi === r ? ((g - b) / d + 6) % 6 : hi === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60, d / (1 - Math.abs(2 * l - 1)), l]; }
  function rgb([h, s, l]) { h = ((h % 360) + 360) % 360; const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
    return [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6].map((v) => (v + m) * 255); }
  // 一根毛上的顏料：t≤1＝本色混了多少白（0 全白…1 本色），t>1＝比本色更濃更深；turn＝色相偏幾度
  const pigment = (base, t, turn) => { const [h, s, l] = hsl(base), c = rgb([h + turn, s, l]); return t <= 1 ? c.map((v) => lerp(255, v, clamp(t, 0, 1))) : c.map((v) => v * (1 - (t - 1) * 0.75)); };
  const mix = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));   // 兩個顏色（[r, g, b]）之間
  // 顏色不是單一的（user：筆刷的顏色不要單一的 color，要 gradient 跟 beam）：兩個顏色各在筆頭的一邊
  const two = (cfg) => cfg.tone !== 'solid';
  // 幻彩（user 2026-11-23 給的參考圖：全像片那種粉彩的光——粉紅、桃、淡黃、薄荷、水藍、淡紫一路換，帶很多白）：u 每加 1＝這六個顏色輪一遍
  const IRIS = ['#ff9ed8', '#ffc9a3', '#fff3a6', '#a8ffd6', '#9fe8ff', '#c3b0ff'].map((h) => hex2rgb(h));
  const iris = (u) => { const t = (u - Math.floor(u)) * IRIS.length, i = Math.floor(t), k = t - i; return mix(IRIS[i], IRIS[(i + 1) % IRIS.length], k * k * (3 - 2 * k)); };
  const midOf = (cfg) => cfg.tone === 'iris' ? iris(0.3) : two(cfg) ? mix(hex2rgb(cfg.color), hex2rgb(cfg.color2), 0.5) : hex2rgb(cfg.color);

  // 舊試驗場的程式會用到的名字：S＝正在畫的這一筆、cur＝選了哪支筆、speedForce＝畫越慢越重（整支筆才看，open 設）
  let S = null, cur = 'charcoal', speedForce = true;
  const kick = () => {};
  const drip = () => {};   // ponytail: 噴漆積漆往下流的那一道沒搬（光停著不會一直加），要再從舊試驗場的 drip／stepDrips 搬

  // ── 舊試驗場：筆頭的方向、蓋印 ──
  // A＝筆頭寬的方向（鋼筆、麥克筆、白板筆的斜口＝固定角度，其他＝垂直前進方向）、D＝前進方向
  function axes(S) {
    const dx = S.dx ?? 1, dy = S.dy ?? 0;
    return S.b.nib && S.cfg.shape === 'chisel' ? { ax: 0.82, ay: -0.57, dx, dy } : { ax: -dy, ay: dx, dx, dy };
  }
  // 筆頭上的 n 個接觸點（毛筆的毛）：u＝橫向、v＝前後（都以筆頭寬為 1）
  function tipPoints(shape, n) {
    return Array.from({ length: n }, (_, i) => {
      let u, v;
      if (shape === 'round') { const r = Math.sqrt(rnd()) * 0.5, t = rnd() * 6.283; u = r * Math.cos(t); v = r * Math.sin(t); }
      else if (shape === 'fan') { u = (Math.floor(rnd() * 7) - 3) / 3 * 0.5 + gauss() * 0.035; v = 0.5 * u * u - 0.06; }   // 七撮、排成弧
      else { u = (i + 0.5) / n - 0.5 + R(-0.2, 0.2) / n; v = R(-0.03, 0.03); }                                             // 排成一條
      return { u, v, load: rnd(), g: rnd() };
    });
  }
  const seg1 = (x0, y0, x1, y1, w, style) => { lx.lineWidth = w; lx.strokeStyle = style; lx.beginPath(); lx.moveTo(x0, y0); lx.lineTo(x1, y1); lx.stroke(); };
  const disk = (ctx, x, y, r, style) => { ctx.fillStyle = style; ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r), 0, 7); ctx.fill(); };
  const dot = (x, y, r, style) => disk(lx, x, y, r, style);
  const poly = (pts, fill) => { lx.beginPath(); pts.forEach((p, i) => i ? lx.lineTo(p[0], p[1]) : lx.moveTo(p[0], p[1])); lx.closePath();
    lx.fillStyle = fill; lx.fill(); lx.lineJoin = 'round'; lx.lineWidth = 0.7; lx.strokeStyle = fill; lx.stroke(); };   // 多描一圈：面跟面之間不露縫
  // 蓋一顆印（圓／扁／扇形）
  function foot(S, x, y, size, q) {
    const im = S.stamp, shape = S.cfg.shape;
    if (shape === 'round') lx.drawImage(im, x - size / 2, y - size / 2, size, size);
    else if (shape === 'fan') for (let i = -3; i <= 3; i++) { const u = i / 3 * 0.5 * size, v = (0.5 * (i / 3 * 0.5) ** 2 - 0.06) * size, r = size * 0.2;
      lx.drawImage(im, x + q.ax * u + q.dx * v - r / 2, y + q.ay * u + q.dy * v - r / 2, r, r); }
    else { lx.save(); lx.translate(x, y); lx.rotate(Math.atan2(q.ay, q.ax)); lx.drawImage(im, -size / 2, -size * 0.17, size, size * 0.34); lx.restore(); }
  }
  // 蓋一條刷毛（中心 x, y、轉 ang、寬 w、厚 th）
  const put = (ctx, img, x, y, ang, w, th, a = 1) => { const c = Math.cos(ang) * DPR, s = Math.sin(ang) * DPR; ctx.setTransform(c, s, -s, c, x * DPR, y * DPR); ctx.globalAlpha = a; ctx.drawImage(img, -w / 2, -th / 2, w, th); };

  // ── 舊試驗場：每一種筆怎麼畫（乾的筆、水彩、毛筆、線、帶子、一排刷毛、噴漆） ──
  // 乾的筆（蠟筆、鉛筆、粉筆、炭筆）：一顆一顆蓋在這一筆的「量」上，之後照紙紋決定哪些顆粒沾得到（merge）
  const dry = {
    begin(S) { S.stamp = S.b.img; S.carry = 0; lx.globalAlpha = this.dose(S, S.p); foot(S, S.last.x, S.last.y, S.cfg.size, axes(S)); lx.globalAlpha = 1; },
    // 這一點累積到的量（力度 × 濃度）；一路上疊了好幾顆（圓的約 1/gap 顆，扁的、扇形的筆頭薄、疊到的少）→ 每顆只下一點
    dose: (S, p) => 1 - (1 - clamp(p * (0.3 + 0.8 * S.cfg.density) * S.b.flow, 0, 0.97)) ** (S.b.gap * 1.3 / ({ round: 1, fan: 0.2 }[S.cfg.shape] || 0.34)),
    seg(S, a, b, p0, p1, dist) {
      const B = S.b, size = S.cfg.size, q = axes(S), step = Math.max(0.7, size * B.gap);
      let d = S.carry;
      for (; d < dist; d += step) {
        const k = d / dist, p = lerp(p0, p1, k), x = lerp(a.x, b.x, k), y = lerp(a.y, b.y, k);
        lx.globalAlpha = this.dose(S, p);
        foot(S, x, y, size * (0.8 + 0.3 * p), q);
        if (B.dust && rnd() < B.dust) { const r = size * R(0.5, 0.95), t = R(0, 7); lx.globalAlpha = R(0.3, 0.8); lx.fillStyle = '#000'; lx.fillRect(x + Math.cos(t) * r, y + Math.sin(t) * r, R(1, 2.4), R(1, 2.4)); }
      }
      S.carry = d - dist; lx.globalAlpha = 1;
    },
  };

  // 水彩：一顆顆柔邊的印疊成一片「水＋顏料」；怎麼往外渲染、邊緣怎麼積色是疊到紙上時算的（merge 的 wash）
  const wash = {
    begin(S) { S.stamp = soft; S.carry = 0; lx.globalAlpha = 0.5; foot(S, S.last.x, S.last.y, S.cfg.size * (0.45 + 0.65 * S.p), axes(S)); lx.globalAlpha = 1; },
    seg(S, a, b, p0, p1, dist) {
      const size = S.cfg.size, q = axes(S), step = Math.max(1, size * 0.06);
      lx.globalAlpha = 0.45;
      let d = S.carry;
      for (; d < dist; d += step) { const k = d / dist; foot(S, lerp(a.x, b.x, k), lerp(a.y, b.y, k), size * (0.45 + 0.65 * lerp(p0, p1, k)), q); }
      S.carry = d - dist; lx.globalAlpha = 1;
    },
  };

  // 毛筆：每根毛各畫各的線。墨少、走得快、畫得久、力道輕 → 吃不到紙的毛變多（一條一條的飛白）
  const bristle = {
    begin(S) { S.tip = tipPoints(S.cfg.shape, Math.round(clamp(S.cfg.size * S.b.per, 6, 110))); },
    seg(S, a, b, p0, p1) {
      const B = S.b, { size, density, shape } = S.cfg, q = axes(S);
      const spread = size * (shape === 'fan' ? 1.5 : 1) * (0.2 + 0.95 * p1), lw = Math.max(1, spread / S.tip.length * B.fat);
      const dryness = (1 - density) * 0.9 + Math.min(0.5, S.speed / 3200) + S.run / B.reach * (1.15 - density) - p1 * 0.4;
      lx.lineCap = 'round';
      for (const t of S.tip) {
        const x = b.x + (q.ax * t.u + q.dx * t.v) * spread, y = b.y + (q.ay * t.u + q.dy * t.v) * spread;
        t.n = clamp((t.n || 0) + R(-0.015, 0.015), -0.06, 0.06);   // 每根毛自己慢慢變：斷的地方是一段一段、不是一點一點
        if (t.x != null && t.load > dryness + t.n) seg1(t.x, t.y, x, y, lw, gray(lerp(0.95, 0.35 + 0.3 * t.g, (1 - density) ** 1.4)));
        t.x = x; t.y = y;
      }
    },
    dwell(S, dt) { S.still = (S.still || 0) + dt; dot(S.last.x, S.last.y, S.cfg.size * (0.2 + 0.95 * S.p) / 2 * (1 + Math.min(0.45, S.still / 1400)), gray(lerp(0.95, 0.5, (1 - S.cfg.density) ** 1.4))); },   // 停著：墨暈開
  };

  // 線（原子筆、水性筆、鋼筆的圓尖）：一段一段等寬（或跟力度）的線
  const line = {
    begin(S) { S.b.start?.(S); },
    seg(S, a, b, p0, p1) {
      const B = S.b;
      if (B.skip) {   // 斷墨：空幾段，接回來時積一小點
        if (S.gap > 0) { if (--S.gap === 0) dot(b.x, b.y, B.width(S, p1) * 0.7, B.ink(S, 1)); return; }
        if (rnd() < B.skip * (1.6 - p1)) { S.gap = 2 + (rnd() * 4 | 0); return; }
      }
      lx.lineCap = lx.lineJoin = 'round';
      seg1(a.x, a.y, b.x, b.y, B.width(S, p1), B.ink(S, p1));
    },
    dwell(S, dt) { const B = S.b; if (!B.pool) return; S.still = (S.still || 0) + dt; dot(S.last.x, S.last.y, B.width(S, S.p) / 2 * (1 + Math.min(B.pool, S.still / 900)), B.ink(S, 1)); },
  };

  // 帶子（水性筆、鋼筆的斜口）：筆尖是一條邊，前後兩條邊之間填成面＝粗細跟著方向
  const ribbon = {
    seg(S, a, b, p0, p1) {
      const q = axes(S), w = S.b.width(S, p1), L = [b.x - q.ax * w / 2, b.y - q.ay * w / 2], Rr = [b.x + q.ax * w / 2, b.y + q.ay * w / 2];
      if (S.L) poly([S.L, S.R, Rr, L], S.b.ink(S, S.p));
      S.L = L; S.R = Rr;
    },
  };

  // 一排刷毛掃過去（乾刷、白板筆、壓克力、油畫）：筆頭＝一條「每根毛各自深淺／厚薄／吃墨多少」的圖，沿路每 1px 蓋一次、
  // 跟著前進方向轉 → 每根毛的樣子拉成一條順著筆勢的刷痕
  const sweep = {
    begin(S) {
      const B = S.b, { size, shape } = S.cfg;
      S.span = B.span ? B.span(S.cfg) : size * (shape === 'fan' ? 1.5 : shape === 'round' ? 0.7 : 1);
      const n = Math.max(6, Math.round(S.span / B.hair));
      S.strips = B.strips(S, {
        n,
        edge: (i) => Math.min(i + 0.5, n - i - 0.5) / n,   // 離筆頭邊緣多遠（0…0.5）
        gap: (i) => shape === 'fan' ? Math.sin((i + 0.5) / n * Math.PI * 7) ** 2 : shape === 'round' ? Math.sin((i + 0.5) / n * Math.PI) ** 0.6 : 1,   // 扇形＝七撮、圓頭＝兩邊薄
        // 抽一排新的刷毛：big＝一撮一撮的起伏、fine＝一根一根的、hair＝每根毛自己的亂數
        fresh: () => ({ big: wave(n, [[n / 3.5, 1], [n / 10, 0.5]]), fine: wave(n, [[2.2, 1]]), hair: Float32Array.from({ length: n }, rnd) }),
      });
      S.ang = null; S.carry = 0;
      B.start?.(S); home(lx, hx, mx);
    },
    seg(S, a, b, p0, p1, dist) {
      const B = S.b, q = axes(S), to = Math.atan2(q.ay, q.ax);
      if (S.ang == null) S.ang = to;
      const turn = Math.atan2(Math.sin(to - S.ang), Math.cos(to - S.ang)), th = 2.6;   // 轉彎分攤到這一段的每一步：外側才不會裂開
      let d = S.carry;
      for (; d < dist; d += 1) { const k = d / dist, p = lerp(p0, p1, k);
        B.lay(S, lerp(a.x, b.x, k), lerp(a.y, b.y, k), S.ang + turn * k, S.span * (0.85 + 0.2 * p), th, p, S.run + d); }
      S.carry = d - dist; S.ang += turn; home(lx, hx, mx);
    },
    end(S) { S.b.stop?.(S); home(lx, hx, mx); },
  };
  // 甩出來的一滴（乾刷）
  const splat = (S, x, y) => { home(lx); const r = S.span * R(0.35, 1.05), t = R(0, 6.283); disk(lx, x + Math.cos(t) * r, y + Math.sin(t) * r, R(0.6, 2.2), '#000'); };
  // 刷毛的樣子不是從頭到尾一樣：每種抽三排，沿路每 every px 慢慢換到下一排（刷痕會開始、結束、換位置）。回傳 [這一排, 下一排, 換到幾成]
  const along = (S, run, every) => { const u = run / every + S.off.y / 64, j = Math.floor(u), f = u - j; return [j % 3, (j + 1) % 3, f * f * (3 - 2 * f)]; };
  // 筆頭的寬沿路有一點起伏（邊緣不是兩條直線）
  const wobble = (S, run) => 1 + 0.04 * Math.sin(run / 29 + S.off.x) + 0.02 * Math.sin(run / 7.3 + S.off.y);
  // 厚塗（壓克力、油畫）的一排刷毛。k：streak＝混到白的寬條多明顯、mid＝筆的中間沾白、兩邊是本色（0＝沒有）、deep＝特別濃的幾根多深、
  // rim＝最邊上堆的那一道多深、hue＝色相偏幾度、ridge＝稜多高
  const paintStrips = (S, f, k) => {
    const A = hex2rgb(S.cfg.color), rows = [0, 1, 2].map(() => f.fresh()), rim = (i) => f.edge(i) < 0.04, mid = 0.5 + R(-0.15, 0.15);
    const lit = true;   // 顏料是光：最邊上堆的那一道不加深（顏料多的地方是更亮、不是更暗）
    // 本色：單色＝一個顏色；漸層／光束＝兩個顏色各在筆頭的一邊（像一支刷子兩邊各沾一色），三排刷毛的交界各在不同的位置＝沿路換排時交界慢慢移
    // 幻彩：一排刷毛橫跨七成的顏色，三排各從不同的顏色起＝沿路換排時顏色跟著換
    const tone = S.cfg.tone, B = tone === 'gradient' && hex2rgb(S.cfg.color2), cut = tone === 'solid' ? [] : rows.map(() => R(0.25, 0.75));
    const base = (r, i) => tone === 'iris' ? iris((i + 0.5) / f.n * 0.7 + cut[r] * 2) : B ? mix(A, B, clamp(0.5 + ((i + 0.5) / f.n - cut[r]) * 2.2, 0, 1)) : A;
    return {
      // c＝顏色：大部分是本色，一撮一撮寬寬地混到白（淡）、少數幾根特別濃（深），色相跟著偏一點；最邊上堆了一道
      c: rows.map((v, r) => strip(f.n, (i) => { const across = clamp(1 - Math.abs((i + 0.5) / f.n - mid) * 2.6, 0, 1) ** 0.8 * k.mid;
        const light = clamp(clamp((0.58 - v.big[i]) * 2.4, 0, 1) ** 1.2 * k.streak + across, 0, 0.92), deep = v.hair[i] > 0.96 ? k.deep * (v.hair[i] - 0.96) / 0.04 : 0;
        return [...pigment(base(r, i), rim(i) && !lit ? 1 + k.rim : 1 - light + deep + (v.fine[i] - 0.5) * 0.1, (v.big[i] - 0.5) * k.hue), 255]; })),
      // h＝厚度：每根毛一道稜；最邊上最高
      h: rows.map((v) => strip(f.n, (i) => shade(1 - (rim(i) ? 1 : clamp((0.42 + 0.36 * v.fine[i] + 0.22 * v.hair[i]) * k.ridge, 0, 1))))),
      // a＝吃不吃得到畫布：邊上的毛弱一點（邊緣不齊）
      a: rows.map((v) => strip(f.n, (i) => veil((0.62 + 0.38 * v.big[i]) * (0.7 + 0.3 * v.hair[i]) * (f.edge(i) < 0.06 ? 0.55 + 0.4 * v.fine[i] : 1) * f.gap(i) * 1.3))),
    };
  };
  function paintLay(S, x, y, ang, w, th, p, run) {
    const d = S.cfg.density, touch = 0.45 + 0.55 * clamp(run / (S.span * 0.2), 0, 1);   // 剛落筆那一小段還沒壓實：開頭不是一刀切
    const load = clamp((0.55 + 0.6 * d) * (0.45 + 0.75 * p) * touch * (1 - run / this.reach * (1.2 - d)), 0.03, 0.985), a = 1 - (1 - load) ** (1 / th);   // 越刷越少
    const [i, j, k] = along(S, run, this.every), two = k > 0.02;
    // 兩邊各自進進出出（邊緣不是兩條平行的直線）；剛落筆筆頭還沒壓開（開頭是圓的）
    const wl = 0.06 * Math.sin(run / 37 + S.off.x) + 0.035 * Math.sin(run / 11 + S.off.y * 1.7), wr = 0.06 * Math.sin(run / 43 + S.off.y) + 0.035 * Math.sin(run / 13 + S.off.x * 2.3);
    const ww = w * (0.6 + 0.4 * clamp(run / (S.span * 0.25), 0, 1) ** 0.6) * (1 + wl + wr), shift = w * (wr - wl) / 2;
    x += Math.cos(ang) * shift; y += Math.sin(ang) * shift;
    put(lx, S.strips.c[i], x, y, ang, ww, th); if (two) put(lx, S.strips.c[j], x, y, ang, ww, th, k);
    put(hx, S.strips.h[i], x, y, ang, ww, th); if (two) put(hx, S.strips.h[j], x, y, ang, ww, th, k);
    put(mx, S.strips.a[i], x, y, ang, ww, th, a * (1 - k)); if (two) put(mx, S.strips.a[j], x, y, ang, ww, th, a * k);
    if (run >= (S.next ??= R(8, 40))) { S.next = run + R(14, 70); put(hx, white1, x, y, ang, ww * R(0.5, 1), 1.6, R(0.2, 0.55)); }   // 筆頓一下：橫著堆一道
  }
  // 收筆：顏料被推到最後堆成一道（厚度那一層蓋一條最高的）
  function paintStop(S) { if (S.ang != null) { home(hx); const q = S.span * 0.9; hx.save(); hx.translate(S.last.x, S.last.y); hx.rotate(S.ang); hx.fillStyle = '#fff'; hx.fillRect(-q / 2, -1.5, q, 3); hx.restore(); } }

  // 噴漆：照時間噴（停著也一直噴）。中心是一團越噴越實的量、外圍是飛出去的漆點，疊到紙上時照細顆粒打散成霧點；
  // 同一個地方噴太久就積漆、往下流
  const spray = {
    begin(S) { S.pool = 0; },
    puff(S, x, y, ms, p) {
      const { size, density, shape } = S.cfg, q = axes(S), r = size / 2 * (1.25 - 0.5 * p);
      lx.globalAlpha = clamp(ms * 0.008 * (0.35 + density) * (0.45 + p), 0, 0.9);
      if (shape === 'fan') { lx.save(); lx.translate(x, y); lx.rotate(Math.atan2(q.ay, q.ax)); lx.drawImage(mist, -r * 2.6, -r * 0.75, r * 5.2, r * 1.5); lx.restore(); }   // 扇形噴嘴：一道扁的
      else lx.drawImage(mist, x - r * 1.7, y - r * 1.7, r * 3.4, r * 3.4);
      lx.globalAlpha = 1;
      for (let i = ms * 0.5 * (0.4 + p) * (size / 60); i > rnd(); i--) {
        let u = gauss() * r * 1.7, v = gauss() * r * 1.7; if (shape === 'fan') { u *= 1.6; v *= 0.35; }
        dot(x + q.ax * u + q.dx * v, y + q.ay * u + q.dy * v, R(0.3, 1.1), '#000');
      }
    },
    seg(S, a, b, p0, p1, dist) {
      const n = Math.max(1, Math.ceil(dist / 5));
      for (let i = 1; i <= n; i++) this.puff(S, lerp(a.x, b.x, i / n), lerp(a.y, b.y, i / n), S.dt / n, p1);
      S.pool = Math.max(0, S.pool - dist * 4);
    },
    dwell(S, dt) {
      this.puff(S, S.last.x, S.last.y, dt, S.p); S.pool += dt * (0.4 + S.cfg.density) * (0.5 + S.p);
      if (S.pool > 480) { S.pool -= R(160, 340); const r = S.cfg.size / 4;   // 積太多：從下半部流下來一道，粗細、長短、歪的程度都不一樣
        drip({ x: S.last.x + R(-r, r), y: S.last.y + R(0.1, 1) * r, v: R(45, 120), len: 0, max: R(25, 170) * (0.5 + S.cfg.density), w: R(1.8, 4.6), sway: R(0.3, 1.2), ph: R(0, 6.283), a: 0.55 + 0.4 * S.cfg.density, c: S.cfg.color }); }
    },
  };

  // ── 14 支筆。def＝預設；max＝粗細上限；media＝疊到紙上的方式（dry 照紋路的顆粒、wash 水彩、paint 厚塗，其餘直接疊）；cover＝蓋得住底下 ──
  const startDot = (S) => dot(S.last.x, S.last.y, S.b.width(S, S.p) * 0.55, S.b.ink(S, 1));
  const flat = (S) => S.b.ink(S, S.p);
  const BR = [
    { id: 'crayon', name: '蠟筆', say: '蠟質、顆粒粗。用力就把紙的凹處填滿，輕輕畫只沾到凸的地方。',
      shapes: ['round', 'flat'], def: { shape: 'round', size: 16, force: 0.7, density: 0.8 }, max: 60,
      eng: dry, media: 'dry', core: 0.8, tex: 0.9, gap: 0.1, flow: 0.9, grain: 2.6, bite: 0.6, grit: 0.22 },
    { id: 'pencil', name: '鉛筆', say: '細、淡、顆粒細。力度決定深淺；扁＝筆芯側著塗一片。',
      shapes: ['round', 'flat'], def: { shape: 'round', size: 3.5, force: 0.55, density: 0.7 }, max: 40,
      eng: dry, media: 'dry', core: 0.5, tex: 0.15, gap: 0.14, flow: 1.25, grain: 1.1, bite: 0.22, grit: 0.55, lift: true },
    { id: 'ballpoint', name: '原子筆', say: '等寬的細線，力度只影響深淺；偶爾斷墨、積一小點墨。',
      shapes: ['round'], def: { shape: 'round', size: 1.8, force: 0.6, density: 0.9 }, max: 6,
      eng: line, skip: 0.012, width: (S, p) => S.cfg.size * (0.8 + 0.35 * p), ink: (S, p) => gray(S.cfg.density * (0.45 + 0.55 * p)),
      start: (S) => rnd() < 0.5 && dot(S.last.x, S.last.y, S.cfg.size * 0.75, gray(S.cfg.density)) },
    { id: 'felt', name: '水性筆', say: '等寬的實線、邊緣乾淨，停著會積墨。斜口＝麥克筆的斜頭，橫豎粗細不同。',
      shapes: ['round', 'chisel'], def: { shape: 'round', size: 4, force: 0.6, density: 1 }, max: 30, nib: true,
      eng: (shape) => shape === 'chisel' ? ribbon : line, pool: 0.5, width: (S, p) => S.cfg.size * (0.95 + 0.1 * p), ink: (S) => gray(0.93 * S.cfg.density), start: startDot },
    { id: 'fountain', name: '鋼筆', say: '圓＝粗細跟著力度，起收筆是尖的；斜口＝平尖，粗細跟著方向。畫快墨色淡一點。',
      shapes: ['round', 'chisel'], def: { shape: 'round', size: 5, force: 0.6, density: 1 }, max: 30, nib: true, taper: true,
      eng: (shape) => shape === 'chisel' ? ribbon : line, pool: 0.9,
      width: (S, p) => S.cfg.shape === 'chisel' ? S.cfg.size * (0.9 + 0.2 * p) : S.cfg.size * (0.3 + 1.1 * p) * clamp(1.15 - S.speed / 2500, 0.55, 1.1),
      ink: (S) => gray(S.cfg.density * lerp(0.96, 0.7, clamp(S.speed / 2200, 0, 1))) },
    { id: 'marker', name: '白板筆', say: '半透明的墨：兩邊各積一道深的、中間有幾條沒吃滿的白絲，起筆收筆各積一點；畫快顏色變淡、絲更多，疊過去的地方會變深。斜口＝斜頭，橫豎粗細不同。',
      shapes: ['round', 'chisel'], def: { shape: 'round', size: 10, force: 0.6, density: 0.8, color: '#2b63d9' }, max: 40, nib: true,
      eng: sweep, hair: 0.9, span: (cfg) => cfg.size,
      // 三條：慢、普通、快（越快越淡、絲越多）
      strips: (S, f) => { const v = f.fresh(); return { c: [0, 0.12, 0.26].map((fast) => strip(f.n, (i) => shade(clamp((0.5 + 0.35 * S.cfg.density) * (1 - fast) + (f.edge(i) < 0.12 ? 0.22 : 0) - (0.1 + fast) * 1.6 * (1 - v.fine[i]) ** 2.5, 0.05, 1)))) }; },
      lay(S, x, y, ang, w, th) { put(lx, S.strips.c[S.speed > 1400 ? 2 : S.speed > 600 ? 1 : 0], x, y, ang, w, th); },
      cap(S, pt) { if (S.cfg.shape === 'round') { home(lx); disk(lx, pt.x, pt.y, S.span * 0.5, gray(0.72 + 0.25 * S.cfg.density)); } },   // 圓頭：起筆、收筆各積一點墨
      start(S) { this.cap(S, S.from); }, stop(S) { this.cap(S, S.last); } },
    { id: 'watercolor', name: '水彩', say: '一片柔的光：中間最亮、往外很寬地淡掉，沒有邊；一筆疊一筆會更亮，不同顏色疊到的地方混在一起。濃度＝多亮，力度＝筆壓開多大。',
      shapes: ['round', 'flat', 'fan'], def: { shape: 'round', size: 46, force: 0.6, density: 0.5, color: '#2b63d9' }, max: 140, eng: wash, media: 'wash' },
    { id: 'chalk', name: '粉筆', say: '粉粉的、顆粒大、深淺不勻，邊緣掉粉屑。',
      shapes: ['round', 'flat'], def: { shape: 'flat', size: 22, force: 0.6, density: 0.65 }, max: 70,
      eng: dry, media: 'dry', core: 0.6, tex: 0.5, gap: 0.1, flow: 0.95, grain: 2.2, bite: 0.55, grit: 0.6, dust: 0.12 },
    { id: 'inkbrush', name: '毛筆', say: '粗細跟著力度，起收筆帶鋒；走得快或墨少就飛白，停著會暈開。濃度＝墨的濃淡。',
      shapes: ['round', 'flat', 'fan'], def: { shape: 'round', size: 34, force: 0.6, density: 0.85 }, max: 110,
      eng: bristle, taper: true, per: 1.3, fat: 3.4, reach: 1500 },
    { id: 'brush', name: '刷子', say: '乾刷：中間是實的，頭尾拉出一絲一絲的飛白，邊緣毛毛的，偶爾甩出幾滴。濃度＝沾多少顏料（越少越早刷乾），力度＝壓多實。',
      shapes: ['flat', 'round', 'fan'], def: { shape: 'flat', size: 70, force: 0.7, density: 0.8 }, max: 160,
      eng: sweep, media: 'dry', cover: true, taper: true, flick: 2.4, hair: 1.2, reach: 1500, pat: 'soft', grain: 1.2, bite: 0.42, grit: 0.2,
      // 每根毛吃墨多少：一撮一撮有強有弱；大部分吃得飽，少數幾根幾乎沒墨（實心的地方也留幾條白絲）；最邊上的毛弱（邊緣毛毛的、先乾）
      strips: (S, f) => ({ a: [0, 1, 2].map(() => { const v = f.fresh(); return strip(f.n, (i) => veil((0.55 + 0.45 * v.big[i])
        * (v.hair[i] < 0.05 ? 0.04 + v.hair[i] * 4 : 1 - 0.75 * ((v.hair[i] - 0.05) / 0.95) ** 2) * (f.edge(i) < 0.1 ? 0.15 + 0.6 * v.fine[i] : 1) * f.gap(i))); }) }),
      lay(S, x, y, ang, w, th, p, run) {
        // 吃得到紙的程度：剛落筆還沒壓實、越刷顏料越少、力道輕或刷得快都少 → 弱的毛先斷，剩下強的毛拉出一絲一絲
        const d = S.cfg.density, touch = clamp(run / (S.span * 0.45), 0, 1) ** 0.7;
        const load = clamp((0.45 + 0.7 * d) * (0.3 + 0.95 * p) * (0.3 + 0.7 * touch) * (1 - run / this.reach * (1.25 - d)) - Math.min(0.25, S.speed / 8000), 0.02, 0.98);
        const a = 1 - (1 - load) ** (1 / th), [i, j, k] = along(S, run, 110), ww = w * wobble(S, run);
        put(lx, S.strips.a[i], x, y, ang, ww, th, a * (1 - k)); if (k > 0.02) put(lx, S.strips.a[j], x, y, ang, ww, th, a * k);
        if (rnd() < 0.0025 + S.speed / 600000) splat(S, x, y);
      },
      start(S) { for (let i = 0; i < 3; i++) splat(S, S.from.x, S.from.y); } },
    { id: 'charcoal', name: '炭筆', say: '粗顆粒＋順著筆勢的條紋，底下帶一層抹開的灰。扁＝炭條側著畫。',
      shapes: ['round', 'flat'], def: { shape: 'flat', size: 40, force: 0.6, density: 0.8 }, max: 110,
      eng: dry, media: 'dry', core: 0.75, tex: 0.7, gap: 0.08, flow: 1, grain: 2.4, bite: 0.6, grit: 0.25, smudge: 0.14 },
    { id: 'spray', name: '噴漆', say: '一團霧點：中間越噴越實、外圍是散開的細點，按著不動也一直噴；同一處噴太久會積漆、往下流。力度＝離牆多近（近＝集中）。扇形＝扁的噴嘴。',
      shapes: ['round', 'fan'], def: { shape: 'round', size: 70, force: 0.6, density: 0.6 }, max: 200,
      eng: spray, media: 'dry', cover: true, pat: 'fine', grain: 1, bite: 0.1, grit: 0.5, quick: 0.3 },
    { id: 'acrylic', name: '壓克力顏料', say: '厚、不透明、蓋得住底下。一筆裡有幾道寬寬的顏色混到白、色相也偏一點，每根刷毛留下一道稜、受光的那面亮；兩邊進進出出不是直線，刷到後面顏料少了會斷。濃度＝沾多少顏料。',
      shapes: ['flat', 'round', 'fan'], def: { shape: 'flat', size: 56, force: 0.7, density: 0.9, color: '#2f9e5a' }, max: 160,
      eng: sweep, media: 'paint', taper: true, hair: 1.3, reach: 2400, every: 150, depth: 1.2, relief: 0.55, form: 0.8, gloss: 0.25, bite: 0.4, grit: 0.3,
      strips: (S, f) => paintStrips(S, f, { streak: 0.7, mid: 0, deep: 0.2, rim: 0.05, hue: 30, ridge: 0.75 }), lay: paintLay, stop: paintStop },
    { id: 'oil', name: '油畫', say: '更厚、有油亮的反光：下筆一坨，筆的中間混著白、兩邊是濃的本色，邊緣堆得高、顏色最深，刷痕立體；拖到後面顏料用完會斷。濃度＝沾多少顏料。',
      shapes: ['flat', 'round', 'fan'], def: { shape: 'flat', size: 60, force: 0.8, density: 0.9, color: '#7a2a78' }, max: 160,
      eng: sweep, media: 'paint', taper: true, hair: 1.5, reach: 1200, every: 110, depth: 1.8, relief: 0.75, form: 1, gloss: 0.55, bite: 0.4, grit: 0.3,
      strips: (S, f) => paintStrips(S, f, { streak: 0.45, mid: 0.7, deep: 0.3, rim: 0.45, hue: 12, ridge: 1 }), lay: paintLay, stop: paintStop,
      start(S) {   // 下筆那一坨：邊緣最厚
        const { x, y } = S.from, r = S.span * 0.3; home(lx, hx, mx);
        disk(lx, x, y, r, `rgb(${pigment(midOf(S.cfg), 1.2, 0).map(Math.round)})`); disk(mx, x, y, r, '#000');
        const g = hx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, lum(0.5)); g.addColorStop(0.7, lum(0.75)); g.addColorStop(1, lum(1)); disk(hx, x, y, r, g);
      } },
  ];
  for (const b of BR) if (b.core) b.img = disc(b.core, b.tex);   // 筆頭的紋理先做好：不佔每一筆自己的亂數
  const BY = Object.fromEntries(BR.map((b) => [b.id, b]));
  const SHAPE = { round: '圓', flat: '扁', fan: '扇形', chisel: '斜口' };

  // ── 舊試驗場：力度、走一段 ──
  const target = (S, pt) => { let p = S.cfg.force * pt.pen * S.fade; if (speedForce) p *= clamp(1.15 - S.speed / 2600, 0.45, 1.15); return clamp(p, 0.02, 1); };
  function extend(pt) {
    const a = S.last, dist = Math.hypot(pt.x - a.x, pt.y - a.y), dt = Math.max(1, pt.t - a.t);
    if (dist < 0.4) return;
    const ux = (pt.x - a.x) / dist, uy = (pt.y - a.y) / dist;   // 前進方向慢慢跟：急轉彎時筆頭不會瞬間轉過去
    if (S.dx == null) { S.dx = ux; S.dy = uy; } else { const nx = S.dx + (ux - S.dx) * 0.35, ny = S.dy + (uy - S.dy) * 0.35, n = Math.hypot(nx, ny) || 1; S.dx = nx / n; S.dy = ny / n; }
    S.speed += (dist / dt * 1000 - S.speed) * 0.3;
    const p0 = S.p; S.p += (target(S, pt) - S.p) * 0.35; S.dt = dt;
    if (S.hue) {   // 這一段的顏色（起筆的後面也鋪一段：光暈在筆的兩頭也照左右分色）
      if (!S.capped) { S.capped = true; hueCap(S, a.x, a.y, -1); }
      for (let d = 0; d < dist; d += 2) { const k = d / dist; hueAt(S, lerp(a.x, pt.x, k), lerp(a.y, pt.y, k), S.run + d); }
      home(kx);
    }
    S.eng.seg(S, a, pt, p0, S.p, dist);
    const B = S.box; B[0] = Math.min(B[0], pt.x); B[1] = Math.min(B[1], pt.y); B[2] = Math.max(B[2], pt.x); B[3] = Math.max(B[3], pt.y);
    S.run += dist; S.last = pt; S.still = 0; S.movedAt = performance.now();
    kick();
  }

  // ── 舊試驗場：縮小再放大＝糊 ──
  // 縮小的那張在右、下各補兩排跟邊上一樣的：之後再從它縮／放大時，邊上才不會取到外面透明的那一塊——不然糊出來的右、下兩邊是半透明的，
  // 底下原本的東西（別筆留下的）會漏出來＝這一筆的範圍右邊、下面各一條細線（L 形；Chrome 看得到、WebKit 不會；user 2026-11-23 回報）。
  // pa／pb 比畫面的一半多留 2px 就是放這兩排
  const edge = (g, cnv, nw, nh) => { g.globalCompositeOperation = 'source-over'; g.drawImage(cnv, nw - 1, 0, 1, nh, nw, 0, 2, nh); g.drawImage(cnv, 0, nh - 1, nw + 2, 1, 0, nh, nw + 2, 2); };
  // 縮小再放大＝糊（f＝縮幾倍；先一半一半縮、最後補上零頭）。src 的 box 那一塊糊好畫到 dst 的同一塊。
  // smooth＝放大也一級一級來（光束的光暈：一次放大幾十倍，柔的一大片會看得到一格一格）
  function blurBox(dst, src, [X, Y, w, h], f, smooth) {
    let from = src, fx = X, fy = Y, fw = w, fh = h, left = Math.max(2, f), i = 0;
    const steps = [];
    while (left > 1.01) {
      const q = Math.min(2, left), nw = Math.max(2, Math.round(fw / q)), nh = Math.max(2, Math.round(fh / q)), to = i++ % 2 ? pb : pa, g = to.getContext('2d');
      g.globalCompositeOperation = 'copy'; g.drawImage(from, fx, fy, fw, fh, 0, 0, nw, nh); edge(g, to, nw, nh);
      from = to; fx = fy = 0; fw = nw; fh = nh; left /= q; steps.push([nw, nh]);
    }
    if (smooth) for (let s = steps.length - 2; s >= 0; s--) {
      const [nw, nh] = steps[s], to = i++ % 2 ? pb : pa, g = to.getContext('2d');
      g.globalCompositeOperation = 'copy'; g.drawImage(from, 0, 0, fw, fh, 0, 0, nw, nh); edge(g, to, nw, nh);
      from = to; fw = nw; fh = nh;
    }
    dst.globalCompositeOperation = 'source-over'; dst.globalAlpha = 1; dst.drawImage(from, fx, fy, fw, fh, X, Y, w, h);
  }
  // ═══ 舊試驗場搬來的到這裡 ═══

  // 每支筆的設定：舊試驗場的預設＋那一頁存的（picks：形狀、粗細、力度、濃度）。顏色不帶：這裡的光是什麼顏色由 shader 決定，
  // 筆只管「哪裡有多少」——厚塗的筆要一個底色才看得出混白的刷痕與受光的稜，給中灰
  const PICK = { acrylic: { size: 48 }, brush: { size: 60, force: 0.6, density: 1 }, charcoal: { shape: 'round' }, crayon: { size: 39 }, oil: { size: 52 }, spray: { force: 0.84, density: 1 }, watercolor: { density: 0.45 } };
  // 阻力（0～1）：這支筆畫下去的東西多不容易被風帶走。user 2026-11-26：「目前的筆觸都有點像在水裏面作畫…需要加上各自的阻力」——
  // 每支筆畫的都被風帶著漂＝全部像墨滴進水裡。乾的、黏的筆（蠟筆、鉛筆、油畫）留在原地；粉、炭會被帶走一點點（像被抹開）；
  // 墨和水彩是濕的＝流一小段；噴漆是霧＝飄得最遠。「原本的」那條光不算筆＝阻力 0，照代碼被風帶著走
  const DRAG = { crayon: 1, pencil: 1, fountain: 0.75, marker: 0.85, watercolor: 1, chalk: 0.88, inkbrush: 0.6, brush: 0.9, charcoal: 0.9, spray: 0.45, oil: 1 };   // 水彩：紙吸住了＝不漂（一漂，不齊的邊就糊掉）
  const cfgs = Object.fromEntries(BR.map((b) => [b.id, { ...b.def, ...PICK[b.id], tone: 'solid', color: '#b8b8b8', bright: 0, drag: DRAG[b.id] ?? 0.8 }]));
  const OFF = new Set(['ballpoint', 'felt', 'acrylic']);   // user 2026-11-26：原子筆、水性筆、壓克力顏料先不用（清單上不列）

  // 下筆（照舊試驗場的 begin，兩個地方不同）：live 不清——留著最近畫的，接著畫才接得上；先不蓋第一顆印（draw 要先記下筆前的樣子）
  function open(pt) {
    const base = BY[cur], cfg = { ...cfgs[cur] }, tex = mode.id === 'tex';
    // 貼質感：筆只出質感，其他照代碼那條光。粗細＝蓋得住那條光的寬（畫布高的 6%：那條光的寬是照畫布高算的）、不帶鋒、顏料刷不完、
    // 不看畫多快（draw 給的時間是假的）——這些是那支筆自己的走法，不是質感
    const b = tex ? Object.assign(Object.create(base), { reach: 1e9, taper: false }) : base;
    if (tex) cfg.size = Math.max(6, H * 0.06);
    speedForce = !tex;
    rs = (Math.random() * 2 ** 31) | 0;
    for (const c of [lx, hx, mx]) { home(c); c.globalCompositeOperation = 'source-over'; }
    S = { b, cfg, eng: typeof b.eng === 'function' ? b.eng(cfg.shape) : b.eng, from: pt, last: pt, box: [pt.x, pt.y, pt.x, pt.y], run: 0, speed: 0, fade: 1, movedAt: performance.now(), off: { x: R(0, 256), y: R(0, 256) } };
    S.p = S.p0 = target(S, pt) * (b.taper ? 0.2 : 1);   // 帶鋒的筆：起筆從輕的開始
  }

  // 這支筆在紙上的樣子（照舊試驗場的 merge，只留「哪裡有多少」：不上色、不加亮度）：live… 的 box 那一塊 → out 的同一塊
  function render(box) {
    const b = S.b, [X, Y, bw, bh] = box, wet = b.media === 'wash', far = wet ? S.cfg.size * 0.5 + 16 : 0;
    const filler = (ctx) => (op, style, a = 1) => { ctx.globalCompositeOperation = op; ctx.globalAlpha = a; ctx.fillStyle = style; ctx.fillRect(X, Y, bw, bh); };
    const fill = filler(tx), fill2 = filler(t2), fill3 = filler(t3), fill4 = filler(t4), fillO = filler(ox);
    const draw = (ctx, cnv, op = 'source-over', a = 1, dx = 0, dy = 0) => { ctx.globalCompositeOperation = op; ctx.globalAlpha = a; ctx.drawImage(cnv, dx, dy); };
    const at = (pat, k) => pat.setTransform(new DOMMatrix().translate(S.off.x, S.off.y).scale(k * DPR));
    // Grain：量 ÷ 紋路（凸的地方先沾到）→ 不到 bite 的洗成白 → 剩下的壓實（grit 越小顆粒越非黑即白）
    const grain = (pat, k, bite, grit) => { at(pat, k); fill('color-burn', pat); fill('color-dodge', lum(bite)); fill('color-burn', lum(grit)); };
    const emit = () => draw(ox, tmp, 'lighter');
    const shine = () => { fill('difference', '#fff'); emit(); };   // tmp 上是「白底、越黑＝越多」→ 反過來加到 out
    // 厚度圖（黑底、越白越厚）→ 光影（0.5＝平的；光從左上來）
    const emboss = (ctx, fl, height, d) => { fl('source-over', '#fff'); draw(ctx, height, 'difference', 1, d, d); draw(ctx, height, 'source-over', 0.5, -d, -d); };
    [ox, tx, t2, t3, t4].reduceRight((next, ctx) => () => dev(ctx, box, next), () => {
      fillO('source-over', '#000');
      if (b.media === 'dry') {
        if (b.smudge) { fill('source-over', '#fff'); draw(tx, live, 'source-over', b.smudge); shine(); }   // 抹開的那一層：很淡
        fill('source-over', '#fff'); draw(tx, live); grain(PAT[b.pat || 'paper'], b.grain, b.bite, b.grit);
        if (b.lift) fill('screen', lum(0.65 - 0.5 * S.cfg.density));   // 鉛筆畫不到最深＝亮不到最亮
        shine();
      } else if (wet) {
        // 水彩：照 user 2026-11-26 給的參考圖（一排藍色的水彩筆觸）——邊緣不齊、有大的進出也有小的毛邊；裡面是平的一片，
        // 帶一塊一塊的深淺和紙紋的細點；整片半透明。之前做成「一片柔的光」（糊開的一團、沒有邊）＝user：「太假了」
        const d = S.cfg.density, size = S.cfg.size;
        fill('source-over', '#fff'); draw(tx, live);
        // 形狀：筆頭蓋的量先糊開一點（邊上由濃到淡那一段拉寬）→ ÷ 雲紋、÷ 細紋 → 過門檻 → 壓實。
        // 邊界落在哪裡跟著紙的起伏走＝大的進進出出＋小的毛邊；過了門檻的地方一樣滿＝裡面是平的
        blurBox(tx, tmp, box, (size * 0.26 + 4) * DPR / 1.5, true);
        at(PAT.cloud, 1.3 + size / 90); fill('color-burn', PAT.cloud);            // 大的進出：筆畫忽寬忽窄
        at(PAT.cloud, 0.45 + size / 200); fill('color-burn', PAT.cloud, 0.8);     // 中的：邊上一個一個的小彎
        at(PAT.paper, 1.1); fill('color-burn', PAT.paper, 0.45);                  // 細的：毛邊
        fill('color-dodge', lum(0.55)); fill('color-burn', lum(0.28));
        blurBox(tx, tmp, box, 2);   // 邊上軟一點點：紙會吸水，邊不是刀切的
        // （沒做「邊上顏料比較多」：筆往前走的時候，前端那一圈深的會一幀一幀留下來＝一個一個的弧）
        // 裡面：一塊一塊的深淺（水多的地方顏料少，大塊＋小塊）＋紙紋的細點（顏料沉在紙的凹處）
        at(PAT.cloud, 1.5 + size / 60); fill('screen', PAT.cloud, 0.6);
        at(PAT.cloud, 0.6); fill('screen', PAT.cloud, 0.35);
        at(PAT.paper, 1.2); fill('screen', PAT.paper, 0.4);
        // 濃度：水彩是半透明的＝光只有兩三成（畫面那支 shader 會把光往上推、再加光暈：這裡給到五成，隔著中空板看就是一條實心的深色）。
        // 貼質感的時候它是遮罩、不是光量＝拉回到接近全滿，不然代碼那條光會被壓到只剩兩成
        fill('screen', lum(0.42 - 0.3 * d));
        if (mode.id === 'tex') fill('color-burn', lum(0.45));
        shine();
      } else if (b.media === 'paint') {
        const fineD = Math.max(1, Math.round(DPR)), bigD = Math.max(2, Math.round(b.depth * 2 * DPR));
        fill('source-over', '#fff'); draw(tx, liveA); grain(PAT.soft, 1.4, b.bite, b.grit); draw(t2, tmp);
        fill('source-over', '#000'); draw(tx, liveH); at(PAT.cloud, 0.5); fill('multiply', PAT.cloud, 0.5); at(PAT.soft, 1.3); fill('multiply', PAT.soft, 0.5);
        at(PAT.weave, 1); fill('multiply', PAT.weave, 0.25); draw(t4, tmp);
        emboss(t3, fill3, tmp4, fineD); draw(t3, tmp3, 'overlay'); fill3('source-over', lum(0.5), 1 - b.relief);
        emboss(tx, fill, tmp4, bigD); draw(tx, tmp, 'overlay'); fill('source-over', lum(0.5), 1 - b.form); draw(t4, tmp);
        fill('source-over', '#fff'); draw(tx, live); draw(tx, tmp4, 'hard-light'); draw(tx, tmp3, 'hard-light');
        if (b.gloss) { fill3('color-burn', lum(0.36)); draw(tx, tmp3, 'screen', b.gloss); }
        fill2('difference', '#fff'); draw(tx, tmp2, 'multiply'); emit();
      } else { fill('source-over', '#fff'); draw(tx, live); shine(); }   // 線、帶子、毛筆、白板筆：畫多深＝多亮
    })();
  }

  // ═══ WebGL：光跡（Buffer A，自己接自己）＋畫面 ═══
  const gl = view.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  if (!gl) { view.remove(); return; }   // 開不了 WebGL 2＝不放背景
  // 光跡要存小數（每一幀只淡一點點，8 位元存不住）
  const FLOAT = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  const VERT = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';
  // 光跡那支 shader 的 //@brush 換成這一段：筆刷在 2D 畫布上畫的那一塊（整支筆＝這一幀新畫上去的量；貼質感＝那支筆到目前畫出來的樣子，當遮罩）
  const BRUSH = `
// + BRUSH: the brush mark, drawn on a 2D canvas and uploaded.
// The canvas's first row is the top one, so y is flipped. Only uStrokeBox holds this frame's mark.
uniform sampler2D uStroke;
uniform vec4 uStrokeBox;
uniform float uBrush;

float brushLight(vec2 uv) {
    vec2 s = vec2(uv.x, 1.0 - uv.y);
    float inside =
        step(uStrokeBox.x, s.x) * step(s.x, uStrokeBox.z) *
        step(uStrokeBox.y, s.y) * step(s.y, uStrokeBox.w);
    return texture2D(uStroke, s).r * inside;
}

// Where the brush's tip passed this frame (green), spatter and dust included.
float brushCover(vec2 uv) {
    vec2 s = vec2(uv.x, 1.0 - uv.y);
    float inside =
        step(uStrokeBox.x, s.x) * step(s.x, uStrokeBox.z) *
        step(uStrokeBox.y, s.y) * step(s.y, uStrokeBox.w);
    return texture2D(uStroke, s).g * inside;
}`;
  // 畫面要用的「模糊過的光跡」：四分之一大小，每個點＝光跡 4×4 個點的平均（四個取樣點各自已經是 2×2 的平均）。
  // 左下角那一格不算：光跡的左下角那個點存的是游標位置，不是光
  const SOFT = `
precision highp float;
uniform vec2 uResolution;
uniform vec2 uTexel;
uniform sampler2D uBufferA;
void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    float s = texture2D(uBufferA, uv + vec2(-1.0, -1.0) * uTexel).r
            + texture2D(uBufferA, uv + vec2( 1.0, -1.0) * uTexel).r
            + texture2D(uBufferA, uv + vec2(-1.0,  1.0) * uTexel).r
            + texture2D(uBufferA, uv + vec2( 1.0,  1.0) * uTexel).r;
    if (gl_FragCoord.x < 1.0 && gl_FragCoord.y < 1.0) s = 0.0;
    gl_FragColor = vec4(s * 0.25, 0.0, 0.0, 1.0);
}`;
  function program(id, frag = SHADERS[id].trim().replace('//@brush', BRUSH)) {
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(id + '：' + gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, frag));
    gl.bindAttribLocation(prog, 0, 'p'); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(id + '：' + gl.getProgramInfoLog(prog));
    const at = {};
    return { prog, u: (name) => name in at ? at[name] : (at[name] = gl.getUniformLocation(prog, name)) };
  }
  const tex = (w, h, float) => {
    const t = gl.createTexture(), smooth = float ? gl.LINEAR : gl.NEAREST;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, float && FLOAT ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, float && FLOAT ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, smooth], [gl.TEXTURE_MAG_FILTER, smooth], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    return t;
  };
  // bufs＝光跡的兩張（這一幀讀一張、寫另一張）；haze＝模糊過的光跡（四分之一大小）；strokeTex＝筆刷這一幀畫的
  let bufs = [], haze = null, flip = 0, strokeTex = null, frames = 0;
  const canvasFor = (w, h) => { const t = tex(w, h, true), f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return { t, f, w, h }; };
  function wipe() {   // 光跡清空
    gl.clearColor(0, 0, 0, 0);
    for (const b of [...bufs, haze]) { gl.bindFramebuffer(gl.FRAMEBUFFER, b.f); gl.clear(gl.COLOR_BUFFER_BIT); }
    frames = 0;
  }
  function alloc(w, h) {
    for (const b of haze ? [...bufs, haze] : []) { gl.deleteTexture(b.t); gl.deleteFramebuffer(b.f); }
    if (strokeTex) gl.deleteTexture(strokeTex);
    bufs = [canvasFor(w, h), canvasFor(w, h)]; haze = canvasFor(Math.ceil(w / 4), Math.ceil(h / 4));
    strokeTex = tex(w, h, false);
    wipe();
  }

  // ═══ shader 只有一組（「光有 movement」那一份）；下面的開關是加在它上面的 ═══
  let IMG, BUF, BLUR;
  try { IMG = program('img-move'); BUF = program('buf-move'); BLUR = program('soft', SOFT); }
  catch (err) { console.warn('[bg] shader 編不過', err); view.remove(); return; }   // 編不過＝不放背景
  // 中空板的樣子（uLook）：代碼原樣＝看不見；另外兩種是在它算好的畫面上多疊幾項
  const LOOKS = [
    { id: 'none', u: 0, name: '看不見', say: '板條不畫出來，只改變光：光靠近板條的邊會變亮、沿著邊往上下散開。' },
    { id: 'edge', u: 1, name: '只有邊緣', say: '多畫出板條的邊線：平常很暗，光在附近的時候亮起來。' },
    { id: 'board', u: 2, name: '看得見', say: '板條之間的間隔裡是沒被擋住的光；板條上是隔著玻璃的光，光的周圍看得到板面、反光和邊線。' },
  ];
  // 筆刷怎麼用（uBrush）
  const MODES = [
    { id: 'line', u: 0, name: '原本的', say: '代碼自己的那條光，不加筆刷。' },
    { id: 'tex', u: 1, name: '貼質感', say: '光照代碼的走（粗細、濃淡的流動），筆只把自己的顆粒、刷毛貼在光上。' },
    { id: 'pen', u: 2, name: '整支筆', say: '整道光換成那支筆畫的：粗細、力度、飛白都是筆自己的。' },
  ];
  // 光的顏色（uTint／uPal）：user 2026-11-26——白天的版本像水墨，要一組比較輕、比較有活力、夜晚也能用的配色；「原來的光」要留著、不能動。
  // 一組五個顏色，鋪成整片慢慢漂的漸層（shader 的 paletteAt）。顏色的條件：白紙上夠鮮明、暗底上也亮＝中間偏亮、飽和的顏色，不用粉彩（白紙上會看不到）
  const SHARED = '五個淡色排成一條很長的漸層：同一個時間整個畫面只有相鄰的一兩個顏色，隨時間慢慢輪到下一個（大約 8 秒一個顏色）。最濃就是那個顏色本身：夜晚不燒成白，白天不變黑。深淺＝顏色離白多遠，越小越淡。';
  const PALS = [
    { id: 'orig', name: '原來的光', say: '代碼自己的光，沒有動。夜晚是藍白的光；白天是整張反過來，藍黑的墨。' },
    // user 2026-11-26：先給的三組（糖果、晨光、海風：高飽和）「都太像蘋果了，需要一個飽和度沒那麽高的，更 pastel 一點的」→ 換掉。
    // 粉彩＝乾淨、偏亮；霧＝再灰一點、深一點（白紙上比較看得到）
    // 同一天：「顔色應該是淡淡的那種，不是渾濁的」→ 霧（摻灰的）拿掉；粉彩改成乾淨的淡色＝純色只加白、不加灰（最亮的那一個色頻是滿的）、
    // 照色相的順序排（相鄰兩色混起來不經過灰）。渾濁的其他來源在 shader 的 + COLOR 那幾段
    { id: 'pastel', name: '粉彩', colors: ['#ffbdcd', '#ffd4b8', '#c7ffe1', '#bcdcff', '#d9c4ff'], say: SHARED },   // 綠比別的顏色搶眼＝薄荷再淡一點
  ];
  for (const p of PALS) if (p.colors) p.flat = new Float32Array(p.colors.flatMap((h) => hex2rgb(h).map((v) => v / 255)));
  // bend（uBend）＝錯位：每塊板條把 (1 + bend) 倍自己寬的畫面擠進來，光在板條的邊上就接不起來。代碼原樣是 0——它的位移在邊上剛好是 0，線是連的
  // 網站用的設定（user 2026-11-26：「選用看得見的版本，濃度是70%，深淺100%…筆刷用整隻筆，其他的參數保留預設，錯位改成1.5」）：
  // 中空板看得見、整支筆（預設那支＝炭筆）、錯位 1.5；濃度 70% 是畫布的 opacity（bg.css）；配色照白天／夜晚換（showMode）
  let look = LOOKS[2], mode = MODES[2], bend = 1.5, pal = PALS[1];
  let depth = 1;   // 配色的深淺（uDepth）：1＝色票上的樣子

  // ═══ 每一幀 ═══
  const FADE_MS = 120, FADE = 0.25, Q = 64;   // live 每隔多久忘一次／一次忘幾成；傳給 shader 的那一塊對齊幾 px 的格子（大小才不會每幀都不一樣）
  const pend = [];                      // 這一幀游標走過的點
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;   // 減少動態：時間不走（板條不游移、風不變），游標畫的照常
  let mouse = { x: 0, y: 0 }, time = 0, last = 0, raf = 0, active = 0, fadedAt = 0, drewAt = 0, stained = false;   // stained＝live 上還有東西
  let demo = null;                      // 試驗頁一打開會自己畫一筆；網站不要

  // live 慢慢忘：筆頭蓋上去的量跟著時間淡掉（約半秒剩兩成）。光自己會消失——蓋過的量不忘的話，光淡了之後再畫過同一個地方不會有新的光
  // （繞圈壓到上一圈會缺一塊、在同一個地方來回畫，蓋滿之後就越畫越暗）。一次淡一大步：8 位元一點一點淡會卡在最後幾階淡不完；
  // 3 秒沒畫＝整張清掉。厚塗的 live 上是顏料的顏色（不是量）＝留著，淡的是「沾到多少」和厚度
  function forget(now, wipeAll) {
    if (!wipeAll && (!stained || now - fadedAt < FADE_MS)) return;
    fadedAt = now;
    const all = [0, 0, view.width, view.height], gone = wipeAll || now - drewAt > 3000;
    for (const c of [lx, hx, mx]) {
      if (c === lx && !gone && BY[cur]?.media === 'paint') continue;
      dev(c, all, () => { c.globalCompositeOperation = 'destination-out'; c.globalAlpha = gone ? 1 : FADE; c.fillStyle = '#000'; c.fillRect(...all); });
    }
    if (gone) stained = false;
  }

  // 這一幀游標走過的那一段用選的筆畫上去，回傳畫在哪一塊（uStrokeBox；沒畫＝null）。傳給 shader 的那一塊＝那支筆到目前畫出來的樣子：
  // 貼質感＝shader 拿它乘在代碼那條光上；
  // 整支筆＝shader 把動的那層光「補到」它這麼多（只補筆頭這一幀掃過的範圍＝綠色那一格）。補到、不是加上去：筆頭蓋過的量會慢慢忘（forget），
  // 筆頭還在附近時每忘一次又被蓋回來——用「這一幀比上一幀多了多少」去加的話，同一個地方會被加好幾次（水彩一圈一圈、慢慢畫的地方特別深）
  function draw(now) {
    if (S && (now - S.movedAt > 400 || S.run > (S.b.reach || Infinity))) S = null;   // 停一下再走、顏料刷完了＝重新沾一次（同舊試驗場）
    if (!pend.length) return null;
    const pts = pend.splice(0), fresh = !S, tex = mode.id === 'tex';
    if (fresh) open(pts[0]);
    const far = S.b.media === 'wash' ? S.cfg.size * 0.5 + 16 : 0, m = Math.max(40, S.cfg.size * 2.2) + far * 2, from = S.last;   // m＝這支筆碰得到多遠
    let x0 = from.x, y0 = from.y, x1 = x0, y1 = y0;
    for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    const cw = view.width, ch = view.height, grid = (v, round, max) => clamp(round(v * DPR / Q) * Q, 0, max);
    const X = grid(x0 - m, Math.floor, cw), Y = grid(y0 - m, Math.floor, ch), box = [X, Y, grid(x1 + m, Math.ceil, cw) - X, grid(y1 + m, Math.ceil, ch) - Y];
    const seen = box[2] > 0 && box[3] > 0;
    if (fresh) S.eng.begin?.(S);
    for (const p of pts) {
      if (tex) p.t = S.last.t + Math.hypot(p.x - S.last.x, p.y - S.last.y) / 0.4;   // 貼質感：一律當成每秒 400px 在畫——飛白、墨色不跟著快慢變
      extend(p);
    }
    drewAt = now; stained = true;
    if (!seen) return null;
    render(box);
    // 整支筆：筆畫出來的樣子只留在紅；綠＝筆頭這一幀掃過的範圍——沿著這一幀走的路描一條比筆頭寬的線（濺出去的點、噴漆的霧、
    // 掉的粉屑都要包進來），描三次、一次比一次窄＝邊是軟的
    if (!tex) dev(ox, box, () => {
      ox.globalAlpha = 1; ox.globalCompositeOperation = 'multiply'; ox.fillStyle = '#f00'; ox.fillRect(box[0], box[1], box[2], box[3]);
      const tip = (S.span || S.cfg.size) * (S.eng === spray ? 2.5 : S.b.dust ? 2.3 : 1.4);
      ox.setTransform(DPR, 0, 0, DPR, 0, 0); ox.globalCompositeOperation = 'lighter'; ox.strokeStyle = '#0f0'; ox.lineCap = ox.lineJoin = 'round';
      ox.beginPath(); ox.moveTo(from.x, from.y); for (const p of pts) ox.lineTo(p.x, p.y); ox.lineTo(S.last.x + 0.01, S.last.y);   // ＋0.01：長度 0 的線畫不出來
      for (const [k, a] of [[1.25, 0.34], [1.05, 0.33], [0.85, 0.33]]) { ox.lineWidth = tip * k; ox.globalAlpha = a; ox.stroke(); }
    });
    if (crop.width !== box[2] || crop.height !== box[3]) { crop.width = box[2]; crop.height = box[3]; }
    cx.globalCompositeOperation = 'copy'; cx.drawImage(out, X, Y, box[2], box[3], 0, 0, box[2], box[3]);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, strokeTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, X, Y, gl.RGBA, gl.UNSIGNED_BYTE, crop);
    return box;
  }

  // 畫面跟不上就降內部解析度（畫面每個點要讀幾百次光跡，內顯會吃力）：一秒半裡大半的幀都慢＝降一級
  const SCALES = [Math.min(1.5, devicePixelRatio || 1), 1, 0.75, 0.5].filter((s, i, a) => !i || s < a[0]);
  let level = 0, counted = 0, slow = 0;

  function frame(ts) {
    raf = 0;
    if (!bufs.length) return;
    const raw = last ? ts - last : 16, dt = Math.min(raw, 50) / 1000, now = performance.now(); last = ts;
    if (!still) time += dt;
    if (demo) {
      demo.t0 ??= ts; const u = (ts - demo.t0) / 1600;
      if (u >= 1) { demo = null; leave(); } else point(W * (0.1 + 0.8 * u), H * (0.5 - 0.24 * Math.sin(u * 6.283)), ts);
    }
    let box = null;
    if (mode.id === 'line') pend.length = 0; else { forget(now); box = draw(now); }
    const w = view.width, h = view.height, B = BUF, I = IMG;
    gl.viewport(0, 0, w, h);
    // 光跡：讀上一幀的、加上這一幀新的光
    gl.bindFramebuffer(gl.FRAMEBUFFER, bufs[1 - flip].f); gl.useProgram(B.prog);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, bufs[flip].t); gl.uniform1i(B.u('uChannel0'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, strokeTex); gl.uniform1i(B.u('uStroke'), 1);
    gl.uniform2f(B.u('uResolution'), w, h); gl.uniform3f(B.u('uMouse'), mouse.x, mouse.y, 0);
    gl.uniform1f(B.u('uDeltaTime'), dt); gl.uniform1f(B.u('uTime'), time); gl.uniform1i(B.u('uFrameCount'), frames);
    gl.uniform1f(B.u('uBrush'), mode.u); gl.uniform1f(B.u('uDrag'), mode.id === 'line' ? 0 : cfgs[cur].drag);
    if (box) gl.uniform4f(B.u('uStrokeBox'), box[0] / w, box[1] / h, (box[0] + box[2]) / w, (box[1] + box[3]) / h); else gl.uniform4f(B.u('uStrokeBox'), 1, 1, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    flip = 1 - flip;
    // 模糊過的光跡（畫面算光暈用）
    gl.bindFramebuffer(gl.FRAMEBUFFER, haze.f); gl.viewport(0, 0, haze.w, haze.h); gl.useProgram(BLUR.prog);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, bufs[flip].t); gl.uniform1i(BLUR.u('uBufferA'), 0);
    gl.uniform2f(BLUR.u('uResolution'), haze.w, haze.h); gl.uniform2f(BLUR.u('uTexel'), 1 / w, 1 / h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 畫面
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h); gl.useProgram(I.prog);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, haze.t); gl.uniform1i(I.u('uSoft'), 2);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, bufs[flip].t); gl.uniform1i(I.u('uBufferA'), 0); gl.uniform1i(I.u('uChannel0'), 0);
    gl.uniform2f(I.u('uResolution'), w, h); gl.uniform1f(I.u('uTime'), time); gl.uniform1f(I.u('uLook'), look.u); gl.uniform1f(I.u('uBend'), bend);
    gl.uniform1f(I.u('uTint'), pal.flat ? 1 : 0); gl.uniform1f(I.u('uDay'), pal.flat && isDay() ? 1 : 0); if (pal.flat) gl.uniform3fv(I.u('uPal[0]'), pal.flat); gl.uniform1f(I.u('uDepth'), depth);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    frames++;
    if (raw < 250) {   // 更久的＝分頁切走又回來，不算
      if (raw > 30) slow++;
      if (++counted >= 90) { if (slow > 60 && level < SCALES.length - 1) { level++; fit(true); } counted = slow = 0; }
    }
    // 光都淡完了、畫面不會再變就停（畫出邊線的那兩種樣子，邊線一直在動＝不停）；游標一動再開始
    if (look.u && !still || now - active < 9000) raf = requestAnimationFrame(frame); else last = 0;
  }
  const wake = () => { active = performance.now(); raf ||= requestAnimationFrame(frame); };

  function fit(force) {
    const r = view.getBoundingClientRect(), w = Math.round(r.width), h = Math.round(r.height);
    if (!w || !h || (force !== true && w === W && h === H)) return;
    W = w; H = h; DPR = SCALES[level]; S = null; pend.length = 0; stained = false;
    const cw = Math.round(w * DPR), ch = Math.round(h * DPR);
    for (const c of [view, live, liveH, liveA, tmp, tmp2, tmp3, tmp4, out, prev]) { c.width = cw; c.height = ch; }
    for (const c of [pa, pb]) { c.width = Math.ceil(cw / 2) + 2; c.height = Math.ceil(ch / 2) + 2; }
    home(lx, hx, mx);
    alloc(cw, ch);
    say(`畫布 ${cw} × ${ch}` + (level ? '（畫面跟不上，內部解析度降過）' : '') + (FLOAT ? '' : '・這台存不了小數的光跡，光淡掉的樣子會不準'));
    wake();
  }

  // ═══ 游標 ═══
  // 游標到 (x, y)（畫布上的 CSS px）：筆刷用的點排進這一幀、shader 用的 uMouse 是左下角起算的像素
  function point(x, y, t, pen = 1) { pend.push({ x, y, pen, t }); mouse = { x: x * DPR, y: (H - y) * DPR }; active = performance.now(); }
  function leave() { mouse = { x: 0, y: 0 }; S = null; pend.length = 0; }
  // 網站：聽整頁（內容疊在畫布上面、畫布不吃指標）。觸控不畫（沒有游標）；筆尖碰著螢幕＝也是觸控（懸空的筆照畫）；
  // 放大的 dialog 開著不畫新的（選單開著照畫，user 2026-11-22）——同原本的炭筆背景
  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || (e.pointerType === 'pen' && e.buttons) || document.querySelector('#figure-dialog[open]')) { if (S) leave(); return; }
    for (const ev of e.getCoalescedEvents?.().length ? e.getCoalescedEvents() : [e]) point(ev.clientX, ev.clientY, ev.timeStamp, ev.pointerType === 'pen' ? clamp(ev.pressure * 1.6, 0.05, 1.3) : 1);
    wake();
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', leave);

  // 白天／夜晚＝網站的 <html data-theme="dark">（預設淺色、不跟系統設定）。配色（user 2026-11-26：「如果是切換成黑色模式的話，會隨機抽到原來的光或者是粉彩，
  // 但白天只有粉彩」）：白天＝粉彩；每次換成夜晚（含開頁就是夜晚）抽一次＝原來的光或粉彩。「原來的光」的白天是試驗頁套在畫布上的濾鏡——網站白天不會用到它
  const root = document.documentElement, isDay = () => root.dataset.theme !== 'dark';
  // 只有 user 切 mode 才重抽（user 2026-11-26：「只有切換mode的時候才會隨機分配顔色」）：看存的那個（chrome.js toggleTheme 先寫 localStorage 才換 data-theme）；
  // 作品頁、放影片關燈這種頁面自己變暗的＝沿用上次抽到的夜晚配色，不重抽
  let night = null, saved = null, nightPal;
  const showMode = () => {
    let s = ''; try { s = localStorage.getItem('scaid:theme') || ''; } catch {}
    if (s !== saved) { saved = s; nightPal = PALS[Math.random() < 0.5 ? 0 : 1]; }
    const n = !isDay(); if (n === night) return; night = n; pal = n ? nightPal : PALS[1]; wake();
  };
  new MutationObserver(showMode).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  showMode();
  // 換頁、每 15 秒＝隨機換一支筆（user 2026-11-26：「背景換頁面的時候，會隨機切換不同的筆刷」「隔大概15s就換下一個brush」）：
  // 不抽到同一支、不抽清單上不列的（OFF）；開站照預設的炭筆；換頁從頭計時。網站自己的介面（同 showMode），重搬引擎時要留著
  // 粗細（user 同一天：「brush的粗細也幫我做random，在一個range裏面」）＝那支筆設定的粗細 × SIZE 之間（等比地抽、不超過那支筆的 max），換筆時抽
  // 水彩、噴漆最多 1.2 倍（Edge 比過 1／1.2／1.6）：水彩的雲紋跟著粗細放大＝邊上的鋸齒變大顆；噴漆 1.6 倍糊成一大團、霧點看不到。
  // 其他筆放大不會更顆粒：紙紋是固定的大小、刷毛跟著變多根（炭筆、蠟筆那顆印放大只是軟一點）
  const PENS = BR.map((b) => b.id).filter((id) => !OFF.has(id)), PEN_MS = 15000, SIZE = [0.5, 1.6], TOP = { watercolor: 1.2, spray: 1.2 };
  const BASE = Object.fromEntries(PENS.map((id) => [id, cfgs[id].size]));
  let penTimer = setTimeout(nextPen, PEN_MS);
  function nextPen(cut) {
    const pool = PENS.filter((id) => id !== cur); cur = pool[(Math.random() * pool.length) | 0];
    cfgs[cur].size = Math.min(BY[cur].max, BASE[cur] * SIZE[0] * ((TOP[cur] ?? SIZE[1]) / SIZE[0]) ** Math.random());
    if (cut) S = null;   // 換頁：下一筆就用新的。定時換的不切斷正在畫的那一筆＝停一下、重新沾的時候才換（draw 開頭）
    clearTimeout(penTimer); penTimer = setTimeout(nextPen, PEN_MS);
  }
  new MutationObserver(([m]) => { if (m.oldValue !== document.body.dataset.page) nextPen(true); })   // 同一頁只換 hash＝不算
    .observe(document.body, { attributes: true, attributeFilter: ['data-page'], attributeOldValue: true });
  new ResizeObserver(() => fit()).observe(view);
  fit();
}
