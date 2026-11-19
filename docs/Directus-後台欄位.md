# SCAID Directus 後台欄位

後台：`https://scaidcms.usc.edu.tw/admin/`（Directus 12，Core 方案：帳號上限 3、collection 上限 25）。
前台要抓的欄位都列在這裡。**集合名、欄位 key 要一字不差**，前台照名字抓。

**建法：不用手點，跑 `node scripts/setup-directus.cjs`**（2026-11-18 起）。已存在的集合／欄位／關聯／權限會跳過，可以重跑；
要加欄位＝改 script 裡的 SPEC 再跑一次，同時補這份文件。token 放 `scripts/.directus-token`（gitignore）。先 `--dry` 看會做什麼。

共通：
- 每個集合 Public 角色都已開 Read（含 `directus_files`，前台 `/assets` 才讀得到圖）。
  **Core 方案不給條件式權限**（只讀 published 是付費功能）→ Public 全開、前台抓列表時自己帶 `filter[status][_eq]=published`；草稿知道網址就讀得到，接受。
- 後台網域只填在 `js/config/api.js` 一處（script 也從那裡讀）。
- 中英文欄位用 `_zh`／`_en` 成對；英文留空＝英文版顯示中文。
- 有 `status` 的集合：上架 `published`／草稿 `draft`（預設上架）；有 `sort` 的在後台列表可拖曳排序，前台照 `sort`。
- 圖片欄位的替代文字＝檔案標題（在檔案庫改）。

## footer（頁尾）— 單例

前台：`js/modules/ui/footer-cms.js`。抓到後台＝以後台為準，**欄位留空＝那一列不顯示**。
建好時已塞進 `pages/footer.html` 的示意值（grep「示意」），接真資料直接在後台改。

| key | 類型／介面 | 內容 |
|---|---|---|
| `email` | String／Input | 電子郵件 |
| `tel` | String／Input | 電話（中英共用） |
| `fax` | String／Input | 傳真（中英共用） |
| `address_zh` | String／Input | 地址（中文） |
| `address_en` | String／Input | 地址（英文） |
| `social` | JSON／Repeater | 社群連結，可拖曳排序。子欄位：`label`（名稱，給報讀用，例 Instagram）、`url` |
| `links` | JSON／Repeater | 姊妹系所連結，可拖曳排序。子欄位：`label`（顯示文字，例 SCCD）、`url` |
| `badge` | Image | 標章圖 |
| `copyright_zh` | String／Input | 版權文字（中文） |
| `copyright_en` | String／Input | 版權文字（英文） |

- 網址只接受 `https://`、`mailto:`、`tel:` 開頭，其他會變成無效連結。
- 欄位標籤（電子郵件／電話／傳真／地址）、logo 屬於版面，不在後台。社群 icon 圖還沒定，目前是方框。

## news（動態）

前台：首頁展開清單、底列最新一則、`pages/news.html`（依年份分段）。依 `date` 新到舊。

`pages/news.html`（user 2026-11-18）：每則是一個摺疊。收著＝縮圖（`image`）＋標題＋分類，日期不寫在外面；
點開＝時間、地點（沒填就不出那一行），下面相簿（沒有就不出），點相簿的圖放大到整個畫面。

`pages/admission.html`（user 2026-11-18）：**入學頁＝一則一則的動態**，跟動態頁同一種列、不另外做別種版型，不分年份。
跟動態頁不同：外面只有標題＋時間（不顯示分類；不顯示縮圖 `image`，user 2026-11-19）。點開的順序＝說明文字（`summary_*`）→ 相簿（`album`）→ 附件（`attachments`，粗體、另開新視窗的連結），有填才出；入學頁不顯示地點。
哪幾則會列在入學頁＝勾了 `admission` 的（**待確認**：也可以改成看分類）。

| key | 類型／介面 | 內容 |
|---|---|---|
| `status` | 上架／草稿 | |
| `date` | Date | 日期（分年份、排序用；沒填 `time_*` 時也拿來顯示在「時間」那一行） |
| `title_zh` / `title_en` | String | 標題 |
| `category_zh` / `category_en` | String | 分類（列表標題下面那一行，例：講座、參訪、展覽）**← 2026-11-18 新增，後台待補** |
| `time_zh` / `time_en` | String | 時間的顯示文字（選填，例：2026.11.22 14:00–16:00；空的就顯示 `date`）**← 新增，後台待補** |
| `place_zh` / `place_en` | String | 地點（選填）**← 新增，後台待補** |
| `album` | Files（多張圖片） | 相簿（選填）**← 新增，後台待補**。前台渲染時 `<img>` 要帶檔案的 `width`／`height`（`directus_files` 有），一打開摺疊就排好、chevron 當下決定 |
| `attachments` | Files（多個檔案） | 附件（選填；展開內容裡「附件」那一行，一個檔一個連結、連結文字＝檔案標題）**← 2026-11-18 新增，後台待補** |
| `admission` | Boolean | 勾＝也列在入學頁 **← 新增、待確認，後台待補** |
| `summary_zh` / `summary_en` | Text／Multiline | 說明文字（選填；首頁清單第二行；入學頁展開內容的第一段。動態頁目前沒用到） |
| `image` | Image | 圖片（首頁清單那格；動態頁那一列的縮圖） |
| `link` | String | 外部連結（選填） |

## faculty（師資）

前台：`pages/faculty.html` 依 `category` 分段，段落順序固定＝專任教師 → 兼任教師 → 業界導師（前台寫死，不看後台下拉選單的排列），段內照 `sort`；點進 `faculty-detail.html?id=`。名字／單位跟語言切（同其他 `_zh`／`_en`）。

| key | 類型／介面 | 內容 |
|---|---|---|
| `status`、`sort` | | |
| `category` | Dropdown | `part_time` 兼任教師／`full_time` 專任教師／`mentor` 業界導師（中英顯示字在前台） |
| `photo` | Image | 照片 |
| `name_zh` / `name_en` | String | 姓名 |
| `affiliation_zh` / `affiliation_en` | String | 任職單位 |
| `education`、`experience`、`expertise`、`exhibitions`、`awards`、`publications` | JSON／Repeater | 學歷／經歷／專長／展覽／獲獎／著作，每段一個清單；子欄位 `year`（年份或標題）、`text_zh`、`text_en`。空清單＝該段不顯示 |

## partners（合作企業）

| key | 類型／介面 | 內容 |
|---|---|---|
| `status`、`sort` | | |
| `logo` | Image | 列表左邊方形縮圖 |
| `name_zh` / `name_en` | String | 企業名稱 |
| `description_zh` / `description_en` | Text／Multiline | 合作內容 |
| `url` | String | 企業網站：整列可點、另開新視窗；留空＝那列不可點 |

## courses（課程）

前台：`pages/curriculum.html` 依 `year` 分段，每個年級裡再依 `required` 分成必修／選修兩組（小標寫一次、課名排在下面；沒有課的那組不出），組內照 `sort`。

| key | 類型／介面 | 內容 |
|---|---|---|
| `status`、`sort` | | |
| `year` | Integer／Dropdown | 1–4（一～四年級） |
| `required` | Boolean | 勾＝必修、不勾＝選修 |
| `name_zh` / `name_en` | String | 課程名稱 |
| `description_zh` / `description_en` | Text／Multiline | 課程說明（詳細頁 `curriculum-detail` 課名下面那一段；只有這一段，沒有年級／必選修、沒有其他段落） |

## qa（常見問題）

前台依 `category_zh` 分段（分類名一樣的排同一段），每題一個 `<details>`。

| key | 類型／介面 | 內容 |
|---|---|---|
| `status`、`sort` | | |
| `category_zh` / `category_en` | String | 分類 |
| `question_zh` / `question_en` | String | 問題 |
| `answer_zh` / `answer_en` | Text／Multiline | 回答（純文字） |

## records（榮譽）— 後台待建

`pages/records.html`（user 2026-11-19）。每筆一個 `<details>`：收著＝國旗、獎項名稱、得獎人；點開＝主辦方、獎別。
`scripts/setup-directus.cjs` 的 SPEC 還沒加這個集合。

| key | 類型／介面 | 內容 |
|---|---|---|
| `status`、`sort` | | |
| `country_code` | String／Dropdown | 國家代碼，ISO 3166-1 兩碼小寫（tw／jp／de…）；前台照它抓國旗（flag-icons 的 SVG） |
| `country_zh` / `country_en` | String | 國家名稱（畫面上不顯示，給報讀用） |
| `award_zh` / `award_en` | String | 獎項名稱 |
| `winner_zh` / `winner_en` | String | 得獎人 |
| `organizer_zh` / `organizer_en` | String | 主辦方 |
| `prize_zh` / `prize_en` | String | 獎別（金獎、佳作…） |

## regulations（規章）

前台依 `category_zh` 分段；每條連到 `file`（有就優先）或 `url`。

| key | 類型／介面 | 內容 |
|---|---|---|
| `status`、`sort` | | |
| `category_zh` / `category_en` | String | 分類 |
| `title_zh` / `title_en` | String | 規章名稱 |
| `file` | File | PDF |
| `url` | String | 外部連結 |

## pages（文字頁）＋ page_sections（段落）

about／admission／donate／terms 這類整頁文字：`pages` 一頁一筆，**主鍵 `slug`＝前台 route**（建好不要改）；段落在同一個表單下方「段落」新增（`page_sections`，後台選單裡藏起來）。
前台抓 `/items/pages/<slug>?fields=*,sections.*&deep[sections][_filter][status][_eq]=published&deep[sections][_sort]=sort`。

| 集合 | key | 類型／介面 | 內容 |
|---|---|---|---|
| pages | `slug` | String（主鍵） | about／admission／donate／terms… |
| pages | `title_zh` / `title_en` | String | 頁標題（h1） |
| pages | `lead_zh` / `lead_en` | Text／Multiline | 導言（選填，`.page-lead`） |
| pages | `sections` | O2M → page_sections | 段落清單（可拖曳排序） |
| page_sections | `status`、`sort`、`page` | | `page`＝所屬頁 slug |
| page_sections | `title_zh` / `title_en` | String | 段落標題（h2＝左側段落導覽） |
| page_sections | `body_zh` / `body_en` | Text／WYSIWYG | 內文 HTML（工具列只留粗體／斜體／h3／清單／連結）。**前台塞進去前要過 sanitize**（只放行這幾個 tag），不是 `escapeHtml` |

## 還沒接的

donate 的捐款按鈕連結：先寫在 page_sections 內文的連結裡；真的需要再開欄位。

admission（2026-11-18 改）：不再是整頁文字，整頁是 `news` 裡勾了 `admission` 的那幾則（見上面 news）；`pages` 的 admission 那一筆只剩頁標題（＋導言），`sections` 不用了。下載用的檔案＝那一則的 `attachments`。
