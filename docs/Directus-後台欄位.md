# SCAID Directus 後台欄位

後台：`https://scaidcms.usc.edu.tw/admin/`（Directus 12，Core 方案：帳號上限 3、**collection 上限 25**，現在 18 個）。
前台要抓的欄位都列在這裡。**集合名、欄位 key 要一字不差**，前台照名字抓。

**建法：不用手點，跑 `node scripts/setup-directus.cjs`**（2026-11-18 起）。已存在的集合／欄位／關聯／權限會跳過，可以重跑；
要加欄位＝改 script 裡的 SPEC 再跑一次，同時補這份文件。token 放 `scripts/.directus-token`（gitignore）。先 `--dry` 看會做什麼。
舊欄位只藏不刪（SPEC 的 `HIDE`），確定不要了再刪。

**放資料：`node scripts/seed-directus.cjs`**（2026-11-21 全站接後台時跑過一次）：直接解析各頁 HTML 的示意內容寫進後台——
庫（人名／單位／媒體）→ 內容 → 文字頁 → 介面文字。可重跑：內容集合還是空的才塞、庫只補沒有的名字、介面文字只補沒有的 key（後台改過的不蓋）。
只放文字；圖（相簿、封面、截圖、段落輪播）之後在後台上傳（user 2026-11-21）。

共通：
- 每個集合 Public 角色都已開 Read（含 `directus_files` 與 junction 表，前台 `/assets` 才讀得到圖）。
  **Core 方案不給條件式權限**（只讀 published 是付費功能）→ Public 全開、前台抓列表時自己帶 `filter[status][_eq]=published`；草稿知道網址就讀得到，接受。
- 後台網域只填在 `js/config/api.js` 一處（script 也從那裡讀）。
- 中英文欄位用 `_zh`／`_en` 成對；英文留空＝英文版顯示中文。
- 有 `status` 的集合：上架 `published`／草稿 `draft`（預設上架）；有 `sort` 的在後台列表可拖曳排序，前台照 `sort`。
- 圖片欄位的替代文字＝檔案標題（在檔案庫改）。
- **前台**（user 2026-11-21 全站接上）：每頁 HTML 裡的是示意內容＝後台抓不到、或那個集合還沒有任何一筆時照舊顯示；抓到＝換成後台的。
  各頁的渲染在 `js/modules/pages/cms-pages.js`；師資／合作企業列表 `js/modules/ui/item-list-cms.js`；聯絡頁 `footer-cms.js`；介面文字 `ui-labels.js`。

## 庫：people（人名庫）／organizations（單位庫）／media_outlets（媒體庫）

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
**頁名＝`nav.<slug>`**：選單、網站地圖、那一頁的頁標題、瀏覽器分頁標題都吃同一個（所以 `pages` 的 `title_*` 藏起來了）。

| key | 類型 | 內容 |
|---|---|---|
| `key` | String（唯一、唯讀） | 例 `nav.about`、`faculty.type.full_time`、`curriculum.year.1`、`curriculum.required`、`faculty.cv.education`、`contact.email`、`common.image`、`error.lead` |
| `zh` / `en` | String | 中文／英文（英文留空＝顯示中文） |
| `category` | Dropdown（可自填） | 後台整理用（選單與頁名、底列與共用、師資、課程、聯絡、榮譽、404），前台不看 |

## footer（聯絡頁；原本是頁尾）— 單例

前台：`js/modules/ui/footer-cms.js`。抓到後台＝以後台為準，**欄位留空＝那一列不顯示**。

| key | 類型／介面 | 內容 |
|---|---|---|
| `email` | String／Input | 電子郵件 |
| `tel` | String／Input | 電話（中英共用） |
| `fax` | String／Input | 傳真（中英共用） |
| `address_zh` | String／Input | 地址（中文） |
| `address_en` | String／Input | 地址（英文） |
| `social` | JSON／Repeater | 社群連結，可拖曳排序。子欄位：`label`（名稱，給報讀用，例 Instagram）、`url` |
| `links` | JSON／Repeater | 姊妹系所連結，一列一筆、可拖曳排序；前台一行一個、寫全名（user 2026-11-21，原本是縮寫排一列）。子欄位：`label_zh`（全名，例 媒體傳達設計學系）、`label_en`（英文全名，留空＝顯示中文）、`url`。舊資料只有 `label` 的前台照它顯示 |
| `badge` | Image | 標章圖 |

- 網址只接受 `https://`、`mailto:`、`tel:` 開頭，其他會變成無效連結。
- 欄位標籤（電子郵件／電話／傳真／地址）在介面文字（`contact.*`）；社群 icon 圖還沒定，目前是方框。

## news（動態）

前台：首頁展開清單（最近 8 則：標題、有說明就第二行、圖）、底列跑馬燈（最近 8 則的標題）、`pages/news.html`（全部、不分年份）、`pages/admission.html`（勾了 `admission` 的）。依 `date` 新到舊。

`pages/news.html`：每則是一個摺疊。收著＝縮圖（`image`）＋標題＋分類；點開＝時間、地點（沒填就不出那一行）、相簿；點相簿的圖放大到整個畫面。什麼都沒得展開＝那一列不能點。
`pages/admission.html`：**入學頁＝勾了「入學」的動態**（user 2026-11-21 定：勾選，不看分類），一則同時也在動態頁。外面只有標題＋時間（沒有縮圖、分類）；點開＝說明 → 相簿 → 附件。

| key | 類型／介面 | 內容 |
|---|---|---|
| `status` | 上架／草稿 | |
| `date` | Date | 日期（排序用；沒填 `time_*` 時顯示在「時間」那一行） |
| `title_zh` / `title_en` | String | 標題 |
| `category_zh` / `category_en` | String | 分類（動態頁標題下面那一行，例：講座、參訪、展覽） |
| `time_zh` / `time_en` | String | 時間的顯示文字（選填，例：2026.11.22 14:00–16:00；空的就顯示 `date`） |
| `place_zh` / `place_en` | String | 地點（選填） |
| `admission` | Boolean | 勾＝也列在入學頁 |
| `summary_zh` / `summary_en` | Text／Multiline | 說明文字（選填；首頁清單第二行；入學頁點開的第一段；換行照留） |
| `image` | Image | 圖片（動態頁那一列的縮圖；首頁清單那格） |
| `album` | Files（多張，junction `news_album`） | 相簿；可拖曳排序；前台 `<img>` 帶檔案的寬高（一打開摺疊就排好） |
| `attachments` | Files（多個，junction `news_attachments`） | 附件（入學頁點開的連結清單，一個檔一個連結、連結文字＝檔案標題、另開新視窗） |
| `link` | String | 外部連結（選填，前台目前沒用到） |

## faculty（師資）

前台：`pages/faculty.html`（`item-list-cms.js`）依 `category` 分段，段落順序固定＝專任教師 → 兼任教師 → 業界導師（段名在介面文字 `faculty.type.*`），段內照 `sort`；某一類沒人＝那段不出。
點進 `faculty-detail.html?id=<id>`（`cms-pages.js`）：照片、名字＋副標、各段履歷（段名在介面文字 `faculty.cv.*`；空的段不出）。

| key | 類型／介面 | 內容 |
|---|---|---|
| `status`、`sort` | | |
| `category` | Dropdown | `part_time` 兼任教師／`full_time` 專任教師／`mentor` 業界導師 |
| `photo` | Image | 照片 |
| `person` | M2O → 人名庫 | 姓名（user 2026-11-21；原本的 `name_zh`／`name_en` 藏起來了） |
| `subtitles` | JSON／Repeater | 副標：名字下面的字，**一筆＝一行**，可拖曳排序；沒填＝只有名字。子欄位 `text_zh`、`text_en`（例：學程主任、教授） |
| `education`、`experience`、`expertise`、`exhibitions`、`awards`、`publications` | JSON／Repeater | 學歷／經歷／專長／展覽／獲獎／著作；子欄位 `year`（年份或標題，專長留空）、`text_zh`、`text_en` |

## partners（合作企業）

前台：`pages/partners.html`（`item-list-cms.js`）。**跟師資同一種列**：Logo＋企業名稱＋副標一行一個，照 `sort`。

| key | 類型／介面 | 內容 |
|---|---|---|
| `status`、`sort` | | |
| `logo` | Image | 列表左邊方形縮圖 |
| `organization` | M2O → 單位庫 | 企業名稱（user 2026-11-21；原本的 `name_zh`／`name_en` 藏起來了） |
| `subtitles` | JSON／Repeater | 副標：名稱下面的字，**一筆＝一行**，可拖曳排序；沒填＝只有名稱。子欄位 `text_zh`、`text_en` |
| `url` | String | 企業網站：整列可點、另開新視窗；留空＝那列不可點 |

## courses（課程）

前台：`pages/curriculum.html` 依 `year` 分段（段名在介面文字 `curriculum.year.1`～`4`）；一門課一個摺疊：收著＝課名＋下面一行「必修／選修」（介面文字 `curriculum.required`／`elective`），點開＝課程說明（沒填＝不能點）。同年級必修在前、選修在後，各自照 `sort`。

| key | 類型／介面 | 內容 |
|---|---|---|
| `status`、`sort` | | |
| `year` | Integer／Dropdown | 1–4（一～四年級） |
| `required` | Boolean | 勾＝必修、不勾＝選修 |
| `name_zh` / `name_en` | String | 課程名稱 |
| `description_zh` / `description_en` | Text／Multiline | 課程說明（一段，可以很長；換行照留） |

## qa（常見問題）

前台依 `category_zh` 分段（分類名一樣的排同一段，照第一次出現的順序），每題一個摺疊。

| key | 類型／介面 | 內容 |
|---|---|---|
| `status`、`sort` | | |
| `category_zh` / `category_en` | String | 分類 |
| `question_zh` / `question_en` | String | 問題 |
| `answer_zh` / `answer_en` | Text／Multiline | 回答（純文字，換行照留） |

## records（榮譽）

`pages/records.html`：每筆一個摺疊：收著＝國旗、獎項名稱、得獎人；點開＝主辦方、獎別。

| key | 類型／介面 | 內容 |
|---|---|---|
| `status`、`sort` | | |
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
| `status` | | |
| `date` | Date | 刊出日期（排序用，前台不顯示） |
| `title_zh` / `title_en` | String | 報導標題 |
| `media` | M2O → 媒體庫 | 媒體 |
| `screenshot` | Image | 報導截圖（點了放大看的那張） |

## regulations（規章）

前台「規章與政策」頁的規章段落：依 `category_zh` 分段；一條一列＝規章名稱＋副標（同入學那種列、不展開），整列連到 `file`（有就優先）或 `url`、另開新視窗；兩個都沒填＝那列不能點。
同一頁後面的文字段落（使用條款、隱私權政策）走 `pages` 的 `regulations` 那一筆。

| key | 類型／介面 | 內容 |
|---|---|---|
| `status`、`sort` | | |
| `category_zh` / `category_en` | String | 分類 |
| `title_zh` / `title_en` | String | 規章名稱 |
| `subtitles` | JSON／Repeater | 副標：名稱下面的字，**一筆＝一行**（例：2026.08 修訂、PDF 檔）。子欄位 `text_zh`、`text_en` |
| `file` | File | PDF |
| `url` | String | 外部連結（只放行 http(s)） |

## pages（文字頁）＋ page_sections（段落）

`pages` 一頁一筆，**主鍵 `slug`＝前台 route**（建好不要改）：現在有 about、donate、regulations（段落＋導言）與 faculty、partners（只有導言）。
段落在同一個表單下方「段落」新增（`page_sections`，後台選單裡藏起來）。**頁名不在這裡**＝介面文字 `nav.<slug>`。
前台：導言換掉 `.page-lead`；有段落就整段換掉（標題 → 輪播 → 內文）。

| 集合 | key | 類型／介面 | 內容 |
|---|---|---|---|
| pages | `slug` | String（主鍵） | about／donate／regulations／faculty／partners |
| pages | `lead_zh` / `lead_en` | Text／Multiline | 導言（頁標題下面那段） |
| pages | `sections` | O2M → page_sections | 段落清單（可拖曳排序） |
| page_sections | `status`、`sort`、`page` | | `page`＝所屬頁 slug |
| page_sections | `title_zh` / `title_en` | String | 段落標題（h2＝左側段落導覽） |
| page_sections | `body_zh` / `body_en` | Text／WYSIWYG | 內文 HTML（工具列只留粗體／斜體／h3／清單／連結）。中英各一份，前台跟著語言只顯示一份；**塞進去前過 sanitize**（只放行這幾個標籤與 `mt-sm`／`mt-md`／`text-xs` 三個 class） |
| page_sections | `images` | Files（多張，junction `page_sections_images`） | 段落圖片輪播（標題下面那排；沒放＝不出輪播） |
