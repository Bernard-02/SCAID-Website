/** @type {import('tailwindcss').Config} */
// 所有數值都是 var(--*)，單一來源在 css/variables.css。Tailwind 本身就是手機優先（md: 以上才是桌面）
module.exports = {
  content: [
    "./*.html",
    "./pages/**/*.html",
    "./js/**/*.js",
  ],
  // 字級 utility 全自定義（值見 variables.css）；safelist 保證 4 階一律生成（JS 動態組 class 也有效）
  safelist: ['text-xs', 'text-s', 'text-md', 'text-lg'],
  theme: {
    extend: {
      // pc:＝≥768 且有滑鼠（hover）：只有 PC 出右圖，PC 以外（手機、iPad…觸控）收成右緣那顆鈕（user 2026-11-23；版型照舊只分 md:）。JS 那份在 object.js
      screens: { 'pc': { raw: '(min-width: 768px) and (hover: hover)' } },

      // 介面色：目前只有黑白＋灰階（網站本身是彩色的，user 2026-11-19）
      colors: {
        'black': '#000000',
        'white': '#FFFFFF',
        'light-gray': 'var(--light-gray)',
        'dark-gray': 'var(--dark-gray)',
        'theme-fg': 'var(--theme-fg)',   // 跟深色模式反過來的實心底（捐款鈕：bg-theme-fg text-theme-bg）
        'theme-bg': 'var(--theme-bg)',
        'gray': {
          0: '#000000', 1: '#1A1A1A', 2: '#333333', 3: '#4D4D4D', 4: '#666666', 5: '#808080',
          6: '#999999', 7: '#B3B3B3', 8: '#CCCCCC', 9: '#E6E6E6', 10: '#FFFFFF',
        },
      },

      // 英文走 JetBrains Mono、中文字落到 Glow Sans TC Compressed（自架切片，fonts/glow-sans-tc-compressed/）；全站一個堆疊，不分中英元件
      fontFamily: {
        'sans': ['JetBrains Mono', 'Glow Sans TC Compressed', 'monospace'],
      },

      // 4 階字級：[字級, 行距] tuple → .text-* 自帶該階 line-height（xl 以上 user 2026-11-21 先刪，要用再開）
      fontSize: {
        'lg':  ['var(--font-size-lg)',  'var(--line-height-lg)'],
        'md':  ['var(--font-size-md)',  'var(--line-height-md)'],
        's':   ['var(--font-size-s)',   'var(--line-height-s)'],
        'xs':  ['var(--font-size-xs)',  'var(--line-height-xs)'],
      },

      fontWeight: {
        'regular': 'var(--font-weight-regular)',
        'medium': 'var(--font-weight-medium)',
        'bold': 'var(--font-weight-bold)',
      },

      lineHeight: {
        'base': 'var(--line-height-base)',
      },

      spacing: {
        'xs': 'var(--spacing-xs)',
        'sm': 'var(--spacing-sm)',
        'md': 'var(--spacing-md)',
        'lg': 'var(--spacing-lg)',
        'xl': 'var(--spacing-xl)',
        '2xl': 'var(--spacing-2xl)',
        '3xl': 'var(--spacing-3xl)',
        '4xl': 'var(--spacing-4xl)',
        '5xl': 'var(--spacing-5xl)',
        '6xl': 'var(--spacing-6xl)',
        '7xl': 'var(--spacing-7xl)',
        '8xl': 'var(--spacing-8xl)',
        'gutter': 'var(--spacing-gutter)',
        'container-padding': 'var(--container-padding)',
      },

      gap: {
        'gutter': 'var(--spacing-gutter)',
      },
    },
  },
  plugins: [],
}
