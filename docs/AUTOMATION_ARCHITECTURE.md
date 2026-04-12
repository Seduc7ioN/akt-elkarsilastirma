# Otomatik Calisma Mimarisi

Bu proje manuel veri girisi istemeyen bir akis icin tasarlandi.

## Hedef akis

1. Marka sitelerinden veri cekilir.
2. Ham veriler normalize edilir.
3. `Supabase` tablolari guncellenir.
4. Statik site yeniden uretilir.
5. Gerekirse `dist/` yayina gonderilir.

Kisa gosterim:

`Marka siteleri -> sync -> import -> build -> Supabase -> deploy`

## Calisan komutlar

Tek komutla veri boru hattini calistirmak icin:

```bash
npm run pipeline
```

Yayin dahil tum akisi calistirmak icin:

```bash
npm run pipeline:publish
```

## GitHub Actions rolu

Repo icine eklenen workflow su isi yapar:

1. Gerekli secret'lardan `.env` dosyasi olusturur
2. `npm run pipeline` komutunu calistirir
3. Istenirse `npm run deploy:ftp` ile `dist/` klasorunu yayina yollar

Su an workflow yalnizca elle calistirilacak sekilde hazirlandi.
Gunluk veya saatlik otomasyon daha sonra `schedule` eklenerek aktif edilecek.

## Gerekli GitHub Secrets

Asagidaki secret'lari repo icine girmelisin:

- `SITE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PRODUCTS_TABLE`
- `SUPABASE_BRANDS_TABLE`
- `SUPABASE_COMPARISON_TABLE`

Deploy de istenecekse bunlari da ekle:

- `FTP_HOST`
- `FTP_USER`
- `FTP_PASSWORD`
- `FTP_REMOTE_DIR`

## Canli davranis

Bu mimaride sen manuel JSON yuklemeyeceksin.

- Yeni urun cikarsa scraper onu bir sonraki calistirmada alir
- Fiyat degisirse normalize katmani kaydi gunceller
- Supabase son veriyi tutar
- Build sonrasi site de yeni veriye gore yeniden uretilir

## Bilinen sinirlar

- `Mavi`, `H&M`, `LTB` gibi markalarda anti-bot engeli oldugu icin ek cozum gerekir
- `Bershka` ve benzeri challenge kullanan markalarda browser tabanli scraping gerekebilir
- Statik site mimarisinde sadece Supabase guncellemek yetmez, build ve deploy da gerekir
