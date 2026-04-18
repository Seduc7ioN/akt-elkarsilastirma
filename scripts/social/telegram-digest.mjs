// Telegram — DIGEST MODU
// "Sabah / Ikindi / Aksam Fiyat Karsilastirmalari" tarzi numarali ozet post.
// Tek mesajda 6 urun, fotografsiz, katalog sayfasina link ile.
// Cron: gunde 3 kez (09:00 / 15:00 / 20:00 TR).
//
// Env:
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, SITE_URL
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY
// Opsiyonel:
//   SOCIAL_DIGEST_COUNT      (default 6)
//   SOCIAL_DIGEST_MIN_DISCOUNT (default 20)
//   SOCIAL_DIGEST_PER_MARKET (default 2)
//   SOCIAL_DRY_RUN

import {
  ensureEnv, db, tr, marketName, md, catalogUrlFor,
  sendMessage, markPosted, fetchPostedIds,
  trDayPart, trDateStamp, SITE, DRY,
} from "./lib/common.mjs";

ensureEnv();

const COUNT = Number(process.env.SOCIAL_DIGEST_COUNT || 6);
const MIN = Number(process.env.SOCIAL_DIGEST_MIN_DISCOUNT || 20);
const PER_MARKET = Number(process.env.SOCIAL_DIGEST_PER_MARKET || 2);
const CHANNEL = "telegram_digest";

console.log(`Digest mod — ${COUNT} urun, min %${MIN}, ${PER_MARKET}/market`);

const d = db();
const [catalogs, products, postedIds] = await Promise.all([
  d.queryAll("weekly_catalogs", "select=id,market_id,week_start,week_end,period_text"),
  d.queryAll("products", "select=*&order=scraped_at.desc"),
  fetchPostedIds(CHANNEL),
]);

const catalogById = new Map(catalogs.map((c) => [c.id, c]));

// Fark oluşturmak icin: digest'e giren urunu son 7 gun icinde tekrar koyma — postedIds yeterli.
// Ayrica indirim % + isim varsa secilebilir.
const candidates = products
  .filter((p) => !postedIds.has(String(p.id)))
  .filter((p) => Number(p.discount_pct) >= MIN)
  .filter((p) => p.name && p.price != null && p.price !== "")
  .sort((a, b) => Number(b.discount_pct || 0) - Number(a.discount_pct || 0));

// Market cesitliligi
const selected = [];
const perMarket = new Map();
for (const p of candidates) {
  const m = p.market_id || "_";
  if ((perMarket.get(m) || 0) >= PER_MARKET) continue;
  selected.push(p);
  perMarket.set(m, (perMarket.get(m) || 0) + 1);
  if (selected.length >= COUNT) break;
}

console.log(`Aday: ${candidates.length}, secilen: ${selected.length}`);

if (selected.length === 0) {
  console.log("Digest icin uygun urun yok, mesaj atilmadi.");
  process.exit(0);
}

function buildDigest(items) {
  const title = `${trDayPart()} Fiyat Karşılaştırmaları`;
  const date = trDateStamp();
  const lines = [];
  lines.push(`*${md(title)}*`);
  lines.push(`${md(date)}`);
  lines.push("");
  items.forEach((p, i) => {
    const url = catalogUrlFor(p, catalogById);
    lines.push(`${i + 1}\\. *${md(marketName(p.market_id))}*`);
    lines.push(`[${md(p.name)}](${url})`);
    if (p.old_price && Number(p.old_price) > Number(p.price)) {
      lines.push(`~${md(tr(p.old_price))}~ *${md(tr(p.price))}*  \\(%${md(p.discount_pct)}\\)`);
    } else {
      lines.push(`*${md(tr(p.price))}*  \\(%${md(p.discount_pct)}\\)`);
    }
    lines.push("");
  });
  lines.push(`[Tüm indirimleri gör](${SITE})`);
  return lines.join("\n");
}

const text = buildDigest(selected);

if (DRY) {
  console.log("[DRY RUN] Mesaj:\n" + text);
  process.exit(0);
}

try {
  const mid = await sendMessage(text, { disablePreview: true });
  // Digest'e giren tum urunleri posted olarak isaretle
  for (const p of selected) {
    await markPosted(p.id, CHANNEL, mid);
  }
  console.log(`✓ Digest gonderildi: ${selected.length} urun, message_id=${mid}`);
} catch (e) {
  console.error(`✗ Digest hata: ${e.message}`);
  process.exit(1);
}
