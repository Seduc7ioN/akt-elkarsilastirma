import { mkdir, readFile, rm, writeFile, readdir, copyFile, stat } from "node:fs/promises";
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
const [markets, catalogsRaw, productsRaw, comments] = await Promise.all([
  db.query("markets", "select=*"),
  db.query("weekly_catalogs", "select=*&order=week_start.desc"),
  db.queryAll("products", "select=*&order=scraped_at.desc"),
  db.query("comments", "select=*&order=created_at.desc&limit=500"),
]);

// --- Mojibake duzeltici: iki kat bozuk Turkce metinleri onar.
//     Katman 1: "AktÃ¼el" -> "Aktüel" (UTF-8 over Latin-1)
//     Katman 2: "SÃ±vÃ±" -> "Sıvı" (0xC3 0x84 -> 0xC4 byte replace oncesi UTF-8 decode)
const MOJIBAKE_RE = /[\u00C0-\u00FF]/;
const TR_RE = /[üöçşğıİŞĞÇÖÜ]/;
const TR_WORD_RE = /[a-zçğıİöşüA-ZÇĞİÖŞÜ]/;
function toBytes(s) {
  // Her karakter Latin-1 araliginda (<=0xFF) ise o byte'a cevir.
  const bytes = [];
  for (let i = 0; i < s.length; i++) {
    const cp = s.charCodeAt(i);
    if (cp > 0xFF) return null;
    bytes.push(cp);
  }
  return bytes;
}
function candidate(bytes) {
  try { return Buffer.from(bytes).toString("utf8"); } catch { return null; }
}
function fixMojibake(s) {
  if (!s || typeof s !== "string" || !MOJIBAKE_RE.test(s)) return s;
  const bytes = toBytes(s);
  if (!bytes) return s;
  const attempts = [];
  // Aday 1: dogrudan UTF-8 decode (katman 1 mojibake)
  const a1 = candidate(bytes);
  if (a1) attempts.push(a1);
  // Aday 2: once 0xC3 0x83/84/85 -> 0xC3/C4/C5 byte kisalt, sonra UTF-8 decode (katman 2)
  const shrunk = [];
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0xC3 && (bytes[i+1] === 0x83 || bytes[i+1] === 0x84 || bytes[i+1] === 0x85)) {
      shrunk.push(bytes[i+1] - 0x83 + 0xC3);
      i++;
    } else {
      shrunk.push(bytes[i]);
    }
  }
  const a2 = candidate(shrunk);
  if (a2 && a2 !== a1) attempts.push(a2);
  // En iyisi: Turkce karakter iceren, mojibake kalmayan, harf sayisi yuksek olan.
  let best = s, bestScore = -1;
  const score = (t) => {
    if (!t) return -1;
    if (MOJIBAKE_RE.test(t)) return -1; // hala bozuk
    if (/[\u0080-\u009F]/.test(t)) return -1; // kontrol karakterleri
    if (/\uFFFD/.test(t)) return -1; // replacement chars
    const tr = (t.match(new RegExp(TR_WORD_RE.source, "g")) || []).length;
    return tr;
  };
  for (const cand of attempts) {
    const sc = score(cand);
    if (sc > bestScore) { bestScore = sc; best = cand; }
  }
  // Orijinal de bozuk degilse bir degisiklik yapma.
  if (!MOJIBAKE_RE.test(s)) return s;
  // Orijinalden skorca iyilestirme var mi?
  if (bestScore > 0 && best !== s) return best;
  return s;
}
function fixFields(obj, keys) {
  if (!obj) return;
  for (const k of keys) if (obj[k]) obj[k] = fixMojibake(obj[k]);
}
let mojibakeFixCount = 0;
const countFix = (before, after) => { if (before !== after) mojibakeFixCount++; };
for (const m of markets) {
  const b = m.name; fixFields(m, ["name", "description"]); countFix(b, m.name);
}
for (const c of catalogsRaw) {
  const b = c.period_text; fixFields(c, ["period_text", "title", "description"]); countFix(b, c.period_text);
}
for (const p of productsRaw) {
  const bn = p.name, bc = p.category, bb = p.badge;
  fixFields(p, ["name", "category", "badge", "description"]);
  if (bn !== p.name || bc !== p.category || bb !== p.badge) mojibakeFixCount++;
}
if (mojibakeFixCount) console.log(`  ${mojibakeFixCount} kayit mojibake'den duzeltildi.`);

// --- "Sayfa N" sahte urunleri: broşür sayfalarını ürün olarak yazmış scraper.
//     Bunları ürün listelerinden çıkarıp catalog.pages[] olarak topla ki
//     broşür modal gerçek sayfaları göstersin.
const pageBuckets = new Map(); // catalog_id -> Map<pageIndex, imageUrl>
const keptProducts = [];
let fakePageCount = 0;
const SAYFA_RE = /\bsayfa\s+(\d+)\b/i;
for (const p of productsRaw) {
  const m = (p.name || "").match(SAYFA_RE);
  if (m && p.catalog_id && p.image) {
    const idx = Math.max(0, parseInt(m[1], 10) - 1);
    if (!pageBuckets.has(p.catalog_id)) pageBuckets.set(p.catalog_id, new Map());
    const bucket = pageBuckets.get(p.catalog_id);
    if (!bucket.has(idx)) bucket.set(idx, p.image);
    fakePageCount++;
    continue;
  }
  keptProducts.push(p);
}
// Kataloglara pages alani ekle (bellek icinde; DB schema'sini degistirmez).
for (const c of catalogsRaw) {
  const bucket = pageBuckets.get(c.id);
  if (!bucket || !bucket.size) continue;
  const max = Math.max(...bucket.keys());
  const arr = new Array(max + 1).fill(null);
  for (const [i, url] of bucket) arr[i] = url;
  c.pages = arr.filter(Boolean);
}
if (fakePageCount) console.log(`  ${fakePageCount} "Sayfa N" sahte urun urunden cikarildi, broşür sayfalarina donusturuldu.`);
const products = keptProducts;

// 0 urunlu kataloglari her yerde gizle — sayfa uretmez, listede gorunmez.
const productsByCatalog = groupBy(products, "catalog_id");
const catalogs = catalogsRaw.filter((c) => (productsByCatalog.get(c.id) || []).length > 0);
const emptyCatalogCount = catalogsRaw.length - catalogs.length;

console.log(`${markets.length} market, ${catalogs.length} katalog${emptyCatalogCount ? ` (${emptyCatalogCount} bos katalog gizlendi)` : ""}, ${products.length} urun, ${comments.length} yorum.`);

const marketById = new Map(markets.map((m) => [m.id, m]));
const catalogById = new Map(catalogs.map((c) => [c.id, c]));
const catalogsByMarket = groupBy(catalogs, "market_id");

// Scraper bazen urun gorseli olarak brosurun TAM sayfasini ayarliyor.
// Bu durumda UI'da dev brosur thumbnail olarak cikiyor; gorseli notrlestir.
const normalizeUrl = (u) => String(u || "").trim().replace(/[?#].*$/, "").toLowerCase();
const pageUrlSet = new Set();
for (const c of catalogsRaw) {
  if (c.cover_image) pageUrlSet.add(normalizeUrl(c.cover_image));
  if (Array.isArray(c.pages)) for (const p of c.pages) if (p) pageUrlSet.add(normalizeUrl(p));
}
let neutralizedImages = 0;
for (const p of products) {
  if (p.image && pageUrlSet.has(normalizeUrl(p.image))) {
    p.image = null;
    neutralizedImages++;
  }
}
if (neutralizedImages) console.log(`  ${neutralizedImages} urun gorseli brosur sayfasi oldugu icin placeholder'a cevrildi.`);

const productsByMarket = groupBy(products, "market_id");
const commentsByMarket = groupBy(comments, "market_id");

const latestCatalogByMarket = new Map();
for (const [mid, list] of catalogsByMarket) latestCatalogByMarket.set(mid, list[0]);

const orderedMarkets = orderMarkets(markets, siteConfig.marketOrder);

const TR_MONTHS = ["ocak","subat","mart","nisan","mayis","haziran","temmuz","agustos","eylul","ekim","kasim","aralik"];
const POPULAR_KEYWORDS = [
  { slug: "su", label: "Su", patterns: ["su","sular","icme","dogal kaynak"] },
  { slug: "sut", label: "Süt", patterns: ["sut","süt","uht"] },
  { slug: "yumurta", label: "Yumurta", patterns: ["yumurta"] },
  { slug: "peynir", label: "Peynir", patterns: ["peynir","beyaz peynir","kasar"] },
  { slug: "ekmek", label: "Ekmek", patterns: ["ekmek","tost ekmek"] },
  { slug: "makarna", label: "Makarna", patterns: ["makarna","spagetti","penne"] },
  { slug: "pirinc", label: "Pirinç", patterns: ["pirinc","pirinç"] },
  { slug: "un", label: "Un", patterns: ["un "] },
  { slug: "seker", label: "Şeker", patterns: ["seker","şeker","toz seker"] },
  { slug: "yag", label: "Yağ", patterns: ["ayciček yag","ayçiçek","zeytinyag","zeytinyağ","sivi yag","sıvı yağ"] },
  { slug: "cay", label: "Çay", patterns: ["cay","çay"] },
  { slug: "kahve", label: "Kahve", patterns: ["kahve"] },
  { slug: "tavuk", label: "Tavuk", patterns: ["tavuk"] },
  { slug: "kiyma", label: "Kıyma", patterns: ["kiyma","kıyma"] },
  { slug: "cikolata", label: "Çikolata", patterns: ["cikolata","çikolata"] },
  { slug: "biskuvi", label: "Bisküvi", patterns: ["biskuvi","bisküvi"] },
  { slug: "deterjan", label: "Çamaşır Deterjanı", patterns: ["deterjan","omo","ariel","persil"] },
  { slug: "sampuan", label: "Şampuan", patterns: ["sampuan","şampuan"] },
  { slug: "kola", label: "Kola", patterns: ["kola"] },
  { slug: "domates", label: "Domates / Salça", patterns: ["domates","salca","salça"] },
];
const popularCompare = computePopularProducts(products);
const categoriesCfg = siteConfig.categories || [];

await rm(distDir, { recursive: true, force: true });
await mkdir(path.join(distDir, "market"), { recursive: true });
await mkdir(path.join(distDir, "urunler"), { recursive: true });
await mkdir(path.join(distDir, "urun"), { recursive: true });
await mkdir(path.join(distDir, "kategori"), { recursive: true });

await Promise.all([
  writeFile(path.join(distDir, "styles.css"), buildStyles(), "utf8"),
  writeFile(path.join(distDir, "app.js"), buildClientJs(), "utf8"),
  writeFile(path.join(distDir, "index.html"), renderHome(), "utf8"),
  writeFile(path.join(distDir, "urunler/index.html"), renderAllProducts(), "utf8"),
  writeFile(path.join(distDir, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`, "utf8"),
  writeFile(path.join(distDir, "sitemap.xml"), buildSitemap(), "utf8"),
]);

for (const market of orderedMarkets) {
  const marketSlug = `${market.id}-aktuel`;
  const prettyDir = path.join(distDir, marketSlug);
  const legacyDir = path.join(distDir, "market", market.id);
  await mkdir(prettyDir, { recursive: true });
  await mkdir(legacyDir, { recursive: true });
  const marketHtml = renderMarket(market);
  await writeFile(path.join(prettyDir, "index.html"), marketHtml, "utf8");
  await writeFile(path.join(legacyDir, "index.html"), redirectHtml(`/${marketSlug}/`), "utf8");

  const cats = catalogsByMarket.get(market.id) || [];
  for (const catalog of cats) {
    const dateSlug = dateSlugForCatalog(catalog);
    const prettyCatDir = path.join(prettyDir, dateSlug);
    const legacyCatDir = path.join(legacyDir, catalog.id);
    await mkdir(prettyCatDir, { recursive: true });
    await mkdir(legacyCatDir, { recursive: true });
    const catHtml = renderCatalog(market, catalog);
    await writeFile(path.join(prettyCatDir, "index.html"), catHtml, "utf8");
    await writeFile(path.join(legacyCatDir, "index.html"), redirectHtml(`/${marketSlug}/${dateSlug}/`), "utf8");
  }
}

for (const item of popularCompare) {
  const dir = path.join(distDir, "urun", item.slug);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "index.html"), renderCompare(item), "utf8");
}

for (const cat of categoriesCfg) {
  const dir = path.join(distDir, "kategori", cat.id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "index.html"), renderCategoryPage(cat), "utf8");
}

for (const page of corporatePages()) {
  const dir = path.join(distDir, page.slug);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "index.html"), renderCorporate(page), "utf8");
}

// static/ altindaki dosyalari dist/'e aynen kopyala (ornek: sosyal.php, sosyal-data/.htaccess)
await copyStaticTree(path.join(root, "static"), distDir);

console.log(`Build tamamlandi -> ${distDir}`);

async function copyStaticTree(srcRoot, dstRoot) {
  let entries;
  try { entries = await readdir(srcRoot, { withFileTypes: true }); }
  catch { return; }
  for (const e of entries) {
    const src = path.join(srcRoot, e.name);
    const dst = path.join(dstRoot, e.name);
    if (e.isDirectory()) {
      await mkdir(dst, { recursive: true });
      await copyStaticTree(src, dst);
    } else if (e.isFile()) {
      await mkdir(path.dirname(dst), { recursive: true });
      await copyFile(src, dst);
    }
  }
}

function renderHome() {
  const latestCatalogs = orderedMarkets
    .map((m) => ({ market: m, catalog: latestCatalogByMarket.get(m.id) }))
    .filter((x) => x.catalog);
  const topDiscounts = diversifyByMarket(
    products
      .filter((p) => p.discount_pct && p.discount_pct > 0)
      .sort((a, b) => (b.discount_pct || 0) - (a.discount_pct || 0)),
    2,
    12
  );
  const recentProducts = products.slice(0, 24);

  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const endingSoon = catalogs
    .map((c) => ({ catalog: c, market: marketById.get(c.market_id), end: c.week_end ? new Date(c.week_end).getTime() : null }))
    .filter((x) => x.market && x.end && x.end >= now && x.end - now <= weekMs)
    .sort((a, b) => a.end - b.end)
    .slice(0, 8);

  const latestBrochures = catalogs
    .map((c) => ({ catalog: c, market: marketById.get(c.market_id) }))
    .filter((x) => x.market)
    .sort((a, b) => new Date(b.catalog.scraped_at || 0) - new Date(a.catalog.scraped_at || 0))
    .slice(0, 10);

  const categories = siteConfig.categories || [];
  const marketCategory = siteConfig.marketCategory || {};
  const byCategory = new Map(categories.map((c) => [c.id, []]));
  for (const { market, catalog } of latestCatalogs) {
    const cid = marketCategory[market.id];
    if (cid && byCategory.has(cid)) byCategory.get(cid).push({ market, catalog });
  }

  return layout(
    siteConfig.site.title,
    siteConfig.site.description,
    `<main class="page">
      ${renderHeader("home")}

      <section class="hero">
        <div>
          <p class="eyebrow">Canlı akış</p>
          <h1>${escapeHtml(siteConfig.site.tagline)}</h1>
          <p class="hero-sub">BİM, A101, ŞOK, Migros, Hakmar ve daha fazla market. Haftalık katalog ve aktüel ürünler tek akışta.</p>
          <form class="hero-search" action="/urunler/" method="get" role="search">
            <input type="search" name="q" placeholder="Ürün ara... (Örn: peynir, deterjan, şampuan)" aria-label="Ürün ara">
            <button type="submit" class="btn primary">Ara</button>
          </form>
          <div class="hero-stats">
            <div><strong>${markets.length}</strong><span>market</span></div>
            <div><strong>${catalogs.length}</strong><span>katalog</span></div>
            <div><strong>${products.length}</strong><span>ürün</span></div>
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
        <div class="section-head"><h2>Bu haftanın öne çıkan broşürleri</h2><small>${latestCatalogs.length} aktif</small></div>
        <div class="catalog-grid">
          ${latestCatalogs.map(({ market, catalog }) => renderCatalogCard(market, catalog)).join("")}
        </div>
      </section>

      ${latestBrochures.length ? `
      <section class="section">
        <div class="section-head">
          <div><p class="eyebrow">Son gelen broşürler</p><h2>En yeni kataloglar</h2></div>
          <small>${latestBrochures.length} broşür</small>
        </div>
        <p class="muted" style="margin-bottom:16px">${escapeHtml(latestBrochures.map(x => marketLabel(x.market)).slice(0, 8).join(", "))} için en son eklenen broşürler.</p>
        <div class="catalog-grid">
          ${latestBrochures.map(({ market, catalog }) => renderCatalogCard(market, catalog)).join("")}
        </div>
      </section>` : ""}

      ${categories.some((c) => (byCategory.get(c.id) || []).length) ? `
      <section class="section" id="kategoriler">
        <div class="section-head">
          <div><p class="eyebrow">Kategori akışı</p><h2>Kategorilere göre indirimler</h2></div>
        </div>
        ${categories.map((cat) => {
          const items = byCategory.get(cat.id) || [];
          if (!items.length) return "";
          return `<div class="category-block" style="--accent:${cat.accent}">
            <div class="category-head"><h3>${escapeHtml(cat.label)}</h3><small>${items.length}</small></div>
            <div class="catalog-grid">
              ${items.slice(0, 8).map(({ market, catalog }) => renderCatalogCard(market, catalog)).join("")}
            </div>
          </div>`;
        }).join("")}
      </section>` : ""}

      ${endingSoon.length ? `
      <section class="section">
        <div class="section-head"><h2>Yakında bitiyor</h2><small>${endingSoon.length} katalog · 7 gün içinde</small></div>
        <div class="catalog-grid">
          ${endingSoon.map(({ market, catalog }) => renderCatalogCard(market, catalog, { endingSoon: true })).join("")}
        </div>
      </section>` : ""}

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

      ${popularCompare.length ? `<section class="section">
        <div class="section-head"><div><p class="eyebrow">Popüler karşılaştırmalar</p><h2>Market market fiyat karşılaştırması</h2></div></div>
        <div class="chip-row">${popularCompare.slice(0, 16).map((c) => `<a class="chip" href="/urun/${c.slug}/">${escapeHtml(c.label)} <small>${c.items.length}</small></a>`).join("")}</div>
      </section>` : ""}

      ${renderFooter()}
    </main>`,
    {
      canonical: "/",
      jsonLd: [
        websiteLd(),
        itemListLd(recentProducts, "/"),
      ],
    }
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
      ${renderBreadcrumb([{ name: "Anasayfa", url: "/" }, { name: marketLabel(market) }])}

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
    {
      type: "market",
      canonical: marketUrl(market),
      jsonLd: [
        breadcrumbLd([
          { name: "Anasayfa", path: "/" },
          { name: marketLabel(market), path: marketUrl(market) },
        ]),
        itemListLd(marketProducts, marketUrl(market)),
      ],
    }
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
  const rawPages = Array.isArray(catalog.pages) ? catalog.pages.filter(Boolean) : [];
  const coverImage = catalog.cover_image || rawPages[0] || catProducts.find((p) => p.image)?.image || "";
  // Broşür modal icin sayfa kaynagi: pages varsa onu kullan, yoksa kapak + urun gorselleri fallback.
  const pages = rawPages.length ? rawPages : (coverImage ? [coverImage] : []);
  const galleryProducts = catProducts.filter((p) => p.image);
  const otherCats = (catalogsByMarket.get(market.id) || []).filter((c) => c.id !== catalog.id).slice(0, 6);
  const st = catalogStatus(catalog);

  return layout(
    `${marketLabel(market)} ${catalogTitle(catalog)} kataloğu`,
    `${marketLabel(market)} ${catalogTitle(catalog)} haftalık aktüel ürünleri.`,
    `<main class="page">
      ${renderHeader("market")}
      ${renderBreadcrumb([{ name: "Anasayfa", url: "/" }, { name: marketLabel(market), url: marketUrl(market) }, { name: catalogTitle(catalog) || "Katalog" }])}

      <section class="hero market-hero catalog-hero" style="--accent:${color}">
        <div>
          <p class="eyebrow"><a href="${marketUrl(market)}">${escapeHtml(marketLabel(market))}</a> · haftalık broşür ${st ? `<span class="status-pill status-${st.cls}">${st.label}</span>` : ""}</p>
          <h1>${escapeHtml(catalogTitle(catalog))}</h1>
          <p class="hero-sub">${catProducts.length}+ ürün · ${dateRange(catalog)}</p>
          <div class="hero-actions">
            <a class="btn primary" href="#brochure">Broşürü görüntüle</a>
            ${market.website ? `<a class="btn" href="${escapeHtml(market.website)}" target="_blank" rel="noopener">Resmi site</a>` : ""}
          </div>
        </div>
        ${coverImage ? `<button type="button" class="catalog-cover brochure-page" data-brochure-index="0" aria-label="Broşürü büyüt"><img src="${escapeHtml(coverImage)}" alt="${escapeHtml(marketLabel(market))} broşür kapağı" loading="lazy"><span class="brochure-page-hint">Tıkla · Broşürü aç</span></button>` : ""}
      </section>

      ${rawPages.length > 1 ? `
      <section class="section">
        <div class="section-head"><h2>Broşür sayfaları</h2><small>${rawPages.length} sayfa · tıkla büyüt</small></div>
        <div class="brochure-pages">
          ${rawPages.map((src, i) => `<button type="button" class="brochure-page" data-brochure-index="${i}" aria-label="Sayfa ${i + 1} — büyüt"><img src="${escapeHtml(src)}" alt="Sayfa ${i + 1}" loading="lazy"><span>${i + 1}</span><span class="brochure-page-hint">Tıkla</span></button>`).join("")}
        </div>
      </section>` : ""}

      <script id="catalog-brochure-data" type="application/json">${escapeJsonForScript(JSON.stringify({
        market: { id: market.id, label: marketLabel(market), color, url: marketUrl(market) },
        catalogTitle: catalogTitle(catalog),
        dateRange: dateRange(catalog),
        pages,
        products: catProducts.map(productPayloadMin),
      }))}</script>

      ${galleryProducts.length ? `
      <section class="section" id="brochure">
        <div class="section-head"><h2>Broşür galerisi</h2><small>${galleryProducts.length} görsel · tıkla detay</small></div>
        <div class="brochure-gallery">
          ${galleryProducts.slice(0, 60).map(renderGalleryTile).join("")}
        </div>
      </section>` : ""}

      <section class="section">
        <div class="section-head"><h2>Katalog ürünleri</h2><small>${catProducts.length} ürün</small></div>
        <div class="product-grid">
          ${catProducts.map(renderProductCard).join("") || `<p class="empty">Bu katalogda henüz ürün yok.</p>`}
        </div>
      </section>

      ${otherCats.length ? `<section class="section">
        <div class="section-head"><h2>Diğer ${escapeHtml(marketLabel(market))} broşürleri</h2><small>${otherCats.length}</small></div>
        <div class="catalog-grid">${otherCats.map((c) => renderCatalogCard(market, c)).join("")}</div>
      </section>` : ""}

      <section class="section faq">
        <div class="section-head"><h2>Sık sorulan sorular</h2></div>
        <details><summary>${escapeHtml(marketLabel(market))} aktüel katalog ne zaman geçerli?</summary><p>Bu katalog <strong>${dateRange(catalog) || "ilan edilen tarihler"}</strong> arasında geçerlidir. Son geçerli fiyat ve stok bilgisi mağazadadır.</p></details>
        <details><summary>Broşürdeki ürünler tüm şubelerde var mı?</summary><p>Stoklar şubeden şubeye değişebilir. Belirli bir ürünün bulunup bulunmadığını marketin çağrı merkezinden veya resmi sitesinden teyit etmeniz önerilir.</p></details>
        <details><summary>Fiyatlar neden değişebilir?</summary><p>Marketler kampanyayı erken bitirebilir veya stokları tükendiğinde fiyatı güncelleyebilir. Bu sayfadaki fiyatlar marketin paylaştığı en güncel veriye dayanmaktadır.</p></details>
        <details><summary>Başka marketlerin katalogları nerede?</summary><p><a href="/">Anasayfadan</a> tüm marketlere ve haftalık broşürlere ulaşabilirsiniz.</p></details>
      </section>

      ${renderFooter()}
    </main>`,
    {
      type: "article",
      canonical: catalogUrl(market, catalog),
      jsonLd: [
        breadcrumbLd([
          { name: "Anasayfa", path: "/" },
          { name: marketLabel(market), path: marketUrl(market) },
          { name: catalogTitle(catalog) || "Katalog", path: catalogUrl(market, catalog) },
        ]),
        itemListLd(catProducts, catalogUrl(market, catalog)),
        {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            { "@type": "Question", name: `${marketLabel(market)} aktüel katalog ne zaman geçerli?`, acceptedAnswer: { "@type": "Answer", text: `${dateRange(catalog) || "İlan edilen tarihler"} arasında geçerlidir.` } },
            { "@type": "Question", name: "Broşürdeki ürünler tüm şubelerde var mı?", acceptedAnswer: { "@type": "Answer", text: "Stoklar şubeden şubeye değişebilir." } },
          ],
        },
      ],
    }
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

      ${renderBreadcrumb([{ name: "Anasayfa", url: "/" }, { name: "Arama sonuçları" }])}

      <section class="search-hero">
        <div class="search-hero-text">
          <h1 id="results-title">Tüm aktüel ürünler</h1>
          <p id="results-sub" class="muted"><span id="count">${all.length}</span> ürün bulundu</p>
        </div>
        <button type="button" class="filter-toggle" id="filter-toggle" aria-expanded="false">
          <span class="filter-icon">⎘</span> FİLTRE
        </button>
      </section>

      <section class="filters collapsible" id="filters">
        <label><span>Ürün ara</span><input id="search" type="search" placeholder="süt, deterjan, şampuan..."></label>
        <label><span>Market</span><select id="market-filter"><option value="">Tüm marketler</option>${orderedMarkets.map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(marketLabel(m))}</option>`).join("")}</select></label>
        <label><span>Kategori</span><select id="category-filter"><option value="">Tüm kategoriler</option>${categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}</select></label>
        <label><span>Min ₺</span><input id="price-min" type="number" min="0" step="1" placeholder="0"></label>
        <label><span>Max ₺</span><input id="price-max" type="number" min="0" step="1" placeholder="∞"></label>
        <label><span>Sıralama</span><select id="sort">
          <option value="recent">Son eklenen</option>
          <option value="price-asc">Fiyat (artan)</option>
          <option value="price-desc">Fiyat (azalan)</option>
          <option value="discount-desc">İndirim (%)</option>
        </select></label>
      </section>

      <section class="section">
        <div class="product-list" id="product-grid">
          ${all.map(renderProductRow).join("")}
        </div>
        <p class="empty hidden" id="empty">Filtrelere uygun ürün bulunamadı.</p>
      </section>

      ${renderFooter()}
    </main>`,
    {
      canonical: "/urunler/",
      jsonLd: [
        breadcrumbLd([
          { name: "Anasayfa", path: "/" },
          { name: "Tüm ürünler", path: "/urunler/" },
        ]),
        itemListLd(all, "/urunler/"),
      ],
    }
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
      <a href="/#kategoriler" class="${active === "kategori" ? "active" : ""}">Kategoriler</a>
    </nav>
  </header>`;
}

function renderFooter() {
  const footerCfg = siteConfig.footer || {};
  const corporate = footerCfg.corporate || [];
  const popularIds = footerCfg.popularMarkets || [];
  const popularMarkets = popularIds.map((id) => marketById.get(id)).filter(Boolean);
  const cats = siteConfig.categories || [];
  return `<footer class="footer">
    <div class="footer-grid">
      <div class="footer-brand">
        <strong>${escapeHtml(siteConfig.site.title)}</strong>
        <p>${escapeHtml(siteConfig.site.description)}</p>
      </div>
      ${corporate.length ? `<div class="footer-col">
        <h4>Kurumsal &amp; Güven</h4>
        <ul>${corporate.map((l) => `<li><a href="${escapeHtml(l.href)}">${escapeHtml(l.label)}</a></li>`).join("")}</ul>
      </div>` : ""}
      ${popularMarkets.length ? `<div class="footer-col">
        <h4>Popüler Marketler</h4>
        <ul>
          ${popularMarkets.map((m) => `<li><a href="/market/${m.id}/">${escapeHtml(marketLabel(m))}</a></li>`).join("")}
          <li><a href="/#marketler" class="footer-more">Tüm Marketler →</a></li>
        </ul>
      </div>` : ""}
      ${cats.length ? `<div class="footer-col">
        <h4>Kategoriler</h4>
        <ul>${cats.slice(0, 5).map((c) => `<li><a href="/kategori/${escapeHtml(c.id)}/">${escapeHtml(c.label)}</a></li>`).join("")}<li><a href="/#kategoriler" class="footer-more">Tüm Kategoriler →</a></li></ul>
      </div>` : ""}
      ${popularCompare.length ? `<div class="footer-col">
        <h4>Popüler Karşılaştırmalar</h4>
        <ul>${popularCompare.slice(0, 7).map((p) => `<li><a href="/urun/${escapeHtml(p.slug)}/">${escapeHtml(p.label)}</a></li>`).join("")}</ul>
      </div>` : ""}
    </div>
    <div class="footer-bottom">
      <p>© ${new Date().getFullYear()} ${escapeHtml(siteConfig.site.title)} · Veriler her marketin resmi sitesinden alınmaktadır.</p>
      <p><small>Son güncelleme: ${new Date().toLocaleString("tr-TR")}</small></p>
    </div>
  </footer>`;
}

function renderMarketCard(market) {
  const color = marketColor(market.id);
  const count = (productsByMarket.get(market.id) || []).length;
  return `<a class="market-card" href="${marketUrl(market)}" style="--accent:${color}">
    <span class="market-mark">${escapeHtml(marketLabel(market).slice(0, 2).toUpperCase())}</span>
    <strong>${escapeHtml(marketLabel(market))}</strong>
    <small>${count} ürün · ${market.branch_count || "?"} şube</small>
  </a>`;
}

function renderCatalogCard(market, catalog, opts = {}) {
  const color = marketColor(market.id);
  const count = (productsByCatalog.get(catalog.id) || []).length;
  let badge = "";
  if (opts.endingSoon && catalog.week_end) {
    const days = Math.max(0, Math.ceil((new Date(catalog.week_end).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
    badge = `<span class="tag discount">${days === 0 ? "Bugün bitiyor" : `${days} gün kaldı`}</span>`;
  }
  const cover = catalog.cover_image || (Array.isArray(catalog.pages) && catalog.pages[0]) || (productsByCatalog.get(catalog.id) || []).find((p) => p.image)?.image || "";
  const st = !opts.endingSoon ? catalogStatus(catalog) : null;
  const statusBadge = st ? `<span class="status-pill status-${st.cls}">${st.label}</span>` : "";
  return `<a class="catalog-card has-cover" href="${catalogUrl(market, catalog)}" style="--accent:${color}">
    <div class="catalog-cover-sm${cover ? "" : " placeholder"}">
      ${cover ? `<img src="${escapeHtml(cover)}" alt="${escapeHtml(marketLabel(market))} broşür" loading="lazy">` : ""}
      ${badge || statusBadge}
    </div>
    <div class="catalog-card-body">
      <div class="catalog-card-head">
        <span class="market-dot"></span>
        <strong>${escapeHtml(marketLabel(market))}</strong>
      </div>
      <h3>${escapeHtml(catalogTitle(catalog))}</h3>
      <p>${dateRange(catalog)}</p>
      <small>${count}+ ürün</small>
      <span class="catalog-cta">Broşürü İncele →</span>
    </div>
  </a>`;
}

function renderGalleryTile(p) {
  const market = marketById.get(p.market_id);
  const color = marketColor(p.market_id);
  const payload = JSON.stringify({
    id: p.id, name: p.name || "", image: p.image || "", price: p.price ?? null,
    oldPrice: p.old_price ?? null, discount: p.discount_pct || 0, category: p.category || "",
    market: marketLabel(market), marketId: p.market_id || "", color, url: p.url || "", badge: p.badge || "",
  });
  return `<button type="button" class="gallery-tile product-card" data-product="${escapeHtml(payload)}" data-category="${escapeHtml(p.category || "")}" data-market="${escapeHtml(p.market_id || "")}" style="--accent:${color}">
    <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name || "")}" loading="lazy">
    ${p.discount_pct ? `<span class="gallery-discount">%${p.discount_pct}</span>` : ""}
    <span class="gallery-price">${formatPrice(p.price)}</span>
  </button>`;
}

function renderProductCard(p) {
  const market = marketById.get(p.market_id);
  const color = marketColor(p.market_id);
  const search = normalize(`${p.name || ""} ${p.category || ""} ${marketLabel(market)}`);
  const priceNum = Number(p.price);
  const price = Number.isFinite(priceNum) ? priceNum : "";
  const discount = Number(p.discount_pct) || 0;
  const ts = p.scraped_at ? new Date(p.scraped_at).getTime() || 0 : 0;
  const payload = JSON.stringify({
    id: p.id,
    name: p.name || "",
    image: p.image || "",
    price: p.price ?? null,
    oldPrice: p.old_price ?? null,
    discount: p.discount_pct || 0,
    category: p.category || "",
    market: marketLabel(market),
    marketId: p.market_id || "",
    color,
    url: p.url || "",
    badge: p.badge || "",
  });
  return `<article class="product-card" tabindex="0" role="button" data-product="${escapeHtml(payload)}" data-search="${escapeHtml(search)}" data-market="${escapeHtml(p.market_id || "")}" data-category="${escapeHtml(p.category || "")}" data-price="${price}" data-discount="${discount}" data-ts="${ts}" style="--accent:${color}">
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
      <span class="product-link">Detay →</span>
    </div>
  </article>`;
}

function renderProductRow(p) {
  const market = marketById.get(p.market_id);
  const color = marketColor(p.market_id);
  const search = normalize(`${p.name || ""} ${p.category || ""} ${marketLabel(market)}`);
  const priceNum = Number(p.price);
  const price = Number.isFinite(priceNum) ? priceNum : "";
  const discount = Number(p.discount_pct) || 0;
  const ts = p.scraped_at ? new Date(p.scraped_at).getTime() || 0 : 0;
  const catalog = p.catalog_id ? catalogById.get(p.catalog_id) : null;
  const st = catalog ? catalogStatus(catalog) : null;
  const dateShort = catalog && catalog.week_start && catalog.week_end
    ? (() => {
        const fmt = (d) => new Date(d).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
        return `${fmt(catalog.week_start)} – ${fmt(catalog.week_end)}`;
      })()
    : "";
  const payload = JSON.stringify({
    id: p.id, name: p.name || "", image: p.image || "",
    price: p.price ?? null, oldPrice: p.old_price ?? null,
    discount: p.discount_pct || 0, category: p.category || "",
    market: marketLabel(market), marketId: p.market_id || "",
    color, url: p.url || "", badge: p.badge || "",
  });
  return `<article class="product-row" tabindex="0" role="button" data-product="${escapeHtml(payload)}" data-search="${escapeHtml(search)}" data-market="${escapeHtml(p.market_id || "")}" data-category="${escapeHtml(p.category || "")}" data-price="${price}" data-discount="${discount}" data-ts="${ts}" style="--accent:${color}">
    <div class="row-thumb">${p.image ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name || "")}" loading="lazy">` : ""}</div>
    <div class="row-main">
      <div class="row-chips">
        <span class="chip market-chip">${escapeHtml(marketLabel(market))}</span>
        ${st ? `<span class="chip status-${st.cls}">${escapeHtml(st.label.toUpperCase())}</span>` : ""}
        ${p.discount_pct ? `<span class="chip discount-chip">%${p.discount_pct}</span>` : ""}
      </div>
      <h3>${escapeHtml(p.name || "")}</h3>
      ${p.category ? `<p class="row-cat">${escapeHtml(p.category)}</p>` : ""}
    </div>
    <div class="row-meta">
      ${dateShort ? `<span class="row-date">${escapeHtml(dateShort)}</span>` : ""}
      <div class="row-price">
        <strong>${formatPrice(p.price)}</strong>
        ${p.old_price && Number(p.old_price) > Number(p.price || 0) ? `<s>${formatPrice(p.old_price)}</s>` : ""}
      </div>
    </div>
  </article>`;
}

function layout(title, description, content, options = {}) {
  const type = options.type || "website";
  const ogImage = options.ogImage || `${siteUrl}/og-default.png`;
  const canonical = options.canonical ? `${siteUrl}${options.canonical}` : siteUrl;
  const jsonLd = options.jsonLd
    ? (Array.isArray(options.jsonLd) ? options.jsonLd : [options.jsonLd])
        .map((obj) => `<script type="application/ld+json">${JSON.stringify(obj).replaceAll("</", "<\\/")}</script>`)
        .join("")
    : "";
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
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:locale" content="tr_TR">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css?v=${assetVersion}">
${jsonLd}
</head>
<body>
${content}
<div class="modal hidden" id="product-modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
  <div class="modal-backdrop" data-close></div>
  <div class="modal-dialog">
    <button class="modal-close" type="button" data-close aria-label="Kapat">×</button>
    <div class="modal-body" id="product-modal-body"></div>
  </div>
</div>
<div class="modal hidden" id="brochure-modal" role="dialog" aria-modal="true" aria-label="Broşür görüntüleyici">
  <div class="modal-backdrop" data-close></div>
  <div class="modal-dialog modal-dialog-wide brochure-dialog">
    <button class="modal-close" type="button" data-close aria-label="Kapat">×</button>
    <div class="brochure-viewer">
      <div class="brochure-viewer-stage">
        <button type="button" class="brochure-nav prev" id="bv-prev" aria-label="Önceki sayfa">‹</button>
        <div class="brochure-frame" id="bv-frame">
          <img id="bv-img" src="" alt="Broşür sayfası">
          <div class="brochure-hotspots" id="bv-hotspots" aria-hidden="false"></div>
        </div>
        <button type="button" class="brochure-nav next" id="bv-next" aria-label="Sonraki sayfa">›</button>
        <div class="brochure-counter"><span id="bv-i">1</span> / <span id="bv-n">1</span></div>
        <button type="button" class="brochure-hotspot-toggle" id="bv-hs-toggle" aria-pressed="true" title="Tıklanabilir ürünleri göster/gizle">Ürün kutuları: Açık</button>
      </div>
      <div class="brochure-viewer-panel">
        <div class="brochure-panel-head">
          <h3>Bu broşürün ürünleri</h3>
          <small id="bv-count">0 ürün</small>
        </div>
        <div class="product-grid brochure-panel-grid" id="bv-products"></div>
      </div>
    </div>
  </div>
</div>
<script src="/app.js?v=${assetVersion}" defer></script>
</body>
</html>`;
}

function productLd(p) {
  const market = marketById.get(p.market_id);
  const obj = {
    "@type": "Product",
    name: p.name || "",
    ...(p.image ? { image: p.image } : {}),
    ...(p.category ? { category: p.category } : {}),
    ...(market ? { brand: { "@type": "Brand", name: marketLabel(market) } } : {}),
  };
  if (p.price != null && p.price !== "") {
    obj.offers = {
      "@type": "Offer",
      price: String(Number(p.price) || 0),
      priceCurrency: "TRY",
      availability: "https://schema.org/InStock",
      ...(p.url ? { url: p.url } : {}),
    };
  }
  return obj;
}

function itemListLd(products, pathname) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    url: `${siteUrl}${pathname}`,
    numberOfItems: products.length,
    itemListElement: products.slice(0, 60).map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: productLd(p),
    })),
  };
}

function breadcrumbLd(trail) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: `${siteUrl}${t.path}`,
    })),
  };
}

function websiteLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    url: `${siteUrl}/`,
    name: siteConfig.site.title,
    description: siteConfig.site.description,
    inLanguage: "tr-TR",
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl}/urunler/?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
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
.hero-search{display:flex;gap:8px;margin-top:20px;max-width:560px}
.hero-search input{flex:1;height:48px;border-radius:999px;border:1px solid var(--line);padding:0 20px;font:inherit;background:#fff;color:var(--text);box-shadow:var(--shadow)}
.hero-search input:focus{outline:2px solid var(--accent);outline-offset:2px}
.hero-search button{border-radius:999px;padding:0 24px;height:48px}
.btn{display:inline-flex;align-items:center;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px;background:#f1f5f9;border:1px solid var(--line)}
.btn:hover{background:#e2e8f0}
.btn.primary{background:var(--text);color:#fff;border-color:var(--text)}
.btn.primary:hover{background:#1e293b}
.market-hero{border-left:6px solid var(--accent)}
.catalog-hero{display:grid;grid-template-columns:1.5fr 1fr;gap:24px;align-items:center}
.catalog-cover{position:relative;border:0;padding:0;border-radius:var(--radius);overflow:hidden;background:#f1f5f9;aspect-ratio:3/4;box-shadow:var(--shadow);cursor:zoom-in;display:block;width:100%;transition:transform .15s,box-shadow .15s}
.catalog-cover:hover{transform:translateY(-3px);box-shadow:0 12px 28px rgba(15,23,42,.22)}
.catalog-cover:focus-visible{outline:3px solid var(--accent,#e11d48);outline-offset:3px}
.catalog-cover img{width:100%;height:100%;object-fit:cover;display:block}
.catalog-cover .brochure-page-hint{position:absolute;top:10px;right:10px;left:auto;background:var(--accent,#e11d48);color:#fff;font-size:12px;padding:5px 10px;border-radius:999px;font-weight:700;opacity:0;transition:opacity .15s;pointer-events:none}
.catalog-cover:hover .brochure-page-hint,.catalog-cover:focus-visible .brochure-page-hint{opacity:1}
@media (max-width:720px){.catalog-hero{grid-template-columns:1fr}.catalog-cover{aspect-ratio:4/3;max-height:320px}}
.brochure-pages{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}
.brochure-page{position:relative;border:0;padding:0;border-radius:10px;overflow:hidden;background:#f1f5f9;aspect-ratio:3/4;display:block;box-shadow:var(--shadow);cursor:zoom-in;transition:transform .15s,box-shadow .15s;width:100%}
.brochure-page:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(15,23,42,.18)}
.brochure-page:focus-visible{outline:3px solid var(--accent,#e11d48);outline-offset:2px}
.brochure-page img{width:100%;height:100%;object-fit:cover;display:block}
.brochure-page span{position:absolute;bottom:6px;right:8px;background:rgba(15,23,42,.7);color:#fff;font-size:11px;padding:2px 7px;border-radius:999px;font-weight:600}
.brochure-page-hint{position:absolute;top:6px;left:6px;bottom:auto;right:auto;background:var(--accent,#e11d48);color:#fff;font-size:11px;padding:3px 8px;border-radius:999px;font-weight:700;opacity:0;transition:opacity .15s}
.brochure-page:hover .brochure-page-hint,.brochure-page:focus-visible .brochure-page-hint{opacity:1}
.modal-dialog-wide{max-width:min(1280px,96vw);width:min(1280px,96vw)}
.brochure-dialog{padding:0;overflow:hidden}
.brochure-viewer{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);min-height:min(82vh,900px);max-height:90vh}
.brochure-viewer-stage{position:relative;background:#0b0b14;display:flex;align-items:center;justify-content:center;overflow:auto;padding:16px}
.brochure-frame{position:relative;display:inline-block;max-width:100%;max-height:86vh;line-height:0}
.brochure-frame img{max-width:100%;max-height:86vh;object-fit:contain;display:block;background:#0b0b14}
.brochure-hotspots{position:absolute;inset:0;pointer-events:none}
.brochure-hotspot{position:absolute;border:2px solid rgba(225,29,72,.0);background:rgba(225,29,72,.0);border-radius:8px;cursor:pointer;pointer-events:auto;transition:background .15s,border-color .15s,box-shadow .15s;padding:0}
.brochure-hotspot:hover,.brochure-hotspot:focus-visible{background:rgba(225,29,72,.18);border-color:rgba(225,29,72,.9);box-shadow:0 0 0 2px rgba(255,255,255,.25),0 8px 24px rgba(0,0,0,.35);outline:none}
.brochure-hotspot-label{position:absolute;left:0;right:0;bottom:100%;margin-bottom:6px;background:#0b0b14;color:#fff;font-size:12px;padding:4px 8px;border-radius:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px;opacity:0;transform:translateY(4px);transition:opacity .15s,transform .15s;pointer-events:none;box-shadow:0 4px 14px rgba(0,0,0,.3)}
.brochure-hotspot:hover .brochure-hotspot-label,.brochure-hotspot:focus-visible .brochure-hotspot-label{opacity:1;transform:translateY(0)}
.brochure-hotspots.peek .brochure-hotspot{background:rgba(225,29,72,.08);border-color:rgba(225,29,72,.55)}
.brochure-hotspot-toggle{position:absolute;bottom:12px;left:12px;background:rgba(15,23,42,.8);color:#fff;border:0;padding:6px 12px;border-radius:999px;font-size:12px;cursor:pointer;font-weight:600;z-index:3}
.brochure-hotspot-toggle:hover{background:rgba(15,23,42,.95)}
.brochure-hotspots.hidden-hs{display:none}
.brochure-nav{position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;border:0;background:rgba(255,255,255,.9);color:#0f172a;font-size:28px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,.3);z-index:2}
.brochure-nav.prev{left:12px}
.brochure-nav.next{right:12px}
.brochure-nav:disabled{opacity:.35;cursor:not-allowed}
.brochure-counter{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,.75);color:#fff;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:600}
.brochure-viewer-panel{background:var(--surface,#fff);overflow:auto;padding:18px;border-left:1px solid #e5e7eb}
.brochure-panel-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:12px}
.brochure-panel-head h3{margin:0;font-size:16px}
.brochure-panel-head small{color:var(--muted,#64748b);font-size:12px}
.brochure-panel-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.brochure-panel-grid .product-card{padding:0;border-radius:10px}
.brochure-panel-grid .product-body{padding:10px}
.brochure-panel-grid .product-body h3{font-size:13px;line-height:1.3}
.brochure-panel-grid .product-tags{gap:4px}
.brochure-panel-grid .product-tags .tag{font-size:10px;padding:2px 6px}
.brochure-panel-grid .price-row strong{font-size:14px}
.brochure-panel-grid .product-img{aspect-ratio:1/1}
.brochure-panel-grid .product-link{font-size:11px}
@media (max-width:900px){.brochure-viewer{grid-template-columns:1fr;max-height:none}.brochure-viewer-stage{min-height:60vh}.brochure-frame{max-height:60vh}.brochure-frame img{max-height:60vh}.brochure-viewer-panel{border-left:0;border-top:1px solid #e5e7eb;max-height:45vh}}
.brochure-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}
.gallery-tile{position:relative;border:0;padding:0;background:#f1f5f9;border-radius:10px;overflow:hidden;aspect-ratio:1/1;cursor:pointer;transition:transform .15s;box-shadow:0 1px 4px rgba(15,23,42,.06)}
.gallery-tile:hover{transform:scale(1.03);z-index:1;box-shadow:var(--shadow)}
.gallery-tile img{width:100%;height:100%;object-fit:contain;padding:6px}
.gallery-discount{position:absolute;top:6px;left:6px;background:var(--accent);color:#fff;font-size:11px;font-weight:700;padding:3px 7px;border-radius:999px}
.gallery-price{position:absolute;bottom:0;left:0;right:0;background:rgba(255,255,255,.95);font-size:12px;font-weight:700;padding:4px;text-align:center;color:var(--text)}
.section{margin-top:40px}
.section-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:16px}
.section-head small{color:var(--muted);font-size:12px}
.market-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px}
.market-card{display:flex;flex-direction:column;align-items:center;gap:8px;padding:22px 16px;background:var(--surface);border-radius:var(--radius);text-align:center;box-shadow:var(--shadow);border-top:4px solid var(--accent);transition:transform .15s}
.market-card:hover{transform:translateY(-3px)}
.market-mark{display:inline-flex;align-items:center;justify-content:center;width:54px;height:54px;border-radius:50%;background:var(--accent);color:#fff;font-weight:800;font-size:16px}
.market-card strong{font-size:15px}
.market-card small{color:var(--muted);font-size:12px}
.catalog-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}
.catalog-card{display:block;padding:20px;background:var(--surface);border-radius:var(--radius);box-shadow:var(--shadow);border-left:4px solid var(--accent);transition:transform .15s}
.catalog-card:hover{transform:translateY(-3px)}
.catalog-card.has-cover{padding:0;overflow:hidden;border-left:0;border-top:3px solid var(--accent)}
.catalog-cover-sm{position:relative;aspect-ratio:3/4;background:#f1f5f9;overflow:hidden}
.catalog-cover-sm img{width:100%;height:100%;object-fit:cover}
.catalog-cover-sm.placeholder{background:linear-gradient(135deg,#f1f5f9,#e2e8f0)}
.catalog-card-body{padding:14px 16px 16px}
.catalog-card-head{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.market-dot{width:10px;height:10px;border-radius:50%;background:var(--accent)}
.catalog-card h3{font-size:15px;margin:4px 0;line-height:1.3}
.catalog-card p{color:var(--muted);font-size:12px}
.catalog-card small{display:block;margin-top:8px;color:var(--muted);font-size:12px;font-weight:600}
.catalog-cta{display:inline-flex;margin-top:12px;padding:8px 14px;background:var(--accent);color:#fff;border-radius:8px;font-size:12px;font-weight:700}
.status-pill{position:absolute;top:8px;left:8px;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.04em}
.status-today{background:#dc2626}
.status-live{background:#059669}
.status-soon{background:#2563eb}
.breadcrumb{margin:8px 0 20px}
.breadcrumb ol{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:6px;font-size:13px;color:var(--muted)}
.breadcrumb li+li::before{content:"›";margin-right:6px;color:var(--muted)}
.breadcrumb a{color:var(--muted)}
.breadcrumb a:hover{color:var(--accent)}
.breadcrumb span{color:var(--text);font-weight:600}
.chip-row{display:flex;flex-wrap:wrap;gap:8px}
.chip{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:var(--surface);border:1px solid var(--line);border-radius:999px;font-size:13px;font-weight:600;color:var(--text);transition:transform .12s}
.chip:hover{transform:translateY(-2px);border-color:var(--accent);color:var(--accent)}
.chip small{background:var(--accent);color:#fff;border-radius:999px;padding:1px 8px;font-size:11px}
.compare-wrap{background:var(--surface);border-radius:var(--radius);padding:4px;overflow-x:auto;box-shadow:var(--shadow)}
table.compare{width:100%;border-collapse:collapse;font-size:14px;min-width:640px}
table.compare th,table.compare td{padding:12px 10px;text-align:left;border-bottom:1px solid var(--line);vertical-align:middle}
table.compare th{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:700}
table.compare tr:last-child td{border-bottom:0}
table.compare tr:nth-child(odd) td{background:#fafafa}
table.compare td.price{font-weight:700;color:var(--text);white-space:nowrap}
table.compare td.price s{font-weight:400;color:var(--muted);font-size:12px}
table.compare img{width:48px;height:48px;object-fit:contain;border-radius:6px;background:#f1f5f9}
.faq details{background:var(--surface);border-radius:10px;padding:14px 18px;margin-bottom:8px;box-shadow:var(--shadow)}
.faq summary{cursor:pointer;font-weight:600;font-size:15px}
.faq p{margin-top:10px;color:var(--muted);font-size:14px;line-height:1.55}
.prose{background:var(--surface);border-radius:var(--radius);padding:28px;box-shadow:var(--shadow);line-height:1.7}
.prose p{margin-bottom:14px}
.product-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
.product-card{background:var(--surface);border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow);display:flex;flex-direction:column;transition:transform .15s;cursor:pointer;border:0;text-align:left;font:inherit;color:inherit}
.product-card:hover{transform:translateY(-3px)}
.product-card:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
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
/* search-results list view (/urunler/) */
.search-hero{display:flex;align-items:center;justify-content:space-between;gap:16px;background:#fdecec;border-radius:var(--radius);padding:18px 22px;margin-top:14px;border-left:4px solid #e11d48}
.search-hero-text h1{font-size:22px;color:#b91c1c;font-weight:800;margin:0}
.search-hero-text p{margin:4px 0 0;font-size:13px;color:var(--muted)}
.filter-toggle{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:8px 14px;font-weight:600;cursor:pointer;display:inline-flex;gap:6px;align-items:center}
.filter-toggle:hover{background:#f9fafb}
.filters.collapsible{margin-top:14px}
@media (max-width: 720px){.filters.collapsible.hidden{display:none}}
.product-list{display:flex;flex-direction:column;gap:10px;margin-top:14px}
.product-row{display:grid;grid-template-columns:80px 1fr auto;gap:14px;align-items:center;background:var(--surface);border:1px solid #f1f5f9;border-radius:12px;padding:12px 16px;cursor:pointer;transition:border-color .15s, box-shadow .15s;text-align:left;font:inherit;color:inherit}
.product-row:hover{border-color:var(--accent);box-shadow:0 2px 8px rgba(0,0,0,.04)}
.product-row:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.row-thumb{width:80px;height:80px;background:#f8fafc;border-radius:8px;overflow:hidden;display:flex;align-items:center;justify-content:center}
.row-thumb img{max-width:100%;max-height:100%;object-fit:contain}
.row-main{min-width:0}
.row-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px}
.chip{display:inline-flex;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;letter-spacing:.3px}
.chip.market-chip{background:var(--accent);color:#fff}
.chip.status-live{background:#dcfce7;color:#166534}
.chip.status-today{background:#fef3c7;color:#92400e}
.chip.status-soon{background:#e0e7ff;color:#3730a3}
.chip.discount-chip{background:#fee2e2;color:#991b1b}
.product-row h3{font-size:15px;font-weight:700;color:var(--text);line-height:1.35;margin:0;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.row-cat{margin:4px 0 0;font-size:12px;color:#10b981;font-weight:500}
.row-meta{display:flex;flex-direction:column;align-items:flex-end;gap:6px;white-space:nowrap}
.row-date{font-size:11px;color:#64748b}
.row-price strong{font-size:18px;font-weight:800;color:#10b981}
.row-price s{display:block;font-size:12px;color:var(--muted);text-align:right}
@media (max-width: 640px){
  .search-hero{flex-direction:column;align-items:flex-start}
  .product-row{grid-template-columns:64px 1fr;row-gap:6px}
  .row-thumb{width:64px;height:64px}
  .row-meta{grid-column:1 / -1;flex-direction:row;justify-content:space-between;align-items:center}
}
.filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;background:var(--surface);padding:20px;border-radius:var(--radius);box-shadow:var(--shadow);margin-top:24px}
.filters label:first-child{grid-column:1/-1}
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
.modal{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:16px}
.modal.hidden{display:none}
.modal-backdrop{position:absolute;inset:0;background:rgba(15,23,42,.55);backdrop-filter:blur(3px)}
.modal-dialog{position:relative;background:var(--surface);border-radius:var(--radius);max-width:780px;width:100%;max-height:88vh;overflow:auto;box-shadow:0 20px 60px rgba(15,23,42,.25)}
.modal-close{position:absolute;top:10px;right:14px;width:36px;height:36px;border-radius:50%;border:0;background:#f1f5f9;font-size:22px;cursor:pointer;z-index:2}
.modal-close:hover{background:#e2e8f0}
.modal-body{padding:28px}
.modal-product{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px}
.modal-product .product-img{aspect-ratio:1/1;background:#f1f5f9;border-radius:var(--radius);overflow:hidden}
.modal-product .product-img img{width:100%;height:100%;object-fit:contain;padding:10px}
.modal-product .price-row strong{font-size:28px}
.modal-product h2{font-size:22px}
.modal-similar h3{font-size:14px;margin:24px 0 12px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}
.modal-similar .product-grid{grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}
.modal-similar .product-card{box-shadow:none;border:1px solid var(--line)}
.modal-similar .product-card h3{font-size:12px}
.modal-similar .price-row strong{font-size:14px}
body.modal-open{overflow:hidden}
@media (max-width:600px){.modal-product{grid-template-columns:1fr}}
.category-block{margin-top:22px;padding:18px 20px;background:var(--surface);border-radius:var(--radius);box-shadow:var(--shadow);border-left:4px solid var(--accent)}
.category-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:14px}
.category-head h3{font-size:18px;font-weight:700;color:var(--text)}
.category-head small{color:var(--muted);background:#f1f5f9;padding:2px 10px;border-radius:999px;font-weight:600}
.footer{margin-top:60px;padding-top:36px;color:var(--muted);font-size:13px;border-top:1px solid var(--line)}
.footer-grid{display:grid;grid-template-columns:1.4fr repeat(3,1fr);gap:32px;padding:0 8px}
.footer-brand strong{display:block;font-size:18px;color:var(--text);margin-bottom:10px}
.footer-brand p{font-size:13px;line-height:1.5;max-width:36ch}
.footer-col h4{font-size:11px;letter-spacing:.12em;font-weight:700;color:var(--text);text-transform:uppercase;margin-bottom:12px}
.footer-col ul{list-style:none;padding:0;margin:0;display:grid;gap:7px}
.footer-col a{color:var(--muted);font-size:13px}
.footer-col a:hover{color:var(--accent)}
.footer-col a.footer-more{color:var(--text);font-weight:600}
.footer-bottom{display:flex;justify-content:space-between;align-items:center;margin-top:32px;padding:18px 8px;border-top:1px solid var(--line);flex-wrap:wrap;gap:8px}
.footer-bottom small{font-size:11px}
@media (max-width:760px){.footer-grid{grid-template-columns:1fr 1fr;gap:24px}.footer-brand{grid-column:1/-1}}
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
const fmtPrice=v=>{if(v==null||v==='')return '—';return new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:2}).format(Number(v)||0);};
const esc=v=>String(v==null?'':v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const modal=document.getElementById('product-modal');
const body=document.getElementById('product-modal-body');
const openModal=(p)=>{
  if(!modal||!body)return;
  // "Brosurler" veya bos kategoriler broşürden kirpilmamis toplu görsellerle dolu — benzer onerisi spam olur.
  const hasUsefulCat=p.category&&!/^bro[sş][uü]rler$/i.test(String(p.category).trim());
  const similar=hasUsefulCat?Array.from(document.querySelectorAll('.product-card'))
    .filter(c=>c.dataset.category&&c.dataset.category===p.category&&c.dataset.product!==JSON.stringify(p))
    .slice(0,6):[]
    .map(c=>{try{return JSON.parse(c.dataset.product);}catch(e){return null;}})
    .filter(Boolean);
  body.innerHTML=
    '<div class="modal-product" style="--accent:'+esc(p.color||'#e11d48')+'">'+
      (p.image?'<div class="product-img"><img src="'+esc(p.image)+'" alt="'+esc(p.name)+'"></div>':'<div class="product-img placeholder"></div>')+
      '<div>'+
        '<div class="product-tags">'+
          '<span class="tag market-tag">'+esc(p.market)+'</span>'+
          (p.discount?'<span class="tag discount">%'+p.discount+' indirim</span>':'')+
          (p.badge?'<span class="tag">'+esc(p.badge)+'</span>':'')+
        '</div>'+
        '<h2 id="product-modal-title">'+esc(p.name)+'</h2>'+
        (p.category?'<p class="muted">'+esc(p.category)+'</p>':'')+
        '<div class="price-row" style="margin:16px 0">'+
          '<strong>'+fmtPrice(p.price)+'</strong>'+
          (p.oldPrice&&Number(p.oldPrice)>Number(p.price||0)?'<s>'+fmtPrice(p.oldPrice)+'</s>':'')+
        '</div>'+
        (p.url?'<a class="btn primary" href="'+esc(p.url)+'" target="_blank" rel="noopener">Ürüne git →</a>':'')+
        ' <a class="btn" href="/market/'+esc(p.marketId)+'/">'+esc(p.market)+' sayfası</a>'+
      '</div>'+
    '</div>'+
    (similar.length?'<div class="modal-similar"><h3>Benzer ürünler</h3><div class="product-grid">'+
      similar.map(s=>'<article class="product-card" data-product=\\''+esc(JSON.stringify(s))+'\\' style="--accent:'+esc(s.color||'#e11d48')+'">'+
        (s.image?'<div class="product-img"><img src="'+esc(s.image)+'" alt="'+esc(s.name)+'" loading="lazy"></div>':'<div class="product-img placeholder"></div>')+
        '<div class="product-body"><div class="product-tags"><span class="tag market-tag">'+esc(s.market)+'</span></div>'+
        '<h3>'+esc(s.name)+'</h3>'+
        '<div class="price-row"><strong>'+fmtPrice(s.price)+'</strong></div></div></article>').join('')+
      '</div></div>':'');
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
};
const closeModal=(el)=>{const m=el||document.querySelector('.modal:not(.hidden)');if(!m)return;m.classList.add('hidden');if(!document.querySelector('.modal:not(.hidden)'))document.body.classList.remove('modal-open');};
const closeAllModals=()=>{document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden'));document.body.classList.remove('modal-open');};

// Brosur viewer state
const bModal=document.getElementById('brochure-modal');
const bImg=document.getElementById('bv-img');
const bIdx=document.getElementById('bv-i');
const bTot=document.getElementById('bv-n');
const bCnt=document.getElementById('bv-count');
const bPrev=document.getElementById('bv-prev');
const bNext=document.getElementById('bv-next');
const bGrid=document.getElementById('bv-products');
let bData=null,bCur=0;
const bDataEl=document.getElementById('catalog-brochure-data');
if(bDataEl){try{bData=JSON.parse(bDataEl.textContent||'null');}catch(e){bData=null;}}
const renderBrochurePanel=()=>{
  if(!bGrid||!bData)return;
  const prods=bData.products||[];
  if(bCnt)bCnt.textContent=prods.length+' ürün';
  bGrid.innerHTML=prods.map(p=>{
    const img=p.image?'<div class="product-img"><img src="'+esc(p.image)+'" alt="'+esc(p.name)+'" loading="lazy"></div>':'<div class="product-img placeholder"></div>';
    const tags='<div class="product-tags"><span class="tag market-tag">'+esc(p.market)+'</span>'+(p.discount?'<span class="tag discount">%'+p.discount+'</span>':'')+'</div>';
    const price='<div class="price-row"><strong>'+fmtPrice(p.price)+'</strong>'+(p.oldPrice&&Number(p.oldPrice)>Number(p.price||0)?'<s>'+fmtPrice(p.oldPrice)+'</s>':'')+'</div>';
    return '<article class="product-card" tabindex="0" role="button" data-product=\\''+esc(JSON.stringify(p))+'\\' style="--accent:'+esc(p.color||'#e11d48')+'">'+img+'<div class="product-body">'+tags+'<h3>'+esc(p.name)+'</h3>'+price+'<span class="product-link">Detay →</span></div></article>';
  }).join('');
};
const bHotspots=document.getElementById('bv-hotspots');
const bHsToggle=document.getElementById('bv-hs-toggle');
let bHsPeek=true;
const renderHotspots=()=>{
  if(!bHotspots||!bData)return;
  bHotspots.innerHTML='';
  const prods=(bData.products||[]).filter(p=>p&&p.bbox&&p.bbox.page===bCur);
  if(!prods.length){if(bHsToggle)bHsToggle.style.display='none';return;}
  if(bHsToggle)bHsToggle.style.display='';
  for(const p of prods){
    const bb=p.bbox;
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='brochure-hotspot';
    btn.style.left=(bb.x*100).toFixed(3)+'%';
    btn.style.top=(bb.y*100).toFixed(3)+'%';
    btn.style.width=(bb.w*100).toFixed(3)+'%';
    btn.style.height=(bb.h*100).toFixed(3)+'%';
    btn.setAttribute('aria-label',p.name||'Ürün');
    btn.dataset.product=JSON.stringify(p);
    const lbl=document.createElement('span');
    lbl.className='brochure-hotspot-label';
    lbl.textContent=p.name||'';
    btn.appendChild(lbl);
    bHotspots.appendChild(btn);
  }
};
const showBrochurePage=(i)=>{
  if(!bData||!bData.pages||!bData.pages.length)return;
  bCur=Math.max(0,Math.min(i,bData.pages.length-1));
  if(bImg)bImg.src=bData.pages[bCur];
  if(bIdx)bIdx.textContent=String(bCur+1);
  if(bTot)bTot.textContent=String(bData.pages.length);
  if(bPrev)bPrev.disabled=bCur===0;
  if(bNext)bNext.disabled=bCur===bData.pages.length-1;
  renderHotspots();
};
if(bHsToggle){bHsToggle.addEventListener('click',()=>{bHsPeek=!bHsPeek;if(bHotspots){bHotspots.classList.toggle('peek',bHsPeek);}bHsToggle.setAttribute('aria-pressed',String(bHsPeek));bHsToggle.textContent='Ürün kutuları: '+(bHsPeek?'Açık':'Kapalı');});if(bHotspots){bHotspots.classList.add('peek');}}
const openBrochure=(i)=>{
  if(!bModal||!bData)return;
  renderBrochurePanel();
  showBrochurePage(i||0);
  bModal.classList.remove('hidden');
  document.body.classList.add('modal-open');
};
if(bPrev)bPrev.addEventListener('click',()=>showBrochurePage(bCur-1));
if(bNext)bNext.addEventListener('click',()=>showBrochurePage(bCur+1));

document.addEventListener('click',(ev)=>{
  const bpage=ev.target.closest('.brochure-page');
  if(bpage){
    ev.preventDefault();
    const i=parseInt(bpage.dataset.brochureIndex||'0',10)||0;
    openBrochure(i);
    return;
  }
  const hs=ev.target.closest('.brochure-hotspot');
  if(hs&&hs.dataset.product){
    ev.preventDefault();
    ev.stopPropagation();
    try{openModal(JSON.parse(hs.dataset.product));}catch(e){}
    return;
  }
  const card=ev.target.closest('.product-card, .product-row');
  if(card&&card.dataset.product&&!ev.target.closest('a')&&!ev.target.closest('button.modal-close')&&!ev.target.closest('.brochure-nav')){
    ev.preventDefault();
    try{openModal(JSON.parse(card.dataset.product));}catch(e){}
    return;
  }
  const closeBtn=ev.target.closest('[data-close]');
  if(closeBtn){const m=closeBtn.closest('.modal');closeModal(m);}
});
document.addEventListener('keydown',(ev)=>{
  if(ev.key==='Escape'){closeModal();return;}
  if(bModal&&!bModal.classList.contains('hidden')){
    if(ev.key==='ArrowLeft')showBrochurePage(bCur-1);
    else if(ev.key==='ArrowRight')showBrochurePage(bCur+1);
  }
});
document.addEventListener('keydown',(ev)=>{
  if(ev.key!=='Enter'&&ev.key!==' ')return;
  const ae=document.activeElement;const card=ae&&ae.classList&&(ae.classList.contains('product-card')||ae.classList.contains('product-row'))?ae:null;
  if(!card)return;
  ev.preventDefault();
  try{openModal(JSON.parse(card.dataset.product));}catch(e){}
});

const $=id=>document.getElementById(id);
const s=$('search'),m=$('market-filter'),c=$('category-filter'),pmin=$('price-min'),pmax=$('price-max'),sort=$('sort'),g=$('product-grid'),n=$('count'),e=$('empty');
if(!g)return;
const norm=v=>String(v||'').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/\\s+/g,' ').trim();
const cards=Array.from(g.children);
const params=new URLSearchParams(location.search);
if(s&&params.get('q'))s.value=params.get('q');
// filter toggle (mobil)
const ft=$('filter-toggle'),ff=$('filters');
if(ft&&ff){if(window.matchMedia('(max-width: 720px)').matches)ff.classList.add('hidden');ft.addEventListener('click',()=>{const h=ff.classList.toggle('hidden');ft.setAttribute('aria-expanded',(!h).toString());});}
const rt=$('results-title'),rs=$('results-sub');
const updateHero=v=>{if(!rt||!rs)return;const q=s?s.value.trim():'';if(q){rt.innerHTML='"'+q.replace(/</g,'&lt;')+'" sonuçları';rs.innerHTML='<span id="count">'+v+'</span> ürün bulundu';}else{rt.textContent='Tüm aktüel ürünler';rs.innerHTML='<span id="count">'+v+'</span> ürün bulundu';}};
const apply=()=>{
  const q=s?norm(s.value):'';
  const mm=m?m.value:'';
  const cc=c?c.value:'';
  const lo=pmin&&pmin.value!==''?Number(pmin.value):null;
  const hi=pmax&&pmax.value!==''?Number(pmax.value):null;
  let v=0;
  for(const card of cards){
    const price=card.dataset.price===''?null:Number(card.dataset.price);
    const show=(!q||(card.dataset.search||'').includes(q))
      &&(!mm||card.dataset.market===mm)
      &&(!cc||card.dataset.category===cc)
      &&(lo===null||(price!==null&&price>=lo))
      &&(hi===null||(price!==null&&price<=hi));
    card.classList.toggle('hidden',!show);
    if(show)v++;
  }
  if(n)n.textContent=v;
  updateHero(v);
  if(e)e.classList.toggle('hidden',v!==0);
  if(sort){
    const mode=sort.value;
    const key=c=>{
      if(mode==='price-asc'||mode==='price-desc'){const p=c.dataset.price;return p===''?(mode==='price-asc'?Infinity:-Infinity):Number(p);}
      if(mode==='discount-desc')return Number(c.dataset.discount||0);
      return Number(c.dataset.ts||0);
    };
    const dir=(mode==='price-asc')?1:-1;
    const sorted=cards.slice().sort((a,b)=>(key(a)-key(b))*dir);
    for(const el of sorted)g.appendChild(el);
  }
};
[s,m,c,pmin,pmax,sort].forEach(el=>el&&el.addEventListener('input',apply));
[s,m,c,pmin,pmax,sort].forEach(el=>el&&el.addEventListener('change',apply));
apply();
})();`;
}

function buildSitemap() {
  const urls = [`${siteUrl}/`, `${siteUrl}/urunler/`];
  for (const m of orderedMarkets) {
    urls.push(`${siteUrl}${marketUrl(m)}`);
    const cats = catalogsByMarket.get(m.id) || [];
    for (const c of cats) urls.push(`${siteUrl}${catalogUrl(m, c)}`);
  }
  for (const item of popularCompare) urls.push(`${siteUrl}/urun/${item.slug}/`);
  for (const cat of (siteConfig.categories || [])) urls.push(`${siteUrl}/kategori/${cat.id}/`);
  for (const p of corporatePages()) urls.push(`${siteUrl}/${p.slug}/`);
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

// Inline <script type="application/json"> icin guvenli escape: </script> kacir.
function escapeJsonForScript(s) {
  return String(s)
    .replace(/<\/(script)/gi, "<\\/$1")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

// Brosur modal icin minimal urun payload'u (openModal ile ayni sekli kullaniyor).
function productPayloadMin(p) {
  const market = marketById.get(p.market_id);
  const color = marketColor(p.market_id);
  return {
    id: p.id,
    name: p.name || "",
    image: p.image || "",
    price: p.price ?? null,
    oldPrice: p.old_price ?? null,
    discount: p.discount_pct || 0,
    category: p.category || "",
    market: marketLabel(market),
    marketId: p.market_id || "",
    color,
    url: p.url || "",
    badge: p.badge || "",
    bbox: normalizeBbox(p.bbox),
  };
}

function normalizeBbox(b) {
  if (!b) return null;
  let obj = b;
  if (typeof b === "string") {
    try { obj = JSON.parse(b); } catch { return null; }
  }
  if (!obj || typeof obj !== "object") return null;
  const page = Number.isFinite(obj.page) ? Math.max(0, Math.floor(obj.page)) : 0;
  const x = Number(obj.x), y = Number(obj.y), w = Number(obj.w), h = Number(obj.h);
  if (![x, y, w, h].every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) return null;
  if (x + w > 1.001 || y + h > 1.001) return null;
  if (w <= 0 || h <= 0) return null;
  return { page, x, y, w, h };
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

function catalogTitle(c) {
  const raw = (c?.period_text || "").trim();
  const bad = /\?\?/.test(raw) || /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(raw) || !raw;
  return bad ? dateRange(c) : raw;
}

function diversifyByMarket(list, perMarket, total) {
  const counts = new Map();
  const out = [];
  const rest = [];
  for (const p of list) {
    const mid = p.market_id || "";
    const n = counts.get(mid) || 0;
    if (n < perMarket) {
      counts.set(mid, n + 1);
      out.push(p);
      if (out.length >= total) return out;
    } else {
      rest.push(p);
    }
  }
  for (const p of rest) {
    if (out.length >= total) break;
    out.push(p);
  }
  return out;
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

// ---- URL helpers ----
function dateSlugForCatalog(c) {
  const d = c?.week_start ? new Date(c.week_start) : null;
  if (!d || isNaN(d)) return c.id;
  return `${d.getUTCDate()}-${TR_MONTHS[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}
function marketUrl(m) { return `/${m.id}-aktuel/`; }
function catalogUrl(m, c) { return `/${m.id}-aktuel/${dateSlugForCatalog(c)}/`; }
function slugify(v) {
  return normalize(v).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}
function redirectHtml(to) {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Yönlendiriliyor…</title><link rel="canonical" href="${escapeHtml(siteUrl + to)}"><meta http-equiv="refresh" content="0; url=${escapeHtml(to)}"><meta name="robots" content="noindex"><script>location.replace(${JSON.stringify(to)})</script></head><body><p>Yönlendiriliyor: <a href="${escapeHtml(to)}">${escapeHtml(to)}</a></p></body></html>`;
}

function computePopularProducts(all) {
  const out = [];
  for (const kw of POPULAR_KEYWORDS) {
    const pats = kw.patterns.map((p) => normalize(p));
    const items = all.filter((p) => {
      const n = normalize(p.name || "");
      return pats.some((pat) => n.includes(pat));
    });
    if (items.length >= 3) {
      items.sort((a, b) => (Number(a.price) || Infinity) - (Number(b.price) || Infinity));
      out.push({ ...kw, items });
    }
  }
  return out;
}

function corporatePages() {
  return [
    { slug: "hakkimizda", title: "Hakkımızda", body: `<p>${escapeHtml(siteConfig.site.title)}, Türkiye'deki marketlerin haftalık aktüel katalog ve ürünlerini tek ekranda toplayan bağımsız bir karşılaştırma rehberidir. Amacımız tüketicinin en uygun fiyatı en hızlı şekilde bulmasını sağlamaktır.</p><p>Veriler her marketin resmi web sitesinden düzenli olarak çekilir. Hiçbir marketten ücret almıyoruz; içerik tamamen kullanıcı faydasına yöneliktir.</p>` },
    { slug: "iletisim", title: "İletişim", body: `<p>Geri bildirim, hata bildirimi, içerik kaldırma talebi veya iş birliği için bize yazın:</p><p><strong>E-posta:</strong> iletisim@aktuelkarsilastirma.com</p>` },
    { slug: "gizlilik", title: "Gizlilik & KVKK", body: `<p>Site yalnızca gezinme çerezleri ve anonim ziyaret istatistikleri toplar. Kişisel veri işlenmez. KVKK kapsamındaki talepleriniz için iletişim sayfamızdan bize ulaşabilirsiniz.</p>` },
    { slug: "kosullar", title: "Kullanım Koşulları", body: `<p>Bu site bilgi amaçlı yayınlanmıştır. Fiyatlar ve içerikler ilgili marketin resmi kaynağından alınır; son geçerli fiyat market kasasındadır. İçeriklerin izinsiz kopyalanması yasaktır.</p>` },
  ];
}

function renderCorporate(page) {
  return layout(
    `${page.title} - ${siteConfig.site.title}`,
    `${page.title} sayfası.`,
    `<main class="page">
      ${renderHeader("other")}
      ${renderBreadcrumb([{ name: "Anasayfa", url: "/" }, { name: page.title }])}
      <article class="hero compact"><div><h1>${escapeHtml(page.title)}</h1></div></article>
      <section class="section prose">${page.body}</section>
      ${renderFooter()}
    </main>`,
    { canonical: `/${page.slug}/`, jsonLd: [breadcrumbLd([{ name: "Anasayfa", path: "/" }, { name: page.title, path: `/${page.slug}/` }])] }
  );
}

function renderBreadcrumb(trail) {
  return `<nav class="breadcrumb" aria-label="Breadcrumb"><ol>${trail.map((t, i) => {
    const last = i === trail.length - 1;
    return `<li>${t.url && !last ? `<a href="${escapeHtml(t.url)}">${escapeHtml(t.name)}</a>` : `<span>${escapeHtml(t.name)}</span>`}</li>`;
  }).join("")}</ol></nav>`;
}

function catalogStatus(c) {
  if (!c?.week_start || !c?.week_end) return null;
  const now = Date.now();
  const start = new Date(c.week_start).getTime();
  const end = new Date(c.week_end).getTime();
  const day = 24 * 3600 * 1000;
  if (now >= start && now <= start + day) return { label: "Bugün", cls: "today" };
  if (now >= start && now <= end) return { label: "Yayında", cls: "live" };
  if (start > now && start - now <= 7 * day) return { label: "Yakında", cls: "soon" };
  return null;
}

function renderCompare(item) {
  const title = `${item.label} fiyatları — marketlerde karşılaştırma`;
  const description = `${item.label} için ${item.items.length} aktüel teklif. BİM, A101, ŞOK, Migros ve daha fazlasında en güncel fiyatlar.`;
  const prices = item.items.map((p) => Number(p.price)).filter(Number.isFinite);
  const minP = prices.length ? Math.min(...prices) : null;
  const maxP = prices.length ? Math.max(...prices) : null;
  const avgP = prices.length ? prices.reduce((s, n) => s + n, 0) / prices.length : null;
  const similar = POPULAR_KEYWORDS.filter((k) => k.slug !== item.slug).slice(0, 8);

  const rows = item.items.slice(0, 60).map((p) => {
    const m = marketById.get(p.market_id);
    const color = marketColor(p.market_id);
    return `<tr>
      <td><a class="chip" href="${escapeHtml(marketUrl(m || {id: p.market_id}))}" style="--accent:${color}">${escapeHtml(marketLabel(m))}</a></td>
      <td>${p.image ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy" width="54" height="54">` : ""}</td>
      <td><strong>${escapeHtml(p.name || "")}</strong>${p.category ? `<br><small class="muted">${escapeHtml(p.category)}</small>` : ""}</td>
      <td class="price">${formatPrice(p.price)}${p.old_price && Number(p.old_price) > Number(p.price || 0) ? `<br><s>${formatPrice(p.old_price)}</s>` : ""}</td>
      <td>${p.discount_pct ? `<span class="tag discount">%${p.discount_pct}</span>` : ""}</td>
      <td>${p.url ? `<a class="btn" href="${escapeHtml(p.url)}" target="_blank" rel="noopener">Ürüne git</a>` : ""}</td>
    </tr>`;
  }).join("");

  return layout(
    title,
    description,
    `<main class="page">
      ${renderHeader("compare")}
      ${renderBreadcrumb([{ name: "Anasayfa", url: "/" }, { name: "Popüler karşılaştırmalar", url: "/urunler/" }, { name: item.label }])}
      <section class="hero compact"><div>
        <p class="eyebrow">Popüler karşılaştırma</p>
        <h1>${escapeHtml(item.label)} fiyatları</h1>
        <p class="hero-sub">${item.items.length} aktüel teklif · ${new Set(item.items.map((p) => p.market_id)).size} market</p>
        ${minP != null ? `<div class="hero-stats">
          <div><strong>${formatPrice(minP)}</strong><span>en düşük</span></div>
          <div><strong>${formatPrice(avgP)}</strong><span>ortalama</span></div>
          <div><strong>${formatPrice(maxP)}</strong><span>en yüksek</span></div>
        </div>` : ""}
      </div></section>
      <section class="section">
        <div class="section-head"><h2>Fiyata göre sıralı</h2><small>${item.items.length} kayıt</small></div>
        <div class="compare-wrap">
          <table class="compare">
            <thead><tr><th>Market</th><th></th><th>Ürün</th><th>Fiyat</th><th>İndirim</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>
      ${similar.length ? `<section class="section">
        <div class="section-head"><h2>Benzer karşılaştırmalar</h2></div>
        <div class="chip-row">${similar.map((s) => `<a class="chip" href="/urun/${s.slug}/">${escapeHtml(s.label)}</a>`).join("")}</div>
      </section>` : ""}
      ${renderFooter()}
    </main>`,
    {
      canonical: `/urun/${item.slug}/`,
      jsonLd: [
        breadcrumbLd([
          { name: "Anasayfa", path: "/" },
          { name: "Popüler karşılaştırmalar", path: "/urunler/" },
          { name: item.label, path: `/urun/${item.slug}/` },
        ]),
        itemListLd(item.items, `/urun/${item.slug}/`),
      ],
    }
  );
}

function renderCategoryPage(cat) {
  const marketCategory = siteConfig.marketCategory || {};
  const marketIds = Object.keys(marketCategory).filter((id) => marketCategory[id] === cat.id);
  const catMarkets = marketIds.map((id) => marketById.get(id)).filter(Boolean);
  const catalogList = [];
  const prodList = [];
  for (const m of catMarkets) {
    const cs = catalogsByMarket.get(m.id) || [];
    for (const c of cs) catalogList.push({ market: m, catalog: c });
    const ps = productsByMarket.get(m.id) || [];
    for (const p of ps) prodList.push(p);
  }
  catalogList.sort((a, b) => new Date(b.catalog.scraped_at || 0) - new Date(a.catalog.scraped_at || 0));
  prodList.sort((a, b) => new Date(b.scraped_at || 0) - new Date(a.scraped_at || 0));
  const top = prodList.filter((p) => p.discount_pct).sort((a, b) => (b.discount_pct || 0) - (a.discount_pct || 0)).slice(0, 24);

  return layout(
    `${cat.label} kategorisi — aktüel broşürler ve indirimler`,
    `${cat.label} kategorisinde ${catMarkets.length} market, ${catalogList.length} aktif katalog, ${prodList.length} ürün.`,
    `<main class="page">
      ${renderHeader("kategori")}
      ${renderBreadcrumb([{ name: "Anasayfa", url: "/" }, { name: "Kategoriler", url: "/#kategoriler" }, { name: cat.label }])}
      <section class="hero market-hero" style="--accent:${cat.accent}"><div>
        <p class="eyebrow">Kategori</p>
        <h1>${escapeHtml(cat.label)}</h1>
        <p class="hero-sub">${catMarkets.length} market · ${catalogList.length} katalog · ${prodList.length} ürün</p>
      </div></section>
      ${catMarkets.length ? `<section class="section">
        <div class="section-head"><h2>Marketler</h2><small>${catMarkets.length}</small></div>
        <div class="market-grid">${catMarkets.map(renderMarketCard).join("")}</div>
      </section>` : ""}
      ${catalogList.length ? `<section class="section">
        <div class="section-head"><h2>Kataloglar</h2><small>${catalogList.length}</small></div>
        <div class="catalog-grid">${catalogList.slice(0, 24).map(({market, catalog}) => renderCatalogCard(market, catalog)).join("")}</div>
      </section>` : ""}
      ${top.length ? `<section class="section">
        <div class="section-head"><h2>En yüksek indirimler</h2><small>${top.length}</small></div>
        <div class="product-grid">${top.map(renderProductCard).join("")}</div>
      </section>` : ""}
      ${renderFooter()}
    </main>`,
    {
      canonical: `/kategori/${cat.id}/`,
      jsonLd: [breadcrumbLd([{ name: "Anasayfa", path: "/" }, { name: cat.label, path: `/kategori/${cat.id}/` }])],
    }
  );
}
