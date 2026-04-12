import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const distDir = path.join(root, "dist");
const siteUrl = (process.env.SITE_URL || "https://giyimkarsilastirma.com").replace(/\/$/, "");
const assetVersion = Date.now().toString();

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
  writeFile(path.join(distDir, "app.js"), buildClientScript(), "utf8"),
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
          <span class="logo-mark">GK</span>
          <span><strong>Giyim Karsilastirma</strong><small>Canli kategori ve fiyat izi</small></span>
        </a>
        <nav class="nav">
          <a href="#karsilastirmalar">Karsilastirmalar</a>
          <a href="#urunler">Urunler</a>
          <a href="#markalar">Markalar</a>
          <a href="/admin.html">Yonetim</a>
        </nav>
      </header>

      <section class="hero">
        <div>
          <p class="eyebrow">Tum katalog yapisi</p>
          <h1>Erkek, kadin ve cocuk giyimde kategori bazli canli karsilastirma.</h1>
          <p class="hero-copy">Artik ust giyim, alt giyim ve dis giyim altinda gomlek, tisort, sweat, pantolon, hirka ve kase gibi alt kategorileri ayri ayri takip edecek bir omurgadayiz.</p>
          <div class="hero-actions">
            <a class="button primary" href="#urunler">Katalogu ac</a>
            <a class="button" href="/admin.html">Veri yapisini gor</a>
          </div>
        </div>
        <div class="hero-panel">
          <div class="metric-grid">
            <article class="metric"><span>Marka</span><strong>${brands.length}</strong></article>
            <article class="metric"><span>Urun</span><strong>${validProducts.length}</strong></article>
            <article class="metric"><span>Grup</span><strong>${comparisonGroups.length}</strong></article>
          </div>
          <div class="hero-note"><strong>Kapsam</strong><p>${departmentOptions.join(", ")} · ${mainCategoryOptions.join(", ")}</p></div>
        </div>
      </section>

      <section class="overview-grid">
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
        <div class="section-head"><div><p class="eyebrow">Karsilastirma gruplari</p><h2>Kategoriye gore benzer urunler</h2></div><small>${comparisonGroups.length} grup</small></div>
        <div class="comparison-grid">${comparisonGroups.map(renderComparisonCard).join("")}</div>
      </section>

      <section class="section">
        <div class="section-head"><div><p class="eyebrow">One cikanlar</p><h2>Fiyat veya indirim dikkat ceken urunler</h2></div></div>
        <div class="product-grid product-grid-featured">${featured.map(renderProductCard).join("")}</div>
      </section>

      <section class="section" id="urunler">
        <div class="section-head"><div><p class="eyebrow">Tum urunler</p><h2>Kategori bazli katalog akisi</h2></div><small><strong id="result-count">${validProducts.length}</strong> kayit</small></div>
        <div class="product-grid" id="product-grid">${validProducts.map(renderProductCard).join("")}</div>
        <div class="empty hidden" id="empty-state">Filtrelere uygun urun bulunamadi.</div>
      </section>

      <section class="section" id="markalar">
        <div class="section-head"><div><p class="eyebrow">Takip edilen markalar</p><h2>Kaynak havuzu</h2></div></div>
        <div class="brand-grid">${brands.map(renderBrandCard).join("")}</div>
      </section>
    </main>`
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
        <div class="hero-panel"><div class="metric-grid"><article class="metric"><span>Marka</span><strong>${brands.length}</strong></article><article class="metric"><span>Urun</span><strong>${validProducts.length}</strong></article><article class="metric"><span>Grup</span><strong>${comparisonGroups.length}</strong></article></div></div>
      </section>
      <section class="section"><div class="table-wrap"><table><thead><tr><th>Marka</th><th>Urun</th><th>Departman</th><th>En iyi fiyat grubu</th></tr></thead><tbody>${brandRows}</tbody></table></div></section>
    </main>`
  );
}

function renderBrandPage({ brand, items }) {
  return layout(
    `${brand.name} urunleri`,
    `${brand.name} icin departman ve kategori bazli urun listesi.`,
    `<main class="page">
      <section class="hero brand-hero">
        <div><p class="eyebrow">${escapeHtml(brand.segment || "Marka")}</p><h1>${escapeHtml(brand.name)} urun akisiniz</h1><p class="hero-copy">Bu marka icin kategori bazli urun ve fiyat akisi burada listeleniyor.</p><div class="hero-actions"><a class="button primary" href="/">Ana sayfaya don</a><a class="button" href="${escapeHtml(brand.website)}">Resmi site</a></div></div>
        <div class="hero-panel"><div class="metric-grid"><article class="metric"><span>Urun</span><strong>${items.length}</strong></article><article class="metric"><span>Departman</span><strong class="metric-small">${escapeHtml(uniqueOptions(items.map((item) => item.department)).join(", ") || "-")}</strong></article><article class="metric"><span>Ana kategori</span><strong class="metric-small">${escapeHtml(uniqueOptions(items.map((item) => item.mainCategory)).join(", ") || "-")}</strong></article></div></div>
      </section>
      <section class="section"><div class="product-grid">${items.map(renderProductCard).join("") || `<div class="empty">Bu marka icin henuz urun yok.</div>`}</div></section>
    </main>`
  );
}

function renderBrandCard(brand) {
  return `<a class="brand-card" href="/brand/${brand.slug}/" style="--brand:${escapeHtml(brand.color)}"><span class="brand-dot"></span><strong>${escapeHtml(brand.name)}</strong><small>${escapeHtml(brand.segment || "")}</small></a>`;
}

function renderComparisonCard(group) {
  return `<article class="comparison-card"><div class="section-head tight"><div><p class="eyebrow">${escapeHtml(group.department)}</p><h3>${escapeHtml(group.label)}</h3></div><small>${group.items.length} marka</small></div><p class="compare-meta">${escapeHtml(group.mainCategory)} · ${escapeHtml(group.subCategory)} · En dusuk fiyat: <strong>${formatPrice(group.bestPrice?.price || 0)}</strong></p><div class="compare-list">${group.items.map((item, index) => `<div class="compare-row ${index === 0 ? "winner" : ""}"><strong>${escapeHtml(item.brand.name)}</strong><span>${formatPrice(item.price)}</span><small>${escapeHtml(item.materialSummary)}</small></div>`).join("")}</div></article>`;
}

function renderProductCard(item) {
  return `<article class="product-card" data-search="${escapeHtml(item.searchText)}" data-brand="${escapeHtml(item.brandSlug)}" data-department="${escapeHtml(slugify(item.department))}" data-main-category="${escapeHtml(slugify(item.mainCategory))}" data-sub-category="${escapeHtml(slugify(item.subCategory))}"><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}"><div class="product-body"><div class="badge-row"><span class="badge" style="background:${escapeHtml(item.brand.color)}14;color:${escapeHtml(item.brand.color)}">${escapeHtml(item.brand.name)}</span><span class="badge">${escapeHtml(item.department)}</span><span class="badge">${escapeHtml(item.mainCategory)}</span>${item.discountRate > 0 ? `<span class="badge accent">%${item.discountRate} indirim</span>` : ""}</div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.subCategory)} · ${escapeHtml(item.productType || item.fit)} · ${escapeHtml(item.gender)}</p><div class="price-row"><strong>${formatPrice(item.price)}</strong>${item.previousPrice > item.price ? `<s>${formatPrice(item.previousPrice)}</s>` : ""}</div><div class="meta-stack"><small><strong>Taksonomi:</strong> ${escapeHtml(item.category)}</small><small><strong>Materyal:</strong> ${escapeHtml(item.materialSummary)}</small><small><strong>Urun kodu:</strong> ${escapeHtml(item.productCode || "-")}</small></div>${item.sourceUrl ? `<a class="source-link" href="${escapeHtml(item.sourceUrl)}">Kaynak urune git</a>` : ""}</div></article>`;
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

function layout(title, description, content) {
  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css?v=${assetVersion}">
</head>
<body>
  ${content}
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

function buildStyles() {
  return `:root {
  --bg: #f7f1e8; --text: #1a1c24; --muted: #5c6472; --line: rgba(26, 28, 36, 0.1); --surface: rgba(255,255,255,0.82); --accent: #b45309; --shadow: 0 24px 70px rgba(15, 23, 42, 0.08); --shadow-soft: 0 10px 30px rgba(15, 23, 42, 0.06);
}
* { box-sizing: border-box; }
body { margin: 0; color: var(--text); font-family: "Manrope", sans-serif; background: radial-gradient(circle at top left, rgba(180,83,9,0.14), transparent 22%), radial-gradient(circle at 85% 12%, rgba(14,116,144,0.12), transparent 20%), linear-gradient(180deg, #fff9f4 0%, var(--bg) 100%); }
a { color: inherit; text-decoration: none; }
img { display: block; width: 100%; object-fit: cover; }
.page { width: min(1260px, calc(100% - 32px)); margin: 0 auto; padding: 24px 0 72px; }
.topbar, .logo, .nav, .hero-actions, .metric-grid, .badge-row, .price-row, .section-head { display: flex; }
.topbar { align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 22px; }
.logo, .nav { align-items: center; gap: 14px; }
.logo-mark { display: inline-flex; width: 46px; height: 46px; align-items: center; justify-content: center; border-radius: 16px; background: linear-gradient(135deg, #b45309, #0f766e); color: white; font-weight: 800; }
.logo strong, h1, h2, h3 { font-family: "Instrument Serif", serif; letter-spacing: -0.03em; margin: 0; }
.logo small, .hero-copy, p, small, s { color: var(--muted); }
.nav { padding: 8px 14px; border-radius: 999px; border: 1px solid var(--line); background: rgba(255,255,255,0.75); box-shadow: var(--shadow-soft); flex-wrap: wrap; }
.nav a { font-weight: 700; font-size: 14px; }
.hero { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 24px; padding: 28px; border: 1px solid var(--line); border-radius: 30px; background: linear-gradient(135deg, rgba(255,255,255,0.95), rgba(255,255,255,0.72)); box-shadow: var(--shadow); }
.eyebrow { margin: 0 0 10px; text-transform: uppercase; letter-spacing: 0.16em; font-size: 11px; font-weight: 800; color: var(--accent); }
h1 { font-size: clamp(38px, 6vw, 68px); line-height: 0.98; max-width: 12ch; }
h2 { font-size: clamp(28px, 3.4vw, 42px); }
h3 { font-size: 28px; }
.hero-copy { font-size: 16px; line-height: 1.7; max-width: 58ch; }
.hero-actions { gap: 12px; flex-wrap: wrap; margin-top: 20px; }
.button { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 0 18px; border-radius: 999px; border: 1px solid var(--line); background: rgba(255,255,255,0.75); font-weight: 700; }
.button.primary { background: #111827; color: white; border-color: transparent; }
.hero-panel, .metric, .comparison-card, .product-card, .brand-card, .info-card, .empty, .overview-card { border: 1px solid var(--line); background: var(--surface); box-shadow: var(--shadow-soft); }
.hero-panel, .comparison-card, .info-card, .empty, .overview-card { border-radius: 24px; padding: 18px; }
.metric-grid { gap: 12px; flex-wrap: wrap; }
.metric { flex: 1 1 140px; min-height: 104px; border-radius: 22px; padding: 16px; }
.metric span { display: block; color: var(--muted); margin-bottom: 10px; }
.metric strong { font-size: 34px; }
.metric-small { font-size: 20px; }
.hero-note { margin-top: 14px; padding: 16px; border-radius: 20px; background: rgba(180,83,9,0.06); }
.overview-grid, .comparison-grid, .product-grid, .brand-grid { display: grid; gap: 18px; }
.overview-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 28px; }
.overview-list { display: grid; gap: 10px; margin-top: 14px; }
.overview-row { display: flex; justify-content: space-between; gap: 10px; padding-top: 12px; border-top: 1px solid var(--line); }
.filters { display: grid; grid-template-columns: 2fr repeat(4, 1fr); gap: 16px; margin-top: 26px; padding: 18px; border-radius: 26px; border: 1px solid var(--line); background: rgba(255,255,255,0.78); box-shadow: var(--shadow-soft); }
.filters label { display: grid; gap: 8px; }
.filters span { font-size: 13px; font-weight: 700; color: var(--muted); }
.filters input, .filters select { width: 100%; height: 50px; border-radius: 16px; border: 1px solid var(--line); padding: 0 14px; font: inherit; }
.section { margin-top: 34px; }
.section-head { align-items: end; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
.tight { align-items: start; margin-bottom: 14px; }
.comparison-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.product-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.product-grid-featured { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.brand-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.product-card, .brand-card { border-radius: 24px; overflow: hidden; }
.compare-list, .meta-stack { display: grid; gap: 10px; }
.compare-meta { margin: 0 0 14px; }
.compare-row { display: grid; gap: 4px; padding: 14px; border-radius: 18px; background: rgba(255,255,255,0.75); border: 1px solid var(--line); }
.compare-row.winner { background: rgba(15,118,110,0.08); }
.product-card img { height: 220px; }
.product-body { padding: 18px; }
.badge-row { gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.badge { display: inline-flex; align-items: center; padding: 7px 10px; border-radius: 999px; background: rgba(17,24,39,0.08); font-size: 11px; font-weight: 700; }
.badge.accent { background: rgba(180,83,9,0.14); color: var(--accent); }
.price-row { gap: 12px; align-items: baseline; margin-top: 14px; }
.price-row strong { font-size: 30px; }
.meta-stack { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--line); }
.source-link { display: inline-flex; margin-top: 14px; color: #0f766e; font-weight: 700; }
.brand-card { display: grid; gap: 10px; padding: 18px; min-height: 120px; }
.brand-dot { width: 14px; height: 14px; border-radius: 999px; background: var(--brand, #111827); }
.table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 24px; background: rgba(255,255,255,0.78); }
table { width: 100%; border-collapse: collapse; min-width: 700px; }
th, td { padding: 16px 18px; text-align: left; border-bottom: 1px solid var(--line); }
tbody tr:last-child td { border-bottom: 0; }
.hidden { display: none; }
@media (max-width: 1100px) { .hero, .overview-grid, .comparison-grid, .product-grid, .product-grid-featured, .brand-grid, .filters { grid-template-columns: 1fr 1fr; } }
@media (max-width: 720px) { .page { width: min(100% - 18px, 1260px); } .topbar, .hero, .overview-grid, .comparison-grid, .product-grid, .product-grid-featured, .brand-grid, .filters { grid-template-columns: 1fr; } .topbar { align-items: flex-start; flex-direction: column; } h1 { max-width: none; } }
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
