// Telegram — SPOT MODU
// Buyuk tekil indirimleri (%40+) fotografli post olarak atar.
// Cron: 2 saatte bir. Her calistirmada max 4 urun, market basina 1.
//
// Env:
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, SITE_URL
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY
// Opsiyonel:
//   SOCIAL_SPOT_MIN_DISCOUNT (default 40)
//   SOCIAL_SPOT_MAX_PER_RUN  (default 4)
//   SOCIAL_SPOT_PER_MARKET   (default 1)
//   SOCIAL_DRY_RUN           ("1" ise yazmaz)

import {
  ensureEnv, db, tr, marketName, md, catalogUrlFor,
  sendPhotoWithFallback, markPosted, fetchPostedIds, DRY,
} from "./lib/common.mjs";

ensureEnv();

const MIN = Number(process.env.SOCIAL_SPOT_MIN_DISCOUNT || 40);
const MAX_RUN = Number(process.env.SOCIAL_SPOT_MAX_PER_RUN || 4);
const PER_MARKET = Number(process.env.SOCIAL_SPOT_PER_MARKET || 1);
const CHANNEL = "telegram_spot";

console.log(`Spot mod — min %${MIN}, max ${MAX_RUN}/tur, ${PER_MARKET}/market`);

const d = db();
const [catalogs, products, postedIds] = await Promise.all([
  d.queryAll("weekly_catalogs", "select=id,market_id,week_start,week_end,period_text"),
  d.queryAll("products", "select=*&order=scraped_at.desc"),
  fetchPostedIds(CHANNEL),
]);

const catalogById = new Map(catalogs.map((c) => [c.id, c]));

const candidates = products
  .filter((p) => !postedIds.has(String(p.id)))
  .filter((p) => Number(p.discount_pct) >= MIN)
  .filter((p) => p.image && p.name && p.price != null && p.price !== "")
  .sort((a, b) => Number(b.discount_pct || 0) - Number(a.discount_pct || 0));

const selected = [];
const perMarket = new Map();
for (const p of candidates) {
  const m = p.market_id || "_";
  if ((perMarket.get(m) || 0) >= PER_MARKET) continue;
  selected.push(p);
  perMarket.set(m, (perMarket.get(m) || 0) + 1);
  if (selected.length >= MAX_RUN) break;
}

console.log(`Aday: ${candidates.length}, secilen: ${selected.length}`);

function caption(p) {
  const mName = marketName(p.market_id);
  const lines = [];
  lines.push(`🔥 *BÜYÜK İNDİRİM* — ${md(mName)}`);
  lines.push("");
  lines.push(`*${md(p.name)}*`);
  lines.push("");
  if (p.old_price && Number(p.old_price) > Number(p.price)) {
    lines.push(`~${md(tr(p.old_price))}~ → *${md(tr(p.price))}*`);
    lines.push(`💸 \\%${md(p.discount_pct)} indirim`);
  } else {
    lines.push(`*${md(tr(p.price))}*  \\(%${md(p.discount_pct)} indirim\\)`);
  }
  lines.push("");
  lines.push(`📰 [Kataloğu gör](${catalogUrlFor(p, catalogById)})`);
  return lines.join("\n");
}

let sent = 0, failed = 0;
for (const p of selected) {
  try {
    if (DRY) {
      console.log(`[DRY] ${marketName(p.market_id)} — ${p.name} — %${p.discount_pct}`);
      sent++;
      continue;
    }
    const mid = await sendPhotoWithFallback(p.image, caption(p));
    await markPosted(p.id, CHANNEL, mid);
    console.log(`✓ ${marketName(p.market_id)} — ${p.name} — %${p.discount_pct}`);
    sent++;
    await new Promise((r) => setTimeout(r, 1800));
  } catch (e) {
    failed++;
    console.error(`✗ ${p.id}: ${e.message}`);
  }
}

console.log(`\nSpot: ${sent} gonderildi, ${failed} hata.`);
