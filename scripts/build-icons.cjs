// icon：從 Illustrator 的 .ai 抽出來 → website-icons/*.svg（user 2026-11-24 給的那套：docs/SCAID icon.ai，原始檔不進 repo）
//   node scripts/build-icons.cjs "docs/SCAID icon.ai" website-icons
// .ai 要是「建立 PDF 相容檔案」存的（Illustrator 預設）：讀檔裡那份 PDF 的頁面，只靠 Node 內建的 zlib（這台沒有 PDF 工具）。
// 每個 icon 下面那行字＝名字 → 照 FILES 對到檔名（ai 裡多了新的名字要加進去，不然報錯）。
// 框：高 70＝ai 裡每個 icon 的框（＝logo 骨牌的高，play、day… 跟骨牌一樣 45×70）、寬＝看得到的範圍（描邊算到平頭的角、尖角）；
// back＝next 左右翻（ai 裡兩個上下差 0.94）；volume（音量拉桿那 9 根）自己的框。day、night 不出檔：user 2026-11-27 另外給了一對（website-icons/day.svg、night.svg），重跑不能蓋掉。
// 站上 icon 的寬＝自己的寬（user 2026-11-24：不自帶方框）→ 印出來的寬高要抄進 css/components/icon.css 那個 icon 的 --ar
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const [file, outDir] = process.argv.slice(2);
if (!file || !outDir) { console.log('用法見檔頭'); process.exit(1); }
const VOL_BARS = 20;   // 音量拉桿的根數＝一根 5%（user 2026-11-24：長度照一般播放器、不照 ai 那個 icon 的寬）；改了要跟著改 chrome.js BARS、header.html 那個 range 的 max、chrome.css --bars
const FILES = { 'video&play': 'play', 'back&previous': null, next: 'next', close: 'close', 'full screen': 'fullscreen', pause: 'pause',
  loud: 'loud', half: 'half', silence: 'silence', day: null, night: null, 'slide show': 'slideshow', grid: 'grid', volume: 'volume' };
const buf = fs.readFileSync(file);
const src = buf.toString('latin1');

// ── PDF：物件、字典、串流（夠讀 Illustrator 存的就好） ──
class Ref { constructor(n) { this.n = n; } }
class Name { constructor(v) { this.v = v; } }
class Str { constructor(v) { this.v = v; } }
const WS = new Set([0, 9, 10, 12, 13, 32]);
const DELIM = new Set([...'()<>[]{}/%'].map(c => c.charCodeAt(0)));
class Lexer {
  constructor(s, p = 0) { this.s = s; this.p = p; }
  next() {
    const s = this.s;
    for (;;) {
      while (this.p < s.length && WS.has(s.charCodeAt(this.p))) this.p++;
      if (s[this.p] !== '%') break;
      while (this.p < s.length && s[this.p] !== '\n' && s[this.p] !== '\r') this.p++;
    }
    if (this.p >= s.length) return null;
    const c = s[this.p];
    const word = () => { let j = this.p; while (j < s.length && !WS.has(s.charCodeAt(j)) && !DELIM.has(s.charCodeAt(j))) j++; const w = s.slice(this.p, j); this.p = j; return w; };
    if (c === '/') { this.p++; return { t: 'name', v: word().replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) }; }
    if ('[]{}'.includes(c)) { this.p++; return { t: c }; }
    if (c === '<' && s[this.p + 1] === '<') { this.p += 2; return { t: '<<' }; }
    if (c === '>' && s[this.p + 1] === '>') { this.p += 2; return { t: '>>' }; }
    if (c === '<') {
      const j = s.indexOf('>', this.p);
      let hex = s.slice(this.p + 1, j).replace(/\s+/g, ''); this.p = j + 1;
      if (hex.length % 2) hex += '0';
      return { t: 'str', v: hex.replace(/../g, h => String.fromCharCode(parseInt(h, 16))) };
    }
    if (c === '(') {
      const esc = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };
      let depth = 1, j = this.p + 1, out = '';
      for (; j < s.length; j++) {
        const ch = s[j];
        if (ch === '\\') {
          const n = s[++j];
          if (/[0-7]/.test(n)) { let o = n; while (o.length < 3 && /[0-7]/.test(s[j + 1])) o += s[++j]; out += String.fromCharCode(parseInt(o, 8) & 255); }
          else if (n === '\r') { if (s[j + 1] === '\n') j++; }
          else if (n !== '\n') out += esc[n] ?? n;
          continue;
        }
        if (ch === '(') depth++;
        else if (ch === ')' && !--depth) break;
        out += ch;
      }
      this.p = j + 1;
      return { t: 'str', v: out };
    }
    const w = word();
    if (!w) { this.p++; return { t: 'kw', v: c }; }
    return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(w) ? { t: 'num', v: parseFloat(w) } : { t: 'kw', v: w };
  }
}
function value(lx, tk = lx.next()) {
  if (!tk) return null;
  if (tk.t === '<<') { const d = {}; for (let k; (k = lx.next()) && k.t !== '>>';) d[k.v] = value(lx); return d; }
  if (tk.t === '[') { const a = []; for (let t; (t = lx.next()) && t.t !== ']';) a.push(value(lx, t)); return a; }
  if (tk.t === 'num') {   // 「n g R」＝參照
    const save = lx.p, t2 = lx.next();
    if (t2 && t2.t === 'num') { const t3 = lx.next(); if (t3 && t3.t === 'kw' && t3.v === 'R') return new Ref(tk.v); }
    lx.p = save;
    return tk.v;
  }
  if (tk.t === 'name') return new Name(tk.v);
  if (tk.t === 'str') return new Str(tk.v);
  return tk.t === 'kw' ? { kw: tk.v } : null;
}
const offsets = new Map();   // ponytail: 不讀 xref，直接掃「n 0 obj」（後面的蓋前面的＝增量存檔也對）；掃到串流裡的假位置機會很小
for (const m of src.matchAll(/(?:^|[\r\n])(\d+)\s+\d+\s+obj\b/g)) offsets.set(+m[1], m.index + m[0].length);
const cache = new Map();
function obj(n) {
  if (cache.has(n)) return cache.get(n);
  if (!offsets.has(n)) return null;
  const lx = new Lexer(src, offsets.get(n));
  let v = value(lx);
  const t = lx.next();
  if (t && t.t === 'kw' && t.v === 'stream') {
    let p = lx.p; if (src[p] === '\r') p++; if (src[p] === '\n') p++;
    let len = R(v.Length);
    if (typeof len !== 'number' || !/^\s*endstream/.test(src.slice(p + len, p + len + 20))) len = src.indexOf('endstream', p) - p;
    v = { dict: v, data: buf.subarray(p, p + len) };
  }
  cache.set(n, v);
  return v;
}
const R = v => { while (v instanceof Ref) v = obj(v.n); return v; };
function decode(st) {
  const f = R(st.dict.Filter), filters = f == null ? [] : (Array.isArray(f) ? f.map(R) : [f]).map(x => x.v);
  return filters.reduce((d, fl) => {
    if (fl !== 'FlateDecode') throw new Error('不支援的壓縮 ' + fl);
    return zlib.inflateSync(d, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
  }, st.data);
}
const page = [...offsets.keys()].map(n => { const o = obj(n); return o && o.dict ? o.dict : o; })
  .find(d => d && typeof d === 'object' && R(d.Type) instanceof Name && R(d.Type).v === 'Page');
if (!page) throw new Error('讀不到頁面：存檔時要勾「建立 PDF 相容檔案」');

// ── 頁面內容：路徑（座標都換算到頁面上）、文字（只要字和位置，對名字用） ──
const mul = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];
const ap = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
function toUnicode(fd) {
  const map = new Map(), u16 = h => h.replace(/.{4}/g, x => String.fromCharCode(parseInt(x, 16)));
  if (!fd.ToUnicode) return { map, bytes: R(fd.Subtype).v === 'Type0' ? 2 : 1 };
  const t = decode(R(fd.ToUnicode)).toString('latin1');
  const cs = /begincodespacerange\s*<([0-9a-fA-F]+)>/.exec(t);
  for (const b of t.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const m of b[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) map.set(parseInt(m[1], 16), u16(m[2]));
  for (const b of t.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
    for (const m of b[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]+>|\[[^\]]*\])/g)) {
      const lo = parseInt(m[1], 16), hi = parseInt(m[2], 16);
      if (m[3][0] === '<') { const base = m[3].slice(1, -1); for (let c = lo; c <= hi; c++) map.set(c, u16(base.slice(0, -4)) + String.fromCharCode(parseInt(base.slice(-4), 16) + c - lo)); }
      else [...m[3].matchAll(/<([0-9a-fA-F]+)>/g)].forEach((x, i) => map.set(lo + i, u16(x[1])));
    }
  return { map, bytes: cs ? cs[1].length / 2 : 1 };
}
const paths = [], texts = [];
function run(data, res, gs) {
  const lx = new Lexer(data.toString('latin1')), stack = [];
  let ops = [], d = [], cur = [0, 0];
  const pt = (x, y) => ap(gs.ctm, x, y);
  const paint = (fill, stroke, eo, close) => {
    if (close) d.push(['Z']);
    if (d.length && (fill || stroke)) paths.push({ d, fill, stroke, eo, lw: gs.lw * Math.sqrt(Math.abs(gs.ctm[0] * gs.ctm[3] - gs.ctm[1] * gs.ctm[2])), cap: gs.cap, join: gs.join });
    d = [];
  };
  for (let tk; (tk = lx.next());) {
    if (tk.t !== 'kw') { ops.push(value(lx, tk)); continue; }
    const [a, b, c, e, f, g] = ops;
    switch (tk.v) {
      case 'q': stack.push(structuredClone(gs)); break;
      case 'Q': gs = stack.pop() || gs; break;
      case 'cm': gs.ctm = mul(ops.slice(0, 6), gs.ctm); break;
      case 'w': gs.lw = a; break;
      case 'J': gs.cap = a; break;
      case 'j': gs.join = a; break;
      case 'gs': { const x = R(R(res.ExtGState)?.[a.v]) || {}; if (x.LW != null) gs.lw = R(x.LW); break; }
      case 'm': cur = pt(a, b); d.push(['M', cur]); break;
      case 'l': cur = pt(a, b); d.push(['L', cur]); break;
      case 'c': d.push(['C', pt(a, b), pt(c, e), cur = pt(f, g)]); break;
      case 'v': d.push(['C', cur, pt(a, b), cur = pt(c, e)]); break;
      case 'y': d.push(['C', pt(a, b), pt(c, e), cur = pt(c, e)]); break;
      case 'h': d.push(['Z']); break;
      case 're': d.push(['M', pt(a, b)], ['L', pt(a + c, b)], ['L', pt(a + c, b + e)], ['L', pt(a, b + e)], ['Z']); break;
      case 'f': case 'F': paint(true, false, false); break;
      case 'f*': paint(true, false, true); break;
      case 'S': paint(false, true); break;
      case 's': paint(false, true, false, true); break;
      case 'B': paint(true, true, false); break;
      case 'B*': paint(true, true, true); break;
      case 'b': paint(true, true, false, true); break;
      case 'b*': paint(true, true, true, true); break;
      case 'n': d = []; break;
      case 'BT': gs.tm = gs.tlm = [1, 0, 0, 1, 0, 0]; break;
      case 'Tf': gs.font = a.v; gs.fs = b; break;
      case 'TL': gs.tl = a; break;
      case 'Td': case 'TD': if (tk.v === 'TD') gs.tl = -b; gs.tm = gs.tlm = mul([1, 0, 0, 1, a, b], gs.tlm); break;
      case 'Tm': gs.tm = gs.tlm = ops.slice(0, 6); break;
      case 'T*': gs.tm = gs.tlm = mul([1, 0, 0, 1, 0, -gs.tl], gs.tlm); break;
      case 'Tj': case 'TJ': case "'": case '"': {
        if (tk.v === "'" || tk.v === '"') gs.tm = gs.tlm = mul([1, 0, 0, 1, 0, -gs.tl], gs.tlm);
        const u = toUnicode(R(R(res.Font)[gs.font]));
        let s = '';
        for (const p of tk.v === 'TJ' ? a : [ops[ops.length - 1]]) if (p instanceof Str)
          for (let i = 0; i < p.v.length; i += u.bytes) { let code = 0; for (let k = 0; k < u.bytes; k++) code = code * 256 + p.v.charCodeAt(i + k); s += u.map.get(code) ?? String.fromCharCode(code); }
        const [x, y] = ap(mul(gs.tm, gs.ctm), 0, 0);
        texts.push({ s, x, y });
        gs.tm = mul([1, 0, 0, 1, s.length * 0.6 * gs.fs, 0], gs.tm);   // ponytail: 估的字寬，只為了同一行下一段的位置
        break;
      }
      case 'Do': {
        const xo = R(R(res.XObject)[a.v]);
        if (R(xo.dict.Subtype).v === 'Form') run(decode(xo), R(xo.dict.Resources) || res, { ...structuredClone(gs), ctm: mul((R(xo.dict.Matrix) || [1, 0, 0, 1, 0, 0]).map(R), gs.ctm) });
        break;
      }
      case 'BI': { const id = lx.s.indexOf('ID', lx.p); lx.p = id + lx.s.slice(id).search(/\sEI\s/) + 4; break; }
    }
    ops = [];
  }
}
const contents = R(page.Contents);
run(Buffer.concat((Array.isArray(contents) ? contents.map(R) : [contents]).map(s => Buffer.concat([decode(s), Buffer.from('\n')]))), R(page.Resources),
  { ctm: [1, 0, 0, 1, 0, 0], lw: 1, cap: 0, join: 0, fs: 12, tl: 0, tm: [1, 0, 0, 1, 0, 0], tlm: [1, 0, 0, 1, 0, 0] });

// ── 看得到的範圍：填色＝點；描邊＝平頭的兩個角、尖角（兩條外偏線的交點）。曲線只算控制點（這套沒有曲線的描邊） ──
function extents(p) {
  const pts = [];
  const polys = []; let cur = null;
  for (const [k, ...q] of p.d) { if (k === 'M') polys.push(cur = [q[0]]); else if (k !== 'Z') cur.push(...q); }
  for (const pl of polys) {
    if (!p.stroke || pl.length < 2) { pts.push(...pl); continue; }
    const hw = p.lw / 2, seg = [];
    for (let i = 0; i < pl.length - 1; i++) {
      const [[x1, y1], [x2, y2]] = [pl[i], pl[i + 1]], L = Math.hypot(x2 - x1, y2 - y1) || 1;
      seg.push({ a: pl[i], b: pl[i + 1], n: [-(y2 - y1) / L * hw, (x2 - x1) / L * hw] });
    }
    for (const s of seg) for (const q of [s.a, s.b]) for (const k of [1, -1]) pts.push([q[0] + k * s.n[0], q[1] + k * s.n[1]]);
    for (let i = 0; i < seg.length - 1; i++) for (const k of [1, -1]) {
      const A = seg[i], B = seg[i + 1];
      const p1 = [A.a[0] + k * A.n[0], A.a[1] + k * A.n[1]], d1 = [A.b[0] - A.a[0], A.b[1] - A.a[1]];
      const p2 = [B.a[0] + k * B.n[0], B.a[1] + k * B.n[1]], d2 = [B.b[0] - B.a[0], B.b[1] - B.a[1]];
      const den = d1[0] * d2[1] - d1[1] * d2[0];
      if (Math.abs(den) > 1e-9) { const t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den; pts.push([p1[0] + t * d1[0], p1[1] + t * d1[1]]); }
    }
  }
  return [Math.min(...pts.map(q => q[0])), Math.min(...pts.map(q => q[1])), Math.max(...pts.map(q => q[0])), Math.max(...pts.map(q => q[1]))];
}
const union = bs => bs.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);

// ── 分成一個一個 icon：範圍靠得近（8pt 內）的路徑＝同一個；名字＝下面最近的那行字（上下兩行＝同一個名字，例「back&」「previous」） ──
const items = paths.map(p => ({ ps: [p], box: extents(p) }));
for (let merged = true; merged;) {
  merged = false;
  for (let i = 0; i < items.length && !merged; i++) for (let j = i + 1; j < items.length && !merged; j++) {
    const [a, b] = [items[i].box, items[j].box];
    if (a[0] - 8 < b[2] && b[0] - 8 < a[2] && a[1] - 8 < b[3] && b[1] - 8 < a[3]) { items[i].ps.push(...items[j].ps); items[i].box = union([a, b]); items.splice(j, 1); merged = true; }
  }
}
const labels = [];
for (const t of texts.sort((a, b) => b.y - a.y)) {
  const up = labels.find(l => Math.abs(l.x - t.x) < 1 && l.y - t.y > 0 && l.y - t.y < 25 && l.last - t.y < 25);
  if (up) { up.s += t.s.trim(); up.last = t.y; } else labels.push({ s: t.s.trim(), x: t.x, y: t.y, last: t.y });
}
const icons = {};
for (const it of items) {
  const under = labels.filter(l => l.y < it.box[1]), row = Math.max(...under.map(l => l.y));   // 下面最近的那一排名字，再挑左右最近的
  const below = under.filter(l => row - l.y < 1).sort((a, b) => Math.abs(a.x - it.box[0]) - Math.abs(b.x - it.box[0]))[0];
  if (!below) throw new Error(`這個 icon 下面沒有名字：${it.box.map(Math.round)}`);
  const name = below.s.replace(/\s*&\s*/g, '&');
  if (!(name in FILES)) throw new Error(`沒對到檔名的名字「${name}」：加進 FILES`);
  (icons[name] ||= { ps: [], box: it.box }).ps.push(...it.ps);   // full screen 左右兩半隔得遠＝兩塊，同名併起來
  icons[name].box = union([icons[name].box, it.box]);
}

// ── 寫檔 ──
const H = 70;
const n = v => +v.toFixed(3);
function write(name, file, ps, x0, w, { top, h = H, flip = false } = {}) {
  const X = x => n(flip ? w - (x - x0) : x - x0), Y = y => n(top - y);
  const seen = new Set(), solid = [], byStyle = {};
  for (const p of ps) {
    const d = p.d.map(([k, ...q]) => k + q.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ')).join('');
    if (seen.has(d)) continue;   // loud 那根長的畫了兩次
    seen.add(d);
    if (p.eo) solid.push(`<path fill-rule="evenodd" d="${d}"/>`);
    else (byStyle[p.stroke ? ` fill="none" stroke="#000" stroke-width="${n(p.lw)}"` : ''] ||= []).push(d);
  }
  const els = [...solid, ...Object.entries(byStyle).map(([a, ds]) => `<path${a} d="${ds.join('')}"/>`)];
  fs.writeFileSync(path.join(outDir, file + '.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(w)} ${n(h)}">\n  <!-- docs/SCAID icon.ai「${name}」 -->\n  ${els.join('\n  ')}\n</svg>\n`);
  console.log(`${file}.svg`.padEnd(16), `${n(w)}×${n(h)}`);
}
const top = icons['video&play'].box[3];   // 框的頂＝play 的頂（play 跟骨牌一樣 45×70、剛好撐滿框）
for (const [name, file] of Object.entries(FILES)) {
  const ic = icons[name];
  if (!ic) throw new Error(`ai 裡沒有「${name}」`);
  if (!file || file === 'volume') continue;
  write(name, file, ic.ps, ic.box[0], ic.box[2] - ic.box[0], { top });
}
{ const ic = icons.next; write('back&previous（＝next 左右翻）', 'back', ic.ps, ic.box[0], ic.box[2] - ic.box[0], { top, flip: true }); }
// 音量拉桿：直條的粗細、高、間距照 ai 的 volume（ai 畫了 9 根），根數＝VOL_BARS
{
  const ic = icons.volume, xs = ic.ps.map(p => extents(p)[0]).sort((a, b) => a - b);
  const step = (xs[xs.length - 1] - xs[0]) / (xs.length - 1), lw = n(ic.ps[0].lw), h = n(ic.box[3] - ic.box[1]);
  const d = Array.from({ length: VOL_BARS }, (_, k) => `M${n(lw / 2 + k * step)},0L${n(lw / 2 + k * step)},${h}`).join('');
  fs.writeFileSync(path.join(outDir, 'volume.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n((VOL_BARS - 1) * step + lw)} ${h}">\n`
    + `  <!-- docs/SCAID icon.ai「volume」：直條的粗細、高、間距照 ai，根數 ${VOL_BARS}（拉桿長度照一般播放器，scripts/build-icons.cjs VOL_BARS） -->\n`
    + `  <path fill="none" stroke="#000" stroke-width="${lw}" d="${d}"/>\n</svg>\n`);
  console.log('volume.svg'.padEnd(16), `${VOL_BARS} 根、間距 ${n(step)}、${n((VOL_BARS - 1) * step + lw)}×${h}`);
}
