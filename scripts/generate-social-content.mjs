import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { brandLogoSvg } from "./lib/brand.mjs";
import { loadEnv } from "./lib/env.mjs";

const root = process.cwd();
loadEnv(root);

const distDir = path.join(root, "dist");
const socialDir = path.join(distDir, "social");
const dataDir = path.join(root, "data", "social");
const siteUrl = (process.env.SITE_URL || "https://xn--aktelkarsilastirma-o6b.com").replace(/\/$/, "");
const displaySiteUrl = "https://aktüelkarsilastirma.com";

const [markets, campaigns] = await Promise.all([
  readJson("data/markets.json"),
  readJson("data/campaigns.json"),
]);

const marketMap = new Map(markets.map((market) => [market.slug, market]));
const activeCampaigns = campaigns
  .filter((item) => marketMap.has(item.marketSlug) && Number(item.price) > 0)
  .map((item) => ({ ...item, market: marketMap.get(item.marketSlug) }))
  .sort((a, b) => {
    if ((b.discountRate ?? 0) !== (a.discountRate ?? 0)) return (b.discountRate ?? 0) - (a.discountRate ?? 0);
    return Number(a.price ?? 0) - Number(b.price ?? 0);
  });

const topDeals = activeCampaigns.slice(0, 8);
const comparisonItems = pickComparisonItems(topDeals);
const roundupItems = topDeals.slice(0, 5);

const xPackage = buildXPackage(topDeals);
const telegramPost = buildTelegramPost(topDeals);
const instagramCards = buildInstagramCards({ topDeals, comparisonItems, roundupItems });
const instagramFormats = buildInstagramFormats(topDeals, comparisonItems, roundupItems);

await mkdir(socialDir, { recursive: true });
await mkdir(dataDir, { recursive: true });

const queue = {
  generatedAt: new Date().toISOString(),
  sourceCount: activeCampaigns.length,
  channels: {
    x: {
      morning: xPackage.morning,
      evening: xPackage.evening,
    },
    telegram: telegramPost,
    instagram: {
      cards: instagramCards,
      formats: instagramFormats.map(({ id, label, file, caption, note }) => ({ id, label, file, caption, note })),
    },
  },
};

const socialHtml = renderSocialPreview({ xPackage, telegramPost, instagramCards, instagramFormats });

await Promise.all([
  writeFile(path.join(dataDir, "queue.json"), JSON.stringify(queue, null, 2), "utf8"),
  writeFile(path.join(socialDir, "queue.json"), JSON.stringify(queue, null, 2), "utf8"),
  writeFile(path.join(socialDir, "index.html"), socialHtml, "utf8"),
  writeFile(path.join(distDir, "social.html"), socialHtml, "utf8"),
  writeFile(path.join(socialDir, "brand-mark.svg"), brandLogoSvg(), "utf8"),
  writeFile(path.join(socialDir, "x-post-morning.txt"), `${xPackage.morning.body}\n`, "utf8"),
  writeFile(path.join(socialDir, "x-post-evening.txt"), `${xPackage.evening.body}\n`, "utf8"),
  writeFile(path.join(socialDir, "x-card-morning.svg"), renderXCardSvg(xPackage.morning.card), "utf8"),
  writeFile(path.join(socialDir, "x-card-evening.svg"), renderXCardSvg(xPackage.evening.card), "utf8"),
  ...instagramCards.map((card, index) =>
    writeFile(path.join(socialDir, `instagram-card-${index + 1}.svg`), renderInstagramSvg(card), "utf8")
  ),
  ...instagramFormats.map((format) =>
    writeFile(path.join(socialDir, format.file), renderSocialFormatSvg(format), "utf8")
  ),
]);

console.log(
  `Sosyal içerik hazırlandı. X için sabah/akşam paketleri ve Instagram için story/post/reel formatları üretildi.`
);

function buildXPackage(items) {
  const morningItems = items.slice(0, 3);
  const eveningItems = items.slice(3, 6).length ? items.slice(3, 6) : items.slice(0, 3);

  return {
    morning: {
      title: "Sabah paylaşımı",
      body: buildXBody("Sabah fırsat radarı", "Güne öne çıkan aktüel ürünlerle başlayın:", morningItems),
      card: buildXCardData(morningItems[0], "Sabah fırsat radarı"),
    },
    evening: {
      title: "Akşam paylaşımı",
      body: buildXBody("Akşam market özeti", "Akşam öne çıkan market fırsatları:", eveningItems),
      card: buildXCardData(eveningItems[0], "Akşam market özeti"),
    },
  };
}

function buildXBody(headline, intro, items) {
  const lines = items.map((item, index) => {
    const market = item.market?.name ?? item.marketSlug;
    return `${index + 1}. ${market}: ${item.title} - ${formatPrice(item.price)} (%${item.discountRate})`;
  });

  return [
    `${headline}`,
    intro,
    ...lines,
    "",
    `Detaylar: ${displaySiteUrl}`,
    "#aktüel #indirim #marketfırsatları",
  ].join("\n");
}

function buildXCardData(item, kicker) {
  return {
    market: item.market?.name ?? item.marketSlug,
    marketColor: item.market?.color ?? "#f97316",
    title: item.title,
    price: item.price ?? 0,
    previousPrice: item.previousPrice ?? 0,
    discountRate: item.discountRate ?? 0,
    category: item.category ?? "Kampanya",
    image: item.image,
    kicker,
  };
}

function buildTelegramPost(items) {
  const lines = items.slice(0, 5).map((item) => {
    const market = item.market?.name ?? item.marketSlug;
    return `• ${market} | ${item.title}\n  ${formatPrice(item.price)} yerine ${formatPrice(item.previousPrice)} | %${item.discountRate}`;
  });

  return {
    channel: "telegram",
    type: "message",
    title: "Telegram kanal özeti",
    body: [
      "Bugünün takip edilen market fırsatları:",
      ...lines,
      "",
      `Site: ${siteUrl}`,
    ].join("\n"),
  };
}

function buildInstagramCards({ topDeals, comparisonItems, roundupItems }) {
  const single = topDeals[0];

  return [
    {
      id: "ig-single",
      template: "single",
      templateLabel: "Tek ürün fırsatı",
      title: single.title,
      market: single.market?.name ?? single.marketSlug,
      discountRate: single.discountRate ?? 0,
      price: single.price ?? 0,
      previousPrice: single.previousPrice ?? 0,
      category: single.category ?? "Kampanya",
      image: single.image,
      theme: single.market?.color ?? "#f97316",
      caption: `${single.market?.name ?? single.marketSlug} marketinde ${single.title} şimdi ${formatPrice(single.price)}. İndirim oranı %${single.discountRate}.`,
    },
    {
      id: "ig-comparison",
      template: "comparison",
      templateLabel: "Market karşılaştırma",
      title: comparisonItems.map((item) => item.market?.name ?? item.marketSlug).join(" vs "),
      items: comparisonItems.map((item) => ({
        market: item.market?.name ?? item.marketSlug,
        price: item.price ?? 0,
        discountRate: item.discountRate ?? 0,
        color: item.market?.color ?? "#f97316",
        title: item.title,
      })),
      highlight: comparisonItems[0]?.title ?? "Karşılaştırma",
      caption: `${comparisonItems.map((item) => item.market?.name ?? item.marketSlug).join(", ")} marketleri arasında fiyat/indirim karşılaştırması.`,
    },
    {
      id: "ig-roundup",
      template: "roundup",
      templateLabel: "Haftanın 5 fırsatı",
      title: "Haftanın öne çıkanları",
      items: roundupItems.map((item) => ({
        market: item.market?.name ?? item.marketSlug,
        title: item.title,
        price: item.price ?? 0,
        discountRate: item.discountRate ?? 0,
        color: item.market?.color ?? "#f97316",
      })),
      caption: "Bu hafta için öne çıkan 5 market fırsatı tek karede toplandı.",
    },
  ];
}

function buildInstagramFormats(topDeals, comparisonItems, roundupItems) {
  const spotlight = topDeals[0];
  const comparison = comparisonItems.slice(0, 3);
  const roundup = roundupItems.slice(0, 5);

  return [
    {
      id: "ig-story",
      kind: "story",
      label: "Instagram Story",
      file: "instagram-story.svg",
      width: 1080,
      height: 1920,
      title: spotlight.title,
      market: spotlight.market?.name ?? spotlight.marketSlug,
      marketColor: spotlight.market?.color ?? "#f97316",
      price: spotlight.price ?? 0,
      previousPrice: spotlight.previousPrice ?? 0,
      discountRate: spotlight.discountRate ?? 0,
      image: spotlight.image,
      caption: `Story için hazır. ${spotlight.market?.name ?? spotlight.marketSlug} fırsatı ${formatPrice(spotlight.price)} fiyatla öne çıkıyor.`,
      note: "Sabah ya da akşam story paylaşımı için dikey format.",
    },
    {
      id: "ig-post",
      kind: "post",
      label: "Instagram Post",
      file: "instagram-post.svg",
      width: 1080,
      height: 1350,
      title: "Bugünün market karşılaştırması",
      items: comparison,
      caption: `${comparison.map((item) => item.market?.name ?? item.marketSlug).join(", ")} marketleri için post formatında özet karşılaştırma.`,
      note: "Feed gönderisi için uygun 4:5 format.",
    },
    {
      id: "ig-reel-cover",
      kind: "reel",
      label: "Reel Kapağı",
      file: "instagram-reel-cover.svg",
      width: 1080,
      height: 1920,
      title: "Akşamın 5 fırsatı",
      items: roundup,
      caption: "Reel kapağı için haftanın öne çıkan fırsatları hazır.",
      note: "Reel kapak görseli ya da kısa video kapağı olarak kullanılabilir.",
    },
  ];
}

function pickComparisonItems(items) {
  const seen = new Set();
  const output = [];

  for (const item of items) {
    if (seen.has(item.marketSlug)) continue;
    seen.add(item.marketSlug);
    output.push(item);
    if (output.length === 3) break;
  }

  if (output.length >= 2) return output;
  return items.slice(0, 2);
}

function renderSocialPreview({ xPackage, telegramPost, instagramCards, instagramFormats }) {
  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sosyal Medya Otomasyon Merkezi</title>
  <style>
    :root {
      --line: rgba(255,255,255,0.12);
      --text: #f8fafc;
      --muted: rgba(248,250,252,0.72);
      --accent-soft: rgba(249,115,22,0.18);
      --bg: #0b1120;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Manrope, ui-sans-serif, system-ui, sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(249,115,22,0.18), transparent 24%),
        radial-gradient(circle at 85% 20%, rgba(34,197,94,0.12), transparent 18%),
        linear-gradient(180deg, #111827, var(--bg));
    }
    a { color: inherit; text-decoration: none; }
    .page { width: min(1280px, calc(100% - 32px)); margin: 0 auto; padding: 28px 0 72px; }
    .hero, .grid, .package-grid, .format-grid, .ig-grid { display: grid; gap: 20px; }
    .hero { grid-template-columns: 1.1fr 0.9fr; margin-bottom: 28px; }
    .grid { grid-template-columns: 1.1fr 1fr; }
    .package-grid, .format-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .ig-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
    .hero-panel, .card {
      border: 1px solid var(--line);
      background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.05));
      border-radius: 28px;
      padding: 24px;
      backdrop-filter: blur(12px);
    }
    .hero-main { display: grid; grid-template-columns: auto 1fr; gap: 18px; align-items: start; }
    .hero-main img { width: 82px; height: 82px; }
    .eyebrow, .label {
      display: inline-flex; padding: 7px 12px; border-radius: 999px; background: var(--accent-soft);
      color: #fdba74; font-size: 12px; font-weight: 800; letter-spacing: 0.04em; margin-bottom: 12px;
    }
    h1, h2, h3, strong { margin: 0; }
    .hero h1 { font-size: 42px; line-height: 1.05; }
    .hero p, .subtle, .caption-note { margin: 10px 0 0; color: var(--muted); font-size: 15px; line-height: 1.65; }
    .hero-stat-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 22px; }
    .hero-stat, .quick-link, .package-card, .format-card, .ig-card {
      border: 1px solid var(--line); background: rgba(255,255,255,0.05); border-radius: 22px;
    }
    .hero-stat { padding: 16px; }
    .hero-stat span { display: block; color: var(--muted); font-size: 12px; margin-bottom: 8px; }
    .hero-stat strong { font-size: 28px; font-weight: 800; }
    .quick-links { display: grid; gap: 12px; }
    .quick-link { display: block; padding: 18px; }
    .quick-link strong { display: block; margin-bottom: 6px; font-size: 16px; }
    .quick-link span { color: var(--muted); font-size: 13px; line-height: 1.5; }
    .stack { display: grid; gap: 20px; }
    .card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
    .card-head strong { display: block; margin-top: 4px; font-size: 18px; }
    .card-head span:last-child { color: var(--muted); font-size: 13px; }
    pre {
      margin: 0; white-space: pre-wrap; color: var(--text); font: 14px/1.7 ui-monospace, SFMono-Regular, monospace;
      background: rgba(15,23,42,0.55); border: 1px solid rgba(255,255,255,0.06); border-radius: 20px; padding: 18px;
    }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
    .button {
      display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 16px;
      border-radius: 999px; border: 1px solid var(--line); background: rgba(255,255,255,0.08); color: var(--text);
      font-weight: 700; cursor: pointer;
    }
    .button-primary { background: linear-gradient(135deg, #f97316, #fb923c); border-color: transparent; color: #fff7ed; }
    .manual-note { margin-top: 14px; padding: 14px 16px; border-radius: 18px; background: rgba(15,23,42,0.5); border: 1px solid rgba(255,255,255,0.06); color: var(--muted); font-size: 13px; line-height: 1.6; }
    .package-card img, .format-card img, .ig-card img { display: block; width: 100%; object-fit: cover; background: #111827; }
    .package-card img { aspect-ratio: 16 / 9; }
    .format-card img { aspect-ratio: 9 / 16; }
    .ig-card img { aspect-ratio: 4 / 5; }
    .package-card div, .format-card div, .ig-card div { padding: 16px; }
    .package-card strong, .format-card strong, .ig-card strong { display: block; font-size: 16px; }
    .package-card p, .format-card p, .ig-card p { margin: 8px 0 0; color: var(--muted); font-size: 13px; line-height: 1.6; }
    @media (max-width: 900px) {
      .hero, .grid, .hero-stat-grid, .package-grid, .format-grid, .ig-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="hero">
      <article class="hero-panel">
        <div class="hero-main">
          <img src="/social/brand-mark.svg" alt="Aktüel Karşılaştırma logosu">
          <div>
            <span class="eyebrow">Otomatik içerik akışı</span>
            <h1>Sosyal medya otomasyon merkezi</h1>
            <p>Saat 09:00 ve 18:00 çalışmalarıyla sosyal dosyalar otomatik yenilenir. Telegram otomatik paylaşılır, X ve Instagram için hazır içerikler burada bekler.</p>
          </div>
        </div>
        <div class="hero-stat-grid">
          <article class="hero-stat"><span>X paketi</span><strong>2</strong></article>
          <article class="hero-stat"><span>Instagram formatı</span><strong>${instagramFormats.length}</strong></article>
          <article class="hero-stat"><span>Site adresi</span><strong style="font-size:18px">${escapeHtml(displaySiteUrl.replace("https://", ""))}</strong></article>
        </div>
      </article>
      <article class="hero-panel quick-links">
        <a class="quick-link" href="${displaySiteUrl}"><strong>Ana siteye dön</strong><span>Kampanya akışlarını, filtreleri ve market detay sayfalarını aç.</span></a>
        <a class="quick-link" href="/admin.html"><strong>Yönetim durumu</strong><span>Veri kaynaklarını ve otomasyon seviyesini kontrol et.</span></a>
        <a class="quick-link" href="/social/queue.json"><strong>JSON kuyruğu</strong><span>Üretilen ham paylaşım verisini ve dosya isimlerini gör.</span></a>
      </article>
    </section>

    <section class="card" style="margin-bottom:20px;">
      <div class="card-head">
        <div><span class="label">X Günlük Paketler</span><strong>Sabah ve akşam ayrı manuel paylaşım akışı</strong></div>
        <span>Metin + görsel hazır</span>
      </div>
      <div class="package-grid">
        ${renderXPackageCard("morning", xPackage.morning)}
        ${renderXPackageCard("evening", xPackage.evening)}
      </div>
      <div class="manual-note">X için sistem her üretimde iki ayrı paket hazırlar: sabah paylaşımı ve akşam paylaşımı. Siz ilgili metni kopyalayıp görseli indirerek manuel paylaşım yaparsınız.</div>
    </section>

    <section class="grid">
      <div class="stack">
        <article class="card">
          <div class="card-head"><div><span class="label">Telegram Mesaj Taslağı</span><strong>Kanal akışı</strong></div><span>Bot hazır</span></div>
          <pre>${escapeHtml(telegramPost.body)}</pre>
        </article>
        <article class="card">
          <div class="card-head"><div><span class="label">Instagram Klasik Kartları</span><strong>Ek paylaşım seti</strong></div><span>${instagramCards.length} kart</span></div>
          <div class="ig-grid">
            ${instagramCards.map((card, index) => `
              <article class="ig-card">
                <img src="/social/instagram-card-${index + 1}.svg" alt="${escapeHtml(card.title)}">
                <div><strong>${escapeHtml(card.templateLabel)}</strong><p>${escapeHtml(card.caption)}</p></div>
              </article>
            `).join("")}
          </div>
        </article>
      </div>
      <article class="card">
        <div class="card-head"><div><span class="label">Instagram Günlük Formatları</span><strong>Story, post ve reel kapağı</strong></div><span>${instagramFormats.length} format</span></div>
        <div class="format-grid">
          ${instagramFormats.map((format) => `
            <article class="format-card">
              <img src="/social/${escapeHtml(format.file)}" alt="${escapeHtml(format.label)}">
              <div>
                <strong>${escapeHtml(format.label)}</strong>
                <p>${escapeHtml(format.note)}</p>
                <div class="actions"><a class="button" href="/social/${escapeHtml(format.file)}" download>İndir</a></div>
              </div>
            </article>
          `).join("")}
        </div>
        <p class="caption-note">Bu üç format her üretimde otomatik yenilenir. Story hızlı paylaşım, post ana akış, reel kapağı ise video kapağı için düşünülmüştür.</p>
      </article>
    </section>
  </main>
  <script>
    document.querySelectorAll('[data-copy-target]').forEach((button) => {
      button.addEventListener('click', async () => {
        const target = document.getElementById(button.getAttribute('data-copy-target'));
        if (!target) return;
        const original = button.textContent;
        try {
          await navigator.clipboard.writeText(target.textContent || '');
          button.textContent = 'Kopyalandı';
          setTimeout(() => { button.textContent = original; }, 1400);
        } catch (error) {
          button.textContent = 'Kopyalama başarısız';
          setTimeout(() => { button.textContent = original; }, 1800);
        }
      });
    });
  </script>
</body>
</html>`;
}

function renderXPackageCard(id, pkg) {
  return `
    <article class="package-card">
      <img src="/social/x-card-${id}.svg" alt="${escapeHtml(pkg.title)}">
      <div>
        <strong>${escapeHtml(pkg.title)}</strong>
        <p>${escapeHtml(id === "morning" ? "09:00 üretiminden sonra kullanın." : "18:00 üretiminden sonra kullanın.")}</p>
        <pre id="x-post-${id}">${escapeHtml(pkg.body)}</pre>
        <div class="actions">
          <button class="button button-primary" type="button" data-copy-target="x-post-${id}">Metni kopyala</button>
          <a class="button" href="/social/x-post-${id}.txt" download>Metni indir</a>
          <a class="button" href="/social/x-card-${id}.svg" download>Görseli indir</a>
        </div>
      </div>
    </article>`;
}

function renderXCardSvg(card) {
  const price = escapeHtml(formatPrice(card.price));
  const oldPrice = escapeHtml(formatPrice(card.previousPrice));
  const titleLines = wrapSvgText(card.title, 28, 2, 780, 340, 56);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1600" height="900" viewBox="0 0 1600 900" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgX" x1="0" y1="0" x2="1600" y2="900" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0f172a" />
      <stop offset="1" stop-color="#111827" />
    </linearGradient>
  </defs>
  <rect width="1600" height="900" rx="42" fill="url(#bgX)" />
  <circle cx="1440" cy="120" r="220" fill="${escapeHtml(card.marketColor)}" opacity="0.18" />
  <circle cx="180" cy="800" r="210" fill="#22c55e" opacity="0.08" />
  <rect x="56" y="56" width="1488" height="788" rx="34" fill="white" fill-opacity="0.05" stroke="white" stroke-opacity="0.08" />
  <image href="${escapeHtml(card.image)}" x="96" y="118" width="560" height="664" preserveAspectRatio="xMidYMid slice" />
  <rect x="96" y="118" width="560" height="664" rx="28" fill="#0f172a" fill-opacity="0.20" />
  <rect x="740" y="118" width="764" height="664" rx="32" fill="white" fill-opacity="0.06" />
  <text x="786" y="176" fill="#fdba74" font-size="24" font-family="Arial, sans-serif" font-weight="700">Aktüel Karşılaştırma</text>
  <text x="786" y="228" fill="white" font-size="54" font-family="Arial, sans-serif" font-weight="700">${escapeHtml(card.kicker)}</text>
  <rect x="786" y="270" width="210" height="52" rx="26" fill="${escapeHtml(card.marketColor)}22" />
  <text x="822" y="304" fill="${escapeHtml(card.marketColor)}" font-size="28" font-family="Arial, sans-serif" font-weight="700">${escapeHtml(card.market)}</text>
  <text fill="white" font-size="52" font-family="Arial, sans-serif" font-weight="700">${titleLines}</text>
  <text x="786" y="490" fill="#cbd5e1" font-size="28" font-family="Arial, sans-serif">${escapeHtml(card.category)}</text>
  <text x="786" y="590" fill="white" font-size="92" font-family="Arial, sans-serif" font-weight="700">${price}</text>
  <text x="1096" y="590" fill="#94a3b8" font-size="34" font-family="Arial, sans-serif" text-decoration="line-through">${oldPrice}</text>
  <rect x="1298" y="514" width="140" height="140" rx="70" fill="${escapeHtml(card.marketColor)}" />
  <text x="1334" y="572" fill="white" font-size="40" font-family="Arial, sans-serif" font-weight="700">%${card.discountRate}</text>
  <text x="1320" y="610" fill="white" font-size="24" font-family="Arial, sans-serif">indirim</text>
  <rect x="786" y="666" width="640" height="2" fill="white" fill-opacity="0.1" />
  <text x="786" y="718" fill="#fdba74" font-size="30" font-family="Arial, sans-serif">Detaylar: ${escapeHtml(displaySiteUrl)}</text>
  <text x="786" y="760" fill="#94a3b8" font-size="24" font-family="Arial, sans-serif">Market kampanyaları ve fiyat karşılaştırmaları tek ekranda.</text>
</svg>`;
}

function renderSocialFormatSvg(format) {
  if (format.kind === "story") return renderStorySvg(format);
  if (format.kind === "post") return renderFormatPostSvg(format);
  return renderReelCoverSvg(format);
}

function renderStorySvg(format) {
  const price = escapeHtml(formatPrice(format.price));
  const oldPrice = escapeHtml(formatPrice(format.previousPrice));
  const titleLines = wrapSvgText(format.title, 18, 3, 96, 1090, 54);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${format.width}" height="${format.height}" viewBox="0 0 ${format.width} ${format.height}" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="storyBg" x1="0" y1="0" x2="1080" y2="1920" gradientUnits="userSpaceOnUse"><stop stop-color="#111827" /><stop offset="1" stop-color="#1e293b" /></linearGradient></defs>
  <rect width="1080" height="1920" fill="url(#storyBg)" />
  <circle cx="930" cy="220" r="240" fill="${escapeHtml(format.marketColor)}" opacity="0.16" />
  <image href="${escapeHtml(format.image)}" x="72" y="180" width="936" height="780" preserveAspectRatio="xMidYMid slice" />
  <rect x="72" y="180" width="936" height="780" rx="30" fill="#0f172a" fill-opacity="0.22" />
  <rect x="72" y="72" width="936" height="80" rx="24" fill="white" fill-opacity="0.08" />
  <text x="120" y="122" fill="white" font-size="38" font-family="Arial, sans-serif" font-weight="700">Aktüel Karşılaştırma</text>
  <rect x="72" y="1000" width="936" height="760" rx="34" fill="white" fill-opacity="0.07" />
  <rect x="108" y="1042" width="220" height="56" rx="28" fill="${escapeHtml(format.marketColor)}22" />
  <text x="142" y="1078" fill="${escapeHtml(format.marketColor)}" font-size="28" font-family="Arial, sans-serif" font-weight="700">${escapeHtml(format.market)}</text>
  <text fill="white" font-size="50" font-family="Arial, sans-serif" font-weight="700">${titleLines}</text>
  <text x="108" y="1310" fill="white" font-size="84" font-family="Arial, sans-serif" font-weight="700">${price}</text>
  <text x="410" y="1310" fill="#94a3b8" font-size="32" font-family="Arial, sans-serif" text-decoration="line-through">${oldPrice}</text>
  <rect x="776" y="1222" width="140" height="140" rx="70" fill="${escapeHtml(format.marketColor)}" />
  <text x="812" y="1280" fill="white" font-size="40" font-family="Arial, sans-serif" font-weight="700">%${format.discountRate}</text>
  <text x="794" y="1318" fill="white" font-size="22" font-family="Arial, sans-serif">indirim</text>
  <text x="108" y="1502" fill="#fdba74" font-size="30" font-family="Arial, sans-serif">Bugünün story fırsatı</text>
  <text x="108" y="1560" fill="#cbd5e1" font-size="26" font-family="Arial, sans-serif">Detaylar: ${escapeHtml(displaySiteUrl)}</text>
</svg>`;
}

function renderFormatPostSvg(format) {
  const blocks = format.items.map((item, index) => {
    const x = 100;
    const y = 320 + index * 290;
    const market = item.market?.name ?? item.marketSlug;
    const color = item.market?.color ?? "#f97316";
    return `<rect x="${x}" y="${y}" width="880" height="230" rx="28" fill="white" fill-opacity="0.06" />
      <rect x="${x + 28}" y="${y + 26}" width="220" height="44" rx="22" fill="${escapeHtml(color)}22" />
      <text x="${x + 58}" y="${y + 56}" fill="${escapeHtml(color)}" font-size="24" font-family="Arial, sans-serif" font-weight="700">${escapeHtml(market)}</text>
      <text fill="white" font-size="32" font-family="Arial, sans-serif" font-weight="700">${wrapSvgText(item.title, 26, 2, x + 28, y + 120, 36)}</text>
      <text x="${x + 28}" y="${y + 186}" fill="white" font-size="42" font-family="Arial, sans-serif" font-weight="700">${escapeHtml(formatPrice(item.price))}</text>
      <text x="${x + 724}" y="${y + 186}" fill="#fdba74" font-size="28" font-family="Arial, sans-serif">%${item.discountRate}</text>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="postBg" x1="0" y1="0" x2="1080" y2="1350" gradientUnits="userSpaceOnUse"><stop stop-color="#111827" /><stop offset="1" stop-color="#172554" /></linearGradient></defs>
  <rect width="1080" height="1350" fill="url(#postBg)" />
  <rect x="60" y="60" width="960" height="1230" rx="40" fill="white" fill-opacity="0.05" stroke="white" stroke-opacity="0.08" />
  <text x="100" y="150" fill="#fdba74" font-size="28" font-family="Arial, sans-serif" font-weight="700">Instagram Post</text>
  <text x="100" y="228" fill="white" font-size="62" font-family="Arial, sans-serif" font-weight="700">${escapeHtml(format.title)}</text>
  <text x="100" y="276" fill="#cbd5e1" font-size="28" font-family="Arial, sans-serif">Öne çıkan marketleri tek gönderide karşılaştırın.</text>
  ${blocks}
  <text x="100" y="1244" fill="#fdba74" font-size="28" font-family="Arial, sans-serif">Detaylar: ${escapeHtml(displaySiteUrl)}</text>
</svg>`;
}

function renderReelCoverSvg(format) {
  const rows = format.items.map((item, index) => {
    const y = 720 + index * 170;
    const market = item.market?.name ?? item.marketSlug;
    const color = item.market?.color ?? "#f97316";
    return `<rect x="90" y="${y}" width="900" height="128" rx="24" fill="white" fill-opacity="0.06" />
      <text x="126" y="${y + 46}" fill="${escapeHtml(color)}" font-size="24" font-family="Arial, sans-serif" font-weight="700">${escapeHtml(market)}</text>
      <text fill="white" font-size="30" font-family="Arial, sans-serif" font-weight="700">${wrapSvgText(item.title, 28, 2, 126, y + 86, 32)}</text>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="reelBg" x1="0" y1="0" x2="1080" y2="1920" gradientUnits="userSpaceOnUse"><stop stop-color="#0f172a" /><stop offset="1" stop-color="#111827" /></linearGradient></defs>
  <rect width="1080" height="1920" fill="url(#reelBg)" />
  <circle cx="910" cy="220" r="250" fill="#f97316" opacity="0.15" />
  <circle cx="160" cy="1640" r="220" fill="#22c55e" opacity="0.08" />
  <rect x="60" y="60" width="960" height="1800" rx="40" fill="white" fill-opacity="0.05" stroke="white" stroke-opacity="0.08" />
  <text x="96" y="146" fill="#fdba74" font-size="28" font-family="Arial, sans-serif" font-weight="700">Reel Kapağı</text>
  <text x="96" y="250" fill="white" font-size="82" font-family="Arial, sans-serif" font-weight="700">${escapeHtml(format.title)}</text>
  <text x="96" y="318" fill="#cbd5e1" font-size="30" font-family="Arial, sans-serif">Akşam reels paylaşımı için hazır kapak.</text>
  <rect x="96" y="400" width="888" height="240" rx="34" fill="white" fill-opacity="0.06" />
  <text x="136" y="492" fill="#ffffff" font-size="56" font-family="Arial, sans-serif" font-weight="700">Bugünün 5 fırsatı</text>
  <text x="136" y="552" fill="#cbd5e1" font-size="28" font-family="Arial, sans-serif">Marketlerde öne çıkan ürünleri hızlıca gösterin.</text>
  ${rows}
  <text x="96" y="1800" fill="#fdba74" font-size="28" font-family="Arial, sans-serif">Detaylar: ${escapeHtml(displaySiteUrl)}</text>
</svg>`;
}

function renderInstagramSvg(card) {
  if (card.template === "comparison") return renderComparisonSvg(card);
  if (card.template === "roundup") return renderRoundupSvg(card);
  return renderSingleDealSvg(card);
}

function renderSingleDealSvg(card) {
  const price = escapeHtml(formatPrice(card.price));
  const oldPrice = escapeHtml(formatPrice(card.previousPrice));
  const titleLines = wrapSvgText(card.title, 22, 3, 128, 850, 58);
  const market = escapeHtml(card.market);
  const category = escapeHtml(card.category);
  const theme = escapeHtml(card.theme);
  const image = escapeHtml(card.image);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="120" y1="120" x2="960" y2="1230" gradientUnits="userSpaceOnUse"><stop stop-color="#111827" /><stop offset="1" stop-color="#1f2937" /></linearGradient>
    <linearGradient id="accent" x1="200" y1="140" x2="880" y2="1140" gradientUnits="userSpaceOnUse"><stop stop-color="${theme}" /><stop offset="1" stop-color="#f97316" /></linearGradient>
  </defs>
  <rect width="1080" height="1350" rx="54" fill="url(#bg)" />
  <circle cx="860" cy="180" r="220" fill="${theme}" opacity="0.16" />
  <circle cx="170" cy="1160" r="220" fill="#22c55e" opacity="0.12" />
  <rect x="64" y="64" width="952" height="1222" rx="42" fill="white" fill-opacity="0.06" stroke="white" stroke-opacity="0.1" />
  <image href="${image}" x="96" y="208" width="888" height="430" preserveAspectRatio="xMidYMid slice" />
  <rect x="96" y="208" width="888" height="430" rx="30" fill="#0f172a" fill-opacity="0.24" />
  <rect x="96" y="96" width="888" height="92" rx="28" fill="white" fill-opacity="0.08" />
  <text x="176" y="154" fill="white" font-size="42" font-family="Arial, sans-serif" font-weight="700">Aktüel Karşılaştırma</text>
  <rect x="96" y="676" width="888" height="528" rx="34" fill="white" fill-opacity="0.08" />
  <rect x="128" y="712" width="230" height="62" rx="31" fill="url(#accent)" />
  <text x="168" y="753" fill="#fff7ed" font-size="30" font-family="Arial, sans-serif" font-weight="700">${market}</text>
  <rect x="784" y="700" width="104" height="104" rx="52" fill="${theme}" />
  <text x="817" y="744" fill="white" font-size="30" font-family="Arial, sans-serif" font-weight="700">%${card.discountRate}</text>
  <text x="802" y="780" fill="white" font-size="18" font-family="Arial, sans-serif">indirim</text>
  <text fill="white" font-size="52" font-family="Arial, sans-serif" font-weight="700">${titleLines}</text>
  <text x="128" y="1016" fill="#cbd5e1" font-size="29" font-family="Arial, sans-serif">${category}</text>
  <text x="128" y="1098" fill="#ffffff" font-size="78" font-family="Arial, sans-serif" font-weight="700">${price}</text>
  <text x="430" y="1098" fill="#94a3b8" font-size="34" font-family="Arial, sans-serif" text-decoration="line-through">${oldPrice}</text>
  <rect x="128" y="1138" width="824" height="2" fill="white" fill-opacity="0.1" />
  <text x="128" y="1190" fill="#fdba74" font-size="28" font-family="Arial, sans-serif">Detaylar: ${escapeHtml(displaySiteUrl)}</text>
  <text x="128" y="1234" fill="#94a3b8" font-size="24" font-family="Arial, sans-serif">Güncel fiyatlar ve market karşılaştırmaları</text>
</svg>`;
}

function renderComparisonSvg(card) {
  const blocks = card.items.slice(0, 3).map((item, index) => {
    const x = 120 + index * 290;
    return `<rect x="${x}" y="430" width="250" height="310" rx="28" fill="${escapeHtml(item.color)}22" stroke="${escapeHtml(item.color)}66" stroke-width="3" />
      <text x="${x + 28}" y="490" fill="${escapeHtml(item.color)}" font-size="34" font-family="Arial, sans-serif" font-weight="700">${escapeHtml(item.market)}</text>
      <text x="${x + 28}" y="570" fill="white" font-size="60" font-family="Arial, sans-serif" font-weight="700">${escapeHtml(formatPrice(item.price))}</text>
      <text x="${x + 28}" y="626" fill="#cbd5e1" font-size="24" font-family="Arial, sans-serif">indirim %${item.discountRate}</text>
      <text fill="#e5e7eb" font-size="24" font-family="Arial, sans-serif">${wrapSvgText(item.title, 18, 3, x + 28, 680, 30)}</text>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="bgCmp" x1="0" y1="0" x2="1080" y2="1350" gradientUnits="userSpaceOnUse"><stop stop-color="#0f172a" /><stop offset="1" stop-color="#111827" /></linearGradient></defs>
  <rect width="1080" height="1350" rx="54" fill="url(#bgCmp)" />
  <rect x="64" y="64" width="952" height="1222" rx="42" fill="white" fill-opacity="0.06" stroke="white" stroke-opacity="0.1" />
  <text x="120" y="160" fill="#fdba74" font-size="28" font-family="Arial, sans-serif" font-weight="700">Market karşılaştırma</text>
  <text x="120" y="240" fill="white" font-size="68" font-family="Arial, sans-serif" font-weight="700">Aynı haftanın en iyi fiyatları</text>
  <text x="120" y="306" fill="#cbd5e1" font-size="30" font-family="Arial, sans-serif">Farklı marketlerde öne çıkan ürünleri hızlı karşılaştırın.</text>
  <rect x="120" y="340" width="840" height="2" fill="white" fill-opacity="0.1" />
  ${blocks}
  <text x="120" y="1160" fill="#fdba74" font-size="28" font-family="Arial, sans-serif">Detaylar: ${escapeHtml(displaySiteUrl)}</text>
  <text x="120" y="1210" fill="#94a3b8" font-size="24" font-family="Arial, sans-serif">${escapeHtml(card.caption)}</text>
</svg>`;
}

function renderRoundupSvg(card) {
  const rows = card.items.slice(0, 5).map((item, index) => {
    const y = 340 + index * 158;
    return `<rect x="96" y="${y}" width="888" height="128" rx="24" fill="white" fill-opacity="0.06" />
      <rect x="122" y="${y + 22}" width="188" height="42" rx="21" fill="${escapeHtml(item.color)}22" />
      <text x="148" y="${y + 50}" fill="${escapeHtml(item.color)}" font-size="24" font-family="Arial, sans-serif" font-weight="700">${escapeHtml(item.market)}</text>
      <text fill="white" font-size="30" font-family="Arial, sans-serif" font-weight="700">${wrapSvgText(item.title, 30, 2, 122, y + 88, 32)}</text>
      <text x="772" y="${y + 58}" fill="#ffffff" font-size="36" font-family="Arial, sans-serif" font-weight="700">${escapeHtml(formatPrice(item.price))}</text>
      <text x="792" y="${y + 98}" fill="#fdba74" font-size="22" font-family="Arial, sans-serif">%${item.discountRate} indirim</text>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="bgRound" x1="0" y1="0" x2="1080" y2="1350" gradientUnits="userSpaceOnUse"><stop stop-color="#111827" /><stop offset="1" stop-color="#172554" /></linearGradient></defs>
  <rect width="1080" height="1350" rx="54" fill="url(#bgRound)" />
  <rect x="64" y="64" width="952" height="1222" rx="42" fill="white" fill-opacity="0.06" stroke="white" stroke-opacity="0.1" />
  <text x="96" y="158" fill="#fdba74" font-size="28" font-family="Arial, sans-serif" font-weight="700">Haftanın 5 fırsatı</text>
  <text x="96" y="240" fill="white" font-size="66" font-family="Arial, sans-serif" font-weight="700">Tek karede haftalık özet</text>
  <text x="96" y="300" fill="#cbd5e1" font-size="30" font-family="Arial, sans-serif">En güçlü kampanyaları tek görselde toplayın.</text>
  ${rows}
  <text x="96" y="1210" fill="#fdba74" font-size="28" font-family="Arial, sans-serif">Detaylar: ${escapeHtml(displaySiteUrl)}</text>
</svg>`;
}

function wrapSvgText(value, lineLength = 22, maxLines = 3, x = 128, y = 850, lineHeight = 58) {
  const words = String(value || "").split(/\\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (!current || next.length <= lineLength) current = next;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  const clipped = lines.slice(0, maxLines).map((line, index) => index === maxLines - 1 && lines.length > maxLines ? `${line.slice(0, Math.max(0, lineLength - 1)).trimEnd()}...` : line);
  return clipped.map((line, index) => `<tspan x="${x}" y="${y + index * lineHeight}">${escapeHtml(line)}</tspan>`).join("");
}

async function readJson(filePath) {
  const content = await readFile(path.join(root, filePath), "utf8");
  return JSON.parse(content);
}

function formatPrice(value) {
  if (!value || value <= 0) return "Fiyat bekleniyor";
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(value);
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
