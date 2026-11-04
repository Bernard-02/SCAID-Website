/** @type {import('tailwindcss').Config} */
// 所有數值都是 var(--*)，單一來源在 css/variables.css。Tailwind 本身就是手機優先（md: 以上才是桌面）
module.exports = {
  content: [
    "./*.html",
    "./pages/**/*.html",
    "./js/**/*.js",
  ],
  // 字級 utility 全自定義（值見 variables.css）；safelist 保證 7 階一律生成（JS 動態組 class 也有效）
  safelist: ['text-xs', 'text-s', 'text-md', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl'],
  theme: {
    extend: {
      // cursor-* utility 吃自製游標（--cursor-* 由 js/utils/helpers.js setCursorVars 寫入 :root）
      cursor: Object.fromEntries(
        ['default', 'pointer', 'text', 'not-allowed', 'grab', 'grabbing', 'zoom-in', 'zoom-out', 'w-resize', 'e-resize']
          .map(k => [k, `var(--cursor-${k})`])
      ),

      // 黑白品牌：只有黑白＋灰階
      colors: {
        'black': '#000000',
        'white': '#FFFFFF',
        'light-gray': 'var(--light-gray)',
        'dark-gray': 'var(--dark-gray)',
        'gray': {
          0: '#000000', 1: '#1A1A1A', 2: '#333333', 3: '#4D4D4D', 4: '#666666', 5: '#808080',
          6: '#999999', 7: '#B3B3B3', 8: '#CCCCCC', 9: '#E6E6E6', 10: '#FFFFFF',
        },
      },

      // 英文走 JetBrains Mono、中文字落到 Noto Sans TC；全站一個堆疊，不分中英元件
      fontFamily: {
        'sans': ['JetBrains Mono', 'Noto Sans TC', 'monospace'],
      },

      // 7 階字級：[字級, 行距] tuple → .text-* 自帶該階 line-height
      fontSize: {
        '3xl': ['var(--font-size-3xl)', 'var(--line-height-3xl)'],
        '2xl': ['var(--font-size-2xl)', 'var(--line-height-2xl)'],
        'xl':  ['var(--font-size-xl)',  'var(--line-height-xl)'],
        'lg':  ['var(--font-size-lg)',  'var(--line-height-lg)'],
        'md':  ['var(--font-size-md)',  'var(--line-height-md)'],
        's':   ['var(--font-size-s)',   'var(--line-height-s)'],
        'xs':  ['var(--font-size-xs)',  'var(--line-height-xs)'],
      },

      fontWeight: {
        'regular': 'var(--font-weight-regular)',
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
