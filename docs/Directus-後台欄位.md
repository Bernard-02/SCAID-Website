# SCAID Directus 後台欄位

前台要抓的欄位都列在這裡，後台照這份建（Settings → Data Model）。**集合名、欄位 key 要一字不差**，前台照名字抓。

共通：
- 每個集合建好後，到 **Public 角色開 Read**；沒開＝前台抓不到，畫面維持示意字。有圖片欄位的，`directus_files` 也要開 Read。
- 後台網域只填在 `js/config/api.js` 一處。
- 中英文欄位用 `_zh`／`_en` 成對；英文留空＝英文版顯示中文。

## footer（頁尾）— 單例

建法：Create Collection → 名稱 `footer` → 勾 **Singleton**（只有一筆，直接編那一筆）。
前台：`js/modules/ui/footer-cms.js`。抓到後台＝以後台為準，**欄位留空＝那一列不顯示**。

| key | 類型／介面 | 內容 |
|---|---|---|
| `email` | String／Input | 電子郵件 |
| `tel` | String／Input | 電話（中英共用） |
| `fax` | String／Input | 傳真（中英共用） |
| `address_zh` | String／Input | 地址（中文） |
| `address_en` | String／Input | 地址（英文） |
| `social` | JSON／**Repeater** | 社群連結，可拖曳排序。子欄位：`label`（名稱，給報讀用，例 Instagram）、`url` |
| `links` | JSON／**Repeater** | 姊妹系所連結，可拖曳排序。子欄位：`label`（顯示文字，例 SCCD）、`url` |
| `badge` | Image | 標章圖；圖片替代文字＝檔案標題（在檔案庫改） |
| `copyright_zh` | String／Input | 版權文字（中文） |
| `copyright_en` | String／Input | 版權文字（英文） |

- Repeater 的子欄位 `label`、`url` 都是 String／Input；Display Template 填 `{{label}}`，列表才看得出每筆是什麼。
- 網址只接受 `https://`、`mailto:`、`tel:` 開頭，其他會變成無效連結。
- 欄位標籤（電子郵件／電話／傳真／地址）、logo 屬於版面，不在後台。社群 icon 圖還沒定，目前是方框。
