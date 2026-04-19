// Brosur hotspot/bbox enrichment pipeline.
//
// Ne yapar:
//   1) products.bbox = NULL olan urunleri katalog katalog tarar.
//   2) Ayni image URL'ini paylasan urunleri grupla (= o gorsel brosur sayfasi).
//   3) Gorseli indir, Claude Vision ile bbox tespiti iste (urun isim listesi ile).
//   4) Her tespit icin: sharp ile crop et, Supabase Storage'a yukle,
//      products.image = crop URL, products.bbox = {page,x,y,w,h} yaz.
//   5) weekly_catalogs.pages[] = orijinal sayfa URL'leri (sira: tespit edilen).
//      weekly_catalogs.cover_image = ilk sayfa.
//
// Gereksinim env: SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY.
//
// Kullanim:
//   node scripts/scraper/bbox-enrich.mjs                  # tum kataloglar (yeni / eksik)
//   node scripts/scraper/bbox-enrich.mjs --catalog=<uuid> # tek katalog
//   node scripts/scraper/bbox-enrich.mjs --limit=3        # en fazla 3 katalog
//   node scripts/scraper/bbox-enrich.mjs --dry            # Vision calis, DB/Storage yazma

import path from "node:path";
import sharp from "sharp";
import { loadEnv } from "../lib/env.mjs";
loadEnv(process.cwd());
import { selectAll, updateRow, uploadToStorage } from "./lib/supabase.mjs";
import { detectBboxes } from "./lib/vision.mjs";

const BUCKET = process.env.PRODUCT_CROPS_BUCKET || "product-crops";
const CROP_MAX = 800;

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

async function fetchImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image fetch ${res.status}: ${url}`);
  const ct = res.headers.get("content-type") || "";
  let mediaType = "image/jpeg";
  if (/png/i.test(ct)) mediaType = "image/png";
  else if (/webp/i.test(ct)) mediaType = "image/webp";
  else if (/gif/i.test(ct)) mediaType = "image/gif";
  const buf = Buffer.from(await res.arrayBuffer());
  return { buf, mediaType };
}

async function cropAndUpload(srcBuf, bbox, catalogId, productId) {
  const img = sharp(srcBuf);
  const meta = await img.metadata();
  const W = meta.width, H = meta.height;
  if (!W || !H) throw new Error("Image metadata eksik.");
  const left = Math.max(0, Math.round(bbox.x * W));
  const top = Math.max(0, Math.round(bbox.y * H));
  const width = Math.min(W - left, Math.round(bbox.w * W));
  const height = Math.min(H - top, Math.round(bbox.h * H));
  if (width < 10 || height < 10) throw new Error(`Crop cok kucuk: ${width}x${height}`);
  const cropped = await sharp(srcBuf)
    .extract({ left, top, width, height })
    .resize({ width: CROP_MAX, height: CROP_MAX, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  const objectPath = `${catalogId}/${productId}.jpg`;
  const url = await uploadToStorage(BUCKET, objectPath, cropped, "image/jpeg");
  return { url, size: cropped.length, width, height };
}

async function processCatalog(cat, opts = {}) {
  const { dry = false } = opts;
  console.log(`\n▶ Katalog ${cat.id.slice(0, 8)} ${cat.market_id} ${cat.week_start}..${cat.week_end}`);
  // Bu kataloga ait urunleri cek
  const products = await selectAll("products", `catalog_id=eq.${cat.id}&select=id,name,image,bbox`);
  if (!products.length) { console.log("  urun yok, atla."); return { processed: 0 }; }

  // Gorsel grupla
  const byImg = new Map();
  for (const p of products) {
    if (!p.image) continue;
    if (!byImg.has(p.image)) byImg.set(p.image, []);
    byImg.get(p.image).push(p);
  }
  // Sadece 2+ urun paylasan gorseller brosur sayfasi sayilir
  const sharedPages = [...byImg.entries()].filter(([, ps]) => ps.length >= 2);
  if (!sharedPages.length) {
    console.log(`  ${products.length} urun, paylasilan sayfa yok. bbox gerekmiyor, atla.`);
    return { processed: 0 };
  }
  console.log(`  ${products.length} urun, ${sharedPages.length} brosur sayfasi tespit edildi.`);

  const pagesOut = [];
  let totalDetections = 0;

  for (let pageIdx = 0; pageIdx < sharedPages.length; pageIdx++) {
    const [pageUrl, ps] = sharedPages[pageIdx];
    // Zaten bbox'i olan urunleri atla — sadece null olanlar icin Vision cagrilir
    const needs = ps.filter((p) => !p.bbox);
    console.log(`  [${pageIdx + 1}/${sharedPages.length}] ${ps.length} urun (${needs.length} bbox eksik)`);
    pagesOut.push(pageUrl);
    if (!needs.length) continue;

    let srcBuf, mediaType;
    try {
      ({ buf: srcBuf, mediaType } = await fetchImage(pageUrl));
    } catch (e) {
      console.log(`    gorsel indirilemedi: ${e.message}`);
      continue;
    }

    let detections;
    try {
      const result = await detectBboxes(srcBuf, mediaType, needs.map((p) => ({ id: p.id, name: p.name })));
      detections = result.detections;
      console.log(`    Vision: ${detections.length}/${needs.length} tespit (in=${result.usage?.input_tokens} out=${result.usage?.output_tokens})`);
    } catch (e) {
      console.log(`    Vision hata: ${e.message}`);
      continue;
    }

    for (const det of detections) {
      const bbox = { page: pageIdx, x: det.x, y: det.y, w: det.w, h: det.h };
      totalDetections++;
      if (dry) {
        console.log(`    [DRY] ${det.productId.slice(0, 8)} bbox=${JSON.stringify(bbox)}`);
        continue;
      }
      try {
        const crop = await cropAndUpload(srcBuf, bbox, cat.id, det.productId);
        await updateRow("products", det.productId, { bbox, image: crop.url });
      } catch (e) {
        console.log(`    crop/upload hata ${det.productId.slice(0, 8)}: ${e.message}`);
      }
    }
  }

  // catalog pages + cover
  if (!dry && pagesOut.length) {
    try {
      await updateRow("weekly_catalogs", cat.id, { pages: pagesOut, cover_image: pagesOut[0] });
      console.log(`  ✓ weekly_catalogs.pages (${pagesOut.length}) + cover_image`);
    } catch (e) {
      console.log(`  weekly_catalogs update hata: ${e.message}`);
    }
  }

  return { processed: totalDetections };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY yok."); process.exit(1); }
  if (!process.env.SUPABASE_SERVICE_KEY) { console.error("SUPABASE_SERVICE_KEY yok."); process.exit(1); }
  const args = parseArgs(process.argv);
  const dry = !!args.dry;
  const limit = args.limit ? Math.max(1, parseInt(args.limit, 10)) : null;

  let catalogs;
  if (args.catalog) {
    catalogs = await selectAll("weekly_catalogs", `id=eq.${args.catalog}&select=id,market_id,week_start,week_end,pages,cover_image`);
  } else {
    catalogs = await selectAll("weekly_catalogs", `select=id,market_id,week_start,week_end,pages,cover_image&order=week_start.desc`);
    // Onceligi: pages/cover_image henuz yok olanlar
    catalogs.sort((a, b) => {
      const aDone = (a.pages && a.pages.length) || a.cover_image ? 1 : 0;
      const bDone = (b.pages && b.pages.length) || b.cover_image ? 1 : 0;
      return aDone - bDone;
    });
  }
  if (limit) catalogs = catalogs.slice(0, limit);
  console.log(`Islenecek katalog: ${catalogs.length}${dry ? " (DRY)" : ""}`);

  let totalDet = 0;
  for (const c of catalogs) {
    try {
      const r = await processCatalog(c, { dry });
      totalDet += r.processed || 0;
    } catch (e) {
      console.log(`  HATA ${c.id.slice(0, 8)}: ${e.message}`);
    }
  }
  console.log(`\nBitti. Toplam tespit: ${totalDet}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
