/**
 * SCAIDHelpers 與全域 CDN script 的型別定義
 * 這是 ambient（全域）module，不能有 export/import
 */

interface SCAIDHelpersAPI {
  // 站台路徑（子路徑部署安全）
  siteBase: string;
  sitePath(path: string): string;
  refreshCursorVars(): void;

  // 版型判斷（版型看寬度、互動看輸入）
  LANDSCAPE_GATE: string;
  isLandscapeGate(): boolean;
  isMobileLayout(): boolean;
  isDesktopLayout(): boolean;
  canHover(): boolean;
  isCoarsePointer(): boolean;

  // DOM
  scrollToElement(target: HTMLElement | string, offset?: number, behavior?: ScrollBehavior): void;
  shuffle<T>(arr: T[]): T[];
}

declare var SCAIDHelpers: SCAIDHelpersAPI;

interface Window {
  SCAIDHelpers: SCAIDHelpersAPI;
}

// CDN 全域 library（any 避免過度約束）
declare var gsap: any;
declare var ScrollTrigger: any;
declare var ScrollToPlugin: any;
declare var CustomEase: any;
