import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnv } from "./lib/env.mjs";
import { marketAdapters } from "./lib/market-adapters.mjs";

const root = process.cwd();
loadEnv(root);

const config = await readJson("config/markets.config.json");
const outDir = path.join(root, "data", "imports", "auto");

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const enabledBrands = config.markets.filter((brand) => brand.enabled);
const summary = [];

for (const brand of enabledBrands) {
  const adapter = marketAdapters[brand.slug];
  if (!adapter) {
    summary.push({ slug: brand.slug, count: 0, note: "adapter-yok" });
    continue;
  }

  try {
    const categoryJobs = Array.isArray(brand.categories) && brand.categories.length
      ? brand.categories
      : [{ sourceUrl: brand.sourceUrl }];

    const batches = [];
    for (const category of categoryJobs) {
      const items = await adapter({ brand, category, root });
      batches.push(...items);
    }

    const items = dedupeItems(batches);
    await writeFile(path.join(outDir, `${brand.slug}.json`), JSON.stringify(items, null, 2), "utf8");
    summary.push({ slug: brand.slug, count: items.length, note: "ok" });
  } catch (error) {
    summary.push({
      slug: brand.slug,
      count: 0,
      note: error instanceof Error ? error.message : "bilinmeyen-hata",
    });
  }
}

await writeFile(path.join(outDir, "_summary.json"), JSON.stringify(summary, null, 2), "utf8");
console.table(summary);
console.log("Giyim marka senkronizasyonu tamamlandi. Sonraki adim: npm run import && npm run build");

async function readJson(filePath) {
  const content = await readFile(path.join(root, filePath), "utf8");
  return JSON.parse(content);
}

function dedupeItems(items) {
  const map = new Map();
  for (const item of items) {
    const key = `${item.brandSlug}:${item.productCode || item.sourceUrl || item.title}`;
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()];
}
