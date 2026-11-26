/**
 * 作品頁（user 2026-11-23；版型 css/components/works.css）：像電影院——整頁一律深色（chrome.js syncPageTheme）、沒有右圖、內容置中。
 * 兩種排法（底列中間那組鈕切，header.html .bar-works；切換＝作品淡出、換、淡入）：
 *   放映（slideshow）：一次一個在正中，前後各一個縮小、躲在後面從兩邊露出來；點兩邊那個／方向鍵（←→↑↓）換，環狀。
 *     正中是影片＝點了就地播（YouTube 播放器自己的鈕可以全螢幕）；圖片不放大
 *   總覽（bento）：全部照比例排成幾欄、照閱讀順序擺（layoutBento；user 2026-11-23：兩種排法同一個順序＝放映的第 8 個就是總覽的第 8 個，
 *     從放映切過來＝剛剛那一個捲到畫面中間）；點一個＝就地開 lightbox（chrome.js 的放大 dialog，一組＝總覽全部，可以左右切；影片＝YouTube 播放器）。
 *     放映時只有正中那個出 play（works.css）
 * 放映時每個作品照自己的比例與大小、只限最大框，總覽撐滿一欄（works.css）；每次進來順序都打亂（兩種排法共用這一次的順序）。
 * 資料：後台單例 works 的 YouTube 播放清單（可以好幾個；用 Data API 拆成一支一支，照 SCCD about-data-loader）
 * ＋「圖片」欄位的圖（多圖，user 2026-11-24；原本是檔案庫「作品」資料夾裡的圖）。HTML 不放示意（user 2026-11-26：不要假資料）：
 * 都沒有（後台抓不到又沒有上次抓到的、還沒填）＝沒有作品。原本的 TEST_JSON（讀本機的測試資料，2026-11-23 用過）同一天拿掉。
 */
import { assetUrl, cmsGet, YT_API_KEY } from '../../config/api.js';
import { escapeHtml as esc } from '../ui/escape-html.js';
import { DUR } from '../ui/motion.js';
import { registerPageCleanup } from '../ui/page-cleanup.js';
import { prefersReducedMotion } from '../ui/reduce-motion.js';
import { openFigure, youtubeFrame } from '../ui/chrome.js';
import { setLabel } from '../ui/lang.js';

// 放映自動換下一個的間隔（user 2026-11-25：「作品那一頁的slideshow可以設定每4s換下一個嗎」；同關於的段落輪播 slideshow.js）
const AUTOPLAY_MS = 4000;
// 縮圖的黑邊：一列（行）平均比這個暗（0–255）＝黑邊（JPEG 的雜訊讓黑邊不是純 0）
const DARK = 24;

/** 縮圖本身燒進去的黑邊（user 2026-11-25：「拿thumbnail的時候，去掉thumbnail黑邊」「是這個圖片本身的黑邊喔」）：寬銀幕的片子做成 16:9 帶黑邊上傳＝
 *  YouTube 回的比例是 16:9、縮圖也帶著黑邊；4:3 的縮圖（sddefault／hqdefault）上下、直的影片左右也是。縮圖縮小畫進畫布（i.ytimg.com 有給 CORS＝讀得到像素），
 *  從上下（左右）往內數整列（行）都快全黑的；兩邊差不多寬才算黑邊（片子都置中；只有一邊暗的夜景不裁），再多切一列蓋掉交界那條糊的。
 *  左右裁不裁得掉還要靠 works.css `.work img` 的 max-width: none（user 2026-11-25：「這個裁掉黑邊也要加上左右的設定」——量得到、但圖放大的寬被卡回去）。
 *  回傳黑邊裡面那塊佔整張的比例 [左, 上, 寬, 高]；沒有黑邊、讀不到＝null @param {HTMLImageElement} img @returns {number[] | null} */
function bars(img) {
  const cw = Math.min(320, img.naturalWidth), ch = Math.round(cw * img.naturalHeight / (img.naturalWidth || 1));
  if (!cw || !ch) return null;
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const g = c.getContext('2d', { willReadFrequently: true });
  /** @type {Uint8ClampedArray} */
  let d;
  try { g?.drawImage(img, 0, 0, cw, ch); d = /** @type {CanvasRenderingContext2D} */ (g).getImageData(0, 0, cw, ch).data; } catch { return null; }   // 沒 CORS＝畫布被污染、讀不到
  /** 從第 from 個像素起、每隔 step 個、共 n 個的平均亮度（0–255） @param {number} from @param {number} n @param {number} step */
  const lum = (from, n, step) => { let s = 0; for (let k = 0; k < n; k++) { const i = (from + k * step) * 4; s += d[i] + d[i + 1] + d[i + 2]; } return s / n / 3; };
  const dark = (/** @type {number} */ from, /** @type {number} */ n, /** @type {number} */ step) => lum(from, n, step) < DARK;
  const sym = (/** @type {number} */ a, /** @type {number} */ z, /** @type {number} */ n) => a > 0 && z > 0 && Math.abs(a - z) <= Math.max(2, n * 0.02);
  let t = 0, b = ch, l = 0, r = cw;
  while (t < b && dark(t * cw, cw, 1)) t++;
  while (b > t && dark((b - 1) * cw, cw, 1)) b--;
  // 黑邊裡有字幕（user 2026-11-25 的截圖：下面那條黑邊裡一行白字）：那幾列的平均被字拉亮＝那一邊數到一半就停、上下不一樣厚＝原本整個不裁。
  // 另一邊是乾淨的黑邊（T 列，而且邊界是硬的＝裡面那一列一下子亮 40 以上——暗場是慢慢亮起來的），這一邊那 T 列每一列都有六成以上的點是暗的
  // ＝當成一樣厚的黑邊（字幕跟著裁掉）。拿真的清單 241 支試過：只多裁到有字幕的那一支
  if (t && b < ch && !sym(t, ch - b, ch)) {
    const T = Math.max(t, ch - b), top = t === T;   // top＝上面那條是乾淨的
    const edge = top ? lum(T * cw, cw, 1) - lum((T - 1) * cw, cw, 1) : lum((ch - T - 1) * cw, cw, 1) - lum((ch - T) * cw, cw, 1);
    const mostly = (/** @type {number} */ from) => { let n = 0; for (let k = 0; k < cw; k++) { const i = (from + k) * 4; if (d[i] + d[i + 1] + d[i + 2] < 40 * 3) n++; } return n >= cw * 0.6; };
    if (edge >= 40 && T * 2 < ch * 0.75 && Array.from({ length: T }, (_, k) => (top ? ch - 1 - k : k) * cw).every(mostly)) { t = T; b = ch - T; }
  }
  while (l < r && dark(l + t * cw, b - t, cw)) l++;   // 行只看上下黑邊之間那段
  while (r > l && dark(r - 1 + t * cw, b - t, cw)) r--;
  const [y0, y1] = sym(t, ch - b, ch) ? [t + 1, b - 1] : [0, ch], [x0, x1] = sym(l, cw - r, cw) ? [l + 1, r - 1] : [0, cw];
  if ((!x0 && !y0) || x1 - x0 < cw / 4 || y1 - y0 < ch / 4) return null;   // 沒黑邊；剩不到四分之一＝整張很暗、不是黑邊
  return [x0 / cw, y0 / ch, (x1 - x0) / cw, (y1 - y0) / ch];
}

/** 播放清單網址 → 清單 id（?list=） @param {unknown} url */
const listId = (url) => String(url || '').match(/[?&]list=([\w-]+)/)?.[1];

/** @typedef {{ kind: 'image' | 'video', src: string, w?: number, h?: number, title: string, vid?: string }} Work */

/** YouTube 播放清單 → 一支一支影片（一頁 50 支、跟 nextPageToken 抓完，最多 5 頁；私人／刪掉的沒有縮圖＝濾掉）。
 *  同一個分頁記住抓過的（sessionStorage，省 quota） @param {string} id @returns {Promise<Work[]>} */
async function playlist(id) {
  const key = `scaid:yt2:${id}`;   // yt2：多了影片真正的比例（舊的那份全是 16:9）
  try { const s = sessionStorage.getItem(key); if (s) return JSON.parse(s); } catch {}
  try {
    /** @type {any[]} */
    const items = [];
    let token = '';
    for (let i = 0; i < 5; i++) {
      const r = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${encodeURIComponent(id)}&key=${YT_API_KEY}${token ? `&pageToken=${token}` : ''}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      items.push(...(d.items || []));
      if (!(token = d.nextPageToken)) break;
    }
    // 影片真正的比例（寬銀幕、4:3…；user 2026-11-24：總覽要 Pinterest 那種錯落——原本一律當 16:9，排出來像格子）：
    // videos.list 的 player 帶 maxWidth 才回 embedWidth／embedHeight，照影片本身的比例。縮圖是 16:9 帶黑邊，works.css 用 cover 裁掉
    // （黑邊燒在影片裡的，這裡回的也是 16:9＝縮圖載好再量，bars()）。抓不到＝當 16:9
    const ids = items.map(it => it.snippet?.resourceId?.videoId).filter(Boolean);
    /** @type {Record<string, number[]>} */
    const size = {};
    for (let i = 0; i < ids.length; i += 50) {
      const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=player&maxWidth=1000&id=${ids.slice(i, i + 50).join(',')}&key=${YT_API_KEY}`).catch(() => null);
      if (r?.ok) for (const v of (await r.json()).items || []) size[v.id] = [v.player?.embedWidth, v.player?.embedHeight];
    }
    /** @type {Work[]} */
    const vids = items.filter(it => it.snippet?.resourceId?.videoId && it.snippet?.thumbnails?.medium).map(it => {
      const t = it.snippet.thumbnails, best = t.maxres || t.standard || t.high || t.medium, vid = it.snippet.resourceId.videoId, [w, h] = size[vid] || [];
      return { kind: 'video', vid, src: best.url, w: +w || 1600, h: +h || 900, title: it.snippet.title || '' };
    });
    try { sessionStorage.setItem(key, JSON.stringify(vids)); } catch {}
    return vids;
  } catch (e) {
    // 403 多半＝這個網域不在 key 的白名單（本機要用 http://localhost:PORT 開，127.0.0.1 會被擋）
    console.warn('[works] YouTube 播放清單抓不到：', id, e instanceof Error ? e.message : e);
    return [];
  }
}

/** 後台：單例 works 的播放清單＋圖片欄位（files M2M，一列 { directus_files_id }；只收圖片檔、檔案刪掉了＝null 不出）；兩個都沒有＝null @returns {Promise<Work[] | null>} */
async function fromCms() {
  const f = 'images.directus_files_id';
  const page = await cmsGet(`works?fields=playlists,${f}.id,${f}.type,${f}.width,${f}.height,${f}.description`).catch(() => null);
  const ids = (Array.isArray(page?.playlists) ? page.playlists : []).map(p => listId(p?.url)).filter(Boolean);
  const videos = (await Promise.all([...new Set(ids)].map(playlist))).flat();
  /** @type {Work[]} */
  const images = (Array.isArray(page?.images) ? page.images : []).map(j => j?.directus_files_id).filter(x => x?.id && /^image\//.test(x.type || ''))
    .map(x => ({ kind: 'image', src: assetUrl(x), w: x.width, h: x.height, title: x.description || '' }));
  return images.length + videos.length ? [...images, ...videos] : null;
}

/** 一個作品（兩種排法同一份標記，works.css 照排法、data-pos 擺）：大小＝--w／--h（沒寫寬高的檔當 16:9）；點的範圍＝蓋在上面的那顆鈕 @param {Work} it */
const tile = (it) => `<div class="work" data-kind="${it.kind}"${it.vid ? ` data-vid="${esc(it.vid)}"` : ''} style="--w:${+it.w || 1600};--h:${+it.h || 900}">`
  + `<img src="${esc(it.src)}" alt="${esc(it.title)}"${it.w && it.h ? ` width="${it.w}" height="${it.h}"` : ''}${it.kind === 'video' ? ' crossorigin="anonymous"' : ''} loading="lazy">`   // 影片的縮圖要讀像素量黑邊（bars）
  + `<button type="button" class="work-hit">${it.kind === 'video' ? '<span class="icon icon-play" aria-hidden="true"></span>' : ''}</button></div>`;

/** 打亂（Fisher–Yates；user：每次進來都不一樣） @template T @param {T[]} a */
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/** main.js initPageModules 進作品頁叫；回傳＝後台換好（router 等它才淡入，最多 1.5 秒） */
export function initWorks() {
  const root = /** @type {HTMLElement | null} */ (document.querySelector('#page-content .works'));
  const list = /** @type {HTMLElement | null | undefined} */ (root?.querySelector('.works-items'));
  if (!root || !list) return Promise.resolve();
  const works = () => /** @type {HTMLElement[]} */ ([...list.querySelectorAll('.work')]);
  let active = 0;

  /** 總覽＝照閱讀順序的 masonry（user 2026-11-23：放映的第 8 個＝總覽的第 8 個）：一個一個由左到右放進最矮的那一欄。
   *  欄數、欄距照 CSS（works.css --cols、column-gap）；每個都撐滿一欄寬（user 2026-11-23：小圖也拉滿格子，原本照原本大小置中）；清單的高＝最高那一欄 */
  const layoutBento = () => {
    if (root.dataset.mode !== 'bento') { list.style.height = ''; return; }
    const cs = getComputedStyle(list), cols = Math.max(1, parseInt(cs.getPropertyValue('--cols'), 10) || 2), gap = parseFloat(cs.columnGap) || 0;
    // 寬用算出來的（帶小數）：clientWidth 捨成整數，欄寬不是整數時（手機的 rail＝半欄）作品會比欄寬多半 px
    const colW = ((parseFloat(cs.width) || list.clientWidth) - gap * (cols - 1)) / cols, tops = Array(cols).fill(0);
    for (const w of works()) {
      const W = Number(w.style.getPropertyValue('--w')) || 1600, H = Number(w.style.getPropertyValue('--h')) || 900, c = tops.indexOf(Math.min(...tops));
      w.style.setProperty('--x', `${c * (colW + gap)}px`);
      w.style.setProperty('--y', `${tops[c]}px`);
      tops[c] += colW * H / W + gap;
    }
    list.style.setProperty('--bw', `${colW}px`);
    list.style.height = `${Math.max(0, Math.max(...tops) - gap)}px`;
  };
  /** 放映＝一列（user 2026-11-24：「左右都幫我改成一樣大」）：全部一樣高（user 2026-11-25）＝16:9 撐滿最寬（PC 內文 6 欄、手機舞台的 72%）時的高、最高到舞台高，
   *  寬照比例（同 works.css 的 width；寬銀幕的比最寬還寬），
   *  從正中往兩邊、隔一個 gutter（column-gap）接下去：--x＝中線離舞台正中多遠。第一次擺、繞到另一頭的（一次跳超過一格）直接到位、不滑過整列 */
  const relOf = new WeakMap();
  const layoutRow = () => {
    if (root.dataset.mode !== 'slideshow') return;
    const ws = works(), n = ws.length, half = Math.floor(n / 2);
    const H = list.clientHeight, gap = parseFloat(getComputedStyle(list).columnGap) || 0;
    // 最寬多寬（同 works.css --work-max）：PC＝內文 6 欄（.works 本身的寬；舞台拉到整個畫面寬，user 2026-11-24）、手機＝舞台的 72%
    const maxW = matchMedia('(min-width: 768px)').matches ? root.clientWidth : 0.72 * list.clientWidth;
    const rowH = Math.min(H, maxW * 9 / 16);
    const size = (/** @type {HTMLElement} */ w) => rowH * (Number(w.style.getPropertyValue('--w')) || 1600) / (Number(w.style.getPropertyValue('--h')) || 900);
    const at = new Map(), jump = [];
    ws.forEach((w, i) => {
      const rel = (((i - active) % n) + n + half) % n - half, was = relOf.get(w);
      at.set(rel, w);
      if (was === undefined || Math.abs(rel - was) > 1) jump.push(w);
      relOf.set(w, rel);
    });
    jump.forEach(w => w.classList.add('is-jump'));
    at.get(0)?.style.setProperty('--x', '0px');
    for (const dir of [1, -1]) {
      let edge = at.has(0) ? size(at.get(0)) / 2 : 0;
      for (let r = dir; at.has(r); r += dir) { const w = at.get(r), bw = size(w); w.style.setProperty('--x', `${dir * (edge + gap + bw / 2)}px`); edge += gap + bw; }
    }
    if (jump.length) { void list.offsetWidth; requestAnimationFrame(() => jump.forEach(w => w.classList.remove('is-jump'))); }
  };
  // 寬變了才重排（總覽的高是自己設的，不看；放映的大小跟著舞台的高，要看）；下一幀才排：在 ResizeObserver 的 callback 裡改它的高，瀏覽器會報 ResizeObserver loop
  let listW = 0, listH = 0;
  const resized = new ResizeObserver(() => {
    const w = list.clientWidth, h = root.dataset.mode === 'slideshow' ? list.clientHeight : listH;
    if (w !== listW || h !== listH) { listW = w; listH = h; requestAnimationFrame(() => { layoutBento(); layoutRow(); }); }
  });
  resized.observe(list);
  registerPageCleanup(() => resized.disconnect());

  /** 誰在正中、兩邊、藏著（data-pos -2…2，環狀，同 slideshow.js）；鈕能不能點、報讀名稱跟著排法與位置；總覽重排 */
  const render = () => {
    const ws = works(), n = ws.length, half = Math.floor(n / 2), bento = root.dataset.mode === 'bento';
    ws.forEach((w, i) => {
      const pos = Math.max(-2, Math.min(2, (((i - active) % n) + n + half) % n - half));
      const hit = /** @type {HTMLButtonElement} */ (w.querySelector('.work-hit')), title = w.querySelector('img')?.alt || '';
      const label = bento ? (w.dataset.kind === 'video' ? '播放' : '放大') : pos === 0 ? (w.dataset.kind === 'video' ? '播放' : '') : pos === -1 ? '上一個' : pos === 1 ? '下一個' : '';
      w.dataset.pos = String(pos);
      hit.disabled = !label;
      const en = { 播放: 'Play', 放大: 'Enlarge', 上一個: 'Previous', 下一個: 'Next' }[label] || '';
      setLabel(hit, label && title ? `${label}：${title}` : label, title ? `${en}: ${title}` : en);   // 報讀名稱跟語言走（user 2026-11-25）
      if (!bento && Math.abs(pos) > 1) w.setAttribute('aria-hidden', 'true'); else w.removeAttribute('aria-hidden');   // 放映時藏著的不給讀
    });
    // 底列那顆鈕（一顆、點了切換；user 2026-11-25）：換成「要切過去的那一種」＝圖示、名字跟著換（works.css）
    document.querySelectorAll('.bar-works [data-works-mode]').forEach(b => { /** @type {HTMLElement} */ (b).dataset.worksMode = bento ? 'slideshow' : 'bento'; });
    // 放映時舞台兩側的模糊那一層（同關於的段落輪播 slideshow.js；樣子 page.css「輪播兩側的淡出＋模糊」）：內容整批換掉（打亂、後台）之後都會叫 render → 這裡補回來
    if (!list.querySelector(':scope > .slide-blur')) list.insertAdjacentHTML('beforeend', '<div class="slide-blur" aria-hidden="true"><i></i></div>');
    layoutBento();
    layoutRow();
  };
  const stopVideo = () => list.querySelectorAll('.work-frame').forEach(f => f.remove());
  /** @param {number} step */
  const go = (step) => { const n = works().length; if (n < 2) return; stopVideo(); active = (active + step + n) % n; render(); restart(); };
  /** 正中的影片就地播：YouTube 的 embed（nocookie）、自動播、可以全螢幕 @param {HTMLElement} w */
  const play = (w) => {
    stopVideo();
    const f = youtubeFrame(w.dataset.vid || '', w.querySelector('img')?.alt || 'YouTube');
    f.className = 'work-frame';
    w.append(f);
  };
  /** 總覽點了＝就地開 lightbox（user 2026-11-23；原本切到放映）：chrome.js 的放大 dialog，一組＝總覽全部、照排的順序，可以左右切；
   *  圖＝那張圖、影片＝YouTube 播放器（切到那一個才載、切走就停）。看到哪一個就記成 active＝之後切到放映從它開始；
   *  切一個，背景的總覽就把那一個捲到畫面中間（user 2026-11-24：「離開時應該要讓背景的 grid 對齊到之前查看的那個作品」；背景這時是糊的，關掉就對好了）
   *  @param {HTMLElement} w @param {MouseEvent} e */
  const lightbox = (w, e) => {
    const ws = works(), items = ws.map(x => x.dataset.kind === 'video' && x.dataset.vid ? youtubeFrame(x.dataset.vid, x.querySelector('img')?.alt || 'YouTube') : x.querySelector('img'));
    const shown = ws.filter((_, i) => items[i]);   // 跟 dialog 那一組同一個順序（沒圖的不在裡面）
    active = ws.indexOf(w);
    openFigure(items[active], e, /** @type {Element[]} */ (items.filter(Boolean)), (i) => {
      active = ws.indexOf(shown[i]);
      shown[i]?.scrollIntoView({ block: 'center', behavior: 'instant' });
    });
  };
  /** 換排法（底列那組鈕；兩種排法同一個順序、同一個 active＝放映剛剛那一個、總覽剛剛點開的那一個）：作品淡出 → 換 → 淡入（網站 fade，works.css .is-switching），位置不補間（兩套版型，補了會滿畫面亂飛）。
   *  不走 fadeSwap（View Transition）：Windows 的 WebKit 換這兩套版型時整頁當掉（2026-11-23 實測；直接換、減少動態都沒事） @param {string} mode @param {number} [at] */
  let switching = 0;
  const setMode = (mode, at = active) => {
    if (mode === root.dataset.mode || switching) return;
    stopVideo();
    root.classList.add('is-switching');
    switching = window.setTimeout(() => {
      root.dataset.mode = mode;
      active = at;
      render();
      if (mode === 'bento') works()[active]?.scrollIntoView({ block: 'center', behavior: 'instant' });   // 回總覽＝剛剛在看的那一個在畫面中間
      else window.scrollTo({ top: 0, behavior: 'instant' });
      void list.offsetWidth;   // 新位置先定下來（不補間），下一幀才淡入
      requestAnimationFrame(() => { root.classList.remove('is-switching'); switching = 0; });
      restart();
    }, prefersReducedMotion() ? 0 : DUR.fade * 1000);
  };
  registerPageCleanup(() => clearTimeout(switching));

  // 手機（觸控）的放映：手指左右拖＝作品跟著走（清單上的 --drag 加進每個作品的 left；框跟兩側的漸層不動），
  // 放開時拖得夠遠（舞台寬的 15%）＝換上一個／下一個，不然彈回來（user 2026-11-24：「手機上的作品應該要可以 drag 來拖動，但 pc 不需要」）。
  // 滑鼠不算（PC 照舊點兩邊那個、方向鍵）；拖過的那一下不算點（不換、不播）。上下照常捲（works.css touch-action: pan-y）
  /** @type {{ x: number, y: number, dx: number, on: boolean } | null} */
  let drag = null, dragged = false;
  list.addEventListener('pointerdown', (e) => {
    dragged = false;
    if (e.pointerType === 'mouse' || !e.isPrimary || root.dataset.mode !== 'slideshow') return;
    drag = { x: e.clientX, y: e.clientY, dx: 0, on: false };
  });
  list.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.on && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { drag.on = true; list.classList.add('is-dragging'); }
    if (drag.on) { drag.dx = dx; list.style.setProperty('--drag', `${dx}px`); }
  });
  const release = () => {
    if (!drag) return;
    const { on, dx } = drag;
    drag = null;
    if (!on) return;
    dragged = true;
    list.classList.remove('is-dragging');   // 放開：作品照 left 的過場彈回來／跟著換到新位置
    list.style.removeProperty('--drag');
    if (Math.abs(dx) > list.clientWidth * 0.15) go(dx < 0 ? 1 : -1);
  };
  list.addEventListener('pointerup', release);
  list.addEventListener('pointercancel', release);

  // 放映每 AUTOPLAY_MS 自動換下一個（user 2026-11-25）：游標在正中那個上、鍵盤聚焦在裡面、正中的影片在播、拖著、選單或 dialog 開著＝這一下先不換（WCAG 2.2.2）；
  // 換了（點、方向鍵、拖、換排法、後台換好）從頭計時；減少動態＝不自動
  let timer = 0;
  function restart() {
    clearInterval(timer);
    if (!prefersReducedMotion()) timer = window.setInterval(() => {
      if (root.dataset.mode !== 'slideshow' || drag || list.querySelector('.work-frame, .work[data-pos="0"]:hover, :focus-visible')
        || document.documentElement.classList.contains('menu-open') || document.querySelector('dialog[open]')) return;
      go(1);
    }, AUTOPLAY_MS);
  }
  registerPageCleanup(() => clearInterval(timer));

  // 影片縮圖的黑邊（bars）：載好就量，有＝作品的比例換成黑邊裡面那塊、圖放大裁到那塊（works.css --fx／--fy／--fw／--fh），下一幀一次重排
  let relayout = 0;
  /** @param {HTMLImageElement} img */
  const trim = (img) => {
    const w = img.closest('.work'), f = bars(img);
    if (!(w instanceof HTMLElement) || !f) return;
    const [fx, fy, fw, fh] = f;
    Object.entries({ '--fx': fx, '--fy': fy, '--fw': fw, '--fh': fh, '--w': img.naturalWidth * fw, '--h': img.naturalHeight * fh }).forEach(([k, v]) => w.style.setProperty(k, String(v)));
    relayout ||= requestAnimationFrame(() => { relayout = 0; layoutBento(); layoutRow(); });
  };
  const watchBars = () => list.querySelectorAll('.work[data-kind="video"] img').forEach(img => {
    if (!(img instanceof HTMLImageElement)) return;
    if (img.complete && img.naturalWidth) trim(img); else img.addEventListener('load', () => trim(img), { once: true });
  });

  list.addEventListener('click', (e) => {
    if (dragged) { dragged = false; return; }   // 剛拖完放開的那一下
    const hit = e.target instanceof Element ? e.target.closest('.work-hit') : null, w = hit?.closest('.work');
    if (!(hit instanceof HTMLButtonElement) || hit.disabled || !(w instanceof HTMLElement)) return;
    if (root.dataset.mode === 'bento') { lightbox(w, e); return; }
    const pos = Number(w.dataset.pos);
    if (pos) go(pos); else if (w.dataset.kind === 'video') play(w);
  });
  // 底列那組鈕在殼上、方向鍵看整頁 → document，換頁收掉
  /** @param {MouseEvent} e */
  const onBar = (e) => {
    const b = e.target instanceof Element ? e.target.closest('.bar-works [data-works-mode]') : null;
    if (b instanceof HTMLElement && b.dataset.worksMode) setMode(b.dataset.worksMode);
  };
  /** @param {KeyboardEvent} e */
  const onKey = (e) => {
    const step = /** @type {Record<string, number>} */ ({ ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 })[e.key];
    if (!step || root.dataset.mode !== 'slideshow' || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (document.documentElement.classList.contains('menu-open') || document.querySelector('dialog[open]')) return;
    if (e.target instanceof HTMLElement && e.target.matches('input, textarea, select, [contenteditable]')) return;
    e.preventDefault();
    go(step);
  };
  document.addEventListener('click', onBar);
  document.addEventListener('keydown', onKey);
  registerPageCleanup(() => { document.removeEventListener('click', onBar); document.removeEventListener('keydown', onKey); });

  list.replaceChildren(...shuffle([...list.children]));   // 清單裡原本有的（正式站的 HTML 是空的；煙霧測試的 fixture 有）照樣打亂、接上
  render();
  watchBars();
  restart();
  return fromCms().then(items => {
    if (!items || !list.isConnected) return;
    stopVideo();
    list.innerHTML = shuffle(items).map(tile).join('');
    active = 0;
    render();
    watchBars();
    restart();
  });
}
