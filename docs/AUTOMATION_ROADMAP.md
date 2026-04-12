# Otomasyon Yol Haritasi

## Faz 1

- A101
- BIM
- Sok

Bu marketler icin sayfa HTML yapisindan katalog veya kampanya gorselleri cekilir.

## Faz 2

- Migros
- Carrefoursa

Bu grup genelde API veya dinamik veri kullandigi icin daha fazla inceleme ister.

## Faz 3

- Hakmar
- File
- Metro

Bu marketlerde veri kaynagi duzensiz olabilir. Gerekirse yari otomatik panel kullanilir.

## Uretim tavsiyesi

En saglikli yapi:

1. Harici cron veya GitHub Actions
2. `npm run sync`
3. `npm run import`
4. `npm run build`
5. FTP deploy

## Not

Market sitelerinin kullanim kosullari ve robots kurallari kontrol edilmelidir.
