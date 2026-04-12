# Sosyal Medya Otomasyonu

Bu proje sitedeki kampanya verilerinden X, Instagram ve Telegram icin otomatik icerik taslaklari uretebilir.

## Komutlar

- `npm run social:generate`
  Sosyal icerik kuyrugunu ve onizleme dosyalarini uretir.

- `npm run social:publish`
  Su an canli gonderim Telegram icin hazirdir.
  X ve Instagram tarafinda taslak ve gorsel uretimi yapilir.

- `npm run telegram:doctor`
  Telegram bot token'inin gecerli olup olmadigini kontrol eder.

- `npm run telegram:updates`
  Botunuza gelen son guncellemeleri listeler.
  Chat id bulmak icin kullanilir.

- `npm run telegram:test`
  `data/social/queue.json` icindeki Telegram mesajini test olarak yollar.

## Uretilen dosyalar

- `data/social/queue.json`
  Kanal bazli paylasim kuyrugu.

- `dist/social/index.html`
  Sosyal medya onizleme merkezi.

- `dist/social/instagram-card-1.svg`
- `dist/social/instagram-card-2.svg`
- `dist/social/instagram-card-3.svg`
  Instagram icin otomatik olusturulan gorsel kartlar.

## Telegram kurulum adimlari

1. Telegram'da `@BotFather` acin.
2. `/newbot` yazin.
3. Bot adini ve bot kullanici adini olusturun.
4. Size verilen token'i alin.
5. `.env` dosyasina `TELEGRAM_BOT_TOKEN` olarak ekleyin.
6. Botunuza Telegram'dan `/start` gonderin.
7. `npm run telegram:updates` komutunu calistirin.
8. Cikan `chat_id` degerini `.env` icine `TELEGRAM_CHAT_ID` olarak yazin.
9. `npm run telegram:test` ile test mesaji gonderin.
10. Her sey tamamsa `npm run social:publish` ile otomatik paylasim yapin.

## Env alanlari

`.env` icine su alanlari ekleyin:

```env
SOCIAL_CHANNELS=telegram,x,instagram
TELEGRAM_BOT_TOKEN=change-me
TELEGRAM_CHAT_ID=@kanaliniz-veya-chat-id
```

## Calisma mantigi

1. `data/campaigns.json` icindeki fiyatli kampanyalar siralanir.
2. En guclu urunler secilir.
3. X icin kisa post metni hazirlanir.
4. Telegram icin kanal mesaji hazirlanir.
5. Instagram icin gorsel kartlar ve caption uretilir.

## Sonraki adim

En hizli canli otomasyon yolu:

1. Telegram kanalini hemen canliya almak
2. Instagram Business hesabi ile yayin akisina gecmek
3. X icin kullanici yetkili yayin akisina baglanmak
