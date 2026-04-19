// Instagram Reels orchestrator.
// Akis: secici -> HTML render PNG -> ffmpeg MP4 -> FTP upload -> IG publish -> social_posts.
//
// Kullanim:
//   node scripts/social/reels/index.mjs --template=haftanin-firsatlari
//   SOCIAL_DRY_RUN=1 node scripts/social/reels/index.mjs --template=fiyat-savasi
//
// Sablonlar: haftanin-firsatlari | fiyat-savasi | fiyat-dustu | uc-market
import path from "node:path";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../../lib/env.mjs";

loadEnv(process.cwd());

import { SELECTORS, loadAll } from "./lib/select.mjs";
import { renderPng } from "./lib/render.mjs";
import { composeMp4 } from "./lib/compose.mjs";
import { uploadToFtp } from "./lib/upload.mjs";
import { publishReel, igReady } from "./lib/ig.mjs";
import { markPosted } from "../lib/common.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, "templates");
const DRY = process.env.SOCIAL_DRY_RUN === "1";

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
    else if (a.startsWith("--")) out[a.slice(2)] = true;
  }
  return out;
}

function tsStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth()+1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}

async function main() {
  const args = parseArgs(process.argv);
  const tmpl = args.template;
  if (!tmpl || !SELECTORS[tmpl]) {
    console.error(`Gecerli --template gerekli. Secenekler: ${Object.keys(SELECTORS).join(", ")}`);
    process.exit(1);
  }

  console.log(`▶ Reels pipeline: ${tmpl}${DRY ? " (DRY)" : ""}`);

  // 1) Veri topla + secici
  const bundle = await loadAll();
  console.log(`  veri: ${bundle.products.length} urun, ${bundle.catalogs.length} katalog`);

  const pick = SELECTORS[tmpl](bundle, {});
  if (!pick) {
    console.log(`  ${tmpl} icin uygun veri yok; atlandi.`);
    return;
  }
  const { template, data, caption } = pick;

  // 2) Render PNG
  const workDir = path.join(process.cwd(), ".reels-out");
  await mkdir(workDir, { recursive: true });
  const stamp = tsStamp();
  const baseName = `${template}-${stamp}`;
  const pngPath = path.join(workDir, `${baseName}.png`);
  const mp4Path = path.join(workDir, `${baseName}.mp4`);
  const captionPath = path.join(workDir, `${baseName}.txt`);
  const dataPath = path.join(workDir, `${baseName}.json`);

  const htmlPath = path.join(TEMPLATES_DIR, `${template}.html`);
  await renderPng(htmlPath, data, pngPath);
  console.log(`  ✓ PNG: ${path.relative(process.cwd(), pngPath)}`);

  // 3) MP4 compose
  await composeMp4(pngPath, mp4Path, { durationSec: 7, fps: 30 });
  console.log(`  ✓ MP4: ${path.relative(process.cwd(), mp4Path)}`);

  await writeFile(captionPath, caption || "", "utf8");
  await writeFile(dataPath, JSON.stringify({ template, data }, null, 2), "utf8");

  if (DRY) {
    console.log(`  [DRY] FTP/IG atlandi. Ciktilar: ${workDir}`);
    return;
  }

  // 4) FTP upload
  const videoUrl = await uploadToFtp(mp4Path, "reels");
  console.log(`  ✓ FTP: ${videoUrl}`);

  // 5) IG publish
  if (!igReady()) {
    console.log(`  IG env yok (IG_USER_ID / IG_ACCESS_TOKEN). Yayinlama atlandi; MP4 hazir: ${videoUrl}`);
    return;
  }
  const { mediaId } = await publishReel({ videoUrl, caption });
  console.log(`  ✓ IG media_id=${mediaId}`);

  // 6) Dedup kaydi (urun tabanli sablonlarda)
  const prodIds = extractProductIds(pick, bundle);
  for (const pid of prodIds) {
    await markPosted(pid, "instagram_reels", mediaId);
  }
  if (prodIds.length) console.log(`  ✓ social_posts kaydi: ${prodIds.length}`);

  // 7) Gecici dosyalari temizle (MP4'u FTP'de tutuyoruz, local gereksiz)
  try { await rm(workDir, { recursive: true, force: true }); } catch {}
}

function extractProductIds(pick, { products }) {
  // Secilen urunleri bulmaya calis (matchKey/name tabanli).
  // Kesin id'yi tasimiyoruz — sablon datasinda sadece name var. Yaklasik: ayni marketId+name match.
  const ids = new Set();
  const d = pick.data;
  const tryMatch = (name, marketId) => {
    if (!name) return;
    const n = String(name).toLocaleLowerCase("tr-TR");
    for (const p of products) {
      if (marketId && p.market_id !== marketId) continue;
      if (!p.name) continue;
      const pn = String(p.name).toLocaleLowerCase("tr-TR");
      if (pn.startsWith(n.slice(0, Math.min(20, n.length - 1)))) {
        if (p.id != null) ids.add(String(p.id));
        break;
      }
    }
  };
  if (pick.template === "haftanin-firsatlari") {
    // productName yok; items listesinden name alalim (kirpilmis olabilir)
    (d.items || []).forEach((it) => tryMatch(it.name, null));
  } else {
    tryMatch(d.productName, null);
  }
  return [...ids].slice(0, 8);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
