# Aktüel Karşılaştırma

Natro'da yayımlanan [aktüelkarşılaştırma.com](https://xn--aktelkarsilastirma-o6b.com/) için statik site üretici. BİM, A101, ŞOK, Migros, Hakmar ve diğer marketlerin haftalık aktüel ürünlerini Supabase'ten okuyup statik HTML üretir ve FTP ile Natro'ya yükler.

## Mimari

```
Scraper (Natro cPanel, ayrı)  →  Supabase  →  build.mjs  →  dist/  →  FTP (Natro)
```

- **Scraper bu repoda değil.** Her market için veri Natro cPanel üzerindeki ayrı bir scraper tarafından Supabase'e yazılır.
- **Bu repo sadece frontend.** Supabase'ten okur, statik HTML üretir, FTP ile deploy eder.

## Supabase şeması (mevcut, değiştirilmez)

- `markets` — id (text PK), name, branch_count, website
- `weekly_catalogs` — id (uuid), market_id, week_start, week_end, period_text, scraped_at
- `products` — id (uuid), catalog_id, market_id, name, category, price, old_price, discount_pct, image, url, badge, scraped_at
- `comments` — id, market_id, username, text, created_at

## Komutlar

```bash
npm run build       # Supabase'ten cek, dist/ uret
npm run dev         # dist/ klasorunu yerel http://localhost:4173'te yayinla
npm run deploy:ftp  # dist/ klasorunu FTP ile Natro'ya yukle
npm run publish     # build + deploy (tek komutta)
```

## Kurulum

1. `.env.example`'ı `.env` olarak kopyala ve doldur:
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY` — Supabase dashboard'dan
   - `FTP_HOST`, `FTP_USER`, `FTP_PASSWORD`, `FTP_REMOTE_DIR` — Natro cPanel
   - `SITE_URL` — siteURL (opsiyonel, default: aktüelkarşılaştırma.com)
2. `npm run build` ile derle, `dist/` klasöründe site oluşur.
3. `npm run deploy:ftp` ile Natro'ya gönder.

## Otomasyon

`.github/workflows/catalog-pipeline.yml` her 3 saatte bir build alıp FTP ile deploy eder. GitHub Secrets olarak aynı env değerlerini eklemen gerekiyor.

## Üretilen sayfalar

- `/` — anasayfa (market grid, bu haftanın katalogları, en yüksek indirimler, son ürünler)
- `/urunler/` — tüm ürün arama + market/kategori filtresi
- `/market/<id>/` — marketin son kataloğu + ürünleri
- `/market/<id>/<catalog_id>/` — belirli haftalık katalog ve ürünleri
- `/sitemap.xml`, `/robots.txt`
