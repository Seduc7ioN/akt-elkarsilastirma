# Abonelik Detoksu Urun Plani

## Kisa cevap

Evet, App Store ve Google Play icin yapilabilir. Ilk yayin icin en guvenli kurgu, kullanicinin aboneliklerini manuel ekledigi veya banka SMS/e-posta metnini kendi istegiyle yapistirdigi gizlilik odakli bir takip uygulamasidir.

## Kritik platform notlari

- Google Play, SMS ve arama kaydi izinlerini hassas izin olarak kisitlar. `READ_SMS` gibi izinler abonelik takip uygulamasi icin yuksek ret riski tasir.
- iOS, ucuncu parti uygulamalara tum SMS veya Mail kutusunu arka planda tarama yetkisi vermez.
- App Store tarafinda gizlilik politikasi, veri toplama aciklamasi ve gereksiz izin istememe prensibi kritik.
- Bu nedenle MVP, SMS okuma izni istemez; metin ayristrma kullanicinin yapistirdigi icerik uzerinde cihaz icinde calisir.

Kaynaklar:

- Google Play SMS/Call Log policy: https://support.google.com/googleplay/android-developer/answer/10208820
- Apple App Review Guidelines, privacy: https://developer.apple.com/app-store/review/guidelines/
- Apple App Privacy Details: https://developer.apple.com/app-store/app-privacy-details/
- Expo permissions guide: https://docs.expo.dev/guides/permissions/

## MVP kapsami

- Aylik toplam abonelik gideri
- Yillik gider projeksiyonu
- Kart son 4 hanesine gore toplam
- Yaklasan odemeler paneli
- Kategori kirilimi
- Abonelik arama ve filtreleme
- Abonelik duzenleme
- Abonelik listesi
- Kullanim var/yok isareti
- Iptal adayi toplam tasarruf
- Iptal adaylari icin aksiyon paneli
- SMS/e-posta metni yapistirarak servis, tutar, kart ve gun yakalama
- Yerel bildirimle iptal kontrol hatirlatmasi
- Cihaz ici veri saklama

## Faz 2

- Odeme takvimi
- CSV/PDF disa aktarim
- iCloud/Google Drive yedekleme
- Coklu para birimi
- Deneme/free trial takibi
- Servis katalogu ve iptal rehberleri
- Gmail/Outlook OAuth entegrasyonu, sadece kullanicinin sectigi e-postalar veya minimum kapsamli arama izinleri ile
- Banka entegrasyonu varsa yalnizca resmi/open banking API uzerinden

## Para kazanma

- Ucretsiz: manuel takip, 5 abonelik, temel toplam
- Premium: sinirsiz abonelik, hatirlatmalar, raporlar, yedekleme, gelismis metin ayristrma
- Kurumsal degil, bireysel finans yardimcisi olarak konumlandirma

## Magaza hazirlik kontrolu

- Uygulama ismi ve ikonlari
- Gizlilik politikasi URL'i
- App Store gizlilik etiketleri
- Google Play Data Safety formu
- Bildirim izni gerekcesi
- Hesap acma varsa uygulama icinden hesap silme
- TestFlight ve Google Play Internal Testing
