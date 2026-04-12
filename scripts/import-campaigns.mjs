import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const importsDir = path.join(root, "data", "imports");
const brands = await readJson("data/markets.json");
const allowedBrands = new Set(brands.map((brand) => brand.slug));
const files = await listJsonFiles(importsDir);
const importedMap = new Map();

for (const file of files) {
  const rows = await readJson(file);
  for (const row of rows) {
    const brandSlug = row.brandSlug ?? row.marketSlug;
    if (!allowedBrands.has(brandSlug)) continue;
    if (!row.title || typeof row.price !== "number") continue;

    const title = normalizeText(row.title);
    if (!title) continue;

    const department = normalizeDepartment(row.department, row.gender, row.category, title);
    const ageGroup = normalizeAgeGroup(row.ageGroup, department, row.gender);
    const mainCategory = normalizeMainCategory(row.mainCategory, row.category, title);
    const subCategory = normalizeSubCategory(row.subCategory, row.category, title);
    const productType = normalizeProductType(row.productType, row.category, title);
    const category = [department, mainCategory, subCategory].filter(Boolean).join(" > ");
    const price = Number(row.price) || 0;
    const previousPrice = normalizePreviousPrice(row.previousPrice, price);
    const discountRate = previousPrice > price ? Math.round(((previousPrice - price) / previousPrice) * 100) : 0;
    const materials = normalizeMaterials(row.materials, row.materialSummary);
    const materialSummary = buildMaterialSummary(materials);
    const comparisonKey = normalizeComparisonKey(
      row.comparisonKey || title,
      [department, mainCategory, subCategory, productType].filter(Boolean).join(" ")
    );

    const normalized = {
      id: buildId({ brandSlug, title, comparisonKey, productCode: row.productCode }),
      brandSlug,
      title,
      department,
      ageGroup,
      mainCategory,
      subCategory,
      productType,
      category,
      gender: normalizeText(row.gender || department || "Unisex"),
      fit: normalizeText(row.fit || "Belirtilmedi"),
      neck: normalizeText(row.neck || ""),
      sleeve: normalizeText(row.sleeve || ""),
      color: normalizeText(row.color || ""),
      productCode: normalizeText(row.productCode || ""),
      comparisonKey,
      image:
        row.image ||
        "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=900&q=80",
      price,
      previousPrice,
      discountRate,
      currency: "TRY",
      startDate: row.startDate || today(),
      endDate: row.endDate || today(),
      isFeatured: discountRate >= 15,
      sourceType: row.sourceType || "manual",
      sourceUrl: String(row.sourceUrl || "").trim(),
      campaignLabel: normalizeText(row.campaignLabel || (discountRate > 0 ? "Indirimli" : "Standart Fiyat")),
      campaignTags: normalizeTags(row.campaignTags),
      description: normalizeText(row.description || ""),
      materials,
      materialSummary,
      availability: normalizeText(row.availability || "unknown"),
      searchText: normalizeSearch(
        [
          title,
          department,
          ageGroup,
          mainCategory,
          subCategory,
          productType,
          row.gender,
          row.fit,
          row.color,
          materialSummary,
        ].join(" ")
      ),
    };

    const key = `${normalized.brandSlug}:${normalized.comparisonKey}:${slugify(normalized.title)}`;
    const existing = importedMap.get(key);
    if (!existing || sourcePriority(normalized.sourceType) >= sourcePriority(existing.sourceType)) {
      importedMap.set(key, normalized);
    }
  }
}

const products = [...importedMap.values()].sort((a, b) => {
  if (a.department !== b.department) return a.department.localeCompare(b.department, "tr");
  if (a.mainCategory !== b.mainCategory) return a.mainCategory.localeCompare(b.mainCategory, "tr");
  if (a.subCategory !== b.subCategory) return a.subCategory.localeCompare(b.subCategory, "tr");
  if (a.comparisonKey !== b.comparisonKey) return a.comparisonKey.localeCompare(b.comparisonKey, "tr");
  if (a.price !== b.price) return a.price - b.price;
  return a.brandSlug.localeCompare(b.brandSlug, "tr");
});

await writeFile(path.join(root, "data", "campaigns.json"), JSON.stringify(products, null, 2), "utf8");
console.log(`${products.length} urun normalize edilip data/campaigns.json dosyasina yazildi.`);

async function readJson(filePath) {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
  return JSON.parse(await readFile(fullPath, "utf8"));
}

async function listJsonFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listJsonFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".json") && !entry.name.startsWith("_")) {
      files.push(fullPath);
    }
  }

  return files;
}

function normalizeDepartment(rawDepartment, rawGender, rawCategory, rawTitle) {
  const base = normalizeSearch(rawDepartment || rawGender || rawCategory || rawTitle);
  if (/kadin|women|woman/i.test(base)) return "Kadin";
  if (/cocuk|kids|kiz|erkek cocuk|bebek/i.test(base)) return "Cocuk";
  if (/erkek|men|man/i.test(base)) return "Erkek";
  return "Unisex";
}

function normalizeAgeGroup(rawAgeGroup, department, rawGender) {
  const base = normalizeSearch(rawAgeGroup || rawGender || "");
  if (/bebek/i.test(base)) return "Bebek";
  if (/cocuk|kids|kiz|erkek cocuk/i.test(base) || department === "Cocuk") return "Cocuk";
  return "Yetiskin";
}

function normalizeMainCategory(rawMain, rawCategory, rawTitle) {
  const base = normalizeSearch(`${rawMain || ""} ${rawCategory || ""} ${rawTitle || ""}`);
  if (/\b(gomlek|tisort|t-shirt|sweet|sweat|sweatshirt|triko|kazak|bluz|atlet|polo)\b/i.test(base)) return "Ust Giyim";
  if (/\b(kase|mont|ceket|hirka|trenckot|kaban|dis giyim)\b/i.test(base)) return "Dis Giyim";
  if (/\b(pantolon|jean|esofman alti|sort|etek)\b/i.test(base)) return "Alt Giyim";
  return "Diger";
}

function normalizeSubCategory(rawSub, rawCategory, rawTitle) {
  const base = normalizeSearch(`${rawSub || ""} ${rawCategory || ""} ${rawTitle || ""}`);
  if (/\b(tisort|t-shirt)\b/i.test(base)) return "Tisort";
  if (/\bgomlek\b/i.test(base)) return "Gomlek";
  if (/\bpolo\b/i.test(base)) return "Polo";
  if (/\bgomlek\b/i.test(base)) return "Gomlek";
  if (/\b(sweet|sweatshirt)\b/i.test(base)) return "Sweat";
  if (/\bhirka\b/i.test(base)) return "Hirka";
  if (/\b(kase|kaban)\b/i.test(base)) return "Kase Kaban";
  if (/\bmont\b/i.test(base)) return "Mont";
  if (/\bceket\b/i.test(base)) return "Ceket";
  if (/\b(pantolon|jean)\b/i.test(base)) return "Pantolon";
  if (/\bsort\b/i.test(base)) return "Sort";
  if (/\betek\b/i.test(base)) return "Etek";
  if (/\b(kazak|triko)\b/i.test(base)) return "Triko";
  if (/\batlet\b/i.test(base)) return "Atlet";
  return normalizeText(rawSub || rawCategory || "Diger");
}

function normalizeProductType(rawType, rawCategory, rawTitle) {
  const base = normalizeSearch(`${rawType || ""} ${rawCategory || ""} ${rawTitle || ""}`);
  if (/basic/i.test(base)) return "Basic";
  if (/oversize/i.test(base)) return "Oversize";
  if (/regular fit/i.test(base)) return "Regular Fit";
  if (/slim fit|dar kesim/i.test(base)) return "Slim Fit";
  return normalizeText(rawType || "");
}

function normalizePreviousPrice(value, price) {
  const previousPrice = Number(value);
  if (Number.isFinite(previousPrice) && previousPrice >= price) return previousPrice;
  return price;
}

function normalizeMaterials(materials, summary) {
  if (Array.isArray(materials) && materials.length) {
    return materials
      .map((item) => ({ name: normalizeText(item?.name || ""), percent: Number(item?.percent) || 0 }))
      .filter((item) => item.name && item.percent > 0);
  }

  const text = normalizeText(summary || "");
  if (!text) return [];

  return text
    .split(/[,+/]/)
    .map((part) => part.trim())
    .map((part) => {
      const match = part.match(/(\d+)\s*%?\s*(.+)/);
      if (!match) return null;
      return { percent: Number(match[1]) || 0, name: normalizeText(match[2]) };
    })
    .filter(Boolean);
}

function buildMaterialSummary(materials) {
  if (!materials.length) return "Materyal bilgisi yok";
  return materials.map((item) => `%${item.percent} ${item.name}`).join(" / ");
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeText(item)).filter(Boolean);
}

function normalizeComparisonKey(value, categoryText = "") {
  const raw = normalizeSearch(value || "");
  const base = raw
    .toLocaleLowerCase("tr-TR")
    .replace(/%100/g, "")
    .replace(/\b(defacto|lc waikiki|lcw|koton|mavi|colin'?s|zara|h&m|hm|ltb|bershka)\b/g, "")
    .replace(/\b(erkek|kadin|cocuk|unisex)\b/g, "")
    .replace(/\b(regular fit|oversize|slim fit|dar kesim|standart regular|standart & regular|loose fit|boxy fit)\b/g, "")
    .replace(/\b(siyah|beyaz|gri|mavi|kahverengi|lacivert|ekru|bej|yesil)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return slugify(`${categoryText} ${base}`);
}

function buildId({ brandSlug, title, comparisonKey, productCode }) {
  const core = productCode ? slugify(productCode) : slugify(`${comparisonKey}-${title}`);
  return `${brandSlug}-${core}`;
}

function sourcePriority(sourceType) {
  switch (sourceType) {
    case "manual":
      return 4;
    case "auto-real":
      return 3;
    case "sample":
      return 2;
    case "auto-fallback":
      return 1;
    default:
      return 0;
  }
}

function normalizeText(value) {
  return repairText(String(value ?? "")).replace(/\s+/g, " ").trim();
}

function normalizeSearch(value) {
  return repairText(String(value ?? ""))
    .toLocaleLowerCase("tr-TR")
    .replace(/[ı]/g, "i")
    .replace(/[ğ]/g, "g")
    .replace(/[ü]/g, "u")
    .replace(/[ş]/g, "s")
    .replace(/[ö]/g, "o")
    .replace(/[ç]/g, "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function repairText(value) {
  return String(value ?? "")
    .replace(/Ã¼/g, "ü")
    .replace(/Ãœ/g, "Ü")
    .replace(/Ã¶/g, "ö")
    .replace(/Ã–/g, "Ö")
    .replace(/Ã§/g, "ç")
    .replace(/Ã‡/g, "Ç")
    .replace(/ÅŸ/g, "ş")
    .replace(/Åž/g, "Ş")
    .replace(/Ä±/g, "ı")
    .replace(/Ä°/g, "İ")
    .replace(/ÄŸ/g, "ğ")
    .replace(/Äž/g, "Ğ")
    .replace(/â€™/g, "'")
    .replace(/â€œ|â€/g, "\"")
    .replace(/â€“/g, "-")
    .replace(/Â/g, "");
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function slugify(value) {
  return String(value ?? "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
