// 右圖的 object：把挑好的 3D 模型轉成網站用的精簡檔（objects/index.json＋objects/<slug>.bin）。
// 用法：node scripts/build-objects.cjs <模型的根目錄> [輸出資料夾＝objects]
// 模型來源（全部 CC0，不用標出處；user 2026-11-22：先用這兩家，之後再換）：
//   Kenney（kenney.nl/assets）：food-kit、furniture-kit、nature-kit、survival-kit、car-kit、space-kit——各自解壓到 <根目錄>/kenney-<包>/
//   Quaternius：Farm Animals、Animal Pack Vol.2、Animated Fish、Animated Robot（官網的 Google Drive 常常額度滿，從他在 opengameart.org 的上傳頁抓）
//     ——各自解壓到 <根目錄>/quaternius-farm-animals、-animals-vol2、-fish、-robot/
// 原始模型不進 repo（檔案大、隨時抓得到）；要加／換 object＝改下面 LIST 再重跑。
// 一個 .bin＝位置 int16×3（置中、縮到半徑 1，×32767）→ 法線 int8×3（×127）→ 補到偶數 → 三角形索引 uint16×3；頂點數、三角形數記在 index.json。
const fs = require('fs'), path = require('path');
const [ROOT, OUT = 'objects'] = process.argv.slice(2);
if (!ROOT) { console.log('用法：node scripts/build-objects.cjs <模型的根目錄> [輸出資料夾]'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

// [分類, 中文, 英文, 來源資料夾, 檔名（不含副檔名）, 左右轉幾度（可省；動物轉成側面）, 往前立起來幾度（可省；平躺的東西立起來才看得到面）]
const LIST = [
  ['自然', '石頭', 'rock', 'kenney-nature-kit', 'rock_largeA'], ['自然', '木頭', 'log', 'kenney-nature-kit', 'log'], ['自然', '柴堆', 'firewood', 'kenney-nature-kit', 'log_stack'],
  ['自然', '樹樁', 'stump', 'kenney-nature-kit', 'stump_round'], ['自然', '蘑菇', 'mushroom', 'kenney-nature-kit', 'mushroom_red'], ['自然', '椰子', 'coconut', 'kenney-food-kit', 'coconut'],
  ['自然', '蛋', 'egg', 'kenney-food-kit', 'egg'], ['自然', '南瓜', 'pumpkin', 'kenney-food-kit', 'pumpkin'], ['自然', '營火', 'campfire', 'kenney-nature-kit', 'campfire_stones'],
  ['自然', '隕石', 'meteor', 'kenney-space-kit', 'meteor_detailed'],
  ['植物', '仙人掌', 'cactus', 'kenney-nature-kit', 'cactus_tall'], ['植物', '花', 'flower', 'kenney-nature-kit', 'flower_redA'], ['植物', '樹', 'tree', 'kenney-nature-kit', 'tree_default'],
  ['植物', '橡樹', 'oak', 'kenney-nature-kit', 'tree_oak'], ['植物', '松樹', 'pine', 'kenney-nature-kit', 'tree_pineRoundA'], ['植物', '棕櫚樹', 'palm tree', 'kenney-nature-kit', 'tree_palmTall'],
  ['植物', '灌木', 'bush', 'kenney-nature-kit', 'plant_bushDetailed'], ['植物', '盆栽', 'potted plant', 'kenney-furniture-kit', 'pottedPlant'], ['植物', '玉米', 'corn', 'kenney-food-kit', 'corn'],
  ['植物', '竹子', 'bamboo', 'kenney-nature-kit', 'crops_bambooStageB'], ['植物', '蘋果', 'apple', 'kenney-food-kit', 'apple'], ['植物', '香蕉', 'banana', 'kenney-food-kit', 'banana'],
  ['植物', '鳳梨', 'pineapple', 'kenney-food-kit', 'pineapple'], ['植物', '胡蘿蔔', 'carrot', 'kenney-food-kit', 'carrot'], ['植物', '花椰菜', 'broccoli', 'kenney-food-kit', 'broccoli'],
  ['植物', '西瓜', 'watermelon', 'kenney-food-kit', 'watermelon'],
  ['動物', '牛', 'cow', 'quaternius-farm-animals', 'Cow', 90], ['動物', '馬', 'horse', 'quaternius-farm-animals', 'Horse', 90], ['動物', '駱馬', 'llama', 'quaternius-farm-animals', 'Llama', 90],
  ['動物', '豬', 'pig', 'quaternius-farm-animals', 'Pig', 90], ['動物', '巴哥犬', 'pug', 'quaternius-farm-animals', 'Pug', 90], ['動物', '羊', 'sheep', 'quaternius-farm-animals', 'Sheep', 90],
  ['動物', '斑馬', 'zebra', 'quaternius-farm-animals', 'Zebra', 90], ['動物', '貓', 'cat', 'quaternius-animals-vol2', 'Cat', 90], ['動物', '狗', 'dog', 'quaternius-animals-vol2', 'Dog', 90],
  ['動物', '老鷹', 'eagle', 'quaternius-animals-vol2', 'Eagle'], ['動物', '食人魚', 'piranha', 'quaternius-animals-vol2', 'Piranha', 90], ['動物', '狼', 'wolf', 'quaternius-animals-vol2', 'Wolf', 90],
  ['動物', '海豚', 'dolphin', 'quaternius-fish', 'Dolphin', 90], ['動物', '魚', 'fish', 'quaternius-fish', 'Fish1', 90], ['動物', '魟魚', 'manta ray', 'quaternius-fish', 'Manta ray', 0, 30],
  ['動物', '鯊魚', 'shark', 'quaternius-fish', 'Shark', 90], ['動物', '鯨魚', 'whale', 'quaternius-fish', 'Whale', 90],
  ['工具', '斧頭', 'axe', 'kenney-survival-kit', 'tool-axe'], ['工具', '鐵鎚', 'hammer', 'kenney-survival-kit', 'tool-hammer'], ['工具', '十字鎬', 'pickaxe', 'kenney-survival-kit', 'tool-pickaxe'],
  ['工具', '鏟子', 'shovel', 'kenney-survival-kit', 'tool-shovel'], ['工具', '鋤頭', 'hoe', 'kenney-survival-kit', 'tool-hoe'], ['工具', '工作檯', 'workbench', 'kenney-survival-kit', 'workbench'],
  ['工具', '鐵砧', 'anvil', 'kenney-survival-kit', 'workbench-anvil'], ['工具', '砂輪', 'grindstone', 'kenney-survival-kit', 'workbench-grind'], ['工具', '打蛋器', 'whisk', 'kenney-food-kit', 'whisk'],
  ['工具', '擀麵棍', 'rolling pin', 'kenney-food-kit', 'rollingPin'], ['工具', '研缽', 'mortar', 'kenney-food-kit', 'mortar-pestle'], ['工具', '菜刀', 'kitchen knife', 'kenney-food-kit', 'cooking-knife', 0, 60],
  ['工具', '鍋鏟', 'spatula', 'kenney-food-kit', 'cooking-spatula', 0, 60], ['工具', '平底鍋', 'frying pan', 'kenney-food-kit', 'frying-pan'], ['工具', '湯鍋', 'pot', 'kenney-food-kit', 'pot'],
  ['工具', '砧板', 'cutting board', 'kenney-food-kit', 'cutting-board', 0, 60], ['工具', '胡椒研磨器', 'pepper mill', 'kenney-food-kit', 'pepper-mill'], ['工具', '水桶', 'bucket', 'kenney-survival-kit', 'bucket'],
  ['機器', '洗衣機', 'washing machine', 'kenney-furniture-kit', 'washer'], ['機器', '冰箱', 'fridge', 'kenney-furniture-kit', 'kitchenFridge'], ['機器', '爐子', 'stove', 'kenney-furniture-kit', 'kitchenStove'],
  ['機器', '咖啡機', 'coffee machine', 'kenney-furniture-kit', 'kitchenCoffeeMachine'], ['機器', '果汁機', 'blender', 'kenney-furniture-kit', 'kitchenBlender'], ['機器', '微波爐', 'microwave', 'kenney-furniture-kit', 'kitchenMicrowave'],
  ['機器', '烤麵包機', 'toaster', 'kenney-furniture-kit', 'toaster'], ['機器', '收音機', 'radio', 'kenney-furniture-kit', 'radio'], ['機器', '電視', 'television', 'kenney-furniture-kit', 'televisionVintage'],
  ['機器', '螢幕', 'monitor', 'kenney-furniture-kit', 'computerScreen'], ['機器', '鍵盤', 'keyboard', 'kenney-furniture-kit', 'computerKeyboard', 0, 60], ['機器', '筆電', 'laptop', 'kenney-furniture-kit', 'laptop'],
  ['機器', '喇叭', 'speaker', 'kenney-furniture-kit', 'speaker'], ['機器', '吊扇', 'ceiling fan', 'kenney-furniture-kit', 'ceilingFan'], ['機器', '機器人', 'robot', 'quaternius-robot', 'Robot'],
  ['機器', '汽車', 'car', 'kenney-car-kit', 'sedan'], ['機器', '卡車', 'truck', 'kenney-car-kit', 'truck'], ['機器', '拖拉機', 'tractor', 'kenney-car-kit', 'tractor'],
  ['人造物', '椅子', 'chair', 'kenney-furniture-kit', 'chair'], ['人造物', '桌子', 'table', 'kenney-furniture-kit', 'table'], ['人造物', '檯燈', 'table lamp', 'kenney-furniture-kit', 'lampRoundTable'],
  ['人造物', '立燈', 'floor lamp', 'kenney-furniture-kit', 'lampRoundFloor'], ['人造物', '床', 'bed', 'kenney-furniture-kit', 'bedSingle'], ['人造物', '沙發', 'sofa', 'kenney-furniture-kit', 'loungeSofa'],
  ['人造物', '浴缸', 'bathtub', 'kenney-furniture-kit', 'bathtub'], ['人造物', '馬桶', 'toilet', 'kenney-furniture-kit', 'toilet'], ['人造物', '垃圾桶', 'trash can', 'kenney-furniture-kit', 'trashcan'],
  ['人造物', '紙箱', 'cardboard box', 'kenney-furniture-kit', 'cardboardBoxOpen'], ['人造物', '帳篷', 'tent', 'kenney-survival-kit', 'tent'], ['人造物', '寶箱', 'chest', 'kenney-survival-kit', 'chest'],
  ['人造物', '獨木舟', 'canoe', 'kenney-nature-kit', 'canoe'], ['人造物', '泰迪熊', 'teddy bear', 'kenney-furniture-kit', 'bear'], ['人造物', '馬克杯', 'mug', 'kenney-food-kit', 'mug'],
  ['人造物', '酒杯', 'wine glass', 'kenney-food-kit', 'glass-wine'],
  ['書', '書', 'books', 'kenney-furniture-kit', 'books'], ['書', '書櫃', 'bookcase', 'kenney-furniture-kit', 'bookcaseOpen'],
  ['食物', '甜甜圈', 'donut', 'kenney-food-kit', 'donut', 0, 40], ['食物', '漢堡', 'burger', 'kenney-food-kit', 'burger'], ['食物', '蛋糕', 'cake', 'kenney-food-kit', 'cake'],
  ['食物', '可頌', 'croissant', 'kenney-food-kit', 'croissant'], ['食物', '冰淇淋', 'ice cream', 'kenney-food-kit', 'ice-cream'],
];

const find = (dir, name) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { const r = find(p, name); if (r) return r; } else if (e.name.toLowerCase() === name.toLowerCase()) return p; } return null; };
const norm = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };

// ── GLB：照場景的節點走一遍，把每個 mesh 的三角形換到世界座標 ──
function readGlb(file) {
  const b = fs.readFileSync(file), jl = b.readUInt32LE(12), json = JSON.parse(b.slice(20, 20 + jl).toString('utf8')), bin = b.slice(20 + jl + 8);
  const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }, READ = { 5120: 'Int8', 5121: 'UInt8', 5122: 'Int16LE', 5123: 'UInt16LE', 5125: 'UInt32LE', 5126: 'FloatLE' }, BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const acc = i => { const a = json.accessors[i], v = json.bufferViews[a.bufferView], n = SIZE[a.type], w = BYTES[a.componentType], stride = v.byteStride || n * w, out = [];
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out.push(bin['read' + READ[a.componentType]]((v.byteOffset || 0) + (a.byteOffset || 0) + k * stride + c * w)); return out; };
  const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
  const local = n => { if (n.matrix) return n.matrix; const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
    return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0, 2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0, 2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1]; };
  const tris = [];   // 每個頂點 [x,y,z,nx,ny,nz]，三個一組
  const walk = (i, parent) => {
    const n = json.nodes[i], m = mul(parent, local(n));
    if (n.mesh != null) for (const p of json.meshes[n.mesh].primitives) {
      if (p.mode != null && p.mode !== 4) continue;
      const pos = acc(p.attributes.POSITION), nor = p.attributes.NORMAL != null ? acc(p.attributes.NORMAL) : null, idx = p.indices != null ? acc(p.indices) : pos.map((_, k) => k).filter(k => k % 3 === 0).map(k => k / 3);
      for (const k of idx) {
        const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2], q = nor ? [nor[k * 3], nor[k * 3 + 1], nor[k * 3 + 2]] : [0, 0, 0];
        tris.push([m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14], ...norm(m[0] * q[0] + m[4] * q[1] + m[8] * q[2], m[1] * q[0] + m[5] * q[1] + m[9] * q[2], m[2] * q[0] + m[6] * q[1] + m[10] * q[2])]);
      }
    }
    for (const c of n.children || []) walk(c, m);
  };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const r of (json.scenes && json.scenes[json.scene || 0] || { nodes: json.nodes.map((_, i) => i) }).nodes) walk(r, I);
  return tris;
}
// ── OBJ：v、vn、f（多邊形切成扇形） ──
function readObj(file) {
  const v = [], vn = [], tris = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim().split(/\s+/);
    if (t[0] === 'v') v.push(t.slice(1, 4).map(Number)); else if (t[0] === 'vn') vn.push(t.slice(1, 4).map(Number));
    else if (t[0] === 'f') { const c = t.slice(1).map(s => { const [a, , n] = s.split('/'); return [...v[(+a > 0 ? +a : v.length + +a + 1) - 1], ...(n ? vn[(+n > 0 ? +n : vn.length + +n + 1) - 1] : [0, 0, 0])]; });
      for (let k = 1; k + 1 < c.length; k++) tris.push(c[0], c[k], c[k + 1]); }
  }
  return tris;
}

const out = [];
for (const [cat, zh, en, pack, name, turn = 0, tilt = 0] of LIST) {
  const file = find(path.join(ROOT, pack), name + '.glb') || find(path.join(ROOT, pack), name + '.obj');
  if (!file) { console.log('找不到', pack, name); continue; }
  let tris = file.toLowerCase().endsWith('.glb') ? readGlb(file) : readObj(file);
  // 沒有法線的（或法線是 0 的）用面的法線
  for (let k = 0; k < tris.length; k += 3) { const [a, b, c] = [tris[k], tris[k + 1], tris[k + 2]]; if (a[3] || a[4] || a[5]) continue;
    const f = norm((b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    for (const q of [a, b, c]) q.splice(3, 3, ...f); }
  if (turn) { const s = Math.sin(turn * Math.PI / 180), c = Math.cos(turn * Math.PI / 180); tris = tris.map(([x, y, z, nx, ny, nz]) => [x * c + z * s, y, -x * s + z * c, nx * c + nz * s, ny, -nx * s + nz * c]); }
  if (tilt) { const s = Math.sin(tilt * Math.PI / 180), c = Math.cos(tilt * Math.PI / 180); tris = tris.map(([x, y, z, nx, ny, nz]) => [x, y * c - z * s, y * s + z * c, nx, ny * c - nz * s, ny * s + nz * c]); }
  // 置中、縮到半徑 1
  const mid = [0, 1, 2].map(k => (Math.min(...tris.map(q => q[k])) + Math.max(...tris.map(q => q[k]))) / 2);
  const rad = Math.max(...tris.map(q => Math.hypot(q[0] - mid[0], q[1] - mid[1], q[2] - mid[2])));
  // 位置、法線都一樣的頂點併成一個
  const key = new Map(), P = [], N = [], F = [];
  for (const q of tris) {
    const p = [0, 1, 2].map(k => Math.round((q[k] - mid[k]) / rad * 32767)), n = [3, 4, 5].map(k => Math.round(q[k] * 127)), id = p.join(',') + '|' + n.join(',');
    if (!key.has(id)) { key.set(id, P.length / 3); P.push(...p); N.push(...n); }
    F.push(key.get(id));
  }
  if (P.length / 3 > 65535) { console.log('頂點太多', en, P.length / 3); continue; }
  const slug = en.replace(/\s+/g, '-'), nv = P.length / 3, pad = nv % 2, buf = Buffer.alloc(nv * 9 + pad + F.length * 2);
  P.forEach((v, i) => buf.writeInt16LE(v, i * 2)); N.forEach((v, i) => buf.writeInt8(v, nv * 6 + i)); F.forEach((v, i) => buf.writeUInt16LE(v, nv * 9 + pad + i * 2));
  fs.writeFileSync(path.join(OUT, slug + '.bin'), buf);
  out.push({ slug, zh, en, cat, nv, nt: F.length / 3 });
  console.log(en.padEnd(16), 'verts', String(P.length / 3).padStart(5), 'tris', String(F.length / 3).padStart(5));
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(out));
console.log(out.length, '個；', (fs.readdirSync(OUT).reduce((n, f) => n + fs.statSync(path.join(OUT, f)).size, 0) / 1024).toFixed(0), 'KB');
