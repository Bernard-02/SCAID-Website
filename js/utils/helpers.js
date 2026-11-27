/**
 * SCAID Utility Helpers — IIFE 掛 window.SCAIDHelpers（classic script）
 * <script src="js/utils/helpers.js"> 放每頁 main.js（module）之前
 * 沿用 SCCD 網站 helpers.js，只留站台路徑／版型判斷
 */

window.SCAIDHelpers = window.SCAIDHelpers || /** @type {SCAIDHelpersAPI} */ ({});

(function (Helpers) {
  'use strict';

  // 站台根 URL：部署在子路徑（GitHub Pages project site／學校子目錄）時，根目錄絕對路徑（/images/x.svg）
  // 會指到網域根而 404 → 一律經 sitePath() 以站台根為基準。從本檔 <script src> 位置推導（js/utils/ → 上兩層＝站台根）
  Helpers.siteBase = new URL('../../', /** @type {HTMLScriptElement} */ (document.currentScript).src).href;

  Helpers.sitePath = function (path) {
    return new URL(String(path).replace(/^\//, ''), Helpers.siteBase).href;
  };

  // 版型判斷：只分手機／桌面，同 CSS 的 768（不分 iPad，user 2026-11-23；SCCD 那條 iPad／矮橫向手機的 gate 沒搬 CSS，拿掉）。
  // MediaQueryList 建一次重複讀（讀 innerWidth 會強制 layout）
  var _mqPortrait = window.matchMedia('(max-width: 767px)');
  Helpers.isMobileLayout = function () { return _mqPortrait.matches; };

  // 輸入判斷跟版型分開：iPad 不論接不接鍵盤都回報 hover:none／pointer:coarse → 一律當觸控；觸控筆電主輸入是滑鼠＝桌面
  var _mqHover = window.matchMedia('(hover: hover)');
  Helpers.canHover = function () { return _mqHover.matches; };

  // 觸控 tap 後 WebKit 仍讓 :focus-visible 命中 → html.input-touch 關外框；鍵盤一按就拿掉（typography.css 配對規則）
  document.addEventListener('pointerdown', function (e) {
    if (e.pointerType !== 'mouse') document.documentElement.classList.add('input-touch');
  }, { capture: true, passive: true });
  document.addEventListener('keydown', function () {
    document.documentElement.classList.remove('input-touch');
  }, { capture: true, passive: true });

})(window.SCAIDHelpers);
