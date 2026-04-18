# Scraper — Broşür hotspot (bbox) spesifikasyonu

Frontend, broşür sayfa görsellerinin üzerine tıklanabilir hotspot'lar basabiliyor (haftalikaktuel.com mantığı). Bu özelliğin çalışması için scraper'ın aşağıdaki alanları doldurması gerekir. Eksik olanlarda frontend sessizce degrade eder — kırılmaz, sadece hotspot gözükmez.

## 1) `weekly_catalogs` tablosu

```sql
alter table weekly_catalogs
  add column if not exists cover_image text,
  add column if not exists pages jsonb default '[]'::jsonb;
```

- `cover_image` (text, nullable): Kapak görseli URL'si. Tek bir resim.
- `pages` (jsonb): **Sıralı** broşür sayfa görseli URL dizisi.
  - Örnek: `["https://cdn.../bim/2026-04-18/p1.jpg", ".../p2.jpg", ".../p3.jpg", ...]`
  - İlk eleman 1. sayfadır. İndeks 0'dan başlar.
  - Sayfalar **aynı genişlik/yükseklik oranında** olmalı (yoksa normalize koordinatlar bozulur). JPG veya WebP, ~1400px genişlik ideal.

## 2) `products` tablosu — `bbox` kolonu

```sql
alter table products
  add column if not exists bbox jsonb;
```

`bbox` formatı (tek ürün için):

```json
{
  "page": 0,
  "x": 0.12,
  "y": 0.34,
  "w": 0.18,
  "h": 0.22
}
```

Alanlar:
- `page` (int): `weekly_catalogs.pages` dizisindeki sayfa indeksi (0-based).
- `x`, `y` (float 0.0–1.0): Hotspot'un **sol üst** köşesinin **normalize** koordinatı. Sayfa genişliğine/yüksekliğine oranlanmış.
  - Örnek: sayfa 1200×1600 px, ürün 144 px soldan, 544 px yukarıdan → `x=0.12`, `y=0.34`.
- `w`, `h` (float 0.0–1.0): Hotspot'un normalize **genişliği** ve **yüksekliği**.
  - Örnek: ürün kutusu 216×352 px → `w=0.18`, `h=0.22`.

**Neden normalize?** Frontend her ekran boyutunda sayfa görselini yeniden ölçeklediğinde, hotspot'ların da aynı oranda kalması için. Piksel vermek sabit boyut varsayar; normalize değer her çözünürlükte doğru yere düşer.

**Birden fazla konum (aynı ürün farklı sayfalarda)**: şu an tek bir bbox destekleniyor. İlk/en belirgin görünümü kaydedin. Gerekirse daha sonra `bbox` → jsonb array'e genişletilebilir.

## 3) Nasıl elde edilir?

Scraper'ın veri kaynağına göre iki yol var:

**a) Market sitesi API veriyi zaten koordinatla veriyorsa** (ör. Flipp, EveryDeal, haftalikaktuel'in backend'i): doğrudan oradan mapping yap. En temiz yol.

**b) PDF/görsel scraping ise:** Bir vision modeli (Claude Vision, GPT-4o, Gemini) ile her sayfayı analiz ettir; ürün listesiyle eşleştir. Örnek prompt (Claude Vision):
> "Bu broşür sayfasında görünen ürünleri tespit et. Her biri için {name, x, y, w, h} döndür (normalize 0-1)."
> Çıktıyı üretilen `products` kayıtlarıyla isim benzerliği (Levenshtein veya embedding) ile eşle.

## 4) Validasyon

Frontend şunları kontrol eder (hatalı bbox yoksayılır):
- `page` integer, `0 <= page < pages.length`
- `x, y, w, h` sayı ve `0 <= val <= 1`
- `x + w <= 1` ve `y + h <= 1`

Geçersiz bbox'lı ürünler broşür üzerinde hotspot göstermez ama ürün grid'inde görünmeye devam eder.

## 5) Minimum viable

Tüm ürünlere bbox şart değil. Scraper **en tık alacak / en büyük indirimli** 10-20 ürüne bbox yazsa yeterli — broşürün "canlı hissi" için bu kadarı algıyı değiştirir.
