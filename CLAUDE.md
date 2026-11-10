# SCAID 網站專案指南

## 專案概述
**實踐大學AI設計職人學位學程**（Bachelor Program in Advanced Integrated Design, Shih Chien University，簡稱 SCAID）官方網站。
骨架 2026-11-03 從 **SCCD Website**（`../SCCD Website`，媒傳系官網）的基礎檔精簡搬來：原生 JS SPA、無框架；
內容預計走 **Directus headless CMS**（後台尚未開，目前全站是 MOCK 示意文字）。

## 設計決策（user 2026-11-03 拍板，參考圖＝2022 degree show 站）
- **黑白品牌**：只有黑／白＋灰階。字體英文 JetBrains Mono、中文 Noto Sans TC（一個堆疊 `font-sans`）。
- **手機優先**：token `:root` 是手機值、`@media (min-width: 768px)` 放大；Tailwind 先寫無前綴再加 `md:`。
- **一般 grid**：`.site-grid` 手機 4 欄 → ≥768 12 欄。
- **中英分開**：中文寫在內文、英文寫 `data-en`（`lang.js` 第一次套用時把中文記到 data-zh，來回切）；全站標題、示意文字、底列名字、footer 都要標。選單最下方 `.lang-btn` 切換（localStorage）。
- **全站殼**（`pages/header.html` ＋ `css/components/chrome.css` ＋ `js/modules/ui/chrome.js`）：
  - **Logo**：全站同一種＝兩端矩形（白圓點）夾名字，名字跟語言走（中文一行／英文兩行，看 `<html lang>`），寬度 max-content。頂到最頂、置中；首頁未展開時 `home.css` 放到畫面正中央（transition 位移）。footer 另一版（長條＋英中名在下）。都是佔位待換 SVG。
  - **選單**：透明、固定寬 `--menu-w`（手機 10rem／桌面 18rem），logo 不動，沒有底色。開著時內容左緣推到選單右緣（推「選單寬 − 內距」，內容自己的左內距不重複算；user 2026-11-03 定案，不對 grid／logo），跟 play 鈕同一條線，play 鈕在選單右緣（選單開著時 menu 鈕 min-width 撐成選單欄那格、名字算在格子裡，play 自然排在後面——名字中英怎麼換都不影響 play，純 CSS 不量）。
    主選單在上、次選單＋語言鈕推到底，字級同底列。開著時 menu 鈕白圓點＋名字常駐、intro 照常、動態收成只剩＋。選單與 footer 互斥。
  - **底列**（固定、貼底 `--bar-pad`）：三欄＝左 menu／intro（play icon）、中 最新動態＋（**只在首頁**，內頁淡掉、user 2026-11-10；永遠畫面正中、寬＝`--col-w`＝首頁動態圖片寬）、右 footer。
    矩形鈕 hover／鍵盤聚焦才在旁邊出名字，名字跟語言走（選單／簡介／頁尾 ↔ menu／intro／footer），平常視覺隱藏但仍是報讀名稱。
    兩側等寬由 `fitBar` 量 `--side-min`：側邊放不下名字才縮動態、中心不動；標題放不下就跑馬燈。
  - **footer**：覆蓋層（`pages/footer.html`），只有點底列右下 footer 鈕才出現；開著時底列只剩 footer 鈕（白圓點、不出名字），menu／intro／動態用網站 transition 淡出、關掉時淡入（user 2026-11-03 改回一開始的排法）；logo 頂到頂、內容貼底，copyright 對齊底列那條線（`--bar-pad`）。往下捲沒有 footer。**內容走 Directus 單例 `footer`**（`footer-cms.js`；抓不到留 HTML 的 MOCK、抓到後台為準、空欄位整列收；欄位表 `docs/Directus-後台欄位.md`）。
  - **intro**：play 鈕 `data-video` 有網址才開原生 `<dialog>` 播影片。
  - **自製 scrollbar**：同 SCCD，藏原生、JS thumb（`custom-scrollbar.js`），手機不顯示。
- **首頁**：一屏只有置中 logo；點動態「+」→ `html.news-open`：logo 上移到頂、清單在畫面中間展開（寬 `--col-w`）、可捲；
  底列標題退掉、＋滑到動態欄外右邊一個 gutter（不擋圖）、豎線收掉變－，大小同＋（CSS 畫的兩條線，transition）。
- **網站 transition＝fade in／fade out**（user 2026-11-03）：token `--dur-fade`／`--transition-fade`（variables.css）、JS 用 `DUR.fade`（motion.js）。
  換頁：router 換頁前加 `html.page-leaving` 讓 main 淡出（跟 fetch 並行），換完內容拿掉＝淡入。footer 開關時底列其他鈕也走這組（淡完 visibility 才 hidden）。之後其他進出場也吃這組。
- **內頁版型**（about 起，user 2026-11-03，`css/components/page.css`）：桌面 col 1 段落導覽、col 2–7 內文由上往下、col 9–12 右圖（是什麼圖待 user 說）；
  頁標題／段落標題／小標／說明段落 text-md 粗體、內文小一階 text-s、附註 text-xs，標題不 sticky。每段 `h2.section-title`；
  段落導覽（`section-nav.js` 依 section-title 生成：上下 chevron＋每段一個矩形）sticky 在 `<main>` 裡＝選單開時跟內容一起右推；
  點了把該段標題捲到「第一段標題在頁頂時的位置」，最後一段撐高到捲得到。手機先只有內文（導覽、右圖 md 才出）。
- **詳細頁**（`<slug>-detail`，user 2026-11-10）：列表 `a.item-row` 點進去；左上角 `.back-btn`（← icon，回列表）＝col 1 上緣對齊內容第一行、桌面 sticky、左緣對齊導覽矩形，跟 `.section-nav` 同放 `grid-area: 1 / 1`；選單亮父頁。目前只有 `faculty-detail`（照片＋名字＋各段條列、右圖照常；接 Directus 後帶 `?id=`）。
  **全部內頁（含 404）都用這版型＋右圖**（user 2026-11-10），h1 跟段落標題同 text-md。右圖、段落導覽「永遠在畫面正中」＝高 0 的 sticky 錨點停在中線、內容往上下溢出
  （有高度的 sticky 捲到底會被格子底頂走）。段落裡的條列 `.item-list`（項目間空一行、h3 不粗體）；`.item-row`＝左方形縮圖 2 欄＋右文字（faculty／partners）。
  faculty 名字／單位中英兩行都顯示、不跟語言切換；curriculum 課名＋必修同字級（text-md）。
- 狀態全掛 `<html>` class：`menu-open`／`footer-open`／`news-open`／`page-leaving`；換頁 `closeOverlays()` 全收。

## 技術棧
- 原生 HTML/CSS/JS（ES modules）；自製 SPA router 只換 `<main>`；殼片段 fetch 注入
- Tailwind CSS 3（`css/output.css` 為 build 產物，**改任何 CSS 都要 `npm run build:css`**）
- 設計 token：`css/variables.css`＝唯一來源；`tailwind.config.js` 全部映射到 `var(--*)`
- GSAP 3.14（CDN）；時長 token 走 `js/modules/ui/motion.js`
- 圖示：`.icon` CSS mask（`css/components/icon.css`），SVG 放 `website-icons/`

## 網站架構（routes）
| slug | 中／英 | 群組 |
|---|---|---|
| about / partners / faculty / curriculum / news / admission | 關於／合作企業／師資／課程／動態／入學 · About／Partners／Faculty／Curriculum／News／Admission | 主選單 |
| qa / donate / regulations / terms / sitemap | 常見問題／捐款／規章／條款／網站地圖 · QA／Donate／Regulations／Terms／Site Map | 次選單 |
| faculty-detail | 教師（師資列表點進去） | 詳細頁（不進選單／sitemap） |
| 404 | | |

## 專案結構
```
├── index.html              # 首頁：空一屏＋展開用動態清單（MOCK）；body 靜態標 data-page="index"
├── pages/
│   ├── header.html         # 全站殼：logo、透明選單（含語言鈕）、底列、intro dialog → 注入 #site-header
│   ├── footer.html         # footer 覆蓋層 → 注入 #site-footer
│   └── <slug>.html         # 13 個內頁（含 faculty-detail）（MOCK 示意；直接開也能獨立跑）
├── css/
│   ├── variables.css       # token（手機值預設、≥768 放大；含 --top-h／--bar-h／--menu-w）
│   ├── input.css           # Tailwind 入口（@import 順序＝cascade 順序）
│   ├── base/               # typography.css / scrollbar.css
│   ├── layout/grid.css     # .site-container / .site-grid
│   └── components/         # icon.css / chrome.css（全站殼）/ home.css（首頁）/ page.css（內頁版型）
├── js/
│   ├── main.js             # 入口：片段注入、initPageModules / cleanupPageModules
│   ├── router.js           # PAGES 清單→路由表、連結攔截、popstate（同頁只換 hash 不重載）、a11y 報讀
│   ├── config/api.js       # Directus URL 唯一注入點（placeholder）、fetchCmsJson、assetUrl、LKG
│   ├── utils/helpers.js    # classic：window.SCAIDHelpers（sitePath、版型判斷、游標 var、GSAP 註冊）
│   └── modules/ui/         # chrome / footer-cms / section-nav / lang / custom-scrollbar / site-base / escape-html / page-cleanup / motion / a11y / reduce-motion
├── images/favicon.svg      # 矩形＋圓（TODO 正式 SVG）
├── scripts/smoke.cjs       # Playwright 煙霧測試（用法見檔頭）
├── docs/                   # Directus-後台欄位.md（後台集合／欄位 key 照這份建，新接一個集合就補一節）、IT-請求-*.txt
├── custom-cursor/  website-icons/  types/helpers.d.ts  .claude/skills/gsap-core
```

## 開發指令
```bash
npm install
npm run watch:css     # 開發：Tailwind 監看
npm run build:css     # 交付前重編（minify）
npm run check:ts      # JS 型別檢查
node scripts/smoke.cjs "../SCCD Website/node_modules/playwright" "%LOCALAPPDATA%/ms-playwright/webkit-2370/Playwright.exe"
```
本地預覽：VS Code Live Server 開 `index.html`，或 `python -m http.server`。**按 G（或網址加 `?grid`）開 grid 疊圖**（`js/modules/ui/grid-overlay.js`，記在 localStorage）。
部署：靜態檔；`.htaccess` 含 SPA fallback。乾淨網址要等 server fallback 設好才把網域填進 `router.js CLEAN_URL_HOSTS`。

## 規範
1. **字級只用 7 階 token**（`text-xs/s/md/lg/xl/2xl/3xl`），不寫 `text-[14px]`；RWD 靠 token 的 @media，不寫 `md:text-*`。
2. **顏色／間距／時長一律 `var(--*)`**；灰底用 `bg-light-gray`／`bg-dark-gray`。
3. **手機優先**：先寫手機版 class，桌面再加 `md:`；grid 子元素先 `col-span-4` 再 `md:col-span-N`。
4. **站內路徑一律 `sitePath()`**（JS）或相對 `.html`（HTML）；不寫根目錄絕對路徑。
5. **新頁三步**：`pages/X.html`（複製 about.html）→ `router.js PAGES` 加 slug → header 選單＋sitemap 加連結；所有文字中文寫內文、英文寫 data-en。頁面專屬 JS 用動態 import 掛在 `main.js initPageModules`。
6. **換頁要收乾淨**：window/document 級 listener 用 `registerPageCleanup()`；`<main>` 內 GSAP／ScrollTrigger 由 `cleanupPageModules` 統一殺。
7. **動畫**：`DUR.*`／`EASE.*`（motion.js）；進場要能在 `prefers-reduced-motion` 下直接到終態（GSAP 已全域 patch）。
8. **版型看寬度、互動看輸入**：排版 `SCAIDHelpers.isMobileLayout()`，hover 類 `canHover()`／`isCoarsePointer()`。
9. **後台文字塞 innerHTML 前過 `escapeHtml()`**；純文字用 `textContent`。
10. **無障礙**：非互動元素綁 click 過 `makeActivatable()`；icon／矩形鈕有 `aria-label`。
11. **MOCK 內容**：示意文字中文寫「（示意）」或「示意：」、英文寫 Placeholder，接 Directus 時 grep 得到；不要寫看起來像真的資料。
12. **殼的 z 序**：logo 30 ＜ 捲軸 35 ＜ 選單 40 ＜ footer 45 ＜ 底列 60；`#page-content` 有 transform（右推用），裡面別放 fixed 元素。

## 刻意沒搬的 SCCD 功能（需要時從 `../SCCD Website` 搬）
三 mode 主題切換（`js/modules/ui/theme-toggle.js`、`css/themes/`；token `--theme-*` 已留著）、Lottie logo、footer 散佈卡、intro 動畫、
scroll-snap、矮橫向／直向全站層（`css/layout/landscape.css` 84KB）、ui_labels／site-assets 後台覆蓋。
通用文件可直接參考：`docs/字級規範.md`、`無障礙稽核與改進清單.md`、`橫向手機版最佳實踐.md`、`SPA-接-Directus-Headless-最佳實踐.md`。

## TODO
- Logo SVG（頂部版、footer 鎖定版）→ 換掉 `.logo-strip`；正式 favicon／apple-touch-icon／og-image
- intro 影片網址 → `header.html .play-btn data-video`
- footer：社群 icon 圖（連結、聯絡資訊、姊妹系所、標章、copyright 已走後台）
- Directus 開了 → `js/config/api.js` 網域；各頁 MOCK 與底列動態改模組渲染；內容依 lang 抓對應欄位
- 正式網域 → `router.js CLEAN_URL_HOSTS`、`index.html` canonical／og:url
