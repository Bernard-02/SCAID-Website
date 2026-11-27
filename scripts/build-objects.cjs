// 右圖的 object：把挑好的 3D 模型轉成網站用的精簡檔（objects/index.json＋objects/<slug>.bin）。
// 用法：node scripts/build-objects.cjs <放原始模型的資料夾> [輸出資料夾＝objects]
//   原始模型不進 repo：資料夾裡沒有的會自動從 Poly Haven 下載（只抓 1k 那份的 .gltf＋.bin，不抓貼圖）到 <資料夾>/<Poly Haven 的 id>/。
// 模型來源＝Poly Haven（polyhaven.com，全部 CC0、不用標出處；2026-11-27 user：「這個3d物件，能不能去掉low poly的3d，但是pool的數量保持不變」）：
//   原本是 Kenney、Quaternius 的 low poly 模型（2026-11-22～27；30 個裡 28 個不到 1500 個三角形）。這 30 個是從 50 個候選挑的（user：「那就用你推薦的吧」），
//   候選頁＝https://claude.ai/artifact/Lk2ggx8MLi8Lgqs1drCFec（每個用網站的 stroke 畫 4 個角度）；排除的：蛋糕（只剩一個橢圓）、樹（減面後葉子散掉）、
//   茶具（散成好幾塊）、遊戲手把（平躺、只剩稀疏的點）、書（一團），以及輪廓跟留下的那個太像的（水壺／電熱水壺、扳手／鉗子、凳子／桌子…）。
// 挑的規矩（user 2026-11-26～27）：排成 stroke 認得出來、同一種輪廓只留一個、不要方盒子的家電、不要廁所相關、不要動物、
//   避開一根桿子頂著圓頭、長條圓頭的輪廓（「看起來像男性生殖器」：蘑菇、香蕉、斧頭、鐵鎚、放大鏡、湯匙…）。
// 面數：超過 TARGET 個三角形就用 meshoptimizer（devDependency）減到 TARGET＝object.js 的 FINE（面數夠就不再細分）；誤差先放小、減不到再放寬
//   （很多零件的模型——書、樹——每一塊各自是一塊，小誤差下減不動）。
// 一個 .bin＝位置 int16×3（置中、縮到半徑 1，×32767）→ 法線 int8×3（×127）→ 補到偶數 → 三角形索引 uint16×3；頂點數、三角形數記在 index.json。
// 輸出資料夾裡不在清單上的 .bin 會刪掉（smoke.cjs 守 index.json 跟檔案一一對得上）。
const fs = require('fs'), path = require('path');
const { MeshoptSimplifier: MS } = require('meshoptimizer');
const [ROOT, OUT = 'objects'] = process.argv.slice(2);
if (!ROOT) { console.log('用法：node scripts/build-objects.cjs <放原始模型的資料夾> [輸出資料夾]'); process.exit(1); }
const TARGET = 6000;

// [分類, 中文, 英文, Poly Haven 的 id, 左右轉幾度（可省）, 往前立起來幾度（可省）]
const LIST = [
  ['植物', '蘋果', 'apple', 'food_apple_01'], ['植物', '盆栽', 'potted plant', 'potted_plant_02'], ['植物', '花', 'flower', 'anthurium_botany_01'],
  ['廚房', '高腳杯', 'goblet', 'brass_goblets'], ['廚房', '平底鍋', 'pan', 'brass_pan_01'], ['廚房', '電熱水壺', 'kettle', 'vintage_electric_kettle'],
  ['工具', '澆水壺', 'watering can', 'watering_can_metal_01'], ['工具', '大聲公', 'megaphone', 'Megaphone_01'], ['工具', '鉗子', 'pliers', 'pliers'],
  ['工具', '釘書機', 'stapler', 'vintage_stapler'], ['工具', '望遠鏡', 'binoculars', 'binoculars'], ['工具', '梯子', 'ladder', 'wooden_ladder'], ['工具', '顯微鏡', 'microscope', 'vintage_microscope'],
  ['家具', '搖椅', 'rocking chair', 'Rockingchair_01'], ['家具', '沙發', 'sofa', 'sofa_03'], ['家具', '椅子', 'chair', 'WoodenChair_01'], ['家具', '桌子', 'table', 'round_wooden_table_01'], ['家具', '床', 'bed', 'GothicBed_01'],
  ['燈', '提燈', 'lantern', 'Lantern_01'], ['燈', '吊燈', 'chandelier', 'Chandelier_01'],
  ['機器', '相機', 'camera', 'Camera_01'], ['機器', '筆電', 'laptop', 'classic_laptop'], ['機器', '吊扇', 'ceiling fan', 'ceiling_fan'],
  ['容器', '寶箱', 'treasure chest', 'treasure_chest'], ['容器', '紙箱', 'cardboard box', 'cardboard_box_01'], ['容器', '籃子', 'basket', 'wicker_basket_01'],
  ['穿戴', '眼鏡', 'glasses', 'round_spectacles'], ['穿戴', '雨靴', 'boots', 'rubber_boots'], ['穿戴', '帽子', 'hat', 'fishermans_hat'], ['穿戴', '懷錶', 'pocket watch', 'vintage_pocket_watch'],
];

const norm = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
const UA = { 'User-Agent': 'SCAID-build-objects' };
// 沒有就從 Poly Haven 抓：1k 那份的 .gltf＋它引用的 .bin（貼圖不要）
async function fetchModel(id) {
  const dir = path.join(ROOT, id);
  if (fs.existsSync(dir) && fs.readdirSync(dir).some(f => f.endsWith('.gltf'))) return dir;
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`, { headers: UA })).json();
  const g = (files.gltf['1k'] || Object.values(files.gltf)[0]).gltf;
  for (const [name, url] of [[path.basename(new URL(g.url).pathname), g.url], ...Object.entries(g.include || {}).filter(([k]) => k.endsWith('.bin')).map(([k, v]) => [k, v.url])]) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), Buffer.from(await (await fetch(url, { headers: UA })).arrayBuffer()));
  }
  console.log('  下載', id);
  return dir;
}
// ── glTF（.gltf＋外部 .bin）：照場景的節點走一遍，頂點換到世界座標 ──
function readGltf(file) {
  const json = JSON.parse(fs.readFileSync(file, 'utf8')), bufs = json.buffers.map(b => fs.readFileSync(path.join(path.dirname(file), decodeURIComponent(b.uri))));
  const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }, READ = { 5120: 'Int8', 5121: 'UInt8', 5122: 'Int16LE', 5123: 'UInt16LE', 5125: 'UInt32LE', 5126: 'FloatLE' }, BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const acc = i => { const a = json.accessors[i], v = json.bufferViews[a.bufferView], bin = bufs[v.buffer], n = SIZE[a.type], w = BYTES[a.componentType], stride = v.byteStride || n * w, out = new Float64Array(a.count * n);
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = bin['read' + READ[a.componentType]]((v.byteOffset || 0) + (a.byteOffset || 0) + k * stride + c * w); return out; };
  const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
  const local = n => { if (n.matrix) return n.matrix; const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
    return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0, 2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0, 2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1]; };
  const P = [], N = [], I = [];
  const walk = (i, parent) => {
    const nd = json.nodes[i], m = mul(parent, local(nd));
    if (nd.mesh != null) for (const p of json.meshes[nd.mesh].primitives) {
      if (p.mode != null && p.mode !== 4) continue;
      const pos = acc(p.attributes.POSITION), nor = p.attributes.NORMAL != null ? acc(p.attributes.NORMAL) : null, base = P.length / 3, cnt = pos.length / 3;
      for (let k = 0; k < cnt; k++) {
        const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2], q = nor ? [nor[k * 3], nor[k * 3 + 1], nor[k * 3 + 2]] : [0, 0, 0];
        P.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
        N.push(...norm(m[0] * q[0] + m[4] * q[1] + m[8] * q[2], m[1] * q[0] + m[5] * q[1] + m[9] * q[2], m[2] * q[0] + m[6] * q[1] + m[10] * q[2]));
      }
      for (const k of p.indices != null ? acc(p.indices) : Float64Array.from({ length: cnt }, (_, k) => k)) I.push(base + k);
    }
    for (const c of nd.children || []) walk(c, m);
  };
  const ID = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const r of (json.scenes?.[json.scene || 0] || { nodes: json.nodes.map((_, i) => i) }).nodes) walk(r, ID);
  return { P, N, I };
}

(async () => {
  await MS.ready;
  fs.mkdirSync(OUT, { recursive: true });
  const out = [];
  for (const [cat, zh, en, id, turn = 0, tilt = 0] of LIST) {
    const dir = await fetchModel(id), file = path.join(dir, fs.readdirSync(dir).find(f => f.endsWith('.gltf')));
    let { P, N, I } = readGltf(file);
    // 沒有法線的（法線是 0）用面的法線
    for (let t = 0; t < I.length; t += 3) {
      const [a, b, c] = [I[t], I[t + 1], I[t + 2]].map(k => k * 3);
      const f = norm((P[b + 1] - P[a + 1]) * (P[c + 2] - P[a + 2]) - (P[b + 2] - P[a + 2]) * (P[c + 1] - P[a + 1]), (P[b + 2] - P[a + 2]) * (P[c] - P[a]) - (P[b] - P[a]) * (P[c + 2] - P[a + 2]), (P[b] - P[a]) * (P[c + 1] - P[a + 1]) - (P[b + 1] - P[a + 1]) * (P[c] - P[a]));
      for (const v of [a, b, c]) if (!N[v] && !N[v + 1] && !N[v + 2]) N.splice(v, 3, ...f);
    }
    const rot = (deg, f) => { const s = Math.sin(deg * Math.PI / 180), c = Math.cos(deg * Math.PI / 180); for (const A of [P, N]) for (let k = 0; k < A.length; k += 3) f(A, k, s, c); };
    if (turn) rot(turn, (A, k, s, c) => { const [x, z] = [A[k], A[k + 2]]; A[k] = x * c + z * s; A[k + 2] = -x * s + z * c; });
    if (tilt) rot(tilt, (A, k, s, c) => { const [y, z] = [A[k + 1], A[k + 2]]; A[k + 1] = y * c - z * s; A[k + 2] = y * s + z * c; });
    // 位置、法線一樣的頂點併成一個（減面才知道哪些邊相連）
    const key = new Map(), P2 = [], N2 = [], remap = new Uint32Array(P.length / 3);
    for (let k = 0; k < P.length / 3; k++) {
      const kk = [P[k * 3], P[k * 3 + 1], P[k * 3 + 2]].map(x => x.toFixed(5)).join() + '|' + [N[k * 3], N[k * 3 + 1], N[k * 3 + 2]].map(x => x.toFixed(2)).join();
      if (!key.has(kk)) { key.set(kk, P2.length / 3); P2.push(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]); N2.push(N[k * 3], N[k * 3 + 1], N[k * 3 + 2]); }
      remap[k] = key.get(kk);
    }
    let idx = Uint32Array.from(I, k => remap[k]);
    const before = idx.length / 3;
    if (before > TARGET) {
      const pos = Float32Array.from(P2);
      let s = idx;
      for (const err of [0.02, 0.05, 0.1, 0.3, 1]) { [s] = MS.simplify(idx, pos, 3, TARGET * 3, err); if (s.length / 3 <= TARGET * 1.05) break; }
      idx = s;
    }
    // 置中、縮到半徑 1
    const used = [...new Set(idx)], mid = [0, 1, 2].map(a => { let lo = Infinity, hi = -Infinity; for (const v of used) { lo = Math.min(lo, P2[v * 3 + a]); hi = Math.max(hi, P2[v * 3 + a]); } return (lo + hi) / 2; });
    let rad = 0; for (const v of used) rad = Math.max(rad, Math.hypot(P2[v * 3] - mid[0], P2[v * 3 + 1] - mid[1], P2[v * 3 + 2] - mid[2]));
    const key2 = new Map(), OP = [], ON = [], OF = [];
    for (const v of idx) {
      const p = [0, 1, 2].map(a => Math.round((P2[v * 3 + a] - mid[a]) / rad * 32767)), n = [0, 1, 2].map(a => Math.round(N2[v * 3 + a] * 127)), kk = p.join() + '|' + n.join();
      if (!key2.has(kk)) { key2.set(kk, OP.length / 3); OP.push(...p); ON.push(...n); }
      OF.push(key2.get(kk));
    }
    const nv = OP.length / 3;
    if (nv > 65535) { console.log('頂點太多', en, nv); continue; }
    const slug = en.replace(/\s+/g, '-'), pad = nv % 2, buf = Buffer.alloc(nv * 9 + pad + OF.length * 2);
    OP.forEach((v, i) => buf.writeInt16LE(v, i * 2)); ON.forEach((v, i) => buf.writeInt8(v, nv * 6 + i)); OF.forEach((v, i) => buf.writeUInt16LE(v, nv * 9 + pad + i * 2));
    fs.writeFileSync(path.join(OUT, slug + '.bin'), buf);
    out.push({ slug, zh, en, cat, nv, nt: OF.length / 3 });
    console.log(en.padEnd(16), String(before).padStart(8), '→', String(OF.length / 3).padStart(5), '三角形', (buf.length / 1024).toFixed(0) + 'KB');
  }
  const keep = new Set(out.map(o => o.slug + '.bin'));
  for (const f of fs.readdirSync(OUT)) if (f.endsWith('.bin') && !keep.has(f)) { fs.unlinkSync(path.join(OUT, f)); console.log('  刪掉', f); }
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(out));
  console.log(out.length, '個；', (fs.readdirSync(OUT).reduce((n, f) => n + fs.statSync(path.join(OUT, f)).size, 0) / 1024).toFixed(0), 'KB');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
