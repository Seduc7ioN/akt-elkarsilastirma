# Abonelik Detoksu

App Store ve Google Play'e hazirlanabilecek Expo tabanli mobil MVP.

## Ilk surum

- Abonelikleri tek ekranda listeler.
- Bu ay odenecek toplam tutari hesaplar.
- Kullanim isaretine gore iptal adaylarini ve olasi tasarrufu gosterir.
- Banka SMS'i veya e-posta metni yapistirilinca servis, tutar, kart ve odeme gunu icin taslak cikarir.
- Iptal kontrolu icin yerel bildirim hatirlatmasi kurar.
- Veriyi cihazda AsyncStorage ile saklar.

## Neden SMS'i otomatik okumuyor?

Google Play, SMS ve arama kaydi izinlerini hassas izinler olarak kisitlar. Bir abonelik takip uygulamasinin `READ_SMS` istemesi yuksek ret riski tasir; genelde varsayilan SMS uygulamasi, telefon uygulamasi veya cok sinirli istisnalar beklenir.

iOS tarafinda uygulamalar kullanicinin tum SMS veya Mail kutusunu serbestce tarayamaz. Bu nedenle ilk surumda en guvenli yol manuel giris, kullanicinin paylastigi/yapistirdigi metni cihazda ayrıştırma ve daha sonra kullanici izniyle e-posta baglantilari gibi kontrollu entegrasyonlardir.

## Komutlar

```bash
npm run start
npm run android
npm run ios
npm run web
```

Windows PowerShell'de `npm.ps1` engeline takilirsan:

```bash
npm.cmd run start
```

## Magaza build komutlari

Expo Application Services kurulup proje Expo hesabina baglandiktan sonra:

```bash
npx eas build --profile preview --platform android
npx eas build --profile production --platform android
npx eas build --profile production --platform ios
```

## Magaza yol haritasi

1. MVP'yi Expo/EAS ile Android ve iOS build alacak hale getir.
2. Gizlilik politikasi sayfasini yayinla.
3. App Store Connect gizlilik etiketlerini ve Google Play Data Safety formunu doldur.
4. Bildirim izni metinlerini netlestir.
5. SMS okuma izni istemeden ilk beta yayinini yap.
6. Gmail/Outlook gibi e-posta entegrasyonlari icin OAuth ve minimum kapsamli izinleri ayri bir sonraki fazda ele al.
