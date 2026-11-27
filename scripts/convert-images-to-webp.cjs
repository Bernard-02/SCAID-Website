// 後台檔案庫的 JPG／PNG「原地」換成 WebP（同一個檔案 id → /assets/<id> 直接吐 WebP，前台不用改）。照 SCCD scripts/convert-images-to-webp.cjs（user 2026-11-27：「幫我跑之前webp的脚本」）。
// 為什麼要：作品的原圖長邊到 7008px、單張 5MB，後台一次產生幾張縮圖主機就「Under pressure」（503）；前台也直接讀原圖、手機載很久。
// 長邊縮到 MAX_EDGE、品質 QUALITY；小圖不放大；WebP 沒比較小的那張不換。轉過的已是 image/webp＝重跑只會處理還沒轉的。
// 跟 SCCD 不同：①換之前原圖存一份到 BACKUP（本機 ../SCAID-原圖備份/；GitHub Actions 上打包成 artifact，SCCD 不留）②一張一張、遇到 503 等一下再試（這台主機小）
// 平常由 .github/workflows/webp.yml 在 GitHub Actions 上跑（user 2026-11-27：本機連 AWS 首爾太慢，讀一張圖每秒 80KB；GitHub 的機器很快）。
//
// 本機跑（專案根目錄；token＝scripts/.directus-token；playwright 借 SCCD 的 node_modules，同 smoke.cjs）：
//   node scripts/convert-images-to-webp.cjs --limit 1 --dry   只轉一張看省多少、不寫回
//   node scripts/convert-images-to-webp.cjs                   全部
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.CI ? 'playwright' : '../../SCCD Website/node_modules/playwright');

const token = (process.env.DIRECTUS_TOKEN || fs.readFileSync('scripts/.directus-token', 'utf8')).trim();
const H = { Authorization: 'Bearer ' + token };
const BASE = fs.readFileSync('js/config/api.js', 'utf8').match(/CMS_API_BASE = '(https:\/\/[^/']+)/)[1];
const MAX_EDGE = 2000;   // 同 SCCD：Retina 上點開的大圖也夠清楚
const QUALITY = 0.8;
const BACKUP = path.resolve(process.env.BACKUP || path.join('..', 'SCAID-原圖備份'));

const argN = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null; };
const LIMIT = argN('--limit') ? parseInt(argN('--limit'), 10) : Infinity;
const DRY = process.argv.includes('--dry');
const wait = (ms) => new Promise(r => setTimeout(r, ms));
// 主機忙（503 Under pressure）＝等一下再試，最多 6 次（5、10、15…秒）
async function call(url, opts = {}) {
  for (let i = 1; ; i++) {
    const res = await fetch(url, { ...opts, headers: { ...H, ...opts.headers } });
    if (res.status !== 503 || i > 6) return res;
    console.log(`    主機忙，${5 * i} 秒後再試`);
    await wait(5000 * i);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CI ? {} : { channel: 'msedge' }) });   // 本機用 Edge；Actions 上用 playwright 自己裝的 chromium
  const page = await browser.newPage();
  await page.setContent('<!doctype html><meta charset=utf-8>');
  if (!DRY) fs.mkdirSync(BACKUP, { recursive: true });

  const q = encodeURIComponent('image/jpeg,image/png');
  const files = (await (await call(`${BASE}/files?filter[type][_in]=${q}&fields=id,type,filename_download,filesize&sort=-filesize&limit=-1`)).json()).data || [];
  const todo = files.slice(0, LIMIT);
  console.log(`檔案庫 JPG／PNG：${files.length} 張，這次處理 ${todo.length} 張${DRY ? '（--dry 不寫回）' : `；原圖備份到 ${BACKUP}`}`);

  let ok = 0, skip = 0, fail = 0, saved = 0;
  for (const f of todo) {
    try {
      const res = await call(`${BASE}/assets/${f.id}`);
      if (!res.ok) throw new Error(`下載 ${res.status}`);
      const origBuf = Buffer.from(await res.arrayBuffer());
      const b64 = await page.evaluate(async ({ dataUrl, maxEdge, quality }) => {
        const img = new Image();
        await new Promise((ok, no) => { img.onload = ok; img.onerror = () => no(new Error('解不開這張圖')); img.src = dataUrl; });
        const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
        const ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, c.width, c.height);   // 不填底色：PNG 的透明照留（WebP 有 alpha）
        return c.toDataURL('image/webp', quality).split(',')[1];
      }, { dataUrl: `data:${f.type};base64,${origBuf.toString('base64')}`, maxEdge: MAX_EDGE, quality: QUALITY });
      const webpBuf = Buffer.from(b64, 'base64');
      const kb = (b) => `${(b.length / 1024).toFixed(0)}KB`;
      if (webpBuf.length >= origBuf.length) { skip++; console.log(`  – ${f.filename_download}  WebP ${kb(webpBuf)} ≥ 原圖 ${kb(origBuf)}，不換`); continue; }
      console.log(`  ${DRY ? '·' : '✓'} ${f.filename_download}  ${kb(origBuf)} → ${kb(webpBuf)}`);
      saved += origBuf.length - webpBuf.length;
      if (DRY) { ok++; continue; }

      fs.writeFileSync(path.join(BACKUP, `${f.id}__${(f.filename_download || f.id).replace(/[\\/:*?"<>|]/g, '_')}`), origBuf);
      const fd = new FormData();
      fd.append('file', new Blob([webpBuf], { type: 'image/webp' }), `${(f.filename_download || f.id).replace(/\.[^.]+$/, '')}.webp`);
      const up = await call(`${BASE}/files/${f.id}`, { method: 'PATCH', body: fd });
      if (!up.ok) throw new Error(`寫回 ${up.status} ${(await up.text()).slice(0, 150)}`);
      ok++;
      await wait(500);   // 給主機喘口氣
    } catch (e) {
      fail++;
      console.log(`  ✗ ${f.filename_download || f.id}：${e.message}`);
    }
  }
  await browser.close();
  console.log(`\n完成：轉 ${ok}、不換 ${skip}、失敗 ${fail}；省 ${(saved / 1024 / 1024).toFixed(1)}MB${DRY ? '（預估，沒寫回）' : ''}`);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
