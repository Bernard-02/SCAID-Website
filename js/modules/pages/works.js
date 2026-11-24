/**
 * 作品頁（user 2026-11-23；版型 css/components/works.css）：像電影院——整頁一律深色（chrome.js syncPageTheme）、沒有右圖、內容置中。
 * 兩種排法（底列中間那組鈕切，header.html .bar-works；切換＝作品淡出、換、淡入）：
 *   放映（slideshow）：一次一個在正中，前後各一個縮小、躲在後面從兩邊露出來；點兩邊那個／方向鍵（←→↑↓）換，環狀。
 *     正中是影片＝點了就地播（YouTube 播放器自己的鈕可以全螢幕）；圖片不放大
 *   總覽（bento）：全部照比例排成幾欄、照閱讀順序擺（layoutBento；user 2026-11-23：兩種排法同一個順序＝放映的第 8 個就是總覽的第 8 個，
 *     從放映切過來＝剛剛那一個捲到畫面中間）；點一個＝就地開 lightbox（chrome.js 的放大 dialog，一組＝總覽全部，可以左右切；影片＝YouTube 播放器）。
 *     放映時只有正中那個出 play（works.css）
 * 放映時每個作品照自己的比例與大小、只限最大框，總覽撐滿一欄（works.css）；每次進來順序都打亂（兩種排法共用這一次的順序）。
 * 資料：先用本機的測試資料 TEST_JSON（user 2026-11-23：先用 json 試效果）；空著＝後台單例 works 的 YouTube 播放清單（可以好幾個；
 * 用 Data API 拆成一支一支，照 SCCD about-data-loader）＋檔案庫「作品」資料夾裡的圖。都沒有（後台抓不到、還沒建、還沒填）＝HTML 的示意。
 */
import { CMS_API_BASE, assetUrl, fetchCmsJson, YT_API_KEY } from '../../config/api.js';
import { escapeHtml as esc } from '../ui/escape-html.js';
import { DUR } from '../ui/motion.js';
import { registerPageCleanup } from '../ui/page-cleanup.js';
import { prefersReducedMotion } from '../ui/reduce-motion.js';
import { openFigure, youtubeFrame } from '../ui/chrome.js';
import { sitePath } from '../ui/site-base.js';

const FOLDER = '作品';   // 檔案庫的資料夾（setup-directus.cjs 建）；後台改名＝這裡跟著改
// 本機的測試資料（user 2026-11-23：「works 頁面先用 json 的方式，我想測試效果」）：data/works.json＋data/works/ 的圖（直式、橫式、方形，印編號）
// ＋{ kind: 'playlist', url }＝一個 YouTube 播放清單（user 給的 SCCD 畢製清單；同後台那條拆成一支一支，本機要用 localhost 開）。
// 有寫＝用這個檔、不抓後台；換回後台＝改成 ''、刪掉 data/
const TEST_JSON = 'data/works.json';

/** 播放清單網址 → 清單 id（?list=） @param {unknown} url */
const listId = (url) => String(url || '').match(/[?&]list=([\w-]+)/)?.[1];

/** @typedef {{ kind: 'image' | 'video', src: string, w?: number, h?: number, title: string, vid?: string }} Work */

/** YouTube 播放清單 → 一支一支影片（一頁 50 支、跟 nextPageToken 抓完，最多 5 頁；私人／刪掉的沒有縮圖＝濾掉）。
 *  同一個分頁記住抓過的（sessionStorage，省 quota） @param {string} id @returns {Promise<Work[]>} */
async function playlist(id) {
  const key = `scaid:yt:${id}`;
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
    /** @type {Work[]} */
    const vids = items.filter(it => it.snippet?.resourceId?.videoId && it.snippet?.thumbnails?.medium).map(it => {
      const t = it.snippet.thumbnails, best = t.maxres || t.standard || t.high || t.medium;
      // 縮圖一律當 16:9（standard／high 是 4:3、上下有黑邊，works.css 用 cover 裁掉）
      return { kind: 'video', vid: it.snippet.resourceId.videoId, src: best.url, w: best.width, h: Math.round(best.width * 9 / 16), title: it.snippet.title || '' };
    });
    try { sessionStorage.setItem(key, JSON.stringify(vids)); } catch {}
    return vids;
  } catch (e) {
    // 403 多半＝這個網域不在 key 的白名單（本機要用 http://localhost:PORT 開，127.0.0.1 會被擋）
    console.warn('[works] YouTube 播放清單抓不到：', id, e instanceof Error ? e.message : e);
    return [];
  }
}

/** 後台：單例 works 的播放清單＋「作品」資料夾裡的圖；兩個都沒有＝null @returns {Promise<Work[] | null>} */
async function fromCms() {
  const root = CMS_API_BASE.replace(/\/items$/, '');
  const [page, files] = await Promise.all([
    fetchCmsJson(`${CMS_API_BASE}/works?fields=playlists`).catch(() => null),
    fetchCmsJson(`${root}/files?filter[folder][name][_eq]=${encodeURIComponent(FOLDER)}&filter[type][_starts_with]=image&fields=id,width,height,description&limit=-1`).catch(() => null),
  ]);
  const ids = (Array.isArray(page?.playlists) ? page.playlists : []).map(p => listId(p?.url)).filter(Boolean);
  const videos = (await Promise.all([...new Set(ids)].map(playlist))).flat();
  /** @type {Work[]} */
  const images = (Array.isArray(files) ? files : []).filter(f => f?.id).map(f => ({ kind: 'image', src: assetUrl(f), w: f.width, h: f.height, title: f.description || '' }));
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
    const colW = (list.clientWidth - gap * (cols - 1)) / cols, tops = Array(cols).fill(0);
    for (const w of works()) {
      const W = Number(w.style.getPropertyValue('--w')) || 1600, H = Number(w.style.getPropertyValue('--h')) || 900, c = tops.indexOf(Math.min(...tops));
      w.style.setProperty('--x', `${c * (colW + gap)}px`);
      w.style.setProperty('--y', `${tops[c]}px`);
      tops[c] += colW * H / W + gap;
    }
    list.style.setProperty('--bw', `${colW}px`);
    list.style.height = `${Math.max(0, Math.max(...tops) - gap)}px`;
  };
  // 寬變了才重排（高是自己設的，不看）；下一幀才排：在 ResizeObserver 的 callback 裡改它的高，瀏覽器會報 ResizeObserver loop
  let listW = 0;
  const resized = new ResizeObserver(() => { if (list.clientWidth !== listW) { listW = list.clientWidth; requestAnimationFrame(layoutBento); } });
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
    layoutBento();
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
   *  圖＝那張圖、影片＝YouTube 播放器（切到那一個才載、切走就停）。點的那個記成 active＝之後切到放映從它開始 @param {HTMLElement} w @param {MouseEvent} e */
  const lightbox = (w, e) => {
    const ws = works(), items = ws.map(x => x.dataset.kind === 'video' && x.dataset.vid ? youtubeFrame(x.dataset.vid, x.querySelector('img')?.alt || 'YouTube') : x.querySelector('img'));
    active = ws.indexOf(w);
    openFigure(items[active], e, /** @type {Element[]} */ (items.filter(Boolean)));
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

  list.addEventListener('click', (e) => {
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
