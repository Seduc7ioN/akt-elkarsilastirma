function absoluteUrl(base, value) {
  try {
    return new URL(value, base).toString();
  } catch {
    return value;
  }
}

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&uuml;/gi, "ü")
    .replace(/&ouml;/gi, "ö")
    .replace(/&ccedil;/gi, "ç")
    .replace(/&nbsp;/gi, " ")
    .replace(/&rsquo;/gi, "'");
}

function normalizeText(value) {
  return decodeHtml(value).replace(/\s+/g, " ").trim();
}

function slugify(value) {
  return String(value ?? "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parsePriceText(value) {
  const match = normalizeText(value).match(/([\d.,]+)/);
  if (!match) return 0;
  return Number(match[1].replace(/\./g, "").replace(",", ".")) || 0;
}

function normalizeComparisonKey(title, category, fit, sleeve) {
  const text = `${category} ${title} ${fit} ${sleeve}`
    .toLocaleLowerCase("tr-TR")
    .replace(/%100/g, "")
    .replace(/\b(defacto|lcwaikiki|lc waikiki|koton|mavi|zara|bershka|hm|h&m|ltb|colins|erkek|kadin|cocuk|unisex)\b/g, "")
    .replace(/\b(lacivert|siyah|gri|mavi|kahverengi|beyaz|ekru|yesil|bej|mor)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return slugify(text);
}

function parseMaterialSummary(value) {
  const text = normalizeText(value);
  if (!text) return { materials: [], summary: "Materyal bilgisi yok" };

  const materials = text
    .split(/[,+/]/)
    .map((part) => part.trim())
    .map((part) => {
      const percentFirst = part.match(/(.+?)\s+(\d+)%/);
      const percentLast = part.match(/(\d+)%\s*(.+)/);
      const match = percentFirst || percentLast;
      if (!match) return null;
      const name = normalizeText(percentFirst ? match[1] : match[2]);
      const percent = Number(percentFirst ? match[2] : match[1]) || 0;
      return name && percent > 0 ? { name, percent } : null;
    })
    .filter(Boolean);

  return {
    materials,
    summary: materials.length ? materials.map((item) => `%${item.percent} ${item.name}`).join(" / ") : text,
  };
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "tr-TR,tr;q=0.9,en;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`http-${response.status}`);
  }

  return response.text();
}

function extractDefactoField(detailHtml, label) {
  const decoded = decodeHtml(detailHtml);
  const safeLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = decoded.match(new RegExp(`${safeLabel}\\s*:\\s*:?\\s*([^<\\n]+)`, "i"));
  return normalizeText(match?.[1] || "");
}

function extractDefactoDescription(detailHtml) {
  const decoded = decodeHtml(detailHtml);
  const match =
    decoded.match(/<div class=sideMenu__subtitle>[\s\S]*?<\/div><ul><li>([\s\S]*?)<\/li>/i) ||
    decoded.match(/<div class="sideMenu__subtitle">[\s\S]*?<\/div><ul><li>([\s\S]*?)<\/li>/i);
  return normalizeText(match?.[1] || "");
}

function extractDefactoSku(detailHtml) {
  return normalizeText(detailHtml.match(/class=product-detail__sku-code[^>]*data-sku=([A-Z0-9]+)/i)?.[1] || "");
}

function buildDefactoTitle(payloadTitle, seoName, materialSummary) {
  const baseTitle = normalizeText(payloadTitle);
  if (!baseTitle) return "";
  if (!seoName?.includes("100-pamuk")) return baseTitle;
  if (/%100\s+Pamuk/i.test(baseTitle)) return baseTitle;
  if (!/%100\s+Pamuk/i.test(materialSummary)) return baseTitle;
  return `%100 Pamuk ${baseTitle}`;
}

function extractDefactoCurrentPrice(detailHtml, fallback) {
  const decoded = decodeHtml(detailHtml);
  const bagMatch = decoded.match(/Sepette\s+([\d.,]+)\s*TL/i);
  if (bagMatch) return parsePriceText(bagMatch[1]);
  return fallback;
}

function extractDefactoListingItems(html, sourceUrl) {
  const items = [];
  const regex =
    /<div[^>]+catalog-products__item[\s\S]*?data-documents='([^']+)'[\s\S]*?<a class=product-card__title--name href=([^ >]+)[\s\S]*?<span>([^<]+)<\/span>[\s\S]*?<input[^>]+class=hidden-product-images[^>]+value=([^ >]+)[\s\S]*?<\/div><\/div><\/div><\/div>/gi;

  for (const match of html.matchAll(regex)) {
    try {
      const payload = JSON.parse(decodeHtml(match[1]));
      const href = absoluteUrl(sourceUrl, match[2].replaceAll('"', "").trim());
      const title = normalizeText(match[3] || payload.Name);
      const image = String(match[4] || "").split("|")[0]?.trim() || "";

      if (!payload?.ProductVariantIndex || !href || !title) continue;
      items.push({ href, title, image, payload });
    } catch {}
  }

  return items;
}

async function defactoAdapter({ brand, category }) {
  const sourceUrl = category?.sourceUrl || brand.sourceUrl;
  const listingHtml = await fetchText(sourceUrl);
  const listingItems = extractDefactoListingItems(listingHtml, sourceUrl).slice(0, 12);

  const detailedItems = await Promise.all(
    listingItems.map(async (item) => {
      try {
        const detailHtml = await fetchText(item.href);
        const payload = item.payload || {};
        const previousPrice = Number(payload.Price) || Number(payload.DiscountedPrice) || 0;
        const currentPrice = extractDefactoCurrentPrice(detailHtml, Number(payload.CampaignDiscountedPrice) || previousPrice);
        const materialRaw = extractDefactoField(detailHtml, "Ana Kumaş İçeriği");
        const { materials, summary } = parseMaterialSummary(materialRaw);
        return {
          brandSlug: "defacto",
          department: category?.department,
          mainCategory: category?.mainCategory,
          subCategory: category?.subCategory,
          productType: category?.productType,
          title: buildDefactoTitle(item.title, String(payload.SeoName || ""), summary),
          comparisonKey: normalizeComparisonKey(
            item.title,
            extractDefactoField(detailHtml, "Ürün Grubu") || normalizeText(payload.CategoryName || "Tisort"),
            extractDefactoField(detailHtml, "Kalıp"),
            extractDefactoField(detailHtml, "Kol Boyu")
          ),
          category: extractDefactoField(detailHtml, "Ürün Grubu") || normalizeText(payload.CategoryName || "Tisort"),
          gender: extractDefactoField(detailHtml, "Cinsiyet") || "Erkek",
          fit: extractDefactoField(detailHtml, "Kalıp") || "",
          neck: extractDefactoField(detailHtml, "Yaka") || "",
          sleeve: extractDefactoField(detailHtml, "Kol Boyu") || "",
          color: extractDefactoField(detailHtml, "Renk") || normalizeText(payload.ColorName || ""),
          productCode: extractDefactoSku(detailHtml) || normalizeText(item.href.split("-").at(-1)),
          image: item.image || `https://dfcdn.defacto.com.tr/768/${payload.PictureName}`,
          price: currentPrice || previousPrice,
          previousPrice: previousPrice || currentPrice,
          startDate: new Date().toISOString().slice(0, 10),
          endDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
          sourceType: "auto-real",
          sourceUrl: item.href,
          campaignLabel: currentPrice < previousPrice ? "Sepette indirim" : "Liste fiyati",
          campaignTags: ["defacto", "basic", slugify(extractDefactoField(detailHtml, "Kalıp") || "standart")],
          materials,
          materialSummary: summary,
          description: extractDefactoDescription(detailHtml),
          availability: Number(payload.Stock) > 0 ? "in-stock" : "unknown",
        };
      } catch {
        return null;
      }
    })
  );

  return detailedItems.filter(Boolean);
}

function extractLcwListingItems(html, sourceUrl) {
  const items = [];
  const regex =
    /<div class="product-card product-card--full">[\s\S]*?<a class="link link__element link--remove-underline"[^>]*href="([^"]+)"[\s\S]*?<img class="product-image-swipable__image"[\s\S]*?src="([^"]+)"[\s\S]*?alt="([^"]+)"[\s\S]*?<div class="product-brand product-card-info__brand">([\s\S]*?)<\/div>[\s\S]*?<div class="product-description product-card-info__description">([\s\S]*?)<\/div>[\s\S]*?<span class="current-price">([\s\S]*?)<\/span>[\s\S]*?<\/a>[\s\S]*?<\/div>/gi;

  for (const match of html.matchAll(regex)) {
    const href = absoluteUrl(sourceUrl, match[1]);
    const image = normalizeText(match[2]);
    const description = normalizeText(match[5]);
    const price = parsePriceText(match[6]);
    if (!href || !description || !price) continue;
    if (!/tişört|tisort/i.test(description)) continue;
    if (!/basic/i.test(description)) continue;
    items.push({
      href,
      image,
      title: description,
      brandName: normalizeText(match[4]),
      price,
    });
  }

  return items;
}

function extractLcwField(detailHtml, label) {
  const decoded = decodeHtml(detailHtml);
  const safeLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return normalizeText(decoded.match(new RegExp(`<strong>${safeLabel}:<\\/strong>\\s*([^<\\n]+)`, "i"))?.[1] || "");
}

function extractLcwProductCode(detailHtml) {
  return normalizeText(decodeHtml(detailHtml).match(/<title>(.*?) - ([A-Z0-9-]+) \| LCW<\/title>/i)?.[2] || "");
}

function extractLcwCurrentPrice(detailHtml) {
  return parsePriceText(detailHtml.match(/<span class="current-price">([\s\S]*?)<\/span>/i)?.[1] || "");
}

function extractLcwColor(detailHtml) {
  return normalizeText(decodeHtml(detailHtml).match(/<span class="product-detail__color-codes">([\s\S]*?)<\/span>/i)?.[1] || "");
}

function matchesCategoryHint(text, category) {
  const haystack = normalizeText(text).toLocaleLowerCase("tr-TR");
  const subCategory = normalizeText(category?.subCategory || "").toLocaleLowerCase("tr-TR");
  const productType = normalizeText(category?.productType || "").toLocaleLowerCase("tr-TR");

  if (subCategory) {
    const variantsByKey = {
      tisort: ["tişört", "tisort", "t-shirt"],
      pantolon: ["pantolon"],
      mont: ["mont"],
      sweat: ["sweat", "sweatshirt"],
      gomlek: ["gömlek", "gomlek"],
      polo: ["polo"],
    };
    const normalizedKey = slugify(subCategory).replace(/-/g, "");
    const variants = variantsByKey[normalizedKey] || [subCategory];
    if (!variants.some((variant) => haystack.includes(variant))) return false;
  }

  if (productType === "basic" && !haystack.includes("basic")) return false;
  if (productType && !["basic", "regular fit"].includes(productType) && !haystack.includes(productType)) return false;

  return true;
}

function extractFilteredLcwListingItems(html, sourceUrl, category) {
  return extractLcwListingItems(html, sourceUrl).filter((item) => matchesCategoryHint(item.title, category));
}

async function lcwAdapter({ brand, category }) {
  const sourceUrl = category?.sourceUrl || brand.sourceUrl;
  const listingHtml = await fetchText(sourceUrl);
  const listingItems = extractFilteredLcwListingItems(listingHtml, sourceUrl, category).slice(0, 12);

  const detailedItems = await Promise.all(
    listingItems.map(async (item) => {
      try {
        const detailHtml = await fetchText(item.href);
        const material = extractLcwField(detailHtml, "Malzeme");
        const { materials, summary } = parseMaterialSummary(material);
        return {
          brandSlug: "lcwaikiki",
          department: category?.department,
          mainCategory: category?.mainCategory,
          subCategory: category?.subCategory,
          productType: category?.productType,
          title: item.title,
          comparisonKey: normalizeComparisonKey(item.title, extractLcwField(detailHtml, "Ürün Tipi") || "Tisort", extractLcwField(detailHtml, "Kalıp"), extractLcwField(detailHtml, "Kol Boyu")),
          category: extractLcwField(detailHtml, "Ürün Tipi") || "Tisort",
          gender: extractLcwField(detailHtml, "Cinsiyet") || "Erkek",
          fit: extractLcwField(detailHtml, "Kalıp"),
          neck: extractLcwField(detailHtml, "Yaka"),
          sleeve: extractLcwField(detailHtml, "Kol Boyu"),
          color: extractLcwColor(detailHtml),
          productCode: extractLcwProductCode(detailHtml),
          image: item.image,
          price: extractLcwCurrentPrice(detailHtml) || item.price,
          previousPrice: item.price,
          startDate: new Date().toISOString().slice(0, 10),
          endDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
          sourceType: "auto-real",
          sourceUrl: item.href,
          campaignLabel: "Liste fiyati",
          campaignTags: ["lcwaikiki", "basic", slugify(extractLcwField(detailHtml, "Kalıp") || "standart")],
          materials,
          materialSummary: summary,
          description: normalizeText(`${item.brandName} ${item.title}`),
          availability: "in-stock",
        };
      } catch {
        return null;
      }
    })
  );

  return detailedItems.filter(Boolean);
}

const seededProducts = {
  koton: [
    "https://www.koton.com/product/873416/"
  ],
  mavi: [
    "https://www.mavi.com/gri-basic-tisort/p/0612854-80018",
    "https://www.mavi.com/mor-basic-tisort/p/066249-70670"
  ],
  zara: [
    "https://www.zara.com/tr/en/regular-fit-t-shirt-p00722435.html"
  ],
  hm: [
    "https://www2.hm.com/tr_tr/productpage.0685816002.html"
  ],
  ltb: [
    "https://www.ltbjeans.com/tr-TR/p/basic-regular-fit-lacivert-t-shirt-01124840436089_7641",
    "https://www.ltbjeans.com/tr-TR/p/cepli-lacivert-t-shirt-01224842276089_322"
  ],
  colins: [
    "https://www.colins.com.tr/p/cok-renkli-erkek-tshirt-kkol-40319"
  ],
  bershka: [
    "https://www.bershka.com/tr/k%C4%B1sa-kollu-basic-ti%C5%9F%C3%B6rt-c0p199105215.html",
    "https://www.bershka.com/tr/erkek/giyim/ti%C5%9F%C3%B6rt/k%C4%B1sa-kollu-basic-ti%C5%9F%C3%B6rt-c1010193239p196946368.html?colorId=250"
  ],
};

function titleFromTitleTag(html) {
  return normalizeText(decodeHtml(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "").split("|")[0]);
}

async function parseKotonProduct(url) {
  const html = await fetchText(url);
  const title = normalizeText(decodeHtml(html.match(/<meta itemprop="name" content="([^"]+)"/i)?.[1] || ""));
  const price = parsePriceText(html.match(/<meta name="twitter:label1" content="([^"]+)"/i)?.[1] || "");
  const image = normalizeText(html.match(/<meta itemprop="image" content="([^"]+)"/i)?.[1] || "");
  const desc = normalizeText(decodeHtml(html.match(/<div class="product-info__list-item">\s*([\s\S]*?)\s*<\/div>/i)?.[1] || ""));
  const code = normalizeText(html.match(/Koton - ([A-Z0-9]+)/i)?.[1] || "");
  return {
    brandSlug: "koton",
    title: title || "Koton Basic Tisort",
    comparisonKey: normalizeComparisonKey(title, "Tisort", /dar kesim/i.test(desc) ? "Dar Kesim" : "Regular Fit", /kisa kollu/i.test(desc) ? "Kisa Kollu" : ""),
    category: "Tisort",
    gender: "Erkek",
    fit: /dar kesim/i.test(desc) ? "Dar Kesim" : "Regular Fit",
    neck: /bisiklet yaka/i.test(desc) ? "Bisiklet Yaka" : "",
    sleeve: /kisa kollu/i.test(desc) ? "Kisa Kollu" : "",
    color: title.includes("Siyah") ? "Siyah" : "",
    productCode: code,
    image,
    price,
    previousPrice: price,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    sourceType: "auto-real",
    sourceUrl: url,
    campaignLabel: "Liste fiyati",
    campaignTags: ["koton", "basic"],
    materials: [],
    materialSummary: "Materyal bilgisi urun detayindan sonraki turda genisletilecek",
    description: desc,
    availability: "in-stock",
  };
}

function extractKotonListingItems(html, sourceUrl, category) {
  const items = [];
  const seen = new Set();
  const regex = /<div class="js-insider-product"[^>]*>\s*({[\s\S]*?})\s*<\/div>/gi;

  for (const match of html.matchAll(regex)) {
    try {
      const payload = JSON.parse(match[1]);
      const href = absoluteUrl(sourceUrl, payload.url);
      if (!href || seen.has(href)) continue;
      if (!matchesCategoryHint(payload.name || "", category)) continue;
      seen.add(href);
      items.push({
        href,
        title: normalizeText(payload.name || ""),
        image: normalizeText(payload.product_image_url || ""),
        price: Number(payload.unit_sale_price) || Number(payload.unit_price) || 0,
      });
    } catch {}
  }

  return items;
}

async function parseKotonCatalogProduct(url, category, seedItem = null) {
  const base = await parseKotonProduct(url);
  const title = base.title || seedItem?.title || `Koton ${category?.subCategory || "Urun"}`;
  return {
    ...base,
    department: category?.department,
    mainCategory: category?.mainCategory,
    subCategory: category?.subCategory,
    productType: category?.productType,
    title,
    comparisonKey: normalizeComparisonKey(title, category?.subCategory || base.category || "Urun", base.fit, base.sleeve),
    category: category?.subCategory || base.category,
    gender: category?.department || base.gender,
    image: base.image || seedItem?.image || "",
    price: base.price || seedItem?.price || 0,
    previousPrice: base.previousPrice || seedItem?.price || base.price || 0,
  };
}

async function kotonAdapter({ brand, category }) {
  const sourceUrl = category?.sourceUrl || brand.sourceUrl;
  if (!sourceUrl) return runSeededAdapter("koton", parseKotonCatalogProduct, category);

  try {
    const listingHtml = await fetchText(sourceUrl);
    const listingItems = extractKotonListingItems(listingHtml, sourceUrl, category).slice(0, 12);
    if (!listingItems.length) {
      return runSeededAdapter("koton", parseKotonCatalogProduct, category);
    }

    const detailedItems = await Promise.all(
      listingItems.map(async (item) => {
        try {
          return await parseKotonCatalogProduct(item.href, category, item);
        } catch {
          return null;
        }
      })
    );

    return detailedItems.filter(Boolean);
  } catch {
    return runSeededAdapter("koton", parseKotonCatalogProduct, category);
  }
}

async function parseMaviProduct(url) {
  const html = await fetchText(url);
  const title = normalizeText(decodeHtml(html.match(/#\s*([^<\n]+Basic Tişört[^<\n]*)/i)?.[1] || titleFromTitleTag(html)));
  const fit = normalizeText(decodeHtml(html.match(/(?:Loose Fit \/ Bol Rahat Kesim|Regular Fit \/ Normal Kesim|Slim Fit \/ Dar Kesim)/i)?.[0] || ""));
  const price = parsePriceText(html.match(/(\d[\d.,]+)\s*TL(?:\s+(\d[\d.,]+)\s*TL)?/i)?.[1] || "");
  const previousPrice = parsePriceText(html.match(/(\d[\d.,]+)\s*TL(?:\s+(\d[\d.,]+)\s*TL)/i)?.[2] || "") || price;
  const code = normalizeText(decodeHtml(html.match(/Ürün Kodu:\s*([^<\n]+)/i)?.[1] || ""));
  const image = normalizeText(html.match(/<meta property="og:image" content="([^"]+)"/i)?.[1] || "");
  const materialText = [...decodeHtml(html).matchAll(/%\d+\s*[A-Za-zÇĞİÖŞÜçğıöşü]+/g)].map((m) => m[0]).join(" / ");
  const { materials, summary } = parseMaterialSummary(materialText);
  return {
    brandSlug: "mavi",
    title,
    comparisonKey: normalizeComparisonKey(title, "Tisort", fit, "Kisa Kollu"),
    category: "Tisort",
    gender: "Erkek",
    fit,
    neck: /bisiklet yaka/i.test(decodeHtml(html)) ? "Bisiklet Yaka" : "",
    sleeve: "Kisa Kollu",
    color: normalizeText(code.split("-").at(-1) || ""),
    productCode: code,
    image,
    price,
    previousPrice,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    sourceType: "auto-real",
    sourceUrl: url,
    campaignLabel: previousPrice > price ? "Indirimli fiyat" : "Liste fiyati",
    campaignTags: ["mavi", "basic"],
    materials,
    materialSummary: summary,
    description: normalizeText(decodeHtml(html.match(/## Ürün Özellikleri([\s\S]*?)Ürün Kodu:/i)?.[1] || "")),
    availability: "in-stock",
  };
}

async function parseZaraProduct(url) {
  const html = await fetchText(url);
  const decoded = decodeHtml(html);
  const title = normalizeText(decoded.match(/<title>\s*([^<|]+)\s*\|/i)?.[1] || "Zara Basic T-shirt");
  const price = parsePriceText(decoded.match(/([\d.,]+)\s*TL/i)?.[1] || "");
  const ref = normalizeText(decoded.match(/(\d{4}\/\d{3}\/\d{3})/i)?.[1] || "");
  const comp = normalizeText(decoded.match(/Composition:\s*([^<\n]+)/i)?.[1] || "");
  const { materials, summary } = parseMaterialSummary(comp);
  const desc = normalizeText(decoded.match(/Regular fit cotton T-shirt[^<]+/i)?.[0] || "");
  return {
    brandSlug: "zara",
    title,
    comparisonKey: normalizeComparisonKey(title, "Tisort", "Regular Fit", "Kisa Kollu"),
    category: "Tisort",
    gender: "Erkek",
    fit: "Regular Fit",
    neck: /round neck/i.test(decoded) ? "Bisiklet Yaka" : "",
    sleeve: "Kisa Kollu",
    color: normalizeText(decoded.match(/White|Black|Blue|Green/i)?.[0] || ""),
    productCode: ref,
    image: normalizeText(decoded.match(/<meta property="og:image" content="([^"]+)"/i)?.[1] || ""),
    price,
    previousPrice: price,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    sourceType: "auto-real",
    sourceUrl: url,
    campaignLabel: "Liste fiyati",
    campaignTags: ["zara", "basic"],
    materials,
    materialSummary: summary,
    description: desc,
    availability: "in-stock",
  };
}

async function parseHmProduct(url) {
  const html = await fetchText(url);
  const decoded = decodeHtml(html);
  const title = normalizeText(decoded.match(/#\s*Regular Fit Tişört/i)?.[0]?.replace("#", "") || titleFromTitleTag(decoded));
  const price = parsePriceText(decoded.match(/(\d[\d.,]+)\s*TL/i)?.[1] || "");
  const desc = normalizeText(decoded.match(/Pamuklu hafif jarseden[\s\S]*?normal kesimli\./i)?.[0] || "");
  return {
    brandSlug: "hm",
    title,
    comparisonKey: normalizeComparisonKey(title, "Tisort", "Regular Fit", "Kisa Kollu"),
    category: "Tisort",
    gender: "Erkek",
    fit: "Regular Fit",
    neck: "Bisiklet Yaka",
    sleeve: "Kisa Kollu",
    color: normalizeText(decoded.match(/Siyah|Beyaz|Mavi|Gri/i)?.[0] || ""),
    productCode: normalizeText(url.match(/productpage\.(\d+)/i)?.[1] || ""),
    image: normalizeText(decoded.match(/<meta property="og:image" content="([^"]+)"/i)?.[1] || ""),
    price,
    previousPrice: price,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    sourceType: "auto-real",
    sourceUrl: url,
    campaignLabel: "Liste fiyati",
    campaignTags: ["hm", "basic"],
    materials: [{ name: "Pamuk", percent: 100 }],
    materialSummary: "%100 Pamuk",
    description: desc,
    availability: "in-stock",
  };
}

async function parseLtbProduct(url) {
  const html = await fetchText(url);
  const decoded = decodeHtml(html);
  const title = normalizeText(decoded.match(/#\s*([^\n<]+t-sh[ıi]rt)/i)?.[1] || titleFromTitleTag(decoded));
  const subtitle = normalizeText(decoded.match(/Erkek [^\n<]+ T-shirt/i)?.[0] || "");
  const price = parsePriceText(decoded.match(/(\d[\d.,]+)\s*TL/i)?.[1] || "");
  const materialBlock = normalizeText(decoded.match(/Ürün İçeriği:\s*([\s\S]*?)####/i)?.[1] || "");
  const { materials, summary } = parseMaterialSummary(materialBlock);
  return {
    brandSlug: "ltb",
    title,
    comparisonKey: normalizeComparisonKey(subtitle || title, "Tisort", /regular/i.test(subtitle) ? "Regular Fit" : "", /Kısa Kol|Kisa Kol/i.test(subtitle) ? "Kisa Kollu" : ""),
    category: "Tisort",
    gender: "Erkek",
    fit: /regular/i.test(subtitle) ? "Regular Fit" : "",
    neck: /Sıfır Yaka|Sifir Yaka/i.test(subtitle) ? "Bisiklet Yaka" : "",
    sleeve: /Kısa Kol|Kisa Kol/i.test(subtitle) ? "Kisa Kollu" : "",
    color: normalizeText(decoded.match(/LACİVERT|MAVİ|BEYAZ|SİYAH|GRİ/i)?.[0] || ""),
    productCode: normalizeText(url.match(/\/p\/.*-(\d+_[0-9]+)/i)?.[1] || ""),
    image: normalizeText(decoded.match(/<meta property="og:image" content="([^"]+)"/i)?.[1] || ""),
    price,
    previousPrice: price,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    sourceType: "auto-real",
    sourceUrl: url,
    campaignLabel: "Liste fiyati",
    campaignTags: ["ltb", "basic"],
    materials,
    materialSummary: summary,
    description: subtitle,
    availability: "in-stock",
  };
}

async function parseColinsProduct(url) {
  const html = await fetchText(url);
  const decoded = decodeHtml(html);
  const title = normalizeText(decoded.match(/Regular Fit [^<\n]+ Erkek [^<\n]+ Tişört/i)?.[0] || titleFromTitleTag(decoded));
  const priceMatches = [...decoded.matchAll(/(\d[\d.,]+)\s*TL/g)].map((m) => parsePriceText(m[1]));
  const price = priceMatches.at(-1) || priceMatches[0] || 0;
  const previousPrice = priceMatches[0] && priceMatches[0] > price ? priceMatches[0] : price;
  return {
    brandSlug: "colins",
    title,
    comparisonKey: normalizeComparisonKey(title, "Tisort", /Regular Fit/i.test(title) ? "Regular Fit" : "", /Kısa Kol/i.test(title) ? "Kisa Kollu" : ""),
    category: "Tisort",
    gender: "Erkek",
    fit: /Regular Fit/i.test(title) ? "Regular Fit" : "",
    neck: /Yuvarlak Yaka|Bisiklet Yaka/i.test(title) ? "Bisiklet Yaka" : "",
    sleeve: /Kısa Kol/i.test(title) ? "Kisa Kollu" : "",
    color: normalizeText(decoded.match(/Çok Renkli|Siyah|Lacivert|Gri|Yeşil|Kahverengi/i)?.[0] || ""),
    productCode: normalizeText(url.match(/-(\d+)$/i)?.[1] || ""),
    image: normalizeText(decoded.match(/<meta property="og:image" content="([^"]+)"/i)?.[1] || ""),
    price,
    previousPrice,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    sourceType: "auto-real",
    sourceUrl: url,
    campaignLabel: previousPrice > price ? "Indirimli fiyat" : "Liste fiyati",
    campaignTags: ["colins", "basic"],
    materials: [],
    materialSummary: "Materyal bilgisi sonraki turda genisletilecek",
    description: title,
    availability: "in-stock",
  };
}

async function parseBershkaProduct(url) {
  const html = await fetchText(url);
  const decoded = decodeHtml(html);
  const title = normalizeText(decoded.match(/#\s*Kısa kollu basic tişört/i)?.[0]?.replace("#", "") || titleFromTitleTag(decoded));
  const prices = [...decoded.matchAll(/(\d[\d.,]+)\s*TL/g)].map((m) => parsePriceText(m[1]));
  const price = Math.min(...prices.filter(Boolean));
  const previousPrice = Math.max(...prices.filter(Boolean));
  const ref = normalizeText(decoded.match(/Ref\.\.\s*([0-9/]+)/i)?.[1] || "");
  const comp = normalizeText(decoded.match(/Bileşim, bakım ve menşe[\s\S]*?(\d+%\s*[A-Za-zÇĞİÖŞÜçğıöşü ]+)/i)?.[1] || "");
  const { materials, summary } = parseMaterialSummary(comp);
  return {
    brandSlug: "bershka",
    title,
    comparisonKey: normalizeComparisonKey(title, "Tisort", "", "Kisa Kollu"),
    category: "Tisort",
    gender: "Erkek",
    fit: "",
    neck: "",
    sleeve: "Kisa Kollu",
    color: normalizeText(decoded.match(/Mavi|Beyaz|Yeşil|Siyah/i)?.[0] || ""),
    productCode: ref,
    image: normalizeText(decoded.match(/<meta property="og:image" content="([^"]+)"/i)?.[1] || ""),
    price: Number.isFinite(price) ? price : 0,
    previousPrice: Number.isFinite(previousPrice) ? previousPrice : Number.isFinite(price) ? price : 0,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    sourceType: "auto-real",
    sourceUrl: url,
    campaignLabel: previousPrice > price ? "Indirimli fiyat" : "Liste fiyati",
    campaignTags: ["bershka", "basic"],
    materials,
    materialSummary: summary || "Materyal bilgisi sonraki turda genisletilecek",
    description: title,
    availability: "in-stock",
  };
}

async function runSeededAdapter(brandSlug, parser, category) {
  const urls = category?.seedUrls || seededProducts[brandSlug] || [];
  const items = await Promise.all(
    urls.map(async (url) => {
      try {
        const item = await parser(url, category);
        return item
          ? {
              ...item,
              department: item.department || category?.department,
              mainCategory: item.mainCategory || category?.mainCategory,
              subCategory: item.subCategory || category?.subCategory,
              productType: item.productType || category?.productType,
            }
          : null;
      } catch {
        return null;
      }
    })
  );
  return items.filter(Boolean);
}

export const marketAdapters = {
  defacto: defactoAdapter,
  lcwaikiki: lcwAdapter,
  koton: kotonAdapter,
  mavi: async ({ category }) => runSeededAdapter("mavi", parseMaviProduct, category),
  zara: async ({ category }) => runSeededAdapter("zara", parseZaraProduct, category),
  hm: async ({ category }) => runSeededAdapter("hm", parseHmProduct, category),
  ltb: async ({ category }) => runSeededAdapter("ltb", parseLtbProduct, category),
  colins: async ({ category }) => runSeededAdapter("colins", parseColinsProduct, category),
  bershka: async ({ category }) => runSeededAdapter("bershka", parseBershkaProduct, category),
};
