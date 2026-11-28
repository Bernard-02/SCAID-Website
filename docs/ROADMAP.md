# SCAID 網站 Roadmap

2026-11-18 整理、2026-11-21 照 user 定的順序重排、**2026-11-24 照現況整份更新**、2026-11-25 補上當天的改動。依據：`CLAUDE.md`、`docs/Directus-後台欄位.md`、各頁 HTML、後台的 `scripts/setup-directus.cjs`。
做完一項就勾掉。設計細節仍以 `CLAUDE.md` 為準，這份只記「還剩什麼」。

## 順序（user 2026-11-21）

1. **結構**：確定所有頁面的結構
2. **手機版**
3. **背景的互動**、**右邊的常駐圖片**
4. **細節調整**
5. **接後台**
6. **上線**

素材（第 7 節）不擋前四步，可以同時收。

## 現況（2026-11-25）

- **前台**：首頁＋14 個內頁（含 2026-11-23 加的作品頁、11-24 改成簡單版的 404；11-25 拿掉報導、常見問題，榮譽改名紀錄）。全站接後台：每頁先顯示 HTML 的示意內容，抓到後台就換成後台的。
- **後台**：Directus **11.17.4**（2026-11-24 從 12 換過來，`scaidcms.usc.edu.tw`）。集合照前台選單排、收進資料夾（首頁、合作企業、師資、庫），另有介面文字 `ui_labels`、網頁 icon `site_icons`；Public 可讀。各頁的示意文字已在後台，圖還沒傳。
- **Logo**：動態已做（2026-11-22 定的分鏡，`logo.js`）：進場、首頁在 stroke 與系名之間來回、換頁上移、內頁 stroke 長度跟著右圖 object 的名字。
- **右圖**：3D object 已做（`object.js`，模型用同一種 stroke 的疏密排，定時換）；模型是暫用的（見第 3 節）。
- **背景**：2026-11-26 換成背景試驗場那一份、開了（`main.js BG`；見第 3 節）。原本的炭筆＋中空板（2026-11-23 先關掉）被取代。
- **icon**：user 11-24 給的那套（`docs/SCAID icon.ai` → `scripts/build-icons.cjs`），沒用到的 SVG 都刪了；後台可以換（`site_icons`）。
- **版本控制**：最後一次 commit＝`aae025a`（11-25 白天：英文字體自架、報讀名稱跟語言走）。**之後 11-25 的改動都還沒 commit**（報導、常見問題拿掉、紀錄、選單重排、hover 圓點與 chevron、清單 gap…），等整輪煙霧測試過了再 commit。

## 1. 結構

一頁一頁看過，user 確定就勾。下面是每頁現在的樣子。

- [ ] **首頁**：一屏只有置中 logo（stroke 與系名來回）；底列中間一次一則首頁的 news，點了展開清單、定位到那一則；點 logo＝去關於；play＝intro 影片。
- [ ] **關於** `about`：導言＋分段（有段落導覽），每段＝標題 → 圖片輪播 → 說明 → 小節（標題、圖、內文、附註）→ 年表（沿革）。
- [ ] **合作企業** `partners`：一家一列（縮圖＋名稱＋副標，同師資的列），整列外連官網。不分段。
- [ ] **師資** `faculty`：專任／兼任／行政管理三段，一位一列（縮圖＋名字＋副標）→ 詳細頁。
- [ ] **教師詳細頁** `faculty-detail`：照片在上、名字＋副標；學歷、經歷…＝一筆一筆（年份一行、說明一行）。
- [ ] **課程** `curriculum`：一個年級一段；一門課一個摺疊（課名＋必修／選修），點開＝課程說明。
- [ ] **作品** `works`：整頁深色；放映（一列、左右兩側漸進模糊）／總覽（照比例的瀑布流）兩種排法，底列切換；每次進來順序打亂；YouTube 播放清單＋上傳的圖。
- [ ] **動態** `activities`（2026-11-27 起含原本紀錄頁的榮譽、報導）：一則一個摺疊（縮圖＋標題＋類別）；展開＝時間、地點（可以好幾個）、相簿（影片排在照片前面，點了在放大畫面播）。不分年份。
- [x] ~~**紀錄** `records`~~：user 2026-11-27 拿掉這一頁、併進動態（後台 `records` 併進 `activities`＝類別「榮譽」「報導」，集合刪了；國旗不出、縮圖的 placeholder user 之後再定）。
- [x] ~~**報導** `press`~~：user 2026-11-25 拿掉這一頁、併進榮譽（後台資料搬進 `records`；舊的「報導」集合刪了，媒體庫留著給報導選媒體）。
- [x] ~~**入學** `admission`~~：user 2026-11-27 拿掉這一頁、併進首頁的 news（展開的清單＝一則一個摺疊：縮圖＋標題＋日期，點開＝說明、相簿、附件；寬＝內文 6 欄、畫面正中，比畫面矮＝上下置中；日期新到舊）。後台 `admission` 的資料搬進 `news`、集合刪了。
- [x] ~~**常見問題** `qa`~~：user 2026-11-25 拿掉這一頁，後台的集合也刪了。
- [ ] **捐款** `donate`：導言＋分段，段落同關於（輪播、說明、小節、年表；2026-11-24）。示意是用途、方式兩段。
- [ ] **規章與政策** `regulations`：規章、表單（分段，一則一列、整列外連）＋使用條款、隱私權政策（段落同關於，2026-11-24）併成一頁。
- [ ] **網站地圖** `sitemap`：連結一串，順序同選單（2026-11-25）。
- [ ] **聯絡** `contact`：社群（IG、YouTube 兩個 icon）、聯絡資訊（清單＝同教師詳細頁：標題＋一筆一筆、後台可以自己加，每一筆可以填連結）、姊妹系所（連結清單）、標章。不分段。
- [ ] **404**：簡單版：畫面正中一個字（未知／unknown）、左下角語言鈕，沒有選單、沒有右圖。
- [ ] **選單**：主選單 8 項，接著第二組「規章與政策、網站地圖、捐款」（一起捲）；固定在下面＝聯絡、深色模式、EN 一組（2026-11-25）。只有選項捲（兩端有東西捲過去才淡出＋糊）；手機字級 lg。

## 2. 手機版

11-13 的手機稿做了一版，之後很多東西改過（選單全螢幕、右圖收成右下角的鈕、PC 以外都收右圖…），還沒有整輪看過。

- [ ] **字級**（user 2026-11-24）：手機的 4 階再調。同一個東西手機與 PC 用同一階（`CLAUDE.md` 規範 1）＝只改 `variables.css` `:root` 的 `--font-size-lg／md／s／xs`（現在 19.2／16／14／12.8px；桌面 32／21.6／18.4／14.4px）。
- [ ] 每一頁在手機寬看過一輪（照第 1 節的清單）。
- [ ] 選單：全螢幕、只有選項捲、點空白處收；首頁的 logo、play、動態在選單開著時糊掉。
- [ ] 首頁：動態展開與收合、定位到那一則。
- [ ] 右下角的鈕＝右圖 object 的開關（放大 dialog 裡可以拖著轉）；iPad 也是這樣（PC 以外都收右圖）。
- [ ] 放大 dialog：相簿、影片的控制列（‹ X ›、音量、全螢幕；iPhone 調不了音量、YouTube 不能全螢幕）。
- [ ] 段落輪播、相簿橫向捲、摺疊開合、作品頁兩種排法。
- [ ] 觸控：沒有 hover 效果、矩形鈕不出名字、可點範圍夠大。
- [ ] 實機檢查（iOS Safari、Android Chrome）。

## 3. 背景的互動、右邊的常駐圖片

- [x] **背景**：2026-11-26 user 在背景試驗場（https://claude.ai/artifact/YJ4JpmdDhwZsArffEnphKX ）定了、搬上網站（看得見的中空板、整支筆、錯位 1.5、濃度 70%、深淺 100%；白天粉彩、夜晚原來的光或粉彩隨機）。
- [ ] **背景還沒做的**：手機（觸控沒有游標，現在不畫）、Mac Safari 與一般筆電內顯的實機效能（畫面一直在重畫，跟不上會降解析度）。
- [ ] **右圖 object 還沒做的**：brush 外觀（跟該頁背景同一種筆；提案頁 https://claude.ai/artifact/JaQUys4VtgTXNmJXXtamGr 有示意）、改走後台（一個集合：名字＋模型檔）、**換掉暫用的模型**（現在 48 個來自 Kenney／Quaternius，2026-11-26 從 102 個刪的；面數低＝圓的東西靠程式鼓圓，Kenney nature-kit 那種一面一條法線的鼓不動）、名字與清單定稿。

## 4. 細節調整

- [x] **英文的行距**（user 2026-11-24）：中英分開了＝`variables.css` `:root` 那組是中文、檔尾 `html[lang="en"]` 那組是英文，四階各自調（現在只有 text-s 不同：中文 1.5、英文 1.4，2026-11-25）。數值要再調直接改那兩組。
- [ ] **中文字形**：既、概、者、神、飯這類「部件是舊寫法」的字要不要也改從 J 版切（`build-fonts.py USE_J`）。
- [ ] Firefox：選單兩端不淡不糊（不支援 scroll-driven）、intro 影片（`.m3u8`）播不了（要支援＝照 SCCD 加 hls.js）。要不要處理待定。
- [ ] 其他看到再補。

## 5. 接後台

2026-11-21 全站接上，2026-11-24 換到 Directus 11。
結構＝`scripts/setup-directus.cjs`（只加不刪）、介面文字的 key＝`scripts/seed-directus.cjs`（內容一律在後台填，2026-11-26 起不從 HTML 匯入）、前台＝`js/modules/pages/cms-pages.js`＋`works.js`＋`ui/ui-labels.js`＋`ui/item-list-cms.js`＋`ui/footer-cms.js`＋`ui/site-assets.js`；欄位表＝`docs/Directus-後台欄位.md`。

| 頁 | 集合 | 狀態 |
|---|---|---|
| 首頁展開清單、底列（＝原本的入學，2026-11-27 併進來） | `news` | 已接 |
| intro 影片 | `home_video`（單例） | 已接（暫用 SCCD 的影片） |
| 關於、捐款 | `about`（段落 `about_sections`、小節 `about_subsections`）、`donate`（同一套：`donate_sections`、`donate_subsections`） | 已接 |
| 合作企業 | `partners`＋`partners_page`＋單位庫 | 已接 |
| 師資、教師詳細頁 | `faculty`＋`faculty_page`＋人名庫 | 已接 |
| 課程 | `courses` | 已接 |
| 作品 | `works`（單例：YouTube 播放清單＋圖片） | 已接（播放清單暫用 SCCD 畢製、圖還沒傳） |
| 動態 | `activities` | 已接 |
| ~~紀錄（榮譽＋報導）~~ | ~~`records`~~ | 2026-11-27 併進動態（`activities` 的類別 award／press；主辦方＝單位庫、媒體＝媒體庫）；集合刪了 |
| ~~報導~~ | ~~`press`~~ | 2026-11-25 併進紀錄（11-27 又併進動態）；舊集合刪了 |
| ~~常見問題~~ | ~~`qa`~~ | 2026-11-25 拿掉（含後台） |
| 規章與政策 | `regulations`（規章、表單＝重複列 `items`；條款＝同關於的段落 `regulations_sections`、`regulations_subsections`） | 已接 |
| 聯絡 | `footer`（含 Instagram、YouTube 網址） | 已接（IG、YT 網址是佔位） |
| 選單、頁名、固定小標… | `ui_labels` | 已接 |
| 網頁的 icon | `site_icons`（檔在檔案庫「網頁 icon」資料夾） | 已接 |

還沒做：

- [ ] **動態的後台照 SCCD 的活動**（user 2026-11-24：「這個動態的後臺，能不能參照 sccd 的設計」）。SCCD 一則活動有：標題、副標、日期（可多段）、地點（可多個）、來賓／講者（人名庫）、說明、海報、圖片、影片連結、相關文件。
  - [x] 分類 → **副標**（「不會有什麼分類…這應該是改成副標才對」；一筆一行，同師資／合作企業）。
  - [x] **影片連結**（「影片要有，因爲要做影片渲染，如果有的話」）：後台貼連結，有影片的那則前台要放得出來。
  - [x] **地點**可以好幾個（「地點也是可以先做吧」）。
  - [ ] 還沒做、user 還沒說要：說明文字、來賓／講者（人名庫）、相關文件、多段日期。
- [ ] **圖**：相簿、動態封面、報導截圖、關於的段落輪播、師資照片、企業 logo、作品的圖都要上傳（現在報導沒截圖＝不能點、關於沒圖＝不出輪播）。入學的附件（PDF）也還沒上傳。
- [ ] 後台的內容換成真的（現在是搬過去的示意文字；作品的播放清單換成 SCAID 自己的；IG、YouTube 換成 SCAID 的帳號）。
- [ ] 舊欄位確定不要了再刪（現在藏著）：`faculty`／`partners` 的 `name_*`、`about_sections` 的 `body_*`／`items`／`note_*`、`footer` 的 `email`／`tel`／`fax`／`address_*`（2026-11-24 聯絡資訊改成清單後藏的，內容已經搬進清單）。
- [ ] 老師／助教的後台帳號與權限（v11 沒有帳號上限）。
- [ ] 舊的 Directus 12：請 IT 留一個月當退路（約到 2026-12-24），之後請 IT 刪。

## 6. 上線

- [ ] **正式網域**：`js/config/slugs.js CLEAN_URL_HOSTS` 填 `scaid.usc.edu.tw`（server 的 fallback 要先設好）。各頁的 canonical／og:url 2026-11-26 已經照 `scaid.usc.edu.tw/<slug>` 寫好（後台改了 slug 要跟著改）。
- [ ] **YouTube Data API 的 key 白名單加正式網域**（`config/api.js YT_API_KEY` 沿用 SCCD 那支，靠 GCP 網域白名單；不加的話作品頁的播放清單抓不到）。
- [ ] **主機＝S3＋CloudFront（同 SCCD）**：2026-11-26 實測 `scaid.usc.edu.tw` 已指過去、HTTPS 通、bucket 還是空的（每條路徑 403）＝`.htaccess` 在正式站用不到。請 IT 的事（bucket／distribution ID、上傳金鑰、403＋404 → `/index.html`、`Cache-Control: no-cache`）＝原本的請求單 `docs/IT-請求-前台上線.txt`（2026-11-27 刪了、git 歷史有）；上傳＝`scripts/deploy.ps1`。
  - [ ] **開乾淨網址前要先補的 code**（讀 code 看到的、還沒實測）：①~~`router.js initRouter` 的初始路由假設「HTML 已經是那一頁」~~（2026-11-26 接網址 slug 時修了：拿到的是 index.html 就照 slug 抓那一頁，用模擬 fallback 的 server 測過）；②打錯的 `/pages/xxx.html` 拿到 index.html＝相對路徑全錯、整頁沒樣式（`.htaccess` 轉去 404.html 的那條 CloudFront 沒有）→ index.html 補一行轉去 404 頁。
  - [x] **上傳包**（2026-11-27＝`scripts/deploy.ps1`，直接同步到 S3）：只傳 `index.html`＋`pages`／`css`／`js`／`images`／`fonts`／`objects`／`website-icons`（約 13MB）；**不要整個資料夾同步**——`scripts/` 裡有後台的 token。可照 SCCD 的 `scripts/make-upload-package.ps1`。
- [ ] **圖片改走 CloudFront**（user 2026-11-27，比照 SCCD 的 `CMS_CDN_BASE`）：前台 E3CYJ5880KIXQ3 加 origin＝bucket `scaidcms.usc.edu.tw`、behavior `Directus11/*` → 圖片網址 `https://scaid.usc.edu.tw/Directus11/<filename_disk>`；請求單 `docs/IT-請求-圖片走CloudFront.txt`，等 IT。IT 好了＝前台各處讀圖改用即時的 filename_disk 組網址（不寫死副檔名，WebP 轉檔會換）、讀不到退回 `/assets`；PDF、下載附件照舊走 `/assets`。
- [ ] `robots.txt`、`sitemap.xml`：現在都沒有。
- [x] 各頁的 description、og、canonical：user 2026-11-26 給的 metadata（沒進 repo）寫進各頁 `<head>`；router 換頁時跟著換 head（不然冷載入 index.html 的 canonical 會一直指首頁）。
- [ ] og:image、apple-touch-icon：等圖（user 給的 metadata 那兩格空著；有圖之後 twitter:card 改 summary_large_image）。
- [ ] **LINE／FB 貼乾淨網址的預覽＝首頁的**：預覽的爬蟲不跑 JS，CloudFront 把 `/about` 回成 index.html＝看到的是首頁的 og（SCCD 也一樣）。Google 會跑 JS＝靠 router 換 head 沒問題。要修＝上傳時每一頁多傳一份沒有副檔名的（`about`＝`pages/about.html` 的內容、Content-Type `text/html`，檔名＝目前的 slug），S3 找得到就不會 fallback；pages 裡的相對路徑（`../css/`）在根目錄一層剛好對得上。後台改了 slug 要重傳那一份。
- [ ] 示意內容清乾淨：各頁 HTML 註解標「內容為 MOCK 示意」的那幾份、人名日期後面的「（示意）」「(placeholder)」、公司名「示意○○公司」（`CLAUDE.md` 規範 11）。
- [x] **正式上線＝只讀後台、接不上要有 coming soon 的保護**（user 2026-11-25：「正式上綫的時候，會去掉 placeholder 的内容，只讀後臺，接不上的話，需要做 coming soon 的保護，但這會在蠻後面決定」）：**做法還沒定、很後面才決定，現在不要動**。到時候要一起想的：現在前台在三種情況會安靜地退回 HTML 的示意、畫面上分不出來——那一支查詢失敗或逾時、查詢裡有任何一個欄位／集合後台沒有（Directus 整串回 403）、那個集合一筆都沒有（`cms-pages.js list()`）；拿掉示意之後這三種各要顯示什麼（coming soon、空的、上次成功的那份＝`config/api.js saveLKG／readLKG` 現在沒人用）、是整站一個 coming soon 還是一頁一頁。在那之前「HTML 的內容＝備援」照舊。
  **2026-11-26 定了、做完**（user：「我們不需要假資料，收不到後臺也不需要render假的，做法比照sccd的去設計」）：各頁 HTML 的示意全拿掉、只放空的容器；抓到＝畫＋存一份（`config/api.js cmsGet`）；查詢失敗、逾時、403（點名了後台沒有的欄位）＝退這個分頁上次抓到的那份、沒有＝那一塊不畫；集合一筆都沒有＝不畫（空的段落 `main.js settle` 收掉）；整個連不上＝一頁一頁都只剩「即將推出」（同 SCCD；網站地圖、404 照常）。煙霧測試的示意搬到 `scripts/smoke-fixtures/`。
- [x] 桌面 Chrome 不能左右捲（煙霧測試跑 WebKit，重現不了）：2026-11-25 用 Edge（同 Chromium）自動掃過每一頁、選單開了再收，都沒有多出可捲的寬度。版型大改後要再掃一次。
- [x] 無障礙檢查一輪（可照 SCCD 的 `無障礙稽核與改進清單.md`）。**2026-11-27 跑過 AA**（axe-core＋鍵盤、目標大小、重排、文字間距、對比；修了什麼見 `CLAUDE.md`「無障礙」那條）。
- [ ] **會自己動的東西沒有暫停的方法（WCAG 2.2.2）**：首頁 logo 來回、底列 news 跑馬燈、關於的輪播跑馬燈（hover 照走）、作品放映每 4 秒換、右圖 3D 一直轉、背景中空板的邊線、沒圖的縮圖佔位（直條跑馬燈）。現在只有 hover／鍵盤聚焦時停、或系統開了「減少動態」——兩個都不算頁面上的機制。**user 2026-11-27：先記著，送檢被擋再想辦法**。到時候的選項：①選單裡 EN 旁邊加一行字「暫停動態」（同 EN 的樣子，按了走 `prefersReducedMotion` 那條路、記住；佔位的跑馬燈＝`:is(.item-thumb, .profile-photo):not(:has(img))` 掛 `animation-play-state: paused`）②全部改成 5 秒內自己停（改設計）③全部 hover／聚焦就停（關於的輪播要改回會停；WCAG 沒承認這算機制，檢測員可能不收）。影片字幕（1.2.2）user 說不用改。
- [ ] 跟 IT 確認後台的檔案儲存（S3 或主機本地）與備份有沒有照請求單做。**2026-11-27 解決**：IT 把後台改放 bucket `scaidcms.usc.edu.tw`（ap-northeast-2，資料夾 `Directus11/`），中間 IAM 政策打錯 bucket 名＝舊圖 403、上傳 503，改正後 98 個檔都讀得到、上傳正常（經過＝`docs/IT-請求-後台檔案搬bucket.txt`）。前台的 bucket `scaid.usc.edu.tw` 裡還有後台的舊副本 `Directus/`、`Directus11/`：前台上傳要排除這兩個（不刪），之後可請 IT 刪。user 拿到的上傳金鑰＝後台用的同一個 IAM 使用者 `scaid`，2026-11-27 還沒有前台 bucket 最外層的寫入、也沒有 CloudFront 的權限。

## 7. 等素材（不擋前面，可以同時收）

- [ ] **各頁真實內容，中文＋英文**：關於、合作企業、師資（含每位的學經歷）、動態（含榮譽與報導）、首頁 news（原本的入學）、捐款、規章（PDF 或連結）、使用條款與隱私權政策。現在英文全是 placeholder。
  - [x] 課程（含每門課說明）：user 2026-11-26 給的 `docs/SCAID Curriculum.xlsx`（32 門、中英）已寫進後台 `courses`（同一天起 HTML 不放備援）。
- [ ] **圖片**：關於頁的段落輪播、動態與首頁 news 的相簿現在是 Lorem Picsum 的 stock 圖；師資照片、企業 logo、動態封面是灰底。
- [ ] **作品**：SCAID 自己的 YouTube 播放清單、作品圖。
- [ ] **聯絡頁真實資料**：電話、傳真、地址、IG 帳號、YouTube 頻道（後台 `footer` 現在是示意值，直接在後台改）。
- [ ] **intro 影片**：SCAID 自己的（後台「首頁影片」貼 YouTube 連結；現在暫用 SCCD 的介紹影片）。
- [ ] **右圖的 3D 模型**：2026-11-27 換成 Poly Haven（CC0）的高面數模型 30 個（`scripts/build-objects.cjs`）；名字是先取的，之後要不要走後台（名字＋模型檔）再定。
- [ ] **正式 favicon、apple-touch-icon、og-image**：現在只有矩形＋圓的 `images/favicon.svg`。

## 之後再說（2026-11-27 全站代碼清理時找到、user：「四就都先記著，這次先不改」）

- [x] **背景引擎用不到的部分**：2026-11-28 清了一輪（user：「應該是兩者都保留，但你只需要確保bg js裏面的内容是從試驗場拿出來的，但試驗場還是需要完整的内容」＝試驗場完整保留、bg.js 只刪不改，見 CLAUDE.md「背景」）：bg.js 898 → 854 行、bg-shaders.js 1294 → 1281 行——只刪得掉整行、整塊的（試驗頁的 say／kick／drip、dwell、關掉的 3 支筆、扇形筆頭、示範筆、貼質感那幾行、`S.hue` 那段、只有邊緣那種中空板的內容）；跟還在用的程式寫在同一行的（`prev` 畫布、漸層／幻彩、LOOKS／MODES／PALS、一些模式判斷）照規矩留著。11 支筆 × 白天／夜晚兩種配色在 Edge 跟原本並排比過一樣、沒有錯誤。自動降解析度只降不升同一天修了（會升回來，試驗場第 17 版同一份）。
- [ ] **`.fs-blur` 6 層毛玻璃減成 3 層**（作品頁底列常駐兩塊＝12 層 backdrop-filter）：比較省、樣子可能變一點，要 user 看。
- [ ] **中文粗體字檔**（`fonts/glow-sans-tc-compressed/700-*`，105 片、3.3MB）：現在沒有元素用到粗體（瀏覽器不會抓，只佔 repo 和部署）；留著備用或從 `build-fonts.py WEIGHTS` 拿掉。
- [ ] **GitHub Pages**（https://bernard-02.github.io/SCAID-Website/）：不是舊版——每次 push 都會更新成最新的一份（2026-11-28 查：當天 push 的 link.svg、筆刷 8 秒都在上面）。正式站能開之後：要當預覽站就留著（canonical 指正式站，不會跟正式站搶搜尋）、不要就關掉 Pages（＋刪 `.nojekyll`）。
- [x] **沒圖的縮圖佔位（直條跑馬燈 `ph-marquee`）動的是 `mask-position`**＝每一幀主執行緒重繪，師資頁沒照片的人越多越重 → 2026-11-28 改成 `::before` 畫直條、動 transform（Edge：18 個佔位、1 秒重繪 0 次）。
- [ ] `:has(#figure-dialog[open]…)` 共 9 處：每次開合手風琴都會讓根元素的 `:has()` 重新比對，可改成 chrome.js 在 html 上切 class（中風險、要重跑測試）。

## 隨時

- [ ] 每做完一批就 commit（`scripts/.directus-token` 已在 `.gitignore`）。
