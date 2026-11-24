# SCAID Directus 後台欄位

後台：`https://scaidcms.usc.edu.tw/admin/`（Directus 11.17.4；2026-11-24 從 12 搬過來。v11 沒有帳號、集合數的上限——之前 12 的免費 Core 方案只給 25 個集合，下面「不開多圖欄位、省一張 junction」是那時候的考量）。
**後台側欄的順序＝前台選單**（user 2026-11-23；`setup-directus.cjs` 的 `NAV`）：首頁（資料夾：News、首頁影片）→ 關於、合作企業、師資、課程、作品、動態、榮譽、報導、入學 → 常見問題、捐款、聯絡、規章與政策 → 庫（資料夾：人名庫、單位庫、媒體庫；user 2026-11-24）、介面文字。
**一頁一個集合**（user 2026-11-22，照 SCCD；原本關於、捐款、規章的條款、師資／合作企業的導言全擠在一個「文字頁」`pages`，後台找不到捐款）：文字頁＝單例；清單頁＝清單＋頁面（導言）兩個集合，收在同一個資料夾（師資、合作企業）。
前台要抓的欄位都列在這裡。**集合名、欄位 key 要一字不差**，前台照名字抓。

**建法：不用手點，跑 `node scripts/setup-directus.cjs`**（2026-11-18 起）。已存在的集合／欄位／關聯／權限會跳過，可以重跑；
要加欄位＝改 script 裡的 SPEC 再跑一次，同時補這份文件。token 放 `scripts/.directus-token`（gitignore）。先 `--dry` 看會做什麼。
舊欄位只藏不刪（SPEC 的 `HIDE`），確定不要了再刪。

**放資料：`node scripts/seed-directus.cjs`**（2026-11-21 全站接後台時跑過一次）：直接解析各頁 HTML 的示意內容寫進後台——
庫（人名／單位／媒體）→ 內容 → 每頁的單例 → 介面文字。可重跑：內容集合還是空的才塞（單例＝每個欄位都空著）、庫只補那些要塞的集合用到、還沒有的名字、介面文字只補沒有的 key（後台改過的不蓋）。
只放文字；圖（相簿、封面、截圖、段落輪播）之後在後台上傳（user 2026-11-21）。

共通：
- 每個集合 Public 角色都已開 Read（含 `directus_files` 與 junction 表，前台 `/assets` 才讀得到圖）。
- 後台網域只填在 `js/config/api.js` 一處（script 也從那裡讀）。
- 中英文欄位用 `_zh`／`_en` 成對；英文留空＝英文版顯示中文。
- **沒有上架／草稿**（user 2026-11-24：「都不需要狀態」；首頁那串 11-24 先刪、同一天全部的 `status` 都刪了）：要下架＝刪掉那一筆。有 `sort` 的在後台列表可拖曳排序，前台照 `sort`。
- 圖片欄位的替代文字＝檔案標題（在檔案庫改）。
- **前台**（user 2026-11-21 全站接上）：每頁 HTML 裡的是示意內容＝後台抓不到、或那個集合還沒有任何一筆時照舊顯示；抓到＝換成後台的。
  各頁的渲染在 `js/modules/pages/cms-pages.js`；師資／合作企業列表 `js/modules/ui/item-list-cms.js`；聯絡頁 `footer-cms.js`；介面文字 `ui-labels.js`。

## 庫：people（人名庫）／organizations（單位庫）／media_outlets（媒體庫）— 資料夾「庫」

user 2026-11-21 照 SCCD：**全站的人名、單位、媒體只在庫裡打一次**，用到的地方從庫選（M2O），改一次全站跟著換。
每個庫下面自動多幾欄「用在：○○」看得到誰在用；關聯 RESTRICT＝**還有人用就刪不掉**（重複的要合併：把用到的地方改選留下那筆，再刪掉另一筆）。
職稱（教授、副教授…）不另開庫，照舊寫在師資的副標（user 2026-11-21 選三個庫、不要職稱庫）；得獎人（學生）照打字（同 SCCD）。

| 庫 | 欄位 | 誰在用（M2O 欄位） |
|---|---|---|
| `people` 人名庫 | `name_zh`、`name_en` | `faculty.person` |
| `organizations` 單位庫 | `name_zh`、`name_en` | `partners.organization`、`records.organizer` |
| `media_outlets` 媒體庫 | `name_zh`、`name_en` | `press.media` |

## ui_labels（介面文字）

user 2026-11-21 照 SCCD：選單、頁名、固定的小標（專任教師、一年級、必修、學歷…）、聯絡頁的欄位名、404 的字。**一個 key 一筆**，`key` 唯讀（前台照 key 找），只改 `zh`／`en`。
HTML 在元素上標 `data-label="key"`，元素本身的字＝後台抓不到時的原文。新的 key：HTML 標好 `data-label`，再跑一次 `seed-directus.cjs` 就補進後台。
**頁名＝`nav.<slug>`**：選單、網站地圖、那一頁的頁標題、瀏覽器分頁標題都吃同一個（所以各頁的單例沒有頁名欄位）。

| key | 類型 | 內容 |
|---|---|---|
| `key` | String（唯一、唯讀） | 例 `nav.about`、`faculty.type.full_time`、`curriculum.year.1`、`curriculum.required`、`faculty.cv.education`、`contact.email`、`common.image`、`error.lead` |
| `zh` / `en` | String | 中文／英文（英文留空＝顯示中文） |
| `category` | Dropdown（可自填） | 後台整理用（選單與頁名、底列與共用、師資、課程、聯絡、榮譽、404），前台不看 |

- 清單的預設檢視照 SCCD（user 2026-11-24）：照 `category` 再照 `sort` 排＝同一類聚在一起，欄位＝分類、key、中文、英文（`setup-directus.cjs PRESETS`；自己在後台改過檢視的人看到的是自己的）。

## site_icons（網頁 icon）

user 2026-11-24：「開一個資料夾，存放網頁的 icon」，照 SCCD 的 `site_icons`。**一個 icon 一筆**，`key`＝`website-icons/` 裡的檔名（唯讀），檔案放在檔案庫「網頁 icon」資料夾。
前台 `js/modules/ui/site-assets.js`：先畫本地的 `website-icons/<key>.svg`，抓到後台＝CSS 裡用到那個檔的地方（`.icon-X`、音量拉桿）換成後台這張；抓不到＝照本地的。
**換圖＝在那一筆換檔**：SVG、畫在跟原本一樣的框裡（高 70、寬照原本那張；寬高比寫在 `icon.css` 的 `--ar`，不跟著後台變）。
新的 icon：檔案放進 `website-icons/`、CSS 用到，再跑一次 `setup-directus.cjs` 就補進後台（後台已經有的 key 不蓋）。

| key | 類型 | 內容 |
|---|---|---|
| `key` | String（唯一、唯讀） | 例 `play`、`close`、`day`（深色模式鈕）、`ig` |
| `file` | Image | 那張 SVG |
| `note` | String | 用在哪裡（後台看的） |

## footer（聯絡頁；原本是頁尾）— 單例

前台：`js/modules/ui/footer-cms.js`。抓到後台＝以後台為準，**欄位留空＝那一列不顯示**。

| key | 類型／介面 | 內容 |
|---|---|---|
| `email` | String／Input | 電子郵件 |
| `tel` | String／Input | 電話（中英共用） |
| `fax` | String／Input | 傳真（中英共用） |
| `address_zh` | String／Input | 地址（中文） |
| `address_en` | String／Input | 地址（英文） |
| `instagram` | String／Input | Instagram 網址：聯絡頁那個 IG icon 連到這裡，留空＝不出 icon（user 2026-11-24：社群只要這一個 icon） |
| `youtube` | String／Input | YouTube 網址：聯絡頁 IG 右邊那個 YouTube icon 連到這裡，留空＝不出 icon（user 2026-11-24 加的） |
| `social` | JSON／Repeater | （藏起來了，前台不看）原本的社群連結，一列一個方框 |
| `links` | JSON／Repeater | 姊妹系所連結，一列一筆、可拖曳排序；前台一行一個、寫全名（user 2026-11-21，原本是縮寫排一列）。子欄位：`label_zh`（全名，例 媒體傳達設計學系）、`label_en`（英文全名，留空＝顯示中文）、`url`。舊資料只有 `label` 的前台照它顯示 |
| `badge` | Image | 標章圖 |

- 網址只接受 `https://`、`mailto:`、`tel:` 開頭，其他會變成無效連結。
- 欄位標籤（電子郵件／電話／傳真／地址）在介面文字（`contact.*`）；IG icon 的圖在網頁 icon（`site_icons` 的 `ig`）。

## news（首頁的 news）＋ home_video（首頁影片）— 資料夾「首頁」

user 2026-11-24：「news 是 news，動態是 activities」——首頁那串原本叫 `home_news`（顯示名稱「首頁動態」），`news` 原本是動態頁＋入學頁共用的集合；同一天拆成 `activities`、`admission`，`news` 改給首頁（Directus 不能改集合名＝建新的、資料搬過去）。
user 2026-11-23：「影片在後台也要有，首頁一個資料夾，裡面放 news 跟影片兩個」。前台：首頁點底列展開的那串（標題、有說明就第二行、圖）＋底列跑馬燈（標題），照拖曳順序、前 8 則（`cms-pages.js homeNews()`／`loadBarNews()`）。
**點了去哪＝照 SCCD 的首頁 news**：`url`（外部網址）或 `admission_item`（入學頁的某一則）二選一，兩格互鎖（另一格有值＝這格唯讀，不藏；Directus 欄位的 `conditions`）。
入學那則＝`pages/admission.html?item=<id>`（站內換頁），到了把那一則打開、捲到頁標題那條線；那則被刪掉＝這格自己變空。外部網址只放 `http(s)`、另開新視窗；都沒有＝那則不能點。底列 `a.bar-news` 沒 JS 時連到入學頁。

| key | 類型／介面 | 內容 |
|---|---|---|
| `sort` | | 拖曳排序＝首頁的順序。要下架＝刪掉那則，或拖到前 8 則以外 |
| `title_zh` / `title_en` | String | 標題 |
| `summary_zh` / `summary_en` | Text／Multiline | 說明（選填，標題下面第二行） |
| `image` | Image | 圖片（選填；沒圖＝不放圖框） |
| `url` | String | 外部連結（選填；`admission_item` 有值時唯讀） |
| `admission_item` | M2O → admission | 入學頁的哪一則（選填；`url` 有值時唯讀）。那則被刪掉＝這格變空（SET NULL） |

`home_video`（單例，只有一筆）：首頁底列 ▶ 鈕點了播的那一支（`cms-pages.js loadIntroVideo()` 殼載完抓、填進 `.play-btn` 的 `data-video`；播放器＝chrome.js `openIntro`：開在放大 dialog，頂對齊各頁 title、自己的控制列（播放／暫停、音量、全螢幕）、關燈，只有一支）。沒填／抓不到＝照 `header.html` 的 `data-video`（目前空的＝點了不開）。

| key | 類型／介面 | 內容 |
|---|---|---|
| `url` | String | 影片連結：YouTube（`youtu.be/…`、`watch?v=…`、`/shorts/…`）＝內嵌播放器；其他 `http(s)` 網址＝直連的影片檔（原生 `<video>`；`.m3u8` 串流 Chrome、Safari 直接播，Firefox 不行）。**目前暫用 SCCD 的介紹影片**（user 2026-11-23，S3 上的 m3u8） |

## activities（動態）、admission（入學）

user 2026-11-24：動態、入學各一個集合（「動態的資料庫，不需要有入學的打勾」；原本共用 `news`、勾 `admission` 才列在入學頁、一則可以兩頁都出現）。
搬的時候兩頁都有的那則（招生說明會）兩邊各一筆。依 `date` 新到舊。

**時間用選的**（user 2026-11-24：「時間應該是用日期選擇，不是手動輸入」；原本是一行自己打的 `time_zh`／`time_en`）：兩個集合都是 `date`（必填）＋`end_date`；
**沒有開始／結束時間**（user 2026-11-24：「後臺不需要有 time 的設定」——動態的 `time`／`end_time` user 在後台刪掉，入學的「也拿掉，留下日期即可」；刪之前只有招生說明會那則填了 14:00–16:00）。
前台排成一行（`cms-pages.js timeOf`）：中文 `2025.12.20–12.27`（跨年才再寫年）、英文 `20–27 Dec 2025`；只填日期＝一天。
前台讀這兩個集合用 `fields=*`（＋相簿、附件那幾層），不一個一個點名：後台刪掉不要的欄位，前台照樣讀得到（點名一個不存在的欄位＝整串 403、退回示意）。

| key | 類型／介面 | 內容 |
|---|---|---|
| `date` | Date | 日期（必填；排序用） |
| `end_date` | Date | 結束日期（選填，跨天才填） |
| `title_zh` / `title_en` | String | 標題 |

`activities`（`pages/activities.html`）：每則是一個摺疊。收著＝縮圖＋標題＋分類；點開＝時間、地點（沒填就不出那一行）、相簿；點相簿的圖放大到整個畫面。什麼都沒得展開＝那一列不能點。

| key | 類型／介面 | 內容 |
|---|---|---|
| `category_zh` / `category_en` | String | 分類（標題下面那一行，例：講座、參訪、展覽） |
| `place_zh` / `place_en` | String | 地點（選填） |
| `image` | Image | 那一列的縮圖 |
| `album` | Files（多張，junction `activities_album`） | 相簿；可拖曳排序；前台 `<img>` 帶檔案的寬高（一打開摺疊就排好） |

`admission`（`pages/admission.html`）：外面只有標題＋時間（沒有縮圖、分類）；點開＝說明 → 相簿 → 附件。首頁的 news 可以指到其中一則（`?item=<id>`＝打開那一則）。

| key | 類型／介面 | 內容 |
|---|---|---|
| `summary_zh` / `summary_en` | Text／Multiline | 說明文字（選填；點開的第一段；換行照留） |
| `album` | Files（多張，junction `admission_album`） | 相簿 |
| `attachments` | Files（多個，junction `admission_attachments`） | 附件（點開的連結清單，一個檔一個連結、連結文字＝檔案標題、另開新視窗） |

## faculty（師資名單）＋ faculty_page（師資頁）— 資料夾「師資」

`faculty_page` 單例只有導言 `lead_zh`／`lead_en`（頁標題下面那段）。

前台：`pages/faculty.html`（`item-list-cms.js`）依 `category` 分段，段落順序固定＝專任教師 → 兼任教師 → 業界導師（段名在介面文字 `faculty.type.*`），段內照 `sort`；某一類沒人＝那段不出。
點進 `faculty-detail.html?id=<id>`（`cms-pages.js`）：照片、名字＋副標、各段履歷（段名在介面文字 `faculty.cv.*`；空的段不出）。

| key | 類型／介面 | 內容 |
|---|---|---|
| `sort` | | |
| `category` | Dropdown | `part_time` 兼任教師／`full_time` 專任教師／`mentor` 業界導師 |
| `photo` | Image | 照片 |
| `person` | M2O → 人名庫 | 姓名（user 2026-11-21；原本的 `name_zh`／`name_en` 藏起來了） |
| `subtitles` | JSON／Repeater | 副標：名字下面的字，**一筆＝一行**，可拖曳排序；沒填＝只有名字。子欄位 `text_zh`、`text_en`（例：學程主任、教授） |
| `education`、`experience`、`expertise`、`exhibitions`、`awards`、`publications` | JSON／Repeater | 學歷／經歷／專長／展覽／獲獎／著作；子欄位 `year`（年份或標題，專長留空）、`text_zh`、`text_en` |

## partners（合作企業名單）＋ partners_page（合作企業頁）— 資料夾「合作企業」

`partners_page` 單例只有導言 `lead_zh`／`lead_en`。

前台：`pages/partners.html`（`item-list-cms.js`）。**跟師資同一種列**：Logo＋企業名稱＋副標一行一個，照 `sort`。

| key | 類型／介面 | 內容 |
|---|---|---|
| `sort` | | |
| `logo` | Image | 列表左邊方形縮圖 |
| `organization` | M2O → 單位庫 | 企業名稱（user 2026-11-21；原本的 `name_zh`／`name_en` 藏起來了） |
| `subtitles` | JSON／Repeater | 副標：名稱下面的字，**一筆＝一行**，可拖曳排序；沒填＝只有名稱。子欄位 `text_zh`、`text_en` |
| `url` | String | 企業網站：整列可點、另開新視窗；留空＝那列不可點 |

## courses（課程）

前台：`pages/curriculum.html` 依 `year` 分段（段名在介面文字 `curriculum.year.1`～`4`）；一門課一個摺疊：收著＝課名＋下面一行「必修／選修」（介面文字 `curriculum.required`／`elective`），點開＝課程說明（沒填＝不能點）。同年級必修在前、選修在後，各自照 `sort`。

| key | 類型／介面 | 內容 |
|---|---|---|
| `sort` | | |
| `year` | Integer／Dropdown | 1–4（一～四年級） |
| `required` | Boolean | 勾＝必修、不勾＝選修 |
| `name_zh` / `name_en` | String | 課程名稱 |
| `description_zh` / `description_en` | Text／Multiline | 課程說明（一段，可以很長；換行照留） |

## works（作品）— 單例

前台：`pages/works.html`（user 2026-11-23，`js/modules/pages/works.js`）。兩個來源混在一起、每次進來順序都打亂：
- **影片**＝這個單例的 `playlists`：貼 YouTube 播放清單網址（可以好幾個），前台用 YouTube Data API（`playlistItems.list`，key 在 `js/config/api.js YT_API_KEY`，沿用 SCCD 那支、靠網域白名單）拆成一支一支：縮圖、標題；私人／已刪除的不出。
- **圖片**＝這個單例的 `images`（多圖，user 2026-11-24：「除了 yt playlist 也可以上傳多張照片」）：一次可以選很多張，上傳的檔放進檔案庫的資料夾「作品」（setup 設的欄位選項；只是放的地方，前台不看資料夾）；只收圖片檔；替代文字＝檔案的「描述」。
  原本是照名字抓「作品」資料夾裡的圖（12 的集合上限快滿了，省一張 junction 才沒開欄位；Public 的 `directus_folders` Read 就是那時開的，留著沒關）。
- 單例還沒建、兩個都沒東西＝照舊顯示 HTML 的示意（Picsum 圖＋兩支 Blender 開放影片）。

| key | 類型／介面 | 內容 |
|---|---|---|
| `playlists` | JSON／Repeater | 一列一個播放清單：`url`（播放清單網址，要有 `list=`；watch 網址帶 `list=` 也行）。同一個清單貼兩次只抓一次 |
| `images` | Files（M2M，junction `works_images`） | 圖片，一次可以選很多張；可拖曳排序（前台照樣打亂）。不是圖片的檔不出 |

## qa（常見問題）

前台依 `category_zh` 分段（分類名一樣的排同一段，照第一次出現的順序），每題一個摺疊。

| key | 類型／介面 | 內容 |
|---|---|---|
| `sort` | | |
| `category_zh` / `category_en` | String | 分類 |
| `question_zh` / `question_en` | String | 問題 |
| `answer_zh` / `answer_en` | Text／Multiline | 回答（純文字，換行照留） |

## records（榮譽）

`pages/records.html`：每筆一個摺疊：收著＝國旗、獎項名稱、得獎人；點開＝主辦方、獎別。

| key | 類型／介面 | 內容 |
|---|---|---|
| `sort` | | |
| `country_code` | String | 國家代碼，ISO 3166-1 兩碼小寫（tw／jp／de…）；前台照它抓國旗（flag-icons 的 SVG） |
| `country_zh` / `country_en` | String | 國家名稱（畫面上不顯示，給報讀用） |
| `award_zh` / `award_en` | String | 獎項名稱 |
| `winner_zh` / `winner_en` | String | 得獎人（照打字，不進人名庫） |
| `organizer` | M2O → 單位庫 | 主辦方 |
| `prize_zh` / `prize_en` | String | 獎別（金獎、佳作…） |

## press（報導）

`pages/press.html`：一則一列（同入學、沒縮圖）：外面＝報導標題＋媒體，點了放大看那則報導的截圖；**沒截圖＝那列不能點**。依 `date` 新到舊。

| key | 類型／介面 | 內容 |
|---|---|---|
| `date` | Date | 刊出日期（排序用，前台不顯示） |
| `title_zh` / `title_en` | String | 報導標題 |
| `media` | M2O → 媒體庫 | 媒體 |
| `screenshot` | Image | 報導截圖（點了放大看的那張） |

## regulations（規章與政策）— 單例

一頁一筆（user 2026-11-22，照 SCCD；原本規章是一筆一列的清單、條款在 `pages`）。**只放連結、不上傳檔案**（user：不會有 PDF）。
前台：上面規章、表單依 `category_zh` 分段（照第一次出現的順序）；一條一列＝名稱＋副標（同入學那種列、不展開），整列連到 `url`、另開新視窗（只放行 http(s)；沒填＝那列不能點）。下面接文字段落（使用條款、隱私權政策）。
沒填的部分＝照 HTML 的示意。

| key | 類型／介面 | 內容 |
|---|---|---|
| `items` | JSON／Repeater | 規章、表單，一列一筆、可拖曳排序。子欄位 `category_zh`／`category_en`（分類）、`title_zh`／`title_en`（名稱）、`subtitles_zh`／`subtitles_en`（副標，多行文字、**一行＝前台一行**，例 2026.08 修訂）、`url` |
| `sections` | JSON／Repeater | 文字段落，同下面「段落」 |

## about（關於）、donate（捐款）— 單例

一頁一筆（user 2026-11-22，照 SCCD）。**頁名不在這裡**＝介面文字 `nav.<slug>`。
前台：導言換掉 `.page-lead`；有段落就整段換掉（關於＝標題 → 輪播 → 說明 → 小節 → 年表；捐款＝標題 → 內文）。

| 集合 | key | 類型／介面 | 內容 |
|---|---|---|---|
| about／donate | `lead_zh` / `lead_en` | Text／Multiline | 導言（頁標題下面那段） |
| donate | `sections` | JSON／Repeater | 段落，一段一列、可拖曳排序；子欄位 `title_zh`／`title_en`（段落標題＝左側段落導覽）、`body_zh`／`body_en`（WYSIWYG，同下） |
| about | `sections` | O2M → about_sections | 段落（在同一個表單裡新增、可拖曳排序；`about_sections` 在後台選單裡藏起來）。**關於的段落要放輪播圖、重複列放不了檔案**，所以是子集合 |
| about_sections | `sort`、`about` | | `about`＝所屬的那一筆 |
| about_sections | `title_zh` / `title_en` | String | 段落標題（h2＝左側段落導覽） |
| about_sections | `images` | Files（多張，junction `about_sections_images`） | 段落圖片輪播（標題下面那排；沒放＝不出輪播） |
| about_sections | `description_zh` / `description_en` | Text／Multiline | **說明**（選填，user 2026-11-23）：段落圖片下面、小節上面那段；多行純文字，換行照留、空一行＝分段 |
| about_sections | `subsections` | O2M → about_subsections | **小節**（user 2026-11-23：不要一整段 rich text，一個小節一筆、可以一直加；同一天加了圖片、附註 → 重複列放不了檔案，改子集合）。在段落的表單裡新增、可拖曳排序；`about_subsections` 在後台選單裡藏起來 |
| about_sections | `timeline` | JSON／Repeater | **年表**（user 2026-11-23，「沿革」那段用）＝同師資的學歷：一列一筆、子欄位 `year`／`text_zh`／`text_en`；前台排在小節後面，年份一行、說明一行（沒年份＝只有說明），筆與筆之間 `--spacing-xs` |
| about_sections | `items`、`body_*`、`note_*` | | **舊欄位、藏起來**，前台不再讀（`body_*`＝原本的一整段 WYSIWYG；`items`＝同一天先做的 JSON 重複列，小節要放圖才改成子集合；`note_*`＝段落的附註，user 2026-11-23 拿掉，內容搬到各段最後一個小節的附註） |
| about_subsections | `sort`、`section` | | `section`＝所屬的段落 |
| about_subsections | `title_zh` / `title_en` | String | 小節標題（h3，選填） |
| about_subsections | `images` | Files（M2M，junction `about_subsections_images`） | 圖片（選填，**可以多張**，user 2026-11-24）：標題下面、內文上面。一張＝照原比例、寬＝內文欄，**最高 16rem**（user 2026-11-23；page.css `.page-section > img`），更高的等比縮小、在內文欄正中（原本靠左）；多張＝輪播（同段落圖片，照拖曳順序、框高同一張圖），跟小節標題隔 xs（同一張圖） |
| about_subsections | `image` | Image | **舊欄位、藏起來**（2026-11-24 改成上面的 `images`；原本放了圖的那個小節已經搬過去），前台不再讀 |
| about_subsections | `text_zh` / `text_en` | Text／Multiline | 內文，多行純文字：換行照留、**空一行＝分段** |
| about_subsections | `note_zh` / `note_en` | Text／Multiline | 小節的附註（選填）：小節最後一行小字（text-xs） |

小節前台的排法＝標題 → 圖 → 內文 → 附註，有才排；塊與塊之間（含分段）隔 `--spacing-sm`；沒標題＝第一塊自己隔 `--spacing-md`（同小節標題的上距）。

捐款、規章的段落內文（`sections[].body_*`）還是 WYSIWYG：中英各一份 HTML，前台跟著語言只顯示一份；**塞進去前過 sanitize**（只放行 p／h3／清單／粗體斜體／連結與 `mt-sm`／`mt-md`／`text-xs` 三個 class）。
