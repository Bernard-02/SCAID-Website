/**
 * 語言切換：選單底部 .lang-btn 切 zh ↔ en、存 localStorage。中英分開、不混排：每個元素只顯示一種語言。
 * 標記法：中文直接寫在內文，英文寫 data-en；第一次套用時把中文記到 data-zh，之後來回切都有得換（textContent，不吃 HTML →
 * 內含子元素的要拆成各自的 span）。頁面內容之後接 Directus 再依 lang 抓對應欄位。
 */
const KEY = 'scaid:lang';

export function getLang() {
  try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'zh'; } catch { return 'zh'; }
}

/** @param {ParentNode} [root] */
export function applyLang(root = document) {
  const lang = getLang();
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-Hant';
  /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll('[data-en]')).forEach(el => {
    if (el.dataset.zh == null) el.dataset.zh = el.textContent;
    el.textContent = lang === 'en' ? el.dataset.en : el.dataset.zh;
  });
  // 切換鈕顯示「要切過去」的語言；報讀名稱也跟著換
  root.querySelectorAll('.lang-btn').forEach(b => {
    b.textContent = lang === 'en' ? '中文' : 'EN';
    b.setAttribute('aria-label', lang === 'en' ? 'Switch to Chinese' : '切換為英文');
  });
}

export function initLang() {
  document.addEventListener('click', (e) => {
    if (!(e.target instanceof Element) || !e.target.closest('.lang-btn')) return;
    try { localStorage.setItem(KEY, getLang() === 'en' ? 'zh' : 'en'); } catch {}
    applyLang();
  });
  applyLang();
}
