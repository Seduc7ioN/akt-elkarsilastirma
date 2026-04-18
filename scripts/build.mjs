import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnv } from "./lib/env.mjs";
import { supabaseClient } from "./lib/supabase.mjs";

const root = process.cwd();
loadEnv(root);

const siteConfig = JSON.parse(await readFile(path.join(root, "config/site.config.json"), "utf8"));
const siteUrl = (process.env.SITE_URL || siteConfig.site.url).replace(/\/$/, "");
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";
const distDir = path.join(root, "dist");
const assetVersion = Date.now().toString();

const db = supabaseClient({ url: supabaseUrl, key: supabaseAnonKey });

console.log("Supabase'ten veri cekiliyor...");
const [markets, catalogs, products, comments] = await Promise.all([
  db.query("markets", "select=*"),
  db.query("weekly_catalogs", "select=*&order=week_start.desc"),
  db.queryAll("products", "select=*&order=scraped_at.desc"),
  db.query("comments", "select=*&order=created_at.desc&limit=500"),
]);

console.log(`${markets.length} market, ${catalogs.length} katalog, ${products.length} urun, ${comments.length} yorum.`);

const marketById = new Map(markets.map((m) => [m.id, m]));
const catalogById = new Map(catalogs.map((c) => [c.id, c]));
const catalogsByMarket = groupBy(catalogs, "market_id");
const productsByCatalog = groupBy(products, "catalog_id");
const productsByMarket = groupBy(products, "market_id");
const commentsByMarket = groupBy(comments, "market_id");

const latestCatalogByMarket = new Map();
for (const [mid, list] of catalogsByMarket) latestCatalogByMarket.set(mid, list[0]);

const orderedMarkets = orderMarkets(markets, siteConfig.marketOrder);

await rm(distDir, { recursive: true, force: true });
await mkdir(path.join(distDir, "market"), { recursive: true });
await mkdir(path.join(distDir, "urunler"), { recursive: true });

await Promise.all([
  writeFile(path.join(distDir, "styles.css"), buildStyles(), "utf8"),
  writeFile(path.join(distDir, "app.js"), buildClientJs(), "utf8"),
  writeFile(path.join(distDir, "index.html"), renderHome(), "utf8"),
  writeFile(path.join(distDir, "urunler/index.html"), renderAllProducts(), "utf8"),
  writeFile(path.join(distDir, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`, "utf8"),
  writeFile(path.join(distDir, "sitemap.xml"), buildSitemap(), "utf8"),
]);

for (const market of orderedMarkets) {
  const dir = path.join(distDir, "market", market.id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "index.html"), renderMarket(market), "utf8");

  const cats = catalogsByMarket.get(market.id) || [];
  for (const catalog of cats) {
    const catDir = path.join(dir, catalog.id);
    await mkdir(catDir, { recursive: true });
    await writeFile(path.join(catDir, "index.html"), renderCatalog(market, catalog), "utf8");
  }
}

console.log(`Build tamamlandi -> ${distDir}`);

function renderHome() {
  const latestCatalogs = orderedMarkets
    .map((m) => ({ market: m, catalog: latestCatalogByMarket.get(m.id) }))
    .filter((x) => x.catalog);
  const topDiscounts = products
    .filter((p) => p.discount_pct && p.discount_pct > 0)
    .sort((a, b) => (b.discount_pct || 0) - (a.discount_pct || 0))
    .slice(0, 12);
  const recentProducts = products.slice(0, 24);

  return layout(
    siteConfig.site.title,
    siteConfig.site.description,
    `<main class="page">
      ${renderHeader("home")}

      <section class="hero">
        <div>
          <p class="eyebrow">Canli akis</p>
          <h1>${escapeHtml(siteConfig.site.tagline)}</h1>
          <p class="hero-sub">BİM, A101, ŞOK, Migros, Hakmar ve daha fazla market. Haftalık katalog ve aktüel ürünler tek akışta.</p>
          <div class="hero-stats">
            <div><strong>${markets.length}</strong><span>market</span></div>
            <div><strong>${catalogs.length}</strong><span>katalog</span></div>
            <div><strong>${products.length}</strong><span>ürün</span></div>
          </div>
          <div class="hero-actions">
            <a class="btn primary" href="/urunler/">Tüm ürünleri ara</a>
            <a class="btn" href="#marketler">Marketler</a>
          </div>
        </div>
      </section>

      <section class="section" id="marketler">
        <div class="section-head"><h2>Marketler</h2><small>${orderedMarkets.length} market</small></div>
        <div class="market-grid">
          ${orderedMarkets.map(renderMarketCard).join("")}
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Bu haftanın katalogları</h2><small>${latestCatalogs.length} aktif</small></div>
        <div class="catalog-grid">
          ${latestCatalogs.map(({ market, catalog }) => renderCatalogCard(market, catalog)).join("")}
        </div>
      </section>

      ${topDiscounts.length ? `
      <section class="section">
        <div class="section-head"><h2>En yüksek indirimler</h2><small>% indirim sıralı</small></div>
        <div class="product-grid">
          ${topDiscounts.map(renderProductCard).join("")}
        </div>
      </section>` : ""}

      <section class="section">
        <div class="section-head"><h2>Son eklenen ürünler</h2><small>${recentProducts.length} ürün</small></div>
        <div class="product-grid">
          ${recentProducts.map(renderProductCard).join("")}
        </div>
      </section>

      ${renderFooter()}
    </main>`
  );
}

function renderMarket(market) {
  const cats = catalogsByMarket.get(market.id) || [];
  const marketProducts = productsByMarket.get(market.id) || [];
  const marketComments = commentsByMarket.get(market.id) || [];
  const color = marketColor(market.id);

  return layout(
    `${marketLabel(market)} aktüel ürünleri`,
    `${marketLabel(market)} haftalık aktüel katalog ve ürünleri.`,
    `<main class="page">
      ${renderHeader("market")}

      <section class="hero market-hero" style="--accent:${color}">
        <div>
          <p class="eyebrow">${escapeHtml(marketLabel(market))}</p>
          <h1>${escapeHtml(marketLabel(market))} aktüel ürünleri</h1>
          <p class="hero-sub">${cats.length} haftalık katalog · ${marketProducts.length} ürün listeleniyor.</p>
          ${market.website ? `<a class="btn" href="${escapeHtml(market.website)}" target="_blank" rel="noopener">Resmi site</a>` : ""}
        </div>
      </section>

      ${cats.length ? `
      <section class="section">
        <div class="section-head"><h2>Haftalık kataloglar</h2><small>${cats.length} katalog</small></div>
        <div class="catalog-grid">
          ${cats.map((c) => renderCatalogCard(market, c)).join("")}
        </div>
      </section>` : ""}

      <section class="section">
        <div class="section-head"><h2>Ürünler</h2><small>${marketProducts.length} kayıt</small></div>
        <div class="product-grid">
          ${marketProducts.map(renderProductCard).join("") || `<p class="empty">Bu market için henüz ürün yok.</p>`}
        </div>
      </section>

      ${marketComments.length ? `
      <section class="section">
        <div class="section-head"><h2>Yorumlar</h2><small>${marketComments.length} yorum</small></div>
        <div class="comment-list">
          ${marketComments.slice(0, 20).map(renderComment).join("")}
        </div>
      </section>` : ""}

      ${renderFooter()}
    </main>`,
    { ogImage: market.website ? null : null, type: "market" }
  );
}

function renderComment(c) {
  const date = c.created_at ? new Date(c.created_at).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" }) : "";
  return `<article class="comment">
    <div class="comment-head"><strong>${escapeHtml(c.username || "Anonim")}</strong>${date ? `<small>${escapeHtml(date)}</small>` : ""}</div>
    <p>${escapeHtml(c.text || "")}</p>
  </article>`;
}

function renderCatalog(market, catalog) {
  const catProducts = productsByCatalog.get(catalog.id) || [];
  const color = marketColor(market.id);

  return layout(
    `${marketLabel(market)} ${catalog.period_text || dateRange(catalog)} kataloğu`,
    `${marketLabel(market)} ${catalog.period_text || dateRange(catalog)} haftalık aktüel ürünleri.`,
    `<main class="page">
      ${renderHeader("market")}

      <section class="hero market-hero" style="--accent:${color}">
        <div>
          <p class="eyebrow"><a href="/market/${market.id}/">${escapeHtml(marketLabel(market))}</a> · haftalık katalog</p>
          <h1>${escapeHtml(catalog.period_text || dateRange(catalog))}</h1>
          <p class="hero-sub">${catProducts.length} ürün · ${dateRange(catalog)}</p>
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Katalog ürünleri</h2><small>${catProducts.length} ürün</small></div>
        <div class="product-grid">
          ${catProducts.map(renderProductCard).join("") || `<p class="empty">Bu katalogda henüz ürün yok.</p>`}
        </div>
      </section>

      ${renderFooter()}
    </main>`
  );
}

function renderAllProducts() {
  const all = products;
  const categories = [...new Set(all.map((p) => p.category).filter(Boolean))].sort();

  return layout(
    "Tüm ürünler - Aktüel Karşılaştırma",
    "BİM, A101, ŞOK, Migros, Hakmar ve diğer marketlerin aktüel ürünlerini ara ve karşılaştır.",
    `<main class="page">
      ${renderHeader("urunler")}

      <section class="hero compact">
        <div>
          <p class="eyebrow">Arama</p>
          <h1>Tüm aktüel ürünler</h1>
          <p class="hero-sub">${all.length} ürün listeleniyor. Ara, market veya kategoriye göre filtrele.</p>
        </div>
      </section>

      <section class="filters">
        <label><span>Ürün ara</span><input id="search" type="search" placeholder="süt, deterjan, şampuan..."></label>
        <label><span>Market</span><select id="market-filter"><option value="">Tüm marketler</option>${orderedMarkets.map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(marketLabel(m))}</option>`).join("")}</select></label>
        <label><span>Kategori</span><select id="category-filter"><option value="">Tüm kategoriler</option>${categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}</select></label>
      </section>

      <section class="section">
        <div class="section-head"><h2>Sonuçlar</h2><small><span id="count">${all.length}</span> ürün</small></div>
        <div class="product-grid" id="product-grid">
          ${all.map(renderProductCard).join("")}
        </div>
        <p class="empty hidden" id="empty">Filtrelere uygun ürün bulunamadı.</p>
      </section>

      ${renderFooter()}
    </main>`
  );
}

function renderHeader(active) {
  return `<header class="topbar">
    <a class="logo" href="/">
      <span class="logo-mark">AK</span>
      <span><strong>Aktüel Karşılaştırma</strong><small>Haftalık market kampanyaları</small></span>
    </a>
    <nav class="nav">
      <a href="/" class="${active === "home" ? "active" : ""}">Anasayfa</a>
      <a href="/urunler/" class="${active === "urunler" ? "active" : ""}">Ürünler</a>
      <a href="/#marketler" class="${active === "market" ? "active" : ""}">Marketler</a>
    </nav>
  </header>`;
}

function renderFooter() {
  return `<footer class="footer">
    <p>© ${new Date().getFullYear()} Aktüel Karşılaştırma · Veriler her marketin resmi sitesinden alınmaktadır.</p>
    <p><small>Son güncelleme: ${new Date().toLocaleString("tr-TR")}</small></p>
  </footer>`;
}

function renderMarketCard(market) {
  const color = marketColor(market.id);
  const count = (productsByMarket.get(market.id) || []).length;
  return `<a class="market-card" href="/market/${market.id}/" style="--accent:${color}">
    <span class="market-mark">${escapeHtml(marketLabel(market).slice(0, 2).toUpperCase())}</span>
    <strong>${escapeHtml(marketLabel(market))}</strong>
    <small>${count} ürün · ${market.branch_count || "?"} şube</small>
  </a>`;
}

function renderCatalogCard(market, catalog) {
  const color = marketColor(market.id);
  const count = (productsByCatalog.get(catalog.id) || []).length;
  return `<a class="catalog-card" href="/market/${market.id}/${catalog.id}/" style="--accent:${color}">
    <div class="catalog-card-head">
      <span class="market-dot"></span>
      <strong>${escapeHtml(marketLabel(market))}</strong>
    </div>
    <h3>${escapeHtml(catalog.period_text || dateRange(catalog))}</h3>
    <p>${dateRange(catalog)}</p>
    <small>${count} ürün</small>
  </a>`;
}

function renderProductCard(p) {
  const market = marketById.get(p.market_id);
  const color = marketColor(p.market_id);
  const search = normalize(`${p.name || ""} ${p.category || ""} ${marketLabel(market)}`);
  return `<article class="product-card" data-search="${escapeHtml(search)}" data-market="${escapeHtml(p.market_id || "")}" data-category="${escapeHtml(p.category || "")}" style="--accent:${color}">
    ${p.image ? `<div class="product-img"><img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name || "")}" loading="lazy"></div>` : `<div class="product-img placeholder"></div>`}
    <div class="product-body">
      <div class="product-tags">
        <span class="tag market-tag">${escapeHtml(marketLabel(market))}</span>
        ${p.discount_pct ? `<span class="tag discount">%${p.discount_pct} indirim</span>` : ""}
        ${p.badge ? `<span class="tag">${escapeHtml(p.badge)}</span>` : ""}
      </div>
      <h3>${escapeHtml(p.name || "")}</h3>
      ${p.category ? `<p class="muted">${escapeHtml(p.category)}</p>` : ""}
      <div class="price-row">
        <strong>${formatPrice(p.price)}</strong>
        ${p.old_price && Number(p.old_price) > Number(p.price || 0) ? `<s>${formatPrice(p.old_price)}</s>` : ""}
      </div>
      ${p.url ? `<a class="product-link" href="${escapeHtml(p.url)}" target="_blank" rel="noopener">Ürüne git →</a>` : ""}
    </div>
  </article>`;
}

function layout(title, description, content, options = {}) {
  const type = options.type || "website";
  const ogImage = options.ogImage || `${siteUrl}/og-default.png`;
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="theme-color" content="#e11d48">
<meta property="og:type" content="${escapeHtml(type)}">
<meta property="og:site_name" content="${escapeHtml(siteConfig.site.title)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(ogImage)}">
<meta property="og:url" content="${escapeHtml(siteUrl)}">
<meta property="og:locale" content="tr_TR">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(siteUrl)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css?v=${assetVersion}">
</head>
<body>
${content}
<script src="/app.js?v=${assetVersion}" defer></script>
</body>
</html>`;
}

function buildStyles() {
  return `*,*::before,*::after{box-sizing:border-box}
:root{--bg:#f7f7fa;--surface:#fff;--text:#0f172a;--muted:#64748b;--line:#e5e7eb;--accent:#e11d48;--radius:14px;--shadow:0 2px 10px rgba(15,23,42,.06)}
html{scroll-behavior:smooth}
body{margin:0;font-family:Inter,system-ui,sans-serif;color:var(--text);background:var(--bg);line-height:1.5}
a{color:inherit;text-decoration:none}
img{display:block;max-width:100%;height:auto}
h1,h2,h3{margin:0;letter-spacing:-.02em;line-height:1.15}
h1{font-size:clamp(28px,4vw,44px);font-weight:800}
h2{font-size:24px;font-weight:700}
h3{font-size:16px;font-weight:600}
p{margin:0}
.muted{color:var(--muted);font-size:13px}
.page{width:min(1200px,calc(100% - 32px));margin:0 auto;padding:16px 0 64px}
.topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 18px;margin-bottom:24px;background:var(--surface);border-radius:var(--radius);box-shadow:var(--shadow)}
.logo{display:flex;align-items:center;gap:12px}
.logo-mark{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#e11d48,#be123c);color:#fff;font-weight:800;font-size:13px;letter-spacing:.05em}
.logo strong{display:block;font-size:15px}
.logo small{color:var(--muted);font-size:12px}
.nav{display:flex;gap:4px}
.nav a{padding:8px 14px;border-radius:8px;font-size:14px;font-weight:500;color:var(--muted)}
.nav a:hover{background:#f1f5f9;color:var(--text)}
.nav a.active{background:#f1f5f9;color:var(--text);font-weight:600}
.hero{background:var(--surface);border-radius:var(--radius);padding:36px;margin-bottom:32px;box-shadow:var(--shadow)}
.hero.compact{padding:24px}
.hero .eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:11px;font-weight:700;color:var(--accent);margin-bottom:10px}
.hero-sub{color:var(--muted);max-width:60ch;margin-top:12px;font-size:15px}
.hero-stats{display:flex;gap:32px;margin-top:20px}
.hero-stats strong{display:block;font-size:28px;font-weight:800}
.hero-stats span{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em}
.hero-actions{display:flex;gap:10px;margin-top:20px;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px;background:#f1f5f9;border:1px solid var(--line)}
.btn:hover{background:#e2e8f0}
.btn.primary{background:var(--text);color:#fff;border-color:var(--text)}
.btn.primary:hover{background:#1e293b}
.market-hero{border-left:6px solid var(--accent)}
.section{margin-top:40px}
.section-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:16px}
.section-head small{color:var(--muted);font-size:12px}
.market-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px}
.market-card{display:flex;flex-direction:column;align-items:center;gap:8px;padding:22px 16px;background:var(--surface);border-radius:var(--radius);text-align:center;box-shadow:var(--shadow);border-top:4px solid var(--accent);transition:transform .15s}
.market-card:hover{transform:translateY(-3px)}
.market-mark{display:inline-flex;align-items:center;justify-content:center;width:54px;height:54px;border-radius:50%;background:var(--accent);color:#fff;font-weight:800;font-size:16px}
.market-card strong{font-size:15px}
.market-card small{color:var(--muted);font-size:12px}
.catalog-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
.catalog-card{display:block;padding:20px;background:var(--surface);border-radius:var(--radius);box-shadow:var(--shadow);border-left:4px solid var(--accent);transition:transform .15s}
.catalog-card:hover{transform:translateY(-3px)}
.catalog-card-head{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.market-dot{width:10px;height:10px;border-radius:50%;background:var(--accent)}
.catalog-card h3{font-size:17px;margin:6px 0}
.catalog-card p{color:var(--muted);font-size:13px}
.catalog-card small{display:block;margin-top:10px;color:var(--muted);font-size:12px;font-weight:600}
.product-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
.product-card{background:var(--surface);border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow);display:flex;flex-direction:column;transition:transform .15s}
.product-card:hover{transform:translateY(-3px)}
.product-img{aspect-ratio:1/1;background:#f1f5f9;overflow:hidden}
.product-img img{width:100%;height:100%;object-fit:contain;padding:10px}
.product-img.placeholder{background:linear-gradient(135deg,#f1f5f9,#e2e8f0)}
.product-body{padding:14px;display:flex;flex-direction:column;gap:8px;flex:1}
.product-tags{display:flex;flex-wrap:wrap;gap:6px}
.tag{display:inline-flex;padding:4px 8px;border-radius:6px;font-size:11px;font-weight:600;background:#f1f5f9;color:var(--muted)}
.tag.market-tag{background:var(--accent);color:#fff}
.tag.discount{background:#fef3c7;color:#92400e}
.product-card h3{font-size:14px;line-height:1.35;font-weight:600}
.price-row{display:flex;align-items:baseline;gap:8px;margin-top:auto}
.price-row strong{font-size:20px;font-weight:800;color:var(--text)}
.price-row s{color:var(--muted);font-size:13px}
.product-link{font-size:12px;color:var(--accent);font-weight:600;margin-top:6px}
.filters{display:grid;grid-template-columns:2fr 1fr 1fr;gap:14px;background:var(--surface);padding:20px;border-radius:var(--radius);box-shadow:var(--shadow);margin-top:24px}
.filters label{display:grid;gap:6px}
.filters span{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.filters input,.filters select{width:100%;height:42px;border-radius:8px;border:1px solid var(--line);padding:0 12px;font:inherit;background:#fff;color:var(--text)}
.empty{padding:20px;text-align:center;color:var(--muted);background:var(--surface);border-radius:var(--radius)}
.hidden{display:none!important}
.comment-list{display:grid;gap:12px}
.comment{background:var(--surface);border-radius:var(--radius);padding:16px;box-shadow:var(--shadow)}
.comment-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:8px}
.comment-head strong{font-size:14px}
.comment-head small{color:var(--muted);font-size:12px}
.comment p{font-size:14px;line-height:1.55;color:var(--text)}
.footer{margin-top:60px;padding:24px;text-align:center;color:var(--muted);font-size:13px;border-top:1px solid var(--line)}
.footer small{font-size:11px}
@media (max-width:720px){
  .topbar{flex-direction:column;align-items:stretch}
  .nav{justify-content:space-between;flex-wrap:wrap}
  .hero{padding:24px}
  .hero-stats{gap:20px}
  .filters{grid-template-columns:1fr}
}`;
}

function buildClientJs() {
  return `(()=>{
const s=document.getElementById('search');const m=document.getElementById('market-filter');const c=document.getElementById('category-filter');const g=document.getElementById('product-grid');const n=document.getElementById('count');const e=document.getElementById('empty');if(!g)return;
const norm=v=>String(v||'').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/\\s+/g,' ').trim();
const apply=()=>{const q=s?norm(s.value):'';const mm=m?m.value:'';const cc=c?c.value:'';let v=0;for(const card of g.children){const show=(!q||(card.dataset.search||'').includes(q))&&(!mm||card.dataset.market===mm)&&(!cc||card.dataset.category===cc);card.classList.toggle('hidden',!show);if(show)v++;}if(n)n.textContent=v;if(e)e.classList.toggle('hidden',v!==0);};
[s,m,c].forEach(el=>el&&el.addEventListener('input',apply));[s,m,c].forEach(el=>el&&el.addEventListener('change',apply));
})();`;
}

function buildSitemap() {
  const urls = [`${siteUrl}/`, `${siteUrl}/urunler/`];
  for (const m of orderedMarkets) {
    urls.push(`${siteUrl}/market/${m.id}/`);
    const cats = catalogsByMarket.get(m.id) || [];
    for (const c of cats) urls.push(`${siteUrl}/market/${m.id}/${c.id}/`);
  }
  const items = urls.map((u) => `<url><loc>${escapeHtml(u)}</loc><lastmod>${new Date().toISOString()}</lastmod></url>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items}</urlset>`;
}

function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const k = row[key];
    if (!k) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(row);
  }
  return map;
}

function orderMarkets(list, preferred) {
  const preferredSet = new Map(preferred.map((id, i) => [id, i]));
  return list.slice().sort((a, b) => {
    const ai = preferredSet.has(a.id) ? preferredSet.get(a.id) : 1000;
    const bi = preferredSet.has(b.id) ? preferredSet.get(b.id) : 1000;
    if (ai !== bi) return ai - bi;
    return (a.name || a.id).localeCompare(b.name || b.id, "tr");
  });
}

function marketLabel(m) {
  if (!m) return "";
  return siteConfig.marketLabels[m.id] || m.name || m.id;
}

function marketColor(id) {
  return siteConfig.marketColors[id] || "#e11d48";
}

function dateRange(c) {
  if (!c?.week_start || !c?.week_end) return "";
  const fmt = (d) => new Date(d).toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
  return `${fmt(c.week_start)} – ${fmt(c.week_end)}`;
}

function formatPrice(v) {
  if (v == null || v === "") return "—";
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(Number(v) || 0);
}

function normalize(v) {
  return String(v || "").toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

function escapeHtml(v) {
  return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
