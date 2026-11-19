# SCAID 網站專案指南

## 專案概述
**實踐大學AI設計職人學位學程**（Bachelor Program in Advanced Integrated Design, Shih Chien University，簡稱 SCAID）官方網站。
骨架 2026-11-03 從 **SCCD Website**（`../SCCD Website`，媒傳系官網）的基礎檔精簡搬來：原生 JS SPA、無框架；
內容預計走 **Directus headless CMS**（後台尚未開，目前全站是 MOCK 示意文字）。

## 設計決策（user 2026-11-03 拍板，參考圖＝2022 degree show 站）
- **網站是彩色的，不是黑白**（user 2026-11-19 更正；這條原本寫「黑白品牌：只有黑／白＋灰階」）：殼與文字目前是黑字白底，但不要因為「黑白」把內容（圖片、國旗…）轉成灰階或避開顏色。
- **字體**：英文 JetBrains Mono（Google Fonts）、中文 **Glow Sans TC Compressed**（未來熒黑 v0.93，OFL；user 2026-11-18）（一個堆疊 `font-sans`）。
  - 中文字體 Google Fonts 沒有 → 自架：`fonts/glow-sans-tc-compressed/`＝woff2 切片（Regular＋Bold 各 104 片，照 Google 切 Noto Sans TC 的 unicode-range，瀏覽器只抓用到的）＋`font.css`（各頁 `<head>` 連）。全由 `scripts/build-fonts.py` 產生，不要手改；換字重／版本重跑（用法見檔頭）。
    網址都帶 `?v=內容雜湊`（font.css 裡每片 woff2、各頁 `<head>` 連 font.css 那行——後者 script 重跑時自動改全部頁面；新頁複製既有頁的 `<head>` 就會被改到）：重切後瀏覽器才不會拿新 CSS 配舊字檔（搬過片的字會掉回系統字體，2026-11-18「即」踩過）。
  - 這顆字的 TC 版走**傳承字形**（舊字形：為→爲、即→卽、既→旣…），而且**缺 10 個常用字**（教清真值告填慎鎮顛巔，上游 issue #22 未修、專案停更）→ **缺的字用 J 版補**（user 2026-11-18）：TC 沒有而 Glow Sans J Compressed 有的 36 個字（那 10 個＋少數異體字與符號）從 J 版切一片 `<字重>-j.woff2`、掛在同一個 font-family（兩版度量與字寬相同；補進來的是日本寫法的新字形）。只收 Google 那組約 1.4 萬字，更罕用的退回系統字體。
  - TC 有收、卻畫成「另一個字」的 11 個字（為即偽查緒鄉俱…）也改從 J 切（`build-fonts.py USE_J`，要再換哪個字就加進那串重跑）。**不要整批換成 J**：TC 與 J 有約 3,500 個常用字畫法不同，J 是日本寫法（海、漢、器、類、標點靠左下…），TC 的傳承字形在這些字上反而接近台灣寫法、標點也置中；既概者神飯這類「部件是舊寫法」的字目前沒動（user 未定）。
- **手機優先**：token `:root` 是手機值、`@media (min-width: 768px)` 放大；Tailwind 先寫無前綴再加 `md:`。
- **一般 grid**：`.site-grid` 手機 4 欄 → ≥768 12 欄。
- **中英分開**：中文寫在內文、英文寫 `data-en`（`lang.js` 第一次套用時把中文記到 data-zh，來回切）；全站標題、示意文字、底列名字、footer 都要標。選單最下方 `.lang-btn` 切換（localStorage）。
- **全站殼**（`pages/header.html` ＋ `css/components/chrome.css` ＋ `js/modules/ui/chrome.js`）：
  - **Logo**（2026-11-18 換成 SVG）：全站同一種＝`images/Logo Text.svg`（兩端矩形白圓點夾英文兩行＋中文一行，中英並列、不跟語言切），寬＝`--col-w`（手機吃滿、桌面同動態欄）。頂到最頂、置中；首頁未展開時 `home.css` 放到畫面正中央（transition 位移）。footer 另一版＝長條 `images/Logo Stroke.svg`＋英中名文字在下。兩張都用 CSS mask 畫（`.logo-text`／`.logo-strip`，同 `.icon`，顏色吃 currentColor）；設計重出圖直接蓋同名檔，比例變了改 chrome.css 的 `aspect-ratio`。
  - **選單**：透明、固定寬 `--menu-w`（手機 10rem／桌面 18rem），logo 不動，沒有底色。開著時內容左緣推到選單右緣（推「選單寬 − 內距」，內容自己的左內距不重複算；user 2026-11-03 定案，不對 grid／logo），跟 play 鈕同一條線，play 鈕在選單右緣（選單開著時 menu 鈕 min-width 撐成選單欄那格、名字算在格子裡，play 自然排在後面——名字中英怎麼換都不影響 play，純 CSS 不量）。
    主選單在上、次選單＋語言鈕推到底，字級同底列。開著時 menu 鈕白圓點＋名字常駐、intro 照常、動態收成只剩＋。選單與 footer 互斥。
    選中／hover 的選項＝文字右邊中線一顆圓點（直徑 `--dot-size`＝logo 骨牌的圓孔，全站 hover 圓點都這個大小、不跟字級走；絕對定位不推版面；user 2026-11-18，方塊試過後改回圓點；`.nav-link::after`；footer 裡的連結 hover 也是這顆，姊妹系所那排圓點放在間距正中）。選項間距 `--spacing-xs`，跟內頁 `.link-list`（課程課名）同一條規則（user 2026-11-18）。
  - **底列**（固定、貼底 `--bar-pad`）：三欄＝左 menu／intro（play icon；**intro 只在首頁**，內頁淡掉、位置照留，user 2026-11-18）、中 最新動態＋（**只在首頁**，內頁淡掉、user 2026-11-10；永遠畫面正中、寬＝`--col-w`＝首頁動態圖片寬）、右 footer。
    矩形鈕＝骨牌（同方塊 icon，寬高 45:70、大小＝logo 上那顆 `--block-h`＝`--logo-w`×70/1067.29（user 2026-11-18；variables.css）、開著／hover／鍵盤聚焦時中央圓點＝圓孔直徑 20/70 高）。hover／鍵盤聚焦才在旁邊出名字，名字跟語言走（選單／簡介／聯絡 ↔ menu／intro／contact；footer 鈕名字 user 2026-11-18 從頁尾改聯絡），平常視覺隱藏但仍是報讀名稱。觸控不出名字（點完 :hover 會黏著 → hover 包 `@media (hover: hover)`、聚焦排除 `html.input-touch`），可點範圍用 `::before` 往外撐（`pointer: coarse`，畫面不變）。
    兩側等寬由 `fitBar` 量 `--side-min`：側邊放不下名字才縮動態、中心不動；標題放不下就跑馬燈。
  - **footer**：覆蓋層（`pages/footer.html`），只有點底列右下 footer 鈕才出現；開著時底列只剩 footer 鈕（白圓點、不出名字），menu／intro／動態用網站 transition 淡出、關掉時淡入（user 2026-11-03 改回一開始的排法）；logo 頂到頂、內容貼底，copyright 對齊底列那條線（`--bar-pad`）。往下捲沒有 footer。**內容走 Directus 單例 `footer`**（`footer-cms.js`；抓不到留 HTML 的 MOCK、抓到後台為準、空欄位整列收；欄位表 `docs/Directus-後台欄位.md`）。
  - **intro**：play 鈕 `data-video` 有網址才開原生 `<dialog>` 播影片。
  - **手機的右圖**（user 2026-11-13 手機稿）：內頁右圖在手機＝畫面右緣「捲軸那一塊」的縮圖鈕 `.figure-btn`（固定在殼上、不在底列裡；右緣對齊 footer 鈕、上下在畫面中線＝桌面右圖那條水平線；邊長 `--thumb-w`、z 同捲軸 35；內文右邊讓出 `--rail-w` 不壓字），點了開原生 `<dialog>` `#figure-dialog` 白底蓋滿畫面、圖置中，再點任何地方／Esc／X 關（fade in／out；控制列 ‹ X › 在畫面正中底部，只有一張時不出 ‹ ›，user 2026-11-18）。縮圖與放大內容＝當頁 `.page-figure` 內容的複本（`chrome.js syncFigure`，換頁與 header 注入後呼叫；右圖做成會自己換的 ASCII 圖時這套複本不適用——`syncFigure` 會關掉開著的 dialog、複本也不會跟著動，到時改成同一個來源同時畫進右圖／縮圖／放大三處）。選單開（內容右推會被壓到）／footer 開／換頁時縮圖淡出。
  - **自製 scrollbar**：同 SCCD，藏原生、JS thumb（`custom-scrollbar.js`），手機不顯示。
- **首頁**：一屏只有置中 logo；點動態「+」→ `html.news-open`：logo 上移到頂、清單在畫面中間展開（寬 `--col-w`）、可捲；清單出現＝從畫面底下往上滑進來、邊滑邊淡入（進出場都是位移＋fade 一起，user 2026-11-19；`home.css` `news-rise` keyframes，時長／曲線同 logo 上移，兩個一起往上；user 2026-11-19）；收合＝反向（user 2026-11-19）：`news-open` 先拿掉（logo 回中間、－變回＋），清單掛 `html.news-closing` 往下滑出畫面、邊滑邊淡出（`news-fall`），滑完才藏起來、捲回頂——`chrome.js setNews` 先量位置再換 class（捲到一半收：畫面上緣以上那一截用 `--news-cut` 切掉、滑的距離 `--news-drop`）；
  底列標題退掉、＋滑到動態欄外右邊一個 gutter（不擋圖）、豎線收掉變－，大小同＋（CSS 畫的兩條線，transition）。
- **選單開著時對右邊內容做任何操作＝第一下只收選單、內容不動**（user 2026-11-18）：在 `#page-content` pointerdown／focusin、選單外 wheel／touchmove 都收（chrome.js；不用 scroll 事件，程式捲動會誤收）；開著＋收回去那段（`html.menu-closing`）內容 `overflow: hidden` 鎖住：至少撐到 `--dur-medium` 滑完，同一個手勢還在送 wheel／touchmove（觸控板慣性）就一直往後推、停 250ms 才解鎖（chrome.js `lockScroll`）；wheel／touchmove 在開著或收回中直接 `preventDefault`（WebKit 的 `overflow: hidden` 擋不住滾輪，實測照捲）。選單那一欄（x 在選單右緣左邊）滾動不算內容。**選單開著點連結**＝先收選單（內容滑回原位，`--dur-medium`）、收完才淡出換頁（router.js loadPage；fetch 先發不等）。
- **網站 transition＝fade in／fade out**（user 2026-11-03）：token `--dur-fade`／`--transition-fade`（variables.css）、JS 用 `DUR.fade`（motion.js）。
  換頁：router 換頁前加 `html.page-leaving` 讓 main 淡出（跟 fetch 並行），換完內容拿掉＝淡入。footer 開關時底列其他鈕也走這組（淡完 visibility 才 hidden）。之後其他進出場也吃這組。
- **內頁版型**（about 起，user 2026-11-03，`css/components/page.css`）：桌面 col 1 段落導覽、col 2–7 內文由上往下、右圖在「內容區右緣～畫面右緣 100vw」那段正中（wrapper col 8–12 加負 margin，圖本身 4 欄寬方形，user 2026-11-19）（user 2026-11-13 初步想法、未定案：不是後台的單一張圖，而是有一個資料庫、每隔幾秒隨機生成一張 ASCII 圖像；現在是灰底佔位）；
  **文字層級命名**（user 2026-11-18；之後 user 說這些名字就是指這幾種）：Page title＝頁標題 `h1` text-lg 粗體；Section title＝段落標題 `h2.section-title`（段落導覽依它生成）粗體 text-md（全站一致，about／curriculum 也是）；Lead＝導言 `.page-lead`（粗體）text-md；Subsection title＝小節標題 `h3` 內文大小 text-s、粗體（user 2026-11-18 about 起）；Body＝內文 `p`／`ul` text-s；Note＝附註 text-xs。標題不 sticky。每段 `h2.section-title`；
  段落導覽（`section-nav.js` 依 section-title 生成：每段一個矩形，沒有上下 chevron、hover 全黑、user 2026-11-18；點了捲過去的途中改「最近那段亮」＝上下兩個方向一樣快到位）sticky 在 `<main>` 裡＝選單開時跟內容一起右推；
  矩形從 h1 那條線（`--top-h`＝`#page-content` padding-top，桌面 7rem／手機 6rem）往下排：**最上面那一格＝頁標題**（`.section-nav-top`，user 2026-11-18：「對齊標題」指的是這一格——一顆**正方形方塊**（邊長＝矩形的寬 0.45em；刻意跟下面段落的長矩形不一樣才看得出差別，user 2026-11-19；先試過圓點）、中心對在 h1 第一行的中線、點了回頁頂），段落的矩形從它下面隔 0.5em 起排（user 2026-11-18；**詳細頁不放段落導覽**，HTML 不放 `.section-nav` 就沒有）；
  排不進（h1 線～底列上緣）＝整串往上移到目前那格看得到、超出的切掉（JS 只給 `--n`／`--i`，排不排得進與位移是 page.css 算）；
  點了把該段頂端（`.page-section`）捲到 h1 那條線（user 2026-11-18），最後一段撐高到捲得到；還沒捲到第一段（在 h1／導言）亮的是頁標題那一格、段落的矩形都不亮（原本算第一段；加了頁標題那一格後改，user 2026-11-18）。**段落圖片輪播** `.slideshow`（about 起、user 2026-11-18）：每段 h2 下面 5 張（標題 → 圖 → 內文）、中間最大壓最上層、左右兩張最小在後面、點左右切換（環狀），`slideshow.js` 只寫 data-pos、位置轉場全 CSS；圖暫時是 Lorem Picsum stock（彩色，user 2026-11-19；原本加了 `?grayscale`）。手機（user 2026-11-13 手機稿）＝同一套三塊壓窄：左緣段落導覽＋返回鈕（對齊 menu 鈕）、中間內文由上往下、右緣中線上的右圖縮圖鈕（見上「手機的右圖」）；內文 `col-span-full`＋左右 margin `--rail-w`（＝縮圖邊長＋gutter，桌面 0），跟導覽同在 grid row 1（sticky 才有整頁高可走）。
- **詳細頁**（`<slug>-detail`，user 2026-11-10）：列表 `a.item-row` 點進去；左上角 `.back-btn`（反過來的 play icon＝朝左三角、大小同底列 play 鈕，user 2026-11-18；回列表）＝col 1 上緣對齊內容第一行、sticky（手機也是）、左緣對齊導覽矩形，放 `grid-area: 1 / 1`（詳細頁沒有 `.section-nav`，user 2026-11-18）；選單亮父頁。目前有 `faculty-detail`（照片＋名字＋各段條列）、`curriculum-detail`（課程課名點進去：只有課名＋一段說明 `.profile-sub`；user 2026-11-18 去掉年級／必選修那行與各段，後台 `courses.description_*`）；右圖照常、接 Directus 後帶 `?id=`。
  **全部內頁（含 404）都用這版型＋右圖**（user 2026-11-10）。**摺疊**（原生 `<details>`：常見問題、動態；user 2026-11-18）：原生箭頭換成整列最右邊一顆**圓點**（`details::after`；跟選單 hover／選中出現的那顆同一種 `--dot-size`），**圓點永遠對在整塊的水平中線**（top 50%；user 2026-11-19：全站的圓點都是這個邏輯，原本常見問題收著時對第一行、問題折行就不在中線上）：收著＝那一列的正中、打開＝整個展開後內容高度的正中（hover 不變；user 2026-11-18 方塊改回圓點）。**展開／收起都有動畫**（user 2026-11-18）：`accordion.js` 接手 summary 的點擊、把 details 的高度補間（Web Animations，`DUR.medium`＋`--ease-standard`；圓點是整塊高的 50%、跟著一起走）；收起時 `open` 等縮完才拿掉、一開始先標 `.is-closing`（CSS 當它已關）；動到一半再點＝掉頭；減少動態＝照原生瞬間開合。常見問題：問題與答案都是 text-s。
  **動態 news**（user 2026-11-18）：沒有段落導覽（左邊的 anchor 方塊；年份的 Section title 照留）；每則一個摺疊，收著的樣子同師資那一列（`summary.item-row`＝縮圖＋標題＋分類，text-md），時間不寫在外面；展開（`.fold-body`，桌面對齊文字那一欄）＝時間、地點各一行直接寫、不加「時間／地點」標籤（`.fold-meta` 裡的 `p`；user 2026-11-18），下面相簿（`.album`：所有圖一排、同一個最大高 `--album-h`（手機 6rem／桌面 9rem，user 2026-11-19 縮小）、照原比例，放不下橫向捲＋左右 chevron（在圖列外面兩邊、不壓圖；icon＝play icon、prev 轉 180°，大小同底列 play 鈕；放大 dialog 的左右也是，user 2026-11-19），`album.js` 照 SCCD playlist 縮圖列、沒旋轉；圖暫時是 Lorem Picsum，彩色）；點相簿的圖＝共用右圖的放大 dialog 蓋滿畫面、照原比例、控制列 ‹ X › 可左右切（左右鍵也行、到頭 disabled），再點任何地方／Esc 關；**打開的那則點封面縮圖**（`.item-thumb img`）＝放大封面、不收合（accordion.js 擋掉開合，user 2026-11-18）；封面是那一組的第一張、後面接相簿，點封面或相簿哪張都能左右切（`galleryOf`，user 2026-11-19）（`chrome.js openFigure`：dialog 內容開的時候才放）。**入學 admission＝一則一則的動態**（user 2026-11-18）：整頁就是同一種列、不另外做別種摺疊，不分年份、沒有段落導覽；跟動態頁不同：外面只有標題＋時間（沒有分類那一行；**沒有縮圖**，user 2026-11-19：summary 不掛 `.item-row`、展開內容靠左），點開的順序＝說明文字（p）→ 相簿 → 附件（`.link-list` 連結清單、粗體、另開新視窗），有才出，沒有地點那一行；第一則是完整示意。後台 `news` 要補 `category_*`／`time_*`／`place_*`／`album`／`attachments`／`admission`（勾了才列在入學頁，待確認）（見 `docs/Directus-後台欄位.md`；`scripts/setup-directus.cjs`／`seed-directus.cjs` 還是舊結構）。右圖「永遠在畫面正中」＝高 0 的 sticky 錨點停在中線、內容往上下溢出；**選單開著時右圖在變窄後的剩餘空間重新置中並縮小**（內容右推 `--shift` → 空間正中往右 shift/2：反向位移 −shift/2、寬少掉 shift＝兩邊留白不變；user 2026-11-19，原本是右緣不動），過場跟右推同一組時長與曲線（user 2026-11-18，page.css `.page-figure > *`）（段落導覽同樣高 0 錨點，但停在 h1 線、往下溢出）。**動態的圓點**在整個 block 正中（收著＝縮圖那列中線、展開跟著整塊）、hover／鍵盤聚焦才出現、點開後常駐（user 2026-11-18；page.css `.item-list details::after`）。
  （有高度的 sticky 捲到底會被格子底頂走）。段落裡的條列 `.item-list`（項目間空一行、h3 不粗體）；`.item-row`＝左方形縮圖 **1.5 欄**＋隔一個 gutter 的右文字（faculty 連詳細頁／partners 整列外連企業官網、另開新視窗，user 2026-11-18；原本 2 欄）；師資詳細頁照片同寬（page.css `--item-thumb-w`：內文欄手機當 4 欄、桌面 6 欄，1.5 欄＝1.5 欄寬＋半個 gutter）。
  整列是連結的 `a.item-row` hover 不變淡，改在整列最右邊、整列高的正中出一顆圓點（同選單 hover 那顆；user 2026-11-18 方塊改回圓點）。項目標題 h3 跟著清單 ul 的字級（ul 掛 `text-*`）。
  faculty 段落順序＝專任 → 兼任 → 業界導師（user 2026-11-18；MOCK 是寫死的 HTML 順序，接後台後前台也固定這個順序、段內照 `sort`），名字與單位都 text-md（ul 掛 `text-md`）；同結構的 partners（縮圖＋企業名稱＋說明）也一樣掛 `text-md`；
  faculty 名字／單位也跟語言切（user 2026-11-18 改，原本中英兩行並排）；curriculum 每個年級裡分必修／選修兩組：小標（h3，這頁另掛 text-md）寫一次、課名排在下面，同字級 text-md（user 2026-11-18；原本每門課底下各寫一次）；課名是 `.link-list` 裡的 `a.nav-link`（間距同選單；hover 圓點在清單最右邊＝內文欄右緣、整列可點，網站地圖同款）連到 curriculum-detail。admission 排法同常見問題（一個主題一個 `<details>` 摺疊、text-s），但沒有分類的 Section title、也就沒有段落導覽（user 2026-11-18）。
  **榮譽 records**（user 2026-11-19；主選單在入學上面）：排法同常見問題（一筆一個 `<details>`、text-s），沒有分類的 Section title、沒有段落導覽；收著那一列（`details.record`）＝左**國旗**（國家用國旗呈現；4:3、高＝一行字、彩色、不加框、上下置中對在右邊兩行字的正中（先做兩行高＋灰階＋黑框，user 2026-11-19：太大、要有顏色、不用框、center 對齊）；圖＝jsDelivr 上 flag-icons 的 SVG，檔名＝ISO 兩碼；國家名稱留在 `.sr-only` 給報讀）、國旗右邊獎項名稱、獎項下面得獎人；點開＝主辦方、獎別，**對齊右邊獎項那一欄**，各一行直接寫、不加標籤。圓點在整塊的水平中線（收著＝國旗那條線、展開跟著整塊；user 2026-11-19，之後全站摺疊都改成這個邏輯）。後台集合 `records` 待建（欄位見 `docs/Directus-後台欄位.md`）。
- 狀態全掛 `<html>` class：`menu-open`／`footer-open`／`news-open`／`page-leaving`；換頁 `closeOverlays()` 全收。
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
| about / partners / faculty / curriculum / news / records / admission | 關於／合作企業／師資／課程／動態／榮譽／入學 · About／Partners／Faculty／Curriculum／News／Records／Admission | 主選單 |
| qa / donate / regulations / terms / sitemap | 常見問題／捐款／規章／條款／網站地圖 · QA／Donate／Regulations／Terms／Site Map | 次選單（sitemap 頁本身：連結一串 text-md、不列自己、最後一項「聯絡」`a[href="#contact"]`＝開頁尾，user 2026-11-18） |
| faculty-detail | 教師（師資列表點進去） | 詳細頁（不進選單／sitemap） |
| curriculum-detail | 課程內容（課程課名點進去） | 詳細頁（不進選單／sitemap） |
| 404 | | |

## 專案結構
```
├── index.html              # 首頁：空一屏＋展開用動態清單（MOCK）；body 靜態標 data-page="index"
├── pages/
│   ├── header.html         # 全站殼：logo、透明選單（含語言鈕）、底列、intro dialog → 注入 #site-header
│   ├── footer.html         # footer 覆蓋層 → 注入 #site-footer
│   └── <slug>.html         # 15 個內頁（含 faculty-detail、curriculum-detail）（MOCK 示意；直接開也能獨立跑）
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
│   └── modules/ui/         # chrome / footer-cms / section-nav / accordion / lang / custom-scrollbar / site-base / escape-html / page-cleanup / motion / a11y / reduce-motion
├── images/favicon.svg      # 矩形＋圓（TODO 正式 SVG）
├── fonts/glow-sans-tc-compressed/  # 中文字體 woff2 切片＋font.css＋OFL.txt（scripts/build-fonts.py 產生）
├── scripts/                # smoke.cjs（Playwright 煙霧測試）、setup-directus.cjs（建後台集合）、seed-directus.cjs（解析各頁 HTML 的 MOCK 寫進後台；前台 MOCK 是唯一來源）；都可重跑、.directus-token 不入庫
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
5. **新頁三步**：`pages/X.html`（複製 about.html）→ `router.js PAGES` 加 slug → header 選單＋sitemap 加連結；所有文字中文寫內文、英文寫 data-en。頁面專屬 JS 用動態 import 掛在 `main.js initPageModules`。沒有 Section title 的頁不放 `<nav class="section-nav">`（沒有段落就沒有 anchor 方塊；user 2026-11-18）。
6. **換頁要收乾淨**：window/document 級 listener 用 `registerPageCleanup()`；`<main>` 內 GSAP／ScrollTrigger 由 `cleanupPageModules` 統一殺。
7. **動畫**：`DUR.*`／`EASE.*`（motion.js）；進場要能在 `prefers-reduced-motion` 下直接到終態（GSAP 已全域 patch）。
8. **版型看寬度、互動看輸入**：排版 `SCAIDHelpers.isMobileLayout()`，hover 類 `canHover()`／`isCoarsePointer()`。
9. **後台文字塞 innerHTML 前過 `escapeHtml()`**；純文字用 `textContent`。
10. **無障礙**：非互動元素綁 click 過 `makeActivatable()`；icon／矩形鈕有 `aria-label`。
11. **MOCK 內容**：示意文字中文寫「（示意）」或「示意：」、英文寫 Placeholder，接 Directus 時 grep 得到；不要寫看起來像真的資料。
12. **殼的 z 序**：logo 30（毛玻璃 `.top-blur` 是 logo 的子層）＜ 捲軸 35 ＜ 選單 40 ＜ footer 45 ＜ 底列 60；`#page-content` 有 transform（右推用），裡面別放 fixed 元素。

## 刻意沒搬的 SCCD 功能（需要時從 `../SCCD Website` 搬）
三 mode 主題切換（`js/modules/ui/theme-toggle.js`、`css/themes/`；token `--theme-*` 已留著）、Lottie logo、footer 散佈卡、intro 動畫、
scroll-snap、矮橫向／直向全站層（`css/layout/landscape.css` 84KB）、ui_labels／site-assets 後台覆蓋。
通用文件可直接參考：`docs/字級規範.md`、`無障礙稽核與改進清單.md`、`橫向手機版最佳實踐.md`、`SPA-接-Directus-Headless-最佳實踐.md`。

## TODO
- 正式 favicon／apple-touch-icon／og-image（logo 已換 SVG）
- intro 影片網址 → `header.html .play-btn data-video`
- footer：社群 icon 圖（連結、聯絡資訊、姊妹系所、標章、copyright 已走後台）
- Directus 已開（`scaidcms.usc.edu.tw`，2026-11-18；9 個集合已建、Public 全開、footer 已接）→ 各頁 MOCK 與底列動態改模組渲染（列表自己帶 `filter[status][_eq]=published`；page_sections 內文要 sanitize）；內容依 lang 抓對應欄位
- 正式網域 → `router.js CLEAN_URL_HOSTS`、`index.html` canonical／og:url
