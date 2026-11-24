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
 * ＋「圖片」欄位的圖（多圖，user 2026-11-24；原本是檔案庫「作品」資料夾裡的圖）。都沒有（後台抓不到、還沒建、還沒填）＝HTML 的示意。
 * TEST_JSON 有寫＝改讀本機的測試資料（2026-11-23 用過）。
 */
import { CMS_API_BASE, assetUrl, fetchCmsJson, YT_API_KEY } from '../../config/api.js';
import { escapeHtml as esc } from '../ui/escape-html.js';
import { DUR } from '../ui/motion.js';
import { registerPageCleanup } from '../ui/page-cleanup.js';
import { prefersReducedMotion } from '../ui/reduce-motion.js';
import { openFigure, youtubeFrame } from '../ui/chrome.js';
import { sitePath } from '../ui/site-base.js';

// 本機的測試資料（user 2026-11-23：「works 頁面先用 json 的方式，我想測試效果」）：一筆＝一個 Work，或 { kind: 'playlist', url }＝一個 YouTube 播放清單。
// 有寫＝用這個檔、不抓後台。2026-11-24 換回後台（user：「改讀後臺吧」；那串 SCCD 畢製清單貼進後台了），當時的 data/ 刪了、要再用從 git 拿回來
const TEST_JSON = '';

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
    // videos.list 的 player 帶 maxWidth 才回 embedWidth／embedHeight，照影片本身的比例。縮圖是 16:9 帶黑邊，works.css 用 cover 裁掉。抓不到＝當 16:9
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
  const page = await fetchCmsJson(`${CMS_API_BASE}/works?fields=playlists,${f}.id,${f}.type,${f}.width,${f}.height,${f}.description`).catch(() => null);
  const ids = (Array.isArray(page?.playlists) ? page.playlists : []).map(p => listId(p?.url)).filter(Boolean);
  const videos = (await Promise.all([...new Set(ids)].map(playlist))).flat();
  /** @type {Work[]} */
  const images = (Array.isArray(page?.images) ? page.images : []).map(j => j?.directus_files_id).filter(x => x?.id && /^image\//.test(x.type || ''))
    .map(x => ({ kind: 'image', src: assetUrl(x), w: x.width, h: x.height, title: x.description || '' }));
  return images.length + videos.length ? [...images, ...videos] : null;
}

/** 本機的測試資料（TEST_JSON）：一筆＝一個 Work（圖的 src 寫站內路徑，照站台根），或 { kind: 'playlist', url }＝拆成一支一支（同後台那條）。
 *  沒寫／抓不到／空的＝null @returns {Promise<Work[] | null>} */
async function fromJson() {
  if (!TEST_JSON) return null;
  try {
    const r = await fetch(sitePath(TEST_JSON), { cache: 'no-cache' });
    const items = r.ok ? await r.json() : null;
    if (!Array.isArray(items)) return null;
    /** @type {Work[]} */
    const all = (await Promise.all(items.map(it => {
      if (it.kind !== 'playlist') return [{ ...it, src: /^https?:\/\//i.test(it.src) ? it.src : sitePath(it.src) }];
      const id = listId(it.url);
      return id ? playlist(id) : [];
    }))).flat();
    return all.length ? all : null;
  } catch { return null; }
}

/** 一個作品（兩種排法同一份標記，works.css 照排法、data-pos 擺）：大小＝--w／--h（沒寫寬高的檔當 16:9）；點的範圍＝蓋在上面的那顆鈕 @param {Work} it */
const tile = (it) => `<div class="work" data-kind="${it.kind}"${it.vid ? ` data-vid="${esc(it.vid)}"` : ''} style="--w:${+it.w || 1600};--h:${+it.h || 900}">`
  + `<img src="${esc(it.src)}" alt="${esc(it.title)}"${it.w && it.h ? ` width="${it.w}" height="${it.h}"` : ''} loading="lazy">`
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
  /** 放映＝一列（user 2026-11-24：「左右都幫我改成一樣大」）：每個都撐滿最大框（最寬＝PC 內文 6 欄、手機舞台的 72%，× 舞台高，照比例，同 works.css 的 width），
   *  從正中往兩邊、隔一個 gutter（column-gap）接下去：--x＝中線離舞台正中多遠。第一次擺、繞到另一頭的（一次跳超過一格）直接到位、不滑過整列 */
  const relOf = new WeakMap();
  const layoutRow = () => {
    if (root.dataset.mode !== 'slideshow') return;
    const ws = works(), n = ws.length, half = Math.floor(n / 2);
    const H = list.clientHeight, gap = parseFloat(getComputedStyle(list).columnGap) || 0;
    // 最寬多寬（同 works.css --work-max）：PC＝內文 6 欄（.works 本身的寬；舞台拉到整個畫面寬，user 2026-11-24）、手機＝舞台的 72%
    const maxW = matchMedia('(min-width: 768px)').matches ? root.clientWidth : 0.72 * list.clientWidth;
    const size = (/** @type {HTMLElement} */ w) => Math.min(maxW, H * (Number(w.style.getPropertyValue('--w')) || 1600) / (Number(w.style.getPropertyValue('--h')) || 900));
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
      if (label) hit.setAttribute('aria-label', title ? `${label}：${title}` : label); else hit.removeAttribute('aria-label');
      if (!bento && Math.abs(pos) > 1) w.setAttribute('aria-hidden', 'true'); else w.removeAttribute('aria-hidden');   // 放映時藏著的不給讀
    });
    document.querySelectorAll('.bar-works [data-works-mode]').forEach(b => b.setAttribute('aria-pressed', String(/** @type {HTMLElement} */ (b).dataset.worksMode === root.dataset.mode)));
    // 放映時舞台兩側的漸進模糊（同關於的段落輪播 slideshow.js；works.css）：內容整批換掉（打亂、後台）之後都會叫 render → 這裡補回來
    if (!list.querySelector(':scope > .slide-blur')) list.insertAdjacentHTML('beforeend', `<div class="slide-blur" aria-hidden="true">${[0, 1, 2, 3, 4].map(i => `<i style="--i:${i}"></i>`).join('')}</div>`);
    layoutBento();
    layoutRow();
  };
  const stopVideo = () => list.querySelectorAll('.work-frame').forEach(f => f.remove());
  /** @param {number} step */
  const go = (step) => { const n = works().length; if (n < 2) return; stopVideo(); active = (active + step + n) % n; render(); };
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

  list.replaceChildren(...shuffle([...list.children]));   // 示意也打亂
  render();
  return fromJson().then(items => items || fromCms()).then(items => {
    if (!items || !list.isConnected) return;
    stopVideo();
    list.innerHTML = shuffle(items).map(tile).join('');
    active = 0;
    render();
  });
}
