# Giyim Karsilastirma

Bu proje, Turkiye'de faaliyet gosteren giyim markalarinin benzer urunlerini tek ekranda karsilastirmak icin hazirlanan statik site + veri hattidir. Hedef; fiyat, indirim, kampanya, urun icerigi ve kumas dagilimini tek yerde gostermek, sonra bu veriyi Supabase uzerinden canli hale getirmektir.

## Bu ilk surumde neler var

- DeFacto, LC Waikiki, Koton, Mavi ve Colin's icin marka iskeleti
- Giyim urunlerine uygun normalize veri modeli
- `comparisonKey` mantigi ile benzer urunleri ayni grupta toplama
- Materyal dagilimi (`%100 pamuk`, `%50 pamuk / %50 polyester`) gosterimi
- Kampanya etiketi, urun kodu, kalip, yaka, kol tipi ve cinsiyet alanlari
- Statik on yuzde karsilastirma bloklari ve marka detay sayfalari
- Supabase'e veri basmak icin hazir REST senkron script'i

## Komutlar

```bash
npm run sync
npm run import
npm run build
npm run supabase:sync
npm run pipeline
```

Yerelde onizleme:

```bash
npm run dev
```

## Veri akisi

1. `data/imports/manual/manual-feed.json` veya ileride otomatik adaptorler ham urunleri uretir.
2. `npm run import` bu kayitlari ortak formata donusturur ve `data/campaigns.json` icine yazar.
3. `npm run build` yeni statik siteyi `dist/` altinda uretir.
4. `npm run supabase:sync` normalize edilen veriyi Supabase tablolarina gonderir.

Tam otomatik zincir:

1. `npm run sync`
2. `npm run import`
3. `npm run build`
4. `npm run supabase:sync`

Kisa yol:

```bash
npm run pipeline
```

## Canli otomasyon stratejisi

Bu repo su anda giyim odakli cekirdek sistemi ve veri modelini hazirlar. Marka bazli canli adaptorler, her sitenin urun listeleme ve detay sayfasi yapisina gore tek tek kalibre edilmelidir. Bu nedenle:

- `config/markets.config.json` icinde markalar tanimlidir
- Ilk asamada hepsi `enabled: false` birakilmistir
- Gercek adaptor yazildikca `npm run sync` ile otomatik veri cekilebilir

## Supabase notu

`.env` icinde su alanlari doldur:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PRODUCTS_TABLE`
- `SUPABASE_BRANDS_TABLE`
- `SUPABASE_COMPARISON_TABLE`

## Sonraki profesyonel adimlar

1. Her marka icin ayri adaptor yazmak
2. Urun sayfasindan materyal ve kampanya alanlarini otomatik almak
3. Benzer urun eslestirmesini kuralla + AI destekli hale getirmek
4. Supabase tarafinda history tablosu ile fiyat degisimlerini saklamak
5. Zamanlanmis gorevle periyodik sync + build + deploy kurmak

## Otomasyon

GitHub Actions tabanli otomasyon iskeleti hazirlandi:

- workflow dosyasi: [.github/workflows/catalog-pipeline.yml](C:\Users\eseru\OneDrive\Belgeler\New%20project\.github\workflows\catalog-pipeline.yml:1)
- mimari dokumani: [docs/AUTOMATION_ARCHITECTURE.md](C:\Users\eseru\OneDrive\Belgeler\New%20project\docs\AUTOMATION_ARCHITECTURE.md:1)

Bu workflow su an manuel tetikleme icin hazir. Saatlik veya gunluk scheduler bir sonraki adimda aktif edilebilir.
