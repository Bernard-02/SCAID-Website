# SCAID 網站 Roadmap

2026-11-18 整理。依據：`CLAUDE.md`、`docs/Directus-後台欄位.md`、程式裡的 TODO 與「示意」標記、後台公開 API 當下的實際狀態。
做完一項就勾掉。設計細節仍以 `CLAUDE.md` 為準，這份只記「還剩什麼」。標 ※ 的是專案裡還沒有任何記錄、這次整理時補列的。

## 現況

- **前台**：首頁＋15 個內頁的版型都在，內容全是示意文字。只有頁尾接了後台。
- **後台**：Directus 已開（`scaidcms.usc.edu.tw`），9 個集合已建、Public 可讀。除了 `footer`（一筆示意值），**其他 8 個集合都是空的**。
- **Logo**：靜態 SVG 已換上（頂部＝文字版、頁尾＝直條版）。動態還在選案。
- **版本控制**：最後一個 commit 是 `868c6cf`。之後改了 31 個檔，另有字體、3 個 UI 模組、2 支後台 script、`curriculum-detail` 等新檔，全部還沒 commit。
- **測試**：`npm run check:ts` 過；煙霧測試 23:03 全過。

## 建議順序

1. 先把目前這一大批 commit（第 6 節）。
2. 後台結構補齊、示意資料寫進後台（第 3 節前置），才有東西可以接。
3. 一頁一頁接後台（第 3 節）。
4. 等決定、等素材的項目（第 1、2 節）同時推，不擋第 2、3 步。
5. 上線前檢查（第 5 節）。

## 1. 等你決定

- [ ] **Logo 動態選案**：10 案在 https://claude.ai/artifact/Q1YKqtMJACAYVHU9WFeF2p ，選定後再細修（落地見第 4 節）。
- [ ] **入學頁怎麼挑動態**：`news.admission` 勾選，還是改成看分類。欄位文件標「待確認」，這個不定，入學頁接不了。
- [ ] **右圖是什麼**：11-13 的初步想法是「資料庫＋每隔幾秒隨機生成一張 ASCII 圖像」，未定案。現在全站右圖是灰底佔位。定了之後手機的縮圖／放大那套複本要改成同一個來源畫三處（`CLAUDE.md` 有記）。
- [ ] **中文字形**：既、概、者、神、飯這類「部件是舊寫法」的字要不要也改從 J 版切（`build-fonts.py USE_J`）。
- [ ] **正式網域**：影響乾淨網址、canonical、og:url（第 5 節）。
- [ ] **捐款按鈕**：連結先寫在內文裡，還是後台另開欄位。

## 2. 等素材

- [ ] **各頁真實內容，中文＋英文**：關於、合作企業、師資（含每位的學經歷）、課程（含每門課說明）、動態、入學、常見問題、捐款、規章（PDF 或連結）、條款。現在英文全是 Placeholder。
- [ ] **圖片**：關於頁的段落輪播、動態與入學的相簿現在是 Lorem Picsum 的 stock 圖；師資照片、企業 logo、動態封面是灰底。
- [ ] **頁尾真實資料**：電話、傳真、地址、社群連結（後台 `footer` 現在是示意值，直接在後台改）。
- [ ] **社群 icon 圖**：現在是方框。
- [ ] **intro 影片網址**：填進 `pages/header.html` 的 `.play-btn data-video`，沒填按了不會開。
- [ ] **正式 favicon、apple-touch-icon、og-image**：現在只有矩形＋圓的 `images/favicon.svg`。

## 3. 接後台（不用等人，可以直接做）

前置：

- [ ] `news` 補欄位：`category_*`、`time_*`、`place_*`、`album`、`attachments`、`admission`。改 `scripts/setup-directus.cjs` 的 SPEC 再跑一次。
- [ ] `scripts/seed-directus.cjs` 跟上現在各頁的標記（動態改成摺疊、入學改成動態列、課程詳細頁只剩說明），再跑一次把示意資料寫進後台。
- [ ] `page_sections` 內文的 sanitize（只放行粗體、斜體、h3、清單、連結），不是 `escapeHtml`。
- [ ] 內容依語言抓 `_zh`／`_en`，英文留空就顯示中文。

各頁（模組放 `js/modules/pages/`，在 `main.js initPageModules` 用動態 import 掛上）：

| 頁 | 集合 | 狀態 |
|---|---|---|
| 頁尾 | `footer` | 已接 |
| 動態 `news.html`、首頁展開清單、底列最新一則 | `news` | 未接 |
| 入學 `admission.html` | `news`（勾了 `admission` 的）＋`pages` 的標題與導言 | 未接，卡在第 1 節的決定 |
| 師資 `faculty.html`、`faculty-detail.html?id=` | `faculty` | 未接 |
| 課程 `curriculum.html`、`curriculum-detail.html?id=` | `courses` | 未接 |
| 合作企業 `partners.html` | `partners` | 未接 |
| 榮譽 `records.html` | `records`（後台待建，2026-11-19 新增的頁） | 未接 |
| 常見問題 `qa.html` | `qa` | 未接 |
| 規章 `regulations.html` | `regulations` | 未接 |
| 關於、捐款、條款 | `pages`＋`page_sections` | 未接 |

每頁都要做到：列表自己帶 `filter[status][_eq]=published`；後台抓不到時退回 HTML 的示意內容或上次成功的資料；煙霧測試補一組假資料。

## 4. Logo 動態落地（選定之後）

- [ ] 選定的那一案做成正式檔案。
- [ ] 頂部 logo 現在是用 CSS mask 畫一整張 SVG，動不到裡面的每一塊。動態要改成 inline SVG，或同等能逐塊控制的做法。
- [ ] 定義什麼時候播：進站、首頁置中與上移之間、直條版與文字版什麼情況切換。
- [ ] 減少動態（`prefers-reduced-motion`）下直接到終態。
- [ ] 頁尾的直條版要不要跟著動。

## 5. 上線前

- [ ] 正式網域定案後：`router.js CLEAN_URL_HOSTS`（server 的 fallback 要先設好）、`index.html` 的 canonical 與 og:url。
- [ ] ※ 確認部署到哪台主機、SPA fallback 有沒有生效（`.htaccess` 已備好，只對 Apache 有用）。
- [ ] ※ `robots.txt`、`sitemap.xml`：現在都沒有。
- [ ] ※ og:image、各頁自己的 description：現在只有首頁有 description，全站沒有 og:image。
- [ ] ※ 示意內容清乾淨：全站搜尋「示意」和「Placeholder」應該是 0。
- [ ] ※ 桌面 Chrome 手動檢查不能左右捲（煙霧測試跑 WebKit，重現不了這個問題）。
- [ ] ※ 無障礙檢查一輪（可照 SCCD 的 `無障礙稽核與改進清單.md`）。
- [ ] ※ 跟 IT 確認後台的檔案儲存（S3 或主機本地）與備份有沒有照請求單做，前台看不出來。

## 6. 收尾

- [ ] 把 `868c6cf` 之後的修改 commit（`scripts/.directus-token` 已在 `.gitignore`）。
- [ ] `CLAUDE.md` 幾處過時：概述還寫「後台尚未開」、專案結構裡 `api.js` 還標 placeholder、`modules/ui/` 清單少了 `album`／`slideshow`／`grid-overlay`。
- [ ] `docs/IT-請求-安裝Directus.txt`：後台已開，確認結案後可以移走或標記完成。
