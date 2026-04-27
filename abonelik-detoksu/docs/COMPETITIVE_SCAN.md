# Rekabet Taramasi

Tarih: 2026-04-27

## Bakilan urunler

### Rocket Money

- Guclu taraf: bagli banka/kart hesaplarindan abonelikleri yakalama, yaklasan faturalar, iptal hizmeti.
- Bizim icin ders: kullanici ilk ekranda siradaki odemeleri ve atil abonelikleri hemen gormeli.
- Kaynak: https://www.rocketmoney.com/feature/manage-subscriptions
- Kaynak: https://help.rocketmoney.com/en/articles/2185531-managing-your-bills-and-subscriptions

### Bobby

- Guclu taraf: basit manuel takip, bildirimler, para birimi destegi, siralama.
- Bizim icin ders: manuel takip guclu bir MVP olabilir ama duzenleme ve filtre olmadan eksik kalir.
- Kaynak: https://apps.apple.com/us/app/bobby-track-subscriptions/id1059152023

### Tilla

- Guclu taraf: yaklasan odemeler, hatirlatmalar, analytics, cloud sync ve lokal backup.
- Bizim icin ders: ilk surumde analytics hissi ve daha sonra backup/sync planlanmali.
- Kaynak: https://play.google.com/store/apps/details?id=com.pavelrekun.tilla

### Subby / ReSubs

- Guclu taraf: Gmail ile otomatik bulma, iptal rehberleri, kategori analitigi, coklu para birimi, servis katalogu.
- Bizim icin ders: e-posta entegrasyonu ancak kullanici izni ve minimum kapsamla Faz 2 olmali; ilk surumde iptal rehberi ve kategori kirilimi eklenebilir.
- Kaynak: https://subby.io/
- Kaynak: https://resubs.app/subscriptions

### TrackMySubs

- Guclu taraf: 12 aylik takvim, custom alert, payment method, folder/tag, rapor, CSV import/export.
- Bizim icin ders: B2B ozellikler sonraya kalabilir; CSV ve etiket/kart organizasyonu iyi premium adaylari.
- Kaynak: https://trackmysubs.com/

## Bugun eklenen eksikler

- Abonelik duzenleme
- Arama ve filtreler
- Yaklasan odemeler paneli
- Kategori kirilimi
- Yillik gider projeksiyonu
- Iptal adayi abonelikler icin aksiyon paneli
- Rakip taramasindan gelen farkli avantajlari uygulama icinde gorunur kilan kisa kontrol paneli

## Hala eksik ama MVP sonrasi mantikli

- CSV/PDF import-export
- Servis katalogu ve logo/renk sistemi
- Coklu para birimi
- Ozel hatirlatma zamani
- Deneme suresi/free trial takibi
- Bulut yedekleme
- Gmail/Outlook entegrasyonu
- App Store / Google Play abonelik iptal rehberleri
- Kategori butcesi ve limit uyari sistemi

## Platform riski

Google Play SMS izinlerini hassas izin olarak kisitlar ve uygun olmayan uygulamalardan bu izinleri kaldirmasini ister. Apple da gizlilik politikasini, acik izinleri ve veri minimizasyonunu vurgular. Bu nedenle otomatik SMS okuma ilk surume alinmadi.

- Google Play SMS/Call Log policy: https://support.google.com/googleplay/android-developer/answer/10208820
- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
