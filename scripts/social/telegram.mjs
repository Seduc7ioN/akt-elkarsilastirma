// Telegram kanaluna yeni indirim urunlerini otomatik yollar.
// Calistirma: node scripts/social/telegram.mjs
// Env (GitHub Actions secret):
//   SUPABASE_URL, SUPABASE_ANON_KEY  (okuma icin)
//   SUPABASE_SERVICE_KEY             (social_posts yazimi icin; yoksa anon denenir)
//   TELEGRAM_BOT_TOKEN               (BotFather token)
//   TELEGRAM_CHAT_ID                 (@kanalkullaniciadi veya -100... numara)
//   SITE_URL                         (https://xn--aktelkarsilastirma-o6b.com)
// Opsiyonel:
//   SOCIAL_MIN_DISCOUNT  (default 25)  — yalnizca %X+ indirimler
//   SOCIAL_MAX_PER_RUN   (default 6)   — tek calistirmada max urun
//   SOCIAL_PER_MARKET    (default 2)   — market basina max urun
//   SOCIAL_DRY_RUN       ("1" ise gondermez, sadece loglar)

import { loadEnv } from "../lib/env.mjs";
import { supabaseClient } from "../lib/supabase.mjs";

loadEnv(process.cwd());

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT = process.env.TELEGRAM_CHAT_ID || "";
const SITE = (process.env.SITE_URL || "https://xn--aktelkarsilastirma-o6b.com").replace(/\/$/, "");
const MIN = Number(process.env.SOCIAL_MIN_DISCOUNT || 25);
const MAX_RUN = Number(process.env.SOCIAL_MAX_PER_RUN || 6);
const PER_MARKET = Number(process.env.SOCIAL_PER_MARKET || 2);
const DRY = process.env.SOCIAL_DRY_RUN === "1";

if (!TOKEN || !CHAT) {
  console.log("Telegram env tanimli degil (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID). Atlandi.");
  process.exit(0);
}

const SUPA_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPA_ANON = process.env.SUPABASE_ANON_KEY || "";
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_KEY || SUPA_ANON;
if (!SUPA_URL || !SUPA_ANON) throw new Error("SUPABASE_URL / SUPABASE_ANON_KEY gerekli");

const db = supabaseClient({ url: SUPA_URL, key: SUPA_ANON });

const MARKET_LABELS = {
  bim: "BİM", a101: "A101", sok: "ŞOK", migros: "Migros",
  carrefoursa: "CarrefourSA", metro: "Metro", hakmar: "Hakmar",
  file: "File", bizimtoptan: "Bizim Toptan", tarimkredi: "Tarım Kredi",
  macrocenter: "Macrocenter", happycenter: "HappyCenter", onur: "Onur",
  mopas: "Mopaş", pekdemir: "Pekdemir", gimsa: "Gimsa", esenlik: "Esenlik",
};
const TR_MONTHS = ["ocak","subat","mart","nisan","mayis","haziran","temmuz","agustos","eylul","ekim","kasim","aralik"];

function tr(n) {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n)) + " ₺";
}
function marketName(id) { return MARKET_LABELS[id] || (id || "").toUpperCase(); }
function slugDate(d) {
  const dt = new Date(d);
  if (isNaN(dt)) return "";
  return `${dt.getUTCDate()}-${TR_MONTHS[dt.getUTCMonth()]}-${dt.getUTCFullYear()}`;
}
// MarkdownV2 icin ozel karakter kacisi
function md(s) {
  return String(s ?? "").replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

console.log("Supabase'ten veri cekiliyor...");
const [catalogs, products, postedRows] = await Promise.all([
  db.queryAll("weekly_catalogs", "select=id,market_id,week_start,week_end,period_text"),
  db.queryAll("products", "select=*&order=scraped_at.desc"),
  db.queryAll("social_posts", "select=product_id&channel=eq.telegram").catch((e) => {
    console.warn("social_posts okunamadi (muhtemelen tablo yok): " + e.message);
    return [];
  }),
]);
console.log(`Katalog: ${catalogs.length}, urun: ${products.length}, onceden gonderilmis: ${postedRows.length}`);

const catalogById = new Map(catalogs.map((c) => [c.id, c]));
const postedIds = new Set(postedRows.map((r) => String(r.product_id)));

function catalogUrlFor(p) {
  const c = catalogById.get(p.catalog_id);
  const base = `${SITE}/${p.market_id}-aktuel/`;
  if (!c || !c.week_start) return base;
  const slug = slugDate(c.week_start);
  return slug ? `${base}${slug}/` : base;
}

// Aday filtresi: indirim >= MIN, resim + isim + fiyat var, henuz paylasilmamis
const candidates = products
  .filter((p) => !postedIds.has(String(p.id)))
  .filter((p) => Number(p.discount_pct) >= MIN)
  .filter((p) => p.image && p.name && p.price != null && p.price !== "")
  .sort((a, b) => Number(b.discount_pct || 0) - Number(a.discount_pct || 0));

// Market basina PER_MARKET, toplamda MAX_RUN
const selected = [];
const perMarket = new Map();
for (const p of candidates) {
  const m = p.market_id || "_";
  if ((perMarket.get(m) || 0) >= PER_MARKET) continue;
  selected.push(p);
  perMarket.set(m, (perMarket.get(m) || 0) + 1);
  if (selected.length >= MAX_RUN) break;
}

console.log(`Aday: ${candidates.length}, bu turda secilen: ${selected.length}`);

function buildCaption(p) {
  const mName = marketName(p.market_id);
  const lines = [];
  lines.push(`🔥 *${md(mName)}* — ${md(p.name)}`);
  lines.push("");
  if (p.old_price && Number(p.old_price) > Number(p.price)) {
    lines.push(`~${md(tr(p.old_price))}~ → *${md(tr(p.price))}*  \\(%${md(p.discount_pct)} indirim\\)`);
  } else {
    lines.push(`*${md(tr(p.price))}*  \\(%${md(p.discount_pct)} indirim\\)`);
  }
  const c = catalogById.get(p.catalog_id);
  const period = (c?.period_text && !/\?\?/.test(c.period_text) && !/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(c.period_text))
    ? c.period_text
    : (c?.week_start ? `${slugDate(c.week_start).replace(/-/g," ")}`: "");
  if (period) {
    lines.push("");
    lines.push(`🗓 ${md(period)}`);
  }
  lines.push("");
  lines.push(`📰 [Kataloğu gör](${catalogUrlFor(p)})`);
  return lines.join("\n");
}

async function sendPhoto(p) {
  const body = {
    chat_id: CHAT,
    photo: p.image,
    caption: buildCaption(p),
    parse_mode: "MarkdownV2",
  };
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendPhoto`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!j.ok) {
    // photo URL reddedilirse linki aciklamaya koyup sendMessage'a fallback
    const alt = {
      chat_id: CHAT,
      text: buildCaption(p) + `\n\n🖼 ${p.image}`,
      parse_mode: "MarkdownV2",
      disable_web_page_preview: false,
    };
    const r2 = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(alt),
    });
    const j2 = await r2.json().catch(() => ({}));
    if (!j2.ok) throw new Error(`sendPhoto+sendMessage: ${JSON.stringify(j)} / ${JSON.stringify(j2)}`);
    return j2.result.message_id;
  }
  return j.result.message_id;
}

async function markPosted(p, messageId) {
  const res = await fetch(`${SUPA_URL}/rest/v1/social_posts`, {
    method: "POST",
    headers: {
      apikey: SUPA_SERVICE,
      Authorization: `Bearer ${SUPA_SERVICE}`,
      "content-type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify({
      product_id: String(p.id),
      channel: "telegram",
      message_id: messageId ? String(messageId) : null,
    }),
  });
  if (!res.ok && res.status !== 409) {
    const t = await res.text();
    console.warn(`social_posts yazim uyarisi (${res.status}): ${t}`);
  }
}

let sent = 0;
let failed = 0;
for (const p of selected) {
  try {
    if (DRY) {
      console.log(`[DRY] ${marketName(p.market_id)} — ${p.name} — %${p.discount_pct} — ${catalogUrlFor(p)}`);
      sent++;
      continue;
    }
    const mid = await sendPhoto(p);
    await markPosted(p, mid);
    console.log(`✓ ${marketName(p.market_id)} — ${p.name} — %${p.discount_pct}`);
    sent++;
    await new Promise((r) => setTimeout(r, 1800)); // Telegram rate limiti (~1 msg/sn kanallarda)
  } catch (e) {
    failed++;
    console.error(`✗ ${p.id} — ${p.name}: ${e.message}`);
  }
}

console.log(`\nTelegram: ${sent} gonderildi, ${failed} hata.`);
