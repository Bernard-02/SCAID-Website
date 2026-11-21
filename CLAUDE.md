# SCAID 網站專案指南

## 專案概述
**實踐大學AI設計職人學位學程**（Bachelor Program in Advanced Integrated Design, Shih Chien University，簡稱 SCAID）官方網站。
骨架 2026-11-03 從 **SCCD Website**（`../SCCD Website`，媒傳系官網）的基礎檔精簡搬來：原生 JS SPA、無框架；
內容走 **Directus headless CMS**（`scaidcms.usc.edu.tw`，**2026-11-21 全站接上**：各頁的示意文字已寫進後台，之後在後台改；圖之後在後台上傳）。見下「後台」。

## 設計決策（user 2026-11-03 拍板，參考圖＝2022 degree show 站）
- **網站是彩色的，不是黑白**（user 2026-11-19 更正；這條原本寫「黑白品牌：只有黑／白＋灰階」）：殼與文字目前是黑字白底，但不要因為「黑白」把內容（圖片、國旗…）轉成灰階或避開顏色。
- **字體**：英文 JetBrains Mono（Google Fonts）、中文 **Glow Sans TC Compressed**（未來熒黑 v0.93，OFL；user 2026-11-18）（一個堆疊 `font-sans`）。
  - 中文字體 Google Fonts 沒有 → 自架：`fonts/glow-sans-tc-compressed/`＝woff2 切片（Regular＋Medium＋Bold 各 104 片，照 Google 切 Noto Sans TC 的 unicode-range，瀏覽器只抓用到的）＋`font.css`（各頁 `<head>` 連）。全由 `scripts/build-fonts.py` 產生，不要手改；換字重／版本重跑（用法見檔頭）。
    網址都帶 `?v=內容雜湊`（font.css 裡每片 woff2、各頁 `<head>` 連 font.css 那行——後者 script 重跑時自動改全部頁面；新頁複製既有頁的 `<head>` 就會被改到）：重切後瀏覽器才不會拿新 CSS 配舊字檔（搬過片的字會掉回系統字體，2026-11-18「即」踩過）。
  - **中文字距照 logo 的中文**（user 2026-11-21）：`images/Logo Text.svg` 那行中文＝Glow Sans **J** Compressed **Medium**（拿外框比對，誤差 0.06%）、相鄰兩字原點相距 1.005em，字體原本字寬 0.8em → 切片時每個字的字寬多加 0.205em（`build-fonts.py TRACKING = 205`；`hmtx` 與 CFF 外框自己記的寬**兩處都改**，WebKit 照後者排、只改 hmtx 沒用）。燒在字體裡＝只有中文字體的字（含中文標點）變寬，英數走 JetBrains Mono 不變（logo 那行裡的「AI」也是原本的字距）；**不要用 CSS `letter-spacing` 做這件事**（分不出中英文）。空加在字的右邊、行首不動（同 letter-spacing）。logo 的字距再改＝重量、改 `TRACKING` 重跑；煙霧測試守「中文每字 1.005em、英數 0.6em」。
  - 這顆字的 TC 版走**傳承字形**（舊字形：為→爲、即→卽、既→旣…），而且**缺 10 個常用字**（教清真值告填慎鎮顛巔，上游 issue #22 未修、專案停更）→ **缺的字用 J 版補**（user 2026-11-18）：TC 沒有而 Glow Sans J Compressed 有的 36 個字（那 10 個＋少數異體字與符號）從 J 版切一片 `<字重>-j.woff2`、掛在同一個 font-family（兩版度量與字寬相同；補進來的是日本寫法的新字形）。只收 Google 那組約 1.4 萬字，更罕用的退回系統字體。
  - TC 有收、卻畫成「另一個字」的 11 個字（為即偽查緒鄉俱…）也改從 J 切（`build-fonts.py USE_J`，要再換哪個字就加進那串重跑）；「程」也換 J（user 2026-11-21 指定，課程的程）。**不要整批換成 J**：TC 與 J 有約 3,500 個常用字畫法不同，J 是日本寫法（海、漢、器、類、標點靠左下…），TC 的傳承字形在這些字上反而接近台灣寫法、標點也置中；既概者神飯這類「部件是舊寫法」的字目前沒動（user 未定）。
- **手機優先**：token `:root` 是手機值、`@media (min-width: 768px)` 放大；Tailwind 先寫無前綴再加 `md:`。
- **一般 grid**：`.site-grid` 手機 4 欄 → ≥768 12 欄。
- **中英分開**：中文寫在內文、英文寫 `data-en`（`lang.js` 第一次套用時把中文記到 data-zh，來回切）；全站標題、示意文字、底列名字、聯絡頁都要標。選單最下方 `.lang-btn` 切換（localStorage）。
- **後台**（user 2026-11-21：全站接 Directus、照 SCCD 加人名庫與 ui labels；欄位表＝`docs/Directus-後台欄位.md`）：
  - **每頁 HTML 裡的內容＝備援**：後台抓不到、或那個集合還沒有任何一筆＝照舊顯示 HTML；抓到＝換成後台的（版型照抄 HTML 那份標記）。渲染在 `js/modules/pages/cms-pages.js`（各頁）、`ui/item-list-cms.js`（師資／合作企業列表）、`ui/footer-cms.js`（聯絡）；`main.js initPageModules` 每頁叫、殼載完叫底列跑馬燈。
  - **庫**（照 SCCD；user 選三個、不要職稱庫）：人名庫 `people`←師資名字、單位庫 `organizations`←合作企業與榮譽主辦方、媒體庫 `media_outlets`←報導的媒體；M2O、還有人用就刪不掉。職稱（教授…）照舊寫在副標；得獎人（學生）照打字。
  - **介面文字**（`ui_labels`，照 SCCD）：固定的字（選單、頁名、專任教師、一年級、必修、學歷、聯絡欄位名、404…）在 HTML 標 `data-label="key"`，`ui/ui-labels.js` 換成後台的 zh／en 交給 lang.js 切。**頁名＝`nav.<slug>`**（選單、網站地圖、頁標題、分頁標題同一個）。新的固定文字＝標 data-label（中文內文＋data-en）再跑 `scripts/seed-directus.cjs` 補 key。
  - 入學頁＝勾了 `admission` 的動態（user 2026-11-21 定：勾選）；後台的段落內文（WYSIWYG）中英各一份 HTML → 包 `[data-lang-block]` 跟著 `<html lang>` 只顯示一份；多行純文字（說明、回答）＝一個 p＋`whitespace-pre-line`。
  - 改後台結構＝改 `scripts/setup-directus.cjs` SPEC 再跑（只加不刪；舊欄位藏起來）；集合上限 25（現在 18，每個多圖／多檔欄位多一張 junction）。煙霧測試不靠正式後台：沒給假資料的請求一律回空（＝留 HTML），接後台那段自己給假資料。
- **全站殼**（`pages/header.html` ＋ `css/components/chrome.css` ＋ `js/modules/ui/chrome.js`）：
  - **Logo**（2026-11-18 換成 SVG）：全站同一種＝`images/Logo Text.svg`（兩端矩形白圓點夾英文兩行＋中文一行，中英並列、不跟語言切），寬＝`--col-w`（手機吃滿、桌面同動態欄）。頂到最頂、置中；首頁未展開時 `home.css` 放到畫面正中央（transition 位移）。logo 背後的毛玻璃（`.top-blur`，6 層漸進模糊＋捲動後疊白）**四邊都羽化**（user 2026-11-21；原本上緣不羽化，首頁 logo 在正中時上緣是硬邊）：logo 在頂時往上多擴一段、上緣的羽化整段落在畫面外（logo 第一行後面照樣是全實的玻璃），置中時往上只擴 `--f`＝四邊一樣，跟著 logo 上移一起過場。用 CSS mask 畫（`.logo-text`，同 `.icon`，顏色吃 currentColor；`images/Logo Stroke.svg` 長條版原本給 footer 覆蓋層用，現在沒用到）；設計重出圖直接蓋同名檔，viewBox 變了改 `variables.css` 的 `--logo-vb-w`／`--logo-vb-h`（logo 框的比例與骨牌大小都從這兩個算；沒改的話圖用 contain 縮在框裡、左右各空一截，看起來比動態窄——2026-11-21 換圖後踩過，煙霧測試直接讀 SVG 檔比對）。
  - **選單**：透明、固定寬 `--menu-w`（手機 10rem／桌面 18rem），logo 不動，沒有底色。進出場＝從左邊滑進來＋fade 一起（user 2026-11-21；opacity 的時長／曲線同滑動）。開著時內容模糊（`--blur` 4px、時長同 fade；右圖照常；先試過半透明，user 2026-11-21），內容同時 opacity 0.4＝整片疊 60% 白（同 logo 後面毛玻璃那層的白；那層 `.top-blur::after` 選單開著收掉，免得 logo 那塊疊兩次）。開著時內容左緣推到選單右緣（推「選單寬 − 內距」，內容自己的左內距不重複算；user 2026-11-03 定案，不對 grid／logo），跟 play 鈕同一條線，play 鈕在選單右緣（選單開著時 menu 鈕 min-width 撐成選單欄那格、名字算在格子裡，play 自然排在後面——名字中英怎麼換都不影響 play，純 CSS 不量）。
    主選單在上、次選單＋語言鈕推到底（次選單分兩區：常見問題、捐款、聯絡｜規章與政策、網站地圖（兩區 user 2026-11-21 對調）；最下面一組＝深色模式鈕（icon）在上、語言鈕在下，這兩顆之間是選項間距 `--spacing-xs`、不是分區的 gap（user 2026-11-21）；區之間、網站地圖 → 深色模式鈕、語言鈕 → 底列 menu 鈕都是同一個間距＝nav 的 gap `--spacing-lg`，user 2026-11-21），字級同底列。開著時 menu 鈕白圓點常駐（不出名字）、intro 照常；**首頁的動態當內容處理、跟其他頁的內容一樣**（user 2026-11-21；原本跑馬燈淡掉只剩＋）：跑馬燈與＋／－整塊模糊＋疊 60% 白、**不吃指標**（不能 hover，同 `#page-content`；按下去落在底列本身 `.site-bar`，chrome.js 一樣當成點內容＝只收選單，user 2026-11-21）、**位置不動**（先試過跟內容一起右推，user 2026-11-21：不用動）；**首頁展開的動態也不右推**（user 2026-11-21；`html.menu-open.news-open { --shift: 0px }`）：清單留在 logo 底下、－留在圖片右邊，只模糊＋疊白（手機清單滿版＝選單直接疊在糊掉的清單上），點它＝只收選單、不展開／收合。**選單鈕背後有毛玻璃**（`.bar-blur`，同 logo 的 `.top-blur` 那套 6 層漸進模糊＋半透明底色；user 2026-11-21）：畫面矮、選單放不下時選單自己捲，選項捲到選單鈕附近就漸進模糊，不跟鈕和名字打架；只在選單開著／收回去那段出現，範圍＝鈕（開著撐成選單欄那格）往上、往右外擴並羽化，左、下到畫面邊。
    選中／hover 的選項＝文字右邊中線一顆圓點（直徑 `--dot-size`＝logo 骨牌的圓孔，全站 hover 圓點都這個大小、不跟字級走；絕對定位不推版面；user 2026-11-18，方塊試過後改回圓點；`.nav-link::after`；聯絡頁的社群、email 連結 hover 也是這顆）。選項間距 `--spacing-xs`，跟內頁 `.link-list`（網站地圖、聯絡頁姊妹系所、入學附件）同一條規則（user 2026-11-18）。
  - **底列**（固定、貼底 `--bar-pad`）：三欄＝左 menu／intro（play icon；**intro 只在首頁**，內頁淡掉、位置照留，user 2026-11-18）、中 動態跑馬燈＋（**只在首頁**，內頁淡掉、user 2026-11-10；永遠畫面正中、寬＝`--col-w`＝logo 寬＝首頁動態圖片寬；**跑馬燈**＝最近幾則的標題排成一排一直跑、左右兩端淡掉、速度固定每秒 2.5em；跑馬燈＋「＋」一起對齊 logo 的寬（跑馬燈在左、＋在右端），user 2026-11-21；手機的寬＝左右讓給 menu／intro 鈕之後剩下的）、右空著（原本 footer 鈕，user 2026-11-21 搬進選單＝聯絡頁；留欄＝動態照樣置中）。
    矩形鈕＝骨牌（同方塊 icon，寬高 45:70、大小＝logo 上那顆 `--block-h`＝`--logo-w`×70/`--logo-vb-w`（user 2026-11-18；variables.css）、開著／hover／鍵盤聚焦時中央圓點＝圓孔直徑 20/70 高）。hover／鍵盤聚焦才在旁邊出名字，名字跟語言走（簡介 ↔ intro），平常視覺隱藏但仍是報讀名稱。**menu 鈕的名字永遠不出**（user 2026-11-21：hover、點開選單都不要文字說明；原本 hover 出、選單開著常駐）：只出中間的圓點，「選單／menu」留著當報讀名稱。**圓點與名字的現／隱＝fade**（user 2026-11-21）：名字收著＝寬 0＋透明、留在版面流裡；**名字的寬跟著淡入淡出一起長出來／收回去**（user 2026-11-21；原本出來＝馬上佔位、收＝淡完才收寬）：`.bar-label` 是 grid 一欄 `minmax(0, 0fr)` ↔ `minmax(0, 1fr)` 補間（`max-width` 不知道內容多寬、補不準），時長／曲線同 fade；補間那段 `chrome.js` 每幀 `fitBar`（側邊放不下名字時動態跟著縮）。觸控不出名字（點完 :hover 會黏著 → hover 包 `@media (hover: hover)`、聚焦排除 `html.input-touch`），可點範圍用 `::before` 往外撐（`pointer: coarse`，畫面不變）。
    兩側等寬由 `fitBar` 量 `--side-min`（＝左欄寬）：側邊放不下名字才縮動態、中心不動。
  - **聯絡頁 contact**（原本的 footer 覆蓋層；user 2026-11-21 搬成選單最後一頁、拿掉底列右下 footer 鈕）：一般內頁版型（h1＋右圖），不分段＝沒有段落導覽；內容＝社群、聯絡資訊、姊妹系所、標章（不放版權，user 2026-11-21），class 名照舊 `.footer-*`。**姊妹系所＝連結清單**（user 2026-11-21；原本縮寫 SCD／SCCD…排一列）：寫全名、一行一個（`ul.footer-links.link-list` 裡的 `a.nav-link`，同網站地圖那種），hover 圓點在清單最右邊＝內文欄右緣；後台 `footer.links` 一列一筆（`label_zh`／`label_en`／`url`）。往下捲沒有 footer。**內容走 Directus 單例 `footer`**（`footer-cms.js`，進聯絡頁才抓（main.js initPageModules）；抓不到留 HTML 的 MOCK、抓到後台為準、空欄位整列收；欄位表 `docs/Directus-後台欄位.md`）。
  - **intro**：play 鈕 `data-video` 有網址才開原生 `<dialog>` 播影片。
  - **手機的右圖**（user 2026-11-13 手機稿）：內頁右圖在手機＝畫面右緣「捲軸那一塊」的縮圖鈕 `.figure-btn`（固定在殼上、不在底列裡；右緣對齊內容右內距、上下在畫面中線＝桌面右圖那條水平線；邊長 `--thumb-w`、z 同捲軸 35；內文右邊讓出 `--rail-w` 不壓字），點了開原生 `<dialog>` `#figure-dialog` 蓋滿畫面、背後的內容與底列模糊＋疊 60% 白（同選單開著那組；原本白底整個蓋掉，user 2026-11-21），logo 照常清楚（所以糊的是 logo 以外的殼與內容、不是 dialog 的 backdrop-filter：chrome.css `html:has(#figure-dialog[open])` 那條）、圖置中，再點任何地方／Esc／X 關（fade in／out；控制列 ‹ X › 在畫面正中底部，只有一張時不出 ‹ ›，user 2026-11-18）。縮圖與放大內容＝當頁 `.page-figure` 內容的複本（`chrome.js syncFigure`，換頁與 header 注入後呼叫；右圖做成會自己換的 ASCII 圖時這套複本不適用——`syncFigure` 會關掉開著的 dialog、複本也不會跟著動，到時改成同一個來源同時畫進右圖／縮圖／放大三處）。選單開（內容右推會被壓到）／換頁時縮圖淡出。
  - **自製 scrollbar**：同 SCCD，藏原生、JS thumb（`custom-scrollbar.js`），手機不顯示。出現＝淡入（user 2026-11-21；`fade-in` keyframes，display none → block 時從頭跑；消失是直接收）。
- **首頁**：一屏只有置中 logo；點動態「+」→ `html.news-open`：logo 上移到頂、清單在畫面中間展開（寬 `--col-w`）、可捲；清單出現＝從畫面底下往上滑進來、邊滑邊淡入（進出場都是位移＋fade 一起，user 2026-11-19；`home.css` `news-rise` keyframes，時長／曲線同 logo 上移，兩個一起往上；user 2026-11-19）；收合＝反向（user 2026-11-19）：`news-open` 先拿掉（logo 回中間、－變回＋），清單掛 `html.news-closing` 往下滑出畫面、邊滑邊淡出（`news-fall`），滑完才藏起來、捲回頂——`chrome.js setNews` 先量位置再換 class（捲到一半收：畫面上緣以上那一截用 `--news-cut` 切掉、滑的距離 `--news-drop`）；
  底列＋往右滑到動態欄外一個 gutter（不擋圖）、豎線收掉變－（CSS 畫的兩條線，transition）。**展開的順序**（user 2026-11-21）：底列跑馬燈先淡出（`--dur-fade`）、＋在同一段滑出去（同時機、同時長與曲線），淡完 logo 與清單才一起往上（兩個都晚 `--news-wait`，home.css）；收合反過來：清單滑走了（`news-closing` 拿掉）跑馬燈才淡回來、＋一起滑回去。
- **選單開著時對右邊內容做任何操作＝第一下只收選單、內容不動**（user 2026-11-18）：開著時 `#page-content` `pointer-events: none`＝右邊內容不能 hover、點了也不會觸發連結，段落導覽淡出收起來（user 2026-11-21）；在右邊 pointerdown（target 是 body／html／`#page-content`）／focusin、選單外 wheel／touchmove 都收（chrome.js；不用 scroll 事件，程式捲動會誤收）；開著＋收回去那段（`html.menu-closing`）內容 `overflow: hidden` 鎖住：至少撐到 `--dur-medium` 滑完，同一個手勢還在送 wheel／touchmove（觸控板慣性）就一直往後推、停 250ms 才解鎖（chrome.js `lockScroll`）；wheel／touchmove 在開著或收回中直接 `preventDefault`（WebKit 的 `overflow: hidden` 擋不住滾輪，實測照捲）。選單那一欄（x 在選單右緣左邊）滾動不算內容。**選單開著點選單連結**＝先收選單（內容滑回原位，`--dur-medium`）、收完才淡出換頁（router.js loadPage；fetch 先發不等）。
- **深色模式**（user 2026-11-21）：選單裡語言鈕上面那顆 `.theme-btn`（icon＝半實心圓 `website-icons/theme.svg`，深色時轉半圈；開關狀態 `aria-pressed`）。切的是 `<html data-theme="dark">`：`variables.css` 只換 `--theme-fg`／`--theme-bg`（黑底白字）＋ `--light-gray`（灰底佔位變深灰），照片、國旗照原色。記在 localStorage `scaid:theme`，**預設淺色、不跟系統設定走**；各頁 `<head>` 有一行 inline script 在 CSS 之前套上（免得先閃白），切換在 `chrome.js toggleTheme`、過場＝整個畫面 fade（見下「網站 transition」）。影片 dialog 底永遠黑。元件顏色一律 `var(--theme-fg)`／`var(--theme-bg)`，寫死黑白在深色模式會壞。
- **背景＝畫布 ＜ 中空板 ＜ 內文**（user 2026-11-21；`js/modules/ui/bg.js`＋`css/components/bg.css`）：三層（畫布 `.bg-ink`、中空板 `.bg-board`、蓋板 `.bg-lid`；蓋板不叫 bg-cover：撞名 Tailwind 的 `bg-cover` utility，`bg.js` 被掃成 content 就會多生一條 background-size。自訂 class 都別跟 Tailwind 的 utility 同名）包在 `.bg` 裡、由 `bg.js` 放進 `<body>` 最前面（各頁 HTML 不用加），固定滿版、z -1、不吃指標；`body { isolation: isolate }`＝z -1 才不會掉到 body 底色後面。
  **選單或放大 dialog 開著＝背景當內容處理**（user 2026-11-21 問到：原本照樣清楚地畫，糊掉的內容襯著像浮在內容上面；放大 dialog 比照）：不畫新的筆跡（右邊內容不能 hover；intro 影片開著也不畫），已經畫的跟內容一起模糊＋疊 60% 白（`bg.css`，selector 同 `chrome.css .top-blur::after` 那條）。
  **不放背景**：系統減少動態、強制色彩（Windows 高對比佈景：蓋板是白色點陣、不會換成系統色，深色佈景會變一整頁白）、列印、畫布用不了（擴充套件擋掉、記憶體不夠）。純裝飾＝`main.js` 把 `initBg()` 包 try/catch，出錯也不卡住後面的開機。
  **View Transition 的例外**：深色模式／語言切換時 `.bg` 刻意留在整張截圖裡、不掛 `view-transition-name`（下面「會自己動的東西」那條不適用）：具名的群組畫在 root 上面＝不透明的蓋板把整個畫面蓋住，壓到 root 底下又被不透明的 root 截圖擋掉；切換鈕都在選單裡、背景已經糊＋0.4，凍住那 0.4 秒看不出來（2026-11-22 實測）。
  **首頁底列跑馬燈 hover 的字色 0.75**（`chrome.css`，原本 0.6）：游標停在跑馬燈上、底下的筆跡疊到最濃，0.6 的字對比會掉到 4.5:1 以下。
  煙霧測試：背景游標一動就每幀重畫，Playwright 的 Windows WebKit（軟體繪圖）幀率會掉很多、其他段落數幀的斷言會誤判 → `watch()` 把 `bg.js` 換成空的，只有背景那一段載真的；那一段的門檻都從 `INK` 算（調手感的數字不用改測試）。真的 Safari 的效能要在 Mac 上看。
  **畫布**＝跟著游標畫筆跡，筆先做**炭筆**一種（筆頭 60px，user 2026-11-21 加粗，原本 36）：每秒下的炭量固定、攤在走過的那段路上＝**移動越慢越濃**；游標停著不動也繼續畫；每一筆留 `hold` 秒再用 `fade` 秒消失（像哈利波特那本日記把字吃掉）→ 停著不動時下的跟消失的打平＝**濃度的天花板**。做法＝記下還活著的筆、每幀整張重畫（不在畫布上累積再整張淡掉：8-bit alpha 淡不乾淨、會留殘影）；炭的顆粒＝紙紋 `color-burn`＋`color-dodge`（淡的筆跡只剩零星顆粒，消失時是一粒一粒被紙吃掉、不是整片變淡）；畫布固定畫白底黑炭，深色模式 CSS `invert`。手感的數字全在 `bg.js INK`（筆頭大小、炭量、留多久、消失多久、顆粒、板子露出來的範圍）。**濃度的上限**＝`bg.css --ink-max`（畫布的 opacity，0.3；user 2026-11-21 調低，原本約 0.45）。畫面不再變就停下來：沒筆跡了＝整個停；游標停著、筆跡已經打平＝筆跡那張不再重畫（時鐘停住），只剩蓋板在呼吸（見下），而且降到 30fps（`REST_FPS`）；停著時同一點 1/20 秒內的筆併成一筆（濃度照疊色合），活著的筆數跟螢幕更新率無關（不然 120Hz 的螢幕每幀要疊上百顆）。觸控（沒有游標）＝不畫，筆尖碰著螢幕也算觸控（懸空的筆照畫）。
  **中空板**（PC 陽光板）：**只在筆跡周圍出現、跟著筆跡一起消失**（user 2026-11-21；第一版是整片蓋滿）；樣子＝**透明毛玻璃**（user 2026-11-21；第一版是一層白霧把筆跡壓淡）：一格一格的中空管＋玻璃一點點色，後面的筆跡是糊的（`--frost`：板子永遠罩住整段筆跡 → 直接糊畫布）。
  **格寬有大有小、平均＝logo 的骨牌寬**（user 2026-11-21：先改成跟骨牌一樣寬（原本 0.625rem），再改成有大有小）：每一格＝骨牌寬（`bg.css --board-pitch`＝`--block-h`×45/70，`@property` 註冊成長度＝JS 讀到算好的 px）× `INK.vary`（0.35～1.65）之間的隨機倍數；開頁時抽一次、換視窗大小沿用（格子不會亂跳）。板子是 `bg.js` 畫的 canvas（CSS 的重複漸層做不了每格不同寬）：一格＝左緣暗線＋一條反光＋往右暗下去（管壁的弧度），畫成黑白、深色模式 `invert`；高 1px、CSS 拉滿，寬照螢幕密度、每條線對齊螢幕像素（1.25／1.5 倍的螢幕線才是利的），縮放比例變了（視窗拖到另一個螢幕、沒有 resize）另外聽著重畫。`--board-pitch` 下限 8px：極窄的視窗骨牌寬會 ≤ 0，排格子的迴圈會停不下來。
  **折射錯位**（user 2026-11-21，參考圖＝藍色／彩虹的直條折射；同一天又要再大）：筆跡先畫在不放進頁面的小畫布（1/3 解析度），再一格一格貼到看得到的畫布，每一格以自己的中線為準、把後面 `INK.bend`（4，原本 2.5）格寬的畫面擠進來 → 格跟格的交界對不上（斜線變階梯、停著的那一點變成好幾條直的橢圓、往旁邊延伸約 100px）；格寬不一＝錯位也有大有小。
  做法＝板子是滿版的，上面蓋一張底色的蓋板（低解析度的畫布，CSS 放大＝邊緣自然是柔的），每一筆在蓋板上挖一個柔邊的洞（同一筆的炭量與壽命）→ 筆跡淡了洞跟著合起來；CSS 的 mask 吃不了會動的畫布，所以用蓋的。**範圍會浮動**（user 2026-11-21：不要一直同一個半徑）：洞的直徑＝`INK.halo`（平均 220px）×（1 ± `INK.float` 0.35），照下筆的時間起伏（兩個不同步的波疊起來、看不出週期）。**會呼吸**（user 2026-11-21）：露出來的板子整片一起跟著時間慢慢脹縮（`INK.breathe` ±0.2、一口氣 `INK.breath` 4 秒，sin）；所以只要還有筆跡蓋板就每幀重畫，游標停著時也是（筆跡那張不重畫）。
- **網站 transition＝fade in／fade out**（user 2026-11-03）：token `--dur-fade`／`--transition-fade`（variables.css）、JS 用 `DUR.fade`（motion.js）。
  **每個 fade 都帶模糊**（user 2026-11-21）：淡入＝從糊到清楚、淡出＝從清楚到糊（`--blur`，跟選單開著的內容同一個值）。`--transition-fade` 含 `filter`；藏著的那一態除了 `opacity: 0` 還要寫 `filter: blur(var(--blur))`、現身那一態 `filter: none`（keyframes 版 `fade-in`／`fade-out`、`news-rise`／`news-fall`、accordion.js 的內容淡入淡出、View Transition 也都帶）。**hover 出來的圓點也是**（選單／連結清單／整列連結，原本瞬間出；user 2026-11-21）。要瞬間換的 hover 變淡不能用 `opacity`／`filter`（會吃到這組過場）→ 底列動態 hover 改用顏色。沒加的：輪播左右兩端的圖（那邊已經有 `.lens` 景深）、logo／選單鈕後面那層半透明底色（純色，糊了看不出來）。
  換頁：router 換頁前加 `html.page-leaving` 讓 main 淡出（跟 fetch 並行），換完內容拿掉＝淡入。**首頁（logo 在正中）→ 內頁＝logo 先上移到頂、移完內容才淡入**（user 2026-11-21；`router.js loadPage` 的 `logoFirst`：首頁那一屏是空的＝不等淡出，換完內容 `page-leaving` 留到 logo 移完 `DUR.slow` 才拿掉；首頁已展開（logo 本來就在頂）照一般換頁、logo 不動——從選單點去內頁時也是：換頁前只收選單、展開的動態不先收（`closeOverlays(false)`；先收的話 logo 會回畫面中間、換頁再上移一次），清單跟著淡出，換完才收；user 2026-11-21）。**切深色模式、切語言＝整個畫面 fade 過去**（user 2026-11-21）：`motion.js fadeSwap()` 用 View Transition 把切換前後的畫面各拍一張交叉淡化（時長／曲線吃 `--dur-fade`，`chrome.css ::view-transition-*`；淡的時候底下照樣點得到），顏色變數、mask 上色的 logo、換掉的文字都不用各自寫過場；DOM 是下一幀才改；瀏覽器不支援／減少動態＝直接切。**會自己動的東西不能留在整張截圖裡**（user 2026-11-21：跑馬燈在淡的那段會停一下——舊畫面那張是靜止的）：首頁底列的動態 `.bar-news` 掛自己的 `view-transition-name`，舊的那張不放、新的那張（活的）直接顯示＝照常一直跑，顏色改由它自己的 `color` 過場淡過去（只在切換那段掛，`:active-view-transition`）；之後有別的一直在動的元素也照這個做（背景 `.bg` 例外，見上「背景」）。之後還有「整個畫面一起變」的切換也走這支。內頁淡掉 intro／動態也走這組（淡完 visibility 才 hidden）。之後其他進出場也吃這組。
- **內頁版型**（about 起，user 2026-11-03，`css/components/page.css`）：桌面 col 1 段落導覽、col 2–7 內文由上往下、右圖在「內容區右緣～畫面右緣 100vw」那段正中（wrapper col 8–12 加負 margin，圖本身 4 欄寬方形，user 2026-11-19）（user 2026-11-13 初步想法、未定案：不是後台的單一張圖，而是有一個資料庫、每隔幾秒隨機生成一張 ASCII 圖像；現在是灰底佔位）；
  **文字層級命名**（user 2026-11-18；之後 user 說這些名字就是指這幾種）：**title＝Medium（500）、內文＝Regular（400），都不用粗體**（user 2026-11-21：Page／Section／Subsection title 與 Lead 的粗體全拿掉；先試過全站 Medium，user 改成 title Medium、內文 Regular）：`typography.css` h1–h6＝`font-medium`，Lead 與內文 Regular；清單 `.item-list` 裡的項目標題 h3（師資名字、動態標題…）也是 Medium（user 2026-11-21，原本 Regular）；粗體只剩入學附件與 `b`／`strong`。中文字體切了 Regular＋Medium＋Bold 三個字重，要加／換字重＝`variables.css --font-weight-*`＋`build-fonts.py WEIGHTS` 重切（`font-synthesis-weight: none`，沒字檔的字重不會假粗、會掉到別的字重）。**每一頁只有 Page title 是 text-lg**（user 2026-11-21）：Page title＝頁標題 `h1` text-lg；Section title＝段落標題 `h2.section-title`（段落導覽依它生成）text-md（全站一致；user 2026-11-21 一度改 lg、又改回 md）；Lead＝導言 `.page-lead`（頁標題下面那段說明）text-s（同內文；user 2026-11-21 從 md 改 s，每一頁都一樣）；Subsection title＝小節標題 `h3` text-s（同內文字級、靠 Medium 分；user 2026-11-21 改過 md 又改回 s；about 的培育能力／各年級），跟下面內文隔 `--spacing-xs`、掛在標題的 margin-bottom（user 2026-11-21；原本貼著、試過 sm；條列 `.item-list` 裡的項目標題不算）；Body＝內文 `p`／`ul` text-s；Note＝附註 text-xs。標題不 sticky。**看起來的間距含行距、照舊**：試過用 `text-box` 把標題（單行）的行距切掉，user 2026-11-21 拿回——間距要調就直接調 spacing 的值。每段 `h2.section-title`；
  段落導覽（`section-nav.js` 依 section-title 生成：每段一個矩形，沒有上下 chevron、hover 全黑、user 2026-11-18；沒輪到的格子只變淡（opacity 0.3）、**不模糊**（user 2026-11-21：預設不需要模糊；先試過淡＋失焦），hover／目前那格全黑，深淺的過場走網站 fade；點了捲過去的途中改「最近那段亮」＝上下兩個方向一樣快到位）sticky 在 `<main>` 裡＝選單開時跟內容一起右推；
  矩形從 h1 那條線（`--top-h`＝`#page-content` padding-top，桌面 7rem／手機 6rem）往下排：**最上面那一格＝頁標題**（`.section-nav-top`，user 2026-11-18：「對齊標題」指的是這一格——一個**跟段落同高的矩形**（user 2026-11-21；先試過圓點、正方形）、中心對在 h1 第一行的中線、點了回頁頂），段落的矩形從它下面隔 0.5em 起排（user 2026-11-18；**詳細頁不放段落導覽**，HTML 不放 `.section-nav` 就沒有）；
  排不進（h1 線～底列上緣）＝整串往上移到目前那格看得到、超出的切掉（JS 只給 `--n`／`--i`，排不排得進與位移是 page.css 算）；
  點了把該段頂端（`.page-section`）捲到 h1 那條線（user 2026-11-18），最後一段撐高到捲得到；還沒捲到第一段（在 h1／導言）亮的是頁標題那一格、段落的矩形都不亮（原本算第一段；加了頁標題那一格後改，user 2026-11-18）。**段落圖片輪播** `.slideshow`（about 起、user 2026-11-18）：每段 h2 下面 5 張（標題 → 圖 → 內文）、中間最大壓最上層、左右兩張最小在後面、點左右切換（環狀）＋自動播放（user 2026-11-21：每 4 秒換下一張、點了從頭計時；滑鼠在上面／鍵盤聚焦在裡面暫停、減少動態不自動播），`slideshow.js` 只寫 data-pos、位置轉場全 CSS；**景深**（user 2026-11-21，參考圖＝三個公仔站前中後）：焦點永遠在中間那個位置——中間那張清楚、左右兩張失焦（一格＝框寬 1.1%）、藏著的更糊；**模糊跟著位置走、不跟著照片走**：圖滑到中間的途中慢慢對焦、退到旁邊慢慢失焦（filter 跟 left／width 同一組過場）；整張連邊緣一起失焦（filter 掛在 `.slide` 本身、糊開的邊暈出自己的框）。試過、被 user 退掉的做法：在輪播上蓋一層漸進模糊（「景深是整體的、不是框裡面的」「不是套在照片本身」）、圖不動改成點哪張哪張對焦（「中間那個一定是比較清晰的…不會切換不同照片的模糊程度」）、五張／三張由大到小排一排（「是之前那樣的設計」）。圖暫時是 Lorem Picsum stock（彩色，user 2026-11-19；原本加了 `?grayscale`）。手機（user 2026-11-13 手機稿）＝同一套三塊壓窄：左緣段落導覽＋返回鈕（對齊 menu 鈕）、中間內文由上往下、右緣中線上的右圖縮圖鈕（見上「手機的右圖」）；內文 `col-span-full`＋左右 margin `--rail-w`（＝縮圖邊長＋gutter，桌面 0），跟導覽同在 grid row 1（sticky 才有整頁高可走）。
- **詳細頁**（`<slug>-detail`，user 2026-11-10）：列表 `a.item-row` 點進去；左上角 `.back-btn`（反過來的 play icon＝朝左三角、大小同底列 play 鈕，user 2026-11-18；回列表）＝col 1 上緣對齊內容第一行、sticky（手機也是）、左緣對齊導覽矩形，放 `grid-area: 1 / 1`（詳細頁沒有 `.section-nav`，user 2026-11-18）；選單亮父頁。目前只有 `faculty-detail`（頁頭＝照片在上（`.profile-photo`，寬同列表縮圖）、下面名字＋副標一行一個——文字＝列表那一列的文字（純文字的 `div.item-row`，名字是這頁的 h1、一樣 text-md）；user 2026-11-21：上下排，試過照片放左邊同列表那一列。下面學歷／經歷…＝同關於的 Subsection title `h3`＋一筆一筆：年份一行、下面一行說明（沒年份的專長只有說明那一行），筆與筆之間不空——user 2026-11-21，原本名字 lg、每段一個 Section title＋空行隔開的條列；原本還有 `curriculum-detail`，user 2026-11-21 拿掉、課程說明改成課程頁點開看）；右圖照常、接 Directus 後帶 `?id=`。
  **全部內頁（含 404）都用這版型＋右圖**（user 2026-11-10）。**摺疊**（原生 `<details>`：常見問題、動態；user 2026-11-18）：原生箭頭換成整列最右邊一顆**圓點**（`details::after`；跟選單 hover／選中出現的那顆同一種 `--dot-size`），**圓點永遠對在整塊的水平中線**（top 50%；user 2026-11-19：全站的圓點都是這個邏輯，原本常見問題收著時對第一行、問題折行就不在中線上）：收著＝那一列的正中、打開＝整個展開後內容高度的正中（hover 不變；user 2026-11-18 方塊改回圓點）。**展開／收起都有動畫**（user 2026-11-18）：`accordion.js` 接手 summary 的點擊、把 details 的高度補間（Web Animations，`DUR.medium`＋`--ease-standard`；圓點是整塊高的 50%、跟著一起走），內容同時淡入／淡出（同一組時長，user 2026-11-21）；收起時 `open` 等縮完才拿掉、一開始先標 `.is-closing`（CSS 當它已關）；動到一半再點＝掉頭；減少動態＝照原生瞬間開合。**一次只開一個**（user 2026-11-21）：打開一則＝同頁其他開著的一起收；上面那則收起來會把點的這列往上帶 → 補間期間捲動跟著補回去、點的那一列留在原地（accordion.js）。常見問題：問題與答案都是 text-s。
  **動態 news**（user 2026-11-18）：沒有段落導覽（左邊的 anchor 方塊）、不分年份（年份的 Section title user 2026-11-21 拿掉，一整串由新到舊）；每則一個摺疊，收著的樣子同師資那一列（`summary.item-row`＝縮圖＋標題＋分類，text-md），時間不寫在外面；展開（`.fold-body`，從縮圖的左緣排起、吃整列寬；user 2026-11-21，原本桌面對齊文字那一欄）＝時間、地點各一行直接寫、不加「時間／地點」標籤（`.fold-meta` 裡的 `p`；user 2026-11-18），下面相簿（`.album`：所有圖一排、同一個最大高 `--album-h`（手機 6rem／桌面 9rem，user 2026-11-19 縮小）、照原比例，放不下橫向捲＋左右 chevron（在圖列外面兩邊、不壓圖；icon＝play icon、prev 轉 180°，大小同底列 play 鈕；放大 dialog 的左右也是，user 2026-11-19），`album.js` 照 SCCD playlist 縮圖列、沒旋轉；圖暫時是 Lorem Picsum，彩色）；點相簿的圖＝共用右圖的放大 dialog 蓋滿畫面、照原比例、控制列 ‹ X › 可左右切（左右鍵也行、到頭 disabled），再點任何地方／Esc 關；**打開的那則點封面縮圖**（`.item-thumb img`）＝放大封面、不收合（accordion.js 擋掉開合，user 2026-11-18）；封面是那一組的第一張、後面接相簿，點封面或相簿哪張都能左右切（`galleryOf`，user 2026-11-19）（`chrome.js openFigure`：dialog 內容開的時候才放）。**入學 admission＝一則一則的動態**（user 2026-11-18）：整頁就是同一種列、不另外做別種摺疊，不分年份、沒有段落導覽；跟動態頁不同：外面只有標題＋時間（時間 text-s，user 2026-11-21；沒有分類那一行；**沒有縮圖**，user 2026-11-19：summary 不掛 `.item-row`、展開內容靠左），點開的順序＝說明文字（p）→ 相簿 → 附件（`.link-list` 連結清單、粗體、另開新視窗），有才出，沒有地點那一行；第一則是完整示意。後台 `news` 要補 `category_*`／`time_*`／`place_*`／`album`／`attachments`／`admission`（勾了才列在入學頁，待確認）（見 `docs/Directus-後台欄位.md`；`scripts/setup-directus.cjs`／`seed-directus.cjs` 還是舊結構）。右圖「永遠在畫面正中」＝高 0 的 sticky 錨點停在中線、內容往上下溢出；**選單開著時右圖在變窄後的剩餘空間重新置中並縮小**（內容右推 `--shift` → 空間正中往右 shift/2：反向位移 −shift/2、寬少掉 shift＝兩邊留白不變；user 2026-11-19，原本是右緣不動），過場跟右推同一組時長與曲線（user 2026-11-18，page.css `.page-figure > *`）（段落導覽同樣高 0 錨點，但停在 h1 線、往下溢出）。**清單的圓點**（整列連結 `a.item-row`、摺疊 details、內頁 `.link-list`；user 2026-11-21）：PC（`hover: hover`）平常不出、hover／鍵盤聚焦才出、摺疊點開後常駐；手機（觸控）預設一直出。位置在整個 block 正中（收著＝那一列中線、展開跟著整塊）。**右邊一律先讓出圓點的位置**（`page.css --row-pad`，整列連結的文字欄、報導、課名清單、摺疊共用；圓點沒出來也留著，user 2026-11-21：原本整列連結沒留、合作企業的說明折行會疊到圓點）。
  （有高度的 sticky 捲到底會被格子底頂走）。段落裡的條列 `.item-list`（項目間空一行；項目標題 h3 Medium，下面的副標／說明一行一個 `p`：標題到副標隔 `--spacing-xs`、副標之間不留距，user 2026-11-21）；**師資與合作企業是同一種列**（user 2026-11-21：縮圖＋標題＋副標；副標＝後台 `subtitles` repeater，一筆一行、沒填就只有標題；`item-list-cms.js` 照 `ul.item-list[data-cms="集合"／"集合:類別"]` 抓，後台抓不到或還沒任何一筆＝留 HTML 的 MOCK、抓到＝後台為準，某一類沒人＝那段整段收掉；合作企業 url 空＝那列不可點）；`.item-row`＝左方形縮圖 **1.5 欄**＋隔一個 gutter 的右文字（faculty 連詳細頁／partners 整列外連企業官網、另開新視窗，user 2026-11-18；原本 2 欄）；寬＝page.css `--item-thumb-w`（內文欄手機當 4 欄、桌面 6 欄，1.5 欄＝1.5 欄寬＋半個 gutter；師資詳細頁的照片同寬）。
  整列是連結的 `a.item-row` hover 不變淡，改在整列最右邊、整列高的正中出一顆圓點（同選單 hover 那顆；user 2026-11-18 方塊改回圓點）。
  **清單列＝積木**（user 2026-11-21：「有的有圖，有的可以展開，有的有內頁」）：師資、合作企業、動態、榮譽、報導、入學、規章全是同一種列 `.item-row`（規章＝標題＋副標、不展開、整列外連另開新視窗，user 2026-11-21），**標題 h3 一律 text-md、副標 p 一律 text-s**（同入學；ul 不再掛 `text-*`）。三塊各自挑：圖＝第一格放 `.item-thumb`（`:has()` 自動排成左圖右文字，文字包一個 div；沒放＝純文字）；點了做什麼＝列用哪個元素（`a` 內頁／外連、`a[data-zoom]` 放大 dialog 看 href 那張圖、`summary` 展開＋`.fold-body`、`div` 不能點）；右邊一律讓出圓點的位置（`--row-pad`）。有圖的列文字（標題＋副標）上下對在圖的正中（user 2026-11-21，原本對齊圖的上緣）。**標題、副標各一行**（user 2026-11-21）：放不下＝右邊淡掉、左邊不淡（`.is-clipped`）；hover／鍵盤聚焦那一列＝放不下的那幾行跑馬燈、左右都淡（`.is-marquee`，左邊的淡用註冊過的 `--marquee-fade-l` 過場淡進來）；移開＝滑回最近的那一端（0 或剛好一整圈）、不跳回原位，到了才收左邊的淡。速度、間距、兩端淡的寬同底列動態的跑馬燈（`MARQUEE_SPEED` 從 chrome.js 共用）。做法（`js/modules/ui/item-marquee.js`）：字在 h3／p 自己的框裡用 `text-indent` 移、接力那份＝`text-shadow` 往右 `--loop` 畫一份——**不在 h3／p 裡包任何東西**（lang.js 換語言是直接換 `textContent`，包了會被洗掉）；內容一變（換頁、換語言、後台渲染＝MutationObserver）、字體載入、視窗寬變就重量。**觸控（沒有 hover）與系統減少動態＝照常折行、整段看得到**（跑不了馬燈，切掉的字就永遠看不到；webkit 煙霧測試只模擬得了減少動態）。新的清單照這個組，不要再另做一種列。常見問題沒有改（問題不是標題＋副標的列，問題與答案照舊 text-s）。
  faculty 段落順序＝專任 → 兼任 → 業界導師（user 2026-11-18；MOCK 是寫死的 HTML 順序，接後台後前台也固定這個順序、段內照 `sort`）；
  faculty 名字／單位也跟語言切（user 2026-11-18 改，原本中英兩行並排）；**課程 curriculum**（user 2026-11-21 改）：排法同入學——一個年級一段（Section title，照樣有段落導覽），一門課一個摺疊（`summary.item-row`）：收著＝課名＋下面一行「必修／選修」，點開＝課程說明（一段，後台 `courses.description_*`）；同年級必修在前、選修在後；沒有詳細頁（原本年級裡分必修／選修兩組小標、課名是連到 curriculum-detail 的連結清單）。admission 一個主題一個摺疊（清單列的積木，見上），沒有分類的 Section title、也就沒有段落導覽（user 2026-11-18）。
  **榮譽 records**（user 2026-11-19；主選單在入學上面）：一筆一個摺疊＝清單列的積木（`details.record > summary.item-row`，user 2026-11-21 從自己的 grid 改過來；原本 text-s），沒有分類的 Section title、沒有段落導覽；收著那一列＝左**國旗**（`img.item-thumb`，`.record` 把縮圖改成寬 2em 的 4:3；國家用國旗呈現；4:3、高＝一行字、彩色、不加框、上下置中對在右邊文字的正中（先做兩行高＋灰階＋黑框，user 2026-11-19：太大、要有顏色、不用框、center 對齊）；圖＝jsDelivr 上 flag-icons 的 SVG，檔名＝ISO 兩碼；國家名稱留在 `.sr-only` 給報讀）、國旗右邊獎項名稱（標題）、獎項下面得獎人（副標）；點開＝主辦方、獎別（`.fold-body > .fold-meta`，同動態的時間／地點），**對齊右邊獎項那一欄**，各一行直接寫、不加標籤；打開那則點國旗＝照常收合（國旗不是封面，`chrome.js` 只放大裡面有 img 的縮圖）。圓點在整塊的水平中線（收著＝國旗那條線、展開跟著整塊；user 2026-11-19，之後全站摺疊都改成這個邏輯）。後台集合 `records` 待建（欄位見 `docs/Directus-後台欄位.md`）。
  **報導 press**（user 2026-11-21；主選單在榮譽下面）：排法同入學（一則一列、沒縮圖），外面＝報導標題＋媒體，**不展開**：點了＝放大 dialog 直接看那則報導的截圖（`a.item-row[data-zoom]` 的 href＝截圖，`chrome.js` 攔下來走 `openFigure`；沒 JS 就直接開圖），圓點同整列連結；沒有 Section title、沒有段落導覽。後台集合 `press` 待建（欄位見 `docs/Directus-後台欄位.md`）。
- 狀態全掛 `<html>` class：`menu-open`／`news-open`／`page-leaving`；換頁 `closeOverlays()` 全收。
- **整站不能左右捲**（user 2026-11-18）：`html { overflow-x: hidden }`（chrome.css）。原因＝選單右推把內容推出右緣，桌面 Chrome 關選單後還留著那段可捲寬度（Safari／手機寬不會）；煙霧測試跑 webkit 重現不了，只守規則還在。

## 技術棧
- 原生 HTML/CSS/JS（ES modules）；自製 SPA router 只換 `<main>`；殼片段 fetch 注入
- Tailwind CSS 3（`css/output.css` 為 build 產物，**改任何 CSS 都要 `npm run build:css`**）
- 設計 token：`css/variables.css`＝唯一來源；`tailwind.config.js` 全部映射到 `var(--*)`
- GSAP 3.14（CDN）；時長 token 走 `js/modules/ui/motion.js`
- 圖示：`.icon` CSS mask（`css/components/icon.css`），SVG 放 `website-icons/`
  - **方塊 icon**（user 2026-11-18 命名，之後 user 說「方塊 icon」就是指這個）＝logo 兩端那顆「骨牌」：直立矩形＋中央白圓點，比例 45:70。`website-icons/block.svg`／`.icon-block`（path 取自 `Logo Text.svg`）。

## 網站架構（routes）
| slug | 中／英 | 群組 |
|---|---|---|
| about / partners / faculty / curriculum / news / records / press / admission | 關於／合作企業／師資／課程／動態／榮譽／報導／入學 · About／Partners／Faculty／Curriculum／News／Records／Press／Admission | 主選單 |
| qa / donate / regulations / sitemap / contact | 常見問題／捐款／規章與政策／網站地圖／聯絡 · QA／Donate／Regulations & Policies／Site Map／Contact | 次選單（regulations＝規章＋原本的條款頁併成一頁，user 2026-11-21；sitemap 頁本身：連結一串 text-md、不列自己、最後一項「聯絡」，user 2026-11-18；contact＝原本的 footer，user 2026-11-21） |
| faculty-detail | 教師（師資列表點進去） | 詳細頁（不進選單／sitemap） |
| 404 | | |

## 專案結構
```
├── index.html              # 首頁：空一屏＋展開用動態清單（MOCK）；body 靜態標 data-page="index"
├── pages/
│   ├── header.html         # 全站殼：logo、透明選單（含語言鈕）、底列、intro dialog → 注入 #site-header
│   └── <slug>.html         # 15 個內頁（含 faculty-detail、contact）（MOCK 示意；直接開也能獨立跑）
├── css/
│   ├── variables.css       # token（手機值預設、≥768 放大；含 --top-h／--bar-h／--menu-w）
│   ├── input.css           # Tailwind 入口（@import 順序＝cascade 順序）
│   ├── base/               # typography.css / scrollbar.css
│   ├── layout/grid.css     # .site-container / .site-grid
│   └── components/         # icon.css / bg.css（背景：畫布＋中空板）/ chrome.css（全站殼）/ home.css（首頁）/ page.css（內頁版型）
├── js/
│   ├── main.js             # 入口：片段注入、initPageModules / cleanupPageModules
│   ├── router.js           # PAGES 清單→路由表、連結攔截、popstate（同頁只換 hash 不重載）、a11y 報讀
│   ├── config/api.js       # Directus URL 唯一注入點、fetchCmsJson、assetUrl、LKG
│   ├── utils/helpers.js    # classic：window.SCAIDHelpers（sitePath、版型判斷、游標 var、GSAP 註冊）
│   ├── modules/pages/cms-pages.js  # 各頁內容 ← 後台（動態／入學／首頁清單／底列跑馬燈／課程／常見問題／榮譽／報導／規章／文字頁／師資詳細頁）
│   └── modules/ui/         # chrome / bg / ui-labels / item-list-cms / footer-cms / section-nav / accordion / lang / custom-scrollbar / site-base / escape-html / page-cleanup / motion / a11y / reduce-motion
├── images/favicon.svg      # 矩形＋圓（TODO 正式 SVG）
├── fonts/glow-sans-tc-compressed/  # 中文字體 woff2 切片＋font.css＋OFL.txt（scripts/build-fonts.py 產生）
├── scripts/                # smoke.cjs（Playwright 煙霧測試）、setup-directus.cjs（建後台集合、庫、介面文字）、seed-directus.cjs（解析各頁 HTML 寫進後台：庫→內容→文字頁→介面文字；只補空的／缺的，不蓋後台改過的）；都可重跑、先 --dry、.directus-token 不入庫
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
1. **字級只用 4 階 token**（`text-xs/s/md/lg`；lg 桌面 2rem，user 2026-11-21 從 1.6rem 改；xl／2xl／3xl user 2026-11-21 先刪掉，要用再開：variables.css＋tailwind.config.js fontSize／safelist），不寫 `text-[14px]`；RWD 靠 token 的 @media，不寫 `md:text-*`。
2. **顏色／間距／時長一律 `var(--*)`**；灰底用 `bg-light-gray`／`bg-dark-gray`。前景／背景色用 `--theme-fg`／`--theme-bg`（Tailwind `bg-theme-fg`／`text-theme-bg`…），不要寫 `bg-black`／`text-white`：深色模式不會跟著反過來。
3. **手機優先**：先寫手機版 class，桌面再加 `md:`；grid 子元素先 `col-span-4` 再 `md:col-span-N`。
4. **站內路徑一律 `sitePath()`**（JS）或相對 `.html`（HTML）；不寫根目錄絕對路徑。
5. **新頁三步**：`pages/X.html`（複製 about.html；`<head>` 裡深色模式那行 inline script 要一起帶）→ `router.js PAGES` 加 slug → header 選單＋sitemap 加連結；所有文字中文寫內文、英文寫 data-en。頁標題 h1 與選單、網站地圖那一項都標 `data-label="nav.<slug>"`，再跑 `scripts/seed-directus.cjs` 把新 key 補進後台。頁面專屬 JS 用動態 import 掛在 `main.js initPageModules`。沒有 Section title 的頁不放 `<nav class="section-nav">`（沒有段落就沒有 anchor 方塊；user 2026-11-18）。
6. **換頁要收乾淨**：window/document 級 listener 用 `registerPageCleanup()`；`<main>` 內 GSAP／ScrollTrigger 由 `cleanupPageModules` 統一殺。
7. **動畫**：`DUR.*`／`EASE.*`（motion.js）；進場要能在 `prefers-reduced-motion` 下直接到終態（GSAP 已全域 patch）。
8. **版型看寬度、互動看輸入**：排版 `SCAIDHelpers.isMobileLayout()`，hover 類 `canHover()`／`isCoarsePointer()`。
9. **後台文字塞 innerHTML 前過 `escapeHtml()`**；純文字用 `textContent`。
10. **無障礙**：非互動元素綁 click 過 `makeActivatable()`；icon／矩形鈕有 `aria-label`。
11. **MOCK 內容**：**畫面上的示意文字不加「示意：」／「Placeholder: 」前綴**（user 2026-11-21 全站拿掉，一般說明、標題、副標直接寫）；人名、日期這類會被當真的才在後面標「（示意）」／「(placeholder)」，公司名照舊寫成「示意○○公司」。示意內容是哪些＝各頁 HTML 註解寫的「內容為 MOCK 示意」那份，不再靠 grep 前綴找。2026-11-21 起這份＝後台抓不到時的備援，真的內容在後台改；HTML 改了要同步進後台就跑 `seed-directus.cjs`（只補空的集合）。
12. **殼的 z 序**：背景 -1（畫布 ＜ 中空板 ＜ 蓋板，`bg.css`）＜ 內容 ＜ logo 30（毛玻璃 `.top-blur` 是 logo 的子層）＜ 捲軸 35 ＜ 選單 40 ＜ 底列 60；`#page-content` 有 transform（右推用），裡面別放 fixed 元素。

## 刻意沒搬的 SCCD 功能（需要時從 `../SCCD Website` 搬）
三 mode 主題切換（`js/modules/ui/theme-toggle.js`、`css/themes/`；這站自己做了簡單的淺／深兩種，見上「深色模式」）、Lottie logo、footer 散佈卡、intro 動畫、
scroll-snap、矮橫向／直向全站層（`css/layout/landscape.css` 84KB）、site-assets（icon／游標）與 site_slugs／redirects 後台覆蓋（ui_labels、人名／單位／媒體庫 2026-11-21 已搬，見上「後台」）。
通用文件可直接參考：`docs/字級規範.md`、`無障礙稽核與改進清單.md`、`橫向手機版最佳實踐.md`、`SPA-接-Directus-Headless-最佳實踐.md`。

## TODO
- 正式 favicon／apple-touch-icon／og-image（logo 已換 SVG）
- intro 影片網址 → `header.html .play-btn data-video`
- 聯絡頁：社群 icon 圖（連結、聯絡資訊、姊妹系所、標章已走後台）
- 後台的圖：相簿、動態封面、報導截圖、關於的段落輪播、師資照片、企業 logo 都還沒上傳（2026-11-21 只放文字；報導沒截圖＝那列不能點、關於沒圖＝不出輪播）
- 正式網域 → `router.js CLEAN_URL_HOSTS`、`index.html` canonical／og:url
