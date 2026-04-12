import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadEnv } from "./lib/env.mjs";

const root = process.cwd();
loadEnv(root);

const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const anonKey = String(process.env.SUPABASE_ANON_KEY || "");
const productsTable = process.env.SUPABASE_PRODUCTS_TABLE || "products";
const brandsTable = process.env.SUPABASE_BRANDS_TABLE || "brands";
const comparisonTable = process.env.SUPABASE_COMPARISON_TABLE || "comparison_groups";

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL eksik.");
}

if (!serviceRoleKey) {
  const hasPublishableKey = Boolean(anonKey);
  throw new Error(
    hasPublishableKey
      ? "SUPABASE_SERVICE_ROLE_KEY eksik. Publishable key okuma icin uygundur ama bu script tabloya yazmak icin service role key ister."
      : "SUPABASE_SERVICE_ROLE_KEY eksik."
  );
}

const [brands, products] = await Promise.all([
  readJson("data/markets.json"),
  readJson("data/campaigns.json"),
]);

const comparisonGroups = buildComparisonGroups(products);

await upsertRows(brandsTable, brands.map(mapBrandRow), "slug");
await upsertRows(productsTable, products.map(mapProductRow), "id");
await upsertRows(comparisonTable, comparisonGroups, "id");

console.log(
  `Supabase senkronu tamamlandi. ${brands.length} marka, ${products.length} urun, ${comparisonGroups.length} karsilastirma grubu aktarildi.`
);

async function readJson(filePath) {
  const content = await readFile(path.join(root, filePath), "utf8");
  return JSON.parse(content);
}

function buildComparisonGroups(products) {
  const groups = new Map();

  for (const product of products) {
    const key = product.comparisonKey || product.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(product);
  }

  return [...groups.entries()].map(([comparisonKey, items]) => {
    const sorted = items.slice().sort((a, b) => a.price - b.price);
    return {
      id: comparisonKey,
      comparison_key: comparisonKey,
      title: items[0]?.title || comparisonKey,
      category: items[0]?.category || "Diger",
      gender: items[0]?.gender || "Unisex",
      product_count: items.length,
      lowest_price: sorted[0]?.price || 0,
      highest_price: sorted.at(-1)?.price || 0,
      best_price_brand_slug: sorted[0]?.brandSlug || null,
      material_summary: items[0]?.materialSummary || "Materyal bilgisi yok",
      items,
      updated_at: new Date().toISOString(),
    };
  });
}

function mapBrandRow(brand) {
  return {
    slug: brand.slug,
    name: brand.name,
    color: brand.color,
    logo_url: brand.logoUrl,
    website: brand.website,
    priority: brand.priority,
    branches: brand.branches,
    segment: brand.segment,
  };
}

function mapProductRow(product) {
  return {
    id: product.id,
    brand_slug: product.brandSlug,
    title: product.title,
    department: product.department,
    age_group: product.ageGroup,
    main_category: product.mainCategory,
    sub_category: product.subCategory,
    product_type: product.productType,
    category: product.category,
    gender: product.gender,
    fit: product.fit,
    neck: product.neck,
    sleeve: product.sleeve,
    color: product.color,
    product_code: product.productCode,
    comparison_key: product.comparisonKey,
    image: product.image,
    price: product.price,
    previous_price: product.previousPrice,
    discount_rate: product.discountRate,
    currency: product.currency,
    start_date: product.startDate,
    end_date: product.endDate,
    is_featured: product.isFeatured,
    source_type: product.sourceType,
    source_url: product.sourceUrl,
    campaign_label: product.campaignLabel,
    campaign_tags: product.campaignTags,
    description: product.description,
    materials: product.materials,
    material_summary: product.materialSummary,
    availability: product.availability,
    search_text: product.searchText,
  };
}

async function upsertRows(table, rows, conflictColumn) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?on_conflict=${conflictColumn}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${table} upsert basarisiz: ${response.status} ${detail}`);
  }
}
