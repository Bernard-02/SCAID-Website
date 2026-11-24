# 後台搬到 Directus 11

user 2026-11-23 決定：現在的後台是 Directus 12（12.6.1），沒有付費序號＝免費的 Core 方案，軟體硬性限制帳號 3 個、集合 25 個、Flow 5 個（已經用到 24）。
改裝跟 SCCD 一樣的 Directus 11（11.17.4，軟體不限制數量），把現在後台上的東西全部搬過去。
（為什麼兩邊不一樣、v11 的授權條款：見 `docs/IT-請求-改裝Directus11.txt` 附註。）

## 流程

1. **IT 裝 v11**：送 `docs/IT-請求-改裝Directus11.txt`。新的那套裝在現有後台旁邊（新資料夾、新資料庫、port 8056、暫用網域），現有的 12 不動。
2. **拿新的那台的 token**：用 IT 給的管理員登入 `https://<暫用網域>/admin` → 左下角使用者頭像 → 自己的帳號 → 「Token」欄位按產生 → 複製 → 存檔。
   token 存成 `scripts/.directus-token-v11`（gitignore，絕不入庫）。
3. **通知編輯者**：從這裡到切換完成，不要在後台改內容（搬完才改的只會留在舊的那台）。
4. **建結構**（照 `setup-directus.cjs` 的 SPEC；SPEC 是唯一來源，不從舊的那台複製）：
   ```bash
   DIRECTUS_URL=https://<暫用網域> DIRECTUS_TOKEN=$(cat scripts/.directus-token-v11) node scripts/setup-directus.cjs --dry
   DIRECTUS_URL=https://<暫用網域> DIRECTUS_TOKEN=$(cat scripts/.directus-token-v11) node scripts/setup-directus.cjs
   ```
5. **搬**（舊的那台只讀；可以重跑：已經有的那一筆照舊的蓋過去、檔案只更新資料不重傳）：
   ```bash
   TO_URL=https://<暫用網域> TO_TOKEN=$(cat scripts/.directus-token-v11) node scripts/migrate-directus.cjs --dry
   TO_URL=https://<暫用網域> TO_TOKEN=$(cat scripts/.directus-token-v11) node scripts/migrate-directus.cjs
   ```
   最後一行要是「✓ 比對完全一致」。不一致＝它會列出哪個集合、哪一筆，修好重跑。
   PowerShell：`$env:TO_URL='https://<暫用網域>'; $env:TO_TOKEN=(Get-Content scripts/.directus-token-v11); node scripts/migrate-directus.cjs`
6. **（選擇性）前台先看一遍**：把 `js/config/api.js` 的兩個網址暫時改成暫用網域，本機開網站走一遍，看完改回來（不要 commit）。
7. **請 IT 切換**：請求單的步驟七。網址一樣（scaidcms.usc.edu.tw），前台不用改。出問題＝IT 把網址切回 12，原本的資料都還在。
8. **切換後**：
   - `scripts/.directus-token` 換成新的那台的 token（舊的 12 停了）；`scripts/.directus-token-v11` 刪掉。
   - 在新的那台開編輯者帳號（v11 沒有 3 個的上限）。管理員第一次登入會提醒設定「專案擁有者」（BSL 授權條款，見請求單附註）。
   - 文件：`CLAUDE.md`「後台」那段、`docs/Directus-後台欄位.md` 開頭、`setup-directus.cjs` 註解裡的「Core 方案上限 25」改掉；
     v11 有條件式權限（12 的 Core 拿掉了），之後可以改成 Public 只讀得到「上架」的內容。
   - 一個月後請 IT 刪掉舊的 12（資料夾、資料庫、S3 原本的子資料夾）。

## 搬什麼、不搬什麼

| 搬 | 不搬 |
|---|---|
| 檔案庫的資料夾（照原本的 id；新的那台已經有同名同層的＝沿用它的，例如 setup 建的「作品」） | 帳號（密碼搬不出來；新的那台自己開） |
| 檔案：實體檔＋標題、描述、標籤、焦點（照原本的 id，內容裡的圖片引用不用改） | 書籤、版面設定、Flow（目前 0 個） |
| 每個集合的每一筆：照原本的主鍵；單例、子表、junction 都是；照關聯排順序（庫 → 內容 → 子表 → junction） | 操作紀錄、修改紀錄 |
| 專案設定：名稱、顏色、語言、登入頁 | 舊的那台有、SPEC 沒有的欄位（腳本會列出來） |

2026-11-23 列出來沒搬的欄位：`faculty.affiliation_*`、`partners.description_*` 全是空的，`footer.copyright_*` 只有「版權所有（示意）」——都是之前拿掉的欄位，不用搬。

## 實測（2026-11-23）

本機裝 Directus 11.17.4（SQLite，檔案存本機）：
- `setup-directus.cjs` 建結構：25 個集合＋資料夾、公開讀取、「作品」資料夾，沒有錯誤。
- 從線上的 12.6.1 搬：資料夾 1 個、檔案 1 個（保留原本的 id）、24 個集合的內容，**逐筆比對完全一致**；再跑一次一樣一致、沒有重傳。
- v11 上前台用的公開讀取都正常（動態、關於、師資連人名庫、介面文字、作品資料夾的圖、`/assets` 讀得到檔案）。
- 本機裝 v11 時 `isolated-vm` 要現場編譯（Windows 沒有 Visual Studio 編不起來）→ 請求單已請 IT 先裝 `build-essential`、`python3`。

## 實際（2026-11-24）

- IT 沒走暫用網域：直接把 `scaidcms.usc.edu.tw` 切到新裝的 v11.17.4（空的）。新的那台的 token 存在 `scripts/.directus-token`（沒有 `-v11`）。
- 建結構：`setup-directus.cjs`（不用給 `DIRECTUS_URL`，預設就是這個網域）。
- 舊的 12 外面連不到了 → 改從上面「實測」留在本機的副本（11-23 18:18）搬：`FROM_URL=http://127.0.0.1:8056 FROM_TOKEN=<副本的 token> TO_URL=https://scaidcms.usc.edu.tw TO_TOKEN=$(cat scripts/.directus-token)`，✓ 比對完全一致（25 個集合、1 個檔案）。
  副本之後舊的那台只改過首頁影片的網址（11-23 20:06；翻各對話的操作紀錄，user 也確認自己沒在後台改）→ 搬完補上。
- 步驟 8 還剩：編輯者帳號、一個月後請 IT 刪舊的 12。之後要再從舊的 12 補東西＝IT 給它一個暫用網址、`FROM_URL`＋`FROM_TOKEN`（舊的那台的；預設的檔現在是新的那台的）指過去重跑——搬完之後在新後台改的會被蓋掉。

## 注意

- v11 的 `PATCH /relations` 會讓伺服器當掉（SCCD 2026-07-16 踩過）：腳本都只 `POST` 關聯；別在 API 改關聯的設定。
- 新的那台的 token 跟舊的不同：指錯台只會 401，不會改到別台。`migrate-directus.cjs` 拒絕 TO_URL 跟舊的那台同一個網址。
- 主鍵照原本的寫進去：MySQL 的自動編號會自己接在最大值後面。
