# Manuel Urun Giris Rehberi

Bu rehber, tam otomasyonda bloklanan marketler icin hizli veri girisi yapmak icindir.

## Kullanilacak dosyalar

- `data/imports/manual/manual-feed.json`
- `data/imports/manual/a101.template.json`
- `data/imports/manual/carrefoursa.template.json`

## Mantik

1. Ornek dosyayi acin.
2. Urun adi, fiyat, onceki fiyat, kategori, gorsel linki ve kaynak linkini doldurun.
3. Doldurdugunuz kaydi `manual-feed.json` icine ekleyin.
4. Sonra sirasiyla:

```bash
npm run import
npm run build
npm run deploy:ftp
```

## Alanlar

- `marketSlug`: `a101` veya `carrefoursa`
- `title`: urun adi
- `category`: kategori adi
- `image`: urun gorsel linki
- `price`: guncel fiyat
- `previousPrice`: indirim oncesi fiyat
- `startDate`: baslangic tarihi
- `endDate`: bitis tarihi
- `sourceType`: `manual`
- `sourceUrl`: marketteki katalog veya urun linki

## Ornek

```json
{
  "marketSlug": "a101",
  "title": "Yudum Aycicek Yagi 5 L",
  "category": "Temel Gida",
  "image": "https://site.com/yudum.jpg",
  "price": 329.95,
  "previousPrice": 379.95,
  "startDate": "2026-04-05",
  "endDate": "2026-04-12",
  "sourceType": "manual",
  "sourceUrl": "https://www.a101.com.tr/aldin-aldin"
}
```
