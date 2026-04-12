# GitHub Kurulum Rehberi

Bu proje su an `origin` olarak asagidaki repoya baglandi:

- `https://github.com/eserlg/finderfit.git`

## 1. GitHub Secrets

Repo icinde `Settings -> Secrets and variables -> Actions` alanina gir.

Eklenmesi gereken secret'lar:

- `SITE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PRODUCTS_TABLE`
- `SUPABASE_BRANDS_TABLE`
- `SUPABASE_COMPARISON_TABLE`

Deploy de yapilacaksa bunlari da ekle:

- `FTP_HOST`
- `FTP_USER`
- `FTP_PASSWORD`
- `FTP_REMOTE_DIR`

## 2. Secret degerleri

Tablo isimleri icin onerilen degerler:

- `SUPABASE_PRODUCTS_TABLE=products`
- `SUPABASE_BRANDS_TABLE=brands`
- `SUPABASE_COMPARISON_TABLE=comparison_groups`

`SUPABASE_URL`, `SUPABASE_ANON_KEY` ve `SUPABASE_SERVICE_ROLE_KEY` icin projedeki mevcut Supabase bilgileri kullanilacak.

## 3. Workflow calistirma

Workflow dosyasi:

- [.github/workflows/catalog-pipeline.yml](C:\Users\eseru\OneDrive\Belgeler\New%20project\.github\workflows\catalog-pipeline.yml:1)

Ilk test icin:

1. GitHub repo sayfasina gir
2. `Actions` sekmesini ac
3. `Catalog Pipeline` workflow'unu sec
4. `Run workflow` tikla
5. `deploy_site=false` ile ilk testi yap

Bu testte sistem:

1. Kaynak sitelerden veriyi ceker
2. Normalize eder
3. Siteyi build eder
4. Supabase'e yollar

## 4. Deploy testi

FTP secret'lari girildikten sonra ikinci testte:

- `deploy_site=true`

secilirse `dist/` klasoru da yayina gonderilir.

## 5. Sonraki adim

Manuel workflow testi basarili olduktan sonra ayni workflow'a:

- gunluk
- saatlik

zamanlanmis `schedule` eklenir.
