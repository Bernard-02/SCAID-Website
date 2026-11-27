/**
 * SCAIDHelpers 的型別定義
 * 這是 ambient（全域）module，不能有 export/import
 */

interface SCAIDHelpersAPI {
  // 站台路徑（子路徑部署安全）
  siteBase: string;
  sitePath(path: string): string;

  // 版型判斷（版型看寬度、互動看輸入）
  isMobileLayout(): boolean;
  canHover(): boolean;
}

declare var SCAIDHelpers: SCAIDHelpersAPI;

interface Window {
  SCAIDHelpers: SCAIDHelpersAPI;
}
