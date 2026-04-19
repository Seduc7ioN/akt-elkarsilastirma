// Brosur hotspot/bbox enrichment pipeline (global image-first).
//
// Akis:
//   1) Tum products'i tara; bbox=NULL + image!=NULL + catalog_id!=NULL.
//   2) Image URL'a gore grupla (cross-catalog). Placeholder ('t.gif' vb.) atla.
//   3) 2+ urun paylasilan her unique image icin:
//        a) Image indir (cache'li).
//        b) Claude Vision'a o image'daki ilgili urun adlarini ver.
//        c) Tespitleri {catId, productId, imgUrl, x,y,w,h} formatinda topla.
//   4) Her catalog icin:
//        a) Bu catalog'a ait tespitlerin kullandigi unique imgUrl'lari topla -> pages[]
//        b) weekly_catalogs.pages = pages[], cover_image = pages[0].
//        c) Her tespit icin: sharp ile crop + Storage upload (catalog/product.jpg)
//           + products.{bbox:{page:idx,x,y,w,h}, image:cropUrl} yaz.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY
//
// Kullanim:
//   node scripts/scraper/bbox-enrich.mjs
//   node scripts/scraper/bbox-enrich.mjs --limit=5
//   node scripts/scraper/bbox-enrich.mjs --image=<url>
//   node scripts/scraper/bbox-enrich.mjs --dry

import { loadEnv } from "../lib/env.mjs";
loadEnv(process.cwd());
import sharp from "sharp";
import { selectAll, updateRow, uploadToStorage } from "./lib/supabase.mjs";
import { detectBboxes } from "./lib/vision.mjs";

const BUCKET = process.env.PRODUCT_CROPS_BUCKET || "product-crops";
const CROP_MAX = 800;
const MIN_PRODUCTS = 2;
const PLACEHOLDER_RE = /(\/t\.gif|\/placeholder|\/1x1\.|\/blank\.)/i;

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

function normalizeImageUrl(u) {
  if (!u) return null;
  let s = String(u).trim();
  if (!s) return null;
  if (s.startsWith("//")) s = "https:" + s;
  else if (/^\/cdn\.|^\/static\.|^\/assets\./.test(s)) s = "https:/" + s;
  if (!/^https?:\/\//i.test(s)) return null;
  if (PLACEHOLDER_RE.test(s)) return null;
  return s;
}

async function fetchImage(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const ct = res.headers.get("content-type") || "";
  let mediaType = "image/jpeg";
  if (/png/i.test(ct)) mediaType = "image/png";
  else if (/webp/i.test(ct)) mediaType = "image/webp";
  else if (/gif/i.test(ct)) mediaType = "image/gif";
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) throw new Error(`too small (${buf.length}B)`);
  return { buf, mediaType };
}

async function cropAndUpload(srcBuf, bbox, catalogId, productId) {
  const meta = await sharp(srcBuf).metadata();
  const W = meta.width, H = meta.height;
  if (!W || !H) throw new Error("metadata yok");
  const left = Math.max(0, Math.round(bbox.x * W));
  const top = Math.max(0, Math.round(bbox.y * H));
  const width = Math.min(W - left, Math.round(bbox.w * W));
  const height = Math.min(H - top, Math.round(bbox.h * H));
  if (width < 10 || height < 10) throw new Error(`crop cok kucuk ${width}x${height}`);
  const cropped = await sharp(srcBuf)
    .extract({ left, top, width, height })
    .resize({ width: CROP_MAX, height: CROP_MAX, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  return uploadToStorage(BUCKET, `${catalogId}/${productId}.jpg`, cropped, "image/jpeg");
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY yok"); process.exit(1); }
  if (!process.env.SUPABASE_SERVICE_KEY) { console.error("SUPABASE_SERVICE_KEY yok"); process.exit(1); }
  const args = parseArgs(process.argv);
  const dry = !!args.dry;
  const limit = args.limit ? Math.max(1, parseInt(args.limit, 10)) : null;
  const onlyImage = args.image ? normalizeImageUrl(args.image) : null;

  console.log("Urunler cekiliyor...");
  const products = await selectAll("products", "select=id,catalog_id,name,image,bbox");
  console.log(`  ${products.length} toplam urun.`);

  // Faz 1 — image URL'a gore grupla
  const byImage = new Map();
  for (const p of products) {
    if (p.bbox) continue;
    if (!p.name || !p.catalog_id) continue;
    const img = normalizeImageUrl(p.image);
    if (!img) continue;
    if (onlyImage && img !== onlyImage) continue;
    if (!byImage.has(img)) byImage.set(img, []);
    byImage.get(img).push(p);
  }
  const groups = [...byImage.entries()]
    .filter(([, ps]) => onlyImage || ps.length >= MIN_PRODUCTS)
    .sort((a, b) => b[1].length - a[1].length);
  console.log(`  ${groups.length} brosur-sayfa kandidati.`);
  const work = limit ? groups.slice(0, limit) : groups;
  console.log(`Islenecek: ${work.length}${dry ? " (DRY)" : ""}\n`);

  // Faz 2 — Vision ile tespit, tumunu belege topla
  const detections = []; // {prod, imgUrl, x,y,w,h, srcBuf, mediaType}
  const bufCache = new Map(); // imgUrl -> {buf, mediaType}
  let visionIn = 0, visionOut = 0;

  for (let i = 0; i < work.length; i++) {
    const [imgUrl, ps] = work[i];
    console.log(`[${i + 1}/${work.length}] ${ps.length} urun · ${imgUrl.slice(-60)}`);
    let srcBuf, mediaType;
    try {
      ({ buf: srcBuf, mediaType } = await fetchImage(imgUrl));
    } catch (e) {
      console.log(`  gorsel alinamadi: ${e.message}`); continue;
    }
    bufCache.set(imgUrl, { buf: srcBuf, mediaType });

    // 30 urun / chunk
    const chunks = [];
    for (let k = 0; k < ps.length; k += 30) chunks.push(ps.slice(k, k + 30));
    for (const chunk of chunks) {
      try {
        const r = await detectBboxes(srcBuf, mediaType, chunk.map((p) => ({ id: p.id, name: p.name })));
        visionIn += r.usage?.input_tokens || 0;
        visionOut += r.usage?.output_tokens || 0;
        console.log(`  Vision: ${r.detections.length}/${chunk.length} tespit`);
        for (const det of r.detections) {
          const prod = chunk.find((p) => p.id === det.productId);
          if (prod) detections.push({ prod, imgUrl, x: det.x, y: det.y, w: det.w, h: det.h });
        }
      } catch (e) {
        console.log(`  Vision hata: ${e.message}`);
      }
    }
  }

  console.log(`\nFaz 2 bitti: ${detections.length} tespit. Tokens in=${visionIn} out=${visionOut}.`);

  if (dry) {
    // Katalog bazli ozetle
    const catSummary = new Map();
    for (const d of detections) {
      const k = d.prod.catalog_id;
      if (!catSummary.has(k)) catSummary.set(k, { pages: new Set(), dets: 0 });
      const s = catSummary.get(k);
      s.pages.add(d.imgUrl); s.dets++;
    }
    console.log(`\nKatalog bazli dagilim:`);
    for (const [cid, s] of catSummary) {
      console.log(`  ${cid.slice(0, 8)} · ${s.pages.size} sayfa · ${s.dets} urun`);
    }
    return;
  }

  // Faz 3 — Catalog bazli pages[] + cover_image + crop + DB update
  const byCat = new Map();
  for (const d of detections) {
    if (!byCat.has(d.prod.catalog_id)) byCat.set(d.prod.catalog_id, []);
    byCat.get(d.prod.catalog_id).push(d);
  }
  console.log(`\nFaz 3: ${byCat.size} katalog isleniyor...\n`);

  let ok = 0, fail = 0;
  for (const [catId, dets] of byCat) {
    // Bu katalog icin kullanilan sayfa URL'leri -> pages[]
    const pagesArr = [...new Set(dets.map((d) => d.imgUrl))];
    try {
      await updateRow("weekly_catalogs", catId, { pages: pagesArr, cover_image: pagesArr[0] });
    } catch (e) {
      console.log(`  ${catId.slice(0, 8)} weekly_catalogs yazma hata: ${e.message}`); fail++; continue;
    }
    const pageIdxOf = (url) => pagesArr.indexOf(url);
    for (const d of dets) {
      const pageIdx = pageIdxOf(d.imgUrl);
      const bbox = { page: pageIdx, x: d.x, y: d.y, w: d.w, h: d.h };
      const cached = bufCache.get(d.imgUrl);
      if (!cached) { fail++; continue; }
      try {
        const cropUrl = await cropAndUpload(cached.buf, bbox, catId, d.prod.id);
        await updateRow("products", d.prod.id, { bbox, image: cropUrl });
        ok++;
      } catch (e) {
        console.log(`  crop/upload ${d.prod.id.slice(0, 8)}: ${e.message}`); fail++;
      }
    }
    console.log(`  ${catId.slice(0, 8)} · ${pagesArr.length} sayfa · ${dets.length} urun islendi`);
  }

  console.log(`\nBitti. Basarili: ${ok}, hata: ${fail}. Tokens in=${visionIn} out=${visionOut}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
