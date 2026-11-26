"""中文版用的 JetBrains Mono：字形整個往下移，英數的底對齊中文字的底（user 2026-11-25：「中文裏面出現的英文，baseline要以中文的爲主」）。

Glow Sans 的中文字筆畫的底在英文基準線下面約 0.062em（Regular，fontTools 量 42 個常用字外框 yMin 的中位數；Medium 約 0.071em；
canvas 的 measureText 會往上捨到整數像素、量不準），
英數（JetBrains Mono）站在基準線上 → 混排時英數看起來比中文浮起來一點。CSS 不能只移某一個字體的字形，只能改字檔：
fonts/jetbrains-mono/ 那六片每個字形往下移 SHIFT_EM（換成字體單位要除以 size-adjust，typography.css；size-adjust 改了這裡的 SIZE_ADJUST 跟著改、重跑），
寫到 fonts/jetbrains-mono/zh/；行高（ascent／descent）、字寬都不動＝排版不變，只有字形下移。
英文版照舊用原本那份（variables.css --font-latin 跟 <html lang> 換）。
提示（hinting）一起拿掉：TrueType 的提示照原本的高度對齊，字形移了還照舊對齊會變形。

粗細也照中文（user 2026-11-25：「baseline跟粗細也要改，如果中文裏面有英文跟數字」）：全站的字重 token 是 300／480／700（英文版調的），
中文字檔只有 Regular／Medium／Bold 三個＝筆畫約 60／90／118（千分之幾 em，量「十口日一」的外框）；同一個 token 下英數的直畫是 85／112／134
（× size-adjust 1.07 之後）＝比旁邊的中文粗 42%／24%／14%。這裡把字重軸重新對應（WEIGHTS）：CSS 要 300／480／700 時實際畫 150／350／550
＝直畫 62／91／120、跟中文的筆畫一樣粗（fontTools instancer 把軸裁成那三點、再把刻度改回 300／480／700；CSS 那邊不用動）。

用法：python scripts/shift-latin.py   （要 fonttools、brotli：pip install --user fonttools brotli）
重抓 JetBrains Mono 那六片之後要重跑；印出來的 ?v= 雜湊抄進 typography.css 的 'JetBrains Mono ZH' 那六條。
"""
import hashlib
from pathlib import Path
from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

# 往下移多少（em）：中文字筆畫底在基準線下面約 0.062（Regular），user 2026-11-25 先要對齊那條（0.063）、同一天看了說「英文的baseline要再往上一點點，視覺上才會對齊」
# ＝少移一點：中文的底多半是一橫、看起來比實際的外框高，英數的底停在它上面一點才像對齊（0.045 → 2026-11-26「再高一點」0.03）
SHIFT_EM = 0.03
# CSS 的字重（variables.css --font-weight-regular／medium／bold）→ 實際畫的 JetBrains Mono 字重＝筆畫跟中文那個字重一樣粗。
# 要調：改右邊那三個數字重跑（量法：scratchpad 的 stems.py——中文量「十口日一」、英數量 H 的直畫 × SIZE_ADJUST）
WEIGHTS = {300: 150, 480: 350, 700: 550}
SIZE_ADJUST = 1.07    # typography.css 的 size-adjust：107%（user 2026-11-25：「英文相對中文再小一點」；原本 113.97%）
SRC = Path(__file__).resolve().parent.parent / 'fonts' / 'jetbrains-mono'
OUT = SRC / 'zh'

OUT.mkdir(exist_ok=True)
CSS = sorted(WEIGHTS)
for src in sorted(SRC.glob('*.woff2')):
    # 字重軸裁成 WEIGHTS 那三點（中間那個當預設），再把刻度改回 CSS 的字重＝瀏覽器照 CSS 的 300／480／700 選到的是 150／350／550
    font = instancer.instantiateVariableFont(TTFont(src), {'wght': tuple(WEIGHTS[w] for w in CSS)})
    axis = font['fvar'].axes[0]
    axis.minValue, axis.defaultValue, axis.maxValue = CSS
    font['fvar'].instances = []             # 具名的字重（Light、Regular…）刻度對不上了，瀏覽器也用不到
    if 'STAT' in font:
        del font['STAT']
    dy = -round(SHIFT_EM / SIZE_ADJUST * font['head'].unitsPerEm)
    glyf = font['glyf']
    for name in glyf.keys():
        g = glyf[name]
        if g.numberOfContours > 0:          # 一般字形；組合字形照它的零件走、不用移
            g.coordinates.translate((0, dy))
        g.removeHinting()
    for name in glyf.keys():                # 組合字形的外框要等零件移完再算
        glyf[name].recalcBounds(glyf)
    for tag in ('fpgm', 'prep', 'cvt ', 'cvar', 'hdmx', 'VDMX', 'LTSH'):
        if tag in font:
            del font[tag]
    font.flavor = 'woff2'
    font.recalcTimestamp = False            # 不蓋修改時間＝重跑出來的檔一模一樣、?v 不會白白變
    out = OUT / src.name
    font.save(out)
    # 自我檢查：寫出來的檔在 CSS 的三個字重畫出來的句點，要跟原檔在對應的字重一樣寬（句點的寬跟著筆畫粗細走；有句點的那一片才驗）
    if 0x2E in TTFont(src).getBestCmap():
        def dot(path, weight):
            inst = instancer.instantiateVariableFont(TTFont(path), {'wght': weight})
            gs = inst.getGlyphSet()
            pen = BoundsPen(gs)
            gs[inst.getBestCmap()[0x2E]].draw(pen)
            return pen.bounds[2] - pen.bounds[0]
        for css, real in WEIGHTS.items():
            assert abs(dot(out, css) - dot(src, real)) <= 1, f'{src.name}：CSS {css} 應該畫成 {real}，句點寬 {dot(out, css)} vs {dot(src, real)}'
    print(f"{src.name}: dy {dy} → ?v={hashlib.sha1(out.read_bytes()).hexdigest()[:8]}")
