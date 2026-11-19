"""中文字體切片：Glow Sans TC Compressed（未來熒黑，SIL OFL 1.1）→ fonts/glow-sans-tc-compressed/ 的 woff2 切片＋font.css。

整顆 OTF 一個字重 8.7MB，不能直接給瀏覽器 → 照 Google Fonts 切 Noto Sans TC 的那組 unicode-range（依字頻分組）切片，
瀏覽器只抓頁面用到的那幾片。

TC 版缺字用 J 版補（user 2026-11-18）：TC 版少了「教清真值告填慎鎮顛巔」這 10 個常用字，加上少數異體字與符號
（上游 issue #22，v0.93 沒修、專案已停更；TC 以源樣黑體為底、走傳承字形，這幾個字只收了敎淸眞…那個碼位）
→ TC 沒有而 J 版有的字，從 J 版另外切一片（<字重>-j.woff2）掛在同一個 font-family 底下。
TC 有收但畫成另一個字的（為→爲、即→卽…，見 USE_J）也放進這片、不從 TC 切。
兩版的度量與字寬完全一樣，混排不會跳；J 來的字是日本寫法（新字形），TC 其他字是傳承字形。

ponytail: 只切 Google 那組列到的字（約 1.4 萬個，跟原本用的 Noto Sans TC 涵蓋相當）；字體另外還有約 1.5 萬個罕用字沒切，
遇到會退回系統字體。真的需要再把剩下的字照碼位順序補切幾片（woff2 會從 6MB 變 15MB 左右）。

用法（換字重／換版本才需要重跑；產物已入庫）：
  pip install fonttools brotli
  python scripts/build-fonts.py <放 GlowSansTC-Compressed-*.otf 與 GlowSansJ-Compressed-*.otf 的資料夾>
  otf 來源：https://github.com/welai/glow-sans/releases（GlowSansTC-Compressed-v0.93.zip、GlowSansJ-Compressed-v0.93.zip）
"""
import hashlib
import re
import sys
import urllib.request
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

FAMILY = 'Glow Sans TC Compressed'
WEIGHTS = {400: 'Regular', 700: 'Bold'}   # CSS font-weight → otf 檔名的字重；網站只用這兩個（variables.css --font-weight-*）
OUT = Path(__file__).resolve().parent.parent / 'fonts' / 'glow-sans-tc-compressed'
# 要帶現代瀏覽器的 UA，Google 才回 woff2＋unicode-range 切片版
GF_CSS = 'https://fonts.googleapis.com/css2?family=Noto+Sans+TC'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
# TC 有收、卻畫成「另一個字」的樣子（為→爲、即→卽…：傳承字形把兩個碼位併成舊寫法那個）→ 這些也改用 J 版（user 2026-11-18）。
# 名單怎麼來的：拿 TC 每個字的外框去比 J，跟 J 裡另一個碼位的一般漢字一模一樣的就是。
# 之後還想把哪個字換成 J 版的寫法，加進這串重跑就好（J 是日本寫法：海、漢、器、類這類字換過去反而不像台灣寫法，別整批換）
USE_J = '為即偽查緒鄉俱媯溈蒍晩'


def google_slices():
    """Google 的切法：每片一組碼位。"""
    css = urllib.request.urlopen(urllib.request.Request(GF_CSS, headers={'User-Agent': UA})).read().decode()
    slices = []
    for m in re.finditer(r'unicode-range:([^;]+);', css):
        cps = set()
        for part in m.group(1).split(','):
            lo, _, hi = part.strip()[2:].partition('-')
            cps.update(range(int(lo, 16), int(hi or lo, 16) + 1))
        slices.append(cps)
    return slices


def unicode_range(cps):
    """{0x4E00, 0x4E01, 0x4E03} → 'U+4E00-4E01,U+4E03'"""
    out, cps = [], sorted(cps)
    start = prev = cps[0]
    for cp in cps[1:] + [None]:   # None＝收尾
        if cp != prev + 1:
            out.append(f'U+{start:X}' + (f'-{prev:X}' if prev != start else ''))
            start = cp
        prev = cp
    return ','.join(out)


def cut(job):
    src, dst, cps = job
    opts = subset.Options(flavor='woff2')
    font = subset.load_font(src, opts)
    # 這顆字是 CID-keyed，卻在 TopDict 多掛一份用不到的 Private（帶 5115 個 subr、約 110KB）；
    # fonttools 只會清 FDArray 那份 → 不拿掉的話每一片都白帶這 110KB
    top = font['CFF '].cff.topDictIndex[0]
    top.rawDict.pop('Private', None)
    top.__dict__.pop('Private', None)
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=cps)
    sub.subset(font)
    subset.save_font(font, dst, opts)


def main(src_dir):
    src = {w: {lang: str(Path(src_dir) / f'GlowSans{lang}-Compressed-{name}.otf') for lang in ('TC', 'J')}
           for w, name in WEIGHTS.items()}

    def chars(lang):
        cmaps = [set(TTFont(s[lang], lazy=True).getBestCmap()) for s in src.values()]
        assert all(c == cmaps[0] for c in cmaps), f'{lang} 各字重收的字不一樣，unicode-range 不能共用'
        return cmaps[0]

    have, have_j = chars('TC'), chars('J')
    slices = google_slices()
    assert len(slices) > 50, 'Google 沒回切片版 CSS（UA 被擋？）'
    seen = set()
    for s in reversed(slices):   # Google 的片之間有重疊（CSS 後定義的優先）→ 重疊的字只留在後面那片
        s -= seen
        seen |= s
    use_j = set(map(ord, USE_J))
    assert use_j <= have & have_j, 'USE_J 裡有 TC 或 J 沒收的字'
    tc_only = (seen & have) - use_j
    slices = [s & tc_only for s in slices if s & tc_only]
    assert sum(map(len, slices)) == len(tc_only), '每個字要剛好落在一片'
    from_j = ((seen - have) & have_j) | (seen & use_j)   # TC 沒有而 J 有的＋指定用 J 的
    parts = [(f'{i:03d}', 'TC', cps) for i, cps in enumerate(slices)] + ([('j', 'J', from_j)] if from_j else [])

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob('*.woff2'):
        old.unlink()
    with ProcessPoolExecutor() as pool:   # list()：worker 的例外才會拋出來
        list(pool.map(cut, [(src[w][lang], str(OUT / f'{w}-{tag}.woff2'), cps) for w in src for tag, lang, cps in parts]))
    # 網址都帶 ?v=內容雜湊（每片 woff2、各頁 <head> 連 font.css 的那行）：重切之後哪個檔內容變了、網址就跟著變，瀏覽器一定重抓。
    # 不帶的話會發生「新 CSS 配到瀏覽器留著的舊字檔」→ 這次搬過片的字（例：改用 J 的「即」）在那個檔裡找不到、掉回系統字體
    def ver(path):
        return hashlib.md5(path.read_bytes()).hexdigest()[:8]

    css = [f'/* {FAMILY}（未來熒黑 v0.93，SIL OFL 1.1，見同資料夾 OFL.txt）；-j 那片＝TC 缺的字與指定的字從 J 版來。'
           f'scripts/build-fonts.py 產生，不要手改 */']
    css += [f"@font-face{{font-family:'{FAMILY}';font-weight:{w};font-display:swap;"
            f"src:url({w}-{tag}.woff2?v={ver(OUT / f'{w}-{tag}.woff2')}) format('woff2');unicode-range:{unicode_range(cps)}}}"
            for w in src for tag, _, cps in parts]
    (OUT / 'font.css').write_text('\n'.join(css) + '\n', encoding='utf-8', newline='\n')
    root = OUT.parent.parent
    link = rb'\1?v=' + ver(OUT / 'font.css').encode()
    for page in (root / 'index.html', *sorted((root / 'pages').glob('*.html'))):
        old = page.read_bytes()   # bytes：不動換行與編碼
        new = re.sub(rb'(glow-sans-tc-compressed/font\.css)(\?v=\w+)?', link, old)
        if new != old:
            page.write_bytes(new)
    total = sum(f.stat().st_size for f in OUT.glob('*.woff2'))
    print(f'{len(slices)} 片 × {len(src)} 字重、TC {len(tc_only)} 字＋J {len(from_j)} 字（{"".join(map(chr, sorted(from_j)))}）：'
          f'woff2 共 {total / 1e6:.1f} MB、font.css {(OUT / "font.css").stat().st_size / 1e3:.0f} KB')


if __name__ == '__main__':
    main(sys.argv[1])
