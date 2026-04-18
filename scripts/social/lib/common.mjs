// Telegram scriptleri arasinda paylasilan yardimcilar.
import { loadEnv } from "../../lib/env.mjs";
import { supabaseClient } from "../../lib/supabase.mjs";

loadEnv(process.cwd());

export const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
export const CHAT = process.env.TELEGRAM_CHAT_ID || "";
export const SITE = (process.env.SITE_URL || "https://xn--aktelkarsilastirma-o6b.com").replace(/\/$/, "");
export const SUPA_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
export const SUPA_ANON = process.env.SUPABASE_ANON_KEY || "";
export const SUPA_SERVICE = process.env.SUPABASE_SERVICE_KEY || SUPA_ANON;
export const DRY = process.env.SOCIAL_DRY_RUN === "1";

export const MARKET_LABELS = {
  bim: "BİM", a101: "A101", sok: "ŞOK", migros: "Migros",
  carrefoursa: "CarrefourSA", metro: "Metro", hakmar: "Hakmar",
  file: "File", bizimtoptan: "Bizim Toptan", tarimkredi: "Tarım Kredi",
  macrocenter: "Macrocenter", happycenter: "HappyCenter", onur: "Onur",
  mopas: "Mopaş", pekdemir: "Pekdemir", gimsa: "Gimsa", esenlik: "Esenlik",
};

const TR_MONTHS = ["ocak","subat","mart","nisan","mayis","haziran","temmuz","agustos","eylul","ekim","kasim","aralik"];

export function ensureEnv() {
  if (!TOKEN || !CHAT) {
    console.log("Telegram env tanimli degil (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID). Atlandi.");
    process.exit(0);
  }
  if (!SUPA_URL || !SUPA_ANON) throw new Error("SUPABASE_URL / SUPABASE_ANON_KEY gerekli");
}

export function db() {
  return supabaseClient({ url: SUPA_URL, key: SUPA_ANON });
}

export function tr(n) {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n)) + " ₺";
}

export function marketName(id) {
  return MARKET_LABELS[id] || (id || "").toUpperCase();
}

export function slugDate(d) {
  const dt = new Date(d);
  if (isNaN(dt)) return "";
  return `${dt.getUTCDate()}-${TR_MONTHS[dt.getUTCMonth()]}-${dt.getUTCFullYear()}`;
}

export function catalogUrlFor(p, catalogById) {
  const c = catalogById.get(p.catalog_id);
  const base = `${SITE}/${p.market_id}-aktuel/`;
  if (!c || !c.week_start) return base;
  const slug = slugDate(c.week_start);
  return slug ? `${base}${slug}/` : base;
}

// MarkdownV2 kacisi
export function md(s) {
  return String(s ?? "").replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

// Turkiye saatine gore gunun dilimi adi
export function trDayPart(date = new Date()) {
  // TR = UTC+3
  const h = (date.getUTCHours() + 3) % 24;
  if (h >= 5 && h < 12) return "Sabah";
  if (h >= 12 && h < 18) return "İkindi";
  return "Akşam";
}

export function trDateStamp(date = new Date()) {
  // TR saatine gore DD.MM.YYYY
  const tr = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  const dd = String(tr.getUTCDate()).padStart(2, "0");
  const mm = String(tr.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${tr.getUTCFullYear()}`;
}

export async function tgSend(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!j.ok) throw new Error(`${method}: ${JSON.stringify(j)}`);
  return j.result;
}

export async function sendPhotoWithFallback(photoUrl, caption) {
  try {
    const r = await tgSend("sendPhoto", {
      chat_id: CHAT,
      photo: photoUrl,
      caption,
      parse_mode: "MarkdownV2",
    });
    return r.message_id;
  } catch (e) {
    const r = await tgSend("sendMessage", {
      chat_id: CHAT,
      text: caption + `\n\n🖼 ${photoUrl}`,
      parse_mode: "MarkdownV2",
      disable_web_page_preview: false,
    });
    return r.message_id;
  }
}

export async function sendMessage(text, { disablePreview = false } = {}) {
  const r = await tgSend("sendMessage", {
    chat_id: CHAT,
    text,
    parse_mode: "MarkdownV2",
    disable_web_page_preview: disablePreview,
  });
  return r.message_id;
}

export async function markPosted(productId, channel, messageId) {
  const res = await fetch(`${SUPA_URL}/rest/v1/social_posts`, {
    method: "POST",
    headers: {
      apikey: SUPA_SERVICE,
      Authorization: `Bearer ${SUPA_SERVICE}`,
      "content-type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify({
      product_id: String(productId),
      channel,
      message_id: messageId ? String(messageId) : null,
    }),
  });
  if (!res.ok && res.status !== 409) {
    const t = await res.text();
    console.warn(`social_posts yazim uyarisi (${res.status}): ${t}`);
  }
}

export async function fetchPostedIds(channel) {
  try {
    const d = db();
    const rows = await d.queryAll("social_posts", `select=product_id&channel=eq.${encodeURIComponent(channel)}`);
    return new Set(rows.map((r) => String(r.product_id)));
  } catch (e) {
    console.warn(`social_posts okunamadi (${channel}): ${e.message}`);
    return new Set();
  }
}
