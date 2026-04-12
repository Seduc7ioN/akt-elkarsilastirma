# Natro ve Cloudflare Kurulum Rehberi

## 1. Alan adi

Alan adiniz Turkce karakter icerdigi icin panelde Punycode biciminde gorunur. Bu normaldir.

## 2. Natro web kok dizini

Hosting panelinizde hangi klasor web koku olarak tanimliysa, genelde orasi:

- `public_html`
- `httpdocs`
- veya alan adina ozel bir klasor

`dist/` icerigini bu klasore yukleyin.

## 3. Cloudflare ucretsiz SSL

1. Cloudflare hesabinda site ekleyin.
2. Cloudflare'in verdigi 2 nameserver adresini Natro panelinde alan adina tanimlayin.
3. Cloudflare panelinde DNS kaydinda `@` ve `www` icin hosting IP'nizi girin.
4. Site aktif olduktan sonra proxy durumunda turuncu bulutu acik birakin.
5. Sunucuda sertifika yoksa ilk gecis asamasinda `Flexible` calisabilir ama bu kalici hedef olmamali.
6. Daha saglikli kurulum icin Cloudflare Origin Certificate olusturup Natro tarafina yukleyin.
7. Sertifika kurulduktan sonra `SSL/TLS` modunu `Full (strict)` seviyesine alin.

Resmi Cloudflare dokumanlari:

- Nameserver guncelleme: https://developers.cloudflare.com/dns/nameservers/update-nameservers/
- SSL/TLS modlari: https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/
- Origin Certificate: https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/

## 4. Tam otomasyon onerisi

Paylasimli hostinge surekli scraper calistirmak yerine su akisi kurun:

1. Dis ortamda scraper calisir.
2. JSON uretilir.
3. Site build edilir.
4. FTP ile sadece yeni `dist/` icerigi yuklenir.

Baslangic icin yerelde su sirayi kullanin:

1. `.env.example` dosyasini `.env` olarak kopyalayin.
2. `config/markets.config.json` icinde aktif marketleri kontrol edin.
3. `npm run sync`
4. `npm run import`
5. `npm run build`
6. `npm run deploy:ftp`

## 5. Tavsiye edilen ikinci faz

- Cloudflare cache kurallari
- XML sitemap
- robots.txt
- kategori filtreleri
- arama kutusu
- market bazli arsiv sayfalari
