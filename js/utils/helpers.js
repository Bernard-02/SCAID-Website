/**
 * SCAID Utility Helpers — IIFE 掛 window.SCAIDHelpers（classic script）
 * <script src="js/utils/helpers.js"> 放每頁 GSAP CDN 之後、main.js（module）之前
 * 沿用 SCCD 網站 helpers.js，只留站台路徑／版型判斷／游標／GSAP 註冊；頁面專屬的 helper 之後再加回來
 */

window.SCAIDHelpers = window.SCAIDHelpers || /** @type {SCAIDHelpersAPI} */ ({});

(function (Helpers) {
  'use strict';

  // 站台根 URL：部署在子路徑（GitHub Pages project site／學校子目錄）時，根目錄絕對路徑（/custom-cursor/x.svg）
  // 會指到網域根而 404 → 一律經 sitePath() 以站台根為基準。從本檔 <script src> 位置推導（js/utils/ → 上兩層＝站台根）
  Helpers.siteBase = new URL('../../', /** @type {HTMLScriptElement} */ (document.currentScript).src).href;

  Helpers.sitePath = function (path) {
    return new URL(String(path).replace(/^\//, ''), Helpers.siteBase).href;
  };

  // 全站 --cursor-* 唯一定義處（CSS 與 JS inline 都寫 var(--cursor-X)）。用絕對 URL：var() 內的相對 url()
  // 由「使用處」解析（stylesheet 深度不同／inline＝文件基準）會差層 404 退回系統游標
  function setCursorVars() {
    var cursors = {
      'default':     ['default.svg',  '9 2',   'default'],
      'pointer':     ['pointer.svg',  '14 1',  'pointer'],
      'text':        ['typing.svg',   '15 15', 'text'],
      'grab':        ['drag_1.svg',   '15 15', 'grab'],
      'grabbing':    ['drag_2.svg',   '15 15', 'grabbing'],
      'zoom-in':     ['zoom-in.svg',  '9 9',   'zoom-in'],
      'zoom-out':    ['zoom-out.svg', '9 9',   'zoom-out'],
      'w-resize':    ['left.svg',     '2 15',  'w-resize'],
      'e-resize':    ['right.svg',    '28 15', 'e-resize'],
      'not-allowed': ['ban.svg',      '16 16', 'not-allowed'],
    };
    var root = document.documentElement;
    Object.keys(cursors).forEach(function (key) {
      var c = cursors[key];
      root.style.setProperty(
        '--cursor-' + key,
        "url('" + Helpers.sitePath('custom-cursor/' + c[0]) + "') " + c[1] + ', ' + c[2]
      );
    });
  }
  setCursorVars();
  Helpers.refreshCursorVars = setCursorVars;

  // 版型判斷唯一來源。gate＝矮橫向手機＋768–1023（iPad），沿用手機排版；CSS 無法共用 media query，改這串要同步 CSS。
  // MediaQueryList 建一次重複讀（讀 innerWidth 會強制 layout）
  Helpers.LANDSCAPE_GATE = '(orientation: landscape) and (max-height: 500px), (min-width: 768px) and (max-width: 1023px)';
  var _mqPortrait = window.matchMedia('(max-width: 767px)');
  var _mqGate = window.matchMedia(Helpers.LANDSCAPE_GATE);
  Helpers.isLandscapeGate = function () { return _mqGate.matches; };
  Helpers.isMobileLayout = function () { return _mqPortrait.matches || _mqGate.matches; };
  Helpers.isDesktopLayout = function () { return !Helpers.isMobileLayout(); };

  // 輸入判斷跟版型分開：iPad 不論接不接鍵盤都回報 hover:none／pointer:coarse → 一律當觸控；觸控筆電主輸入是滑鼠＝桌面
  var _mqHover = window.matchMedia('(hover: hover)');
  var _mqCoarse = window.matchMedia('(pointer: coarse)');
  Helpers.canHover = function () { return _mqHover.matches; };
  Helpers.isCoarsePointer = function () { return _mqCoarse.matches; };

  // 觸控 tap 後 WebKit 仍讓 :focus-visible 命中 → html.input-touch 關外框；鍵盤一按就拿掉（typography.css 配對規則）
  document.addEventListener('pointerdown', function (e) {
    if (e.pointerType !== 'mouse') document.documentElement.classList.add('input-touch');
  }, { capture: true, passive: true });
  document.addEventListener('keydown', function () {
    document.documentElement.classList.remove('input-touch');
  }, { capture: true, passive: true });

  Helpers.scrollToElement = function (target, offset, behavior) {
    var el = null;
    if (typeof target === 'string') {
      try { el = document.querySelector(target); } catch (_) { return; }
    } else {
      el = target;
    }
    if (!el) return;
    var y = el.getBoundingClientRect().top + window.pageYOffset + (offset || 0);
    window.scrollTo({ top: y, behavior: behavior || 'smooth' });
  };

  // Fisher–Yates 原地洗牌、回傳同一陣列（要保留來源順序先 [...arr] 複製）
  Helpers.shuffle = function (arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };

})(window.SCAIDHelpers);

// Register GSAP plugins（需在 GSAP 載入後執行）
if (typeof gsap !== 'undefined') {
  const plugins = [];
  if (typeof ScrollTrigger !== 'undefined') plugins.push(ScrollTrigger);
  if (typeof ScrollToPlugin !== 'undefined') plugins.push(ScrollToPlugin);
  if (typeof CustomEase !== 'undefined') plugins.push(CustomEase);
  if (plugins.length > 0) gsap.registerPlugin(...plugins);
  // GSAP core 不認 'cubic-bezier(...)' 字串 → 具名註冊，motion.js EASE.wipe 用（＝CSS --ease-wipe）
  if (typeof CustomEase !== 'undefined') CustomEase.create('wipe', '0.25,0,0,1');
}
