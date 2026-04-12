import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnv } from "./lib/env.mjs";

const root = process.cwd();
loadEnv(root);
const distDir = path.join(root, "dist");
const siteUrl = (process.env.SITE_URL || "https://giyimkarsilastirma.com").replace(/\/$/, "");
const assetVersion = Date.now().toString();
const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const supabaseAnonKey = String(process.env.SUPABASE_ANON_KEY || "");
const productsTable = process.env.SUPABASE_PRODUCTS_TABLE || "products";
const brandsTable = process.env.SUPABASE_BRANDS_TABLE || "brands";
const comparisonTable = process.env.SUPABASE_COMPARISON_TABLE || "comparison_groups";

const [brands, products] = await Promise.all([
  readJson("data/markets.json"),
  readJson("data/campaigns.json"),
]);

const brandMap = new Map(brands.map((brand) => [brand.slug, brand]));
const validProducts = products
  .filter((item) => brandMap.has(item.brandSlug))
  .map((item) => ({ ...item, brand: brandMap.get(item.brandSlug) }))
  .sort((a, b) => a.price - b.price);

const comparisonGroups = buildComparisonGroups(validProducts);
const featured = validProducts
  .slice()
  .sort((a, b) => {
    if (b.discountRate !== a.discountRate) return b.discountRate - a.discountRate;
    return a.price - b.price;
  })
  .slice(0, 8);

const departmentOptions = uniqueOptions(validProducts.map((item) => item.department));
const mainCategoryOptions = uniqueOptions(validProducts.map((item) => item.mainCategory));
const subCategoryOptions = uniqueOptions(validProducts.map((item) => item.subCategory));

await rm(distDir, { recursive: true, force: true });
await mkdir(path.join(distDir, "brand"), { recursive: true });
await mkdir(path.join(distDir, "assets"), { recursive: true });

await Promise.all([
  writeFile(path.join(distDir, "styles.css"), buildStyles(), "utf8"),
  writeFile(path.join(distDir, "app.js"), buildLiveClientScript({ supabaseUrl, supabaseAnonKey, productsTable, brandsTable, comparisonTable }), "utf8"),
  writeFile(path.join(distDir, "index.html"), renderHome({ brands, validProducts, comparisonGroups, featured, departmentOptions, mainCategoryOptions, subCategoryOptions }), "utf8"),
  writeFile(path.join(distDir, "admin.html"), renderAdmin({ brands, validProducts, comparisonGroups }), "utf8"),
  writeFile(path.join(distDir, "featured.json"), JSON.stringify(featured, null, 2), "utf8"),
  writeFile(path.join(distDir, "robots.txt"), buildRobots(), "utf8"),
  writeFile(path.join(distDir, "sitemap.xml"), buildSitemap(brands), "utf8"),
]);

for (const brand of brands) {
  const items = validProducts.filter((item) => item.brandSlug === brand.slug);
  const brandDir = path.join(distDir, "brand", brand.slug);
  await mkdir(brandDir, { recursive: true });
  await writeFile(path.join(brandDir, "index.html"), renderBrandPage({ brand, items }), "utf8");
}

console.log(`Build tamamlandi. ${validProducts.length} giyim urunu ve ${comparisonGroups.length} karsilastirma grubu uretildi.`);

async function readJson(filePath) {
  return JSON.parse(await readFile(path.join(root, filePath), "utf8"));
}

function renderHome({ brands, validProducts, comparisonGroups, featured, departmentOptions, mainCategoryOptions, subCategoryOptions }) {
  return layout(
    "Giyim Karsilastirma",
    "Erkek, kadin ve cocuk kategorilerinde ust giyim, alt giyim ve dis giyim urunlerini karsilastirin.",
    `<main class="page">
      <header class="topbar">
        <a class="logo" href="/">
          <span class="logo-mark">FF</span>
          <span><strong>FinderFit</strong><small>Canli katalog ve fiyat izi</small></span>
        </a>
        <nav class="nav">
          <a href="#karsilastirmalar">Karsilastirmalar</a>
          <a href="#urunler">Katalog</a>
          <a href="#markalar">Markalar</a>
          <a href="/admin.html">Veri merkezi</a>
        </nav>
      </header>

      <section class="hero">
        <div class="hero-copy-block">
          <p class="eyebrow">Turkiye giyim radari</p>
          <h1>Ayni urunun farkli markalardaki fiyat, materyal ve kampanya farkini tek bakista gor.</h1>
          <p class="hero-copy">FinderFit, giyim kataloglarini tek bir editoryal arayuzde toplar. Erkek, kadin ve cocuk kategorilerinde ust, alt ve dis giyimi canli olarak izler; materyal icerigi, fiyat ve kampanya bilgisini birlikte sunar.</p>
          <div class="search-shell">
            <div>
              <span class="search-label">Hizli arama</span>
              <strong>Tisort, gomlek, sweat, pantolon, hirka, kase kaban</strong>
            </div>
            <a class="button primary" href="#urunler">Katalogu kesfet</a>
          </div>
          <div class="hero-tags">
            ${departmentOptions.map((value) => `<span class="hero-tag">${escapeHtml(value)}</span>`).join("")}
            ${mainCategoryOptions.slice(0, 3).map((value) => `<span class="hero-tag muted">${escapeHtml(value)}</span>`).join("")}
          </div>
          <div class="hero-actions">
            <a class="button primary" href="#urunler">Canli katalog</a>
            <a class="button" href="#karsilastirmalar">En iyi fiyatlari incele</a>
          </div>
        </div>
        <div class="hero-panel">
          <div class="metric-grid editorial-metrics">
            <article class="metric"><span>Marka havuzu</span><strong id="metric-brand-count">${brands.length}</strong><small>Turkiye odakli zincirler</small></article>
            <article class="metric"><span>Canli urun</span><strong id="metric-product-count">${validProducts.length}</strong><small>Supabase ile guncel</small></article>
            <article class="metric"><span>Eslesme grubu</span><strong id="metric-group-count">${comparisonGroups.length}</strong><small>Benzer urun kiyasi</small></article>
          </div>
          <div class="hero-note"><strong>Kapsam</strong><p>${departmentOptions.join(", ")} · ${mainCategoryOptions.join(", ")}</p></div>
          <div class="hero-note soft"><strong>Su an odakta</strong><p>${subCategoryOptions.slice(0, 6).join(" · ")}</p></div>
        </div>
      </section>

      <section class="category-ribbon" id="category-ribbon">
        ${subCategoryOptions.map((value) => `<span class="category-pill">${escapeHtml(value)}</span>`).join("")}
      </section>

      <section class="overview-grid" id="overview-grid">
        ${buildCategoryOverview(validProducts)}
      </section>

      <section class="filters">
        <label><span>Urun ara</span><input id="search" type="search" placeholder="gomlek, tisort, pantolon, hirka"></label>
        <label><span>Departman</span><select id="department-filter"><option value="">Tum departmanlar</option>${departmentOptions.map((value) => `<option value="${escapeHtml(slugify(value))}">${escapeHtml(value)}</option>`).join("")}</select></label>
        <label><span>Ana kategori</span><select id="main-category-filter"><option value="">Tum ana kategoriler</option>${mainCategoryOptions.map((value) => `<option value="${escapeHtml(slugify(value))}">${escapeHtml(value)}</option>`).join("")}</select></label>
        <label><span>Alt kategori</span><select id="sub-category-filter"><option value="">Tum alt kategoriler</option>${subCategoryOptions.map((value) => `<option value="${escapeHtml(slugify(value))}">${escapeHtml(value)}</option>`).join("")}</select></label>
        <label><span>Marka</span><select id="brand-filter"><option value="">Tum markalar</option>${brands.map((brand) => `<option value="${escapeHtml(brand.slug)}">${escapeHtml(brand.name)}</option>`).join("")}</select></label>
      </section>

      <section class="section" id="karsilastirmalar">
        <div class="section-head"><div><p class="eyebrow">Karsilastirma gruplari</p><h2>Kategoriye gore benzer urunler</h2></div><small><span id="comparison-group-count">${comparisonGroups.length}</span> grup</small></div>
        <div class="comparison-grid" id="comparison-grid">${comparisonGroups.map(renderComparisonCardPremium).join("")}</div>
      </section>

      <section class="section">
        <div class="section-head"><div><p class="eyebrow">One cikanlar</p><h2>Fiyat veya indirim dikkat ceken urunler</h2></div></div>
        <div class="product-grid product-grid-featured" id="featured-grid">${featured.map(renderProductCardPremium).join("")}</div>
      </section>

      <section class="section" id="urunler">
        <div class="section-head"><div><p class="eyebrow">Tum urunler</p><h2>Kategori bazli katalog akisi</h2></div><small><strong id="result-count">${validProducts.length}</strong> kayit</small></div>
        <div class="product-grid" id="product-grid">${validProducts.map(renderProductCardPremium).join("")}</div>
        <div class="empty hidden" id="empty-state">Filtrelere uygun urun bulunamadi.</div>
      </section>

      <section class="section" id="markalar">
        <div class="section-head"><div><p class="eyebrow">Takip edilen markalar</p><h2>Kaynak havuzu</h2></div></div>
        <div class="brand-grid" id="brand-grid">${brands.map(renderBrandCard).join("")}</div>
      </section>
    </main>`,
    { page: "home" }
  );
}

function renderAdmin({ brands, validProducts, comparisonGroups }) {
  const brandRows = brands.map((brand) => {
    const items = validProducts.filter((item) => item.brandSlug === brand.slug);
    return `<tr><td>${escapeHtml(brand.name)}</td><td>${items.length}</td><td>${escapeHtml(uniqueOptions(items.map((item) => item.department)).join(", ") || "-")}</td><td>${comparisonGroups.filter((group) => group.bestPrice?.brandSlug === brand.slug).length}</td></tr>`;
  }).join("");

  return layout(
    "Yonetim",
    "Giyim veri hatti ve kategori yapisi.",
    `<main class="page">
      <section class="hero admin-hero">
        <div><p class="eyebrow">Yonetim paneli</p><h1>Katalog artik departman ve kategori bazli calisiyor.</h1><p class="hero-copy">Veri modeli artik Erkek, Kadin, Cocuk ile ust giyim, alt giyim ve dis giyim ayrimini destekliyor.</p></div>
        <div class="hero-panel"><div class="metric-grid"><article class="metric"><span>Marka</span><strong id="metric-brand-count">${brands.length}</strong></article><article class="metric"><span>Urun</span><strong id="metric-product-count">${validProducts.length}</strong></article><article class="metric"><span>Grup</span><strong id="metric-group-count">${comparisonGroups.length}</strong></article></div></div>
      </section>
      <section class="section"><div class="table-wrap"><table><thead><tr><th>Marka</th><th>Urun</th><th>Departman</th><th>En iyi fiyat grubu</th></tr></thead><tbody id="admin-brand-rows">${brandRows}</tbody></table></div></section>
    </main>`,
    { page: "admin" }
  );
}

function renderBrandPage({ brand, items }) {
  return layout(
    `${brand.name} urunleri`,
    `${brand.name} icin departman ve kategori bazli urun listesi.`,
    `<main class="page">
      <section class="hero brand-hero">
        <div><p class="eyebrow">${escapeHtml(brand.segment || "Marka")}</p><h1>${escapeHtml(brand.name)} urun akisiniz</h1><p class="hero-copy">Bu marka icin kategori bazli urun ve fiyat akisi burada listeleniyor.</p><div class="hero-actions"><a class="button primary" href="/">Ana sayfaya don</a><a class="button" href="${escapeHtml(brand.website)}">Resmi site</a></div></div>
        <div class="hero-panel"><div class="metric-grid"><article class="metric"><span>Urun</span><strong id="brand-product-count">${items.length}</strong></article><article class="metric"><span>Departman</span><strong class="metric-small" id="brand-departments">${escapeHtml(uniqueOptions(items.map((item) => item.department)).join(", ") || "-")}</strong></article><article class="metric"><span>Ana kategori</span><strong class="metric-small" id="brand-main-categories">${escapeHtml(uniqueOptions(items.map((item) => item.mainCategory)).join(", ") || "-")}</strong></article></div></div>
      </section>
      <section class="section"><div class="product-grid" id="brand-product-grid">${items.map(renderProductCardPremium).join("") || `<div class="empty">Bu marka icin henuz urun yok.</div>`}</div></section>
    </main>`,
    { page: "brand", brandSlug: brand.slug }
  );
}

function renderBrandCard(brand) {
  return `<a class="brand-card" href="/brand/${brand.slug}/" style="--brand:${escapeHtml(brand.color)}"><span class="brand-dot"></span><strong>${escapeHtml(brand.name)}</strong><small>${escapeHtml(brand.segment || "")}</small></a>`;
}

function renderComparisonCardPremium(group) {
  return `<article class="comparison-card"><div class="section-head tight"><div><p class="eyebrow">${escapeHtml(group.department)}</p><h3>${escapeHtml(group.label)}</h3></div><small>${group.items.length} marka</small></div><p class="compare-meta">${escapeHtml(group.mainCategory)} · ${escapeHtml(group.subCategory)} · En dusuk fiyat: <strong>${formatPrice(group.bestPrice?.price || 0)}</strong></p><div class="compare-list">${group.items.map((item, index) => `<div class="compare-row ${index === 0 ? "winner" : ""}"><strong>${escapeHtml(item.brand.name)}</strong><span>${formatPrice(item.price)}</span><small>${escapeHtml(item.materialSummary)}</small></div>`).join("")}</div></article>`;
}

function renderProductCardPremium(item) {
  return `<article class="product-card" data-search="${escapeHtml(item.searchText)}" data-brand="${escapeHtml(item.brandSlug)}" data-department="${escapeHtml(slugify(item.department))}" data-main-category="${escapeHtml(slugify(item.mainCategory))}" data-sub-category="${escapeHtml(slugify(item.subCategory))}"><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}"><div class="product-body"><div class="badge-row"><span class="badge" style="background:${escapeHtml(item.brand.color)}14;color:${escapeHtml(item.brand.color)}">${escapeHtml(item.brand.name)}</span><span class="badge">${escapeHtml(item.department)}</span><span class="badge">${escapeHtml(item.mainCategory)}</span>${item.discountRate > 0 ? `<span class="badge accent">%${item.discountRate} indirim</span>` : ""}</div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.subCategory)} · ${escapeHtml(item.productType || item.fit)} · ${escapeHtml(item.gender)}</p><div class="price-row"><strong>${formatPrice(item.price)}</strong>${item.previousPrice > item.price ? `<s>${formatPrice(item.previousPrice)}</s>` : ""}</div><div class="meta-stack"><small><strong>Taksonomi:</strong> ${escapeHtml(item.category)}</small><small><strong>Materyal:</strong> ${escapeHtml(item.materialSummary)}</small><small><strong>Urun kodu:</strong> ${escapeHtml(item.productCode || "-")}</small></div>${item.sourceUrl ? `<a class="source-link" href="${escapeHtml(item.sourceUrl)}">Kaynak urune git</a>` : ""}</div></article>`;
}

function renderComparisonCard(group) {
  return `<article class="comparison-card"><div class="compare-card-top"><div><p class="eyebrow">${escapeHtml(group.department)}</p><h3>${escapeHtml(group.label)}</h3></div><span class="compare-chip">${group.items.length} marka</span></div><p class="compare-meta">${escapeHtml(group.mainCategory)} · ${escapeHtml(group.subCategory)} · En dusuk fiyat: <strong>${formatPrice(group.bestPrice?.price || 0)}</strong></p><div class="compare-list">${group.items.map((item, index) => `<div class="compare-row ${index === 0 ? "winner" : ""}"><div class="compare-row-main"><span class="compare-rank">${index + 1}</span><div><strong>${escapeHtml(item.brand.name)}</strong><small>${escapeHtml(item.materialSummary)}</small></div></div><div class="compare-row-side"><span>${formatPrice(item.price)}</span><small>${escapeHtml(item.productType || item.fit || item.subCategory)}</small></div></div>`).join("")}</div></article>`;
}

function renderProductCard(item) {
  return `<article class="product-card" data-search="${escapeHtml(item.searchText)}" data-brand="${escapeHtml(item.brandSlug)}" data-department="${escapeHtml(slugify(item.department))}" data-main-category="${escapeHtml(slugify(item.mainCategory))}" data-sub-category="${escapeHtml(slugify(item.subCategory))}"><div class="product-media"><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}"><div class="product-overlay"><span class="overlay-brand" style="background:${escapeHtml(item.brand.color)}">${escapeHtml(item.brand.name)}</span>${item.discountRate > 0 ? `<span class="overlay-sale">%${item.discountRate}</span>` : ""}</div></div><div class="product-body"><div class="badge-row"><span class="badge">${escapeHtml(item.department)}</span><span class="badge">${escapeHtml(item.mainCategory)}</span><span class="badge">${escapeHtml(item.subCategory)}</span></div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.productType || item.fit || item.subCategory)} · ${escapeHtml(item.gender || "Genel koleksiyon")}</p><div class="price-row"><strong>${formatPrice(item.price)}</strong>${item.previousPrice > item.price ? `<s>${formatPrice(item.previousPrice)}</s>` : ""}</div><div class="material-panel"><span>Materyal</span><strong>${escapeHtml(item.materialSummary)}</strong></div><div class="meta-stack"><small><strong>Taksonomi:</strong> ${escapeHtml(item.category)}</small><small><strong>Urun kodu:</strong> ${escapeHtml(item.productCode || "-")}</small></div><div class="card-footer"><span class="product-signature">${escapeHtml(item.brand.name)} secimi</span>${item.sourceUrl ? `<a class="source-link" href="${escapeHtml(item.sourceUrl)}">Urunu ac</a>` : ""}</div></div></article>`;
}

function buildComparisonGroups(items) {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.comparisonKey)) groups.set(item.comparisonKey, []);
    groups.get(item.comparisonKey).push(item);
  }
  return [...groups.entries()].map(([comparisonKey, groupItems]) => {
    const sorted = groupItems.slice().sort((a, b) => a.price - b.price);
    return {
      comparisonKey,
      label: makeReadableLabel(comparisonKey),
      department: groupItems[0]?.department || "Diger",
      mainCategory: groupItems[0]?.mainCategory || "Diger",
      subCategory: groupItems[0]?.subCategory || "Diger",
      items: sorted,
      bestPrice: sorted[0] || null,
    };
  }).sort((a, b) => (a.bestPrice?.price || 0) - (b.bestPrice?.price || 0));
}

function buildCategoryOverview(items) {
  const departments = new Map();
  for (const item of items) {
    if (!departments.has(item.department)) departments.set(item.department, new Map());
    const mainMap = departments.get(item.department);
    if (!mainMap.has(item.mainCategory)) mainMap.set(item.mainCategory, 0);
    mainMap.set(item.mainCategory, mainMap.get(item.mainCategory) + 1);
  }
  return [...departments.entries()].map(([department, mainMap]) => `<article class="overview-card"><p class="eyebrow">${escapeHtml(department)}</p><h3>${escapeHtml(department)} katalogu</h3><div class="overview-list">${[...mainMap.entries()].map(([mainCategory, count]) => `<div class="overview-row"><strong>${escapeHtml(mainCategory)}</strong><span>${count} urun</span></div>`).join("")}</div></article>`).join("");
}

function makeReadableLabel(value) {
  return String(value).split("-").filter(Boolean).map((part) => part.charAt(0).toLocaleUpperCase("tr-TR") + part.slice(1)).join(" ");
}

function layout(title, description, content, options = {}) {
  const appConfig = {
    page: options.page || "home",
    brandSlug: options.brandSlug || "",
    supabaseUrl,
    supabaseAnonKey,
    productsTable,
    brandsTable,
    comparisonTable,
  };

  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Instrument+Sans:wght@400;500;600;700&family=Instrument+Serif&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css?v=${assetVersion}">
</head>
<body data-page="${escapeHtml(appConfig.page)}" data-brand-slug="${escapeHtml(appConfig.brandSlug)}">
  ${content}
  <script>window.__APP_CONFIG__=${serializeForScript(appConfig)};</script>
  <script src="/app.js?v=${assetVersion}"></script>
</body>
</html>`;
}

function buildClientScript() {
  return `(() => {
  const searchInput = document.getElementById('search');
  const brandFilter = document.getElementById('brand-filter');
  const departmentFilter = document.getElementById('department-filter');
  const mainCategoryFilter = document.getElementById('main-category-filter');
  const subCategoryFilter = document.getElementById('sub-category-filter');
  const cards = [...document.querySelectorAll('#product-grid .product-card')];
  const resultCount = document.getElementById('result-count');
  const emptyState = document.getElementById('empty-state');
  if (!cards.length || !searchInput || !brandFilter || !departmentFilter || !mainCategoryFilter || !subCategoryFilter || !resultCount || !emptyState) return;
  const normalize = (value) => String(value || '').toLowerCase().replace(/[ı]/g, 'i').replace(/[ğ]/g, 'g').replace(/[ü]/g, 'u').replace(/[ş]/g, 's').replace(/[ö]/g, 'o').replace(/[ç]/g, 'c').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/\\s+/g, ' ').trim();
  const applyFilters = () => {
    const search = normalize(searchInput.value);
    const brand = brandFilter.value;
    const department = departmentFilter.value;
    const mainCategory = mainCategoryFilter.value;
    const subCategory = subCategoryFilter.value;
    let visible = 0;
    for (const card of cards) {
      const show = (!search || (card.dataset.search || '').includes(search))
        && (!brand || card.dataset.brand === brand)
        && (!department || card.dataset.department === department)
        && (!mainCategory || card.dataset.mainCategory === mainCategory)
        && (!subCategory || card.dataset.subCategory === subCategory);
      card.hidden = !show;
      if (show) visible += 1;
    }
    resultCount.textContent = String(visible);
    emptyState.classList.toggle('hidden', visible !== 0);
  };
  searchInput.addEventListener('input', applyFilters);
  brandFilter.addEventListener('change', applyFilters);
  departmentFilter.addEventListener('change', applyFilters);
  mainCategoryFilter.addEventListener('change', applyFilters);
  subCategoryFilter.addEventListener('change', applyFilters);
})();`;
}

function buildLiveClientScript({ supabaseUrl, supabaseAnonKey, productsTable, brandsTable, comparisonTable }) {
  const clientConfig = JSON.stringify({ supabaseUrl, supabaseAnonKey, productsTable, brandsTable, comparisonTable }).replace(/</g, "\\u003c");
  return `(() => {
  const config = Object.assign(${clientConfig}, window.__APP_CONFIG__ || {});
  const page = document.body.dataset.page || config.page || 'home';
  const currentBrandSlug = document.body.dataset.brandSlug || config.brandSlug || '';
  const normalize = (value) => String(value || '').toLocaleLowerCase('tr-TR').replace(/[Ä±ı]/g, 'i').replace(/[ÄŸğ]/g, 'g').replace(/[Ã¼ü]/g, 'u').replace(/[ÅŸş]/g, 's').replace(/[Ã¶ö]/g, 'o').replace(/[Ã§ç]/g, 'c').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/\\s+/g, ' ').trim();
  const slugify = (value) => normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const escapeHtml = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const formatPrice = (value) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 }).format(Number(value) || 0);
  const uniqueOptions = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
  const makeReadableLabel = (value) => String(value || '').split('-').filter(Boolean).map((part) => part.charAt(0).toLocaleUpperCase('tr-TR') + part.slice(1)).join(' ');

  const mapBrand = (row) => ({ slug: row.slug, name: row.name, color: row.color || '#111827', website: row.website || '#', segment: row.segment || '' });
  const mapProduct = (row, brandMap) => {
    const brandSlug = row.brandSlug || row.brand_slug || '';
    return {
      id: row.id,
      brandSlug,
      title: row.title || '',
      department: row.department || '',
      mainCategory: row.mainCategory || row.main_category || '',
      subCategory: row.subCategory || row.sub_category || '',
      productType: row.productType || row.product_type || '',
      category: row.category || '',
      gender: row.gender || '',
      fit: row.fit || '',
      color: row.color || '',
      productCode: row.productCode || row.product_code || '',
      comparisonKey: row.comparisonKey || row.comparison_key || row.id,
      image: row.image || '',
      price: Number(row.price) || 0,
      previousPrice: Number(row.previousPrice || row.previous_price) || Number(row.price) || 0,
      discountRate: Number(row.discountRate || row.discount_rate) || 0,
      sourceUrl: row.sourceUrl || row.source_url || '',
      materialSummary: row.materialSummary || row.material_summary || 'Materyal bilgisi yok',
      searchText: normalize(row.searchText || row.search_text || [row.title, row.department, row.mainCategory, row.subCategory, row.productType, row.color].join(' ')),
      brand: brandMap.get(brandSlug) || { slug: brandSlug, name: brandSlug || 'Marka', color: '#111827', website: '#', segment: '' },
    };
  };

  const renderBrandCard = (brand) => \`<a class="brand-card" href="/brand/\${brand.slug}/" style="--brand:\${escapeHtml(brand.color)}"><span class="brand-dot"></span><strong>\${escapeHtml(brand.name)}</strong><small>\${escapeHtml(brand.segment || '')}</small></a>\`;
  const renderProductCard = (item) => \`<article class="product-card" data-search="\${escapeHtml(item.searchText)}" data-brand="\${escapeHtml(item.brandSlug)}" data-department="\${escapeHtml(slugify(item.department))}" data-main-category="\${escapeHtml(slugify(item.mainCategory))}" data-sub-category="\${escapeHtml(slugify(item.subCategory))}"><img src="\${escapeHtml(item.image)}" alt="\${escapeHtml(item.title)}"><div class="product-body"><div class="badge-row"><span class="badge" style="background:\${escapeHtml(item.brand.color)}14;color:\${escapeHtml(item.brand.color)}">\${escapeHtml(item.brand.name)}</span><span class="badge">\${escapeHtml(item.department)}</span><span class="badge">\${escapeHtml(item.mainCategory)}</span>\${item.discountRate > 0 ? \`<span class="badge accent">%\${item.discountRate} indirim</span>\` : ''}</div><h3>\${escapeHtml(item.title)}</h3><p>\${escapeHtml(item.subCategory)} · \${escapeHtml(item.productType || item.fit)} · \${escapeHtml(item.gender)}</p><div class="price-row"><strong>\${formatPrice(item.price)}</strong>\${item.previousPrice > item.price ? \`<s>\${formatPrice(item.previousPrice)}</s>\` : ''}</div><div class="meta-stack"><small><strong>Taksonomi:</strong> \${escapeHtml(item.category)}</small><small><strong>Materyal:</strong> \${escapeHtml(item.materialSummary)}</small><small><strong>Urun kodu:</strong> \${escapeHtml(item.productCode || '-')}</small></div>\${item.sourceUrl ? \`<a class="source-link" href="\${escapeHtml(item.sourceUrl)}">Kaynak urune git</a>\` : ''}</div></article>\`;
  const renderComparisonCard = (group) => \`<article class="comparison-card"><div class="section-head tight"><div><p class="eyebrow">\${escapeHtml(group.department)}</p><h3>\${escapeHtml(group.label)}</h3></div><small>\${group.items.length} marka</small></div><p class="compare-meta">\${escapeHtml(group.mainCategory)} · \${escapeHtml(group.subCategory)} · En dusuk fiyat: <strong>\${formatPrice(group.bestPrice?.price || 0)}</strong></p><div class="compare-list">\${group.items.map((item, index) => \`<div class="compare-row \${index === 0 ? 'winner' : ''}"><strong>\${escapeHtml(item.brand.name)}</strong><span>\${formatPrice(item.price)}</span><small>\${escapeHtml(item.materialSummary)}</small></div>\`).join('')}</div></article>\`;

  const renderProductCardEditorial = (item) => \`<article class="product-card" data-search="\${escapeHtml(item.searchText)}" data-brand="\${escapeHtml(item.brandSlug)}" data-department="\${escapeHtml(slugify(item.department))}" data-main-category="\${escapeHtml(slugify(item.mainCategory))}" data-sub-category="\${escapeHtml(slugify(item.subCategory))}"><div class="product-media"><img src="\${escapeHtml(item.image)}" alt="\${escapeHtml(item.title)}"><div class="product-overlay"><span class="overlay-brand" style="background:\${escapeHtml(item.brand.color)}">\${escapeHtml(item.brand.name)}</span>\${item.discountRate > 0 ? \`<span class="overlay-sale">%\${item.discountRate}</span>\` : ''}</div></div><div class="product-body"><div class="badge-row"><span class="badge">\${escapeHtml(item.department)}</span><span class="badge">\${escapeHtml(item.mainCategory)}</span><span class="badge">\${escapeHtml(item.subCategory)}</span></div><h3>\${escapeHtml(item.title)}</h3><p>\${escapeHtml(item.productType || item.fit || item.subCategory)} · \${escapeHtml(item.gender || 'Genel koleksiyon')}</p><div class="price-row"><strong>\${formatPrice(item.price)}</strong>\${item.previousPrice > item.price ? \`<s>\${formatPrice(item.previousPrice)}</s>\` : ''}</div><div class="material-panel"><span>Materyal</span><strong>\${escapeHtml(item.materialSummary)}</strong></div><div class="meta-stack"><small><strong>Taksonomi:</strong> \${escapeHtml(item.category)}</small><small><strong>Urun kodu:</strong> \${escapeHtml(item.productCode || '-')}</small></div><div class="card-footer"><span class="product-signature">\${escapeHtml(item.brand.name)} secimi</span>\${item.sourceUrl ? \`<a class="source-link" href="\${escapeHtml(item.sourceUrl)}">Urunu ac</a>\` : ''}</div></div></article>\`;
  const renderComparisonCardEditorial = (group) => \`<article class="comparison-card"><div class="compare-card-top"><div><p class="eyebrow">\${escapeHtml(group.department)}</p><h3>\${escapeHtml(group.label)}</h3></div><span class="compare-chip">\${group.items.length} marka</span></div><p class="compare-meta">\${escapeHtml(group.mainCategory)} · \${escapeHtml(group.subCategory)} · En dusuk fiyat: <strong>\${formatPrice(group.bestPrice?.price || 0)}</strong></p><div class="compare-list">\${group.items.map((item, index) => \`<div class="compare-row \${index === 0 ? 'winner' : ''}"><div class="compare-row-main"><span class="compare-rank">\${index + 1}</span><div><strong>\${escapeHtml(item.brand.name)}</strong><small>\${escapeHtml(item.materialSummary)}</small></div></div><div class="compare-row-side"><span>\${formatPrice(item.price)}</span><small>\${escapeHtml(item.productType || item.fit || item.subCategory)}</small></div></div>\`).join('')}</div></article>\`;

  const buildCategoryOverview = (items) => {
    const departments = new Map();
    for (const item of items) {
      if (!departments.has(item.department)) departments.set(item.department, new Map());
      const mainMap = departments.get(item.department);
      if (!mainMap.has(item.mainCategory)) mainMap.set(item.mainCategory, 0);
      mainMap.set(item.mainCategory, mainMap.get(item.mainCategory) + 1);
    }
    return [...departments.entries()].map(([department, mainMap]) => \`<article class="overview-card"><p class="eyebrow">\${escapeHtml(department)}</p><h3>\${escapeHtml(department)} katalogu</h3><div class="overview-list">\${[...mainMap.entries()].map(([mainCategory, count]) => \`<div class="overview-row"><strong>\${escapeHtml(mainCategory)}</strong><span>\${count} urun</span></div>\`).join('')}</div></article>\`).join('');
  };

  const fillSelect = (element, values, placeholder) => {
    if (!element) return;
    const current = element.value;
    element.innerHTML = \`<option value="">\${placeholder}</option>\${values.map((value) => \`<option value="\${escapeHtml(slugify(value))}">\${escapeHtml(value)}</option>\`).join('')}\`;
    if ([...element.options].some((option) => option.value === current)) element.value = current;
  };

  async function fetchRows(table, query) {
    const response = await fetch(\`\${config.supabaseUrl}/rest/v1/\${table}?\${query}\`, {
      headers: { apikey: config.supabaseAnonKey, Authorization: \`Bearer \${config.supabaseAnonKey}\` },
    });
    if (!response.ok) throw new Error(\`\${table} \${response.status}\`);
    return response.json();
  }

  async function fetchCatalog() {
    const [brandRows, productRows, comparisonRows] = await Promise.all([
      fetchRows(config.brandsTable, 'select=slug,name,color,website,segment,priority,branches'),
      fetchRows(config.productsTable, 'select=*&order=price.asc&limit=1000'),
      fetchRows(config.comparisonTable, 'select=*&order=lowest_price.asc&limit=1000'),
    ]);
    const brands = brandRows.map(mapBrand);
    const brandMap = new Map(brands.map((brand) => [brand.slug, brand]));
    const products = productRows.map((row) => mapProduct(row, brandMap)).sort((a, b) => a.price - b.price);
    const comparisonGroups = comparisonRows.map((row) => {
      const items = Array.isArray(row.items) ? row.items.map((item) => mapProduct(item, brandMap)).sort((a, b) => a.price - b.price) : [];
      return { comparisonKey: row.comparison_key || row.id, label: makeReadableLabel(row.comparison_key || row.id), department: items[0]?.department || 'Diger', mainCategory: items[0]?.mainCategory || 'Diger', subCategory: items[0]?.subCategory || 'Diger', items, bestPrice: items[0] || null };
    });
    return { brands, products, comparisonGroups };
  }

  function attachFilters() {
    const searchInput = document.getElementById('search');
    const brandFilter = document.getElementById('brand-filter');
    const departmentFilter = document.getElementById('department-filter');
    const mainCategoryFilter = document.getElementById('main-category-filter');
    const subCategoryFilter = document.getElementById('sub-category-filter');
    const resultCount = document.getElementById('result-count');
    const emptyState = document.getElementById('empty-state');
    if (!searchInput || !brandFilter || !departmentFilter || !mainCategoryFilter || !subCategoryFilter || !resultCount || !emptyState) return;
    const applyFilters = () => {
      const cards = [...document.querySelectorAll('#product-grid .product-card')];
      const search = normalize(searchInput.value);
      const brand = brandFilter.value;
      const department = departmentFilter.value;
      const mainCategory = mainCategoryFilter.value;
      const subCategory = subCategoryFilter.value;
      let visible = 0;
      for (const card of cards) {
        const show = (!search || (card.dataset.search || '').includes(search))
          && (!brand || card.dataset.brand === brand)
          && (!department || card.dataset.department === department)
          && (!mainCategory || card.dataset.mainCategory === mainCategory)
          && (!subCategory || card.dataset.subCategory === subCategory);
        card.hidden = !show;
        if (show) visible += 1;
      }
      resultCount.textContent = String(visible);
      emptyState.classList.toggle('hidden', visible !== 0);
    };
    searchInput.oninput = applyFilters;
    brandFilter.onchange = applyFilters;
    departmentFilter.onchange = applyFilters;
    mainCategoryFilter.onchange = applyFilters;
    subCategoryFilter.onchange = applyFilters;
    applyFilters();
  }

  function renderHome(data) {
    const featured = data.products.slice().sort((a, b) => (b.discountRate - a.discountRate) || (a.price - b.price)).slice(0, 8);
    const departments = uniqueOptions(data.products.map((item) => item.department));
    const mainCategories = uniqueOptions(data.products.map((item) => item.mainCategory));
    const subCategories = uniqueOptions(data.products.map((item) => item.subCategory));
    const metricBrand = document.getElementById('metric-brand-count');
    const metricProduct = document.getElementById('metric-product-count');
    const metricGroup = document.getElementById('metric-group-count');
    const groupCount = document.getElementById('comparison-group-count');
    if (metricBrand) metricBrand.textContent = String(data.brands.length);
    if (metricProduct) metricProduct.textContent = String(data.products.length);
    if (metricGroup) metricGroup.textContent = String(data.comparisonGroups.length);
    if (groupCount) groupCount.textContent = String(data.comparisonGroups.length);
    const overview = document.getElementById('overview-grid');
    if (overview) overview.innerHTML = buildCategoryOverview(data.products);
    const ribbon = document.getElementById('category-ribbon');
    if (ribbon) ribbon.innerHTML = subCategories.map((value) => \`<span class="category-pill">\${escapeHtml(value)}</span>\`).join('');
    const comparisonGrid = document.getElementById('comparison-grid');
    if (comparisonGrid) comparisonGrid.innerHTML = data.comparisonGroups.map(renderComparisonCardEditorial).join('');
    const featuredGrid = document.getElementById('featured-grid');
    if (featuredGrid) featuredGrid.innerHTML = featured.map(renderProductCardEditorial).join('');
    const productGrid = document.getElementById('product-grid');
    if (productGrid) productGrid.innerHTML = data.products.map(renderProductCardEditorial).join('');
    const brandGrid = document.getElementById('brand-grid');
    if (brandGrid) brandGrid.innerHTML = data.brands.map(renderBrandCard).join('');
    fillSelect(document.getElementById('department-filter'), departments, 'Tum departmanlar');
    fillSelect(document.getElementById('main-category-filter'), mainCategories, 'Tum ana kategoriler');
    fillSelect(document.getElementById('sub-category-filter'), subCategories, 'Tum alt kategoriler');
    const brandFilter = document.getElementById('brand-filter');
    if (brandFilter) {
      const current = brandFilter.value;
      brandFilter.innerHTML = \`<option value="">Tum markalar</option>\${data.brands.map((brand) => \`<option value="\${escapeHtml(brand.slug)}">\${escapeHtml(brand.name)}</option>\`).join('')}\`;
      if ([...brandFilter.options].some((option) => option.value === current)) brandFilter.value = current;
    }
    attachFilters();
  }

  function renderAdmin(data) {
    const metricBrand = document.getElementById('metric-brand-count');
    const metricProduct = document.getElementById('metric-product-count');
    const metricGroup = document.getElementById('metric-group-count');
    if (metricBrand) metricBrand.textContent = String(data.brands.length);
    if (metricProduct) metricProduct.textContent = String(data.products.length);
    if (metricGroup) metricGroup.textContent = String(data.comparisonGroups.length);
    const tbody = document.getElementById('admin-brand-rows');
    if (!tbody) return;
    tbody.innerHTML = data.brands.map((brand) => {
      const items = data.products.filter((item) => item.brandSlug === brand.slug);
      const best = data.comparisonGroups.filter((group) => group.bestPrice?.brandSlug === brand.slug).length;
      return \`<tr><td>\${escapeHtml(brand.name)}</td><td>\${items.length}</td><td>\${escapeHtml(uniqueOptions(items.map((item) => item.department)).join(', ') || '-')}</td><td>\${best}</td></tr>\`;
    }).join('');
  }

  function renderBrandPage(data) {
    const brandProducts = data.products.filter((item) => item.brandSlug === currentBrandSlug);
    const count = document.getElementById('brand-product-count');
    const departments = document.getElementById('brand-departments');
    const mainCategories = document.getElementById('brand-main-categories');
    const grid = document.getElementById('brand-product-grid');
    if (count) count.textContent = String(brandProducts.length);
    if (departments) departments.textContent = uniqueOptions(brandProducts.map((item) => item.department)).join(', ') || '-';
    if (mainCategories) mainCategories.textContent = uniqueOptions(brandProducts.map((item) => item.mainCategory)).join(', ') || '-';
    if (grid) grid.innerHTML = brandProducts.map(renderProductCardEditorial).join('') || '<div class="empty">Bu marka icin henuz urun yok.</div>';
  }

  async function init() {
    attachFilters();
    if (!config.supabaseUrl || !config.supabaseAnonKey) return;
    try {
      const data = await fetchCatalog();
      if (page === 'admin') renderAdmin(data);
      else if (page === 'brand') renderBrandPage(data);
      else renderHome(data);
    } catch (error) {
      console.error('Supabase live mode fallback used:', error);
    }
  }

  init();
})();`;
}

function buildStyles() {
  return `:root {
  --bg: #f4eadf;
  --bg-deep: #e8d6c1;
  --surface: rgba(255, 249, 243, 0.82);
  --surface-strong: #fff9f2;
  --text: #201815;
  --muted: #6f6258;
  --line: rgba(56, 39, 28, 0.12);
  --accent: #8f5b34;
  --accent-soft: rgba(143, 91, 52, 0.12);
  --forest: #2d5b4c;
  --shadow: 0 30px 80px rgba(57, 33, 17, 0.12);
  --shadow-soft: 0 12px 32px rgba(57, 33, 17, 0.08);
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  color: var(--text);
  font-family: "Instrument Sans", sans-serif;
  background:
    radial-gradient(circle at top left, rgba(143, 91, 52, 0.18), transparent 26%),
    radial-gradient(circle at 85% 10%, rgba(45, 91, 76, 0.12), transparent 18%),
    linear-gradient(180deg, #fbf5ef 0%, var(--bg) 52%, #efe0cf 100%);
}
a { color: inherit; text-decoration: none; }
img { display: block; width: 100%; object-fit: cover; background: #f0e4d8; }
p, small, s { color: var(--muted); }
.page { width: min(1280px, calc(100% - 32px)); margin: 0 auto; padding: 24px 0 88px; }
.topbar, .logo, .nav, .hero-actions, .metric-grid, .badge-row, .price-row, .section-head, .search-shell, .hero-tags, .category-ribbon { display: flex; }
.topbar {
  position: sticky;
  top: 14px;
  z-index: 20;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 26px;
  padding: 12px 14px;
  border: 1px solid rgba(255,255,255,0.5);
  border-radius: 999px;
  background: rgba(255, 248, 240, 0.72);
  backdrop-filter: blur(18px);
  box-shadow: var(--shadow-soft);
}
.logo, .nav { align-items: center; gap: 14px; }
.logo-mark {
  display: inline-flex;
  width: 48px;
  height: 48px;
  align-items: center;
  justify-content: center;
  border-radius: 18px;
  background: linear-gradient(145deg, #b98458, #5e3d28);
  color: white;
  font-weight: 700;
  letter-spacing: 0.08em;
}
.logo strong, h1, h2, h3 { margin: 0; letter-spacing: -0.04em; }
.logo strong, h2, h3 { font-family: "Cormorant Garamond", serif; }
.logo small { display: block; margin-top: 2px; }
.nav {
  padding: 6px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: rgba(255,255,255,0.54);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.7);
  flex-wrap: wrap;
}
.nav a {
  padding: 10px 16px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
}
.nav a:hover { background: rgba(143, 91, 52, 0.1); }
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.75fr);
  gap: 26px;
  padding: 34px;
  border: 1px solid rgba(255,255,255,0.6);
  border-radius: 36px;
  background:
    linear-gradient(135deg, rgba(255,250,245,0.95), rgba(247,236,223,0.78)),
    radial-gradient(circle at top right, rgba(45,91,76,0.08), transparent 24%);
  box-shadow: var(--shadow);
}
.hero-copy-block { display: grid; gap: 18px; align-content: start; }
.eyebrow {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 11px;
  font-weight: 700;
  color: var(--accent);
}
h1 {
  max-width: 11ch;
  font-family: "Cormorant Garamond", serif;
  font-size: clamp(52px, 7vw, 86px);
  line-height: 0.9;
}
h2 { font-size: clamp(32px, 4vw, 52px); line-height: 0.95; }
h3 { font-size: 34px; line-height: 0.96; }
.hero-copy { max-width: 58ch; font-size: 16px; line-height: 1.8; }
.search-shell {
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 18px 20px;
  border: 1px solid rgba(84, 56, 36, 0.14);
  border-radius: 26px;
  background: rgba(255,255,255,0.62);
}
.search-shell strong { display: block; margin-top: 4px; font-family: "Cormorant Garamond", serif; font-size: 28px; }
.search-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.18em; color: var(--muted); }
.hero-tags, .category-ribbon { gap: 10px; flex-wrap: wrap; }
.hero-tag, .category-pill, .badge {
  display: inline-flex;
  align-items: center;
  padding: 9px 14px;
  border-radius: 999px;
  border: 1px solid rgba(84, 56, 36, 0.1);
  background: rgba(255,255,255,0.52);
  font-size: 12px;
  font-weight: 600;
}
.hero-tag.muted { background: var(--accent-soft); color: var(--accent); }
.hero-actions { gap: 12px; flex-wrap: wrap; }
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 20px;
  border-radius: 999px;
  border: 1px solid rgba(84, 56, 36, 0.12);
  background: rgba(255,255,255,0.65);
  font-weight: 600;
}
.button.primary {
  background: linear-gradient(145deg, #2d5b4c, #1c3a31);
  color: white;
  border-color: transparent;
}
.hero-panel, .metric, .comparison-card, .product-card, .brand-card, .empty, .overview-card, .table-wrap {
  border: 1px solid rgba(84, 56, 36, 0.1);
  background: var(--surface);
  box-shadow: var(--shadow-soft);
}
.hero-panel, .comparison-card, .empty, .overview-card { border-radius: 28px; padding: 18px; }
.metric-grid { gap: 12px; flex-wrap: wrap; }
.editorial-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.metric {
  min-height: 120px;
  border-radius: 24px;
  padding: 18px;
  background: rgba(255,255,255,0.72);
}
.metric span, .metric small { display: block; }
.metric span { margin-bottom: 10px; color: var(--muted); }
.metric strong { font-family: "Cormorant Garamond", serif; font-size: 46px; line-height: 1; }
.metric small { margin-top: 12px; font-size: 12px; }
.metric-small { font-size: 20px; }
.hero-note {
  margin-top: 14px;
  padding: 18px;
  border-radius: 22px;
  background: linear-gradient(135deg, rgba(143, 91, 52, 0.12), rgba(143, 91, 52, 0.04));
}
.hero-note.soft { background: linear-gradient(135deg, rgba(45, 91, 76, 0.11), rgba(45, 91, 76, 0.03)); }
.category-ribbon { margin-top: 18px; }
.category-pill { background: rgba(255, 249, 242, 0.75); }
.overview-grid, .comparison-grid, .product-grid, .brand-grid { display: grid; gap: 20px; }
.overview-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 28px; }
.overview-card h3 { font-size: 30px; }
.overview-list, .compare-list, .meta-stack { display: grid; gap: 10px; margin-top: 14px; }
.overview-row, .compare-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
.filters {
  display: grid;
  grid-template-columns: 2fr repeat(4, 1fr);
  gap: 16px;
  margin-top: 28px;
  padding: 20px;
  border-radius: 30px;
  border: 1px solid rgba(84, 56, 36, 0.12);
  background: rgba(255,255,255,0.58);
  box-shadow: var(--shadow-soft);
}
.filters label { display: grid; gap: 8px; }
.filters span { font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
.filters input, .filters select {
  width: 100%;
  height: 52px;
  border-radius: 16px;
  border: 1px solid rgba(84, 56, 36, 0.12);
  padding: 0 14px;
  font: inherit;
  background: rgba(255,255,255,0.82);
}
.section { margin-top: 40px; }
.section-head { align-items: end; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
.section-head h2 { max-width: 12ch; }
.tight { align-items: start; margin-bottom: 14px; }
.comparison-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.comparison-card { padding: 22px; }
.compare-card-top {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 10px;
}
.compare-chip {
  display: inline-flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(32, 24, 21, 0.06);
  font-size: 12px;
  font-weight: 600;
}
.compare-meta { margin: 0 0 14px; line-height: 1.6; }
.compare-row {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 0 0;
}
.compare-row-main, .compare-row-side { display: flex; gap: 12px; }
.compare-row-main { align-items: start; }
.compare-row-main div, .compare-row-side { display: grid; gap: 4px; }
.compare-row-side { justify-items: end; text-align: right; }
.compare-rank {
  display: inline-flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(32, 24, 21, 0.08);
  font-weight: 700;
  flex: 0 0 auto;
}
.compare-row.winner { color: var(--forest); }
.product-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.product-grid-featured { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.brand-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.product-card, .brand-card {
  border-radius: 28px;
  overflow: hidden;
  transition: transform 180ms ease, box-shadow 180ms ease;
}
.product-card:hover, .brand-card:hover, .comparison-card:hover { transform: translateY(-4px); box-shadow: 0 24px 48px rgba(57, 33, 17, 0.14); }
.product-media { position: relative; }
.product-card img { height: 260px; }
.product-overlay {
  position: absolute;
  inset: 14px 14px auto 14px;
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 10px;
}
.overlay-brand, .overlay-sale {
  display: inline-flex;
  align-items: center;
  padding: 9px 12px;
  border-radius: 999px;
  color: white;
  font-size: 12px;
  font-weight: 700;
  box-shadow: 0 10px 20px rgba(0,0,0,0.16);
}
.overlay-sale { background: rgba(32, 24, 21, 0.82); }
.product-body { padding: 20px; }
.badge-row { gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.badge { padding: 8px 12px; background: rgba(32, 24, 21, 0.06); }
.badge.accent { background: rgba(143, 91, 52, 0.14); color: var(--accent); }
.product-body h3 { font-size: 32px; margin-bottom: 8px; }
.price-row { gap: 12px; align-items: baseline; margin-top: 16px; }
.price-row strong { font-family: "Cormorant Garamond", serif; font-size: 42px; line-height: 1; }
.material-panel {
  display: grid;
  gap: 6px;
  margin-top: 16px;
  padding: 16px;
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(143, 91, 52, 0.12), rgba(255,255,255,0.7));
}
.material-panel span { font-size: 11px; text-transform: uppercase; letter-spacing: 0.16em; color: var(--muted); }
.material-panel strong { font-size: 15px; line-height: 1.6; }
.meta-stack { padding-top: 14px; border-top: 1px solid var(--line); }
.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
}
.product-signature {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--muted);
}
.source-link { display: inline-flex; margin-top: 16px; color: var(--forest); font-weight: 700; }
.brand-card {
  display: grid;
  gap: 10px;
  align-content: start;
  padding: 20px;
  min-height: 140px;
}
.brand-card strong { font-family: "Cormorant Garamond", serif; font-size: 28px; }
.brand-dot { width: 14px; height: 14px; border-radius: 999px; background: var(--brand, #111827); box-shadow: 0 0 0 6px color-mix(in srgb, var(--brand, #111827) 12%, transparent); }
.table-wrap { overflow-x: auto; border-radius: 28px; }
table { width: 100%; border-collapse: collapse; min-width: 700px; }
th, td { padding: 16px 18px; text-align: left; border-bottom: 1px solid var(--line); }
tbody tr:last-child td { border-bottom: 0; }
.empty { padding: 24px; }
.hidden { display: none; }
@media (max-width: 1100px) {
  .hero,
  .overview-grid,
  .comparison-grid,
  .product-grid,
  .product-grid-featured,
  .brand-grid,
  .filters,
  .editorial-metrics { grid-template-columns: 1fr 1fr; }
  .search-shell { flex-direction: column; align-items: flex-start; }
}
@media (max-width: 720px) {
  .page { width: min(100% - 18px, 1280px); padding-top: 16px; }
  .topbar { position: static; border-radius: 28px; }
  .topbar, .hero, .overview-grid, .comparison-grid, .product-grid, .product-grid-featured, .brand-grid, .filters, .editorial-metrics { grid-template-columns: 1fr; }
  .topbar { align-items: flex-start; flex-direction: column; }
  h1, .section-head h2 { max-width: none; }
  .nav { width: 100%; }
}
`;
}

function buildRobots() {
  return `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`;
}

function buildSitemap(brands) {
  const urls = [`${siteUrl}/`, `${siteUrl}/admin.html`, ...brands.map((brand) => `${siteUrl}/brand/${brand.slug}/`)];
  const items = urls.map((url) => `<url><loc>${escapeHtml(url)}</loc><lastmod>${new Date().toISOString()}</lastmod></url>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items}</urlset>`;
}

function formatPrice(value) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(value || 0);
}

function uniqueOptions(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr"));
}

function slugify(value) {
  return String(value ?? "").toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function serializeForScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
