# SCAID Directus 後台欄位

後台：`https://scaidcms.usc.edu.tw/admin/`（Directus 11.17.4；2026-11-24 從 12 搬過來。v11 沒有帳號、集合數的上限——之前 12 的免費 Core 方案只給 25 個集合，下面「不開多圖欄位、省一張 junction」是那時候的考量）。
**後台側欄的順序＝前台選單**（user 2026-11-23；`setup-directus.cjs` 的 `NAV`）：首頁（資料夾：News、首頁影片）→ 關於、合作企業、師資、課程、作品、動態、紀錄、入學 → 規章與政策、捐款 → 聯絡 → 庫（資料夾：人名庫、單位庫、媒體庫；user 2026-11-24）、介面文字、網頁 icon（2026-11-25 跟著選單重排；報導、常見問題的集合刪了）。
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
職稱（教授、副教授…）不另開庫：師資的「校內職級」手打（user 2026-11-25 照 SCCD；11-21 選三個庫、不要職稱庫）；得獎人（學生）照打字（同 SCCD）。

| 庫 | 欄位 | 誰在用（M2O 欄位） |
|---|---|---|
| `people` 人名庫 | `name_zh`、`name_en` | `faculty.person` |
| `organizations` 單位庫 | `name_zh`、`name_en` | `partners.organization`、`records.organizer`、`faculty.external_units`（多選，經過 junction `faculty_external_units`；反向欄 `faculty_units`） |
| `media_outlets` 媒體庫 | `name_zh`、`name_en` | `records.media` |

## ui_labels（介面文字）

user 2026-11-21 照 SCCD：選單、頁名、固定的小標（專任教師、一年級、必修…）、404 的字。**一個 key 一筆**，`key` 唯讀（前台照 key 找），只改 `zh`／`en`。
HTML 在元素上標 `data-label="key"`，元素本身的字＝後台抓不到時的原文。新的 key：HTML 標好 `data-label`，再跑一次 `seed-directus.cjs` 就補進後台。
**頁名＝`nav.<slug>`**：選單、網站地圖、那一頁的頁標題、瀏覽器分頁標題都吃同一個（所以各頁的單例沒有頁名欄位）。

| key | 類型 | 內容 |
|---|---|---|
| `key` | String（唯一、唯讀） | 例 `nav.about`、`faculty.type.full_time`、`curriculum.year.1`、`curriculum.required`、`faculty.back`、`common.image`、`error.unknown` |
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

前台：`js/modules/ui/footer-cms.js`。抓到後台＝以後台為準，**欄位留空＝那一塊不顯示**。

**聯絡資訊＝清單，可以自己加**（user 2026-11-24：「聯絡的這個幫我做成跟老師內頁一樣，然後後臺可以 custom」「每個都有個 url，有寫就可以 jump 到那個 url」）：「聯絡資訊」欄位＝子集合 `footer_sections`，一個清單＝標題＋一筆一筆，樣子同師資詳細頁的清單（標題 Medium、清單之間 lg）。原本是寫死的五格 `email`／`tel`／`fax`／`address_zh`／`address_en`、標題在介面文字 `contact.*`：內容搬成四個清單（電子郵件、電話、傳真、地址），那四個介面文字刪了，舊的五格**藏起來、資料還在**（user 說不要了再刪）。

| key | 類型／介面 | 內容 |
|---|---|---|
| `instagram` | String／Input | Instagram 網址：聯絡頁那個 IG icon 連到這裡，留空＝不出 icon（user 2026-11-24：社群只要這一個 icon） |
| `youtube` | String／Input | YouTube 網址：聯絡頁 IG 右邊那個 YouTube icon 連到這裡，留空＝不出 icon（user 2026-11-24 加的） |
| `sections` | O2M → `footer_sections` | 聯絡資訊的清單，照拖曳順序；一筆都沒有的清單前台不出 |
| `badge` | Image | 標章圖 |

表單順序＝聯絡頁由上往下（IG、YouTube → 聯絡資訊 → 標章；user 2026-11-25）。**單位（設計學院、姊妹系所…）＝聯絡資訊的其中一個清單**（原本另一格 `links`，資料搬進來之後 2026-11-25 刪了）；舊的 `email`／`tel`／`fax`／`address_*`、`social` 同一天刪了（user：「沒用到的slot可以去掉了」）。

- 網址只接受 `https://`、`mailto:`、`tel:` 開頭，其他會變成無效連結。
- IG icon 的圖在網頁 icon（`site_icons` 的 `ig`）。

### footer_sections（聯絡資訊的清單；藏起來，從「聯絡」裡面新增）

| key | 類型／介面 | 內容 |
|---|---|---|
| `sort` | | 拖曳順序 |
| `footer` | M2O → `footer`（藏） | 所屬頁 |
| `title_zh` / `title_en` | String | 標題（例：電子郵件／E-Mail；英文留空＝顯示中文）。是內容、不是介面文字 |
| `entries` | JSON／Repeater | 一筆＝`text_zh`、`text_en`（英文留空＝顯示中文）、`url`（選填）。**連結有填＝那一筆可以點**：`https://` 開頭（另開新視窗）、`mailto:信箱`、`tel:電話`，直接貼信箱也當 mailto；其他開頭（`javascript:`…）＝不當連結。沒文字的那筆不出 |

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
搬的時候兩頁都有的那則（招生說明會）兩邊各一筆。入學依 `date` 新到舊；動態依「日期」第一段的開始新到舊（前台排，見下）。

**動態的日期照 SCCD 的活動**（user 2026-11-25：「動態的日期，前臺跟後臺都調整跟sccd的一樣」）：重複列 `dates`（一筆一段、可以好幾段：`start` 必填、`end` 空＝一天；三個勾選三選一＝勾一個另外兩個變唯讀：`monthOnly` 只到月、`monthRange` 月到月（忽略日）、`yearOnly` 只到年）＋`cancelled`（取消）。
前台 `cms-pages.js datesOf`：不分年（問過）＝每段帶開始的年，數字的中英同一行——`2025/03/05`、`2025/03/05 - 03/08`、跨年 `2024/12/28 - 2025/01/03`、好幾段用「, 」接；只到月 `2025 DEC`／`2025 十二月`；月到月 `2025 MAR - MAY`（跨年 `2024 DEC - 2025 FEB`）；只到年＝那一年（SCCD 寫 N/A：它左邊有年份欄）；取消＝`Canceled`／`取消`。
順序在前台排（`dateKey`：第一段的開始新到舊、只到年排在那一年最後、沒日期最後；JSON 後台排不了）。原本的 `date`／`end_date`：資料搬進 `dates`、2026-11-25 刪了。
**入學的時間用選的**（user 2026-11-24：「時間應該是用日期選擇，不是手動輸入」；原本是一行自己打的 `time_zh`／`time_en`）：`date`（必填）＋`end_date`；
**沒有開始／結束時間**（user 2026-11-24：「後臺不需要有 time 的設定」——動態的 `time`／`end_time` user 在後台刪掉，入學的「也拿掉，留下日期即可」；刪之前只有招生說明會那則填了 14:00–16:00）。
入學前台排成一行（`cms-pages.js timeOf`）：中文 `2025.12.20–12.27`（跨年才再寫年）、英文 `20–27 Dec 2025`；只填日期＝一天。
前台讀這兩個集合用 `fields=*`（＋相簿、附件那幾層），不一個一個點名：後台刪掉不要的欄位，前台照樣讀得到（點名一個不存在的欄位＝整串 403、退回示意）。

| key | 類型／介面 | 內容 |
|---|---|---|
| `dates` | JSON／Repeater | **動態**：日期，一筆一段（`start`、`end`、`monthOnly`／`monthRange`／`yearOnly` 三選一） |
| `cancelled` | Boolean | **動態**：取消（勾了＝日期那行換成取消／Canceled） |
| `date` | Date | **入學**：日期（必填；排序用） |
| `end_date` | Date | **入學**：結束日期（選填，跨天才填） |
| `title_zh` / `title_en` | String | 標題 |

`activities`（`pages/activities.html`）：每則是一個摺疊。收著＝縮圖＋標題＋副標；點開＝時間、地點（可以好幾個、沒填就不出）、相簿（影片排在照片前面）；點相簿的圖／影片放大到整個畫面。什麼都沒得展開＝那一列不能點。
**後台照 SCCD 的活動**（user 2026-11-24）：做了副標、地點可以好幾個、影片連結；SCCD 還有、這裡還沒做的＝說明文字、來賓／講者（人名庫）、相關文件（多段日期 2026-11-25 做了＝上面的 `dates`；`docs/ROADMAP.md` 第 5 節）。
**沒有分類、是副標**（user 2026-11-24：「參照 sccd 的設計…不會有什麼分類，我看到有入學什麼的，可以刪掉，這應該是改成副標才對」）：同 SCCD 活動的 `subtitles`、同這站師資／合作企業那種重複列。原本是一格 `category_zh`／`category_en`（招生、講座、參訪…），欄位連裡面的字後台都刪了。

| key | 類型／介面 | 內容 |
|---|---|---|
| `subtitles` | JSON／Repeater | 副標：標題下面的字，**一筆＝一行**，可拖曳排序；沒填＝只有標題。子欄位 `text_zh`、`text_en`（英文留空＝顯示中文） |
| `locations` | JSON／Repeater | 地點（選填，**可以好幾個**；user 2026-11-24 照 SCCD）：一筆＝點開後時間下面的一行。子欄位 `name_zh`、`name_en`、`city_zh`、`city_en`（城市，手打、選填）；user 2026-11-25：前台接在地點後面的括號裡，中文全形「地點（城市）」例「台北市中山區（臺北）」、英文半形「place (city)」例「Zhongshan (Taipei)」（「動態不需要國家」）。原本是一格 `place_zh`／`place_en`，搬成第一筆、舊欄位刪了 |
| `image` | Image | 那一列的縮圖 |
| `album` | Files（多張，junction `activities_album`） | 相簿；可拖曳排序；前台 `<img>` 帶檔案的寬高（一打開摺疊就排好） |
| `videos` | JSON／Repeater | 影片（選填；user 2026-11-24：「影片要有，因爲要做影片渲染」，照 SCCD 的 `videoLinks`）：一列一支，子欄位 `url`＝YouTube 連結，也可以貼直連的影片檔（.mp4、.m3u8）；只收 http(s)。前台排在相簿的照片**前面**：一格 16:9＝YouTube 的縮圖＋一顆 play（直連的檔沒有縮圖＝灰底），點了在放大畫面播、可以跟照片左右切 |

`admission`（`pages/admission.html`）：外面只有標題＋時間（沒有縮圖、分類）；點開＝說明 → 相簿 → 附件。首頁的 news 可以指到其中一則（`?item=<id>`＝打開那一則）。

| key | 類型／介面 | 內容 |
|---|---|---|
| `summary_zh` / `summary_en` | Text／Multiline | 說明文字（選填；點開的第一段；換行照留） |
| `album` | Files（多張，junction `admission_album`） | 相簿 |
| `attachments` | Files（多個，junction `admission_attachments`） | 附件（點開的連結清單，一個檔一個連結、連結文字＝檔案標題；點了＝下載：前台網址加 `?download`，user 2026-11-25，原本另開新視窗） |

## faculty（師資名單）＋ faculty_page（師資Hero）— 資料夾「師資」

`faculty_page` 單例只有導言 `lead_zh`／`lead_en`（頁標題下面那段）。

前台：`pages/faculty.html`（`item-list-cms.js`）依 `category` 分段，段落順序固定＝專任教師 → 兼任教師 → 行政管理（段名在介面文字 `faculty.type.*`＝後台「介面文字」分類「師資」那三筆，改了前台就跟著換），段內照 `sort`；某一類沒人＝那段不出。
第三段原本是「業界導師」（key `faculty.type.mentor`、類別值 `mentor`），user 2026-11-24 改成行政管理、key 也一起改＝`faculty.type.admin`、類別值 `admin`。類別下拉的選項文字是欄位設定、不會跟著介面文字變：之後只改顯示的名字，下拉要另外改。
點進 `faculty-detail.html?id=<id>`（`cms-pages.js`）：照片、名字＋副標、下面的清單（學歷、經歷…）。
**清單可以自己加**（user 2026-11-24：「跟關於一樣，我們可以自己加 list，然後自己去編輯裏面的內容」）：每位老師的「清單」欄位＝子集合 `faculty_sections`，一個清單＝標題＋一筆一筆（年份＋說明），在老師那一頁裡新增、拖曳排序；裡面一筆都沒有的清單前台不出。原本是寫死的六格（`education`／`experience`／`expertise`／`exhibitions`／`awards`／`publications`、標題在介面文字 `faculty.cv.*`）：學歷、經歷搬成每位老師的前兩個清單，其餘四格與那六個介面文字 user 說刪掉＝後台已經刪了。

| key | 類型／介面 | 內容 |
|---|---|---|
| `sort` | | |
| `category` | Dropdown | `part_time` 兼任教師／`full_time` 專任教師／`admin` 行政管理 |
| `photo` | Image | 照片 |
| `person` | M2O → 人名庫 | 姓名（user 2026-11-21；原本的 `name_zh`／`name_en` 2026-11-25 刪了） |
| `internal_titles` | JSON／Repeater | 校內職級（user 2026-11-25 照 SCCD 的 internalTitles：「前者是key的」）：手打、可多筆、可拖曳排序。子欄位 `title_zh`、`title_en`（例：教授、學程主任）；前台名字下面一筆一行 |
| `external_units` | M2M → 單位庫（junction `faculty_external_units`：`faculty_id`、`organizations_id`、`sort`） | 校外單位（同一天：「後者是從庫裏面選，跟sccd一樣」；SCCD 是職業庫或單位庫，這站只有單位庫）：可多選、可拖曳排序；前台接在校內職級下面 |
| `subtitles` | JSON／Repeater | 副標：名字下面的字，**一筆＝一行**，可拖曳排序；沒填＝只有名字。子欄位 `text_zh`、`text_en`；前台接在校外單位下面 |
| `sections` | O2M → `faculty_sections` | 清單（學歷、經歷…可以自己加），照拖曳順序 |

### faculty_sections（師資的清單；藏起來，從老師那一頁裡新增）

| key | 類型／介面 | 內容 |
|---|---|---|
| `sort` | | 拖曳順序 |
| `faculty` | M2O → `faculty`（藏） | 所屬老師；老師刪掉＝清單跟著刪 |
| `title_zh` / `title_en` | String | 清單標題（例：學歷／Education；英文留空＝顯示中文） |
| `entries` | JSON／Repeater | 一筆＝`year`（年份或標題，可以不填）、`text_zh`、`text_en`；沒說明的那筆不出 |

## partners（合作企業名單）＋ partners_page（合作企業Hero）— 資料夾「合作企業」

`partners_page` 單例只有導言 `lead_zh`／`lead_en`。

前台：`pages/partners.html`（`item-list-cms.js`）。**跟師資同一種列**：Logo＋企業名稱＋副標一行一個，照 `sort`。

| key | 類型／介面 | 內容 |
|---|---|---|
| `sort` | | |
| `logo` | Image | 列表左邊方形縮圖 |
| `organization` | M2O → 單位庫 | 企業名稱（user 2026-11-21；原本的 `name_zh`／`name_en` 2026-11-25 刪了） |
| `subtitles` | JSON／Repeater | 副標：名稱下面的字，**一筆＝一行**，可拖曳排序；沒填＝只有名稱。子欄位 `text_zh`、`text_en` |
| `url` | String | 企業網站：整列可點、另開新視窗；留空＝那列不可點 |

## courses（課程）

前台：`pages/curriculum.html` 依 `year` 分段（段名在介面文字 `curriculum.year.1`～`4`）；一門課一個摺疊：收著＝課名＋下面一行「必修／選修」（介面文字 `curriculum.required`／`elective`），點開＝課程說明（沒填＝不能點）。同年級必修在前、選修在後，各自照 `sort`。

| key | 類型／介面 | 內容 |
|---|---|---|
| `sort` | | |
| `year` | Integer／Dropdown | 1–4（一～四年級） |
| `category` | String／Dropdown（必填） | `required` 必修／`elective` 選修（user 2026-11-25：「後臺的必選修應該改成dropdown才對，不是checkbox」；原本一格勾選 `required`，資料搬過來、舊的那格刪了） |
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

## qa（常見問題）——2026-11-25 刪了

user：「QA這一頁可以拿掉了，包含後臺」＝前台的頁、選單那一項、這個集合、介面文字 `nav.qa` 都拿掉了。

## records（紀錄：榮譽與報導）

`pages/records.html`（紀錄頁，原本叫榮譽；後台顯示名「紀錄」，user 2026-11-25）。user 2026-11-25：榮譽、報導合在這一個集合（「將榮譽跟報導兩者合在一起，要可以上傳圖片，但兩者打開來都會是accordion」；報導頁拿掉了）。
每筆一個摺疊、照拖曳順序：收著＝國旗、標題、類型（當副標）；點開＝主辦方（榮譽）→ 內容（一筆一行）→ 圖片（一排橫捲、點了放大）。
**類型不用選、照填哪一格決定**（user 2026-11-25：「如果是寫標題的話，就會是award，如果是從庫裏面選的話，則是press，二選一」）：寫了「獎項名稱」＝榮譽；從媒體庫選了「媒體」＝報導，那一列的標題就是媒體的名字（報導標題、刊出日期寫在「內容」）。兩格互鎖（一格有值、另一格唯讀；`setup-directus.cjs LOCK`），報導沒有主辦方（那格藏起來）。前台 `cms-pages.js records()` 照有沒有選媒體分；類型顯示的字在介面文字 `records.type.award`／`records.type.press`（分類「榮譽」）。原本另外有一格下拉 `category`（award／press）、報導的標題也是自己打：那一格刪了，舊的報導把標題搬成內容的第一行。

| key | 類型／介面 | 內容 |
|---|---|---|
| `sort` | | 拖曳順序 |
| `country_code` | Dropdown | 國家（user 2026-11-25：「國家改成跟sccd一樣的drop down，預設是所有國家都可以選」；原本手打）：選項＝SCCD 後台那一份 249 國（`scripts/country-choices.json`；同一天：「動態不需要國家，紀錄才需要國家，且是往下拉的」），存 ISO 3166-1 兩碼小寫；前台照它抓國旗（flag-icons 的 SVG）、報讀的國名也從它產生（瀏覽器內建的國名 `Intl.DisplayNames`；原本另外兩格 `country_zh`／`country_en` 要人填，user 2026-11-25：「這個報讀是指無障礙嗎？這個不需要寫在後臺」＝刪了）。沒選＝那一列沒有國旗 |
| `title_zh` / `title_en` | String | 獎項名稱：**寫了＝榮譽**、那一列的標題。選了媒體＝這兩格唯讀 |
| `media` | M2O → 媒體庫 | 媒體：**選了＝報導**、那一列的標題＝媒體的名字。寫了獎項名稱＝這格唯讀 |
| `organizer` | M2O → 單位庫 | 主辦方（榮譽才有；選了媒體＝這格藏起來）：點開後的第一行（user 2026-11-25：「要，從庫裏面選」） |
| `details` | JSON／Repeater | 內容，一筆一行、可拖曳排序。子欄位 `text_zh`、`text_en`（英文留空＝顯示中文）。榮譽：得獎人、獎別…（排在主辦方下面）；報導：報導標題、刊出日期… |
| `album` | 多圖（junction `records_album`） | 圖片：得獎照片、報導截圖…點開後的一排、點了放大；可拖曳排序 |

- 舊欄位 `award_zh`／`award_en`（搬到標題）、`winner_*`、`prize_*`（搬成「內容」的一筆一筆）2026-11-25 刪了。
- 2026-11-25 搬資料：原本的榮譽照上面搬；舊的 `press` 集合每一則搬成一筆（類型＝報導、媒體照舊從媒體庫、截圖 → 圖片）後刪了。沒有國家代碼＝那一列不出國旗（user：「沒有放代碼就不渲染國旗」）。

## press（報導）——2026-11-25 刪了

併進上面的 `records`（類型＝報導）；前台的報導頁、選單那一項、介面文字 `nav.press` 都拿掉了。媒體庫還在（`records.media` 在用）。

## regulations（規章與政策）— 單例

一頁一筆（user 2026-11-22，照 SCCD；原本規章是一筆一列的清單、條款在 `pages`）。**只放連結、不上傳檔案**（user：不會有 PDF）。
前台：上面規章、表單依 `category_zh` 分段（照第一次出現的順序）；一條一列＝名稱＋副標（同入學那種列、不展開），整列連到 `url`、另開新視窗（只放行 http(s)；沒填＝那列不能點）。下面接文字段落（使用條款、隱私權政策）。
沒填的部分＝照 HTML 的示意。

| key | 類型／介面 | 內容 |
|---|---|---|
| `items` | JSON／Repeater | 規章、表單，一列一筆、可拖曳排序。子欄位 `category_zh`／`category_en`（分類）、`title_zh`／`title_en`（名稱）、`subtitles_zh`／`subtitles_en`（副標，多行文字、**一行＝前台一行**，例 2026.08 修訂）、`url` |
| `sections` | O2M → regulations_sections | 文字段落（使用條款、隱私權政策…）＝**同關於、捐款的段落**（user 2026-11-24：「使用條款就是跟 about 的一樣，也讓後臺可以 custom 這個文字」）：`regulations_sections`（＋`regulations_sections_images`）→ `regulations_subsections`（＋`regulations_subsections_images`），欄位跟下面 about_* 一樣（沒有舊欄位；`setup-directus.cjs pageSections()` 建的），前台抓的欄位也一樣（`TEXT_SECTIONS`）。原本是 JSON 重複列、內文一整段 WYSIWYG，2026-11-24 刪掉、那兩段的內文搬成「說明」（一個 `<p>` 一段） |

## about（關於段落）＋ about_page（關於Hero）、donate（捐款段落）＋ donate_page（捐款Hero）— 資料夾「關於」「捐款」

一頁一筆（user 2026-11-22，照 SCCD）。**頁名不在這裡**＝介面文字 `nav.<slug>`。
**導言（後台叫 Hero）每一頁自己一個單例**（user 2026-11-25：「後臺我想要每個頁面的hero文字都分開，不要混在一起」）：`<頁>_page`「○○Hero」只有 `lead_zh`／`lead_en`，跟那一頁的其他內容收在同一個資料夾——師資、合作企業本來就是；關於、捐款原本導言跟段落寫在同一個單例，同一天拆成 `about_page`／`donate_page`（資料搬過去、`about`／`donate` 的 `lead_*` 刪了），原本的單例改叫「關於段落」「捐款段落」、只剩 `sections`。沒有導言的頁（課程、作品、動態、紀錄、入學、規章、聯絡）沒有 Hero 單例。
前台：導言（`<頁>_page`）換掉 `.page-lead`；有段落（`about`／`donate`）就整段換掉（標題 → 輪播 → 說明 → 小節 → 年表，關於、捐款一樣）——兩個各抓各的，一個抓不到另一個照換。
**捐款＝同關於**（user 2026-11-24：「捐款頁面應該比照 about 的去調整」；原本 `donate.sections` 是 JSON 重複列、內文一整段 WYSIWYG，2026-11-24 刪掉、兩段的內文搬成「說明」）：
`donate.sections` → `donate_sections`（＋`donate_sections_images`）→ `donate_subsections`（＋`donate_subsections_images`），欄位跟下面 about_* 一樣，前台抓的欄位也一樣（cms-pages.js `TEXT_SECTIONS`）。

| 集合 | key | 類型／介面 | 內容 |
|---|---|---|---|
| about_page／donate_page | `lead_zh` / `lead_en` | Text／Multiline | 導言（Hero；頁標題下面那段） |
| about／donate | `sections` | O2M → about_sections／donate_sections | 段落（在同一個表單裡新增、可拖曳排序；`*_sections` 在後台選單裡藏起來）。**段落要放輪播圖、重複列放不了檔案**，所以是子集合 |
| about_sections | `sort`、`about` | | `about`＝所屬的那一筆 |
| about_sections | `title_zh` / `title_en` | String | 段落標題（h2＝左側段落導覽） |
| about_sections | `images` | Files（多張，junction `about_sections_images`） | 段落圖片輪播（標題下面那排；沒放＝不出輪播） |
| about_sections | `description_zh` / `description_en` | Text／Multiline | **說明**（選填，user 2026-11-23）：段落圖片下面、小節上面那段；多行純文字，換行照留、空一行＝分段 |
| about_sections | `subsections` | O2M → about_subsections | **小節**（user 2026-11-23：不要一整段 rich text，一個小節一筆、可以一直加；同一天加了圖片、附註 → 重複列放不了檔案，改子集合）。在段落的表單裡新增、可拖曳排序；`about_subsections` 在後台選單裡藏起來 |
| about_sections | `timeline` | JSON／Repeater | **年表**（user 2026-11-23，「沿革」那段用）＝同師資的學歷：一列一筆、子欄位 `year`／`text_zh`／`text_en`；前台排在小節後面，年份一行、說明一行（沒年份＝只有說明），筆與筆之間 `--spacing-xs` |
| about_subsections | `sort`、`section` | | `section`＝所屬的段落 |
| about_subsections | `title_zh` / `title_en` | String | 小節標題（h3，選填） |
| about_subsections | `images` | Files（M2M，junction `about_subsections_images`） | 圖片（選填，**可以多張**，user 2026-11-24）：標題下面、內文上面。一張＝照原比例、寬＝內文欄，**最高 16rem**（user 2026-11-23；page.css `.page-section > img`），更高的等比縮小、在內文欄正中（原本靠左）；多張＝輪播（同段落圖片，照拖曳順序、框高同一張圖），跟小節標題隔 xs（同一張圖） |
| about_subsections | `text_zh` / `text_en` | Text／Multiline | 內文，多行純文字：換行照留、**空一行＝分段** |
| about_subsections | `note_zh` / `note_en` | Text／Multiline | 小節的附註（選填）：小節最後一行小字（text-xs） |

小節前台的排法＝標題 → 圖 → 內文 → 附註，有才排；塊與塊之間（含分段）隔 `--spacing-sm`；沒標題＝第一塊自己隔 `--spacing-md`（同小節標題的上距）。

**後台沒有 WYSIWYG（rich text）的段落了**（2026-11-24：捐款、規章的條款都改成同關於）：前台讀的全是純文字、一律 escape，原本的 sanitize 與「中英各一份 HTML 跟著語言只顯示一份」（`.cms-rich`／`[data-lang-block]`）一起拿掉了。最後一個 WYSIWYG 欄位 `about_sections.body_*`（藏起來的舊欄位）2026-11-25 刪了。
