// Reels orchestrator (IG API KULLANMAZ).
// Pipeline: secici -> HTML render PNG -> ffmpeg MP4 -> FTP upload (/sosyal-data/)
//           -> /sosyal-data/index.json guncelle.
// Yonetici /sosyal.php'den manuel Instagram'a kopyala/yapistir yapar.
//
// Kullanim:
//   node scripts/social/reels/index.mjs --template=fiyat-dustu
//   SOCIAL_DRY_RUN=1 node scripts/social/reels/index.mjs --template=haftanin-firsatlari
import path from "node:path";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadEnv } from "../../lib/env.mjs";

loadEnv(process.cwd());

import { SELECTORS, loadAll } from "./lib/select.mjs";
import { renderPng } from "./lib/render.mjs";
import { composeMp4 } from "./lib/compose.mjs";
import { uploadToFtp } from "./lib/upload.mjs";
import { markPosted } from "../lib/common.mjs";

const exec = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, "templates");
const DRY = process.env.SOCIAL_DRY_RUN === "1";
const SITE_URL = (process.env.SITE_URL || "https://xn--aktelkarsilastirma-o6b.com").replace(/\/$/, "");
const MAX_INDEX_ENTRIES = 60;

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

async function fetchIndex() {
  try {
    const res = await fetch(`${SITE_URL}/sosyal-data/index.json`, { cache: "no-store" });
    if (!res.ok) return { items: [] };
    const j = await res.json();
    if (!j || !Array.isArray(j.items)) return { items: [] };
    return j;
  } catch {
    return { items: [] };
  }
}

async function uploadRawViaCurl(localFile, remotePath) {
  const host = process.env.FTP_HOST;
  const user = process.env.FTP_USER;
  const pass = process.env.FTP_PASSWORD;
  const root = (process.env.FTP_REMOTE_DIR || "/").replace(/\/+$/, "");
  if (!host || !user || !pass) throw new Error("FTP env eksik.");
  const ftpUrl = `ftp://${host}${root}${remotePath}`;
  await exec("curl", [
    "--silent", "--show-error",
    "-u", `${user}:${pass}`,
    "--ftp-create-dirs",
    "-T", localFile,
    ftpUrl,
  ], { maxBuffer: 8 * 1024 * 1024 });
}

async function main() {
  const args = parseArgs(process.argv);
  const tmpl = args.template;
  if (!tmpl || !SELECTORS[tmpl]) {
    console.error(`Gecerli --template gerekli. Secenekler: ${Object.keys(SELECTORS).join(", ")}`);
    process.exit(1);
  }

  console.log(`▶ Reels pipeline: ${tmpl}${DRY ? " (DRY)" : ""}`);

  const bundle = await loadAll();
  console.log(`  veri: ${bundle.products.length} urun, ${bundle.catalogs.length} katalog`);

  const pick = SELECTORS[tmpl](bundle, {});
  if (!pick) {
    console.log(`  ${tmpl} icin uygun veri yok; atlandi.`);
    return;
  }
  const { template, data, caption } = pick;

  const workDir = path.join(process.cwd(), ".reels-out");
  await mkdir(workDir, { recursive: true });
  const stamp = tsStamp();
  const folderName = `${stamp}-${template}`;
  const pngPath = path.join(workDir, `${folderName}.png`);
  const mp4Path = path.join(workDir, `${folderName}.mp4`);
  const captionPath = path.join(workDir, `${folderName}.txt`);
  const metaPath = path.join(workDir, `${folderName}.json`);

  // Render
  const htmlPath = path.join(TEMPLATES_DIR, `${template}.html`);
  await renderPng(htmlPath, data, pngPath);
  console.log(`  ✓ PNG`);

  // Compose
  await composeMp4(pngPath, mp4Path, { durationSec: 7, fps: 30 });
  console.log(`  ✓ MP4`);

  const meta = {
    stamp, template,
    created_at: new Date().toISOString(),
    caption,
    data,
  };
  await writeFile(captionPath, caption || "", "utf8");
  await writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8");

  if (DRY) {
    console.log(`  [DRY] FTP atlandi. Ciktilar: ${workDir}`);
    return;
  }

  // FTP upload
  const remoteDir = `/sosyal-data/${folderName}`;
  await uploadRawViaCurl(pngPath, `${remoteDir}/cover.png`);
  await uploadRawViaCurl(mp4Path, `${remoteDir}/reel.mp4`);
  await uploadRawViaCurl(captionPath, `${remoteDir}/caption.txt`);
  await uploadRawViaCurl(metaPath, `${remoteDir}/meta.json`);
  console.log(`  ✓ FTP: ${SITE_URL}${remoteDir}/`);

  // index.json guncelle
  const idx = await fetchIndex();
  const entry = {
    stamp,
    template,
    created_at: meta.created_at,
    image: `/sosyal-data/${folderName}/cover.png`,
    video: `/sosyal-data/${folderName}/reel.mp4`,
    caption: caption || "",
  };
  // Ayni stamp varsa yer degistir
  const filtered = (idx.items || []).filter((i) => i.stamp !== stamp);
  const next = { items: [entry, ...filtered].slice(0, MAX_INDEX_ENTRIES) };
  const idxLocal = path.join(workDir, "index.json");
  await writeFile(idxLocal, JSON.stringify(next, null, 2), "utf8");
  await uploadRawViaCurl(idxLocal, `/sosyal-data/index.json`);
  console.log(`  ✓ index.json (${next.items.length} kayit)`);

  // social_posts kaydi (tekrar uretimi engellemek icin)
  const prodIds = extractProductIds(pick, bundle);
  for (const pid of prodIds) {
    await markPosted(pid, "instagram_reels", stamp);
  }
  if (prodIds.length) console.log(`  ✓ social_posts kaydi: ${prodIds.length}`);

  try { await rm(workDir, { recursive: true, force: true }); } catch {}
  console.log(`\nPanel: ${SITE_URL}/sosyal.php`);
}

function extractProductIds(pick, { products }) {
  const ids = new Set();
  const d = pick.data;
  const tryMatch = (name) => {
    if (!name) return;
    const n = String(name).toLocaleLowerCase("tr-TR");
    for (const p of products) {
      if (!p.name) continue;
      const pn = String(p.name).toLocaleLowerCase("tr-TR");
      if (pn.startsWith(n.slice(0, Math.min(20, n.length - 1)))) {
        if (p.id != null) ids.add(String(p.id));
        break;
      }
    }
  };
  if (pick.template === "haftanin-firsatlari") {
    (d.items || []).forEach((it) => tryMatch(it.name));
  } else {
    tryMatch(d.productName);
  }
  return [...ids].slice(0, 8);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
