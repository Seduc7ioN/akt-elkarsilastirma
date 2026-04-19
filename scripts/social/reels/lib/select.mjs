// Reel sablonlari icin veri secicileri. Supabase'den uygun urunleri cekip template'e uygun hale getirir.
import { supabaseClient } from "../../../lib/supabase.mjs";

const MARKET_LABELS = {
  bim:"BİM", a101:"A101", sok:"ŞOK", migros:"Migros", carrefoursa:"CarrefourSA",
  metro:"Metro", hakmar:"Hakmar", file:"File", bizimtoptan:"Bizim Toptan", tarimkredi:"Tarım Kredi",
};
const MARKET_COLORS = {
  bim:"#ef4444", a101:"#3b82f6", sok:"#f97316", migros:"#f97316",
  carrefoursa:"#3b82f6", metro:"#fbbf24", hakmar:"#10b981",
  file:"#a855f7", bizimtoptan:"#3b82f6", tarimkredi:"#10b981",
};
const MARKET_SHORT = {
  bim:"BİM", a101:"A101", sok:"ŞOK", migros:"MGR",
  carrefoursa:"CRF", metro:"MET", hakmar:"HMR", file:"FILE", bizimtoptan:"BT", tarimkredi:"TK",
};

export function marketName(id) { return MARKET_LABELS[id] || (id||"").toUpperCase(); }
export function marketColor(id) { return MARKET_COLORS[id] || "#ef4444"; }
export function marketShort(id) { return MARKET_SHORT[id] || (id||"").toUpperCase().slice(0,3); }

function trPrice(n) {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n));
}
function trShort(n) {
  const v = Number(n);
  if (!isFinite(v)) return "-";
  return Number.isInteger(v) ? String(v) : trPrice(v);
}
function dateRangeShort(c) {
  if (!c?.week_start || !c?.week_end) return "";
  const fmt = (d) => new Date(d).toLocaleDateString("tr-TR", { day:"numeric", month:"long" });
  return `${fmt(c.week_start)} - ${fmt(c.week_end)}`;
}

function normalizeName(s) {
  return String(s || "").toLocaleLowerCase("tr-TR")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

// Ayni/benzer urunu marketler arasi eslestirmek icin anahtar
function matchKey(s) {
  const n = normalizeName(s);
  // ilk 3-4 anlamli kelime
  const words = n.split(" ").filter((w) => w.length >= 3).slice(0, 4);
  return words.sort().join(" ");
}

export async function loadAll() {
  const db = supabaseClient({ url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY });
  const [catalogs, products] = await Promise.all([
    db.queryAll("weekly_catalogs", "select=id,market_id,week_start,week_end,period_text"),
    db.queryAll("products", "select=*&order=scraped_at.desc"),
  ]);
  const catalogById = new Map(catalogs.map((c) => [c.id, c]));
  return { catalogs, catalogById, products };
}

// --- Sablon veri uretimi ---

export function selectHaftaninFirsatlari({ products, catalogById }, { marketId = null } = {}) {
  // Secilmis/en aktif market yoksa en cok indirimli urunu olan markete gore sec
  const mid = marketId || pickTopMarketByDiscounts(products);
  const items = products
    .filter((p) => p.market_id === mid)
    .filter((p) => p.name && p.price != null)
    .sort((a, b) => (Number(b.discount_pct)||0) - (Number(a.discount_pct)||0))
    .slice(0, 5)
    .map((p) => ({
      pct: p.discount_pct || 0,
      name: p.name.length > 40 ? p.name.slice(0, 38) + "…" : p.name,
      newPrice: trShort(p.price) + " ₺",
      oldPrice: p.old_price ? trShort(p.old_price) + " ₺" : "",
    }));
  if (items.length < 3) return null;
  const cat = products.find((p) => p.market_id === mid)?.catalog_id;
  const catalog = cat ? catalogById.get(cat) : null;
  return {
    template: "haftanin-firsatlari",
    data: {
      handle: "@" + (process.env.IG_HANDLE || "aktuelkarsilastirma"),
      marketShort: marketShort(mid),
      marketColor: marketColor(mid),
      dateRange: dateRangeShort(catalog),
      items,
      hashtags: `#aktüelfırsatlar #${mid} #haftanınfırsatları #indirim`,
    },
    caption: `${marketName(mid)} — Haftanın 5 fırsatı 🔥\n\n${items.map((it,i)=>`${i+1}. ${it.name} → ${it.newPrice}`).join("\n")}\n\nDetay: https://xn--aktelkarsilastirma-o6b.com/${mid}-aktuel/\n\n#aktüelfırsatlar #${mid} #indirim #haftanınfırsatları`,
  };
}

function pickTopMarketByDiscounts(products) {
  const byM = new Map();
  for (const p of products) {
    const d = Number(p.discount_pct) || 0;
    if (!d) continue;
    byM.set(p.market_id, (byM.get(p.market_id) || 0) + d);
  }
  let top = "bim", best = 0;
  for (const [m, v] of byM) if (v > best) { best = v; top = m; }
  return top;
}

export function selectFiyatSavasi({ products }) {
  // Ayni urunu 2 farkli markette eslestir, fark en buyuk olani sec
  const groups = new Map();
  for (const p of products) {
    if (!p.name || p.price == null) continue;
    const k = matchKey(p.name);
    if (!k || k.split(" ").length < 2) continue;
    const arr = groups.get(k) || [];
    arr.push(p);
    groups.set(k, arr);
  }
  let best = null;
  for (const arr of groups.values()) {
    // Ayni market tekrari olmasin
    const byMarket = new Map();
    for (const p of arr) if (!byMarket.has(p.market_id)) byMarket.set(p.market_id, p);
    const list = [...byMarket.values()];
    if (list.length < 2) continue;
    list.sort((a, b) => Number(a.price) - Number(b.price));
    const cheap = list[0], exp = list[list.length - 1];
    const diff = Number(exp.price) - Number(cheap.price);
    const pct = Number(cheap.price) > 0 ? Math.round((diff / Number(exp.price)) * 100) : 0;
    if (pct < 10) continue;
    if (!best || pct > best.pct) best = { cheap, exp, diff, pct };
  }
  if (!best) return null;
  const { cheap, exp, diff, pct } = best;
  return {
    template: "fiyat-savasi",
    data: {
      handle: "@" + (process.env.IG_HANDLE || "aktuelkarsilastirma"),
      dateRange: "",
      productName: cheap.name.length > 40 ? cheap.name.slice(0, 38) + "…" : cheap.name,
      leftMarket: marketName(cheap.market_id),
      leftColor: marketColor(cheap.market_id),
      leftPrice: trShort(cheap.price),
      rightMarket: marketName(exp.market_id),
      rightPrice: trShort(exp.price),
      diffPct: pct,
      diffAmount: trShort(diff),
      hashtags: `#fiyatsavaşı #${cheap.market_id} #${exp.market_id} #marketkarşılaştırma`,
    },
    caption: `⚔ Fiyat savaşı: ${cheap.name}\n\n✓ ${marketName(cheap.market_id)}: ${trShort(cheap.price)} ₺\n✗ ${marketName(exp.market_id)}: ${trShort(exp.price)} ₺\n\n${marketName(cheap.market_id)} %${pct} daha ucuz (${trShort(diff)} ₺)\n\nhttps://xn--aktelkarsilastirma-o6b.com/\n\n#fiyatsavaşı #indirim #aktüelkarşılaştırma`,
  };
}

export function selectFiyatDustu({ products, catalogById }) {
  // En buyuk TL tasarrufu olan tek urun
  const cands = products
    .filter((p) => p.old_price && Number(p.old_price) > Number(p.price || 0) && p.name && p.price != null)
    .map((p) => ({ p, save: Number(p.old_price) - Number(p.price) }))
    .sort((a, b) => b.save - a.save);
  if (!cands.length) return null;
  const { p, save } = cands[0];
  const pct = Number(p.discount_pct) || Math.round((save / Number(p.old_price)) * 100);
  const catalog = p.catalog_id ? catalogById.get(p.catalog_id) : null;
  return {
    template: "fiyat-dustu",
    data: {
      handle: "@" + (process.env.IG_HANDLE || "aktuelkarsilastirma"),
      productName: p.name.length > 42 ? p.name.slice(0, 40) + "…" : p.name,
      marketName: marketName(p.market_id),
      period: catalog ? dateRangeShort(catalog) : "Bu hafta",
      oldPrice: trShort(p.old_price),
      newPrice: trShort(p.price),
      pct,
      savingAmount: trShort(save),
      hashtags: `#fiyatdüştü #${p.market_id} #indirim #aktüelfırsatlar`,
    },
    caption: `📉 Fiyat düştü!\n\n${p.name}\n${marketName(p.market_id)}\n\n~~${trShort(p.old_price)} ₺~~ → ${trShort(p.price)} ₺\n%${pct} indirim · ${trShort(save)} ₺ tasarruf\n\nDetay: https://xn--aktelkarsilastirma-o6b.com/${p.market_id}-aktuel/\n\n#fiyatdüştü #${p.market_id} #indirim`,
  };
}

export function selectUcMarket({ products }) {
  // 3 veya daha fazla markette bulunan bir populer urun sec, top 3 market goster
  const groups = new Map();
  for (const p of products) {
    if (!p.name || p.price == null) continue;
    const k = matchKey(p.name);
    if (!k || k.split(" ").length < 2) continue;
    const arr = groups.get(k) || [];
    arr.push(p);
    groups.set(k, arr);
  }
  let pick = null;
  for (const arr of groups.values()) {
    const byMarket = new Map();
    for (const p of arr) if (!byMarket.has(p.market_id)) byMarket.set(p.market_id, p);
    if (byMarket.size < 3) continue;
    const list = [...byMarket.values()].sort((a, b) => Number(a.price) - Number(b.price)).slice(0, 3);
    const spread = Number(list[list.length-1].price) - Number(list[0].price);
    if (!pick || spread > pick.spread) pick = { list, spread };
  }
  if (!pick) return null;
  const { list, spread } = pick;
  const winnerIdx = 0; // en ucuz
  return {
    template: "uc-market",
    data: {
      handle: "@" + (process.env.IG_HANDLE || "aktuelkarsilastirma"),
      dateRange: "",
      productName: list[0].name.length > 40 ? list[0].name.slice(0, 38) + "…" : list[0].name,
      markets: list.map((p, i) => ({
        name: marketName(p.market_id),
        color: marketColor(p.market_id),
        price: trShort(p.price),
        winnerClass: i === winnerIdx ? "winner" : "",
      })),
      winnerMarket: marketName(list[winnerIdx].market_id),
      saving: trShort(spread),
      hashtags: `#3marketanalizi #marketkarşılaştırma #fiyatanalizi #tasarruf`,
    },
    caption: `🛒 3 Market Analizi: ${list[0].name}\n\n${list.map((p)=>`${marketName(p.market_id)}: ${trShort(p.price)} ₺`).join("\n")}\n\n✓ En ucuz: ${marketName(list[0].market_id)} (en pahalıya göre ${trShort(spread)} ₺ tasarruf)\n\nhttps://xn--aktelkarsilastirma-o6b.com/\n\n#marketkarşılaştırma #fiyatanalizi`,
  };
}

export const SELECTORS = {
  "haftanin-firsatlari": selectHaftaninFirsatlari,
  "fiyat-savasi": selectFiyatSavasi,
  "fiyat-dustu": selectFiyatDustu,
  "uc-market": selectUcMarket,
};
